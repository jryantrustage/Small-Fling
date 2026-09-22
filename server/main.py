import os, json, glob, re, asyncio, io, base64, hashlib, shutil, subprocess, urllib.request
ADB_BIN = shutil.which("adb") or shutil.which("adb.exe") or "adb.exe"

def _exec_adb_sync(args: list, timeout: float = 10.0) -> subprocess.CompletedProcess:
    return subprocess.run([ADB_BIN] + args, capture_output=True, text=True, timeout=timeout, errors="ignore")

def _exec_adb_sync_bin(args: list, timeout: float = 12.0) -> subprocess.CompletedProcess:
    return subprocess.run([ADB_BIN] + args, capture_output=True, timeout=timeout)
from pathlib import Path
from typing import List, Optional, Dict, Any, Literal, Tuple
from datetime import datetime

from fastapi import FastAPI, Request, File, UploadFile, Form, Query, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, PlainTextResponse, JSONResponse
from pydantic import BaseModel
from PIL import Image

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

from concurrent.futures import ProcessPoolExecutor
import config, db
from ocr_engine import LocalGutterOCREngine, worker_scan_image, worker_detect_last_line, worker_verify_first_line

db.init_db()
app = FastAPI(title="MatrixCapture Frame & Verification Server", version="2.5.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

ocr_executor = ProcessPoolExecutor(max_workers=2)

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

ws_manager = WebSocketManager()
ocr_engine = LocalGutterOCREngine(
    ollama_url=config.OLLAMA_URL,
    ollama_vision_model=config.OLLAMA_VISION_MODEL,
    ollama_coder_model=config.OLLAMA_CODER_MODEL,
    ollama_timeout=config.OLLAMA_TIMEOUT
)
active_ocr_engine: str = "auto"
active_model_target: str = "gemini"
active_pipeline_mode: str = "cloud"

# Directed Acyclic Graph (DAG) state for deterministic markdown pagination
dag_state: Dict[str, Any] = {
    "nodes": {
        "init_end": {"id": "init_end", "title": "1. End Scan (Ctrl+End)", "status": "idle", "total_lines": 0},
        "reset_home": {"id": "reset_home", "title": "2. Home Reset (Ctrl+Home)", "status": "idle", "verified": False},
        "frame_acquire": {"id": "frame_acquire", "title": "3. Frame Acquisition", "status": "idle", "page": 1, "keyboard_closed": True},
        "arrow_down": {"id": "arrow_down", "title": "4. Arrow Down Step", "status": "idle", "arrow_count": 48},
        "verification_trigger": {"id": "verification_trigger", "title": "5. Verification Trigger", "status": "idle", "loop_count": 0, "is_complete": False}
    },
    "current_active_node": "init_end",
    "last_trigger_evaluation": None
}

async def detect_last_line_in_process(image_path: Path) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_detect_last_line, str(image_path))

async def verify_first_line_in_process(image_path: Path) -> Tuple[bool, int]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_verify_first_line, str(image_path))

async def scan_image_in_process(image_path: Path) -> Dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_scan_image, str(image_path), config.OLLAMA_URL, config.OLLAMA_VISION_MODEL, 15)

connection_stats: Dict[str, Any] = {
    "total_http_requests": 0, "http_errors_count": 0, "last_connection_error": None,
    "last_error_timestamp": None, "ollama_available": False, "ollama_latency_ms": None,
    "gemini_available": bool(config.GEMINI_API_KEY)
}

def check_ollama_status() -> Dict[str, Any]:
    url = f"{config.OLLAMA_URL.rstrip('/')}/api/tags"
    try:
        req = urllib.request.Request(url)
        t0 = datetime.now()
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            lat = int((datetime.now() - t0).total_seconds() * 1000)
            models = [m.get("name") for m in data.get("models", [])]
            connection_stats["ollama_available"] = True
            connection_stats["ollama_latency_ms"] = lat
            return {"available": True, "models": models, "latency_ms": lat, "error": None}
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, Exception) as e:
        connection_stats["ollama_available"] = False
        connection_stats["http_errors_count"] += 1
        connection_stats["last_connection_error"] = str(e)
        connection_stats["last_error_timestamp"] = datetime.now().isoformat()
        return {"available": False, "models": [], "latency_ms": None, "error": str(e)}

def normalize_model_target(target: Optional[str]) -> str:
    if not target: return active_model_target
    t = target.strip().lower()
    if t not in {"gemini", "ollama"}:
        raise HTTPException(status_code=400, detail=f"Invalid model_target '{target}'. Must be 'gemini' or 'ollama'.")
    return t

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

class MasterLine(str):
    def __new__(cls, text: str = "", **meta):
        s = super().__new__(cls, str(text) if text is not None else "")
        s.meta = dict(meta)
        return s
    def get(self, key, default=None):
        if key == "text": return str(self)
        if key == "line_number": return self.meta.get("line_number", 0)
        return self.meta.get(key, default)
    def __getitem__(self, item):
        if isinstance(item, str):
            if item == "text": return str(self)
            return self.meta.get(item)
        return super().__getitem__(item)
    def update(self, d: dict):
        self.meta.update(d)
    def to_dict(self) -> dict:
        d = dict(self.meta)
        d["text"] = str(self)
        d.setdefault("line_number", 0)
        d.setdefault("status", "ok")
        return d

class MasterDocumentLines(dict):
    """
    Master document lines dictionary keyed by integer line number for automatic deduplication
    across overlapping page swipes. Maintains document_lines: Dict[int, str] while supporting rich metadata.
    """
    def __setitem__(self, key: int, value: Any):
        k = int(key)
        if isinstance(value, MasterLine):
            super().__setitem__(k, value)
        elif isinstance(value, str):
            existing_meta = self[k].meta if (k in self and hasattr(self[k], "meta")) else {
                "line_number": k, "status": "ok", "updated_at": datetime.now().isoformat()
            }
            super().__setitem__(k, MasterLine(value, **existing_meta))
        elif isinstance(value, dict):
            text = value.get("text", "")
            meta = dict(value)
            meta.pop("text", None)
            meta["line_number"] = k
            super().__setitem__(k, MasterLine(text, **meta))
        else:
            super().__setitem__(k, MasterLine(str(value), line_number=k))

document_lines: Dict[int, str] = MasterDocumentLines()
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

def get_current_project_id() -> Optional[str]:
    p = db.get_active_project()
    return p["id"] if p else None

def get_serialized_lines() -> List[Dict[str, Any]]:
    return [
        document_lines[k].to_dict() if hasattr(document_lines[k], "to_dict")
        else (document_lines[k] if isinstance(document_lines[k], dict)
              else {"line_number": k, "gutter_number": k, "text": str(document_lines[k]), "status": "ok", "is_blank": not bool(str(document_lines[k]).strip()), "confidence": 1.0, "frame_id": "", "sources": [], "notes": "Master line", "updated_at": datetime.now().isoformat()})
        for k in sorted(document_lines.keys())
    ]

def load_persisted_state():
    global document_lines, captured_frames, recapture_queue, token_stats, latest_telemetry
    try:
        p = db.get_active_project()
        if not p:
            document_lines.clear()
            captured_frames.clear()
            latest_telemetry["current_page"] = 0
            latest_telemetry["current_top_line"] = 0
            latest_telemetry["current_bottom_line"] = 0
            return
        pid = p["id"]
        lines_db = db.get_document_lines(pid)
        document_lines.clear()
        for k, v in lines_db.items(): document_lines[k] = v
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
        if not pid:
            return
        for fid, f in captured_frames.items():
            db.save_frame(pid, fid, f.get("filename", f"{fid}.png"), f.get("top_line", 0), f.get("bottom_line", 0), f.get("page_index", 1), f.get("file_size", 0), f.get("status", "processed"), f.get("extracted_line_count", 0), f.get("custom_offset_y", 0.0), f.get("token_usage", {}), f.get("bounding_boxes", {}), f.get("model_used", ""), f.get("created_at"))
        db.save_document_lines(pid, document_lines); db.save_project_telemetry(pid, latest_telemetry, token_stats)
        with open(DOCUMENT_FILE, "w", encoding="utf-8") as f: json.dump({"lines": {str(k): v.to_dict() if hasattr(v, "to_dict") else (v if isinstance(v, dict) else {"text": str(v)}) for k, v in sorted(document_lines.items())}, "frames": captured_frames, "token_stats": token_stats, "latest_telemetry": latest_telemetry, "updated_at": datetime.now().isoformat()}, f, indent=2)
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
class OcrSelectionRequest(BaseModel):
    engine: Optional[str] = None
    model_target: Optional[str] = None

