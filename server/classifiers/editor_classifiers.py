"""Implementations of general-purpose classifiers for Teams Markdown editor and mobile setup."""
import asyncio
from typing import Optional, Tuple
import cv2
import numpy as np
from .base import BaseClassifier, ClassifierContext, ClassificationResult, FixResult
from services.adb_service import (
    run_adb_shell, get_active_adb_serial, detect_external_display_id,
    is_ime_visible, ensure_adb_keyboard_closed, capture_external_screenshot
)

def _get_cv_img(ctx: ClassifierContext) -> Optional[np.ndarray]:
    if ctx.image_cv is not None:
        return ctx.image_cv
    return cv2.imdecode(np.frombuffer(ctx.image_bytes, np.uint8), cv2.IMREAD_COLOR) if ctx.image_bytes else None

def _get_box_center(ctx: ClassifierContext, key: str) -> Optional[Tuple[int, int]]:
    b = (ctx.alignment_data or {}).get("boxes", {}).get(key, {}).get("box_px")
    return (int(b[0] + b[2] / 2), int(b[1] + b[3] / 2)) if b else None

async def _tap_coords(serial: str, disp_id: int, coords: Tuple[int, int], delay: float = 0.4):
    x, y = coords
    if disp_id > 0:
        await run_adb_shell(f"input -d {disp_id} tap {x} {y}", serial)
    await run_adb_shell(f"input tap {x} {y}", serial)
    if delay:
        await asyncio.sleep(delay)

async def _recheck_classifier(classifier: BaseClassifier, serial: str, disp_id: int) -> Optional[ClassificationResult]:
    snap = await capture_external_screenshot(serial)
    return await classifier.detect(ClassifierContext(serial=serial, display_id=disp_id, image_bytes=snap)) if snap else None


