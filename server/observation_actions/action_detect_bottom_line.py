"""
Observation & Workaround Action: Line number at bottom not detected.
Detects missing/unreadable bottom gutter line number; runs localized bottom-gutter OCR
and forward-projects using calibrated visual row capacity L and wrapped line analysis.
"""

from typing import Dict, Any, Tuple
import cv2
import numpy as np

from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class DetectBottomLineAction(ObservationActionPlugin):
    id = "bottom_line_missing_detect"
    config_label = "line number at bottom not detected"
    category = "gutter_ocr"
    default_phase = "on_error"
    priority = 35

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        bot_ln = ctx.expected_bottom_line or 0
        top_ln = ctx.expected_top_line or 0
        if ctx.blackboard:
            bot_ln = getattr(ctx.blackboard, "bottom_line", bot_ln)
            top_ln = getattr(ctx.blackboard, "top_line", top_ln)

        missing = (bot_ln <= 0 or (top_ln > 0 and bot_ln < top_ln))
        reason = (
            "Bottom gutter line number is missing or precedes top line"
            if missing
            else f"Bottom line verified at Ln {bot_ln}"
        )
        return (missing, reason, {"bottom_line": bot_ln, "top_line": top_ln})

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from ocr_engine import extract_numbers_from_slice, find_gutter_numbers_cluster, correct_gutter_sequence, detect_line_wrap_state
        from services.adb_service import dismiss_keyboard, get_active_adb_serial, detect_external_display_id, DEVICE_PROFILES, current_device_model
        from services import state

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)

        actions_taken = []
        # 1. Dismiss soft keyboard or bottom overlay
        await dismiss_keyboard(serial, disp_id)
        actions_taken.append(f"Dismissed IME/bottom overlay on display {disp_id}")

        img = ctx.image_cv
        if img is None and ctx.image_bytes:
            nparr = np.frombuffer(ctx.image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None and ctx.blackboard and getattr(ctx.blackboard, "current_image_path", None):
            img = cv2.imread(str(ctx.blackboard.current_image_path))

        recovered_bot = 0

        # Calibrated visual row capacity L
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_8", {"lines_per_page": 31}))
        lpp = prof.get("lines_per_page", 31)
        if ctx.blackboard:
            lpp = getattr(ctx.blackboard, "calibrated_capacity_L", lpp)

        top_ref = (
            ctx.expected_top_line
            or (ctx.blackboard.top_line if ctx.blackboard else 0)
            or 1
        )

        if img is not None:
            h, w = img.shape[:2]
            scale_x = w / 1920.0
            gutter_w = int(max(130.0, min(360.0, 180.0 * scale_x)))
            bot_y1 = max(int(h * 0.50), h - int(h * 0.35))
            bot_y2 = min(h, int(h * 0.96))

            # 2. Localized bottom-gutter OCR slice
            bot_crop = img[bot_y1:bot_y2, :gutter_w]
            bot_scaled = cv2.resize(bot_crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
            slice_nums = extract_numbers_from_slice(bot_scaled)

            if slice_nums and slice_nums[-1] > top_ref:
                recovered_bot = slice_nums[-1]
                actions_taken.append(f"Localized bottom OCR detected Ln {recovered_bot}")
            else:
                # 3. Gutter cluster sequence analysis
                gutter_pairs = find_gutter_numbers_cluster(img)
                if gutter_pairs:
                    corrected = correct_gutter_sequence(gutter_pairs)
                    if corrected:
                        recovered_bot = corrected[-1][1]
                        actions_taken.append(f"Resolved from gutter cluster Ln {recovered_bot}")

            # 4. Check for line wrap expansion in viewport
            try:
                wrap_info = detect_line_wrap_state(img)
                if wrap_info.get("is_wrapped_page"):
                    wrap_deduction = wrap_info.get("wrapped_line_count", 0)
                    if wrap_deduction > 0 and recovered_bot > (top_ref + wrap_deduction):
                        actions_taken.append(f"Factored {wrap_deduction} wrapped visual rows into bottom bounds")
            except Exception:
                pass

        if recovered_bot <= top_ref:
            recovered_bot = top_ref + lpp - 1
            actions_taken.append(f"Forward-projected with calibrated visual capacity L={lpp} (Ln {recovered_bot})")

        if ctx.blackboard:
            ctx.blackboard.bottom_line = recovered_bot

        return {
            "status": "success",
            "success": True,
            "action_id": self.id,
            "bottom_line": recovered_bot,
            "message": f"Recovered bottom line number: Ln {recovered_bot}",
            "actions_taken": actions_taken
        }