class PipelineModeRequest(BaseModel):
    mode: str

class ReprocessRequest(BaseModel):
    model_target: Optional[str] = None

DEVICE_PROFILES = {
    "pixel_10": {
        "id": "pixel_10",
        "displayName": "Pixel 10",
        "lines_per_page": 49,
        "arrow_count_init": 99,
        "arrow_count_step": 48,
        "step_size": 48
    },
    "pixel_8": {
        "id": "pixel_8",
        "displayName": "Pixel 8",
        "lines_per_page": 31,
        "arrow_count_init": 63,
        "arrow_count_step": 30,
        "step_size": 30
    }
}
current_device_model = "pixel_10"
target_adb_serial: Optional[str] = None

def format_device_name(source: Optional[str]) -> str:
    s = (source or "").lower()
    return "Web Studio 💻" if "web" in s else ("Mobile App 📱" if "mobile" in s else ("Floating HUD 🪟" if "hud" in s else ("Auto-Pacer ⚡" if "pacer" in s else ("Backend API ⚙️" if "api" in s else "System ⚙️"))))

orchestration_state: Dict[str, Any] = {
    "status": "IDLE", "last_command": "NONE", "source": "system", "invoked_by": "System ⚙️", "active_step": "START_READY",
    "step_label": "Line 1 Start Position Set (Ready to Begin)", "top_line": 1, "bottom_line": 49, "next_target_top": 50, "page": 1,
    "device_model": "pixel_10", "lines_per_page": 49, "updated_at": datetime.now().isoformat()
}

def update_dag_after_frame(frame_id: str, top_line: int, bottom_line: int):
    tot = latest_telemetry.get("target_total_lines", 0)
    sorted_f = sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))
    is_verified = True
    if len(sorted_f) >= 2:
        prev_f = sorted_f[-2]
        expected_top = prev_f.get("bottom_line", 0) + 1
        is_verified = (top_line == expected_top or abs(top_line - expected_top) <= 1)
    
    is_complete = (tot > 0 and bottom_line >= tot)
    dag_state["nodes"]["frame_acquire"].update({"status": "completed", "top_line": top_line, "bottom_line": bottom_line})
    dag_state["nodes"]["verification_trigger"].update({
        "status": "completed" if is_complete else "looping",
        "verified_top_transition": is_verified,
        "is_complete": is_complete,
        "loop_count": dag_state["nodes"]["verification_trigger"].get("loop_count", 0) + 1,
        "remaining_lines": max(0, tot - bottom_line) if tot > 0 else 0
    })
    dag_state["current_active_node"] = "verification_trigger" if is_complete else "arrow_down"

def _apply_extracted_lines(frame_id: str, plines: list, top_g: Any, bot_g: Any, model_desc: str) -> int:
    global document_lines, captured_frames, latest_telemetry
    added = ocr_engine.stitcher.stitch_frame_lines(document_lines, plines, frame_id, model_desc)
    min_d = min((int(l["line_number"]) for l in plines if l.get("line_number") is not None), default=999999)
    max_d = max((int(l["line_number"]) for l in plines if l.get("line_number") is not None), default=0)
    if top_g and int(top_g) > 0: min_d = min(min_d, int(top_g))
    if bot_g and int(bot_g) > 0: max_d = max(max_d, int(bot_g))
    if min_d <= max_d and min_d < 999999:
        captured_frames[frame_id]["top_line"], captured_frames[frame_id]["bottom_line"] = min_d, max_d
        latest_telemetry["current_top_line"], latest_telemetry["current_bottom_line"] = min_d, max_d
    elif top_g and bot_g:
        captured_frames[frame_id]["top_line"], captured_frames[frame_id]["bottom_line"] = int(top_g), int(bot_g)
        latest_telemetry["current_top_line"], latest_telemetry["current_bottom_line"] = int(top_g), int(bot_g)
    captured_frames[frame_id]["status"], captured_frames[frame_id]["extracted_line_count"] = "processed", added
    update_dag_after_frame(frame_id, captured_frames[frame_id].get("top_line", 0), captured_frames[frame_id].get("bottom_line", 0))
    return added

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
        _apply_extracted_lines(frame_id, plines, top_g, bot_g, f"Gemini Vision OCR ({model_used})")
    except Exception as e:
        print(f"Error processing frame {frame_id} with Gemini: {e}")
        captured_frames[frame_id]["status"] = f"error: {str(e)}"
    finally: save_persisted_state()

async def process_frame_with_ollama(frame_id: str, image_path: Path, top_line: int, bottom_line: int):
    global captured_frames
    def _call_ollama_sync():
        with Image.open(image_path) as img:
            w, h = img.size
            scale = min(1.0, 720.0 / h) if h > 720 else 1.0
            if scale < 1.0: img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.BILINEAR)
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=85)
            img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        prompt = (
            "Extract code lines verbatim with gutter line numbers from the image.\n"
            "Output each line in the strict structured format:\n"
            "LINE_NUM: code_content\n\n"
            "Rules:\n"
            "- Output ONLY lines in 'LINE_NUM: code_content' format, one per line.\n"
            "- LINE_NUM must be the integer line number visible in the left gutter.\n"
            "- code_content must be the verbatim code with exact indentation.\n"
            "- If a line is blank, output 'LINE_NUM:' with no code content.\n"
            "- Do not include markdown code fences, headers, or explanations."
        )
        models = [config.OLLAMA_VISION_MODEL, "minicpm-v"]
        last_ex = None
        for m in models:
            try:
                connection_stats["total_http_requests"] += 1
                req_data = json.dumps({
                    "model": m, "prompt": prompt, "images": [img_b64], "stream": False,
                    "options": {"num_predict": 768, "temperature": 0.05}
                }).encode("utf-8")
                req = urllib.request.Request(f"{config.OLLAMA_URL.rstrip('/')}/api/generate", data=req_data, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    connection_stats["ollama_available"] = True
                    return data.get("response", ""), m
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, Exception) as e:
                connection_stats["http_errors_count"] += 1
                connection_stats["last_connection_error"] = f"[Ollama {m}] {str(e)}"
                connection_stats["last_error_timestamp"] = datetime.now().isoformat()
                last_ex = e
        raise last_ex or RuntimeError("Ollama vision models failed")

    try:
        raw_resp, model_used = await asyncio.to_thread(_call_ollama_sync)
        raw_text = re.sub(r"^\s*```(?:[a-zA-Z0-9_-]+)?\s*|\s*```\s*$", "", (raw_resp or "").strip())
        plines = []
        for line in raw_text.splitlines():
            line_clean = line.rstrip()
            if not line_clean.strip(): continue
            if match := re.match(r"^\s*(\d+)\s*[:|]\s?(.*)$", line_clean):
                ln = int(match.group(1))
                code = match.group(2)
                plines.append({
                    "line_number": ln, "gutter_number": ln, "text": code,
                    "is_blank": not bool(code.strip()), "is_wrapped": False,
                    "wrapped_line_count": 1, "confidence": 0.98
                })

        top_g, bot_g = None, None
        if plines:
            top_g = min(p["line_number"] for p in plines)
            bot_g = max(p["line_number"] for p in plines)
        else:
            parsed = {}
            if m := re.search(r'\{.*\}', raw_text, re.DOTALL):
                try: parsed = json.loads(m.group(0))
                except Exception: pass
            elif m := re.search(r'\[.*\]', raw_text, re.DOTALL):
                try: parsed = {"lines": json.loads(m.group(0))}
                except Exception: pass
            top_g = parsed.get("top_gutter_line") if isinstance(parsed, dict) else None
            bot_g = parsed.get("bottom_gutter_line") if isinstance(parsed, dict) else None
            plines = parsed.get("lines", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])

        _apply_extracted_lines(frame_id, plines, top_g, bot_g, f"Ollama Vision ({model_used})")
        captured_frames[frame_id]["model_used"] = f"ollama:{model_used}"
    except Exception as e:
        print(f"[Ollama] Frame {frame_id} failed or timed out: {e}")
        connection_stats["last_connection_error"] = str(e)
        connection_stats["last_error_timestamp"] = datetime.now().isoformat()
        if config.GEMINI_API_KEY:
            print(f"[Ollama] Falling back to Gemini Cloud API for frame {frame_id}")
            await process_frame_with_gemini(frame_id, image_path, top_line, bottom_line)
        else:
            print(f"[Ollama] Gemini not configured, falling back to local OCR for frame {frame_id}")
            await process_frame_with_local_ocr(frame_id, image_path)
    finally: save_persisted_state()

