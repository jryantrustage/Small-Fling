import sys, asyncio, os
sys.path.insert(0, 'server')
from services.adb_service import run_adb_shell, get_active_adb_serial, capture_external_screenshot
import cv2, numpy as np

async def test():
    ser = await get_active_adb_serial()
    # Check all tasks
    out = await run_adb_shell("dumpsys activity activities | grep -E 'Task\\{[0-9a-fA-F]+ #[0-9]+.*FilePreviewActivity'", ser)
    print("Tasks:\n", out.get("stdout"))
    
    # Also find top task with FilePreviewActivity
    raw = await run_adb_shell("dumpsys activity activities", ser)
    import re
    matches = re.findall(r'Task\{[0-9a-fA-F]+\s+#(\d+)\b[^\}]*ActivityRecord\{[0-9a-fA-F]+\s+u0\s+com\.microsoft\.teams/[^\s]*FilePreviewActivity', raw.get("stdout", ""))
    print("Task IDs found:", matches)
    for tid in matches:
        print(f"Bringing task {tid} to front")
        await run_adb_shell(f"cmd activity task to-front {tid}", ser)
        break
        
    await asyncio.sleep(0.5)
    snap = await capture_external_screenshot(ser, bypass_lock=True)
    if snap:
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        cv2.imwrite("scratch/current_after_front.png", img)
        print("Saved scratch/current_after_front.png")
        
    win = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", ser)
    print("Focus:\n", win.get("stdout"))

asyncio.run(test())
