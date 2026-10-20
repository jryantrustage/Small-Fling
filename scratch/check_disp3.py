import sys
import asyncio
sys.path.extend(['.', 'services', 'core'])
import adb_service

async def main():
    ser = await adb_service.get_active_adb_serial()
    disp_id = await adb_service.detect_external_display_id(ser)
    print(f"Active serial: {ser}, Display ID: {disp_id}")
    
    # Check activities
    res = await adb_service.run_adb_shell("dumpsys activity activities", ser)
    lines = res.get("stdout", "").splitlines()
    in_disp3 = False
    for line in lines:
        if f"Display #{disp_id}" in line or f"displayId={disp_id}" in line:
            in_disp3 = True
            print("--- Found Display section ---")
        if in_disp3:
            if "Display #" in line and f"Display #{disp_id}" not in line:
                in_disp3 = False
            else:
                if any(k in line for k in ["ActivityRecord", "topResumedActivity", "mResumedActivity", "mFocusedApp", "mCurrentFocus", "Task{"]):
                    print(line.strip())

    # Also capture screen of display 3 and phone to see what's on them
    png_bytes = await adb_service.capture_external_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True)
    if png_bytes:
        with open("scratch/current_disp3.png", "wb") as f:
            f.write(png_bytes)
        print(f"Saved scratch/current_disp3.png ({len(png_bytes)} bytes)")

asyncio.run(main())
