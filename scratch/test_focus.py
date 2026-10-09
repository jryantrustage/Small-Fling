import asyncio, sys, cv2, numpy as np
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
sys.path.insert(0, r'c:\Projects\Small-Fling')
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot,
    run_adb_shell, dismiss_keyboard
)
from scratch.test_arrows import find_real_gutter


async def test_focus_and_arrows():
    ser = await get_active_adb_serial()
    disp_id = await detect_external_display_id(ser)
    print(f"Device: {ser}, Display: {disp_id}")

    # Tap editor body to ensure focus
    print("Tapping editor at 800, 450...")
    await run_adb_shell(f"input -d {disp_id} tap 800 450", ser)
    await asyncio.sleep(0.15)
    await dismiss_keyboard(ser, disp_id)
    await asyncio.sleep(0.15)

    # Initial snapshot
    snap0 = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
    img0 = cv2.imdecode(np.frombuffer(snap0, np.uint8), cv2.IMREAD_COLOR)
    g0 = find_real_gutter(img0)
    print(f"Gutter before: {[n for _, n in g0]}")

    # Send 25 DownArrows
    print("Sending 25 DownArrows...")
    keys = " ".join(["20"] * 25)
    await run_adb_shell(f"input -d {disp_id} keyevent {keys}", ser)
    await asyncio.sleep(0.3)
    await dismiss_keyboard(ser, disp_id)

    # After snapshot
    snap1 = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
    img1 = cv2.imdecode(np.frombuffer(snap1, np.uint8), cv2.IMREAD_COLOR)
    g1 = find_real_gutter(img1)
    print(f"Gutter after 25 Down: {[n for _, n in g1]}")

    # Send 10 UpArrows
    print("Sending 10 UpArrows...")
    keys_up = " ".join(["19"] * 10)
    await run_adb_shell(f"input -d {disp_id} keyevent {keys_up}", ser)
    await asyncio.sleep(0.3)
    await dismiss_keyboard(ser, disp_id)

    snap2 = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
    img2 = cv2.imdecode(np.frombuffer(snap2, np.uint8), cv2.IMREAD_COLOR)
    g2 = find_real_gutter(img2)
    print(f"Gutter after 10 Up: {[n for _, n in g2]}")

asyncio.run(test_focus_and_arrows())
