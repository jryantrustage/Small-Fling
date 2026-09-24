import asyncio
import json
import sys
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import config
import db
from models import ConfigRequest, ResetStateRequest
from services import state
from services.adb_service import (
    ensure_adb_keyboard_closed,
    alignment_monitor_loop,
)
from services.ocr_service import (
    check_ollama_status,
    active_pipeline_mode,
    active_model_target,
    active_ocr_engine,
    connection_stats,
)
from routers import (
    device,
    navigation,
    projects,
    frames_document,
    orchestration,
    classifiers,
    kiosk,
)

from contextlib import asynccontextmanager

db.init_db()

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        asyncio.create_task(ensure_adb_keyboard_closed())
        asyncio.create_task(alignment_monitor_loop())
    except Exception:
        pass
    yield

app = FastAPI(title="MatrixCapture Frame & Verification Server", version="2.5.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await state.ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                if json.loads(data).get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "timestamp": datetime.now().isoformat()}))
            except Exception:
                pass
    except Exception:
        state.ws_manager.disconnect(websocket)

# ─── CORE SYSTEM ENDPOINTS ──────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "has_api_key": bool(config.GEMINI_API_KEY),
        "total_lines": len(state.document_lines),
        "total_frames": len(state.captured_frames),
        "pending_recaptures": len(state.recapture_queue),
        "token_stats": state.token_stats,
        "is_pacing": state.latest_telemetry.get("is_pacing", False)
    }

@app.get("/api/status")
async def get_system_status():
    ollama_status = await asyncio.to_thread(check_ollama_status)
    p = db.get_active_project()
    return {
        "status": "online",
        "timestamp": datetime.now().isoformat(),
        "active_project": p,
        "pipeline_mode": active_pipeline_mode,
        "model_target": active_model_target,
        "ocr_engine": active_ocr_engine,
        "models": {
            "ollama_vision_model": config.OLLAMA_VISION_MODEL,
            "ollama_coder_model": config.OLLAMA_CODER_MODEL,
            "gemini_primary_model": config.GEMINI_PRIMARY_MODEL
        },
        "ollama": {
            "available": ollama_status["available"],
            "url": config.OLLAMA_URL,
            "vision_model": config.OLLAMA_VISION_MODEL,
            "coder_model": config.OLLAMA_CODER_MODEL,
            "latency_ms": ollama_status["latency_ms"],
            "models": ollama_status["models"],
            "error": ollama_status["error"]
        },
        "gemini": {
            "configured": bool(config.GEMINI_API_KEY),
            "api_key_preview": config.get_api_key_preview()
        },
        "metrics": state.get_document_metrics(),
        "telemetry": state.get_fresh_telemetry(),
        "token_stats": state.token_stats,
        "connection_stats": connection_stats,
        "stitching_stats": state.ocr_engine.stitcher.stitch_stats if hasattr(state.ocr_engine, "stitcher") else {}
    }

@app.get("/api/config")
async def get_config():
    return {
        "api_key_configured": bool(config.GEMINI_API_KEY),
        "api_key_preview": config.get_api_key_preview()
    }

@app.post("/api/config")
async def set_config(req: ConfigRequest):
    config.set_api_key(req.api_key)
    return {"status": "success", "message": "API key updated."}

@app.get("/api/token-stats")
async def get_token_stats():
    return {
        "server_tokens": {
            "prompt_tokens": state.token_stats.get("total_prompt_tokens", 0),
            "candidates_tokens": state.token_stats.get("total_candidates_tokens", 0),
            "total_tokens": state.token_stats.get("total_tokens", 0),
            "api_calls": state.token_stats.get("total_api_calls", 0),
            "estimated_cost_usd": state.token_stats.get("estimated_cost_usd", 0.0)
        },
        "mobile_tokens": state.token_stats.get("mobile_tokens", {}),
        "total_tokens": state.token_stats.get("total_tokens", 0) + state.token_stats.get("mobile_tokens", {}).get("total_tokens", 0)
    }

@app.post("/api/reset-state")
async def reset_state(payload: Optional[ResetStateRequest] = None):
    tlines = payload.target_total_lines if payload and payload.target_total_lines is not None else config.TARGET_TOTAL_LINES
    state.document_lines.clear()
    state.captured_frames.clear()
    state.recapture_queue.clear()
    state.token_stats.update({
        "total_prompt_tokens": 0, "total_candidates_tokens": 0, "total_tokens": 0,
        "total_api_calls": 0, "estimated_cost_usd": 0.0,
        "mobile_tokens": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
    })
    state.latest_telemetry.update({
        "device_id": "idle", "is_pacing": False, "current_page": 0,
        "current_top_line": 0, "current_bottom_line": 0, "target_total_lines": tlines,
        "dwell_countdown_ms": 0, "phase": "IDLE", "status_message": "Matrix Capture Studio ready",
        "last_heartbeat": None
    })
    # Reset DAG nodes to clean idle state
    if "nodes" in state.dag_state:
        state.dag_state["nodes"]["init_end"].update({"status": "idle", "total_lines": tlines})
        state.dag_state["nodes"]["reset_home"].update({"status": "idle", "verified": False})
        state.dag_state["nodes"]["frame_acquire"].update({"status": "idle", "page": 1})
        state.dag_state["nodes"]["arrow_down"].update({"status": "idle"})
        state.dag_state["nodes"]["verification_trigger"].update({"status": "idle", "loop_count": 0, "is_complete": False})
    state.dag_state["current_active_node"] = "init_end"
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "telemetry": state.latest_telemetry})

    state.save_persisted_state()
    return {"status": "success", "message": f"Reset to clean state (target {tlines} lines)."}

# ─── ROUTER MOUNTING ────────────────────────────────────────────────────────

app.include_router(device.router)
app.include_router(navigation.router)
app.include_router(projects.router)
app.include_router(frames_document.router)
app.include_router(orchestration.router)
app.include_router(classifiers.router)
app.include_router(kiosk.router)

if __name__ == "__main__":
    import uvicorn
    try:
        uvicorn.run("main:app", host=config.SERVER_HOST, port=config.SERVER_PORT, reload=True)
    except OSError as e:
        if getattr(e, 'winerror', None) in (10048, 10013) or getattr(e, 'errno', None) in (10048, 10013):
            print(f"[ERROR] Port {config.SERVER_PORT} is in use or blocked by access permissions.")
            sys.exit(1)
        else:
            raise
