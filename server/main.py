import os, json, glob, re, asyncio, io
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI, Request, File, UploadFile, Form, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, PlainTextResponse, JSONResponse
from pydantic import BaseModel
from PIL import Image

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

import config, db
from ocr_engine import LocalGutterOCREngine

db.init_db()
app = FastAPI(title="MatrixCapture Frame & Verification Server", version="2.5.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class WebSocketManager:
    def __init__(self): self.active: List[WebSocket] = []
    async def connect(self, ws: WebSocket): await ws.accept(); self.active.append(ws)
    def disconnect(self, ws: WebSocket):
        if ws in self.active: self.active.remove(ws)
    async def broadcast(self, message: Any):
        payload = json.dumps(message) if not isinstance(message, str) else message
        for ws in list(self.active):
            try: await ws.send_text(payload)
            except Exception: self.disconnect(ws)

ws_manager, ocr_engine = WebSocketManager(), LocalGutterOCREngine()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                if json.loads(data).get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "timestamp": datetime.now().isoformat()}))
            except Exception: pass
    except Exception: ws_manager.disconnect(websocket)

FRAMES_DIR, DOCUMENT_FILE, RECAPTURE_QUEUE_FILE = config.FRAMES_DIR, config.DOCUMENT_FILE, config.RECAPTURE_QUEUE_FILE
document_lines: Dict[int, Dict[str, Any]] = {}
captured_frames: Dict[str, Dict[str, Any]] = {}
recapture_queue: List[Dict[str, Any]] = []

token_stats: Dict[str, Any] = {
    "total_prompt_tokens": 0, "total_candidates_tokens": 0, "total_tokens": 0, "total_api_calls": 0, "estimated_cost_usd": 0.0,
    "mobile_tokens": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
}
latest_telemetry: Dict[str, Any] = {
    "device_id": "idle", "is_pacing": False, "current_page": 0, "current_top_line": 0, "current_bottom_line": 0,
    "target_total_lines": config.TARGET_TOTAL_LINES, "dwell_countdown_ms": 0, "phase": "IDLE", "status_message": "Matrix Capture Studio ready", "last_heartbeat": None,
    "pacer_calibration": {"auto_tune_factor": config.PACER_AUTO_TUNE_FACTOR, "line_pitch_px": config.PACER_LINE_PITCH_PX, "bottom_to_top_error": 0, "wrapped_lines_detected": 0}
}

def get_current_project_id() -> str: return db.get_active_project()["id"]

def load_persisted_state():
    global document_lines, captured_frames, recapture_queue, token_stats, latest_telemetry
    try:
        p = db.get_active_project(); pid = p["id"]
        document_lines = db.get_document_lines(pid)
        captured_frames = {f["frame_id"]: f for f in db.get_frames(pid)}
        tel = db.get_project_telemetry(pid)
        if tel.get("telemetry"): latest_telemetry.update(tel["telemetry"])
        if tel.get("token_stats"): token_stats.update(tel["token_stats"])
        if p.get("target_total_lines"): latest_telemetry["target_total_lines"] = p["target_total_lines"]
    except Exception as e: print(f"Error loading state from SQLite: {e}")
    if RECAPTURE_QUEUE_FILE.exists():
        try:
            with open(RECAPTURE_QUEUE_FILE, "r", encoding="utf-8") as f: recapture_queue = json.load(f)
        except Exception: pass

def save_persisted_state():
    try:
        pid = get_current_project_id()
        for fid, f in captured_frames.items():
            db.save_frame(pid, fid, f.get("filename", f"{fid}.png"), f.get("top_line", 0), f.get("bottom_line", 0), f.get("page_index", 1), f.get("file_size", 0), f.get("status", "processed"), f.get("extracted_line_count", 0), f.get("custom_offset_y", 0.0), f.get("token_usage", {}), f.get("bounding_boxes", {}), f.get("model_used", ""), f.get("created_at"))
        db.save_document_lines(pid, document_lines); db.save_project_telemetry(pid, latest_telemetry, token_stats)
        with open(DOCUMENT_FILE, "w", encoding="utf-8") as f: json.dump({"lines": {str(k): v for k, v in sorted(document_lines.items())}, "frames": captured_frames, "token_stats": token_stats, "latest_telemetry": latest_telemetry, "updated_at": datetime.now().isoformat()}, f, indent=2)
        with open(RECAPTURE_QUEUE_FILE, "w", encoding="utf-8") as f: json.dump(recapture_queue, f, indent=2)
    except Exception as e: print(f"Error saving state to SQLite: {e}")

load_persisted_state()