async def process_frame_with_target(frame_id: str, image_path: Path, top_line: int, bottom_line: int, model_target: Optional[str] = None):
    target = normalize_model_target(model_target)
    if target == "ollama":
        await process_frame_with_ollama(frame_id, image_path, top_line, bottom_line)
    else:
        await process_frame_with_gemini(frame_id, image_path, top_line, bottom_line)

@app.get("/api/health")
async def health():
    return {"status": "healthy", "has_api_key": bool(config.GEMINI_API_KEY), "total_lines": len(document_lines), "total_frames": len(captured_frames), "pending_recaptures": len(recapture_queue), "token_stats": token_stats, "is_pacing": latest_telemetry.get("is_pacing", False)}

@app.get("/api/status")
async def get_system_status():
    ollama_status = await asyncio.to_thread(check_ollama_status)
    p = db.get_active_project()
    sl = get_serialized_lines()
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
            "api_key_preview": f"{config.GEMINI_API_KEY[:6]}...{config.GEMINI_API_KEY[-4:]}" if len(config.GEMINI_API_KEY) > 10 else ("Set" if config.GEMINI_API_KEY else "Missing")
        },
        "metrics": {
            "document_lines": len(document_lines),
            "min_line": min(document_lines.keys()) if document_lines else 0,
            "max_line": max(document_lines.keys()) if document_lines else 0,
            "captured_frames": len(captured_frames),
            "pending_recaptures": len(recapture_queue),
            "verified_overlaps": sum(1 for ln in sl if ln.get("status") == "verified_overlap"),
            "issues_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])
        },
        "telemetry": get_fresh_telemetry(),
        "token_stats": token_stats,
        "connection_stats": connection_stats,
        "stitching_stats": ocr_engine.stitcher.stitch_stats if hasattr(ocr_engine, "stitcher") else {}
    }

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
    sl = get_serialized_lines()
    return {"telemetry": get_fresh_telemetry(), "token_stats": token_stats, "document_summary": {"total_lines": len(document_lines), "min_line": min(document_lines.keys()) if document_lines else 0, "max_line": max(document_lines.keys()) if document_lines else 0, "total_frames": len(captured_frames), "verified_overlap_lines": sum(1 for ln in sl if ln.get("status") == "verified_overlap"), "issue_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])}}

@app.post("/api/telemetry")
async def update_telemetry(p: TelemetryUpdateRequest):
    global latest_telemetry, token_stats, orchestration_state
    for k in ["device_id", "is_pacing", "current_page", "current_top_line", "current_bottom_line", "target_total_lines", "dwell_countdown_ms", "phase", "status_message"]:
        val = getattr(p, k)
        if val is not None:
            if k == "target_total_lines":
                if val > 0:
                    latest_telemetry[k] = val
                    if p_active := db.get_active_project():
                        if p_active.get("target_total_lines", 0) <= 0:
                            db.update_project_target_lines(p_active["id"], val)
            else:
                latest_telemetry[k] = val
    latest_telemetry["last_heartbeat"] = datetime.now().isoformat()
    if p.pacer_calibration: latest_telemetry["pacer_calibration"].update(p.pacer_calibration)
    if p.mobile_tokens: token_stats["mobile_tokens"] = p.mobile_tokens
    if p.current_top_line and p.current_top_line > 0: orchestration_state["top_line"] = p.current_top_line
    if p.current_bottom_line and p.current_bottom_line > 0: orchestration_state["bottom_line"], orchestration_state["next_target_top"] = p.current_bottom_line, p.current_bottom_line + 1
    if p.current_page and p.current_page > 0: orchestration_state["page"] = p.current_page

    if p.device_id:
        did = p.device_id.lower()
        if "pixel 8" in did or "pixel_8" in did:
            current_device_model = "pixel_8"
        elif "pixel 10" in did or "pixel_10" in did:
            current_device_model = "pixel_10"
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
        orchestration_state["device_model"] = current_device_model
        orchestration_state["lines_per_page"] = prof["lines_per_page"]

    if p.active_step: orchestration_state["active_step"] = p.active_step
    elif p.phase:
        pu = p.phase.upper()
        orchestration_state["active_step"] = "SCREEN_CAPTURE" if ("CAPTURING" in pu or "SCREEN" in pu) else ("OCR_BOUNDS" if ("OCR" in pu or "BOUNDS" in pu) else ("PRECISION_SCROLL" if ("SCROLL" in pu or "PACING" in pu or "ALIGN" in pu) else ("DWELL_FREEZE" if ("DWELL" in pu or "FREEZE" in pu) else ("START_READY" if ("READY" in pu or "STANDBY" in pu) else orchestration_state["active_step"]))))
    if p.is_pacing: orchestration_state["status"] = "RUNNING"
    elif p.phase == "COMPLETED": orchestration_state["status"], orchestration_state["active_step"] = "COMPLETED", "LOOP_EVAL"
    elif p.phase == "PAUSED": orchestration_state["status"] = "PAUSED"
    elif p.phase in ["STANDBY", "IDLE"] and orchestration_state["status"] == "RUNNING": orchestration_state["status"] = "IDLE"
    orchestration_state["updated_at"] = datetime.now().isoformat()

    await ws_manager.broadcast({"type": "orchestration_event", "orchestration": orchestration_state, "telemetry": latest_telemetry})
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/api/orchestrate")
async def get_orchestration_state(): return {"orchestration": orchestration_state, "telemetry": get_fresh_telemetry()}

async def ensure_adb_keyboard_closed():
    try:
        await asyncio.to_thread(_exec_adb_sync, ["shell", "if dumpsys input_method | grep -E 'mImeWindowVis=[123]' > /dev/null; then input keyevent 4; fi"], 3.0)
    except Exception: pass

@app.post("/api/orchestrate")
async def handle_orchestration_command(payload: OrchestrationRequest):
    global latest_telemetry, orchestration_state
    cmd, invoker = payload.command.upper(), format_device_name(payload.source)
    orchestration_state.update({"last_command": cmd, "source": payload.source or "web", "invoked_by": invoker, "updated_at": datetime.now().isoformat()})

    if cmd in ("BEGIN", "BEGIN_AUTO_FLIPPING"):
        await ensure_adb_keyboard_closed()
        orchestration_state.update({"status": "RUNNING", "active_step": "SCREEN_CAPTURE", "step_label": f"Auto Flipping Started by {invoker}"})
        latest_telemetry.update({"is_pacing": True, "phase": "PACING", "status_message": f"Auto Flipping • Invoked by {invoker}"})
    elif cmd == "CAPTURE_DESKTOP":
        await ensure_adb_keyboard_closed()
        orchestration_state.update({"active_step": "SCREEN_CAPTURE", "step_label": f"Repeatedly capture page 1 invoked by {invoker}"})
        latest_telemetry.update({"status_message": f"repeatedly capture page 1 • Invoked by {invoker}"})
    elif cmd == "GET_NEXT_LINE":
        next_ln = 1
        for f in reversed(sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
            if f.get("bottom_line", 0) > 0:
                next_ln = f["bottom_line"] + 1
                break
        if next_ln == 1 and document_lines:
            next_ln = max(document_lines.keys()) + 1
        orchestration_state.update({"next_target_top": next_ln, "step_label": f"Next Target Line: {next_ln} (Queried by {invoker})"})
        latest_telemetry.update({"status_message": f"Next Page First Line: {next_ln} • Invoked by {invoker}"})
    elif cmd == "PAUSE":
        orchestration_state.update({"status": "PAUSED", "step_label": f"Paused by {invoker}"})
        latest_telemetry.update({"is_pacing": False, "phase": "PAUSED", "status_message": f"Paused • Invoked by {invoker}"})
    elif cmd == "RESUME":
        await ensure_adb_keyboard_closed()
        orchestration_state.update({"status": "RUNNING", "active_step": "PRECISION_SCROLL", "step_label": f"Resumed by {invoker}"})
        latest_telemetry.update({"is_pacing": True, "phase": "PACING", "status_message": f"Running • Invoked by {invoker}"})
    elif cmd == "END":
        orchestration_state.update({"status": "COMPLETED", "active_step": "LOOP_EVAL", "step_label": f"Ended by {invoker}"})
        latest_telemetry.update({"is_pacing": False, "phase": "COMPLETED", "status_message": f"Completed • Invoked by {invoker}"})
    elif cmd == "RESTART":
        await ensure_adb_keyboard_closed()
        profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
        lpp = profile["lines_per_page"]
        orchestration_state.update({
            "status": "RUNNING", "active_step": "START_READY",
            "step_label": f"Restarted at Line 1 by {invoker}",
            "top_line": 1, "bottom_line": lpp, "next_target_top": lpp + 1, "page": 1,
            "device_model": current_device_model, "lines_per_page": lpp
        })
        latest_telemetry.update({"current_page": 1, "current_top_line": 1, "current_bottom_line": 0, "is_pacing": True, "phase": "PACING", "status_message": f"Restarted • Invoked by {invoker}"})
    elif cmd in ("CALIBRATE_INSTANT", "CALIBRATE"):
        await ensure_adb_keyboard_closed()
        orchestration_state.update({"active_step": "CALIBRATING", "step_label": f"Instant Calibration by {invoker}"})
        latest_telemetry.update({"status_message": f"Instant Calibration (Ctrl+End / Ctrl+Home) • Invoked by {invoker}"})
    elif cmd in ("ADVANCE_PAGE_ARROW", "PAGE_DOWN_ARROW"):
        await ensure_adb_keyboard_closed()
        orchestration_state.update({"active_step": "PRECISION_SCROLL", "step_label": f"Arrow Step Invoked by {invoker}"})
        latest_telemetry.update({"status_message": f"Arrow Step Navigation • Invoked by {invoker}"})

    await ws_manager.broadcast({"type": "orchestration_event", "orchestration": orchestration_state, "telemetry": latest_telemetry})
    try: db.save_project_telemetry(get_current_project_id(), latest_telemetry, token_stats)
    except Exception: pass
    return {"status": "success", "command": cmd, "orchestration": orchestration_state, "telemetry": latest_telemetry}

class DeviceSelectRequest(BaseModel):
    device_model: str
    serial: Optional[str] = None

@app.get("/api/device")
async def get_device_info():
    profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
    return {
        "device_model": current_device_model,
        "profile": profile,
        "available_profiles": list(DEVICE_PROFILES.values()),
        "target_serial": target_adb_serial
    }

@app.post("/api/device/select")
async def select_device_api(req: DeviceSelectRequest):
    global current_device_model, target_adb_serial, orchestration_state
    dev = req.device_model.lower().strip()
    if "8" in dev:
        current_device_model = "pixel_8"
    else:
        current_device_model = "pixel_10"
    if req.serial is not None:
        target_adb_serial = req.serial.strip() if req.serial.strip() else None
    profile = DEVICE_PROFILES[current_device_model]
    lpp = profile["lines_per_page"]
    orchestration_state["device_model"] = current_device_model
    orchestration_state["lines_per_page"] = lpp
    if orchestration_state.get("page", 1) <= 1 and (orchestration_state.get("active_step") == "START_READY" or orchestration_state.get("status") == "IDLE"):
        orchestration_state["bottom_line"] = lpp
        orchestration_state["next_target_top"] = lpp + 1
    await ws_manager.broadcast({"type": "orchestration_event", "orchestration": orchestration_state, "telemetry": latest_telemetry})
    return {"status": "success", "device_model": current_device_model, "profile": profile, "target_serial": target_adb_serial}

@app.get("/api/adb/devices")
async def list_adb_devices():
    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["devices", "-l"], 5.0)
        lines = res.stdout.splitlines()
        devs = []
        for line in lines[1:]:
            line = line.strip()
            if not line or line.startswith("*"): continue
            parts = line.split()
            serial = parts[0]
            status = parts[1] if len(parts) > 1 else "unknown"
            model = "unknown"
            for p in parts[2:]:
                if p.startswith("model:"):
                    model = p.split(":", 1)[1]
                elif p.startswith("device:"):
                    if model == "unknown": model = p.split(":", 1)[1]
            devs.append({"serial": serial, "status": status, "model": model, "raw": line})
        return {"status": "ok", "devices": devs, "target_serial": target_adb_serial}
    except Exception as e:
        return {"status": "error", "message": str(e), "devices": [], "target_serial": target_adb_serial}

async def get_active_adb_serial(requested_serial: Optional[str] = None) -> Optional[str]:
    """Finds the most reliable active ADB device serial for commands."""
    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["devices", "-l"], 3.0)
        lines = res.stdout.splitlines()
        active = []
        for line in lines[1:]:
            line = line.strip()
            if not line or line.startswith("*"): continue
            parts = line.split()
            if len(parts) >= 2 and parts[1] == "device":
                model = "unknown"
                for p in parts[2:]:
                    if p.startswith("model:"): model = p.split(":", 1)[1]
                active.append({"serial": parts[0], "model": model, "raw": line})
        if not active:
            return requested_serial or target_adb_serial

        target = requested_serial or target_adb_serial
        if target:
            for dev in active:
                if dev["serial"] == target or target in dev["serial"]:
                    return dev["serial"]
            target_ip = target.split(":")[0]
            for dev in active:
                if target_ip in dev["serial"]:
                    return dev["serial"]

        pref = "pixel_8" if "8" in current_device_model.lower() else "pixel_10"
        for dev in active:
            m = dev["model"].lower()
            if pref == "pixel_8" and ("pixel_8" in m or "husky" in m or "shiba" in m):
                return dev["serial"]
            elif pref == "pixel_10" and ("pixel_10" in m or "frankel" in m):
                return dev["serial"]

        return active[0]["serial"]
    except Exception:
        return requested_serial or target_adb_serial

async def run_adb_shell(cmd: str, serial: Optional[str] = None) -> Dict[str, Any]:
    ser = await get_active_adb_serial(serial)
    args = []
    if ser:
        args.extend(["-s", ser])
    args.extend(["shell", cmd])
    try:
        res = await asyncio.to_thread(_exec_adb_sync, args, 12.0)
        return {
            "status": "ok" if res.returncode == 0 else "error",
            "returncode": res.returncode,
            "stdout": res.stdout,
            "stderr": res.stderr,
            "serial": ser
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "serial": ser}

async def detect_external_display_id(serial: Optional[str] = None) -> int:
    """Finds external logical display ID from dumpsys display (e.g. 4 for MB16AMTR Asus ZenScreen)."""
    res = await run_adb_shell("dumpsys display | grep -E 'mDisplayId=[1-9]' | head -n 1", serial)
    if res.get("status") == "ok" and res.get("stdout"):
        m = re.search(r'mDisplayId=(\d+)', res["stdout"])
        if m:
            val = int(m.group(1))
            if val != 0: return val
    return 4

async def detect_surfaceflinger_display_id(serial: Optional[str] = None) -> Optional[str]:
    """Finds 64-bit SurfaceFlinger display ID for screencap."""
    res_sf = await asyncio.to_thread(_exec_adb_sync, (["-s", serial] if serial else []) + ["shell", "dumpsys SurfaceFlinger --display-id"], 5.0)
    if res_sf.returncode == 0 and res_sf.stdout:
        for line in res_sf.stdout.splitlines():
            if ("port=" in line and "port=0" not in line) or "MB16AMTR" in line or "display 256" in line:
                if m := re.search(r'Display\s+(\d+)', line):
                    return m.group(1)
        all_ids = re.findall(r'Display\s+(\d+)', res_sf.stdout)
        if len(all_ids) > 1:
            return all_ids[1]
    return None

async def capture_external_screenshot(serial: Optional[str] = None) -> Optional[bytes]:
    """Captures valid PNG bytes from the external display via ADB."""
    sf_id = await detect_surfaceflinger_display_id(serial)
    cmd = (["-s", serial] if serial else []) + ["exec-out", "screencap"]
    if sf_id:
        cmd.extend(["-d", sf_id])
    cmd.append("-p")
    cap = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 8.0)
    if cap.returncode == 0 and cap.stdout and cap.stdout.startswith(b"\x89PNG\r\n\x1a\n"):
        return cap.stdout

    # Fallback to on-device temp file
    dev_path = "/sdcard/mc_calib_temp.png"
    sc_cmd = f"screencap {'-d ' + sf_id if sf_id else ''} -p {dev_path}"
    await asyncio.to_thread(_exec_adb_sync, (["-s", serial] if serial else []) + ["shell", sc_cmd], 6.0)
    pull_res = await asyncio.to_thread(_exec_adb_sync_bin, (["-s", serial] if serial else []) + ["exec-out", f"cat {dev_path} && rm -f {dev_path}"], 6.0)
    if pull_res.returncode == 0 and pull_res.stdout and pull_res.stdout.startswith(b"\x89PNG\r\n\x1a\n"):
        return pull_res.stdout
    return None

