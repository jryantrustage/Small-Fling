import asyncio, base64, functools, hashlib, io, json, os, re, threading
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

def _get_unique_frame_dirs() -> List[Path]:
    out = []
    seen = set()
    for d in (state.FRAMES_DIR, db.FRAMES_DIR, config.FRAMES_DIR):
        if not d:
            continue
        try:
            rk = str(Path(d).resolve()).lower()
            if rk not in seen and Path(d).exists():
                seen.add(rk)
                out.append(Path(d))
        except Exception:
            pass
    return out

def _get_frame_path(frame_id: str, filename: Optional[str] = None) -> Path:
    search_dirs = _get_unique_frame_dirs()

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

    ed_top = max(280, int(round(280 * (img_h / 1080.0))))
    ed_bot = min(int(round(960 * (img_h / 1080.0))), img_h - 120)
    def _is_valid_entry(cand_lines, cand_bboxes):
        if not cand_lines or not cand_bboxes:
            return False
        if not all(l.get("position_verified") is True and l.get("row_slice_text") is not None for l in cand_lines):
            return False
        g_boxes = cand_bboxes.get("gutter_boxes", {})
        if not g_boxes:
            return False
        first_ln = min((int(k) for k in g_boxes.keys()), default=0)
        first_y = (g_boxes.get(first_ln) or g_boxes.get(str(first_ln)) or {}).get("y", 0)
        if first_y < (ed_top - 35):
            return False
        last_ln = max((int(k) for k in g_boxes.keys()), default=0)
        last_y = (g_boxes.get(last_ln) or g_boxes.get(str(last_ln)) or {}).get("y", 0)
        if last_y > (ed_bot + 25):
            return False
        return True

    cached_frame = state.captured_frames.get(target_id)
    if cached_frame and not force_rescan and cached_frame.get("lines"):
        cb = cached_frame.get("bounding_boxes")
        if not isinstance(cb, dict) or not cb.get("gutter_boxes"):
            g_boxes = {}
            l_boxes = {}
            scale_y = img_h / 1080.0
            scale_x = img_w / 1920.0
            for idx, l_obj in enumerate(cached_frame["lines"]):
                ln_n = int(l_obj.get("line_number") or (idx + 1))
                yc = int(round((296.0 + idx * 27.0) * scale_y))
                hh = max(10, int(round(11.5 * scale_y)))
                g_boxes[str(ln_n)] = {"x": int(round(32 * scale_x)), "y": yc - hh, "width": int(round(52 * scale_x)), "height": hh * 2, "line_number": ln_n}
                l_boxes[str(ln_n)] = {"x": int(round(94 * scale_x)), "y": yc - hh, "width": int(round((1920 - 118) * scale_x)), "height": hh * 2, "line_number": ln_n}
            synthesized_cb = dict(cb) if isinstance(cb, dict) else {}
            synthesized_cb["gutter_boxes"] = g_boxes
            synthesized_cb["line_boxes"] = l_boxes
            cached_frame["bounding_boxes"] = synthesized_cb
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

    from ocr_engine import verify_and_repair_ocr_line_positions
    ver_report: Dict[str, Any] = {}

    if can_use_cache:
        if cache_key in _ocr_inspect_cache and _is_valid_entry(_ocr_inspect_cache[cache_key].get("lines"), _ocr_inspect_cache[cache_key].get("bboxes")):
            entry = _ocr_inspect_cache[cache_key]
            lines = entry["lines"]
            bboxes = entry["bboxes"]
            model_used = entry["model_used"]
            extracted_text = entry["extracted_text"]
            top_ln = entry["top_ln"]
            bot_ln = entry["bot_ln"]
            img_w = entry["img_w"]
            img_h = entry["img_h"]
            ver_report = entry.get("line_position_verification") or {}
        elif cached_frame and _is_valid_entry(cached_frame.get("lines"), cached_frame.get("bounding_boxes")):
            lines = cached_frame.get("lines", [])
            bboxes = cached_frame.get("bounding_boxes", {})
            model_used = cached_frame.get("model_used", "MiniCPM-V (Ollama)")
            extracted_text = "\n".join(f"{l.get('line_number', 0):>3}: {l.get('text', '')}" for l in lines)
            top_ln = cached_frame.get("top_line", min((l.get("line_number", 0) for l in lines), default=0))
            bot_ln = cached_frame.get("bottom_line", max((l.get("line_number", 0) for l in lines), default=0))
            ver_report = cached_frame.get("line_position_verification") or {}
        else:
            lines = n4_state.get("lines", [])
            bboxes = n4_state.get("bounding_boxes", {})
            model_used = n4_state.get("model_used", "MiniCPM-V (Ollama)")
            extracted_text = n4_state.get("extracted_text", "")
            top_ln = min((l.get("line_number", 0) for l in lines), default=0)
            bot_ln = max((l.get("line_number", 0) for l in lines), default=0)
            ver_report = n4_state.get("line_position_verification") or {}
        if not ver_report:
            ver_report = verify_and_repair_ocr_line_positions(lines, None, bboxes)
            lines = ver_report.get("lines", lines)
            bboxes = ver_report.get("bounding_boxes", bboxes)
    else:
        exp_top = cached_frame.get("top_line") if cached_frame else None
        res = await ocr_svc.scan_image_with_minicpm(ipath, expected_top=exp_top, live_capture=False)
        lines = res.get("lines", [])
        bboxes = res.get("bounding_boxes", {})
        model_used = res.get("model_used", "MiniCPM-V (Ollama)")
        extracted_text = res.get("extracted_text", "")
        top_ln = res.get("top_line", 0)
        bot_ln = res.get("bottom_line", 0)
        img_w = res.get("image_width", img_w)
        img_h = res.get("image_height", img_h)
        ver_report = res.get("line_position_verification") or verify_and_repair_ocr_line_positions(lines, None, bboxes)
        lines = ver_report.get("lines", lines)
        bboxes = ver_report.get("bounding_boxes", bboxes)
        extracted_text = "\n".join(f"{l.get('line_number', 0):>3}: {l.get('text', '')}" for l in lines)

        _ocr_inspect_cache[cache_key] = {
            "lines": lines,
            "bboxes": bboxes,
            "model_used": model_used,
            "extracted_text": extracted_text,
            "top_ln": top_ln,
            "bot_ln": bot_ln,
            "img_w": img_w,
            "img_h": img_h,
            "line_position_verification": ver_report
        }

        if cached_frame:
            cached_frame.update({
                "lines": lines,
                "bounding_boxes": bboxes,
                "model_used": model_used,
                "extracted_line_count": len(lines),
                "line_position_verification": ver_report
            })
        if hasattr(state, "document_lines"):
            for l_item in lines:
                ln_num = l_item.get("line_number")
                if not ln_num:
                    continue
                blank_locked = bool(l_item.get("blank_locked", False))
                final_txt = "" if blank_locked else (l_item.get("text") or "").rstrip("\r\n")
                state.document_lines[int(ln_num)] = state.MasterLine(
                    final_txt,
                    line_number=int(ln_num),
                    gutter_number=int(ln_num),
                    is_blank=True if blank_locked else not bool(final_txt.strip()),
                    blank_locked=blank_locked,
                    status="verified",
                    position_verified=True,
                    frame_id=target_id,
                    confidence=1.0 if blank_locked else l_item.get("confidence", 0.99),
                    is_wrapped=False if blank_locked else bool(l_item.get("is_wrapped", False)),
                    wrapped_line_count=1 if blank_locked else int(l_item.get("wrapped_line_count", 1)),
                    updated_at=datetime.now().isoformat()
                )
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
        "line_position_verification": ver_report,
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
    if cached_frame and not force_rescan and cached_frame.get("lines"):
        cb = cached_frame.get("bounding_boxes")
        if not isinstance(cb, dict) or not cb.get("gutter_boxes"):
            g_boxes = {}
            l_boxes = {}
            scale_y = img_h / 1080.0
            scale_x = img_w / 1920.0
            for idx, l_obj in enumerate(cached_frame["lines"]):
                ln_n = int(l_obj.get("line_number") or (idx + 1))
                yc = int(round((296.0 + idx * 27.0) * scale_y))
                hh = max(10, int(round(11.5 * scale_y)))
                g_boxes[str(ln_n)] = {"x": int(round(32 * scale_x)), "y": yc - hh, "width": int(round(52 * scale_x)), "height": hh * 2, "line_number": ln_n}
                l_boxes[str(ln_n)] = {"x": int(round(94 * scale_x)), "y": yc - hh, "width": int(round((1920 - 118) * scale_x)), "height": hh * 2, "line_number": ln_n}
            synthesized_cb = dict(cb) if isinstance(cb, dict) else {}
            synthesized_cb["gutter_boxes"] = g_boxes
            synthesized_cb["line_boxes"] = l_boxes
            cached_frame["bounding_boxes"] = synthesized_cb
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
    from ocr_engine import verify_and_repair_ocr_line_positions
    updated_lines, rescanned = await asyncio.to_thread(
        rescan_lines_on_image_sync,
        ipath,
        line_numbers,
        current_lines,
        current_bboxes
    )
    ver_report = verify_and_repair_ocr_line_positions(updated_lines, None, current_bboxes)
    updated_lines = ver_report.get("lines", updated_lines)
    current_bboxes = ver_report.get("bounding_boxes", current_bboxes)

    updated_text = "\n".join(f"{l.get('line_number', 0):>3}: {l.get('text', '')}" for l in updated_lines)

    if cache_key in _ocr_inspect_cache:
        _ocr_inspect_cache[cache_key]["lines"] = updated_lines
        _ocr_inspect_cache[cache_key]["extracted_text"] = updated_text
        _ocr_inspect_cache[cache_key]["line_position_verification"] = ver_report

    if cached_frame:
        cached_frame["lines"] = updated_lines
        cached_frame["bounding_boxes"] = current_bboxes
        cached_frame["line_position_verification"] = ver_report
        state.save_persisted_state()

    for ln in rescanned:
        line_item = next((l for l in updated_lines if l.get("line_number") == ln), None)
        if line_item and hasattr(state, "document_lines"):
            blank_locked = bool(line_item.get("blank_locked", False))
            final_txt = "" if blank_locked else line_item.get("text", "")
            existing = state.document_lines.get(ln)
            meta = getattr(existing, "meta", {}).copy() if (existing and hasattr(existing, "meta")) else (dict(existing) if isinstance(existing, dict) else {})
            meta.update({
                "line_number": ln,
                "gutter_number": ln,
                "is_blank": True if blank_locked else not bool(final_txt.strip()),
                "blank_locked": blank_locked,
                "status": "verified",
                "overwritten": True,
                "frame_id": target_id,
                "updated_at": datetime.now().isoformat()
            })
            if line_item.get("confidence") is not None:
                meta["confidence"] = 1.0 if blank_locked else line_item.get("confidence")
            if line_item.get("is_wrapped") is not None:
                meta["is_wrapped"] = False if blank_locked else line_item.get("is_wrapped")
            if line_item.get("wrapped_line_count") is not None:
                meta["wrapped_line_count"] = 1 if blank_locked else line_item.get("wrapped_line_count")
            state.document_lines[ln] = state.MasterLine(
                final_txt,
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
        "bounding_boxes": current_bboxes,
        "line_position_verification": ver_report
    }

