import cv2
import numpy as np
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from ocr_engine import get_rapid_ocr

img = cv2.imread(str(Path(__file__).parent / "current_display2.png"))
h, w = img.shape[:2]
ocr = get_rapid_ocr()

# Line 1 is at y=300, pitch=27.0
# Content x is from 92 to 1080
pitch = 27.0
y0 = 300 # top of line 1
x1 = 92
x2 = 1080

print(f"Testing line-by-line slicing on {img.shape}:")
for ln in range(1, 25):
    line_y1 = int(y0 + (ln - 1) * pitch)
    line_y2 = int(line_y1 + pitch)
    
    # Slice
    slice_img = img[line_y1:line_y2, x1:x2]
    gray = cv2.cvtColor(slice_img, cv2.COLOR_BGR2GRAY)
    
    # Check if blank
    bright = np.argwhere(gray > 70)
    if len(bright) < 15:
        print(f"Line {ln:>2}: <BLANK>")
        continue
        
    first_x = np.min(bright[:, 1])
    
    # Run OCR on line slice
    # Resize 2x height for better OCR accuracy on single line
    h_s, w_s = slice_img.shape[:2]
    scaled = cv2.resize(slice_img, (w_s * 2, h_s * 2), interpolation=cv2.INTER_CUBIC)
    res, _ = ocr(scaled)
    text = ""
    if res:
        sorted_boxes = sorted(res, key=lambda r: float(np.min(np.array(r[0])[:, 0])))
        text = " ".join(r[1].strip() for r in sorted_boxes if r[1].strip())
        
    print(f"Line {ln:>2} (indent_px={first_x:>3}): {repr(text)}")
