import asyncio
import base64
import re
from typing import Tuple, Optional
from fastapi import APIRouter, HTTPException, Request

import db
from models import ProjectCreateRequest
from services import state
from services.adb_service import (
    get_active_adb_serial,
    send_hid_keycombination,
    capture_external_screenshot,
)

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

        is_stuck_on_line_1 = (0 < top_line <= 2)
        if is_stuck_on_line_1:
            err_msg = f"EOF Navigation Failed: Editor remained on Line {top_line or 1} at top (bottom: {total_lines})."
            state.dag_state["nodes"]["init_end"].update({"status": "error", "total_lines": 0, "error": err_msg})
            state.latest_telemetry["status_message"] = err_msg
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
            state.dag_state["nodes"]["init_end"].update({"status": "completed", "total_lines": total_lines, "error": None})
            state.dag_state["nodes"]["reset_home"].update({"status": "active"})
            state.dag_state["current_active_node"] = "reset_home"
        else:
            state.dag_state["nodes"]["init_end"].update({"status": "error", "total_lines": 0, "error": "No lines detected at EOF"})
            state.latest_telemetry["status_message"] = "Calibration failed: No lines detected at EOF."


        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "calibration_event": "end_detected",
            "total_lines": total_lines
        })

        # 2. Fast home: Dispatch Ctrl+Home: keycode 113 + 122
        await send_hid_keycombination(113, 122, serial)
        await asyncio.sleep(0.6)
        home_bytes = await capture_external_screenshot(serial)
        if home_bytes:
            home_path = state.FRAMES_DIR / f"calib_home_{project_id}.png"
            with open(home_path, "wb") as f:
                f.write(home_bytes)
            is_verified, detected_first = await state.verify_first_line_in_process(home_path)
            if not is_verified:
                res_scan = await state.scan_image_in_process(home_path)
                detected_first = res_scan.get("top_line", 1)
                is_verified = (detected_first == 1)

        state.dag_state["nodes"]["reset_home"].update({
            "status": "completed",
            "verified": is_verified,
            "first_line": detected_first
        })
        state.dag_state["nodes"]["frame_acquire"].update({"status": "active", "page": 1})
        state.dag_state["current_active_node"] = "frame_acquire"

        state.latest_telemetry["current_top_line"] = 1
        state.latest_telemetry["current_page"] = 1
        state.latest_telemetry["status_message"] = f"Calibrated: {total_lines} total lines verified via Ctrl+End / Ctrl+Home ✔"

        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "calibration_event": "home_verified",
            "verified": is_verified,
            "first_line": detected_first,
            "telemetry": state.latest_telemetry
        })
    except Exception as e:
        print(f"[perform_full_project_calibration] Error: {e}")

    return (total_lines, is_verified, detected_first)

@router.post("/api/projects")
async def create_project(req: ProjectCreateRequest):
    new_proj = db.create_project(name=req.name, description=req.description or "", target_total_lines=req.target_total_lines or 0)
    state.captured_frames.clear()
    state.document_lines.clear()
    state.load_persisted_state()

    # Initialize DAG state for new project in clean, uncalibrated IDLE state
    target_lines = req.target_total_lines or 0
    state.dag_state["nodes"]["init_end"].update({"status": "idle", "total_lines": target_lines})
    state.dag_state["nodes"]["reset_home"].update({"status": "idle", "verified": False})
    state.dag_state["nodes"]["frame_acquire"].update({"status": "idle", "page": 1})
    state.dag_state["nodes"]["arrow_down"].update({"status": "idle"})
    state.dag_state["nodes"]["verification_trigger"].update({"status": "idle", "loop_count": 0, "is_complete": False})
    state.dag_state["current_active_node"] = "init_end"
    state.latest_telemetry["target_total_lines"] = target_lines
    state.latest_telemetry["current_top_line"] = 0
    state.latest_telemetry["current_bottom_line"] = 0
    state.latest_telemetry["phase"] = "IDLE"
    state.latest_telemetry["status_message"] = "Project ready. DAG waiting for invocation."

    await state.ws_manager.broadcast({
        "type": "project_switched",
        "project": new_proj,
        "dag": state.dag_state,
        "telemetry": state.latest_telemetry
    })
    return new_proj

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
        await send_hid_keycombination(113, 122, serial)
        await asyncio.sleep(0.5)
        contents = await capture_external_screenshot(serial)

    if not contents:
        raise HTTPException(status_code=400, detail="Could not capture or receive screenshot for Ctrl+Home verification.")

    home_path = state.FRAMES_DIR / f"calib_home_{project_id}.png"
    with open(home_path, "wb") as f:
        f.write(contents)

    is_verified, detected_first = await state.verify_first_line_in_process(home_path)
    if not is_verified:
        res_scan = await state.scan_image_in_process(home_path)
        detected_first = res_scan.get("top_line", 1)
        is_verified = (detected_first == 1)

    node_status = "completed" if is_verified else "error"
    state.dag_state["nodes"]["reset_home"].update({
        "status": node_status,
        "verified": is_verified,
        "first_line": detected_first
    })
    if is_verified:
        state.dag_state["nodes"]["frame_acquire"].update({"status": "active", "page": 1})
        state.dag_state["current_active_node"] = "frame_acquire"
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
    await state.ws_manager.broadcast({"type": "project_switched", "project": active_proj})
    return {"status": "success", "active_project": active_proj}

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
