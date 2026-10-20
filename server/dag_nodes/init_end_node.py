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

        # 1. Enforce Markdown exclusively on desktop display & maximize viewport
        try:
            from services.adb_service import enforce_markdown_only_on_desktop, auto_fix_viewport
            await enforce_markdown_only_on_desktop(serial, disp_id)
            await auto_fix_viewport(serial, disp_id)
        except Exception:
            pass
        disp_w, disp_h = await get_display_dimensions(serial, disp_id)
        focus_x = min(disp_w // 3, 500) if disp_w > 0 else 500
        focus_y = min(disp_h // 2, 500) if disp_h > 0 else 500
        # Tap editor canvas to focus without keeping soft keyboard open
        await run_adb_shell(f"input -d {disp_id} tap {focus_x} {focus_y} >/dev/null 2>&1", serial)
        await asyncio.sleep(0.08)
        await dismiss_keyboard(serial, disp_id)
        await asyncio.sleep(0.08)

        # 2. Dispatch Ctrl+End to navigate to EOF
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
                if t_sample > 0 and (top_line == 0 or t_sample < top_line):
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
            if t_fix > 0 and (top_line <= 0 or t_fix < top_line):
                top_line = t_fix

        # Evaluate if stuck on line 1 or partial scroll
        is_stuck = False
        if cfg.get("manual_total_lines", 0) > 0:
            total_lines = int(cfg["manual_total_lines"])
        elif 0 < top_line <= 15 or (total_lines < 500 and top_line <= 30):
            is_stuck = True

        # Retry jump if stuck
        if is_stuck:
            await run_adb_shell(f"input -d {disp_id} tap {focus_x} {focus_y} >/dev/null 2>&1", serial)
            await asyncio.sleep(0.08)
            await dismiss_keyboard(serial, disp_id)
            await asyncio.sleep(0.08)
            await send_hid_keycombination(113, 123, serial=serial, caller_node="init_end_retry")
            await asyncio.sleep(1.0)
            await dismiss_keyboard(serial, disp_id)

            snap_retry = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if snap_retry:
                with open(calib, "wb") as f:
                    f.write(snap_retry)
                r_top, r_total = await state.detect_gutter_bounds_in_process(calib, dpi_factor=dpi_factor)
                if r_total > total_lines:
                    total_lines = r_total
                if r_top > 0:
                    if r_top > 500 or top_line == 0 or r_top < top_line:
                        top_line = r_top
                if total_lines >= 500 or top_line > 30:
                    is_stuck = False

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
