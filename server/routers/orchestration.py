import asyncio
import time
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel

import hashlib
import re
import subprocess
import config, db
from models import TelemetryUpdateRequest, OrchestrationRequest, PipelineModeRequest, OcrSelectionRequest
from services import state
from services.adb_service import (
    ensure_adb_keyboard_closed, auto_fix_viewport, check_and_update_alignment, DEVICE_PROFILES, current_device_model,
    get_active_adb_serial, send_hid_keycombination, capture_external_screenshot, run_adb_shell, detect_external_display_id,
    detect_surfaceflinger_displays, is_ime_visible, fetch_current_display_dpi_factor
)
import services.ocr_service as ocr_svc

router = APIRouter(tags=["Orchestration & Telemetry"])

from services.ui_automator_service import enable_edit_mode, select_dark_mode
from services.visual_state_service import assert_markdown_open, run_editor_recovery_node

try:
    from server.classifiers import (
        classifier_registry,
        create_classifier_context,
        Line1StuckClassifier,
        EditorCursorFocusedClassifier,
        EditModeClassifier,
        LightModeClassifier,
        KeyboardOpenClassifier,
        ClassifierContext,
    )
except ImportError:
    from classifiers import (
        classifier_registry,
        create_classifier_context,
        Line1StuckClassifier,
        EditorCursorFocusedClassifier,
        EditModeClassifier,
        LightModeClassifier,
        KeyboardOpenClassifier,
        ClassifierContext,
    )


async def evaluate_node_5_decision(serial: Optional[str] = None, image_bytes: Optional[bytes] = None):
    try:
        import importlib
        from services import adb_service
        try:
            from ..classifiers import editor_classifiers
        except ImportError:
            from classifiers import editor_classifiers
        importlib.reload(adb_service)
        importlib.reload(editor_classifiers)
        classifier_registry.register(editor_classifiers.KeyboardOpenClassifier())

        # Proactively ensure soft keyboard is suppressed before qualifier evaluation
        active_serial = await get_active_adb_serial(serial)
        if active_serial and await is_ime_visible(active_serial):
            await ensure_adb_keyboard_closed(active_serial)

        cfg = state.dag_state["nodes"].get("verification_trigger", {}).get("config", {})
        qualifiers_cfg = cfg.get("qualifiers", {})
        target_ids = [k for k, v in qualifiers_cfg.items() if v.get("enabled", True)] if qualifiers_cfg else None
        ctx = await create_classifier_context(serial, image_bytes=image_bytes)
        await classifier_registry.evaluate_all(ctx, target_ids=target_ids)
        issues = classifier_registry.get_latest_issues()
        state.latest_telemetry["classifier_issues"] = issues
        return state.evaluate_dag_node_5_trigger_sync(issues)
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
        await auto_fix_viewport()
        state.orchestration_state.update({"active_step": "CALIBRATING", "step_label": f"Instant Calibration by {invoker}"})
        state.latest_telemetry.update({"status_message": f"Instant Calibration (Ctrl+End / Ctrl+Home) • Invoked by {invoker}"})
    elif cmd in ("ADVANCE_PAGE_ARROW", "PAGE_DOWN_ARROW"):
        await auto_fix_viewport()
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
        "active_node": state.dag_state.get("current_active_node"),
        "node_5_config": node_5.get("config", {}), "trigger_decision": node_5.get("trigger_decision", {})
    }

NODE_ALIAS_MAP = {
    "node_1": "init_end", "node_1_end": "init_end", "init_end": "init_end",
    "node_2": "reset_home", "node_2_home": "reset_home", "reset_home": "reset_home",
    "node_3": "frame_acquire", "frame_acquire": "frame_acquire", "frame_capture": "frame_acquire", "capture": "frame_acquire",
    "node_4": "local_ai_ocr", "node_3b": "local_ai_ocr", "node_3_5": "local_ai_ocr", "local_ai_ocr": "local_ai_ocr", "ai_ocr": "local_ai_ocr", "local_ocr": "local_ai_ocr", "minicpm": "local_ai_ocr",
    "node_5": "frame_ocr", "frame_ocr": "frame_ocr", "ocr": "frame_ocr", "frame_ocr_extract": "frame_ocr",
    "node_6": "arrow_down", "arrow_down": "arrow_down", "navigation": "arrow_down",
    "node_7": "verification_trigger", "verification_trigger": "verification_trigger", "verify": "verification_trigger",
    "node_8": "document_assemble", "document_assemble": "document_assemble", "assemble": "document_assemble", "markdown_assemble": "document_assemble"
}

@router.get("/api/dag/nodes/{node_id}/config")
async def get_dag_node_config(node_id: str):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node: raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    return {"status": "success", "node_id": target_key, "title": node.get("title", ""), "config": node.get("config", {}), "status_code": node.get("status", "idle"), "trigger_decision": node.get("trigger_decision", {}) if target_key == "verification_trigger" else None}

@router.get("/api/dag/nodes/{node_id}/root-cause")
async def get_dag_node_root_cause(node_id: str):
    from services.performance_analyzer import analyze_node_performance, generate_ai_resolution_prompt
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    analysis = analyze_node_performance(target_key, state.dag_state, state.latest_telemetry)
    prompt = generate_ai_resolution_prompt(analysis, state.dag_state, state.latest_telemetry)
    analysis["markdown_prompt"] = prompt
    return {"status": "success", **analysis}

@router.get("/api/dag/performance/prompt")
async def get_dag_performance_prompt(node_id: Optional[str] = None):
    from services.performance_analyzer import analyze_node_performance, generate_ai_resolution_prompt
    target_key = NODE_ALIAS_MAP.get(node_id, node_id) if node_id else (state.dag_state.get("current_active_node") or "init_end")
    analysis = analyze_node_performance(target_key, state.dag_state, state.latest_telemetry)
    prompt = generate_ai_resolution_prompt(analysis, state.dag_state, state.latest_telemetry)
    return {
        "status": "success",
        "node_id": target_key,
        "category": analysis.get("category"),
        "title": analysis.get("title"),
        "severity": analysis.get("severity"),
        "markdown_prompt": prompt
    }

@router.post("/api/dag/nodes/{node_id}/config")
async def update_dag_node_config(node_id: str, payload: Dict[str, Any]):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node: raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    cfg = node.setdefault("config", {})

    # Backward compatibility redirect if a client calls node_5 with trigger qualifiers
    if target_key == "arrow_down" and ("prevent_trigger_on_issue" in payload or "qualifiers" in payload):
        target_key = "verification_trigger"
        node = state.dag_state["nodes"].get(target_key)
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

# ─── SINGLE-NODE CONCURRENCY & PREEMPTION MANAGER ─────────────────────────
_current_running_node_task: Optional[asyncio.Task] = None
_current_running_node_id: Optional[str] = None

async def abort_running_node(target_node_id: Optional[str] = None, reason: str = "Operation aborted") -> Optional[str]:
    global _current_running_node_task, _current_running_node_id, capture_loop_task
    aborted_node = None
    curr_task = asyncio.current_task()

    # Cancel background capture loop if running externally
    if getattr(state, "capture_loop_running", False):
        state.capture_loop_running = False
        state.latest_telemetry["is_pacing"] = False
        if capture_loop_task and capture_loop_task is not curr_task and not capture_loop_task.done():
            capture_loop_task.cancel()

    task_to_cancel = _current_running_node_task
    if task_to_cancel and task_to_cancel is not curr_task and not task_to_cancel.done():
        running_id = _current_running_node_id
        if target_node_id is None or target_node_id == running_id:
            aborted_node = running_id
            print(f"[DAG Concurrency] Aborting active node '{running_id}' (Reason: {reason})")
            task_to_cancel.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task_to_cancel), timeout=0.15)
            except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                pass
            _current_running_node_task = None
            _current_running_node_id = None

    now_str = datetime.now().strftime("%H:%M:%S")
    for nid, nval in state.dag_state.get("nodes", {}).items():
        if target_node_id is None or nid == target_node_id or nid == aborted_node:
            if nval.get("status") == "active" or nval.get("is_active"):
                nval["status"] = "aborted"
                nval["is_active"] = False
                nval["error"] = reason
                nval["finished_at"] = now_str
                aborted_node = aborted_node or nid
        elif nval.get("status") == "active" or nval.get("is_active"):
            nval["status"] = "aborted"
            nval["is_active"] = False
            nval["error"] = reason
            nval["finished_at"] = now_str
            aborted_node = aborted_node or nid

    if state.dag_state.get("current_active_node") == aborted_node:
        state.dag_state["current_active_node"] = None

    if aborted_node:
        await state.ws_manager.broadcast({
            "type": "dag_node_aborted",
            "node_id": aborted_node,
            "reason": reason,
            "dag": state.dag_state,
            "telemetry": state.latest_telemetry
        })

    return aborted_node


async def auto_heal_pipeline_environment(
    serial: str,
    disp_id: int,
    node_id: str,
    snap_bytes: Optional[bytes] = None
) -> Dict[str, Any]:
    """
    Evaluates environmental pipeline triggers to ensure continuous flow and autonomous self-healing:
      - Keyboard open: auto-dismisses virtual keyboard and restores full 1080p layout.
      - Edit mode inactive (pencil not selected or split-screen active): touches pencil icon via UI Automator.
      - Light mode active: selects Dark Mode from theme pull-down menu.
      - Teams backgrounded or in file list: recovers editor preview window.
    Streams evaluator determination and live healing steps over WebSocket.
    """
    t_h_start = time.perf_counter()
    actions_taken: List[str] = []
    issues_observed: List[str] = []
    node = state.dag_state["nodes"].get(node_id, {})

    # 1. Keyboard trigger check & fix
    try:
        if await is_ime_visible(serial):
            issues_observed.append("On-screen soft keyboard is open")
            node.update({
                "evaluator": "Soft Keyboard Evaluator",
                "healing_step": "Dismissing on-screen keyboard",
                "telemetry_insight": "Soft keyboard detected covering document pane • Auto-dismissing IME..."
            })
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
            await ensure_adb_keyboard_closed(serial)
            await auto_fix_viewport(serial, disp_id)
            await asyncio.sleep(0.15)
            actions_taken.append("Suppressed on-screen keyboard policy")
    except Exception as ke:
        print(f"[auto_heal] Keyboard check note: {ke}")

    # 2. Frame check for edit mode & dark mode
    snap = snap_bytes
    if not snap:
        try:
            snap = await capture_external_screenshot(serial, max_cache_age_s=0.3)
        except Exception:
            snap = None

    if snap and len(snap) > 2000:
        c_ctx = ClassifierContext(serial=serial, display_id=disp_id, image_bytes=snap)

        # Check Edit Mode (pencil icon / split-screen duplication)
        try:
            edit_clf = EditModeClassifier()
            edit_res = await edit_clf.detect(c_ctx)
            if edit_res.issue_detected:
                issues_observed.append(edit_res.details or "Editor not in single-pane edit mode")
                node.update({
                    "evaluator": "Editor Mode Evaluator",
                    "healing_step": "Tapping pencil to enter edit mode",
                    "telemetry_insight": "Split screen / read-only preview detected • Tapping pencil to enter edit mode..."
                })
                await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
                fix_edit = await enable_edit_mode(serial=serial, display_id=disp_id)
                actions_taken.extend(fix_edit.get("actions", ["Tapped pencil icon"]))
                # Refresh snapshot after edit mode change
                snap = await capture_external_screenshot(serial, max_cache_age_s=0.0)
                if snap:
                    c_ctx.image_bytes = snap
                    c_ctx.image_cv = None
        except Exception as ee:
            print(f"[auto_heal] Edit mode check note: {ee}")

        # Check Dark Mode (theme pull-down)
        try:
            light_clf = LightModeClassifier()
            light_res = await light_clf.detect(c_ctx)
            if light_res.issue_detected:
                issues_observed.append(light_res.details or "Light mode is active (screen washed out)")
                node.update({
                    "evaluator": "Theme Luminance Evaluator",
                    "healing_step": "Selecting dark mode from pull-down",
                    "telemetry_insight": f"High luminance ({light_res.metadata.get('mean_luminance')}) • Selecting Dark Mode from pull-down..."
                })
                await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
                fix_dm = await select_dark_mode(serial=serial, display_id=disp_id)
                actions_taken.extend(fix_dm.get("actions", ["Switched to Dark Mode"]))
        except Exception as le:
            print(f"[auto_heal] Dark mode check note: {le}")

    dur_h_ms = max(0, int((time.perf_counter() - t_h_start) * 1000))
    return {
        "healed": len(actions_taken) > 0,
        "actions_taken": actions_taken,
        "issues_observed": issues_observed,
        "duration_ms": dur_h_ms
    }


