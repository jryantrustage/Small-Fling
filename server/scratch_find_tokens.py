import cv2
from ocr_engine import get_rapid_ocr

img = cv2.imread("live_now_debug.png")
ocr = get_rapid_ocr()
res, _ = ocr(img)
print(f"Total OCR tokens: {len(res or [])}")
for box, txt, score in (res or []):
    cx = int(sum(pt[0] for pt in box) / 4)
    cy = int(sum(pt[1] for pt in box) / 4)
    clean = txt.lower()
    if any(k in clean for k in ["edit", "pencil", "view", "read", "open", "mode", "format", "matrix"]):
        print(f"({cx}, {cy}): '{txt}'")
