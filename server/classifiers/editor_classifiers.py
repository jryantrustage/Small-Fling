"""Implementations of general-purpose classifiers for Teams Markdown editor and mobile setup."""
import asyncio
import re
from typing import Optional, Tuple
import cv2
import numpy as np
from .base import BaseClassifier, ClassifierContext, ClassificationResult, FixResult
from services.adb_service import (
    run_adb_shell, get_active_adb_serial, detect_external_display_id,
    is_ime_visible, ensure_adb_keyboard_closed, auto_fix_viewport, capture_external_screenshot
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
    else:
        await run_adb_shell(f"input tap {x} {y}", serial)
    if delay:
        await asyncio.sleep(delay)

async def _recheck_classifier(classifier: BaseClassifier, serial: str, disp_id: int) -> Optional[ClassificationResult]:
    snap = await capture_external_screenshot(serial)
    return await classifier.detect(ClassifierContext(serial=serial, display_id=disp_id, image_bytes=snap)) if snap else None


class TeamsMarkdownVisibleClassifier(BaseClassifier):
    id = "teams_markdown_visible"
    issue_description = "Teams markdown editor is not visible on display"
    fix_description = "Launch and display Teams markdown editor on external desktop screen"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        serial = await get_active_adb_serial(context.serial)
        if not serial:
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=True,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                severity=self.severity,
                details="No active Android device connected via ADB (awaiting connection)",
                metadata={"connected": False}
            )

        img = _get_cv_img(context)
        align = context.alignment_data or {}
        boxes = align.get("boxes", {})
        teams_box = boxes.get("teams_logo", {})
        file_box = boxes.get("file_name", {})
        first_line_box = boxes.get("first_line", {})

        has_header_or_gutter = bool(
            (teams_box.get("passed") is True) or
            (file_box.get("passed") is True) or
            (first_line_box.get("passed") is True)
        )

        if img is None:
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=True,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                severity=self.severity,
                details="Teams markdown editor is not visible (awaiting live display stream)",
                metadata={"image_available": False}
            )

        h, w = img.shape[:2]
        center_crop = img[int(h * 0.35):int(h * 0.65), int(w * 0.2):int(w * 0.8)]
        mean_bgr = np.mean(center_crop, axis=(0, 1)) if center_crop.size > 0 else [0, 0, 0]
        # Standby frame: B ~ 23, G ~ 17, R ~ 13
        is_standby = (abs(mean_bgr[0] - 23) < 10 and abs(mean_bgr[1] - 17) < 10 and abs(mean_bgr[2] - 13) < 10)

        disp_id = context.display_id or await detect_external_display_id(serial)
        is_teams_focused = False
        try:
            win_chk = await run_adb_shell("dumpsys window | grep -E 'mFocusedApp'", serial, timeout=2.0)
            win_out = win_chk.get("stdout", "") if win_chk.get("status") == "ok" else ""
            is_teams_focused = "com.microsoft.teams" in win_out
        except Exception:
            pass

        # Use Visual State classifier to differentiate directory list vs viewer
        viewport_state = "unknown"
        if not has_header_or_gutter and img is not None:
            try:
                from services.visual_state_service import classify_editor_viewport
                snap_bytes = context.image_bytes
                if not snap_bytes and img is not None:
                    _, enc = cv2.imencode(".png", img)
                    snap_bytes = enc.tobytes()
                if snap_bytes:
                    vqa_res = classify_editor_viewport(snap_bytes)
                    viewport_state = vqa_res.get("state", "unknown")
                    if vqa_res.get("is_viewer_active"):
                        has_header_or_gutter = True
            except Exception:
                pass

        if is_standby or not has_header_or_gutter or not is_teams_focused:
            if is_standby:
                reason = "Standby canvas active; Teams markdown editor is not visible"
            elif viewport_state in ("directory", "list"):
                reason = "Teams has navigated away to a file list or directory; markdown editor is not open"
            else:
                reason = "Teams header, document tab, and gutter not detected in display stream"

            if not is_teams_focused and not is_standby:
                reason += " (Teams is not the focused window on external display)"

            fix_action = "Open markdown file from directory list" if viewport_state in ("directory", "list") else self.fix_description

            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=True,
                issue_name=self.issue_description,
                fix_name=fix_action,
                severity=self.severity,
                details=reason,
                target_coordinates=(int(w * 0.5), int(h * 0.5)),
                metadata={
                    "is_standby": is_standby,
                    "has_header_or_gutter": has_header_or_gutter,
                    "is_teams_focused": is_teams_focused,
                    "viewport_state": viewport_state,
                    "display_id": disp_id
                }
            )

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=False,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            details="Teams markdown editor is visible on external display (header and gutter verified)",
            target_coordinates=_get_box_center(context, "teams_logo") or (int(w * 0.1), int(h * 0.05)),
            metadata={"file_name": align.get("file_name", "")}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        if not serial:
            from services.adb_service import connect_device_for_model, current_device_model
            serial = await connect_device_for_model(current_device_model)
            if not serial:
                return FixResult(
                    classifier_id=self.id,
                    success=False,
                    message="Cannot display Teams: No Android device connected via ADB",
                    actions_taken=["Attempted wireless ADB auto-connect"]
                )

        disp_id = context.display_id or await detect_external_display_id(serial)
        actions = []

        # 1. Check if Teams is already in foreground on external display
        focus_res = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", serial, timeout=1.5)
        focus_out = focus_res.get("stdout", "") if focus_res.get("status") == "ok" else ""
        teams_already_open = "com.microsoft.teams" in focus_out

        if not teams_already_open:
            if disp_id > 0:
                await run_adb_shell(f"am start -n com.microsoft.teams/com.microsoft.skype.teams.Launcher --display {disp_id}", serial, timeout=2.0)
                actions.append(f"Dispatched am start for Teams on display {disp_id}")
            else:
                await run_adb_shell("am start -n com.microsoft.teams/com.microsoft.skype.teams.Launcher", serial, timeout=2.0)
                actions.append("Dispatched am start for Teams on primary display")
            await asyncio.sleep(0.4)

        # 2. Tap document body on external display to place cursor caret
        tap_coords = (500, 300)
        await _tap_coords(serial, disp_id, tap_coords, delay=0.1)
        actions.append(f"Tapped document text body at {tap_coords} on display {disp_id} to establish editor focus")

        # 3. Ensure soft keyboard is closed
        await ensure_adb_keyboard_closed(serial)
        actions.append("Suppressed on-screen keyboard")

        # 4. Brief settle
        await asyncio.sleep(0.2)
        await asyncio.sleep(0.8)
        re_detect = await _recheck_classifier(self, serial, disp_id)
        success = bool(re_detect and not re_detect.issue_detected)

        return FixResult(
            classifier_id=self.id,
            success=success,
            message="Teams markdown editor is now visible and focused on external display ✔" if success else "Launched Teams on external display; verify editor is open",
            actions_taken=actions,
            metadata={"recheck": re_detect.to_dict() if re_detect else None}
        )


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
        from services.ui_automator_service import select_dark_mode

        res = await select_dark_mode(serial=serial, display_id=disp_id)
        success = res.get("success", False)

        re_detect = await _recheck_classifier(self, serial, disp_id)
        if re_detect and not re_detect.issue_detected:
            success = True

        return FixResult(
            classifier_id=self.id,
            success=success,
            message="Successfully switched to Dark Mode from theme pull-down menu ✔" if success else res.get("message", "Theme pull-down menu tapped; verify dark mode"),
            actions_taken=res.get("actions", []),
            metadata={"recheck": re_detect.to_dict() if re_detect else None, "luminance": res.get("luminance")}
        )


