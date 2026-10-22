import sys, asyncio
sys.path.insert(0, 'server')
from services.adb_service import run_adb_shell, get_active_adb_serial, capture_external_screenshot
import cv2, numpy as np

async def tap_editor():
    ser = await get_active_adb_serial()
    print('Tapping editor at 200 400 on display 2...')
    await run_adb_shell('input -d 2 tap 200 400', ser)
    await asyncio.sleep(0.5)
    snap = await capture_external_screenshot(ser, bypass_lock=True)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    cv2.imwrite('scratch/after_tap_editor.png', img)
    win = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", ser)
    print("Focus:\n", win.get("stdout"))

asyncio.run(tap_editor())
