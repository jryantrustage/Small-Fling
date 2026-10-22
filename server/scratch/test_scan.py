import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from ocr_engine import worker_scan_image

img_path = str(Path(__file__).parent / "current_display2.png")
res = worker_scan_image(img_path)
print("Top line:", res.get("top_line"), "Bottom line:", res.get("bottom_line"))
for l in res.get("lines", []):
    print(f"Line {l['line_number']:>2}: {repr(l['text'])}")
