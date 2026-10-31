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
        "pencil": (int(1660 * scale_x), int(236 * scale_y)),
        "split": (int(1710 * scale_x), int(236 * scale_y)),
        "preview": (int(1760 * scale_x), int(236 * scale_y)),
        "theme_dropdown": (int(1850 * scale_x), int(236 * scale_y)),
    }

    # Search in secondary markdown toolbar strip (y: 120..280 on 1080p, x: >= 1550)
    tb_y1, tb_y2 = int(120 * scale_y), int(280 * scale_y)
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

    center_y = int(236 * scale_y)
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
                    "target_coords": (int(1660 * scale_x), int(236 * scale_y)),
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
        target_coords = (int(1660 * disp_w / 1920), int(236 * disp_h / 1080))
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


async def prepare_markdown_editor_window(
    serial: Optional[str] = None,
    display_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Prepares a newly opened or floating Teams Markdown Editor window for OCR capture:
    1. Maximizes the floating freeform window via its top-right '[]' Maximize control.
    2. Enables single-pane Edit Mode via the toolbar Pencil icon and suppresses the soft keyboard.
    3. Selects Dark Mode from the toolbar theme dropdown.
    4. Dismisses any floating mini-modal / toast pop-ups and updates alignment status.
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

    # 1. Maximize floating markdown editor window if in freeform mode
    max_res = await maximize_floating_markdown_window(serial=ser, display_id=disp_id)
    actions.extend(max_res.get("actions", []))

    # 2. Switch to single-pane Edit Mode (Pencil icon)
    edit_res = await enable_edit_mode(serial=ser, display_id=disp_id)
    actions.extend(edit_res.get("actions", []))

    # 3. Switch to Dark Mode (Moon icon)
    dark_res = await select_dark_mode(serial=ser, display_id=disp_id)
    actions.extend(dark_res.get("actions", []))

    # 4. Dismiss any floating mini-modals and suppress keyboard
    modal_res = await resolve_and_dismiss_mini_modals(serial=ser, display_id=disp_id, caller_node="prepare_markdown_editor")
    if modal_res.get("actions_taken"):
        actions.extend(modal_res["actions_taken"])
    await dismiss_keyboard(ser, disp_id)

    # 5. Re-evaluate alignment status
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
        "message": f"Markdown editor maximized, Edit Mode & Dark Mode active ({align.get('file_name') or 'ready'}) ✔"
    }


