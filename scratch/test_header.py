import sys
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr
import cv2

ocr = get_rapid_ocr()
im = cv2.imread('pixel_10_target48_verified.jpg')

# Let's crop y=20..60, x=10..400
crop = im[20:60, 10:400]
# cv2.imwrite('debug_header.png', crop)
res, _ = ocr(crop) if crop.size > 0 else (None, None)
print("debug header results:")
if res:
    for b, t, s in res:
        print(f"  [{t}] score={s} at {b}")
