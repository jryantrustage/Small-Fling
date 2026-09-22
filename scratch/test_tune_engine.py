import cv2
import numpy as np
import re
import sys
from pathlib import Path
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr

def inspect_image(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        print("Cannot load:", image_path)
        return
    h, w, _ = img.shape
    ocr = get_rapid_ocr()
    print(f"\n==========================================")
    print(f"Inspecting {image_path} ({w}x{h})")
    print(f"==========================================")

    # 1. Teams Logo / Header (Blue Box)
    # Location: top-left header bar (y: 1% to 10%, x: 1% to 20%)
    y1_t, y2_t = int(h * 0.015), int(h * 0.10)
    x1_t, x2_t = int(w * 0.015), int(w * 0.20)
    crop_teams = img[y1_t:y2_t, x1_t:x2_t]
    # Resize 2x for OCR reliability on small text
    crop_teams_2x = cv2.resize(crop_teams, (crop_teams.shape[1]*2, crop_teams.shape[0]*2), interpolation=cv2.INTER_CUBIC)
    res_t, _ = ocr(crop_teams_2x) if ocr else (None, None)
    teams_detected = False
    teams_box = [x1_t, y1_t, x2_t - x1_t, y2_t - y1_t]
    teams_text = ""
    if res_t:
        for b, t, s in res_t:
            if "team" in t.lower():
                teams_detected = True
                teams_text = t.strip()
                # Compute box from b
                bx1 = x1_t + int(b[0][0] / 2)
                by1 = y1_t + int(b[0][1] / 2)
                bw = int((b[1][0] - b[0][0]) / 2)
                bh = int((b[2][1] - b[1][1]) / 2)
                teams_box = [max(x1_t, bx1 - 8), max(y1_t, by1 - 4), bw + 24, bh + 8]
                break
    print(f"1. Teams Header: detected={teams_detected}, text='{teams_text}', box={teams_box}")

    # 2. Markdown File Name (Yellow Box)
    # Location: document title bar under teams (y: 4% to 12%, x: 3% to 45%)
    y1_f, y2_f = int(h * 0.04), int(h * 0.12)
    x1_f, x2_f = int(w * 0.03), int(w * 0.45)
    crop_file = img[y1_f:y2_f, x1_f:x2_f]
    crop_file_2x = cv2.resize(crop_file, (crop_file.shape[1]*2, crop_file.shape[0]*2), interpolation=cv2.INTER_CUBIC)
    res_f, _ = ocr(crop_file_2x) if ocr else (None, None)
    file_detected = False
    file_name = ""
    file_box = [x1_f, y1_f, x2_f - x1_f, y2_f - y1_f]
    if res_f:
        for b, t, s in res_f:
            clean_t = t.strip()
            if ".md" in clean_t.lower() or "_" in clean_t or "matrix" in clean_t.lower():
                file_detected = True
                file_name = clean_t
                bx1 = x1_f + int(b[0][0] / 2)
                by1 = y1_f + int(b[0][1] / 2)
                bw = int((b[1][0] - b[0][0]) / 2)
                bh = int((b[2][1] - b[1][1]) / 2)
                file_box = [max(x1_f, bx1 - 6), max(y1_f, by1 - 4), bw + 12, bh + 8]
                break
    # Fallback: check if .md exists in any text near top
    print(f"2. File Name: detected={file_detected}, name='{file_name}', box={file_box}")

    # 3. Editor Modes (White Boxes: Pencil Edit Mode & Moon Dark Mode)
    # Top-right toolbar: y: 8% to 17%, x: 65% to 99%
    y1_tb, y2_tb = int(h * 0.08), int(h * 0.17)
    x1_tb, x2_tb = int(w * 0.65), int(w * 0.99)
    crop_tb = img[y1_tb:y2_tb, x1_tb:x2_tb]

    # Dark mode: check background luminance of editor canvas
    body_sample = img[int(h * 0.25):int(h * 0.75), int(w * 0.20):int(w * 0.80)]
    mean_lum = float(np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY)))
    dark_mode_active = mean_lum < 55.0
    dark_box = [int(w * 0.88), y1_tb, int(w * 0.09), y2_tb - y1_tb]

    # Edit mode: Look for blue active pencil button in toolbar
    hsv_tb = cv2.cvtColor(crop_tb, cv2.COLOR_BGR2HSV)
    blue_mask = cv2.inRange(hsv_tb, np.array([95, 60, 60]), np.array([140, 255, 255]))
    blue_cnt = int(np.count_nonzero(blue_mask))
    edit_mode_active = blue_cnt >= 15
    edit_box = [int(w * 0.69), y1_tb, int(w * 0.07), y2_tb - y1_tb]
    if blue_cnt >= 15:
        pts = np.argwhere(blue_mask)
        min_y, min_x = pts.min(axis=0)
        max_y, max_x = pts.max(axis=0)
        edit_box = [x1_tb + min_x - 6, y1_tb + min_y - 6, (max_x - min_x) + 12, (max_y - min_y) + 12]

    print(f"3. Edit Mode (Pencil): active={edit_mode_active}, blue_pixels={blue_cnt}, box={edit_box}")
    print(f"4. Dark Mode (Moon): active={dark_mode_active}, luminance={mean_lum:.1f}, box={dark_box}")

    # 4. First line number on current page (Green Box)
    # Narrow left gutter at the top: y: 11% to 22%, x: 0% to 6%
    y1_g, y2_g = int(h * 0.11), int(h * 0.22)
    x1_g, x2_g = 0, int(w * 0.06)
    crop_green = img[y1_g:y2_g, x1_g:x2_g]
    crop_green_2x = cv2.resize(crop_green, (crop_green.shape[1]*2, crop_green.shape[0]*2), interpolation=cv2.INTER_CUBIC)
    res_g, _ = ocr(crop_green_2x) if ocr else (None, None)
    first_line_num = 0
    first_line_box = [x1_g, y1_g, x2_g - x1_g, y2_g - y1_g]
    if res_g:
        nums = []
        for b, t, s in res_g:
            clean_num = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
            if m := re.search(r'\b(\d+)\b', clean_num):
                try:
                    num_val = int(m.group(1))
                    bx1 = x1_g + int(b[0][0] / 2)
                    by1 = y1_g + int(b[0][1] / 2)
                    bw = int((b[1][0] - b[0][0]) / 2)
                    bh = int((b[2][1] - b[1][1]) / 2)
                    nums.append((by1, num_val, [bx1, by1, bw, bh]))
                except ValueError: pass
        if nums:
            nums.sort(key=lambda x: x[0])
            first_line_num = nums[0][1]
            first_line_box = nums[0][2]
    first_line_detected = first_line_num > 0
    print(f"5. First Line: detected={first_line_detected}, line={first_line_num}, box={first_line_box}")

    # 5. Last line number on current page (Red Box)
    # Narrow left gutter at the bottom: y: 88% to 98%, x: 0% to 6%
    y1_r, y2_r = int(h * 0.88), int(h * 0.98)
    x1_r, x2_r = 0, int(w * 0.06)
    crop_red = img[y1_r:y2_r, x1_r:x2_r]
    crop_red_2x = cv2.resize(crop_red, (crop_red.shape[1]*2, crop_red.shape[0]*2), interpolation=cv2.INTER_CUBIC)
    res_r, _ = ocr(crop_red_2x) if ocr else (None, None)
    last_line_num = 0
    last_line_box = [x1_r, y1_r, x2_r - x1_r, y2_r - y1_r]
    if res_r:
        nums = []
        for b, t, s in res_r:
            clean_num = t.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('I', '1').replace('l', '1')
            if m := re.search(r'\b(\d+)\b', clean_num):
                try:
                    num_val = int(m.group(1))
                    bx1 = x1_r + int(b[0][0] / 2)
                    by1 = y1_r + int(b[0][1] / 2)
                    bw = int((b[1][0] - b[0][0]) / 2)
                    bh = int((b[2][1] - b[1][1]) / 2)
                    nums.append((by1, num_val, [bx1, by1, bw, bh]))
                except ValueError: pass
        if nums:
            nums.sort(key=lambda x: -x[0]) # bottom-most
            last_line_num = nums[0][1]
            last_line_box = nums[0][2]
    last_line_detected = last_line_num > 0
    print(f"6. Last Line: detected={last_line_detected}, line={last_line_num}, box={last_line_box}")

    all_passed = teams_detected and file_detected and edit_mode_active and dark_mode_active and first_line_detected and last_line_detected
    status = "teams markdown aligned" if all_passed else "teams markdown not aligned"
    print(f"--> OVERALL STATUS: {status}")

inspect_image('pixel_10_target48_verified.jpg')
inspect_image(r'C:\Users\aspfo\.gemini\antigravity-ide\brain\76241820-5f42-4aa4-886b-32fd1d02cac5\.user_uploaded\media_1790096143406.png')
