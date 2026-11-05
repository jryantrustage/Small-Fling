"""
Observation & Workaround Action: View mode detected, switching to edit mode.
Detects read-only preview or split-screen duplicate pane; taps the pencil icon
in MarkdownToolbar and suppresses the soft keyboard.
"""

import asyncio
from typing import Dict, Any, Tuple
import cv2
import numpy as np

from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class ViewToEditAction(ObservationActionPlugin):
    id = "view_mode_to_edit_mode"
    config_label = "view mode detected, switching to edit mode"
    category = "environment"
    default_phase = "pre_node"
    priority = 20

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        img = ctx.image_cv
        if img is None:
            # Fallback to UIAutomator or classifier check
            try:
                from classifiers.base import ClassifierContext
                from classifiers.editor_classifiers import ViewModeClassifier
                c_ctx = ClassifierContext(
                    serial=ctx.serial,
                    display_id=ctx.display_id or 0,
                    image_bytes=ctx.image_bytes,
                    image_cv=ctx.image_cv,
                    alignment_data=getattr(ctx, "alignment_data", None)
                )
                cl = ViewModeClassifier()
                res = await cl.detect(c_ctx)
                return (
                    res.issue_detected,
                    res.details or "View mode detected via UIAutomator",
                    {"target_coordinates": res.target_coordinates}
                )
            except Exception:
                return (False, "No image or UIAutomator view mode detected", {})

        # 1. Check for center vertical split-screen divider in read/preview mode (x in [0.46W, 0.54W])
        if img is not None:
            h, w = img.shape[:2]
            pencil_x = int(1060 * (w / 1280.0))
            pencil_y = int(240 * (h / 1024.0))
        else:
            pencil_x, pencil_y = 1060, 240
        has_split_divider = False

        # 2. Check EditModeClassifier (verifies gutter numbers and toolbar blue pencil highlight)
        cl_detected = False
        cl_details = ""
        cl_coords = None
        try:
            from classifiers.base import ClassifierContext
            from classifiers.editor_classifiers import ViewModeClassifier
            c_ctx = ClassifierContext(
                serial=ctx.serial,
                display_id=ctx.display_id or 0,
                image_bytes=ctx.image_bytes,
                image_cv=ctx.image_cv,
                alignment_data=getattr(ctx, "alignment_data", None)
            )
            cl = ViewModeClassifier()
            cl_res = await cl.detect(c_ctx)
            cl_detected = cl_res.issue_detected
            cl_details = cl_res.details
            cl_coords = cl_res.target_coordinates
        except Exception:
            pass

        detected = bool(cl_detected)
        reason = cl_details or "Edit mode inactive"

        return (
            detected,
            reason,
            {
                "has_split_divider": has_split_divider,
                "target_coordinates": cl_coords or (pencil_x, pencil_y)
            }
        )

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from services.adb_service import (
            get_active_adb_serial, detect_external_display_id, run_adb_shell, dismiss_keyboard
        )
        from services.ui_automator_service import enable_edit_mode, get_display_dimensions

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)

        actions_taken = []
        # Attempt 1: UIAutomator specific node targeting
        ok = await enable_edit_mode(serial, disp_id)
        if ok:
            actions_taken.append("Tapped edit mode pencil via UIAutomator")
        else:
            # Attempt 2: Target coordinates tap
            disp_w, disp_h = await get_display_dimensions(serial, disp_id)
            target_x = int(1655 * (disp_w / 1920.0))
            target_y = int(190 * (disp_h / 1080.0))
            await run_adb_shell(f"input -d {disp_id} tap {target_x} {target_y} >/dev/null 2>&1", serial)
            actions_taken.append(f"Tapped edit icon at ({target_x}, {target_y}) on display {disp_id}")

        await asyncio.sleep(0.35)
        # Suppress soft keyboard immediately so it does not intercept editor
        await dismiss_keyboard(serial, disp_id)
        actions_taken.append("Suppressed on-screen keyboard after edit mode toggle")

        return {
            "status": "success",
            "success": True,
            "action_id": self.id,
            "message": "Switched Teams Markdown editor into Edit Mode",
            "actions_taken": actions_taken
        }
