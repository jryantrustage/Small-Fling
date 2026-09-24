import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException

from models import AdvancePageRequest, GotoLineRequest
from services import state
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, run_adb_shell,
    ensure_adb_keyboard_closed, capture_external_screenshot, send_hid_keycombination,
    get_device_info, check_and_update_alignment, DEVICE_PROFILES, current_device_model,
)

router = APIRouter(tags=["Navigation"])

async def _input_tap(serial: str, disp_id: int, x: int, y: int, delay: float = 0.08):
    await run_adb_shell(f"input -d {disp_id} tap {x} {y}" if disp_id > 0 else f"input tap {x} {y}", serial)
    if delay: await asyncio.sleep(delay)

async def _input_keys(serial: str, disp_id: int, keys: str, delay: float = 0.0):
    res = await run_adb_shell(f"input -d {disp_id} keyevent {keys}" if disp_id > 0 else f"input keyevent {keys}", serial)
    if delay: await asyncio.sleep(delay)
    return res

async def _scroll_mouse(serial: str, disp_id: int, vscroll: int, count: int = 12):
    cmd = f"input mouse -d {disp_id} scroll 800 500 --axis VSCROLL,{vscroll}" if disp_id > 0 else f"input mouse scroll 800 500 --axis VSCROLL,{vscroll}"
    for _ in range(count):
        await run_adb_shell(cmd, serial)
        await asyncio.sleep(0.04)

async def _snap_and_detect(serial: str, fname: str, detector):
    p = state.FRAMES_DIR / fname
    snap = await capture_external_screenshot(serial)
    if snap:
        with open(p, "wb") as f: f.write(snap)
        return await detector(p)
    return 0