async def recover_gutter_bounds_with_healing(
    serial: str,
    disp_id: int,
    temp_calib: Path,
    dpi_factor: float,
    node_id: str,
    expected_top: Optional[int] = None,
    max_attempts: int = 3
) -> Tuple[int, int, List[Dict[str, Any]], Dict[str, Any]]:
    """
    Self-resolves line number extraction issues when a screenshot does not contain
    the first and last line numbers correctly:
      1. Stage 1: Auto-dismisses keyboard and re-acquires fresh frame with auto-fix viewport reflow.
      2. Stage 2: Refocuses editor text caret with EditorCursorFocusedClassifier & runs multi-scale OCR.
      3. Stage 3: Restores FilePreviewActivity window via visual state recovery.
    In the event an issue arises without a determined fix after all healing attempts, raises an exception
    with full DAG context detail and key trace insights.
    """
    actions_taken: List[str] = []
    issues_observed: List[str] = []
    node = state.dag_state["nodes"].get(node_id, {})

    top_ln, bot_ln = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
    lines_detected: List[Dict[str, Any]] = []

    if top_ln > 0 and bot_ln > top_ln:
        return top_ln, bot_ln, [], {"healing_attempts": 0, "actions_taken": []}

    for attempt in range(1, max_attempts + 1):
        issues_observed.append(f"Attempt {attempt}: Gutter bounds unreadable or inverted (top={top_ln}, bottom={bot_ln})")

        # Healing Stage 1: Auto-dismiss keyboard and re-acquire hardware screenshot
        node.update({
            "evaluator": "Gutter Line Continuity Evaluator",
            "healing_step": "Refreshing page capture",
            "telemetry_insight": f"Gutter line numbers unreadable (top: {top_ln}, bottom: {bot_ln}) • Dismissing soft keyboard & re-capturing display..."
        })
        await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
        await ensure_adb_keyboard_closed(serial)
        await auto_fix_viewport(serial, disp_id)
        await asyncio.sleep(0.15)

        snap = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
        if snap:
            with open(temp_calib, "wb") as f:
                f.write(snap)
            top_ln, bot_ln = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
            if top_ln > 0 and bot_ln > top_ln:
                act = f"Attempt {attempt}: Restored gutter bounds (Ln {top_ln}→{bot_ln}) via keyboard suppression & fresh capture"
                actions_taken.append(act)
                return top_ln, bot_ln, [], {"healing_attempts": attempt, "actions_taken": actions_taken}

        # Healing Stage 2: Refocus editor cursor & run multi-scale full OCR pass
        node.update({
            "evaluator": "Gutter Line Continuity Evaluator",
            "healing_step": "Refocusing editor cursor",
            "telemetry_insight": f"Attempt {attempt}: Refocusing editor cursor & re-running multi-scale OCR pass..."
        })
        await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
        try:
            c_ctx = ClassifierContext(serial=serial, display_id=disp_id)
            cursor_clf = EditorCursorFocusedClassifier()
            await cursor_clf.fix(c_ctx)
            await asyncio.sleep(0.2)
        except Exception as fe:
            print(f"[recover_gutter_bounds] Caret refocus note: {fe}")

        snap2 = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
        if snap2:
            with open(temp_calib, "wb") as f:
                f.write(snap2)
            scan_res = await state.scan_image_in_process(temp_calib)
            lines = scan_res.get("lines", [])
            if lines:
                top_cand = min(l.get("line_number", 999999) for l in lines)
                bot_cand = max(l.get("line_number", 0) for l in lines)
                if 0 < top_cand < bot_cand:
                    top_ln, bot_ln = top_cand, bot_cand
                    lines_detected = lines
                    act = f"Attempt {attempt}: Restored bounds (Ln {top_cand}→{bot_cand}) via cursor refocus & full OCR"
                    actions_taken.append(act)
                    return top_ln, bot_ln, lines_detected, {"healing_attempts": attempt, "actions_taken": actions_taken}

        # Healing Stage 3: Window / Viewport Recovery (FilePreviewActivity)
        node.update({
            "evaluator": "Editor Visibility Evaluator",
            "healing_step": "Restoring Teams FilePreviewActivity",
            "telemetry_insight": f"Attempt {attempt}: Re-activating FilePreviewActivity on display {disp_id}..."
        })
        await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
        try:
            await run_editor_recovery_node(serial, disp_id)
            await auto_fix_viewport(serial, disp_id)
            await asyncio.sleep(0.3)
            snap3 = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if snap3:
                with open(temp_calib, "wb") as f:
                    f.write(snap3)
                top_ln, bot_ln = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
                if top_ln > 0 and bot_ln > top_ln:
                    act = f"Attempt {attempt}: Restored bounds (Ln {top_ln}→{bot_ln}) via FilePreviewActivity recovery"
                    actions_taken.append(act)
                    return top_ln, bot_ln, [], {"healing_attempts": attempt, "actions_taken": actions_taken}
        except Exception as re_err:
            print(f"[recover_gutter_bounds] Window recovery note: {re_err}")

    # Fallback to expected top line projection if close enough to continue pipeline flow
    if expected_top and expected_top > 0 and (top_ln <= 0 or bot_ln <= top_ln):
        lpp = 31
        proj_top = expected_top
        proj_bot = proj_top + lpp - 1
        actions_taken.append(f"Auto-resolved gutter bounds using continuous pacer projection (Ln {proj_top}→{proj_bot})")
        return proj_top, proj_bot, [], {"healing_attempts": max_attempts, "actions_taken": actions_taken, "projected": True}

    # All self-healing attempts exhausted without a determined fix: raise structured exception with DAG context detail
    dag_context = {
        "node_id": node_id,
        "project_id": state.get_current_project_id(),
        "display_id": disp_id,
        "serial": serial,
        "dpi_factor": round(dpi_factor, 3),
        "expected_top": expected_top,
        "last_evaluated_top": top_ln,
        "last_evaluated_bottom": bot_ln,
        "healing_attempts": max_attempts,
        "actions_taken": actions_taken,
        "issues_observed": issues_observed,
        "screenshot_path": str(temp_calib),
        "screenshot_bytes": temp_calib.stat().st_size if temp_calib.exists() else 0,
        "timestamp": datetime.now().isoformat()
    }
    trace_insights = [
        f"Screenshot path: '{temp_calib}'",
        f"Window focus: adb -s {serial} shell dumpsys window | grep -E 'mFocusedApp'",
        f"Display density: adb -s {serial} shell wm density",
        f"IME visibility: adb -s {serial} shell dumpsys input_method | grep -i mInputShown",
        f"OCR diagnostic check: python -c \"from ocr_engine import fast_detect_gutter_bounds; import cv2; print(fast_detect_gutter_bounds(cv2.imread(r'{temp_calib}')))\"",
        "Verify external display is powered on and Teams FilePreviewActivity is foregrounded."
    ]
    node.update({
        "status": "error",
        "evaluator": "Gutter Line Continuity Evaluator",
        "healing_step": None,
        "telemetry_insight": f"Gutter line numbers unreadable after {max_attempts} healing attempts • See trace insights",
        "error": f"Screenshot does not contain readable first and last line numbers (evaluated: top={top_ln}, bottom={bot_ln}).",
        "dag_context": dag_context,
        "trace_insights": trace_insights,
        "troubleshooting_steps": trace_insights
    })
    await state.ws_manager.broadcast({
        "type": "dag_updated",
        "dag": state.dag_state,
        "node_id": node_id,
        "error": node["error"],
        "dag_context": dag_context,
        "trace_insights": trace_insights,
        "telemetry": state.latest_telemetry
    })
    raise HTTPException(
        status_code=500,
        detail={
            "message": f"DAG Node '{node_id}' failed: Screenshot does not contain valid first and last line numbers after {max_attempts} self-healing attempts.",
            "dag_context": dag_context,
            "trace_insights": trace_insights
        }
    )


