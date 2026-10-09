import asyncio, sys, cv2, numpy as np
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
sys.path.insert(0, r'c:\Projects\Small-Fling')
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot,
    run_adb_shell, dismiss_keyboard
)
from ocr_engine import detect_top_line_from_image, find_gutter_numbers_cluster

async def test_align_to_25():
    ser = await get_active_adb_serial()
    disp_id = await detect_external_display_id(ser)
    target_top = 25

    print(f"Aligning to target_top={target_top} on display {disp_id}...")
    for step_num in range(1, 10):
        await asyncio.sleep(0.25)
        await dismiss_keyboard(ser, disp_id)
        snap = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        actual_top, meta = detect_top_line_from_image(img, target_top=target_top)
        gutter = find_gutter_numbers_cluster(img)
        first_g = gutter[0][1] if gutter else actual_top
        last_g = gutter[-1][1] if gutter else 0
        curr = actual_top if actual_top > 0 else first_g
        print(f"Step {step_num}: detected top={curr} (actual={actual_top}, first_g={first_g}, last_g={last_g}) -> target={target_top}")

        if curr == target_top:
            print(f"SUCCESS: Aligned to target {target_top} on step {step_num}!")
            return True

        if curr < target_top:
            diff = target_top - curr
            # Send diff down arrows
            cnt = min(diff, 10)
            print(f"  Undershot: sending {cnt} DownArrows")
            keys = " ".join(["20"] * cnt)
            await run_adb_shell(f"input -d {disp_id} keyevent {keys}", ser)
        else:
            diff = curr - target_top
            # Send diff up arrows
            cnt = min(diff, 10)
            print(f"  Overshot: sending {cnt} UpArrows")
            keys = " ".join(["19"] * cnt)
            await run_adb_shell(f"input -d {disp_id} keyevent {keys}", ser)

    print("FAILED to align within steps")
    return False

asyncio.run(test_align_to_25())
