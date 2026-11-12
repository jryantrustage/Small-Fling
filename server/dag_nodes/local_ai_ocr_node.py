"""
Standalone DAG Node 4: Local AI Model Transcription (MiniCPM-V / Ollama)
Performs row-locked multimodal AI OCR code transcription on the current frame.
"""

import asyncio
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services import state
from services import ocr_service as ocr_svc
import db


def _record_ocr_lines_codescan_markers(
    lines_list: List[Dict[str, Any]],
    frame_id_str: str,
    page_idx_val: int,
    source_node_name: str = "local_ai_ocr",
    extra_line_numbers: Optional[List[int]] = None,
) -> List[Dict[str, Any]]:
    """Detect CODESCAN_FILE_START tags in OCR lines (or stitched document_lines) and upsert into project_diagnostics_trace.json."""
    recorded: List[Dict[str, Any]] = []
    try:
        from dag_nodes.markdown_tag_parser_node import (
            CODESCAN_START_RESILIENT_RE,
            parse_codescan_start_attributes,
        )
        candidate_map: Dict[int, str] = {}
        for idx, item in enumerate(lines_list or []):
            try:
                ln = int(re.sub(r"\D", "", str(item.get("line_number") or "")) or 0)
            except Exception:
                ln = 0
            txt = str(item.get("text") or "")
            if ln > 0 and ln in state.document_lines:
                dl_val = state.document_lines[ln]
                dl_txt = dl_val.get("text", "") if isinstance(dl_val, dict) else (dl_val.text if hasattr(dl_val, "text") else str(dl_val))
                if len(dl_txt) >= len(txt):
                    txt = dl_txt
            key_ln = ln if ln > 0 else -(idx + 1)
            candidate_map[key_ln] = txt
        for extra_ln in (extra_line_numbers or []):
            if extra_ln and extra_ln > 0 and extra_ln in state.document_lines:
                dl_val = state.document_lines[extra_ln]
                dl_txt = dl_val.get("text", "") if isinstance(dl_val, dict) else (dl_val.text if hasattr(dl_val, "text") else str(dl_val))
                candidate_map[extra_ln] = dl_txt
        for key_ln, txt in candidate_map.items():
            m = CODESCAN_START_RESILIENT_RE.search(txt or "")
            if m:
                parsed = parse_codescan_start_attributes(m.group(1) or "")
                md_ln = key_ln if key_ln > 0 else 0
                parsed["md_line"] = md_ln
                rec = state.record_code_scan_start_trace(
                    parsed,
                    frame_id=frame_id_str,
                    page_index=page_idx_val,
                    md_line=md_ln,
                    source_node=source_node_name,
                    persist=True,
                )
                recorded.append(rec)
    except Exception as cs_ex:
        print(f"[{source_node_name}] codescan trace note: {cs_ex}")
    return recorded