async def send_hid_keycombination(key1: int, key2: int, serial: Optional[str] = None):
    """Sends HID keycombination with keyboard closed to external screen and global focus."""
    await ensure_adb_keyboard_closed()
    disp_id = await detect_external_display_id(serial)
    if disp_id > 0:
        await run_adb_shell(f"input -d {disp_id} keycombination {key1} {key2}", serial)
    await run_adb_shell(f"input keycombination {key1} {key2}", serial)

class AdbCommandRequest(BaseModel):
    command: str
    serial: Optional[str] = None

class AdbConnectRequest(BaseModel):
    address: str

class AdbPairRequest(BaseModel):
    address: str
    code: str

@app.post("/api/adb/connect")
async def adb_connect_api(req: AdbConnectRequest):
    addr = req.address.strip()
    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["connect", addr], 8.0)
        return {"status": "ok" if "connected" in res.stdout.lower() else "error", "output": res.stdout.strip(), "address": addr}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/adb/pair")
async def adb_pair_api(req: AdbPairRequest):
    addr = req.address.strip()
    code = req.code.strip()
    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["pair", addr, code], 10.0)
        return {"status": "ok" if "successfully" in res.stdout.lower() else "error", "output": res.stdout.strip(), "address": addr}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/adb/command")
async def execute_adb_command_api(req: AdbCommandRequest):
    return await run_adb_shell(req.command.strip(), req.serial)

