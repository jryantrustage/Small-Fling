import asyncio, base64, hashlib, io, json, re
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks, Query, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from PIL import Image

import config
import db
from models import ReprocessRequest, FramePositionRequest, LineEditRequest, FlagRequest, RecaptureRequest
from services import state
from services.adb_service import DEVICE_PROFILES, current_device_model
from services.ocr_service import (
    route_frame_ocr, normalize_model_target, active_pipeline_mode,
    active_model_target, process_frame_with_target, sync_pipeline_mode_with_keys,
)
import services.ocr_service as ocr_svc


router = APIRouter(tags=["Frames & Document"])

def _get_frame_path(frame_id: str, filename: Optional[str] = None) -> Path:
    search_dirs = [state.FRAMES_DIR, db.FRAMES_DIR, config.FRAMES_DIR]

    if filename:
        for fdir in search_dirs:
            cand = fdir / filename
            if cand.exists():
                return cand

    clean_id = frame_id[:-4] if frame_id.endswith(".png") else frame_id
    for fdir in search_dirs:
        if (fdir / frame_id).exists():
            return fdir / frame_id
        if (fdir / f"{clean_id}.png").exists():
            return fdir / f"{clean_id}.png"

    if frame_id in ("latest", "current", "temp"):
        for fdir in search_dirs:
            temp_c = fdir / "dag_node3_capture_temp.png"
            if temp_c.exists() and temp_c.stat().st_size >= 2000:
                return temp_c
        for fdir in search_dirs:
            cands = sorted(
                [p for p in fdir.glob("*.png") if p.stat().st_size >= 2000 and not p.name.startswith("temp_")],
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            if cands:
                return cands[0]

    for fdir in search_dirs:
        matches = list(fdir.glob(f"*{frame_id}*.png"))
        if matches:
            return matches[0]

    finfo = state.captured_frames.get(frame_id)
    if finfo and finfo.get("filename"):
        for fdir in search_dirs:
            cand = fdir / finfo["filename"]
            if cand.exists():
                return cand

    try:
        frames = db.get_frames(state.get_current_project_id())
        for f in frames:
            if f.get("frame_id") == frame_id:
                fn = f.get("filename")
                if fn:
                    for fdir in search_dirs:
                        cand = fdir / fn
                        if cand.exists():
                            return cand
    except Exception:
        pass

    raise HTTPException(status_code=404, detail=f"Frame image file '{frame_id}' not found")

def _get_available_ocr_images(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    images = []
    seen_paths = set()

    # 1. Latest DAG 3/4 capture
    latest_temp = state.FRAMES_DIR / "dag_node3_capture_temp.png"
    if latest_temp.exists() and latest_temp.stat().st_size >= 2000:
        seen_paths.add(latest_temp.resolve())
        mtime = datetime.fromtimestamp(latest_temp.stat().st_mtime).isoformat()
        images.append({
            "id": "dag_node3_capture_temp",
            "name": "dag_node3_capture_temp.png",
            "label": "Latest Active Capture (Live Buffer)",
            "category": "latest",
            "size": latest_temp.stat().st_size,
            "created_at": mtime,
            "url": "/api/frames/dag_node3_capture_temp/image",
            "is_latest": True
        })

    # 2. Registered frames from state (sorted in natural document page order: Pg 1, Pg 2...)
    sorted_frames = sorted(
        state.captured_frames.values(),
        key=lambda x: (x.get("page_index", 0) or 0, x.get("top_line", 0) or 0, x.get("created_at", "") or "")
    )

    for finfo in sorted_frames:
        fid = finfo.get("frame_id")
        if not fid:
            continue
        try:
            p = _get_frame_path(fid, finfo.get("filename"))
            if p.exists() and p.resolve() not in seen_paths:
                seen_paths.add(p.resolve())
                pg = finfo.get("page_index") or "?"
                top_l = finfo.get("top_line")
                bot_l = finfo.get("bottom_line")
                if top_l is not None and bot_l is not None and top_l > 0:
                    lbl = f"Page {pg} (Lines {top_l}-{bot_l}) • {fid[:28]}"
                else:
                    lbl = f"Page {pg} • {fid[:28]}"

                images.append({
                    "id": fid,
                    "name": p.name,
                    "label": lbl,
                    "category": "frames",
                    "size": p.stat().st_size,
                    "created_at": finfo.get("created_at") or datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
                    "url": f"/api/frames/{fid}/image",
                    "top_line": finfo.get("top_line"),
                    "bottom_line": finfo.get("bottom_line"),
                    "page_index": finfo.get("page_index"),
                    "lines_count": finfo.get("extracted_line_count", 0),
                    "model_used": finfo.get("model_used")
                })
        except Exception:
            continue

    # 3. Fallback ONLY when state has no registered frames: discover authentic frame_*.png
    if not state.captured_frames:
        all_pngs = sorted(
            [p for p in state.FRAMES_DIR.glob("frame_*.png") if p.stat().st_size >= 2000 and p.resolve() not in seen_paths and not p.name.startswith(("test_", "raw_", "temp_", "crop_", "scratch_"))],
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        for p in all_pngs:
            seen_paths.add(p.resolve())
            images.append({
                "id": p.stem,
                "name": p.name,
                "label": p.name,
                "category": "storage",
                "size": p.stat().st_size,
                "created_at": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
                "url": f"/api/frames/{p.stem}/image"
            })

    return images

@router.get("/api/ocr/images")
async def get_ocr_images(project_id: Optional[str] = Query(None)):
    """List all available project images for OCR full inspection."""
    return {"status": "success", "images": _get_available_ocr_images(project_id=project_id)}

_ocr_inspect_cache: Dict[str, Dict[str, Any]] = {}

def clear_ocr_inspect_cache():
    """Clear in-memory inspect cache when switching or deleting projects."""
    _ocr_inspect_cache.clear()

@router.get("/api/ocr/inspect")
@router.post("/api/ocr/inspect")
async def inspect_ocr_image(
    image_id: Optional[str] = Query(None),
    rescan: bool = Query(False),
    req: Optional[Dict[str, Any]] = None
):
    """
    Returns source image details, verbatim extracted text, and line-mapped bounding boxes
    with connectors for the selected image.
    """
    target_id = (req.get("image_id") if req else None) or image_id or "latest"
    force_rescan = (req.get("rescan") if req else None) or rescan

    try:
        ipath = _get_frame_path(target_id)
    except HTTPException:
        try:
            ipath = _get_frame_path("latest")
            target_id = ipath.stem
        except HTTPException:
            raise HTTPException(status_code=404, detail="No capture images available for this project yet")

    if not ipath or not ipath.exists():
        raise HTTPException(status_code=404, detail="Frame image file not found on disk")

    img_w, img_h = 1920, 1080
    try:
        from PIL import Image
        with Image.open(ipath) as im:
            img_w, img_h = im.size
    except Exception:
        pass

    file_mtime = ipath.stat().st_mtime if ipath.exists() else 0
    cache_key = f"{str(ipath.resolve())}_{file_mtime}"

    ed_top = max(280, int(img_h * 0.260))
    ed_bot = min(int(img_h * 0.875), img_h - 135)
    def _is_valid_entry(cand_lines, cand_bboxes):
        if not cand_lines or not cand_bboxes:
            return False
        g_boxes = cand_bboxes.get("gutter_boxes", {})
        if not g_boxes:
            return False
        first_ln = min((int(k) for k in g_boxes.keys()), default=0)
        first_y = g_boxes.get(first_ln, {}).get("y", 0)
        if first_y < (ed_top - 35):
            return False
        last_ln = max((int(k) for k in g_boxes.keys()), default=0)
        last_y = g_boxes.get(last_ln, {}).get("y", 0)
        if last_y > (ed_bot + 25):
            return False
        return True

    cached_frame = state.captured_frames.get(target_id)
    n4_state = state.dag_state.get("nodes", {}).get("local_ai_ocr", {})

    if force_rescan:
        _ocr_inspect_cache.pop(cache_key, None)

    can_use_cache = (
        not force_rescan and
        (
            (cache_key in _ocr_inspect_cache and _is_valid_entry(_ocr_inspect_cache[cache_key].get("lines"), _ocr_inspect_cache[cache_key].get("bboxes"))) or
            (cached_frame and _is_valid_entry(cached_frame.get("lines"), cached_frame.get("bounding_boxes"))) or
            (n4_state.get("image_id") == target_id and _is_valid_entry(n4_state.get("lines"), n4_state.get("bounding_boxes")))
        )
    )

    if can_use_cache:
        if cache_key in _ocr_inspect_cache:
            entry = _ocr_inspect_cache[cache_key]
            lines = entry["lines"]
            bboxes = entry["bboxes"]
            model_used = entry["model_used"]
            extracted_text = entry["extracted_text"]
            top_ln = entry["top_ln"]
            bot_ln = entry["bot_ln"]
            img_w = entry["img_w"]
            img_h = entry["img_h"]
        elif cached_frame and _is_valid_entry(cached_frame.get("lines"), cached_frame.get("bounding_boxes")):
            lines = cached_frame.get("lines", [])
            bboxes = cached_frame.get("bounding_boxes", {})
            model_used = cached_frame.get("model_used", "MiniCPM-V (Ollama)")
            extracted_text = "\n".join(f"{l.get('line_number', 0):>3}: {l.get('text', '')}" for l in lines)
            top_ln = cached_frame.get("top_line", min((l.get("line_number", 0) for l in lines), default=0))
            bot_ln = cached_frame.get("bottom_line", max((l.get("line_number", 0) for l in lines), default=0))
        else:
            lines = n4_state.get("lines", [])
            bboxes = n4_state.get("bounding_boxes", {})
            model_used = n4_state.get("model_used", "MiniCPM-V (Ollama)")
            extracted_text = n4_state.get("extracted_text", "")
            top_ln = min((l.get("line_number", 0) for l in lines), default=0)
            bot_ln = max((l.get("line_number", 0) for l in lines), default=0)
    else:
        exp_top = cached_frame.get("top_line") if cached_frame else None
        res = await ocr_svc.scan_image_with_minicpm(ipath, expected_top=exp_top)
        lines = res.get("lines", [])
        bboxes = res.get("bounding_boxes", {})
        model_used = res.get("model_used", "MiniCPM-V (Ollama)")
        extracted_text = res.get("extracted_text", "")
        top_ln = res.get("top_line", 0)
        bot_ln = res.get("bottom_line", 0)
        img_w = res.get("image_width", img_w)
        img_h = res.get("image_height", img_h)

        _ocr_inspect_cache[cache_key] = {
            "lines": lines,
            "bboxes": bboxes,
            "model_used": model_used,
            "extracted_text": extracted_text,
            "top_ln": top_ln,
            "bot_ln": bot_ln,
            "img_w": img_w,
            "img_h": img_h
        }

        if cached_frame:
            cached_frame.update({
                "lines": lines,
                "bounding_boxes": bboxes,
                "model_used": model_used,
                "extracted_line_count": len(lines)
            })
            state.save_persisted_state()

    available = _get_available_ocr_images()

    return {
        "status": "success",
        "image_id": target_id,
        "image_name": ipath.name,
        "image_url": f"/api/frames/{ipath.stem}/image",
        "image_width": img_w,
        "image_height": img_h,
        "top_line": top_ln,
        "bottom_line": bot_ln,
        "lines_count": len(lines),
        "model_used": model_used,
        "extracted_text": extracted_text,
        "lines": lines,
        "bounding_boxes": bboxes,
        "available_images": available
    }

@router.get("/api/ocr/rescan-lines")
@router.post("/api/ocr/rescan-lines")
async def rescan_ocr_lines(
    image_id: Optional[str] = Query(None),
    lines: Optional[str] = Query(None),
    req: Optional[Dict[str, Any]] = None
):
    """
    Selectively rescans only the specified line numbers in the selected image frame,
    overwriting the extracted result text for those line numbers in state, cache,
    and verified document lines. Supports both GET with ?image_id=...&lines=1,2,3 and POST JSON.
    """
    target_id = (req.get("image_id") if req else None) or image_id or "latest"
    raw_lns = (req.get("line_numbers") if req else None) or (lines.split(",") if lines else [])
    if isinstance(raw_lns, (int, str)):
        raw_lns = [raw_lns]
    line_numbers = [int(str(x).strip()) for x in raw_lns if str(x).strip().isdigit()]

    if not line_numbers:
        raise HTTPException(status_code=400, detail="No valid line_numbers provided for selective rescan")

    try:
        ipath = _get_frame_path(target_id)
    except HTTPException:
        ipath = _get_frame_path("latest")
        target_id = ipath.stem

    file_mtime = ipath.stat().st_mtime if ipath.exists() else 0
    cache_key = f"{str(ipath.resolve())}_{file_mtime}"

    cached_frame = state.captured_frames.get(target_id)
    n4_state = state.dag_state.get("nodes", {}).get("local_ai_ocr", {})

    current_lines = []
    current_bboxes = {}

    if req and req.get("lines"):
        current_lines = [dict(l) for l in req["lines"]]
        current_bboxes = dict(req.get("bounding_boxes", {}))
    elif cache_key in _ocr_inspect_cache:
        current_lines = [dict(l) for l in _ocr_inspect_cache[cache_key].get("lines", [])]
        current_bboxes = dict(_ocr_inspect_cache[cache_key].get("bboxes", {}))
    elif cached_frame and cached_frame.get("lines"):
        current_lines = [dict(l) for l in cached_frame.get("lines", [])]
        current_bboxes = dict(cached_frame.get("bounding_boxes", {}))
    elif n4_state.get("lines"):
        current_lines = [dict(l) for l in n4_state.get("lines", [])]
        current_bboxes = dict(n4_state.get("bounding_boxes", {}))
    else:
        from ocr_engine import worker_scan_image
        quick_scan = await asyncio.to_thread(worker_scan_image, str(ipath))
        current_lines = quick_scan.get("lines", [])
        current_bboxes = quick_scan.get("bounding_boxes", {})

    from services.ocr_service import rescan_lines_on_image_sync
    updated_lines, rescanned = await asyncio.to_thread(
        rescan_lines_on_image_sync,
        ipath,
        line_numbers,
        current_lines,
        current_bboxes
    )

    updated_text = "\n".join(f"{l.get('line_number', 0):>3}: {l.get('text', '')}" for l in updated_lines)

    if cache_key in _ocr_inspect_cache:
        _ocr_inspect_cache[cache_key]["lines"] = updated_lines
        _ocr_inspect_cache[cache_key]["extracted_text"] = updated_text

    if cached_frame:
        cached_frame["lines"] = updated_lines
        state.save_persisted_state()

    for ln in rescanned:
        line_item = next((l for l in updated_lines if l.get("line_number") == ln), None)
        if line_item and hasattr(state, "document_lines"):
            existing = state.document_lines.get(ln)
            meta = getattr(existing, "meta", {}).copy() if (existing and hasattr(existing, "meta")) else (dict(existing) if isinstance(existing, dict) else {})
            meta.update({
                "line_number": ln,
                "gutter_number": ln,
                "status": "verified",
                "overwritten": True,
                "frame_id": target_id,
                "updated_at": datetime.now().isoformat()
            })
            if line_item.get("confidence") is not None:
                meta["confidence"] = line_item.get("confidence")
            if line_item.get("is_wrapped") is not None:
                meta["is_wrapped"] = line_item.get("is_wrapped")
            state.document_lines[ln] = state.MasterLine(
                line_item.get("text", ""),
                **meta
            )
    state.save_persisted_state()

    try:
        if hasattr(state, "ws_manager") and state.ws_manager:
            await state.ws_manager.broadcast({
                "type": "ocr_lines_rescanned",
                "image_id": target_id,
                "rescanned_lines": rescanned
            })
            await state.ws_manager.broadcast({
                "type": "document_updated",
                "data": _doc_payload()
            })
    except Exception:
        pass

    return {
        "status": "success",
        "message": f"Successfully rescanned and overwritten {len(rescanned)} line(s)",
        "rescanned_lines": rescanned,
        "image_id": target_id,
        "lines": updated_lines,
        "extracted_text": updated_text,
        "bounding_boxes": current_bboxes
    }

def _doc_payload() -> Dict[str, Any]:
    if not getattr(state, "_state_initialized", False):
        state.load_persisted_state()
    sl = state.get_serialized_lines()
    issues = [item for item in sl if item.get("status") in ["flagged", "missing", "gap", "overlap_conflict", "issue", "unaligned"]]
    return {
        "total_lines": len(sl),
        "verified_lines_count": len(state.document_lines),
        "min_line": min(state.document_lines.keys()) if state.document_lines else 0,
        "max_line": max(state.document_lines.keys()) if state.document_lines else 0,
        "total_frames": len(state.captured_frames),
        "issue_count": len(issues),
        "token_stats": state.token_stats,
        "latest_telemetry": state.get_fresh_telemetry(),
        "issues": issues,
        "lines": sl
    }

@router.post("/api/upload-frame")
async def upload_frame(request: Request, background_tasks: BackgroundTasks):
    ct = request.headers.get("content-type", "")
    contents, top_line, bottom_line, pidx, sync = None, 0, 0, 0, True
    engine, model_type, model_target, pipeline_mode = None, None, None, None

    if "application/json" in ct:
        body = await request.json()
        b64 = body.get("image_base64") or body.get("image") or ""
        if b64:
            try: contents = base64.b64decode(re.sub(r"^data:image/[^;]+;base64,", "", b64.strip()))
            except Exception as e: raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
        top_line, bottom_line, pidx = body.get("top_line", 0), body.get("bottom_line", 0), body.get("page_index", 0)
        sync = body.get("sync", True)
        engine, model_type, model_target, pipeline_mode = body.get("engine"), body.get("model_type"), body.get("model_target"), body.get("pipeline_mode")
    else:
        form = await request.form()
        file_obj = form.get("file")
        if file_obj and hasattr(file_obj, "read"):
            contents = await file_obj.read()
        elif b64_form := form.get("image_base64") or form.get("image"):
            try: contents = base64.b64decode(re.sub(r"^data:image/[^;]+;base64,", "", str(b64_form).strip()))
            except Exception as e: raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
        top_line, bottom_line, pidx = form.get("top_line", 0), form.get("bottom_line", 0), form.get("page_index", 0)
        sync = form.get("sync", True)
        if isinstance(sync, str): sync = sync.lower() not in ("false", "0", "no")
        engine, model_type, model_target, pipeline_mode = form.get("engine"), form.get("model_type"), form.get("model_target"), form.get("pipeline_mode")

    if not contents:
        raise HTTPException(status_code=400, detail="Missing frame image: provide 'image_base64' or multipart 'file'")

    try: top_line = int(top_line) if top_line is not None else 0
    except (ValueError, TypeError): top_line = 0
    try: bottom_line = int(bottom_line) if bottom_line is not None else 0
    except (ValueError, TypeError): bottom_line = 0
    try: pidx = int(pidx) if pidx and int(pidx) > 0 else len(state.captured_frames) + 1
    except (ValueError, TypeError): pidx = len(state.captured_frames) + 1

    content_hash = hashlib.sha256(contents).hexdigest()
    sorted_frames = sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))
    profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
    lpp, step = profile["lines_per_page"], profile["step_size"]

    if sorted_frames and sorted_frames[-1].get("content_hash") == content_hash:
        last_f = sorted_frames[-1]
        return {
            "status": "warning", "is_duplicate": True, "frame_id": last_f["frame_id"],
            "page_index": last_f.get("page_index", 1), "top_line": last_f.get("top_line", top_line),
            "bottom_line": last_f.get("bottom_line", bottom_line),
            "message": f"Screen has not scrolled. Identical to existing Frame {last_f['frame_id']}."
        }

    if sorted_frames and pidx > 1:
        last_bot = sorted_frames[-1].get("bottom_line", 0)
        if last_bot > 0:
            if top_line <= 1 or top_line <= last_bot: top_line = last_bot + 1
            if bottom_line <= top_line: bottom_line = top_line + step
    elif top_line <= 0:
        top_line, bottom_line = 1, lpp
    elif bottom_line <= 0:
        bottom_line = top_line + step

    if not state.get_current_project_id():
        raise HTTPException(status_code=400, detail="No active project. Please create a project before capturing or uploading frames.")

    now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
    fid = f"frame_{top_line:05d}_{bottom_line:05d}_{now_str}" if top_line > 0 and bottom_line > 0 else f"frame_p{pidx:03d}_{now_str}"
    fn = f"{fid}.png"
    tpath = state.FRAMES_DIR / fn
    with open(tpath, "wb") as f:
        f.write(contents)

    sync_pipeline_mode_with_keys()
    has_key = bool(config.GEMINI_API_KEY)
    pm = pipeline_mode or request.query_params.get("pipeline_mode") or (active_pipeline_mode if has_key else "local")
    effective_target = model_target or ("ollama" if pm == "local" or not has_key else active_model_target)
    if model_type:
        mt_lower = str(model_type).strip().lower()
        effective_target = ("gemini" if has_key else "ollama") if "gemini" in mt_lower else ("ollama" if any(k in mt_lower for k in ["ollama", "llama", "qwen", "minicpm"]) else mt_lower)
    mt = normalize_model_target(effective_target or request.query_params.get("model_target"))

    state.captured_frames[fid] = {
        "frame_id": fid, "filename": fn, "top_line": top_line, "bottom_line": bottom_line,
        "page_index": pidx, "file_size": len(contents), "content_hash": content_hash,
        "status": "awaiting_review" if not sync else "queued",
        "created_at": datetime.now().isoformat(), "extracted_line_count": 0,
        "model_type": model_type or mt, "token_usage": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
    }
    state.save_persisted_state()
    await state.ws_manager.broadcast({"type": "new_frame", "frame": state.captured_frames[fid]})

    if sync:
        await route_frame_ocr(fid, tpath, top_line, bottom_line, engine, mt, pm)
        cf = state.captured_frames[fid]
        return {
            "status": "success", "frame_id": fid, "page_index": pidx,
            "top_line": cf.get("top_line", top_line), "bottom_line": cf.get("bottom_line", bottom_line),
            "extracted_line_count": cf.get("extracted_line_count", 0),
            "model_type": model_type or mt, "model_target": mt, "pipeline_mode": pm,
            "message": f"Frame stored and verified: Lines {cf.get('top_line', top_line)} → {cf.get('bottom_line', bottom_line)}."
        }
    return {
        "status": "success", "frame_id": fid, "page_index": pidx, "top_line": top_line, "bottom_line": bottom_line,
        "extracted_line_count": 0, "model_type": model_type or mt, "model_target": mt, "pipeline_mode": pm,
        "message": f"Frame {fid} received and awaiting review."
    }

@router.post("/api/frames/{frame_id}/scan")
async def scan_frame_ocr(frame_id: str, engine: Optional[str] = Query("auto"), model_target: Optional[str] = Query(None), payload: Optional[ReprocessRequest] = None):
    if frame_id not in state.captured_frames:
        raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    finfo = state.captured_frames[frame_id]
    ipath = _get_frame_path(frame_id, finfo.get("filename"))
    mt = normalize_model_target((payload.model_target if payload and payload.model_target else None) or model_target)
    try:
        exp_top = finfo.get("top_line")
        res = await ocr_svc.scan_image_with_minicpm(ipath, expected_top=exp_top)
        top_ln, bot_ln, lines = res.get("top_line", 0), res.get("bottom_line", 0), res.get("lines", [])
        det_fn = res.get("detected_filename")
        if det_fn:
            pid = finfo.get("project_id") or state.get_current_project_id()
            if pid:
                db.append_project_filename(pid, det_fn)
                try:
                    proj = db.get_project(pid)
                    await state.ws_manager.broadcast({"type": "project_updated", "project": proj})
                    await state.ws_manager.broadcast({"type": "project_switched", "project": proj})
                except Exception:
                    pass
        orig_top = finfo.get("top_line", 0)
        orig_bot = finfo.get("bottom_line", 0)
        final_top = orig_top if orig_top > 0 else (top_ln or 1)
        final_bot = orig_bot if orig_bot > 0 else (bot_ln or (final_top + len(lines) - 1 if lines else final_top + 23))

        finfo.update({
            "top_line": final_top,
            "bottom_line": final_bot,
            "ocr_top_line": top_ln,
            "ocr_bottom_line": bot_ln,
            "extracted_line_count": len(lines),
            "ocr_extracted_count": len(lines),
            "status": "processed",
            "model_used": res.get("model_used", f"MiniCPM-V ({mt})"),
            "bounding_boxes": res.get("bounding_boxes", {})
        })
        for item in lines:
            if item.get("line_number"):
                ln = int(item["line_number"])
                state.document_lines[ln] = {
                    "line_number": ln, "gutter_number": ln, "text": item.get("text", ""),
                    "is_blank": item.get("is_blank", not bool(item.get("text", "").strip())),
                    "is_wrapped": item.get("is_wrapped", False),
                    "wrapped_line_count": item.get("wrapped_line_count", 1),
                    "status": "verified",
                    "frame_id": frame_id, "sources": [frame_id], "confidence": item.get("confidence", 0.98),
                    "notes": f"Local MiniCPM-V OCR ({mt})", "updated_at": datetime.now().isoformat()
                }
        state.save_persisted_state()
        data = {"status": "success", "frame_id": frame_id, "top_line": top_ln, "bottom_line": bot_ln,
                "extracted_line_count": len(lines), "bounding_boxes": res.get("bounding_boxes", {}), "lines": lines, "model_target": mt}
        await state.ws_manager.broadcast({"type": "document_updated", "document": state.get_document_metrics(), "data": state.get_document_metrics()})
        await state.ws_manager.broadcast({"type": "ocr_completed", **data})
        return data
    except Exception as e:
        finfo["status"] = f"error: {str(e)}"
        state.save_persisted_state()
        raise HTTPException(status_code=500, detail=f"OCR scan failed: {str(e)}")

@router.patch("/api/frames/{frame_id}/position")
async def update_frame_position(frame_id: str, req: FramePositionRequest):
    if not db.update_frame_position(frame_id, req.custom_offset_y):
        raise HTTPException(status_code=404, detail="Frame not found")
    if frame_id in state.captured_frames:
        state.captured_frames[frame_id]["custom_offset_y"] = req.custom_offset_y
    await state.ws_manager.broadcast({"type": "frame_position_updated", "frame_id": frame_id, "custom_offset_y": req.custom_offset_y})
    return {"status": "success", "frame_id": frame_id, "custom_offset_y": req.custom_offset_y}

@router.delete("/api/frames/{frame_id}")
async def delete_frame(frame_id: str):
    pid = state.get_current_project_id()
    deleted_from_db = False
    try:
        deleted_from_db = db.delete_frame(frame_id)
    except Exception as dbe:
        print(f"[delete_frame] db.delete_frame error: {dbe}")

    clean_id = frame_id[:-4] if frame_id.endswith(".png") else frame_id
    deleted_from_mem = False
    if frame_id in state.captured_frames:
        state.captured_frames.pop(frame_id, None)
        deleted_from_mem = True
    if clean_id in state.captured_frames:
        state.captured_frames.pop(clean_id, None)
        deleted_from_mem = True

    # Clean up physical files on disk
    for p in [
        state.FRAMES_DIR / f"{frame_id}.png",
        state.FRAMES_DIR / f"{clean_id}.png",
        state.FRAMES_DIR / frame_id,
        db.FRAMES_DIR / f"{frame_id}.png",
        db.FRAMES_DIR / f"{clean_id}.png",
        db.FRAMES_DIR / frame_id
    ]:
        if p.exists() and p.is_file():
            try: p.unlink(missing_ok=True)
            except Exception: pass

    for p in state.FRAMES_DIR.glob(f"*{clean_id}*.png"):
        if p.is_file():
            try: p.unlink(missing_ok=True)
            except Exception: pass

    # Clean up associated document lines
    lines_to_del = [
        k for k, v in list(state.document_lines.items())
        if (isinstance(v, dict) and v.get("frame_id") in (frame_id, clean_id))
        or (hasattr(v, "frame_id") and getattr(v, "frame_id") in (frame_id, clean_id))
    ]
    for lk in lines_to_del:
        state.document_lines.pop(lk, None)
        if pid:
            try: db.delete_document_line(pid, int(lk))
            except Exception: pass

    state.save_persisted_state()

    remaining_frames = db.get_frames(pid) if pid else []
    await state.ws_manager.broadcast({
        "type": "frame_deleted",
        "frame_id": frame_id,
        "frames": remaining_frames
    })
    await state.ws_manager.broadcast({
        "type": "document_updated",
        "data": _doc_payload()
    })
    return {
        "status": "success",
        "frame_id": frame_id,
        "deleted_from_db": deleted_from_db,
        "deleted_from_mem": deleted_from_mem
    }

@router.post("/api/frames/{frame_id}/delete")
async def delete_frame_post(frame_id: str):
    return await delete_frame(frame_id)

@router.post("/api/frames/batch-delete")
async def batch_delete_frames(req: Dict[str, Any]):
    frame_ids = req.get("frame_ids", [])
    if not isinstance(frame_ids, list):
        raise HTTPException(status_code=400, detail="frame_ids must be a list")
    pid = state.get_current_project_id()
    deleted = []
    for fid in frame_ids:
        sfid = str(fid)
        clean_id = sfid[:-4] if sfid.endswith(".png") else sfid
        try: db.delete_frame(sfid)
        except Exception: pass

        if sfid in state.captured_frames: state.captured_frames.pop(sfid, None)
        if clean_id in state.captured_frames: state.captured_frames.pop(clean_id, None)

        for p in [state.FRAMES_DIR / f"{sfid}.png", state.FRAMES_DIR / f"{clean_id}.png", state.FRAMES_DIR / sfid]:
            if p.exists() and p.is_file():
                try: p.unlink(missing_ok=True)
                except Exception: pass

        lines_to_del = [
            k for k, v in list(state.document_lines.items())
            if (isinstance(v, dict) and v.get("frame_id") in (sfid, clean_id))
            or (hasattr(v, "frame_id") and getattr(v, "frame_id") in (sfid, clean_id))
        ]
        for lk in lines_to_del:
            state.document_lines.pop(lk, None)
            if pid:
                try: db.delete_document_line(pid, int(lk))
                except Exception: pass
        deleted.append(sfid)

    state.save_persisted_state()
    remaining_frames = db.get_frames(pid) if pid else []
    await state.ws_manager.broadcast({
        "type": "frame_deleted",
        "frame_ids": deleted,
        "frames": remaining_frames
    })
    await state.ws_manager.broadcast({
        "type": "document_updated",
        "data": _doc_payload()
    })
    return {"status": "success", "deleted_count": len(deleted), "deleted_frames": deleted}


@router.post("/api/frames/purge")
async def purge_all_frames():
    purged_files = 0
    try:
        for f in state.FRAMES_DIR.glob("*"):
            if f.is_file() and f.name != ".gitkeep":
                try: f.unlink(missing_ok=True); purged_files += 1
                except Exception: pass
    except Exception as e:
        print(f"Error purging frame files: {e}")

    pid = state.get_current_project_id()
    if pid: db.clear_project_data(pid)
    state.captured_frames.clear()
    state.document_lines.clear()
    state.save_persisted_state()

    await state.ws_manager.broadcast({"type": "frames_purged", "purged_count": purged_files, "frames": []})
    await state.ws_manager.broadcast({"type": "document_updated", "data": {"total_lines": 0, "min_line": 0, "max_line": 0, "total_frames": 0, "issue_count": 0, "token_stats": state.token_stats, "lines": []}})
    return {"status": "success", "purged_count": purged_files, "message": f"Successfully purged {purged_files} frame images."}

@router.get("/api/frames")
async def get_frames():
    pid = state.get_current_project_id()
    db_frames = db.get_frames(pid) if pid else []
    if pid:
        db_ids = {f.get("frame_id") for f in db_frames}
        # Purge any leaked frames in memory that belong to other projects
        for fid in list(state.captured_frames.keys()):
            finfo = state.captured_frames[fid]
            frame_proj = finfo.get("project_id")
            if frame_proj and frame_proj != pid:
                state.captured_frames.pop(fid, None)
            elif fid not in db_ids and not frame_proj:
                # Untagged or orphaned frame
                state.captured_frames.pop(fid, None)
        return db_frames
    return list(state.captured_frames.values())

@router.get("/api/frames/{frame_id}/image")
async def get_frame_image(frame_id: str):
    return FileResponse(_get_frame_path(frame_id), media_type="image/png", headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0"})

THUMBNAILS_DIR = Path(__file__).parent.parent / "data" / "thumbnails"

@router.get("/api/frames/{frame_id}/thumbnail")
async def get_frame_thumbnail(frame_id: str):
    """
    Returns an optimized, cached 384x216 JPEG thumbnail for fast lazy loading
    with a dramatically smaller memory footprint.
    """
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    clean_id = frame_id[:-4] if frame_id.endswith(".png") else frame_id
    thumb_path = THUMBNAILS_DIR / f"{clean_id}.jpg"

    if thumb_path.exists() and thumb_path.stat().st_size > 500:
        return FileResponse(
            thumb_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"}
        )

    try:
        source_path = _get_frame_path(frame_id)
        if not source_path.exists():
            raise HTTPException(status_code=404, detail="Frame not found")

        with Image.open(source_path) as im:
            im = im.convert("RGB")
            im.thumbnail((384, 216), Image.Resampling.LANCZOS)
            im.save(thumb_path, format="JPEG", quality=80, optimize=True)

        return FileResponse(
            thumb_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"}
        )
    except Exception as e:
        try:
            return FileResponse(_get_frame_path(frame_id), media_type="image/png")
        except Exception:
            raise HTTPException(status_code=404, detail=f"Failed to generate thumbnail: {e}")


@router.post("/api/frames/{frame_id}/reprocess")
async def reprocess_frame(frame_id: str, background_tasks: BackgroundTasks, model_target: Optional[str] = Query(None), payload: Optional[ReprocessRequest] = None):
    if frame_id not in state.captured_frames:
        raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    finfo = state.captured_frames[frame_id]
    ipath = _get_frame_path(frame_id, finfo.get("filename"))
    mt = normalize_model_target((payload.model_target if payload and payload.model_target else None) or model_target)
    state.captured_frames[frame_id]["status"] = "queued"
    state.save_persisted_state()
    background_tasks.add_task(process_frame_with_target, frame_id, ipath, finfo.get("top_line", 0), finfo.get("bottom_line", 0), mt)
    return {"status": "success", "message": f"Reprocessing scheduled for frame {frame_id} with {mt}", "model_target": mt}

@router.post("/api/reprocess-failed")
async def reprocess_failed(background_tasks: BackgroundTasks, model_target: Optional[str] = Query(None), payload: Optional[ReprocessRequest] = None):
    mt = normalize_model_target((payload.model_target if payload and payload.model_target else None) or model_target)
    reprocessed = []
    for f_id, f_info in state.captured_frames.items():
        if f_info.get("status", "").startswith("error") or f_info.get("extracted_line_count", 0) == 0:
            try:
                ipath = _get_frame_path(f_id, f_info.get("filename"))
                f_info["status"] = "queued"
                background_tasks.add_task(process_frame_with_target, f_id, ipath, f_info.get("top_line", 0), f_info.get("bottom_line", 0), mt)
                reprocessed.append(f_id)
            except Exception: pass
    state.save_persisted_state()
    return {"status": "success", "reprocessed_frames": reprocessed, "count": len(reprocessed), "model_target": mt}

@router.get("/api/document")
async def get_document():
    return _doc_payload()

@router.post("/api/lines/{line_number}/edit")
async def edit_line(line_number: int, req: LineEditRequest):
    if line_number not in state.document_lines:
        state.document_lines[line_number] = {
            "line_number": line_number, "gutter_number": line_number, "text": req.text,
            "is_blank": not bool(req.text.strip()), "is_wrapped": False, "wrapped_line_count": 1,
            "status": req.status or "manually_edited", "frame_id": "manual", "sources": ["manual"],
            "confidence": 1.0, "notes": req.notes or "Manually inserted", "updated_at": datetime.now().isoformat()
        }
    else:
        existing = state.document_lines.get(line_number)
        meta = getattr(existing, "meta", {}).copy() if (existing and hasattr(existing, "meta")) else (dict(existing) if isinstance(existing, dict) else {})
        meta["status"] = req.status or "manually_edited"
        if req.notes: meta["notes"] = req.notes
        meta["updated_at"] = datetime.now().isoformat()
        state.document_lines[line_number] = state.MasterLine(req.text, **meta)
    state.save_persisted_state()
    lv = state.document_lines[line_number]
    return {"status": "success", "line": lv.to_dict() if hasattr(lv, "to_dict") else lv}

@router.delete("/api/lines/{line_number}")
async def delete_line(line_number: int):
    if line_number not in state.document_lines:
        raise HTTPException(status_code=404, detail=f"Line {line_number} not found")
    del state.document_lines[line_number]
    pid = state.get_current_project_id()
    if pid:
        db.delete_document_line(pid, line_number)
    state.save_persisted_state()
    await state.ws_manager.broadcast({"type": "line_deleted", "line_number": line_number})
    await state.ws_manager.broadcast({"type": "document_updated", "data": _doc_payload()})
    return {"status": "success", "deleted_line": line_number}

@router.post("/api/lines/batch-delete")
async def batch_delete_lines(req: Dict[str, Any]):
    line_numbers = req.get("line_numbers", [])
    if not isinstance(line_numbers, list):
        raise HTTPException(status_code=400, detail="line_numbers must be a list")
    deleted = []
    pid = state.get_current_project_id()
    for ln in line_numbers:
        try:
            ln_int = int(ln)
            if ln_int in state.document_lines:
                del state.document_lines[ln_int]
                deleted.append(ln_int)
        except (ValueError, TypeError):
            continue
    if deleted:
        if pid:
            if not state.document_lines:
                db.clear_document_lines(pid)
            else:
                db.delete_document_lines(pid, deleted)
        state.save_persisted_state()
        await state.ws_manager.broadcast({"type": "lines_deleted", "line_numbers": deleted})
        await state.ws_manager.broadcast({"type": "document_updated", "data": _doc_payload()})
    return {"status": "success", "deleted_count": len(deleted), "deleted_lines": deleted}

@router.post("/api/lines/clear")
async def clear_all_lines():
    count = len(state.document_lines)
    pid = state.get_current_project_id()
    state.document_lines.clear()
    if pid:
        db.clear_document_lines(pid)
    state.save_persisted_state()
    await state.ws_manager.broadcast({"type": "document_updated", "data": _doc_payload()})
    return {"status": "success", "cleared_count": count}

@router.post("/api/lines/{line_number}/flag")
async def flag_line(line_number: int, req: FlagRequest):
    if line_number not in state.document_lines:
        raise HTTPException(status_code=404, detail="Line not found")
    state.document_lines[line_number].update({"status": "flagged", "notes": req.notes, "updated_at": datetime.now().isoformat()})
    state.save_persisted_state()
    lv = state.document_lines[line_number]
    return {"status": "success", "line": lv.to_dict() if hasattr(lv, "to_dict") else lv}

@router.post("/api/lines/{line_number}/request-recapture")
async def request_recapture(line_number: int, req: RecaptureRequest):
    item = {"line_number": line_number, "reason": req.reason, "requested_at": datetime.now().isoformat()}
    state.recapture_queue.append(item)
    if line_number in state.document_lines:
        state.document_lines[line_number]["status"] = "recapturing"
    state.save_persisted_state()
    return {"status": "queued", "item": item, "queue_size": len(state.recapture_queue)}

@router.get("/api/recapture-queue")
async def get_recapture_queue():
    return state.recapture_queue

@router.post("/api/recapture-completed")
async def recapture_completed(req: RecaptureRequest):
    state.recapture_queue = [q for q in state.recapture_queue if q.get("line_number") != req.line_number]
    state.save_persisted_state()
    return {"status": "success", "remaining": len(state.recapture_queue)}

@router.get("/api/export-json")
async def export_json():
    sl = state.get_serialized_lines()
    payload = {
        "schema_version": "2.5.0", "exported_at": datetime.now().isoformat(),
        "document_metadata": {
            "total_lines": len(state.document_lines),
            "min_line": min(state.document_lines.keys()) if state.document_lines else 0,
            "max_line": max(state.document_lines.keys()) if state.document_lines else 0,
            "total_frames": len(state.captured_frames), "token_stats": state.token_stats,
            "issues_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])
        },
        "frames": state.captured_frames, "lines": sl
    }
    return JSONResponse(content=payload, headers={"Content-Disposition": "attachment; filename=matrix_document_vfs_monaco.json"})

@router.get("/api/export-markdown")
async def export_markdown():
    if not state.document_lines:
        return PlainTextResponse("# Matrix Document\n\n(No lines transcribed yet)")
    min_ln, max_ln = min(state.document_lines.keys()), max(state.document_lines.keys())
    assembled = []
    for ln in range(min_ln, max_ln + 1):
        if ln in state.document_lines:
            line_val = state.document_lines[ln]
            if hasattr(line_val, "get") and line_val.get("status") == "missing" and not str(line_val).strip():
                assembled.append(f"// [MISSING LINE {ln}]")
            else:
                assembled.append(str(line_val))
        else:
            assembled.append(f"// [MISSING LINE {ln}]")
    return PlainTextResponse("\n".join(assembled), headers={"Content-Disposition": "attachment; filename=Matrix_main_transcribed.md"})

@router.get("/api/spliced-document-image")
async def get_spliced_document_image():
    valid = []
    for f in db.get_frames(state.get_current_project_id()):
        try: valid.append((f, _get_frame_path(f.get("frame_id"), f.get("filename"))))
        except Exception: pass
    if not valid:
        buf = io.BytesIO()
        Image.new("RGB", (1920, 300), color=(13, 17, 23)).save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")

    slices, prev_b, max_w, tot_h = [], 0, 0, 0
    for idx, (fmeta, ipath) in enumerate(valid):
        try:
            img = Image.open(ipath).convert("RGB")
            w, h = img.size
            max_w = max(max_w, w)
            top_l, bot_l = fmeta.get("top_line", 0) or 0, fmeta.get("bottom_line", 0) or 0
            lcount = bot_l - top_l + 1 if bot_l >= top_l and top_l > 0 else 0
            crop_t = 0
            if idx > 0 and prev_b > 0 and 0 < top_l <= prev_b:
                ol = prev_b - top_l + 1
                crop_t = min(int(ol * (h / max(lcount, 1) if lcount > 0 else 32.0)), h - 100)
            crop_t = max(0, min(crop_t + int(fmeta.get("custom_offset_y", 0.0) or 0), h - 50))
            sl = img.crop((0, crop_t, w, h)) if crop_t > 0 else img
            slices.append(sl)
            tot_h += sl.height
            if bot_l > 0: prev_b = bot_l
        except Exception: pass

    if not slices: raise HTTPException(status_code=404, detail="No valid frame images to splice")
    canvas, cur_y = Image.new("RGB", (max_w, tot_h), color=(13, 17, 23)), 0
    for sl in slices:
        canvas.paste(sl, (0, cur_y))
        cur_y += sl.height
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Content-Disposition": "inline; filename=spliced_document.png"})

@router.get("/api/frames/page-report")
@router.get("/api/document/page-report")
async def get_page_report():
    if not state.captured_frames:
        state.load_persisted_state()
    pid = state.get_current_project_id()
    frames = db.get_frames(pid)
    if not frames:
        frames = sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0), x.get("created_at", "")))
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines_report = [
        "# Matrix Capture - Page Line Numbers & Coverage Report",
        f"Generated: {now_str}",
        f"Total Captured Frames: {len(frames)}",
        f"Total Verified Lines: {len(state.document_lines)}",
        "",
        "## Sequential Page Breakdown"
    ]

    gaps = []
    prev_bottom = None
    prev_page = None
    prev_top = None
    prev_bot = None

    for idx, f in enumerate(frames):
        p_num = f.get("page_index", idx + 1)
        top = f.get("top_line", 0)
        bot = f.get("bottom_line", 0)
        span = (bot - top + 1) if (bot >= top and top > 0) else 0

        flags = []
        if prev_bottom is not None:
            if top == prev_top and bot == prev_bot:
                flags.append("⚠️ DUPLICATE CAPTURE (Identical line range as previous page)")
            elif top > prev_bottom + 1:
                gap_start = prev_bottom + 1
                gap_end = top - 1
                gap_count = gap_end - gap_start + 1
                flags.append(f"⚠️ GAP: Missing Ln {gap_start} → {gap_end} ({gap_count} lines missing)")
                gaps.append({"prev_page": prev_page, "page": p_num, "from_line": gap_start, "to_line": gap_end, "count": gap_count})
            elif top <= prev_bottom and top > 0:
                overlap_count = prev_bottom - top + 1
                flags.append(f"ℹ️ Overlap with Pg {prev_page}: Ln {top} → {prev_bottom} ({overlap_count} lines)")

        arr_cnt = f.get("arrow_count", 0)
        arr_str = f", {arr_cnt} down-arrows" if (p_num > 1 or arr_cnt > 0) else ""
        flag_str = f" [{' | '.join(flags)}]" if flags else ""
        lines_report.append(f"- Page {p_num:2d}: Ln {top:4d} → {bot:4d} ({span:2d} lines{arr_str}){flag_str}")

        prev_top = top
        prev_bot = bot
        prev_bottom = bot
        prev_page = p_num

    lines_report.append("")
    lines_report.append("## Gaps & Missing Lines Summary")
    if not gaps:
        lines_report.append("✔ No line gaps detected between consecutive captured pages.")
    else:
        for idx, g in enumerate(gaps, 1):
            lines_report.append(f"{idx}. Gap between Page {g['prev_page']} and Page {g['page']}: Missing Ln {g['from_line']} → {g['to_line']} ({g['count']} lines missing)")

    report_text = "\n".join(lines_report)
    return PlainTextResponse(report_text, headers={"Content-Type": "text/markdown; charset=utf-8"})


