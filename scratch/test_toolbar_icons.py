import cv2
import numpy as np

im = cv2.imread('pixel_10_target48_verified.jpg')
h, w, _ = im.shape

# Top right toolbar area: y: 60..120, x: 1150..1280
toolbar = im[60:120, 1150:1280] if im is not None else np.zeros((60, 130, 3), dtype=np.uint8)

# In debug_toolbar, let's look for the pencil button (often blue background or icon)
# and the moon/settings button
# Let's inspect brightness and colors:
# Dark mode check: editor body background luminance
body_sample = im[200:300, 200:300]
mean_lum = np.mean(cv2.cvtColor(body_sample, cv2.COLOR_BGR2GRAY))
print(f"Editor background luminance: {mean_lum:.1f} (Dark mode is typically < 50)")

# Blue edit mode button in toolbar:
hsv_tb = cv2.cvtColor(toolbar, cv2.COLOR_BGR2HSV)
blue_mask = cv2.inRange(hsv_tb, np.array([100, 100, 100]), np.array([135, 255, 255]))
blue_pts = np.argwhere(blue_mask)
print(f"Blue button points in toolbar: {len(blue_pts)}")
if len(blue_pts) > 30:
    y_min, x_min = blue_pts.min(axis=0)
    y_max, x_max = blue_pts.max(axis=0)
    print(f"Blue button relative box: x={x_min}, y={y_min}, w={x_max-x_min}, h={y_max-y_min}")
    print(f"Blue button absolute box: x={1150+x_min}, y={60+y_min}, w={x_max-x_min}, h={y_max-y_min}")
