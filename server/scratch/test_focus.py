import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from services.adb_service import get_active_adb_serial, detect_external_display_id, run_adb_shell

async def check():
    serial = await get_active_adb_serial()
    disp = await detect_external_display_id(serial)
    res = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", serial)
    print("mCurrentFocus:", res.get("stdout"))

if __name__ == "__main__":
    asyncio.run(check())
