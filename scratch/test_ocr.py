import sys
sys.path.insert(0, "server")
import cv2
from pathlib import Path
from services import state
from ocr_engine import get_rapid_ocr

calib = Path(state.FRAMES_DIR) / "dag_node2_home.png"
img = cv2.imread(str(calib))
ocr = get_rapid_ocr()
crop = img[108:648, 0:180]
cv2.imwrite("scratch/top_crop.png", crop)
results, _ = ocr(crop)
print("Crop results count:", len(results) if results else 0)
for box, txt, score in results or []:
    print(f"Crop OCR: '{txt}' at {box[0]}")
scaled = cv2.resize(crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
cv2.imwrite("scratch/top_crop_scaled.png", scaled)
results_scaled, _ = ocr(scaled)
print("Scaled results count:", len(results_scaled) if results_scaled else 0)
for box, txt, score in results_scaled or []:
    print(f"Scaled OCR: '{txt}' at {box[0]}")
