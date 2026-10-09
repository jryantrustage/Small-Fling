import asyncio
import base64
import json
import re
from typing import Tuple, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request

import db
from models import ProjectCreateRequest, ProjectDeviceSettingsRequest
from services import state
from services.adb_service import (
    get_active_adb_serial,
    send_hid_keycombination,
    capture_external_screenshot,
    auto_fix_viewport,
    get_device_info,
    DEVICE_PROFILES,
)

try:
    from server.routers.orchestration import execute_dag_group_initialize
except ImportError:
    from routers.orchestration import execute_dag_group_initialize

router = APIRouter(tags=["Projects"])

@router.get("/api/projects")
async def list_projects():
    return db.get_projects()

@router.get("/api/projects/active")
async def get_active_project():
    return db.get_active_project()

async def perform_full_project_calibration(project_id: str, requested_target: int = 0) -> Tuple[int, bool, int]:
    """
    Executes automated HID Ctrl+End -> External Screencap -> Gutter OCR ->
    HID Ctrl+Home -> External Screencap -> Line 1 Verification.
    Returns (total_lines, is_home_verified, detected_first_line).
    """
    serial = await get_active_adb_serial()
    total_lines = 0
    is_verified = False
    detected_first = 1
    if not serial:
        return (requested_target, False, 1)

    try:
        # 1. Dispatch Ctrl+End: keycode 113 + 123
        await send_hid_keycombination(113, 123, serial)
        await asyncio.sleep(0.6)
        end_bytes = await capture_external_screenshot(serial)
        if end_bytes:
            calib_path = state.FRAMES_DIR / f"calib_end_{project_id}.png"
            with open(calib_path, "wb") as f:
                f.write(end_bytes)
            total_lines = await state.detect_last_line_in_process(calib_path)
            top_line = await state.detect_top_line_in_process(calib_path)
            if total_lines <= 0 or top_line <= 0:
                res_scan = await state.scan_image_in_process(calib_path)
                if total_lines <= 0: total_lines = res_scan.get("bottom_line", 0)
                if top_line <= 0: top_line = res_scan.get("top_line", 0)

        # Auto-fix viewport immediately: close soft keyboard and reflow 1080p desktop layout
        await auto_fix_viewport(serial)

        is_stuck_on_line_1 = (0 < top_line <= 2)
        if is_stuck_on_line_1:
            err_msg = f"EOF Navigation Failed: Editor remained on Line {top_line or 1} at top (bottom: {total_lines})."
            state.dag_state["nodes"]["init_end"].update({
                "status": "error",
                "total_lines": 0,
                "evaluator": "Line 1 Stuck Evaluator",
                "healing_step": "Refreshing page capture",
                "telemetry_insight": f"Gutter evaluated at Ln {top_line or 1} • Refreshing page capture & cursor focus",
                "error": err_msg
            })
            state.latest_telemetry["status_message"] = f"DAG Node 1: Page on Line {top_line or 1} • Refreshing page capture"
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "calibration_event": "end_failed",
                "total_lines": 0,
                "error": err_msg
            })
            return (requested_target, False, 1)

        if total_lines > 0:
            db.update_project_target_lines(project_id, total_lines)
            state.latest_telemetry["target_total_lines"] = total_lines
            state.latest_telemetry["status_message"] = f"Total lines calibrated: {total_lines} via Ctrl+End"
            state.dag_state["nodes"]["init_end"].update({
                "status": "completed",
                "total_lines": total_lines,
                "evaluator": "EOF Gutter Evaluator",
                "healing_step": None,
                "telemetry_insight": f"Calibrated {total_lines:,} total lines at EOF ✔",
                "error": None
            })
            state.dag_state["nodes"]["reset_home"].update({
                "status": "active",
                "evaluator": "Line 1 Gutter Evaluator",
                "healing_step": "Refreshing page capture",
                "telemetry_insight": "Dispatching Ctrl+Home to return to Line 1..."
            })
            state.dag_state["current_active_node"] = "reset_home"
        else:
            state.dag_state["nodes"]["init_end"].update({
                "status": "error",
                "total_lines": 0,
                "evaluator": "EOF Gutter Evaluator",
                "healing_step": "Refreshing page capture",
                "telemetry_insight": "No lines detected at EOF • Refreshing page capture",
                "error": "No lines detected at EOF"
            })
            state.latest_telemetry["status_message"] = "Calibration failed: No lines detected at EOF."


        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "calibration_event": "end_detected",
            "total_lines": total_lines
        })

        # 2. Fast home: Dispatch Ctrl+Home: keycode 113 + 122
        await auto_fix_viewport(serial)
        await send_hid_keycombination(113, 122, serial)
        
        home_path = state.FRAMES_DIR / f"calib_home_{project_id}.png"
        is_verified = False
        detected_first = 0
        for _ in range(6):
            await asyncio.sleep(0.35)
            home_bytes = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if home_bytes:
                with open(home_path, "wb") as f:
                    f.write(home_bytes)
                is_verified, detected_first = await state.verify_first_line_in_process(home_path)
                if not is_verified:
                    res_scan = await state.scan_image_in_process(home_path)
                    detected_first = res_scan.get("top_line", 1)
                    is_verified = (detected_first == 1 or (0 < detected_first <= 2))
                if is_verified:
                    detected_first = 1
                    break

        if is_verified:
            await auto_fix_viewport(serial)

        state.dag_state["nodes"]["reset_home"].update({
            "status": "completed" if is_verified else "error",
            "verified": is_verified,
            "first_line": detected_first,
            "evaluator": "Line 1 Gutter Evaluator",
            "healing_step": None if is_verified else "Refreshing page capture",
            "telemetry_insight": f"Line 1 verified at top gutter ✔" if is_verified else f"Evaluated top gutter at Ln {detected_first} (refreshing page capture)"
        })
        if is_verified:
            state.dag_state["nodes"]["frame_acquire"].update({
                "status": "idle",
                "page": 1,
                "is_active": False,
                "evaluator": "Display Frame Evaluator",
                "healing_step": None,
                "telemetry_insight": "Frame acquisition ready for page 1"
            })
            state.dag_state["current_active_node"] = None
            state.latest_telemetry["current_top_line"] = 1
            state.latest_telemetry["current_page"] = 1
            state.latest_telemetry["status_message"] = f"Calibrated: {total_lines} total lines verified via Ctrl+End / Ctrl+Home ✔"
        else:
            state.dag_state["nodes"]["reset_home"]["error"] = f"Failed to verify return to Line 1 (detected Ln {detected_first})"
            state.latest_telemetry["status_message"] = f"Calibration warning: Ctrl+Home did not verify Line 1 (detected Ln {detected_first})"

        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "calibration_event": "home_verified" if is_verified else "home_failed",
            "verified": is_verified,
            "first_line": detected_first,
            "telemetry": state.latest_telemetry
        })
    except Exception as e:
        print(f"[perform_full_project_calibration] Error: {e}")

    return (total_lines, is_verified, detected_first)

