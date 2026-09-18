import os
import json
import glob
import re
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, JSONResponse
from pydantic import BaseModel
from PIL import Image

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

import config

app = FastAPI(title="MatrixCapture Frame & Verification Server", version="2.5.0")

# Enable CORS for Vite React frontend running on localhost:5173 or LAN
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR = config.STORAGE_DIR
FRAMES_DIR = config.FRAMES_DIR
DATA_DIR = config.DATA_DIR
CONFIG_FILE = config.CONFIG_FILE
DOCUMENT_FILE = config.DOCUMENT_FILE
RECAPTURE_QUEUE_FILE = config.RECAPTURE_QUEUE_FILE

# Document lines dictionary: line_number (int) -> LineData
document_lines: Dict[int, Dict[str, Any]] = {}
captured_frames: Dict[str, Dict[str, Any]] = {}
recapture_queue: List[Dict[str, Any]] = []

# Token utilization stats
token_stats: Dict[str, Any] = {
    "total_prompt_tokens": 0,
    "total_candidates_tokens": 0,
    "total_tokens": 0,
    "total_api_calls": 0,
    "estimated_cost_usd": 0.0,
    "mobile_tokens": {
        "prompt_tokens": 0,
        "candidates_tokens": 0,
        "total_tokens": 0
    }
}

# Realtime mobile and pacer telemetry
latest_telemetry: Dict[str, Any] = {
    "device_id": "idle",
    "is_pacing": False,
    "current_page": 0,
    "current_top_line": 0,
    "current_bottom_line": 0,
    "target_total_lines": config.TARGET_TOTAL_LINES,
    "dwell_countdown_ms": 0,
    "phase": "IDLE",
    "status_message": "Matrix Capture Studio ready",
    "last_heartbeat": None,
    "pacer_calibration": {
        "auto_tune_factor": config.PACER_AUTO_TUNE_FACTOR,
        "line_pitch_px": config.PACER_LINE_PITCH_PX,
        "bottom_to_top_error": 0,
        "wrapped_lines_detected": 0
    }
}


def load_persisted_state():
    global document_lines, captured_frames, recapture_queue, token_stats, latest_telemetry
    if DOCUMENT_FILE.exists():
        try:
            with open(DOCUMENT_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                document_lines = {int(k): v for k, v in saved.get("lines", {}).items()}
                captured_frames = saved.get("frames", {})
                token_stats.update(saved.get("token_stats", {}))
                latest_telemetry.update(saved.get("latest_telemetry", {}))
        except Exception as e:
            print(f"Error loading document state: {e}")
    if RECAPTURE_QUEUE_FILE.exists():
        try:
            with open(RECAPTURE_QUEUE_FILE, "r", encoding="utf-8") as f:
                recapture_queue = json.load(f)
        except Exception as e:
            print(f"Error loading recapture queue: {e}")


def save_persisted_state():
    try:
        with open(DOCUMENT_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "lines": {str(k): v for k, v in sorted(document_lines.items())},
                "frames": captured_frames,
                "token_stats": token_stats,
                "latest_telemetry": latest_telemetry,
                "updated_at": datetime.now().isoformat()
            }, f, indent=2)
        with open(RECAPTURE_QUEUE_FILE, "w", encoding="utf-8") as f:
            json.dump(recapture_queue, f, indent=2)
    except Exception as e:
        print(f"Error saving state: {e}")


load_persisted_state()


class ConfigRequest(BaseModel):
    api_key: str


class LineEditRequest(BaseModel):
    text: str
    status: Optional[str] = None
    notes: Optional[str] = None


class FlagRequest(BaseModel):
    notes: str


class RecaptureRequest(BaseModel):
    line_number: int
    reason: str


class TelemetryUpdateRequest(BaseModel):
    device_id: Optional[str] = "Pixel 10 Desktop"
    is_pacing: Optional[bool] = False
    current_page: Optional[int] = 0
    current_top_line: Optional[int] = 0
    current_bottom_line: Optional[int] = 0
    target_total_lines: Optional[int] = 9487
    dwell_countdown_ms: Optional[int] = 0
    phase: Optional[str] = "IDLE"
    status_message: Optional[str] = ""
    mobile_tokens: Optional[Dict[str, int]] = None
    pacer_calibration: Optional[Dict[str, Any]] = None


