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
    dispatch_accelerated_viewport_step
)
from services import state
from services.visual_state_service import assert_markdown_open, run_editor_recovery_node
from ocr_engine import detect_top_line_from_image, find_gutter_numbers_cluster
import db


class ArrowDownPagerNode(BaseDagNode):
    id = "arrow_down"
    node_id = "arrow_down"
    title = "6. Arrow Down Pager"
    short_name = "Arrow Down"
    category = "capture_entire_markdown"
    accent_color = "#3b82f6"
    default_position = {"x": 1160.0, "y": 140.0}
    default_config = {
        "scroll_padding_lines": 4,
        "max_adjust_attempts": 7,
        "dispatch_method": "arrow_down"
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        cfg = blackboard.config or self.default_config
        is_mock = serial and "mock" in str(serial).lower()

        # Resolve prior page bottom line number
        payload = blackboard.payload or {}
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
                or 31
            )

        target_top = prev_bottom + 1

        cur_top = (
            int(payload.get("cur_top")) if payload.get("cur_top") is not None
            else (
                blackboard.top_line
                or state.dag_state["nodes"].get("frame_ocr", {}).get("top_line")
                or state.latest_telemetry.get("current_top_line")
                or 1
            )
        )

        cursor_line = (
            int(payload["cursor_line"]) if payload.get("cursor_line") is not None
            else state.orchestration_state.get("cursor_line")
        )
        if cursor_line is None:
            cursor_line = 1 if cur_top == 1 else cur_top

        # Viewport scroll padding
        padding = int(cfg.get("scroll_padding_lines", 4))
        if payload.get("scroll_padding_lines") is not None:
            padding = int(payload["scroll_padding_lines"])

        visible_span = max(1, prev_bottom - cur_top + 1)
        needed_lines = max(1, target_top - cur_top)
        if padding > 0:
            calibrated_step = needed_lines + padding
            calibrated_init = (needed_lines + padding) * 2
        else:
            cursor_travel = max(0, prev_bottom - cursor_line)
            viewport_scroll = max(1, target_top - cur_top)
            calibrated_init = cursor_travel + viewport_scroll
            calibrated_step = viewport_scroll

        step_arrows = int(payload.get("arrow_count_step") or calibrated_step)
        init_arrows = int(payload.get("arrow_count_init") or calibrated_init)

        if cur_top == 1 or cursor_line <= cur_top:
            tracked_arrow_count = init_arrows
        else:
            tracked_arrow_count = step_arrows

        new_cursor_line = target_top + (prev_bottom - cur_top)
        state.orchestration_state["cursor_line"] = new_cursor_line
        state.orchestration_state["scroll_padding_lines"] = padding

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

        # 2. Viewport step dispatch
        dispatch_meth = str(cfg.get("dispatch_method", "arrow_down"))
        await dispatch_accelerated_viewport_step(
            delta_lines=tracked_arrow_count,
            serial=serial,
            display_id=valid_disp_id,
            method=dispatch_meth
        )

        total_arrows_pressed = tracked_arrow_count
        await asyncio.sleep(0.18)
        await dismiss_keyboard(serial, valid_disp_id)

        # 3. Closed-loop verification loop
        max_attempts = int(cfg.get("max_adjust_attempts", 7))
        matched = False
        actual_top = None

        for _ in range(max_attempts):
            snap = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if not snap:
                await asyncio.sleep(0.12)
                continue

            img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
            actual_top, meta = detect_top_line_from_image(img, target_top=target_top)
            gutter = find_gutter_numbers_cluster(img)
            first_gutter = gutter[0][1] if gutter else actual_top

            if actual_top == target_top or first_gutter == target_top:
                matched = True
                break

            diff = target_top - (actual_top or target_top)
            if diff > 0:
                adjust_step = min(diff, 25)
                keys = " ".join(["20"] * adjust_step)
                total_arrows_pressed += adjust_step
                await run_adb_shell(f"input -d {valid_disp_id} keyevent {keys}", serial)
            else:
                diff_up = abs(diff)
                adjust_step = min(diff_up, 25)
                keys = " ".join(["19"] * adjust_step)
                total_arrows_pressed += adjust_step
                await run_adb_shell(f"input -d {valid_disp_id} keyevent {keys}", serial)

            await asyncio.sleep(0.18)
            await dismiss_keyboard(serial, valid_disp_id)

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
