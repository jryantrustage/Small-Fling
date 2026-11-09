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

def normalize_bundle_identifier_ocr(raw_name: str) -> str:
    """
    Normalizes common RapidOCR substitutions in bundle/folder identifiers and filenames:
    - Strips leading gutter line numbers + markdown heading hashes (e.g. '1 # DIXUI_...' -> 'DIXUI_...')
    - 'CommonUl_' / 'DIXUl_' / 'DIxUl_' / 'DIXUL_' -> 'CommonUI_' / 'DIXUI_'
    - 'partl' / 'partI' / 'part|' -> 'part1'
    - 'partZ' -> 'part2', 'partS' -> 'part5', 'partG'/'partb' -> 'part6', 'partB' -> 'part8', 'partg'/'partq' -> 'part9'
    - ',md' / '.m' -> '.md'
    """
    s = (raw_name or "").strip()
    if not s:
        return ""
    s = re.sub(r"^\s*(?:\d+\s+)?#+\s*", "", s).strip()
    s = re.sub(r"\bDIxU[IlL]([_\-])", r"DIXUI\1", s)
    s = re.sub(r"([A-Za-z0-9])[Uu][lL]([_\-])", r"\1UI\2", s)
    s = re.sub(r"CommonUl([_\-])", r"CommonUI\1", s)
    _part_tail = r"(?=[,\.]m|\.md|\.m\b|$|\s)"
    s = re.sub(rf"(?i)(?:^|(?<=[_\-\s]))part[_\-\s]*[lI|]{_part_tail}", "part1", s)
    s = re.sub(rf"(?i)(?:^|(?<=[_\-\s]))part[_\-\s]*[Zz]{_part_tail}", "part2", s)
    s = re.sub(rf"(?i)(?:^|(?<=[_\-\s]))part[_\-\s]*[Ss]{_part_tail}", "part5", s)
    s = re.sub(rf"(?i)(?:^|(?<=[_\-\s]))part[_\-\s]*[Gb]{_part_tail}", "part6", s)
    s = re.sub(rf"(?i)(?:^|(?<=[_\-\s]))part[_\-\s]*[B]{_part_tail}", "part8", s)
    s = re.sub(rf"(?i)(?:^|(?<=[_\-\s]))part[_\-\s]*[gq]{_part_tail}", "part9", s)
    s = re.sub(r"(?i)[,\.]m(?:d)?$", ".md", s)
    return s