async def process_frame_with_gemini(frame_id: str, image_path: Path, top_line: int, bottom_line: int):
    """
    Calls Gemini Vision API with structured JSON output schema
    to transcribe exact line numbers and text verbatim while tracking token utilization.
    """
    global document_lines, captured_frames, token_stats
    print(f"Processing frame {frame_id} (Lines {top_line} -> {bottom_line}) with Gemini...")

    if not config.GEMINI_API_KEY:
        print("Warning: Gemini API Key is not set. Frame saved but not transcribed.")
        captured_frames[frame_id]["status"] = "awaiting_api_key"
        save_persisted_state()
        return

    try:
        client = genai.Client(api_key=config.GEMINI_API_KEY)

        prompt = f"""
You are an uncompromising, bit-level OCR code extraction and gutter line tracking engine.
You are given a high-resolution screenshot of a code document displayed in Microsoft Teams Markdown / Code viewer.
The left gutter displays line numbers. This view covers approximately lines {top_line if top_line > 0 else 'start'} through {bottom_line if bottom_line > 0 else 'end'}.

CRITICAL INSTRUCTIONS:
1. Identify the left gutter line numbers and transcribe EVERY visible line VERBATIM, preserving exact indentation, whitespace, punctuation, brackets, comments, and empty lines.
2. Note that lines may WRAP. When a line wraps, the gutter line number only appears on the FIRST visual line of that code line. Subsequent wrapped lines have a blank gutter. Mark wrapped lines accordingly.
3. Ignore header toolbars and footer status bars. Focus strictly on the editor body and gutter.
4. Output MUST be a valid JSON array of objects with the exact schema:
[
  {{
    "line_number": <int, the true logical line number>,
    "gutter_number": <int, line number shown in left gutter>,
    "text": "<verbatim line content without the line number prefix>",
    "is_blank": <boolean>,
    "is_wrapped": <boolean, true if line wraps to multiple visual rows>,
    "wrapped_line_count": <int, number of visual rows this line occupies, default 1>,
    "flagged": <boolean, true if line is partially cut off at viewport edge or ambiguous>
  }}
]
Do not omit any lines. Do not truncate or use placeholders. Return ONLY the valid JSON array.
"""

        pil_image = Image.open(image_path)

        # Candidate models with primary and instant fallbacks for demand spikes (503/429)
        candidate_models = config.get_candidate_models()
        response = None
        last_error = None
        model_used = "unknown"

        for model_name in candidate_models:
            for attempt in range(config.GEMINI_RETRY_ATTEMPTS):
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[pil_image, prompt],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json"
                        )
                    )
                    if response and response.text:
                        model_used = model_name
                        break
                except Exception as ex:
                    last_error = ex
                    err_str = str(ex).lower()
                    if "404" in err_str or "not_found" in err_str:
                        print(f"Model {model_name} returned 404 NOT FOUND. Trying next fallback...")
                        break
                    if attempt < (config.GEMINI_RETRY_ATTEMPTS - 1) and ("503" in err_str or "unavailable" in err_str or "429" in err_str or "high demand" in err_str):
                        backoff = config.GEMINI_RETRY_BACKOFF_BASE * (attempt + 1)
                        print(f"Transient error on {model_name} (attempt {attempt + 1}/{config.GEMINI_RETRY_ATTEMPTS}): {ex}. Retrying in {backoff}s...")
                        await asyncio.sleep(backoff)
                    else:
                        print(f"Switching from {model_name} to next fallback model due to: {ex}")
                        break
            if response and response.text:
                break

        if not response or not response.text:
            raise last_error or RuntimeError("All candidate Gemini models failed to generate content.")

        # Track token usage from response metadata
        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
        candidates_tokens = getattr(usage, "candidates_token_count", 0) or 0
        total_tokens = getattr(usage, "total_token_count", 0) or (prompt_tokens + candidates_tokens)

        token_stats["total_prompt_tokens"] += prompt_tokens
        token_stats["total_candidates_tokens"] += candidates_tokens
        token_stats["total_tokens"] += total_tokens
        token_stats["total_api_calls"] += 1
        token_stats["estimated_cost_usd"] = round(
            (token_stats["total_prompt_tokens"] / 1_000_000 * config.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS) +
            (token_stats["total_candidates_tokens"] / 1_000_000 * config.GEMINI_PRICE_PER_MILLION_CANDIDATE_TOKENS),
            6
        )

        captured_frames[frame_id]["token_usage"] = {
            "prompt_tokens": prompt_tokens,
            "candidates_tokens": candidates_tokens,
            "total_tokens": total_tokens
        }
        captured_frames[frame_id]["model_used"] = model_used

        raw_text = (response.text or "[]").strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
            raw_text = re.sub(r"\s*```$", "", raw_text)
        parsed_lines = json.loads(raw_text)

        lines_added = 0
        min_detected = 999999
        max_detected = 0

        for item in parsed_lines:
            ln = item.get("line_number")
            if ln is None:
                continue
            ln = int(ln)
            text = item.get("text", "")
            is_blank = item.get("is_blank", not bool(text.strip()))
            is_wrapped = item.get("is_wrapped", False)
            wrapped_line_count = item.get("wrapped_line_count", 1)
            flagged = item.get("flagged", False)
            gutter_num = item.get("gutter_number", ln)

            min_detected = min(min_detected, ln)
            max_detected = max(max_detected, ln)

            status = "flagged" if flagged else "ok"
            existing = document_lines.get(ln)
            sources = [frame_id]

            if existing:
                sources = list(set(existing.get("sources", [existing.get("frame_id", frame_id)]) + [frame_id]))
                if existing.get("text") == text:
                    status = "verified_overlap"
                else:
                    status = "overlap_conflict"

            document_lines[ln] = {
                "line_number": ln,
                "gutter_number": gutter_num,
                "text": text,
                "is_blank": is_blank,
                "is_wrapped": is_wrapped,
                "wrapped_line_count": wrapped_line_count,
                "status": status,
                "frame_id": frame_id,
                "sources": sources,
                "confidence": 1.0 if status != "flagged" else 0.75,
                "notes": "Verified by Gemini Vision OCR" if status != "overlap_conflict" else f"Differs between frames {sources}",
                "updated_at": datetime.now().isoformat()
            }
            lines_added += 1

        if min_detected <= max_detected:
            captured_frames[frame_id]["top_line"] = min_detected
            captured_frames[frame_id]["bottom_line"] = max_detected

        captured_frames[frame_id]["status"] = "processed"
        captured_frames[frame_id]["extracted_line_count"] = lines_added
        print(f"Frame {frame_id} processed: {lines_added} lines extracted. Tokens: {total_tokens} (Prompt: {prompt_tokens}, Output: {candidates_tokens})")

        # Check for gaps between min and max lines
        if document_lines:
            min_line = min(document_lines.keys())
            max_line = max(document_lines.keys())
            for check_ln in range(min_line, max_line + 1):
                if check_ln not in document_lines:
                    document_lines[check_ln] = {
                        "line_number": check_ln,
                        "gutter_number": check_ln,
                        "text": "",
                        "is_blank": False,
                        "is_wrapped": False,
                        "wrapped_line_count": 1,
                        "status": "missing",
                        "frame_id": frame_id,
                        "sources": [],
                        "confidence": 0.0,
                        "notes": "Gap detected between frames",
                        "updated_at": datetime.now().isoformat()
                    }

    except Exception as e:
        print(f"Error processing frame {frame_id} with Gemini: {e}")
        captured_frames[frame_id]["status"] = f"error: {str(e)}"
    finally:
        save_persisted_state()