class AdvancePageRequest(BaseModel):
    display_id: Optional[int] = None
    serial: Optional[str] = None

@app.post("/api/advance-page")
async def advance_page_api(req: Optional[AdvancePageRequest] = None):
    active_serial = await get_active_adb_serial(req.serial if req else None)
    disp_id = (req.display_id if req and req.display_id is not None else None)
    if disp_id is None:
        disp_id = await detect_external_display_id(active_serial)

    profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
    cur_page = orchestration_state.get("page", 1)
    arrow_count = profile["arrow_count_init"] if cur_page <= 1 else profile["arrow_count_step"]

    # 1. Tap inside editor window on target display to ensure focus
    await run_adb_shell(f"input -d {disp_id} tap 500 500", active_serial)
    await asyncio.sleep(0.15)

    # 2. Dispatch Down Arrow keys
    keys_str = " ".join(["20"] * arrow_count)
    res = await run_adb_shell(f"input -d {disp_id} keyevent {keys_str}", active_serial)
    await asyncio.sleep(0.4)

    # 3. Calculate next bounds: top = last_bottom + 1
    last_bottom = 0
    for f in reversed(sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
        if f.get("bottom_line", 0) > 0:
            last_bottom = f["bottom_line"]
            break
    if last_bottom == 0:
        last_bottom = profile["lines_per_page"]

    next_page = cur_page + 1
    next_top = last_bottom + 1
    next_bot = next_top + profile["step_size"]

    orchestration_state.update({
        "page": next_page,
        "top_line": next_top,
        "bottom_line": next_bot,
        "next_target_top": next_bot + 1,
        "active_step": "PRECISION_SCROLL",
        "step_label": f"Page {next_page} (Lines {next_top} → {next_bot})",
        "status": "RUNNING"
    })
    latest_telemetry.update({
        "current_page": next_page,
        "current_top_line": next_top,
        "current_bottom_line": next_bot,
        "status_message": f"Page {next_page} Advanced ({arrow_count} arrows) • Lines {next_top} → {next_bot}"
    })
    await ws_manager.broadcast({"type": "orchestration_event", "orchestration": orchestration_state, "telemetry": latest_telemetry})
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


async def process_frame_with_local_ocr(frame_id: str, image_path: Path) -> Dict[str, Any]:
    res = await scan_image_in_process(image_path)
    top_ln, bot_ln, lines = res.get("top_line", 0), res.get("bottom_line", 0), res.get("lines", [])
    captured_frames[frame_id].update({"top_line": top_ln, "bottom_line": bot_ln, "extracted_line_count": len(lines), "status": "processed", "bounding_boxes": res.get("bounding_boxes", {})})
    if top_ln > 0 and bot_ln > 0:
        latest_telemetry["current_top_line"], latest_telemetry["current_bottom_line"] = top_ln, bot_ln
    for item in lines:
        if item.get("line_number"):
            ln = int(item["line_number"])
            document_lines[ln] = {"line_number": ln, "gutter_number": ln, "text": item.get("text", ""), "is_blank": item.get("is_blank", False), "is_wrapped": item.get("is_wrapped", False), "wrapped_line_count": item.get("wrapped_line_count", 1), "status": "verified", "frame_id": frame_id, "sources": [frame_id], "confidence": item.get("confidence", 0.98), "notes": "Local Gutter OCR (Worker Process)", "updated_at": datetime.now().isoformat()}
    save_persisted_state()
    update_dag_after_frame(frame_id, top_ln, bot_ln)
    return res

async def route_frame_ocr(frame_id: str, image_path: Path, top_line: int = 0, bottom_line: int = 0, engine: Optional[str] = None, model_target: Optional[str] = None, pipeline_mode: Optional[str] = None) -> Dict[str, Any]:
    pm = (pipeline_mode or active_pipeline_mode).lower()
    effective_engine = engine or ("local" if pm == "local" else active_ocr_engine)
    effective_target = model_target or ("ollama" if pm == "local" else active_model_target)
    mode = effective_engine.lower()
    target = normalize_model_target(effective_target)
    if mode == "local" or (mode in {"auto", "gemini"} and target == "gemini" and not config.GEMINI_API_KEY):
        return await process_frame_with_local_ocr(frame_id, image_path)
    elif mode in {"gemini", "cloud"}:
        await process_frame_with_target(frame_id, image_path, top_line, bottom_line, target)
        return {"top_line": captured_frames[frame_id].get("top_line", 0), "bottom_line": captured_frames[frame_id].get("bottom_line", 0), "lines": []}
    elif mode == "hybrid":
        local_res = await process_frame_with_local_ocr(frame_id, image_path)
        try: await process_frame_with_target(frame_id, image_path, top_line, bottom_line, target)
        except Exception: pass
        return local_res
    else:
        try:
            await process_frame_with_target(frame_id, image_path, top_line, bottom_line, target)
            return {"top_line": captured_frames[frame_id].get("top_line", 0), "bottom_line": captured_frames[frame_id].get("bottom_line", 0), "lines": []}
        except Exception:
            return await process_frame_with_local_ocr(frame_id, image_path)

@app.get("/api/pipeline/mode")
async def get_pipeline_mode():
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

@app.post("/api/pipeline/mode")
async def set_pipeline_mode(req: PipelineModeRequest):
    global active_pipeline_mode, active_model_target, active_ocr_engine
    m = req.mode.strip().lower()
    if m not in {"cloud", "local"}:
        raise HTTPException(status_code=400, detail="Invalid pipeline mode. Must be 'cloud' or 'local'.")
    active_pipeline_mode = m
    if m == "local":
        active_model_target = "ollama"
        active_ocr_engine = "local"
    else:
        active_model_target = "gemini"
        active_ocr_engine = "auto"
    payload = {
        "type": "pipeline_mode_changed",
        "pipeline_mode": active_pipeline_mode,
        "mode": active_pipeline_mode,
        "model_target": active_model_target,
        "ocr_engine": active_ocr_engine,
        "engine": active_ocr_engine
    }
    await ws_manager.broadcast(payload)
    return {"status": "success", **payload}

@app.get("/api/ocr/engines")
async def get_ocr_engines():
    has_gemini = bool(config.GEMINI_API_KEY)
    return {
        "engines": [
            {"id": "auto", "name": "Auto (Gemini with Local Fallback)", "available": True, "type": "auto"},
            {"id": "local", "name": "Local RapidOCR / OpenCV Engine", "available": True, "type": "local"},
            {"id": "gemini", "name": "Gemini 2.5 Cloud Vision", "available": has_gemini, "type": "cloud"},
            {"id": "hybrid", "name": "Hybrid (Gemini Text + Local Bounding Boxes)", "available": has_gemini, "type": "hybrid"}
        ],
        "active_engine": active_ocr_engine,
        "model_targets": ["gemini", "ollama"],
        "active_model_target": active_model_target,
        "pipeline_mode": active_pipeline_mode
    }

@app.post("/api/ocr/select-engine")
async def select_ocr_engine(req: OcrSelectionRequest):
    global active_ocr_engine, active_model_target
    if req.model_target:
        active_model_target = normalize_model_target(req.model_target)
    if req.engine:
        valid = {"auto", "local", "gemini", "hybrid"}
        if req.engine.lower() not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid engine '{req.engine}'. Must be one of {valid}")
        active_ocr_engine = req.engine.lower()
    await ws_manager.broadcast({"type": "ocr_engine_changed", "active_engine": active_ocr_engine, "active_model_target": active_model_target})
    return {"status": "success", "active_engine": active_ocr_engine, "active_model_target": active_model_target}

@app.post("/api/ocr/scan-direct")
async def scan_direct(request: Request, file: UploadFile = File(...), engine: Optional[str] = Form("auto"), model_target: Optional[str] = Form(None), pipeline_mode: Optional[str] = Form(None)):
    contents = await file.read()
    temp_path = FRAMES_DIR / f"temp_scan_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
    pm = pipeline_mode or request.query_params.get("pipeline_mode") or active_pipeline_mode
    effective_target = model_target or ("ollama" if pm == "local" else active_model_target)
    mt = normalize_model_target(effective_target or request.query_params.get("model_target"))
    try:
        with open(temp_path, "wb") as f: f.write(contents)
        res = ocr_engine.scan_image(str(temp_path))
        return {"status": "success", "engine": engine or active_ocr_engine, "model_target": mt, "pipeline_mode": pm, **res}
    finally:
        if temp_path.exists(): temp_path.unlink()

@app.post("/api/upload-frame")
async def upload_frame(request: Request, background_tasks: BackgroundTasks):
    ct = request.headers.get("content-type", "")
    contents = None
    top_line = 0
    bottom_line = 0
    page_index = 0
    sync = True
    engine = None
    model_type = None
    model_target = None
    pipeline_mode = None

    if "application/json" in ct:
        body = await request.json()
        b64_str = body.get("image_base64") or body.get("image") or ""
        if b64_str:
            b64_clean = re.sub(r"^data:image/[^;]+;base64,", "", b64_str.strip())
            try: contents = base64.b64decode(b64_clean)
            except Exception as e: raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
        top_line = body.get("top_line", 0)
        bottom_line = body.get("bottom_line", 0)
        page_index = body.get("page_index", 0)
        sync = body.get("sync", True)
        engine = body.get("engine")
        model_type = body.get("model_type")
        model_target = body.get("model_target")
        pipeline_mode = body.get("pipeline_mode")
    else:
        form = await request.form()
        file_obj = form.get("file")
        if file_obj and hasattr(file_obj, "read"):
            contents = await file_obj.read()
        elif b64_form := form.get("image_base64") or form.get("image"):
            b64_clean = re.sub(r"^data:image/[^;]+;base64,", "", str(b64_form).strip())
            try: contents = base64.b64decode(b64_clean)
            except Exception as e: raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
        top_line = form.get("top_line", 0)
        bottom_line = form.get("bottom_line", 0)
        page_index = form.get("page_index", 0)
        sync = form.get("sync", True)
        if isinstance(sync, str): sync = sync.lower() not in ("false", "0", "no")
        engine = form.get("engine")
        model_type = form.get("model_type")
        model_target = form.get("model_target")
        pipeline_mode = form.get("pipeline_mode")

    if not contents:
        raise HTTPException(status_code=400, detail="Missing frame image: provide 'image_base64' or multipart 'file'")

    try: top_line = int(top_line) if top_line is not None else 0
    except (ValueError, TypeError): top_line = 0
    try: bottom_line = int(bottom_line) if bottom_line is not None else 0
    except (ValueError, TypeError): bottom_line = 0
    try: pidx = int(page_index) if page_index and int(page_index) > 0 else len(captured_frames) + 1
    except (ValueError, TypeError): pidx = len(captured_frames) + 1

    content_hash = hashlib.sha256(contents).hexdigest()
    sorted_frames = sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))

    profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
    lpp = profile["lines_per_page"]
    step = profile["step_size"]

    # Deduplication: If the image is byte-for-byte identical to the last frame, reject duplicate
    if sorted_frames:
        last_f = sorted_frames[-1]
        if last_f.get("content_hash") == content_hash:
            return {
                "status": "warning",
                "is_duplicate": True,
                "frame_id": last_f["frame_id"],
                "page_index": last_f.get("page_index", 1),
                "top_line": last_f.get("top_line", top_line),
                "bottom_line": last_f.get("bottom_line", bottom_line),
                "message": f"Screen has not scrolled. Identical to existing Frame {last_f['frame_id']} (Lines {last_f.get('top_line')}..{last_f.get('bottom_line')}). Advance page before capturing."
            }

    # Enforce next page starts strictly at previous bottom + 1
    if sorted_frames and pidx > 1:
        last_bot = sorted_frames[-1].get("bottom_line", 0)
        if last_bot > 0:
            if top_line <= 1 or top_line <= last_bot:
                top_line = last_bot + 1
            if bottom_line <= top_line:
                bottom_line = top_line + step
    elif top_line <= 0:
        top_line = 1
        bottom_line = lpp
    elif bottom_line <= 0:
        bottom_line = top_line + step

    if not get_current_project_id():
        raise HTTPException(status_code=400, detail="No active project. Please create a project before capturing or uploading frames.")

    now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
    fid = f"frame_{top_line:05d}_{bottom_line:05d}_{now_str}" if top_line > 0 and bottom_line > 0 else f"frame_p{pidx:03d}_{now_str}"
    fn = f"{fid}.png"; tpath = FRAMES_DIR / fn
    with open(tpath, "wb") as f: f.write(contents)

    pm = pipeline_mode or request.query_params.get("pipeline_mode") or active_pipeline_mode
    effective_target = model_target or ("ollama" if pm == "local" else active_model_target)
    if model_type:
        mt_lower = str(model_type).strip().lower()
        if "gemini" in mt_lower: effective_target = "gemini"
        elif any(k in mt_lower for k in ["ollama", "llama", "qwen", "minicpm"]): effective_target = "ollama"
        else: effective_target = mt_lower
    mt = normalize_model_target(effective_target or request.query_params.get("model_target"))

    captured_frames[fid] = {
        "frame_id": fid, "filename": fn, "top_line": top_line, "bottom_line": bottom_line,
        "page_index": pidx, "file_size": len(contents), "content_hash": content_hash,
        "status": "awaiting_review" if not sync else "queued",
        "created_at": datetime.now().isoformat(), "extracted_line_count": 0,
        "model_type": model_type or mt,
        "token_usage": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
    }
    save_persisted_state()
    await ws_manager.broadcast({"type": "new_frame", "frame": captured_frames[fid]})

    if sync:
        await route_frame_ocr(fid, tpath, top_line, bottom_line, engine, mt, pm)
        cf = captured_frames[fid]
        return {
            "status": "success", "frame_id": fid, "page_index": pidx,
            "top_line": cf.get("top_line", top_line), "bottom_line": cf.get("bottom_line", bottom_line),
            "extracted_line_count": cf.get("extracted_line_count", 0),
            "model_type": model_type or mt, "model_target": mt, "pipeline_mode": pm,
            "message": f"Frame stored and verified: Lines {cf.get('top_line', top_line)} → {cf.get('bottom_line', bottom_line)}."
        }
    return {
        "status": "success", "frame_id": fid, "page_index": pidx,
        "top_line": top_line, "bottom_line": bottom_line, "extracted_line_count": 0,
        "model_type": model_type or mt, "model_target": mt, "pipeline_mode": pm,
        "message": f"Frame {fid} received and awaiting review."
    }

