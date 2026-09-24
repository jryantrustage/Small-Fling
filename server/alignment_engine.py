"""
AI Bounding Box & Teams Markdown Alignment Engine
Determines the 6 critical bounding box areas and verifies alignment:
1. Blue: Teams Logo / Header ('Teams')
2. Yellow: Markdown Document Name (*.md)
3. White (1): Edit Mode ('pencil icon' active state)
4. White (2): Dark Mode ('moon icon' & dark theme)
5. Green: First Line Number (current viewport top)
6. Red: Last Line Number (current viewport bottom)

If any area cannot be detected or is misaligned, returns 'teams markdown not aligned'
and signals to pause the DAG process.
"""

from typing import Dict, Any, Optional, Tuple, Union
from pathlib import Path
import re
import cv2
import numpy as np
from ocr_engine import get_rapid_ocr

def detect_teams_markdown_alignment(img_input: Union[bytes, str, Path, np.ndarray], expected_doc_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyzes an external display capture of the Teams Markdown editor.
    Returns alignment status, boolean is_aligned, missing reasons, and bounding box coordinates for each area.
    """
    if isinstance(img_input, (str, Path)):
        img = cv2.imread(str(img_input))
    elif isinstance(img_input, bytes):
        nparr = np.frombuffer(img_input, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    elif isinstance(img_input, np.ndarray):
        img = img_input
    else:
        return {
            "status": "teams markdown not aligned",
            "is_aligned": False,
            "reason": "Invalid image input",
            "boxes": {},
            "timestamp": None
        }

    if img is None:
        return {
            "status": "teams markdown not aligned",
            "is_aligned": False,
            "reason": "Could not decode display capture",
            "boxes": {},
            "timestamp": None
        }

    h, w = img.shape[:2]
    ocr = get_rapid_ocr()

    # ---------------------------------------------------------
    # 1. BLUE BOX: Teams Logo / Header Dropdown ('Teams')
    # ---------------------------------------------------------
    # Expected relative area: top-left header bar (y: 1%..10%, x: 1%..25%)
    y1_t, y2_t = int(h * 0.010), int(h * 0.100)
    x1_t, x2_t = int(w * 0.010), int(w * 0.250)
    crop_teams = img[y1_t:y2_t, x1_t:x2_t]
    teams_detected = False
    teams_text = ""
    teams_box = [x1_t, y1_t, x2_t - x1_t, y2_t - y1_t]

    if ocr and crop_teams.size > 0:
        crop_teams_2x = cv2.resize(crop_teams, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
        res_t, _ = ocr(crop_teams_2x)
        if res_t:
            for b, t, s in res_t:
                clean = t.strip()
                if "team" in clean.lower():
                    teams_detected = True
                    teams_text = clean
                    pts = np.array(b) / 1.5
                    bx1 = int(pts[:, 0].min())
                    by1 = int(pts[:, 1].min())
                    bx2 = int(pts[:, 0].max())
                    by2 = int(pts[:, 1].max())
                    teams_box = [max(0, x1_t + bx1 - 6), max(0, y1_t + by1 - 4), (bx2 - bx1) + 16, (by2 - by1) + 8]
                    break

    # ---------------------------------------------------------
    # 2. YELLOW BOX: Markdown File Name (*.md)
    # ---------------------------------------------------------
    # Expected relative area: document title tab bar (y: ~4%..17%, x: ~1%..45%)
    y1_f, y2_f = int(h * 0.040), int(h * 0.170)
    x1_f, x2_f = int(w * 0.010), int(w * 0.450)
    crop_file = img[y1_f:y2_f, x1_f:x2_f]
    file_detected = False
    file_name = ""
    file_box = [x1_f, y1_f, x2_f - x1_f, y2_f - y1_f]

    if ocr and crop_file.size > 0:
        # Strategy A: 1.5x scaled RGB (highest accuracy for RapidOCR on desktop captures)
        crop_f_scaled = cv2.resize(crop_file, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
        res_f, _ = ocr(crop_f_scaled)
        candidates = []
        if res_f:
            for b, t, s in res_f:
                clean = re.sub(r'^[<←\- \t]+', '', t.strip()).strip()
                if clean:
                    candidates.append((clean, b, s, 1.5))
        
        # Strategy B fallback: normalized grayscale
        if not any(c[0].lower().endswith('.md') or len(c[0]) >= 3 for c in candidates):
            gray_f = cv2.cvtColor(crop_file, cv2.COLOR_BGR2GRAY)
            norm_f = cv2.normalize(gray_f, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
            norm_f_2x = cv2.resize(norm_f, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            res_norm, _ = ocr(norm_f_2x)
            if res_norm:
                for b, t, s in res_norm:
                    clean = re.sub(r'^[<←\- \t]+', '', t.strip()).strip()
                    if clean:
                        candidates.append((clean, b, s, 2.0))

        # Select best candidate: prioritize *.md, else longest valid title
        md_matches = [c for c in candidates if '.md' in c[0].lower()]
        best_candidate = md_matches[0] if md_matches else (candidates[0] if candidates and len(candidates[0][0]) >= 3 else None)

        if best_candidate:
            c_text, c_b, _, scale = best_candidate
            file_detected = True
            file_name = c_text
            pts = np.array(c_b) / scale
            bx1 = int(pts[:, 0].min())
            by1 = int(pts[:, 1].min())
            bx2 = int(pts[:, 0].max())
            by2 = int(pts[:, 1].max())
            file_box = [max(0, x1_f + bx1 - 6), max(0, y1_f + by1 - 4), (bx2 - bx1) + 14, (by2 - by1) + 8]

    # ---------------------------------------------------------
    # 3. WHITE BOX 1: Edit Mode ("Pencil Icon" Active)
    # ---------------------------------------------------------
    # Expected relative area: top-right editor action bar (y: 5%..22%, x: 60%..99%)
    y1_tb, y2_tb = int(h * 0.050), int(h * 0.220)
    x1_tb, x2_tb = int(w * 0.600), int(w * 0.990)
    crop_tb = img[y1_tb:y2_tb, x1_tb:x2_tb]

    edit_mode_active = False
    blue_pixel_count = 0
    edit_box = [int(w * 0.690), y1_tb, int(w * 0.050), y2_tb - y1_tb]

    if crop_tb.size > 0:
        hsv_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2HSV)
        blue_mask = cv2.inRange(hsv_tb, np.array([95, 50, 50]), np.array([140, 255, 255]))
        blue_pixel_count = int(np.count_nonzero(blue_mask))
        if blue_pixel_count >= 15:
            edit_mode_active = True
            pts = np.argwhere(blue_mask)
            min_y, min_x = pts.min(axis=0)
            max_y, max_x = pts.max(axis=0)
            edit_box = [x1_tb + min_x - 6, y1_tb + min_y - 6, (max_x - min_x) + 12, (max_y - min_y) + 12]
        else:
            # Check OCR for 'Edit Mode' or 'Edit' text in toolbar
            if ocr:
                res_tb, _ = ocr(cv2.resize(crop_tb, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC))
                if res_tb:
                    for b, t, s in res_tb:
                        if 'edit' in t.lower():
                            edit_mode_active = True
                            pts = np.array(b) / 1.5
                            bx1 = int(pts[:, 0].min())
                            by1 = int(pts[:, 1].min())
                            bx2 = int(pts[:, 0].max())
                            by2 = int(pts[:, 1].max())
                            edit_box = [x1_tb + bx1 - 6, y1_tb + by1 - 6, (bx2 - bx1) + 12, (by2 - by1) + 12]
                            break

    # ---------------------------------------------------------
    # 4. WHITE BOX 2: Dark Mode ("Moon Icon" & Dark Luminance)
    # ---------------------------------------------------------
    # Sample upper editor text area above any soft keyboard (y: 18%..42%, x: 15%..75%)
    body_sample = img[int(h * 0.18):int(h * 0.42), int(w * 0.15):int(w * 0.75)]
    mean_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY))) if body_sample.size > 0 else 100.0

    moon_found = False
    dark_box = [int(w * 0.850), y1_tb, int(w * 0.080), y2_tb - y1_tb]
    if crop_tb.size > 0:
        gray_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2GRAY)
        tb_mid = int(gray_tb.shape[1] * 0.45)
        moon_mask = (gray_tb[:, tb_mid:] > 110)
        moon_pts = np.argwhere(moon_mask)
        if len(moon_pts) >= 6:
            min_y, min_x = moon_pts.min(axis=0)
            max_y, max_x = moon_pts.max(axis=0)
            if (max_x - min_x) < int(gray_tb.shape[1] * 0.5):
                dark_box = [x1_tb + tb_mid + min_x - 4, y1_tb + min_y - 4, (max_x - min_x) + 12, (max_y - min_y) + 10]
                moon_found = True

    dark_mode_active = (mean_lum < 55.0) or moon_found

    # ---------------------------------------------------------
    # 5. GREEN BOX: First Line Number (Current Page Top)
    # ---------------------------------------------------------
    # Left gutter region in editor body (y: 18%..45%, x: 0%..6.5%)
    y1_g, y2_g = int(h * 0.180), int(h * 0.450)
    x1_g, x2_g = 0, int(w * 0.065)
    crop_green = img[y1_g:y2_g, x1_g:x2_g]
    first_line_num = 0
    first_line_box = [x1_g, y1_g, int(w * 0.035), int(h * 0.030)]

    if ocr and crop_green.size > 0:
        crop_g_scaled = cv2.resize(crop_green, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        res_g, _ = ocr(crop_g_scaled)
        if res_g:
            nums = []
            for b, t, s in res_g:
                clean_num = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
                if m := re.search(r'^\s*(\d+)', clean_num):
                    try:
                        n_val = int(m.group(1))
                        pts = np.array(b) / 2.0
                        bx1 = int(pts[:, 0].min())
                        by1 = int(pts[:, 1].min())
                        bx2 = int(pts[:, 0].max())
                        by2 = int(pts[:, 1].max())
                        tight_box = [max(0, x1_g + bx1 - 3), max(0, y1_g + by1 - 3), (bx2 - bx1) + 6, (by2 - by1) + 6]
                        nums.append((by1, n_val, tight_box))
                    except ValueError: pass
            if nums:
                nums.sort(key=lambda x: x[0])
                first_line_num = nums[0][1]
                first_line_box = nums[0][2]

    first_line_detected = (first_line_num > 0)

    # ---------------------------------------------------------
    # 6. RED BOX: Last Line Number (Current Page Bottom)
    # ---------------------------------------------------------
    # Left gutter bottom region (y: 82%..99%, x: 0.5%..15%)
    y1_r, y2_r = int(h * 0.820), int(h * 0.990)
    x1_r, x2_r = max(0, int(w * 0.005)), int(w * 0.150)
    crop_red = img[y1_r:y2_r, x1_r:x2_r]
    last_line_num = 0
    last_line_box = [x1_r, y1_r, int(w * 0.035), int(h * 0.030)]

    if ocr and crop_red.size > 0:
        crop_r_scaled = cv2.resize(crop_red, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
        res_r, _ = ocr(crop_r_scaled)
        if res_r:
            nums = []
            for b, t, s in res_r:
                clean_num = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
                if m := re.search(r'\b(\d+)\b', clean_num):
                    try:
                        n_val = int(m.group(1))
                        pts = np.array(b) / 1.5
                        bx1 = int(pts[:, 0].min())
                        by1 = int(pts[:, 1].min())
                        bx2 = int(pts[:, 0].max())
                        by2 = int(pts[:, 1].max())
                        tight_box = [x1_r + bx1 - 3, y1_r + by1 - 3, (bx2 - bx1) + 6, (by2 - by1) + 6]
                        nums.append((by1, n_val, tight_box))
                    except ValueError: pass
            if nums:
                nums.sort(key=lambda x: -x[0]) # bottom-most
                last_line_num = nums[0][1]
                last_line_box = nums[0][2]

    last_line_detected = (last_line_num > 0)

    # ---------------------------------------------------------
    # Aggregate Alignment Verdict with Rich Diagnostics
    # ---------------------------------------------------------
    def to_clean_box(box):
        return [int(round(float(box[0]))), int(round(float(box[1]))), int(round(float(box[2]))), int(round(float(box[3])))]

    def to_norm(box):
        return [
            float(round(float(box[0]) / float(w), 4)),
            float(round(float(box[1]) / float(h), 4)),
            float(round(float(box[2]) / float(w), 4)),
            float(round(float(box[3]) / float(h), 4))
        ]

    boxes = {
        "teams_logo": {
            "name": "Teams Logo / Header",
            "color": "blue",
            "hex": "#3b82f6",
            "passed": bool(teams_detected),
            "status": "PASSED" if teams_detected else "FAILED",
            "detected_value": str(teams_text or "Not detected"),
            "expected": "Header bar containing 'Teams'",
            "details": f"Found '{teams_text}' in top header" if teams_detected else "No text matching 'Teams' found in top header region",
            "text": str(teams_text or "Teams"),
            "box_px": to_clean_box(teams_box),
            "box_norm": to_norm(teams_box)
        },
        "file_name": {
            "name": "Markdown Filename",
            "color": "yellow",
            "hex": "#eab308",
            "passed": bool(file_detected),
            "status": "PASSED" if file_detected else "FAILED",
            "detected_value": str(file_name or "None detected"),
            "expected": "Document tab displaying filename (*.md or >= 3 chars)",
            "details": f"Detected filename tab '{file_name}'" if file_detected else "No document filename tab detected in title region",
            "text": str(file_name),
            "box_px": to_clean_box(file_box),
            "box_norm": to_norm(file_box)
        },
        "edit_mode": {
            "name": "Edit Mode (Pencil Icon)",
            "color": "white",
            "hex": "#f8fafc",
            "passed": bool(edit_mode_active),
            "status": "PASSED" if edit_mode_active else "FAILED",
            "detected_value": f"{blue_pixel_count} blue pixels" if blue_pixel_count > 0 else ("Active via toolbar text" if edit_mode_active else "Inactive (0 blue px)"),
            "expected": "Blue active pencil icon or Edit mode active",
            "details": "Editor in active edit mode" if edit_mode_active else f"Edit mode inactive (found {blue_pixel_count} blue px, required >= 15)",
            "icon": "pencil",
            "box_px": to_clean_box(edit_box),
            "box_norm": to_norm(edit_box)
        },
        "dark_mode": {
            "name": "Dark Mode (Moon Icon)",
            "color": "white",
            "hex": "#f8fafc",
            "passed": bool(dark_mode_active),
            "status": "PASSED" if dark_mode_active else "FAILED",
            "detected_value": f"Luminance {round(mean_lum, 1)}" if dark_mode_active else f"Sun icon displayed (Light Mode, lum: {round(mean_lum, 1)})",
            "expected": "Dark theme background (mean luminance < 55.0 with moon icon)",
            "details": f"Dark mode active (luminance {round(mean_lum, 1)} < 55.0)" if dark_mode_active else f"Light mode is active (sun icon displayed, luminance {round(mean_lum, 1)} >= 55.0). Click sun icon in toolbar to switch to Dark Mode (moon icon).",
            "icon": "moon" if dark_mode_active else "sun",
            "luminance": float(round(float(mean_lum), 1)),
            "box_px": to_clean_box(dark_box),
            "box_norm": to_norm(dark_box)
        },
        "first_line": {
            "name": "First Line Number",
            "color": "green",
            "hex": "#22c55e",
            "passed": bool(first_line_detected),
            "status": "PASSED" if first_line_detected else "FAILED",
            "detected_value": f"Line {first_line_num}" if first_line_detected else "None detected",
            "expected": "Top line integer >= 1 in gutter",
            "details": f"Top line number {first_line_num} detected in gutter" if first_line_detected else "Top line number not found in gutter",
            "line_number": int(first_line_num),
            "box_px": to_clean_box(first_line_box),
            "box_norm": to_norm(first_line_box)
        },
        "last_line": {
            "name": "Last Line Number",
            "color": "red",
            "hex": "#ef4444",
            "passed": bool(last_line_detected),
            "status": "PASSED" if last_line_detected else "FAILED",
            "detected_value": f"Line {last_line_num}" if last_line_detected else "None detected",
            "expected": f"Bottom line integer >= {first_line_num or 1} in gutter",
            "details": f"Bottom line number {last_line_num} detected in gutter" if last_line_detected else "Bottom line number not found in gutter",
            "line_number": int(last_line_num),
            "box_px": to_clean_box(last_line_box),
            "box_norm": to_norm(last_line_box)
        }
    }

    # Incorporate user-dismissed false-positive items
    try:
        from services.state import dismissed_alignment_items
        dismissed_set = set(dismissed_alignment_items)
    except Exception:
        dismissed_set = set()

    for k, b in boxes.items():
        b["dismissed"] = (k in dismissed_set)
        if k in dismissed_set:
            b["status"] = "PASSED (DISMISSED)"
            b["details"] = (b.get("details") or "") + " [Ignored by user as false positive]"

    missing_reasons = []
    if not teams_detected and "teams_logo" not in dismissed_set:
        missing_reasons.append("Teams logo not detected in header")
    if not file_detected and "file_name" not in dismissed_set:
        missing_reasons.append("Markdown filename tab not detected")
    if not edit_mode_active and "edit_mode" not in dismissed_set:
        missing_reasons.append("Editor not in edit mode (pencil icon inactive)")
    if not dark_mode_active and "dark_mode" not in dismissed_set:
        missing_reasons.append("Editor in Light Mode (sun icon displayed) - click to toggle Dark Mode (moon icon)")
    if not first_line_detected and "first_line" not in dismissed_set:
        missing_reasons.append("First line number not visible in gutter")
    if not last_line_detected and "last_line" not in dismissed_set:
        missing_reasons.append("Last line number not visible in gutter")

    is_aligned = (len(missing_reasons) == 0)
    status_str = "teams markdown aligned" if is_aligned else "teams markdown not aligned"
    primary_reason = None if is_aligned else "; ".join(missing_reasons)

    return {
        "status": status_str,
        "is_aligned": is_aligned,
        "reason": primary_reason,
        "missing": missing_reasons,
        "first_line_number": first_line_num,
        "last_line_number": last_line_num,
        "file_name": file_name,
        "boxes": boxes,
        "resolution": {"width": w, "height": h},
        "dismissed": list(dismissed_set)
    }

