"""
Implementations of general-purpose classifiers for the Teams Markdown editor and mobile setup:
1. LightModeClassifier -> "light mode is selected" / "switch to dark mode"
2. ViewModeClassifier  -> "view mode is selected"  / "switch to edit mode"
3. KeyboardOpenClassifier -> "Keyboard is open"    / "close keyboard"
"""

import asyncio
from typing import Optional, Tuple
import cv2
import numpy as np

from .base import BaseClassifier, ClassifierContext, ClassificationResult, FixResult
from services.adb_service import (
    run_adb_shell,
    get_active_adb_serial,
    detect_external_display_id,
    is_ime_visible,
    ensure_adb_keyboard_closed,
    capture_external_screenshot
)


class LightModeClassifier(BaseClassifier):
    id = "light_mode"
    issue_description = "light mode is selected"
    fix_description = "switch to dark mode"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        img = context.image_cv
        if img is None and context.image_bytes:
            nparr = np.frombuffer(context.image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            # Check if alignment_data has dark_mode box
            if context.alignment_data and "boxes" in context.alignment_data:
                dm = context.alignment_data["boxes"].get("dark_mode", {})
                is_light = dm.get("passed") is False or dm.get("icon") == "sun"
                target_coords = None
                if dm.get("box_px"):
                    b = dm["box_px"]
                    target_coords = (int(b[0] + b[2] / 2), int(b[1] + b[3] / 2))
                return ClassificationResult(
                    classifier_id=self.id,
                    issue_detected=is_light,
                    issue_name=self.issue_description,
                    fix_name=self.fix_description,
                    severity=self.severity,
                    details="Light mode detected via alignment diagnostics" if is_light else "Dark mode is active",
                    target_coordinates=target_coords
                )
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=False,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                details="No image available for luminance evaluation"
            )

        h, w = img.shape[:2]
        body_sample = img[int(h * 0.25):int(h * 0.75), int(w * 0.20):int(w * 0.80)]
        mean_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY))) if body_sample.size > 0 else 100.0

        is_light = (mean_lum >= 55.0)

        # Locate dark mode / sun toggle icon in toolbar (top right quadrant)
        y1_tb, y2_tb = int(h * 0.040), int(h * 0.170)
        x1_tb = int(w * 0.60)
        crop_tb = img[y1_tb:y2_tb, x1_tb:w]

        target_coords: Optional[Tuple[int, int]] = None
        if crop_tb.size > 0:
            gray_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2GRAY)
            # Find brightest icon / toggle area in the top toolbar
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(gray_tb)
            target_coords = (x1_tb + max_loc[0], y1_tb + max_loc[1])
        else:
            target_coords = (int(w * 0.89), int(h * 0.08))

        # If alignment_data already pinpointed the dark_box, prefer it
        if context.alignment_data and "boxes" in context.alignment_data:
            dm = context.alignment_data["boxes"].get("dark_mode", {})
            if dm.get("box_px"):
                b = dm["box_px"]
                target_coords = (int(b[0] + b[2] / 2), int(b[1] + b[3] / 2))

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=is_light,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details=f"Screen luminance is {round(mean_lum, 1)} (>= 55.0 indicates light mode)" if is_light else f"Dark mode active (luminance {round(mean_lum, 1)} < 55.0)",
            target_coordinates=target_coords,
            metadata={"mean_luminance": round(mean_lum, 1)}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)

        # 1. Determine target coordinates
        coords = None
        detect_res = await self.detect(context)
        if detect_res.target_coordinates:
            coords = detect_res.target_coordinates
        elif context.alignment_data and "boxes" in context.alignment_data:
            dm = context.alignment_data["boxes"].get("dark_mode", {})
            if dm.get("box_px"):
                b = dm["box_px"]
                coords = (int(b[0] + b[2] / 2), int(b[1] + b[3] / 2))

        actions = []
        if coords:
            x, y = coords
            actions.append(f"Tapped theme toggle icon at ({x}, {y}) on display {disp_id}")
            if disp_id > 0:
                await run_adb_shell(f"input -d {disp_id} tap {x} {y}", serial)
            await run_adb_shell(f"input tap {x} {y}", serial)
            await asyncio.sleep(0.4)
        else:
            # Fallback approximate toolbar location for desktop 1080p
            actions.append(f"Tapped fallback theme toggle location at (960, 65) on display {disp_id}")
            if disp_id > 0:
                await run_adb_shell(f"input -d {disp_id} tap 960 65", serial)
            await run_adb_shell("input tap 960 65", serial)
            await asyncio.sleep(0.4)

        # 2. Re-evaluate to verify
        new_snap = await capture_external_screenshot(serial)
        re_detect = None
        if new_snap:
            new_ctx = ClassifierContext(serial=serial, display_id=disp_id, image_bytes=new_snap)
            re_detect = await self.detect(new_ctx)

        success = not (re_detect and re_detect.issue_detected)
        msg = "Successfully switched to dark mode" if success else "Theme toggle tapped; verify dark mode is active"
        return FixResult(
            classifier_id=self.id,
            success=success,
            message=msg,
            actions_taken=actions,
            metadata={"recheck": re_detect.to_dict() if re_detect else None}
        )


