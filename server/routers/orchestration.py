import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form

import config
import db
from models import TelemetryUpdateRequest, OrchestrationRequest, PipelineModeRequest, OcrSelectionRequest
from services import state
from services.adb_service import (
    ensure_adb_keyboard_closed,
    check_and_update_alignment,
    DEVICE_PROFILES,
    current_device_model,
)
from services.ocr_service import (
    active_pipeline_mode,
    active_model_target,
    active_ocr_engine,
    normalize_model_target,
)

router = APIRouter(tags=["Orchestration & Telemetry"])

@router.get("/api/alignment/status")
async def get_alignment_status_api():
    return state.latest_alignment_status

@router.post("/api/alignment/check")
async def trigger_alignment_check_api():
    res = await check_and_update_alignment()
    return res

@router.get("/api/telemetry")
async def get_telemetry():
    sl = state.get_serialized_lines()
    return {
        "telemetry": state.get_fresh_telemetry(),
        "token_stats": state.token_stats,
        "alignment": state.latest_alignment_status,
        "document_summary": {
            "total_lines": len(state.document_lines),
            "min_line": min(state.document_lines.keys()) if state.document_lines else 0,
            "max_line": max(state.document_lines.keys()) if state.document_lines else 0,
            "total_frames": len(state.captured_frames),
            "verified_overlap_lines": sum(1 for ln in sl if ln.get("status") == "verified_overlap"),
            "issue_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])
        }
    }

@router.post("/api/telemetry")
async def update_telemetry(p: TelemetryUpdateRequest):
    global current_device_model
    for k in ["device_id", "is_pacing", "current_page", "current_top_line", "current_bottom_line", "target_total_lines", "dwell_countdown_ms", "phase", "status_message"]:
        val = getattr(p, k)
        if val is not None:
            if k == "target_total_lines":
                if val > 0:
                    state.latest_telemetry[k] = val
                    if p_active := db.get_active_project():
                        if p_active.get("target_total_lines", 0) <= 0:
                            db.update_project_target_lines(p_active["id"], val)
            else:
                state.latest_telemetry[k] = val
    state.latest_telemetry["last_heartbeat"] = datetime.now().isoformat()
    if p.pacer_calibration:
        state.latest_telemetry["pacer_calibration"].update(p.pacer_calibration)
    if p.mobile_tokens:
        state.token_stats["mobile_tokens"] = p.mobile_tokens
    if p.current_top_line and p.current_top_line > 0:
        state.orchestration_state["top_line"] = p.current_top_line
    if p.current_bottom_line and p.current_bottom_line > 0:
        state.orchestration_state["bottom_line"] = p.current_bottom_line
        state.orchestration_state["next_target_top"] = p.current_bottom_line + 1
    if p.current_page and p.current_page > 0:
        state.orchestration_state["page"] = p.current_page

    if p.device_id:
        did = p.device_id.lower()
        if "pixel 8" in did or "pixel_8" in did:
            current_device_model = "pixel_8"
        elif "pixel 10" in did or "pixel_10" in did:
            current_device_model = "pixel_10"
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
        state.orchestration_state["device_model"] = current_device_model
        state.orchestration_state["lines_per_page"] = prof["lines_per_page"]

    if p.active_step:
        state.orchestration_state["active_step"] = p.active_step
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
    if p.is_pacing:
        state.orchestration_state["status"] = "RUNNING"
    elif p.phase == "COMPLETED":
        state.orchestration_state["status"], state.orchestration_state["active_step"] = "COMPLETED", "LOOP_EVAL"
    elif p.phase == "PAUSED":
        state.orchestration_state["status"] = "PAUSED"
    elif p.phase in ["STANDBY", "IDLE"] and state.orchestration_state["status"] == "RUNNING":
        state.orchestration_state["status"] = "IDLE"
    state.orchestration_state["updated_at"] = datetime.now().isoformat()

    await state.ws_manager.broadcast({
        "type": "orchestration_event",
        "orchestration": state.orchestration_state,
        "telemetry": state.latest_telemetry
    })
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@router.get("/api/orchestrate")
async def get_orchestration_state():
    return {"orchestration": state.orchestration_state, "telemetry": state.get_fresh_telemetry()}

