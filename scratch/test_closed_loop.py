import asyncio, sys, cv2, numpy as np
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot,
    run_adb_shell, dismiss_keyboard
)
from ocr_engine import detect_top_line_from_image, find_gutter_numbers_cluster

async def adjust_viewport_to_target(target_top, ser, disp_id, max_attempts=8):
    print(f"\n=======================================================")
    print(f">>> Closed-Loop Adjustment: Target Top = Ln {target_top} <<<")
    print(f"=======================================================")

    for attempt in range(1, max_attempts + 1):
        # 1. Capture screen and run OCR to detect actual top line
        snap = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        actual_top, meta = detect_top_line_from_image(img, target_top=target_top)
        gutter = find_gutter_numbers_cluster(img)
        first_gutter = gutter[0][1] if gutter else actual_top
        last_gutter = gutter[-1][1] if gutter else 0

        print(f"Attempt {attempt}/{max_attempts}: actual_top={actual_top}, first_gutter={first_gutter}, last_gutter={last_gutter} (Target: {target_top})")

        # 2. Check if exact target top line is reached
        if actual_top == target_top or first_gutter == target_top:
            print(f"🎯 EXACT MATCH: Target top Line {target_top} confirmed on attempt {attempt}!")
            return True, target_top, attempt

        # 3. Calculate difference
        diff = target_top - actual_top
        if diff > 0:
            # Undershot: send DownArrow (keycode 20)
            # Clamp step to prevent over-flinging
            step = min(diff, 35)
            print(f"  [Undershot by {diff} lines] -> Dispatching {step} DownArrows (keycode 20)")
            keys = " ".join(["20"] * step)
            await run_adb_shell(f"input -d {disp_id} keyevent {keys}", ser)
        else:
            # Overshot: send UpArrow (keycode 19)
            diff_up = abs(diff)
            step = min(diff_up, 35)
            print(f"  [Overshot by {diff_up} lines] -> Dispatching {step} UpArrows (keycode 19)")
            keys = " ".join(["19"] * step)
            await run_adb_shell(f"input -d {disp_id} keyevent {keys}", ser)

        # Allow viewport to settle
        await asyncio.sleep(0.18)
        await dismiss_keyboard(ser, disp_id)

    # Final verification after loop
    snap = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    actual_top, _ = detect_top_line_from_image(img, target_top=target_top)
    gutter = find_gutter_numbers_cluster(img)
    first_gutter = gutter[0][1] if gutter else actual_top
    matched = (actual_top == target_top or first_gutter == target_top)
    final_top = target_top if matched else actual_top
    print(f"Loop finished: matched={matched}, final_top={final_top}")
    return matched, final_top, max_attempts

async def main():
    ser = await get_active_adb_serial()
    disp_id = await detect_external_display_id(ser, force_refresh=True)
    # Target top line is 27 (Page 1 was 1-26, so Page 2 MUST start at 27)
    target = 27
    matched, final_top, attempts = await adjust_viewport_to_target(target, ser, disp_id)
    print(f"\nFinal Result: matched={matched}, final_top={final_top}, attempts={attempts}")

asyncio.run(main())
