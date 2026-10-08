import asyncio
import base64
import io
import json
import re
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
    if top_g and int(top_g) > 0:
        min_d = min(min_d, int(top_g))
    if bot_g and int(bot_g) > 0:
        max_d = max(max_d, int(bot_g))
    if min_d <= max_d and min_d < 999999:
        state.captured_frames[frame_id]["top_line"], state.captured_frames[frame_id]["bottom_line"] = min_d, max_d
        state.latest_telemetry["current_top_line"], state.latest_telemetry["current_bottom_line"] = min_d, max_d
    elif top_g and bot_g:
        state.captured_frames[frame_id]["top_line"], state.captured_frames[frame_id]["bottom_line"] = int(top_g), int(bot_g)
        state.latest_telemetry["current_top_line"], state.latest_telemetry["current_bottom_line"] = int(top_g), int(bot_g)
    state.captured_frames[frame_id]["status"], state.captured_frames[frame_id]["extracted_line_count"] = "processed", added
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

def preprocess_frame_for_ocr(pil_img: Image.Image, roi_crop: bool = True) -> Image.Image:
    """
    Applies empirical image filter recommendations to prevent thin character erosion
    ('|', '\\', '/', '-', ';', brackets) and eliminate toolbar/status bar distractions:
      1. Region of Interest (ROI) Cropping:
         Excludes top toolbar (y: 0..160) and bottom taskbar/dock (y > 1040) to prevent
         hallucination of window title bar text as Line 1 or ASCII grid loops.
      2. Adaptive Contrast Stretch (+20%):
         Broadens dynamic range of faint syntax colors against dark code backgrounds.
      3. Unsharp Masking on Text ROI:
         Sharpens thin stems of pipes, slashes, brackets, and line numbers.
    """
    w, h = pil_img.size
    img = pil_img

    # 1. ROI crop strictly to active editor text and gutter region (x: 0..1400, y: 160..1040)
    if roi_crop and w >= 1200 and h >= 800:
        y_top = max(160, int(h * 0.148))
        y_bot = min(h - 40, max(y_top + 400, int(h * 0.963)))
        x_left = 0
        x_right = min(w, 1400)
        img = img.crop((x_left, y_top, x_right, y_bot))

    # 2. Adaptive contrast stretch (+20%)
    contrast_enhancer = ImageEnhance.Contrast(img)
    img = contrast_enhancer.enhance(1.20)

    # 3. Unsharp masking to preserve character fidelity and prevent thin character erosion
    img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=150, threshold=2))

    return img


