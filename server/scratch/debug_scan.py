import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from ocr_engine import worker_scan_image

img_path = str(Path(__file__).parent / "current_display2.png")
res = worker_scan_image(img_path)
print("Top line:", res["top_line"])
print("Bottom line:", res["bottom_line"])
for l in res["lines"][:24]:
    print(f"Line {l['line_number']:>2}: {repr(l['text'])}")
