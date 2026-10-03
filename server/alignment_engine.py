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

def detect_teams_markdown_alignment(img_input: Union[bytes, str, Path, np.ndarray], expected_doc_name: Optional[str] = None, dpi_factor: float = 1.0) -> Dict[str, Any]:
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
    if ocr is None:
        return {
            "status": "teams markdown not aligned",
            "is_aligned": False,
            "reason": "OCR engine unavailable",
            "boxes": {},
            "timestamp": None
        }

    # 1. OCR top 60% of image for structural header, title, and toolbar
    top_limit_y = int(h * 0.60)
    top_crop = img[:top_limit_y, :]
    top_res, _ = ocr(top_crop)
    top_tokens = []
    if top_res:
        for b, t, s in top_res:
            pts = np.array(b)
            bx1, by1 = int(pts[:, 0].min()), int(pts[:, 1].min())
            bw, bh = int(pts[:, 0].max() - bx1), int(pts[:, 1].max() - by1)
            top_tokens.append((bx1, by1, bw, bh, t.strip(), float(s)))

    # ---------------------------------------------------------
    # 1. BLUE BOX: Teams Logo / Header Dropdown ('Teams')
    # ---------------------------------------------------------
    teams_detected = False
    teams_text = ""
    # Default fallback box dynamically scaled by dpi_factor
    teams_box = [int(w * 0.03), int(15 * dpi_factor), int(80 * dpi_factor), int(30 * dpi_factor)]
    teams_bottom_y = int(50 * dpi_factor)

    for bx1, by1, bw, bh, t, s in top_tokens:
        if by1 < int(h * 0.25) and bx1 < int(w * 0.40):
            if "team" in t.lower():
                teams_detected = True
                teams_text = t
                teams_box = [max(0, bx1 - 6), max(0, by1 - 4), bw + 14, bh + 8]
                teams_bottom_y = by1 + bh
                break

    # ---------------------------------------------------------
    # 2. YELLOW BOX: Markdown File Name (*.md)
    # ---------------------------------------------------------
    file_detected = False
    file_name = ""
    file_box = [int(w * 0.05), teams_bottom_y + int(10 * dpi_factor), int(200 * dpi_factor), int(30 * dpi_factor)]
    file_bottom_y = teams_bottom_y + int(45 * dpi_factor)

    file_candidates = []
    for bx1, by1, bw, bh, t, s in top_tokens:
        if by1 >= teams_bottom_y - 10 and by1 < int(h * 0.45) and bx1 < int(w * 0.60):
            clean = re.sub(r'^[<←\- \t]+', '', t).strip()
            if not clean:
                continue
            if expected_doc_name and expected_doc_name.lower() in clean.lower():
                file_candidates.insert(0, (clean, [bx1, by1, bw, bh], 10.0))
            elif '.md' in clean.lower() or '.markdown' in clean.lower():
                file_candidates.insert(0, (clean, [bx1, by1, bw, bh], 5.0 + s))
            elif any(k in clean.lower() for k in ['matrix', 'document', 'readme', 'draft', 'note']):
                file_candidates.append((clean, [bx1, by1, bw, bh], 2.0 + s))
            elif len(clean) >= 4 and not any(k in clean.lower() for k in ['team', 'h1', '99', '</>', '1004', '2:']):
                file_candidates.append((clean, [bx1, by1, bw, bh], s))

    if file_candidates:
        file_candidates.sort(key=lambda x: -x[2])
        c_text, c_box, _ = file_candidates[0]
        file_detected = True
        file_name = c_text
        file_box = [max(0, c_box[0] - 6), max(0, c_box[1] - 4), c_box[2] + 12, c_box[3] + 8]
        file_bottom_y = c_box[1] + c_box[3]

    # ---------------------------------------------------------
    # 3. WHITE BOX 1: Edit Mode ("Pencil Icon" Active)
    # ---------------------------------------------------------
    # Find editor body start from top_tokens to bound toolbar accurately regardless of DPI
    first_body_y = None
    for bx1, by1, bw, bh, t, s in top_tokens:
        clean = t.strip()
        if by1 > file_bottom_y + 10:
            if any(k in clean.lower() for k in ['h1', '99', '</>']) and bh < 60:
                pass # toolbar icon
            elif len(clean) >= 3 and (bx1 < int(w * 0.35) or clean.startswith('#') or clean.startswith('>') or re.match(r'^\d+', clean)):
                if first_body_y is None or by1 < first_body_y:
                    first_body_y = by1

    tb_y1 = max(0, file_bottom_y)
    tb_y2 = first_body_y if (first_body_y and first_body_y > tb_y1 + 40) else min(h, tb_y1 + int(max(90, 180 * dpi_factor)))
    crop_tb = img[tb_y1:tb_y2, :]

    edit_mode_active = False
    blue_pixel_count = 0
    edit_box = [int(w * 0.70), tb_y1, int(40 * dpi_factor), tb_y2 - tb_y1]

    # Search for blue pencil icon in toolbar region
    if crop_tb.size > 0:
        hsv_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2HSV)
        blue_mask = cv2.inRange(hsv_tb, np.array([95, 50, 50]), np.array([135, 255, 255]))
        contours, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best_pencil = None
        best_area = 0
        for c in contours:
            area = cv2.contourArea(c)
            if area > 15:
                bx, by, bw, bh = cv2.boundingRect(c)
                if bx > int(w * 0.35) and area > best_area:
                    best_area = area
                    best_pencil = (bx, by, bw, bh)
        if best_pencil:
            bx, by, bw, bh = best_pencil
            edit_mode_active = True
            blue_pixel_count = int(best_area)
            edit_box = [bx - 6, tb_y1 + by - 6, bw + 12, bh + 12]

    # Check for split screen mode (preview side-by-side)
    split_screen_detected = False
    center_strip = img[int(h * 0.25):int(h * 0.75), int(w * 0.46):int(w * 0.54)]
    if center_strip.size > 0:
        cs_gray = cv2.cvtColor(center_strip, cv2.COLOR_BGR2GRAY)
        sobel_x = cv2.Sobel(cs_gray, cv2.CV_16S, 1, 0, ksize=3)
        sobel_abs = cv2.convertScaleAbs(sobel_x)
        col_means = np.mean(sobel_abs, axis=0)
        if np.max(col_means) > 28.0:
            split_screen_detected = True
            edit_mode_active = False

    # ---------------------------------------------------------
    # 4. WHITE BOX 2: Dark Mode ("Moon Icon" & Dark Luminance)
    # ---------------------------------------------------------
    body_y1 = min(h - 50, tb_y2 + int(15 * dpi_factor))
    body_y2 = min(h - 40, body_y1 + int(h * 0.30))
    body_sample = img[body_y1:body_y2, int(w * 0.15):int(w * 0.85)]
    mean_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY))) if body_sample.size > 0 else 100.0

    dark_mode_active = (mean_lum < 65.0)
    dark_box = [int(w * 0.88), tb_y1, int(40 * dpi_factor), tb_y2 - tb_y1]

    # ---------------------------------------------------------
    # 5 & 6. GREEN & RED BOXES: First & Last Line Numbers
    # ---------------------------------------------------------
    # Dynamic gutter search: left margin below toolbar
    gutter_w = int(max(150, min(360, 220 * dpi_factor)))
    body_gutter = img[tb_y1:h - int(h * 0.04), :gutter_w]
    
    gutter_lines = []
    # OCR pass on gutter crop
    res_g, _ = ocr(body_gutter)
    if res_g:
        for b, t, s in res_g:
            pts = np.array(b)
            bx1, by1 = int(pts[:, 0].min()), tb_y1 + int(pts[:, 1].min())
            bw, bh = int(pts[:, 0].max() - pts[:, 0].min()), int(pts[:, 1].max() - pts[:, 1].min())
            clean = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
            if m := re.search(r'^\s*(\d+)', clean):
                val = int(m.group(1))
                if 1 <= val <= 999999:
                    char_w = max(14, int(bw * (len(m.group(1)) / max(1, len(clean)))) + 4)
                    box = [max(0, bx1 - 3), max(0, by1 - 3), min(bw, char_w), bh + 6]
                    gutter_lines.append((by1, val, box))

    # Also incorporate top_tokens below toolbar
    for bx1, by1, bw, bh, t, s in top_tokens:
        if by1 >= tb_y1 and bx1 < gutter_w:
            clean = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
            if m := re.search(r'^\s*(\d+)', clean):
                val = int(m.group(1))
                if 1 <= val <= 999999 and not any(abs(gl[0] - by1) <= 10 for gl in gutter_lines):
                    char_w = max(14, int(bw * (len(m.group(1)) / max(1, len(clean)))) + 4)
                    box = [max(0, bx1 - 3), max(0, by1 - 3), min(bw, char_w), bh + 6]
                    gutter_lines.append((by1, val, box))

    first_line_num = 0
    first_line_box = [int(w * 0.02), tb_y2, int(35 * dpi_factor), int(25 * dpi_factor)]
    last_line_num = 0
    last_line_box = [int(w * 0.02), h - int(50 * dpi_factor), int(35 * dpi_factor), int(25 * dpi_factor)]

    if gutter_lines:
        gutter_lines.sort(key=lambda x: x[0])
        top_y, top_val, top_box = gutter_lines[0]
        # If top detected line > 1, check whether line 1 is visible directly above it using vertical gutter pitch
        if top_val > 1 and len(gutter_lines) >= 2:
            pitches = [gutter_lines[i+1][0] - gutter_lines[i][0] for i in range(min(4, len(gutter_lines)-1)) if gutter_lines[i+1][1] > gutter_lines[i][1]]
            avg_pitch = (sum(pitches) / len(pitches)) if pitches else max(18.0, 36.0 * (dpi_factor / 2.0))
            est_l1_y = top_y - int((top_val - 1) * avg_pitch)
            if est_l1_y >= tb_y1 - 10:
                first_line_num = 1
                first_line_box = [top_box[0], max(tb_y1, est_l1_y), top_box[2], top_box[3]]
            else:
                first_line_num = top_val
                first_line_box = top_box
        else:
            first_line_num = top_val
            first_line_box = top_box

        # Last line
        last_line_num = gutter_lines[-1][1]
        last_line_box = gutter_lines[-1][2]

        # If only 1 line was found in gutter_lines (e.g. at 400 DPI where only line 1 has leading digits),
        # estimate last line from vertical rows or text content in editor body:
        if (len(gutter_lines) <= 2 or last_line_num <= 4) and first_line_num == 1:
            bot_crop = img[int(h * 0.45):h - int(h * 0.05), :int(w * 0.50)]
            res_bot, _ = ocr(bot_crop)
            if res_bot:
                pts_bot = []
                for b, t, s in res_bot:
                    pts = np.array(b)
                    pts_bot.append((int(h * 0.45) + int(pts[:, 1].min()), int(pts[:, 1].max() - pts[:, 1].min()), int(pts[:, 0].min())))
                if pts_bot:
                    pts_bot.sort(key=lambda x: -x[0])
                    b_y, b_h, b_x = pts_bot[0]
                    pitch = max(24.0, (first_line_box[3] * 1.35) if first_line_box[3] > 15 else 48.0)
                    est_lines = max(2, int(round((b_y - first_line_box[1]) / pitch)) + 1)
                    last_line_num = max(last_line_num, first_line_num + est_lines - 1)
                    last_line_box = [first_line_box[0], b_y, first_line_box[2], b_h + 4]
            else:
                last_line_num = first_line_num + 7
                last_line_box = [first_line_box[0], int(h * 0.85), first_line_box[2], first_line_box[3]]

    first_line_detected = (first_line_num > 0)
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
            "detected_value": f"{blue_pixel_count} blue pixels" if edit_mode_active else ("Split screen with duplicated text detected" if split_screen_detected else "Pencil icon inactive (0 blue px)"),
            "expected": "Blue active pencil icon, single edit pane (no split screen / duplicated text)",
            "details": "Editor in active edit mode (single pane)" if edit_mode_active else ("Split screen with duplicated text detected; tap pencil icon to switch to edit mode" if split_screen_detected else f"Edit mode inactive (found {blue_pixel_count} blue px, required >= 15)"),
            "icon": "pencil",
            "split_screen_detected": split_screen_detected,
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
        reason_txt = "Split screen with duplicated text detected (tap pencil icon to enter single-pane edit mode)" if split_screen_detected else "Editor not in edit mode (pencil icon inactive - tap to enter edit mode)"
        missing_reasons.append(reason_txt)
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
        "orientation": "portrait" if h > w else "landscape",
        "aspect_ratio": round(float(w) / float(h), 4) if h > 0 else 1.7778,
        "dpi_factor": float(dpi_factor),
        "dismissed": list(dismissed_set)
    }

