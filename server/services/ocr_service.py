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
from PIL import Image
from google import genai
from google.genai import types

import config
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

def call_minicpm_ollama_sync(image_path: Path) -> Tuple[str, str]:
    """
    Synchronous worker for invoking MiniCPM-V vision models via Ollama.
    Hardware-tuned parameters for Intel Core Ultra 9 288V (32GB unified RAM, Lion Cove P-cores with AVX-VNNI).
    """
    with Image.open(image_path) as img:
        w, h = img.size
        max_dim = 1920
        if max(w, h) > max_dim:
            scale = max_dim / float(max(w, h))
            img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        # PNG format avoids 8x8 DCT JPEG ringing artifacts that distort brackets, colons, and backticks
        img.convert("RGB").save(buf, format="PNG", optimize=False)
        img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    prompt = (
        "Extract code lines verbatim with gutter line numbers from the image.\n"
        "Output each line in the strict structured format:\n"
        "LINE_NUM: code_content\n\n"
        "Rules:\n"
        "- Output ONLY lines in 'LINE_NUM: code_content' format, one per line.\n"
        "- LINE_NUM must be the integer line number visible in the left gutter.\n"
        "- code_content must be the verbatim code with exact indentation, brackets, and symbols.\n"
        "- If a line is blank, output 'LINE_NUM:' with no code content.\n"
        "- Do not include markdown code fences, headers, or explanations."
    )
    models = []
    for cand in [config.OLLAMA_VISION_MODEL, "minicpm-v:latest", "minicpm-v"]:
        if cand and cand not in models:
            models.append(cand)
    last_ex = None
    ollama_opts = {
        "num_predict": 1024,
        "temperature": 0.0,
        "top_k": 1,
        "min_p": 0.05,
        "repeat_penalty": 1.08,
        "repeat_last_n": 64,
        "num_thread": 4,
        "num_ctx": 4096,
        "num_batch": 512,
    }
    timeout_sec = max(config.OLLAMA_TIMEOUT, 60)
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


def parse_minicpm_output(raw_resp: str) -> Tuple[List[Dict[str, Any]], int, int, str]:
    """
    Parses MiniCPM-V textual output with robust multi-delimiter regex and JSON fallback.
    Supports formats:
      '1: code', '1. code', '1 | code', '[1] code', '1) code', 'Line 1: code', '1   code'
    """
    raw_text = re.sub(r"^\s*```(?:[a-zA-Z0-9_-]+)?\s*|\s*```\s*$", "", (raw_resp or "").strip())
    plines: List[Dict[str, Any]] = []
    line_pattern = re.compile(r"^\s*(?:line[_\s]*|ln\s*|l)?\[?(\d+)\]?\s*(?:[:|.)\]\-][ ]?|\s{2,}|\s*$)(.*)$", re.IGNORECASE)

    seen_lines = set()
    for line in raw_text.splitlines():
        line_clean = line.rstrip()
        if not line_clean.strip():
            continue
        if match := line_pattern.match(line_clean):
            ln = int(match.group(1))
            code = match.group(2)
            if ln in seen_lines:
                continue
            seen_lines.add(ln)
            plines.append({
                "line_number": ln,
                "gutter_number": ln,
                "text": code,
                "is_blank": not bool(code.strip()),
                "is_wrapped": False,
                "wrapped_line_count": 1,
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
                if ln in seen_lines:
                    continue
                seen_lines.add(ln)
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
    top_ln = min((p["line_number"] for p in plines), default=0)
    bot_ln = max((p["line_number"] for p in plines), default=0)
    formatted = "\n".join(f"{p['line_number']:>3}: {p['text']}" for p in plines) if plines else raw_text
    return plines, top_ln, bot_ln, formatted


async def process_frame_with_ollama(frame_id: str, image_path: Path, top_line: int, bottom_line: int):
    try:
        raw_resp, model_used = await asyncio.to_thread(call_minicpm_ollama_sync, Path(image_path))
        plines, top_g, bot_g, _ = parse_minicpm_output(raw_resp)
        top_val = top_g if top_g > 0 else (top_line if top_line > 0 else None)
        bot_val = bot_g if bot_g > 0 else (bottom_line if bottom_line > 0 else None)
        _apply_extracted_lines(frame_id, plines, top_val, bot_val, f"Ollama Vision ({model_used})")
        state.captured_frames[frame_id]["model_used"] = f"ollama:{model_used}"
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
    """Scan image with MiniCPM-V in Ollama for verbatim code/markdown line extraction."""
    try:
        raw_resp, model_name = await asyncio.to_thread(call_minicpm_ollama_sync, Path(image_path))
        plines, top_ln, bot_ln, formatted = parse_minicpm_output(raw_resp)
        return {
            "status": "success",
            "top_line": top_ln,
            "bottom_line": bot_ln,
            "lines": plines,
            "extracted_text": formatted,
            "lines_count": len(plines),
            "bounding_boxes": {},
            "model_used": f"MiniCPM-V ({model_name})"
        }
    except Exception as e:
        print(f"[MiniCPM-V OCR] Ollama call error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "top_line": 0,
            "bottom_line": 0,
            "lines": [],
            "extracted_text": "",
            "lines_count": 0,
            "bounding_boxes": {},
            "model_used": "MiniCPM-V (Failed)"
        }

