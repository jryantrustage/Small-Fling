import cv2, sys
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
from ocr_engine import find_gutter_numbers_cluster

img = cv2.imread(r'c:\Projects\Small-Fling\captured_snap.png')
gutter = find_gutter_numbers_cluster(img)
print("Gutter:", gutter)
if gutter:
    y_first, ln_first = gutter[0]
    print(f"y_first={y_first}, ln_first={ln_first}")
