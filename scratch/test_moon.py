import cv2
import numpy as np

img = cv2.imread('pixel_10_target48_verified.jpg')
moon_crop = img[60:110, 1230:1275]
# cv2.imwrite('debug_moon.png', moon_crop)

# Let's inspect the moon icon
gray = cv2.cvtColor(moon_crop, cv2.COLOR_BGR2GRAY)
# Moon icon is white/light gray pixels on dark background
white_pts = np.argwhere(gray > 160)
print("Moon crop white points:", len(white_pts))
if len(white_pts) > 10:
    min_y, min_x = white_pts.min(axis=0)
    max_y, max_x = white_pts.max(axis=0)
    print(f"Moon icon box: x={1230+min_x}, y={60+min_y}, w={max_x-min_x}, h={max_y-min_y}")