@router.post("/api/projects")
async def create_project(req: ProjectCreateRequest):
    # Auto-resolve device settings if not explicitly provided
    dev_info = await get_device_info()
    model = (req.device_model or dev_info.get("device_model") or "pixel_8").lower()
    available_profs = dev_info.get("available_profiles", [])
    prof = next((p for p in available_profs if p.get("model_name") == model or p.get("id") == model or model in (p.get("id", "") + " " + p.get("model_name", ""))), None)
    if not prof:
        prof = DEVICE_PROFILES.get("pixel_10" if "10" in model else "pixel_8", DEVICE_PROFILES["pixel_8"])

    dev_name = req.device_name or prof.get("friendly_name") or prof.get("name") or dev_info.get("active_model", model)
    dev_serial = req.device_serial or dev_info.get("active_serial") or ""
    target_dpi = req.target_dpi if (req.target_dpi and req.target_dpi > 0) else prof.get("target_dpi", prof.get("default_dpi", 220))
    disp_width = req.display_width if (req.display_width and req.display_width > 0) else prof.get("display_width", 1920)
    disp_height = req.display_height if (req.display_height and req.display_height > 0) else prof.get("display_height", 1080)
    disp_id = req.display_id if (req.display_id is not None and req.display_id > 0) else prof.get("display_id", prof.get("default_display_id", 0))
    lpp = req.lines_per_page if (req.lines_per_page and req.lines_per_page > 0) else prof.get("lines_per_page", 24)
    scroll_pad = req.scroll_padding_lines if (req.scroll_padding_lines is not None and req.scroll_padding_lines >= 0) else prof.get("scroll_padding_lines", 4)
    default_step = lpp + scroll_pad
    step_sz = req.step_size if (req.step_size and req.step_size > 0) else (default_step if (req.lines_per_page or req.scroll_padding_lines is not None) else prof.get("step_size", default_step))
    arr_step = req.arrow_count_step if (req.arrow_count_step and req.arrow_count_step > 0) else (step_sz if (req.lines_per_page or req.scroll_padding_lines is not None) else prof.get("arrow_count_step", step_sz))
    arr_init = req.arrow_count_init if (req.arrow_count_init and req.arrow_count_init > 0) else ((arr_step * 2) if (req.lines_per_page or req.scroll_padding_lines is not None) else prof.get("arrow_count_init", (arr_step * 2)))
    settle_ms = req.settle_delay_ms if (req.settle_delay_ms and req.settle_delay_ms > 0) else prof.get("settle_delay_ms", 50)
    hid_raw = req.hid_config if req.hid_config else (prof.get("hid_config") if isinstance(prof.get("hid_config"), dict) else {})
    if isinstance(hid_raw, dict):
        hid_raw.setdefault("scroll_padding_lines", scroll_pad)
        hid_raw.setdefault("arrow_count_init", arr_init)
        hid_raw.setdefault("arrow_count_step", arr_step)
    hid_cfg = json.dumps(hid_raw)
    lock_dev = bool(req.lock_device)

    new_proj = db.create_project(
        name=req.name,
        description=req.description or "",
        target_total_lines=req.target_total_lines or 0,
        device_model=model,
        device_name=dev_name,
        device_serial=dev_serial,
        target_dpi=target_dpi,
        display_width=disp_width,
        display_height=disp_height,
        display_id=disp_id,
        lines_per_page=lpp,
        step_size=step_sz,
        scroll_padding_lines=scroll_pad,
        arrow_count_init=arr_init,
        arrow_count_step=arr_step,
        settle_delay_ms=settle_ms,
        lock_device=lock_dev,
        hid_config_json=hid_cfg
    )
    state.captured_frames.clear()
    state.document_lines.clear()
    state.load_persisted_state()

    # Initialize DAG state for new project with initialize group active
    target_lines = req.target_total_lines or 0
    state.dag_state.setdefault("groups", {})
    state.dag_state["groups"]["initialize"] = {
        "id": "initialize", "title": "Initialize", "description": "Auto-calibrates total lines via EOF Ctrl+End and verifies return to Line 1",
        "nodes": ["init_end", "reset_home"], "status": "active",
        "progress": {"percent": 5, "stage": "Starting project initialization...", "status": "running"}
    }
    state.dag_state["groups"]["capture_entire_markdown"] = {
        "id": "capture_entire_markdown", "title": "Capture Entire Markdown",
        "description": "Acquires pages, offloads to OCR worker, and steps down through markdown document",
        "nodes": ["frame_acquire", "frame_ocr", "arrow_down", "verification_trigger"], "status": "idle"
    }
    state.dag_state["nodes"]["init_end"].update({"status": "active", "total_lines": target_lines, "error": None})
    state.dag_state["nodes"]["reset_home"].update({"status": "idle", "verified": False})
    state.dag_state["nodes"]["frame_acquire"].update({"status": "idle", "page": 1})
    state.dag_state["nodes"]["frame_ocr"].update({"status": "idle", "top_line": 0, "bottom_line": 0, "target_top_line": 1, "extracted_line_count": 0})
    state.dag_state["nodes"]["arrow_down"].update({"status": "idle", "target_top_line": 1, "target_top": 1, "prev_bottom": 0, "arrow_count": 0})
    state.dag_state["nodes"]["verification_trigger"].update({"status": "idle", "loop_count": 0, "is_complete": False, "target_top_line": 1, "target_top": 1, "expected_top": 1})
    state.orchestration_state["next_target_top"] = 1
    state.orchestration_state["cursor_line"] = 1
    state.dag_state["current_active_group"] = "initialize"
    state.dag_state["current_active_node"] = "init_end"
    state.latest_telemetry["target_total_lines"] = target_lines
    state.latest_telemetry["current_top_line"] = 1
    state.latest_telemetry["current_bottom_line"] = 0
    state.latest_telemetry["phase"] = "INITIALIZING"
    state.latest_telemetry["status_message"] = f"Project created ({model.upper()}{' LOCKED' if lock_dev else ''} @ {target_dpi} DPI). Running DAG Group: Initialize..."

    await state.ws_manager.broadcast({
        "type": "project_switched",
        "project": new_proj,
        "dag": state.dag_state,
        "telemetry": state.latest_telemetry
    })

    # Automatically run the initialize DAG group asynchronously
    asyncio.create_task(execute_dag_group_initialize(project_id=new_proj["id"]))

    return new_proj

