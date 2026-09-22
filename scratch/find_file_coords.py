import sys
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr
import cv2

ocr = get_rapid_ocr()
im = cv2.imread('pixel_10_target48_verified.jpg')

# Let's search in horizontal bands:
# Band 1: y=20 to y=60
# Band 2: y=40 to y=80
# Band 3: y=60 to y=110
for i, (y1, y2) in enumerate([(20, 60), (40, 80), (60, 110), (10, 50)]):
    band = im[y1:y2, 0:800]
    res, _ = ocr(band)
    print(f"Band y={y1}..{y2}:")
    if res:
        for b, t, s in res:
            print(f"   [{t}] at local {b}")
