import asyncio
import base64
import hashlib
import io
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks, Query, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from PIL import Image

import db
from models import ReprocessRequest, FramePositionRequest, LineEditRequest, FlagRequest, RecaptureRequest
from services import state
from services.adb_service import DEVICE_PROFILES, current_device_model
from services.ocr_service import (
    route_frame_ocr,
    normalize_model_target,
    active_pipeline_mode,
    active_model_target,
    process_frame_with_target,
)

router = APIRouter(tags=["Frames & Document"])

@router.post("/api/upload-frame")
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
            try:
                contents = base64.b64decode(b64_clean)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
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
            try:
                contents = base64.b64decode(b64_clean)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
        top_line = form.get("top_line", 0)
        bottom_line = form.get("bottom_line", 0)
        page_index = form.get("page_index", 0)
        sync = form.get("sync", True)
        if isinstance(sync, str):
            sync = sync.lower() not in ("false", "0", "no")
        engine = form.get("engine")
        model_type = form.get("model_type")
        model_target = form.get("model_target")
        pipeline_mode = form.get("pipeline_mode")

    if not contents:
        raise HTTPException(status_code=400, detail="Missing frame image: provide 'image_base64' or multipart 'file'")

    try:
        top_line = int(top_line) if top_line is not None else 0
    except (ValueError, TypeError):
        top_line = 0
    try:
        bottom_line = int(bottom_line) if bottom_line is not None else 0
    except (ValueError, TypeError):
        bottom_line = 0
    try:
        pidx = int(page_index) if page_index and int(page_index) > 0 else len(state.captured_frames) + 1
    except (ValueError, TypeError):
        pidx = len(state.captured_frames) + 1

    content_hash = hashlib.sha256(contents).hexdigest()
    sorted_frames = sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))

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

    if not state.get_current_project_id():
        raise HTTPException(status_code=400, detail="No active project. Please create a project before capturing or uploading frames.")

    now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
    fid = f"frame_{top_line:05d}_{bottom_line:05d}_{now_str}" if top_line > 0 and bottom_line > 0 else f"frame_p{pidx:03d}_{now_str}"
    fn = f"{fid}.png"
    tpath = state.FRAMES_DIR / fn
    with open(tpath, "wb") as f:
        f.write(contents)

    pm = pipeline_mode or request.query_params.get("pipeline_mode") or active_pipeline_mode
    effective_target = model_target or ("ollama" if pm == "local" else active_model_target)
    if model_type:
        mt_lower = str(model_type).strip().lower()
        if "gemini" in mt_lower:
            effective_target = "gemini"
        elif any(k in mt_lower for k in ["ollama", "llama", "qwen", "minicpm"]):
            effective_target = "ollama"
        else:
            effective_target = mt_lower
    mt = normalize_model_target(effective_target or request.query_params.get("model_target"))

    state.captured_frames[fid] = {
        "frame_id": fid, "filename": fn, "top_line": top_line, "bottom_line": bottom_line,
        "page_index": pidx, "file_size": len(contents), "content_hash": content_hash,
        "status": "awaiting_review" if not sync else "queued",
        "created_at": datetime.now().isoformat(), "extracted_line_count": 0,
        "model_type": model_type or mt,
        "token_usage": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
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
        "status": "success", "frame_id": fid, "page_index": pidx,
        "top_line": top_line, "bottom_line": bottom_line, "extracted_line_count": 0,
        "model_type": model_type or mt, "model_target": mt, "pipeline_mode": pm,
        "message": f"Frame {fid} received and awaiting review."
    }