@router.get("/api/projects/{project_id}/device-settings")
async def get_project_device_settings(project_id: str):
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    dev_info = await get_device_info()
    hid_cfg = {}
    try:
        hid_cfg = json.loads(proj.get("hid_config_json") or "{}")
    except Exception:
        pass

    settings_dict = {
        "device_model": proj.get("device_model", "pixel_8"),
        "device_name": proj.get("device_name", ""),
        "device_serial": proj.get("device_serial", ""),
        "target_dpi": proj.get("target_dpi", 220),
        "display_width": proj.get("display_width", 1920),
        "display_height": proj.get("display_height", 1080),
        "display_id": proj.get("display_id", 0),
        "lines_per_page": proj.get("lines_per_page", 24),
        "step_size": proj.get("step_size", 28),
        "scroll_padding_lines": proj.get("scroll_padding_lines", 4),
        "arrow_count_init": proj.get("arrow_count_init", 56),
        "arrow_count_step": proj.get("arrow_count_step", 28),
        "settle_delay_ms": proj.get("settle_delay_ms", 50),
        "lock_device": bool(proj.get("lock_device", 0)),
        "hid_config": hid_cfg,
    }
    return {
        "status": "success",
        "project_id": project_id,
        "settings": settings_dict,
        **settings_dict,
        "active_device": dev_info
    }

