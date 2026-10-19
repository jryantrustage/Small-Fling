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
    DEVICE_PROFILES, current_device_model
)
from services import state
from services import ocr_service as ocr_svc
from ocr_engine import detect_line_wrap_state
import db


class FrameOcrNode(BaseDagNode):
    id = "frame_ocr"
    node_id = "frame_ocr"
    title = "5. Gutter OCR & Boundary Slicer"
    short_name = "Gutter OCR"
    category = "capture_entire_markdown"
    accent_color = "#f59e0b"
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
        cfg = blackboard.config or self.default_config

        temp_calib = blackboard.current_image_path or (state.FRAMES_DIR / "dag_node3_capture_temp.png")
        if not temp_calib.exists() or temp_calib.stat().st_size < 2000:
            candidates = sorted(
                [p for p in state.FRAMES_DIR.glob("*.png") if p.stat().st_size >= 2000 and not p.name.startswith("temp_")],
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            if candidates:
                temp_calib = candidates[0]
            else:
                raise RuntimeError("No captured frame found. Please execute DAG Node 3 (Screen Capture) first.")

        with open(temp_calib, "rb") as f:
            snap = f.read()

        blackboard.latest_frame_bytes = snap
        blackboard.current_image_bytes = snap
        blackboard.current_image_path = temp_calib

        dpi_factor, active_dpi = await fetch_current_display_dpi_factor(serial, disp_id)
        blackboard.dpi_factor = dpi_factor
        blackboard.active_dpi = active_dpi

        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_8", {"lines_per_page": 31}))
        lpp = prof.get("lines_per_page", 31)

        pidx = len(state.captured_frames) + 1

        # CRITICAL: Page 1 must ALWAYS start at Line 1
        if pidx == 1 or len(state.captured_frames) == 0:
            expected_top = 1
        else:
            sorted_f = sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "") or ""))
            last_bot = sorted_f[-1].get("bottom_line", 0) if sorted_f else 0
            expected_top = (last_bot + 1) if last_bot > 0 else (state.dag_state["nodes"].get("frame_ocr", {}).get("target_top_line") or 1)

        is_fast = bool(cfg.get("fast_loop", False) or (blackboard.payload and blackboard.payload.get("fast_loop")))

        if is_fast:
            t_det, b_det = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
            if pidx == 1:
                top_ln = 1
                bot_ln = b_det if (b_det and b_det > 1) else lpp
            else:
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
            if pidx == 1:
                top_ln = 1
                if bot_ln <= top_ln or bot_ln > 80:
                    bot_ln = lpp
            else:
                if top_ln <= 0:
                    top_ln = expected_top
                if bot_ln <= top_ln:
                    bot_ln = top_ln + lpp - 1

            with open(temp_calib, "rb") as f:
                snap = f.read()
            scan_res = {"top_line": top_ln, "bottom_line": bot_ln, "lines": lines_detected}

        pid = blackboard.project_id or state.get_current_project_id()
        now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
        fid = f"frame_{top_ln:05d}_{bot_ln:05d}_{now_str}" if (top_ln > 0 and bot_ln > 0) else f"frame_p{pidx:03d}_{now_str}"
        fn = f"{fid}.png"
        frame_path = state.FRAMES_DIR / fn
        with open(frame_path, "wb") as f:
            f.write(snap)

        content_hash = hashlib.sha256(snap).hexdigest()
        frame_info = {
            "frame_id": fid,
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
        }
        state.captured_frames[fid] = frame_info

        # Populate document master lines if text was detected
        for item in lines_detected:
            ln = item.get("line_number")
            raw_txt = (item.get("text") or "").strip()
            if ln:
                raw_txt = ocr_svc.sanitize_line_text(ln, raw_txt)
                if ln in state.document_lines:
                    existing = state.document_lines[ln]
                    ex_txt = (existing.get("text") if isinstance(existing, dict) else str(existing)).strip()
                    if ex_txt and not ex_txt.startswith(f"Line {ln}"):
                        continue
                if not raw_txt or raw_txt == f"Line {ln}":
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
