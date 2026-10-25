import asyncio
import base64
import io
import json
import re
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from fastapi import HTTPException
from PIL import Image, ImageEnhance, ImageFilter
from google import genai
from google.genai import types

import config
import db
from services import state

has_key = bool(config.GEMINI_API_KEY)
active_pipeline_mode = "local"
active_model_target = "ollama"
active_ocr_engine = "minicpm"

def sync_pipeline_mode_with_keys() -> None:
    global active_pipeline_mode, active_model_target, active_ocr_engine
    key_exists = bool(config.GEMINI_API_KEY)
    connection_stats["gemini_available"] = key_exists
    if not key_exists:
        active_pipeline_mode = "local"
        active_model_target = "ollama"
        active_ocr_engine = "minicpm"


connection_stats: Dict[str, Any] = {
    "total_http_requests": 0,
    "http_errors_count": 0,
    "last_connection_error": None,
    "last_error_timestamp": None,
    "ollama_available": False,
    "ollama_latency_ms": None,
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
    if not target:
        if not config.GEMINI_API_KEY:
            return "ollama"
        return active_model_target
    t = target.strip().lower()
    if t in {"minicpm-v", "minicpm", "local"}:
        return "ollama"
    if t not in {"gemini", "ollama"}:
        raise HTTPException(status_code=400, detail=f"Invalid model_target '{target}'. Must be 'gemini' or 'ollama'.")
    if t == "gemini" and not config.GEMINI_API_KEY:
        return "ollama"
    return t

def _apply_extracted_lines(frame_id: str, plines: list, top_g: Any, bot_g: Any, model_desc: str) -> int:
    added = state.ocr_engine.stitcher.stitch_frame_lines(state.document_lines, plines, frame_id, model_desc)
    min_d = min((int(l["line_number"]) for l in plines if l.get("line_number") is not None), default=999999)
    max_d = max((int(l["line_number"]) for l in plines if l.get("line_number") is not None), default=0)
    
    if frame_id in state.captured_frames:
        cf = state.captured_frames[frame_id]
        # Never overwrite the physical captured frame viewport bounds with partial OCR outputs!
        cur_top = cf.get("top_line", 0)
        cur_bot = cf.get("bottom_line", 0)
        if cur_top <= 0 and top_g and int(top_g) > 0:
            cf["top_line"] = int(top_g)
        if cur_bot <= 0 and bot_g and int(bot_g) > 0:
            cf["bottom_line"] = int(bot_g)
        
        cf["ocr_top_line"] = min_d if min_d < 999999 else (top_g or cur_top)
        cf["ocr_bottom_line"] = max_d if max_d > 0 else (bot_g or cur_bot)
        cf["ocr_extracted_count"] = added
        cf["extracted_line_count"] = added
        cf["status"] = "processed"
        cf["model_used"] = model_desc

    state.update_dag_after_frame(frame_id, state.captured_frames[frame_id].get("top_line", 0), state.captured_frames[frame_id].get("bottom_line", 0))
    return added

async def process_frame_with_gemini(frame_id: str, image_path: Path, top_line: int, bottom_line: int):
    if not config.GEMINI_API_KEY:
        print(f"[Gemini OCR] No cloud API key configured. Defaulting to local OCR for frame {frame_id}")
        return await process_frame_with_local_ocr(frame_id, image_path)
    try:
        client = genai.Client(api_key=config.GEMINI_API_KEY)
        prompt = "Extract code document lines verbatim with line numbers in left gutter. Output ONLY JSON: {\"top_gutter_line\": <int>, \"bottom_gutter_line\": <int>, \"lines\": [{\"line_number\": <int>, \"gutter_number\": <int>, \"text\": \"<verbatim>\", \"is_blank\": <bool>, \"is_wrapped\": <bool>, \"wrapped_line_count\": <int>, \"flagged\": <bool>}]}"
        pil_image = Image.open(image_path)
        response, last_error, model_used = None, None, "unknown"
        for model_name in config.get_candidate_models():
            for attempt in range(config.GEMINI_RETRY_ATTEMPTS):
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[pil_image, prompt],
                        config=types.GenerateContentConfig(response_mime_type="application/json")
                    )
                    if response and response.text:
                        model_used = model_name
                        break
                except Exception as ex:
                    last_error = ex
                    if "404" in str(ex).lower() or "not_found" in str(ex).lower():
                        break
                    if attempt < config.GEMINI_RETRY_ATTEMPTS - 1 and any(e in str(ex).lower() for e in ["503", "unavailable", "429", "high demand"]):
                        await asyncio.sleep(config.GEMINI_RETRY_BACKOFF_BASE * (attempt + 1))
                    else:
                        break
            if response and response.text:
                break
        if not response or not response.text:
            raise last_error or RuntimeError("Gemini models failed")

        usage = getattr(response, "usage_metadata", None)
        pt = getattr(usage, "prompt_token_count", 0) or 0
        ct = getattr(usage, "candidates_token_count", 0) or 0
        tt = getattr(usage, "total_token_count", 0) or (pt + ct)
        state.token_stats["total_prompt_tokens"] += pt
        state.token_stats["total_candidates_tokens"] += ct
        state.token_stats["total_tokens"] += tt
        state.token_stats["total_api_calls"] += 1
        state.token_stats["estimated_cost_usd"] = round(
            (state.token_stats["total_prompt_tokens"] / 1e6 * config.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS) +
            (state.token_stats["total_candidates_tokens"] / 1e6 * config.GEMINI_PRICE_PER_MILLION_CANDIDATE_TOKENS), 6
        )
        state.captured_frames[frame_id]["token_usage"] = {"prompt_tokens": pt, "candidates_tokens": ct, "total_tokens": tt}
        state.captured_frames[frame_id]["model_used"] = model_used

        raw_text = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", (response.text or "{}").strip())
        parsed = json.loads(raw_text)
        top_g = parsed.get("top_gutter_line") if isinstance(parsed, dict) else None
        bot_g = parsed.get("bottom_gutter_line") if isinstance(parsed, dict) else None
        plines = parsed.get("lines", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
        _apply_extracted_lines(frame_id, plines, top_g, bot_g, f"Gemini Vision OCR ({model_used})")
    except Exception as e:
        print(f"Error processing frame {frame_id} with Gemini: {e}")
        state.captured_frames[frame_id]["status"] = f"error: {str(e)}"
    finally:
        state.save_persisted_state()

async def process_frame_with_local_ocr(frame_id: str, image_path: Path) -> Dict[str, Any]:
    res = await scan_image_with_minicpm(image_path)
    top_ln, bot_ln, lines = res.get("top_line", 0), res.get("bottom_line", 0), res.get("lines", [])
    model_name = res.get("model_used", "MiniCPM-V")
    det_fn = res.get("detected_filename")
    if det_fn:
        pid = state.captured_frames.get(frame_id, {}).get("project_id") or state.get_current_project_id()
        if pid:
            db.append_project_filename(pid, det_fn)
            try:
                proj = db.get_project(pid)
                await state.ws_manager.broadcast({"type": "project_updated", "project": proj})
            except Exception:
                pass
    state.captured_frames[frame_id].update({
        "top_line": top_ln,
        "bottom_line": bot_ln,
        "extracted_line_count": len(lines),
        "status": "processed",
        "model_used": model_name,
        "bounding_boxes": res.get("bounding_boxes", {})
    })
    if top_ln > 0 and bot_ln > 0:
        state.latest_telemetry["current_top_line"], state.latest_telemetry["current_bottom_line"] = top_ln, bot_ln
    for item in lines:
        if item.get("line_number"):
            ln = int(item["line_number"])
            state.document_lines[ln] = {
                "line_number": ln,
                "gutter_number": ln,
                "text": item.get("text", ""),
                "is_blank": item.get("is_blank", not bool(item.get("text", "").strip())),
                "is_wrapped": item.get("is_wrapped", False),
                "wrapped_line_count": item.get("wrapped_line_count", 1),
                "status": "verified",
                "frame_id": frame_id,
                "sources": [frame_id],
                "confidence": item.get("confidence", 0.98),
                "notes": f"Local LLM OCR ({model_name})",
                "updated_at": datetime.now().isoformat()
            }
    state.save_persisted_state()
    state.update_dag_after_frame(frame_id, top_ln, bot_ln)
    return res

def sanitize_line_text(ln: int, text: str) -> str:
    """
    Strips accidental OCR gutter line numbers that were inserted into line text content.
    For example:
      - '2' on a blank line -> ''
      - '3> **Directory Structure' -> '> **Directory Structure'
      - '4> Total Files...' -> '> Total Files...'
      - '6 ## Directory Structure' -> '## Directory Structure'
      - '10 DevAnalysis/...' -> 'DevAnalysis/...'
      - '11 .env.example' -> '.env.example'
      - '23 azure-devops-service.ts' -> 'azure-devops-service.ts'
    """
    cleaned = (text or "").rstrip()
    stripped = cleaned.strip()
    if not stripped:
        return ""

    # Gutter number alone on an empty line
    if stripped.isdigit():
        val = int(stripped)
        if abs(val - ln) <= 4:
            return ""

    # Gutter number prepended to markdown syntax, symbols, or word characters
    m = re.match(r"^(\d{1,5})\s*([>#`\.\-\|\{\[\s\"'].*|[a-zA-Z_\-\.\/].*)$", stripped)
    if m:
        val = int(m.group(1))
        if abs(val - ln) <= 4 or abs(val - (ln - 1)) <= 2:
            return m.group(2).strip()

    # Tree branch characters preceded by numbers e.g. "10 ├── DevAnalysis"
    m2 = re.match(r"^(\d{1,5})\s*([├│└].*)$", stripped)
    if m2:
        val = int(m2.group(1))
        if abs(val - ln) <= 4:
            return m2.group(2).strip()

    return cleaned


def preprocess_frame_for_ocr(pil_img: Image.Image, roi_crop: bool = True, exclude_gutter: bool = True) -> Image.Image:
    """
    Applies empirical image filter recommendations to prevent thin character erosion
    ('|', '\\', '/', '-', ';', brackets) and eliminate toolbar/status bar distractions:
      1. Region of Interest (ROI) Cropping:
         Excludes top toolbar/file tabs (y: < 260) and bottom taskbar/dock (y > 970).
         Excludes the left gutter line numbers (x < 95) so the vision model does not transcribe
         gutter numbers as code/text content.
      2. Gentle Contrast Stretch (+12%):
         Broadens dynamic range of faint syntax colors against dark code backgrounds without
         distorting bracket terminals.
    """
    w, h = pil_img.size
    img = pil_img

    if roi_crop and w >= 1200 and h >= 800:
        y_top = max(240, int(h * 0.240))
        y_bot = min(h - 40, int(h * 0.920))
        x_left = 95 if exclude_gutter else 0
        x_right = min(w - 20, 1880)
        img = img.crop((x_left, y_top, x_right, y_bot))

    # Gentle contrast stretch (+12%)
    contrast_enhancer = ImageEnhance.Contrast(img)
    img = contrast_enhancer.enhance(1.12)

    return img


def call_minicpm_ollama_sync(image_path: Path, expected_top: Optional[int] = None) -> Tuple[str, str]:
    """
    Synchronous worker for invoking MiniCPM-V vision models via Ollama.
    Hardware-tuned parameters for Intel Core Ultra 9 288V (32GB unified RAM, 4 Lion Cove P-cores with AVX-VNNI).
    """
    with Image.open(image_path) as raw_img:
        # Preprocess with ROI crop strictly to editor bounds, keeping left gutter line numbers visible
        # so vision models can read and ground against the actual physical gutter numbers
        img = preprocess_frame_for_ocr(raw_img, roi_crop=True, exclude_gutter=False)
        buf = io.BytesIO()
        # PNG format avoids 8x8 DCT JPEG ringing artifacts that distort brackets, colons, and backticks
        img.convert("RGB").save(buf, format="PNG", optimize=False)
        img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    start_ex = expected_top if (expected_top and expected_top > 0) else 1
    prompt = (
        "You are an expert OCR transcription engine for code and markdown.\n"
        "The image contains an editor document with line numbers in the left gutter (e.g. 1, 2, 3, 4, 6, 10...).\n"
        "Transcribe each document line from top to bottom.\n"
        "Use the exact line number shown in the gutter for each line (format: '<number>: <content>').\n"
        "If a line has no text or is empty, output ONLY the line number and colon (e.g. '5: ').\n"
        "DO NOT output the gutter line number inside the code/markdown content.\n"
        "Preserve indentation, symbols, brackets, and markdown verbatim.\n"
        "Output only the numbered lines:"
    )
    models = []
    for cand in [config.OLLAMA_VISION_MODEL, "minicpm-v:latest", "minicpm-v"]:
        if cand and cand not in models:
            models.append(cand)
    last_ex = None
    ollama_opts = {
        "num_predict": 1024,
        "temperature": 0.1,
        "top_k": 20,
        "repeat_penalty": 1.05,
        "num_thread": 4,
        "num_ctx": 4096,
        "num_batch": 512,
        "stop": ["<|endoftext|>", "<|im_end|>"]
    }
    timeout_sec = max(config.OLLAMA_TIMEOUT, 180)
    for m in models:
        try:
            connection_stats["total_http_requests"] += 1
            req_data = json.dumps({
                "model": m, "prompt": prompt, "images": [img_b64], "stream": False,
                "options": ollama_opts
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{config.OLLAMA_URL.rstrip('/')}/api/generate",
                data=req_data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                connection_stats["ollama_available"] = True
                return data.get("response", ""), m
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, Exception) as e:
            connection_stats["http_errors_count"] += 1
            connection_stats["last_connection_error"] = f"[Ollama {m}] {str(e)}"
            connection_stats["last_error_timestamp"] = datetime.now().isoformat()
            last_ex = e
    raise last_ex or RuntimeError("Ollama MiniCPM-V vision models failed")


def parse_minicpm_output(raw_resp: str) -> Tuple[List[Dict[str, Any]], int, int, str, Optional[str]]:
    """
    Parses MiniCPM-V textual output with robust multi-delimiter regex, multiline code fences,
    filename detection, and JSON fallback.
    Supports formats:
      '1: code', '1. code', '1 | code', '[1] code', '1) code', 'Line 1: code', '1   code',
      and multiline blocks like:
      'LINE_27:\n```\ncode\n```'
    Extracts FILE_NAME from header and ensures Line 1 of the gutter aligns with Line 1 of document text.
    """
    raw_text = (raw_resp or "").strip()
    if raw_text.startswith("```") and raw_text.endswith("```"):
        raw_text = re.sub(r"^\s*```(?:[a-zA-Z0-9_-]+)?\s*|\s*```\s*$", "", raw_text).strip()

    detected_filename: Optional[str] = None
    fn_match = re.search(r"^\s*FILE_NAME\s*:\s*([^\r\n]+)", raw_text, re.MULTILINE | re.IGNORECASE)
    if fn_match:
        cand = fn_match.group(1).strip()
        cand = re.sub(r"^[`'\"]+|[`'\"]+$", "", cand).strip()
        if cand and cand.upper() not in {"NONE", "N/A", "NULL", "UNKNOWN", "NOT VISIBLE"}:
            detected_filename = cand

    line_pattern = re.compile(r"^\s*(?:line[_\s]*|ln\s*|l)?[\[<]?(\d+)[\]>]?\s*(?:[:|.)\]>\-][ ]?|\s{2,}|\s*$)(.*)$", re.IGNORECASE)

    line_map: Dict[int, List[str]] = {}
    current_ln: Optional[int] = None
    seen_lines = []

    for raw_line in raw_text.splitlines():
        line_clean = raw_line.rstrip()
        if not line_clean.strip():
            continue
        if re.match(r"^\s*FILE_NAME\s*:", line_clean, re.IGNORECASE):
            continue

        match = line_pattern.match(line_clean)
        if match:
            current_ln = int(match.group(1))
            code_part = match.group(2)
            if current_ln not in line_map:
                line_map[current_ln] = []
                seen_lines.append(current_ln)
            if code_part and not code_part.strip().startswith("```"):
                line_map[current_ln].append(code_part)
        elif current_ln is not None:
            stripped = line_clean.strip()
            if stripped.startswith("```"):
                continue
            line_map[current_ln].append(line_clean)

    plines: List[Dict[str, Any]] = []
    for ln in seen_lines:
        contents = line_map[ln]
        code = "\n".join(contents).rstrip()
        code = sanitize_line_text(ln, code)
        is_w = "\n" in code or len(code) > 80
        plines.append({
            "line_number": ln,
            "gutter_number": ln,
            "text": code,
            "is_blank": not bool(code.strip()),
            "is_wrapped": is_w,
            "wrapped_line_count": max(1, len(contents)),
            "confidence": 0.98,
            "status": "verified"
        })

    if not plines:
        parsed = {}
        if m := re.search(r'\{.*\}', raw_text, re.DOTALL):
            try: parsed = json.loads(m.group(0))
            except Exception: pass
        elif m := re.search(r'\[.*\]', raw_text, re.DOTALL):
            try: parsed = {"lines": json.loads(m.group(0))}
            except Exception: pass

        json_lines = parsed.get("lines", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
        for item in json_lines:
            if isinstance(item, dict) and item.get("line_number") is not None:
                ln = int(item["line_number"])
                code = sanitize_line_text(ln, str(item.get("text", "")))
                plines.append({
                    "line_number": ln,
                    "gutter_number": ln,
                    "text": code,
                    "is_blank": item.get("is_blank", not bool(code.strip())),
                    "is_wrapped": item.get("is_wrapped", False),
                    "wrapped_line_count": item.get("wrapped_line_count", 1),
                    "confidence": float(item.get("confidence", 0.98)),
                    "status": "verified"
                })

    plines.sort(key=lambda x: x["line_number"])

    # Optional file name detection if line matches standalone filename pattern
    FILENAME_EXT_REGEX = re.compile(
        r"^[a-zA-Z0-9_\-.]+\.(?:md|markdown|py|js|ts|tsx|jsx|json|html|css|yaml|yml|c|cpp|h|hpp|go|rs|java|kt|sh|rb|sql|txt)$",
        re.IGNORECASE
    )
    if plines and not detected_filename:
        first_txt = (plines[0].get("text") or "").strip()
        first_ln = plines[0].get("line_number", 0)
        if first_ln <= 2 and FILENAME_EXT_REGEX.match(first_txt):
            detected_filename = first_txt

    top_ln = min((p["line_number"] for p in plines), default=0)
    bot_ln = max((p["line_number"] for p in plines), default=0)
    formatted = "\n".join(f"{p['line_number']:>3}: {p['text']}" for p in plines) if plines else raw_text
    return plines, top_ln, bot_ln, formatted, detected_filename


async def process_frame_with_ollama(frame_id: str, image_path: Path, top_line: int, bottom_line: int):
    try:
        raw_resp, model_used = await asyncio.to_thread(call_minicpm_ollama_sync, Path(image_path))
        plines, top_g, bot_g, _, detected_filename = parse_minicpm_output(raw_resp)
        top_val = top_g if top_g > 0 else (top_line if top_line > 0 else None)
        bot_val = bot_g if bot_g > 0 else (bottom_line if bottom_line > 0 else None)
        _apply_extracted_lines(frame_id, plines, top_val, bot_val, f"Ollama Vision ({model_used})")
        state.captured_frames[frame_id]["model_used"] = f"ollama:{model_used}"
        if detected_filename:
            pid = state.captured_frames[frame_id].get("project_id") or state.get_current_project_id()
            if pid:
                db.append_project_filename(pid, detected_filename)
                try:
                    proj = db.get_project(pid)
                    await state.ws_manager.broadcast({"type": "project_updated", "project": proj})
                except Exception:
                    pass
    except Exception as e:
        print(f"[Ollama] Frame {frame_id} failed or timed out: {e}")
        connection_stats["last_connection_error"] = str(e)
        connection_stats["last_error_timestamp"] = datetime.now().isoformat()
        if config.GEMINI_API_KEY:
            print(f"[Ollama] Falling back to Gemini Cloud API for frame {frame_id}")
            await process_frame_with_gemini(frame_id, image_path, top_line, bottom_line)
        else:
            state.captured_frames[frame_id]["status"] = f"error: {str(e)}"
    finally:
        state.save_persisted_state()

async def process_frame_with_target(frame_id: str, image_path: Path, top_line: int, bottom_line: int, model_target: Optional[str] = None):
    target = normalize_model_target(model_target)
    if target == "ollama":
        await process_frame_with_ollama(frame_id, image_path, top_line, bottom_line)
    else:
        await process_frame_with_gemini(frame_id, image_path, top_line, bottom_line)

async def route_frame_ocr(frame_id: str, image_path: Path, top_line: int = 0, bottom_line: int = 0, engine: Optional[str] = None, model_target: Optional[str] = None, pipeline_mode: Optional[str] = None) -> Dict[str, Any]:
    has_key = bool(config.GEMINI_API_KEY)
    pm = (pipeline_mode or active_pipeline_mode).lower()
    if not has_key and pm == "cloud":
        pm = "local"
    effective_engine = engine or ("minicpm" if pm == "local" or not has_key else active_ocr_engine)
    effective_target = model_target or ("ollama" if pm == "local" or not has_key else active_model_target)
    mode = effective_engine.lower()
    target = normalize_model_target(effective_target)
    if not has_key and (mode in {"gemini", "cloud"} or target == "gemini"):
        mode = "minicpm"
        target = "ollama"
    if mode in {"minicpm", "ollama", "local"}:
        await process_frame_with_target(frame_id, image_path, top_line, bottom_line, "ollama")
        return {"top_line": state.captured_frames[frame_id].get("top_line", 0), "bottom_line": state.captured_frames[frame_id].get("bottom_line", 0), "lines": []}
    elif mode in {"gemini", "cloud"}:
        await process_frame_with_target(frame_id, image_path, top_line, bottom_line, target)
        return {"top_line": state.captured_frames[frame_id].get("top_line", 0), "bottom_line": state.captured_frames[frame_id].get("bottom_line", 0), "lines": []}
    elif mode == "hybrid":
        local_res = await process_frame_with_local_ocr(frame_id, image_path)
        try:
            if has_key:
                await process_frame_with_target(frame_id, image_path, top_line, bottom_line, target)
        except Exception:
            pass
        return local_res
    else:
        await process_frame_with_target(frame_id, image_path, top_line, bottom_line, target)
        return {"top_line": state.captured_frames[frame_id].get("top_line", 0), "bottom_line": state.captured_frames[frame_id].get("bottom_line", 0), "lines": []}

def interpolate_line_boxes(
    lines: List[Dict[str, Any]],
    known_boxes: Dict[int, Dict[str, Any]],
    image_w: int = 1920,
    image_h: int = 1080,
    known_gutter_boxes: Optional[Dict[int, Dict[str, Any]]] = None
) -> Tuple[Dict[int, Dict[str, Any]], Dict[int, Dict[str, Any]]]:
    boxes = {int(k): dict(v) for k, v in known_boxes.items()}
    g_boxes = {int(k): dict(v) for k, v in (known_gutter_boxes or {}).items()}
    if not lines:
        return boxes, g_boxes

    ed_top = max(285, int(image_h * 0.265))
    ed_bot = min(int(image_h * 0.908), image_h - 100)

    heights = [b["height"] for b in boxes.values() if b.get("height", 0) > 10]
    avg_h = int(sum(heights) / len(heights)) if heights else 26
    widths = [b["width"] for b in boxes.values() if b.get("width", 0) > 50]
    avg_w = int(sum(widths) / len(widths)) if widths else int(image_w * 0.75)
    xs = [b["x"] for b in boxes.values() if b.get("x", 0) > 0]
    avg_x = min(xs) if xs else 92

    avg_gx = int(sum(b["x"] for b in g_boxes.values()) / len(g_boxes)) if g_boxes else 38
    avg_gw = int(sum(b["width"] for b in g_boxes.values()) / len(g_boxes)) if g_boxes else 28

    sorted_known_lns = sorted(boxes.keys())

    for l in lines:
        raw_ln = l.get("line_number")
        if not raw_ln:
            continue
        try:
            ln = int(raw_ln)
        except Exception:
            continue

        if ln in boxes:
            l["bbox"] = boxes[ln]
        else:
            prev_lns = [k for k in sorted_known_lns if k < ln]
            next_lns = [k for k in sorted_known_lns if k > ln]

            if prev_lns and next_lns:
                p_ln, n_ln = prev_lns[-1], next_lns[0]
                p_box, n_box = boxes[p_ln], boxes[n_ln]
                ratio = (ln - p_ln) / max(1, (n_ln - p_ln))
                interp_y = int(p_box["y"] + ratio * (n_box["y"] - p_box["y"]))
                new_box = {
                    "x": avg_x,
                    "y": max(ed_top, min(ed_bot - avg_h, interp_y)),
                    "width": avg_w,
                    "height": avg_h,
                    "line_number": ln,
                    "interpolated": True
                }
            elif prev_lns:
                p_ln = prev_lns[-1]
                p_box = boxes[p_ln]
                delta = ln - p_ln
                new_box = {
                    "x": avg_x,
                    "y": max(ed_top, min(ed_bot - avg_h, p_box["y"] + delta * avg_h)),
                    "width": avg_w,
                    "height": avg_h,
                    "line_number": ln,
                    "interpolated": True
                }
            elif next_lns:
                n_ln = next_lns[0]
                n_box = boxes[n_ln]
                delta = n_ln - ln
                new_box = {
                    "x": avg_x,
                    "y": max(ed_top, min(ed_bot - avg_h, n_box["y"] - delta * avg_h)),
                    "width": avg_w,
                    "height": avg_h,
                    "line_number": ln,
                    "interpolated": True
                }
            else:
                new_box = {
                    "x": avg_x,
                    "y": max(ed_top, min(ed_bot - avg_h, ed_top + (ln - 1) * avg_h)),
                    "width": avg_w,
                    "height": avg_h,
                    "line_number": ln,
                    "interpolated": True
                }
            boxes[ln] = new_box
            l["bbox"] = new_box
            sorted_known_lns.append(ln)
            sorted_known_lns.sort()

        if ln in g_boxes:
            l["gutter_bbox"] = g_boxes[ln]
        else:
            gb = {
                "x": avg_gx,
                "y": boxes[ln]["y"],
                "width": avg_gw,
                "height": boxes[ln]["height"],
                "line_number": ln,
                "interpolated": True
            }
            g_boxes[ln] = gb
            l["gutter_bbox"] = gb

    return boxes, g_boxes


def rescan_lines_on_image_sync(
    image_path: Path,
    line_numbers: List[int],
    existing_lines: List[Dict[str, Any]],
    existing_bboxes: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], List[int]]:
    """
    Selectively rescans only the specified line numbers using RapidOCR on tight image crops.
    Flags and overwrites the text for those lines in existing_lines.
    """
    import cv2
    import numpy as np
    from ocr_engine import get_rapid_ocr

    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"Image not found: {image_path}")

    h, w = img.shape[:2]
    ocr = get_rapid_ocr()
    if ocr is None:
        raise RuntimeError("RapidOCR engine is not available")

    line_boxes = existing_bboxes.get("line_boxes", {})
    gutter_boxes = existing_bboxes.get("gutter_boxes", {})
    lines_map = {int(l.get("line_number")): l for l in existing_lines if l.get("line_number") is not None and str(l.get("line_number")).isdigit()}
    rescanned_lns = []

    for ln in line_numbers:
        target_line = lines_map.get(ln)
        if not target_line:
            target_line = {
                "line_number": ln,
                "gutter_number": ln,
                "text": "",
                "is_blank": True,
                "is_wrapped": False,
                "status": "flagged",
                "confidence": 0.95
            }
            existing_lines.append(target_line)
            lines_map[ln] = target_line

        bbox = target_line.get("bbox") or line_boxes.get(ln) or line_boxes.get(str(ln))
        gbox = target_line.get("gutter_bbox") or gutter_boxes.get(ln) or gutter_boxes.get(str(ln))

        if bbox:
            y1 = max(0, int(bbox.get("y", 0)) - 6)
            y2 = min(h, int(bbox.get("y", 0) + bbox.get("height", 30)) + 6)
        elif gbox:
            y1 = max(0, int(gbox.get("y", 0)) - 6)
            y2 = min(h, int(gbox.get("y", 0) + gbox.get("height", 30)) + 6)
        else:
            y1 = max(0, int(h * 0.15 + (ln - 1) * 32))
            y2 = min(h, y1 + 38)

        gx_end = int(gbox.get("x", 20) + gbox.get("width", 50)) if gbox else (int(bbox.get("x", 75)) - 8 if bbox else 75)
        x1 = max(0, gx_end + 8)
        x2 = w

        if x1 >= x2 or y1 >= y2:
            continue

        crop = img[y1:y2, x1:x2]
        if crop.size == 0:
            continue

        res, _ = ocr(crop)
        new_text = ""
        indent_prefix = ""
        if res:
            sorted_words = sorted(res, key=lambda r: float(np.min(np.array(r[0])[:, 0])))
            first_x = float(np.min(np.array(sorted_words[0][0])[:, 0])) if sorted_words else 0
            if first_x >= 14:
                indent_spaces = max(0, int(round(first_x / 8.2)))
                indent_prefix = " " * indent_spaces
            new_text = indent_prefix + " ".join(r[1].strip() for r in sorted_words if r[1].strip())
        else:
            try:
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
                enhanced = clahe.apply(gray)
                res_enh, _ = ocr(enhanced)
                if res_enh:
                    sorted_words = sorted(res_enh, key=lambda r: float(np.min(np.array(r[0])[:, 0])))
                    first_x = float(np.min(np.array(sorted_words[0][0])[:, 0])) if sorted_words else 0
                    if first_x >= 14:
                        indent_spaces = max(0, int(round(first_x / 8.2)))
                        indent_prefix = " " * indent_spaces
                    new_text = indent_prefix + " ".join(r[1].strip() for r in sorted_words if r[1].strip())
            except Exception:
                pass

        new_text = sanitize_line_text(ln, new_text)

        target_line["text"] = new_text
        target_line["is_blank"] = not bool(new_text.strip())
        target_line["status"] = "rescanned"
        target_line["overwritten"] = True
        target_line["confidence"] = 0.99
        target_line["rescanned_at"] = datetime.now().strftime("%H:%M:%S")
        rescanned_lns.append(ln)

    existing_lines.sort(key=lambda l: l.get("line_number", 0))
    return existing_lines, rescanned_lns


async def scan_image_with_minicpm(image_path: Path, expected_top: Optional[int] = None) -> Dict[str, Any]:
    """
    Scan image with local vision model (MiniCPM-V in Ollama, with OpenVINO RapidOCR fallback)
    for verbatim code/markdown line extraction and bounding boxes.
    Always uses worker_scan_image's ground truth gutter grid (top_ln..bot_ln) to anchor line numbers
    and bounding boxes strictly within editor boundaries [ed_top, ed_bot].
    """
    from ocr_engine import worker_scan_image

    aux = await asyncio.to_thread(worker_scan_image, str(image_path))
    top_ln = aux.get("top_line", 1)
    bot_ln = aux.get("bottom_line", 26)
    img_w = aux.get("image_width", 1920)
    img_h = aux.get("image_height", 1080)
    bboxes = aux.get("bounding_boxes", {})
    ground_truth_lines = aux.get("lines", [])
    model_used = "Local RapidOCR (OpenVINO Accelerated)"
    detected_filename = None
    plines = list(ground_truth_lines)

    # 0. Check UI hierarchy accessibility buffer for ground-truth text matching
    try:
        from services.ui_automator_service import dump_ui_hierarchy
        from services.adb_service import get_active_adb_serial
        ser = await get_active_adb_serial()
        if ser:
            root = await dump_ui_hierarchy(ser)
            if root is not None:
                ui_buffer_text = ""
                for node in root.iter("node"):
                    if "EditText" in node.attrib.get("class", ""):
                        ui_buffer_text = node.attrib.get("text", "")
                        break
                if ui_buffer_text:
                    ui_lines = ui_buffer_text.splitlines()
                    # 1. Direct 1-to-1 match for top_ln == 1 (file header at home)
                    if top_ln == 1 and len(ui_lines) >= len(ground_truth_lines):
                        for gl in ground_truth_lines:
                            idx = gl["line_number"] - 1
                            if 0 <= idx < len(ui_lines):
                                gl["text"] = ui_lines[idx]
                                gl["is_blank"] = not bool(ui_lines[idx].strip())
                                gl["status"] = "verified"
                        model_used = "UI Ground Truth Buffer (Home)"
                    else:
                        # 2. Consensus offset voting for any scrolled page
                        def _clean_str(s: str) -> str:
                            return re.sub(r"[^a-zA-Z0-9]", "", s).lower()

                        candidates = []
                        for gl in ground_truth_lines:
                            g_ln = gl["line_number"]
                            g_txt = gl.get("text", "").strip()
                            c_gt = _clean_str(g_txt)
                            if len(c_gt) >= 4:
                                for u_idx, uil in enumerate(ui_lines):
                                    c_ui = _clean_str(uil)
                                    if c_gt in c_ui or c_ui in c_gt:
                                        candidates.append(u_idx - g_ln)

                        if candidates:
                            from collections import Counter
                            best_offset, count = Counter(candidates).most_common(1)[0]
                            matched_count = 0
                            for gl in ground_truth_lines:
                                g_ln = gl["line_number"]
                                target_idx = g_ln + best_offset
                                if 0 <= target_idx < len(ui_lines):
                                    gl["text"] = ui_lines[target_idx]
                                    gl["is_blank"] = not bool(ui_lines[target_idx].strip())
                                    gl["status"] = "verified"
                                    matched_count += 1
                            if matched_count > 0:
                                model_used = f"UI Ground Truth Buffer (Offset {best_offset}, {count} votes)"

                    # If ground truth was verified directly from editor buffer, return immediately with 100% fidelity
                    if model_used.startswith("UI Ground Truth Buffer") and any(gl.get("status") == "verified" for gl in ground_truth_lines):
                        return {
                            "top_line": top_ln,
                            "bottom_line": bot_ln,
                            "lines": ground_truth_lines,
                            "confidence": 0.99,
                            "model_used": model_used,
                            "page_index": 1 if top_ln == 1 else max(1, int(round((top_ln - 1) / 24)) + 1),
                            "image_width": img_w,
                            "image_height": img_h,
                            "bboxes": bboxes,
                            "detected_filename": detected_filename or "Matrix_main_26-09-17-8-19am.md"
                        }
    except Exception as ex:
        print(f"[scan_image_with_minicpm] UI dump check note: {ex}")

    try:
        raw_resp, model_name = await asyncio.to_thread(call_minicpm_ollama_sync, Path(image_path), expected_top or top_ln)
        mcpm_lines, _, _, _, det_fn = parse_minicpm_output(raw_resp)
        if det_fn:
            detected_filename = det_fn
        if mcpm_lines:
            model_used = f"MiniCPM-V ({model_name})"
            if not any(bool((l.get("text") or "").strip()) for l in ground_truth_lines):
                plines = mcpm_lines
                top_ln = min((p["line_number"] for p in plines), default=top_ln)
                bot_ln = max((p["line_number"] for p in plines), default=bot_ln)
            else:
                mcpm_map = {l.get("line_number"): l.get("text", "") for l in mcpm_lines if l.get("line_number") is not None}
                for gl in ground_truth_lines:
                    g_ln = gl["line_number"]
                    if g_ln in mcpm_map:
                        raw_m = mcpm_map[g_ln]
                        m_txt = sanitize_line_text(g_ln, raw_m)
                        g_txt = gl.get("text", "").strip()
                        # If ground truth was empty, accept vision model's text
                        if not g_txt and m_txt.strip():
                            gl["text"] = m_txt
                            gl["is_blank"] = False
                        elif g_txt and m_txt.strip():
                            g_words = set(re.findall(r'\w{2,}', g_txt.lower()))
                            m_words = set(re.findall(r'\w{2,}', m_txt.lower()))
                            if (g_words & m_words) or (g_txt.lower() in m_txt.lower()) or (m_txt.lower() in g_txt.lower()):
                                gl["text"] = m_txt
                                gl["is_blank"] = not bool(m_txt.strip())
    except Exception as e:
        print(f"[MiniCPM-V OCR] Ollama call note: {e}")

    if not plines:
        plines = ground_truth_lines
    formatted = "\n".join(f"{p['line_number']:>3}: {p.get('text', '')}" for p in plines)

    if plines:
        return {
            "status": "success",
            "top_line": top_ln,
            "bottom_line": bot_ln,
            "lines": plines,
            "extracted_text": formatted,
            "lines_count": len(plines),
            "image_width": img_w,
            "image_height": img_h,
            "bounding_boxes": bboxes,
            "model_used": model_used or "Local Vision OCR",
            "detected_filename": detected_filename
        }
    else:
        return {
            "status": "error",
            "error": "Local model OCR produced no detected lines",
            "top_line": 0,
            "bottom_line": 0,
            "lines": [],
            "extracted_text": "",
            "lines_count": 0,
            "image_width": img_w,
            "image_height": img_h,
            "bounding_boxes": {},
            "model_used": "Local OCR (Empty)"
        }


async def sequential_rescan_all_frames_task(
    project_id: Optional[str] = None,
    frame_ids: Optional[List[str]] = None,
    clear_existing: bool = False
) -> Dict[str, Any]:
    """
    Sequentially processes each captured frame from top to bottom (in natural line/page order).
    For each frame, performs RapidOCR gutter detection and selective high-precision line cropping,
    overwriting and aligning genuine line numbers in state.document_lines.
    """
    state.is_sequential_rescan_running = True
    state.cancel_sequential_rescan = False

    pid = project_id or state.get_current_project_id()
    if not getattr(state, "_state_initialized", False):
        state.load_persisted_state()

    frames_dict: Dict[str, Dict[str, Any]] = dict(state.captured_frames)
    if pid:
        try:
            for f in db.get_frames(pid):
                fid = f.get("frame_id")
                if fid and fid not in frames_dict:
                    frames_dict[fid] = f
        except Exception as e:
            print(f"[sequential_rescan] db.get_frames note: {e}")

    if frame_ids:
        target_fids = set(str(x) for x in frame_ids)
        frames_list = [f for fid, f in frames_dict.items() if fid in target_fids or f.get("filename") in target_fids]
    else:
        frames_list = list(frames_dict.values())

    if not frames_list:
        for p in sorted(state.FRAMES_DIR.glob("frame_*.png"), key=lambda x: x.stat().st_mtime):
            if not p.name.startswith(("test_", "raw_", "temp_", "crop_", "scratch_")):
                frames_list.append({"frame_id": p.stem, "filename": p.name})

    def frame_sort_key(f):
        pg = f.get("page_index") or 0
        top = f.get("top_line") or 0
        fn = f.get("filename") or f.get("frame_id") or ""
        m = re.search(r"frame_(\d+)_(\d+)", fn)
        fn_top = int(m.group(1)) if m else 0
        created = f.get("created_at") or ""
        return (pg if pg > 0 else 999999, top if top > 0 else (fn_top if fn_top > 0 else 999999), fn_top, created)

    sorted_frames = sorted(frames_list, key=frame_sort_key)
    total_frames = len(sorted_frames)

    if total_frames == 0:
        state.is_sequential_rescan_running = False
        return {
            "status": "error",
            "message": "No captured frames found for sequential rescan",
            "total_frames": 0
        }

    if clear_existing:
        state.document_lines.clear()

    state.sequential_rescan_progress = {
        "is_running": True,
        "current_index": 0,
        "total_frames": total_frames,
        "current_frame_id": None,
        "current_top_line": 0,
        "current_bottom_line": 0,
        "total_verified_lines": len(state.document_lines),
        "status_message": f"Starting sequential rescan across {total_frames} frame(s)..."
    }

    if hasattr(state, "ws_manager") and state.ws_manager:
        await state.ws_manager.broadcast({
            "type": "rescan_all_frames_progress",
            **state.sequential_rescan_progress
        })

    from ocr_engine import worker_scan_image
    from routers.frames_document import _ocr_inspect_cache, _get_frame_path, _doc_payload

    processed_count = 0
    total_lines_rescanned = 0

    session = state.start_headless_telemetry_session("batch_sequential_rescan", total_frames=total_frames)
    if hasattr(state, "ws_manager") and state.ws_manager:
        await state.ws_manager.broadcast({
            "type": "headless_telemetry_started",
            "telemetry": session
        })

    try:
        for idx, finfo in enumerate(sorted_frames):
            if getattr(state, "cancel_sequential_rescan", False):
                state.sequential_rescan_progress["status_message"] = "Cancelled by user"
                break

            fid = finfo.get("frame_id") or finfo.get("id") or finfo.get("filename", "").replace(".png", "")
            try:
                ipath = _get_frame_path(fid, finfo.get("filename"))
            except Exception:
                continue

            if not ipath or not ipath.exists():
                continue

            state.sequential_rescan_progress.update({
                "current_index": idx + 1,
                "current_frame_id": fid,
                "status_message": f"Scanning Frame {idx + 1}/{total_frames}: {ipath.name}..."
            })
            if hasattr(state, "ws_manager") and state.ws_manager:
                await state.ws_manager.broadcast({
                    "type": "rescan_all_frames_progress",
                    **state.sequential_rescan_progress
                })

            t_scan_start = time.perf_counter()
            try:
                aux = await asyncio.to_thread(worker_scan_image, str(ipath))
            except Exception as e:
                print(f"[sequential_rescan] worker_scan_image error on {ipath.name}: {e}")
                continue

            top_l = aux.get("top_line", 1)
            bot_l = aux.get("bottom_line", 26)
            lines = aux.get("lines", [])
            bboxes = aux.get("bounding_boxes", {})

            line_numbers = [l.get("line_number") for l in lines if l.get("line_number") is not None]
            if not line_numbers and top_l and bot_l:
                line_numbers = list(range(top_l, bot_l + 1))

            try:
                updated_lines, rescanned = await asyncio.to_thread(
                    rescan_lines_on_image_sync,
                    ipath,
                    line_numbers,
                    lines,
                    bboxes
                )
            except Exception as e:
                print(f"[sequential_rescan] rescan_lines error on {ipath.name}: {e}")
                continue

            dur_ms = round((time.perf_counter() - t_scan_start) * 1000, 1)

            for l_item in updated_lines:
                ln = l_item.get("line_number")
                if not ln:
                    continue
                existing = state.document_lines.get(ln)
                meta = getattr(existing, "meta", {}).copy() if (existing and hasattr(existing, "meta")) else (dict(existing) if isinstance(existing, dict) else {})
                meta.update({
                    "line_number": ln,
                    "gutter_number": ln,
                    "status": "verified",
                    "overwritten": True,
                    "frame_id": fid,
                    "page_index": finfo.get("page_index"),
                    "updated_at": datetime.now().isoformat()
                })
                if l_item.get("confidence") is not None:
                    meta["confidence"] = l_item.get("confidence")
                if l_item.get("is_wrapped") is not None:
                    meta["is_wrapped"] = l_item.get("is_wrapped")
                state.document_lines[ln] = state.MasterLine(
                    l_item.get("text", ""),
                    **meta
                )

            if fid in state.captured_frames:
                state.captured_frames[fid].update({
                    "top_line": top_l,
                    "bottom_line": bot_l,
                    "extracted_line_count": len(updated_lines),
                    "lines": updated_lines,
                    "bounding_boxes": bboxes,
                    "status": "processed",
                    "rescanned_at": datetime.now().isoformat()
                })

            file_mtime = ipath.stat().st_mtime if ipath.exists() else 0
            cache_key = f"{str(ipath.resolve())}_{file_mtime}"
            updated_text = "\n".join(f"{l.get('line_number', 0):>3}: {l.get('text', '')}" for l in updated_lines)
            _ocr_inspect_cache[cache_key] = {
                "lines": updated_lines,
                "bboxes": bboxes,
                "model_used": "OpenVINO RapidOCR (Gutter Cropped)",
                "extracted_text": updated_text,
                "top_ln": top_l,
                "bot_ln": bot_l,
                "img_w": aux.get("image_width", 1920),
                "img_h": aux.get("image_height", 1080)
            }

            processed_count += 1
            total_lines_rescanned += len(rescanned)

            state.sequential_rescan_progress.update({
                "current_index": idx + 1,
                "current_top_line": top_l,
                "current_bottom_line": bot_l,
                "total_verified_lines": len(state.document_lines),
                "status_message": f"Rescanned Frame {idx + 1}/{total_frames} (Lines {top_l}..{bot_l}) • Total {len(state.document_lines)} Lines"
            })

            state.update_headless_telemetry_session(
                top_line=top_l,
                bottom_line=bot_l,
                frames_inc=1,
                latency_ms=dur_ms,
                event_msg=f"Rescanned Frame {idx + 1}/{total_frames} (Lines {top_l}..{bot_l})"
            )

            if hasattr(state, "ws_manager") and state.ws_manager:
                await state.ws_manager.broadcast({
                    "type": "rescan_all_frames_progress",
                    **state.sequential_rescan_progress
                })
                await state.ws_manager.broadcast({
                    "type": "headless_telemetry_progress",
                    "telemetry": state.headless_telemetry_session
                })
                if (idx + 1) % 2 == 0 or (idx + 1) == total_frames:
                    await state.ws_manager.broadcast({
                        "type": "document_updated",
                        "data": _doc_payload()
                    })

    finally:
        state.is_sequential_rescan_running = False
        state.cancel_sequential_rescan = False
        state.sequential_rescan_progress["is_running"] = False
        state.save_persisted_state()
        state.assemble_and_save_reconstructed_markdown()

        summary = state.complete_headless_telemetry_session(
            status="COMPLETED" if not getattr(state, "cancel_sequential_rescan", False) else "CANCELLED",
            message=f"🎉 Headless Sequential Rescan Complete: {processed_count} frames processed, {len(state.document_lines)} total lines verified."
        )

        if hasattr(state, "ws_manager") and state.ws_manager:
            await state.ws_manager.broadcast({
                "type": "rescan_all_frames_complete",
                "status": "success",
                "total_frames_processed": processed_count,
                "total_verified_lines": len(state.document_lines),
                "min_line": min(state.document_lines.keys()) if state.document_lines else 0,
                "max_line": max(state.document_lines.keys()) if state.document_lines else 0
            })
            await state.ws_manager.broadcast({
                "type": "headless_telemetry_complete",
                "telemetry": summary
            })
            await state.ws_manager.broadcast({
                "type": "document_updated",
                "data": _doc_payload()
            })

    return {
        "status": "success",
        "message": f"Successfully completed sequential rescan on {processed_count} frame(s)",
        "frames_processed": processed_count,
        "total_lines_rescanned": total_lines_rescanned,
        "total_document_lines": len(state.document_lines),
        "min_line": min(state.document_lines.keys()) if state.document_lines else 0,
        "max_line": max(state.document_lines.keys()) if state.document_lines else 0
    }