@router.post("/api/projects/{project_id}/device-settings")
async def update_project_device_settings_api(project_id: str, req: ProjectDeviceSettingsRequest):
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    hid_json = json.dumps(req.hid_config) if req.hid_config is not None else None
    ok = db.update_project_device_settings(
        project_id=project_id,
        device_model=req.device_model,
        device_name=req.device_name,
        device_serial=req.device_serial,
        target_dpi=req.target_dpi,
        display_width=req.display_width,
        display_height=req.display_height,
        display_id=req.display_id,
        lines_per_page=req.lines_per_page,
        step_size=req.step_size,
        scroll_padding_lines=req.scroll_padding_lines,
        arrow_count_init=req.arrow_count_init,
        arrow_count_step=req.arrow_count_step,
        settle_delay_ms=req.settle_delay_ms,
        lock_device=req.lock_device,
        hid_config_json=hid_json
    )
    updated = db.get_project(project_id)
    await state.ws_manager.broadcast({"type": "project_updated", "project": updated})
    return {"status": "success", "project": updated}

@router.post("/api/projects/{project_id}/lock-device")
async def toggle_project_lock_api(project_id: str, payload: Optional[Dict[str, Any]] = None):
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    lock_val = payload.get("lock_device") if payload else None
    db.toggle_project_device_lock(project_id, lock_val)
    updated = db.get_project(project_id)
    await state.ws_manager.broadcast({"type": "project_updated", "project": updated})
    return {"status": "success", "locked": bool(updated.get("lock_device", 0)), "project": updated}

