import cv2
import sys
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr

ocr = get_rapid_ocr()
img = cv2.imread('pixel_10_target48_verified.jpg')

# 1. file name crop: y: 35..65, x: 15..350
crop_f = img[35:65, 15:350]
res_f, _ = ocr(crop_f)
print("crop_f (1x):", res_f)
crop_f_2x = cv2.resize(crop_f, (crop_f.shape[1]*2, crop_f.shape[0]*2), interpolation=cv2.INTER_CUBIC)
res_f_2x, _ = ocr(crop_f_2x)
print("crop_f (2x):", res_f_2x)

# 2. green top line crop: y: 80..130, x: 10..45
crop_g = img[80:130, 10:45]
crop_g_2x = cv2.resize(crop_g, (crop_g.shape[1]*2, crop_g.shape[0]*2), interpolation=cv2.INTER_CUBIC)
res_g, _ = ocr(crop_g_2x)
print("crop_g (2x):", res_g)

# 3. red last line crop: y: 645..705, x: 10..45
crop_r = img[645:705, 10:45]
crop_r_2x = cv2.resize(crop_r, (crop_r.shape[1]*2, crop_r.shape[0]*2), interpolation=cv2.INTER_CUBIC)
res_r, _ = ocr(crop_r_2x)
print("crop_r (2x):", res_r)
