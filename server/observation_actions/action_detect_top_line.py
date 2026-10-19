"""
Observation & Workaround Action: Line number at top not detected, detecting line number at top.
Detects missing/unreadable top gutter line number; runs multi-scale contrast-enhanced OCR
on the top gutter ROI and back-projects from the first valid consecutive gutter pair
using median pixel pitch p_y.
"""

from typing import Dict, Any, Tuple
import cv2
import numpy as np

from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class DetectTopLineAction(ObservationActionPlugin):
    id = "top_line_missing_detect"
    config_label = "line number at top not detected, detecting line number at top"
    category = "gutter_ocr"
    default_phase = "on_error"
    priority = 30

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        top_ln = ctx.expected_top_line or 0
        if ctx.blackboard:
            top_ln = getattr(ctx.blackboard, "top_line", top_ln)

        missing = (top_ln <= 0)
        reason = "Top gutter line number is 0 or unreadable" if missing else f"Top line verified at Ln {top_ln}"
        return (missing, reason, {"top_line": top_ln})

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from ocr_engine import extract_numbers_from_slice, find_gutter_numbers_cluster, correct_gutter_sequence
        from services import state

        img = ctx.image_cv
        if img is None and ctx.image_bytes:
            nparr = np.frombuffer(ctx.image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None and ctx.blackboard and getattr(ctx.blackboard, "current_image_path", None):
            img = cv2.imread(str(ctx.blackboard.current_image_path))

        actions_taken = []
        recovered_top = 0

        if img is not None:
            h, w = img.shape[:2]
            scale_x = w / 1920.0
            gutter_w = int(max(130.0, min(360.0, 180.0 * scale_x)))
            top_y1 = max(80, int(h * 0.10))
            top_y2 = min(h - 100, int(h * 0.60))

            # 1. Multi-scale contrast-enhanced ROI slice
            top_crop = img[top_y1:top_y2, :gutter_w]
            top_scaled = cv2.resize(top_crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
            slice_nums = extract_numbers_from_slice(top_scaled)

            if slice_nums and slice_nums[0] > 0:
                recovered_top = slice_nums[0]
                actions_taken.append(f"Multi-scale contrast OCR read Ln {recovered_top} directly")
            else:
                # 2. Back-project using median pixel pitch p_y from gutter cluster
                gutter_pairs = find_gutter_numbers_cluster(img)
                if len(gutter_pairs) >= 2:
                    corrected = correct_gutter_sequence(gutter_pairs)
                    if corrected:
                        first_cy, first_num = corrected[0]
                        second_cy, second_num = corrected[1]
                        pitch_py = max(18.0, float(abs(second_cy - first_cy) / max(1, abs(second_num - first_num))))
                        num_lines_above = int(round((first_cy - top_y1) / pitch_py))
                        recovered_top = max(1, first_num - num_lines_above)
                        actions_taken.append(
                            f"Pitch back-projection (pitch={pitch_py:.1f}px) resolved Ln {recovered_top} from base Ln {first_num}"
                        )
                elif gutter_pairs:
                    recovered_top = gutter_pairs[0][1]
                    actions_taken.append(f"Used top cluster entry Ln {recovered_top}")

        if recovered_top <= 0:
            exp = ctx.expected_top_line or (ctx.blackboard.target_next_top if ctx.blackboard else 1) or 1
            recovered_top = exp
            actions_taken.append(f"Fallback to expected target top Ln {recovered_top}")

        if ctx.blackboard:
            ctx.blackboard.top_line = recovered_top

        return {
            "status": "success",
            "success": True,
            "action_id": self.id,
            "top_line": recovered_top,
            "message": f"Recovered top line number: Ln {recovered_top}",
            "actions_taken": actions_taken
        }