class EditModeClassifier(BaseClassifier):
    id = "edit_mode"
    issue_description = "Editor is not in edit mode (pencil not selected; split screen duplicate text active)"
    fix_description = "Tap edit button (pencil icon) to enter single-pane edit mode & suppress keyboard"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        em = (context.alignment_data or {}).get("boxes", {}).get("edit_mode", {})
        if em.get("dismissed"):
            return ClassificationResult(
                classifier_id=self.id, issue_detected=False, issue_name=self.issue_description,
                fix_name=self.fix_description, details="Edit mode check dismissed by user (false positive ignored)"
            )

        img = _get_cv_img(context)
        split_screen_detected = bool(em.get("split_screen_detected", False))
        edit_mode_active = em.get("passed") is True

        target_coords = _get_box_center(context, "edit_mode")
        w_t = 1920
        h_t = 1080
        if img is not None:
            h_t, w_t = img.shape[:2]
            # Check center strip for vertical split-screen boundary (solid continuous divider line)
            center_strip = img[int(h_t * 0.20):int(h_t * 0.80), int(w_t * 0.46):int(w_t * 0.54)]
            if center_strip.size > 0:
                cs_gray = cv2.cvtColor(center_strip, cv2.COLOR_BGR2GRAY)
                sobel_x = cv2.Sobel(cs_gray, cv2.CV_16S, 1, 0, ksize=3)
                sobel_abs = cv2.convertScaleAbs(sobel_x)
                col_means = np.mean(sobel_abs, axis=0)
                if np.max(col_means) > 85.0:
                    split_screen_detected = True
                    edit_mode_active = False

        if not target_coords:
            target_coords = (int(w_t * 0.69), int(h_t * 0.08))

        if not edit_mode_active or split_screen_detected:
            reason = "Split screen with duplicated text detected across panes (pencil inactive)" if split_screen_detected else "Edit button (pencil icon) not selected; editor in read-only / split preview"
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=True,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                severity=self.severity,
                details=reason,
                target_coordinates=target_coords,
                metadata={
                    "edit_mode_active": edit_mode_active,
                    "split_screen_detected": split_screen_detected,
                    "target_coords": target_coords
                }
            )

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=False,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details="Editor is in active single-pane edit mode (pencil selected, no split screen)",
            target_coordinates=target_coords,
            metadata={"edit_mode_active": True, "split_screen_detected": False}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        if not serial:
            return FixResult(classifier_id=self.id, success=False, message="No Android device connected via ADB", actions_taken=[])

        disp_id = context.display_id or await detect_external_display_id(serial)
        from services.ui_automator_service import enable_edit_mode

        res = await enable_edit_mode(serial=serial, display_id=disp_id)
        success = res.get("success", False)

        re_detect = await _recheck_classifier(self, serial, disp_id)
        if re_detect and not re_detect.issue_detected:
            success = True

        return FixResult(
            classifier_id=self.id,
            success=success,
            message="Successfully switched Teams to single-pane edit mode (split screen eliminated) ✔" if success else res.get("message", "Tapped edit button; verify edit mode is active"),
            actions_taken=res.get("actions", []),
            metadata={"recheck": re_detect.to_dict() if re_detect else None}
        )


