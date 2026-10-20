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

    # Capture before
    out_dir = Path("c:/Projects/Small-Fling/scratch")
    out_dir.mkdir(parents=True, exist_ok=True)

    snap_before = await adb_service.capture_external_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True)
    if snap_before:
        with open(out_dir / "before_ctrl_home.png", "wb") as f:
            f.write(snap_before)
        dpi_factor, _ = await adb_service.fetch_current_display_dpi_factor(ser, disp_id)
        is_v, ln = await state.verify_first_line_in_process(out_dir / "before_ctrl_home.png", dpi_factor=dpi_factor)
        top_ln = await state.detect_top_line_in_process(out_dir / "before_ctrl_home.png", dpi_factor=dpi_factor)
        print(f"BEFORE: verify_first_line={is_v}, detected_first={ln}, top_line={top_ln}")

    # Let's tap on FilePreviewActivity edit text area or Neutral title
    # First test: what does sending hid keycombination 113 122 do?
    print("Sending send_hid_keycombination(113, 122)...")
    await adb_service.send_hid_keycombination(113, 122, serial=ser, caller_node="test")
    await asyncio.sleep(1.0)

    snap_after = await adb_service.capture_external_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True)
    if snap_after:
        with open(out_dir / "after_ctrl_home.png", "wb") as f:
            f.write(snap_after)
        is_v2, ln2 = await state.verify_first_line_in_process(out_dir / "after_ctrl_home.png", dpi_factor=dpi_factor)
        top_ln2 = await state.detect_top_line_in_process(out_dir / "after_ctrl_home.png", dpi_factor=dpi_factor)
        print(f"AFTER 1: verify_first_line={is_v2}, detected_first={ln2}, top_line={top_ln2}")

asyncio.run(main())
