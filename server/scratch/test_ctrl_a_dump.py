import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from services.adb_service import run_adb_shell
import xml.etree.ElementTree as ET

async def test():
    # Tap editor to focus
    await run_adb_shell("am task focus 101; input -d 2 tap 250 360")
    # Send Ctrl+A
    await run_adb_shell("input -d 2 keycombination -t 150 113 29")
    await asyncio.sleep(0.5)

    # Dump UI
    await run_adb_shell("uiautomator dump /data/local/tmp/dump_ctrl_a.xml")
    res = await run_adb_shell("cat /data/local/tmp/dump_ctrl_a.xml")
    xml_str = res.get("stdout", "")
    try:
        root = ET.fromstring(xml_str)
        for elem in root.iter("node"):
            if "EditText" in elem.attrib.get("class", ""):
                text = elem.attrib.get("text", "")
                lines = text.splitlines()
                print(f"After Ctrl+A: EditText has {len(lines)} lines, {len(text)} chars.")
                if lines:
                    print("First 3 lines:\n", lines[:3])
                    print("Last 3 lines:\n", lines[-3:])
    except Exception as e:
        print("Error:", e)

    # Click to deselect
    await run_adb_shell("input -d 2 tap 250 360")

if __name__ == "__main__":
    asyncio.run(test())