@router.get("/api/ocr/rescan-all-frames")
@router.post("/api/ocr/rescan-all-frames")
async def rescan_all_frames_endpoint(
    background_tasks: BackgroundTasks,
    req: Optional[Dict[str, Any]] = None,
    wait: bool = Query(False)
):
    """
    Selectively rescans every captured frame from top to bottom in sequential order,
    re-aligning duplicate and misaligned line numbers into the master document.
    """
    if getattr(state, "is_sequential_rescan_running", False):
        return {
            "status": "already_running",
            "message": "Sequential frame rescan is already in progress",
            "progress": state.sequential_rescan_progress
        }

    project_id = (req.get("project_id") if req else None) or state.get_current_project_id()
    frame_ids = req.get("frame_ids") if req else None
    clear_existing = bool(req.get("clear_existing", False) if req else False)

    from services.ocr_service import sequential_rescan_all_frames_task

    if wait:
        res = await sequential_rescan_all_frames_task(
            project_id=project_id,
            frame_ids=frame_ids,
            clear_existing=clear_existing
        )
        return res
    else:
        background_tasks.add_task(
            sequential_rescan_all_frames_task,
            project_id,
            frame_ids,
            clear_existing
        )
        return {
            "status": "started",
            "message": "Sequential rescan started in background",
            "total_frames": len(state.captured_frames)
        }

