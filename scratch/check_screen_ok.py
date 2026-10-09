import cv2, sys
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
from ocr_engine import get_rapid_ocr
img = cv2.imread(r'C:\Users\aspfo\.gemini\antigravity-ide\brain\33d55930-a08d-4360-8053-0358827dc171\screen_ok.png')
ocr = get_rapid_ocr()
res, _ = ocr(img)
for bbox, text, score in sorted(res or [], key=lambda x: (min(pt[1] for pt in x[0]), min(pt[0] for pt in x[0]))):
    min_x = min(pt[0] for pt in bbox)
    min_y = min(pt[1] for pt in bbox)
    if min_y < 400:
        safe_text = text.encode('ascii', errors='replace').decode()
        print(f"x={int(min_x)}, y={int(min_y)}, text={safe_text}")