@router.post("/api/frames/{frame_id}/scan")
async def scan_frame_ocr(frame_id: str, engine: Optional[str] = Query("auto"), model_target: Optional[str] = Query(None), payload: Optional[ReprocessRequest] = None):
    if frame_id not in state.captured_frames:
        raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    finfo = state.captured_frames[frame_id]
    ipath = state.FRAMES_DIR / finfo.get("filename", f"{frame_id}.png")
    if not ipath.exists():
        matches = list(state.FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches:
            ipath = matches[0]
        else:
            raise HTTPException(status_code=404, detail="Frame image file not found")
    mt = normalize_model_target((payload.model_target if payload and payload.model_target else None) or model_target)
    try:
        res = state.ocr_engine.scan_image(str(ipath))
        top_ln, bot_ln, lines = res.get("top_line", 0), res.get("bottom_line", 0), res.get("lines", [])
        finfo.update({
            "top_line": top_ln,
            "bottom_line": bot_ln,
            "extracted_line_count": len(lines),
            "status": "processed",
            "bounding_boxes": res.get("bounding_boxes", {})
        })
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
                    "notes": f"Gutter OCR ({mt})",
                    "updated_at": datetime.now().isoformat()
                }
        state.save_persisted_state()
        data = {
            "status": "success", "frame_id": frame_id, "top_line": top_ln, "bottom_line": bot_ln,
            "extracted_line_count": len(lines), "bounding_boxes": res.get("bounding_boxes", {}),
            "lines": lines, "model_target": mt
        }
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
    await state.ws_manager.broadcast({
        "type": "frame_position_updated",
        "frame_id": frame_id,
        "custom_offset_y": req.custom_offset_y
    })
    return {"status": "success", "frame_id": frame_id, "custom_offset_y": req.custom_offset_y}

@router.delete("/api/frames/{frame_id}")
async def delete_frame(frame_id: str):
    if not db.delete_frame(frame_id):
        raise HTTPException(status_code=404, detail="Frame not found")
    state.load_persisted_state()
    try:
        pid = state.get_current_project_id()
        with open(state.DOCUMENT_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "lines": {str(k): v.to_dict() if hasattr(v, "to_dict") else (v if isinstance(v, dict) else {"text": str(v)}) for k, v in sorted(state.document_lines.items())},
                "frames": state.captured_frames,
                "token_stats": state.token_stats,
                "latest_telemetry": state.latest_telemetry,
                "updated_at": datetime.now().isoformat()
            }, f, indent=2)
    except Exception as e:
        print(f"Error saving JSON after frame deletion: {e}")
    await state.ws_manager.broadcast({
        "type": "frame_deleted",
        "frame_id": frame_id,
        "frames": db.get_frames(state.get_current_project_id())
    })
    sl = state.get_serialized_lines()
    issues = [item for item in sl if item.get("status") in ["flagged", "missing", "overlap_conflict"]]
    await state.ws_manager.broadcast({
        "type": "document_updated",
        "data": {
            "total_lines": len(state.document_lines),
            "min_line": min(state.document_lines.keys()) if state.document_lines else 0,
            "max_line": max(state.document_lines.keys()) if state.document_lines else 0,
            "total_frames": len(state.captured_frames),
            "issue_count": len(issues),
            "token_stats": state.token_stats,
            "latest_telemetry": state.get_fresh_telemetry(),
            "issues": issues,
            "lines": sl
        }
    })
    return {"status": "success", "frame_id": frame_id}

@router.post("/api/frames/{frame_id}/delete")
async def delete_frame_post(frame_id: str):
    return await delete_frame(frame_id)

@router.post("/api/frames/purge")
async def purge_all_frames():
    purged_files = 0
    try:
        for f in state.FRAMES_DIR.glob("*"):
            if f.is_file() and f.name != ".gitkeep":
                try:
                    f.unlink(missing_ok=True)
                    purged_files += 1
                except Exception:
                    pass
    except Exception as e:
        print(f"Error purging frame files: {e}")

    pid = state.get_current_project_id()
    if pid:
        db.clear_project_data(pid)
    state.captured_frames.clear()
    state.document_lines.clear()
    state.save_persisted_state()

    await state.ws_manager.broadcast({
        "type": "frames_purged",
        "purged_count": purged_files,
        "frames": []
    })
    await state.ws_manager.broadcast({
        "type": "document_updated",
        "data": {
            "total_lines": 0,
            "min_line": 0,
            "max_line": 0,
            "total_frames": 0,
            "issue_count": 0,
            "token_stats": state.token_stats,
            "lines": []
        }
    })
    return {"status": "success", "purged_count": purged_files, "message": f"Successfully purged {purged_files} frame images."}


@router.get("/api/frames")
async def get_frames():
    return db.get_frames(state.get_current_project_id())

