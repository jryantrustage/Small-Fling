import asyncio
import base64
import io
import json
import re
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Tuple, Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Request, Response, UploadFile, File
from fastapi.responses import PlainTextResponse

import config
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
    extract_device_hardware_specs,
    run_adb_shell,
    dismiss_keyboard,
    get_display_dimensions,
    detect_external_display_id,
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

@router.post("/api/projects/active/reconcile-eof")
async def reconcile_active_project_eof_endpoint(req: Request):
    data = {}
    try:
        data = await req.json()
    except Exception:
        pass
    actual_eof_line = int(data.get("actual_eof_line") or 0)
    project_id = data.get("project_id") or state.get_current_project_id()
    reason = data.get("reason") or "Physical EOF verified"
    res = state.reconcile_eof_total_lines_and_complete_project(
        actual_eof_line=actual_eof_line,
        project_id=project_id,
        eof_reason=reason,
    )
    export_rec = state.export_project_markdown_to_disk(project_id=project_id)
    if res.get("project") and hasattr(state, "ws_manager") and state.ws_manager:
        await state.ws_manager.broadcast({"type": "project_updated", "project": res["project"]})
        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "telemetry": state.latest_telemetry,
            "diagnosis": state.get_loop_diagnosis(),
        })
    return {"status": "ok", **res, "export": export_rec, "diagnosis": state.get_loop_diagnosis()}

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
        # 0. Ensure editor content focus & title bar assistant overlay
        try:
            from services.adb_service import ensure_editor_content_focused
            await ensure_editor_content_focused(serial)
        except Exception:
            pass

        # 1. Dispatch Ctrl+End: keycode 113 + 123 and verify physical EOF stability
        disp_id = await detect_external_display_id(serial) or 3
        d_arg = f"-d {disp_id} " if (disp_id and disp_id > 0) else ""
        await send_hid_keycombination(113, 123, serial)
        await asyncio.sleep(0.6)
        calib_path = state.FRAMES_DIR / f"calib_end_{project_id}.png"
        prev_bot = -1
        for _ in range(4):
            end_bytes = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if end_bytes:
                with open(calib_path, "wb") as f:
                    f.write(end_bytes)
                t_cur, b_cur = await state.detect_gutter_bounds_in_process(calib_path)
                last_cur = await state.detect_last_line_in_process(calib_path)
                if last_cur > b_cur and (t_cur <= 0 or (last_cur - t_cur) <= 75):
                    b_cur = last_cur
                if b_cur <= 0 or t_cur <= 0:
                    res_scan = await state.scan_image_in_process(calib_path)
                    if b_cur <= 0: b_cur = res_scan.get("bottom_line", 0)
                    if t_cur <= 0: t_cur = res_scan.get("top_line", 0)
                if b_cur > 0 and (t_cur <= 0 or (0 <= (b_cur - t_cur) <= 75)):
                    total_lines = b_cur
                    if t_cur > 0:
                        top_line = t_cur
                    if b_cur == prev_bot:
                        break
                    prev_bot = b_cur
            try:
                await run_adb_shell(f"input {d_arg}keyevent 93 93 20 20 20 20 20 20 20 20 >/dev/null 2>&1", serial, timeout=2.5)
            except Exception:
                pass
            await send_hid_keycombination(113, 123, serial)
            await asyncio.sleep(0.45)

        # Auto-fix viewport immediately: close soft keyboard and reflow 1080p desktop layout
        await auto_fix_viewport(serial)

        is_stuck_on_line_1 = (0 < top_line <= 2 or total_lines <= 0)
        if is_stuck_on_line_1:
            # Queue automated recovery event to regain editor focus and re-dispatch Ctrl+End
            from services.dag_event_queue import queue_dag_event
            from services.adb_service import ensure_editor_content_focused

            async def _recover_calibration_focus():
                await ensure_editor_content_focused(serial)
                await asyncio.sleep(0.15)
                await send_hid_keycombination(113, 123, serial)
                await asyncio.sleep(0.8)
                await auto_fix_viewport(serial)
                r_bytes = await capture_external_screenshot(serial)
                if r_bytes:
                    calib_p = state.FRAMES_DIR / f"calib_end_{project_id}.png"
                    with open(calib_p, "wb") as f: f.write(r_bytes)
                    r_tot = await state.detect_last_line_in_process(calib_p)
                    r_top = await state.detect_top_line_in_process(calib_p)
                    if r_tot <= 0 or r_top <= 0:
                        s_r = await state.scan_image_in_process(calib_p)
                        if r_tot <= 0: r_tot = s_r.get("bottom_line", 0)
                        if r_top <= 0: r_top = s_r.get("top_line", 0)
                    return {"total_lines": r_tot, "top_line": r_top}
                return {"total_lines": 0, "top_line": 0}

            evt_res = await queue_dag_event(
                event_type="editor_focus_lost",
                category="FOCUS",
                message=f"Editor focus lost during calibration (Ln {top_line or 1}): Queued automated focus recovery event.",
                node_id="init_end",
                serial=serial,
                automated_steps=[
                    {"step": 1, "action": "cmd activity task to-front", "target": "com.microsoft.teams"},
                    {"step": 2, "action": "reposition_keyboard_assistant_overlay", "target": "yellow bounding box in title bar"},
                    {"step": 3, "action": "input tap editor text canvas", "target": "editor body at (x=450, y=360)"},
                    {"step": 4, "action": "dismiss soft keyboard", "target": "enforce physical keyboard layout"},
                    {"step": 5, "action": "re-dispatch Ctrl+End", "target": "EOF calibration"}
                ],
                handler=_recover_calibration_focus
            )

            if evt_res.get("status") == "resolved" and isinstance(evt_res.get("result"), dict):
                r_data = evt_res["result"]
                if r_data.get("total_lines", 0) > 0:
                    total_lines = r_data["total_lines"]
                    top_line = r_data.get("top_line", 0)
                    if total_lines >= 500 or top_line > 30:
                        is_stuck_on_line_1 = False

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

        # 2. Fast home: Focus editor canvas, dismiss keyboard, and dispatch Ctrl+Home: keycode 113 + 122
        disp_id = await detect_external_display_id(serial) or 3
        try:
            disp_w, disp_h = await get_display_dimensions(serial, disp_id)
            focus_x = min(disp_w // 3, 500) if disp_w > 0 else 500
            focus_y = min(disp_h // 2, 500) if disp_h > 0 else 500
            await run_adb_shell(f"input -d {disp_id} tap {focus_x} {focus_y} >/dev/null 2>&1", serial)
            await asyncio.sleep(0.08)
            await dismiss_keyboard(serial, disp_id)
            await asyncio.sleep(0.08)
        except Exception:
            pass

        await auto_fix_viewport(serial)
        await send_hid_keycombination(113, 122, serial)
        await asyncio.sleep(0.2)
        try:
            await dismiss_keyboard(serial, disp_id)
        except Exception:
            pass
        
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
        hid_config_json=hid_cfg,
        bundle_id=req.bundle_id or "",
        bundle_name=req.bundle_name or "",
        part_number=req.part_number or 0,
        total_parts=req.total_parts or 0,
        part_file_name=req.part_file_name or ""
    )
    state.captured_frames.clear()
    state.document_lines.clear()
    state.recapture_queue.clear()
    from routers.frames_document import clear_ocr_inspect_cache
    clear_ocr_inspect_cache()
    temp_c = state.FRAMES_DIR / "dag_node3_capture_temp.png"
    if temp_c.exists():
        try:
            temp_c.unlink()
        except Exception:
            pass
    state.save_persisted_state()
    state.load_persisted_state()

    # Initialize DAG state for new project with initialize group idle (ready to run in loop)
    target_lines = req.target_total_lines or 0
    state.dag_state.setdefault("groups", {})
    state.dag_state["groups"]["initialize"] = {
        "id": "initialize", "title": "Initialize", "description": "Auto-calibrates total lines via EOF Ctrl+End and verifies return to Line 1",
        "nodes": ["init_end", "reset_home"], "status": "idle",
        "progress": {"percent": 0, "stage": "Ready to run loop", "status": "idle"}
    }
    state.dag_state["groups"]["capture_entire_markdown"] = {
        "id": "capture_entire_markdown", "title": "Screen Capture & AI OCR",
        "description": "Acquires screen frames and extracts verbatim markdown with local vision model",
        "nodes": ["frame_acquire", "local_ai_ocr"], "status": "idle"
    }
    state.dag_state["groups"]["position_navigation"] = {
        "id": "position_navigation", "title": "Line Positioning & Navigation",
        "description": "Gutter OCR boundary detection and down-arrow viewport alignment",
        "nodes": ["frame_ocr", "arrow_down"], "status": "idle"
    }
    state.dag_state["groups"]["verify_assemble"] = {
        "id": "verify_assemble", "title": "Verify & Assemble",
        "description": "Recaptures frame to verify top line position, evaluates qualifiers, and reconstructs master document",
        "nodes": ["verification_trigger", "document_assemble"], "status": "idle"
    }
    state.dag_state["nodes"]["verification_trigger"]["group"] = "verify_assemble"
    state.dag_state["nodes"]["document_assemble"]["group"] = "verify_assemble"
    state.dag_state["semaphore_group2_to_3"] = True
    state.dag_state["semaphore_group3_to_4"] = True
    state.dag_state["semaphore_group2_to_3_status"] = "open"
    state.dag_state["semaphore_group3_to_4_status"] = "open"
    state.dag_state["semaphore_status"] = "open"
    state.dag_semaphore_group2_to_3 = True
    state.dag_semaphore_group3_to_4 = True
    state.dag_state["nodes"]["init_end"].update({"status": "idle", "total_lines": target_lines, "error": None})
    state.dag_state["nodes"]["reset_home"].update({"status": "idle", "verified": False})
    state.dag_state["nodes"]["frame_acquire"].update({"status": "idle", "page": 1})
    state.dag_state["nodes"]["frame_ocr"].update({"status": "idle", "top_line": 0, "bottom_line": 0, "target_top_line": 1, "extracted_line_count": 0})
    state.dag_state["nodes"]["arrow_down"].update({"status": "idle", "target_top_line": 1, "target_top": 1, "prev_bottom": 0, "arrow_count": 0})
    state.dag_state["nodes"]["verification_trigger"].update({"status": "idle", "loop_count": 0, "is_complete": False, "target_top_line": 1, "target_top": 1, "expected_top": 1})
    state.dag_state["nodes"]["document_assemble"].update({"status": "idle", "total_captured_lines": 0, "completion_percent": 0.0, "is_complete": False})
    state.orchestration_state["next_target_top"] = 1
    state.orchestration_state["cursor_line"] = 1
    state.dag_state["current_active_group"] = None
    state.dag_state["current_active_node"] = None
    state.latest_telemetry["target_total_lines"] = target_lines
    state.latest_telemetry["current_top_line"] = 1
    state.latest_telemetry["current_bottom_line"] = 0
    state.latest_telemetry["phase"] = "READY"
    state.latest_telemetry["status_message"] = f"Project created ({model.upper()}{' LOCKED' if lock_dev else ''} @ {target_dpi} DPI). Ready to run loop."

    await state.ws_manager.broadcast({
        "type": "project_switched",
        "project": new_proj,
        "dag": state.dag_state,
        "telemetry": state.latest_telemetry
    })

    # Immediately ensure any pending ANR dialogs (e.g. Pixel Launcher isn't responding) are cleared
    try:
        from services.adb_service import dismiss_anr_dialogs
        await dismiss_anr_dialogs(serial=dev_serial, display_id=disp_id)
    except Exception:
        pass

    # Project created without auto-running initialization or filename OCR.
    # Initialization and description detection will run on first 'Run Loop'.
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

@router.post("/api/projects/{project_id}/sync-device")
async def sync_project_device_hardware(project_id: str):
    """
    Synchronizes the project's locked device specifications (serial, display ID, resolution, DPI, LPP)
    with the currently attached hardware. Prevents needing to delete the project when ADB reconnects
    or when switching between display modes.
    """
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    serial = await get_active_adb_serial()
    specs = await extract_device_hardware_specs(serial)

    db.update_project_device_settings(
        project_id,
        device_model=specs.get("model", proj.get("device_model", "pixel_8")),
        device_name=specs.get("model", proj.get("device_name", "Android Device")),
        device_serial=specs.get("serial") or serial or proj.get("device_serial", ""),
        target_dpi=specs.get("active_dpi", proj.get("target_dpi", 220)),
        display_width=specs.get("display_width", proj.get("display_width", 1920)),
        display_height=specs.get("display_height", proj.get("display_height", 1080)),
        display_id=specs.get("display_id", proj.get("display_id", 0)),
        lines_per_page=specs.get("lines_per_page", proj.get("lines_per_page", 24)),
        step_size=specs.get("step_size", proj.get("step_size", 28)),
        scroll_padding_lines=specs.get("scroll_padding_lines", proj.get("scroll_padding_lines", 4)),
        arrow_count_init=specs.get("arrow_count_init", proj.get("arrow_count_init", 28)),
        arrow_count_step=specs.get("arrow_count_step", proj.get("arrow_count_step", 28)),
        settle_delay_ms=specs.get("settle_delay_ms", proj.get("settle_delay_ms", 50)),
        hid_config_json=json.dumps(specs.get("hid_config", {}))
    )
    updated = db.get_project(project_id)
    await state.ws_manager.broadcast({"type": "project_updated", "project": updated})
    return {
        "status": "success",
        "message": f"Project '{proj.get('name')}' successfully synchronized to current hardware {specs.get('model')}.",
        "project": updated
    }

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
        disp_id = await detect_external_display_id(serial) or 3
        try:
            disp_w, disp_h = await get_display_dimensions(serial, disp_id)
            focus_x = min(disp_w // 3, 500) if disp_w > 0 else 500
            focus_y = min(disp_h // 2, 500) if disp_h > 0 else 500
            await run_adb_shell(f"input -d {disp_id} tap {focus_x} {focus_y} >/dev/null 2>&1", serial)
            await asyncio.sleep(0.08)
            await dismiss_keyboard(serial, disp_id)
            await asyncio.sleep(0.08)
        except Exception:
            pass

        await auto_fix_viewport(serial)
        await send_hid_keycombination(113, 122, serial)
        await asyncio.sleep(0.2)
        try:
            await dismiss_keyboard(serial, disp_id)
        except Exception:
            pass
        
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
    try:
        from routers.frames_document import clear_ocr_inspect_cache
        clear_ocr_inspect_cache()
    except Exception:
        pass
    state.load_persisted_state()
    proj = db.get_project(project_id)
    frames_list = db.get_frames(project_id)
    from routers.frames_document import _doc_payload, _get_available_ocr_images
    doc_payload = _doc_payload()
    ocr_imgs = _get_available_ocr_images(project_id=project_id)
    all_projs = db.get_projects()

    await state.ws_manager.broadcast({
        "type": "project_switched",
        "project": proj,
        "projects": all_projs,
        "dag": state.dag_state,
        "telemetry": state.latest_telemetry
    })
    await state.ws_manager.broadcast({
        "type": "frame_deleted" if frames_list else "frames_purged",
        "frames": frames_list
    })
    await state.ws_manager.broadcast({
        "type": "document_updated",
        "data": doc_payload
    })

    return {
        "status": "success",
        "project": proj,
        "projects": all_projs,
        "frames": frames_list,
        "document": doc_payload,
        "telemetry": state.latest_telemetry,
        "token_stats": state.token_stats,
        "dag": state.dag_state,
        "multipart_state": state.multipart_bundle_state,
        "ocr_images": ocr_imgs
    }

@router.delete("/api/projects/bundle/{bundle_id}")
async def delete_project_bundle(bundle_id: str):
    parts = db.get_bundle_projects(bundle_id)
    part_ids = {p.get("id") for p in parts if p.get("id")}
    if state.get_current_project_id() in part_ids and getattr(state, "capture_loop_running", False):
        state.capture_loop_running = False

    deleted_ids = db.delete_bundle_projects(bundle_id)
    from routers.frames_document import clear_ocr_inspect_cache, _doc_payload
    clear_ocr_inspect_cache()

    state.captured_frames.clear()
    state.document_lines.clear()
    state.recapture_queue.clear()
    state.load_persisted_state()
    active_proj = db.get_active_project()
    active_pid = active_proj["id"] if active_proj else None
    all_projects = db.get_projects()

    try:
        for d_pid in deleted_ids:
            await state.ws_manager.broadcast({
                "type": "project_deleted",
                "project_id": d_pid,
                "active_project": active_proj,
                "projects": all_projects
            })
        await state.ws_manager.broadcast({"type": "project_switched", "project": active_proj})
        await state.ws_manager.broadcast({
            "type": "frames_purged" if not active_proj else "frame_deleted",
            "frames": db.get_frames(active_pid)
        })
        await state.ws_manager.broadcast({
            "type": "document_updated",
            "data": _doc_payload()
        })
    except Exception as be:
        print(f"[delete_project_bundle] Broadcast warning: {be}")

    return {
        "status": "success",
        "deleted_bundle_id": bundle_id,
        "deleted_project_ids": deleted_ids,
        "active_project": active_proj,
        "projects": all_projects
    }

@router.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    was_current = (state.get_current_project_id() == project_id)
    if was_current and getattr(state, "capture_loop_running", False):
        state.capture_loop_running = False

    db.delete_project(project_id)
    from routers.frames_document import clear_ocr_inspect_cache
    clear_ocr_inspect_cache()

    # Clean up any leftover temporary frame files so they do not bleed into other projects
    for tmp_file in ["dag_node3_capture_temp.png", "dag_node1_end.png"]:
        tmp_p = state.FRAMES_DIR / tmp_file
        if tmp_p.exists():
            try:
                tmp_p.unlink()
            except Exception:
                pass
    for calib_name in [f"calib_end_{project_id}.png", f"calib_home_{project_id}.png"]:
        calib_p = state.FRAMES_DIR / calib_name
        if calib_p.exists():
            try:
                calib_p.unlink()
            except Exception:
                pass

    state.captured_frames.clear()
    state.document_lines.clear()
    state.recapture_queue.clear()
    state.load_persisted_state()
    active_proj = db.get_active_project()
    active_pid = active_proj["id"] if active_proj else None
    if not active_proj:
        for node_data in state.dag_state.get("nodes", {}).values():
            node_data.update({
                "status": "idle",
                "is_active": False,
                "error": None,
                "total_lines": 0
            })
        for grp_data in state.dag_state.get("groups", {}).values():
            grp_data.update({
                "status": "idle",
                "progress": None
            })
        state.dag_state["current_active_node"] = None
        state.dag_state["current_active_group"] = None
        state.latest_telemetry["target_total_lines"] = 0
        state.latest_telemetry["current_top_line"] = 0
        state.latest_telemetry["current_bottom_line"] = 0
        state.latest_telemetry["current_page"] = 0
        state.orchestration_state["eof_reached"] = False
        state.orchestration_state["manual_attention_required"] = False
        state.orchestration_state["halt_reason"] = None
        state.orchestration_state["status"] = "IDLE"
        if hasattr(state, "project_diagnostics_trace") and isinstance(state.project_diagnostics_trace, dict):
            state.project_diagnostics_trace.update({
                "project_id": None,
                "project_name": "",
                "target_total_lines": 0,
                "highest_line_acquired": 0,
                "is_completed": False,
                "current_status": "IDLE",
                "last_stop_reason": None,
                "backfilled_up_to_frame_count": 0,
                "stop_and_restart_log": [],
                "loop_runs": [],
                "lifecycle_events": [],
            })
            try:
                state.save_diagnostics_trace()
            except Exception:
                pass
        state.save_persisted_state()

    all_projects = db.get_projects()
    # Broadcast project deletion and state synchronization to all connected clients
    try:
        await state.ws_manager.broadcast({
            "type": "project_deleted",
            "project_id": project_id,
            "active_project": active_proj,
            "projects": all_projects
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
        "projects": all_projects
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

def _find_frame_file(frame_id: str, filename: Optional[str] = None) -> Optional[Path]:
    raw_dirs = [state.FRAMES_DIR, db.FRAMES_DIR, config.FRAMES_DIR, getattr(db, "STORAGE_FRAMES_DIR", None)]
    unique_dirs = []
    seen = set()
    for d in raw_dirs:
        if not d:
            continue
        try:
            rk = str(Path(d).resolve()).lower()
            if rk not in seen and Path(d).exists():
                seen.add(rk)
                unique_dirs.append(Path(d))
        except Exception:
            pass

    clean_id = frame_id[:-4] if frame_id.endswith(".png") else frame_id
    candidates = []
    if filename:
        candidates.append(filename)
    for c in (f"{frame_id}.png", frame_id, f"{clean_id}.png"):
        if c not in candidates:
            candidates.append(c)

    for fdir in unique_dirs:
        for cand in candidates:
            try:
                p = fdir / cand
                if p.exists() and p.stat().st_size > 0:
                    return p
            except OSError:
                pass
    return None

def _reconstruct_project_markdown(project_id: str) -> str:
    lines_dict = db.get_document_lines(project_id)
    if not lines_dict:
        if state.get_current_project_id() == project_id:
            serialized = state.get_serialized_lines()
            return "\n".join(l.get("text", "") for l in serialized)
        return ""
    sorted_keys = sorted(lines_dict.keys())
    min_k = sorted_keys[0] if sorted_keys else 1
    max_k = sorted_keys[-1] if sorted_keys else 0
    return "\n".join(
        lines_dict[k].get("text", "") if k in lines_dict else ""
        for k in range(min_k, max_k + 1)
    )

@router.get("/api/projects/{project_id}/export-markdown")
async def export_project_markdown(project_id: str):
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    content = _reconstruct_project_markdown(project_id)
    updated_proj = db.increment_project_download_count(project_id, "markdown") or proj
    md_count = int(updated_proj.get("markdown_download_count") or 1)
    try:
        await state.ws_manager.broadcast({
            "type": "project_updated",
            "project": updated_proj,
            "projects": db.get_projects()
        })
    except Exception:
        pass

    safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', proj.get("name") or "document").strip('_')
    if safe_name.lower().endswith(".md"):
        safe_name = safe_name[:-3]
    return PlainTextResponse(
        content,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.md"',
            "X-Markdown-Download-Count": str(md_count),
            "Access-Control-Expose-Headers": "Content-Disposition, X-Markdown-Download-Count, X-Project-Download-Count"
        }
    )

@router.get("/api/projects/bundle/{bundle_id}/export-markdown")
async def export_bundle_markdown(bundle_id: str):
    bundle_parts = db.get_bundle_projects(bundle_id)
    if not bundle_parts:
        raise HTTPException(status_code=404, detail="Project bundle not found")

    sections = []
    total_md_count = 0
    for p in bundle_parts:
        pid = p["id"]
        part_md = _reconstruct_project_markdown(pid)
        sections.append(part_md)
        upd = db.increment_project_download_count(pid, "markdown") or p
        total_md_count = max(total_md_count, int(upd.get("markdown_download_count") or 1))

    try:
        await state.ws_manager.broadcast({
            "type": "projects_updated",
            "projects": db.get_projects()
        })
    except Exception:
        pass

    b_name = bundle_parts[0].get("bundle_name") or bundle_parts[0].get("name") or bundle_id
    safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', b_name).strip('_')
    return PlainTextResponse(
        "\n\n".join(sections),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}_bundle.md"',
            "X-Markdown-Download-Count": str(total_md_count),
            "Access-Control-Expose-Headers": "Content-Disposition, X-Markdown-Download-Count, X-Project-Download-Count"
        }
    )

@router.get("/api/document/export-markdown")
async def export_active_document_markdown():
    pid = state.get_current_project_id()
    if not pid:
        active = db.get_active_project()
        pid = active["id"] if active else None
    if not pid:
        serialized = state.get_serialized_lines()
        content = "\n".join(l.get("text", "") for l in serialized)
        return PlainTextResponse(
            content,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="document.md"'}
        )
    return await export_project_markdown(pid)

def _build_project_or_bundle_zip(primary_proj: Dict[str, Any], bundle_parts: List[Dict[str, Any]]) -> Tuple[bytes, str, int]:
    primary_id = primary_proj["id"]
    is_bundle = len(bundle_parts) > 1 or bool(primary_proj.get("bundle_id"))
    parts_to_package = bundle_parts if bundle_parts else [primary_proj]

    parts_manifest: List[Dict[str, Any]] = []
    added_files = set()
    zip_buffer = io.BytesIO()

    primary_frames = db.get_frames(primary_id, include_boxes=True)
    primary_lines_dict = db.get_document_lines(primary_id)
    primary_telemetry = db.get_project_telemetry(primary_id)
    primary_md = _reconstruct_project_markdown(primary_id)

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, p_proj in enumerate(parts_to_package, start=1):
            p_id = p_proj["id"]
            p_frames = db.get_frames(p_id, include_boxes=True)
            p_lines_dict = db.get_document_lines(p_id)
            p_tel = db.get_project_telemetry(p_id)
            p_md = _reconstruct_project_markdown(p_id)
            p_num = int(p_proj.get("part_number") or idx)
            raw_p_fn = p_proj.get("part_file_name") or p_proj.get("name") or f"part{p_num}.md"
            safe_p_fn = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', raw_p_fn).strip('_')
            if not safe_p_fn.lower().endswith(".md"):
                safe_p_fn = f"{safe_p_fn}.md"

            part_arc_path = f"parts/{safe_p_fn}"
            zf.writestr(part_arc_path, p_md)
            if is_bundle and safe_p_fn not in added_files:
                added_files.add(safe_p_fn)
                zf.writestr(safe_p_fn, p_md)

            parts_manifest.append({
                "part_number": p_num,
                "part_file_name": safe_p_fn,
                "markdown_path": part_arc_path,
                "markdown_content": p_md,
                "project": p_proj,
                "frames": p_frames,
                "document_lines": list(p_lines_dict.values()),
                "telemetry": p_tel
            })

            for f in p_frames:
                fid = f.get("frame_id")
                fn = f.get("filename") or f"{fid}.png"
                fpath = _find_frame_file(fid, fn)
                if fpath and fpath.exists() and fpath.name not in added_files:
                    added_files.add(fpath.name)
                    zf.write(fpath, arcname=f"frames/{fpath.name}")

            for calib_name in [f"calib_end_{p_id}.png", f"calib_home_{p_id}.png"]:
                calib_path = _find_frame_file(calib_name, calib_name)
                if calib_path and calib_path.exists() and calib_path.name not in added_files:
                    added_files.add(calib_path.name)
                    zf.write(calib_path, arcname=f"frames/{calib_path.name}")

        bundle_name = primary_proj.get("bundle_name") or primary_proj.get("name") or "project"
        manifest = {
            "version": 2,
            "is_bundle": is_bundle,
            "bundle_id": primary_proj.get("bundle_id") or "",
            "bundle_name": bundle_name,
            "total_parts": max(len(parts_manifest), int(primary_proj.get("total_parts") or 0)),
            "exported_at": datetime.now().isoformat(),
            "project": primary_proj,
            "frames": primary_frames,
            "document_lines": list(primary_lines_dict.values()),
            "telemetry": primary_telemetry,
            "parts": parts_manifest
        }

        safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', (bundle_name if len(parts_manifest) > 1 else (primary_proj.get("name") or "project"))).strip('_')
        if safe_name.lower().endswith(".md"):
            safe_name = safe_name[:-3]

        zf.writestr("project_data.json", json.dumps(manifest, indent=2))
        root_md_name = f"{safe_name}.md"
        if root_md_name not in added_files:
            zf.writestr(root_md_name, primary_md)

    zip_filename = f"{safe_name}_{primary_id}.zip"
    dl_count = int(primary_proj.get("project_download_count") or 1)
    return zip_buffer.getvalue(), zip_filename, dl_count

@router.get("/api/projects/bundle/{bundle_id}/export")
async def export_bundle_zip(bundle_id: str):
    bundle_parts = db.get_bundle_projects(bundle_id)
    if not bundle_parts:
        raise HTTPException(status_code=404, detail="Project bundle not found")

    updated_parts = []
    max_dl_count = 1
    for p in bundle_parts:
        upd = db.increment_project_download_count(p["id"], "project") or p
        updated_parts.append(upd)
        max_dl_count = max(max_dl_count, int(upd.get("project_download_count") or 1))

    try:
        await state.ws_manager.broadcast({
            "type": "projects_updated",
            "projects": db.get_projects()
        })
    except Exception:
        pass

    primary_proj = next((p for p in updated_parts if p.get("is_active")), updated_parts[0])
    zip_bytes, zip_filename, _ = _build_project_or_bundle_zip(primary_proj, updated_parts)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "X-Project-Download-Count": str(max_dl_count),
            "Access-Control-Expose-Headers": "Content-Disposition, X-Markdown-Download-Count, X-Project-Download-Count"
        }
    )

