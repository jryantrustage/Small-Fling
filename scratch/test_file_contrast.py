import cv2
import sys
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr

ocr = get_rapid_ocr()
img = cv2.imread('pixel_10_target48_verified.jpg')

# y: 35..65, x: 15..350
crop_f = img[35:65, 15:350]
# Convert to grayscale
gray = cv2.cvtColor(crop_f, cv2.COLOR_BGR2GRAY)
# Normalize / contrast stretch
norm = cv2.normalize(gray, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
# Invert so black text on white background
inv = 255 - norm
# Scale 2x
inv_2x = cv2.resize(inv, (inv.shape[1]*2, inv.shape[0]*2), interpolation=cv2.INTER_CUBIC)
# cv2.imwrite('debug_inv_f.png', inv_2x)

res, _ = ocr(inv_2x)
print("Inverted + Normalized OCR:", res)

# Thresholding
_, thresh = cv2.threshold(norm, 100, 255, cv2.THRESH_BINARY)
thresh_2x = cv2.resize(thresh, (thresh.shape[1]*2, thresh.shape[0]*2), interpolation=cv2.INTER_CUBIC)
res_th, _ = ocr(thresh_2x)
print("Thresholded OCR:", res_th)
