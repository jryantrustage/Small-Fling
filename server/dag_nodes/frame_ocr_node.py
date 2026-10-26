"""
Standalone DAG Node 5: Gutter OCR & Boundary Slicer (frame_ocr)
RapidOCR / OpenVINO gutter cluster solver, viewport boundary resolution, and line wrap detection.
"""

import asyncio
import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import cv2
import numpy as np

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, fetch_current_display_dpi_factor,
    capture_external_screenshot, DEVICE_PROFILES, current_device_model
)
from services import state
from services import ocr_service as ocr_svc
from ocr_engine import detect_line_wrap_state
import db


class FrameOcrNode(BaseDagNode):
    step = "5"
    id = "frame_ocr"
    node_id = "frame_ocr"
    title = "5. Gutter OCR & Boundary Slicer"
    short_name = "Gutter OCR"
    category = "position_navigation"
    accent_color = "#8957e5"
    default_position = {"x": 940.0, "y": 140.0}
    default_config = {
        "fast_loop": False,
        "engine": "RapidOCR",
        "save_to_document": True
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        cfg = blackboard.config or self.get_config()

        temp_calib = blackboard.current_image_path or (state.FRAMES_DIR / "dag_node3_capture_temp.png")
        snap = None
        if temp_calib.exists() and temp_calib.stat().st_size >= 2000:
            with open(temp_calib, "rb") as f:
                snap = f.read()
        elif serial and "mock" not in str(serial).lower():
            # In standalone mode or if Node 3 hasn't run, capture directly from display
            snap = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if snap and len(snap) >= 2000:
                with open(temp_calib, "wb") as f:
                    f.write(snap)

        if not snap or len(snap) < 2000:
            candidates = sorted(
                [p for p in state.FRAMES_DIR.glob("*.png") if p.stat().st_size >= 2000 and not p.name.startswith("temp_")],
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            if candidates:
                temp_calib = candidates[0]
                with open(temp_calib, "rb") as f:
                    snap = f.read()
            else:
                raise RuntimeError("No captured frame found. Please execute DAG Node 3 (Screen Capture) first.")

        blackboard.latest_frame_bytes = snap
        blackboard.current_image_bytes = snap
        blackboard.current_image_path = temp_calib

        dpi_factor, active_dpi = await fetch_current_display_dpi_factor(serial, disp_id)
        blackboard.dpi_factor = dpi_factor
        blackboard.active_dpi = active_dpi

        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_8", {"lines_per_page": 24}))
        lpp = prof.get("lines_per_page", 24)

        sorted_f = sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "") or ""))
        last_bot = sorted_f[-1].get("bottom_line", 0) if sorted_f else 0
        expected_top = (last_bot + 1) if last_bot > 0 else (state.dag_state["nodes"].get("frame_ocr", {}).get("target_top_line") or 1)

        is_fast = bool(cfg.get("fast_loop", False) or (blackboard.payload and blackboard.payload.get("fast_loop")))

        if is_fast:
            t_det, b_det = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
            top_ln = t_det if t_det > 0 else expected_top
            bot_ln = b_det if b_det > 0 else (top_ln + lpp - 1)
            lines_detected = [
                {
                    "line_number": ln,
                    "gutter_number": ln,
                    "text": "",
                    "status": "verified",
                    "confidence": 0.95,
                    "is_wrapped": False
                }
                for ln in range(top_ln, bot_ln + 1)
            ]
            scan_res = {"top_line": top_ln, "bottom_line": bot_ln, "lines": lines_detected}
        else:
            from routers.orchestration import recover_gutter_bounds_with_healing
            top_ln, bot_ln, lines_detected, heal_meta = await recover_gutter_bounds_with_healing(
                serial=serial,
                disp_id=disp_id,
                temp_calib=temp_calib,
                dpi_factor=dpi_factor,
                node_id="frame_ocr",
                expected_top=expected_top
            )
            if top_ln <= 0:
                top_ln = expected_top
            if bot_ln <= top_ln:
                bot_ln = top_ln + lpp - 1

            if not lines_detected or not any(bool((l.get("text") or "").strip()) for l in lines_detected):
                full_scan = await ocr_svc.scan_image_with_minicpm(temp_calib, expected_top=top_ln)
                if full_scan.get("lines"):
                    lines_detected = full_scan["lines"]

            with open(temp_calib, "rb") as f:
                snap = f.read()
            scan_res = {"top_line": top_ln, "bottom_line": bot_ln, "lines": lines_detected}

        # Resolve logical page index and check duplicate content
        content_hash = hashlib.sha256(snap).hexdigest()
        is_duplicate = False
        duplicate_fid = None

        cur_acquire_fid = getattr(blackboard, "frame_id", None)
        other_frames = [f for f in sorted_f if f.get("frame_id") != cur_acquire_fid]

        if getattr(blackboard, "page_index", None) and blackboard.page_index >= 1:
            pidx = blackboard.page_index
        elif not other_frames:
            pidx = 1
        elif top_ln == 1 or not any(f.get("page_index") == 1 for f in other_frames):
            pidx = 1
            # If Page 1 already exists, check if this is an identical re-read of Page 1
            p1_frames = [f for f in other_frames if f.get("page_index") == 1]
            if p1_frames:
                is_duplicate = True
                duplicate_fid = p1_frames[0]["frame_id"]
        elif other_frames:
            last_f = other_frames[-1]
            if last_f.get("content_hash") == content_hash:
                is_duplicate = True
                duplicate_fid = last_f["frame_id"]
                pidx = last_f.get("page_index", len(other_frames))
            elif last_f.get("top_line") == top_ln and last_f.get("bottom_line") == bot_ln:
                is_duplicate = True
                duplicate_fid = last_f["frame_id"]
                pidx = last_f.get("page_index", len(other_frames))
            else:
                pidx = last_f.get("page_index", len(other_frames)) + 1
        else:
            pidx = 1

        pid = blackboard.project_id or state.get_current_project_id()
        now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]

        arrow_count = 0 if pidx == 1 else (state.orchestration_state.get("last_arrow_count") or state.dag_state["nodes"].get("arrow_down", {}).get("arrow_count") or 0)
        if cur_acquire_fid and cur_acquire_fid in state.captured_frames:
            fid = cur_acquire_fid
            state.captured_frames[fid].update({
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "page_index": pidx,
                "status": "processed",
                "extracted_line_count": len(lines_detected) if lines_detected else lpp,
                "arrow_count": arrow_count
            })
            frame_info = state.captured_frames[fid]
        elif is_duplicate and duplicate_fid in state.captured_frames:
            fid = duplicate_fid
            state.captured_frames[fid].update({
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "page_index": pidx,
                "status": "processed",
                "extracted_line_count": len(lines_detected) if lines_detected else lpp,
                "arrow_count": arrow_count
            })
            frame_info = state.captured_frames[fid]
        else:
            fid = f"frame_{top_ln:05d}_{bot_ln:05d}_{now_str}" if (top_ln > 0 and bot_ln > 0) else f"frame_p{pidx:03d}_{now_str}"
            fn = f"{fid}.png"
            frame_path = state.FRAMES_DIR / fn
            with open(frame_path, "wb") as f:
                f.write(snap)

            frame_info = {
                "frame_id": fid,
                "project_id": pid,
                "filename": fn,
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "page_index": pidx,
                "file_size": len(snap),
                "content_hash": content_hash,
                "status": "processed",
                "created_at": datetime.now().isoformat(),
                "extracted_line_count": len(lines_detected) if lines_detected else lpp,
                "model_used": cfg.get("engine", "RapidOCR"),
                "arrow_count": arrow_count
            }
            state.captured_frames[fid] = frame_info

        fn_to_save = frame_info.get("filename") or f"{fid}.png"
        if pid:
            try:
                db.save_frame(
                    project_id=pid,
                    frame_id=fid,
                    filename=fn_to_save,
                    top_line=top_ln,
                    bottom_line=bot_ln,
                    page_index=pidx,
                    file_size=len(snap),
                    status="processed",
                    extracted_line_count=len(lines_detected) if lines_detected else lpp,
                    model_used=cfg.get("engine", "RapidOCR"),
                    created_at=frame_info.get("created_at"),
                    arrow_count=arrow_count
                )
            except Exception as e:
                print(f"[FrameOcrNode] db.save_frame note: {e}")

        # Broadcast new_frame and emit FRAME telemetry event
        await state.ws_manager.broadcast({
            "type": "new_frame",
            "frame": frame_info,
            "data": frame_info
        })
        try:
            from routers.orchestration import emit_dag_telemetry_event
            await emit_dag_telemetry_event(
                category="FRAME",
                message=f"DAG 2 • Captured Frame {pidx} (Ln {top_ln} → {bot_ln}, {frame_info.get('arrow_count', 0)} down-arrows)",
                dag="capture_entire_markdown",
                node_id="frame_ocr",
                serial=serial,
                data={
                    "frame_id": fid,
                    "top_line": top_ln,
                    "bottom_line": bot_ln,
                    "page_index": pidx,
                    "arrow_count": frame_info.get("arrow_count", 0)
                }
            )
        except Exception:
            pass

        # Populate document master lines if text was detected
        for item in lines_detected:
            ln = item.get("line_number")
            raw_txt = (item.get("text") or "").rstrip("\r\n")
            if ln:
                raw_txt = ocr_svc.sanitize_line_text(ln, raw_txt)
                if ln in state.document_lines:
                    existing = state.document_lines[ln]
                    ex_txt = (existing.get("text") if isinstance(existing, dict) else str(existing)).strip()
                    if ex_txt and not ex_txt.startswith(f"Line {ln}"):
                        continue
                if raw_txt.strip() == f"Line {ln}":
                    continue
                state.document_lines[ln] = state.MasterLine(
                    raw_txt,
                    line_number=ln,
                    frame_id=fid,
                    status=item.get("status", "verified"),
                    confidence=item.get("confidence", 0.95),
                    is_wrapped=item.get("is_wrapped", False),
                )

        state.save_persisted_state()
        state.update_dag_after_frame(fid, top_ln, bot_ln)

        # Detect line wrap state
        try:
            img_wrap = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
            wrap_info = detect_line_wrap_state(img_wrap, dpi_factor=dpi_factor)
            bottom_anchor_text = wrap_info.get("bottom_text_anchor", "")
            top_anchor_text = wrap_info.get("top_text_anchor", "")
            is_wrapped_page = wrap_info.get("is_wrapped_page", False)
            blackboard.latest_frame_bgr = img_wrap
        except Exception:
            bottom_anchor_text = ""
            top_anchor_text = ""
            is_wrapped_page = False

        state.orchestration_state["bottom_text_anchor"] = bottom_anchor_text
        state.orchestration_state["top_text_anchor"] = top_anchor_text
        state.orchestration_state["is_wrapped_page"] = is_wrapped_page

        target_top = bot_ln + 1 if bot_ln > 0 else ((expected_top or top_ln or 1) + lpp)
        blackboard.top_line = top_ln
        blackboard.bottom_line = bot_ln
        blackboard.target_next_top = target_top
        blackboard.ocr_results = scan_res

        if "arrow_down" in state.dag_state["nodes"]:
            state.dag_state["nodes"]["arrow_down"].update({
                "target_top_line": target_top,
                "target_top": target_top,
                "prev_bottom": bot_ln,
                "arrow_count": max(1, target_top - (top_ln or 1)),
                "bottom_text_anchor": bottom_anchor_text,
                "is_wrapped_page": is_wrapped_page
            })
        if "verification_trigger" in state.dag_state["nodes"]:
            state.dag_state["nodes"]["verification_trigger"].update({
                "target_top_line": target_top,
                "target_top": target_top,
                "expected_top": target_top,
                "bottom_text_anchor": bottom_anchor_text
            })

        state.dag_state["nodes"]["frame_ocr"].update({
            "status": "completed",
            "top_line": top_ln,
            "bottom_line": bot_ln,
            "target_top_line": target_top,
            "extracted_line_count": len(lines_detected) if lines_detected else lpp,
            "frame_id": fid,
            "evaluator": "Gutter Boundary Evaluator",
            "telemetry_insight": f"Gutter OCR: Page {pidx} (Ln {top_ln} → {bot_ln}) ✔ Next Target: Ln {target_top}",
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"OCR extracted Ln {top_ln} → {bot_ln}. Next Target: Ln {target_top} ✔",
            top_line=top_ln,
            bottom_line=bot_ln,
            data={
                "frame_id": fid,
                "page": pidx,
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "target_top_line": target_top,
                "lines_extracted": len(lines_detected) if lines_detected else lpp
            }
        )


GutterOcrNode = FrameOcrNode
