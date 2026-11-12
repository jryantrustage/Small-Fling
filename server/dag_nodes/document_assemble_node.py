"""
Standalone DAG Node 8: Master Document Assembly & EOF Loopback (document_assemble)
Stitches verified master lines into markdown, computes completion percentage against
Node 1 EOF calibration, and routes loopback to Node 3 or finishes document.
"""

import time
from typing import Dict, Any, Optional

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services import state

_last_markdown_disk_flush_mono: float = 0.0


class DocumentAssembleNode(BaseDagNode):
    step = "8"
    id = "document_assemble"
    node_id = "document_assemble"
    title = "8. Master Document Assembly & EOF"
    short_name = "Assemble Doc"
    category = "verify_assemble"
    accent_color = "#bc8cff"
    default_position = {"x": 1600.0, "y": 140.0}
    default_config = {
        "auto_save_markdown": True,
        "completion_threshold_pct": 100.0,
        "output_filename": "reconstructed.md"
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        global _last_markdown_disk_flush_mono
        cfg = blackboard.config or self.get_config()
        total_lines_target = (
            blackboard.total_lines
            or state.dag_state["nodes"].get("init_end", {}).get("total_lines", 0)
        )
        captured_count = sum(
            1
            for v in state.document_lines.values()
            if (not v.meta.get("is_blank") if (hasattr(v, "meta") and "is_blank" in v.meta) else bool(str(v).strip()))
        )
        latest_bottom = blackboard.bottom_line or state.latest_telemetry.get("current_bottom_line", 0)

        max_k = max(state.document_lines.keys()) if state.document_lines else 0
        doc_lines = []
        for ln in range(1, max_k + 1):
            val = state.document_lines.get(ln, "")
            if isinstance(val, dict):
                doc_lines.append(val.get("text", ""))
            elif hasattr(val, "text"):
                doc_lines.append(val.text)
            else:
                doc_lines.append(str(val))
        full_markdown = "\n".join(doc_lines)

        is_complete = False
        eof_reason = ""
        n6_info = state.dag_state["nodes"].get("arrow_down", {})
        eof_reached_flag = bool(n6_info.get("eof_reached") or state.orchestration_state.get("eof_reached"))
        offline_flag = bool(
            n6_info.get("offline_overlay_detected")
            or state.orchestration_state.get("offline_overlay_detected")
        )
        effective_bottom = max(int(latest_bottom or 0), int(max_k or 0))
        tail_txt = "\n".join(doc_lines[-6:]) if doc_lines else ""

        from ocr_engine import is_eof_reached_with_offline_awareness
        is_eof_dual, eof_reason = is_eof_reached_with_offline_awareness(
            bottom_line=effective_bottom,
            total_lines=total_lines_target,
            offline_detected=(offline_flag or eof_reached_flag),
            tail_text=tail_txt,
        )

        if total_lines_target > 0 and effective_bottom >= total_lines_target:
            is_complete = True
        elif total_lines_target > 0 and captured_count >= total_lines_target:
            is_complete = True
        elif is_eof_dual or eof_reached_flag:
            is_complete = True

        loop_iter = (state.dag_state["nodes"].get("document_assemble", {}).get("loop_iteration") or 0) + 1
        now_mono = time.perf_counter()

        # Track <!-- CODESCAN_FILE_START --> and <!-- CODESCAN_FILE_END --> markers and verify size/lines/chars distinctly
        codescan_verification: Dict[str, Any] = {}
        part_header_metadata: Dict[str, Any] = {}
        hierarchical_progress: Dict[str, Any] = {}
        ocr_steering_guide: Dict[str, Any] = {}
        process_accuracy: Dict[str, Any] = {}
        try:
            from dag_nodes.markdown_tag_parser_node import (
                verify_codescan_file_markers_and_metrics,
                auto_rescan_mismatched_files_with_steering_guide,
                _build_frame_range_index,
            )
            frame_ranges = _build_frame_range_index(blackboard.project_id)
            cs_res = verify_codescan_file_markers_and_metrics(
                doc_lines,
                project_id=blackboard.project_id,
                self_heal=bool(is_complete),
                recover_wrapped_from_png=bool(is_complete),
                preloaded_frame_ranges=frame_ranges,
            )
            # If any closed file block has a metric mismatch, run targeted steering-guided rescan from correlated PNG frames
            rescan_info = auto_rescan_mismatched_files_with_steering_guide(
                cs_res,
                project_id=blackboard.project_id,
                max_files_per_pass=2,
            )
            if rescan_info.get("rescanned_lines", 0) > 0:
                doc_lines = []
                for ln_i in range(1, max_k + 1):
                    val_i = state.document_lines.get(ln_i, "")
                    doc_lines.append(val_i.get("text", "") if isinstance(val_i, dict) else (val_i.text if hasattr(val_i, "text") else str(val_i)))
                full_markdown = "\n".join(doc_lines)
                cs_res = verify_codescan_file_markers_and_metrics(
                    doc_lines,
                    project_id=blackboard.project_id,
                    self_heal=bool(is_complete),
                    recover_wrapped_from_png=False,
                    preloaded_frame_ranges=frame_ranges,
                )

            part_header_metadata = cs_res.get("part_header_metadata", {})
            hierarchical_progress = cs_res.get("hierarchical_progress", {})
            ocr_steering_guide = cs_res.get("ocr_steering_guide", {})
            process_accuracy = cs_res.get("process_accuracy", {})
            if rescan_info.get("repairs"):
                ocr_steering_guide["recent_auto_repairs"] = rescan_info["repairs"]

            # Sync per-file content marker accuracy & CODESCAN_FILE_START driver state to project_diagnostics_trace.json
            state.sync_codescan_verification_to_trace(cs_res, persist=True)

            # Reconcile target_total_lines with part_header_metadata["declared_lines"] if uncalibrated or skewed by Offline badge
            decl_part_lines = int(part_header_metadata.get("declared_lines") or 0)
            if decl_part_lines > 0 and (total_lines_target <= 0 or abs(total_lines_target - decl_part_lines) <= 15):
                if total_lines_target != decl_part_lines:
                    total_lines_target = decl_part_lines
                    blackboard.total_lines = decl_part_lines
                    state.latest_telemetry["target_total_lines"] = decl_part_lines
                    if "init_end" in state.dag_state.get("nodes", {}):
                        state.dag_state["nodes"]["init_end"]["total_lines"] = decl_part_lines

            ms = cs_res["markers_summary"]
            dms = cs_res["distinct_metrics_summary"]
            codescan_verification = {
                "part_header_metadata": part_header_metadata,
                "hierarchical_progress": hierarchical_progress,
                "ocr_steering_guide": ocr_steering_guide,
                "process_accuracy": process_accuracy,
                "markers_summary": {
                    "total_start_markers": ms["total_start_markers"],
                    "total_end_markers": ms["total_end_markers"],
                    "paired_markers_count": ms["paired_markers_count"],
                    "unclosed_start_markers_count": ms["unclosed_start_markers_count"],
                    "orphan_end_markers_count": ms["orphan_end_markers_count"],
                },
                "distinct_metrics_summary": dms,
                "metric_mismatches_count": len(cs_res["metric_mismatches"]),
                "files": [
                    {
                        "index": f["index"],
                        "path": f["path"],
                        "normalized_path": f["normalized_path"],
                        "short_name": f.get("short_name", ""),
                        "type": f.get("type") or f.get("ext", ""),
                        "tag_start_md_line": f["tag_start_md_line"],
                        "end_md_line": f["end_md_line"],
                        "markers_paired": f["markers_paired"],
                        "expected_size": f["expected_size"],
                        "actual_size": f["actual_size"],
                        "size_delta": f["size_delta"],
                        "size_matches": f["size_matches"],
                        "expected_lines": f["expected_lines"],
                        "actual_lines": f["actual_lines"],
                        "line_count_delta": f["line_count_delta"],
                        "lines_matches": f["lines_matches"],
                        "expected_chars": f["expected_chars"],
                        "actual_chars": f["actual_chars"],
                        "chars_delta": f["chars_delta"],
                        "chars_matches": f["chars_matches"],
                        "all_metrics_match": f["all_metrics_match"],
                        "distinct_accuracy_pct": f.get("distinct_accuracy_pct", 0.0),
                        "process_accuracy": f.get("process_accuracy", {}),
                        "lifecycle_status": f.get("lifecycle_status", "scanning_active"),
                        "source_frame_ids": f.get("source_frame_ids", []),
                        "mismatch_reasons": f["mismatch_reasons"],
                        "distinct_verification": f["distinct_verification"],
                    }
                    for f in cs_res["vfs_files"]
                ],
            }
            blackboard.metadata["codescan_verification"] = codescan_verification
            blackboard.metadata["part_header_metadata"] = part_header_metadata
            blackboard.metadata["hierarchical_progress"] = hierarchical_progress
            blackboard.metadata["ocr_steering_guide"] = ocr_steering_guide
            blackboard.metadata["process_accuracy"] = process_accuracy
            state.latest_telemetry["part_header_metadata"] = part_header_metadata
            state.latest_telemetry["codescan_hierarchy"] = hierarchical_progress
            state.latest_telemetry["ocr_steering_guide"] = ocr_steering_guide
            state.latest_telemetry["process_accuracy"] = process_accuracy
            state.orchestration_state["part_header_metadata"] = part_header_metadata
            state.orchestration_state["codescan_hierarchy"] = hierarchical_progress
            state.orchestration_state["ocr_steering_guide"] = ocr_steering_guide
            state.orchestration_state["process_accuracy"] = process_accuracy
        except Exception as cs_err:
            print(f"[DocumentAssembleNode] codescan verification note: {cs_err}")

        # Write out reproduced markdown file to disk (throttled during large active capture loops, immediate on completion)
        if is_complete or max_k <= 1000 or loop_iter % 25 == 0 or (now_mono - _last_markdown_disk_flush_mono) >= 0.5:
            _last_markdown_disk_flush_mono = now_mono
            try:
                from pathlib import Path
                out_dir = Path("c:/Projects/Small-Fling/storage")
                out_dir.mkdir(parents=True, exist_ok=True)
                (out_dir / "reproduced_Matrix_main.md").write_text(full_markdown, encoding="utf-8")
                data_dir = out_dir / "data"
                data_dir.mkdir(parents=True, exist_ok=True)
                (data_dir / "reproduced_Matrix_main.md").write_text(full_markdown, encoding="utf-8")
            except Exception as se:
                print(f"[DocumentAssembleNode] File write note: {se}")

        if is_complete and effective_bottom > 0:
            reconciled = state.reconcile_eof_total_lines_and_complete_project(
                actual_eof_line=effective_bottom,
                project_id=blackboard.project_id,
                eof_reason=eof_reason or f"EOF reached at Line {effective_bottom:,}",
            )
            total_lines_target = int(reconciled.get("target_total_lines") or effective_bottom)
            effective_bottom = total_lines_target
            blackboard.total_lines = total_lines_target
        if is_complete:
            pct = 100.0
        else:
            pct = round((max(captured_count, effective_bottom) / total_lines_target * 100) if total_lines_target > 0 else 0, 1)

        blackboard.is_complete = is_complete
        blackboard.lines_count = captured_count

        occluded_shortfall = max(0, total_lines_target - effective_bottom) if (is_complete and total_lines_target > effective_bottom) else 0
        complete_suffix = ""
        if is_complete:
            if occluded_shortfall > 0:
                complete_suffix = f" • 100% COMPLETE at Ln {effective_bottom:,}/{total_lines_target:,} ('Offline' overlay covers last {occluded_shortfall} lines) ✔"
            else:
                complete_suffix = " • 100% COMPLETE ✔"

        ms_brief = codescan_verification.get("markers_summary", {})
        dms_brief = codescan_verification.get("distinct_metrics_summary", {})
        markers_suffix = ""
        if ms_brief.get("total_start_markers", 0) > 0:
            acc_val = process_accuracy.get("overall_accuracy_pct", 100.0)
            markers_suffix = (
                f" • Markers {ms_brief.get('paired_markers_count', 0)}/{ms_brief.get('total_start_markers', 0)} "
                f"(Size:{dms_brief.get('size_matched_count', 0)} "
                f"Lines:{dms_brief.get('lines_matched_count', 0)} "
                f"Chars:{dms_brief.get('chars_matched_count', 0)} "
                f"Acc:{acc_val}%)"
            )

        state.dag_state["nodes"]["document_assemble"].update({
            "status": "completed",
            "total_captured_lines": captured_count,
            "effective_bottom_line": effective_bottom,
            "completion_percent": pct,
            "is_complete": is_complete,
            "offline_eof_completed": bool(is_complete and occluded_shortfall > 0),
            "occluded_tail_lines": occluded_shortfall,
            "loop_iteration": loop_iter,
            "reconstructed_length": len(full_markdown),
            "codescan_verification": codescan_verification,
            "part_header_metadata": part_header_metadata,
            "hierarchical_progress": hierarchical_progress,
            "ocr_steering_guide": ocr_steering_guide,
            "process_accuracy": process_accuracy,
            "evaluator": "Document Integrity & CODESCAN Marker Evaluator",
            "healing_step": None if is_complete else "Capturing next page slice",
            "telemetry_insight": f"Master document: {captured_count}/{total_lines_target or '?'} lines stitched ({pct}%)" + markers_suffix + complete_suffix,
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Document assemble: {captured_count} lines verified" + markers_suffix + (complete_suffix if is_complete else f" ({pct}%)"),
            is_complete=is_complete,
            total_lines=total_lines_target,
            data={
                "total_captured_lines": captured_count,
                "effective_bottom_line": effective_bottom,
                "total_lines_target": total_lines_target,
                "completion_percent": pct,
                "is_complete": is_complete,
                "offline_eof_completed": bool(is_complete and occluded_shortfall > 0),
                "occluded_tail_lines": occluded_shortfall,
                "eof_reason": eof_reason,
                "loop_iteration": loop_iter,
                "reconstructed_length": len(full_markdown),
                "codescan_verification": codescan_verification,
                "part_header_metadata": part_header_metadata,
                "hierarchical_progress": hierarchical_progress,
                "ocr_steering_guide": ocr_steering_guide,
                "process_accuracy": process_accuracy,
            }
        )
