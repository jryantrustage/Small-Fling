import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel

import hashlib
import config, db
from models import TelemetryUpdateRequest, OrchestrationRequest, PipelineModeRequest, OcrSelectionRequest
from services import state
from services.adb_service import (
    ensure_adb_keyboard_closed, check_and_update_alignment, DEVICE_PROFILES, current_device_model,
    get_active_adb_serial, send_hid_keycombination, capture_external_screenshot, run_adb_shell, detect_external_display_id
)
import services.ocr_service as ocr_svc

router = APIRouter(tags=["Orchestration & Telemetry"])

try:
    from server.classifiers import (
        classifier_registry,
        create_classifier_context,
        Line1StuckClassifier,
        ClassifierContext,
    )
except ImportError:
    from classifiers import (
        classifier_registry,
        create_classifier_context,
        Line1StuckClassifier,
        ClassifierContext,
    )


async def evaluate_node_5_decision(serial: Optional[str] = None):
    try:
        await classifier_registry.evaluate_all(await create_classifier_context(serial))
        return state.evaluate_dag_node_5_trigger_sync(classifier_registry.get_latest_issues())
    except Exception:
        return state.evaluate_dag_node_5_trigger_sync()

class DismissItemPayload(BaseModel):
    item_id: str
    dismissed: bool = True

@router.get("/api/alignment/status")
@router.get("/api/device/alignment")
async def get_alignment_status_api():
    return state.latest_alignment_status

@router.post("/api/alignment/check")
@router.post("/api/device/alignment/check")
async def trigger_alignment_check_api():
    return await check_and_update_alignment()

@router.post("/api/alignment/dismiss")
@router.post("/api/device/alignment/dismiss-item")
async def dismiss_alignment_item_api(payload: DismissItemPayload):
    if payload.dismissed: state.dismissed_alignment_items.add(payload.item_id)
    else: state.dismissed_alignment_items.discard(payload.item_id)
    return {"status": "success", "item_id": payload.item_id, "dismissed": payload.dismissed, "dismissed_items": list(state.dismissed_alignment_items), "alignment": await check_and_update_alignment()}

@router.get("/api/alignment/dismissed")
async def get_dismissed_alignment_items_api():
    return {"dismissed_items": list(state.dismissed_alignment_items)}

@router.get("/api/telemetry")
async def get_telemetry():
    return {"telemetry": state.get_fresh_telemetry(), "token_stats": state.token_stats, "alignment": state.latest_alignment_status, "document_summary": state.get_document_metrics()}

