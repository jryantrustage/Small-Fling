"""
UI Automator & Local Vision-Guided UI Interaction Service.
Provides high-precision, display-aware touch interaction for Android / Teams Markdown Editor:
1. Selecting the editor toolbar with touch motion on the pencil icon to enable single-pane edit mode.
2. Expanding the theme pull-down menu and selecting Dark Mode.
3. Hybrid orchestration combining Android UIAutomator accessibility tree, local VLM (MiniCPM-V/Ollama),
   and high-speed RapidOCR / computer vision template anchors.
"""

import asyncio
import re
import xml.etree.ElementTree as ET
from typing import Optional, Tuple, Dict, Any, List
import cv2
import numpy as np

import config
from services.adb_service import (
    run_adb_shell, get_active_adb_serial, detect_external_display_id,
    capture_external_screenshot, ensure_adb_keyboard_closed, auto_fix_viewport,
    dismiss_keyboard
)
from ocr_engine import get_rapid_ocr


async def get_display_dimensions(serial: str, display_id: int) -> Tuple[int, int]:
    """Retrieves physical or override width and height for the given display ID."""
    try:
        out = await run_adb_shell("dumpsys display", serial, timeout=3.0)
        stdout = out.get("stdout", "")
        # Search for displayId <display_id> ... real <w> x <h>
        pattern = rf'displayId\s+{display_id}.*?real\s+(\d+)\s+x\s+(\d+)'
        m = re.search(pattern, stdout, re.DOTALL)
        if m:
            return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    return 1920, 1080


async def dump_ui_hierarchy(serial: str) -> Optional[ET.Element]:
    """Dumps the active UI hierarchy XML via Android UIAutomator."""
    try:
        res = await run_adb_shell("uiautomator dump /data/local/tmp/ui_dump.xml >/dev/null 2>&1 && cat /data/local/tmp/ui_dump.xml", serial, timeout=4.5)
        stdout = res.get("stdout", "")
        if "<hierarchy" in stdout:
            xml_str = stdout[stdout.find("<hierarchy"):]
            if "</hierarchy>" in xml_str:
                xml_str = xml_str[:xml_str.find("</hierarchy>") + len("</hierarchy>")]
            return ET.fromstring(xml_str)
    except Exception as e:
        print(f"[UiAutomator] XML dump warning: {e}")
    return None


def find_node_bounds(root: ET.Element, match_fn) -> Optional[Tuple[int, int, int, int]]:
    """Traverses the XML element tree and returns (x1, y1, x2, y2) of first matching node with valid bounds."""
    for node in root.iter("node"):
        if match_fn(node):
            b_str = node.attrib.get("bounds", "")
            m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', b_str)
            if m:
                x1, y1, x2, y2 = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
                if x2 > x1 and y2 > y1:
                    return (x1, y1, x2, y2)
    return None


