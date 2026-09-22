import sys
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr
import cv2

ocr = get_rapid_ocr()
im = cv2.imread('pixel_10_target48_verified.jpg')
h, w, _ = im.shape

regions = {
    "teams_logo": (10, 40, 15, 120),  # y1, y2, x1, x2
    "file_tab": (35, 75, 30, 450),
    "mode_toolbar": (65, 110, 1150, 1280),
    "first_line_gutter": (75, 130, 0, 50),
    "last_line_gutter": (640, 710, 0, 50),
}

for name, (y1, y2, x1, x2) in regions.items():
    crop = im[y1:y2, x1:x2]
    # upscale 2x
    crop_2x = cv2.resize(crop, (crop.shape[1]*2, crop.shape[0]*2), interpolation=cv2.INTER_CUBIC)
    res, _ = ocr(crop_2x)
    print(f"=== {name} ({x1},{y1} to {x2},{y2}) ===")
    if res:
        for b, t, s in res:
            print(f"  [{t}] (score: {s})")
    else:
        print("  no text")
