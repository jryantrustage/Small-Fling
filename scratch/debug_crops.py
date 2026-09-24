import cv2
import sys
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr

ocr = get_rapid_ocr()
img = cv2.imread('pixel_10_target48_verified.jpg')
h, w, _ = img.shape

# Let's inspect crop_file_2x
y1_f, y2_f = int(h * 0.04), int(h * 0.12)
x1_f, x2_f = int(w * 0.03), int(w * 0.45)
crop_file = img[y1_f:y2_f, x1_f:x2_f]
# cv2.imwrite('debug_crop_file.png', crop_file)
crop_file_2x = cv2.resize(crop_file, (crop_file.shape[1]*2, crop_file.shape[0]*2), interpolation=cv2.INTER_CUBIC)
res_f, _ = ocr(crop_file_2x)
print("crop_file_2x OCR:")
if res_f:
    for b, t, s in res_f:
        print(f"  text: '{t}', score: {s}")
else:
    print("  None")

# Let's inspect crop_green_2x
y1_g, y2_g = int(h * 0.11), int(h * 0.22)
x1_g, x2_g = 0, int(w * 0.06)
crop_green = img[y1_g:y2_g, x1_g:x2_g]
# cv2.imwrite('debug_crop_green.png', crop_green)
crop_green_2x = cv2.resize(crop_green, (crop_green.shape[1]*2, crop_green.shape[0]*2), interpolation=cv2.INTER_CUBIC)
res_g, _ = ocr(crop_green_2x)
print("crop_green_2x OCR:")
if res_g:
    for b, t, s in res_g:
        print(f"  text: '{t}', score: {s}")
else:
    print("  None")
