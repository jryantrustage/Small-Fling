"""
Standalone DAG Node 7: Verification & Qualifier Trigger (verification_trigger)
Validates continuity invariant gate T_{k+1} == B_k + 1 and environmental qualifier conditions.
"""

import asyncio
from datetime import datetime
from typing import Dict, Any, Optional

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot
)
from services import state


class VerificationTriggerNode(BaseDagNode):
    step = "7"
    id = "verification_trigger"
    node_id = "verification_trigger"
    title = "7. Verification & Qualifier Trigger"
    short_name = "Verify Trigger"
    category = "verify_assemble"
    accent_color = "#58a6ff"
    default_position = {"x": 1380.0, "y": 140.0}
    default_config = {
        "prevent_trigger_on_issue": True,
        "strict_continuity": True,
        "auto_heal_qualifiers": True
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        from routers.orchestration import evaluate_node_5_decision, auto_heal_pipeline_environment
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        cfg = blackboard.config or self.get_config()

        # 1. Guard check: arrow_down must have reached target line
        n6_info = state.dag_state["nodes"].get("arrow_down", {})
        if (
            n6_info.get("status") in ("error", "prevented")
            or n6_info.get("reached") is not True
            or n6_info.get("advanced") is not True
            or (n6_info.get("new_top_line") and n6_info.get("target_top") and n6_info.get("new_top_line") != n6_info.get("target_top"))
        ):
            err_msg = (
                f"Verification trigger blocked: Node 6 (arrow_down) failed to position target line "
                f"{n6_info.get('target_top')} on top (settled at {n6_info.get('new_top_line')}). "
                f"Halting loop to prevent duplicate or corrupted capture."
            )
            state.dag_state["nodes"]["verification_trigger"].update({
                "status": "prevented",
                "evaluator": "Completion Qualifier Evaluator",
                "telemetry_insight": "Trigger blocked: Node 6 navigation failed ⛔",
                "error": err_msg,
                "trigger_decision": {"allowed": False, "prevented": True, "reasons": [err_msg]}
            })
            return NodeExecutionResult(
                status="prevented",
                node_id=self.node_id,
                message=err_msg,
                error=err_msg,
                data={"allowed": False, "prevented": True}
            )

        target_top = (
            blackboard.top_line
            or state.dag_state["nodes"].get("verification_trigger", {}).get("target_top_line")
            or (state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line", 31) + 1)
        )

        temp_calib = blackboard.current_image_path or (state.FRAMES_DIR / "dag_node3_capture_temp.png")
        snap_bytes = blackboard.current_image_bytes or (temp_calib.read_bytes() if temp_calib.exists() else None)

        decision = await evaluate_node_5_decision(serial, image_bytes=snap_bytes)
        allowed = decision.get("allowed", False)

        # 2. Auto-heal environment if prevented by qualifiers
        if not allowed and cfg.get("auto_heal_qualifiers", True):
            reasons_str = ", ".join(decision.get("reasons", []))
            state.dag_state["nodes"]["verification_trigger"].update({
                "evaluator": "Environmental Trigger Auto-Healer",
                "healing_step": f"Auto-resolving trigger issues: {reasons_str}",
                "telemetry_insight": f"Trigger blocked ({reasons_str}) • Self-healing environment..."
            })
            await auto_heal_pipeline_environment(serial, disp_id, "verification_trigger", snap_bytes)

            fresh_snap = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if fresh_snap:
                snap_bytes = fresh_snap
                blackboard.current_image_bytes = fresh_snap
                blackboard.latest_frame_bytes = fresh_snap
                with open(temp_calib, "wb") as f:
                    f.write(fresh_snap)

            decision = await evaluate_node_5_decision(serial, image_bytes=snap_bytes)
            allowed = decision.get("allowed", False)

        if not allowed:
            reasons_list = decision.get("reasons", [])
            reasons_str = ", ".join(reasons_list)
            err_msg = f"Verification trigger qualifiers blocked without determined fix: {reasons_str}"
            state.dag_state["nodes"]["verification_trigger"].update({
                "status": "error",
                "target_top_line": target_top,
                "target_top": target_top,
                "expected_top": target_top,
                "evaluator": "Completion Qualifier Evaluator",
                "telemetry_insight": f"Unresolvable trigger issue: {reasons_str} ⛔",
                "error": err_msg,
                "trigger_decision": decision
            })
            raise RuntimeError(err_msg)

        state.dag_state["nodes"]["verification_trigger"].update({
            "status": "completed",
            "target_top_line": target_top,
            "target_top": target_top,
            "expected_top": target_top,
            "evaluator": "Completion Qualifier Evaluator",
            "telemetry_insight": f"Target Line {target_top} qualified for loopback ✔",
            "error": None,
            "trigger_decision": decision
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Trigger qualified for Target Top Ln {target_top} ✔",
            top_line=target_top,
            data={
                "target_top_line": target_top,
                "trigger_decision": decision,
                "allowed": True,
                "prevented": False
            }
        )