@router.post("/api/telemetry")
async def update_telemetry(p: TelemetryUpdateRequest):
    global current_device_model
    for k in ["device_id", "is_pacing", "current_page", "current_top_line", "current_bottom_line", "target_total_lines", "dwell_countdown_ms", "phase", "status_message"]:
        val = getattr(p, k)
        if val is not None:
            if k == "target_total_lines" and val > 0:
                state.latest_telemetry[k] = val
                if (p_active := db.get_active_project()) and p_active.get("target_total_lines", 0) <= 0:
                    db.update_project_target_lines(p_active["id"], val)
            elif k != "target_total_lines":
                state.latest_telemetry[k] = val
    state.latest_telemetry["last_heartbeat"] = datetime.now().isoformat()
    if p.pacer_calibration: state.latest_telemetry["pacer_calibration"].update(p.pacer_calibration)
    if p.mobile_tokens: state.token_stats["mobile_tokens"] = p.mobile_tokens
    if p.current_top_line and p.current_top_line > 0: state.orchestration_state["top_line"] = p.current_top_line
    if p.current_bottom_line and p.current_bottom_line > 0:
        state.orchestration_state["bottom_line"] = p.current_bottom_line
        state.orchestration_state["next_target_top"] = p.current_bottom_line + 1
    if p.current_page and p.current_page > 0: state.orchestration_state["page"] = p.current_page

    if p.device_id:
        did = p.device_id.lower()
        if "pixel 8" in did or "pixel_8" in did: current_device_model = "pixel_8"
        elif "pixel 10" in did or "pixel_10" in did: current_device_model = "pixel_10"
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
        state.orchestration_state.update({"device_model": current_device_model, "lines_per_page": prof["lines_per_page"]})

    if p.active_step: state.orchestration_state["active_step"] = p.active_step
    elif p.phase:
        pu = p.phase.upper()
        state.orchestration_state["active_step"] = (
            "SCREEN_CAPTURE" if ("CAPTURING" in pu or "SCREEN" in pu) else (
                "OCR_BOUNDS" if ("OCR" in pu or "BOUNDS" in pu) else (
                    "PRECISION_SCROLL" if ("SCROLL" in pu or "PACING" in pu or "ALIGN" in pu) else (
                        "DWELL_FREEZE" if ("DWELL" in pu or "FREEZE" in pu) else (
                            "START_READY" if ("READY" in pu or "STANDBY" in pu) else state.orchestration_state["active_step"]
                        )
                    )
                )
            )
        )
    if state.latest_telemetry.get("status_message") and "Desktop Captured" in state.latest_telemetry["status_message"]:
        state.latest_telemetry["status_message"] = "Ready"

    prev_status, prev_step = state.orchestration_state.get("status"), state.orchestration_state.get("active_step")
    if p.is_pacing: state.orchestration_state["status"] = "RUNNING"
    elif p.phase == "COMPLETED": state.orchestration_state["status"], state.orchestration_state["active_step"] = "COMPLETED", "LOOP_EVAL"
    elif p.phase == "PAUSED": state.orchestration_state["status"] = "PAUSED"
    elif p.phase in ["STANDBY", "IDLE"] and state.orchestration_state["status"] == "RUNNING": state.orchestration_state["status"] = "IDLE"

    if state.orchestration_state.get("status") != prev_status or state.orchestration_state.get("active_step") != prev_step:
        state.orchestration_state["updated_at"] = datetime.now().isoformat()

    await state.ws_manager.broadcast({"type": "orchestration_event", "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry})
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@router.get("/api/orchestrate")
async def get_orchestration_state():
    return {"orchestration": state.orchestration_state, "telemetry": state.get_fresh_telemetry()}

@router.post("/api/orchestrate")
async def handle_orchestration_command(payload: OrchestrationRequest):
    cmd, invoker = payload.command.upper(), state.format_device_name(payload.source)
    state.orchestration_state.update({"last_command": cmd, "source": payload.source or "web", "invoked_by": invoker, "updated_at": datetime.now().isoformat()})

    if cmd in ("BEGIN", "BEGIN_AUTO_FLIPPING"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"status": "RUNNING", "active_step": "SCREEN_CAPTURE", "step_label": f"Auto Flipping Started by {invoker}"})
        state.latest_telemetry.update({"is_pacing": True, "phase": "PACING", "status_message": f"Auto Flipping • Invoked by {invoker}"})
    elif cmd == "CAPTURE_DESKTOP":
        state.orchestration_state.update({"last_command": "NONE", "active_step": "START_READY", "step_label": "Desktop capture actuator disabled"})
        state.latest_telemetry.update({"status_message": "Desktop capture actuator disabled"})
        await state.ws_manager.broadcast({"type": "orchestration_event", "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry})
        return {"status": "disabled", "command": cmd, "message": "Desktop capture actuator is disabled.", "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry}
    elif cmd == "GET_NEXT_LINE":
        next_ln = 1
        for f in reversed(sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
            if f.get("bottom_line", 0) > 0:
                next_ln = f["bottom_line"] + 1
                break
        if next_ln == 1 and state.document_lines: next_ln = max(state.document_lines.keys()) + 1
        state.orchestration_state.update({"next_target_top": next_ln, "step_label": f"Next Target Line: {next_ln} (Queried by {invoker})"})
        state.latest_telemetry.update({"status_message": f"Next Page First Line: {next_ln} • Invoked by {invoker}"})
    elif cmd == "PAUSE":
        state.orchestration_state.update({"status": "PAUSED", "step_label": f"Paused by {invoker}"})
        state.latest_telemetry.update({"is_pacing": False, "phase": "PAUSED", "status_message": f"Paused • Invoked by {invoker}"})
    elif cmd == "RESUME":
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"status": "RUNNING", "active_step": "PRECISION_SCROLL", "step_label": f"Resumed by {invoker}"})
        state.latest_telemetry.update({"is_pacing": True, "phase": "PACING", "status_message": f"Running • Invoked by {invoker}"})
    elif cmd == "END":
        state.orchestration_state.update({"status": "COMPLETED", "active_step": "LOOP_EVAL", "step_label": f"Ended by {invoker}"})
        state.latest_telemetry.update({"is_pacing": False, "phase": "COMPLETED", "status_message": f"Completed • Invoked by {invoker}"})
    elif cmd == "RESTART":
        await ensure_adb_keyboard_closed()
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
        lpp = prof["lines_per_page"]
        state.orchestration_state.update({"status": "RUNNING", "active_step": "START_READY", "step_label": f"Restarted at Line 1 by {invoker}", "top_line": 1, "bottom_line": lpp, "next_target_top": lpp + 1, "page": 1, "device_model": current_device_model, "lines_per_page": lpp})
        state.latest_telemetry.update({"current_page": 1, "current_top_line": 1, "current_bottom_line": 0, "is_pacing": True, "phase": "PACING", "status_message": f"Restarted • Invoked by {invoker}"})
    elif cmd in ("CALIBRATE_INSTANT", "CALIBRATE"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"active_step": "CALIBRATING", "step_label": f"Instant Calibration by {invoker}"})
        state.latest_telemetry.update({"status_message": f"Instant Calibration (Ctrl+End / Ctrl+Home) • Invoked by {invoker}"})
    elif cmd in ("ADVANCE_PAGE_ARROW", "PAGE_DOWN_ARROW"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"active_step": "PRECISION_SCROLL", "step_label": f"Arrow Step Invoked by {invoker}"})
        state.latest_telemetry.update({"status_message": f"Arrow Step Navigation • Invoked by {invoker}"})

    await state.ws_manager.broadcast({"type": "orchestration_event", "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry})
    try: db.save_project_telemetry(state.get_current_project_id(), state.latest_telemetry, state.token_stats)
    except Exception: pass
    return {"status": "success", "command": cmd, "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry}

@router.get("/api/dag/status")
async def get_dag_status():
    proj = db.get_active_project()
    target_tot = proj.get("target_total_lines", 0) if proj else state.latest_telemetry.get("target_total_lines", 0)
    node_5 = state.dag_state["nodes"].get("verification_trigger", {})
    return {
        "status": "success", "dag": state.dag_state, "target_total_lines": target_tot,
        "current_top_line": state.latest_telemetry.get("current_top_line", 1),
        "current_bottom_line": state.latest_telemetry.get("current_bottom_line", 31),
        "current_page": state.latest_telemetry.get("current_page", 1),
        "active_node": state.dag_state.get("current_active_node", "init_end"),
        "node_5_config": node_5.get("config", {}), "trigger_decision": node_5.get("trigger_decision", {})
    }

NODE_ALIAS_MAP = {
    "node_1": "init_end", "node_1_end": "init_end", "init_end": "init_end",
    "node_2": "reset_home", "node_2_home": "reset_home", "reset_home": "reset_home",
    "node_3": "frame_acquire", "frame_acquire": "frame_acquire",
    "node_4": "arrow_down", "arrow_down": "arrow_down",
    "node_5": "verification_trigger", "verification_trigger": "verification_trigger"
}

@router.get("/api/dag/nodes/{node_id}/config")
async def get_dag_node_config(node_id: str):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node: raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    return {"status": "success", "node_id": target_key, "title": node.get("title", ""), "config": node.get("config", {}), "status_code": node.get("status", "idle"), "trigger_decision": node.get("trigger_decision", {}) if target_key == "verification_trigger" else None}

@router.post("/api/dag/nodes/{node_id}/config")
async def update_dag_node_config(node_id: str, payload: Dict[str, Any]):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node: raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    cfg = node.setdefault("config", {})

    if target_key == "verification_trigger":
        if "prevent_trigger_on_issue" in payload and payload["prevent_trigger_on_issue"] is not None:
            cfg["prevent_trigger_on_issue"] = bool(payload["prevent_trigger_on_issue"])
        if "qualifiers" in payload and isinstance(payload["qualifiers"], dict):
            for q_id, q_data in payload["qualifiers"].items():
                if q_id in cfg.get("qualifiers", {}): cfg["qualifiers"][q_id].update(q_data)
        decision = state.evaluate_dag_node_5_trigger_sync()
        node["trigger_decision"] = decision
    else:
        cfg.update(payload)
        decision = None

    await state.ws_manager.broadcast({"type": "dag_node_configured", "node_id": target_key, "config": cfg, "trigger_decision": decision, "dag": state.dag_state})
    return {"status": "success", "node_id": target_key, "config": cfg, "trigger_decision": decision}

@router.post("/api/dag/nodes/{node_id}/run")
async def run_single_dag_node(node_id: str, payload: Optional[Dict[str, Any]] = None):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node: raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")

    payload = payload or {}
    active_serial = await get_active_adb_serial(payload.get("serial"))
    cfg = node.get("config", {})

    state.dag_state["current_active_node"] = target_key
    node["status"] = "active"
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "running_node": target_key})

    try:
        if target_key == "init_end":
            await send_hid_keycombination(int(cfg.get("key1", 113)), int(cfg.get("key2", 123)), active_serial)
            await asyncio.sleep(float(cfg.get("settle_delay_ms", 800)) / 1000.0)
            snap = await capture_external_screenshot(active_serial)
            total_lines = 0
            top_line = 0
            if snap:
                calib = state.FRAMES_DIR / "dag_node1_end.png"
                with open(calib, "wb") as f: f.write(snap)
                total_lines = await state.detect_last_line_in_process(calib)
                top_line = await state.detect_top_line_in_process(calib)
                if total_lines <= 0 or top_line <= 0:
                    scan_res = await state.scan_image_in_process(calib)
                    if total_lines <= 0: total_lines = scan_res.get("bottom_line", 0)
                    if top_line <= 0: top_line = scan_res.get("top_line", 0)

            # Evaluate Line1StuckClassifier to determine if editor is still displaying line 1
            is_stuck_on_line_1 = False
            try:
                disp_id = await detect_external_display_id(active_serial)
                l1_clf = Line1StuckClassifier()
                clf_ctx = ClassifierContext(serial=active_serial, display_id=disp_id, image_bytes=snap)
                clf_res = await l1_clf.detect(clf_ctx)
                if clf_res.issue_detected:
                    is_stuck_on_line_1 = True
            except Exception as ce:
                print(f"[init_end] Line1StuckClassifier evaluation error: {ce}")

            # Additional check: if top_line is <= 2, it is definitely still on line 1
            if 0 < top_line <= 2:
                is_stuck_on_line_1 = True

            if is_stuck_on_line_1:
                # HARD FAILURE: Ctrl+End did not navigate away from page 1!
                error_msg = f"EOF Navigation Failed: Editor still displays Line {top_line or 1} at top (bottom line: {total_lines}). Ctrl+End did not navigate to the end of the file."
                node.update({
                    "status": "error",
                    "total_lines": 0,
                    "top_line": top_line,
                    "error": error_msg
                })
                state.latest_telemetry["status_message"] = f"DAG Node 1 Failed: Page still on Line {top_line or 1} (EOF jump failed)"
                await state.ws_manager.broadcast({
                    "type": "dag_updated",
                    "dag": state.dag_state,
                    "node_id": "init_end",
                    "status": "error",
                    "total_lines": 0,
                    "top_line": top_line,
                    "error": error_msg,
                    "telemetry": state.latest_telemetry
                })
                return {
                    "status": "error",
                    "node_id": "init_end",
                    "total_lines": 0,
                    "top_line": top_line,
                    "message": error_msg
                }

            if total_lines <= 0 and cfg.get("manual_total_lines", 0) > 0:
                total_lines = int(cfg["manual_total_lines"])
            if total_lines > 0:
                if proj := db.get_active_project(): db.update_project_target_lines(proj["id"], total_lines)
                state.latest_telemetry["target_total_lines"] = total_lines
                state.latest_telemetry["status_message"] = f"DAG Node 1: Total lines calibrated to {total_lines} via Ctrl+End"

            node_status = "completed" if total_lines > 0 else "error"
            node.update({"status": node_status, "total_lines": total_lines, "top_line": top_line, "error": None if node_status == "completed" else "Could not detect EOF lines"})
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "init_end", "total_lines": total_lines, "telemetry": state.latest_telemetry})
            return {
                "status": "success" if total_lines > 0 else "warning",
                "node_id": "init_end",
                "total_lines": total_lines,
                "message": f"Successfully detected {total_lines} total lines at EOF via Ctrl+End ✔" if total_lines > 0 else "Ctrl+End sent, but could not detect EOF last line in gutter. Please verify document or connect device."
            }


        elif target_key == "reset_home":
            await send_hid_keycombination(int(cfg.get("key1", 113)), int(cfg.get("key2", 122)), active_serial)
            await asyncio.sleep(float(cfg.get("settle_delay_ms", 800)) / 1000.0)
            snap = await capture_external_screenshot(active_serial)
            is_verified, detected_first = False, 0
            if snap:
                calib = state.FRAMES_DIR / "dag_node2_home.png"
                with open(calib, "wb") as f: f.write(snap)
                is_verified, detected_first = await state.verify_first_line_in_process(calib)
                if not is_verified and (await state.detect_top_line_in_process(calib)) == 1:
                    is_verified, detected_first = True, 1

            node.update({"status": "completed" if is_verified else "error", "verified": is_verified, "first_line": detected_first})
            state.latest_telemetry["current_top_line"] = detected_first or 1
            state.latest_telemetry["status_message"] = f"DAG Node 2: Line 1 {'verified' if is_verified else 'unverified'} at top (detected Ln {detected_first})"
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "reset_home", "verified": is_verified, "first_line": detected_first, "telemetry": state.latest_telemetry})
            return {"status": "success" if is_verified else "warning", "node_id": "reset_home", "verified": is_verified, "first_line": detected_first, "message": f"Line 1 {'verified at top gutter' if is_verified else f'detection returned Ln {detected_first}'} via Ctrl+Home"}

        elif target_key == "frame_acquire":
            if cfg.get("guard_keyboard", True):
                await ensure_adb_keyboard_closed(active_serial)

            snap = await capture_external_screenshot(active_serial)
            if not snap or len(snap) < 2000 or not snap.startswith(b"\x89PNG\r\n\x1a\n"):
                node.update({
                    "status": "error",
                    "error": "Screen capture failed: no valid image received from device display",
                    "top_line": 0,
                    "bottom_line": 0
                })
                state.latest_telemetry["status_message"] = "DAG Node 3: Screen capture failed - no image from display"
                await state.ws_manager.broadcast({
                    "type": "dag_updated",
                    "dag": state.dag_state,
                    "node_id": "frame_acquire",
                    "error": "Screen capture failed",
                    "telemetry": state.latest_telemetry
                })
                return {
                    "status": "error",
                    "node_id": "frame_acquire",
                    "message": "Screen capture failed: no valid image received from external display. Please verify device connection and display stream."
                }

            temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
            with open(temp_calib, "wb") as f:
                f.write(snap)

            scan_res = await state.scan_image_in_process(temp_calib)
            raw_top = scan_res.get("top_line", 0) or 0
            raw_bot = scan_res.get("bottom_line", 0) or 0
            lines_detected = scan_res.get("lines", [])

            if raw_top <= 0 and raw_bot <= 0 and len(lines_detected) == 0:
                node.update({
                    "status": "error",
                    "error": "Screen capture failed: no editor lines or gutter numbers detected",
                    "top_line": 0,
                    "bottom_line": 0
                })
                state.latest_telemetry["status_message"] = "DAG Node 3: Screen capture rejected - no editor content detected"
                await state.ws_manager.broadcast({
                    "type": "dag_updated",
                    "dag": state.dag_state,
                    "node_id": "frame_acquire",
                    "error": "No lines detected",
                    "telemetry": state.latest_telemetry
                })
                return {
                    "status": "error",
                    "node_id": "frame_acquire",
                    "message": "Screen capture failed: no editor lines or gutter numbers detected in captured image. Please ensure Markdown editor is focused."
                }

            if raw_top > 0 and raw_bot > 0:
                top_ln, bot_ln = raw_top, raw_bot
            elif lines_detected:
                top_ln = min(l.get("line_number", 1) for l in lines_detected)
                bot_ln = max(l.get("line_number", top_ln) for l in lines_detected)
            else:
                top_ln = state.latest_telemetry.get("current_top_line", 1) or 1
                bot_ln = top_ln + 47

            pid = state.get_current_project_id()
            if not pid:
                proj = db.get_active_project()
                if not proj:
                    projects = db.get_projects()
                    proj = projects[0] if projects else db.create_project("Matrix Markdown")
                    db.set_active_project(proj["id"])
                pid = proj["id"]

            pidx = len(state.captured_frames) + 1
            now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
            fid = f"frame_{top_ln:05d}_{bot_ln:05d}_{now_str}" if (top_ln > 0 and bot_ln > 0) else f"frame_p{pidx:03d}_{now_str}"
            fn = f"{fid}.png"
            frame_path = state.FRAMES_DIR / fn
            with open(frame_path, "wb") as f:
                f.write(snap)

            content_hash = hashlib.sha256(snap).hexdigest()
            frame_info = {
                "frame_id": fid,
                "filename": fn,
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "page_index": pidx,
                "file_size": len(snap),
                "content_hash": content_hash,
                "status": "processed",
                "created_at": datetime.now().isoformat(),
                "extracted_line_count": len(lines_detected),
                "bounding_boxes": scan_res.get("bounding_boxes", {}),
                "model_used": "local:rapidocr",
                "token_usage": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
            }
            state.captured_frames[fid] = frame_info

            for item in lines_detected:
                ln = item.get("line_number")
                if ln:
                    state.document_lines[ln] = state.MasterLine(
                        item.get("text", ""),
                        line_number=ln,
                        frame_id=fid,
                        status=item.get("status", "verified"),
                        confidence=item.get("confidence", 0.95),
                        is_wrapped=item.get("is_wrapped", False),
                    )

            state.save_persisted_state()
            state.update_dag_after_frame(fid, top_ln, bot_ln)

            await state.ws_manager.broadcast({"type": "new_frame", "frame": frame_info, "data": frame_info})
            await state.ws_manager.broadcast({"type": "document_updated", "document": state.get_document_metrics(), "data": state.get_document_metrics()})

            node.update({
                "status": "completed",
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "page": pidx,
                "frame_id": fid,
                "error": None
            })
            state.latest_telemetry.update({
                "current_top_line": top_ln,
                "current_bottom_line": bot_ln,
                "current_page": pidx,
                "status_message": f"DAG Node 3: Acquired frame {fid} (Page {pidx}: Ln {top_ln} → {bot_ln})"
            })
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": "frame_acquire",
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "page": pidx,
                "frame_id": fid,
                "telemetry": state.latest_telemetry
            })
            return {
                "status": "success",
                "node_id": "frame_acquire",
                "frame_id": fid,
                "page": pidx,
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "scan": scan_res,
                "message": f"Acquired frame {fid}: Ln {top_ln} → {bot_ln} ✔"
            }

        elif target_key == "arrow_down":
            step_count, key_delay = int(cfg.get("step_count", 47)), float(cfg.get("key_delay_ms", 8)) / 1000.0
            disp_id = await detect_external_display_id(active_serial)
            for _ in range(step_count):
                cmd = f"input -d {disp_id} keyevent 20" if disp_id > 0 else "input keyevent 20"
                await run_adb_shell(cmd, active_serial)
                if key_delay > 0: await asyncio.sleep(key_delay)
            await asyncio.sleep(0.4)
            snap, new_top = await capture_external_screenshot(active_serial), 0
            if snap:
                calib = state.FRAMES_DIR / "dag_node4_step.png"
                with open(calib, "wb") as f: f.write(snap)
                new_top = await state.detect_top_line_in_process(calib)
                if new_top > 0: state.latest_telemetry["current_top_line"] = new_top

            node.update({"status": "completed", "arrow_count": step_count, "new_top_line": new_top})
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "arrow_down", "step_count": step_count, "new_top_line": new_top, "telemetry": state.latest_telemetry})
            return {"status": "success", "node_id": "arrow_down", "step_count": step_count, "new_top_line": new_top, "message": f"Stepped {step_count} down arrows: New top Ln {new_top} ✔"}

        elif target_key == "verification_trigger":
            decision = await evaluate_node_5_decision(active_serial)
            node.update({"status": "completed" if decision.get("allowed") else "prevented", "trigger_decision": decision})
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "verification_trigger", "trigger_decision": decision})
            return {"status": "success", "node_id": "verification_trigger", "trigger_decision": decision, "allowed": decision.get("allowed", False), "prevented": decision.get("prevented", True), "message": "Trigger allowed ✔" if decision.get("allowed") else f"Trigger prevented: {', '.join(decision.get('reasons', []))} ⛔"}
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported node {target_key}")
    except Exception as e:
        node["status"] = "error"
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/dag/nodes/node_5/evaluate")
async def evaluate_dag_node_5_qualifiers(serial: Optional[str] = None):
    decision = await evaluate_node_5_decision(serial)
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "verification_trigger", "trigger_decision": decision})
    return {"status": "success", "node_id": "verification_trigger", "trigger_decision": decision, "allowed": decision.get("allowed", False), "prevented": decision.get("prevented", True), "message": "Trigger allowed ✔" if decision.get("allowed") else f"Trigger prevented: {', '.join(decision.get('reasons', []))} ⛔"}