class ProjectCreateRequest(BaseModel): name: str; description: Optional[str] = ""; target_total_lines: Optional[int] = 0
class FramePositionRequest(BaseModel): custom_offset_y: float
class ConfigRequest(BaseModel): api_key: str
class LineEditRequest(BaseModel): text: str; status: Optional[str] = None; notes: Optional[str] = None
class FlagRequest(BaseModel): notes: str
class RecaptureRequest(BaseModel): line_number: int; reason: str
class TelemetryUpdateRequest(BaseModel):
    device_id: Optional[str] = "Pixel 10 Desktop"; is_pacing: Optional[bool] = False; current_page: Optional[int] = 0
    current_top_line: Optional[int] = 0; current_bottom_line: Optional[int] = 0; target_total_lines: Optional[int] = 0
    dwell_countdown_ms: Optional[int] = 0; phase: Optional[str] = "IDLE"; status_message: Optional[str] = ""
    active_step: Optional[str] = None; source: Optional[str] = "mobile"; mobile_tokens: Optional[Dict[str, int]] = None
    pacer_calibration: Optional[Dict[str, Any]] = None
class OrchestrationRequest(BaseModel):
    command: str; source: Optional[str] = "web"; active_step: Optional[str] = None; target_total_lines: Optional[int] = None

def format_device_name(source: Optional[str]) -> str:
    s = (source or "").lower()
    return "Web Studio 💻" if "web" in s else ("Mobile App 📱" if "mobile" in s else ("Floating HUD 🪟" if "hud" in s else ("Auto-Pacer ⚡" if "pacer" in s else ("Backend API ⚙️" if "api" in s else "System ⚙️"))))

orchestration_state: Dict[str, Any] = {
    "status": "IDLE", "last_command": "NONE", "source": "system", "invoked_by": "System ⚙️", "active_step": "START_READY",
    "step_label": "Line 1 Start Position Set (Ready to Begin)", "top_line": 1, "bottom_line": 49, "next_target_top": 50, "page": 1, "updated_at": datetime.now().isoformat()
}

