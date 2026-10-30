"""
Standalone DAG Node 6: Arrow Down Pager (arrow_down)
Caret-aware closed-loop DPAD_DOWN stride and non-unpinning micro-trim to align
the prior page bottom line number + 1 to the top first line of the new page.
"""

import asyncio
import json
import time
from typing import Dict, Any, Optional

import cv2
import numpy as np

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, sanitize_input_display_id,
    dismiss_keyboard, run_adb_shell, capture_external_screenshot,
    dispatch_accelerated_viewport_step, navigate_to_target_top_line,
    get_display_dimensions, fetch_current_display_dpi_factor, DEVICE_PROFILES, current_device_model
)
from services import state
from services.visual_state_service import assert_markdown_open, run_editor_recovery_node
from ocr_engine import detect_top_line_from_image, find_gutter_numbers_cluster
import db


class ArrowDownPagerNode(BaseDagNode):
    step = "6"
    id = "arrow_down"
    node_id = "arrow_down"
    title = "6. Viewport Navigation (Down Arrow)"
    short_name = "Scroll Down"
    category = "position_navigation"
    accent_color = "#ffa657"
    default_position = {"x": 1160.0, "y": 140.0}
    default_config = {
        "scroll_padding_lines": 4,
        "max_adjust_attempts": 10,
        "dispatch_method": "arrow_down",
        "use_page_keys": True
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        cfg = blackboard.config or self.get_config()
        is_mock = serial and "mock" in str(serial).lower()

        # Resolve starting/current top line and prior page bottom line number
        payload = blackboard.payload or {}
        cur_top = (
            int(payload.get("cur_top")) if payload.get("cur_top") is not None
            else (
                blackboard.top_line
                or state.dag_state["nodes"].get("frame_ocr", {}).get("top_line")
                or state.latest_telemetry.get("current_top_line")
                or 1
            )
        )

        if payload.get("prev_bottom"):
            prev_bottom = int(payload["prev_bottom"])
        elif payload.get("target_top"):
            prev_bottom = int(payload["target_top"]) - 1
        elif blackboard.bottom_line > 0:
            prev_bottom = blackboard.bottom_line
        else:
            prev_bottom = (
                state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line")
                or state.latest_telemetry.get("current_bottom_line")
                or state.orchestration_state.get("bottom_line")
                or 24
            )

        # Never allow an inverted/truncated bottom line (< cur_top) to trigger a backward scroll!
        if prev_bottom < cur_top:
            prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_8", {"lines_per_page": 24}))
            lpp = state.orchestration_state.get("viewport_lines") or prof.get("lines_per_page", 24)
            prev_bottom = cur_top + lpp - 1

        target_top = prev_bottom + 1

        cursor_line = (
            int(payload["cursor_line"]) if payload.get("cursor_line") is not None
            else state.orchestration_state.get("cursor_line")
        )
        if cursor_line is None:
            cursor_line = 1 if cur_top == 1 else cur_top

        visible_span = max(1, prev_bottom - cur_top + 1)
        needed_scroll = max(1, target_top - cur_top)
        padding = int(payload.get("scroll_padding_lines") if payload.get("scroll_padding_lines") is not None else cfg.get("scroll_padding_lines", 0))

        if padding > 0:
            calibrated_init = (needed_scroll + padding) * 2
            calibrated_step = needed_scroll + padding
        else:
            cursor_travel = max(0, prev_bottom - cursor_line)
            viewport_scroll = max(1, target_top - cur_top)
            calibrated_init = cursor_travel + viewport_scroll
            calibrated_step = viewport_scroll

        if cur_top == 1 or cursor_line <= cur_top:
            calibrated_stride = calibrated_init
        else:
            calibrated_stride = calibrated_step

        tracked_arrow_count = int(payload.get("arrow_count") or payload.get("arrow_count_step") or calibrated_stride)

        new_cursor_line = target_top + (prev_bottom - cur_top)
        state.orchestration_state["cursor_line"] = new_cursor_line
        state.orchestration_state["last_arrow_count"] = tracked_arrow_count

        if is_mock:
            state.dag_state["nodes"]["arrow_down"].update({
                "status": "completed",
                "arrow_count": tracked_arrow_count,
                "step_count": tracked_arrow_count,
                "prev_bottom": prev_bottom,
                "target_top_line": target_top,
                "target_top": target_top,
                "new_top_line": target_top,
                "cursor_line": new_cursor_line,
                "reached": True,
                "advanced": True,
                "evaluator": "Pacing & Alignment Evaluator",
                "telemetry_insight": f"Stepped {tracked_arrow_count} down arrows to align prior page bottom ({prev_bottom}) + 1 → target top Line {target_top} ✔",
                "error": None
            })
            return NodeExecutionResult(
                status="success",
                node_id=self.node_id,
                message=f"Stepped {tracked_arrow_count} down arrows to target top Ln {target_top} ✔",
                data={
                    "arrow_count": tracked_arrow_count,
                    "step_count": tracked_arrow_count,
                    "prev_bottom": prev_bottom,
                    "target_top_line": target_top,
                    "target_top": target_top,
                    "new_top_line": target_top,
                    "cursor_line": new_cursor_line,
                    "reached": True,
                    "advanced": True
                }
            )

        # 1. Assert Markdown editor open
        markdown_open, reason, _ = await assert_markdown_open(serial)
        if not markdown_open:
            rec_res = await run_editor_recovery_node(serial, disp_id)
            if not rec_res.get("success"):
                raise RuntimeError(f"Navigation blocked: Markdown editor is not open ({reason}) and recovery failed.")

        valid_disp_id = sanitize_input_display_id(disp_id)
        await dismiss_keyboard(serial, valid_disp_id)
        await asyncio.sleep(0.05)

        # 2. Viewport step dispatch & closed-loop PageUp/PageDown + Arrow alignment
        dispatch_meth = str(payload.get("dispatch_method") or cfg.get("dispatch_method", "arrow_down"))
        use_page_keys = bool(payload.get("use_page_keys", cfg.get("use_page_keys", True)))
        max_attempts = int(cfg.get("max_adjust_attempts", 10))

        total_arrows_pressed = 0
        if dispatch_meth.lower() not in ("page_up_down", "pagedown", "pageup"):
            await dispatch_accelerated_viewport_step(
                delta_lines=tracked_arrow_count,
                serial=serial,
                display_id=valid_disp_id,
                method=dispatch_meth
            )
            total_arrows_pressed = tracked_arrow_count
            await asyncio.sleep(0.18)
            await dismiss_keyboard(serial, valid_disp_id)

        # 3. Closed-loop verification & deterministic PageUp/PageDown + Arrow alignment to target_top
        nav_res = await navigate_to_target_top_line(
            target_top=target_top,
            serial=serial,
            display_id=valid_disp_id,
            current_top=cur_top if dispatch_meth.lower() in ("page_up_down", "pagedown", "pageup") else None,
            current_bottom=prev_bottom if dispatch_meth.lower() in ("page_up_down", "pagedown", "pageup") else None,
            lines_per_page=visible_span,
            use_page_keys=use_page_keys,
            max_attempts=max_attempts,
            caller_node="arrow_down"
        )

        matched = bool(nav_res.get("reached", False))
        actual_top = nav_res.get("actual_top")
        total_arrows_pressed += int(nav_res.get("arrows_pressed", 0))
        page_keys_pressed = int(nav_res.get("page_keys_pressed", 0))

        if not matched:
            error_msg = (
                f"Navigation alignment blocked: Expected top Line {target_top} "
                f"(previous page bottom {prev_bottom} + 1), but viewport settled at Line {actual_top or 'unknown'}. "
                f"Halting capture to prevent gaps or duplicate pages."
            )
            state.dag_state["nodes"]["arrow_down"].update({
                "status": "error",
                "arrow_count": total_arrows_pressed,
                "target_top_line": target_top,
                "target_top": target_top,
                "new_top_line": actual_top or cur_top,
                "reached": False,
                "advanced": False,
                "evaluator": "Pacing & Alignment Evaluator",
                "error": error_msg,
                "telemetry_insight": f"Alignment failed: top is Line {actual_top}, expected Line {target_top} ⛔"
            })
            raise RuntimeError(error_msg)

        state.orchestration_state["cursor_line"] = new_cursor_line
        state.orchestration_state["last_arrow_count"] = total_arrows_pressed
        state.orchestration_state["next_target_top"] = target_top
        state.latest_telemetry["current_top_line"] = target_top
        blackboard.top_line = target_top
        blackboard.arrow_count = total_arrows_pressed

        state.dag_state["nodes"]["arrow_down"].update({
            "status": "completed",
            "arrow_count": total_arrows_pressed,
            "step_count": total_arrows_pressed,
            "prev_bottom": prev_bottom,
            "target_top_line": target_top,
            "target_top": target_top,
            "new_top_line": target_top,
            "reached": True,
            "advanced": True,
            "evaluator": "Pacing & Alignment Evaluator",
            "telemetry_insight": f"Stepped {total_arrows_pressed} down/up arrows: target top Line {target_top} verified ✔",
            "error": None
        })

        if "verification_trigger" in state.dag_state["nodes"]:
            state.dag_state["nodes"]["verification_trigger"].update({
                "target_top_line": target_top,
                "target_top": target_top,
                "expected_top": target_top
            })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Stepped {total_arrows_pressed} down arrows: Target top Ln {target_top} verified ✔",
            data={
                "arrow_count": total_arrows_pressed,
                "step_count": total_arrows_pressed,
                "prev_bottom": prev_bottom,
                "target_top_line": target_top,
                "target_top": target_top,
                "new_top_line": target_top,
                "cursor_line": new_cursor_line,
                "reached": True,
                "advanced": True
            }
        )


ArrowDownNode = ArrowDownPagerNode