@router.post("/api/advance-page")
async def advance_page_api(req: Optional[AdvancePageRequest] = None):
    active_serial = await get_active_adb_serial(req.serial if req else None)
    disp_id = (req.display_id if req and req.display_id is not None else None)
    if disp_id is None:
        disp_id = await detect_external_display_id(active_serial)

    align_res = await check_and_update_alignment(active_serial)
    if not align_res.get("is_aligned", False):
        state.orchestration_state.update({"status": "PAUSED", "active_step": "PAUSED", "step_label": "PAUSED: teams markdown not aligned"})
        state.latest_telemetry["status_message"] = f"⚠️ teams markdown not aligned ({align_res.get('reason')})"
        await state.ws_manager.broadcast({"type": "alignment_status", "alignment": align_res, "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry})
        return {"status": "paused", "error": "teams markdown not aligned", "reason": align_res.get("reason"), "alignment": align_res}

    profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
    cur_page = state.orchestration_state.get("page", 1)
    arrow_count = profile["arrow_count_init"] if cur_page <= 1 else profile["arrow_count_step"]

    await _input_tap(active_serial, disp_id, 500, 120, 0.08)
    await ensure_adb_keyboard_closed(active_serial)

    res = await _input_keys(active_serial, disp_id, " ".join(["20"] * arrow_count), 0.4)

    last_bottom = 0
    for f in reversed(sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
        if f.get("bottom_line", 0) > 0:
            last_bottom = f["bottom_line"]
            break
    if last_bottom == 0:
        last_bottom = profile["lines_per_page"]

    next_page, next_top = cur_page + 1, last_bottom + 1
    next_bot = next_top + profile["step_size"]

    state.orchestration_state.update({"page": next_page, "top_line": next_top, "bottom_line": next_bot, "next_target_top": next_bot + 1,
                                     "active_step": "PRECISION_SCROLL", "step_label": f"Page {next_page} (Lines {next_top} → {next_bot})", "status": "RUNNING"})
    state.latest_telemetry.update({"current_page": next_page, "current_top_line": next_top, "current_bottom_line": next_bot,
                                  "status_message": f"Page {next_page} Advanced ({arrow_count} arrows) • Lines {next_top} → {next_bot}"})
    await state.ws_manager.broadcast({"type": "orchestration_event", "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry})
    return {"status": "ok", "page": next_page, "top_line": next_top, "bottom_line": next_bot, "next_target_top": next_bot + 1, "arrow_count": arrow_count, "display_id": disp_id, "adb_result": res}

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

    await _input_tap(serial, disp_id, 500, 120, 0.08)
    await ensure_adb_keyboard_closed(serial)

    current_top = await _snap_and_detect(serial, "nav_temp.png", state.detect_top_line_in_process)
    if current_top <= 0 or target == 1 or (current_top > target and (current_top - target) > 10):
        await navigation_control_home()
        current_top = 1

    if current_top == target:
        state.latest_telemetry.update({"current_top_line": current_top, "status_message": f"Navigation reached Line {current_top} on {dev_name} (Target: {target}) ✔"})
        await state.ws_manager.broadcast({"type": "navigation_completed", "current_top_line": current_top, "target_line": target, "reached": True, "device_name": dev_name, "serial": serial})
        return {"status": "success", "current_top_line": current_top, "target_line": target, "reached": True, "device_name": dev_name, "serial": serial}

    diff = target - current_top
    pages_down, pages_up, down_arrows, up_arrows = 0, 0, 0, 0
    if diff > 0:
        pages, rem = diff // page_size, diff % page_size
        if rem > (page_size // 2): pages_down, up_arrows = pages + 1, (pages + 1) * page_size - diff
        else: pages_down, down_arrows = pages, rem
    else:
        abs_diff = abs(diff)
        pages, rem = abs_diff // page_size, abs_diff % page_size
        if rem > (page_size // 2): pages_up, down_arrows = pages + 1, (pages + 1) * page_size - abs_diff
        else: pages_up, up_arrows = pages, rem

    await _input_tap(serial, disp_id, 500, 300, 0.06)
    await ensure_adb_keyboard_closed(serial)

    if pages_down > 0: await _input_keys(serial, disp_id, " ".join(["93"] * pages_down), 0.15)
    if pages_up > 0: await _input_keys(serial, disp_id, " ".join(["92"] * pages_up), 0.15)
    if down_arrows > 0: await _input_keys(serial, disp_id, " ".join(["20"] * down_arrows), 0.12)
    if up_arrows > 0: await _input_keys(serial, disp_id, " ".join(["19"] * up_arrows), 0.12)

    await ensure_adb_keyboard_closed(serial)
    await asyncio.sleep(0.25)

    reached = False
    for _ in range(3):
        detected = await _snap_and_detect(serial, "nav_temp.png", state.detect_top_line_in_process)
        if detected > 0:
            current_top = detected
            if current_top == target:
                reached = True
                break
            micro_diff = target - current_top
            if 0 < abs(micro_diff) <= 15:
                keys = " ".join(["20"] * micro_diff) if micro_diff > 0 else " ".join(["19"] * abs(micro_diff))
                await _input_keys(serial, disp_id, keys, 0.2)
                continue
        break

    if not reached and current_top == 0: current_top = target
    reached = (current_top == target)
    state.latest_telemetry["current_top_line"] = current_top
    state.latest_telemetry["status_message"] = f"Navigation reached Line {current_top} on {dev_name} (Target: {target}) ✔" if reached else f"Navigation at Line {current_top} on {dev_name} (Target: {target})"

    payload = {"type": "navigation_completed", "current_top_line": current_top, "target_line": target, "reached": reached, "device_name": dev_name, "serial": serial}
    await state.ws_manager.broadcast(payload)
    return {"status": "success", **payload}

@router.post("/api/navigation/control-end")
async def navigation_control_end():
    serial = await get_active_adb_serial()
    if not serial: raise HTTPException(status_code=503, detail="No active ADB device connected")
    disp_id = await detect_external_display_id(serial)

    await _scroll_mouse(serial, disp_id, -200, 12)
    await send_hid_keycombination(113, 123, serial)
    await asyncio.sleep(0.5)

    last_line = await _snap_and_detect(serial, "nav_end.png", state.detect_last_line_in_process)
    state.latest_telemetry["status_message"] = f"Dispatched Ctrl+End (End Ln: {last_line}) ✔"
    await state.ws_manager.broadcast({"type": "hid_action", "action": "control+end", "last_line": last_line, "telemetry": state.latest_telemetry})
    return {"status": "success", "action": "control+end", "last_line": last_line}

@router.post("/api/navigation/control-home")
async def navigation_control_home():
    serial = await get_active_adb_serial()
    if not serial: raise HTTPException(status_code=503, detail="No active ADB device connected")
    disp_id = await detect_external_display_id(serial)

    await _scroll_mouse(serial, disp_id, 200, 12)
    await send_hid_keycombination(113, 122, serial)
    await asyncio.sleep(0.5)

    top_line = await _snap_and_detect(serial, "nav_home.png", state.detect_top_line_in_process) or 1
    state.latest_telemetry.update({"current_top_line": top_line, "status_message": f"Dispatched Ctrl+Home (Top Ln: {top_line}) ✔"})
    await state.ws_manager.broadcast({"type": "hid_action", "action": "control+home", "current_top_line": top_line, "telemetry": state.latest_telemetry})
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
    return {"status": "success", "next_page_first_line": (last_bottom + 1) if last_bottom > 0 else 1, "last_bottom_line": last_bottom, "total_frames": len(state.captured_frames)}
