"""
Standalone DAG Node 8: Master Document Assembly & EOF Loopback (document_assemble)
Stitches verified master lines into markdown, computes completion percentage against
Node 1 EOF calibration, and routes loopback to Node 3 or finishes document.
"""

from typing import Dict, Any, Optional

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services import state


class DocumentAssembleNode(BaseDagNode):
    id = "document_assemble"
    node_id = "document_assemble"
    title = "8. Master Document Assembly & EOF"
    short_name = "Document Assembly"
    category = "loop_governance"
    accent_color = "#10b981"
    default_position = {"x": 1600.0, "y": 140.0}
    default_config = {
        "auto_save_markdown": True,
        "completion_threshold_pct": 100.0
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        total_lines_target = (
            blackboard.total_lines
            or state.dag_state["nodes"].get("init_end", {}).get("total_lines", 0)
        )
        captured_count = len([k for k, v in state.document_lines.items() if str(v).strip()])
        latest_bottom = blackboard.bottom_line or state.latest_telemetry.get("current_bottom_line", 0)

        doc_lines = []
        for k in sorted(state.document_lines.keys()):
            val = state.document_lines[k]
            if isinstance(val, dict):
                doc_lines.append(val.get("text", ""))
            elif hasattr(val, "text"):
                doc_lines.append(val.text)
            else:
                doc_lines.append(str(val))
        full_markdown = "\n".join(doc_lines)

        is_complete = False
        if total_lines_target > 0 and latest_bottom >= total_lines_target:
            is_complete = True
        elif total_lines_target > 0 and captured_count >= total_lines_target:
            is_complete = True

        loop_iter = (state.dag_state["nodes"].get("document_assemble", {}).get("loop_iteration") or 0) + 1
        pct = round((captured_count / total_lines_target * 100) if total_lines_target > 0 else 0, 1)

        blackboard.is_complete = is_complete
        blackboard.lines_count = captured_count

        state.dag_state["nodes"]["document_assemble"].update({
            "status": "completed",
            "total_captured_lines": captured_count,
            "completion_percent": pct,
            "is_complete": is_complete,
            "loop_iteration": loop_iter,
            "reconstructed_length": len(full_markdown),
            "evaluator": "Document Integrity Evaluator",
            "healing_step": None if is_complete else "Capturing next page slice",
            "telemetry_insight": f"Master document: {captured_count}/{total_lines_target or '?'} lines stitched ({pct}%)" + (" • 100% COMPLETE ✔" if is_complete else ""),
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Document assemble: {captured_count} lines verified" + (" (COMPLETE ✔)" if is_complete else f" ({pct}%)"),
            is_complete=is_complete,
            total_lines=total_lines_target,
            data={
                "total_captured_lines": captured_count,
                "total_lines_target": total_lines_target,
                "completion_percent": pct,
                "is_complete": is_complete,
                "loop_iteration": loop_iter,
                "reconstructed_length": len(full_markdown)
            }
        )