@app.get("/api/next-page-line")
async def get_next_page_line():
    last_bottom = 0
    for f in reversed(sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))):
        if f.get("bottom_line", 0) > 0: last_bottom = f["bottom_line"]; break
    if last_bottom == 0 and document_lines: last_bottom = max(document_lines.keys())
    return {"status": "success", "next_page_first_line": (last_bottom + 1) if last_bottom > 0 else 1, "last_bottom_line": last_bottom, "total_frames": len(captured_frames)}

@app.post("/api/frames/{frame_id}/scan")
async def scan_frame_ocr(frame_id: str, engine: Optional[str] = Query("auto"), model_target: Optional[str] = Query(None), payload: Optional[ReprocessRequest] = None):
    if frame_id not in captured_frames: raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    finfo = captured_frames[frame_id]
    ipath = FRAMES_DIR / finfo.get("filename", f"{frame_id}.png")
    if not ipath.exists():
        matches = list(FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches: ipath = matches[0]
        else: raise HTTPException(status_code=404, detail="Frame image file not found")
    mt = normalize_model_target((payload.model_target if payload and payload.model_target else None) or model_target)
    try:
        res = ocr_engine.scan_image(str(ipath))
        top_ln, bot_ln, lines = res.get("top_line", 0), res.get("bottom_line", 0), res.get("lines", [])
        finfo.update({"top_line": top_ln, "bottom_line": bot_ln, "extracted_line_count": len(lines), "status": "processed", "bounding_boxes": res.get("bounding_boxes", {})})
        for item in lines:
            if item.get("line_number"):
                ln = int(item["line_number"])
                document_lines[ln] = {"line_number": ln, "gutter_number": ln, "text": item.get("text", ""), "is_blank": item.get("is_blank", False), "is_wrapped": item.get("is_wrapped", False), "wrapped_line_count": item.get("wrapped_line_count", 1), "status": "verified", "frame_id": frame_id, "sources": [frame_id], "confidence": item.get("confidence", 0.98), "notes": f"Gutter OCR ({mt})", "updated_at": datetime.now().isoformat()}
        save_persisted_state()
        data = {"status": "success", "frame_id": frame_id, "top_line": top_ln, "bottom_line": bot_ln, "extracted_line_count": len(lines), "bounding_boxes": res.get("bounding_boxes", {}), "lines": lines, "model_target": mt}
        await ws_manager.broadcast({"type": "ocr_completed", **data})
        return data
    except Exception as e:
        finfo["status"] = f"error: {str(e)}"; save_persisted_state()
        raise HTTPException(status_code=500, detail=f"OCR scan failed: {str(e)}")

@app.get("/api/dag/status")
async def get_dag_status():
    proj = db.get_active_project()
    target_tot = proj.get("target_total_lines", 0) if proj else latest_telemetry.get("target_total_lines", 0)
    return {
        "status": "success",
        "dag": dag_state,
        "target_total_lines": target_tot,
        "current_top_line": latest_telemetry.get("current_top_line", 1),
        "current_bottom_line": latest_telemetry.get("current_bottom_line", 31),
        "current_page": latest_telemetry.get("current_page", 1),
        "active_node": dag_state.get("current_active_node", "init_end")
    }

@app.get("/api/projects")
async def list_projects(): return db.get_projects()

@app.get("/api/projects/active")
async def get_active_project(): return db.get_active_project()

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
            calib_path = FRAMES_DIR / f"calib_end_{project_id}.png"
            with open(calib_path, "wb") as f: f.write(end_bytes)
            total_lines = await detect_last_line_in_process(calib_path)
            if total_lines <= 0:
                res_scan = await scan_image_in_process(calib_path)
                total_lines = res_scan.get("bottom_line", 0)

        if total_lines <= 0 and requested_target > 0:
            total_lines = requested_target

        if total_lines > 0:
            db.update_project_target_lines(project_id, total_lines)
            latest_telemetry["target_total_lines"] = total_lines
            latest_telemetry["status_message"] = f"Total lines calibrated: {total_lines} via Ctrl+End"

        dag_state["nodes"]["init_end"].update({"status": "completed", "total_lines": total_lines})
        dag_state["nodes"]["reset_home"].update({"status": "active"})
        dag_state["current_active_node"] = "reset_home"

        await ws_manager.broadcast({
            "type": "dag_updated", "dag": dag_state,
            "calibration_event": "end_detected", "total_lines": total_lines
        })

        # 2. Fast home: Dispatch Ctrl+Home: keycode 113 + 122
        await send_hid_keycombination(113, 122, serial)
        await asyncio.sleep(0.6)
        home_bytes = await capture_external_screenshot(serial)
        if home_bytes:
            home_path = FRAMES_DIR / f"calib_home_{project_id}.png"
            with open(home_path, "wb") as f: f.write(home_bytes)
            is_verified, detected_first = await verify_first_line_in_process(home_path)
            if not is_verified:
                res_scan = await scan_image_in_process(home_path)
                detected_first = res_scan.get("top_line", 1)
                is_verified = (detected_first == 1)

        dag_state["nodes"]["reset_home"].update({"status": "completed", "verified": is_verified, "first_line": detected_first})
        dag_state["nodes"]["frame_acquire"].update({"status": "active", "page": 1})
        dag_state["current_active_node"] = "frame_acquire"

        latest_telemetry["current_top_line"] = 1
        latest_telemetry["current_page"] = 1
        latest_telemetry["status_message"] = f"Calibrated: {total_lines} total lines verified via Ctrl+End / Ctrl+Home ✔"

        await ws_manager.broadcast({
            "type": "dag_updated", "dag": dag_state,
            "calibration_event": "home_verified", "verified": is_verified, "first_line": detected_first,
            "telemetry": latest_telemetry
        })
    except Exception as e:
        print(f"[perform_full_project_calibration] Error: {e}")

    return (total_lines, is_verified, detected_first)

@app.post("/api/projects")
async def create_project(req: ProjectCreateRequest):
    new_proj = db.create_project(name=req.name, description=req.description or "", target_total_lines=req.target_total_lines or 0)
    captured_frames.clear()
    document_lines.clear()
    load_persisted_state()

    # Initialize DAG state for new project
    dag_state["nodes"]["init_end"].update({"status": "active", "total_lines": req.target_total_lines or 0})
    dag_state["nodes"]["reset_home"].update({"status": "idle", "verified": False})
    dag_state["nodes"]["frame_acquire"].update({"status": "idle", "page": 1})
    dag_state["nodes"]["arrow_down"].update({"status": "idle"})
    dag_state["nodes"]["verification_trigger"].update({"status": "idle", "loop_count": 0, "is_complete": False})
    dag_state["current_active_node"] = "init_end"
    await ws_manager.broadcast({"type": "project_switched", "project": new_proj, "dag": dag_state})

    # Automatically execute instant calibration: Ctrl+End -> screencap -> gutter OCR -> Ctrl+Home -> verify
    total_lines, is_verified, detected_first = await perform_full_project_calibration(new_proj["id"], req.target_total_lines or 0)
    if total_lines > 0:
        new_proj["target_total_lines"] = total_lines

    await ws_manager.broadcast({"type": "project_switched", "project": new_proj, "dag": dag_state, "telemetry": latest_telemetry})
    return new_proj

@app.post("/api/projects/{project_id}/calibrate-end")
async def calibrate_project_end(project_id: str, request: Request):
    """
    When a new project is created, the combination of Ctrl+End key and a screen capture
    is sent to the API, and then OCR in a separate worker process determines the last
    line number to display the total lines of markdown.
    """
    proj = db.get_project(project_id)
    if not proj: raise HTTPException(status_code=404, detail="Project not found")

    contents = None
    ct = request.headers.get("content-type", "")
    if "application/json" in ct:
        body = await request.json()
        if b64_str := body.get("image_base64") or body.get("image"):
            clean_b64 = re.sub(r"^data:image/[^;]+;base64,", "", b64_str.strip())
            contents = base64.b64decode(clean_b64)
    elif "multipart/form-data" in ct:
        form = await request.form()
        f_obj = form.get("file")
        if f_obj and hasattr(f_obj, "read"):
            contents = await f_obj.read()

    # If no image was explicitly passed, trigger via ADB key combination & screencap
    if not contents:
        serial = await get_active_adb_serial()
        # Ctrl+End: keycode 113 + 123
        await send_hid_keycombination(113, 123, serial)
        await asyncio.sleep(0.5)
        contents = await capture_external_screenshot(serial)

    if not contents:
        raise HTTPException(status_code=400, detail="Could not capture or receive screenshot for Ctrl+End calibration.")

    calib_path = FRAMES_DIR / f"calib_end_{project_id}.png"
    with open(calib_path, "wb") as f: f.write(contents)

    total_lines = await detect_last_line_in_process(calib_path)
    if total_lines <= 0:
        res_scan = await scan_image_in_process(calib_path)
        total_lines = res_scan.get("bottom_line", 0)

    if total_lines > 0:
        db.update_project_target_lines(project_id, total_lines)
        latest_telemetry["target_total_lines"] = total_lines
        latest_telemetry["status_message"] = f"Total lines calibrated: {total_lines} via Ctrl+End"
    
    dag_state["nodes"]["init_end"].update({"status": "completed", "total_lines": total_lines})
    dag_state["nodes"]["reset_home"].update({"status": "active"})
    dag_state["current_active_node"] = "reset_home"

    await ws_manager.broadcast({
        "type": "dag_updated", "dag": dag_state,
        "calibration_event": "end_detected", "total_lines": total_lines
    })
    return {"status": "success", "project_id": project_id, "total_lines": total_lines, "target_total_lines": total_lines}

@app.post("/api/projects/{project_id}/verify-home")
async def verify_project_home(project_id: str, request: Request):
    """
    Before key down is used during the acquisition phase, the page is returned to line 1
    by using a combination of Ctrl+Home key, a screen capture is taken, and OCR is used
    to assure the first line is line number 1.
    """
    proj = db.get_project(project_id)
    if not proj: raise HTTPException(status_code=404, detail="Project not found")

    contents = None
    ct = request.headers.get("content-type", "")
    if "application/json" in ct:
        body = await request.json()
        if b64_str := body.get("image_base64") or body.get("image"):
            clean_b64 = re.sub(r"^data:image/[^;]+;base64,", "", b64_str.strip())
            contents = base64.b64decode(clean_b64)
    elif "multipart/form-data" in ct:
        form = await request.form()
        f_obj = form.get("file")
        if f_obj and hasattr(f_obj, "read"):
            contents = await f_obj.read()

    if not contents:
        serial = await get_active_adb_serial()
        # Ctrl+Home: keycode 113 + 122
        await send_hid_keycombination(113, 122, serial)
        await asyncio.sleep(0.5)
        contents = await capture_external_screenshot(serial)

    if not contents:
        raise HTTPException(status_code=400, detail="Could not capture or receive screenshot for Ctrl+Home verification.")

    home_path = FRAMES_DIR / f"calib_home_{project_id}.png"
    with open(home_path, "wb") as f: f.write(contents)

    is_verified, detected_first = await verify_first_line_in_process(home_path)
    if not is_verified:
        res_scan = await scan_image_in_process(home_path)
        detected_first = res_scan.get("top_line", 1)
        is_verified = (detected_first == 1)

    dag_state["nodes"]["reset_home"].update({"status": "completed", "verified": is_verified, "first_line": detected_first})
    dag_state["nodes"]["frame_acquire"].update({"status": "active", "page": 1})
    dag_state["current_active_node"] = "frame_acquire"

    latest_telemetry["current_top_line"] = 1
    latest_telemetry["current_page"] = 1
    latest_telemetry["status_message"] = f"Line 1 Verified at Top (Detected Ln {detected_first}) via Ctrl+Home ✔"

    await ws_manager.broadcast({
        "type": "dag_updated", "dag": dag_state,
        "calibration_event": "home_verified", "verified": is_verified, "first_line": detected_first
    })
    return {"status": "success", "verified": is_verified, "first_line": detected_first}

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

@app.delete("/api/frames/{frame_id}")
async def delete_frame(frame_id: str):
    if not db.delete_frame(frame_id):
        raise HTTPException(status_code=404, detail="Frame not found")
    load_persisted_state()
    try:
        pid = get_current_project_id()
        with open(DOCUMENT_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "lines": {str(k): v.to_dict() if hasattr(v, "to_dict") else (v if isinstance(v, dict) else {"text": str(v)}) for k, v in sorted(document_lines.items())},
                "frames": captured_frames,
                "token_stats": token_stats,
                "latest_telemetry": latest_telemetry,
                "updated_at": datetime.now().isoformat()
            }, f, indent=2)
    except Exception as e:
        print(f"Error saving JSON after frame deletion: {e}")
    await ws_manager.broadcast({
        "type": "frame_deleted",
        "frame_id": frame_id,
        "frames": db.get_frames(get_current_project_id())
    })
    sl = get_serialized_lines()
    issues = [item for item in sl if item.get("status") in ["flagged", "missing", "overlap_conflict"]]
    await ws_manager.broadcast({
        "type": "document_updated",
        "data": {
            "total_lines": len(document_lines),
            "min_line": min(document_lines.keys()) if document_lines else 0,
            "max_line": max(document_lines.keys()) if document_lines else 0,
            "total_frames": len(captured_frames),
            "issue_count": len(issues),
            "token_stats": token_stats,
            "latest_telemetry": get_fresh_telemetry(),
            "issues": issues,
            "lines": sl
        }
    })
    return {"status": "success", "frame_id": frame_id}