class ViewModeClassifier(BaseClassifier):
    id = "view_mode"
    issue_description = "view mode is selected"
    fix_description = "switch to edit mode"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        # Check alignment_data if available
        if context.alignment_data and "boxes" in context.alignment_data:
            em = context.alignment_data["boxes"].get("edit_mode", {})
            is_view_mode = (em.get("passed") is False)
            target_coords = None
            if em.get("box_px"):
                b = em["box_px"]
                target_coords = (int(b[0] + b[2] / 2), int(b[1] + b[3] / 2))
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=is_view_mode,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                severity=self.severity,
                details="Editor is in View Mode (edit pencil unselected)" if is_view_mode else "Edit mode is active",
                target_coordinates=target_coords
            )

        img = context.image_cv
        if img is None and context.image_bytes:
            nparr = np.frombuffer(context.image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=False,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                details="No image available for edit mode check"
            )

        h, w = img.shape[:2]
        y1_tb, y2_tb = int(h * 0.040), int(h * 0.170)
        x1_tb, x2_tb = int(w * 0.400), int(w * 0.980)
        crop_tb = img[y1_tb:y2_tb, x1_tb:x2_tb]

        b_chan = crop_tb[:, :, 0]
        g_chan = crop_tb[:, :, 1]
        r_chan = crop_tb[:, :, 2]
        blue_mask = (b_chan > 160) & (r_chan < 100) & (g_chan < 130)
        blue_pixels = int(np.count_nonzero(blue_mask))

        is_view_mode = (blue_pixels < 15)
        target_coords = (int(w * 0.85), int(h * 0.08))

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=is_view_mode,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details=f"Editor in View Mode ({blue_pixels} blue pixels, required >= 15 for Edit Mode)" if is_view_mode else "Edit Mode active",
            target_coordinates=target_coords,
            metadata={"blue_pixel_count": blue_pixels}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)

        coords = None
        detect_res = await self.detect(context)
        if detect_res.target_coordinates:
            coords = detect_res.target_coordinates
        elif context.alignment_data and "boxes" in context.alignment_data:
            em = context.alignment_data["boxes"].get("edit_mode", {})
            if em.get("box_px"):
                b = em["box_px"]
                coords = (int(b[0] + b[2] / 2), int(b[1] + b[3] / 2))

        actions = []
        if coords:
            x, y = coords
            actions.append(f"Tapped edit mode pencil icon at ({x}, {y}) on display {disp_id}")
            if disp_id > 0:
                await run_adb_shell(f"input -d {disp_id} tap {x} {y}", serial)
            await run_adb_shell(f"input tap {x} {y}", serial)
            await asyncio.sleep(0.4)
        else:
            actions.append(f"Tapped fallback edit pencil location at (860, 65) on display {disp_id}")
            if disp_id > 0:
                await run_adb_shell(f"input -d {disp_id} tap 860 65", serial)
            await run_adb_shell("input tap 860 65", serial)
            await asyncio.sleep(0.4)

        new_snap = await capture_external_screenshot(serial)
        re_detect = None
        if new_snap:
            new_ctx = ClassifierContext(serial=serial, display_id=disp_id, image_bytes=new_snap)
            re_detect = await self.detect(new_ctx)

        success = not (re_detect and re_detect.issue_detected)
        msg = "Successfully switched to edit mode" if success else "Edit pencil tapped; verify edit mode is active"
        return FixResult(
            classifier_id=self.id,
            success=success,
            message=msg,
            actions_taken=actions,
            metadata={"recheck": re_detect.to_dict() if re_detect else None}
        )


class KeyboardOpenClassifier(BaseClassifier):
    id = "keyboard_open"
    issue_description = "Keyboard is open"
    fix_description = "close keyboard"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        serial = await get_active_adb_serial(context.serial)
        ime_open = await is_ime_visible(serial)

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=ime_open,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details="Soft keyboard is currently visible on screen" if ime_open else "Keyboard is suppressed/hidden",
            target_coordinates=None,
            metadata={"ime_visible": ime_open}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        actions = []

        actions.append("Dispatched ensure_adb_keyboard_closed (Escape key 111 & hardware keyboard config)")
        await ensure_adb_keyboard_closed(serial)
        await asyncio.sleep(0.2)

        still_open = await is_ime_visible(serial)
        if still_open:
            disp_id = context.display_id or await detect_external_display_id(serial)
            if disp_id > 0:
                await run_adb_shell(f"input -d {disp_id} keyevent 111", serial)
            await run_adb_shell("input keyevent 111", serial)
            actions.append("Sent secondary KEYCODE_ESCAPE (111)")
            await asyncio.sleep(0.15)
            still_open = await is_ime_visible(serial)

        success = not still_open
        msg = "Keyboard closed successfully" if success else "Sent keyboard dismiss commands"
        return FixResult(
            classifier_id=self.id,
            success=success,
            message=msg,
            actions_taken=actions,
            metadata={"ime_still_visible": still_open}
        )