async def process_frame_with_gemini(frame_id: str, image_path: Path, top_line: int, bottom_line: int):
    global document_lines, captured_frames, token_stats, latest_telemetry
    if not config.GEMINI_API_KEY:
        captured_frames[frame_id]["status"] = "awaiting_api_key"; save_persisted_state(); return
    try:
        client = genai.Client(api_key=config.GEMINI_API_KEY)
        prompt = "Extract code document lines verbatim with line numbers in left gutter. Output ONLY JSON: {\"top_gutter_line\": <int>, \"bottom_gutter_line\": <int>, \"lines\": [{\"line_number\": <int>, \"gutter_number\": <int>, \"text\": \"<verbatim>\", \"is_blank\": <bool>, \"is_wrapped\": <bool>, \"wrapped_line_count\": <int>, \"flagged\": <bool>}]}"
        pil_image = Image.open(image_path)
        response, last_error, model_used = None, None, "unknown"
        for model_name in config.get_candidate_models():
            for attempt in range(config.GEMINI_RETRY_ATTEMPTS):
                try:
                    response = client.models.generate_content(model=model_name, contents=[pil_image, prompt], config=types.GenerateContentConfig(response_mime_type="application/json"))
                    if response and response.text: model_used = model_name; break
                except Exception as ex:
                    last_error = ex
                    if "404" in str(ex).lower() or "not_found" in str(ex).lower(): break
                    if attempt < config.GEMINI_RETRY_ATTEMPTS - 1 and any(e in str(ex).lower() for e in ["503", "unavailable", "429", "high demand"]):
                        await asyncio.sleep(config.GEMINI_RETRY_BACKOFF_BASE * (attempt + 1))
                    else: break
            if response and response.text: break
        if not response or not response.text: raise last_error or RuntimeError("Gemini models failed")

        usage = getattr(response, "usage_metadata", None)
        pt, ct = getattr(usage, "prompt_token_count", 0) or 0, getattr(usage, "candidates_token_count", 0) or 0
        tt = getattr(usage, "total_token_count", 0) or (pt + ct)
        token_stats["total_prompt_tokens"] += pt; token_stats["total_candidates_tokens"] += ct
        token_stats["total_tokens"] += tt; token_stats["total_api_calls"] += 1
        token_stats["estimated_cost_usd"] = round((token_stats["total_prompt_tokens"] / 1e6 * config.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS) + (token_stats["total_candidates_tokens"] / 1e6 * config.GEMINI_PRICE_PER_MILLION_CANDIDATE_TOKENS), 6)
        captured_frames[frame_id]["token_usage"] = {"prompt_tokens": pt, "candidates_tokens": ct, "total_tokens": tt}
        captured_frames[frame_id]["model_used"] = model_used

        raw_text = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", (response.text or "{}").strip())
        parsed = json.loads(raw_text)
        top_g = parsed.get("top_gutter_line") if isinstance(parsed, dict) else None
        bot_g = parsed.get("bottom_gutter_line") if isinstance(parsed, dict) else None
        plines = parsed.get("lines", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])

        min_d, max_d, added = (int(top_g) if top_g and int(top_g) > 0 else 999999), (int(bot_g) if bot_g and int(bot_g) > 0 else 0), 0
        for item in plines:
            ln = item.get("line_number")
            if ln is None: continue
            ln = int(ln)
            text, is_blank, is_wrapped, wcount, flagged, gutter_num = item.get("text", ""), item.get("is_blank", not bool(item.get("text", "").strip())), item.get("is_wrapped", False), item.get("wrapped_line_count", 1), item.get("flagged", False), item.get("gutter_number", ln)
            min_d, max_d = min(min_d, ln), max(max_d, ln)
            st, ex, srcs = ("flagged" if flagged else "ok"), document_lines.get(ln), [frame_id]
            if ex:
                srcs = list(set(ex.get("sources", [ex.get("frame_id", frame_id)]) + [frame_id]))
                st = "verified_overlap" if ex.get("text") == text else "overlap_conflict"
            document_lines[ln] = {"line_number": ln, "gutter_number": gutter_num, "text": text, "is_blank": is_blank, "is_wrapped": is_wrapped, "wrapped_line_count": wcount, "status": st, "frame_id": frame_id, "sources": srcs, "confidence": 1.0 if st != "flagged" else 0.75, "notes": "Verified by Gemini Vision OCR" if st != "overlap_conflict" else f"Differs between frames {srcs}", "updated_at": datetime.now().isoformat()}
            added += 1

        if min_d <= max_d and min_d < 999999:
            captured_frames[frame_id]["top_line"], captured_frames[frame_id]["bottom_line"] = min_d, max_d
            latest_telemetry["current_top_line"], latest_telemetry["current_bottom_line"] = min_d, max_d
        elif top_g and bot_g:
            captured_frames[frame_id]["top_line"], captured_frames[frame_id]["bottom_line"] = int(top_g), int(bot_g)
            latest_telemetry["current_top_line"], latest_telemetry["current_bottom_line"] = int(top_g), int(bot_g)
        captured_frames[frame_id]["status"], captured_frames[frame_id]["extracted_line_count"] = "processed", added

        if document_lines:
            for chk in range(min(document_lines.keys()), max(document_lines.keys()) + 1):
                if chk not in document_lines:
                    document_lines[chk] = {"line_number": chk, "gutter_number": chk, "text": "", "is_blank": False, "is_wrapped": False, "wrapped_line_count": 1, "status": "missing", "frame_id": frame_id, "sources": [], "confidence": 0.0, "notes": "Gap detected between frames", "updated_at": datetime.now().isoformat()}
    except Exception as e:
        print(f"Error processing frame {frame_id} with Gemini: {e}")
        captured_frames[frame_id]["status"] = f"error: {str(e)}"
    finally: save_persisted_state()

@app.get("/api/health")
async def health():
    return {"status": "healthy", "has_api_key": bool(config.GEMINI_API_KEY), "total_lines": len(document_lines), "total_frames": len(captured_frames), "pending_recaptures": len(recapture_queue), "token_stats": token_stats, "is_pacing": latest_telemetry.get("is_pacing", False)}

@app.get("/api/config")
async def get_config():
    k = config.GEMINI_API_KEY; return {"api_key_configured": bool(k), "api_key_preview": f"{k[:6]}...{k[-4:]}" if len(k) > 10 else ("Set" if k else "Missing")}

@app.post("/api/config")
async def set_config(req: ConfigRequest):
    config.set_api_key(req.api_key); return {"status": "success", "message": "API key updated."}

@app.get("/api/token-stats")
async def get_token_stats():
    return {"server_tokens": {"prompt_tokens": token_stats.get("total_prompt_tokens", 0), "candidates_tokens": token_stats.get("total_candidates_tokens", 0), "total_tokens": token_stats.get("total_tokens", 0), "api_calls": token_stats.get("total_api_calls", 0), "estimated_cost_usd": token_stats.get("estimated_cost_usd", 0.0)}, "mobile_tokens": token_stats.get("mobile_tokens", {}), "total_tokens": token_stats.get("total_tokens", 0) + token_stats.get("mobile_tokens", {}).get("total_tokens", 0)}

