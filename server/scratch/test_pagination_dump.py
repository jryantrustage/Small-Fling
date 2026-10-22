import asyncio
import time
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.adb_service import run_adb_shell, capture_external_screenshot, dismiss_keyboard
from ocr_engine import find_gutter_numbers_cluster
import xml.etree.ElementTree as ET
import cv2
import numpy as np

async def get_editor_text():
    # Dump uiautomator
    await run_adb_shell("uiautomator dump /data/local/tmp/ui_dump.xml")
    res = await run_adb_shell("cat /data/local/tmp/ui_dump.xml")
    xml_str = res.get("stdout", "")
    if not xml_str:
        return ""
    try:
        root = ET.fromstring(xml_str)
        for elem in root.iter("node"):
            if "EditText" in elem.attrib.get("class", ""):
                return elem.attrib.get("text", "")
    except Exception as e:
        print("XML parse error:", e)
    return ""

async def main():
    print("1. Focusing editor and resetting to Home (Line 1)...")
    await run_adb_shell("am task focus 101; input -d 2 keycombination -t 150 113 122")
    await asyncio.sleep(1.0)
    await dismiss_keyboard(display_id=2)

    # Check Page 1
    snap1 = await capture_external_screenshot(max_cache_age_s=0.0)
    img1 = cv2.imdecode(np.frombuffer(snap1, np.uint8), cv2.IMREAD_COLOR)
    cluster1 = find_gutter_numbers_cluster(img1)
    text1 = await get_editor_text()
    lines1 = text1.splitlines()
    print(f"PAGE 1: Gutter says top line = {cluster1[0] if cluster1 else '?'}")
    print(f"PAGE 1: EditText has {len(lines1)} lines.")
    print(f"First 3 lines of Page 1:\n", lines1[:3])
    print(f"Last 3 lines of Page 1:\n", lines1[-3:])

    # Scroll down 24 lines (PageDown keycode 93 or 24 Down Arrows keycode 20)
    print("\n2. Scrolling down (PageDown keycode 93)...")
    await run_adb_shell("am task focus 101; input -d 2 keyevent 93")
    await asyncio.sleep(0.8)
    await dismiss_keyboard(display_id=2)

    # Check Page 2
    snap2 = await capture_external_screenshot(max_cache_age_s=0.0)
    img2 = cv2.imdecode(np.frombuffer(snap2, np.uint8), cv2.IMREAD_COLOR)
    cluster2 = find_gutter_numbers_cluster(img2)
    text2 = await get_editor_text()
    lines2 = text2.splitlines()
    print(f"\nPAGE 2: Gutter says top line = {cluster2[0] if cluster2 else '?'}")
    print(f"PAGE 2: EditText has {len(lines2)} lines.")
    print(f"First 3 lines of Page 2:\n", lines2[:3])
    print(f"Last 3 lines of Page 2:\n", lines2[-3:])

    # Reset back to home
    await run_adb_shell("am task focus 101; input -d 2 keycombination -t 150 113 122")

if __name__ == "__main__":
    asyncio.run(main())