class LightModeClassifier(BaseClassifier):
    id = "light_mode"
    issue_description = "light mode is selected"
    fix_description = "switch to dark mode"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        dm = (context.alignment_data or {}).get("boxes", {}).get("dark_mode", {})
        if dm.get("dismissed"):
            return ClassificationResult(classifier_id=self.id, issue_detected=False, issue_name=self.issue_description,
                                        fix_name=self.fix_description, details="Dark mode check dismissed by user (false positive ignored)")
        if dm.get("passed") is True or dm.get("icon") == "moon":
            return ClassificationResult(classifier_id=self.id, issue_detected=False, issue_name=self.issue_description,
                                        fix_name=self.fix_description, severity=self.severity, details="Dark mode is active (moon icon verified)",
                                        target_coordinates=_get_box_center(context, "dark_mode"))

        img = _get_cv_img(context)
        if img is None:
            is_light = dm.get("passed") is False or dm.get("icon") == "sun"
            return ClassificationResult(
                classifier_id=self.id, issue_detected=is_light, issue_name=self.issue_description, fix_name=self.fix_description,
                severity=self.severity, details="Light mode detected via alignment" if is_light else ("Dark mode active" if dm else "No image available"),
                target_coordinates=_get_box_center(context, "dark_mode")
            )

        h, w = img.shape[:2]
        body = img[int(h * 0.18):int(h * 0.42), int(w * 0.15):int(w * 0.75)]
        mean_lum = float(np.mean(cv2.cvtColor(body, cv2.COLOR_BGR2GRAY))) if body.size > 0 else 100.0
        is_light = mean_lum >= 55.0

        target_coords = _get_box_center(context, "dark_mode")
        if not target_coords:
            y1_tb, y2_tb, x1_tb = int(h * 0.040), int(h * 0.170), int(w * 0.60)
            crop_tb = img[y1_tb:y2_tb, x1_tb:w]
            if crop_tb.size > 0:
                _, _, _, max_loc = cv2.minMaxLoc(cv2.cvtColor(crop_tb, cv2.COLOR_BGR2GRAY))
                target_coords = (x1_tb + max_loc[0], y1_tb + max_loc[1])
            else:
                target_coords = (int(w * 0.89), int(h * 0.08))

        return ClassificationResult(
            classifier_id=self.id, issue_detected=is_light, issue_name=self.issue_description, fix_name=self.fix_description,
            severity=self.severity, details=f"Screen luminance is {round(mean_lum, 1)} (>= 55.0 indicates light mode)" if is_light else f"Dark mode active (luminance {round(mean_lum, 1)} < 55.0)",
            target_coordinates=target_coords, metadata={"mean_luminance": round(mean_lum, 1)}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        detect_res = await self.detect(context)
        coords = detect_res.target_coordinates or _get_box_center(context, "dark_mode") or (960, 65)
        await _tap_coords(serial, disp_id, coords)

        re_detect = await _recheck_classifier(self, serial, disp_id)
        success = not (re_detect and re_detect.issue_detected)
        return FixResult(classifier_id=self.id, success=success,
                         message="Successfully switched to dark mode" if success else "Theme toggle tapped; verify dark mode is active",
                         actions_taken=[f"Tapped theme toggle icon at {coords} on display {disp_id}"],
                         metadata={"recheck": re_detect.to_dict() if re_detect else None})


class ViewModeClassifier(BaseClassifier):
    id = "view_mode"
    issue_description = "view mode is selected"
    fix_description = "switch to edit mode"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        em = (context.alignment_data or {}).get("boxes", {}).get("edit_mode", {})
        if em:
            is_view = em.get("passed") is False
            return ClassificationResult(classifier_id=self.id, issue_detected=is_view, issue_name=self.issue_description,
                                        fix_name=self.fix_description, severity=self.severity,
                                        details="Editor is in View Mode (edit pencil unselected)" if is_view else "Edit mode is active",
                                        target_coordinates=_get_box_center(context, "edit_mode"))

        img = _get_cv_img(context)
        if img is None:
            return ClassificationResult(classifier_id=self.id, issue_detected=False, issue_name=self.issue_description,
                                        fix_name=self.fix_description, details="No image available for edit mode check")

        h, w = img.shape[:2]
        crop_tb = img[int(h * 0.040):int(h * 0.170), int(w * 0.400):int(w * 0.980)]
        blue_mask = (crop_tb[:, :, 0] > 160) & (crop_tb[:, :, 2] < 100) & (crop_tb[:, :, 1] < 130)
        blue_pixels = int(np.count_nonzero(blue_mask))
        is_view_mode = blue_pixels < 15

        return ClassificationResult(
            classifier_id=self.id, issue_detected=is_view_mode, issue_name=self.issue_description, fix_name=self.fix_description,
            severity=self.severity, details=f"Editor in View Mode ({blue_pixels} blue pixels, required >= 15 for Edit Mode)" if is_view_mode else "Edit Mode active",
            target_coordinates=_get_box_center(context, "edit_mode") or (int(w * 0.85), int(h * 0.08)),
            metadata={"blue_pixel_count": blue_pixels}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        detect_res = await self.detect(context)
        coords = detect_res.target_coordinates or _get_box_center(context, "edit_mode") or (860, 65)
        await _tap_coords(serial, disp_id, coords)

        re_detect = await _recheck_classifier(self, serial, disp_id)
        success = not (re_detect and re_detect.issue_detected)
        return FixResult(classifier_id=self.id, success=success,
                         message="Successfully switched to edit mode" if success else "Edit pencil tapped; verify edit mode is active",
                         actions_taken=[f"Tapped edit pencil icon at {coords} on display {disp_id}"],
                         metadata={"recheck": re_detect.to_dict() if re_detect else None})


class KeyboardOpenClassifier(BaseClassifier):
    id = "keyboard_open"
    issue_description = "Keyboard is open"
    fix_description = "close keyboard"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        serial = await get_active_adb_serial(context.serial)
        ime_open = await is_ime_visible(serial)
        return ClassificationResult(classifier_id=self.id, issue_detected=ime_open, issue_name=self.issue_description,
                                    fix_name=self.fix_description, severity=self.severity,
                                    details="Soft keyboard is currently visible on screen" if ime_open else "Keyboard is suppressed/hidden",
                                    metadata={"ime_visible": ime_open})

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        await ensure_adb_keyboard_closed(serial)
        await run_adb_shell("am broadcast -a com.matrixcapture.app.ACTION_CLOSE_KEYBOARD", serial)
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keyevent 4", serial)
        await run_adb_shell("input -d 0 keyevent 4", serial)
        await run_adb_shell("input keyevent 4", serial)
        await asyncio.sleep(0.25)

        still_open = await is_ime_visible(serial)
        if still_open:
            if disp_id > 0:
                await run_adb_shell(f"input -d {disp_id} keyevent 111", serial)
            await run_adb_shell("input keyevent 111", serial)
            await run_adb_shell("input keyevent 4", serial)
            await asyncio.sleep(0.2)
            still_open = await is_ime_visible(serial)

        return FixResult(classifier_id=self.id, success=not still_open,
                         message="Keyboard closed successfully ✔" if not still_open else "Dispatched keyboard dismiss commands",
                         actions_taken=["Dispatched ensure_adb_keyboard_closed & BACK keyevents"],
                         metadata={"ime_still_visible": still_open})


class ModalOverlayClassifier(BaseClassifier):
    id = "modal_overlay"
    issue_description = "modal appearing over teams markdown"
    fix_description = "dismiss modal dialog"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        img = _get_cv_img(context)
        if img is None:
            return ClassificationResult(classifier_id=self.id, issue_detected=False, issue_name=self.issue_description,
                                        fix_name=self.fix_description, details="No image available for modal check")

        h, w = img.shape[:2]
        gray = cv2.cvtColor(img[int(h * 0.20):int(h * 0.80), int(w * 0.20):int(w * 0.80)], cv2.COLOR_BGR2GRAY)
        contours, _ = cv2.findContours(cv2.Canny(gray, 50, 150), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        has_modal, details, target_coords = False, "No modal detected over teams markdown", None
        min_area = (h * 0.25) * (w * 0.25)
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            if (cw * ch) > min_area and 0.4 < (cw / max(1, ch)) < 3.0:
                has_modal = True
                target_coords = (int(w * 0.20 + x + cw / 2), int(h * 0.20 + y + ch / 2))
                details = f"Modal dialog bounding box detected ({cw}x{ch} px) over editor"
                break

        return ClassificationResult(classifier_id=self.id, issue_detected=has_modal, issue_name=self.issue_description,
                                    fix_name=self.fix_description, severity=self.severity, details=details, target_coordinates=target_coords)

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keyevent 111", serial)
        await run_adb_shell("input keyevent 111", serial)
        await asyncio.sleep(0.3)
        return FixResult(classifier_id=self.id, success=True, message="Sent Escape to dismiss modal dialog",
                         actions_taken=["Dispatched KEYCODE_ESCAPE (111) to dismiss modal"])


class MatrixAppOverlayClassifier(BaseClassifier):
    id = "matrix_app_overlay"
    issue_description = "mobile app matrix capture appearing over teams markdown"
    fix_description = "minimize or reposition matrix capture overlay"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        img = _get_cv_img(context)
        if img is None:
            return ClassificationResult(classifier_id=self.id, issue_detected=False, issue_name=self.issue_description,
                                        fix_name=self.fix_description, details="No image available for overlay check")

        h, w = img.shape[:2]
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, np.array([45, 160, 140]), np.array([90, 255, 255]))
        green_pixel_count = int(np.count_nonzero(mask[int(h * 0.15):int(h * 0.90), int(w * 0.10):int(w * 0.85)]))
        is_overlapping = green_pixel_count > 120

        return ClassificationResult(
            classifier_id=self.id, issue_detected=is_overlapping, issue_name=self.issue_description, fix_name=self.fix_description,
            severity=self.severity,
            details=f"Matrix Capture overlay detected over editor ({green_pixel_count} green pixels)" if is_overlapping else "Matrix Capture overlay not obscuring editor text",
            metadata={"green_pixel_count": green_pixel_count}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} tap 500 120", serial)
        await run_adb_shell("input tap 500 120", serial)
        await asyncio.sleep(0.3)
        return FixResult(classifier_id=self.id, success=True, message="Re-focused Teams window to clear overlay",
                         actions_taken=["Tapped Teams window title bar to re-focus editor"])


class OcrDegradedClassifier(BaseClassifier):
    id = "ocr_degraded"
    issue_description = "previous ocr capture degraded"
    fix_description = "re-acquire settled frame with enhanced dwell"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        from services import state
        frames = list(state.captured_frames.values())
        if not frames:
            return ClassificationResult(classifier_id=self.id, issue_detected=False, issue_name=self.issue_description,
                                        fix_name=self.fix_description, details="No previous frames captured yet (healthy)")

        sorted_f = sorted(frames, key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))
        last_frame = sorted_f[-1]
        status, extracted_cnt = last_frame.get("status", ""), last_frame.get("extracted_line_count", 0)
        is_error = status.startswith("error")

        is_degraded, reason = False, f"Previous OCR healthy ({extracted_cnt} lines extracted)"
        if is_error:
            is_degraded, reason = True, f"Previous frame {last_frame.get('frame_id', '')[:8]} failed OCR: {status}"
        elif len(sorted_f) >= 2 and sorted_f[-2].get("extracted_line_count", 0) >= 20 and extracted_cnt < 5:
            is_degraded, reason = True, f"OCR line count dropped from {sorted_f[-2].get('extracted_line_count', 0)} to {extracted_cnt} lines on page {last_frame.get('page_index')}"
        elif extracted_cnt == 0 and status == "processed":
            is_degraded, reason = True, f"0 lines extracted from page {last_frame.get('page_index')}"

        return ClassificationResult(classifier_id=self.id, issue_detected=is_degraded, issue_name=self.issue_description,
                                    fix_name=self.fix_description, severity=self.severity, details=reason,
                                    metadata={"last_extracted_count": extracted_cnt, "status": status})

    async def fix(self, context: ClassifierContext) -> FixResult:
        from services import state
        frames = list(state.captured_frames.values())
        if frames:
            last_frame = sorted(frames, key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))[-1]
            last_frame["status"] = "queued"
            state.recapture_queue.append({"line_number": last_frame.get("top_line", 1), "page_index": last_frame.get("page_index", 1)})
        return FixResult(classifier_id=self.id, success=True, message="Queued previous frame for re-capture and re-OCR",
                         actions_taken=["Flagged frame for recapture with extended settle dwell"])