@router.get("/api/projects/{project_id}/export")
async def export_project_zip(project_id: str, include_bundle: bool = True):
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    b_id = proj.get("bundle_id")
    bundle_parts = db.get_bundle_projects(b_id) if (include_bundle and b_id) else []

    if bundle_parts and len(bundle_parts) > 1:
        updated_parts = []
        updated_proj = proj
        for p in bundle_parts:
            upd = db.increment_project_download_count(p["id"], "project") or p
            updated_parts.append(upd)
            if p["id"] == project_id:
                updated_proj = upd
        proj_dl_count = int(updated_proj.get("project_download_count") or 1)
    else:
        updated_proj = db.increment_project_download_count(project_id, "project") or proj
        updated_parts = [updated_proj]
        proj_dl_count = int(updated_proj.get("project_download_count") or 1)

    try:
        await state.ws_manager.broadcast({
            "type": "project_updated",
            "project": updated_proj,
            "projects": db.get_projects()
        })
    except Exception:
        pass

    zip_bytes, zip_filename, _ = _build_project_or_bundle_zip(updated_proj, updated_parts)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "X-Project-Download-Count": str(proj_dl_count),
            "Access-Control-Expose-Headers": "Content-Disposition, X-Markdown-Download-Count, X-Project-Download-Count"
        }
    )

