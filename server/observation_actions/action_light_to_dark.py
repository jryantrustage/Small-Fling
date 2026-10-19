"""
Observation & Workaround Action: Light mode detected, switching to dark mode.
Detects high canvas luminance (>= 55.0); opens markdownThemeAnchor pull-down menu
and selects "Dark Mode".
"""

import asyncio
from typing import Dict, Any, Tuple
import cv2
import numpy as np

from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class LightToDarkAction(ObservationActionPlugin):
    id = "light_mode_to_dark_mode"
    config_label = "light mode detected, switching to dark mode"
    category = "environment"
    default_phase = "pre_node"
    priority = 25

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        img = ctx.image_cv
        if img is None:
            try:
                from classifiers.base import ClassifierContext
                from classifiers.editor_classifiers import LightModeClassifier
                c_ctx = ClassifierContext(
                    serial=ctx.serial,
                    display_id=ctx.display_id or 0,
                    image_bytes=ctx.image_bytes,
                    image_cv=ctx.image_cv,
                    alignment_data=getattr(ctx, "alignment_data", None)
                )
                cl = LightModeClassifier()
                res = await cl.detect(c_ctx)
                return (
                    res.issue_detected,
                    res.details or "Light mode detected",
                    {"target_coordinates": res.target_coordinates}
                )
            except Exception:
                return (False, "No image or light mode detected", {})

        h, w = img.shape[:2]
        # Measure mean luminance of editor body ROI (center 60% of viewport)
        body = img[int(h * 0.25):int(h * 0.85), int(w * 0.15):int(w * 0.85)]
        gray = cv2.cvtColor(body, cv2.COLOR_BGR2GRAY) if len(body.shape) == 3 else body
        mean_lum = float(np.mean(gray))

        is_light = mean_lum >= 55.0

        # Anchor coordinates for theme dropdown
        anchor_x = int(1840 * (w / 1920.0))
        anchor_y = int(250 * (h / 1080.0))

        return (
            is_light,
            f"Mean editor luminance is {mean_lum:.1f} (>= 55.0 indicates light mode)" if is_light else "Dark mode verified",
            {
                "mean_luminance": mean_lum,
                "target_coordinates": (anchor_x, anchor_y)
            }
        )

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from services.adb_service import (
            get_active_adb_serial, detect_external_display_id, run_adb_shell
        )
        from services.ui_automator_service import select_dark_mode, get_display_dimensions

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)

        actions_taken = []
        # Attempt 1: UIAutomator dark mode toggle
        ok = await select_dark_mode(serial, disp_id)
        if ok:
            actions_taken.append("Activated Dark Mode via UIAutomator theme selector")
        else:
            # Attempt 2: Tap markdownThemeAnchor pull-down menu and select Dark Mode
            disp_w, disp_h = await get_display_dimensions(serial, disp_id)
            theme_btn_x = int(1840 * (disp_w / 1920.0))
            theme_btn_y = int(250 * (disp_h / 1080.0))
            await run_adb_shell(f"input -d {disp_id} tap {theme_btn_x} {theme_btn_y} >/dev/null 2>&1", serial)
            actions_taken.append(f"Tapped theme anchor at ({theme_btn_x}, {theme_btn_y})")
            await asyncio.sleep(0.3)

            # Tap Dark Mode option in dropdown
            dark_opt_x = int(1800 * (disp_w / 1920.0))
            dark_opt_y = int(320 * (disp_h / 1080.0))
            await run_adb_shell(f"input -d {disp_id} tap {dark_opt_x} {dark_opt_y} >/dev/null 2>&1", serial)
            actions_taken.append(f"Selected Dark Mode option at ({dark_opt_x}, {dark_opt_y})")

        await asyncio.sleep(0.25)
        return {
            "status": "success",
            "success": True,
            "action_id": self.id,
            "message": "Switched Teams Markdown editor into Dark Mode",
            "actions_taken": actions_taken
        }
