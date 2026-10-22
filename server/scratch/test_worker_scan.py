import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from ocr_engine import worker_scan_image

img_path = str(Path(__file__).parent / "current_display2.png")
res = worker_scan_image(img_path)
print("Top line:", res.get("top_line"))
print("Bottom line:", res.get("bottom_line"))
print("Lines count:", len(res.get("lines", [])))
for l in res.get("lines", []):
    print(f"{l['line_number']:>3}: {repr(l.get('text', ''))}")
