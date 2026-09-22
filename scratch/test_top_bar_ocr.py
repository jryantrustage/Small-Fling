import sys
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr
import cv2

ocr = get_rapid_ocr()
im = cv2.imread('pixel_10_target48_verified.jpg')
h, w, _ = im.shape

# Let's inspect the top bar (y: 0 to 120)
top_bar = im[0:120, :]
res, _ = ocr(top_bar)
print(f"Top bar OCR results (w={w}, h=120):")
if res:
    for bbox, text, score in res:
        print(f"  [{text}] (score {score}) at bbox: {bbox}")
else:
    print("  None")