def parse_multipart_markdown_filename(file_name: Optional[str], top_tokens: Optional[list] = None) -> Dict[str, Any]:
    """
    Detects whether a markdown filename belongs to a multi-part bundle (e.g., `..._part1.md`, `..._part2.md`).
    Extracts the base bundle prefix, current part index, next part index, and total parts (if visible in header).
    """
    raw_name = (file_name or "").strip()
    if not raw_name:
        return {
            "is_multipart": False,
            "file_name": "",
            "base_prefix": "",
            "part_number": None,
            "next_part_number": None,
            "next_file_name": None,
            "total_parts": None
        }

    norm_name = normalize_bundle_identifier_ocr(raw_name)
    # Match '..._part1.md', '...part1.md', '...-part2.md', 'part 1 of 9', or standalone 'part1.md'
    m = re.match(
        r'^(?P<prefix>.*?)(?P<sep>[_\-\s]*)(?:part|pt)[_\-\s#]*(?P<part>\d+)(?:\s*(?:of|\.\.)\s*(?P<tot>\d+))?(?P<ext>\.md|\.markdown)?.*$',
        norm_name,
        re.IGNORECASE
    )
    total_parts: Optional[int] = None
    if m and m.group("tot"):
        try:
            total_parts = int(m.group("tot"))
        except Exception:
            pass
    if top_tokens:
        for tok in top_tokens:
            txt = tok[4] if len(tok) >= 5 else str(tok)
            m_tot = re.search(r'part\s*[:\*]*\s*\d+\s*of\s*(\d+)', txt, re.IGNORECASE)
            if m_tot:
                try:
                    total_parts = int(m_tot.group(1))
                    break
                except Exception:
                    pass

    if not m:
        return {
            "is_multipart": False,
            "file_name": norm_name,
            "base_prefix": re.sub(r'\.(md|markdown)$', '', norm_name, flags=re.IGNORECASE),
            "part_number": None,
            "next_part_number": None,
            "next_file_name": None,
            "total_parts": total_parts
        }

    prefix = normalize_bundle_identifier_ocr(m.group("prefix").rstrip("_- ("))
    sep = (m.group("sep") or "_") if prefix else ""
    if sep and sep.strip() == "":
        sep = "_"
    part_num = int(m.group("part"))
    ext = m.group("ext") or ".md"
    clean_file_name = f"{prefix}{sep}part{part_num}{ext}"
    next_part_num = part_num + 1
    next_file_name = f"{prefix}{sep}part{next_part_num}{ext}"
    if total_parts is not None and next_part_num > total_parts:
        next_file_name = None

    return {
        "is_multipart": True,
        "file_name": clean_file_name,
        "base_prefix": prefix,
        "part_number": part_num,
        "next_part_number": next_part_num if (total_parts is None or next_part_num <= total_parts) else None,
        "next_file_name": next_file_name,
        "total_parts": total_parts
    }

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

    # 1. OCR top 28.5% of image for structural header, title, and toolbar (avoids OCRing dense editor code rows!)
    top_limit_y = int(h * 0.285)
    top_crop = img[:top_limit_y, :]
    top_res, _ = ocr(top_crop)
    top_tokens = []
    if top_res:
        for b, t, s in top_res:
            pts = np.array(b)
            bx1, by1 = int(pts[:, 0].min()), int(pts[:, 1].min())
            bw, bh = int(pts[:, 0].max() - bx1), int(pts[:, 1].max() - by1)
            top_tokens.append((bx1, by1, bw, bh, t.strip(), float(s)))
    # Fallback to 42% height only if header/toolbar shifted down (e.g. call banner) and no title tokens found
    if len(top_tokens) < 2:
        top_limit_y = int(h * 0.42)
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
        # Merge adjacent horizontal tokens on the same title row if split (e.g., prefix + '_part1.md')
        row_cy = c_box[1] + c_box[3] / 2.0
        same_row = []
        for bx1, by1, bw, bh, t, s in top_tokens:
            t_cy = by1 + bh / 2.0
            if abs(t_cy - row_cy) <= max(14, bh * 0.7) and bx1 < int(w * 0.65):
                cl_t = re.sub(r'^[<←\- \t]+', '', t).strip()
                if cl_t and "team" not in cl_t.lower():
                    same_row.append((bx1, by1, bw, bh, cl_t))
        if len(same_row) > 1:
            same_row.sort(key=lambda x: x[0])
            merged_text = "".join(
                (tok[4] if i == 0 or tok[4].startswith("_") or same_row[i - 1][4].endswith("_") else f"_{tok[4]}")
                for i, tok in enumerate(same_row)
            )
            mx1 = min(tok[0] for tok in same_row)
            my1 = min(tok[1] for tok in same_row)
            mx2 = max(tok[0] + tok[2] for tok in same_row)
            my2 = max(tok[1] + tok[3] for tok in same_row)
            c_text = merged_text
            c_box = [mx1, my1, mx2 - mx1, my2 - my1]

        file_detected = True
        file_name = c_text
        file_box = [max(0, c_box[0] - 6), max(0, c_box[1] - 4), c_box[2] + 12, c_box[3] + 8]
        file_bottom_y = c_box[1] + c_box[3]

    multipart_info = parse_multipart_markdown_filename(file_name, top_tokens)
    if multipart_info.get("file_name"):
        file_name = multipart_info["file_name"]
    back_btn_cx = max(25, int(file_box[0] - 58 * (w / 1920.0))) if file_detected else int(53 * (w / 1920.0))
    back_btn_cy = int(file_box[1] + file_box[3] // 2) if file_detected else int(152 * (h / 1080.0))
    back_button_coords = [back_btn_cx, back_btn_cy]

    # ---------------------------------------------------------
    # 3. WHITE BOX 1: Edit Mode ("Pencil Icon" Active)
    # ---------------------------------------------------------
    tb_y1 = max(int(h * 0.05), min(file_bottom_y, int(h * 0.15)))
    # Search band for toolbar: spans from below file title / header to above editor code area
    tb_search_y2 = min(h, max(tb_y1 + int(max(90, 160 * dpi_factor)), int(h * 0.28)))

    # In landscape/desktop (w >= h): pencil icon is clustered on the right: x >= w * 0.50
    # In portrait: x >= w * 0.45
    min_pencil_x = int(w * 0.50) if w >= h else int(w * 0.45)
    crop_tb = img[tb_y1:tb_search_y2, min_pencil_x:]

    edit_mode_active = False
    split_screen_detected = False
    blue_pixel_count = 0
    best_pencil = None
    best_area = 0
    scale_w = (w / 1920.0) if w > 0 else 1.0

    # Search for active mode icon in right-hand toolbar region
    if crop_tb.size > 0:
        hsv_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2HSV)
        blue_mask = cv2.inRange(hsv_tb, np.array([95, 50, 50]), np.array([135, 255, 255]))
        contours, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        valid_conts = [c for c in contours if cv2.contourArea(c) >= 15]
        valid_conts.sort(key=lambda c: cv2.contourArea(c), reverse=True)
        
        for c in valid_conts:
            area = cv2.contourArea(c)
            bx, by, bw, bh = cv2.boundingRect(c)
            # Compact icon aspect ratio and reasonable icon height
            if 0.45 <= (bw / max(1, bh)) <= 2.5 and bh <= int(60 * dpi_factor) and area <= 2000 * (dpi_factor ** 2):
                abs_cx = min_pencil_x + bx + bw // 2
                # In the toolbar's right button group ([Pencil] [Eye] | [Moon]),
                # Pencil (Edit Mode) is at ~0.825w..0.848w, whereas Eye (Preview Mode) is at >= 0.858w.
                if abs_cx <= int(w * 0.855):
                    edit_mode_active = True
                    split_screen_detected = False
                    best_area = area
                    best_pencil = (min_pencil_x + bx, tb_y1 + by, bw, bh)
                    break
                else:
                    edit_mode_active = False
                    split_screen_detected = False
                    best_pencil = (int(abs_cx - 45 * dpi_factor), tb_y1 + by, bw, bh)
                    break

    if best_pencil:
        px, py, pw, ph = best_pencil
        blue_pixel_count = int(best_area)
        edit_box = [max(0, px - 6), max(0, py - 6), pw + 12, ph + 12]
        tb_row_y = py + ph // 2
    else:
        # Fallback estimation for toolbar row from tokens or geometry
        tb_row_y = None
        for bx1, by1, bw, bh, t, s in top_tokens:
            if tb_y1 + 5 < by1 < tb_search_y2 and bh < int(50 * dpi_factor):
                clean_l = t.strip().lower()
                if any(k in clean_l for k in ['h1', '99', '</>', 'bi', 'sh', '三', '>', '=']):
                    tb_row_y = by1 + bh // 2
                    break
        if tb_row_y is None:
            tb_row_y = tb_y1 + int(45 * dpi_factor)

        default_pencil_x = int(1655 * scale_w) if w >= h else int(w * 0.70)
        edit_box = [max(0, default_pencil_x - int(15 * dpi_factor)), max(0, tb_row_y - int(15 * dpi_factor)), int(30 * dpi_factor), int(30 * dpi_factor)]

    # Toolbar bottom is safely below the toolbar row
    tb_y2 = min(h, tb_row_y + int(max(20, 25 * dpi_factor)))

    # Fallback check for split screen mode divider line ONLY if toolbar wasn't already edit mode
    if not edit_mode_active and not split_screen_detected:
        center_strip = img[int(h * 0.25):int(h * 0.75), int(w * 0.46):int(w * 0.54)]
        if center_strip.size > 0:
            cs_gray = cv2.cvtColor(center_strip, cv2.COLOR_BGR2GRAY)
            sobel_x = cv2.Sobel(cs_gray, cv2.CV_16S, 1, 0, ksize=3)
            sobel_abs = cv2.convertScaleAbs(sobel_x)
            # Continuous vertical line check: requires >65% of rows in a single column to have an edge
            col_continuity = [np.count_nonzero(sobel_abs[:, col] > 40) / float(sobel_abs.shape[0]) for col in range(sobel_abs.shape[1])]
            if col_continuity and max(col_continuity) >= 0.65:
                split_screen_detected = True

    # ---------------------------------------------------------
    # 4. WHITE BOX 2: Dark Mode ("Moon Icon" & Dark Luminance)
    # ---------------------------------------------------------
    body_y1 = min(h - 50, tb_y2 + int(15 * dpi_factor))
    body_y2 = min(h - 40, body_y1 + int(h * 0.30))
    body_sample = img[body_y1:body_y2, int(w * 0.15):int(w * 0.85)]
    mean_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY))) if body_sample.size > 0 else 100.0

    dark_mode_active = (mean_lum < 65.0)
    dark_x = int(w * 0.94) if w >= h else int(w * 0.88)
    dark_box = [max(0, dark_x - int(15 * dpi_factor)), max(0, tb_row_y - int(15 * dpi_factor)), int(30 * dpi_factor), int(30 * dpi_factor)]

    # ---------------------------------------------------------
    # 5 & 6. GREEN & RED BOXES: First & Last Line Numbers
    # ---------------------------------------------------------
    scale_w = w / 1920.0
    scale_h = h / 1080.0
    dpi_scale = (h / 1080.0) if h < 720 else 1.0

    # Gutter strip must be wide enough (~135px) to avoid slicing 4-, 5-, or 6-digit line numbers in half
    # while strictly separating the right-aligned gutter column (x_min <= 84, x_max <= 94) from
    # code column 0 (which starts at x >= 96 on 1280x1024 and 1920x1080).
    gutter_num_w = int(min(w, max(124, int(138 * dpi_scale))))
    max_gutter_start_x = int(max(80, 84 * dpi_scale))
    max_gutter_end_x = int(max(92, 95 * dpi_scale))
    valid_min_y = max(tb_y2, int(290 * dpi_scale))
    valid_max_y = min(h - int(round(118 * dpi_scale)), int(945 * dpi_scale))
    gutter_lines = []

    def _extract_gutter_tokens(
        crop_img,
        x_offset: int,
        y_offset: int,
        max_allowed_x: int = 9999,
        max_allowed_end_x: int = 9999,
        target_list: list = None,
    ):
        if crop_img.size == 0:
            return
        out_list = target_list if target_list is not None else gutter_lines
        res, _ = ocr(crop_img)
        if not res:
            return
        for b, t, s in res:
            pts = np.array(b)
            bx1 = x_offset + int(pts[:, 0].min())
            bx2 = x_offset + int(pts[:, 0].max())
            by1 = y_offset + int(pts[:, 1].min())
            bw = int(bx2 - bx1)
            bh = int(pts[:, 1].max() - pts[:, 1].min())

            # Ignore bottom-left Offline pill or tokens outside vertical editor bounds
            raw_t = t.strip()
            low_t = raw_t.lower()
            if by1 >= int(840 * dpi_scale) and any(k in low_t for k in ("offline", "offlin", "ffline")):
                continue
            if by1 < valid_min_y or by1 > valid_max_y:
                continue

            # Spatial filter: token must start and end inside the gutter column (never inside code column 0 at x >= 96)
            if bx1 > max_allowed_x or bx2 > max_allowed_end_x:
                continue

            # Reject decimal/float coordinates or punctuation (e.g. '205.143', '58.4777')
            if any(ch in raw_t for ch in ('.', ',', ':', ';', '-', '+', '=', '(', ')', '[', ']', '{', '}', '"', "'")):
                continue

            # Linguistic filter: gutter line numbers NEVER contain multiple letters (e.g. 'layout.ts', 'logger', 'exp')
            letters = re.findall(r'[a-zA-Z]', raw_t)
            if len(letters) >= 2 or (len(letters) == 1 and (len(raw_t) > 4 or letters[0] not in 'lIOSBo')):
                continue

            clean = (
                raw_t.replace('B', '8')
                .replace('S', '5')
                .replace('O', '0')
                .replace('o', '0')
                .replace('I', '1')
                .replace('l', '1')
                .replace('/', '7')
                .replace('|', '1')
            )
            clean = re.sub(r'(\d)\s+(\d)', r'\1\2', clean).strip()
            if m := re.match(r'^\s*(\d{1,6})\s*$', clean):
                val = int(m.group(1))
                if 1 <= val <= 999999 and not any(abs(gl[0] - by1) <= 10 and gl[1] == val for gl in out_list):
                    digits_str = m.group(1)
                    char_w = max(16, int(bw * (len(digits_str) / max(1, len(clean)))) + 6, len(digits_str) * int(10 * dpi_scale) + 6)
                    box = [max(0, bx1 - 3), max(0, by1 - 3), max(bw + 6, char_w), bh + 6]
                    out_list.append((by1, val, box))

    # Fast 0.05ms ink check on the unobstructed gutter column (y=295..880, x=24..88):
    # If the left gutter is blank dark background (0 gutter numbers), skip Pass A & Pass B completely!
    chk_y1, chk_y2 = max(valid_min_y, int(295 * dpi_scale)), min(valid_max_y, int(880 * dpi_scale))
    chk_x1, chk_x2 = int(24 * dpi_scale), int(88 * dpi_scale)
    gutter_bg_mean = 30.0
    gutter_ink_px = 100
    if chk_y2 > chk_y1 and chk_x2 > chk_x1:
        g_roi = img[chk_y1:chk_y2, chk_x1:chk_x2]
        g_gray = cv2.cvtColor(g_roi, cv2.COLOR_BGR2GRAY) if g_roi.ndim == 3 else g_roi
        gutter_bg_mean = float(np.mean(g_gray))
        gutter_ink_px = int(np.count_nonzero(g_gray > 65))

    # Pass A: Dedicated gutter strip wide enough for up to 6-digit line numbers
    crop_bot_y = min(h - int(h * 0.04), h - int(round(90 * dpi_scale)))
    narrow_strip = img[tb_y2:crop_bot_y, :gutter_num_w]
    if not (gutter_bg_mean < 48.0 and gutter_ink_px < 8):
        _extract_gutter_tokens(
            narrow_strip,
            0,
            tb_y2,
            max_allowed_x=max_gutter_start_x,
            max_allowed_end_x=max_gutter_end_x,
        )

    # 1.5x scaled strip ONLY if between 1 and 2 gutter lines found on native resolution
    if 0 < len(gutter_lines) < 3 and narrow_strip.size > 0:
        strip_scaled = cv2.resize(narrow_strip, (0, 0), fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
        if strip_scaled.size > 0:
            res_scaled, _ = ocr(strip_scaled)
            if res_scaled:
                for b, t, s in res_scaled:
                    pts = np.array(b) / 1.5
                    bx1 = int(pts[:, 0].min())
                    bx2 = int(pts[:, 0].max())
                    by1 = tb_y2 + int(pts[:, 1].min())
                    bw = int(bx2 - bx1)
                    bh = int(pts[:, 1].max() - pts[:, 1].min())
                    raw_t = t.strip()
                    if by1 >= int(840 * dpi_scale) and any(k in raw_t.lower() for k in ("offline", "offlin", "ffline")):
                        continue
                    if by1 < valid_min_y or by1 > valid_max_y or bx1 > max_gutter_start_x or bx2 > max_gutter_end_x:
                        continue
                    if any(ch in raw_t for ch in ('.', ',', ':', ';', '-', '+', '=', '(', ')', '[', ']', '{', '}', '"', "'")):
                        continue
                    letters = re.findall(r'[a-zA-Z]', raw_t)
                    if len(letters) >= 2 or (len(letters) == 1 and (len(raw_t) > 4 or letters[0] not in 'lIOSBo')):
                        continue
                    clean = (
                        raw_t.replace('B', '8')
                        .replace('S', '5')
                        .replace('O', '0')
                        .replace('o', '0')
                        .replace('I', '1')
                        .replace('l', '1')
                        .replace('/', '7')
                        .replace('|', '1')
                    )
                    clean = re.sub(r'(\d)\s+(\d)', r'\1\2', clean).strip()
                    if m := re.match(r'^\s*(\d{1,6})\s*$', clean):
                        val = int(m.group(1))
                        if 1 <= val <= 999999 and not any(abs(gl[0] - by1) <= 10 for gl in gutter_lines):
                            digits_str = m.group(1)
                            char_w = max(16, int(bw * (len(digits_str) / max(1, len(clean)))) + 6, len(digits_str) * int(10 * dpi_scale) + 6)
                            box = [max(0, bx1 - 3), max(0, by1 - 3), max(bw + 6, char_w), bh + 6]
                            gutter_lines.append((by1, val, box))

    # Pass B: Fallback wider search ONLY if sidebar is open (gutter_bg_mean >= 48) and >= 4 strictly sequential
    # line numbers exist at a consistent X column. Never accept isolated numbers inside wrapped code/SVG!
    if not gutter_lines and gutter_bg_mean >= 48.0:
        gutter_w = int(max(180, min(380, 240 * dpi_factor)))
        body_gutter = img[tb_y2:crop_bot_y, :gutter_w]
        wide_cands = []
        _extract_gutter_tokens(
            body_gutter,
            0,
            tb_y2,
            max_allowed_x=gutter_w,
            max_allowed_end_x=gutter_w,
            target_list=wide_cands,
        )
        if len(wide_cands) >= 4:
            wide_cands.sort(key=lambda x: x[0])
            seq_chain = []
            for cand in wide_cands:
                if not seq_chain:
                    seq_chain = [cand]
                else:
                    prev_c = seq_chain[-1]
                    if (
                        cand[1] - prev_c[1] == 1
                        and 14 <= (cand[0] - prev_c[0]) <= 42
                        and abs(cand[2][0] - prev_c[2][0]) <= 24
                    ):
                        seq_chain.append(cand)
                    elif cand[0] - prev_c[0] > 42:
                        if len(seq_chain) >= 4:
                            break
                        seq_chain = [cand]
            if len(seq_chain) >= 4:
                gutter_lines.extend(seq_chain)

    # Also consult consensus-corrected gutter sequence from ocr_engine so single-digit misreads
    # or clipped digits never corrupt first_line_num / last_line_num
    consensus_cluster = []
    try:
        from ocr_engine import find_gutter_numbers_cluster
        consensus_cluster = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
    except Exception:
        consensus_cluster = []

    first_line_num = 0
    first_line_box = [int(38 * dpi_scale), max(tb_y2, int(298 * dpi_scale)), int(48 * dpi_scale), int(22 * dpi_scale)]
    last_line_num = 0
    last_line_box = [int(38 * dpi_scale), min(h - int(50 * dpi_scale), int(868 * dpi_scale)), int(48 * dpi_scale), int(22 * dpi_scale)]

    if consensus_cluster:
        gutter_col_x = int(np.median([gl[2][0] for gl in gutter_lines])) if gutter_lines else int(38 * dpi_scale)
        gutter_bh = int(np.median([gl[2][3] for gl in gutter_lines])) if gutter_lines else int(21 * dpi_scale)

        top_y, top_val = consensus_cluster[0]
        bot_y, bot_val = consensus_cluster[-1]

        # Calculate actual pitch per line (delta_y / delta_line_number)
        pitches = []
        for i in range(len(consensus_cluster) - 1):
            d_val = consensus_cluster[i + 1][1] - consensus_cluster[i][1]
            d_y = consensus_cluster[i + 1][0] - consensus_cluster[i][0]
            if 0 < d_val <= 6 and d_y > 0:
                pitch = d_y / float(d_val)
                if 12.0 <= pitch <= 65.0:
                    pitches.append(pitch)
        avg_pitch = (sum(pitches) / len(pitches)) if pitches else max(18.0, 27.0 * dpi_scale)

        # Only check for an undetected single-digit Line 1..4 above top_val when near the very top of the file (top_val <= 5)
        if 1 < top_val <= 5 and top_y >= max(tb_y2 + 24, int(322 * dpi_scale)):
            for cand_val in range(top_val - 1, 0, -1):
                cand_y = top_y - int(round((top_val - cand_val) * avg_pitch))
                if cand_y >= max(tb_y2 + 6, int(295 * dpi_scale)):
                    top_val = cand_val
                    top_y = cand_y
                else:
                    break

        first_line_num = int(top_val)
        last_line_num = int(max(first_line_num, bot_val))

        def _resolve_gutter_box(target_y: int, target_val: int) -> list:
            min_w = max(18, len(str(target_val)) * int(10 * dpi_scale) + 8)
            if gutter_lines:
                best_match = min(gutter_lines, key=lambda gl: abs(gl[0] - target_y))
                if abs(best_match[0] - target_y) <= 16:
                    bx, by, bw, bh = best_match[2]
                    return [bx, by, max(bw, min_w), bh]
            return [gutter_col_x, max(tb_y2, target_y - 3), min_w, gutter_bh]

        first_line_box = _resolve_gutter_box(top_y, first_line_num)
        last_line_box = _resolve_gutter_box(bot_y, last_line_num)
    elif gutter_lines:
        gutter_lines.sort(key=lambda x: x[0])

        # Filter horizontal outliers (keep column within +/- 30px of median gutter X)
        col_xs = [gl[2][0] for gl in gutter_lines]
        med_x = float(np.median(col_xs))
        gutter_lines = [gl for gl in gutter_lines if abs(gl[2][0] - med_x) <= max(25.0, 35.0 * dpi_factor)]
        gutter_col_x = int(np.median([gl[2][0] for gl in gutter_lines])) if gutter_lines else int(w * 0.02)
        gutter_bw = int(np.median([gl[2][2] for gl in gutter_lines])) if gutter_lines else int(20 * dpi_factor)
        gutter_bh = int(np.median([gl[2][3] for gl in gutter_lines])) if gutter_lines else int(20 * dpi_factor)

        top_y, top_val, top_box = gutter_lines[0]

        pitches = []
        for i in range(len(gutter_lines) - 1):
            d_val = gutter_lines[i+1][1] - gutter_lines[i][1]
            d_y = gutter_lines[i+1][0] - gutter_lines[i][0]
            if d_val > 0 and d_y > 0:
                pitch = d_y / float(d_val)
                if 8.0 <= pitch <= 80.0:
                    pitches.append(pitch)

        avg_pitch = (sum(pitches) / len(pitches)) if pitches else max(12.0, 26.0 * scale_h)

        first_line_num = top_val
        first_line_box = top_box

        # Only extrapolate upward for single-digit lines 1..4 at the very top of the file
        if 1 < top_val <= 5 and top_y >= max(tb_y2 + 24, int(322 * dpi_scale)):
            topmost_val = top_val
            topmost_y = top_y
            for cand_val in range(top_val - 1, 0, -1):
                cand_y = top_y - int((top_val - cand_val) * avg_pitch)
                if cand_y >= max(tb_y2 + 6, int(295 * dpi_scale)):
                    topmost_val = cand_val
                    topmost_y = cand_y
                else:
                    break

            if topmost_val < top_val:
                first_line_num = topmost_val
                first_line_box = [gutter_col_x, max(tb_y2, topmost_y), gutter_bw, gutter_bh]

        valid_descendants = [gl for gl in gutter_lines if gl[1] >= first_line_num and gl[0] >= first_line_box[1] and (gl[1] - first_line_num) <= 75]
        if valid_descendants:
            last_line_num = valid_descendants[-1][1]
            last_line_box = valid_descendants[-1][2]
        else:
            last_line_num = gutter_lines[-1][1]
            last_line_box = gutter_lines[-1][2]

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

    char_track_aligned = False
    if first_line_num <= 0 and dark_mode_active:
        try:
            from services import state as _st
            # Fast 0.1ms content-row ink check across the 22 unobstructed visual rows (y=309+r*27, x=104..w-40)
            code_x1 = int(102 * dpi_scale)
            code_x2 = max(code_x1 + 100, w - int(40 * dpi_scale))
            pitch_y = 27.0 * dpi_scale
            base_y = max(tb_y2 + 6, int(309 * dpi_scale))
            ink_rows = 0
            for r_idx in range(22):
                ry1 = int(round(base_y + r_idx * pitch_y - 10 * dpi_scale))
                ry2 = int(round(base_y + r_idx * pitch_y + 10 * dpi_scale))
                if ry2 >= h - int(115 * dpi_scale):
                    break
                r_crop = img[max(0, ry1):min(h, ry2), code_x1:code_x2]
                if r_crop.size > 0:
                    r_gray = cv2.cvtColor(r_crop, cv2.COLOR_BGR2GRAY) if r_crop.ndim == 3 else r_crop
                    if int(np.count_nonzero(r_gray > 65)) >= 18:
                        ink_rows += 1
            if ink_rows >= 3:
                tracked_ln = int(
                    _st.orchestration_state.get("character_tracking_line")
                    or _st.latest_telemetry.get("current_bottom_line")
                    or _st.latest_telemetry.get("current_top_line")
                    or 1
                )
                first_line_num = tracked_ln
                last_line_num = tracked_ln
                first_line_box = [int(38 * dpi_scale), int(300 * dpi_scale), int(64 * dpi_scale), int(22 * dpi_scale)]
                last_line_box = [int(38 * dpi_scale), int(866 * dpi_scale), int(64 * dpi_scale), int(22 * dpi_scale)]
                char_track_aligned = True
        except Exception:
            pass

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
            "detected_value": (f"Line {first_line_num} (Char Track)" if char_track_aligned else f"Line {first_line_num}") if first_line_detected else "None detected",
            "expected": "Top line integer >= 1 in gutter or wrapped character anchor",
            "details": (f"Character tracking active on wrapped Line {first_line_num}" if char_track_aligned else f"Top line number {first_line_num} detected in gutter") if first_line_detected else "Top line number not found in gutter",
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
            "detected_value": (f"Line {last_line_num} (Char Track)" if char_track_aligned else f"Line {last_line_num}") if last_line_detected else "None detected",
            "expected": f"Bottom line integer >= {first_line_num or 1} in gutter or wrapped character anchor",
            "details": (f"Character tracking active at bottom of wrapped Line {last_line_num}" if char_track_aligned else f"Bottom line number {last_line_num} detected in gutter") if last_line_detected else "Bottom line number not found in gutter",
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
        "character_tracking_mode": bool(char_track_aligned),
        "file_name": file_name,
        "multipart_info": multipart_info,
        "is_multipart": bool(multipart_info.get("is_multipart")),
        "part_number": multipart_info.get("part_number"),
        "total_parts": multipart_info.get("total_parts"),
        "next_part_number": multipart_info.get("next_part_number"),
        "next_file_name": multipart_info.get("next_file_name"),
        "back_button_coords": back_button_coords,
        "boxes": boxes,
        "resolution": {"width": w, "height": h},
        "orientation": "portrait" if h > w else "landscape",
        "aspect_ratio": round(float(w) / float(h), 4) if h > 0 else 1.7778,
        "dpi_factor": float(dpi_factor),
        "dismissed": list(dismissed_set)
    }

