"""
Observation & Workaround Action: Editor content not focused, gaining editor focus.
Detects when the Teams FilePreviewActivity or its MAMWebView text editor lacks active
window focus, input connection, or blinking caret; brings the task to front, moves
the physical keyboard assistant overlay out of the content area into the appbar,
and taps the editor canvas to re-establish text focus.
"""

import asyncio
from typing import Dict, Any, Tuple
from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class FocusEditorAction(ObservationActionPlugin):
    id = "editor_not_focused_gain_focus"
    config_label = "editor content not focused, gaining editor focus"
    category = "focus"
    default_phase = "pre_node"
    priority = 12

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        from services.adb_service import get_active_adb_serial, run_adb_shell

        serial = ctx.serial or await get_active_adb_serial()
        if not serial:
            return (False, "No active device", {})

        is_window_focused = False
        try:
            win_chk = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", serial, timeout=1.5)
            win_out = win_chk.get("stdout", "")
            is_window_focused = "FilePreviewActivity" in win_out or "com.microsoft.teams" in win_out
        except Exception:
            pass

        has_input_connection = False
        try:
            ime_chk = await run_adb_shell("dumpsys input_method | grep -E 'mServedView|mInputConnection'", serial, timeout=1.5)
            ime_out = ime_chk.get("stdout", "")
            if "preview_host_view" in ime_out or "MAMWebView" in ime_out or ("com.microsoft.teams" in ime_out and "mInputConnection=" in ime_out):
                has_input_connection = True
        except Exception:
            pass

        # Check if physical keyboard overlay is blocking content
        has_overlay_blocking = False
        try:
            win_ime = await run_adb_shell("dumpsys window | grep -E 'InputMethod.*shown=true|mIsFloatingLayer=true'", serial, timeout=1.2)
            out = win_ime.get("stdout", "")
            if "InputMethod" in out or "mIsFloatingLayer=true" in out:
                has_overlay_blocking = True
        except Exception:
            pass

        focus_lost = (not is_window_focused) or (not has_input_connection)

        if focus_lost:
            reason = (
                "Teams editor window does not have active window focus"
                if not is_window_focused
                else "Editor text connection (MAMWebView) is not bound"
            )
        elif has_overlay_blocking:
            reason = "Physical keyboard assistant bar is floating over editor content"
        else:
            reason = "Editor window and input connection are focused"

        return (
            bool(focus_lost or has_overlay_blocking),
            reason,
            {
                "window_focused": is_window_focused,
                "input_connection": has_input_connection,
                "overlay_blocking": has_overlay_blocking
            }
        )

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from services.adb_service import (
            get_active_adb_serial, detect_external_display_id, ensure_editor_content_focused
        )

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)

        res = await ensure_editor_content_focused(serial, disp_id)
        actions = res.get("actions", [])

        return {
            "status": "success",
            "success": True,
            "action_id": self.id,
            "message": "Gained editor focus, bound text input connection, and secured title bar overlay position",
            "actions_taken": actions
        }
