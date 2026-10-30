"""
Observation & Workaround Action: Gutter not showing expected line range, navigating to proper line number.
Detects when the editor viewport's current top/bottom gutter range does not match the expected target top line
(regardless of whether the viewport jumped backward, overshot forward, or is on an arbitrary range),
and deterministically navigates using Page Up / Page Down (keycodes 92/93) and Up/Down arrows (keycodes 19/20)
to align the target top line number on the very first line of the page and continue the DAG flow.
"""

from typing import Dict, Any, Tuple
import cv2
import numpy as np

from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class RecoverGutterRangeAction(ObservationActionPlugin):
    id = "gutter_range_mismatch_recover"
    config_label = "gutter not showing expected range, navigating to target line number"
    category = "position_navigation"
    default_phase = "on_error"
    priority = 28

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        exp_top = ctx.expected_top_line or 0
        cur_top = 0
        cur_bot = 0
        if ctx.blackboard:
            cur_top = getattr(ctx.blackboard, "top_line", 0) or 0
            cur_bot = getattr(ctx.blackboard, "bottom_line", 0) or 0
            if not exp_top:
                exp_top = getattr(ctx.blackboard, "target_next_top", 0) or 0

        mismatch = bool(exp_top > 0 and cur_top > 0 and cur_top != exp_top)
        reason = (
            f"Gutter range mismatch: current Ln {cur_top}..{cur_bot}, expected top Ln {exp_top}"
            if mismatch
            else f"Gutter top line aligned at Ln {cur_top or exp_top}"
        )
        return (
            mismatch,
            reason,
            {
                "expected_top_line": exp_top,
                "current_top_line": cur_top,
                "current_bottom_line": cur_bot,
            },
        )

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from services.adb_service import (
            get_active_adb_serial,
            detect_external_display_id,
            navigate_to_target_top_line,
        )

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)

        exp_top = ctx.expected_top_line or (getattr(ctx.blackboard, "target_next_top", 0) if ctx.blackboard else 0) or 1
        cur_top = getattr(ctx.blackboard, "top_line", 0) if ctx.blackboard else 0
        cur_bot = getattr(ctx.blackboard, "bottom_line", 0) if ctx.blackboard else 0

        nav_res = await navigate_to_target_top_line(
            target_top=exp_top,
            serial=serial,
            display_id=disp_id,
            current_top=cur_top if cur_top > 0 else None,
            current_bottom=cur_bot if cur_bot > 0 else None,
            use_page_keys=True,
            caller_node=ctx.node_id or "gutter_range_recovery",
        )

        reached = bool(nav_res.get("reached", False))
        new_top = int(nav_res.get("actual_top") or exp_top)
        new_bot = int(nav_res.get("actual_bottom") or (new_top + 23))
        snap = nav_res.get("snapshot_bytes")

        if ctx.blackboard:
            ctx.blackboard.top_line = new_top
            ctx.blackboard.bottom_line = new_bot
            if snap:
                ctx.blackboard.latest_frame_bytes = snap
                ctx.blackboard.current_image_bytes = snap
                img_path = getattr(ctx.blackboard, "current_image_path", None)
                if img_path:
                    try:
                        with open(img_path, "wb") as f:
                            f.write(snap)
                    except Exception:
                        pass

        return {
            "status": "success" if reached else "error",
            "success": reached,
            "action_id": self.id,
            "top_line": new_top,
            "bottom_line": new_bot,
            "arrows_pressed": nav_res.get("arrows_pressed", 0),
            "page_keys_pressed": nav_res.get("page_keys_pressed", 0),
            "message": (
                f"Recovered gutter range to Ln {new_top}..{new_bot} via PageUp/PageDown + Arrow alignment"
                if reached
                else f"Gutter range recovery incomplete: settled at Ln {new_top} (target Ln {exp_top})"
            ),
            "actions_taken": nav_res.get("actions_taken", []),
        }