@router.get("/api/ocr/rescan-all-frames/status")
async def rescan_all_frames_status_endpoint():
    """Returns the current running status and progress of sequential frame rescan."""
    return {
        "status": "success",
        "is_running": getattr(state, "is_sequential_rescan_running", False),
        "progress": getattr(state, "sequential_rescan_progress", {})
    }

@router.post("/api/ocr/cancel-rescan-all-frames")
async def cancel_rescan_all_frames_endpoint():
    """Requests early cancellation of the active sequential frame rescan."""
    state.cancel_sequential_rescan = True
    return {
        "status": "cancelled",
        "message": "Sequential rescan cancellation requested"
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

def _doc_summary_payload() -> Dict[str, Any]:
    """Lightweight document metrics summary without serializing full lines array."""
    if not getattr(state, "_state_initialized", False):
        state.load_persisted_state()
    total_count = len(state.document_lines)
    min_line = min(state.document_lines.keys()) if state.document_lines else 0
    max_line = max(state.document_lines.keys()) if state.document_lines else 0
    issues_count = sum(1 for ln in state.document_lines.values() if hasattr(ln, "get") and ln.get("status") in ["flagged", "missing", "gap", "overlap_conflict", "issue", "unaligned"])
    return {
        "total_lines": total_count,
        "verified_lines_count": total_count,
        "min_line": min_line,
        "max_line": max_line,
        "total_frames": len(state.captured_frames),
        "issue_count": issues_count,
        "token_stats": state.token_stats,
        "latest_telemetry": state.get_fresh_telemetry(),
        "lines": []
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
        res = await ocr_svc.scan_image_with_minicpm(ipath, expected_top=exp_top, live_capture=False)
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
        final_top = top_ln if top_ln > 0 else (orig_top if orig_top > 0 else 1)
        final_bot = bot_ln if bot_ln > 0 else (orig_bot if orig_bot > 0 else (final_top + len(lines) - 1 if lines else final_top + 23))

        finfo.update({
            "top_line": final_top,
            "bottom_line": final_bot,
            "ocr_top_line": top_ln,
            "ocr_bottom_line": bot_ln,
            "extracted_line_count": len(lines),
            "ocr_extracted_count": len(lines),
            "status": "processed",
            "model_used": res.get("model_used", f"MiniCPM-V ({mt})"),
            "bounding_boxes": res.get("bounding_boxes", {}),
            "lines": lines,
        })
        new_lns = {int(item["line_number"]) for item in lines if item.get("line_number")}
        stale_lns = [
            ln for ln, entry in list(state.document_lines.items())
            if ((entry.get("frame_id") if isinstance(entry, dict) else getattr(entry, "meta", {}).get("frame_id")) == frame_id)
            and ln not in new_lns
        ]
        pid = finfo.get("project_id") or state.get_current_project_id()
        for sln in stale_lns:
            state.document_lines.pop(sln, None)
            if pid:
                try:
                    db.delete_document_lines_range(pid, sln, sln)
                except Exception:
                    pass
        lead_wrap = str(res.get("leading_wrapped_continuation") or "")
        if lead_wrap and final_top > 1:
            state.append_wrapped_continuation_line(
                line_number=final_top - 1,
                frame_id=f"{frame_id}__lead",
                chunk_text=lead_wrap,
                page_index=finfo.get("page_index"),
                is_root_chunk=False,
                notes=f"Local MiniCPM-V OCR ({mt}) • Leading Wrapped Continuation",
            )
        for item in lines:
            if item.get("line_number"):
                ln = int(item["line_number"])
                blank_locked = bool(item.get("blank_locked", False))
                final_txt = "" if blank_locked else item.get("text", "")
                if not blank_locked and item.get("is_wrapped_continuation"):
                    state.append_wrapped_continuation_line(
                        line_number=ln,
                        frame_id=frame_id,
                        chunk_text=final_txt,
                        page_index=finfo.get("page_index"),
                        is_root_chunk=False,
                        notes=f"Local MiniCPM-V OCR ({mt}) • Wrapped Continuation",
                    )
                elif not blank_locked and item.get("is_wrapped"):
                    state.append_wrapped_continuation_line(
                        line_number=ln,
                        frame_id=frame_id,
                        chunk_text=final_txt,
                        page_index=finfo.get("page_index"),
                        is_root_chunk=True,
                        wrapped_line_count=item.get("wrapped_line_count", 1),
                        notes=f"Local MiniCPM-V OCR ({mt})",
                    )
                else:
                    state.document_lines[ln] = {
                        "line_number": ln, "gutter_number": ln, "text": final_txt,
                        "is_blank": True if blank_locked else item.get("is_blank", not bool(final_txt.strip())),
                        "blank_locked": blank_locked,
                        "is_wrapped": False if blank_locked else item.get("is_wrapped", False),
                        "wrapped_line_count": 1 if blank_locked else item.get("wrapped_line_count", 1),
                        "status": "verified",
                        "frame_id": frame_id, "sources": [frame_id],
                        "confidence": 1.0 if blank_locked else item.get("confidence", 0.98),
                        "notes": f"Local MiniCPM-V OCR ({mt})", "updated_at": datetime.now().isoformat()
                    }
        state.sync_resume_frontier_state()
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
async def delete_frame(frame_id: str, auto_retake: bool = False):
    pid = state.get_current_project_id()
    clean_id = frame_id[:-4] if frame_id.endswith(".png") else frame_id
    frame_meta = (
        state.captured_frames.get(frame_id)
        or state.captured_frames.get(clean_id)
        or {"frame_id": clean_id}
    )

    deleted_from_db = False
    try:
        deleted_from_db = db.delete_frame(frame_id) or db.delete_frame(clean_id)
    except Exception as dbe:
        print(f"[delete_frame] db.delete_frame error: {dbe}")

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

    recovery_info = await state.recover_state_after_frame_deletion([dict(frame_meta)], project_id=pid)

    remaining_frames = db.get_frames(pid) if pid else []
    await state.ws_manager.broadcast({
        "type": "frame_deleted",
        "frame_id": frame_id,
        "frames": remaining_frames,
        "recovery": recovery_info,
    })
    await state.ws_manager.broadcast({
        "type": "document_updated",
        "data": _doc_payload()
    })

    if auto_retake and not getattr(state, "capture_loop_running", False):
        try:
            from routers.dag_helpers import start_capture_loop_background
            await start_capture_loop_background(
                project_id=pid,
                fast_loop=True,
                auto_resume=True,
                resume_top_line=recovery_info.get("next_expected_top_line"),
            )
        except Exception as r_err:
            print(f"[delete_frame] auto_retake start note: {r_err}")

    return {
        "status": "success",
        "frame_id": frame_id,
        "deleted_from_db": deleted_from_db,
        "deleted_from_mem": deleted_from_mem,
        "recovery": recovery_info,
    }

@router.post("/api/frames/{frame_id}/delete")
async def delete_frame_post(frame_id: str, auto_retake: bool = False):
    return await delete_frame(frame_id, auto_retake=auto_retake)

@router.post("/api/frames/batch-delete")
async def batch_delete_frames(req: Dict[str, Any]):
    frame_ids = req.get("frame_ids", [])
    if not isinstance(frame_ids, list):
        raise HTTPException(status_code=400, detail="frame_ids must be a list")
    pid = state.get_current_project_id()
    deleted = []
    deleted_metas = []
    for fid in frame_ids:
        sfid = str(fid)
        clean_id = sfid[:-4] if sfid.endswith(".png") else sfid
        f_meta = (
            state.captured_frames.get(sfid)
            or state.captured_frames.get(clean_id)
            or {"frame_id": clean_id}
        )
        deleted_metas.append(dict(f_meta))
        try:
            db.delete_frame(sfid)
            db.delete_frame(clean_id)
        except Exception:
            pass

        if sfid in state.captured_frames: state.captured_frames.pop(sfid, None)
        if clean_id in state.captured_frames: state.captured_frames.pop(clean_id, None)

        for p in [state.FRAMES_DIR / f"{sfid}.png", state.FRAMES_DIR / f"{clean_id}.png", state.FRAMES_DIR / sfid]:
            if p.exists() and p.is_file():
                try: p.unlink(missing_ok=True)
                except Exception: pass

        deleted.append(sfid)

    recovery_info = await state.recover_state_after_frame_deletion(deleted_metas, project_id=pid)
    remaining_frames = db.get_frames(pid) if pid else []
    await state.ws_manager.broadcast({
        "type": "frame_deleted",
        "frame_ids": deleted,
        "frames": remaining_frames,
        "recovery": recovery_info,
    })
    await state.ws_manager.broadcast({
        "type": "document_updated",
        "data": _doc_payload()
    })
    return {
        "status": "success",
        "deleted_count": len(deleted),
        "deleted_frames": deleted,
        "recovery": recovery_info,
    }


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

    try:
        if THUMBNAILS_DIR.exists():
            for tf in THUMBNAILS_DIR.glob("*"):
                if tf.is_file() and tf.name != ".gitkeep":
                    try:
                        tf.unlink(missing_ok=True)
                    except Exception:
                        pass
        _get_cached_thumbnail_bytes.cache_clear()
    except Exception:
        pass

    pid = state.get_current_project_id()
    if pid: db.clear_project_data(pid)
    state.captured_frames.clear()
    state.document_lines.clear()
    state.save_persisted_state()

    await state.ws_manager.broadcast({"type": "frames_purged", "purged_count": purged_files, "frames": []})
    await state.ws_manager.broadcast({"type": "document_updated", "data": {"total_lines": 0, "min_line": 0, "max_line": 0, "total_frames": 0, "issue_count": 0, "token_stats": state.token_stats, "lines": []}})
    return {"status": "success", "purged_count": purged_files, "message": f"Successfully purged {purged_files} frame images."}

@router.get("/api/frames")
async def get_frames(include_boxes: bool = Query(False, description="Include full bounding_boxes JSON per frame")):
    pid = state.get_current_project_id()
    db_frames = db.get_frames(pid, include_boxes=include_boxes) if pid else []
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
    if not include_boxes:
        return [
            {k: v for k, v in f.items() if k not in ("bounding_boxes", "bounding_boxes_json", "token_usage_json")}
            for f in state.captured_frames.values()
        ]
    return list(state.captured_frames.values())

@router.get("/api/frames/{frame_id}/image")
async def get_frame_image(frame_id: str):
    return FileResponse(_get_frame_path(frame_id), media_type="image/png", headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0"})

THUMBNAILS_DIR = Path(__file__).parent.parent / "data" / "thumbnails"

_THUMB_FORMAT_MAP: Dict[str, tuple] = {
    "webp": ("WEBP", "image/webp", "webp"),
    "jpeg": ("JPEG", "image/jpeg", "jpeg"),
    "jpg": ("JPEG", "image/jpeg", "jpg"),
    "png": ("PNG", "image/png", "png"),
}


def _atomic_write_thumbnail(thumb_path: Path, data: bytes, ext: str) -> None:
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = THUMBNAILS_DIR / f".{thumb_path.stem}_{os.getpid()}_{threading.get_ident()}.tmp.{ext}"
    try:
        tmp_path.write_bytes(data)
        os.replace(tmp_path, thumb_path)
    except Exception:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        try:
            thumb_path.write_bytes(data)
        except Exception:
            pass


@functools.lru_cache(maxsize=512)
def _get_cached_thumbnail_bytes(
    clean_id: str,
    w: int,
    h: int,
    q: int,
    norm_fmt: str,
) -> bytes:
    """
    In-memory LRU byte cache (maxsize=512) for JIT-generated frame thumbnails.
    Checks server/data/thumbnails/{clean_id}_{w}x{h}.{fmt} first; if missing or empty,
    opens the source PNG via Pillow, resizes using Image.Resampling.LANCZOS, and saves
    atomically to disk.
    """
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    pil_fmt, _, ext = _THUMB_FORMAT_MAP.get(norm_fmt, ("WEBP", "image/webp", "webp"))
    thumb_path = THUMBNAILS_DIR / f"{clean_id}_{w}x{h}.{ext}"

    if thumb_path.exists():
        try:
            if thumb_path.stat().st_size > 0:
                return thumb_path.read_bytes()
        except Exception:
            pass

    source_path = _get_frame_path(clean_id)
    if not source_path.exists():
        raise FileNotFoundError(f"Frame image '{clean_id}' not found")

    with Image.open(source_path) as im:
        im = im.convert("RGB")
        resized = im.resize((w, h), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        save_kwargs: Dict[str, Any] = {}
        if pil_fmt in ("WEBP", "JPEG"):
            save_kwargs["quality"] = int(max(1, min(100, q)))
        if pil_fmt == "JPEG":
            save_kwargs["optimize"] = True
        elif pil_fmt == "WEBP":
            save_kwargs["method"] = 4
        resized.save(buf, format=pil_fmt, **save_kwargs)
        thumb_bytes = buf.getvalue()

    _atomic_write_thumbnail(thumb_path, thumb_bytes, ext)
    return thumb_bytes


@router.get("/api/frames/{frame_id}/thumbnail")
async def get_frame_thumbnail(
    frame_id: str,
    request: Request,
    w: int = Query(384, ge=16, le=3840, description="Thumbnail width in pixels"),
    h: int = Query(216, ge=16, le=2160, description="Thumbnail height in pixels"),
    q: int = Query(80, ge=1, le=100, description="Thumbnail compression quality (1-100)"),
    fmt: str = Query("webp", description="Thumbnail image format (webp, jpeg, jpg, png)"),
):
    """
    Just-In-Time (JIT) Thumbnail Generation & Caching Endpoint:
    Accepts ?w=384&h=216&q=80&fmt=webp, checks server/data/thumbnails/{clean_id}_{w}x{h}.{fmt},
    generates via Pillow Image.Resampling.LANCZOS on miss, caches in functools.lru_cache(maxsize=512)
    and atomically on disk, and returns with ETag and immutable Cache-Control headers.
    Never pre-generates or transmits full-resolution PNGs in list views.
    """
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    raw_clean = frame_id[:-4] if frame_id.lower().endswith(".png") else frame_id
    clean_id = re.sub(r"[^a-zA-Z0-9_.\-]", "_", raw_clean)

    norm_fmt = (fmt or "webp").strip().lower().lstrip(".")
    if norm_fmt not in _THUMB_FORMAT_MAP:
        norm_fmt = "webp"
    _, media_type, ext = _THUMB_FORMAT_MAP[norm_fmt]
    thumb_path = THUMBNAILS_DIR / f"{clean_id}_{w}x{h}.{ext}"

    disk_exists = False
    try:
        disk_exists = thumb_path.exists() and thumb_path.stat().st_size > 0
    except Exception:
        disk_exists = False

    if not disk_exists:
        source_path = _get_frame_path(frame_id)
        if not source_path.exists():
            raise HTTPException(status_code=404, detail="Frame not found")

    try:
        thumb_bytes = await asyncio.to_thread(
            _get_cached_thumbnail_bytes,
            clean_id,
            int(w),
            int(h),
            int(q),
            norm_fmt,
        )
        if not disk_exists and (not thumb_path.exists() or thumb_path.stat().st_size == 0):
            await asyncio.to_thread(_atomic_write_thumbnail, thumb_path, thumb_bytes, ext)
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate JIT thumbnail: {e}")

    etag = f'"{hashlib.md5(thumb_bytes).hexdigest()}"'
    headers = {
        "ETag": etag,
        "Cache-Control": "public, max-age=31536000, immutable",
    }

    if request is not None:
        inm = request.headers.get("if-none-match")
        if inm and (inm.strip() == etag or inm.strip() == etag.strip('"')):
            return Response(status_code=304, headers=headers)

    return Response(
        content=thumb_bytes,
        media_type=media_type,
        headers=headers,
    )


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
async def get_document(summary_only: bool = Query(False, description="Return document metrics without transmitting full lines array")):
    if summary_only:
        return _doc_summary_payload()
    return _doc_payload()

@router.get("/api/document/lines")
async def get_document_lines_endpoint(
    from_line: Optional[int] = Query(None, description="Start line number (inclusive)"),
    to_line: Optional[int] = Query(None, description="End line number (inclusive)"),
    around_line: Optional[int] = Query(None, description="Center window around line number"),
    limit: int = Query(100, ge=1, le=1000, description="Max lines to return in window"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    follow_current: bool = Query(False, description="Auto-track current capture/rescan position"),
    source: str = Query("db", description="Source: 'db' (SQLite) or 'memory' (state.document_lines)")
):
    """
    Asynchronously lazy loads a window of verified lines directly from the local DB.
    Optimized for high-performance rendering: transfers only the requested from_line -> to_line slice.
    """
    pid = state.get_current_project_id()
    if not getattr(state, "_state_initialized", False):
        state.load_persisted_state()

    # If follow_current is requested, determine window from active telemetry
    if follow_current:
        top_ln = state.latest_telemetry.get("current_top_line", 0)
        bot_ln = state.latest_telemetry.get("current_bottom_line", 0)
        if top_ln and top_ln > 0:
            from_line = max(1, top_ln - 15)
            to_line = (bot_ln + 15) if (bot_ln and bot_ln >= top_ln) else (from_line + limit - 1)
        elif state.document_lines:
            max_ln = max(state.document_lines.keys())
            from_line = max(1, max_ln - limit + 1)
            to_line = max_ln

    # If around_line is requested, center the window around it
    if around_line is not None and around_line > 0:
        half = limit // 2
        from_line = max(1, around_line - half)
        to_line = from_line + limit - 1

    # Default window if neither specified
    if from_line is None and to_line is None and not offset:
        if state.document_lines:
            min_l = min(state.document_lines.keys())
            from_line = min_l
            to_line = min_l + limit - 1

    if from_line is not None and to_line is not None and to_line >= from_line:
        limit = max(limit, min(1000, int(to_line) - int(from_line) + 1))

    # Query local SQLite database
    db_res = db.get_document_lines_window(
        project_id=pid,
        from_line=from_line,
        to_line=to_line,
        limit=limit,
        offset=offset
    )

    # In-memory overlay: if state.document_lines has fresher or uncommitted lines in this range, merge them
    lines_map = {l["line_number"]: l for l in db_res.get("lines", [])}
    check_min = from_line or db_res.get("min_line", 0)
    check_max = to_line or db_res.get("max_line", 0)

    if check_min > 0 and check_max >= check_min:
        for ln in range(check_min, check_max + 1):
            if ln in state.document_lines:
                ml = state.document_lines[ln]
                txt = str(ml)
                meta = getattr(ml, "meta", {}) if hasattr(ml, "meta") else (dict(ml) if isinstance(ml, dict) else {})
                lines_map[ln] = {
                    "line_number": ln,
                    "gutter_number": meta.get("gutter_number", ln),
                    "text": txt,
                    "confidence": meta.get("confidence", 1.0),
                    "frame_id": meta.get("frame_id", ""),
                    "status": meta.get("status", "verified"),
                    "is_wrapped": meta.get("is_wrapped", False),
                    "notes": meta.get("notes", ""),
                    "updated_at": meta.get("updated_at", "")
                }

    sorted_lines = [lines_map[k] for k in sorted(lines_map.keys())]

    mem_total = len(state.document_lines)
    mem_min = min(state.document_lines.keys()) if state.document_lines else 0
    mem_max = max(state.document_lines.keys()) if state.document_lines else 0

    return {
        "status": "success",
        "total_lines": max(db_res.get("total_lines", 0), mem_total),
        "min_line": min(db_res.get("min_line", 0), mem_min) if (db_res.get("min_line") and mem_min) else (db_res.get("min_line") or mem_min),
        "max_line": max(db_res.get("max_line", 0), mem_max),
        "from_line": from_line if from_line is not None else (sorted_lines[0]["line_number"] if sorted_lines else 0),
        "to_line": to_line if to_line is not None else (sorted_lines[-1]["line_number"] if sorted_lines else 0),
        "count": len(sorted_lines),
        "lines": sorted_lines
    }


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
    pid = state.get_current_project_id()
    if pid:
        try:
            updated_proj = db.increment_project_download_count(pid, "markdown")
            if updated_proj:
                await state.ws_manager.broadcast({
                    "type": "project_updated",
                    "project": updated_proj,
                    "projects": db.get_projects()
                })
        except Exception:
            pass
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


# ─── GROUND-TRUTH REFERENCE MARKDOWN INGESTION, SCORING & AUTO-HEAL ───────────

@router.post("/api/projects/{project_id}/reference-markdown")
async def upload_project_reference_markdown(
    project_id: str,
    request: Request,
    file_path: Optional[str] = Query(None, description="Local file path to reference .md file"),
    path: Optional[str] = Query(None, description="Alias for local file path to reference .md file"),
):
    """
    Reference Markdown Ingestion Endpoint:
    Accepts a raw .md file upload (multipart/form-data or raw text body) or a local file path
    (JSON body, form field, or query parameter) and stores the reference lines indexed 1..N
    in SQLite table project_reference_lines (project_id, line_number, text_content).
    """
    from services.accuracy_verifier import ingest_reference_markdown

    ct = (request.headers.get("content-type") or "").lower()
    raw_content: Optional[str] = None
    local_path: Optional[str] = file_path or path
    source_name: Optional[str] = None

    if "multipart/form-data" in ct or "application/x-www-form-urlencoded" in ct:
        form = await request.form()
        file_obj = form.get("file") or form.get("markdown_file") or form.get("reference_file")
        if file_obj and hasattr(file_obj, "read"):
            raw_bytes = await file_obj.read()
            raw_content = raw_bytes.decode("utf-8-sig", errors="replace")
            source_name = getattr(file_obj, "filename", None) or "uploaded_reference.md"
        elif isinstance(file_obj, str) and file_obj.strip():
            raw_content = file_obj

        if raw_content is None:
            fp_form = form.get("file_path") or form.get("path") or form.get("local_path")
            if fp_form:
                local_path = str(fp_form).strip()
            else:
                txt_form = form.get("content") or form.get("markdown") or form.get("text")
                if txt_form is not None:
                    raw_content = str(txt_form)
    elif "application/json" in ct:
        try:
            body = await request.json()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {e}")
        if isinstance(body, dict):
            local_path = (
                body.get("file_path")
                or body.get("path")
                or body.get("local_path")
                or local_path
            )
            for k in ("content", "markdown", "text", "markdown_text", "raw_markdown"):
                if body.get(k) is not None:
                    raw_content = str(body[k])
                    break
            source_name = body.get("filename") or body.get("source_name")
        elif isinstance(body, str):
            raw_content = body
    else:
        raw_bytes = await request.body()
        if raw_bytes:
            decoded = raw_bytes.decode("utf-8-sig", errors="replace")
            stripped_dec = decoded.strip()
            if stripped_dec.startswith("{") and stripped_dec.endswith("}"):
                try:
                    parsed_json = json.loads(stripped_dec)
                    if isinstance(parsed_json, dict):
                        local_path = (
                            parsed_json.get("file_path")
                            or parsed_json.get("path")
                            or parsed_json.get("local_path")
                            or local_path
                        )
                        for k in ("content", "markdown", "text", "markdown_text", "raw_markdown"):
                            if parsed_json.get(k) is not None:
                                raw_content = str(parsed_json[k])
                                break
                        source_name = parsed_json.get("filename") or parsed_json.get("source_name")
                except Exception:
                    raw_content = decoded
            elif (
                "\n" not in stripped_dec
                and len(stripped_dec) < 512
                and stripped_dec.lower().endswith(".md")
                and Path(stripped_dec.strip('"').strip("'")).exists()
            ):
                local_path = stripped_dec.strip('"').strip("'")
            else:
                raw_content = decoded

    if raw_content is None and not local_path:
        raise HTTPException(
            status_code=400,
            detail="Provide a .md file upload ('file'), markdown text ('content'), or local file path ('file_path' / 'path').",
        )

    try:
        res = await asyncio.to_thread(
            ingest_reference_markdown,
            project_id,
            raw_content,
            local_path,
            source_name,
        )
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest reference markdown: {e}")

    try:
        await state.ws_manager.broadcast({
            "type": "reference_markdown_ingested",
            **res,
        })
    except Exception:
        pass

    return res


@router.get("/api/projects/{project_id}/reference-markdown")
async def get_project_reference_markdown_info(
    project_id: str,
    from_line: Optional[int] = Query(None),
    to_line: Optional[int] = Query(None),
):
    """Returns stored reference markdown line count and optional line slice for the project."""
    from services.accuracy_verifier import resolve_project_id

    resolved_pid = resolve_project_id(project_id)
    total_cnt = db.get_project_reference_count(resolved_pid)
    ref_slice = (
        db.get_project_reference_lines(resolved_pid, from_line=from_line, to_line=to_line)
        if (from_line is not None or to_line is not None or total_cnt <= 500)
        else {}
    )
    return {
        "status": "success",
        "project_id": resolved_pid,
        "total_reference_lines": total_cnt,
        "lines": [
            {"line_number": ln, "text_content": txt}
            for ln, txt in sorted(ref_slice.items())
        ],
    }


@router.get("/api/projects/{project_id}/ground-truth-score")
async def get_project_ground_truth_score(
    project_id: str,
    max_line: Optional[int] = Query(None, description="Optional max line number to score up to"),
):
    """
    Computes line-by-line and character-by-character fidelity against the stored reference markdown:
      - Exact line match rate (%)
      - Levenshtein Character Error Rate (CER)
      - Indentation accuracy (%)
      - Syntax token accuracy (CODESCAN_FILE_START, CODESCAN_FILE_END, code fences, brackets)
      - Flagged mismatched lines with diff_opcodes and failure_category
    """
    from services.accuracy_verifier import score_against_reference_markdown

    score_report = await asyncio.to_thread(
        score_against_reference_markdown,
        project_id=project_id,
        max_line=max_line,
    )
    return score_report


@router.post("/api/projects/{project_id}/auto-heal-mismatches")
async def auto_heal_project_mismatches(
    project_id: str,
    lines: Optional[str] = Query(None, description="Optional comma-separated line numbers to heal"),
    req: Optional[Dict[str, Any]] = None,
):
    """
    Automatically re-crops and re-OCRs only the mismatched line strips from their source PNG frames,
    overwriting healed lines in state.document_lines and SQLite document_lines, and returns updated scores.
    """
    from services.accuracy_verifier import auto_heal_mismatches_against_reference

    raw_lns = (req.get("line_numbers") if req else None) or (lines.split(",") if lines else None)
    line_numbers: Optional[List[int]] = None
    if raw_lns is not None:
        if isinstance(raw_lns, (int, str)):
            raw_lns = [raw_lns]
        line_numbers = [int(str(x).strip()) for x in raw_lns if str(x).strip().isdigit()]

    max_lines = int(req["max_lines_to_heal"]) if (req and req.get("max_lines_to_heal")) else None

    heal_report = await asyncio.to_thread(
        auto_heal_mismatches_against_reference,
        project_id=project_id,
        line_numbers=line_numbers,
        max_lines_to_heal=max_lines,
    )

    clear_ocr_inspect_cache()

    try:
        if hasattr(state, "ws_manager") and state.ws_manager:
            await state.ws_manager.broadcast({
                "type": "ground_truth_auto_healed",
                "project_id": heal_report.get("project_id", project_id),
                "healed_lines": heal_report.get("healed_lines", []),
                "rescanned_lines": heal_report.get("rescanned_lines", []),
                "exact_line_match_rate": heal_report.get("exact_line_match_rate"),
                "cer": heal_report.get("cer"),
            })
            await state.ws_manager.broadcast({
                "type": "document_updated",
                "data": _doc_payload(),
            })
    except Exception:
        pass

    return heal_report