@router.post("/api/dag/nodes/{node_id}/run")
async def run_single_dag_node(node_id: str, payload: Optional[Dict[str, Any]] = None):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node: raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")

    payload = payload or {}
    active_serial = await get_active_adb_serial(payload.get("serial"))
    cfg = node.get("config", {})

    global _current_running_node_task, _current_running_node_id
    curr_task = asyncio.current_task()

    # If any other node is currently running, ABORT IT IMMEDIATELY
    if _current_running_node_task and _current_running_node_task is not curr_task and not _current_running_node_task.done():
        prev_id = _current_running_node_id or "previous"
        await abort_running_node(reason=f"Operation aborted: Preempted by Node {target_key}")

    # Enforce strictly 1 running node at a time across DAG state
    for k, v in state.dag_state.get("nodes", {}).items():
        if k != target_key:
            v["is_active"] = False
            if v.get("status") == "active":
                v["status"] = "aborted"
                v["error"] = f"Preempted by Node {target_key}"

    start_time = datetime.now()
    t_start = time.perf_counter()
    started_at_str = start_time.strftime("%H:%M:%S")
    node["started_at"] = started_at_str
    node["started_at_iso"] = start_time.isoformat()
    node["finished_at"] = None
    node["duration_ms"] = None
    node["is_active"] = True
    node["status"] = "active"
    node["error"] = None
    node["dag_context"] = None
    node["trace_insights"] = None

    state.dag_state["current_active_node"] = target_key
    _current_running_node_task = curr_task
    _current_running_node_id = target_key

    await state.ws_manager.broadcast({
        "type": "dag_updated",
        "dag": state.dag_state,
        "running_node": target_key,
        "node_id": target_key,
        "is_active": True,
        "started_at": started_at_str
    })

    precheck_ms = 0
    healing_ms = 0

    try:
        disp_id = await detect_external_display_id(active_serial)

        # Proactively heal environment triggers before executing node action
        if not payload.get("skip_env_heal"):
            t_pre_0 = time.perf_counter()
            heal_env = await auto_heal_pipeline_environment(active_serial, disp_id, target_key)
            precheck_ms = max(0, int((time.perf_counter() - t_pre_0) * 1000))
            healing_ms += heal_env.get("duration_ms", 0)

        if target_key == "init_end":
            cursor_clf = EditorCursorFocusedClassifier()
            c_ctx = ClassifierContext(serial=active_serial, display_id=disp_id)
            node.update({
                "evaluator": "Editor Cursor Evaluator",
                "healing_step": "Refocusing editor cursor",
                "telemetry_insight": "Verifying text body focus and caret presence on external display..."
            })
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "init_end"})

            if not payload.get("skip_precheck"):
                try:
                    c_res = await cursor_clf.detect(c_ctx)
                    if c_res.issue_detected:
                        await cursor_clf.fix(c_ctx)
                        await asyncio.sleep(0.2)
                except Exception as ce:
                    print(f"[init_end] Cursor classifier check note: {ce}")
            await ensure_adb_keyboard_closed(active_serial)

            node.update({
                "evaluator": "EOF Navigation Evaluator",
                "healing_step": "Dispatching Ctrl+End",
                "telemetry_insight": "Sending Ctrl+End keystroke to jump to document end..."
            })
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "init_end"})

            # 1. Send Ctrl+End with focus
            await send_hid_keycombination(int(cfg.get("key1", 113)), int(cfg.get("key2", 123)), active_serial)
            settle_s = float(cfg.get("settle_delay_ms", 300)) / 1000.0
            await asyncio.sleep(settle_s)

            # 2. Fetch current density/DPI from the phone right before running OCR to normalize gutter search bounding boxes
            dpi_factor, active_dpi = await fetch_current_display_dpi_factor(active_serial, disp_id)
            state.latest_telemetry.setdefault("capture_telemetry", {})
            state.latest_telemetry["capture_telemetry"].update({"active_dpi": active_dpi, "dpi_factor": dpi_factor})

            # Wait for scroll convergence: sample bottom line until scroll velocity stops
            total_lines = 0
            top_line = 0
            prev_bot = -1
            stable_count = 0
            calib = state.FRAMES_DIR / "dag_node1_end.png"

            for sample_idx in range(6):
                node.update({
                    "evaluator": "Scroll Convergence Evaluator",
                    "healing_step": "Refreshing page capture",
                    "telemetry_insight": f"Sampling gutter bounds (bottom: Ln {total_lines or 'detecting'})..."
                })
                await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "init_end"})
                snap = await capture_external_screenshot(active_serial)
                if snap:
                    with open(calib, "wb") as f: f.write(snap)
                    t_sample, b_sample = await state.detect_gutter_bounds_in_process(calib, dpi_factor=dpi_factor)
                    if b_sample <= 0:
                        scan_res = await state.scan_image_in_process(calib)
                        b_sample = scan_res.get("bottom_line", 0)
                        if t_sample <= 0: t_sample = scan_res.get("top_line", 0)

                    if b_sample > total_lines:
                        total_lines = b_sample
                    if t_sample > top_line:
                        top_line = t_sample

                    # When the bottom line stops increasing and stays stable, the scroll has fully landed at EOF!
                    if b_sample > 0 and b_sample == prev_bot:
                        stable_count += 1
                        if stable_count >= 1:
                            break
                    else:
                        stable_count = 0
                        prev_bot = b_sample

                await asyncio.sleep(0.35)

            # 3. Auto-fix viewport immediately after scroll has fully landed: close soft keyboard and reflow desktop layout
            node.update({
                "evaluator": "Viewport Reflow Evaluator",
                "healing_step": "Refreshing page capture",
                "telemetry_insight": "Suppressing soft keyboard & reflowing desktop viewport..."
            })
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "init_end"})
            await auto_fix_viewport(active_serial, disp_id)
            await asyncio.sleep(0.2)
            # Re-read gutter after auto-fix to capture any newly revealed bottom lines in full height
            snap_fixed = await capture_external_screenshot(active_serial)
            if snap_fixed:
                with open(calib, "wb") as f: f.write(snap_fixed)
                t_fix, b_fix = await state.detect_gutter_bounds_in_process(calib, dpi_factor=dpi_factor)
                if b_fix > total_lines: total_lines = b_fix
                if t_fix > 0 and top_line <= 0: top_line = t_fix

            # Evaluate whether editor is still displaying line 1 (keystroke dropped or focus lost)
            is_stuck_on_line_1 = False
            if 0 < top_line <= 5:
                is_stuck_on_line_1 = True
            elif top_line <= 12 and total_lines <= 65:
                # At lower DPI (120 DPI), if top is 1..12 and total on screen is <= 65, editor is still on page 1
                is_stuck_on_line_1 = True
            elif top_line == 0 and total_lines <= 50:
                try:
                    l1_clf = Line1StuckClassifier()
                    clf_ctx = ClassifierContext(serial=active_serial, display_id=disp_id, image_bytes=snap_fixed or snap)
                    clf_res = await l1_clf.detect(clf_ctx)
                    if clf_res.issue_detected:
                        is_stuck_on_line_1 = True
                except Exception as ce:
                    print(f"[init_end] Line1StuckClassifier evaluation error: {ce}")

            # If initial attempt left page on Line 1, dynamically adjust on the fly: refocus & retry Ctrl+End
            if is_stuck_on_line_1:
                node.update({
                    "evaluator": "Line 1 Stuck Evaluator",
                    "healing_step": "Refreshing page capture",
                    "telemetry_insight": f"Gutter on Ln {top_line or 1} • Refocusing cursor & retrying EOF jump..."
                })
                await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "init_end"})
                try:
                    await ensure_adb_keyboard_closed(active_serial)
                    await cursor_clf.fix(c_ctx)
                    await ensure_adb_keyboard_closed(active_serial)
                    await asyncio.sleep(0.2)
                    await send_hid_keycombination(113, 123, active_serial)
                    await run_adb_shell(f"input -d {disp_id} keyevent 113 123", active_serial)
                    await asyncio.sleep(0.6)
                    node.update({
                        "evaluator": "Scroll Convergence Evaluator",
                        "healing_step": "Refreshing page capture",
                        "telemetry_insight": "Refreshing page capture after retry EOF jump..."
                    })
                    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "init_end"})
                    snap_retry = await capture_external_screenshot(active_serial)
                    if snap_retry:
                        calib = state.FRAMES_DIR / "dag_node1_end.png"
                        with open(calib, "wb") as f: f.write(snap_retry)
                        r_top, r_total = await state.detect_gutter_bounds_in_process(calib, dpi_factor=dpi_factor)
                        if r_total <= 0:
                            scan_res = await state.scan_image_in_process(calib)
                            r_total = scan_res.get("bottom_line", 0)
                            if r_top <= 0: r_top = scan_res.get("top_line", 0)
                        if r_total > total_lines: total_lines = r_total
                        if r_top > 0: top_line = r_top

                        if top_line > 12 or total_lines > 65:
                            is_stuck_on_line_1 = False
                            snap = snap_retry
                        elif 0 < top_line <= 5 or (0 < total_lines <= 65):
                            is_stuck_on_line_1 = True
                        else:
                            is_stuck_on_line_1 = False
                except Exception as re_err:
                    print(f"[init_end] Dynamic EOF adjustment error: {re_err}")

            troubleshooting_steps = [
                {
                    "step": 1,
                    "title": "Verify Editor Focus & Blinking Cursor",
                    "description": "Click or tap directly inside the document text body on the external desktop screen (Pixel 8 / Pixel 10). Confirm that a blinking vertical line (|) appears next to the markdown text.",
                    "action": "focus_editor",
                    "action_label": "Focus Editor"
                },
                {
                    "step": 2,
                    "title": "Ensure Virtual Keyboard is Closed",
                    "description": "Check if an on-screen soft keyboard popped up. If visible, close it so hardware key combinations reach the Teams WebView directly instead of being intercepted.",
                    "action": "close_ime",
                    "action_label": "Hide Keyboard"
                },
                {
                    "step": 3,
                    "title": "Confirm Desktop Window & Display Focus",
                    "description": "Ensure the Teams editor window is active on the external desktop display (Display 8 on Pixel 10, Display 4/External on Pixel 8) and not minimized or behind another window.",
                    "action": "check_display",
                    "action_label": "Verify Display"
                },
                {
                    "step": 4,
                    "title": "Manual Navigation / Fallback",
                    "description": "Press Ctrl + End on an attached hardware keyboard, scroll down to the bottom in the preview, or enter the known total lines in the DAG Node 1 configuration.",
                    "action": "manual_override",
                    "action_label": "Manual Override"
                }
            ]

            if is_stuck_on_line_1:
                # HARD FAILURE: Ctrl+End did not navigate away from page 1!
                error_msg = f"EOF Navigation Failed: Editor still displays Line {top_line or 1} at top (bottom line: {total_lines}). Ctrl+End did not navigate to the end of the file."
                node["dag_context"] = {
                    "node_id": "init_end",
                    "project_id": state.get_current_project_id(),
                    "display_id": disp_id,
                    "serial": active_serial,
                    "top_line_detected": top_line,
                    "bottom_line_detected": total_lines,
                    "dpi_factor": dpi_factor,
                    "active_dpi": active_dpi,
                    "timestamp": datetime.now().isoformat()
                }
                node["trace_insights"] = [
                    f"EOF Navigation Failed: Editor remained at Line {top_line or 1} after Ctrl+End keystrokes.",
                    f"Verify external display focus: adb -s {active_serial} shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'",
                    f"Check whether keyboard intercepted keyevents: adb -s {active_serial} shell dumpsys input_method | grep -i mInputShown",
                    f"Test direct HID scancode emission: adb -s {active_serial} shell input -d {disp_id} keyevent 113 123",
                    f"Inspect frame screenshot at: {calib.resolve()}"
                ]
                node.update({
                    "status": "error",
                    "total_lines": total_lines,
                    "top_line": top_line,
                    "evaluator": "Line 1 Stuck Evaluator",
                    "healing_step": None,
                    "telemetry_insight": f"Gutter stuck on Line {top_line or 1} after healing attempts ⛔",
                    "error": error_msg,
                    "troubleshooting_steps": troubleshooting_steps
                })
                state.latest_telemetry["status_message"] = f"DAG Node 1: Page stuck on Line {top_line or 1} ⛔"
                await state.ws_manager.broadcast({
                    "type": "dag_updated",
                    "dag": state.dag_state,
                    "node_id": "init_end",
                    "status": "error",
                    "total_lines": total_lines,
                    "top_line": top_line,
                    "error": error_msg,
                    "dag_context": node["dag_context"],
                    "trace_insights": node["trace_insights"],
                    "troubleshooting_steps": troubleshooting_steps,
                    "telemetry": state.latest_telemetry
                })
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": error_msg,
                        "dag_context": node["dag_context"],
                        "trace_insights": node["trace_insights"],
                        "troubleshooting_steps": troubleshooting_steps
                    }
                )

            if total_lines <= 0 and cfg.get("manual_total_lines", 0) > 0:
                total_lines = int(cfg["manual_total_lines"])

            if total_lines <= 0:
                error_msg = "Ctrl+End sent, but could not detect EOF last line in gutter after all healing stages."
                node["dag_context"] = {
                    "node_id": "init_end",
                    "project_id": state.get_current_project_id(),
                    "display_id": disp_id,
                    "serial": active_serial,
                    "top_line_detected": top_line,
                    "bottom_line_detected": total_lines,
                    "dpi_factor": dpi_factor,
                    "active_dpi": active_dpi,
                    "timestamp": datetime.now().isoformat()
                }
                node["trace_insights"] = [
                    "EOF Gutter OCR was unable to extract any valid line numbers at document end.",
                    f"Check external display resolution/density: adb -s {active_serial} shell wm density",
                    f"Verify screen content on display {disp_id}: adb -s {active_serial} shell screencap -d {disp_id} -p /sdcard/eof_check.png",
                    f"Inspect frame saved at: {calib.resolve()}"
                ]
                node.update({
                    "status": "error",
                    "total_lines": 0,
                    "top_line": top_line,
                    "evaluator": "EOF Gutter Evaluator",
                    "healing_step": None,
                    "telemetry_insight": "Gutter unreadable at EOF ⛔",
                    "error": error_msg
                })
                await state.ws_manager.broadcast({
                    "type": "dag_updated",
                    "dag": state.dag_state,
                    "node_id": "init_end",
                    "status": "error",
                    "dag_context": node["dag_context"],
                    "trace_insights": node["trace_insights"],
                    "error": error_msg,
                    "telemetry": state.latest_telemetry
                })
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": error_msg,
                        "dag_context": node["dag_context"],
                        "trace_insights": node["trace_insights"]
                    }
                )

            if proj := db.get_active_project(): db.update_project_target_lines(proj["id"], total_lines)
            state.latest_telemetry["target_total_lines"] = total_lines
            state.latest_telemetry["status_message"] = f"DAG Node 1: Total lines calibrated to {total_lines} via Ctrl+End"

            node.update({
                "status": "completed",
                "total_lines": total_lines,
                "top_line": top_line,
                "evaluator": "EOF Gutter Evaluator",
                "healing_step": None,
                "telemetry_insight": f"Calibrated {total_lines:,} total lines at EOF ✔",
                "error": None
            })
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "init_end", "total_lines": total_lines, "telemetry": state.latest_telemetry})
            return {
                "status": "success",
                "node_id": "init_end",
                "total_lines": total_lines,
                "top_line": top_line,
                "message": f"Successfully detected {total_lines} total lines at EOF via Ctrl+End ✔"
            }


        elif target_key == "reset_home":
            disp_id = await detect_external_display_id(active_serial)
            calib = state.FRAMES_DIR / "dag_node2_home.png"
            is_verified = False
            detected_first = 0

            node.update({
                "evaluator": "Line 1 Gutter Evaluator",
                "healing_step": "Refreshing page capture",
                "telemetry_insight": "Dispatching Ctrl+Home to return to Line 1..."
            })
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "reset_home"})

            # Execute focused attempts to return to Line 1
            for attempt in range(1, 4):
                # Ensure viewport is clean and soft keyboard is suppressed before sending Ctrl+Home
                await auto_fix_viewport(active_serial, disp_id)
                await asyncio.sleep(0.15)

                # Send Ctrl+Home (keycode 113 122) directly to external display keyboard
                await send_hid_keycombination(int(cfg.get("key1", 113)), int(cfg.get("key2", 122)), active_serial)

                # Fetch active density/DPI from the phone right before OCR to normalize line 1 verification boxes
                dpi_factor, active_dpi = await fetch_current_display_dpi_factor(active_serial, disp_id)
                state.latest_telemetry.setdefault("capture_telemetry", {})
                state.latest_telemetry["capture_telemetry"].update({"active_dpi": active_dpi, "dpi_factor": dpi_factor})

                # Allow document scroll to converge to Line 1 (large documents take 0.4s - 1.5s to scroll from EOF)
                for sample_idx in range(6):
                    await asyncio.sleep(0.35)
                    snap = await capture_external_screenshot(active_serial, max_cache_age_s=0.0, bypass_lock=True)
                    if snap:
                        with open(calib, "wb") as f: f.write(snap)
                        is_verified, detected_first = await state.verify_first_line_in_process(calib, dpi_factor=dpi_factor)
                        if not is_verified:
                            top_detected = await state.detect_top_line_in_process(calib, dpi_factor=dpi_factor)
                            if top_detected == 1 or (0 < top_detected <= 2):
                                is_verified, detected_first = True, 1
                        node.update({
                            "evaluator": "Line 1 Gutter Evaluator",
                            "healing_step": "Refreshing page capture",
                            "telemetry_insight": f"Sampling gutter top (detected Ln {detected_first or 'verifying'})..."
                        })
                        await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "reset_home"})
                        if is_verified:
                            break

                if is_verified:
                    # Once Line 1 is reached, auto-fix viewport to ensure clean full 1920x1080 display
                    await auto_fix_viewport(active_serial, disp_id)
                    await asyncio.sleep(0.15)
                    snap_fixed = await capture_external_screenshot(active_serial, max_cache_age_s=0.0, bypass_lock=True)
                    if snap_fixed:
                        with open(calib, "wb") as f: f.write(snap_fixed)
                        is_v2, d2 = await state.verify_first_line_in_process(calib, dpi_factor=dpi_factor)
                        if is_v2:
                            detected_first = d2 or 1
                    break

                print(f"[reset_home] Attempt {attempt} not at Line 1 (detected {detected_first}), bringing editor to front...")
                node.update({
                    "evaluator": "Line 1 Gutter Evaluator",
                    "healing_step": "Refreshing page capture",
                    "telemetry_insight": f"Top line at Ln {detected_first} • Re-activating FilePreviewActivity & auto-fixing viewport..."
                })
                await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "reset_home"})
                # Re-activate Teams FilePreviewActivity on external display and ensure focus
                await run_adb_shell(f"am start --display {disp_id} -n com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity", active_serial)
                await auto_fix_viewport(active_serial, disp_id)
                await asyncio.sleep(0.3)

            if not is_verified:
                error_msg = f"DAG Node 2 ('reset_home') failed to return to Line 1: top gutter detected at Line {detected_first or 'unknown'} after all 3 attempts."
                node["dag_context"] = {
                    "node_id": "reset_home",
                    "project_id": state.get_current_project_id(),
                    "display_id": disp_id,
                    "serial": active_serial,
                    "detected_first_line": detected_first,
                    "expected_line": 1,
                    "dpi_factor": dpi_factor,
                    "active_dpi": active_dpi,
                    "timestamp": datetime.now().isoformat()
                }
                node["trace_insights"] = [
                    f"Ctrl+Home failed to navigate to Line 1: Gutter top remained at Line {detected_first or 'unknown'}.",
                    f"Check external display focus: adb -s {active_serial} shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'",
                    f"Verify FilePreviewActivity is foreground on display {disp_id}: adb -s {active_serial} shell dumpsys activity top | grep -i FilePreviewActivity",
                    f"Test sending keycode directly: adb -s {active_serial} shell input -d {disp_id} keyevent 113 122",
                    f"Inspect frame screenshot at: {calib.resolve()}"
                ]
                node.update({
                    "status": "error",
                    "verified": False,
                    "first_line": detected_first,
                    "evaluator": "Line 1 Gutter Evaluator",
                    "healing_step": None,
                    "telemetry_insight": f"Line 1 unverified (editor at Ln {detected_first or '?'}) ⛔",
                    "error": error_msg
                })
                state.latest_telemetry["current_top_line"] = detected_first or 1
                state.latest_telemetry["status_message"] = f"DAG Node 2: Line 1 unverified ⛔"
                await state.ws_manager.broadcast({
                    "type": "dag_updated",
                    "dag": state.dag_state,
                    "node_id": "reset_home",
                    "status": "error",
                    "verified": False,
                    "first_line": detected_first,
                    "error": error_msg,
                    "dag_context": node["dag_context"],
                    "trace_insights": node["trace_insights"],
                    "telemetry": state.latest_telemetry
                })
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": error_msg,
                        "dag_context": node["dag_context"],
                        "trace_insights": node["trace_insights"]
                    }
                )

            node.update({
                "status": "completed",
                "verified": True,
                "first_line": detected_first,
                "evaluator": "Line 1 Gutter Evaluator",
                "healing_step": None,
                "telemetry_insight": "Line 1 verified at top gutter ✔",
                "error": None
            })
            state.latest_telemetry["current_top_line"] = detected_first or 1
            state.latest_telemetry["status_message"] = f"DAG Node 2: Line 1 verified at top (detected Ln {detected_first})"
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "reset_home", "verified": True, "first_line": detected_first, "telemetry": state.latest_telemetry})
            return {"status": "success", "node_id": "reset_home", "verified": True, "first_line": detected_first, "message": "Line 1 verified at top gutter via Ctrl+Home ✔"}

        elif target_key == "frame_acquire":
            t_cap_start = time.time()
            is_fast = bool(payload and payload.get("fast_loop")) or cfg.get("fast_mode", True)
            
            # Broadcast immediate live telemetry that capture has commenced
            state.latest_telemetry.setdefault("capture_telemetry", {})
            state.latest_telemetry["capture_telemetry"]["status"] = "capturing"
            state.latest_telemetry["capture_telemetry"]["started_at"] = datetime.now().isoformat()
            state.latest_telemetry["status_message"] = "DAG Node 3: Capturing external display frame..."
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": "frame_acquire",
                "telemetry": state.latest_telemetry
            })

            if cfg.get("full_viewport_fix", False):
                await auto_fix_viewport(active_serial)
            else:
                # Fully automated keyboard prevention: silently ensure keyboard is closed before capture
                if await is_ime_visible(active_serial):
                    await ensure_adb_keyboard_closed(active_serial)

            default_settle = 30 if is_fast else 50
            settle_cfg = float(cfg.get("settle_delay_ms", default_settle))
            settle_ms = (min(settle_cfg, 50) if is_fast else settle_cfg) / 1000.0
            if settle_ms > 0:
                await asyncio.sleep(settle_ms)

            snap = await capture_external_screenshot(active_serial, max_cache_age_s=0.35)
            t_cap_end = time.time()
            latency_ms = max(1, int((t_cap_end - t_cap_start) * 1000))

            if not snap or len(snap) < 2000 or not snap.startswith(b"\x89PNG\r\n\x1a\n"):
                node.update({
                    "status": "error",
                    "evaluator": "Display Frame Evaluator",
                    "healing_step": "Refreshing page capture",
                    "telemetry_insight": "Screen capture stream invalid (refreshing page capture)",
                    "error": "Screen capture failed: no valid image received from device display"
                })
                state.latest_telemetry["capture_telemetry"].update({
                    "status": "error",
                    "error": "Capture failed: invalid image stream",
                    "last_latency_ms": latency_ms
                })
                state.latest_telemetry["status_message"] = "DAG Node 3: Screen capture failed - refreshing page capture..."
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

            # Unpack dimensions from PNG IHDR chunk (bytes 16..24)
            w_px, h_px = 1920, 1080
            if len(snap) >= 24:
                try:
                    import struct
                    w_px, h_px = struct.unpack(">II", snap[16:24])
                except Exception:
                    pass

            disp_map = await detect_surfaceflinger_displays(active_serial)
            known_did = disp_map.get("desktop", "default")
            disp_title = "MB16AMTR" if ("mb16amtr" in str(known_did).lower() or len(str(known_did)) > 10) else f"Display #{known_did}"

            temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
            with open(temp_calib, "wb") as f:
                f.write(snap)

            pidx = len(state.captured_frames) + 1
            now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
            raw_fn = f"raw_capture_p{pidx:03d}_{now_str}.png"
            raw_path = state.FRAMES_DIR / raw_fn
            with open(raw_path, "wb") as f:
                f.write(snap)

            total_caps = state.latest_telemetry.get("capture_telemetry", {}).get("total_captures", 0) + 1
            state.latest_telemetry["capture_telemetry"] = {
                "status": "completed",
                "last_latency_ms": latency_ms,
                "last_capture_time": datetime.now().isoformat(),
                "display_id": str(known_did),
                "display_name": disp_title,
                "resolution": f"{w_px}x{h_px}",
                "frame_bytes": len(snap),
                "cache_hit": latency_ms < 60,
                "settle_delay_ms": int(settle_ms * 1000),
                "total_captures": total_caps,
                "page": pidx,
                "error": None
            }

            node.update({
                "status": "completed",
                "page": pidx,
                "raw_image_path": str(temp_calib),
                "raw_filename": raw_fn,
                "file_size": len(snap),
                "duration_ms": latency_ms,
                "resolution": f"{w_px}x{h_px}",
                "evaluator": "Display Frame Evaluator",
                "healing_step": None,
                "telemetry_insight": f"Frame #{pidx} captured ({w_px}x{h_px}, {latency_ms}ms) ✔ Ready for OCR",
                "error": None
            })

            cache_tag = "⚡ Cache Hit" if latency_ms < 60 else f"{latency_ms}ms HW Grab"
            state.latest_telemetry["status_message"] = f"DAG Node 3: Acquired frame ({len(snap):,} bytes, {cache_tag}) ✔ Ready for OCR"
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": "frame_acquire",
                "page": pidx,
                "file_size": len(snap),
                "duration_ms": latency_ms,
                "telemetry": state.latest_telemetry
            })
            return {
                "status": "success",
                "node_id": "frame_acquire",
                "page": pidx,
                "file_size": len(snap),
                "duration_ms": latency_ms,
                "resolution": f"{w_px}x{h_px}",
                "telemetry": state.latest_telemetry.get("capture_telemetry"),
                "message": f"Screen capture complete ({len(snap):,} bytes in {latency_ms}ms) ✔ Ready for OCR extraction."
            }

        elif target_key in {"local_ai_ocr", "node_3b", "frame_local_ai_ocr"}:
            temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
            if not temp_calib.exists() or temp_calib.stat().st_size < 2000:
                candidates = sorted(
                    [p for p in state.FRAMES_DIR.glob("*.png") if p.stat().st_size >= 2000 and not p.name.startswith("temp_")],
                    key=lambda p: p.stat().st_mtime,
                    reverse=True
                )
                if candidates:
                    temp_calib = candidates[0]
                else:
                    node.update({
                        "status": "error",
                        "evaluator": "Multimodal Vision Evaluator",
                        "healing_step": "Refreshing page capture",
                        "telemetry_insight": "No captured frame available • Refreshing page capture",
                        "error": "No captured frame found. Please run DAG Node 3 (Screen Capture) first."
                    })
                    await state.ws_manager.broadcast({
                        "type": "dag_updated",
                        "dag": state.dag_state,
                        "node_id": "local_ai_ocr",
                        "error": "No captured frame available",
                        "telemetry": state.latest_telemetry
                    })
                    return {
                        "status": "error",
                        "node_id": "local_ai_ocr",
                        "message": "No captured frame found. Please run DAG Node 3 (Screen Capture) first."
                    }

            is_fast = bool(payload and payload.get("fast_loop")) or cfg.get("async_mode", True)

            async def _run_minicpm_background(target_calib: Path):
                try:
                    s_res = await ocr_svc.scan_image_with_minicpm(target_calib)
                    ext_text = s_res.get("extracted_text", "")
                    l_det = s_res.get("lines", [])
                    l_cnt = s_res.get("lines_count", len(l_det))
                    c_cnt = len(ext_text)
                    eng_name = s_res.get("model_used", "MiniCPM-V (Ollama)")
                    for item in l_det:
                        ln = item.get("line_number")
                        if ln:
                            ln = int(ln)
                            state.document_lines[ln] = {
                                "line_number": ln, "gutter_number": ln, "text": item.get("text", ""),
                                "is_blank": not bool(item.get("text", "").strip()), "is_wrapped": False,
                                "wrapped_line_count": 1, "status": "verified", "confidence": 0.98,
                                "notes": f"MiniCPM-V OCR ({eng_name})", "updated_at": datetime.now().isoformat()
                            }
                    if l_det:
                        state.save_persisted_state()
                    node.update({
                        "status": "completed",
                        "extracted_text": ext_text,
                        "preview_text": ext_text[:300] + ("..." if len(ext_text) > 300 else ""),
                        "lines_count": l_cnt,
                        "char_count": c_cnt,
                        "model_used": eng_name,
                        "evaluator": "Multimodal Vision Evaluator",
                        "healing_step": None,
                        "telemetry_insight": f"Extracted {l_cnt} lines ({c_cnt} chars) verbatim via {eng_name}",
                        "error": None
                    })
                    await state.ws_manager.broadcast({
                        "type": "dag_updated",
                        "dag": state.dag_state,
                        "node_id": "local_ai_ocr",
                        "extracted_text": ext_text,
                        "lines_count": l_cnt,
                        "char_count": c_cnt,
                        "model_used": eng_name,
                        "telemetry": state.latest_telemetry
                    })
                except Exception as ex:
                    print(f"[local_ai_ocr background worker] note: {ex}")

            if is_fast:
                asyncio.create_task(_run_minicpm_background(temp_calib))
                preview_msg = node.get("preview_text") or "MiniCPM-V vision worker running in background ⚡"
                node.update({
                    "status": "completed",
                    "extracted_text": node.get("extracted_text") or "(Dispatched to background AI worker...)",
                    "preview_text": preview_msg,
                    "lines_count": node.get("lines_count") or 0,
                    "char_count": node.get("char_count") or 0,
                    "model_used": "MiniCPM-V (Async Worker)",
                    "evaluator": "Multimodal Vision Evaluator",
                    "healing_step": None,
                    "telemetry_insight": "MiniCPM-V vision worker processing verbatim markdown in background ⚡",
                    "error": None
                })
                state.latest_telemetry["status_message"] = "DAG Node 3b: MiniCPM-V vision dispatched in background ⚡ Next: Gutter OCR"
                await state.ws_manager.broadcast({
                    "type": "dag_updated",
                    "dag": state.dag_state,
                    "node_id": "local_ai_ocr",
                    "extracted_text": node["extracted_text"],
                    "model_used": "MiniCPM-V (Async Worker)",
                    "telemetry": state.latest_telemetry
                })
                return {
                    "status": "success",
                    "node_id": "local_ai_ocr",
                    "lines_count": node["lines_count"],
                    "char_count": node["char_count"],
                    "extracted_text": node["extracted_text"],
                    "model_used": "MiniCPM-V (Async Worker)",
                    "message": "Local AI OCR dispatched in background ⚡"
                }

            scan_res = await ocr_svc.scan_image_with_minicpm(temp_calib)
            extracted_text = scan_res.get("extracted_text", "")
            lines_detected = scan_res.get("lines", [])
            lines_count = scan_res.get("lines_count", len(lines_detected))
            char_count = len(extracted_text)
            engine_name = scan_res.get("model_used", "MiniCPM-V (Ollama)")

            for item in lines_detected:
                ln = item.get("line_number")
                if ln:
                    ln = int(ln)
                    state.document_lines[ln] = {
                        "line_number": ln,
                        "gutter_number": ln,
                        "text": item.get("text", ""),
                        "is_blank": not bool(item.get("text", "").strip()),
                        "is_wrapped": False,
                        "wrapped_line_count": 1,
                        "status": "verified",
                        "confidence": 0.98,
                        "notes": f"MiniCPM-V OCR ({engine_name})",
                        "updated_at": datetime.now().isoformat()
                    }
            if lines_detected:
                state.save_persisted_state()

            node.update({
                "status": "completed",
                "extracted_text": extracted_text,
                "preview_text": extracted_text[:300] + ("..." if len(extracted_text) > 300 else ""),
                "lines_count": lines_count,
                "char_count": char_count,
                "model_used": engine_name,
                "error": None
            })

            state.latest_telemetry["status_message"] = f"DAG Node 3b: {engine_name} extracted {lines_count} lines ({char_count} chars) ✔"
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": "local_ai_ocr",
                "extracted_text": extracted_text,
                "lines_count": lines_count,
                "char_count": char_count,
                "model_used": engine_name,
                "telemetry": state.latest_telemetry
            })
            return {
                "status": "success",
                "node_id": "local_ai_ocr",
                "lines_count": lines_count,
                "char_count": char_count,
                "extracted_text": extracted_text,
                "model_used": engine_name,
                "message": f"Local AI OCR extracted {lines_count} lines ({char_count} chars) ✔"
            }

        elif target_key == "frame_ocr":
            temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
            if not temp_calib.exists() or temp_calib.stat().st_size < 2000:
                candidates = sorted(
                    [p for p in state.FRAMES_DIR.glob("*.png") if p.stat().st_size >= 2000 and not p.name.startswith("temp_")],
                    key=lambda p: p.stat().st_mtime,
                    reverse=True
                )
                if candidates:
                    temp_calib = candidates[0]
                else:
                    node.update({
                        "status": "error",
                        "error": "No captured frame found. Please run DAG Node 3 (Screen Capture) first."
                    })
                    state.latest_telemetry["status_message"] = "DAG Node 4: OCR failed - no captured frame available"
                    await state.ws_manager.broadcast({
                        "type": "dag_updated",
                        "dag": state.dag_state,
                        "node_id": "frame_ocr",
                        "error": "No captured frame available",
                        "telemetry": state.latest_telemetry
                    })
                    return {
                        "status": "error",
                        "node_id": "frame_ocr",
                        "message": "No captured frame found. Please run DAG Node 3 (Screen Capture) first."
                    }

            with open(temp_calib, "rb") as f:
                snap = f.read()

            # Fetch active density/DPI from the phone right before running OCR to normalize search bounding boxes
            dpi_factor, active_dpi = await fetch_current_display_dpi_factor(active_serial)
            state.latest_telemetry.setdefault("capture_telemetry", {})
            state.latest_telemetry["capture_telemetry"].update({"active_dpi": active_dpi, "dpi_factor": dpi_factor})

            is_fast = bool(payload and payload.get("fast_loop")) or cfg.get("async_worker", True)
            prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_8", {"lines_per_page": 31}))
            lpp = prof.get("lines_per_page", 31)

            disp_id = await detect_external_display_id(active_serial)
            expected_top = node.get("target_top_line") or state.dag_state["nodes"].get("arrow_down", {}).get("target_top_line") or state.orchestration_state.get("next_target_top")

            if is_fast:
                top_ln = state.latest_telemetry.get("current_top_line", 1) or 1
                bot_ln = top_ln + lpp - 1
                scan_res = {"top_line": top_ln, "bottom_line": bot_ln, "lines": [], "bounding_boxes": {}}
                lines_detected = []
            else:
                # Robust autonomous path: attempts DPI-scaled gutter extraction, then auto-heals via keyboard dismiss,
                # fresh hardware capture, cursor refocus, and window restoration.
                top_ln, bot_ln, lines_detected, heal_meta = await recover_gutter_bounds_with_healing(
                    serial=active_serial,
                    disp_id=disp_id,
                    temp_calib=temp_calib,
                    dpi_factor=dpi_factor,
                    node_id="frame_ocr",
                    expected_top=expected_top
                )
                if heal_meta.get("actions_taken"):
                    healing_ms += 150 * len(heal_meta["actions_taken"])
                # Re-read snap bytes in case image was refreshed
                with open(temp_calib, "rb") as f:
                    snap = f.read()
                scan_res = {"top_line": top_ln, "bottom_line": bot_ln, "lines": lines_detected}

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
                "extracted_line_count": len(lines_detected) if lines_detected else lpp,
                "bounding_boxes": scan_res.get("bounding_boxes", {}),
                "model_used": cfg.get("engine", "local:rapidocr"),
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

            # High-speed asynchronous OCR background processing
            if is_fast:
                async def _bg_frame_ocr(target_img: Path, target_fid: str, t_val: int, b_val: int):
                    try:
                        bg_scan = await state.scan_image_in_process(target_img)
                        bg_lines = bg_scan.get("lines", [])
                        real_top = bg_scan.get("top_line", t_val) or t_val
                        real_bot = bg_scan.get("bottom_line", b_val) or b_val
                        for it in bg_lines:
                            ln_idx = it.get("line_number")
                            if ln_idx:
                                state.document_lines[ln_idx] = state.MasterLine(
                                    it.get("text", ""),
                                    line_number=ln_idx,
                                    frame_id=target_fid,
                                    status=it.get("status", "verified"),
                                    confidence=it.get("confidence", 0.95),
                                    is_wrapped=it.get("is_wrapped", False),
                                )
                        if target_fid in state.captured_frames:
                            state.captured_frames[target_fid].update({
                                "top_line": real_top,
                                "bottom_line": real_bot,
                                "extracted_line_count": len(bg_lines),
                                "bounding_boxes": bg_scan.get("bounding_boxes", {}),
                                "status": "processed"
                            })
                        state.save_persisted_state()
                        await state.ws_manager.broadcast({"type": "document_updated", "document": state.get_document_metrics(), "data": state.get_document_metrics()})
                    except Exception as ex:
                        print(f"[bg_frame_ocr] frame {target_fid} error: {ex}")

                asyncio.create_task(_bg_frame_ocr(frame_path, fid, top_ln, bot_ln))

            await state.ws_manager.broadcast({"type": "new_frame", "frame": frame_info, "data": frame_info})
            await state.ws_manager.broadcast({"type": "document_updated", "document": state.get_document_metrics(), "data": state.get_document_metrics()})

            node.update({
                "status": "completed",
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "extracted_line_count": len(lines_detected) if lines_detected else lpp,
                "frame_id": fid,
                "evaluator": "Gutter Bounds Evaluator",
                "healing_step": None,
                "telemetry_insight": f"Gutter bounds: Ln {top_ln} → {bot_ln} ({len(lines_detected) if lines_detected else lpp} lines visible)",
                "error": None
            })
            if "local_ai_ocr" in state.dag_state["nodes"]:
                n3b = state.dag_state["nodes"]["local_ai_ocr"]
                if not n3b.get("extracted_text") or n3b.get("status") != "completed":
                    formatted_lines = []
                    for l in lines_detected:
                        txt = l.get("text", "").strip()
                        ln = l.get("line_number")
                        if txt: formatted_lines.append(f"{ln:>3}: {txt}")
                        else: formatted_lines.append(f"{ln:>3}:")
                    ext_txt = "\n".join(formatted_lines) or f"(Page {pidx}: Ln {top_ln} → {bot_ln} stream active ⚡)"
                    n3b.update({
                        "status": "completed",
                        "extracted_text": ext_txt,
                        "preview_text": ext_txt[:300] + ("..." if len(ext_txt) > 300 else ""),
                        "lines_count": len(lines_detected) if lines_detected else lpp,
                        "char_count": len(ext_txt),
                        "model_used": "RapidOCR (Fast Stream)",
                        "evaluator": "RapidOCR Stream Evaluator",
                        "healing_step": None,
                        "telemetry_insight": f"Stream extracted {len(lines_detected) if lines_detected else lpp} lines"
                    })
            target_top = bot_ln + 1
            if "arrow_down" in state.dag_state["nodes"]:
                state.dag_state["nodes"]["arrow_down"].update({
                    "target_top_line": target_top,
                    "target_top": target_top,
                    "prev_bottom": bot_ln,
                    "arrow_count": max(1, target_top - top_ln)
                })
            if "verification_trigger" in state.dag_state["nodes"]:
                state.dag_state["nodes"]["verification_trigger"].update({
                    "target_top_line": target_top,
                    "target_top": target_top,
                    "expected_top": target_top
                })
            state.orchestration_state["next_target_top"] = target_top

            state.latest_telemetry.update({
                "current_top_line": top_ln,
                "current_bottom_line": bot_ln,
                "next_target_top": target_top,
                "current_page": pidx,
                "status_message": f"DAG Node 4: OCR Extracted (Page {pidx}: Ln {top_ln} → {bot_ln}) ✔ Next Target: Ln {target_top}"
            })
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": "frame_ocr",
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "target_top_line": target_top,
                "extracted_line_count": len(lines_detected) if lines_detected else lpp,
                "frame_id": fid,
                "telemetry": state.latest_telemetry
            })
            return {
                "status": "success",
                "node_id": "frame_ocr",
                "frame_id": fid,
                "page": pidx,
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "target_top_line": target_top,
                "scan": scan_res,
                "lines_extracted": len(lines_detected) if lines_detected else lpp,
                "message": f"OCR extracted (Ln {top_ln} → {bot_ln}). Target Top: Ln {target_top} ✔"
            }

        elif target_key == "arrow_down":
            prev_bot = node.get("prev_bottom") or state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line", 31) or 31
            cur_top = state.latest_telemetry.get("current_top_line", 1) or 1
            target_top = prev_bot + 1
            needed_steps = max(1, target_top - cur_top)
            step_count = int(cfg.get("step_count") or needed_steps)
            disp_id = await detect_external_display_id(active_serial)

            # 1. Pre-Scroll Assertion: Before dispatching an arrow-down or page-down keystroke, check the frame.
            from services.visual_state_service import assert_markdown_open, run_editor_recovery_node
            markdown_open, reason, details = await assert_markdown_open(active_serial)

            # If markdown_open evaluates to False, divert to a recovery node rather than firing additional navigation commands
            if not markdown_open:
                state.latest_telemetry["status_message"] = f"Pre-Scroll Assertion: markdown_open is False ({reason}). Diverting to recovery node..."
                state.dag_state["current_active_node"] = "editor_recovery"
                node.update({
                    "evaluator": "Editor Window Assertion Evaluator",
                    "healing_step": "Restoring Teams editor focus",
                    "telemetry_insight": f"Pre-scroll check failed ({reason}) • Diverting to editor recovery"
                })
                await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "arrow_down"})
                recovery_res = await run_editor_recovery_node(active_serial, disp_id)

                if recovery_res.get("success"):
                    print("[arrow_down] Pre-Scroll Recovery succeeded [OK] Editor restored. Resuming navigation.")
                    state.latest_telemetry["status_message"] = "Recovery node restored markdown editor [OK] Resuming navigation..."
                    markdown_open = True
                else:
                    error_msg = f"Navigation blocked: Markdown editor is not open ({reason}) and recovery node failed to restore window."
                    node["dag_context"] = {
                        "node_id": "arrow_down",
                        "project_id": state.get_current_project_id(),
                        "display_id": disp_id,
                        "serial": active_serial,
                        "reason": reason,
                        "details": details,
                        "recovery_result": recovery_res,
                        "timestamp": datetime.now().isoformat()
                    }
                    node["trace_insights"] = [
                        f"Pre-Scroll Assertion failed: Markdown editor is not open or visible ({reason}).",
                        f"Editor recovery node was unable to restore window: {recovery_res}",
                        f"Check active tasks on display {disp_id}: adb -s {active_serial} shell dumpsys activity activities | grep -E 'Stack id|Hist'",
                        f"Launch FilePreviewActivity manually: adb -s {active_serial} shell am start --display {disp_id} -n com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity"
                    ]
                    node.update({
                        "status": "error",
                        "evaluator": "Editor Window Assertion Evaluator",
                        "healing_step": None,
                        "telemetry_insight": f"Pre-scroll check failed ({reason}) • Recovery failed ⛔",
                        "error": error_msg,
                        "details": details,
                        "recovery_result": recovery_res
                    })
                    state.latest_telemetry["status_message"] = f"Navigation blocked: {reason} ⛔ Recovery failed."
                    await state.ws_manager.broadcast({
                        "type": "dag_updated",
                        "dag": state.dag_state,
                        "node_id": "arrow_down",
                        "status": "error",
                        "error": error_msg,
                        "dag_context": node["dag_context"],
                        "trace_insights": node["trace_insights"],
                        "recovery_result": recovery_res,
                        "telemetry": state.latest_telemetry
                    })
                    raise HTTPException(
                        status_code=500,
                        detail={
                            "message": error_msg,
                            "dag_context": node["dag_context"],
                            "trace_insights": node["trace_insights"]
                        }
                    )

            # 2. Ensure soft keyboard suppression without tapping screen
            await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0; am broadcast -a com.matrixcapture.app.ACTION_CLOSE_KEYBOARD >/dev/null 2>&1", active_serial)

            # 3. Constrained Key Bounds: Scope HID scroller to strictly emit PageDown (93) or DownArrow (20) scancodes,
            # omitting mobile virtual keyboard toggle gestures entirely to prevent rogue modal events
            scroll_key = int(cfg.get("keycode", 20))
            if scroll_key not in (20, 93):
                scroll_key = 20
            keys_arg = " ".join([str(scroll_key)] * step_count)
            cmd = f"input -d {disp_id} keyevent {keys_arg}" if disp_id > 0 else f"input keyevent {keys_arg}"
            await run_adb_shell(cmd, active_serial)

            final_top = target_top
            if cfg.get("verify_after_step", False):
                await asyncio.sleep(0.1)
                snap = await capture_external_screenshot(active_serial)
                if snap:
                    calib = state.FRAMES_DIR / "dag_node4_step.png"
                    with open(calib, "wb") as f: f.write(snap)
                    new_top = await state.detect_top_line_in_process(calib)
                    if new_top > 0: final_top = new_top

            state.latest_telemetry["current_top_line"] = final_top
            node.update({
                "status": "completed",
                "arrow_count": step_count,
                "target_top_line": target_top,
                "target_top": target_top,
                "new_top_line": final_top,
                "evaluator": "Pacing & Alignment Evaluator",
                "healing_step": None,
                "telemetry_insight": f"Stepped {step_count} down arrows to target Line {target_top} (current Ln {final_top})"
            })
            if "verification_trigger" in state.dag_state["nodes"]:
                state.dag_state["nodes"]["verification_trigger"].update({
                    "target_top_line": target_top,
                    "target_top": target_top,
                    "expected_top": target_top
                })

            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": "arrow_down",
                "step_count": step_count,
                "target_top_line": target_top,
                "new_top_line": final_top,
                "telemetry": state.latest_telemetry
            })
            return {
                "status": "success",
                "node_id": "arrow_down",
                "step_count": step_count,
                "target_top_line": target_top,
                "new_top_line": final_top,
                "message": f"Stepped {step_count} down arrows: Target top Ln {target_top} (Current: Ln {final_top}) [OK]"
            }

        elif target_key == "verification_trigger":
            target_top = node.get("target_top_line") or (state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line", 31) + 1)
            temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
            snap_bytes = temp_calib.read_bytes() if temp_calib.exists() else None
            decision = await evaluate_node_5_decision(active_serial, image_bytes=snap_bytes)
            allowed = decision.get("allowed", False)

            # If prevented by qualifiers, attempt self-healing environmental triggers (keyboard, not in edit mode, not in dark mode)
            if not allowed:
                reasons_str = ", ".join(decision.get("reasons", []))
                node.update({
                    "evaluator": "Environmental Trigger Auto-Healer",
                    "healing_step": f"Auto-resolving trigger issues: {reasons_str}",
                    "telemetry_insight": f"Trigger blocked ({reasons_str}) • Self-healing environment..."
                })
                await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "verification_trigger"})

                # 1. Proactive auto-heal of keyboard, theme, edit-mode
                t_heal_0 = time.perf_counter()
                heal_res = await auto_heal_pipeline_environment(active_serial, disp_id, target_key, snap_bytes)
                h_dur = max(0, int((time.perf_counter() - t_heal_0) * 1000))
                healing_ms += h_dur

                # 2. Capture fresh screen and re-evaluate
                fresh_snap = await capture_external_screenshot(active_serial, max_cache_age_s=0.0, bypass_lock=True)
                if fresh_snap:
                    with open(temp_calib, "wb") as f: f.write(fresh_snap)
                    snap_bytes = fresh_snap

                decision = await evaluate_node_5_decision(active_serial, image_bytes=snap_bytes)
                allowed = decision.get("allowed", False)

            if not allowed:
                # Issue persists without a determined fix -> Only then raise an exception displaying complete DAG context detail and trace insights
                reasons_list = decision.get("reasons", [])
                reasons_str = ", ".join(reasons_list)
                error_msg = f"Verification trigger qualifiers blocked without determined fix: {reasons_str}"
                node["dag_context"] = {
                    "node_id": "verification_trigger",
                    "project_id": state.get_current_project_id(),
                    "display_id": disp_id,
                    "serial": active_serial,
                    "target_top_line": target_top,
                    "blocking_reasons": reasons_list,
                    "qualifier_details": decision.get("details", {}),
                    "timestamp": datetime.now().isoformat()
                }
                node["trace_insights"] = [
                    f"Verification trigger blocked by qualifiers: {reasons_str}",
                    f"Check IME keyboard state: adb -s {active_serial} shell dumpsys input_method | grep -i mInputShown",
                    f"Verify foreground activity: adb -s {active_serial} shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'",
                    f"Inspect qualifier issues in telemetry: {reasons_list}",
                    f"Review latest captured frame at: {temp_calib.resolve()}"
                ]
                node.update({
                    "status": "error",
                    "target_top_line": target_top,
                    "target_top": target_top,
                    "expected_top": target_top,
                    "evaluator": "Completion Qualifier Evaluator",
                    "healing_step": None,
                    "telemetry_insight": f"Unresolvable trigger issue: {reasons_str} ⛔",
                    "error": error_msg,
                    "trigger_decision": decision
                })
                await state.ws_manager.broadcast({
                    "type": "dag_updated",
                    "dag": state.dag_state,
                    "node_id": "verification_trigger",
                    "status": "error",
                    "target_top_line": target_top,
                    "trigger_decision": decision,
                    "dag_context": node["dag_context"],
                    "trace_insights": node["trace_insights"],
                    "error": error_msg,
                    "telemetry": state.latest_telemetry
                })
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": error_msg,
                        "dag_context": node["dag_context"],
                        "trace_insights": node["trace_insights"]
                    }
                )

            node.update({
                "status": "completed",
                "target_top_line": target_top,
                "target_top": target_top,
                "expected_top": target_top,
                "evaluator": "Completion Qualifier Evaluator",
                "healing_step": None,
                "telemetry_insight": f"Target Line {target_top} qualified for loopback ✔",
                "error": None,
                "trigger_decision": decision
            })
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": "verification_trigger",
                "target_top_line": target_top,
                "trigger_decision": decision
            })
            return {
                "status": "success",
                "node_id": "verification_trigger",
                "target_top_line": target_top,
                "trigger_decision": decision,
                "allowed": True,
                "prevented": False,
                "message": f"Trigger allowed for Target Top Ln {target_top} ✔"
            }
        elif target_key == "document_assemble":
            total_lines_target = state.dag_state["nodes"].get("init_end", {}).get("total_lines", 0)
            captured_count = len([k for k, v in state.document_lines.items() if str(v).strip()])
            latest_bottom = state.latest_telemetry.get("current_bottom_line", 0)

            doc_lines = []
            for k in sorted(state.document_lines.keys()):
                doc_lines.append(str(state.document_lines[k]))
            full_markdown = "\n".join(doc_lines)

            is_complete = False
            if total_lines_target > 0 and latest_bottom >= total_lines_target:
                is_complete = True
            elif total_lines_target > 0 and captured_count >= total_lines_target:
                is_complete = True

            loop_iter = (node.get("loop_iteration") or 0) + 1
            pct = round((captured_count / total_lines_target * 100) if total_lines_target > 0 else 0, 1)
            node.update({
                "status": "completed",
                "total_captured_lines": captured_count,
                "completion_percent": pct,
                "is_complete": is_complete,
                "loop_iteration": loop_iter,
                "reconstructed_length": len(full_markdown),
                "evaluator": "Document Integrity Evaluator",
                "healing_step": None if is_complete else "Capturing next page slice",
                "telemetry_insight": f"Master document: {captured_count}/{total_lines_target or '?'} lines stitched ({pct}%)" + (" • 100% COMPLETE ✔" if is_complete else ""),
                "error": None
            })

            state.latest_telemetry["status_message"] = (
                f"DAG Node 8: Markdown Assembled ({captured_count}/{total_lines_target or '?'} lines • {pct}%) "
                f"{'✔ 100% COMPLETE' if is_complete else f'↺ Loop {loop_iter}'}"
            )

            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": "document_assemble",
                "captured_count": captured_count,
                "is_complete": is_complete,
                "completion_percent": pct,
                "telemetry": state.latest_telemetry
            })
            return {
                "status": "success",
                "node_id": "document_assemble",
                "total_captured_lines": captured_count,
                "total_lines_target": total_lines_target,
                "completion_percent": pct,
                "is_complete": is_complete,
                "loop_iteration": loop_iter,
                "message": f"Document assemble: {captured_count} lines verified" + (" (COMPLETE ✔)" if is_complete else "")
            }
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported node {target_key}")
    except asyncio.CancelledError:
        end_time = datetime.now()
        finished_at_str = end_time.strftime("%H:%M:%S")
        dur_ms = int((end_time - start_time).total_seconds() * 1000)
        node["status"] = "aborted"
        node["is_active"] = False
        node["finished_at"] = finished_at_str
        node["finished_at_iso"] = end_time.isoformat()
        node["duration_ms"] = dur_ms
        if not node.get("error"):
            node["error"] = "Operation aborted: preempted by another node"
        if state.dag_state.get("current_active_node") == target_key:
            state.dag_state["current_active_node"] = None
        await state.ws_manager.broadcast({
            "type": "dag_node_aborted",
            "node_id": target_key,
            "dag": state.dag_state,
            "error": node["error"],
            "telemetry": state.latest_telemetry
        })
        raise
    except Exception as e:
        node["status"] = "error"
        node["error"] = str(e)
        if not node.get("dag_context"):
            node["dag_context"] = {
                "node_id": target_key,
                "project_id": state.get_current_project_id(),
                "display_id": disp_id if 'disp_id' in locals() else None,
                "serial": active_serial,
                "exception": str(e),
                "timestamp": datetime.now().isoformat()
            }
        if not node.get("trace_insights"):
            node["trace_insights"] = [
                f"Exception encountered in Node '{target_key}': {e}",
                f"Check window focus: adb -s {active_serial} shell dumpsys window | grep -E 'mFocusedApp'",
                f"Verify external display: adb -s {active_serial} shell dumpsys display",
                f"Check IME keyboard: adb -s {active_serial} shell dumpsys input_method | grep -i mInputShown"
            ]
        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "node_id": target_key,
            "error": str(e),
            "dag_context": node["dag_context"],
            "trace_insights": node["trace_insights"],
            "telemetry": state.latest_telemetry
        })
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"DAG Node '{target_key}' failed: {e}",
                "dag_context": node["dag_context"],
                "trace_insights": node["trace_insights"]
            }
        )
    finally:
        t_end = time.perf_counter()
        end_time = datetime.now()
        finished_at_str = end_time.strftime("%H:%M:%S")
        dur_ms = max(1, int((t_end - t_start) * 1000))
        node["finished_at"] = node.get("finished_at") or finished_at_str
        node["finished_at_iso"] = node.get("finished_at_iso") or end_time.isoformat()
        node["duration_ms"] = node.get("duration_ms") or dur_ms
        node["is_active"] = False
        if node.get("status") == "active":
            node["status"] = "completed"
        p_ms = precheck_ms if 'precheck_ms' in locals() else 0
        h_ms = healing_ms if 'healing_ms' in locals() else 0
        timings = {
            "started_at": node.get("started_at"),
            "finished_at": node["finished_at"],
            "duration_ms": dur_ms,
            "precheck_ms": p_ms,
            "action_ms": max(0, dur_ms - p_ms - h_ms),
            "healing_ms": h_ms,
            "timestamp_iso": end_time.isoformat()
        }
        node["timings"] = timings
        if state.dag_state.get("current_active_node") == target_key:
            state.dag_state["current_active_node"] = None
        if _current_running_node_task is curr_task:
            _current_running_node_task = None
            _current_running_node_id = None
        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "node_id": target_key,
            "timing": {
                "started_at": node.get("started_at"),
                "finished_at": node["finished_at"],
                "duration_ms": node["duration_ms"],
                "is_active": False
            },
            "timings": timings
        })