@router.get("/api/pipeline/mode")
async def get_pipeline_mode():
    return {
        "status": "success", "pipeline_mode": ocr_svc.active_pipeline_mode, "mode": ocr_svc.active_pipeline_mode,
        "model_target": ocr_svc.active_model_target, "ocr_engine": ocr_svc.active_ocr_engine, "engine": ocr_svc.active_ocr_engine,
        "gemini_available": bool(config.GEMINI_API_KEY), "ollama_url": config.OLLAMA_URL,
        "ollama_vision_model": config.OLLAMA_VISION_MODEL, "ollama_coder_model": config.OLLAMA_CODER_MODEL, "ollama_model": config.OLLAMA_MODEL
    }

@router.post("/api/pipeline/mode")
async def set_pipeline_mode(req: PipelineModeRequest):
    m = req.mode.strip().lower()
    if m not in {"cloud", "local"}: raise HTTPException(status_code=400, detail="Invalid pipeline mode. Must be 'cloud' or 'local'.")
    ocr_svc.active_pipeline_mode = m
    if m == "local": ocr_svc.active_model_target, ocr_svc.active_ocr_engine = "ollama", "local"
    else: ocr_svc.active_model_target, ocr_svc.active_ocr_engine = "gemini", "auto"
    payload = {"type": "pipeline_mode_changed", "pipeline_mode": ocr_svc.active_pipeline_mode, "mode": ocr_svc.active_pipeline_mode, "model_target": ocr_svc.active_model_target, "ocr_engine": ocr_svc.active_ocr_engine, "engine": ocr_svc.active_ocr_engine}
    await state.ws_manager.broadcast(payload)
    return {"status": "success", **payload}

