import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import asyncio
from services.adb_service import run_adb_shell, get_active_adb_serial
from services.ui_automator_service import dump_ui_hierarchy

async def test_deep_scroll():
    ser = await get_active_adb_serial()
    # Click inside editor to unselect
    await run_adb_shell("input -d 2 keyevent 20", ser)
    await asyncio.sleep(0.2)
    # Send PageDown 5 times (keycode 93)
    print("Sending PageDown x 5...")
    await run_adb_shell("input -d 2 keyevent 93 93 93 93 93", ser)
    await asyncio.sleep(1.0)
    root = await dump_ui_hierarchy(ser)
    if root is not None:
        for node in root.iter("node"):
            if "EditText" in node.attrib.get("class", ""):
                txt = node.attrib.get("text", "")
                lines = txt.splitlines()
                print(f"Total buffer lines: {len(lines)}")
                print(f"First 5 lines: {lines[:5]}")
                print(f"Last 5 lines: {lines[-5:]}")

if __name__ == "__main__":
    asyncio.run(test_deep_scroll())