@router.get("/api/document/verified-lines-report")
async def get_verified_lines_report():
    if not state.document_lines:
        state.load_persisted_state()
    pid = state.get_current_project_id()
    frames = db.get_frames(pid)
    if not frames:
        frames = sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0), x.get("created_at", "")))
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    doc_lines = state.document_lines
    sorted_line_keys = sorted([int(k) for k in doc_lines.keys() if int(k) > 0])
    min_ln = sorted_line_keys[0] if sorted_line_keys else 0
    max_ln = sorted_line_keys[-1] if sorted_line_keys else 0
    total_chars = sum(len(str(getattr(v, "text", "") if hasattr(v, "text") else (v.get("text", "") if isinstance(v, dict) else str(v)))) for v in doc_lines.values())

    report_lines = [
        "# Matrix OCR - Verified Lines & Precision Diagnostics Report",
        f"Generated: {now_str}",
        f"Active Project: {pid or 'Default'}",
        f"Total Master Lines: {len(doc_lines)} (Ln {min_ln} → {max_ln})",
        f"Total Extracted Characters: {total_chars:,}",
        f"Total Physical Frames: {len(frames)}",
        "",
        "## Per-Page OCR Extraction Breakdown",
        "| Page | Viewport Range | Expected | OCR Extracted Lines | Extracted Count | Completeness | Engine / Model | Status |",
        "|---|---|---|---|---|---|---|---|"
    ]

    all_missing = []
    for idx, f in enumerate(frames):
        p_num = f.get("page_index", idx + 1)
        top = f.get("top_line", 0)
        bot = f.get("bottom_line", 0)
        expected_span = (bot - top + 1) if (bot >= top and top > 0) else 0

        # Lines present in doc_lines belonging to this viewport range
        page_doc_lines = [ln for ln in sorted_line_keys if top <= ln <= bot]
        extracted_cnt = len(page_doc_lines)
        pct = round((extracted_cnt / max(1, expected_span)) * 100, 1) if expected_span > 0 else 0.0

        ocr_min = min(page_doc_lines) if page_doc_lines else "-"
        ocr_max = max(page_doc_lines) if page_doc_lines else "-"
        ocr_range_str = f"Ln {ocr_min} → {ocr_max}" if page_doc_lines else "None"

        # Check for missing lines in this page's expected range
        missing_on_page = [ln for ln in range(top, bot + 1) if ln not in doc_lines] if top > 0 and bot >= top else []
        if missing_on_page:
            all_missing.extend(missing_on_page)

        status_flag = "✔ 100%" if pct >= 100 else (f"⚠️ {pct}%" if pct > 0 else "❌ 0%")
        model_name = f.get("model_used") or "MiniCPM-V (Ollama)"

        report_lines.append(
            f"| Page {p_num:2d} | Ln {top:4d} → {bot:4d} | {expected_span:2d} lines | {ocr_range_str} | {extracted_cnt:2d} lines | {pct:5.1f}% | {model_name} | {status_flag} |"
        )

    report_lines.append("")
    report_lines.append("## Unverified / Missing Line Diagnostics")
    if not all_missing:
        report_lines.append("✔ Zero missing lines! All lines within physical viewport boundaries have been extracted and verified.")
    else:
        missing_ranges = []
        cur_start = None
        cur_prev = None
        for ln in sorted(set(all_missing)):
            if cur_start is None:
                cur_start = ln
                cur_prev = ln
            elif ln == cur_prev + 1:
                cur_prev = ln
            else:
                missing_ranges.append((cur_start, cur_prev))
                cur_start = ln
                cur_prev = ln
        if cur_start is not None:
            missing_ranges.append((cur_start, cur_prev))

        for s, e in missing_ranges:
            if s == e:
                report_lines.append(f"- Missing Line {s}")
            else:
                report_lines.append(f"- Missing Lines {s} → {e} ({e - s + 1} lines)")

    report_lines.append("")
    report_lines.append("## Line Fidelity & Verbatim Sampling")
    sample_indices = sorted_line_keys[:5]
    if len(sorted_line_keys) > 10:
        sample_indices += sorted_line_keys[len(sorted_line_keys)//2 : len(sorted_line_keys)//2 + 3]
        sample_indices += sorted_line_keys[-3:]
    sample_indices = sorted(list(set(sample_indices)))

    for ln in sample_indices:
        entry = doc_lines[ln]
        txt = getattr(entry, "text", "") if hasattr(entry, "text") else (entry.get("text", "") if isinstance(entry, dict) else str(entry))
        report_lines.append(f"- Ln {ln:4d}: `{txt}`")

    report_text = "\n".join(report_lines)
    return PlainTextResponse(report_text, headers={"Content-Type": "text/markdown; charset=utf-8"})