class ViewModeClassifier(EditModeClassifier):
    """Legacy alias for EditModeClassifier ensuring single-pane edit mode without split-screen duplicate text."""
    id = "view_mode"
    issue_description = "Editor is not in edit mode (split screen duplicate text active)"
    fix_description = "Select edit button (pencil icon) to enter single-pane edit mode"
    severity = "blocking"


class KeyboardOpenClassifier(BaseClassifier):
    id = "keyboard_open"
    issue_description = "Keyboard is open"
    fix_description = "close keyboard"
    severity = "warning"  # Non-blocking: automatically remediates without halting capture

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        serial = await get_active_adb_serial(context.serial)
        ime_open = await is_ime_visible(serial)
        if ime_open:
            # Completely automated: auto-dismiss the keyboard immediately in background
            await self.fix(context)
            ime_open = await is_ime_visible(serial, force_check=True)

        return ClassificationResult(
            classifier_id=self.id, issue_detected=ime_open, issue_name=self.issue_description,
            fix_name=self.fix_description, severity=self.severity,
            details="Keyboard auto-suppressed/hidden" if not ime_open else "Soft keyboard suppressed via automated policy",
            metadata={"ime_visible": ime_open}
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        disp_id = context.display_id or await detect_external_display_id(serial)
        await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0; input -d 0 keyevent 111 >/dev/null 2>&1", serial)
        await asyncio.sleep(0.15)

        still_open = await is_ime_visible(serial, force_check=True)
        if still_open and disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keyevent 111", serial)
            await asyncio.sleep(0.15)
            still_open = await is_ime_visible(serial, force_check=True)

        return FixResult(classifier_id=self.id, success=not still_open,
                         message="Keyboard closed successfully ✔" if not still_open else "Dispatched keyboard dismiss",
                         actions_taken=["Enforced hardware keyboard policy & dismissed IME"],
                         metadata={"ime_still_visible": still_open})


class ModalOverlayClassifier(BaseClassifier):
    id = "modal_overlay"
    issue_description = "modal appearing over teams markdown"
    fix_description = "dismiss modal dialog"
    severity = "warning"

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
            # Ignore large rectangles corresponding to the main editor container
            if cw > w * 0.60 or ch > h * 0.60:
                continue
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
            from ocr_engine import find_gutter_numbers_cluster, fast_detect_gutter_bounds
            t, _ = fast_detect_gutter_bounds(img, dpi_factor=0.75)
            if t > 0:
                top_line = t
            gutter = find_gutter_numbers_cluster(img, dpi_factor=0.75)
            if not top_line and gutter:
                top_line = gutter[0][1]
        except Exception as e:
            top_line = 0

        # Check if line 1 or top line <= 5 is visible in gutter
        is_stuck = False
        if 0 < top_line <= 5:
            is_stuck = True
        elif gutter:
            has_line_1 = any(ln <= 5 for _, ln in gutter[:3])
            is_stuck = has_line_1
        elif context.alignment_data:
            # Fallback check against alignment data top line
            at = context.alignment_data.get("top_line", 0)
            if 0 < at <= 5:
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


class EditorCursorFocusedClassifier(BaseClassifier):
    id = "editor_cursor_focused"
    issue_description = "cursor is not present or focus is lost on Teams markdown editor"
    fix_description = "focus Teams markdown editor and place active blinking cursor"
    severity = "blocking"

    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        serial = await get_active_adb_serial(context.serial)
        if not serial:
            return ClassificationResult(
                classifier_id=self.id, issue_detected=True, issue_name=self.issue_description,
                fix_name=self.fix_description, severity=self.severity,
                details="No active Android device connected via ADB",
                metadata={"connected": False}
            )

        img = _get_cv_img(context)
        disp_id = context.display_id or await detect_external_display_id(serial)

        # 1. INTRINSIC CHECKS:
        # A) Check window focus via dumpsys window
        is_window_focused = False
        try:
            win_chk = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", serial, timeout=2.0)
            win_out = win_chk.get("stdout", "") if win_chk.get("status") == "ok" else ""
            is_window_focused = "com.microsoft.teams" in win_out
        except Exception:
            pass

        # B) Check active input connection via dumpsys input_method
        has_input_connection = False
        is_preview_served = False
        try:
            ime_chk = await run_adb_shell("dumpsys input_method | grep -E 'mServedView|mInputConnection|mServedInputConnection'", serial, timeout=2.0)
            ime_out = ime_chk.get("stdout", "") if ime_chk.get("status") == "ok" else ""
            if "preview_host_view" in ime_out or "MAMWebView" in ime_out or ("com.microsoft.teams" in ime_out and "mInputConnection=" in ime_out):
                is_preview_served = True
            if "mInputConnection=" in ime_out and "idHash=" in ime_out and "mDeactivateRequested=false" in ime_out:
                has_input_connection = True
        except Exception:
            pass

        is_intrinsic_focused = is_window_focused and (is_preview_served or has_input_connection)

        # 2. VISUAL CHECKS (Caret / Blinking cursor detection in editor body):
        is_visual_caret_found = False
        caret_location = None
        if img is not None:
            h, w = img.shape[:2]
            # Focus on editor document text area: below toolbar (y > 100), right of line gutter (x > 80 to x < 600)
            doc_roi = img[int(h * 0.12):int(h * 0.50), int(w * 0.05):int(w * 0.45)]
            if doc_roi.size > 0:
                gray = cv2.cvtColor(doc_roi, cv2.COLOR_BGR2GRAY)
                # Sobel horizontal gradient finds vertical lines (caret candidate)
                grad_x = cv2.Sobel(gray, cv2.CV_16S, 1, 0, ksize=3)
                abs_grad_x = cv2.convertScaleAbs(grad_x)
                _, thresh = cv2.threshold(abs_grad_x, 80, 255, cv2.THRESH_BINARY)
                contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                for cnt in contours:
                    x, y, cw, ch = cv2.boundingRect(cnt)
                    # Vertical caret aspect ratio
                    if 1 <= cw <= 4 and 12 <= ch <= 35:
                        is_visual_caret_found = True
                        caret_location = (int(w * 0.05) + x, int(h * 0.12) + y)
                        break

        # A cursor is confirmed if intrinsic focus is established or visual caret is verified
        is_focused_and_cursor_present = is_intrinsic_focused or (is_window_focused and is_visual_caret_found)
        h_t = img.shape[0] if img is not None else 1080
        w_t = img.shape[1] if img is not None else 1920
        target_coords = caret_location or (int(w_t * 0.25), int(h_t * 0.25))

        if is_focused_and_cursor_present:
            return ClassificationResult(
                classifier_id=self.id,
                issue_detected=False,
                issue_name=self.issue_description,
                fix_name=self.fix_description,
                details=f"Cursor is present and focus is on Teams markdown editor (intrinsic: window={is_window_focused}, input={is_preview_served or has_input_connection}, visual caret={is_visual_caret_found})",
                target_coordinates=target_coords,
                metadata={
                    "window_focused": is_window_focused,
                    "preview_served": is_preview_served,
                    "input_connection": has_input_connection,
                    "visual_caret_found": is_visual_caret_found,
                    "caret_location": caret_location,
                    "display_id": disp_id
                }
            )

        details = "Editor cursor is missing or focus is lost: "
        if not is_window_focused:
            details += "Teams window does not have active window focus; "
        if not (is_preview_served or has_input_connection):
            details += "MAMWebView preview_host_view input connection is not bound; "
        if not is_visual_caret_found:
            details += "No visual blinking vertical caret detected in document body."

        return ClassificationResult(
            classifier_id=self.id,
            issue_detected=True,
            issue_name=self.issue_description,
            fix_name=self.fix_description,
            severity=self.severity,
            details=details.strip(),
            target_coordinates=target_coords,
            metadata={
                "window_focused": is_window_focused,
                "preview_served": is_preview_served,
                "input_connection": has_input_connection,
                "visual_caret_found": is_visual_caret_found,
                "display_id": disp_id
            }
        )

    async def fix(self, context: ClassifierContext) -> FixResult:
        serial = await get_active_adb_serial(context.serial)
        if not serial:
            return FixResult(classifier_id=self.id, success=False, message="No Android device connected via ADB", actions_taken=[])

        disp_id = context.display_id or await detect_external_display_id(serial)
        actions = []

        # Safe focus check: Bring Teams FilePreviewActivity to front ONLY if not already focused, without tapping
        try:
            win_chk = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", serial, timeout=1.5)
            stdout = win_chk.get("stdout") or ""
            if "FilePreviewActivity" not in stdout:
                task_res = await run_adb_shell("dumpsys activity tasks | grep -E 'Task\\{.*com\\.microsoft\\.teams'", serial, timeout=1.5)
                m_t = re.search(r'#(\d+)\s+type=', task_res.get("stdout", ""))
                if m_t:
                    await run_adb_shell(f"cmd activity task to-front {m_t.group(1)}", serial)
                    actions.append(f"Brought Teams task #{m_t.group(1)} to front")
                    await asyncio.sleep(0.3)
        except Exception:
            pass

        # Dismiss on-screen keyboard policy cleanly without Back key or screen taps
        await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0; input -d 0 keyevent 111 >/dev/null 2>&1", serial)
        actions.append("Suppressed soft keyboard policy (show_ime_with_hard_keyboard=0)")

        return FixResult(
            classifier_id=self.id,
            success=True,
            message="Ensured Teams task is in front and suppressed virtual keyboard without screen taps",
            actions_taken=actions
        )


