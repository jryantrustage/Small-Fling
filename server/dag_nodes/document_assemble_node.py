"""
Standalone DAG Node 8: Master Document Assembly & EOF Loopback (document_assemble)
Stitches verified master lines into markdown, computes completion percentage against
Node 1 EOF calibration, and routes loopback to Node 3 or finishes document.
"""

from typing import Dict, Any, Optional

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services import state


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
        cfg = blackboard.config or self.get_config()
        total_lines_target = (
            blackboard.total_lines
            or state.dag_state["nodes"].get("init_end", {}).get("total_lines", 0)
        )
        captured_count = len([k for k, v in state.document_lines.items() if str(v).strip()])
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

        # Write out reproduced markdown file to disk
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
        elif is_eof_dual or (eof_reached_flag and total_lines_target > 0 and effective_bottom >= total_lines_target - 4):
            is_complete = True

        loop_iter = (state.dag_state["nodes"].get("document_assemble", {}).get("loop_iteration") or 0) + 1
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
            "evaluator": "Document Integrity Evaluator",
            "healing_step": None if is_complete else "Capturing next page slice",
            "telemetry_insight": f"Master document: {captured_count}/{total_lines_target or '?'} lines stitched ({pct}%)" + complete_suffix,
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Document assemble: {captured_count} lines verified" + (complete_suffix if is_complete else f" ({pct}%)"),
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
                "reconstructed_length": len(full_markdown)
            }
        )
