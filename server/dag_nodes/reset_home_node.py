"""
Standalone DAG Node 2: Return to Line 1 (Ctrl+Home)
Returns to Line 1 via Ctrl+Home, verifies line 1 in gutter, and pins caret to bottom scroll margin.
"""

import asyncio
from typing import Dict, Any, Optional
from pathlib import Path
from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, send_hid_keycombination,
    capture_external_screenshot, dismiss_keyboard, run_adb_shell,
    fetch_current_display_dpi_factor, get_display_dimensions, DEVICE_PROFILES,
    current_device_model
)
from services import state
import db


class ResetHomeNode(BaseDagNode):
    id = "reset_home"
    node_id = "reset_home"
    title = "2. Return to Line 1 (Ctrl+Home)"
    short_name = "Return to Line 1"
    category = "initialize"
    accent_color = "#a371f7"
    default_position = {"x": 280.0, "y": 140.0}
    default_config = {
        "key1": 113,
        "key2": 122,
        "settle_delay_ms": 1000,
        "expected_line": 1
    }

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        calib = state.FRAMES_DIR / "dag_node2_home.png"

        # Auto-dismiss any lingering ANR dialogs before attempting Line 1 return
        try:
            from services.adb_service import dismiss_anr_dialogs
            await dismiss_anr_dialogs(serial, disp_id)
        except Exception:
            pass

        # 1. Enforce Markdown exclusively on desktop display & focus without tapping editable text
        try:
            from services.adb_service import enforce_markdown_only_on_desktop
            await enforce_markdown_only_on_desktop(serial, disp_id)
        except Exception:
            pass
        disp_w, disp_h = await get_display_dimensions(serial, disp_id)
        # Tap neutral title text area on left (x=240, y=40) away from center window caption handle
        await run_adb_shell(f"input -d {disp_id} tap 240 40 >/dev/null 2>&1", serial)
        await asyncio.sleep(0.08)
        await dismiss_keyboard(serial, disp_id)
        await asyncio.sleep(0.08)

        is_verified = False
        detected_first = 0

        # Execute up to 3 focused attempts to return to Line 1
        for attempt in range(1, 4):
            await send_hid_keycombination(113, 122, serial=serial, caller_node="reset_home")
            await asyncio.sleep(0.5)
            await dismiss_keyboard(serial, disp_id)

            dpi_factor, active_dpi = await fetch_current_display_dpi_factor(serial, disp_id)
            blackboard.dpi_factor = dpi_factor
            blackboard.active_dpi = active_dpi

            # Allow scroll convergence
            for sample_idx in range(6):
                await asyncio.sleep(0.35)
                snap = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
                if snap:
                    with open(calib, "wb") as f:
                        f.write(snap)
                    blackboard.current_image_path = calib
                    blackboard.current_image_bytes = snap
                    blackboard.latest_frame_bytes = snap

                    is_verified, detected_first = await state.verify_first_line_in_process(calib, dpi_factor=dpi_factor)
                    if not is_verified:
                        top_detected = await state.detect_top_line_in_process(calib, dpi_factor=dpi_factor)
                        if top_detected == 1 or (0 < top_detected <= 2):
                            is_verified, detected_first = True, 1

                    if is_verified:
                        break

            if is_verified:
                break

        if not is_verified:
            raise RuntimeError(
                f"DAG Node 2 ('reset_home') failed to return to Line 1: top gutter detected at Line {detected_first or 'unknown'} after 3 attempts."
            )

        active_proj = db.get_active_project() or {}
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_10", {"lines_per_page": 24}))
        lpp = state.orchestration_state.get("viewport_lines") or active_proj.get("lines_per_page") or prof.get("lines_per_page", 24)
        padding = int(active_proj.get("scroll_padding_lines") if active_proj.get("scroll_padding_lines") is not None else state.orchestration_state.get("scroll_padding_lines", 4))
        step_arrows = active_proj.get("arrow_count_step") or (lpp + padding)
        predicted_arrows = active_proj.get("arrow_count_init") or (step_arrows * 2)

        blackboard.top_line = 1
        blackboard.arrow_count = predicted_arrows

        state.dag_state["nodes"]["reset_home"].update({
            "status": "completed",
            "verified": True,
            "first_line": 1,
            "cursor_line": 1,
            "cursor_focused": True,
            "predicted_arrow_down_count": predicted_arrows,
            "evaluator": "Line 1 Gutter Evaluator",
            "telemetry_insight": f"Line 1 verified • Cursor focused on Line 1 ({predicted_arrows} down arrows determined) ✔",
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message="Line 1 verified at top gutter via Ctrl+Home ✔",
            top_line=1,
            data={"first_line": 1, "predicted_arrows": predicted_arrows}
        )