def _markdown_text_to_document_lines(md_text: str) -> List[Dict[str, Any]]:
    if not md_text:
        return []
    now = datetime.now().isoformat()
    return [
        {
            "line_number": idx,
            "text": line_str,
            "confidence": 1.0,
            "frame_id": "",
            "verified": True,
            "is_verified": 1,
            "updated_at": now
        }
        for idx, line_str in enumerate(md_text.splitlines(), start=1)
    ]

@router.post("/api/projects/import")
async def import_project_zip(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a .zip project archive")

    imported_projects: List[Dict[str, Any]] = []
    total_frames_imported = 0
    total_lines_imported = 0

    try:
        contents = await file.read()
        zip_buf = io.BytesIO(contents)
        with zipfile.ZipFile(zip_buf, "r") as zf:
            namelist = zf.namelist()
            config.FRAMES_DIR.mkdir(parents=True, exist_ok=True)
            for name in namelist:
                if name.startswith("frames/") and not name.endswith("/"):
                    fname = Path(name).name
                    if fname.lower().endswith((".png", ".jpg", ".jpeg")):
                        img_bytes = zf.read(name)
                        dest_path = config.FRAMES_DIR / fname
                        dest_path.write_bytes(img_bytes)
                        if getattr(db, "STORAGE_FRAMES_DIR", None) and db.STORAGE_FRAMES_DIR.exists():
                            (db.STORAGE_FRAMES_DIR / fname).write_bytes(img_bytes)

            if "project_data.json" in namelist:
                raw_data = zf.read("project_data.json").decode("utf-8")
                data = json.loads(raw_data)
                parts_list = data.get("parts") if isinstance(data.get("parts"), list) else []

                if len(parts_list) > 0:
                    orig_bundle_id = data.get("bundle_id") or ""
                    orig_bundle_name = data.get("bundle_name") or ""
                    existing_projs_by_id = {p["id"] for p in db.get_projects()}
                    any_id_collides = any(
                        (pt.get("project") or {}).get("id") in existing_projs_by_id
                        for pt in parts_list
                    )
                    override_b_id = None
                    if orig_bundle_id and any_id_collides:
                        override_b_id = f"{orig_bundle_id}_imp_{int(datetime.now().timestamp())}"
                    elif orig_bundle_id:
                        override_b_id = orig_bundle_id

                    sorted_parts = sorted(
                        parts_list,
                        key=lambda pt: int(pt.get("part_number") or (pt.get("project") or {}).get("part_number") or 999)
                    )
                    tot_parts_count = max(len(sorted_parts), int(data.get("total_parts") or 0))

                    for idx, pt in enumerate(sorted_parts, start=1):
                        p_meta = dict(pt.get("project") or {})
                        p_num = int(pt.get("part_number") or p_meta.get("part_number") or idx)
                        p_fn = pt.get("part_file_name") or p_meta.get("part_file_name") or p_meta.get("name") or f"part{p_num}.md"
                        p_meta["part_number"] = p_num
                        p_meta["total_parts"] = tot_parts_count
                        p_meta["part_file_name"] = p_fn
                        if orig_bundle_name and not p_meta.get("bundle_name"):
                            p_meta["bundle_name"] = orig_bundle_name

                        p_frames = pt.get("frames") or []
                        p_lines = pt.get("document_lines") or []
                        if not p_lines:
                            md_txt = pt.get("markdown_content") or ""
                            if not md_txt and pt.get("markdown_path") and pt["markdown_path"] in namelist:
                                md_txt = zf.read(pt["markdown_path"]).decode("utf-8", errors="replace")
                            if md_txt:
                                p_lines = _markdown_text_to_document_lines(md_txt)

                        p_tel = pt.get("telemetry") or {}
                        imp_p = db.import_project_data(
                            p_meta,
                            p_frames,
                            p_lines,
                            p_tel,
                            activate=(idx == 1),
                            override_bundle_id=override_b_id,
                            override_bundle_name=orig_bundle_name or None
                        )
                        imported_projects.append(imp_p)
                        total_frames_imported += len(p_frames)
                        total_lines_imported += len(p_lines)
                else:
                    proj_meta = data.get("project", {})
                    frames_meta = data.get("frames", [])
                    lines_meta = data.get("document_lines", [])
                    if not lines_meta:
                        md_files = [n for n in namelist if n.lower().endswith(".md") and not n.endswith("/")]
                        if md_files:
                            md_txt = zf.read(md_files[0]).decode("utf-8", errors="replace")
                            lines_meta = _markdown_text_to_document_lines(md_txt)
                    tel_meta = data.get("telemetry", {})
                    imp_p = db.import_project_data(proj_meta, frames_meta, lines_meta, tel_meta, activate=True)
                    imported_projects.append(imp_p)
                    total_frames_imported += len(frames_meta)
                    total_lines_imported += len(lines_meta)
            else:
                # Fallback: ZIP archive containing one or more .md part files directly
                md_entries = [n for n in namelist if n.lower().endswith((".md", ".markdown")) and not n.endswith("/") and not Path(n).name.startswith(".")]
                if not md_entries:
                    raise HTTPException(status_code=400, detail="Archive missing project_data.json metadata and contains no .md files")

                parsed_entries = []
                for entry_name in md_entries:
                    fname = Path(entry_name).name
                    b_meta = db._infer_bundle_metadata(name=fname, part_file_name=fname)
                    parsed_entries.append((int(b_meta.get("part_number") or 999), fname, entry_name, b_meta))
                parsed_entries.sort(key=lambda x: (x[0], x[1]))

                shared_b_id = parsed_entries[0][3].get("bundle_id") or f"bundle_{re.sub(r'[^a-z0-9]+', '_', Path(file.filename or 'bundle').stem.lower()).strip('_')}"
                shared_b_name = parsed_entries[0][3].get("bundle_name") or Path(file.filename or "Bundle").stem
                tot_parts = len(parsed_entries)

                for idx, (p_num, fname, entry_name, b_meta) in enumerate(parsed_entries, start=1):
                    md_txt = zf.read(entry_name).decode("utf-8", errors="replace")
                    lines_meta = _markdown_text_to_document_lines(md_txt)
                    eff_part = p_num if p_num < 999 else idx
                    proj_meta = {
                        "name": fname,
                        "description": f"File: {fname} (Multi-Part Bundle Part {eff_part} of {tot_parts})",
                        "target_total_lines": len(lines_meta),
                        "bundle_id": shared_b_id,
                        "bundle_name": shared_b_name,
                        "part_number": eff_part,
                        "total_parts": tot_parts,
                        "part_file_name": fname,
                    }
                    imp_p = db.import_project_data(
                        proj_meta,
                        [],
                        lines_meta,
                        {},
                        activate=(idx == 1),
                        override_bundle_id=shared_b_id,
                        override_bundle_name=shared_b_name
                    )
                    imported_projects.append(imp_p)
                    total_lines_imported += len(lines_meta)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unpack project archive: {str(e)}")

    if not imported_projects:
        raise HTTPException(status_code=400, detail="No valid projects found in archive")

    active_imported = imported_projects[0]
    new_pid = active_imported["id"]
    db.activate_project(new_pid)
    state.load_persisted_state()

    try:
        from routers.frames_document import clear_ocr_inspect_cache
        clear_ocr_inspect_cache()
    except Exception:
        pass

    all_projs = db.get_projects()
    try:
        await state.ws_manager.broadcast({"type": "project_switched", "project": active_imported, "projects": all_projs})
        await state.ws_manager.broadcast({"type": "projects_updated", "projects": all_projs})
        await state.ws_manager.broadcast({"type": "frames_purged", "frames": db.get_frames(new_pid)})
        from routers.frames_document import _doc_payload
        await state.ws_manager.broadcast({"type": "document_updated", "data": _doc_payload()})
    except Exception as be:
        print(f"[import_project_zip] Broadcast warning: {be}")

    return {
        "status": "success",
        "is_bundle": len(imported_projects) > 1 or bool(active_imported.get("bundle_id")),
        "bundle_id": active_imported.get("bundle_id") or "",
        "bundle_name": active_imported.get("bundle_name") or active_imported.get("name") or "",
        "parts_imported": len(imported_projects),
        "message": (
            f"Successfully imported bundle '{active_imported.get('bundle_name') or active_imported.get('name')}' ({len(imported_projects)} parts)"
            if len(imported_projects) > 1
            else f"Successfully imported project '{active_imported.get('name')}'"
        ),
        "project": active_imported,
        "projects": imported_projects,
        "all_projects": all_projs,
        "frames_imported": total_frames_imported,
        "lines_imported": total_lines_imported
    }

