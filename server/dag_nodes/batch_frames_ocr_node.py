"""
Standalone DAG Node 9: Batch Sequential Frames OCR (batch_frames_ocr)
Repeats the high-precision OCR gutter alignment and selective line crop rescan
across every captured frame in sequential order from top to bottom, resolving
misalignments, reconstructing verified master lines, and updating the ledger.
"""

from typing import Dict, Any, Optional

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services import state


class BatchFramesOcrNode(BaseDagNode):
    step = "9"
    id = "batch_frames_ocr"
    node_id = "batch_frames_ocr"
    title = "9. Batch Sequential Frames OCR"
    short_name = "Batch OCR Rescan"
    category = "verify_assemble"
    accent_color = "#00ff9d"
    default_position = {"x": 1820.0, "y": 140.0}
    default_config = {
        "clear_existing": False,
        "auto_save_markdown": True
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        from services.ocr_service import sequential_rescan_all_frames_task

        cfg = blackboard.config or self.get_config()
        clear_existing = bool(
            cfg.get("clear_existing", False)
            or (blackboard.payload and blackboard.payload.get("clear_existing", False))
        )
        frame_ids = blackboard.payload.get("frame_ids") if blackboard.payload else None

        res = await sequential_rescan_all_frames_task(
            project_id=state.get_current_project_id(),
            frame_ids=frame_ids,
            clear_existing=clear_existing
        )

        is_success = res.get("status") == "success"
        msg = res.get("message", "Sequential rescan completed")

        state.dag_state["nodes"].setdefault("batch_frames_ocr", {}).update({
            "status": "completed" if is_success else "error",
            "frames_processed": res.get("frames_processed", 0),
            "total_verified_lines": res.get("total_document_lines", 0),
            "telemetry_insight": msg,
            "error": None if is_success else msg
        })

        return NodeExecutionResult(
            status="success" if is_success else "error",
            node_id=self.node_id,
            message=msg,
            data=res
        )