@router.post("/api/dag/nodes/abort")
@router.post("/api/dag/nodes/{node_id}/abort")
async def abort_dag_node_endpoint(node_id: Optional[str] = None):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id) if node_id else None
    aborted_id = await abort_running_node(target_node_id=target_key, reason="Operation aborted by user request")
    return {
        "status": "success",
        "aborted_node": aborted_id,
        "message": f"Node '{aborted_id}' operation aborted successfully." if aborted_id else "No active node was running to abort."
    }


@router.post("/api/dag/nodes/node_5/evaluate")
@router.post("/api/dag/nodes/node_6/evaluate")
@router.post("/api/dag/nodes/verification_trigger/evaluate")
async def evaluate_dag_node_5_qualifiers(serial: Optional[str] = None):
    decision = await evaluate_node_5_decision(serial)
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "verification_trigger", "trigger_decision": decision})
    return {"status": "success", "node_id": "verification_trigger", "trigger_decision": decision, "allowed": decision.get("allowed", False), "prevented": decision.get("prevented", True), "message": "Trigger allowed ✔" if decision.get("allowed") else f"Trigger prevented: {', '.join(decision.get('reasons', []))} ⛔"}

async def execute_dag_group_initialize(serial: Optional[str] = None, project_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Executes DAG Group 1 ('initialize'):
      1. Pre-flight check: ensure Teams editor focus on external display, close IME soft keyboard.
      2. Step 1 (init_end): Send HID Ctrl+End -> capture screenshot -> gutter OCR to calibrate total lines.
      3. Step 2 (reset_home): Send HID Ctrl+Home -> capture screenshot -> verify Line 1 at top gutter.
      4. Transition: Mark 'initialize' group as 'completed' and activate 'capture_entire_markdown' group (Node 3: frame_acquire ready).
    Streams progress percentage and telemetry over WebSocket.
    """
    active_serial = await get_active_adb_serial(serial)
    state.dag_state.setdefault("groups", {})
    init_group = state.dag_state["groups"].setdefault("initialize", {
        "id": "initialize", "title": "Initialize", "description": "Auto-calibrates total lines via EOF Ctrl+End and verifies return to Line 1",
        "nodes": ["init_end", "reset_home"], "status": "idle"
    })
    capture_group = state.dag_state["groups"].setdefault("capture_entire_markdown", {
        "id": "capture_entire_markdown", "title": "Capture Entire Markdown",
        "description": "Acquires pages, offloads to OCR worker, and steps down through markdown document",
        "nodes": ["frame_acquire", "frame_ocr", "arrow_down", "verification_trigger"], "status": "idle"
    })

    init_group["status"] = "active"
    init_group["progress"] = {"percent": 10, "stage": "Checking editor cursor focus and display...", "status": "running"}
    state.dag_state["current_active_group"] = "initialize"
    state.dag_state["current_active_node"] = "init_end"
    state.latest_telemetry["status_message"] = "Initializing: checking editor cursor and display..."

    await state.ws_manager.broadcast({
        "type": "project_init_progress",
        "stage": "Checking editor cursor focus and display...",
        "percent": 10,
        "status": "running",
        "dag": state.dag_state
    })

    try:
        # Pre-check cursor focus and external display
        disp_id = await detect_external_display_id(active_serial)
        cursor_clf = EditorCursorFocusedClassifier()
        c_ctx = ClassifierContext(serial=active_serial, display_id=disp_id)
        try:
            c_res = await cursor_clf.detect(c_ctx)
            if c_res.issue_detected:
                await cursor_clf.fix(c_ctx)
                await asyncio.sleep(0.2)
        except Exception as ce:
            print(f"[execute_dag_group_initialize] Caret focus check note: {ce}")

        await ensure_adb_keyboard_closed(active_serial)

        # Step 1: Run Node 1 (init_end)
        init_group["progress"] = {"percent": 25, "stage": "Sending Ctrl+End to determine EOF total lines...", "status": "running"}
        await state.ws_manager.broadcast({
            "type": "project_init_progress",
            "stage": "Sending Ctrl+End to determine EOF total lines...",
            "percent": 25,
            "status": "running",
            "dag": state.dag_state
        })

        node1_res = await run_single_dag_node("init_end", {"serial": active_serial, "skip_precheck": True})
        total_lines = node1_res.get("total_lines", 0)

        if node1_res.get("status") == "error" or total_lines <= 0:
            err_msg = node1_res.get("message") or "EOF Navigation Failed: could not determine total lines."
            init_group["status"] = "error"
            init_group["progress"] = {"percent": 50, "stage": err_msg, "status": "error", "error": err_msg, "total_lines": total_lines}
            await state.ws_manager.broadcast({
                "type": "project_init_progress",
                "stage": err_msg,
                "percent": 50,
                "status": "error",
                "error": err_msg,
                "total_lines": total_lines,
                "dag": state.dag_state
            })
            return {"status": "error", "group": "initialize", "error": err_msg, "node1": node1_res}

        # Step 2: Run Node 2 (reset_home)
        init_group["progress"] = {"percent": 65, "stage": f"Calibrated {total_lines:,} total lines at EOF ✔. Returning to Line 1...", "status": "running", "total_lines": total_lines}
        await state.ws_manager.broadcast({
            "type": "project_init_progress",
            "stage": f"Calibrated {total_lines:,} total lines at EOF ✔. Returning to Line 1...",
            "percent": 65,
            "status": "running",
            "total_lines": total_lines,
            "dag": state.dag_state
        })

        node2_res = await run_single_dag_node("reset_home", {"serial": active_serial})
        is_verified = node2_res.get("verified", False)
        first_line = node2_res.get("first_line", 1)

        # Strictly verify Line 1 before advancing to DAG 2
        if not is_verified:
            err_msg = f"Failed to return to Line 1 (currently on Line {first_line or 'unknown'}). Please verify Ctrl+Home on external display."
            init_group["status"] = "error"
            init_group["progress"] = {
                "percent": 75,
                "stage": err_msg,
                "status": "error",
                "error": err_msg,
                "total_lines": total_lines,
                "verified": False
            }
            await state.ws_manager.broadcast({
                "type": "project_init_progress",
                "stage": err_msg,
                "percent": 75,
                "status": "error",
                "error": err_msg,
                "total_lines": total_lines,
                "verified": False,
                "dag": state.dag_state,
                "telemetry": state.latest_telemetry
            })
            return {
                "status": "error",
                "group": "initialize",
                "error": err_msg,
                "total_lines": total_lines,
                "first_line": first_line,
                "verified": False,
                "node1": node1_res,
                "node2": node2_res
            }

        # Mark initialize completed ONLY IF Line 1 is verified!
        init_group["status"] = "completed"
        init_group["progress"] = {
            "percent": 100,
            "stage": f"Project Initialized Successfully! {total_lines:,} total lines calibrated and Line 1 verified ✔",
            "status": "completed",
            "total_lines": total_lines,
            "verified": True
        }
        capture_group["status"] = "idle"
        state.dag_state["current_active_group"] = "capture_entire_markdown"
        state.dag_state["current_active_node"] = None
        state.dag_state["nodes"]["frame_acquire"]["status"] = "idle"
        state.dag_state["nodes"]["frame_acquire"]["is_active"] = False
        state.latest_telemetry["current_top_line"] = 1
        state.latest_telemetry["current_page"] = 1
        state.latest_telemetry["target_total_lines"] = total_lines
        state.latest_telemetry["status_message"] = f"DAG Group 'Initialize' complete: {total_lines:,} total lines ready for capture ✔"

        await state.ws_manager.broadcast({
            "type": "project_init_progress",
            "stage": f"Project Initialized Successfully! {total_lines:,} total lines calibrated and Line 1 verified ✔",
            "percent": 100,
            "status": "completed",
            "total_lines": total_lines,
            "dag": state.dag_state,
            "telemetry": state.latest_telemetry
        })

        return {
            "status": "success",
            "group": "initialize",
            "total_lines": total_lines,
            "first_line": first_line,
            "verified": is_verified,
            "node1": node1_res,
            "node2": node2_res
        }
    except Exception as e:
        init_group["status"] = "error"
        err = str(e)
        init_group["progress"] = {"percent": 50, "stage": f"Initialization failed: {err}", "status": "error", "error": err}
        await state.ws_manager.broadcast({
            "type": "project_init_progress",
            "stage": f"Initialization failed: {err}",
            "percent": 50,
            "status": "error",
            "error": err,
            "dag": state.dag_state
        })
        return {"status": "error", "group": "initialize", "error": err}

async def execute_dag_group_capture_markdown(serial: Optional[str] = None) -> Dict[str, Any]:
    active_serial = await get_active_adb_serial(serial)
    capture_group = state.dag_state["groups"].setdefault("capture_entire_markdown", {
        "id": "capture_entire_markdown", "title": "Capture Entire Markdown",
        "description": "Acquires pages, offloads to OCR worker, and steps down through markdown document",
        "nodes": ["frame_acquire", "local_ai_ocr", "frame_ocr", "arrow_down", "verification_trigger", "document_assemble"], "status": "active"
    })
    capture_group["status"] = "active"
    state.dag_state["current_active_group"] = "capture_entire_markdown"

    opts = {"serial": active_serial, "fast_loop": True}

    n3_res = await run_single_dag_node("frame_acquire", opts)
    if n3_res.get("status") == "error":
        capture_group["status"] = "error"
        return {"status": "error", "node_id": "frame_acquire", "result": n3_res}

    n4_res = await run_single_dag_node("local_ai_ocr", opts)
    if n4_res.get("status") == "error":
        capture_group["status"] = "error"
        return {"status": "error", "node_id": "local_ai_ocr", "result": n4_res}

    n5_res = await run_single_dag_node("frame_ocr", opts)
    if n5_res.get("status") == "error":
        capture_group["status"] = "error"
        return {"status": "error", "node_id": "frame_ocr", "result": n5_res}

    n6_res = await run_single_dag_node("arrow_down", opts)
    if n6_res.get("status") in ("error", "prevented"):
        st = n6_res.get("status", "error")
        capture_group["status"] = st
        return {"status": st, "node_id": "arrow_down", "result": n6_res}

    n7_res = await run_single_dag_node("verification_trigger", opts)
    n8_res = await run_single_dag_node("document_assemble", opts)

    return {
        "status": "success",
        "group": "capture_entire_markdown",
        "node3": n3_res,
        "node4": n4_res,
        "node5": n5_res,
        "node6": n6_res,
        "node7": n7_res,
        "node8": n8_res
    }

capture_loop_task: Optional[asyncio.Task] = None

async def run_continuous_capture_loop_worker(serial: Optional[str] = None):
    active_serial = await get_active_adb_serial(serial)
    state.capture_loop_running = True
    state.latest_telemetry["is_pacing"] = True
    state.orchestration_state["status"] = "RUNNING"

    try:
        while state.capture_loop_running:
            res = await execute_dag_group_capture_markdown(serial=active_serial)
            if res.get("status") in ("error", "prevented"):
                state.latest_telemetry["status_message"] = f"Loop stopped: {res.get('node_id')} ({res.get('status')})"
                break

            n8 = res.get("node8", {})
            if n8.get("is_complete"):
                state.latest_telemetry["status_message"] = "🎉 100% Markdown Captured! All lines verified."
                break

            n7 = res.get("node7", {})
            if not n7.get("allowed", True):
                state.latest_telemetry["status_message"] = f"Trigger blocked next loop: {n7.get('message')}"
                break

            await asyncio.sleep(0.18)
    except asyncio.CancelledError:
        pass
    except HTTPException as he:
        det = he.detail
        err_msg = det.get("message") if isinstance(det, dict) else str(det)
        print(f"[CaptureLoop] Unresolved error in loop: {err_msg}")
        state.latest_telemetry["status_message"] = f"Capture loop halted: {err_msg}"
    except Exception as e:
        print(f"[CaptureLoop] Exception: {e}")
        state.latest_telemetry["status_message"] = f"Capture loop halted: {e}"
    finally:
        state.capture_loop_running = False
        state.latest_telemetry["is_pacing"] = False
        state.dag_state["current_active_node"] = None
        state.orchestration_state["status"] = "PAUSED"
        await state.ws_manager.broadcast({
            "type": "capture_loop_status",
            "running": False,
            "dag": state.dag_state,
            "telemetry": state.latest_telemetry
        })

@router.post("/api/dag/loop/start")
async def start_dag_loop(payload: Optional[Dict[str, Any]] = None):
    global capture_loop_task
    payload = payload or {}
    serial = payload.get("serial")
    if getattr(state, "capture_loop_running", False):
        return {"status": "already_running", "message": "Capture loop is already running"}

    state.capture_loop_running = True
    capture_loop_task = asyncio.create_task(run_continuous_capture_loop_worker(serial))
    await state.ws_manager.broadcast({
        "type": "capture_loop_status",
        "running": True,
        "dag": state.dag_state,
        "telemetry": state.latest_telemetry
    })
    return {"status": "started", "message": "Capture loop started"}

@router.post("/api/dag/loop/stop")
async def stop_dag_loop():
    global capture_loop_task
    state.capture_loop_running = False
    if capture_loop_task and not capture_loop_task.done():
        capture_loop_task.cancel()
    state.latest_telemetry["is_pacing"] = False
    state.dag_state["current_active_node"] = None
    await state.ws_manager.broadcast({
        "type": "capture_loop_status",
        "running": False,
        "dag": state.dag_state,
        "telemetry": state.latest_telemetry
    })
    return {"status": "stopped", "message": "Capture loop stopped"}

@router.get("/api/dag/loop/status")
async def get_dag_loop_status():
    return {
        "status": "success",
        "running": getattr(state, "capture_loop_running", False),
        "current_active_node": state.dag_state.get("current_active_node")
    }

@router.post("/api/dag/groups/{group_id}/run")
async def run_dag_group_endpoint(group_id: str, payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    serial = payload.get("serial")
    if group_id in {"initialize", "init"}:
        return await execute_dag_group_initialize(serial=serial, project_id=payload.get("project_id"))
    elif group_id in {"capture_entire_markdown", "capture"}:
        return await execute_dag_group_capture_markdown(serial=serial)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown DAG group: {group_id}")


@router.get("/api/pipeline/mode")
async def get_pipeline_mode():
    ocr_svc.sync_pipeline_mode_with_keys()
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
    if m == "cloud" and not config.GEMINI_API_KEY:
        raise HTTPException(status_code=400, detail="Cloud Pipeline requires a Gemini API key. Please configure your key in Secrets or use Local Pipeline.")
    ocr_svc.active_pipeline_mode = m
    if m == "local": ocr_svc.active_model_target, ocr_svc.active_ocr_engine = "ollama", "local"
    else: ocr_svc.active_model_target, ocr_svc.active_ocr_engine = "gemini", "auto"
    payload = {"type": "pipeline_mode_changed", "pipeline_mode": ocr_svc.active_pipeline_mode, "mode": ocr_svc.active_pipeline_mode, "model_target": ocr_svc.active_model_target, "ocr_engine": ocr_svc.active_ocr_engine, "engine": ocr_svc.active_ocr_engine}
    await state.ws_manager.broadcast(payload)
    return {"status": "success", **payload}

@router.get("/api/ocr/engines")
async def get_ocr_engines():
    has_gemini = bool(config.GEMINI_API_KEY)
    ocr_svc.sync_pipeline_mode_with_keys()
    return {
        "engines": [
            {"id": "auto", "name": "Auto (Gemini with Local Fallback)" if has_gemini else "Auto (Local RapidOCR)", "available": True, "type": "auto"},
            {"id": "local", "name": "Local RapidOCR / OpenCV Engine", "available": True, "type": "local"},
            {"id": "gemini", "name": "Gemini 2.5 Cloud Vision", "available": has_gemini, "type": "cloud"},
            {"id": "hybrid", "name": "Hybrid (Gemini Text + Local Bounding Boxes)", "available": has_gemini, "type": "hybrid"}
        ],
        "active_engine": ocr_svc.active_ocr_engine, "model_targets": ["gemini", "ollama"],
        "active_model_target": ocr_svc.active_model_target, "pipeline_mode": ocr_svc.active_pipeline_mode
    }

@router.post("/api/ocr/select-engine")
async def select_ocr_engine(req: OcrSelectionRequest):
    has_gemini = bool(config.GEMINI_API_KEY)
    if req.engine:
        eng = req.engine.lower()
        if eng not in {"auto", "local", "gemini", "hybrid"}: raise HTTPException(status_code=400, detail=f"Invalid engine '{req.engine}'.")
        if eng in {"gemini", "hybrid"} and not has_gemini:
            raise HTTPException(status_code=400, detail=f"Engine '{req.engine}' requires a configured Gemini API key. Please configure your key or use 'local'.")
        ocr_svc.active_ocr_engine = eng
    if req.model_target: ocr_svc.active_model_target = ocr_svc.normalize_model_target(req.model_target)
    await state.ws_manager.broadcast({"type": "ocr_engine_changed", "active_engine": ocr_svc.active_ocr_engine, "active_model_target": ocr_svc.active_model_target})
    return {"status": "success", "active_engine": ocr_svc.active_ocr_engine, "active_model_target": ocr_svc.active_model_target}

@router.post("/api/ocr/scan-direct")
async def scan_direct(request: Request, file: UploadFile = File(...), engine: Optional[str] = Form("auto"), model_target: Optional[str] = Form(None), pipeline_mode: Optional[str] = Form(None)):
    has_gemini = bool(config.GEMINI_API_KEY)
    contents = await file.read()
    temp_path = state.FRAMES_DIR / f"temp_scan_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
    pm = pipeline_mode or request.query_params.get("pipeline_mode") or (ocr_svc.active_pipeline_mode if has_gemini else "local")
    mt = ocr_svc.normalize_model_target(model_target or ("ollama" if pm == "local" or not has_gemini else ocr_svc.active_model_target) or request.query_params.get("model_target"))
    eff_engine = engine or ("local" if not has_gemini else ocr_svc.active_ocr_engine)
    if not has_gemini and eff_engine in {"gemini", "hybrid"}:
        eff_engine = "local"
    try:
        with open(temp_path, "wb") as f: f.write(contents)
        return {"status": "success", "engine": eff_engine, "model_target": mt, "pipeline_mode": pm, **state.ocr_engine.scan_image(str(temp_path))}
    finally:
        if temp_path.exists(): temp_path.unlink()