class Line1StuckClassifier(BaseClassifier):
    id = "line_1_stuck"
    issue_description = "page still displays line 1 (EOF navigation did not move to end of file)"
    fix_description = "focus editor window and re-attempt navigation"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        img = _get_cv_img(context)
        if img is None:
            return ClassificationResult(
                classifier_id=self.id, issue_detected=False, issue_name=self.issue_description,
                fix_name=self.fix_description, details="No image available for line 1 check"
            )

        top_line = 0
        gutter = []
        try:
            from ocr_engine import find_gutter_numbers_cluster
            gutter = find_gutter_numbers_cluster(img)
            if gutter:
                top_line = gutter[0][1]
        except Exception as e:
            top_line = 0

        # Check if line 1 or top line <= 2 is visible in gutter
        is_stuck = False
        if gutter:
            has_line_1 = any(ln <= 2 for _, ln in gutter[:3])
            is_stuck = has_line_1 or (0 < top_line <= 2)
        elif context.alignment_data:
            # Fallback check against alignment data top line
            at = context.alignment_data.get("top_line", 0)
            if 0 < at <= 2:
                is_stuck = True
                top_line = at

        h, w = img.shape[:2]
        details = (
            f"Page still displays Line {top_line or 1} at top of gutter (EOF navigation failed to advance)"
            if is_stuck else
            f"Page is navigated past Line 1 (current top line: Ln {top_line})"
        )

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=is_stuck,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details=details,
            target_coordinates=(int(w * 0.5), int(h * 0.5)),
            metadata={"top_line": top_line, "gutter_lines": [ln for _, ln in gutter[:5]] if gutter else []}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        coords = context.target_coordinates or (500, 500)
        # 1. Tap center of editor to focus
        await _tap_coords(serial, disp_id, coords, delay=0.2)
        # 2. Ensure keyboard closed
        await ensure_adb_keyboard_closed(serial)
        # 3. Send Ctrl+End keycombination
        from services.adb_service import send_hid_keycombination
        await send_hid_keycombination(113, 123, serial)
        await asyncio.sleep(0.8)

        re_detect = await _recheck_classifier(self, serial, disp_id)
        success = not (re_detect and re_detect.issue_detected)
        return FixResult(
            classifier_id=self.id,
            success=success,
            message="Successfully navigated away from Line 1" if success else "Re-attempted EOF navigation; editor still displays Line 1",
            actions_taken=[f"Focused editor at {coords} on display {disp_id} and re-sent Ctrl+End"],
            metadata={"recheck": re_detect.to_dict() if re_detect else None}
        )

