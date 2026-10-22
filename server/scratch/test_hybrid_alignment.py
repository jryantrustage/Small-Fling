import sys
import xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from ocr_engine import worker_scan_image

# 1. Run worker_scan_image on current screenshot
img_path = str(Path(__file__).parent / "current_display2.png")
aux = worker_scan_image(img_path)
top_ln = aux.get("top_line", 1)
bot_ln = aux.get("bottom_line", 24)
lines = aux.get("lines", [])

# 2. Parse current_ui.xml
xml_path = Path(__file__).parent.parent / "scratch" / "dump.xml"
if not xml_path.exists():
    xml_path = Path(__file__).parent / "current_ui.xml"

ui_lines = []
if xml_path.exists():
    tree = ET.parse(str(xml_path))
    for elem in tree.getroot().iter("node"):
        if "EditText" in elem.attrib.get("class", ""):
            ui_lines = elem.attrib.get("text", "").splitlines()
            break

print(f"Viewport Gutter: Lines {top_ln} to {bot_ln}")
print(f"UI buffer available lines: {len(ui_lines)}")

# 3. Align lines:
for gl in lines:
    ln = gl["line_number"]
    # If ln is in range of ui_lines
    if 1 <= ln <= len(ui_lines):
        ui_txt = ui_lines[ln - 1]
        print(f"Line {ln:>2} [GROUND TRUTH]: {repr(ui_txt)}")
    else:
        print(f"Line {ln:>2} [OCR FALLBACK ]: {repr(gl.get('text', ''))}")