@router.get("/api/frames/{frame_id}/image")
async def get_frame_image(frame_id: str):
    path = state.FRAMES_DIR / f"{frame_id}.png"
    if not path.exists():
        matches = list(state.FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches:
            path = matches[0]
        else:
            raise HTTPException(status_code=404, detail="Frame image not found")
    return FileResponse(
        path,
        media_type="image/png",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@router.post("/api/frames/{frame_id}/reprocess")
async def reprocess_frame(frame_id: str, background_tasks: BackgroundTasks, model_target: Optional[str] = Query(None), payload: Optional[ReprocessRequest] = None):
    if frame_id not in state.captured_frames:
        raise HTTPException(status_code=404, detail=f"Frame '{frame_id}' not found")
    finfo = state.captured_frames[frame_id]
    ipath = state.FRAMES_DIR / finfo.get("filename", f"{frame_id}.png")
    if not ipath.exists():
        matches = list(state.FRAMES_DIR.glob(f"*{frame_id}*.png"))
        if matches:
            ipath = matches[0]
        else:
            raise HTTPException(status_code=404, detail="Frame image file not found")
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
            ipath = state.FRAMES_DIR / f_info.get("filename", f"{f_id}.png")
            if not ipath.exists():
                m = list(state.FRAMES_DIR.glob(f"*{f_id}*.png"))
                if m:
                    ipath = m[0]
            if ipath.exists():
                f_info["status"] = "queued"
                background_tasks.add_task(process_frame_with_target, f_id, ipath, f_info.get("top_line", 0), f_info.get("bottom_line", 0), mt)
                reprocessed.append(f_id)
    state.save_persisted_state()
    return {"status": "success", "reprocessed_frames": reprocessed, "count": len(reprocessed), "model_target": mt}

@router.get("/api/document")
async def get_document():
    sl = state.get_serialized_lines()
    issues = [item for item in sl if item.get("status") in ["flagged", "missing", "overlap_conflict"]]
    return {
        "total_lines": len(state.document_lines),
        "min_line": min(state.document_lines.keys()) if state.document_lines else 0,
        "max_line": max(state.document_lines.keys()) if state.document_lines else 0,
        "total_frames": len(state.captured_frames),
        "issue_count": len(issues),
        "token_stats": state.token_stats,
        "latest_telemetry": state.get_fresh_telemetry(),
        "issues": issues,
        "lines": sl
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
        state.document_lines[line_number]["text"] = req.text
        state.document_lines[line_number]["status"] = req.status or "manually_edited"
        if req.notes:
            state.document_lines[line_number]["notes"] = req.notes
        state.document_lines[line_number]["updated_at"] = datetime.now().isoformat()
    state.save_persisted_state()
    lv = state.document_lines[line_number]
    return {"status": "success", "line": lv.to_dict() if hasattr(lv, "to_dict") else lv}

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
        "schema_version": "2.5.0",
        "exported_at": datetime.now().isoformat(),
        "document_metadata": {
            "total_lines": len(state.document_lines),
            "min_line": min(state.document_lines.keys()) if state.document_lines else 0,
            "max_line": max(state.document_lines.keys()) if state.document_lines else 0,
            "total_frames": len(state.captured_frames),
            "token_stats": state.token_stats,
            "issues_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])
        },
        "frames": state.captured_frames,
        "lines": sl
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
        p = state.FRAMES_DIR / f.get("filename", f"{f.get('frame_id')}.png")
        if not p.exists():
            m = list(state.FRAMES_DIR.glob(f"*{f.get('frame_id')}*.png"))
            if m:
                p = m[0]
            else:
                continue
        valid.append((f, p))
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
            if idx > 0 and prev_b > 0 and top_l > 0 and top_l <= prev_b:
                ol = prev_b - top_l + 1
                crop_t = min(int(ol * (h / max(lcount, 1) if lcount > 0 else 32.0)), h - 100)
            crop_t = max(0, min(crop_t + int(fmeta.get("custom_offset_y", 0.0) or 0), h - 50))
            sl = img.crop((0, crop_t, w, h)) if crop_t > 0 else img
            slices.append(sl)
            tot_h += sl.height
            if bot_l > 0:
                prev_b = bot_l
        except Exception:
            pass
    if not slices:
        raise HTTPException(status_code=404, detail="No valid frame images to splice")

    canvas, cur_y = Image.new("RGB", (max_w, tot_h), color=(13, 17, 23)), 0
    for sl in slices:
        canvas.paste(sl, (0, cur_y))
        cur_y += sl.height
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Content-Disposition": "inline; filename=spliced_document.png"})
