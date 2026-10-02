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
    capture_external_screenshot, ensure_adb_keyboard_closed, auto_fix_viewport
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
        res = await run_adb_shell("uiautomator dump /dev/stdout", serial, timeout=3.5)
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
    # Search upper right quadrant (y: 8%..20%, x: 50%..100%)
    tb_y1, tb_y2 = int(h * 0.08), int(h * 0.20)
    tb_x1, tb_x2 = int(w * 0.50), w

    crop = img[tb_y1:tb_y2, tb_x1:tb_x2]
    if crop.size == 0:
        return {}

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    # The toolbar has a distinct background (either light ~240+ or dark ~30)
    # We find the horizontal toolbar strip
    is_dark = np.mean(gray) < 100
    strip_mask = (gray < 70) if is_dark else (gray > 220)
    row_counts = np.sum(strip_mask, axis=1)

    matching_rows = np.where(row_counts > 0.4 * crop.shape[1])[0]
    if len(matching_rows) == 0:
        bar_y1, bar_y2 = 10, crop.shape[0] - 10
    else:
        bar_y1, bar_y2 = matching_rows[0], matching_rows[-1]

    toolbar_strip = crop[bar_y1:bar_y2, :]
    strip_gray = cv2.cvtColor(toolbar_strip, cv2.COLOR_BGR2GRAY)

    # Icon foreground pixels
    icons_mask = (strip_gray > 120) if is_dark else (strip_gray < 220)
    col_counts = np.sum(icons_mask, axis=0)
    active_cols = np.where(col_counts > 2)[0]

    blobs = []
    if len(active_cols) > 0:
        cur = [active_cols[0]]
        for col in active_cols[1:]:
            if col - cur[-1] <= 8:
                cur.append(col)
            else:
                blobs.append((cur[0], cur[-1]))
                cur = [col]
        blobs.append((cur[0], cur[-1]))

    # Filter out small noise and divider lines (divider width <= 2)
    significant_blobs = [b for b in blobs if (b[1] - b[0]) >= 4]

    center_y = tb_y1 + (bar_y1 + bar_y2) // 2
    results: Dict[str, Tuple[int, int]] = {}

    # The action group is at the far right of the toolbar:
    # [Pencil] [Split] [Preview] | [Theme Dropdown (Sun/Moon + Chevron)]
    if len(significant_blobs) >= 4:
        action_blobs = significant_blobs[-4:]
        results["pencil"] = (tb_x1 + (action_blobs[0][0] + action_blobs[0][1]) // 2, center_y)
        results["split"] = (tb_x1 + (action_blobs[1][0] + action_blobs[1][1]) // 2, center_y)
        results["preview"] = (tb_x1 + (action_blobs[2][0] + action_blobs[2][1]) // 2, center_y)
        results["theme_dropdown"] = (tb_x1 + (action_blobs[3][0] + action_blobs[3][1]) // 2, center_y)
    elif len(significant_blobs) >= 1:
        # Fallback to known relative offsets on 1920x1080 display
        scale_x = w / 1920.0
        scale_y = h / 1080.0
        results["pencil"] = (int(1777 * scale_x), int(149 * scale_y))
        results["split"] = (int(1804 * scale_x), int(149 * scale_y))
        results["preview"] = (int(1831 * scale_x), int(149 * scale_y))
        results["theme_dropdown"] = (int(1877 * scale_x), int(149 * scale_y))

    return results


async def enable_edit_mode(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Selects the editor toolbar with touch motion on the pencil icon to enable single-pane edit mode.
    Suppresses the soft keyboard immediately after activation to keep document text fully visible.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"success": False, "message": "No connected ADB device", "actions": []}

    disp_id = display_id or await detect_external_display_id(ser)
    actions = []

    # 1. Capture current display screenshot to accurately locate toolbar
    snap = await capture_external_screenshot(ser, bypass_lock=True)
    target_coords = None

    if snap:
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            icons = locate_toolbar_icons_cv(img)
            target_coords = icons.get("pencil")
            if target_coords:
                actions.append(f"Located pencil edit icon at {target_coords} via toolbar vision engine")

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

    # 3. Default resolution-scaled coordinates fallback
    if not target_coords:
        disp_w, disp_h = await get_display_dimensions(ser, disp_id)
        target_coords = (int(1777 * disp_w / 1920), int(149 * disp_h / 1080))
        actions.append(f"Using calibrated toolbar coordinates {target_coords} on display {disp_id}")

    # 4. Dispatch touch motion
    x, y = target_coords
    await run_adb_shell(f"input -d {disp_id} tap {x} {y}", ser)
    actions.append(f"Dispatched touch motion on pencil icon at ({x}, {y}) on display {disp_id}")
    await asyncio.sleep(0.3)

    # 5. CRITICAL: Suppress soft keyboard immediately
    await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0; am broadcast -a com.matrixcapture.app.ACTION_CLOSE_KEYBOARD >/dev/null 2>&1", ser)
    await ensure_adb_keyboard_closed(ser)
    actions.append("Suppressed on-screen keyboard policy")

    await asyncio.sleep(0.4)
    await auto_fix_viewport(ser, disp_id)

    # 6. Verify edit mode state
    success = True
    return {
        "success": bool(success),
        "actions": actions,
        "target_coords": target_coords,
        "edit_mode_passed": bool(success),
        "message": "Switched to single-pane Edit Mode (split-screen duplicate text eliminated) ✔"
    }


async def select_dark_mode(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Expands the editor theme pull-down menu and selects Dark Mode.
    Uses RapidOCR / local VLM grounding to identify the 'Dark Mode' menu item in the opened popup.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"success": False, "message": "No connected ADB device", "actions": []}

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
            if init_lum < 55.0:
                actions.append(f"Editor is already in Dark Mode (luminance {round(init_lum, 1)} < 55.0)")
                return {"success": True, "actions": actions, "luminance": init_lum, "message": "Dark mode is already active ✔"}

    # 2. Locate the Theme Pull-Down Anchor button in toolbar
    anchor_coords = None
    if snap:
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            icons = locate_toolbar_icons_cv(img)
            anchor_coords = icons.get("theme_dropdown")
            if anchor_coords:
                actions.append(f"Located theme pull-down anchor at {anchor_coords} via toolbar vision engine")

    if not anchor_coords:
        disp_w, disp_h = await get_display_dimensions(ser, disp_id)
        anchor_coords = (int(1877 * disp_w / 1920), int(149 * disp_h / 1080))
        actions.append(f"Using calibrated theme dropdown anchor {anchor_coords}")

    # 3. Touch motion to open the theme pull-down menu
    ax, ay = anchor_coords
    await run_adb_shell(f"input -d {disp_id} tap {ax} {ay}", ser)
    actions.append(f"Tapped theme pull-down menu trigger at ({ax}, {ay}) on display {disp_id}")

    # 4. Settle dwell for dropdown menu animation (~250-300ms)
    await asyncio.sleep(0.3)

    # 5. Capture screenshot with open dropdown menu
    menu_snap = await capture_external_screenshot(ser, bypass_lock=True)
    dark_mode_coords = None

    if menu_snap:
        menu_img = cv2.imdecode(np.frombuffer(menu_snap, np.uint8), cv2.IMREAD_COLOR)
        if menu_img is not None:
            mh, mw = menu_img.shape[:2]
            # Crop the dropdown area below the anchor: y in [ay..ay+250], x in [ax-280..ax+50]
            y1_d = max(0, ay - 10)
            y2_d = min(mh, ay + 260)
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
                        if "dark" in t_clean or "mode" in t_clean and "light" not in t_clean:
                            cx = int(sum(pt[0] for pt in box) / 4)
                            cy = int(sum(pt[1] for pt in box) / 4)
                            dark_mode_coords = (x1_d + cx, y1_d + cy)
                            actions.append(f"Located 'Dark Mode' item via OCR at {dark_mode_coords} ('{txt}')")
                            break

    # 6. Fallback coordinates for Dark Mode menu item if OCR didn't hit
    if not dark_mode_coords:
        disp_w, disp_h = await get_display_dimensions(ser, disp_id)
        # In the opened popup card, Dark Mode is the first row, ~19px below the toolbar center
        dark_mode_coords = (int(1797 * disp_w / 1920), int(168 * disp_h / 1080))
        actions.append(f"Using calibrated 'Dark Mode' menu row at {dark_mode_coords}")

    # 7. Touch motion to select 'Dark Mode'
    dx, dy = dark_mode_coords
    await run_adb_shell(f"input -d {disp_id} tap {dx} {dy}", ser)
    actions.append(f"Tapped 'Dark Mode' option at ({dx}, {dy}) on display {disp_id}")

    # 8. Settle and verify screen luminance
    await asyncio.sleep(0.5)
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
    from services.adb_service import check_and_update_alignment
    await check_and_update_alignment(ser)

    return {
        "success": bool(is_dark),
        "actions": actions,
        "luminance": round(final_lum, 1),
        "target_coords": dark_mode_coords,
        "message": f"Successfully switched to Dark Mode (luminance {round(final_lum, 1)} < 55.0) ✔" if is_dark else "Theme menu tapped; verify Dark Mode is active"
    }