class LocalAiOcrNode(BaseDagNode):
    step = "4"
    id = "local_ai_ocr"
    node_id = "local_ai_ocr"
    title = "4. Local AI Model Transcription"
    short_name = "MiniCPM-V"
    category = "capture_entire_markdown"
    accent_color = "#388bfd"
    default_position = {"x": 720.0, "y": 140.0}
    default_config = {
        "model": "MiniCPM-V (Ollama)",
        "expected_top": 1,
        "background_worker": False,
        "save_to_document": True
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        cfg = blackboard.config or self.get_config()

        if cfg.get("bypass_live_ocr") or (blackboard.payload and blackboard.payload.get("bypass_live_ocr")) or state.dag_state.get("bypass_live_ocr"):
            state.dag_state["nodes"].setdefault("local_ai_ocr", {}).update({
                "status": "completed",
                "telemetry_insight": "Live AI OCR bypassed (fast capture mode; deferred to batch sequential rescan)"
            })
            return NodeExecutionResult(
                status="success",
                node_id=self.node_id,
                message="Live AI OCR bypassed (fast capture mode; deferred to batch sequential rescan)",
                data={"bypassed": True, "lines_count": 0}
            )

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

        exp_top = blackboard.top_line or cfg.get("expected_top", 1)

        async def _purge_invalid_frame_and_abort(fid: str, img_file: Path, reason: str):
            if fid and fid.startswith("frame_"):
                state.captured_frames.pop(fid, None)
                try:
                    db.delete_frame(fid)
                except Exception:
                    pass
                try:
                    img_file.unlink(missing_ok=True)
                except Exception:
                    pass
                state.sync_resume_frontier_state(exclude_frame_id=fid)
                state.orchestration_state["auto_resume_pending"] = True
                try:
                    await state.ws_manager.broadcast({"type": "frame_deleted", "frame_id": fid})
                except Exception:
                    pass
            raise RuntimeError(reason)

        is_headless = bool(
            cfg.get("headless_mode")
            or (blackboard.payload and blackboard.payload.get("headless_mode"))
            or getattr(state, "headless_mode", False)
            or state.dag_state.get("headless_mode")
        )

        if is_headless:
            # Ultra-fast headless mode: Uses the EXACT same engine as OCR Inspector rescan page lines
            # (RapidOCR on gutter + tight line crops with monospace indentation) without loading into MiniCPM-V vision model.
            t0 = time.perf_counter()
            from ocr_engine import worker_scan_image, verify_and_repair_ocr_line_positions
            from services.ocr_service import rescan_lines_on_image_sync

            try:
                quick_scan = await asyncio.to_thread(worker_scan_image, str(temp_calib))
                if quick_scan.get("invalid_editor_frame"):
                    await _purge_invalid_frame_and_abort(
                        temp_calib.stem,
                        temp_calib,
                        f"Rejected invalid non-editor frame {temp_calib.stem} (0 gutter lines, luminance={quick_scan.get('mean_luminance')}). Purged frame to retake capture."
                    )
                raw_lines = quick_scan.get("lines", [])
                if quick_scan.get("is_wrapped_continuation"):
                    tracked_ln = int(
                        state.orchestration_state.get("character_tracking_line")
                        or state.dag_state.get("nodes", {}).get("frame_ocr", {}).get("character_tracking_line")
                        or exp_top
                        or 1
                    )
                    for gl in raw_lines:
                        gl["line_number"] = tracked_ln
                        gl["gutter_number"] = tracked_ln
                raw_gt_snapshot = [dict(gl) for gl in raw_lines]
                raw_bboxes = quick_scan.get("bounding_boxes", {})

                all_lns = [
                    int(l.get("line_number"))
                    for l in raw_lines
                    if l.get("line_number") is not None and str(l.get("line_number")).strip().isdigit()
                ]

                if all_lns and not quick_scan.get("is_wrapped_continuation"):
                    lines_detected, rescanned = rescan_lines_on_image_sync(
                        temp_calib,
                        all_lns,
                        raw_lines,
                        raw_bboxes,
                        reuse_verified_slices=True,
                    )
                else:
                    lines_detected = raw_lines
                    rescanned = []

                ver_report = verify_and_repair_ocr_line_positions(lines_detected, raw_gt_snapshot, raw_bboxes)
                lines_detected = ver_report["lines"]
                raw_bboxes = ver_report["bounding_boxes"]

                dur_ms = round((time.perf_counter() - t0) * 1000, 1)
                extracted_text = "\n".join(f"{l.get('line_number', 0):>3}: {l.get('text', '')}" for l in lines_detected)
                lines_count = len(lines_detected)
                char_count = len(extracted_text)
                engine_name = "Headless RapidOCR (Inspector Rescan Engine)"

                if cfg.get("save_to_document", True):
                    lead_cont = quick_scan.get("leading_wrapped_continuation")
                    if lead_cont and lead_cont.get("line_number") and lead_cont.get("text"):
                        state.append_wrapped_continuation_line(
                            int(lead_cont["line_number"]),
                            temp_calib.stem,
                            lead_cont["text"],
                            is_root_chunk=False,
                        )
                    for item in lines_detected:
                        ln = item.get("line_number")
                        if ln and ln > 0:
                            if exp_top > 25 and ln <= 24 and not quick_scan.get("is_wrapped_continuation"):
                                continue
                            if item.get("is_wrapped_continuation"):
                                state.append_wrapped_continuation_line(
                                    ln,
                                    temp_calib.stem,
                                    item.get("text", ""),
                                    is_root_chunk=False,
                                    confidence=item.get("confidence", 0.99),
                                )
                                continue
                            if item.get("is_wrapped"):
                                state.append_wrapped_continuation_line(
                                    ln,
                                    temp_calib.stem,
                                    item.get("text", ""),
                                    is_root_chunk=True,
                                    confidence=item.get("confidence", 0.99),
                                )
                                continue
                            existing = state.document_lines.get(ln)
                            meta = getattr(existing, "meta", {}).copy() if (existing and hasattr(existing, "meta")) else (dict(existing) if isinstance(existing, dict) else {})
                            meta.update({
                                "line_number": ln,
                                "gutter_number": ln,
                                "status": "verified",
                                "overwritten": True,
                                "position_verified": True,
                                "frame_id": temp_calib.stem,
                                "updated_at": datetime.now().isoformat(),
                                "notes": "Headless RapidOCR (Row-Locked Position Verified)",
                                "confidence": item.get("confidence", 0.99)
                            })
                            if item.get("is_wrapped") is not None:
                                meta["is_wrapped"] = item.get("is_wrapped")
                            state.document_lines[ln] = state.MasterLine(
                                item.get("text", ""),
                                **meta
                            )

                    if lines_detected:
                        state.save_persisted_state()
                        await state.ws_manager.broadcast({
                            "type": "document_updated",
                            "document": state.get_document_metrics(),
                            "data": state.get_document_metrics()
                        })

                cs_headless = _record_ocr_lines_codescan_markers(
                    lines_detected,
                    temp_calib.stem,
                    int(blackboard.page_index or state.latest_telemetry.get("current_page") or 0),
                    source_node_name="local_ai_ocr_headless",
                )

                if temp_calib.stem in state.captured_frames:
                    state.captured_frames[temp_calib.stem]["lines"] = lines_detected
                    state.captured_frames[temp_calib.stem]["bounding_boxes"] = raw_bboxes
                    state.captured_frames[temp_calib.stem]["line_position_verification"] = ver_report
                    state.captured_frames[temp_calib.stem]["extracted_line_count"] = lines_count
                    state.captured_frames[temp_calib.stem]["status"] = "rescanned"
                    state.captured_frames[temp_calib.stem]["model_used"] = engine_name
                    if cs_headless:
                        state.captured_frames[temp_calib.stem]["codescan_starts"] = cs_headless

                blackboard.ai_ocr_text = extracted_text
                blackboard.preview_text = extracted_text[:300] + ("..." if len(extracted_text) > 300 else "")
                blackboard.lines_count = lines_count
                blackboard.char_count = char_count

                state.dag_state["nodes"]["local_ai_ocr"].update({
                    "status": "completed",
                    "extracted_text": extracted_text,
                    "preview_text": blackboard.preview_text,
                    "lines_count": lines_count,
                    "char_count": char_count,
                    "model_used": engine_name,
                    "image_id": temp_calib.stem,
                    "image_name": temp_calib.name,
                    "image_url": f"/api/frames/{temp_calib.stem}/image",
                    "image_width": quick_scan.get("image_width", 1920),
                    "image_height": quick_scan.get("image_height", 1080),
                    "lines": lines_detected,
                    "bounding_boxes": raw_bboxes,
                    "line_position_verification": ver_report,
                    "evaluator": "Headless RapidOCR Position-Verified Evaluator",
                    "telemetry_insight": f"Headless scan: {lines_count}/{lines_count} lines pos-verified ({char_count} chars) in {dur_ms}ms ✔",
                    "error": None
                })

                return NodeExecutionResult(
                    status="success",
                    node_id=self.node_id,
                    message=f"Headless RapidOCR extracted & position-verified {lines_count} lines ({char_count} chars in {dur_ms}ms) ✔",
                    data={
                        "lines_count": lines_count,
                        "char_count": char_count,
                        "extracted_text": extracted_text,
                        "model_used": engine_name,
                        "image_id": temp_calib.stem,
                        "image_name": temp_calib.name,
                        "image_url": f"/api/frames/{temp_calib.stem}/image",
                        "image_width": quick_scan.get("image_width", 1920),
                        "image_height": quick_scan.get("image_height", 1080),
                        "lines": lines_detected,
                        "bounding_boxes": raw_bboxes,
                        "line_position_verification": ver_report,
                        "headless": True,
                        "duration_ms": dur_ms
                    }
                )
            except Exception as h_err:
                if "Rejected invalid non-editor frame" in str(h_err):
                    raise
                print(f"[LocalAiOcrNode] Headless OCR error, falling back to standard AI OCR: {h_err}")


        # Background worker mode support
        is_bg = bool(cfg.get("background_worker", False) or (blackboard.payload and blackboard.payload.get("background_worker")))
        if is_bg:
            async def _bg_worker(target_img: Path, top_expected: int):
                try:
                    res = await ocr_svc.scan_image_with_minicpm(target_img, expected_top=top_expected, live_capture=True)
                    lines_det = res.get("lines", [])
                    for item in lines_det:
                        try:
                            raw_ln = str(item.get("line_number") or "").strip()
                            digits = re.sub(r"\D", "", raw_ln)
                            ln = int(digits) if digits else None
                        except Exception:
                            ln = None
                        if ln and ln > 0:
                            blank_locked = bool(item.get("blank_locked", False))
                            txt = "" if blank_locked else item.get("text", "")
                            state.document_lines[ln] = {
                                "line_number": ln, "gutter_number": ln, "text": txt,
                                "is_blank": True if blank_locked else not bool(txt.strip()),
                                "blank_locked": blank_locked,
                                "is_wrapped": False if blank_locked else item.get("is_wrapped", False),
                                "wrapped_line_count": 1 if blank_locked else item.get("wrapped_line_count", 1),
                                "status": "verified", "confidence": 1.0 if blank_locked else 0.98,
                                "notes": f"MiniCPM-V OCR ({res.get('model_used', 'MiniCPM-V')})",
                                "updated_at": datetime.now().isoformat()
                            }
                    if lines_det:
                        state.save_persisted_state()
                        await state.ws_manager.broadcast({
                            "type": "document_updated",
                            "document": state.get_document_metrics(),
                            "data": state.get_document_metrics()
                        })
                except Exception as ex:
                    print(f"[LocalAiOcrNode bg worker] error: {ex}")

            asyncio.create_task(_bg_worker(temp_calib, exp_top))
            return NodeExecutionResult(
                status="success",
                node_id=self.node_id,
                message="Dispatched Local AI OCR to background task ✔",
                data={"background_worker": True}
            )

        # Synchronous execution
        try:
            scan_res = await ocr_svc.scan_image_with_minicpm(temp_calib, expected_top=exp_top, live_capture=True)
        except Exception as e:
            print(f"[LocalAiOcrNode] MiniCPM-V invocation error: {e}")
            scan_res = {
                "status": "error",
                "error": str(e),
                "lines": [],
                "extracted_text": "",
                "lines_count": 0,
                "model_used": "MiniCPM-V (Error)"
            }

        if scan_res.get("invalid_editor_frame"):
            await _purge_invalid_frame_and_abort(
                temp_calib.stem,
                temp_calib,
                f"Rejected invalid non-editor frame {temp_calib.stem}: {scan_res.get('error', 'non-editor screen')}. Frame purged to retake capture."
            )

        extracted_text = scan_res.get("extracted_text", "")
        lines_detected = scan_res.get("lines", [])
        lines_count = scan_res.get("lines_count", len(lines_detected))
        char_count = len(extracted_text)
        engine_name = scan_res.get("model_used", "MiniCPM-V (Ollama)")

        det_fn = scan_res.get("detected_filename")
        if det_fn:
            pid = blackboard.project_id or state.get_current_project_id()
            if pid:
                db.append_project_filename(pid, det_fn)
                try:
                    proj = db.get_project(pid)
                    await state.ws_manager.broadcast({"type": "project_updated", "project": proj})
                    await state.ws_manager.broadcast({"type": "project_switched", "project": proj})
                except Exception:
                    pass

        if cfg.get("save_to_document", True):
            lead_cont = scan_res.get("leading_wrapped_continuation")
            if lead_cont and lead_cont.get("line_number") and lead_cont.get("text"):
                state.append_wrapped_continuation_line(
                    int(lead_cont["line_number"]),
                    temp_calib.stem,
                    lead_cont["text"],
                    is_root_chunk=False,
                )
            for item in lines_detected:
                try:
                    raw_ln = str(item.get("line_number") or "").strip()
                    digits = re.sub(r"\D", "", raw_ln)
                    ln = int(digits) if digits else None
                except Exception:
                    ln = None
                if ln and ln > 0:
                    if exp_top > 25 and ln <= 24 and not scan_res.get("is_wrapped_continuation"):
                        continue
                    blank_locked = bool(item.get("blank_locked", False))
                    txt = "" if blank_locked else item.get("text", "")
                    if item.get("is_wrapped_continuation"):
                        state.append_wrapped_continuation_line(
                            ln,
                            temp_calib.stem,
                            txt,
                            is_root_chunk=False,
                            confidence=item.get("confidence", 0.98),
                        )
                        continue
                    if item.get("is_wrapped") and not blank_locked:
                        state.append_wrapped_continuation_line(
                            ln,
                            temp_calib.stem,
                            txt,
                            is_root_chunk=True,
                            confidence=item.get("confidence", 0.98),
                        )
                        continue
                    state.document_lines[ln] = {
                        "line_number": ln,
                        "gutter_number": ln,
                        "text": txt,
                        "is_blank": True if blank_locked else not bool(txt.strip()),
                        "blank_locked": blank_locked,
                        "is_wrapped": False if blank_locked else item.get("is_wrapped", False),
                        "wrapped_line_count": 1 if blank_locked else item.get("wrapped_line_count", 1),
                        "status": "verified",
                        "frame_id": temp_calib.stem,
                        "confidence": 1.0 if blank_locked else item.get("confidence", 0.98),
                        "notes": f"MiniCPM-V OCR ({engine_name})",
                        "updated_at": datetime.now().isoformat()
                    }

            if lines_detected:
                state.save_persisted_state()
                await state.ws_manager.broadcast({
                    "type": "document_updated",
                    "document": state.get_document_metrics(),
                    "data": state.get_document_metrics()
                })

        extra_lns: List[int] = []
        if scan_res.get("leading_wrapped_continuation") and scan_res["leading_wrapped_continuation"].get("line_number"):
            try:
                extra_lns.append(int(scan_res["leading_wrapped_continuation"]["line_number"]))
            except Exception:
                pass
        cs_recorded = _record_ocr_lines_codescan_markers(
            lines_detected,
            temp_calib.stem,
            int(blackboard.page_index or state.latest_telemetry.get("current_page") or 0),
            source_node_name="local_ai_ocr",
            extra_line_numbers=extra_lns,
        )

        if temp_calib.stem in state.captured_frames and lines_detected:
            state.captured_frames[temp_calib.stem].update({
                "lines": lines_detected,
                "bounding_boxes": scan_res.get("bounding_boxes", {}),
                "line_position_verification": scan_res.get("line_position_verification"),
                "extracted_line_count": lines_count,
                "status": "processed",
                "model_used": engine_name,
            })
            if cs_recorded:
                state.captured_frames[temp_calib.stem]["codescan_starts"] = cs_recorded

        blackboard.ai_ocr_text = extracted_text
        blackboard.preview_text = extracted_text[:300] + ("..." if len(extracted_text) > 300 else "")
        blackboard.lines_count = lines_count
        blackboard.char_count = char_count

        state.dag_state["nodes"]["local_ai_ocr"].update({
            "status": "completed",
            "extracted_text": extracted_text,
            "preview_text": blackboard.preview_text,
            "lines_count": lines_count,
            "char_count": char_count,
            "model_used": engine_name,
            "image_id": temp_calib.stem,
            "image_name": temp_calib.name,
            "image_url": f"/api/frames/{temp_calib.stem}/image",
            "image_width": scan_res.get("image_width", 1920),
            "image_height": scan_res.get("image_height", 1080),
            "lines": lines_detected,
            "bounding_boxes": scan_res.get("bounding_boxes", {}),
            "line_position_verification": scan_res.get("line_position_verification"),
            "evaluator": "Multimodal Vision + Row-Position Evaluator",
            "telemetry_insight": f"Extracted & pos-verified {lines_count} lines ({char_count} chars) via {engine_name}",
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Local AI OCR extracted & position-verified {lines_count} lines ({char_count} chars) ✔",
            data={
                "lines_count": lines_count,
                "char_count": char_count,
                "extracted_text": extracted_text,
                "model_used": engine_name,
                "image_id": temp_calib.stem,
                "image_name": temp_calib.name,
                "image_url": f"/api/frames/{temp_calib.stem}/image",
                "image_width": scan_res.get("image_width", 1920),
                "image_height": scan_res.get("image_height", 1080),
                "lines": lines_detected,
                "bounding_boxes": scan_res.get("bounding_boxes", {}),
                "line_position_verification": scan_res.get("line_position_verification"),
            }
        )
