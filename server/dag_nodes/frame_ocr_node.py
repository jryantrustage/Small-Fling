"""
Standalone DAG Node 5: Gutter OCR & Boundary Slicer (frame_ocr)
RapidOCR / OpenVINO gutter cluster solver, viewport boundary resolution, and line wrap detection.
"""

import asyncio
import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

import cv2
import numpy as np

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, fetch_current_display_dpi_factor,
    capture_external_screenshot, navigate_to_target_top_line, DEVICE_PROFILES, current_device_model
)
from services import state
from services import ocr_service as ocr_svc
from ocr_engine import detect_line_wrap_state
import db


class FrameOcrNode(BaseDagNode):
    step = "5"
    id = "frame_ocr"
    node_id = "frame_ocr"
    title = "5. Gutter & Line Position Verify"
    short_name = "Line Pos Verify"
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
        lpp = state.orchestration_state.get("viewport_lines") or prof.get("lines_per_page", 24)

        content_hash = hashlib.sha256(snap).hexdigest()
        sorted_f = sorted(state.captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "") or ""))

        cur_acquire_fid = (
            getattr(blackboard, "frame_id", None)
            or state.orchestration_state.get("last_acquired_frame_id")
            or state.dag_state["nodes"].get("frame_acquire", {}).get("frame_id")
        )
        if not cur_acquire_fid:
            for f in reversed(sorted_f):
                if f.get("content_hash") == content_hash or f.get("status") == "acquired":
                    cur_acquire_fid = f.get("frame_id")
                    break

        other_frames = [f for f in sorted_f if f.get("frame_id") != cur_acquire_fid]
        expected_top = state.get_next_expected_top_line(exclude_frame_id=cur_acquire_fid) if other_frames else (
            state.dag_state["nodes"].get("frame_ocr", {}).get("target_top_line") or 1
        )

        is_fast = bool(cfg.get("fast_loop", False) or (blackboard.payload and blackboard.payload.get("fast_loop")))
        is_mock = bool(serial and "mock" in str(serial).lower())

        if is_fast:
            t_det, b_det = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
            lines_detected = []
            char_track_active = bool(
                state.orchestration_state.get("character_tracking_mode")
                or state.dag_state.get("nodes", {}).get("frame_ocr", {}).get("character_tracking_mode")
            )
            if t_det <= 0 or b_det < t_det or (b_det - t_det) > 75:
                from routers.orchestration import recover_gutter_bounds_with_healing
                t_det, b_det, lines_detected, heal_meta = await recover_gutter_bounds_with_healing(
                    serial=serial,
                    disp_id=disp_id,
                    temp_calib=temp_calib,
                    dpi_factor=dpi_factor,
                    node_id="frame_ocr",
                    expected_top=expected_top
                )
                if heal_meta.get("character_tracking_mode"):
                    char_track_active = True
            # Recover ONLY if there is a genuine gap (t_det > expected_top + 2) or if the viewport jumped backward (> 8 lines before expected_top).
            # When t_det == expected_top + 1..2, the wrapped tail of expected_top sits in the blank-gutter rows above t_det!
            is_contiguous = (
                t_det > 0
                and max(1, expected_top - 8) <= t_det <= expected_top + 2
                and (b_det == 0 or b_det >= expected_top)
            )
            if (
                not is_mock
                and not char_track_active
                and cfg.get("recover_gutter_range", True)
                and expected_top > 0
                and t_det > 0
                and not is_contiguous
            ):
                state.dag_state["nodes"]["frame_ocr"].update({
                    "evaluator": "Gutter Range Recovery Evaluator",
                    "telemetry_insight": f"Gutter at Ln {t_det}..{b_det} != expected Ln {expected_top} • Navigating via PageUp/PageDown + Arrows..."
                })
                nav_res = await navigate_to_target_top_line(
                    target_top=expected_top,
                    serial=serial,
                    display_id=disp_id,
                    current_top=t_det,
                    current_bottom=b_det,
                    lines_per_page=lpp,
                    use_page_keys=True,
                    caller_node="frame_ocr"
                )
                if nav_res.get("snapshot_bytes"):
                    snap = nav_res["snapshot_bytes"]
                    with open(temp_calib, "wb") as f:
                        f.write(snap)
                    content_hash = hashlib.sha256(snap).hexdigest()
                    lines_detected = []
                if nav_res.get("actual_top"):
                    t_det = int(nav_res["actual_top"])
                if nav_res.get("actual_bottom"):
                    b_det = int(nav_res["actual_bottom"])

            top_ln = t_det if t_det > 0 else expected_top
            bot_ln = b_det if (b_det >= top_ln and (b_det - top_ln) <= 75) else (top_ln if char_track_active else (top_ln + lpp - 1))
            if not lines_detected:
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
            char_track_active = bool(
                state.orchestration_state.get("character_tracking_mode")
                or state.dag_state.get("nodes", {}).get("frame_ocr", {}).get("character_tracking_mode")
            )
            top_ln, bot_ln, lines_detected, heal_meta = await recover_gutter_bounds_with_healing(
                serial=serial,
                disp_id=disp_id,
                temp_calib=temp_calib,
                dpi_factor=dpi_factor,
                node_id="frame_ocr",
                expected_top=expected_top
            )
            if heal_meta.get("character_tracking_mode"):
                char_track_active = True
            is_contiguous_else = (
                top_ln > 0
                and max(1, expected_top - 8) <= top_ln <= expected_top + 2
                and (bot_ln == 0 or bot_ln >= expected_top)
            )
            if (
                not is_mock
                and not char_track_active
                and cfg.get("recover_gutter_range", True)
                and expected_top > 0
                and top_ln > 0
                and not is_contiguous_else
            ):
                nav_res = await navigate_to_target_top_line(
                    target_top=expected_top,
                    serial=serial,
                    display_id=disp_id,
                    current_top=top_ln,
                    current_bottom=bot_ln,
                    lines_per_page=lpp,
                    use_page_keys=True,
                    caller_node="frame_ocr"
                )
                if nav_res.get("snapshot_bytes"):
                    snap = nav_res["snapshot_bytes"]
                    with open(temp_calib, "wb") as f:
                        f.write(snap)
                    lines_detected = []
                if nav_res.get("actual_top"):
                    top_ln = int(nav_res["actual_top"])
                if nav_res.get("actual_bottom"):
                    bot_ln = int(nav_res["actual_bottom"])

            if top_ln <= 0:
                top_ln = expected_top
            if bot_ln < top_ln or (bot_ln - top_ln) > 75:
                bot_ln = top_ln if char_track_active else (top_ln + lpp - 1)

            n4_node_pre = state.dag_state.get("nodes", {}).get("local_ai_ocr", {})
            n4_lines_pre = n4_node_pre.get("lines") or []
            if (not lines_detected or not any(bool((l.get("text") or "").strip()) for l in lines_detected)) and n4_lines_pre:
                n4_min_p = min((int(l.get("line_number", 0)) for l in n4_lines_pre if l.get("line_number")), default=0)
                n4_max_p = max((int(l.get("line_number", 0)) for l in n4_lines_pre if l.get("line_number")), default=0)
                if abs(n4_min_p - top_ln) <= 2 and abs(n4_max_p - bot_ln) <= 2:
                    lines_detected = [dict(l) for l in n4_lines_pre]

            with open(temp_calib, "rb") as f:
                snap = f.read()
            content_hash = hashlib.sha256(snap).hexdigest()
            scan_res = {"top_line": top_ln, "bottom_line": bot_ln, "lines": lines_detected}

        # Calibrate viewport_lines when observing a valid page span
        if top_ln > 0 and bot_ln >= top_ln and 5 <= (bot_ln - top_ln + 1) <= 75:
            if top_ln == 1 or not state.orchestration_state.get("viewport_lines"):
                state.orchestration_state["viewport_lines"] = bot_ln - top_ln + 1

        # Mandatory Line Position Verification: verify every single OCR line against physical horizontal row slices
        from ocr_engine import worker_scan_image, verify_and_repair_ocr_line_positions
        n4_node = state.dag_state.get("nodes", {}).get("local_ai_ocr", {})
        n4_lines = n4_node.get("lines") or []
        n4_bboxes = n4_node.get("bounding_boxes") or {}
        if (not lines_detected or not any((l.get("text") or "").strip() for l in lines_detected)) and n4_lines:
            n4_min = min((int(l.get("line_number", 0)) for l in n4_lines if l.get("line_number")), default=0)
            n4_max = max((int(l.get("line_number", 0)) for l in n4_lines if l.get("line_number")), default=0)
            if abs(n4_min - top_ln) <= 2 and abs(n4_max - bot_ln) <= 2:
                lines_detected = [dict(l) for l in n4_lines]

        ws_ver: Dict[str, Any] = {}
        gt_lines_for_ver = None
        bboxes_for_ver = dict(n4_bboxes) if n4_bboxes else {}
        try:
            ws_ver = await asyncio.to_thread(worker_scan_image, str(temp_calib))
            gt_lines_for_ver = ws_ver.get("lines", [])
            if not bboxes_for_ver:
                bboxes_for_ver = ws_ver.get("bounding_boxes", {})
            if ws_ver.get("is_wrapped_continuation"):
                tracked_ln = int(
                    state.orchestration_state.get("character_tracking_line")
                    or state.dag_state.get("nodes", {}).get("frame_ocr", {}).get("character_tracking_line")
                    or top_ln
                    or max(1, expected_top - 1)
                )
                top_ln = tracked_ln
                bot_ln = tracked_ln
                for gl in gt_lines_for_ver:
                    gl["line_number"] = tracked_ln
                    gl["gutter_number"] = tracked_ln
                lines_detected = [dict(gl) for gl in gt_lines_for_ver]
            elif ws_ver.get("gutter_count", 0) >= 1 and ws_ver.get("top_line", 0) > 0 and ws_ver.get("bottom_line", 0) >= ws_ver.get("top_line", 0):
                # Adopt worker_scan_image's blank-gutter-aware top_line and bottom_line so wrapped rows never fabricate fake line numbers
                top_ln = int(ws_ver["top_line"])
                bot_ln = int(ws_ver["bottom_line"])
                gt_by_ln = {int(gl["line_number"]): gl for gl in gt_lines_for_ver if gl.get("line_number")}
                filtered_lines: List[Dict[str, Any]] = []
                for l_item in lines_detected:
                    ln_i = int(l_item.get("line_number") or 0)
                    if top_ln <= ln_i <= bot_ln:
                        if ln_i in gt_by_ln and gt_by_ln[ln_i].get("is_wrapped") and gt_by_ln[ln_i].get("text"):
                            filtered_lines.append(dict(gt_by_ln[ln_i]))
                        else:
                            filtered_lines.append(l_item)
                lines_detected = filtered_lines if filtered_lines else [dict(gl) for gl in gt_lines_for_ver]
            elif not lines_detected or not any((l.get("text") or "").strip() for l in lines_detected):
                lines_detected = [dict(l) for l in gt_lines_for_ver]
        except Exception as ws_e:
            print(f"[FrameOcrNode] worker_scan_image verification note: {ws_e}")

        ver_report = verify_and_repair_ocr_line_positions(lines_detected, gt_lines_for_ver, bboxes_for_ver)
        lines_detected = ver_report["lines"]
        bboxes_for_ver = ver_report["bounding_boxes"]
        scan_res["top_line"] = top_ln
        scan_res["bottom_line"] = bot_ln
        scan_res["lines"] = lines_detected
        scan_res["bounding_boxes"] = bboxes_for_ver
        scan_res["line_position_verification"] = ver_report

        is_wrap_continuation_page = bool(ws_ver.get("is_wrapped_continuation") or (top_ln == bot_ln and ws_ver.get("gutter_count", 0) == 0))

        # Resolve logical page index and check duplicate content against prior frames
        is_duplicate = False
        duplicate_fid = None

        if not other_frames:
            pidx = 1
        elif (top_ln == 1 and not is_wrap_continuation_page) or not any(f.get("page_index") == 1 for f in other_frames):
            pidx = 1
            p1_frames = [f for f in other_frames if f.get("page_index") == 1]
            if p1_frames:
                is_duplicate = True
                duplicate_fid = p1_frames[0]["frame_id"]
        else:
            last_f = other_frames[-1]
            if last_f.get("content_hash") == content_hash:
                is_duplicate = True
                duplicate_fid = last_f["frame_id"]
                pidx = last_f.get("page_index", len(other_frames))
            elif (
                not is_wrap_continuation_page
                and top_ln != bot_ln
                and last_f.get("top_line") == top_ln
                and last_f.get("bottom_line") == bot_ln
            ):
                is_duplicate = True
                duplicate_fid = last_f["frame_id"]
                pidx = last_f.get("page_index", len(other_frames))
            else:
                pidx = len(other_frames) + 1

        pid = blackboard.project_id or state.get_current_project_id()
        now_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]

        arrow_count = 0 if pidx == 1 else (state.orchestration_state.get("last_arrow_count") or state.dag_state["nodes"].get("arrow_down", {}).get("arrow_count") or 0)
        if cur_acquire_fid and cur_acquire_fid in state.captured_frames:
            old_rec = state.captured_frames[cur_acquire_fid]
            prev_part_hdr = old_rec.get("detected_part_header")
            prev_cs_starts = list(old_rec.get("codescan_starts") or [])
            prev_cs_ends = list(old_rec.get("codescan_ends") or [])
            if is_duplicate and duplicate_fid and duplicate_fid != cur_acquire_fid and duplicate_fid in state.captured_frames:
                # Current acquire is a duplicate of a prior frame; remove the redundant acquire record
                state.captured_frames.pop(cur_acquire_fid, None)
                try:
                    db.delete_frame(cur_acquire_fid)
                except Exception:
                    pass
                fid = duplicate_fid
                state.reassign_codescan_trace_frame_id(cur_acquire_fid, fid)
                state.captured_frames[fid].update({
                    "top_line": top_ln,
                    "bottom_line": bot_ln,
                    "page_index": pidx,
                    "content_hash": content_hash,
                    "status": "processed",
                    "extracted_line_count": len(lines_detected) if lines_detected else (bot_ln - top_ln + 1),
                    "arrow_count": arrow_count,
                    "is_wrapped_continuation": is_wrap_continuation_page,
                })
                if prev_part_hdr and not state.captured_frames[fid].get("detected_part_header"):
                    state.captured_frames[fid]["detected_part_header"] = prev_part_hdr
                if prev_cs_starts and not state.captured_frames[fid].get("codescan_starts"):
                    state.captured_frames[fid]["codescan_starts"] = prev_cs_starts
                if prev_cs_ends and not state.captured_frames[fid].get("codescan_ends"):
                    state.captured_frames[fid]["codescan_ends"] = prev_cs_ends
                frame_info = state.captured_frames[fid]
            elif old_rec.get("top_line") != top_ln or old_rec.get("bottom_line") != bot_ln or (is_wrap_continuation_page and "_wrap" not in cur_acquire_fid):
                # Bounds were refined by Node 5; replace the Node 3 record so we never leave two rows or mismatched filenames
                old_fn = old_rec.get("filename")
                created_iso = old_rec.get("created_at") or datetime.now().isoformat()
                state.captured_frames.pop(cur_acquire_fid, None)
                try:
                    db.delete_frame(cur_acquire_fid)
                except Exception:
                    pass
                if is_wrap_continuation_page and top_ln > 0:
                    fid = f"frame_{top_ln:05d}_{bot_ln:05d}_wrap{pidx:04d}_{now_str}"
                elif top_ln > 0 and bot_ln > 0:
                    fid = f"frame_{top_ln:05d}_{bot_ln:05d}_{now_str}"
                else:
                    fid = f"frame_p{pidx:03d}_{now_str}"
                state.reassign_codescan_trace_frame_id(cur_acquire_fid, fid)
                fn = f"{fid}.png"
                frame_path = state.FRAMES_DIR / fn
                with open(frame_path, "wb") as f:
                    f.write(snap)
                if old_fn and old_fn != fn:
                    try:
                        (state.FRAMES_DIR / old_fn).unlink(missing_ok=True)
                    except Exception:
                        pass
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
                    "created_at": created_iso,
                    "extracted_line_count": len(lines_detected) if lines_detected else (bot_ln - top_ln + 1),
                    "model_used": cfg.get("engine", "RapidOCR"),
                    "arrow_count": arrow_count,
                    "is_wrapped_continuation": is_wrap_continuation_page,
                    "detected_part_header": prev_part_hdr,
                    "codescan_starts": prev_cs_starts,
                    "codescan_ends": prev_cs_ends,
                }
                state.captured_frames[fid] = frame_info
            else:
                fid = cur_acquire_fid
                state.captured_frames[fid].update({
                    "top_line": top_ln,
                    "bottom_line": bot_ln,
                    "page_index": pidx,
                    "content_hash": content_hash,
                    "status": "processed",
                    "extracted_line_count": len(lines_detected) if lines_detected else (bot_ln - top_ln + 1),
                    "arrow_count": arrow_count,
                    "is_wrapped_continuation": is_wrap_continuation_page,
                })
                frame_info = state.captured_frames[fid]
        elif is_duplicate and duplicate_fid in state.captured_frames:
            fid = duplicate_fid
            state.captured_frames[fid].update({
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "page_index": pidx,
                "content_hash": content_hash,
                "status": "processed",
                "extracted_line_count": len(lines_detected) if lines_detected else (bot_ln - top_ln + 1),
                "arrow_count": arrow_count,
                "is_wrapped_continuation": is_wrap_continuation_page,
            })
            frame_info = state.captured_frames[fid]
        else:
            if is_wrap_continuation_page and top_ln > 0:
                fid = f"frame_{top_ln:05d}_{bot_ln:05d}_wrap{pidx:04d}_{now_str}"
            elif top_ln > 0 and bot_ln > 0:
                fid = f"frame_{top_ln:05d}_{bot_ln:05d}_{now_str}"
            else:
                fid = f"frame_p{pidx:03d}_{now_str}"
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
                "extracted_line_count": len(lines_detected) if lines_detected else (bot_ln - top_ln + 1),
                "model_used": cfg.get("engine", "RapidOCR"),
                "arrow_count": arrow_count,
                "is_wrapped_continuation": is_wrap_continuation_page,
            }
            state.captured_frames[fid] = frame_info
        state.orchestration_state["last_acquired_frame_id"] = fid
        frame_info["lines"] = lines_detected
        frame_info["bounding_boxes"] = bboxes_for_ver
        frame_info["line_position_verification"] = ver_report

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

        # If this page started with wrapped continuation rows above first_ln, append them to (first_ln - 1)
        lead_cont = ws_ver.get("leading_wrapped_continuation")
        if lead_cont and lead_cont.get("line_number") and lead_cont.get("text"):
            state.append_wrapped_continuation_line(
                int(lead_cont["line_number"]),
                fid,
                lead_cont["text"],
                page_index=pidx,
                is_root_chunk=False,
            )

        # Populate document master lines if text was detected (overwriting any shifted line when shift_repaired=True)
        for item in lines_detected:
            ln = item.get("line_number")
            raw_txt = (item.get("text") or "").rstrip("\r\n")
            if ln:
                raw_txt = ocr_svc.sanitize_line_text(ln, raw_txt)
                if item.get("blank_locked"):
                    raw_txt = ""
                if is_wrap_continuation_page or item.get("is_wrapped_continuation"):
                    state.append_wrapped_continuation_line(
                        ln,
                        fid,
                        raw_txt,
                        page_index=pidx,
                        is_root_chunk=False,
                        confidence=item.get("confidence", 0.99),
                    )
                    continue
                if item.get("is_wrapped"):
                    state.append_wrapped_continuation_line(
                        ln,
                        fid,
                        raw_txt,
                        page_index=pidx,
                        is_root_chunk=True,
                        confidence=item.get("confidence", 0.99),
                    )
                    continue
                if ln in state.document_lines and not item.get("shift_repaired") and not item.get("position_verified"):
                    existing = state.document_lines[ln]
                    ex_txt = (existing.get("text") if isinstance(existing, dict) else str(existing)).strip()
                    if ex_txt and not ex_txt.startswith(f"Line {ln}"):
                        continue
                if raw_txt.strip() == f"Line {ln}":
                    continue
                state.document_lines[ln] = state.MasterLine(
                    raw_txt,
                    line_number=ln,
                    gutter_number=ln,
                    frame_id=fid,
                    status=item.get("status", "verified"),
                    confidence=item.get("confidence", 0.99),
                    is_wrapped=item.get("is_wrapped", False),
                    position_verified=True,
                )

        try:
            from dag_nodes.local_ai_ocr_node import _record_ocr_lines_codescan_markers
            lead_lns = [int(lead_cont["line_number"])] if (lead_cont and lead_cont.get("line_number")) else []
            cs_ocr = _record_ocr_lines_codescan_markers(
                lines_detected,
                fid,
                pidx,
                source_node_name="frame_ocr",
                extra_line_numbers=lead_lns,
            )
            if cs_ocr:
                frame_info["codescan_starts"] = cs_ocr
        except Exception as cs_f_err:
            print(f"[FrameOcrNode] codescan trace note: {cs_f_err}")

        state.save_persisted_state()
        state.update_dag_after_frame(fid, top_ln, bot_ln)

        # Detect line wrap state and 'Offline' editor overlay
        offline_overlay_detected = False
        target_top_anchor_text = ""
        bottom_anchor_window: List[str] = []
        is_bottom_wrapped = False
        try:
            from ocr_engine import detect_offline_editor_overlay, _last_gutter_offline_info
            img_wrap = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
            blackboard.latest_frame_bgr = img_wrap
            ws_gcnt = int(ws_ver.get("gutter_count", 0) or 0)
            ws_bot_extra = int(ws_ver.get("bottom_wrapped_extra_rows", 0) or 0)
            if ws_gcnt >= 1 and ws_bot_extra == 0 and not is_wrap_continuation_page:
                # Fast path: bottom row has a verified gutter number and 0 wrapped extra rows below it
                top_anchor_text = str((lines_detected[0].get("text") or "") if lines_detected else "")
                bottom_anchor_text = str((lines_detected[-1].get("text") or "") if lines_detected else "")
                is_wrapped_page = any(bool(l.get("is_wrapped")) for l in (lines_detected or []))
                is_bottom_wrapped = False
            else:
                wrap_info = detect_line_wrap_state(img_wrap, dpi_factor=dpi_factor)
                bottom_anchor_text = wrap_info.get("bottom_text_anchor", "")
                top_anchor_text = wrap_info.get("top_text_anchor", "")
                target_top_anchor_text = wrap_info.get("target_top_text_anchor", "")
                bottom_anchor_window = wrap_info.get("bottom_anchor_window", [])
                is_wrapped_page = wrap_info.get("is_wrapped_page", False)
                is_bottom_wrapped = bool(wrap_info.get("is_bottom_wrapped", False))
            offline_overlay_detected = bool(_last_gutter_offline_info.get("detected"))
            if not offline_overlay_detected and img_wrap is not None:
                off_chk = detect_offline_editor_overlay(img_wrap, use_ocr=False)
                offline_overlay_detected = bool(off_chk.get("detected"))
        except Exception:
            bottom_anchor_text = ""
            top_anchor_text = ""
            is_wrapped_page = False

        next_char_track_mode = bool(is_bottom_wrapped or is_wrap_continuation_page)
        next_char_track_line = bot_ln if next_char_track_mode else 0
        frame_info["character_tracking_mode"] = next_char_track_mode

        state.orchestration_state["bottom_text_anchor"] = bottom_anchor_text
        state.orchestration_state["top_text_anchor"] = top_anchor_text
        state.orchestration_state["target_top_text_anchor"] = target_top_anchor_text
        state.orchestration_state["bottom_anchor_window"] = bottom_anchor_window
        state.orchestration_state["is_wrapped_page"] = is_wrapped_page
        state.orchestration_state["character_tracking_mode"] = next_char_track_mode
        state.orchestration_state["character_tracking_line"] = next_char_track_line
        state.orchestration_state["offline_overlay_detected"] = offline_overlay_detected

        target_top = bot_ln + 1 if (bot_ln > 0 and bot_ln >= top_ln) else ((top_ln or expected_top or 1) + lpp)
        state.orchestration_state["next_target_top"] = target_top
        state.sync_alignment_gutter_lines(
            top_ln,
            bot_ln,
            character_tracking_mode=next_char_track_mode,
            anchor_preview=bottom_anchor_text,
        )
        state.latest_telemetry["next_target_top"] = target_top
        state.latest_telemetry["current_page"] = pidx
        blackboard.top_line = top_ln
        blackboard.bottom_line = bot_ln
        blackboard.target_next_top = target_top
        blackboard.ocr_results = scan_res
        await state.ws_manager.broadcast({
            "type": "alignment_status",
            "alignment": state.latest_alignment_status,
            "data": state.latest_alignment_status,
            "telemetry": state.latest_telemetry
        })

        if "arrow_down" in state.dag_state["nodes"]:
            state.dag_state["nodes"]["arrow_down"].update({
                "target_top_line": target_top,
                "target_top": target_top,
                "prev_bottom": bot_ln,
                "arrow_count": 20 if next_char_track_mode else max(1, target_top - (top_ln or 1)),
                "character_tracking_mode": next_char_track_mode,
                "character_tracking_line": next_char_track_line,
                "bottom_text_anchor": bottom_anchor_text,
                "target_top_text_anchor": target_top_anchor_text,
                "bottom_anchor_window": bottom_anchor_window,
                "is_wrapped_page": is_wrapped_page
            })
        if "verification_trigger" in state.dag_state["nodes"]:
            state.dag_state["nodes"]["verification_trigger"].update({
                "target_top_line": target_top,
                "target_top": target_top,
                "expected_top": target_top,
                "character_tracking_mode": next_char_track_mode,
                "bottom_text_anchor": bottom_anchor_text
            })

        ver_cnt = ver_report.get("verified_lines_count", len(lines_detected))
        shift_cnt = ver_report.get("shifted_lines_detected", 0)
        rep_cnt = ver_report.get("repaired_lines_count", 0)
        pos_summary = (
            f"Pos Verified {ver_cnt}/{ver_cnt} lines (auto-repaired {rep_cnt} shifted)"
            if rep_cnt > 0
            else f"Pos Verified {ver_cnt}/{ver_cnt} lines (0 shifted)"
        )
        mode_tag = f" [CharTrack Ln {bot_ln}]" if next_char_track_mode else ""

        state.dag_state["nodes"]["frame_ocr"].update({
            "status": "completed",
            "top_line": top_ln,
            "bottom_line": bot_ln,
            "target_top_line": target_top,
            "character_tracking_mode": next_char_track_mode,
            "character_tracking_line": next_char_track_line,
            "bottom_text_anchor": bottom_anchor_text,
            "target_top_text_anchor": target_top_anchor_text,
            "bottom_anchor_window": bottom_anchor_window,
            "extracted_line_count": len(lines_detected) if lines_detected else lpp,
            "position_verified": True,
            "verified_lines_count": ver_cnt,
            "shifted_lines_detected": shift_cnt,
            "repaired_lines_count": rep_cnt,
            "line_position_verification": ver_report,
            "frame_id": fid,
            "evaluator": "Gutter & Line Position Evaluator",
            "telemetry_insight": f"Page {pidx} (Ln {top_ln} → {bot_ln}){mode_tag} • {pos_summary} ✔ Next: Ln {target_top}",
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"OCR & Line Position verified Ln {top_ln} → {bot_ln} ({pos_summary}). Next Target: Ln {target_top} ✔",
            top_line=top_ln,
            bottom_line=bot_ln,
            data={
                "frame_id": fid,
                "page": pidx,
                "top_line": top_ln,
                "bottom_line": bot_ln,
                "target_top_line": target_top,
                "lines_extracted": len(lines_detected) if lines_detected else lpp,
                "position_verified": True,
                "verified_lines_count": ver_cnt,
                "shifted_lines_detected": shift_cnt,
                "repaired_lines_count": rep_cnt,
                "line_position_verification": ver_report,
            }
        )


GutterOcrNode = FrameOcrNode
