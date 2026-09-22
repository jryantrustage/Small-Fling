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
    # Expected relative area: top-left header bar (y: 1%..8%, x: 1%..18%)
    y1_t, y2_t = int(h * 0.015), int(h * 0.080)
    x1_t, x2_t = int(w * 0.012), int(w * 0.180)
    crop_teams = img[y1_t:y2_t, x1_t:x2_t]
    teams_detected = False
    teams_text = ""
    teams_box = [x1_t, y1_t, x2_t - x1_t, y2_t - y1_t]

    if ocr and crop_teams.size > 0:
        crop_teams_2x = cv2.resize(crop_teams, (crop_teams.shape[1] * 2, crop_teams.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
        res_t, _ = ocr(crop_teams_2x)
        if res_t:
            for b, t, s in res_t:
                clean = t.strip()
                if "team" in clean.lower():
                    teams_detected = True
                    teams_text = clean
                    bx1 = x1_t + int(b[0][0] / 2)
                    by1 = y1_t + int(b[0][1] / 2)
                    bw = int((b[1][0] - b[0][0]) / 2)
                    bh = int((b[2][1] - b[1][1]) / 2)
                    teams_box = [max(0, bx1 - 6), max(0, by1 - 4), bw + 20, bh + 8]
                    break

    # ---------------------------------------------------------
    # 2. YELLOW BOX: Markdown File Name (*.md)
    # ---------------------------------------------------------
    # Expected relative area: document title tab bar (y: ~4.8%..9.2%, x: ~1.2%..30%)
    y1_f, y2_f = int(h * 0.048), int(h * 0.090)
    x1_f, x2_f = int(w * 0.012), int(w * 0.275)
    crop_file = img[y1_f:y2_f, x1_f:x2_f]
    file_detected = False
    file_name = ""
    file_box = [x1_f, y1_f, x2_f - x1_f, y2_f - y1_f]

    if crop_file.size > 0:
        gray_f = cv2.cvtColor(crop_file, cv2.COLOR_BGR2GRAY)
        norm_f = cv2.normalize(gray_f, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
        _, thresh_f = cv2.threshold(norm_f, 100, 255, cv2.THRESH_BINARY)
        thresh_f_2x = cv2.resize(thresh_f, (thresh_f.shape[1] * 2, thresh_f.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
        if ocr:
            res_f, _ = ocr(thresh_f_2x)
            if res_f:
                for b, t, s in res_f:
                    clean = t.strip()
                    if len(clean) >= 3:
                        file_detected = True
                        file_name = clean
                        bx1 = x1_f + int(b[0][0] / 2)
                        by1 = y1_f + int(b[0][1] / 2)
                        bw = int((b[1][0] - b[0][0]) / 2)
                        bh = int((b[2][1] - b[1][1]) / 2)
                        file_box = [max(0, bx1 - 6), max(0, by1 - 4), bw + 12, bh + 8]
                        break

    # ---------------------------------------------------------
    # 3. WHITE BOX 1: Edit Mode ("Pencil Icon" Active)
    # ---------------------------------------------------------
    # Expected relative area: top-right editor action bar (y: 8%..16%, x: 65%..99%)
    y1_tb, y2_tb = int(h * 0.080), int(h * 0.160)
    x1_tb, x2_tb = int(w * 0.650), int(w * 0.990)
    crop_tb = img[y1_tb:y2_tb, x1_tb:x2_tb]

    edit_mode_active = False
    edit_box = [int(w * 0.690), y1_tb, int(w * 0.050), y2_tb - y1_tb]

    if crop_tb.size > 0:
        hsv_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2HSV)
        blue_mask = cv2.inRange(hsv_tb, np.array([95, 60, 60]), np.array([140, 255, 255]))
        blue_pixel_count = int(np.count_nonzero(blue_mask))
        if blue_pixel_count >= 15:
            edit_mode_active = True
            pts = np.argwhere(blue_mask)
            min_y, min_x = pts.min(axis=0)
            max_y, max_x = pts.max(axis=0)
            edit_box = [x1_tb + min_x - 6, y1_tb + min_y - 6, (max_x - min_x) + 12, (max_y - min_y) + 12]

    # ---------------------------------------------------------
    # 4. WHITE BOX 2: Dark Mode ("Moon Icon" & Dark Luminance)
    # ---------------------------------------------------------
    body_sample = img[int(h * 0.25):int(h * 0.75), int(w * 0.20):int(w * 0.80)]
    mean_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY))) if body_sample.size > 0 else 100.0
    dark_mode_active = (mean_lum < 55.0)

    dark_box = [int(w * 0.850), y1_tb, int(w * 0.080), y2_tb - y1_tb]
    if crop_tb.size > 0:
        gray_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2GRAY)
        moon_mask = (gray_tb > 75) & (gray_tb < 160)
        tb_mid = gray_tb.shape[1] // 2
        moon_right_pts = np.argwhere(moon_mask[:, tb_mid:])
        if len(moon_right_pts) >= 10:
            min_y, min_x = moon_right_pts.min(axis=0)
            max_y, max_x = moon_right_pts.max(axis=0)
            dark_box = [x1_tb + tb_mid + min_x - 4, y1_tb + min_y - 4, (max_x - min_x) + 12, (max_y - min_y) + 10]

    # ---------------------------------------------------------
    # 5. GREEN BOX: First Line Number (Current Page Top)
    # ---------------------------------------------------------
    # Narrow left gutter top cell: y: 11%..18%, x: 0.8%..3.8%
    y1_g, y2_g = int(h * 0.110), int(h * 0.180)
    x1_g, x2_g = max(0, int(w * 0.008)), int(w * 0.038)
    crop_green = img[y1_g:y2_g, x1_g:x2_g]
    first_line_num = 0
    first_line_box = [x1_g, y1_g, x2_g - x1_g, y2_g - y1_g]

    if ocr and crop_green.size > 0:
        crop_g_2x = cv2.resize(crop_green, (crop_green.shape[1] * 2, crop_green.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
        res_g, _ = ocr(crop_g_2x)
        if res_g:
            nums = []
            for b, t, s in res_g:
                clean_num = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
                if m := re.search(r'\b(\d+)\b', clean_num):
                    try:
                        n_val = int(m.group(1))
                        bx1 = x1_g + int(b[0][0] / 2)
                        by1 = y1_g + int(b[0][1] / 2)
                        bw = int((b[1][0] - b[0][0]) / 2)
                        bh = int((b[2][1] - b[1][1]) / 2)
                        nums.append((by1, n_val, [bx1, by1, bw, bh]))
                    except ValueError: pass
            if nums:
                nums.sort(key=lambda x: x[0])
                first_line_num = nums[0][1]
                first_line_box = nums[0][2]

    # Fallback to wider header context (handles cases where line numbers align with markdown headings e.g. "1 #...")
    if ocr and first_line_num == 0:
        y1_gw, y2_gw = int(h * 0.100), int(h * 0.350)
        x1_gw, x2_gw = max(0, int(w * 0.008)), int(w * 0.120)
        crop_gw = img[y1_gw:y2_gw, x1_gw:x2_gw]
        if crop_gw.size > 0:
            res_gw, _ = ocr(crop_gw)
            if res_gw:
                nums_w = []
                for b, t, s in res_gw:
                    clean_t = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
                    if m := re.search(r'^\s*(\d+)', clean_t):
                        try:
                            n_val = int(m.group(1))
                            bx1 = x1_gw + int(b[0][0])
                            by1 = y1_gw + int(b[0][1])
                            bw = min(int(w * 0.040), int(b[1][0] - b[0][0]))
                            bh = int(b[2][1] - b[1][1])
                            nums_w.append((by1, n_val, [bx1, by1, bw, bh]))
                        except ValueError: pass
                if nums_w:
                    nums_w.sort(key=lambda x: x[0])
                    first_line_num = nums_w[0][1]
                    first_line_box = nums_w[0][2]

    first_line_detected = (first_line_num > 0)

    # ---------------------------------------------------------
    # 6. RED BOX: Last Line Number (Current Page Bottom)
    # ---------------------------------------------------------
    # Narrow left gutter bottom cell: y: 89.5%..98%, x: 0.8%..3.8%
    y1_r, y2_r = int(h * 0.895), int(h * 0.980)
    x1_r, x2_r = max(0, int(w * 0.008)), int(w * 0.038)
    crop_red = img[y1_r:y2_r, x1_r:x2_r]
    last_line_num = 0
    last_line_box = [x1_r, y1_r, x2_r - x1_r, y2_r - y1_r]

    if ocr and crop_red.size > 0:
        crop_r_2x = cv2.resize(crop_red, (crop_red.shape[1] * 2, crop_red.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
        res_r, _ = ocr(crop_r_2x)
        if res_r:
            nums = []
            for b, t, s in res_r:
                clean_num = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
                if m := re.search(r'\b(\d+)\b', clean_num):
                    try:
                        n_val = int(m.group(1))
                        bx1 = x1_r + int(b[0][0] / 2)
                        by1 = y1_r + int(b[0][1] / 2)
                        bw = int((b[1][0] - b[0][0]) / 2)
                        bh = int((b[2][1] - b[1][1]) / 2)
                        nums.append((by1, n_val, [bx1, by1, bw, bh]))
                    except ValueError: pass
            if nums:
                nums.sort(key=lambda x: -x[0]) # bottom-most
                last_line_num = nums[0][1]
                last_line_box = nums[0][2]

    last_line_detected = (last_line_num > 0)

    # ---------------------------------------------------------
    # Aggregate Alignment Verdict
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
            "text": str(teams_text or "Teams"),
            "box_px": to_clean_box(teams_box),
            "box_norm": to_norm(teams_box)
        },
        "file_name": {
            "name": "Markdown Filename",
            "color": "yellow",
            "hex": "#eab308",
            "passed": bool(file_detected),
            "text": str(file_name),
            "box_px": to_clean_box(file_box),
            "box_norm": to_norm(file_box)
        },
        "edit_mode": {
            "name": "Edit Mode (Pencil Icon)",
            "color": "white",
            "hex": "#f8fafc",
            "passed": bool(edit_mode_active),
            "icon": "pencil",
            "box_px": to_clean_box(edit_box),
            "box_norm": to_norm(edit_box)
        },
        "dark_mode": {
            "name": "Dark Mode (Moon Icon)",
            "color": "white",
            "hex": "#f8fafc",
            "passed": bool(dark_mode_active),
            "icon": "moon",
            "luminance": float(round(float(mean_lum), 1)),
            "box_px": to_clean_box(dark_box),
            "box_norm": to_norm(dark_box)
        },
        "first_line": {
            "name": "First Line Number",
            "color": "green",
            "hex": "#22c55e",
            "passed": bool(first_line_detected),
            "line_number": int(first_line_num),
            "box_px": to_clean_box(first_line_box),
            "box_norm": to_norm(first_line_box)
        },
        "last_line": {
            "name": "Last Line Number",
            "color": "red",
            "hex": "#ef4444",
            "passed": bool(last_line_detected),
            "line_number": int(last_line_num),
            "box_px": to_clean_box(last_line_box),
            "box_norm": to_norm(last_line_box)
        }
    }

    missing_reasons = []
    if not teams_detected: missing_reasons.append("Teams logo not detected in header")
    if not file_detected: missing_reasons.append("Markdown filename tab not detected")
    if not edit_mode_active: missing_reasons.append("Editor not in edit mode (pencil icon inactive)")
    if not dark_mode_active: missing_reasons.append("Editor not in dark mode (moon icon inactive)")
    if not first_line_detected: missing_reasons.append("First line number not visible in gutter")
    if not last_line_detected: missing_reasons.append("Last line number not visible in gutter")

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
        "resolution": {"width": w, "height": h}
    }
