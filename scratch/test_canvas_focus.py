import sys
import asyncio
from pathlib import Path
sys.path.extend(['.', 'services', 'core'])
import adb_service
from services import state

async def main():
    ser = await adb_service.get_active_adb_serial()
    disp_id = await adb_service.detect_external_display_id(ser)
    print(f"Serial: {ser}, Display: {disp_id}")

    out_dir = Path("c:/Projects/Small-Fling/scratch")

    disp_w, disp_h = await adb_service.get_display_dimensions(ser, disp_id)
    focus_x = min(disp_w // 3, 500) if disp_w > 0 else 500
    focus_y = min(disp_h // 2, 500) if disp_h > 0 else 500
    print(f"Tapping editor canvas at {focus_x}, {focus_y} on display {disp_id}...")
    await adb_service.run_adb_shell(f"input -d {disp_id} tap {focus_x} {focus_y}", ser)
    await asyncio.sleep(0.2)
    await adb_service.dismiss_keyboard(ser, disp_id)
    await asyncio.sleep(0.2)

    print("Sending send_hid_keycombination(113, 122)...")
    await adb_service.send_hid_keycombination(113, 122, serial=ser, caller_node="test_tap_canvas")
    await asyncio.sleep(1.2)

    snap = await adb_service.capture_external_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True)
    if snap:
        with open(out_dir / "after_tap_canvas_ctrl_home.png", "wb") as f:
            f.write(snap)
        dpi_factor, _ = await adb_service.fetch_current_display_dpi_factor(ser, disp_id)
        is_v, ln = await state.verify_first_line_in_process(out_dir / "after_tap_canvas_ctrl_home.png", dpi_factor=dpi_factor)
        top_ln = await state.detect_top_line_in_process(out_dir / "after_tap_canvas_ctrl_home.png", dpi_factor=dpi_factor)
        print(f"RESULT: verify_first_line={is_v}, detected_first={ln}, top_line={top_ln}")

asyncio.run(main())
