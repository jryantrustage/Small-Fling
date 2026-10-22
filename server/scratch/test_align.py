import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import asyncio, re
from services.adb_service import get_active_adb_serial, capture_external_screenshot
from services.ui_automator_service import dump_ui_hierarchy
from ocr_engine import worker_scan_image

def clean_for_match(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", s).lower()

async def test_align():
    ser = await get_active_adb_serial()
    snap = await capture_external_screenshot(max_cache_age_s=0.0, bypass_lock=True)
    temp_p = Path("scratch/align_test.png")
    temp_p.write_bytes(snap)

    aux = worker_scan_image(str(temp_p))
    top_ln = aux.get("top_line", 1)
    bot_ln = aux.get("bottom_line", 24)
    ocr_lines = aux.get("lines", [])
    print(f"OCR bounds: Top={top_ln}, Bot={bot_ln}")

    root = await dump_ui_hierarchy(ser)
    ui_buffer_text = ""
    for node in root.iter("node"):
        if "EditText" in node.attrib.get("class", ""):
            ui_buffer_text = node.attrib.get("text", "")
            break
    ui_lines = ui_buffer_text.splitlines()
    print(f"UI buffer lines: {len(ui_lines)}")

    # Find offset between ui_lines index and line_number
    # Candidate matches
    candidates = []
    for ol in ocr_lines:
        g_ln = ol["line_number"]
        txt = ol.get("text", "").strip()
        c_txt = clean_for_match(txt)
        if len(c_txt) >= 4:
            for idx, uil in enumerate(ui_lines):
                c_uil = clean_for_match(uil)
                if c_txt in c_uil or c_uil in c_txt:
                    offset = idx - g_ln
                    candidates.append(offset)

    if candidates:
        from collections import Counter
        best_offset, count = Counter(candidates).most_common(1)[0]
        print(f"Best offset found: {best_offset} (votes: {count})")
        for ol in ocr_lines:
            g_ln = ol["line_number"]
            target_idx = g_ln + best_offset
            if 0 <= target_idx < len(ui_lines):
                perfect_text = ui_lines[target_idx]
                print(f"Line {g_ln:>3}: {repr(perfect_text[:60])}")
            else:
                print(f"Line {g_ln:>3}: [FALLBACK OCR] {repr(ol.get('text',''))}")
    else:
        print("No candidates matched")

if __name__ == "__main__":
    asyncio.run(test_align())
