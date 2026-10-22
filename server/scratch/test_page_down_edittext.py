import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from services.adb_service import run_adb_shell, capture_external_screenshot, dismiss_keyboard
from ocr_engine import find_gutter_numbers_cluster
import xml.etree.ElementTree as ET
import cv2
import numpy as np

async def dump_edittext():
    await run_adb_shell("uiautomator dump /data/local/tmp/dump_p.xml")
    res = await run_adb_shell("cat /data/local/tmp/dump_p.xml")
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

    lines_p1 = await dump_edittext()
    print(f"Page 1: {len(lines_p1)} lines. Top line: {repr(lines_p1[0] if lines_p1 else '')}")

    # Move cursor down 100 lines (100 Down Arrows)
    print("\n2. Sending 100 Down Arrows...")
    cmd = " ; ".join(["input -d 2 keyevent 20" for _ in range(100)])
    await run_adb_shell(cmd)
    await asyncio.sleep(1.0)
    await dismiss_keyboard(display_id=2)

    # Check gutter on screen
    snap = await capture_external_screenshot(max_cache_age_s=0.0)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    cluster = find_gutter_numbers_cluster(img)
    print(f"After 100 Down: Gutter numbers: {[c[1] for c in cluster[:5]]} ... {[c[1] for c in cluster[-3:]] if cluster else []}")

    lines_p2 = await dump_edittext()
    print(f"After 100 Down: {len(lines_p2)} lines.")
    if lines_p2:
        print(f"First line: {repr(lines_p2[0])}")
        print(f"Second line: {repr(lines_p2[1])}")
        print(f"Last line: {repr(lines_p2[-1])}")

    # Reset back to line 1
    await run_adb_shell("am task focus 101; input -d 2 keycombination -t 150 113 122")

if __name__ == "__main__":
    asyncio.run(test())
