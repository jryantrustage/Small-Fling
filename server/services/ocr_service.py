import asyncio
import base64
import io
import json
import re
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import HTTPException
from PIL import Image
from google import genai
from google.genai import types

import config
from services import state

active_pipeline_mode = "cloud"
active_model_target = "gemini"
active_ocr_engine = "auto"

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
        return active_model_target
    t = target.strip().lower()
    if t not in {"gemini", "ollama"}:
        raise HTTPException(status_code=400, detail=f"Invalid model_target '{target}'. Must be 'gemini' or 'ollama'.")
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
        state.captured_frames[frame_id]["status"] = "awaiting_api_key"
        state.save_persisted_state()
        return
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
    res = await state.scan_image_in_process(image_path)
    top_ln, bot_ln, lines = res.get("top_line", 0), res.get("bottom_line", 0), res.get("lines", [])
    state.captured_frames[frame_id].update({
        "top_line": top_ln,
        "bottom_line": bot_ln,
        "extracted_line_count": len(lines),
        "status": "processed",
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
                "is_blank": item.get("is_blank", False),
                "is_wrapped": item.get("is_wrapped", False),
                "wrapped_line_count": item.get("wrapped_line_count", 1),
                "status": "verified",
                "frame_id": frame_id,
                "sources": [frame_id],
                "confidence": item.get("confidence", 0.98),
                "notes": "Local Gutter OCR (Worker Process)",
                "updated_at": datetime.now().isoformat()
            }
    state.save_persisted_state()
    state.update_dag_after_frame(frame_id, top_ln, bot_ln)
    return res

async def process_frame_with_ollama(frame_id: str, image_path: Path, top_line: int, bottom_line: int):
    def _call_ollama_sync():
        with Image.open(image_path) as img:
            w, h = img.size
            scale = min(1.0, 720.0 / h) if h > 720 else 1.0
            if scale < 1.0:
                img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.BILINEAR)
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
            if not line_clean.strip():
                continue
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
        state.captured_frames[frame_id]["model_used"] = f"ollama:{model_used}"
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
    finally:
        state.save_persisted_state()

async def process_frame_with_target(frame_id: str, image_path: Path, top_line: int, bottom_line: int, model_target: Optional[str] = None):
    target = normalize_model_target(model_target)
    if target == "ollama":
        await process_frame_with_ollama(frame_id, image_path, top_line, bottom_line)
    else:
        await process_frame_with_gemini(frame_id, image_path, top_line, bottom_line)

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
        return {"top_line": state.captured_frames[frame_id].get("top_line", 0), "bottom_line": state.captured_frames[frame_id].get("bottom_line", 0), "lines": []}
    elif mode == "hybrid":
        local_res = await process_frame_with_local_ocr(frame_id, image_path)
        try:
            await process_frame_with_target(frame_id, image_path, top_line, bottom_line, target)
        except Exception:
            pass
        return local_res
    else:
        try:
            await process_frame_with_target(frame_id, image_path, top_line, bottom_line, target)
            return {"top_line": state.captured_frames[frame_id].get("top_line", 0), "bottom_line": state.captured_frames[frame_id].get("bottom_line", 0), "lines": []}
        except Exception:
            return await process_frame_with_local_ocr(frame_id, image_path)
