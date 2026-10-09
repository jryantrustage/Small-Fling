import asyncio, sys, cv2, numpy as np
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot,
    run_adb_shell, dismiss_keyboard
)
from ocr_engine import detect_top_line_from_image, find_gutter_numbers_cluster

async def test_scroll():
    ser = await get_active_adb_serial()
    disp_id = await detect_external_display_id(ser, force_refresh=True)
    print(f"Serial: {ser}, Display ID: {disp_id}")

    # Capture initial screen
    snap = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    top1, meta1 = detect_top_line_from_image(img)
    g1 = find_gutter_numbers_cluster(img)
    print(f"Initial: top={top1}, bottom={g1[-1][1] if g1 else 0}, gutter_count={len(g1) if g1 else 0}")

    # Ensure editor has focus by tapping middle of editor
    print("Tapping editor to ensure focus...")
    await run_adb_shell(f"input -d {disp_id} tap 800 450", ser)
    await asyncio.sleep(0.15)
    await dismiss_keyboard(ser, disp_id)
    await asyncio.sleep(0.15)

    # Let's send 10 down arrows and see what happens to the top line and caret
    print("Sending 10 down arrows...")
    keys = " ".join(["20"] * 10)
    await run_adb_shell(f"input -d {disp_id} keyevent {keys}", ser)
    await asyncio.sleep(0.25)

    snap = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    top2, meta2 = detect_top_line_from_image(img)
    g2 = find_gutter_numbers_cluster(img)
    print(f"After 10 down: top={top2}, bottom={g2[-1][1] if g2 else 0}, first_gutter={g2[0][1] if g2 else 0}")
    print(f"Meta: {meta2.get('caret')}")

asyncio.run(test_scroll())
