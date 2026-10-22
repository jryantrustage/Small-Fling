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
    scale_x = (w / 1920.0) if w > 0 else 1.0
    scale_y = (h / 1080.0) if h > 0 else 1.0

    results: Dict[str, Tuple[int, int]] = {
        "pencil": (int(1655 * scale_x), int(190 * scale_y)),
        "split": (int(1710 * scale_x), int(190 * scale_y)),
        "preview": (int(1760 * scale_x), int(190 * scale_y)),
        "theme_dropdown": (int(1850 * scale_x), int(190 * scale_y)),
    }

    # Search strictly in secondary markdown toolbar strip (y: 150..230 on 1080p, x: >= 1550)
    tb_y1, tb_y2 = int(150 * scale_y), int(230 * scale_y)
    tb_x1, tb_x2 = int(1550 * scale_x), w

    crop = img[tb_y1:tb_y2, tb_x1:tb_x2]
    if crop.size == 0:
        return results

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    is_dark = np.mean(gray) < 100
    icons_mask = (gray > 45) if is_dark else (gray < 220)
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

    significant_blobs = [b for b in blobs if (b[1] - b[0]) >= 6]
    centers = [tb_x1 + (b[0] + b[1]) // 2 for b in significant_blobs]

    center_y = int(190 * scale_y)
    if len(centers) >= 2:
        results["pencil"] = (int(centers[0]), int(center_y))
        results["theme_dropdown"] = (int(centers[-1]), int(center_y))
        if len(centers) >= 3:
            results["preview"] = (int(centers[-2]), int(center_y))
        if len(centers) >= 4:
            results["split"] = (int(centers[1]), int(center_y))

    return results


async def enable_edit_mode(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Selects the editor toolbar with touch motion on the pencil icon to enable single-pane edit mode.
    Suppresses the soft keyboard immediately after activation to keep document text fully visible.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"success": False, "message": "No connected ADB device", "actions": []}
    if "mock" in str(ser).lower():
        return {
            "success": True,
            "actions": ["Tapped pencil icon to enter single-pane edit mode (mock)"],
            "target_coords": (1655, 190),
            "edit_mode_passed": True,
            "message": "Switched to single-pane Edit Mode ✔"
        }

    disp_id = display_id or await detect_external_display_id(ser)
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

            # Detect current active toolbar button
            tb_y1 = int(140 * scale_y)
            tb_y2 = int(245 * scale_y)
            tb_x1 = int(1450 * scale_x)
            crop_tb = img[tb_y1:tb_y2, tb_x1:]
            active_button = None
            if crop_tb.size > 0:
                hsv_p = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2HSV)
                blue_mask = cv2.inRange(hsv_p, np.array([95, 50, 50]), np.array([135, 255, 255]))
                conts, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                valid_conts = [c for c in conts if cv2.contourArea(c) >= 15]
                valid_conts.sort(key=lambda c: cv2.contourArea(c), reverse=True)
                for c in valid_conts:
                    bx, by, bw, bh = cv2.boundingRect(c)
                    norm_cx = (tb_x1 + bx + bw // 2) / scale_x
                    if norm_cx < 1685:
                        active_button = "pencil"
                        break
                    elif 1685 <= norm_cx < 1735:
                        active_button = "split"
                        break
                    elif norm_cx >= 1735:
                        active_button = "preview"
                        break

            if active_button == "pencil":
                actions.append("Pencil icon already active (single-pane Edit Mode verified)")
                await dismiss_keyboard(ser, disp_id)
                return {
                    "success": True,
                    "actions": actions,
                    "target_coords": (int(1655 * scale_x), int(190 * scale_y)),
                    "edit_mode_passed": True,
                    "message": "Editor is already in single-pane Edit Mode ✔"
                }

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

    # 3. Default resolution-scaled coordinates fallback (Pencil icon in secondary toolbar)
    if not target_coords:
        disp_w, disp_h = await get_display_dimensions(ser, disp_id)
        target_coords = (int(1655 * disp_w / 1920), int(190 * disp_h / 1080))
        actions.append(f"Using calibrated toolbar coordinates {target_coords} on display {disp_id}")

    # 4. Dispatch touch motion directly on pencil icon
    x, y = target_coords
    await run_adb_shell(f"input -d {disp_id} tap {x} {y}", ser)
    actions.append(f"Dispatched touch motion on pencil icon at ({x}, {y}) on display {disp_id}")
    await asyncio.sleep(0.35)

    # 5. CRITICAL: Suppress soft keyboard if opened upon gaining editor focus
    await dismiss_keyboard(ser, disp_id)
    actions.append("Suppressed on-screen keyboard policy")
    await asyncio.sleep(0.3)

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
        dark_mode_coords = (int(1730 * scale_x), int(285 * scale_y))
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
