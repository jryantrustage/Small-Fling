"""
Standalone DAG Node 1: Determine Total Lines (Ctrl+End)
Calibrates EOF total lines via gutter focus + Ctrl+End / scrollbar track jump.
"""

import asyncio
from typing import Dict, Any, Optional
from pathlib import Path
from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, send_hid_keycombination,
    capture_external_screenshot, dismiss_keyboard, run_adb_shell,
    fetch_current_display_dpi_factor, get_display_dimensions
)
from services import state
import db


class InitEndNode(BaseDagNode):
    id = "init_end"
    node_id = "init_end"
    title = "1. Determine Total Lines (Ctrl+End)"
    short_name = "Determine Lines"
    category = "initialize"
    accent_color = "#58a6ff"
    default_position = {"x": 60.0, "y": 140.0}
    default_config = {
        "key1": 113,
        "key2": 123,
        "settle_delay_ms": 1200,
        "manual_total_lines": 0
    }

    def __init__(self):
        super().__init__()
        self.attached_actions = [
            "keyboard_detected_close",
            "editor_not_focused_gain_focus"
        ]

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        cfg = blackboard.config or self.default_config
        calib = state.FRAMES_DIR / "dag_node1_end.png"

        # Auto-dismiss any lingering ANR dialogs before attempting editor calibration
        try:
            from services.adb_service import dismiss_anr_dialogs
            await dismiss_anr_dialogs(serial, disp_id)
        except Exception:
            pass

        # 0. Ensure editor content is focused and physical keyboard assistant overlay is in the title bar
        try:
            from services.adb_service import ensure_editor_content_focused
            await ensure_editor_content_focused(serial, disp_id)
        except Exception as fe:
            print(f"[InitEndNode] Focus pre-check note: {fe}")

        # 1. Dispatch pure HID Ctrl+End to navigate to EOF
        await send_hid_keycombination(113, 123, serial=serial, caller_node="init_end")
        settle_s = max(0.8, float(cfg.get("settle_delay_ms", 1200)) / 1000.0)
        await asyncio.sleep(settle_s)
        await dismiss_keyboard(serial, disp_id)

        # 3. Normalized DPI factor
        dpi_factor, active_dpi = await fetch_current_display_dpi_factor(serial, disp_id)
        blackboard.dpi_factor = dpi_factor
        blackboard.active_dpi = active_dpi

        total_lines = 0
        top_line = 0
        prev_bot = -1
        stable_count = 0

        for sample_idx in range(6):
            snap = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if snap:
                with open(calib, "wb") as f:
                    f.write(snap)
                blackboard.current_image_path = calib
                blackboard.current_image_bytes = snap

                t_sample, b_sample = await state.detect_gutter_bounds_in_process(calib, dpi_factor=dpi_factor)
                if b_sample <= 0:
                    scan_res = await state.scan_image_in_process(calib)
                    b_sample = scan_res.get("bottom_line", 0)
                    if t_sample <= 0:
                        t_sample = scan_res.get("top_line", 0)

                if b_sample > total_lines:
                    total_lines = b_sample
                if t_sample > 0:
                    top_line = t_sample

                if b_sample > 0 and b_sample == prev_bot:
                    stable_count += 1
                    if stable_count >= 2:
                        break
                elif b_sample > 0:
                    stable_count = 1
                    prev_bot = b_sample

            await asyncio.sleep(0.35)

        # Dismiss soft keyboard to reveal bottom-most lines
        await dismiss_keyboard(serial, disp_id)
        snap_fixed = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
        if snap_fixed:
            with open(calib, "wb") as f:
                f.write(snap_fixed)
            t_fix, b_fix = await state.detect_gutter_bounds_in_process(calib, dpi_factor=dpi_factor)
            if b_fix > total_lines:
                total_lines = b_fix
            if t_fix > 0:
                top_line = t_fix

        # Evaluate if stuck on line 1 or partial scroll
        is_stuck = False
        if cfg.get("manual_total_lines", 0) > 0:
            total_lines = int(cfg["manual_total_lines"])
        elif total_lines < 500 and (top_line <= 30 or total_lines <= 0):
            is_stuck = True

        # If blocked by lack of editor focus, queue an automated recovery event to restore focus and retry
        if is_stuck:
            from services.dag_event_queue import queue_dag_event
            from services.adb_service import ensure_editor_content_focused

            async def _automated_focus_recovery():
                # 1. Bring Teams task to front and tap editor content
                await ensure_editor_content_focused(serial, disp_id)
                await asyncio.sleep(0.15)
                # 2. Re-dispatch Ctrl+End
                await send_hid_keycombination(113, 123, serial=serial, caller_node="init_end_event_recovery")
                await asyncio.sleep(settle_s)
                await dismiss_keyboard(serial, disp_id)

                snap_r = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
                if snap_r:
                    with open(calib, "wb") as f: f.write(snap_r)
                    r_top, r_bot = await state.detect_gutter_bounds_in_process(calib, dpi_factor=dpi_factor)
                    if r_bot <= 0:
                        sr = await state.scan_image_in_process(calib)
                        r_bot = sr.get("bottom_line", 0)
                        if r_top <= 0: r_top = sr.get("top_line", 0)
                    return {"top_line": r_top, "total_lines": r_bot}
                return {"top_line": 0, "total_lines": 0}

            evt_res = await queue_dag_event(
                event_type="editor_focus_lost",
                category="FOCUS",
                message=f"Editor focus lost: Ctrl+End failed (Ln {top_line or 1}). Queued automated focus recovery event.",
                node_id=self.node_id,
                serial=serial,
                display_id=disp_id,
                automated_steps=[
                    {"step": 1, "action": "cmd activity task to-front", "target": "com.microsoft.teams"},
                    {"step": 2, "action": "reposition_keyboard_assistant_overlay", "target": "yellow bounding box in title bar"},
                    {"step": 3, "action": "input tap editor text canvas", "target": "editor body at (x=450, y=360)"},
                    {"step": 4, "action": "dismiss soft keyboard", "target": "enforce physical keyboard layout"},
                    {"step": 5, "action": "re-dispatch Ctrl+End", "target": "navigate to EOF"}
                ],
                handler=_automated_focus_recovery
            )

            if evt_res.get("status") == "resolved" and isinstance(evt_res.get("result"), dict):
                recovered = evt_res["result"]
                rec_top = recovered.get("top_line", 0)
                rec_bot = recovered.get("total_lines", 0)
                if rec_bot > total_lines: total_lines = rec_bot
                if rec_top > 0: top_line = rec_top
                if total_lines >= 500 or top_line > 30:
                    is_stuck = False
                    blackboard.actions_run.append("[Automated Event] Editor focus restored and Ctrl+End navigated to EOF ✔")

        if is_stuck:
            raise RuntimeError(
                f"EOF Navigation Failed: Editor still displays Line {top_line or 1} at top (bottom line: {total_lines}). Ctrl+End did not navigate to the end of the file."
            )

        # Update state and blackboard
        blackboard.total_lines = total_lines
        blackboard.top_line = top_line
        blackboard.bottom_line = total_lines

        pid = blackboard.project_id or state.get_current_project_id()
        if pid and total_lines > 0:
            db.update_project_target_lines(pid, total_lines)

        state.dag_state["nodes"]["init_end"].update({
            "status": "completed",
            "total_lines": total_lines,
            "evaluator": "EOF Gutter Evaluator",
            "telemetry_insight": f"Calibrated {total_lines:,} total lines at EOF ✔",
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Calibrated {total_lines:,} total lines at EOF ✔",
            total_lines=total_lines,
            top_line=top_line,
            bottom_line=total_lines,
            data={"total_lines": total_lines, "top_line": top_line}
        )
