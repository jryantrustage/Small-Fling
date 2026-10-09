import asyncio, sys, cv2, numpy as np
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
sys.path.insert(0, r'c:\Projects\Small-Fling')
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot,
    run_adb_shell, dismiss_keyboard
)
from scratch.test_arrows import find_real_gutter

async def test_up():
    ser = await get_active_adb_serial()
    disp_id = await detect_external_display_id(ser)
    print("Sending 20 UpArrows...")
    keys_up = " ".join(["19"] * 20)
    await run_adb_shell(f"input -d {disp_id} keyevent {keys_up}", ser)
    await asyncio.sleep(0.3)
    await dismiss_keyboard(ser, disp_id)

    snap = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    g = find_real_gutter(img)
    print(f"Gutter after 20 Up: {[n for _, n in g]}")

asyncio.run(test_up())
