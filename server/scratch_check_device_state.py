import asyncio
from services.adb_service import run_adb_shell, get_active_adb_serial, detect_external_display_id, capture_external_screenshot

async def main():
    ser = await get_active_adb_serial()
    disp_id = await detect_external_display_id(ser)
    print(f"Serial: {ser}, Display: {disp_id}")
    
    # 1. Window focus & ANRs
    w = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", ser)
    print("Focus:", w.get("stdout", "").strip())
    
    anr = await run_adb_shell("dumpsys activity processes | grep -E 'ANR in com.microsoft.teams' -A 3 -B 1 | head -n 20", ser)
    print("ANR Info:", anr.get("stdout", "").strip())
    
    # 2. Check for dialogs or overlays
    dlg = await run_adb_shell("dumpsys window windows | grep -iE 'dialog|alert|error|anr|not responding'", ser)
    print("Dialogs:", dlg.get("stdout", "").strip())
    
    # 3. Check current top activity
    top = await run_adb_shell("dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity'", ser)
    print("Top Activity:", top.get("stdout", "").strip())

if __name__ == "__main__":
    asyncio.run(main())
