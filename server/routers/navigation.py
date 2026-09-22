import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException

import config
from models import AdvancePageRequest, GotoLineRequest
from services import state
from services.adb_service import (
    get_active_adb_serial,
    detect_external_display_id,
    run_adb_shell,
    ensure_adb_keyboard_closed,
    capture_external_screenshot,
    send_hid_keycombination,
    get_device_info,
    check_and_update_alignment,
    DEVICE_PROFILES,
    current_device_model,
)

router = APIRouter(tags=["Navigation"])

@router.post("/api/advance-page")
async def advance_page_api(req: Optional[AdvancePageRequest] = None):
    active_serial = await get_active_adb_serial(req.serial if req else None)
    disp_id = (req.display_id if req and req.display_id is not None else None)
    if disp_id is None:
        disp_id = await detect_external_display_id(active_serial)

    # Pre-flight Alignment Check: ensure Teams markdown editor is aligned
    align_res = await check_and_update_alignment(active_serial)
    if not align_res.get("is_aligned", False):
        state.orchestration_state.update({
            "status": "PAUSED",
            "active_step": "PAUSED",
            "step_label": "PAUSED: teams markdown not aligned"
        })
        state.latest_telemetry["status_message"] = f"⚠️ teams markdown not aligned ({align_res.get('reason')})"
        await state.ws_manager.broadcast({
            "type": "alignment_status",
            "alignment": align_res,
            "orchestration": state.orchestration_state,
            "telemetry": state.latest_telemetry
        })
        return {
            "status": "paused",
            "error": "teams markdown not aligned",
            "reason": align_res.get("reason"),
            "alignment": align_res
        }

    profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
    cur_page = state.orchestration_state.get("page", 1)
    arrow_count = profile["arrow_count_init"] if cur_page <= 1 else profile["arrow_count_step"]

    # 1. Tap title bar (Y=120) to ensure window focus without placing text cursor or triggering IME
    await run_adb_shell(f"input -d {disp_id} tap 500 120", active_serial)
    await asyncio.sleep(0.08)
    await ensure_adb_keyboard_closed(active_serial)

    # 2. Dispatch Down Arrow keys
    keys_str = " ".join(["20"] * arrow_count)
    res = await run_adb_shell(f"input -d {disp_id} keyevent {keys_str}", active_serial)
    await asyncio.sleep(0.4)

    # 3. Calculate next bounds: top = last_bottom + 1
    last_bottom = 0
    for f in reversed(sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
        if f.get("bottom_line", 0) > 0:
            last_bottom = f["bottom_line"]
            break
    if last_bottom == 0:
        last_bottom = profile["lines_per_page"]

    next_page = cur_page + 1
    next_top = last_bottom + 1
    next_bot = next_top + profile["step_size"]

    state.orchestration_state.update({
        "page": next_page,
        "top_line": next_top,
        "bottom_line": next_bot,
        "next_target_top": next_bot + 1,
        "active_step": "PRECISION_SCROLL",
        "step_label": f"Page {next_page} (Lines {next_top} → {next_bot})",
        "status": "RUNNING"
    })
    state.latest_telemetry.update({
        "current_page": next_page,
        "current_top_line": next_top,
        "current_bottom_line": next_bot,
        "status_message": f"Page {next_page} Advanced ({arrow_count} arrows) • Lines {next_top} → {next_bot}"
    })
    await state.ws_manager.broadcast({
        "type": "orchestration_event",
        "orchestration": state.orchestration_state,
        "telemetry": state.latest_telemetry
    })
    return {
        "status": "ok",
        "page": next_page,
        "top_line": next_top,
        "bottom_line": next_bot,
        "next_target_top": next_bot + 1,
        "arrow_count": arrow_count,
        "display_id": disp_id,
        "adb_result": res
    }

@router.post("/api/navigation/goto-line")
async def goto_line_api(req: GotoLineRequest):
    target = req.target_line
    if target <= 0:
        raise HTTPException(status_code=400, detail="Target line must be greater than 0")

    serial = await get_active_adb_serial()
    if not serial:
        raise HTTPException(status_code=503, detail="No active ADB device connected")

    dev_info = await get_device_info()
    dev_name = dev_info.get("active_model") or ("Pixel 8 Pro" if "8" in current_device_model else "Pixel 10 Pro XL")
    profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
    page_size = profile.get("lines_per_page", 47 if "10" in current_device_model else 31)

    disp_id = await detect_external_display_id(serial)

    # 1. Tap title bar and ensure keyboard closed
    if disp_id > 0:
        await run_adb_shell(f"input -d {disp_id} tap 500 120", serial)
    else:
        await run_adb_shell("input tap 500 120", serial)
    await asyncio.sleep(0.08)
    await ensure_adb_keyboard_closed(serial)

    # 2. Capture screenshot to detect current top line
    calib_path = state.FRAMES_DIR / "nav_temp.png"
    init_bytes = await capture_external_screenshot(serial)
    current_top = 0
    if init_bytes:
        with open(calib_path, "wb") as f:
            f.write(init_bytes)
        current_top = await state.detect_top_line_in_process(calib_path)

    # If current top line is unknown, or if target is 1, or if target is significantly before current_top:
    # Jump to line 1 via Ctrl+Home to establish reliable baseline
    if current_top <= 0 or target == 1 or (current_top > target and (current_top - target) > 10):
        await navigation_control_home()
        current_top = 1

    if current_top == target:
        state.latest_telemetry["current_top_line"] = current_top
        state.latest_telemetry["status_message"] = f"Navigation reached Line {current_top} on {dev_name} (Target: {target}) ✔"
        await state.ws_manager.broadcast({
            "type": "navigation_completed",
            "current_top_line": current_top,
            "target_line": target,
            "reached": True,
            "device_name": dev_name,
            "serial": serial
        })
        return {
            "status": "success",
            "current_top_line": current_top,
            "target_line": target,
            "reached": True,
            "device_name": dev_name,
            "serial": serial
        }

    # 3. Intelligent Multi-Stage Navigation
    diff = target - current_top
    pages_down = 0
    pages_up = 0
    down_arrows = 0
    up_arrows = 0

    if diff > 0:
        pages = diff // page_size
        rem = diff % page_size
        if rem > (page_size // 2):
            pages_down = pages + 1
            up_arrows = (pages_down * page_size) - diff
        else:
            pages_down = pages
            down_arrows = rem
    else:
        abs_diff = abs(diff)
        pages = abs_diff // page_size
        rem = abs_diff % page_size
        if rem > (page_size // 2):
            pages_up = pages + 1
            down_arrows = (pages_up * page_size) - abs_diff
        else:
            pages_up = pages
            up_arrows = rem

    # Ensure focus inside editor body and ensure keyboard remains closed
    if disp_id > 0:
        await run_adb_shell(f"input -d {disp_id} tap 500 300", serial)
    else:
        await run_adb_shell("input tap 500 300", serial)
    await asyncio.sleep(0.06)
    await ensure_adb_keyboard_closed(serial)

    # Dispatch Page Down keystrokes
    if pages_down > 0:
        pg_keys = " ".join(["93"] * pages_down)
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keyevent {pg_keys}", serial)
        else:
            await run_adb_shell(f"input keyevent {pg_keys}", serial)
        await asyncio.sleep(0.15)

    # Dispatch Page Up keystrokes
    if pages_up > 0:
        pg_keys = " ".join(["92"] * pages_up)
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keyevent {pg_keys}", serial)
        else:
            await run_adb_shell(f"input keyevent {pg_keys}", serial)
        await asyncio.sleep(0.15)

    # Dispatch Down Arrow keystrokes
    if down_arrows > 0:
        arr_keys = " ".join(["20"] * down_arrows)
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keyevent {arr_keys}", serial)
        else:
            await run_adb_shell(f"input keyevent {arr_keys}", serial)
        await asyncio.sleep(0.12)

    # Dispatch Up Arrow keystrokes
    if up_arrows > 0:
        arr_keys = " ".join(["19"] * up_arrows)
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keyevent {arr_keys}", serial)
        else:
            await run_adb_shell(f"input keyevent {arr_keys}", serial)
        await asyncio.sleep(0.12)

    await ensure_adb_keyboard_closed(serial)
    await asyncio.sleep(0.25)

    # 4. Verification & Precision Micro-Tuning via OCR (up to 3 micro-adjustments)
    reached = False
    for _ in range(3):
        snap_bytes = await capture_external_screenshot(serial)
        if snap_bytes:
            with open(calib_path, "wb") as f:
                f.write(snap_bytes)
            detected = await state.detect_top_line_in_process(calib_path)
            if detected > 0:
                current_top = detected
                if current_top == target:
                    reached = True
                    break
                micro_diff = target - current_top
                if 0 < abs(micro_diff) <= 15:
                    if micro_diff > 0:
                        m_keys = " ".join(["20"] * micro_diff)
                    else:
                        m_keys = " ".join(["19"] * abs(micro_diff))
                    if disp_id > 0:
                        await run_adb_shell(f"input -d {disp_id} keyevent {m_keys}", serial)
                    else:
                        await run_adb_shell(f"input keyevent {m_keys}", serial)
                    await asyncio.sleep(0.2)
                    continue
        break

    if not reached and current_top == 0:
        current_top = target

    reached = (current_top == target)
    state.latest_telemetry["current_top_line"] = current_top
    if reached:
        state.latest_telemetry["status_message"] = f"Navigation reached Line {current_top} on {dev_name} (Target: {target}) ✔"
    else:
        state.latest_telemetry["status_message"] = f"Navigation at Line {current_top} on {dev_name} (Target: {target})"

    await state.ws_manager.broadcast({
        "type": "navigation_completed",
        "current_top_line": current_top,
        "target_line": target,
        "reached": reached,
        "device_name": dev_name,
        "serial": serial
    })

    return {
        "status": "success",
        "current_top_line": current_top,
        "target_line": target,
        "reached": reached,
        "device_name": dev_name,
        "serial": serial
    }

@router.post("/api/navigation/control-end")
async def navigation_control_end():
    serial = await get_active_adb_serial()
    if not serial:
        raise HTTPException(status_code=503, detail="No active ADB device connected")
    disp_id = await detect_external_display_id(serial)

    # Fast scroll to bottom
    for _ in range(12):
        if disp_id > 0:
            await run_adb_shell(f"input mouse -d {disp_id} scroll 800 500 --axis VSCROLL,-200", serial)
        else:
            await run_adb_shell("input mouse scroll 800 500 --axis VSCROLL,-200", serial)
        await asyncio.sleep(0.04)

    await send_hid_keycombination(113, 123, serial)
    await asyncio.sleep(0.5)
    calib_path = state.FRAMES_DIR / "nav_end.png"
    snap = await capture_external_screenshot(serial)
    last_line = 0
    if snap:
        with open(calib_path, "wb") as f:
            f.write(snap)
        last_line = await state.detect_last_line_in_process(calib_path)
    state.latest_telemetry["status_message"] = f"Dispatched Ctrl+End (End Ln: {last_line}) ✔"
    await state.ws_manager.broadcast({
        "type": "hid_action",
        "action": "control+end",
        "last_line": last_line,
        "telemetry": state.latest_telemetry
    })
    return {"status": "success", "action": "control+end", "last_line": last_line}

@router.post("/api/navigation/control-home")
async def navigation_control_home():
    serial = await get_active_adb_serial()
    if not serial:
        raise HTTPException(status_code=503, detail="No active ADB device connected")
    disp_id = await detect_external_display_id(serial)

    # Fast scroll to top
    for _ in range(12):
        if disp_id > 0:
            await run_adb_shell(f"input mouse -d {disp_id} scroll 800 500 --axis VSCROLL,200", serial)
        else:
            await run_adb_shell("input mouse scroll 800 500 --axis VSCROLL,200", serial)
        await asyncio.sleep(0.04)

    await send_hid_keycombination(113, 122, serial)
    await asyncio.sleep(0.5)
    calib_path = state.FRAMES_DIR / "nav_home.png"
    snap = await capture_external_screenshot(serial)
    top_line = 1
    if snap:
        with open(calib_path, "wb") as f:
            f.write(snap)
        top_line = await state.detect_top_line_in_process(calib_path) or 1
    state.latest_telemetry["current_top_line"] = top_line
    state.latest_telemetry["status_message"] = f"Dispatched Ctrl+Home (Top Ln: {top_line}) ✔"
    await state.ws_manager.broadcast({
        "type": "hid_action",
        "action": "control+home",
        "current_top_line": top_line,
        "telemetry": state.latest_telemetry
    })
    return {"status": "success", "action": "control+home", "current_top_line": top_line}

@router.get("/api/next-page-line")
async def get_next_page_line():
    last_bottom = 0
    for f in reversed(sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
        if f.get("bottom_line", 0) > 0:
            last_bottom = f["bottom_line"]
            break
    if last_bottom == 0 and state.document_lines:
        last_bottom = max(state.document_lines.keys())
    return {
        "status": "success",
        "next_page_first_line": (last_bottom + 1) if last_bottom > 0 else 1,
        "last_bottom_line": last_bottom,
        "total_frames": len(state.captured_frames)
    }