async def extract_request_image(request: Request) -> Optional[bytes]:
    ct = request.headers.get("content-type", "")
    if "application/json" in ct:
        body = await request.json()
        if b64_str := body.get("image_base64") or body.get("image"):
            clean_b64 = re.sub(r"^data:image/[^;]+;base64,", "", b64_str.strip())
            try:
                return base64.b64decode(clean_b64)
            except Exception:
                pass
    elif "multipart/form-data" in ct:
        form = await request.form()
        f_obj = form.get("file")
        if f_obj and hasattr(f_obj, "read"):
            return await f_obj.read()
        if b64_form := form.get("image_base64") or form.get("image"):
            clean_b64 = re.sub(r"^data:image/[^;]+;base64,", "", str(b64_form).strip())
            try:
                return base64.b64decode(clean_b64)
            except Exception:
                pass
    return None

@router.post("/api/projects/{project_id}/calibrate-end")
async def calibrate_project_end(project_id: str, request: Request):
    """
    When a new project is created, the combination of Ctrl+End key and a screen capture
    is sent to the API, and then OCR in a separate worker process determines the last
    line number to display the total lines of markdown.
    """
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    contents = await extract_request_image(request)
    if not contents:
        serial = await get_active_adb_serial()
        await send_hid_keycombination(113, 123, serial)
        await asyncio.sleep(0.5)
        contents = await capture_external_screenshot(serial)

    if not contents:
        raise HTTPException(status_code=400, detail="Could not capture or receive screenshot for Ctrl+End calibration.")

    calib_path = state.FRAMES_DIR / f"calib_end_{project_id}.png"
    with open(calib_path, "wb") as f:
        f.write(contents)

    total_lines = await state.detect_last_line_in_process(calib_path)
    if total_lines <= 0:
        res_scan = await state.scan_image_in_process(calib_path)
        total_lines = res_scan.get("bottom_line", 0)

    if total_lines > 0:
        db.update_project_target_lines(project_id, total_lines)
        state.latest_telemetry["target_total_lines"] = total_lines
        state.latest_telemetry["status_message"] = f"Total lines calibrated: {total_lines} via Ctrl+End"
        state.dag_state["nodes"]["init_end"].update({"status": "completed", "total_lines": total_lines})
        state.dag_state["nodes"]["reset_home"].update({"status": "active"})
        state.dag_state["current_active_node"] = "reset_home"
    else:
        state.dag_state["nodes"]["init_end"].update({"status": "error", "total_lines": 0})
        state.latest_telemetry["status_message"] = "Calibration failed: 0 lines detected at EOF via Ctrl+End"

    await state.ws_manager.broadcast({
        "type": "dag_updated",
        "dag": state.dag_state,
        "calibration_event": "end_detected",
        "total_lines": total_lines
    })
    return {"status": "success" if total_lines > 0 else "warning", "project_id": project_id, "total_lines": total_lines, "target_total_lines": total_lines}