@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "has_api_key": bool(config.GEMINI_API_KEY),
        "total_lines": len(document_lines),
        "total_frames": len(captured_frames),
        "pending_recaptures": len(recapture_queue),
        "token_stats": token_stats,
        "is_pacing": latest_telemetry.get("is_pacing", False)
    }


@app.get("/api/config")
async def get_config():
    key = config.GEMINI_API_KEY
    masked = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else ("Set" if key else "Missing")
    return {"api_key_configured": bool(key), "api_key_preview": masked}


@app.post("/api/config")
async def set_config(req: ConfigRequest):
    config.set_api_key(req.api_key)
    return {"status": "success", "message": "API key updated."}


@app.get("/api/token-stats")
async def get_token_stats():
    """
    Returns full token utilization breakdown and estimated Gemini API costs.
    """
    return {
        "server_tokens": {
            "prompt_tokens": token_stats.get("total_prompt_tokens", 0),
            "candidates_tokens": token_stats.get("total_candidates_tokens", 0),
            "total_tokens": token_stats.get("total_tokens", 0),
            "api_calls": token_stats.get("total_api_calls", 0),
            "estimated_cost_usd": token_stats.get("estimated_cost_usd", 0.0)
        },
        "mobile_tokens": token_stats.get("mobile_tokens", {}),
        "total_tokens": token_stats.get("total_tokens", 0) + token_stats.get("mobile_tokens", {}).get("total_tokens", 0)
    }