@router.get("/api/ocr/engines")
async def get_ocr_engines():
    has_gemini = bool(config.GEMINI_API_KEY)
    return {
        "engines": [
            {"id": "auto", "name": "Auto (Gemini with Local Fallback)", "available": True, "type": "auto"},
            {"id": "local", "name": "Local RapidOCR / OpenCV Engine", "available": True, "type": "local"},
            {"id": "gemini", "name": "Gemini 2.5 Cloud Vision", "available": has_gemini, "type": "cloud"},
            {"id": "hybrid", "name": "Hybrid (Gemini Text + Local Bounding Boxes)", "available": has_gemini, "type": "hybrid"}
        ],
        "active_engine": ocr_svc.active_ocr_engine, "model_targets": ["gemini", "ollama"],
        "active_model_target": ocr_svc.active_model_target, "pipeline_mode": ocr_svc.active_pipeline_mode
    }

@router.post("/api/ocr/select-engine")
async def select_ocr_engine(req: OcrSelectionRequest):
    if req.model_target: ocr_svc.active_model_target = ocr_svc.normalize_model_target(req.model_target)
    if req.engine:
        if req.engine.lower() not in {"auto", "local", "gemini", "hybrid"}: raise HTTPException(status_code=400, detail=f"Invalid engine '{req.engine}'.")
        ocr_svc.active_ocr_engine = req.engine.lower()
    await state.ws_manager.broadcast({"type": "ocr_engine_changed", "active_engine": ocr_svc.active_ocr_engine, "active_model_target": ocr_svc.active_model_target})
    return {"status": "success", "active_engine": ocr_svc.active_ocr_engine, "active_model_target": ocr_svc.active_model_target}

@router.post("/api/ocr/scan-direct")
async def scan_direct(request: Request, file: UploadFile = File(...), engine: Optional[str] = Form("auto"), model_target: Optional[str] = Form(None), pipeline_mode: Optional[str] = Form(None)):
    contents = await file.read()
    temp_path = state.FRAMES_DIR / f"temp_scan_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
    pm = pipeline_mode or request.query_params.get("pipeline_mode") or ocr_svc.active_pipeline_mode
    mt = ocr_svc.normalize_model_target(model_target or ("ollama" if pm == "local" else ocr_svc.active_model_target) or request.query_params.get("model_target"))
    try:
        with open(temp_path, "wb") as f: f.write(contents)
        return {"status": "success", "engine": engine or ocr_svc.active_ocr_engine, "model_target": mt, "pipeline_mode": pm, **state.ocr_engine.scan_image(str(temp_path))}
    finally:
        if temp_path.exists(): temp_path.unlink()