def call_minicpm_ollama_sync(image_path: Path) -> Tuple[str, str]:
    """
    Synchronous worker for invoking MiniCPM-V vision models via Ollama.
    Hardware-tuned parameters for Intel Core Ultra 9 288V (32GB unified RAM, Lion Cove P-cores with AVX-VNNI).
    """
    with Image.open(image_path) as raw_img:
        # Preprocess with ROI crop, +20% adaptive contrast stretch, and unsharp masking
        img = preprocess_frame_for_ocr(raw_img, roi_crop=True)
        w, h = img.size
        max_dim = 1344
        if max(w, h) > max_dim:
            scale = max_dim / float(max(w, h))
            img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        # PNG format avoids 8x8 DCT JPEG ringing artifacts that distort brackets, colons, and backticks
        img.convert("RGB").save(buf, format="PNG", optimize=False)
        img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    prompt = (
        "Extract code lines verbatim with gutter line numbers from the image.\n"
        "If a document/file name is visible in the tab or header, output it first as:\n"
        "FILE_NAME: <detected file name>\n"
        "Output each code/text line in the strict structured format:\n"
        "LINE_NUM: code_content\n\n"
        "CRITICAL RULES:\n"
        "- The window title bar or app header is NOT part of the editor gutter. NEVER output it as LINE_1 or any line number.\n"
        "- LINE_NUM must strictly be the integer line number visible in the left gutter inside the editor.\n"
        "- Line 1 starts at gutter line number 1. Line 1 content in your output must align with gutter line 1.\n"
        "- code_content must be the verbatim code with exact indentation, brackets, and symbols.\n"
        "- If a gutter line is blank, output 'LINE_NUM:' with no code content.\n"
        "- If a line number is not visible in the left gutter, NEVER hallucinate it. State 'Not visible' or omit it.\n"
        "- If no gutter line numbers are visible in the image, output 'Not visible'.\n"
        "- Do not include markdown code fences, headers, or explanations."
    )
    models = []
    for cand in [config.OLLAMA_VISION_MODEL, "minicpm-v:latest", "minicpm-v"]:
        if cand and cand not in models:
            models.append(cand)
    last_ex = None
    ollama_opts = {
        "num_predict": 512,
        "temperature": 0.0,
        "top_k": 1,
        "min_p": 0.05,
        "repeat_penalty": 1.20,
        "repeat_last_n": 128,
        "num_thread": 6,
        "num_ctx": 2048,
        "num_batch": 512,
        "stop": ["\n\n\n\n", "Not visible", "<|endoftext|>", "<|im_end|>"]
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

    line_pattern = re.compile(r"^\s*(?:line[_\s]*|ln\s*|l)?\[?(\d+)\]?\s*(?:[:|.)\]\-][ ]?|\s{2,}|\s*$)(.*)$", re.IGNORECASE)

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
                code = str(item.get("text", ""))
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

    # File name detection fallback & gutter line alignment:
    # If the first line is the window title bar filename (e.g. filename.md), exclude it from the scan
    # and align gutter line 1 with line 1 of the document text.
    FILENAME_EXT_REGEX = re.compile(
        r"^[a-zA-Z0-9_\-.]+\.(?:md|markdown|py|js|ts|tsx|jsx|json|html|css|yaml|yml|c|cpp|h|hpp|go|rs|java|kt|sh|rb|sql|txt)$",
        re.IGNORECASE
    )
    if plines:
        first_txt = (plines[0].get("text") or "").strip()
        first_ln = plines[0].get("line_number", 0)
        if first_ln <= 2 and FILENAME_EXT_REGEX.match(first_txt):
            if not detected_filename:
                detected_filename = first_txt
            plines.pop(0)
            if plines and not (plines[0].get("text") or "").strip():
                plines.pop(0)
            if plines:
                offset = plines[0]["line_number"] - 1
                if offset > 0:
                    for p in plines:
                        p["line_number"] -= offset
                        p["gutter_number"] = p["line_number"]

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

async def scan_image_with_minicpm(image_path: Path) -> Dict[str, Any]:
    """
    Scan image with local vision model (MiniCPM-V in Ollama, with OpenVINO RapidOCR fallback)
    for verbatim code/markdown line extraction and bounding boxes.
    """
    plines = []
    top_ln = bot_ln = 0
    formatted = ""
    detected_filename = None
    model_used = None
    bboxes = {}

    try:
        raw_resp, model_name = await asyncio.to_thread(call_minicpm_ollama_sync, Path(image_path))
        plines, top_ln, bot_ln, formatted, detected_filename = parse_minicpm_output(raw_resp)
        non_blank = [p for p in plines if (p.get("text") or "").strip()]
        if non_blank:
            model_used = f"MiniCPM-V ({model_name})"
    except Exception as e:
        print(f"[MiniCPM-V OCR] Ollama call error: {e}")

    # If MiniCPM-V failed, timed out, or produced no lines with text, fallback to OpenVINO RapidOCR
    if not plines or not any((p.get("text") or "").strip() for p in plines):
        try:
            from ocr_engine import worker_scan_image
            fallback_res = await asyncio.to_thread(worker_scan_image, str(image_path))
            f_lines = fallback_res.get("lines", [])
            if f_lines:
                plines = f_lines
                top_ln = fallback_res.get("top_line", top_ln)
                bot_ln = fallback_res.get("bottom_line", bot_ln)
                bboxes = fallback_res.get("bounding_boxes", {})
                formatted = "\n".join(f"{p['line_number']:>3}: {p.get('text', '')}" for p in plines)
                model_used = "Local RapidOCR (OpenVINO Accelerated)"
        except Exception as ex:
            print(f"[Local OCR Fallback] error: {ex}")

    if plines:
        return {
            "status": "success",
            "top_line": top_ln,
            "bottom_line": bot_ln,
            "lines": plines,
            "extracted_text": formatted,
            "lines_count": len(plines),
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
            "bounding_boxes": {},
            "model_used": "Local OCR (Empty)"
        }