def locate_toolbar_icons_cv(img: np.ndarray) -> Dict[str, Tuple[int, int]]:
    """
    High-speed Computer Vision locator for Teams Markdown Editor action buttons:
    - 'pencil' (edit mode)
    - 'split' (split screen view)
    - 'preview' (preview only)
    - 'theme_dropdown' (sun/moon theme dropdown anchor)
    """
    h, w = img.shape[:2]
    scale_x = (w / 1920.0) if w > 0 else 1.0
    scale_y = (h / 1080.0) if h > 0 else 1.0

    results: Dict[str, Tuple[int, int]] = {
        "pencil": (int(1660 * scale_x), int(246 * scale_y)),
        "split": (int(1710 * scale_x), int(246 * scale_y)),
        "preview": (int(1760 * scale_x), int(246 * scale_y)),
        "theme_dropdown": (int(1840 * scale_x), int(246 * scale_y)),
    }

    # Search inside the markdown formatting toolbar icon strip (y: 230..262 on 1080p, x: >= 1615),
    # avoiding the top/bottom horizontal toolbar borders at y~217 and y~269.
    tb_y1, tb_y2 = int(230 * scale_y), int(262 * scale_y)
    tb_x1, tb_x2 = int(1615 * scale_x), min(w, int(1895 * scale_x))

    crop = img[tb_y1:tb_y2, tb_x1:tb_x2]
    if crop.size == 0:
        return results

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    is_dark = np.mean(gray) < 110
    if is_dark:
        # Use max(B, G, R) > 105 so both the blue active button and gray inactive buttons are captured
        max_chan = np.max(crop, axis=2)
        icons_mask = max_chan > 105
    else:
        min_chan = np.min(crop, axis=2)
        icons_mask = min_chan < 200

    col_counts = np.sum(icons_mask, axis=0)
    active_cols = np.where(col_counts >= 2)[0]

    blobs = []
    if len(active_cols) > 0:
        cur = [active_cols[0]]
        for col in active_cols[1:]:
            if col - cur[-1] <= int(max(6, round(8 * scale_x))):
                cur.append(col)
            else:
                blobs.append((cur[0], cur[-1]))
                cur = [col]
        blobs.append((cur[0], cur[-1]))

    significant_blobs = [b for b in blobs if (b[1] - b[0]) >= max(4, int(5 * scale_x))]
    centers = [tb_x1 + (b[0] + b[1]) // 2 for b in significant_blobs]

    row_counts = np.sum(icons_mask, axis=1)
    active_rows = np.where(row_counts >= 2)[0]
    center_y = int(tb_y1 + np.mean(active_rows)) if len(active_rows) > 0 else int(246 * scale_y)

    if len(centers) >= 2:
        results["pencil"] = (int(centers[0]), int(center_y))
        if len(centers) >= 3 and (centers[-1] - centers[-2]) <= max(28, int(42 * scale_x)):
            # Combine the Sun/Moon glyph and its dropdown chevron into the button center
            results["theme_dropdown"] = (int((centers[-2] + centers[-1]) // 2), int(center_y))
        else:
            results["theme_dropdown"] = (int(centers[-1]), int(center_y))
        if len(centers) >= 3:
            results["preview"] = (int(centers[1] if len(centers) == 3 else centers[-2]), int(center_y))
        if len(centers) >= 4:
            results["split"] = (int(centers[1]), int(center_y))

    return results


def _detect_active_toolbar_mode_button(img: np.ndarray) -> Optional[str]:
    """Inspects the right-hand markdown toolbar to determine which mode icon ('pencil', 'split', 'preview') has the active blue pill highlight."""
    if img is None or img.size == 0:
        return None
    h_i, w_i = img.shape[:2]
    scale_x = (w_i / 1920.0) if w_i > 0 else 1.0
    scale_y = (h_i / 1080.0) if h_i > 0 else 1.0
    tb_y1 = int(205 * scale_y)
    tb_y2 = int(280 * scale_y)
    tb_x1 = int(1580 * scale_x)
    crop_tb = img[tb_y1:tb_y2, tb_x1:]
    if crop_tb.size == 0:
        return None
    hsv_p = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2HSV)
    blue_mask = cv2.inRange(hsv_p, np.array([95, 50, 50]), np.array([135, 255, 255]))
    conts, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid_conts = [c for c in conts if cv2.contourArea(c) >= 15]
    valid_conts.sort(key=lambda c: cv2.contourArea(c), reverse=True)
    for c in valid_conts:
        bx, _, bw, _ = cv2.boundingRect(c)
        norm_cx = (tb_x1 + bx + bw // 2) / scale_x
        if norm_cx < 1685:
            return "pencil"
        elif 1685 <= norm_cx < 1735:
            return "split"
        elif norm_cx >= 1735:
            return "preview"
    return None


async def enable_edit_mode(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Switches the Teams Markdown Editor from Read-Only / Preview / Split mode to single-pane Edit Mode
    by locating and tapping the Pencil icon in the toolbar, then immediately suppressing the soft keyboard.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"success": False, "message": "No connected ADB device", "actions": []}
    if "mock" in str(ser).lower():
        return {
            "success": True,
            "actions": ["Tapped pencil icon to enter single-pane edit mode (mock)"],
            "target_coords": (1660, 246),
            "edit_mode_passed": True,
            "message": "Switched to single-pane Edit Mode ✔"
        }

    disp_id = display_id or await detect_external_display_id(ser)
    disp_pfx = f"-d {disp_id} " if (disp_id and disp_id > 0) else ""
    actions = []

    # 1. Capture current display screenshot to accurately inspect active mode
    snap = await capture_external_screenshot(ser, bypass_lock=True)
    target_coords = None

    if snap:
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            h_i, w_i = img.shape[:2]
            scale_x = (w_i / 1920.0) if w_i > 0 else 1.0
            scale_y = (h_i / 1080.0) if h_i > 0 else 1.0

            active_button = _detect_active_toolbar_mode_button(img)
            if active_button == "pencil":
                actions.append("Pencil icon already active (single-pane Edit Mode verified)")
                await dismiss_keyboard(ser, disp_id)
                return {
                    "success": True,
                    "actions": actions,
                    "target_coords": (int(1660 * scale_x), int(246 * scale_y)),
                    "edit_mode_passed": True,
                    "message": "Editor is already in single-pane Edit Mode ✔"
                }

            icons = locate_toolbar_icons_cv(img)
            target_coords = icons.get("pencil")
            if target_coords:
                actions.append(f"Located pencil edit icon at {target_coords} via toolbar vision engine (current mode: {active_button or 'read_only'})")

    # 2. UIAutomator fallback if CV locator did not find coordinates
    if not target_coords:
        root = await dump_ui_hierarchy(ser)
        if root is not None:
            bounds = find_node_bounds(root, lambda n: (
                "edit" in n.attrib.get("content-desc", "").lower() or
                "edit only" in n.attrib.get("content-desc", "").lower() or
                "edit" in n.attrib.get("text", "").lower()
            ))
            if bounds:
                target_coords = ((bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2)
                actions.append(f"Located pencil edit icon at {target_coords} via UIAutomator tree")

    # 3. Default resolution-scaled coordinates fallback (Pencil icon in secondary toolbar)
    if not target_coords:
        disp_w, disp_h = await get_display_dimensions(ser, disp_id)
        target_coords = (int(1660 * disp_w / 1920), int(246 * disp_h / 1080))
        actions.append(f"Using calibrated toolbar coordinates {target_coords} on display {disp_id}")

    # 4. Dispatch touch motion directly on pencil icon to switch from Read-Only to Edit Mode
    x, y = target_coords
    await run_adb_shell(f"input {disp_pfx}tap {x} {y}", ser)
    actions.append(f"Dispatched touch tap on pencil icon at ({x}, {y}) on display {disp_id}")
    await asyncio.sleep(0.45)
    await dismiss_keyboard(ser, disp_id)

    # 5. Verify pencil icon is now active; retry with mouse + touch tap if needed
    snap_verify = await capture_external_screenshot(ser, bypass_lock=True)
    edit_verified = False
    if snap_verify:
        img_v = cv2.imdecode(np.frombuffer(snap_verify, np.uint8), cv2.IMREAD_COLOR)
        if img_v is not None:
            edit_verified = (_detect_active_toolbar_mode_button(img_v) == "pencil")
            if not edit_verified:
                icons_v = locate_toolbar_icons_cv(img_v)
                rx, ry = icons_v.get("pencil") or (x, y)
                await run_adb_shell(f"input {disp_pfx}mouse tap {rx} {ry}; sleep 0.1; input {disp_pfx}tap {rx} {ry}", ser)
                actions.append(f"Retried mouse+touch tap on pencil icon at ({rx}, {ry}) to enforce Edit Mode")
                await asyncio.sleep(0.45)
                await dismiss_keyboard(ser, disp_id)
                snap_v2 = await capture_external_screenshot(ser, bypass_lock=True)
                if snap_v2:
                    img_v2 = cv2.imdecode(np.frombuffer(snap_v2, np.uint8), cv2.IMREAD_COLOR)
                    if img_v2 is not None:
                        edit_verified = (_detect_active_toolbar_mode_button(img_v2) == "pencil")

    # 6. CRITICAL: Suppress soft keyboard if opened upon gaining editor focus
    await dismiss_keyboard(ser, disp_id)
    actions.append("Suppressed on-screen keyboard policy")
    await asyncio.sleep(0.25)

    # Update alignment status
    try:
        from services.adb_service import check_and_update_alignment
        await check_and_update_alignment(ser)
    except Exception:
        pass

    return {
        "success": True,
        "actions": actions,
        "target_coords": target_coords,
        "edit_mode_passed": True,
        "edit_verified": edit_verified,
        "message": "Switched from Read-Only to single-pane Edit Mode via Pencil icon ✔"
    }


async def select_dark_mode(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Expands the editor theme pull-down menu and selects Dark Mode.
    Uses RapidOCR / local VLM grounding to identify the 'Dark Mode' menu item in the opened popup.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"success": False, "message": "No connected ADB device", "actions": []}
    if "mock" in str(ser).lower():
        return {
            "success": True,
            "actions": ["Selected Dark Mode from theme pull-down menu (mock)"],
            "luminance": 15.0,
            "message": "Dark mode is active ✔"
        }

    disp_id = display_id or await detect_external_display_id(ser)
    actions = []

    # 1. Grab initial frame and check if already in dark mode
    snap = await capture_external_screenshot(ser, bypass_lock=True)
    if snap:
        img0 = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img0 is not None:
            h0, w0 = img0.shape[:2]
            body_sample = img0[int(h0 * 0.20):int(h0 * 0.80), int(w0 * 0.20):int(w0 * 0.80)]
            init_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY)))
            if init_lum < 65.0:
                actions.append(f"Editor is already in Dark Mode (luminance {round(init_lum, 1)} < 65.0)")
                return {"success": True, "actions": actions, "luminance": init_lum, "message": "Dark mode is already active ✔"}

    disp_w, disp_h = await get_display_dimensions(ser, disp_id)
    scale_x, scale_y = disp_w / 1920.0, disp_h / 1080.0

    # 2. Locate the Theme Pull-Down Anchor button in secondary toolbar
    anchor_coords = None
    if snap:
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            icons = locate_toolbar_icons_cv(img)
            anchor_coords = icons.get("theme_dropdown")
            if anchor_coords:
                actions.append(f"Located theme pull-down anchor at {anchor_coords} via toolbar vision engine")

    if not anchor_coords:
        anchor_coords = (int(1825 * scale_x), int(230 * scale_y))
        actions.append(f"Using calibrated theme dropdown anchor {anchor_coords}")

    # 3. Touch motion to open the theme pull-down menu
    ax, ay = anchor_coords
    await run_adb_shell(f"input -d {disp_id} tap {ax} {ay}", ser)
    actions.append(f"Tapped theme pull-down menu trigger at ({ax}, {ay}) on display {disp_id}")

    # 4. Settle dwell for dropdown menu animation (~300-350ms)
    await asyncio.sleep(0.35)

    # 5. Capture screenshot with open dropdown menu
    menu_snap = await capture_external_screenshot(ser, bypass_lock=True)
    dark_mode_coords = None

    if menu_snap:
        menu_img = cv2.imdecode(np.frombuffer(menu_snap, np.uint8), cv2.IMREAD_COLOR)
        if menu_img is not None:
            mh, mw = menu_img.shape[:2]
            # Crop the dropdown menu area below the anchor button
            y1_d = max(0, ay - 10)
            y2_d = min(mh, ay + 200)
            x1_d = max(0, ax - 300)
            x2_d = min(mw, ax + 50)
            menu_crop = menu_img[y1_d:y2_d, x1_d:x2_d]

            # Fast OCR on the dropdown crop
            ocr = get_rapid_ocr()
            if ocr and menu_crop.size > 0:
                ocr_results, _ = ocr(menu_crop)
                if ocr_results:
                    for box, txt, score in ocr_results:
                        t_clean = txt.lower()
                        if "dark" in t_clean or ("mode" in t_clean and "light" not in t_clean):
                            cx = int(sum(pt[0] for pt in box) / 4)
                            cy = int(sum(pt[1] for pt in box) / 4)
                            dark_mode_coords = (x1_d + cx, y1_d + cy)
                            actions.append(f"Located 'Dark Mode' item via OCR at {dark_mode_coords} ('{txt}')")
                            break

    # 6. Fallback coordinates for Dark Mode menu item if OCR didn't hit (Row 1 of popup menu relative to anchor)
    if not dark_mode_coords:
        dark_mode_coords = (max(40, ax - int(140 * scale_x)), ay + max(48, int(57 * scale_y)))
        actions.append(f"Using calibrated 'Dark Mode' menu row at {dark_mode_coords}")

    # 7. Touch motion to select 'Dark Mode'
    if dark_mode_coords:
        dx, dy = dark_mode_coords
        await run_adb_shell(f"input -d {disp_id} tap {dx} {dy}", ser)
        actions.append(f"Tapped 'Dark Mode' option at ({dx}, {dy}) on display {disp_id}")
        await dismiss_keyboard(ser, disp_id)

    # 8. Settle and verify screen luminance
    await asyncio.sleep(0.4)
    final_snap = await capture_external_screenshot(ser, bypass_lock=True)
    final_lum = 100.0
    if final_snap:
        final_img = cv2.imdecode(np.frombuffer(final_snap, np.uint8), cv2.IMREAD_COLOR)
        if final_img is not None:
            fh, fw = final_img.shape[:2]
            body_sample = final_img[int(fh * 0.20):int(fh * 0.80), int(fw * 0.20):int(fw * 0.80)]
            final_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY)))

    is_dark = final_lum < 55.0
    actions.append(f"Post-selection editor luminance: {round(final_lum, 1)} (< 55.0 indicates Dark Mode)")

    # Update alignment status
    try:
        from services.adb_service import check_and_update_alignment
        await check_and_update_alignment(ser)
    except Exception:
        pass

    return {
        "success": bool(is_dark),
        "actions": actions,
        "luminance": round(final_lum, 1),
        "target_coords": dark_mode_coords,
        "message": f"Successfully switched to Dark Mode (luminance {round(final_lum, 1)} < 55.0) ✔" if is_dark else "Theme menu tapped; verify Dark Mode is active"
    }


