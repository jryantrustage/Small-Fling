"""
Observation & Workaround Action: Keyboard detected, closing keyboard.
Detects active IME via dumpsys input_method; hides soft keyboard via Accessibility
SHOW_MODE_HIDDEN and show_ime_with_hard_keyboard 0 without sending KEYCODE_ESCAPE
to the external display.
"""

import asyncio
from typing import Dict, Any, Tuple

from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class CloseKeyboardAction(ObservationActionPlugin):
    id = "keyboard_detected_close"
    config_label = "keyboard detected, closing keyboard"
    category = "environment"
    default_phase = "pre_node"
    priority = 10

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        from services.adb_service import get_active_adb_serial, is_ime_visible, run_adb_shell

        serial = ctx.serial or await get_active_adb_serial()
        ime_open = await is_ime_visible(serial)

        # Inspect dumpsys input_method details
        details_res = await run_adb_shell(
            "dumpsys input_method | grep -E 'mInputShown|mImeWindowVis'",
            serial,
            timeout=1.0
        )
        stdout = details_res.get("stdout", "")
        if "mInputShown=true" in stdout or "mImeWindowVis=0x2" in stdout or "mImeWindowVis=0x3" in stdout:
            ime_open = True

        reason = (
            "Soft keyboard (IME) is visible and intercepting touch/key events"
            if ime_open
            else "Keyboard is closed"
        )
        return (ime_open, reason, {"raw_status": stdout.strip(), "ime_visible": ime_open})

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from services.adb_service import (
            get_active_adb_serial, detect_external_display_id, run_adb_shell, dismiss_keyboard
        )

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)

        actions_taken = []

        # 1. Enforce hard keyboard preference without displaying virtual IME
        await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0", serial, timeout=1.0)
        actions_taken.append("Enforced secure show_ime_with_hard_keyboard 0")

        # 2. Accessibility soft keyboard hidden mode (SHOW_MODE_HIDDEN = 1)
        await run_adb_shell("settings put secure accessibility_soft_keyboard_mode 1", serial, timeout=1.0)
        actions_taken.append("Set accessibility_soft_keyboard_mode 1 (SHOW_MODE_HIDDEN)")

        # 3. Broadcast MatrixCapture close keyboard action if receiver installed
        await run_adb_shell("am broadcast -a com.matrixcapture.app.ACTION_CLOSE_KEYBOARD >/dev/null 2>&1", serial, timeout=1.0)

        # 4. Dismiss keyboard cleanly without sending KEYCODE_ESCAPE to external display
        await dismiss_keyboard(serial, disp_id)
        actions_taken.append(f"Dismissed IME on display {disp_id}")

        await asyncio.sleep(0.15)
        return {
            "status": "success",
            "success": True,
            "action_id": self.id,
            "message": "On-screen soft keyboard successfully closed",
            "actions_taken": actions_taken
        }
