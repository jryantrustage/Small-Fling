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
        proj_active = db.get_active_project() or {}
        if payload.get("scroll_padding_lines") is not None:
            padding = int(payload["scroll_padding_lines"])
        elif proj_active.get("scroll_padding_lines") is not None:
            padding = int(proj_active["scroll_padding_lines"])
        else:
            padding = int(cfg.get("scroll_padding_lines", 4))

        needed_scroll = max(1, target_top - cur_top)
        if not is_mock:
            needed_scroll = max(24 if target_top == prev_bottom + 1 else 1, needed_scroll)

        if padding > 0:
            calibrated_init = (needed_scroll + padding) * 2
            calibrated_step = needed_scroll + padding
        else:
            cursor_travel = max(0, prev_bottom - cursor_line) if (cur_top == 1 or cursor_line <= cur_top) else 0
            viewport_scroll = needed_scroll
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
        max_attempts = max(12, int(cfg.get("max_adjust_attempts", 12)))

        # Only perform an open-loop initial step if running inside a fresh fast_loop cycle AND
        # the viewport has not already been moved toward target_top by an earlier attempt/manual click.
        prev_n6 = state.dag_state["nodes"].get("arrow_down", {})
        already_moved = (
            not payload.get("fast_loop")
            or prev_n6.get("status") == "error"
            or state.latest_telemetry.get("current_top_line") == target_top
            or (prev_n6.get("new_top_line") and prev_n6.get("new_top_line") != cur_top)
        )

        total_arrows_pressed = 0
        if not already_moved and dispatch_meth.lower() not in ("page_up_down", "pagedown", "pageup"):
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
            current_top=cur_top if (not already_moved and dispatch_meth.lower() in ("page_up_down", "pagedown", "pageup")) else None,
            current_bottom=prev_bottom if (not already_moved and dispatch_meth.lower() in ("page_up_down", "pagedown", "pageup")) else None,
            lines_per_page=visible_span,
            use_page_keys=use_page_keys,
            max_attempts=max_attempts,
            caller_node="arrow_down"
        )

        snap_after = nav_res.get("snapshot_bytes")
        if snap_after:
            blackboard.current_image_bytes = snap_after
            blackboard.latest_frame_bytes = snap_after
            try:
                temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
                with open(temp_calib, "wb") as f:
                    f.write(snap_after)
            except Exception:
                pass

        matched = bool(nav_res.get("reached", False))
        eof_reached = bool(nav_res.get("eof_reached", False))
        offline_overlay_detected = bool(
            nav_res.get("offline_overlay_detected", False)
            or state.orchestration_state.get("offline_overlay_detected", False)
        )
        actual_top = nav_res.get("actual_top")
        actual_bot = nav_res.get("actual_bottom") or ((actual_top + visible_span - 1) if actual_top else 0)
        total_arrows_pressed += int(nav_res.get("arrows_pressed", 0))
        page_keys_pressed = int(nav_res.get("page_keys_pressed", 0))

        target_total_lines = int(
            blackboard.total_lines
            or state.latest_telemetry.get("target_total_lines")
            or state.headless_telemetry_session.get("target_total_lines")
            or state.dag_state["nodes"].get("init_end", {}).get("total_lines")
            or proj_active.get("target_total_lines")
            or 0
        )

        # Dual-situation EOF check on the last arrow:
        # If previous bottom or actual bottom is at total_lines OR 1..4 lines short (e.g. 32,878 vs 32,881)
        # while the 'Offline' markdown editor overlay is covering the last 3 lines, the scan is complete!
        effective_bot = max(int(prev_bottom or 0), int(actual_bot or 0))
        if not eof_reached and target_total_lines > 0 and effective_bot >= target_total_lines - 4:
            from ocr_engine import detect_offline_editor_overlay, is_eof_reached_with_offline_awareness
            if not offline_overlay_detected and snap_after:
                off_res = detect_offline_editor_overlay(snap_after, use_ocr=True)
                offline_overlay_detected = bool(off_res.get("detected"))
            tail_txt = ""
            if state.document_lines:
                t_keys = sorted(state.document_lines.keys())[-6:]
                tail_txt = "\n".join(str(state.document_lines.get(k, "")) for k in t_keys)
            is_eof, _ = is_eof_reached_with_offline_awareness(
                bottom_line=effective_bot,
                total_lines=target_total_lines,
                offline_detected=offline_overlay_detected,
                tail_text=tail_txt,
            )
            if is_eof:
                matched = True
                eof_reached = True

        # Contiguous Overlap Continuity Guarantee:
        # If the viewport advanced past cur_top and settled with a small overlap (actual_top <= target_top)
        # while including target_top..actual_bot (actual_bot > prev_bottom), ZERO lines are skipped!
        # Never halt the replication pipeline when there is zero gap and genuine forward progress.
        if (
            not matched
            and actual_top
            and actual_top > 0
            and max(1, target_top - 6) <= actual_top <= target_top
            and actual_bot > prev_bottom
            and (actual_top > cur_top or target_top <= 2)
        ):
            matched = True

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
                "eof_reached": False,
                "evaluator": "Pacing & Alignment Evaluator",
                "error": error_msg,
                "telemetry_insight": f"Alignment failed: top is Line {actual_top}, expected Line {target_top} ⛔"
            })
            raise RuntimeError(error_msg)

        settled_top = int(actual_top) if (actual_top and 0 < actual_top <= target_top) else target_top
        if eof_reached and effective_bot > 0:
            reconciled = state.reconcile_eof_total_lines_and_complete_project(
                actual_eof_line=effective_bot,
                eof_reason=nav_res.get("eof_reason") or f"EOF reached at Line {effective_bot:,}",
            )
            effective_bot = int(reconciled.get("target_total_lines") or effective_bot)
            target_total_lines = effective_bot
            blackboard.total_lines = effective_bot
        state.orchestration_state["cursor_line"] = effective_bot if eof_reached else new_cursor_line
        state.orchestration_state["last_arrow_count"] = total_arrows_pressed
        state.orchestration_state["next_target_top"] = settled_top
        state.orchestration_state["eof_reached"] = eof_reached
        state.orchestration_state["offline_overlay_detected"] = offline_overlay_detected
        state.latest_telemetry["current_top_line"] = settled_top
        if eof_reached and effective_bot > 0:
            state.latest_telemetry["current_bottom_line"] = effective_bot
            blackboard.bottom_line = effective_bot
        blackboard.top_line = settled_top
        blackboard.arrow_count = total_arrows_pressed

        occluded_cnt = max(0, target_total_lines - effective_bot) if (eof_reached and target_total_lines > 0) else 0
        if eof_reached:
            insight_str = (
                f"Last arrow verified at EOF: Line {effective_bot:,} of {target_total_lines:,} "
                + (
                    f"('Offline' editor overlay covers last {occluded_cnt} lines) — scan complete ✔"
                    if occluded_cnt > 0
                    else "(100% EOF reached) ✔"
                )
            )
        else:
            insight_str = f"Stepped {total_arrows_pressed} down/up arrows: target top Line {settled_top} verified ✔"

        state.dag_state["nodes"]["arrow_down"].update({
            "status": "completed",
            "arrow_count": total_arrows_pressed,
            "step_count": total_arrows_pressed,
            "prev_bottom": prev_bottom,
            "target_top_line": settled_top,
            "target_top": settled_top,
            "new_top_line": settled_top,
            "reached": True,
            "advanced": True,
            "eof_reached": eof_reached,
            "offline_overlay_detected": offline_overlay_detected,
            "occluded_tail_lines": occluded_cnt,
            "evaluator": "Pacing & Alignment Evaluator",
            "telemetry_insight": insight_str,
            "error": None
        })

        if "verification_trigger" in state.dag_state["nodes"]:
            state.dag_state["nodes"]["verification_trigger"].update({
                "target_top_line": settled_top,
                "target_top": settled_top,
                "expected_top": settled_top,
                "eof_reached": eof_reached,
            })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=insight_str,
            data={
                "arrow_count": total_arrows_pressed,
                "step_count": total_arrows_pressed,
                "prev_bottom": prev_bottom,
                "target_top_line": settled_top,
                "target_top": settled_top,
                "new_top_line": settled_top,
                "cursor_line": effective_bot if eof_reached else new_cursor_line,
                "reached": True,
                "advanced": True,
                "eof_reached": eof_reached,
                "offline_overlay_detected": offline_overlay_detected,
                "occluded_tail_lines": occluded_cnt,
            }
        )


ArrowDownNode = ArrowDownPagerNode