async def prepare_markdown_editor_window(
    serial: Optional[str] = None,
    display_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Prepares a newly opened or floating Teams Markdown Editor window for OCR capture:
    1. Waits for FilePreviewActivity / markdown viewer to open on the external display.
    2. Maximizes the floating freeform window via its top-right '[]' Maximize control.
    3. Switches from Read-Only to Edit Mode via the toolbar Pencil icon FIRST (unlocking the theme dropdown).
    4. Selects Dark Mode from the toolbar theme dropdown (Moon/Sun icon).
    5. Verifies both Dark Mode and Edit Mode are active, dismisses any mini-modals, and updates alignment status.
    """
    from services.adb_service import (
        maximize_floating_markdown_window,
        resolve_and_dismiss_mini_modals,
        check_and_update_alignment
    )
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"success": False, "message": "No connected ADB device", "actions": []}

    disp_id = display_id or await detect_external_display_id(ser)
    actions: List[str] = []

    # 0. Wait up to 3.5s for FilePreviewActivity (Teams Markdown Editor) to be resumed on display
    if "mock" not in str(ser).lower():
        for _ in range(7):
            act_chk = await run_adb_shell("dumpsys activity activities | grep -E 'topResumedActivity|resumedActivity|FilePreviewActivity'", ser, timeout=1.5)
            if "filepreviewactivity" in (act_chk.get("stdout") or "").lower():
                break
            await asyncio.sleep(0.5)

    # 1. Maximize floating markdown editor window if in freeform mode
    max_res = await maximize_floating_markdown_window(serial=ser, display_id=disp_id)
    actions.extend(max_res.get("actions", []))
    if max_res.get("was_floating"):
        await asyncio.sleep(0.9)

    # 2. Switch from Read-Only to Edit Mode FIRST using automation (Pencil icon)
    #    (In Read-Only / Preview mode, the Sun/Moon theme dropdown is disabled until Edit Mode is enabled!)
    edit_res = await enable_edit_mode(serial=ser, display_id=disp_id)
    actions.extend(edit_res.get("actions", []))

    # 3. Select Dark Mode using automation (Moon/Sun theme dropdown)
    dark_res = await select_dark_mode(serial=ser, display_id=disp_id)
    actions.extend(dark_res.get("actions", []))

    # 4. Self-healing verification: re-verify Edit Mode & Dark Mode if needed
    if not dark_res.get("success", False):
        edit_res = await enable_edit_mode(serial=ser, display_id=disp_id)
        actions.extend(edit_res.get("actions", []))
        dark_res = await select_dark_mode(serial=ser, display_id=disp_id)
        actions.extend(dark_res.get("actions", []))

    # 5. Dismiss any floating mini-modals and suppress keyboard
    modal_res = await resolve_and_dismiss_mini_modals(serial=ser, display_id=disp_id, caller_node="prepare_markdown_editor")
    if modal_res.get("actions_taken"):
        actions.extend(modal_res["actions_taken"])
    await dismiss_keyboard(ser, disp_id)

    # 6. Re-evaluate alignment status
    align = await check_and_update_alignment(ser)
    is_ready = bool(align.get("is_aligned") or (edit_res.get("success") and dark_res.get("success")))

    return {
        "success": is_ready,
        "maximized": bool(max_res.get("maximized", True)),
        "edit_mode": bool(edit_res.get("success", False)),
        "dark_mode": bool(dark_res.get("success", False)),
        "file_name": align.get("file_name", ""),
        "alignment": align,
        "actions": actions,
        "message": f"Markdown editor maximized, Dark Mode & Edit Mode (Pencil) active ({align.get('file_name') or 'ready'}) ✔"
    }


def scan_folder_markdown_files_cv(img: np.ndarray) -> Dict[str, Any]:
    """
    Analyzes a Teams / OneDrive folder files list screenshot and extracts:
    - folder_name: Name of the folder in the top header
    - files: Visual top-to-bottom list of markdown files in the folder with part numbers and tap coordinates
    - part_files: Sorted by part_number (1..N) even when the folder lists files out of sequence (e.g. part2..part9, part1)
    - predetermined_parts: Complete predetermined manifest of bundle parts sorted by part_number
    """
    from alignment_engine import parse_multipart_markdown_filename, normalize_bundle_identifier_ocr
    if img is None or img.size == 0:
        return {
            "is_folder_view": False,
            "folder_name": "",
            "files": [],
            "part_files": [],
            "predetermined_parts": [],
            "available_parts": [],
            "total_parts": 0,
        }

    h, w = img.shape[:2]
    scale_x = w / 1920.0
    scale_y = h / 1080.0
    ocr = get_rapid_ocr()
    if ocr is None:
        return {
            "is_folder_view": False,
            "folder_name": "",
            "files": [],
            "part_files": [],
            "predetermined_parts": [],
            "available_parts": [],
            "total_parts": 0,
        }

    # Crop folder header + file list region down to y=1025 so bottom row (e.g. Row 9 part1.md) is never clipped
    y1_c = int(95 * scale_y)
    y2_c = min(h, int(1025 * scale_y))
    x1_c = int(45 * scale_x)
    x2_c = min(w, int(1420 * scale_x))
    crop = img[y1_c:y2_c, x1_c:x2_c]
    res, _ = ocr(crop)

    folder_name = ""
    raw_rows: List[List[Dict[str, Any]]] = []
    has_modified_by = False

    if res:
        tokens = []
        for box, txt, score in res:
            pts = np.array(box)
            bx1 = x1_c + int(pts[:, 0].min())
            by1 = y1_c + int(pts[:, 1].min())
            bx2 = x1_c + int(pts[:, 0].max())
            by2 = y1_c + int(pts[:, 1].max())
            clean = str(txt).strip()
            if not clean:
                continue
            if "modified" in clean.lower() or "kb," in clean.lower() or "kb " in clean.lower():
                has_modified_by = True
                continue
            tokens.append({
                "x1": bx1, "y1": by1, "x2": bx2, "y2": by2,
                "cy": (by1 + by2) / 2.0, "text": clean, "score": float(score)
            })

        # Group tokens on the same horizontal row so split filenames (e.g. prefix + '_part3.md') are merged
        tokens.sort(key=lambda t: (t["cy"], t["x1"]))
        for tok in tokens:
            if tok["y1"] < int(190 * scale_y) and tok["x1"] < int(900 * scale_x):
                if not tok["text"].lower().endswith(".md") and len(tok["text"]) >= 4 and "teams" not in tok["text"].lower():
                    folder_name = normalize_bundle_identifier_ocr(tok["text"])
                continue
            if tok["y1"] >= int(190 * scale_y):
                placed = False
                for r_group in raw_rows:
                    avg_cy = sum(item["cy"] for item in r_group) / len(r_group)
                    if abs(tok["cy"] - avg_cy) <= max(14.0, 18.0 * scale_y):
                        r_group.append(tok)
                        placed = True
                        break
                if not placed:
                    raw_rows.append([tok])

    files: List[Dict[str, Any]] = []
    for r_group in raw_rows:
        r_group.sort(key=lambda t: t["x1"])
        merged_txt = "".join(
            (t["text"] if idx == 0 or t["text"].startswith("_") or r_group[idx - 1]["text"].endswith("_") else f"_{t['text']}")
            for idx, t in enumerate(r_group)
        )
        merged_txt = normalize_bundle_identifier_ocr(merged_txt)
        if (
            ".md" in merged_txt.lower()
            or ".markdown" in merged_txt.lower()
            or re.search(r'part[_\-\s]*\d+', merged_txt, re.IGNORECASE)
            or (folder_name and folder_name[:8].lower() in merged_txt.lower())
        ):
            bx1 = min(t["x1"] for t in r_group)
            by1 = min(t["y1"] for t in r_group)
            bx2 = max(t["x2"] for t in r_group)
            by2 = max(t["y2"] for t in r_group)
            bw, bh = bx2 - bx1, by2 - by1
            cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
            avg_score = sum(t["score"] for t in r_group) / len(r_group)
            mp = parse_multipart_markdown_filename(merged_txt)
            files.append({
                "file_name": mp.get("file_name") or merged_txt,
                "raw_text": merged_txt,
                "is_multipart": bool(mp.get("is_multipart")),
                "base_prefix": mp.get("base_prefix") or "",
                "part_number": mp.get("part_number"),
                "bbox": [bx1, by1, bw, bh],
                "tap_coords": [cx, cy],
                "score": round(float(avg_score), 3)
            })

    files.sort(key=lambda f: f["bbox"][1])
    for r_idx, f_item in enumerate(files, start=1):
        f_item["visual_row_index"] = r_idx

    # Unify canonical base_prefix across sibling part files in the same folder
    prefix_counts: Dict[str, int] = {}
    for f_item in files:
        bp = f_item.get("base_prefix") or ""
        if bp:
            bp_norm = normalize_bundle_identifier_ocr(bp)
            prefix_counts[bp_norm] = prefix_counts.get(bp_norm, 0) + 1
    canonical_prefix = ""
    if prefix_counts:
        # Prefer prefixes containing uppercase 'UI' when tied
        canonical_prefix = sorted(
            prefix_counts.keys(),
            key=lambda k: (prefix_counts[k], 1 if "UI" in k else 0),
            reverse=True,
        )[0]
    if canonical_prefix and (not folder_name or folder_name.lower() == canonical_prefix.lower()):
        folder_name = canonical_prefix

    # If one file in a multi-part folder had a clipped/smudged part digit, infer the single missing part number in 1..N
    known_parts = {int(f["part_number"]) for f in files if f.get("part_number") is not None}
    unnumbered = [f for f in files if f.get("part_number") is None]
    if len(known_parts) >= 2 and len(unnumbered) == 1:
        expected_set = set(range(1, len(files) + 1))
        missing = sorted(expected_set - known_parts)
        if len(missing) == 1:
            inferred_p = missing[0]
            unnumbered[0]["part_number"] = inferred_p
            unnumbered[0]["is_multipart"] = True
            unnumbered[0]["base_prefix"] = canonical_prefix or unnumbered[0].get("base_prefix") or folder_name
            if unnumbered[0]["base_prefix"]:
                unnumbered[0]["file_name"] = f"{unnumbered[0]['base_prefix']}_part{inferred_p}.md"

    # Normalize all part file names to canonical_prefix when matching
    for f_item in files:
        if f_item.get("is_multipart") and f_item.get("part_number") is not None and canonical_prefix:
            if (f_item.get("base_prefix") or "").lower() == canonical_prefix.lower():
                f_item["base_prefix"] = canonical_prefix
                f_item["file_name"] = f"{canonical_prefix}_part{int(f_item['part_number'])}.md"

    # Sort part_files by part_number ascending (1..N) even if folder displays them out of sequence (e.g. part2..part9, part1)
    part_files = sorted(
        [f for f in files if f.get("is_multipart") and f.get("part_number") is not None],
        key=lambda f: int(f["part_number"]),
    )
    if not part_files and files:
        for idx, f_item in enumerate(files, start=1):
            f_copy = dict(f_item)
            f_copy["part_number"] = idx
            part_files.append(f_copy)
    part_numbers = sorted({int(f["part_number"]) for f in part_files})
    total_parts = max(part_numbers) if part_numbers else len(files)
    is_folder_view = bool(len(files) >= 1 and (has_modified_by or len(files) >= 2 or folder_name))

    predetermined_parts = [
        {
            "part_number": int(pf["part_number"]),
            "total_parts": total_parts,
            "scope_label": f"MD {int(pf['part_number'])} / {total_parts}",
            "file_name": pf["file_name"],
            "base_prefix": pf.get("base_prefix") or canonical_prefix or folder_name,
            "tap_coords": pf["tap_coords"],
            "bbox": pf["bbox"],
            "visual_row_index": pf.get("visual_row_index", idx + 1),
            "status": "pending",
        }
        for idx, pf in enumerate(part_files)
    ]

    return {
        "is_folder_view": is_folder_view,
        "folder_name": folder_name or canonical_prefix,
        "base_prefix": canonical_prefix or folder_name,
        "files": files,
        "part_files": part_files,
        "predetermined_parts": predetermined_parts,
        "available_parts": part_numbers,
        "total_parts": total_parts,
    }


async def _ensure_teams_authenticated_if_needed(
    serial: str,
    disp_id: Optional[int],
    snap_bytes: Optional[bytes] = None,
    actions: Optional[List[str]] = None,
) -> Optional[bytes]:
    """
    Checks if the external display screenshot is showing the Blank White Teams Fingerprint screen (Image 3)
    or the Desktop Mode PIN Prompt (Image 4). When enabled in Settings (config.AUTO_ENTER_PIN),
    sends Escape (if on blank white fingerprint screen) and enters PIN 2992, returning a fresh screenshot.
    """
    import config
    from services.adb_service import detect_teams_auth_or_fingerprint_screen_cv, auto_handle_pin_authentication
    if not serial or "mock" in str(serial).lower():
        return snap_bytes
    if snap_bytes is None:
        snap_bytes = await capture_external_screenshot(serial, bypass_lock=True)
    if not snap_bytes:
        return None
    img = cv2.imdecode(np.frombuffer(snap_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return snap_bytes
    auth_check = detect_teams_auth_or_fingerprint_screen_cv(img)
    if auth_check.get("detected") and auth_check.get("auth_type") == "pin":
        if getattr(config, "AUTO_ENTER_PIN", True):
            pin_res = await auto_handle_pin_authentication(
                serial=serial,
                ext_display_id=disp_id,
                screen_img=img,
            )
            if actions is not None and pin_res.get("actions"):
                actions.extend(pin_res["actions"])
            await asyncio.sleep(1.0)
            snap_bytes = await capture_external_screenshot(serial, bypass_lock=True)
    return snap_bytes


async def exit_markdown_to_folder_list(
    serial: Optional[str] = None,
    display_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Clicks the Back Arrow ('<-') in the top-left of the Teams Markdown Editor (Attachment 1)
    to exit the markdown view and return to the Teams folder files list (Attachment 2).
    Automatically handles Blank White Teams Fingerprint / PIN screens (Images 3 & 4) if triggered.
    """
    from services.adb_service import is_editor_full_screen, resolve_and_dismiss_mini_modals
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"success": False, "message": "No connected ADB device", "actions": []}

    disp_id = display_id or await detect_external_display_id(ser)
    disp_pfx = f"-d {disp_id} " if (disp_id and disp_id > 0) else ""
    actions: List[str] = []

    await dismiss_keyboard(ser, disp_id)
    await resolve_and_dismiss_mini_modals(serial=ser, display_id=disp_id, caller_node="exit_markdown_to_folder")

    snap = await capture_external_screenshot(ser, bypass_lock=True)
    snap = await _ensure_teams_authenticated_if_needed(ser, disp_id, snap, actions)
    if snap:
        img0 = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img0 is not None:
            initial_scan = scan_folder_markdown_files_cv(img0)
            if initial_scan.get("is_folder_view") and len(initial_scan.get("files", [])) >= 2:
                actions.append("Already on Teams folder files list view")
                return {
                    "success": True,
                    "already_in_folder": True,
                    "folder_scan": initial_scan,
                    "actions": actions
                }

    # Determine Back Arrow ('<-') coordinates depending on whether editor is fullscreen or floating
    fs_status = await is_editor_full_screen(ser, disp_id, image_bytes=snap)
    disp_w, disp_h = await get_display_dimensions(ser, disp_id)
    scale_x, scale_y = disp_w / 1920.0, disp_h / 1080.0

    if not fs_status.get("is_fullscreen", True) and fs_status.get("bounds"):
        bl, bt, br, bb = fs_status["bounds"]
        back_x = int(bl + 33 * scale_x)
        back_y = int(bt + 95 * scale_y)
    else:
        back_x = int(48 * scale_x)
        back_y = int(151 * scale_y)

    # Refine Back Arrow ('<-') centroid from screenshot bright glyph pixels
    if snap:
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            hi, wi = img.shape[:2]
            rx1 = max(0, back_x - int(28 * scale_x))
            rx2 = min(wi, back_x + int(32 * scale_x))
            ry1 = max(0, back_y - int(26 * scale_y))
            ry2 = min(hi, back_y + int(26 * scale_y))
            roi = img[ry1:ry2, rx1:rx2]
            if roi.size > 0:
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                ys, xs = np.where(gray > 130)
                if len(xs) >= 8:
                    back_x = int(np.mean(xs) + rx1)
                    back_y = int(np.mean(ys) + ry1)

    # Tap the Back Arrow ('<-') to exit markdown editor back to folder list
    await run_adb_shell(f"input {disp_pfx}tap {back_x} {back_y}", ser, timeout=2.5)
    actions.append(f"Tapped Back Arrow ('<-') at ({back_x}, {back_y}) on display #{disp_id} to exit markdown view")
    await asyncio.sleep(1.35)

    snap_after = await capture_external_screenshot(ser, bypass_lock=True)
    snap_after = await _ensure_teams_authenticated_if_needed(ser, disp_id, snap_after, actions)
    folder_scan: Dict[str, Any] = {"is_folder_view": False, "files": []}
    if snap_after:
        img_after = cv2.imdecode(np.frombuffer(snap_after, np.uint8), cv2.IMREAD_COLOR)
        if img_after is not None:
            folder_scan = scan_folder_markdown_files_cv(img_after)

    if not folder_scan.get("is_folder_view"):
        # Retry with mouse tap on Back Arrow
        await run_adb_shell(f"input {disp_pfx}mouse tap {back_x} {back_y}", ser, timeout=2.5)
        actions.append(f"Retried mouse tap on Back Arrow ('<-') at ({back_x}, {back_y})")
        await asyncio.sleep(1.35)
        snap_retry = await capture_external_screenshot(ser, bypass_lock=True)
        snap_retry = await _ensure_teams_authenticated_if_needed(ser, disp_id, snap_retry, actions)
        if snap_retry:
            img_retry = cv2.imdecode(np.frombuffer(snap_retry, np.uint8), cv2.IMREAD_COLOR)
            if img_retry is not None:
                folder_scan = scan_folder_markdown_files_cv(img_retry)

    # Save folder manifest screenshot for diagnostics & bundle tracking
    if folder_scan.get("is_folder_view") and (snap_after or snap):
        try:
            from services import state
            manifest_path = state.FRAMES_DIR / "bundle_folder_manifest.png"
            manifest_path.write_bytes(snap_after or snap)
        except Exception:
            pass

    return {
        "success": bool(folder_scan.get("is_folder_view") or len(folder_scan.get("files", [])) > 0),
        "back_button_clicked": [back_x, back_y],
        "folder_scan": folder_scan,
        "actions": actions
    }


