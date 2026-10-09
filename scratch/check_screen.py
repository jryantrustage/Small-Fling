import cv2, sys, numpy as np
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
from ocr_engine import get_rapid_ocr

img = cv2.imread(r'c:\Projects\Small-Fling\captured_snap.png')
ocr = get_rapid_ocr()
res, _ = ocr(img)
for bbox, text, score in sorted(res or [], key=lambda x: (min(pt[1] for pt in x[0]), min(pt[0] for pt in x[0]))):
    min_x = min(pt[0] for pt in bbox)
    min_y = min(pt[1] for pt in bbox)
    print(f"x={int(min_x)}, y={int(min_y)}, text={text}")