@app.post("/api/frames/{frame_id}/delete")
async def delete_frame_post(frame_id: str):
    return await delete_frame(frame_id)

@app.get("/api/frames")
async def get_frames(): return db.get_frames(get_current_project_id())

@app.get("/api/frames/{frame_id}/image")
async def get_frame_image(frame_id: str):
    path = FRAMES_DIR / f"{frame_id}.png"
    if not path.exists():
        matches = list(FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches: path = matches[0]
        else: raise HTTPException(status_code=404, detail="Frame image not found")
    return FileResponse(
        path,
        media_type="image/png",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@app.post("/api/frames/{frame_id}/reprocess")
async def reprocess_frame(frame_id: str, background_tasks: BackgroundTasks, model_target: Optional[str] = Query(None), payload: Optional[ReprocessRequest] = None):
    if frame_id not in captured_frames: raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    finfo = captured_frames[frame_id]; ipath = FRAMES_DIR / finfo.get("filename", f"{frame_id}.png")
    if not ipath.exists():
        matches = list(FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches: ipath = matches[0]
        else: raise HTTPException(status_code=404, detail="Frame image file not found")
    mt = normalize_model_target((payload.model_target if payload and payload.model_target else None) or model_target)
    captured_frames[frame_id]["status"] = "queued"; save_persisted_state()
    background_tasks.add_task(process_frame_with_target, frame_id, ipath, finfo.get("top_line", 0), finfo.get("bottom_line", 0), mt)
    return {"status": "success", "message": f"Reprocessing scheduled for frame {frame_id} with {mt}", "model_target": mt}

@app.post("/api/reprocess-failed")
async def reprocess_failed(background_tasks: BackgroundTasks, model_target: Optional[str] = Query(None), payload: Optional[ReprocessRequest] = None):
    mt = normalize_model_target((payload.model_target if payload and payload.model_target else None) or model_target)
    reprocessed = []
    for f_id, f_info in captured_frames.items():
        if f_info.get("status", "").startswith("error") or f_info.get("extracted_line_count", 0) == 0:
            ipath = FRAMES_DIR / f_info.get("filename", f"{f_id}.png")
            if not ipath.exists():
                m = list(FRAMES_DIR.glob(f"*{f_id}*.png"))
                if m: ipath = m[0]
            if ipath.exists():
                f_info["status"] = "queued"
                background_tasks.add_task(process_frame_with_target, f_id, ipath, f_info.get("top_line", 0), f_info.get("bottom_line", 0), mt)
                reprocessed.append(f_id)
    save_persisted_state()
    return {"status": "success", "reprocessed_frames": reprocessed, "count": len(reprocessed), "model_target": mt}

@app.get("/api/document")
async def get_document():
    sl = get_serialized_lines()
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
    lv = document_lines[line_number]
    return {"status": "success", "line": lv.to_dict() if hasattr(lv, "to_dict") else lv}

@app.post("/api/lines/{line_number}/flag")
async def flag_line(line_number: int, req: FlagRequest):
    if line_number not in document_lines: raise HTTPException(status_code=404, detail="Line not found")
    document_lines[line_number].update({"status": "flagged", "notes": req.notes, "updated_at": datetime.now().isoformat()})
    save_persisted_state()
    lv = document_lines[line_number]
    return {"status": "success", "line": lv.to_dict() if hasattr(lv, "to_dict") else lv}

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
    sl = get_serialized_lines()
    payload = {"schema_version": "2.5.0", "exported_at": datetime.now().isoformat(), "document_metadata": {"total_lines": len(document_lines), "min_line": min(document_lines.keys()) if document_lines else 0, "max_line": max(document_lines.keys()) if document_lines else 0, "total_frames": len(captured_frames), "token_stats": token_stats, "issues_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])}, "frames": captured_frames, "lines": sl}
    return JSONResponse(content=payload, headers={"Content-Disposition": "attachment; filename=matrix_document_vfs_monaco.json"})

@app.get("/api/export-markdown")
async def export_markdown():
    if not document_lines: return PlainTextResponse("# Matrix Document\n\n(No lines transcribed yet)")
    min_ln, max_ln = min(document_lines.keys()), max(document_lines.keys())
    assembled = []
    for ln in range(min_ln, max_ln + 1):
        if ln in document_lines:
            line_val = document_lines[ln]
            if hasattr(line_val, "get") and line_val.get("status") == "missing" and not str(line_val).strip():
                assembled.append(f"// [MISSING LINE {ln}]")
            else:
                assembled.append(str(line_val))
        else:
            assembled.append(f"// [MISSING LINE {ln}]")
    return PlainTextResponse("\n".join(assembled), headers={"Content-Disposition": "attachment; filename=Matrix_main_transcribed.md"})

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
    try: uvicorn.run("main:app", host=config.SERVER_HOST, port=config.SERVER_PORT, reload=True)
    except OSError as e:
        if getattr(e, 'winerror', None) == 10048 or getattr(e, 'errno', None) == 10048:
            print(f"[ERROR] Port {config.SERVER_PORT} is in use."); sys.exit(1)
        else: raise