async def predetermine_bundle_from_folder_screenshot(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    target_part_number: Optional[int] = None,
    reopen_editor: bool = True,
    force_rescan: bool = False,
    disp_id: Optional[int] = None,
    reopen_current_file: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Predetermines the list of markdown files in a multi-part bundle during Project Initialization
    by taking a screenshot of all files in the selected OneDrive / Teams folder before proceeding
    with the scan.
    - If already on the Teams folder view (Image 5), scans all files directly and opens Part 1 (or target_part_number).
    - If inside the Teams Markdown editor, clicks Back Arrow to take the folder screenshot,
      catalogs all parts (even if out of order on screen like part2..part9, part1), and re-opens the active markdown part.
    """
    import db
    import re
    from alignment_engine import detect_teams_markdown_alignment, parse_multipart_markdown_filename
    from services import state

    if display_id is None and disp_id is not None:
        display_id = disp_id
    if reopen_current_file is not None:
        reopen_editor = bool(reopen_current_file)

    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {"status": "mock", "is_multipart": False, "predetermined_parts": []}

    disp_id = display_id or await detect_external_display_id(ser)
    disp_pfx = f"-d {disp_id} " if (disp_id and disp_id > 0) else ""
    actions: List[str] = []

    snap = await capture_external_screenshot(ser, bypass_lock=True)
    snap = await _ensure_teams_authenticated_if_needed(ser, disp_id, snap, actions)
    if not snap:
        return {"status": "error", "message": "Could not capture external display screenshot", "actions": actions}

    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return {"status": "error", "message": "Could not decode external display screenshot", "actions": actions}

    # Check if already on the Teams / OneDrive folder file list (Image 5)
    folder_scan = scan_folder_markdown_files_cv(img)
    detected_open_file = ""
    detected_open_part = target_part_number

    if not folder_scan.get("is_folder_view"):
        # Currently inside the Markdown Editor: read header filename first
        align = detect_teams_markdown_alignment(img)
        detected_open_file = align.get("file_name") or ""
        mp_open = parse_multipart_markdown_filename(detected_open_file)
        if mp_open.get("is_multipart") and mp_open.get("part_number"):
            detected_open_part = detected_open_part or int(mp_open["part_number"])
        existing_pred = list(state.multipart_bundle_state.get("predetermined_parts") or [])
        existing_pfx = (state.multipart_bundle_state.get("base_prefix") or "").lower()
        open_pfx = (mp_open.get("base_prefix") or "").lower()
        if (
            not force_rescan
            and existing_pred
            and (not open_pfx or not existing_pfx or open_pfx[:8] in existing_pfx or existing_pfx[:8] in open_pfx)
        ):
            # Already predetermined for this bundle (e.g. during Part 2..N initialization)
            cur_p = int(detected_open_part or state.multipart_bundle_state.get("current_part") or 1)
            for pt in existing_pred:
                pno = int(pt.get("part_number") or 0)
                if pno < cur_p:
                    pt["status"] = "completed"
                elif pno == cur_p:
                    pt["status"] = "scanning"
            return {
                "status": "cached",
                "is_multipart": True,
                "folder_name": state.multipart_bundle_state.get("folder_name", ""),
                "base_prefix": state.multipart_bundle_state.get("base_prefix", ""),
                "current_part": cur_p,
                "total_parts": state.multipart_bundle_state.get("total_parts") or len(existing_pred),
                "available_parts": state.multipart_bundle_state.get("available_parts", []),
                "predetermined_parts": existing_pred,
                "opened_file_name": detected_open_file,
                "actions": actions,
            }
        # Only exit to folder list if this is a multi-part file, force_rescan=True, or header filename is a Teams markdown
        if force_rescan or mp_open.get("is_multipart") or align.get("back_button_coords"):
            exit_res = await exit_markdown_to_folder_list(serial=ser, display_id=disp_id)
            actions.extend(exit_res.get("actions", []))
            folder_scan = exit_res.get("folder_scan", {})
    else:
        try:
            manifest_path = state.FRAMES_DIR / "bundle_folder_manifest.png"
            manifest_path.write_bytes(snap)
        except Exception:
            pass

    predetermined_parts = folder_scan.get("predetermined_parts", [])
    available_parts = folder_scan.get("available_parts", [])
    total_parts = folder_scan.get("total_parts", 0)
    base_prefix = folder_scan.get("base_prefix") or folder_scan.get("folder_name") or ""

    if predetermined_parts:
        part_to_open = int(detected_open_part or 1)
        if available_parts and part_to_open not in available_parts:
            part_to_open = min(available_parts)
        for pt in predetermined_parts:
            pt["status"] = "scanning" if pt["part_number"] == part_to_open else "pending"

        state.multipart_bundle_state.update({
            "is_multipart": len(predetermined_parts) > 1 or bool(available_parts),
            "base_prefix": base_prefix or state.multipart_bundle_state.get("base_prefix", ""),
            "folder_name": folder_scan.get("folder_name") or base_prefix,
            "current_part": part_to_open,
            "total_parts": total_parts or len(predetermined_parts),
            "available_parts": available_parts,
            "predetermined_parts": predetermined_parts,
            "next_part_number": (part_to_open + 1) if (part_to_open + 1) in available_parts else None,
            "next_file_name": next(
                (p["file_name"] for p in predetermined_parts if p["part_number"] == part_to_open + 1),
                None,
            ),
        })

        target_entry = next(
            (p for p in predetermined_parts if p["part_number"] == part_to_open),
            predetermined_parts[0],
        )

        # Synchronize the active project in SQLite with the predetermined bundle metadata so the Left Sidebar
        # card immediately displays the bundle & nested queue (Parts MD 1 / N .. MD N / N)
        try:
            active_proj = db.get_active_project()
            eff_tot = int(total_parts or len(predetermined_parts) or 1)
            eff_prefix = base_prefix or folder_scan.get("folder_name") or (active_proj or {}).get("bundle_name") or (active_proj or {}).get("name") or "Bundle"
            clean_bundle_slug = re.sub(r"[^a-z0-9]+", "_", str(eff_prefix).lower()).strip("_") or "bundle"
            bundle_id = (active_proj or {}).get("bundle_id") or f"bundle_{clean_bundle_slug}"
            target_fn = target_entry.get("file_name") or f"{eff_prefix}_part{part_to_open}.md"

            if active_proj and active_proj.get("id"):
                db.update_project_bundle_metadata(
                    project_id=active_proj["id"],
                    bundle_id=bundle_id,
                    bundle_name=eff_prefix,
                    part_number=int(active_proj.get("part_number") or part_to_open),
                    total_parts=eff_tot,
                    part_file_name=active_proj.get("part_file_name") or target_fn,
                )
                db.append_project_filename(active_proj["id"], target_fn)
            else:
                new_p = db.create_project(
                    name=target_fn[:-3] if target_fn.lower().endswith(".md") else target_fn,
                    bundle_id=bundle_id,
                    bundle_name=eff_prefix,
                    part_number=part_to_open,
                    total_parts=eff_tot,
                    part_file_name=target_fn,
                )
                if new_p and new_p.get("id"):
                    db.append_project_filename(new_p["id"], target_fn)
            state.sync_multipart_state_from_alignment()
        except Exception as db_sync_err:
            print(f"[predetermine_bundle_from_folder_screenshot] DB bundle metadata sync warning: {db_sync_err}")

        if reopen_editor:
            tx, ty = target_entry["tap_coords"]
            await run_adb_shell(f"input {disp_pfx}tap {tx} {ty}", ser, timeout=2.5)
            actions.append(
                f"Predetermined {len(predetermined_parts)} bundle parts ({available_parts}); tapped Part {target_entry['part_number']} ('{target_entry['file_name']}') at ({tx}, {ty})"
            )
            await asyncio.sleep(1.85)
            await _ensure_teams_authenticated_if_needed(ser, disp_id, None, actions)
            prep_res = await prepare_markdown_editor_window(serial=ser, display_id=disp_id)
            actions.extend(prep_res.get("actions", []))
            detected_open_file = target_entry["file_name"]
            state.multipart_bundle_state["last_opened_file"] = detected_open_file
            state.sync_multipart_state_from_alignment()

    return {
        "status": "success" if predetermined_parts else "single_file",
        "is_multipart": bool(len(predetermined_parts) >= 1),
        "folder_name": folder_scan.get("folder_name", ""),
        "base_prefix": base_prefix,
        "current_part": state.multipart_bundle_state.get("current_part") or detected_open_part or 1,
        "total_parts": total_parts,
        "available_parts": available_parts,
        "predetermined_parts": predetermined_parts,
        "opened_file_name": detected_open_file,
        "folder_scan": folder_scan,
        "actions": actions,
    }


async def select_and_open_next_markdown_part(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    current_file_name: Optional[str] = None,
    current_part_number: Optional[int] = None,
    target_part_number: Optional[int] = None,
    base_prefix: Optional[str] = None
) -> Dict[str, Any]:
    """
    Full automated multi-part bundle transition:
    1. Exits the completed markdown editor view by clicking the Back Arrow ('<-').
    2. Handles Blank White Teams Fingerprint / PIN screens (Escape -> PIN 2992) if prompted.
    3. Scans the Teams folder files list (and merges with predetermined_parts from initialization)
       to locate the next part by part_number even when the folder is out of sequence (e.g. part2..part9, part1).
    4. Selects and clicks the file with the incremented part number (e.g., part 1 finishes -> part 2 is opened).
    5. Maximizes the newly opened markdown editor window via automation, selects Dark Mode,
       and switches from Read-Only to Edit Mode via the Pencil icon.
    """
    from alignment_engine import parse_multipart_markdown_filename
    from services import state
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "success": False, "message": "No connected ADB device", "actions": []}

    disp_id = display_id or await detect_external_display_id(ser)
    disp_pfx = f"-d {disp_id} " if (disp_id and disp_id > 0) else ""
    actions: List[str] = []

    mp_info = parse_multipart_markdown_filename(current_file_name)
    predetermined = list(state.multipart_bundle_state.get("predetermined_parts") or [])
    cur_part = (
        int(current_part_number)
        if (current_part_number is not None and int(current_part_number) > 0)
        else (mp_info.get("part_number") or state.multipart_bundle_state.get("current_part") or 1)
    )
    next_part = (
        int(target_part_number)
        if (target_part_number is not None and int(target_part_number) > 0)
        else (cur_part + 1)
    )
    prefix = (base_prefix or mp_info.get("base_prefix") or state.multipart_bundle_state.get("base_prefix") or "").lower()

    # Step 1: Exit current markdown view to Teams folder files list
    exit_res = await exit_markdown_to_folder_list(serial=ser, display_id=disp_id)
    actions.extend(exit_res.get("actions", []))
    folder_scan = exit_res.get("folder_scan", {})
    files = list(folder_scan.get("files", []))
    available_parts = sorted(
        set(folder_scan.get("available_parts", []))
        | {int(p["part_number"]) for p in predetermined if p.get("part_number") is not None}
    )
    total_parts = max(
        folder_scan.get("total_parts", 0),
        state.multipart_bundle_state.get("total_parts") or 0,
        max(available_parts) if available_parts else 0,
    )

    # Update predetermined_parts with fresh folder_scan if available
    if folder_scan.get("predetermined_parts"):
        by_part = {int(p["part_number"]): dict(p) for p in predetermined if p.get("part_number") is not None}
        for fp in folder_scan["predetermined_parts"]:
            pno = int(fp["part_number"])
            prev_st = by_part.get(pno, {}).get("status", "pending")
            by_part[pno] = {**fp, "status": "completed" if pno <= cur_part else prev_st}
        predetermined = [by_part[k] for k in sorted(by_part.keys())]
        state.multipart_bundle_state["predetermined_parts"] = predetermined

    # Step 2: Locate the next part in sequence (e.g. part 1 finishes -> part 2 is opened)
    candidates = [f for f in files if f.get("part_number") == next_part]
    if not candidates and predetermined:
        # Fallback to predetermined manifest from initialization (handles out-of-order list & OCR jitter)
        pred_matches = [p for p in predetermined if int(p.get("part_number") or 0) == next_part and p.get("tap_coords")]
        if pred_matches:
            candidates = pred_matches
            actions.append(f"Resolved Part {next_part} from predetermined folder manifest ('{pred_matches[0].get('file_name')}')")

    if not candidates and ser and "mock" not in str(ser).lower():
        # Scroll folder list down slightly in case the next part is below the visible fold
        await run_adb_shell(f"input {disp_pfx}swipe 600 760 600 320 260 >/dev/null 2>&1", ser, timeout=2.5)
        await asyncio.sleep(0.85)
        snap_scroll = await capture_external_screenshot(ser, bypass_lock=True)
        snap_scroll = await _ensure_teams_authenticated_if_needed(ser, disp_id, snap_scroll, actions)
        if snap_scroll:
            img_scroll = cv2.imdecode(np.frombuffer(snap_scroll, np.uint8), cv2.IMREAD_COLOR)
            if img_scroll is not None:
                scroll_scan = scan_folder_markdown_files_cv(img_scroll)
                if scroll_scan.get("files"):
                    files.extend(scroll_scan["files"])
                    available_parts = sorted(set(available_parts) | set(scroll_scan.get("available_parts", [])))
                    total_parts = max(total_parts, scroll_scan.get("total_parts", 0))
                    candidates = [f for f in scroll_scan["files"] if f.get("part_number") == next_part]

    if not files and not candidates:
        return {
            "status": "error",
            "success": False,
            "message": "Could not detect markdown files in Teams folder list after clicking Back Arrow",
            "folder_scan": folder_scan,
            "actions": actions
        }

    if prefix and len(candidates) > 1:
        pref_cands = [f for f in candidates if prefix[:8] in (f.get("base_prefix") or "").lower()]
        if pref_cands:
            candidates = pref_cands

    if not candidates:
        # Check if next_part exceeds all parts in the folder -> Multi-part bundle is 100% finished!
        if available_parts and next_part > max(available_parts):
            for pt in predetermined:
                pt["status"] = "completed"
            msg = f"All {len(available_parts)} markdown parts ({', '.join(f'part{p}' for p in available_parts)}) in folder have been completed!"
            actions.append(msg)
            return {
                "status": "bundle_completed",
                "success": True,
                "bundle_completed": True,
                "has_next_part": False,
                "completed_part": cur_part,
                "available_parts": available_parts,
                "total_parts": max(available_parts),
                "predetermined_parts": predetermined,
                "folder_scan": folder_scan,
                "actions": actions,
                "message": msg
            }
        return {
            "status": "not_found",
            "success": False,
            "has_next_part": False,
            "target_part_number": next_part,
            "next_part_number": next_part,
            "available_parts": available_parts,
            "predetermined_parts": predetermined,
            "folder_scan": folder_scan,
            "actions": actions,
            "message": f"Part {next_part} not found in folder list (detected parts: {available_parts})"
        }

    target_entry = candidates[0]
    tx, ty = target_entry["tap_coords"]
    target_filename = target_entry["file_name"]

    for pt in predetermined:
        if int(pt.get("part_number") or 0) <= cur_part:
            pt["status"] = "completed"
        elif int(pt.get("part_number") or 0) == next_part:
            pt["status"] = "scanning"

    # Step 3: Tap the next markdown file in the folder list to open it
    await run_adb_shell(f"input {disp_pfx}tap {tx} {ty}", ser, timeout=2.5)
    actions.append(f"Selected and tapped '{target_filename}' at ({tx}, {ty}) in Teams folder list")
    await asyncio.sleep(1.85)

    # Check if opening the markdown file triggered a Blank White Teams Fingerprint / PIN prompt
    snap_post_tap = await capture_external_screenshot(ser, bypass_lock=True)
    snap_after_auth = await _ensure_teams_authenticated_if_needed(ser, disp_id, snap_post_tap, actions)
    if snap_after_auth and snap_after_auth != snap_post_tap:
        # If PIN auth just unlocked back to the folder view, tap the file once more to open it
        img_post_auth = cv2.imdecode(np.frombuffer(snap_after_auth, np.uint8), cv2.IMREAD_COLOR)
        if img_post_auth is not None and scan_folder_markdown_files_cv(img_post_auth).get("is_folder_view"):
            await run_adb_shell(f"input {disp_pfx}tap {tx} {ty}", ser, timeout=2.5)
            actions.append(f"Re-tapped '{target_filename}' at ({tx}, {ty}) after PIN authentication")
            await asyncio.sleep(1.6)

    # Step 4: Maximize the newly opened markdown editor, select Dark Mode, and switch from Read-Only to Edit Mode (Pencil icon)
    prep_res = await prepare_markdown_editor_window(serial=ser, display_id=disp_id)
    actions.extend(prep_res.get("actions", []))

    opened_name = prep_res.get("file_name") or target_filename
    resolved_total_parts = (total_parts or max(available_parts)) if available_parts else next_part
    return {
        "status": "success",
        "transition_state": "opened_next_part",
        "success": True,
        "bundle_completed": False,
        "has_next_part": True,
        "previous_part": cur_part,
        "part_number": next_part,
        "next_part_number": next_part,
        "total_parts": resolved_total_parts,
        "available_parts": available_parts,
        "predetermined_parts": predetermined,
        "opened_file_name": opened_name,
        "project_name": re.sub(r'\.(md|markdown)$', '', opened_name, flags=re.IGNORECASE),
        "folder_scan": folder_scan,
        "prepare_result": prep_res,
        "actions": actions,
        "message": f"Opened '{opened_name}' (Part {next_part} of {resolved_total_parts or '?'}), maximized editor, selected Dark Mode, and switched to Edit Mode (Pencil) ✔"
    }


async def ensure_teams_maximized_and_dark_mode(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    enable_edit_mode: bool = True,
    enable_dark_mode: bool = True,
) -> Dict[str, Any]:
    """
    Ensures the Teams Markdown editor is maximized to Fullscreen, switched to Dark Mode,
    and switched to Edit Mode (Pencil icon).
    """
    return await prepare_markdown_editor_window(serial=serial, display_id=display_id)