@app.get("/api/telemetry")
async def get_telemetry():
    """
    Polled by the Web UI to display live pacer, dwell countdown, auto-tuning and token telemetry.
    """
    sorted_lines = [document_lines[k] for k in sorted(document_lines.keys())]
    verified_count = sum(1 for ln in sorted_lines if ln.get("status") == "verified_overlap")
    issue_count = sum(1 for ln in sorted_lines if ln.get("status") in ["flagged", "missing", "overlap_conflict"])

    return {
        "telemetry": latest_telemetry,
        "token_stats": token_stats,
        "document_summary": {
            "total_lines": len(document_lines),
            "min_line": min(document_lines.keys()) if document_lines else 0,
            "max_line": max(document_lines.keys()) if document_lines else 0,
            "total_frames": len(captured_frames),
            "verified_overlap_lines": verified_count,
            "issue_count": issue_count
        }
    }


@app.post("/api/telemetry")
async def update_telemetry(payload: TelemetryUpdateRequest):
    """
    Published by the Android mobile app to update live pacer state, line numbers, dwell timer, and calibration.
    """
    global latest_telemetry, token_stats
    latest_telemetry["device_id"] = payload.device_id
    latest_telemetry["is_pacing"] = payload.is_pacing
    latest_telemetry["current_page"] = payload.current_page
    latest_telemetry["current_top_line"] = payload.current_top_line
    latest_telemetry["current_bottom_line"] = payload.current_bottom_line
    latest_telemetry["target_total_lines"] = payload.target_total_lines
    latest_telemetry["dwell_countdown_ms"] = payload.dwell_countdown_ms
    latest_telemetry["phase"] = payload.phase
    latest_telemetry["status_message"] = payload.status_message
    latest_telemetry["last_heartbeat"] = datetime.now().isoformat()

    if payload.pacer_calibration:
        latest_telemetry["pacer_calibration"].update(payload.pacer_calibration)

    if payload.mobile_tokens:
        token_stats["mobile_tokens"] = payload.mobile_tokens

    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.post("/api/upload-frame")
async def upload_frame(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    top_line: Optional[int] = Form(0),
    bottom_line: Optional[int] = Form(0),
    page_index: Optional[int] = Form(0)
):
    """
    Accepts settled 1080p frame from mobile app or drag-and-drop web UI
    and initiates structured Gemini extraction.
    """
    contents = await file.read()
    now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
    page_idx = page_index if page_index and page_index > 0 else len(captured_frames) + 1

    if top_line and top_line > 0 and bottom_line and bottom_line > 0:
        frame_id = f"frame_{top_line:05d}_{bottom_line:05d}"
    else:
        frame_id = f"frame_p{page_idx:03d}_{now_str}"

    image_filename = f"{frame_id}.png"
    target_path = FRAMES_DIR / image_filename

    with open(target_path, "wb") as f:
        f.write(contents)

    captured_frames[frame_id] = {
        "frame_id": frame_id,
        "filename": image_filename,
        "top_line": top_line or 0,
        "bottom_line": bottom_line or 0,
        "page_index": page_idx,
        "file_size": len(contents),
        "status": "queued",
        "created_at": datetime.now().isoformat(),
        "extracted_line_count": 0,
        "token_usage": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
    }
    save_persisted_state()

    # Launch Gemini OCR in background
    background_tasks.add_task(process_frame_with_gemini, frame_id, target_path, top_line or 0, bottom_line or 0)

    return {
        "status": "success",
        "frame_id": frame_id,
        "page_index": page_idx,
        "message": f"Frame stored. Analyzing lines {top_line or 0} -> {bottom_line or 0}."
    }