@router.post("/api/projects/{project_id}/verify-home")
async def verify_project_home(project_id: str, request: Request):
    """
    Before key down is used during the acquisition phase, the page is returned to line 1
    by using a combination of Ctrl+Home key, a screen capture is taken, and OCR is used
    to assure the first line is line number 1.
    """
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    contents = await extract_request_image(request)
    if not contents:
        serial = await get_active_adb_serial()
        await auto_fix_viewport(serial)
        await send_hid_keycombination(113, 122, serial)
        
        home_path = state.FRAMES_DIR / f"calib_home_{project_id}.png"
        is_verified = False
        detected_first = 0
        for _ in range(6):
            await asyncio.sleep(0.35)
            contents = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if contents:
                with open(home_path, "wb") as f:
                    f.write(contents)
                is_verified, detected_first = await state.verify_first_line_in_process(home_path)
                if not is_verified:
                    res_scan = await state.scan_image_in_process(home_path)
                    detected_first = res_scan.get("top_line", 1)
                    is_verified = (detected_first == 1 or (0 < detected_first <= 2))
                if is_verified:
                    detected_first = 1
                    break
        if is_verified:
            await auto_fix_viewport(serial)
    else:
        home_path = state.FRAMES_DIR / f"calib_home_{project_id}.png"
        with open(home_path, "wb") as f:
            f.write(contents)
        is_verified, detected_first = await state.verify_first_line_in_process(home_path)
        if not is_verified:
            res_scan = await state.scan_image_in_process(home_path)
            detected_first = res_scan.get("top_line", 1)
            is_verified = (detected_first == 1 or (0 < detected_first <= 2))
        if is_verified:
            detected_first = 1

    node_status = "completed" if is_verified else "error"
    state.dag_state["nodes"]["reset_home"].update({
        "status": node_status,
        "verified": is_verified,
        "first_line": detected_first
    })
    if is_verified:
        state.dag_state["nodes"]["frame_acquire"].update({"status": "idle", "page": 1, "is_active": False})
        state.dag_state["current_active_node"] = None
        state.latest_telemetry["current_top_line"] = 1
        state.latest_telemetry["current_page"] = 1
        state.latest_telemetry["status_message"] = "Line 1 Verified at Top via Ctrl+Home ✔"
    else:
        state.latest_telemetry["status_message"] = f"Line 1 Verification Failed (Detected Ln {detected_first}) via Ctrl+Home"

    await state.ws_manager.broadcast({
        "type": "dag_updated",
        "dag": state.dag_state,
        "calibration_event": "home_verified",
        "verified": is_verified,
        "first_line": detected_first
    })
    return {"status": "success", "verified": is_verified, "first_line": detected_first}

@router.post("/api/projects/{project_id}/activate")
async def activate_project(project_id: str):
    if not db.activate_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    state.load_persisted_state()
    proj = db.get_project(project_id)
    await state.ws_manager.broadcast({"type": "project_switched", "project": proj})
    return {"status": "success", "project": proj}

@router.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    if not db.delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    state.load_persisted_state()
    active_proj = db.get_active_project()
    active_pid = active_proj["id"] if active_proj else None

    # Broadcast project deletion and state synchronization to all connected clients
    try:
        await state.ws_manager.broadcast({
            "type": "project_deleted",
            "project_id": project_id,
            "active_project": active_proj,
            "projects": db.get_projects()
        })
        await state.ws_manager.broadcast({"type": "project_switched", "project": active_proj})
        await state.ws_manager.broadcast({
            "type": "frames_purged" if not active_proj else "frame_deleted",
            "frames": db.get_frames(active_pid)
        })
        from routers.frames_document import _doc_payload
        await state.ws_manager.broadcast({
            "type": "document_updated",
            "data": _doc_payload()
        })
    except Exception as be:
        print(f"[delete_project] Broadcast warning: {be}")

    return {
        "status": "success",
        "deleted_project_id": project_id,
        "active_project": active_proj,
        "projects": db.get_projects()
    }

@router.post("/api/projects/{project_id}/abort")
async def abort_project(project_id: str):
    if not db.abort_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    state.load_persisted_state()
    active_proj = db.get_active_project()
    await state.ws_manager.broadcast({"type": "project_aborted", "project_id": project_id, "active_project": active_proj})
    return {"status": "success", "message": f"Project '{project_id}' aborted and data cleared."}

@router.post("/api/projects/{project_id}/clear")
async def clear_project_data(project_id: str):
    if not db.clear_project_data(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    state.load_persisted_state()
    active_proj = db.get_active_project()
    await state.ws_manager.broadcast({"type": "project_cleared", "project_id": project_id, "active_project": active_proj})
    return {"status": "success", "message": f"Project '{project_id}' data cleared."}
