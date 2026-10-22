import cv2, sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ocr_engine import scan_image_with_rapidocr, detect_top_line_from_image, find_gutter_numbers_cluster

img = cv2.imread('screen_at_line1.png')
top, _ = detect_top_line_from_image(img)
g = find_gutter_numbers_cluster(img)
print(f'Top: {top}, Gutter count: {len(g)}, range: {g[0] if g else None} .. {g[-1] if g else None}')
res = scan_image_with_rapidocr('screen_at_line1.png')
lines = res.get('lines', [])
print(f'OCR detected {len(lines)} lines:')
for l in lines[:30]:
    print(f"  {l.get('line_number')}: {l.get('text')}")