@app.get("/api/frames")
async def get_frames():
    return list(captured_frames.values())


@app.get("/api/frames/{frame_id}/image")
async def get_frame_image(frame_id: str):
    path = FRAMES_DIR / f"{frame_id}.png"
    if not path.exists():
        # Fallback check
        matches = list(FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches:
            path = matches[0]
        else:
            raise HTTPException(status_code=404, detail="Frame image not found")
    return FileResponse(path, media_type="image/png")


@app.post("/api/frames/{frame_id}/reprocess")
async def reprocess_frame(frame_id: str, background_tasks: BackgroundTasks):
    """
    Manually re-triggers Gemini OCR extraction on a previously captured frame.
    """
    if frame_id not in captured_frames:
        raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")

    frame_info = captured_frames[frame_id]
    image_filename = frame_info.get("filename", f"{frame_id}.png")
    image_path = FRAMES_DIR / image_filename
    if not image_path.exists():
        matches = list(FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches:
            image_path = matches[0]
        else:
            raise HTTPException(status_code=404, detail="Frame image file not found")

    captured_frames[frame_id]["status"] = "queued"
    save_persisted_state()
    background_tasks.add_task(
        process_frame_with_gemini,
        frame_id,
        image_path,
        frame_info.get("top_line", 0),
        frame_info.get("bottom_line", 0)
    )
    return {"status": "success", "message": f"Reprocessing scheduled for frame {frame_id}"}


@app.post("/api/reprocess-failed")
async def reprocess_failed(background_tasks: BackgroundTasks):
    """
    Re-triggers Gemini OCR extraction on all frames that are in error or 0 extracted lines.
    """
    reprocessed = []
    for f_id, f_info in captured_frames.items():
        st = f_info.get("status", "")
        if st.startswith("error") or f_info.get("extracted_line_count", 0) == 0:
            image_filename = f_info.get("filename", f"{f_id}.png")
            image_path = FRAMES_DIR / image_filename
            if not image_path.exists():
                matches = list(FRAMES_DIR.glob(f"*{f_id}*.png"))
                if matches:
                    image_path = matches[0]
            if image_path.exists():
                f_info["status"] = "queued"
                background_tasks.add_task(
                    process_frame_with_gemini,
                    f_id,
                    image_path,
                    f_info.get("top_line", 0),
                    f_info.get("bottom_line", 0)
                )
                reprocessed.append(f_id)

    save_persisted_state()
    return {"status": "success", "reprocessed_frames": reprocessed, "count": len(reprocessed)}


@app.get("/api/document")
async def get_document():
    sorted_lines = [document_lines[k] for k in sorted(document_lines.keys())]
    issues = [item for item in sorted_lines if item.get("status") in ["flagged", "missing", "overlap_conflict"]]

    return {
        "total_lines": len(document_lines),
        "min_line": min(document_lines.keys()) if document_lines else 0,
        "max_line": max(document_lines.keys()) if document_lines else 0,
        "total_frames": len(captured_frames),
        "issue_count": len(issues),
        "token_stats": token_stats,
        "latest_telemetry": latest_telemetry,
        "issues": issues,
        "lines": sorted_lines
    }


@app.post("/api/lines/{line_number}/edit")
async def edit_line(line_number: int, req: LineEditRequest):
    if line_number not in document_lines:
        document_lines[line_number] = {
            "line_number": line_number,
            "gutter_number": line_number,
            "text": req.text,
            "is_blank": not bool(req.text.strip()),
            "is_wrapped": False,
            "wrapped_line_count": 1,
            "status": req.status or "manually_edited",
            "frame_id": "manual",
            "sources": ["manual"],
            "confidence": 1.0,
            "notes": req.notes or "Manually inserted",
            "updated_at": datetime.now().isoformat()
        }
    else:
        document_lines[line_number]["text"] = req.text
        if req.status:
            document_lines[line_number]["status"] = req.status
        else:
            document_lines[line_number]["status"] = "manually_edited"
        if req.notes:
            document_lines[line_number]["notes"] = req.notes
        document_lines[line_number]["updated_at"] = datetime.now().isoformat()

    save_persisted_state()
    return {"status": "success", "line": document_lines[line_number]}


@app.post("/api/lines/{line_number}/flag")
async def flag_line(line_number: int, req: FlagRequest):
    if line_number not in document_lines:
        raise HTTPException(status_code=404, detail="Line not found")
    document_lines[line_number]["status"] = "flagged"
    document_lines[line_number]["notes"] = req.notes
    document_lines[line_number]["updated_at"] = datetime.now().isoformat()
    save_persisted_state()
    return {"status": "success", "line": document_lines[line_number]}


@app.post("/api/lines/{line_number}/request-recapture")
async def request_recapture(line_number: int, req: RecaptureRequest):
    item = {
        "line_number": line_number,
        "reason": req.reason,
        "requested_at": datetime.now().isoformat()
    }
    recapture_queue.append(item)
    if line_number in document_lines:
        document_lines[line_number]["status"] = "recapturing"
    save_persisted_state()
    return {"status": "queued", "item": item, "queue_size": len(recapture_queue)}


@app.get("/api/recapture-queue")
async def get_recapture_queue():
    return recapture_queue


@app.post("/api/recapture-completed")
async def recapture_completed(req: RecaptureRequest):
    global recapture_queue
    recapture_queue = [q for q in recapture_queue if q.get("line_number") != req.line_number]
    save_persisted_state()
    return {"status": "success", "remaining": len(recapture_queue)}


@app.get("/api/export-json")
async def export_json():
    """
    Exports full document state with gutter line numbers, verbatim text, wrap attributes,
    and frame provenance for downstream Virtual File System (VFS) and Monaco Editor consumption.
    """
    sorted_lines = [document_lines[k] for k in sorted(document_lines.keys())]

    export_payload = {
        "schema_version": "2.5.0",
        "exported_at": datetime.now().isoformat(),
        "document_metadata": {
            "total_lines": len(document_lines),
            "min_line": min(document_lines.keys()) if document_lines else 0,
            "max_line": max(document_lines.keys()) if document_lines else 0,
            "total_frames": len(captured_frames),
            "token_stats": token_stats,
            "issues_count": sum(1 for ln in sorted_lines if ln.get("status") in ["flagged", "missing", "overlap_conflict"])
        },
        "frames": captured_frames,
        "lines": sorted_lines
    }

    return JSONResponse(
        content=export_payload,
        headers={"Content-Disposition": "attachment; filename=matrix_document_vfs_monaco.json"}
    )


@app.get("/api/export-markdown")
async def export_markdown():
    if not document_lines:
        return PlainTextResponse("# Matrix Document\n\n(No lines transcribed yet)")

    sorted_keys = sorted(document_lines.keys())
    content_lines = []
    for k in sorted_keys:
        content_lines.append(document_lines[k].get("text", ""))

    full_markdown = "\n".join(content_lines)
    return PlainTextResponse(full_markdown, headers={
        "Content-Disposition": "attachment; filename=Matrix_main_transcribed.md"
    })


@app.post("/api/reset-state")
async def reset_state():
    """
    Resets document lines and frames for a clean capture session.
    """
    global document_lines, captured_frames, recapture_queue, token_stats
    document_lines = {}
    captured_frames = {}
    recapture_queue = []
    token_stats = {
        "total_prompt_tokens": 0,
        "total_candidates_tokens": 0,
        "total_tokens": 0,
        "total_api_calls": 0,
        "estimated_cost_usd": 0.0,
        "mobile_tokens": {
            "prompt_tokens": 0,
            "candidates_tokens": 0,
            "total_tokens": 0
        }
    }
    save_persisted_state()
    return {"status": "success", "message": "Document state reset."}


if __name__ == "__main__":
    import uvicorn
    print(f"Starting MatrixCapture FastAPI backend on {config.SERVER_HOST}:{config.SERVER_PORT}...")
    uvicorn.run(app, host=config.SERVER_HOST, port=config.SERVER_PORT)
