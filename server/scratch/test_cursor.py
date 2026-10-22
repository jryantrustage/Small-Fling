import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from services.adb_service import run_adb_shell, capture_external_screenshot, dismiss_keyboard
from ocr_engine import find_gutter_numbers_cluster
import xml.etree.ElementTree as ET
import cv2
import numpy as np

async def get_editor_lines():
    await run_adb_shell("uiautomator dump /data/local/tmp/ui_test.xml")
    res = await run_adb_shell("cat /data/local/tmp/ui_test.xml")
    xml_str = res.get("stdout", "")
    if not xml_str:
        return []
    try:
        root = ET.fromstring(xml_str)
        for elem in root.iter("node"):
            if "EditText" in elem.attrib.get("class", ""):
                text = elem.attrib.get("text", "")
                return text.splitlines()
    except Exception as e:
        print("XML error:", e)
    return []

async def test():
    print("1. Focusing editor and Ctrl+Home...")
    await run_adb_shell("am task focus 101; input -d 2 tap 250 360")
    await run_adb_shell("input -d 2 keycombination -t 150 113 122")
    await asyncio.sleep(0.5)
    await dismiss_keyboard(display_id=2)

    lines_start = await get_editor_lines()
    print(f"At Home: {len(lines_start)} lines in EditText.")
    if lines_start:
        print("First 2:", [lines_start[0], lines_start[1] if len(lines_start) > 1 else ''])
        print("Last 2:", [lines_start[-2] if len(lines_start) > 1 else '', lines_start[-1]])

    # Move down 50 lines
    print("\n2. Sending 50 Down Arrows...")
    cmd = " ; ".join(["input -d 2 keyevent 20" for _ in range(50)])
    await run_adb_shell(cmd)
    await asyncio.sleep(0.8)
    await dismiss_keyboard(display_id=2)

    # Check gutter
    snap = await capture_external_screenshot(max_cache_age_s=0.0)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    cluster = find_gutter_numbers_cluster(img)
    print(f"After 50 Down: Gutter numbers on screen: {[c[1] for c in cluster[:5]]} ... {[c[1] for c in cluster[-3:]] if cluster else []}")

    lines_50 = await get_editor_lines()
    print(f"After 50 Down: {len(lines_50)} lines in EditText.")
    if lines_50:
        print("First 2:", [lines_50[0], lines_50[1] if len(lines_50) > 1 else ''])
        print("Last 2:", [lines_50[-2] if len(lines_50) > 1 else '', lines_50[-1]])

    # Reset
    await run_adb_shell("am task focus 101; input -d 2 keycombination -t 150 113 122")

if __name__ == "__main__":
    asyncio.run(test())
