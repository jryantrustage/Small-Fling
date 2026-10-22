import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import asyncio
from services.adb_service import run_adb_shell, get_active_adb_serial
from services.ui_automator_service import dump_ui_hierarchy
from ocr_engine import find_gutter_numbers_cluster
from services.adb_service import capture_external_screenshot
import cv2, numpy as np

async def test_page2():
    ser = await get_active_adb_serial()
    # First go home
    await run_adb_shell("input -d 2 tap 500 500", ser)
    await asyncio.sleep(0.2)
    await run_adb_shell("input -d 2 keycombination 113 122", ser)
    await asyncio.sleep(0.5)

    # Scroll down 45 arrows to move to page 2 (target top line 25)
    print("Stepping down 45 down arrows...")
    await run_adb_shell("input -d 2 keyevent " + " ".join(["20"] * 45), ser)
    await asyncio.sleep(1.0)

    snap = await capture_external_screenshot(max_cache_age_s=0.0, bypass_lock=True)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    gutter = find_gutter_numbers_cluster(img)
    top_g = gutter[0][1] if gutter else None
    bot_g = gutter[-1][1] if gutter else None
    print(f"Visual gutter bounds: Top={top_g}, Bottom={bot_g}")

    root = await dump_ui_hierarchy(ser)
    if root is not None:
        for node in root.iter("node"):
            if "EditText" in node.attrib.get("class", ""):
                txt = node.attrib.get("text", "")
                lines = txt.splitlines()
                print(f"Total EditText lines: {len(lines)}")
                for i, l in enumerate(lines[:15]):
                    print(f"  buf[{i}]: {repr(l[:80])}")

if __name__ == "__main__":
    asyncio.run(test_page2())