def get_fresh_telemetry() -> Dict[str, Any]:
    t = dict(latest_telemetry); hb = t.get("last_heartbeat")
    if not hb or (datetime.now() - datetime.fromisoformat(hb)).total_seconds() >= 4.0:
        t["is_pacing"], t["dwell_countdown_ms"], t["phase"] = False, 0, "STANDBY"
        if t.get("status_message") in ["Testing Telemetry Sync", "Idle", "Ready"]: t["status_message"] = "Pacer Standby / Awaiting Device Connection"
    return t

@app.get("/api/telemetry")
async def get_telemetry():
    sl = [document_lines[k] for k in sorted(document_lines.keys())]
    return {"telemetry": get_fresh_telemetry(), "token_stats": token_stats, "document_summary": {"total_lines": len(document_lines), "min_line": min(document_lines.keys()) if document_lines else 0, "max_line": max(document_lines.keys()) if document_lines else 0, "total_frames": len(captured_frames), "verified_overlap_lines": sum(1 for ln in sl if ln.get("status") == "verified_overlap"), "issue_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])}}

@app.post("/api/telemetry")
async def update_telemetry(p: TelemetryUpdateRequest):
    global latest_telemetry, token_stats, orchestration_state
    for k in ["device_id", "is_pacing", "current_page", "current_top_line", "current_bottom_line", "target_total_lines", "dwell_countdown_ms", "phase", "status_message"]:
        val = getattr(p, k)
        if val is not None: latest_telemetry[k] = val
    latest_telemetry["last_heartbeat"] = datetime.now().isoformat()
    if p.pacer_calibration: latest_telemetry["pacer_calibration"].update(p.pacer_calibration)
    if p.mobile_tokens: token_stats["mobile_tokens"] = p.mobile_tokens
    if p.source: orchestration_state["source"], orchestration_state["invoked_by"] = p.source, format_device_name(p.source)
    if p.current_top_line and p.current_top_line > 0: orchestration_state["top_line"] = p.current_top_line
    if p.current_bottom_line and p.current_bottom_line > 0: orchestration_state["bottom_line"], orchestration_state["next_target_top"] = p.current_bottom_line, p.current_bottom_line + 1
    if p.current_page and p.current_page > 0: orchestration_state["page"] = p.current_page

    if p.active_step: orchestration_state["active_step"] = p.active_step
    elif p.phase:
        pu = p.phase.upper()
        orchestration_state["active_step"] = "SCREEN_CAPTURE" if ("CAPTURING" in pu or "SCREEN" in pu) else ("OCR_BOUNDS" if ("OCR" in pu or "BOUNDS" in pu) else ("PRECISION_SCROLL" if ("SCROLL" in pu or "PACING" in pu or "ALIGN" in pu) else ("DWELL_FREEZE" if ("DWELL" in pu or "FREEZE" in pu) else ("START_READY" if ("READY" in pu or "STANDBY" in pu) else orchestration_state["active_step"]))))
    if p.status_message: orchestration_state["step_label"] = p.status_message
    if p.is_pacing: orchestration_state["status"] = "RUNNING"
    elif p.phase == "COMPLETED": orchestration_state["status"], orchestration_state["active_step"] = "COMPLETED", "LOOP_EVAL"
    elif p.phase == "PAUSED": orchestration_state["status"] = "PAUSED"
    elif p.phase in ["STANDBY", "IDLE"] and orchestration_state["status"] == "RUNNING": orchestration_state["status"] = "IDLE"
    orchestration_state["updated_at"] = datetime.now().isoformat()

    await ws_manager.broadcast({"type": "orchestration_event", "orchestration": orchestration_state, "telemetry": latest_telemetry})
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/api/orchestrate")
async def get_orchestration_state(): return {"orchestration": orchestration_state, "telemetry": get_fresh_telemetry()}

@app.post("/api/orchestrate")
async def handle_orchestration_command(payload: OrchestrationRequest):
    global latest_telemetry, orchestration_state
    cmd, invoker = payload.command.upper(), format_device_name(payload.source)
    orchestration_state.update({"last_command": cmd, "source": payload.source or "web", "invoked_by": invoker, "updated_at": datetime.now().isoformat()})

    if cmd == "BEGIN":
        orchestration_state.update({"status": "RUNNING", "active_step": "SCREEN_CAPTURE", "step_label": f"Orchestration Started by {invoker}"})
        latest_telemetry.update({"is_pacing": True, "phase": "PACING", "status_message": f"Running • Invoked by {invoker}"})
    elif cmd == "PAUSE":
        orchestration_state.update({"status": "PAUSED", "step_label": f"Paused by {invoker}"})
        latest_telemetry.update({"is_pacing": False, "phase": "PAUSED", "status_message": f"Paused • Invoked by {invoker}"})
    elif cmd == "RESUME":
        orchestration_state.update({"status": "RUNNING", "active_step": "PRECISION_SCROLL", "step_label": f"Resumed by {invoker}"})
        latest_telemetry.update({"is_pacing": True, "phase": "PACING", "status_message": f"Running • Invoked by {invoker}"})
    elif cmd == "END":
        orchestration_state.update({"status": "COMPLETED", "active_step": "LOOP_EVAL", "step_label": f"Ended by {invoker}"})
        latest_telemetry.update({"is_pacing": False, "phase": "COMPLETED", "status_message": f"Completed • Invoked by {invoker}"})
    elif cmd == "RESTART":
        orchestration_state.update({"status": "RUNNING", "active_step": "START_READY", "step_label": f"Restarted at Line 1 by {invoker}", "top_line": 1, "bottom_line": 49, "next_target_top": 50, "page": 1})
        latest_telemetry.update({"current_page": 1, "current_top_line": 1, "current_bottom_line": 0, "is_pacing": True, "phase": "PACING", "status_message": f"Restarted • Invoked by {invoker}"})

    await ws_manager.broadcast({"type": "orchestration_event", "orchestration": orchestration_state, "telemetry": latest_telemetry})
    try: db.save_project_telemetry(get_current_project_id(), latest_telemetry, token_stats)
    except Exception: pass
    return {"status": "success", "command": cmd, "orchestration": orchestration_state, "telemetry": latest_telemetry}

@app.post("/api/upload-frame")
async def upload_frame(background_tasks: BackgroundTasks, file: UploadFile = File(...), top_line: Optional[int] = Form(0), bottom_line: Optional[int] = Form(0), page_index: Optional[int] = Form(0), sync: Optional[bool] = Form(True)):
    contents = await file.read()
    now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
    pidx = page_index if page_index and page_index > 0 else len(captured_frames) + 1
    fid = f"frame_{top_line:05d}_{bottom_line:05d}" if top_line and top_line > 0 and bottom_line and bottom_line > 0 else f"frame_p{pidx:03d}_{now_str}"
    fn = f"{fid}.png"; tpath = FRAMES_DIR / fn
    with open(tpath, "wb") as f: f.write(contents)

    captured_frames[fid] = {"frame_id": fid, "filename": fn, "top_line": top_line or 0, "bottom_line": bottom_line or 0, "page_index": pidx, "file_size": len(contents), "status": "awaiting_review" if not sync else "queued", "created_at": datetime.now().isoformat(), "extracted_line_count": 0, "token_usage": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}}
    save_persisted_state()
    await ws_manager.broadcast({"type": "new_frame", "frame": captured_frames[fid]})

    if sync:
        await process_frame_with_gemini(fid, tpath, top_line or 0, bottom_line or 0)
        cf = captured_frames[fid]
        return {"status": "success", "frame_id": fid, "page_index": pidx, "top_line": cf.get("top_line", 0), "bottom_line": cf.get("bottom_line", 0), "extracted_line_count": cf.get("extracted_line_count", 0), "message": f"Frame stored and verified: Lines {cf.get('top_line', 0)} → {cf.get('bottom_line', 0)}."}
    return {"status": "success", "frame_id": fid, "page_index": pidx, "top_line": top_line or 0, "bottom_line": bottom_line or 0, "extracted_line_count": 0, "message": f"Frame {fid} received and awaiting review."}

@app.get("/api/next-page-line")
async def get_next_page_line():
    last_bottom = 0
    for f in reversed(sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
        if f.get("bottom_line", 0) > 0: last_bottom = f["bottom_line"]; break
    if last_bottom == 0 and document_lines: last_bottom = max(document_lines.keys())
    return {"status": "success", "next_page_first_line": (last_bottom + 1) if last_bottom > 0 else 1, "last_bottom_line": last_bottom, "total_frames": len(captured_frames)}

@app.post("/api/frames/{frame_id}/scan")
async def scan_frame_ocr(frame_id: str):
    if frame_id not in captured_frames: raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    finfo = captured_frames[frame_id]
    ipath = FRAMES_DIR / finfo.get("filename", f"{frame_id}.png")
    if not ipath.exists():
        matches = list(FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches: ipath = matches[0]
        else: raise HTTPException(status_code=404, detail="Frame image file not found")
    try:
        res = ocr_engine.scan_image(str(ipath))
        top_ln, bot_ln, lines = res.get("top_line", 0), res.get("bottom_line", 0), res.get("lines", [])
        finfo.update({"top_line": top_ln, "bottom_line": bot_ln, "extracted_line_count": len(lines), "status": "processed", "bounding_boxes": res.get("bounding_boxes", {})})
        for item in lines:
            if item.get("line_number"):
                ln = int(item["line_number"])
                document_lines[ln] = {"line_number": ln, "gutter_number": ln, "text": item.get("text", ""), "is_blank": item.get("is_blank", False), "is_wrapped": item.get("is_wrapped", False), "wrapped_line_count": item.get("wrapped_line_count", 1), "status": "verified", "frame_id": frame_id, "sources": [frame_id], "confidence": item.get("confidence", 0.98), "notes": "Ollama minicpm-v gutter OCR", "updated_at": datetime.now().isoformat()}
        save_persisted_state()
        data = {"status": "success", "frame_id": frame_id, "top_line": top_ln, "bottom_line": bot_ln, "extracted_line_count": len(lines), "bounding_boxes": res.get("bounding_boxes", {}), "lines": lines}
        await ws_manager.broadcast({"type": "ocr_completed", **data})
        return data
    except Exception as e:
        finfo["status"] = f"error: {str(e)}"; save_persisted_state()
        raise HTTPException(status_code=500, detail=f"OCR scan failed: {str(e)}")

@app.get("/api/projects")
async def list_projects(): return db.get_projects()

@app.get("/api/projects/active")
async def get_active_project(): return db.get_active_project()

@app.post("/api/projects")
async def create_project(req: ProjectCreateRequest):
    new_proj = db.create_project(name=req.name, description=req.description or "", target_total_lines=req.target_total_lines or 0)
    load_persisted_state(); await ws_manager.broadcast({"type": "project_switched", "project": new_proj})
    return new_proj

@app.post("/api/projects/{project_id}/activate")
async def activate_project(project_id: str):
    if not db.activate_project(project_id): raise HTTPException(status_code=404, detail="Project not found")
    load_persisted_state(); proj = db.get_project(project_id)
    await ws_manager.broadcast({"type": "project_switched", "project": proj})
    return {"status": "success", "project": proj}

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    if not db.delete_project(project_id): raise HTTPException(status_code=404, detail="Project not found")
    load_persisted_state(); active_proj = db.get_active_project()
    await ws_manager.broadcast({"type": "project_switched", "project": active_proj})
    return {"status": "success", "active_project": active_proj}

@app.post("/api/projects/{project_id}/abort")
async def abort_project(project_id: str):
    if not db.abort_project(project_id): raise HTTPException(status_code=404, detail="Project not found")
    load_persisted_state(); active_proj = db.get_active_project()
    await ws_manager.broadcast({"type": "project_aborted", "project_id": project_id, "active_project": active_proj})
    return {"status": "success", "message": f"Project '{project_id}' aborted and data cleared."}

@app.post("/api/projects/{project_id}/clear")
async def clear_project_data(project_id: str):
    if not db.clear_project_data(project_id): raise HTTPException(status_code=404, detail="Project not found")
    load_persisted_state(); active_proj = db.get_active_project()
    await ws_manager.broadcast({"type": "project_cleared", "project_id": project_id, "active_project": active_proj})
    return {"status": "success", "message": f"Project '{project_id}' data cleared."}

@app.patch("/api/frames/{frame_id}/position")
async def update_frame_position(frame_id: str, req: FramePositionRequest):
    if not db.update_frame_position(frame_id, req.custom_offset_y): raise HTTPException(status_code=404, detail="Frame not found")
    if frame_id in captured_frames: captured_frames[frame_id]["custom_offset_y"] = req.custom_offset_y
    await ws_manager.broadcast({"type": "frame_position_updated", "frame_id": frame_id, "custom_offset_y": req.custom_offset_y})
    return {"status": "success", "frame_id": frame_id, "custom_offset_y": req.custom_offset_y}

@app.get("/api/frames")
async def get_frames(): return db.get_frames(get_current_project_id())

@app.get("/api/frames/{frame_id}/image")
async def get_frame_image(frame_id: str):
    path = FRAMES_DIR / f"{frame_id}.png"
    if not path.exists():
        matches = list(FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches: path = matches[0]
        else: raise HTTPException(status_code=404, detail="Frame image not found")
    return FileResponse(path, media_type="image/png")

@app.post("/api/frames/{frame_id}/reprocess")
async def reprocess_frame(frame_id: str, background_tasks: BackgroundTasks):
    if frame_id not in captured_frames: raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    finfo = captured_frames[frame_id]; ipath = FRAMES_DIR / finfo.get("filename", f"{frame_id}.png")
    if not ipath.exists():
        matches = list(FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches: ipath = matches[0]
        else: raise HTTPException(status_code=404, detail="Frame image file not found")
    captured_frames[frame_id]["status"] = "queued"; save_persisted_state()
    background_tasks.add_task(process_frame_with_gemini, frame_id, ipath, finfo.get("top_line", 0), finfo.get("bottom_line", 0))
    return {"status": "success", "message": f"Reprocessing scheduled for frame {frame_id}"}

@app.post("/api/reprocess-failed")
async def reprocess_failed(background_tasks: BackgroundTasks):
    reprocessed = []
    for f_id, f_info in captured_frames.items():
        if f_info.get("status", "").startswith("error") or f_info.get("extracted_line_count", 0) == 0:
            ipath = FRAMES_DIR / f_info.get("filename", f"{f_id}.png")
            if not ipath.exists():
                m = list(FRAMES_DIR.glob(f"*{f_id}*.png"))
                if m: ipath = m[0]
            if ipath.exists():
                f_info["status"] = "queued"
                background_tasks.add_task(process_frame_with_gemini, f_id, ipath, f_info.get("top_line", 0), f_info.get("bottom_line", 0))
                reprocessed.append(f_id)
    save_persisted_state()
    return {"status": "success", "reprocessed_frames": reprocessed, "count": len(reprocessed)}

@app.get("/api/document")
async def get_document():
    sl = [document_lines[k] for k in sorted(document_lines.keys())]
    issues = [item for item in sl if item.get("status") in ["flagged", "missing", "overlap_conflict"]]
    return {"total_lines": len(document_lines), "min_line": min(document_lines.keys()) if document_lines else 0, "max_line": max(document_lines.keys()) if document_lines else 0, "total_frames": len(captured_frames), "issue_count": len(issues), "token_stats": token_stats, "latest_telemetry": get_fresh_telemetry(), "issues": issues, "lines": sl}

@app.post("/api/lines/{line_number}/edit")
async def edit_line(line_number: int, req: LineEditRequest):
    if line_number not in document_lines:
        document_lines[line_number] = {"line_number": line_number, "gutter_number": line_number, "text": req.text, "is_blank": not bool(req.text.strip()), "is_wrapped": False, "wrapped_line_count": 1, "status": req.status or "manually_edited", "frame_id": "manual", "sources": ["manual"], "confidence": 1.0, "notes": req.notes or "Manually inserted", "updated_at": datetime.now().isoformat()}
    else:
        document_lines[line_number]["text"] = req.text
        document_lines[line_number]["status"] = req.status or "manually_edited"
        if req.notes: document_lines[line_number]["notes"] = req.notes
        document_lines[line_number]["updated_at"] = datetime.now().isoformat()
    save_persisted_state()
    return {"status": "success", "line": document_lines[line_number]}

@app.post("/api/lines/{line_number}/flag")
async def flag_line(line_number: int, req: FlagRequest):
    if line_number not in document_lines: raise HTTPException(status_code=404, detail="Line not found")
    document_lines[line_number].update({"status": "flagged", "notes": req.notes, "updated_at": datetime.now().isoformat()})
    save_persisted_state(); return {"status": "success", "line": document_lines[line_number]}

@app.post("/api/lines/{line_number}/request-recapture")
async def request_recapture(line_number: int, req: RecaptureRequest):
    item = {"line_number": line_number, "reason": req.reason, "requested_at": datetime.now().isoformat()}
    recapture_queue.append(item)
    if line_number in document_lines: document_lines[line_number]["status"] = "recapturing"
    save_persisted_state(); return {"status": "queued", "item": item, "queue_size": len(recapture_queue)}

@app.get("/api/recapture-queue")
async def get_recapture_queue(): return recapture_queue

@app.post("/api/recapture-completed")
async def recapture_completed(req: RecaptureRequest):
    global recapture_queue
    recapture_queue = [q for q in recapture_queue if q.get("line_number") != req.line_number]
    save_persisted_state(); return {"status": "success", "remaining": len(recapture_queue)}

@app.get("/api/export-json")
async def export_json():
    sl = [document_lines[k] for k in sorted(document_lines.keys())]
    payload = {"schema_version": "2.5.0", "exported_at": datetime.now().isoformat(), "document_metadata": {"total_lines": len(document_lines), "min_line": min(document_lines.keys()) if document_lines else 0, "max_line": max(document_lines.keys()) if document_lines else 0, "total_frames": len(captured_frames), "token_stats": token_stats, "issues_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])}, "frames": captured_frames, "lines": sl}
    return JSONResponse(content=payload, headers={"Content-Disposition": "attachment; filename=matrix_document_vfs_monaco.json"})

@app.get("/api/export-markdown")
async def export_markdown():
    if not document_lines: return PlainTextResponse("# Matrix Document\n\n(No lines transcribed yet)")
    return PlainTextResponse("\n".join(document_lines[k].get("text", "") for k in sorted(document_lines.keys())), headers={"Content-Disposition": "attachment; filename=Matrix_main_transcribed.md"})

@app.get("/api/spliced-document-image")
async def get_spliced_document_image():
    valid = []
    for f in db.get_frames(get_current_project_id()):
        p = FRAMES_DIR / f.get("filename", f"{f.get('frame_id')}.png")
        if not p.exists():
            m = list(FRAMES_DIR.glob(f"*{f.get('frame_id')}*.png"))
            if m: p = m[0]
            else: continue
        valid.append((f, p))
    if not valid:
        buf = io.BytesIO(); Image.new("RGB", (1920, 300), color=(13, 17, 23)).save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")

    slices, prev_b, max_w, tot_h = [], 0, 0, 0
    for idx, (fmeta, ipath) in enumerate(valid):
        try:
            img = Image.open(ipath).convert("RGB"); w, h = img.size; max_w = max(max_w, w)
            top_l, bot_l = fmeta.get("top_line", 0) or 0, fmeta.get("bottom_line", 0) or 0
            lcount = bot_l - top_l + 1 if bot_l >= top_l and top_l > 0 else 0
            crop_t = 0
            if idx > 0 and prev_b > 0 and top_l > 0 and top_l <= prev_b:
                ol = prev_b - top_l + 1
                crop_t = min(int(ol * (h / max(lcount, 1) if lcount > 0 else 32.0)), h - 100)
            crop_t = max(0, min(crop_t + int(fmeta.get("custom_offset_y", 0.0) or 0), h - 50))
            sl = img.crop((0, crop_t, w, h)) if crop_t > 0 else img
            slices.append(sl); tot_h += sl.height
            if bot_l > 0: prev_b = bot_l
        except Exception: pass
    if not slices: raise HTTPException(status_code=404, detail="No valid frame images to splice")

    canvas, cur_y = Image.new("RGB", (max_w, tot_h), color=(13, 17, 23)), 0
    for sl in slices: canvas.paste(sl, (0, cur_y)); cur_y += sl.height
    buf = io.BytesIO(); canvas.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Content-Disposition": "inline; filename=spliced_document.png"})

class ResetStateRequest(BaseModel): target_total_lines: Optional[int] = 0

@app.post("/api/reset-state")
async def reset_state(payload: Optional[ResetStateRequest] = None):
    global document_lines, captured_frames, recapture_queue, token_stats, latest_telemetry
    tlines = payload.target_total_lines if payload and payload.target_total_lines is not None else config.TARGET_TOTAL_LINES
    document_lines, captured_frames, recapture_queue = {}, {}, []
    token_stats = {"total_prompt_tokens": 0, "total_candidates_tokens": 0, "total_tokens": 0, "total_api_calls": 0, "estimated_cost_usd": 0.0, "mobile_tokens": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}}
    latest_telemetry = {"device_id": "idle", "is_pacing": False, "current_page": 0, "current_top_line": 0, "current_bottom_line": 0, "target_total_lines": tlines, "dwell_countdown_ms": 0, "phase": "IDLE", "status_message": "Matrix Capture Studio ready", "last_heartbeat": None, "pacer_calibration": {"auto_tune_factor": config.PACER_AUTO_TUNE_FACTOR, "line_pitch_px": config.PACER_LINE_PITCH_PX, "bottom_to_top_error": 0, "wrapped_lines_detected": 0}}
    try:
        for f in FRAMES_DIR.glob("*.png"):
            try: f.unlink()
            except Exception: pass
    except Exception: pass
    save_persisted_state()
    return {"status": "success", "message": f"Reset to clean state (target {tlines} lines)."}

if __name__ == "__main__":
    import uvicorn, sys
    try: uvicorn.run(app, host=config.SERVER_HOST, port=config.SERVER_PORT)
    except OSError as e:
        if getattr(e, 'winerror', None) == 10048 or getattr(e, 'errno', None) == 10048:
            print(f"[ERROR] Port {config.SERVER_PORT} is in use."); sys.exit(1)
        else: raise
