import os
import json
import glob
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
from PIL import Image

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

app = FastAPI(title="MatrixCapture Frame & Verification Server", version="2.0.0")

# Enable CORS for Vite React frontend running on localhost:5173 or LAN
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage"
FRAMES_DIR = STORAGE_DIR / "frames"
DATA_DIR = STORAGE_DIR / "data"

for d in [STORAGE_DIR, FRAMES_DIR, DATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

CONFIG_FILE = DATA_DIR / "config.json"
DOCUMENT_FILE = DATA_DIR / "document_state.json"
RECAPTURE_QUEUE_FILE = DATA_DIR / "recapture_queue.json"

# In-memory document state
gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
if CONFIG_FILE.exists():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            gemini_api_key = cfg.get("api_key", gemini_api_key)
    except Exception:
        pass

# Document lines dictionary: line_number (int) -> LineData
document_lines: Dict[int, Dict[str, Any]] = {}
captured_frames: Dict[str, Dict[str, Any]] = {}
recapture_queue: List[Dict[str, Any]] = []

def load_persisted_state():
    global document_lines, captured_frames, recapture_queue
    if DOCUMENT_FILE.exists():
        try:
            with open(DOCUMENT_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                document_lines = {int(k): v for k, v in saved.get("lines", {}).items()}
                captured_frames = saved.get("frames", {})
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


async def process_frame_with_gemini(frame_id: str, image_path: Path, top_line: int, bottom_line: int):
    """
    Calls Gemini Vision API with structured JSON output schema
    to transcribe exact line numbers and text verbatim.
    """
    global document_lines, captured_frames
    print(f"Processing frame {frame_id} (Lines {top_line} -> {bottom_line}) with Gemini...")

    if not gemini_api_key:
        print("Warning: Gemini API Key is not set. Frame saved but not transcribed.")
        captured_frames[frame_id]["status"] = "awaiting_api_key"
        save_persisted_state()
        return

    try:
        client = genai.Client(api_key=gemini_api_key)
        
        prompt = f"""
You are an expert OCR and code extraction system.
You are given a high-resolution screenshot of a code document displayed in Microsoft Teams Markdown viewer.
The left gutter displays line numbers. This view covers approximately lines {top_line} through {bottom_line}.

Your task is to transcribe EVERY visible line VERBATIM, preserving exact indentation, punctuation, brackets, comments, and empty lines.
Output MUST be a JSON array of objects with the exact schema:
[
  {{
    "line_number": <int>,
    "text": "<verbatim line content without the line number prefix>",
    "is_blank": <boolean>,
    "flagged": <boolean, true if line is partially cut off or ambiguous>
  }}
]
Do not omit any lines. Do not truncate. Return ONLY the valid JSON array.
"""

        pil_image = Image.open(image_path)

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[pil_image, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        raw_text = response.text or "[]"
        parsed_lines = json.loads(raw_text)

        lines_added = 0
        for item in parsed_lines:
            ln = item.get("line_number")
            if ln is None:
                continue
            ln = int(ln)
            text = item.get("text", "")
            is_blank = item.get("is_blank", False)
            flagged = item.get("flagged", False)

            status = "flagged" if flagged else "ok"
            if ln in document_lines:
                existing = document_lines[ln]
                if existing.get("text") == text:
                    status = "verified_overlap"
                else:
                    status = "overlap_conflict"

            document_lines[ln] = {
                "line_number": ln,
                "text": text,
                "is_blank": is_blank,
                "status": status,
                "frame_id": frame_id,
                "notes": "Verified by Gemini OCR" if status != "overlap_conflict" else f"Differs from previous frame {existing.get('frame_id')}",
                "updated_at": datetime.now().isoformat()
            }
            lines_added += 1

        captured_frames[frame_id]["status"] = "processed"
        captured_frames[frame_id]["extracted_line_count"] = lines_added
        print(f"Frame {frame_id} processed successfully: {lines_added} lines extracted.")

        # Check for gaps
        min_line = min(document_lines.keys()) if document_lines else 1
        max_line = max(document_lines.keys()) if document_lines else 1
        for check_ln in range(min_line, max_line + 1):
            if check_ln not in document_lines:
                document_lines[check_ln] = {
                    "line_number": check_ln,
                    "text": "",
                    "is_blank": False,
                    "status": "missing",
                    "frame_id": frame_id,
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
        "has_api_key": bool(gemini_api_key),
        "total_lines": len(document_lines),
        "total_frames": len(captured_frames),
        "pending_recaptures": len(recapture_queue)
    }

@app.get("/api/config")
async def get_config():
    masked = f"{gemini_api_key[:6]}...{gemini_api_key[-4:]}" if len(gemini_api_key) > 10 else ("Set" if gemini_api_key else "Missing")
    return {"api_key_configured": bool(gemini_api_key), "api_key_preview": masked}

@app.post("/api/config")
async def set_config(req: ConfigRequest):
    global gemini_api_key
    gemini_api_key = req.api_key.strip()
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump({"api_key": gemini_api_key}, f, indent=2)
    return {"status": "success", "message": "API key updated."}


@app.post("/api/upload-frame")
async def upload_frame(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    top_line: int = Form(...),
    bottom_line: int = Form(...),
    page_index: int = Form(...)
):
    """
    Accepts settled 1080p frame from mobile app and initiates structured Gemini extraction.
    """
    frame_id = f"frame_{top_line:05d}_{bottom_line:05d}"
    image_filename = f"{frame_id}.png"
    target_path = FRAMES_DIR / image_filename

    contents = await file.read()
    with open(target_path, "wb") as f:
        f.write(contents)

    captured_frames[frame_id] = {
        "frame_id": frame_id,
        "filename": image_filename,
        "top_line": top_line,
        "bottom_line": bottom_line,
        "page_index": page_index,
        "file_size": len(contents),
        "status": "queued",
        "created_at": datetime.now().isoformat(),
        "extracted_line_count": 0
    }
    save_persisted_state()

    # Launch Gemini OCR in background
    background_tasks.add_task(process_frame_with_gemini, frame_id, target_path, top_line, bottom_line)

    return {
        "status": "success",
        "frame_id": frame_id,
        "message": f"Frame stored. Analyzing lines {top_line} -> {bottom_line}."
    }


@app.get("/api/frames")
async def get_frames():
    return list(captured_frames.values())


@app.get("/api/frames/{frame_id}/image")
async def get_frame_image(frame_id: str):
    path = FRAMES_DIR / f"{frame_id}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Frame image not found")
    return FileResponse(path, media_type="image/png")


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
        "issues": issues,
        "lines": sorted_lines
    }


@app.post("/api/lines/{line_number}/edit")
async def edit_line(line_number: int, req: LineEditRequest):
    if line_number not in document_lines:
        document_lines[line_number] = {
            "line_number": line_number,
            "text": req.text,
            "is_blank": not bool(req.text.strip()),
            "status": req.status or "manually_edited",
            "frame_id": "manual",
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
    """
    Polled by Android mobile app to check if any line needs to be brought into view and recaptured.
    """
    return recapture_queue


@app.post("/api/recapture-completed")
async def recapture_completed(req: RecaptureRequest):
    global recapture_queue
    recapture_queue = [q for q in recapture_queue if q.get("line_number") != req.line_number]
    save_persisted_state()
    return {"status": "success", "remaining": len(recapture_queue)}


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


if __name__ == "__main__":
    import uvicorn
    print("Starting MatrixCapture FastAPI backend on 0.0.0.0:8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