class ModalOverlayClassifier(BaseClassifier):
    id = "modal_overlay"
    issue_description = "modal appearing over teams markdown"
    fix_description = "dismiss modal dialog"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        img = context.image_cv
        if img is None and context.image_bytes:
            nparr = np.frombuffer(context.image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=False,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                details="No image available for modal check"
            )

        h, w = img.shape[:2]
        center_crop = img[int(h * 0.20):int(h * 0.80), int(w * 0.20):int(w * 0.80)]
        gray_center = cv2.cvtColor(center_crop, cv2.COLOR_BGR2GRAY)

        edges = cv2.Canny(gray_center, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        has_modal = False
        details = "No modal detected over teams markdown"
        target_coords = None
        min_modal_area = (h * 0.25) * (w * 0.25)

        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            area = cw * ch
            if area > min_modal_area and 0.4 < (cw / max(1, ch)) < 3.0:
                has_modal = True
                target_coords = (int(w * 0.20 + x + cw / 2), int(h * 0.20 + y + ch / 2))
                details = f"Modal dialog bounding box detected ({cw}x{ch} px) over editor"
                break

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=has_modal,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details=details,
            target_coordinates=target_coords
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        actions = []
        actions.append("Dispatched KEYCODE_ESCAPE (111) to dismiss modal")
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keyevent 111", serial)
        await run_adb_shell("input keyevent 111", serial)
        await asyncio.sleep(0.3)
        return FixResult(
            classifier_id=self.id,
            success=True,
            message="Sent Escape to dismiss modal dialog",
            actions_taken=actions
        )


class MatrixAppOverlayClassifier(BaseClassifier):
    id = "matrix_app_overlay"
    issue_description = "mobile app matrix capture appearing over teams markdown"
    fix_description = "minimize or reposition matrix capture overlay"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        img = context.image_cv
        if img is None and context.image_bytes:
            nparr = np.frombuffer(context.image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=False,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                details="No image available for overlay check"
            )

        h, w = img.shape[:2]
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        lower_matrix_green = np.array([45, 160, 140])
        upper_matrix_green = np.array([90, 255, 255])
        mask = cv2.inRange(hsv, lower_matrix_green, upper_matrix_green)

        # Check document text capture area (excluding top status bar)
        doc_mask = mask[int(h * 0.15):int(h * 0.90), int(w * 0.10):int(w * 0.85)]
        green_pixel_count = int(np.count_nonzero(doc_mask))

        is_overlapping = green_pixel_count > 120
        details = (
            f"Matrix Capture overlay detected over editor ({green_pixel_count} green pixels)"
            if is_overlapping else "Matrix Capture overlay not obscuring editor text"
        )

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=is_overlapping,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details=details,
            metadata={"green_pixel_count": green_pixel_count}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        actions = []
        actions.append("Tapped Teams window title bar to re-focus editor in front of overlay")
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} tap 500 120", serial)
        await run_adb_shell("input tap 500 120", serial)
        await asyncio.sleep(0.3)
        return FixResult(
            classifier_id=self.id,
            success=True,
            message="Re-focused Teams window to clear overlay",
            actions_taken=actions
        )


class OcrDegradedClassifier(BaseClassifier):
    id = "ocr_degraded"
    issue_description = "previous ocr capture degraded"
    fix_description = "re-acquire settled frame with enhanced dwell"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        from services import state
        frames = list(state.captured_frames.values())
        if not frames:
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=False,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                details="No previous frames captured yet (healthy)"
            )

        sorted_f = sorted(frames, key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))
        last_frame = sorted_f[-1]

        status = last_frame.get("status", "")
        extracted_cnt = last_frame.get("extracted_line_count", 0)
        is_error = status.startswith("error")

        is_degraded = False
        reason = f"Previous OCR healthy ({extracted_cnt} lines extracted)"

        if is_error:
            is_degraded = True
            reason = f"Previous frame {last_frame.get('frame_id', '')[:8]} failed OCR: {status}"
        elif len(sorted_f) >= 2:
            prev_frame = sorted_f[-2]
            prev_cnt = prev_frame.get("extracted_line_count", 0)
            if prev_cnt >= 20 and extracted_cnt < 5:
                is_degraded = True
                reason = f"OCR line count dropped from {prev_cnt} to {extracted_cnt} lines on page {last_frame.get('page_index')}"
        elif extracted_cnt == 0 and status == "processed":
            is_degraded = True
            reason = f"0 lines extracted from page {last_frame.get('page_index')}"

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=is_degraded,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details=reason,
            metadata={"last_extracted_count": extracted_cnt, "status": status}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        from services import state
        frames = list(state.captured_frames.values())
        if frames:
            sorted_f = sorted(frames, key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))
            last_frame = sorted_f[-1]
            last_frame["status"] = "queued"
            top = last_frame.get("top_line", 1)
            state.recapture_queue.append({"line_number": top, "page_index": last_frame.get("page_index", 1)})
        return FixResult(
            classifier_id=self.id,
            success=True,
            message="Queued previous frame for re-capture and re-OCR",
            actions_taken=["Flagged frame for recapture with extended settle dwell"]
        )
