import cv2
import numpy as np
import re
import sys
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr

def analyze_alignment(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        print("Cannot load image:", image_path)
        return
    h, w = img.shape[:2]
    ocr = get_rapid_ocr()
    
    # 1. Teams Header / Logo (Blue Box):
    # Normalized coords: y: 0.01..0.10, x: 0.02..0.22
    y1_teams, y2_teams = int(h * 0.01), int(h * 0.10)
    x1_teams, x2_teams = int(w * 0.02), int(w * 0.22)
    crop_teams = img[y1_teams:y2_teams, x1_teams:x2_teams]
    teams_detected = False
    teams_text = ""
    teams_box = [x1_teams, y1_teams, x2_teams - x1_teams, y2_teams - y1_teams]
    if ocr:
        res, _ = ocr(crop_teams)
        if res:
            for b, t, s in res:
                if "team" in t.lower():
                    teams_detected = True
                    teams_text = t.strip()
                    break
    
    # 2. Markdown File Name (Yellow Box):
    # Normalized coords: y: 0.04..0.13, x: 0.05..0.65
    y1_file, y2_file = int(h * 0.04), int(h * 0.13)
    x1_file, x2_file = int(w * 0.05), int(w * 0.65)
    crop_file = img[y1_file:y2_file, x1_file:x2_file]
    file_detected = False
    file_name = ""
    file_box = [x1_file, y1_file, x2_file - x1_file, y2_file - y1_file]
    if ocr:
        res, _ = ocr(crop_file)
        if res:
            for b, t, s in res:
                clean_t = t.strip()
                if ".md" in clean_t.lower() or "_" in clean_t or re.search(r'[a-zA-Z0-9_\-]+\.(md|txt|json)', clean_t):
                    file_detected = True
                    file_name = clean_t
                    break
    
    # 3. Editor Modes (White Boxes):
    # Top right toolbar: y: 0.08..0.18, x: 0.65..0.99
    # Mode A: Edit mode ("pencil icon")
    # Must have active edit pencil button (typically highlighted with blue border/fill or pencil icon)
    # Mode B: Dark mode ("moon icon")
    # Editor background luminance must be dark (< 50) and moon icon or dark theme toggle present
    y1_tb, y2_tb = int(h * 0.08), int(h * 0.18)
    x1_tb, x2_tb = int(w * 0.65), int(w * 0.99)
    crop_tb = img[y1_tb:y2_tb, x1_tb:x2_tb]
    
    # Check dark mode:
    # Sample editor center background: y: 0.30..0.70, x: 0.20..0.80
    body_sample = img[int(h*0.30):int(h*0.70), int(w*0.20):int(w*0.80)]
    mean_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY)))
    dark_mode_active = mean_lum < 55.0  # Dark mode is dark grey/black (~30-35)
    
    # Check edit mode (pencil):
    # Look for blue/cyan active button highlight in toolbar or toolbar icons
    hsv_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2HSV)
    # Blue mask for active pencil button:
    blue_mask = cv2.inRange(hsv_tb, np.array([100, 80, 80]), np.array([135, 255, 255]))
    blue_pixel_count = int(np.count_nonzero(blue_mask))
    edit_mode_active = blue_pixel_count > 15  # Active pencil button has distinct blue background/border
    
    edit_box = [int(w * 0.68), y1_tb, int(w * 0.06), y2_tb - y1_tb]
    dark_box = [int(w * 0.85), y1_tb, int(w * 0.08), y2_tb - y1_tb]
    
    # 4. First line number on current page (Green Box):
    # Left gutter top: y: 0.10..0.22, x: 0.00..0.08
    y1_top, y2_top = int(h * 0.10), int(h * 0.22)
    x1_top, x2_top = 0, int(w * 0.08)
    crop_top = img[y1_top:y2_top, x1_top:x2_top]
    first_line_num = 0
    first_line_box = [x1_top, y1_top, x2_top - x1_top, y2_top - y1_top]
    if ocr:
        res, _ = ocr(crop_top)
        if res:
            for b, t, s in res:
                if m := re.search(r'\b(\d+)\b', t.strip()):
                    first_line_num = int(m.group(1))
                    first_line_box = [int(b[0][0]), y1_top + int(b[0][1]), int(b[1][0] - b[0][0]), int(b[2][1] - b[1][1])]
                    break
    first_line_detected = first_line_num > 0
    
    # 5. Last line number on current page (Red Box):
    # Left gutter bottom: y: 0.85..0.98, x: 0.00..0.08
    y1_bot, y2_bot = int(h * 0.85), int(h * 0.98)
    x1_bot, x2_bot = 0, int(w * 0.08)
    crop_bot = img[y1_bot:y2_bot, x1_bot:x2_bot]
    last_line_num = 0
    last_line_box = [x1_bot, y1_bot, x2_bot - x1_bot, y2_bot - y1_bot]
    if ocr:
        res, _ = ocr(crop_bot)
        if res:
            for b, t, s in res:
                if m := re.search(r'\b(\d+)\b', t.strip()):
                    last_line_num = int(m.group(1))
                    last_line_box = [int(b[0][0]), y1_bot + int(b[0][1]), int(b[1][0] - b[0][0]), int(b[2][1] - b[1][1])]
                    break
    last_line_detected = last_line_num > 0
    
    # Summary Alignment Decision:
    checks = {
        "teams_header": {"passed": teams_detected, "text": teams_text, "box": teams_box},
        "filename": {"passed": file_detected, "text": file_name, "box": file_box},
        "edit_mode": {"passed": edit_mode_active, "blue_pixels": blue_pixel_count, "box": edit_box},
        "dark_mode": {"passed": dark_mode_active, "luminance": mean_lum, "box": dark_box},
        "first_line": {"passed": first_line_detected, "line": first_line_num, "box": first_line_box},
        "last_line": {"passed": last_line_detected, "line": last_line_num, "box": last_line_box},
    }
    
    missing = [k for k, v in checks.items() if not v["passed"]]
    is_aligned = len(missing) == 0
    alignment_status = "teams markdown aligned" if is_aligned else "teams markdown not aligned"
    
    print(f"\nResults for {image_path}:")
    print(f"  Status: {alignment_status}")
    print(f"  Missing / Failed checks: {missing}")
    for k, v in checks.items():
        print(f"    - {k}: {v['passed']} (details: {v})")

analyze_alignment(r'C:\Users\aspfo\.gemini\antigravity-ide\brain\76241820-5f42-4aa4-886b-32fd1d02cac5\.user_uploaded\media_1790096143406.png')
analyze_alignment('pixel_10_target48_verified.jpg')