@router.post("/api/orchestrate")
async def handle_orchestration_command(payload: OrchestrationRequest):
    cmd = payload.command.upper()
    invoker = state.format_device_name(payload.source)
    state.orchestration_state.update({
        "last_command": cmd,
        "source": payload.source or "web",
        "invoked_by": invoker,
        "updated_at": datetime.now().isoformat()
    })

    if cmd in ("BEGIN", "BEGIN_AUTO_FLIPPING"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"status": "RUNNING", "active_step": "SCREEN_CAPTURE", "step_label": f"Auto Flipping Started by {invoker}"})
        state.latest_telemetry.update({"is_pacing": True, "phase": "PACING", "status_message": f"Auto Flipping • Invoked by {invoker}"})
    elif cmd == "CAPTURE_DESKTOP":
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"active_step": "SCREEN_CAPTURE", "step_label": f"Repeatedly capture page 1 invoked by {invoker}"})
        state.latest_telemetry.update({"status_message": f"repeatedly capture page 1 • Invoked by {invoker}"})
    elif cmd == "GET_NEXT_LINE":
        next_ln = 1
        for f in reversed(sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
            if f.get("bottom_line", 0) > 0:
                next_ln = f["bottom_line"] + 1
                break
        if next_ln == 1 and state.document_lines:
            next_ln = max(state.document_lines.keys()) + 1
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
        profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
        lpp = profile["lines_per_page"]
        state.orchestration_state.update({
            "status": "RUNNING", "active_step": "START_READY",
            "step_label": f"Restarted at Line 1 by {invoker}",
            "top_line": 1, "bottom_line": lpp, "next_target_top": lpp + 1, "page": 1,
            "device_model": current_device_model, "lines_per_page": lpp
        })
        state.latest_telemetry.update({
            "current_page": 1, "current_top_line": 1, "current_bottom_line": 0,
            "is_pacing": True, "phase": "PACING", "status_message": f"Restarted • Invoked by {invoker}"
        })
    elif cmd in ("CALIBRATE_INSTANT", "CALIBRATE"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"active_step": "CALIBRATING", "step_label": f"Instant Calibration by {invoker}"})
        state.latest_telemetry.update({"status_message": f"Instant Calibration (Ctrl+End / Ctrl+Home) • Invoked by {invoker}"})
    elif cmd in ("ADVANCE_PAGE_ARROW", "PAGE_DOWN_ARROW"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"active_step": "PRECISION_SCROLL", "step_label": f"Arrow Step Invoked by {invoker}"})
        state.latest_telemetry.update({"status_message": f"Arrow Step Navigation • Invoked by {invoker}"})

    await state.ws_manager.broadcast({
        "type": "orchestration_event",
        "orchestration": state.orchestration_state,
        "telemetry": state.latest_telemetry
    })
    try:
        db.save_project_telemetry(state.get_current_project_id(), state.latest_telemetry, state.token_stats)
    except Exception:
        pass
    return {"status": "success", "command": cmd, "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry}

@router.get("/api/dag/status")
async def get_dag_status():
    proj = db.get_active_project()
    target_tot = proj.get("target_total_lines", 0) if proj else state.latest_telemetry.get("target_total_lines", 0)
    return {
        "status": "success",
        "dag": state.dag_state,
        "target_total_lines": target_tot,
        "current_top_line": state.latest_telemetry.get("current_top_line", 1),
        "current_bottom_line": state.latest_telemetry.get("current_bottom_line", 31),
        "current_page": state.latest_telemetry.get("current_page", 1),
        "active_node": state.dag_state.get("current_active_node", "init_end")
    }

@router.get("/api/pipeline/mode")
async def get_pipeline_mode():
    from services.ocr_service import active_pipeline_mode, active_model_target, active_ocr_engine
    return {
        "status": "success",
        "pipeline_mode": active_pipeline_mode,
        "mode": active_pipeline_mode,
        "model_target": active_model_target,
        "ocr_engine": active_ocr_engine,
        "engine": active_ocr_engine,
        "gemini_available": bool(config.GEMINI_API_KEY),
        "ollama_url": config.OLLAMA_URL,
        "ollama_vision_model": config.OLLAMA_VISION_MODEL,
        "ollama_coder_model": config.OLLAMA_CODER_MODEL,
        "ollama_model": config.OLLAMA_MODEL
    }

@router.post("/api/pipeline/mode")
async def set_pipeline_mode(req: PipelineModeRequest):
    import services.ocr_service as ocr_svc
    m = req.mode.strip().lower()
    if m not in {"cloud", "local"}:
        raise HTTPException(status_code=400, detail="Invalid pipeline mode. Must be 'cloud' or 'local'.")
    ocr_svc.active_pipeline_mode = m
    if m == "local":
        ocr_svc.active_model_target = "ollama"
        ocr_svc.active_ocr_engine = "local"
    else:
        ocr_svc.active_model_target = "gemini"
        ocr_svc.active_ocr_engine = "auto"
    payload = {
        "type": "pipeline_mode_changed",
        "pipeline_mode": ocr_svc.active_pipeline_mode,
        "mode": ocr_svc.active_pipeline_mode,
        "model_target": ocr_svc.active_model_target,
        "ocr_engine": ocr_svc.active_ocr_engine,
        "engine": ocr_svc.active_ocr_engine
    }
    await state.ws_manager.broadcast(payload)
    return {"status": "success", **payload}

@router.get("/api/ocr/engines")
async def get_ocr_engines():
    import services.ocr_service as ocr_svc
    has_gemini = bool(config.GEMINI_API_KEY)
    return {
        "engines": [
            {"id": "auto", "name": "Auto (Gemini with Local Fallback)", "available": True, "type": "auto"},
            {"id": "local", "name": "Local RapidOCR / OpenCV Engine", "available": True, "type": "local"},
            {"id": "gemini", "name": "Gemini 2.5 Cloud Vision", "available": has_gemini, "type": "cloud"},
            {"id": "hybrid", "name": "Hybrid (Gemini Text + Local Bounding Boxes)", "available": has_gemini, "type": "hybrid"}
        ],
        "active_engine": ocr_svc.active_ocr_engine,
        "model_targets": ["gemini", "ollama"],
        "active_model_target": ocr_svc.active_model_target,
        "pipeline_mode": ocr_svc.active_pipeline_mode
    }

@router.post("/api/ocr/select-engine")
async def select_ocr_engine(req: OcrSelectionRequest):
    import services.ocr_service as ocr_svc
    if req.model_target:
        ocr_svc.active_model_target = normalize_model_target(req.model_target)
    if req.engine:
        valid = {"auto", "local", "gemini", "hybrid"}
        if req.engine.lower() not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid engine '{req.engine}'. Must be one of {valid}")
        ocr_svc.active_ocr_engine = req.engine.lower()
    await state.ws_manager.broadcast({
        "type": "ocr_engine_changed",
        "active_engine": ocr_svc.active_ocr_engine,
        "active_model_target": ocr_svc.active_model_target
    })
    return {"status": "success", "active_engine": ocr_svc.active_ocr_engine, "active_model_target": ocr_svc.active_model_target}

@router.post("/api/ocr/scan-direct")
async def scan_direct(request: Request, file: UploadFile = File(...), engine: Optional[str] = Form("auto"), model_target: Optional[str] = Form(None), pipeline_mode: Optional[str] = Form(None)):
    import services.ocr_service as ocr_svc
    contents = await file.read()
    temp_path = state.FRAMES_DIR / f"temp_scan_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
    pm = pipeline_mode or request.query_params.get("pipeline_mode") or ocr_svc.active_pipeline_mode
    effective_target = model_target or ("ollama" if pm == "local" else ocr_svc.active_model_target)
    mt = normalize_model_target(effective_target or request.query_params.get("model_target"))
    try:
        with open(temp_path, "wb") as f:
            f.write(contents)
        res = state.ocr_engine.scan_image(str(temp_path))
        return {"status": "success", "engine": engine or ocr_svc.active_ocr_engine, "model_target": mt, "pipeline_mode": pm, **res}
    finally:
        if temp_path.exists():
            temp_path.unlink()