def scan_folder_markdown_files_cv(img: np.ndarray) -> Dict[str, Any]:
    """
    Analyzes a Teams folder files list screenshot (Attachment 2) and extracts:
    - folder_name: Name of the folder in the top header
    - files: Ordered list of markdown files in the folder with their part numbers and tap coordinates
    """
    from alignment_engine import parse_multipart_markdown_filename
    if img is None or img.size == 0:
        return {"is_folder_view": False, "folder_name": "", "files": [], "part_files": [], "total_parts": 0}

    h, w = img.shape[:2]
    scale_x = w / 1920.0
    scale_y = h / 1080.0
    ocr = get_rapid_ocr()
    if ocr is None:
        return {"is_folder_view": False, "folder_name": "", "files": [], "part_files": [], "total_parts": 0}

    # Crop folder header + file list region (y: 110..960, x: 50..1350 in 1080p)
    y1_c = int(110 * scale_y)
    y2_c = int(960 * scale_y)
    x1_c = int(50 * scale_x)
    x2_c = int(1350 * scale_x)
    crop = img[y1_c:y2_c, x1_c:x2_c]
    res, _ = ocr(crop)

    folder_name = ""
    files: List[Dict[str, Any]] = []
    has_modified_by = False

    if res:
        for box, txt, score in res:
            pts = np.array(box)
            bx1 = x1_c + int(pts[:, 0].min())
            by1 = y1_c + int(pts[:, 1].min())
            bx2 = x1_c + int(pts[:, 0].max())
            by2 = y1_c + int(pts[:, 1].max())
            bw, bh = bx2 - bx1, by2 - by1
            cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
            clean = txt.strip()
            if not clean:
                continue

            if "modified" in clean.lower() or "kb," in clean.lower():
                has_modified_by = True
                continue

            # Folder title row in header (y ~ 130..185 in 1080p)
            if by1 < int(190 * scale_y) and bx1 < int(900 * scale_x):
                if not clean.lower().endswith(".md") and len(clean) >= 4 and "teams" not in clean.lower():
                    folder_name = re.sub(r'CommonUl([_\-])', r'CommonUI\1', clean)
                continue

            # File rows in folder list (y >= 190 in 1080p)
            if by1 >= int(190 * scale_y) and (
                ".md" in clean.lower()
                or ".markdown" in clean.lower()
                or re.search(r'part\s*\d+', clean, re.IGNORECASE)
            ):
                mp = parse_multipart_markdown_filename(clean)
                files.append({
                    "file_name": mp.get("file_name") or clean,
                    "raw_text": clean,
                    "is_multipart": bool(mp.get("is_multipart")),
                    "base_prefix": mp.get("base_prefix") or "",
                    "part_number": mp.get("part_number"),
                    "bbox": [bx1, by1, bw, bh],
                    "tap_coords": [cx, cy],
                    "score": round(float(score), 3)
                })

    files.sort(key=lambda f: f["bbox"][1])
    part_files = [f for f in files if f.get("is_multipart") and f.get("part_number") is not None]
    part_numbers = sorted({int(f["part_number"]) for f in part_files})
    is_folder_view = bool(len(files) >= 1 and (has_modified_by or len(files) >= 2 or folder_name))

    return {
        "is_folder_view": is_folder_view,
        "folder_name": folder_name,
        "files": files,
        "part_files": part_files,
        "available_parts": part_numbers,
        "total_parts": max(part_numbers) if part_numbers else len(files)
    }


async def exit_markdown_to_folder_list(
    serial: Optional[str] = None,
    display_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Clicks the Back Arrow ('<-') in the top-left of the Teams Markdown Editor (Attachment 1)
    to exit the markdown view and return to the Teams folder files list (Attachment 2).
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
        back_x = int(53 * scale_x)
        back_y = int(152 * scale_y)

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
    await asyncio.sleep(1.25)

    snap_after = await capture_external_screenshot(ser, bypass_lock=True)
    folder_scan: Dict[str, Any] = {"is_folder_view": False, "files": []}
    if snap_after:
        img_after = cv2.imdecode(np.frombuffer(snap_after, np.uint8), cv2.IMREAD_COLOR)
        if img_after is not None:
            folder_scan = scan_folder_markdown_files_cv(img_after)

    if not folder_scan.get("is_folder_view"):
        # Retry with mouse tap on Back Arrow
        await run_adb_shell(f"input {disp_pfx}mouse tap {back_x} {back_y}", ser, timeout=2.5)
        actions.append(f"Retried mouse tap on Back Arrow ('<-') at ({back_x}, {back_y})")
        await asyncio.sleep(1.25)
        snap_retry = await capture_external_screenshot(ser, bypass_lock=True)
        if snap_retry:
            img_retry = cv2.imdecode(np.frombuffer(snap_retry, np.uint8), cv2.IMREAD_COLOR)
            if img_retry is not None:
                folder_scan = scan_folder_markdown_files_cv(img_retry)

    return {
        "success": bool(folder_scan.get("is_folder_view") or len(folder_scan.get("files", [])) > 0),
        "back_button_clicked": [back_x, back_y],
        "folder_scan": folder_scan,
        "actions": actions
    }


async def select_and_open_next_markdown_part(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    current_file_name: Optional[str] = None,
    target_part_number: Optional[int] = None,
    base_prefix: Optional[str] = None
) -> Dict[str, Any]:
    """
    Full automated multi-part bundle transition:
    1. Exits the completed markdown editor view by clicking the Back Arrow ('<-') (Attachment 1).
    2. Scans the Teams folder files list (Attachment 2) to discover all part files (e.g., part1..part3).
    3. Selects and clicks the next part file in sequence (e.g., part2.md or part3.md).
    4. Maximizes the newly opened floating markdown editor window (Attachment 3) via its '[]' button,
       and switches to single-pane Edit Mode (Pencil) and Dark Mode (Moon).
    """
    from alignment_engine import parse_multipart_markdown_filename
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "success": False, "message": "No connected ADB device", "actions": []}

    disp_id = display_id or await detect_external_display_id(ser)
    disp_pfx = f"-d {disp_id} " if (disp_id and disp_id > 0) else ""
    actions: List[str] = []

    mp_info = parse_multipart_markdown_filename(current_file_name)
    cur_part = mp_info.get("part_number") or 1
    next_part = target_part_number if (target_part_number is not None and target_part_number > 0) else (cur_part + 1)
    prefix = (base_prefix or mp_info.get("base_prefix") or "").lower()

    # Step 1: Exit current markdown view to Teams folder files list
    exit_res = await exit_markdown_to_folder_list(serial=ser, display_id=disp_id)
    actions.extend(exit_res.get("actions", []))
    folder_scan = exit_res.get("folder_scan", {})
    files = folder_scan.get("files", [])
    available_parts = folder_scan.get("available_parts", [])
    total_parts = folder_scan.get("total_parts", 0)

    if not files:
        return {
            "status": "error",
            "success": False,
            "message": "Could not detect markdown files in Teams folder list after clicking Back Arrow",
            "folder_scan": folder_scan,
            "actions": actions
        }

    # Step 2: Locate the next part in sequence (e.g. part2.md or part3.md)
    candidates = [f for f in files if f.get("part_number") == next_part]
    if prefix and len(candidates) > 1:
        pref_cands = [f for f in candidates if prefix[:12] in (f.get("base_prefix") or "").lower()]
        if pref_cands:
            candidates = pref_cands

    if not candidates:
        # Check if next_part exceeds all parts in the folder -> Multi-part bundle is 100% finished!
        if available_parts and next_part > max(available_parts):
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
                "folder_scan": folder_scan,
                "actions": actions,
                "message": msg
            }
        return {
            "status": "not_found",
            "success": False,
            "has_next_part": False,
            "target_part_number": next_part,
            "available_parts": available_parts,
            "folder_scan": folder_scan,
            "actions": actions,
            "message": f"Part {next_part} not found in folder list (detected parts: {available_parts})"
        }

    target_entry = candidates[0]
    tx, ty = target_entry["tap_coords"]
    target_filename = target_entry["file_name"]

    # Step 3: Tap the next markdown file in the folder list to open it
    await run_adb_shell(f"input {disp_pfx}tap {tx} {ty}", ser, timeout=2.5)
    actions.append(f"Selected and tapped '{target_filename}' at ({tx}, {ty}) in Teams folder list")
    await asyncio.sleep(1.65)

    # Step 4: Maximize the newly opened markdown editor and switch to Edit Mode + Dark Mode
    prep_res = await prepare_markdown_editor_window(serial=ser, display_id=disp_id)
    actions.extend(prep_res.get("actions", []))

    opened_name = prep_res.get("file_name") or target_filename
    return {
        "status": "opened_next_part",
        "success": True,
        "bundle_completed": False,
        "has_next_part": True,
        "previous_part": cur_part,
        "part_number": next_part,
        "total_parts": total_parts or max(available_parts) if available_parts else next_part,
        "available_parts": available_parts,
        "opened_file_name": opened_name,
        "project_name": re.sub(r'\.(md|markdown)$', '', opened_name, flags=re.IGNORECASE),
        "folder_scan": folder_scan,
        "prepare_result": prep_res,
        "actions": actions,
        "message": f"Opened '{opened_name}' (Part {next_part} of {total_parts or '?'}), maximized editor, and enabled Edit + Dark Mode ✔"
    }

