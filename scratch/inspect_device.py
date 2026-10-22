import sys, asyncio, os
sys.path.insert(0, 'server')
from services.adb_service import run_adb_shell, get_active_adb_serial, detect_external_display_id, capture_external_screenshot
import cv2, numpy as np

async def inspect():
    ser = await get_active_adb_serial()
    print('Active serial:', ser)
    disp_id = await detect_external_display_id(ser)
    print('External display id:', disp_id)
    
    # Check focused window and top activities
    win = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", ser)
    print('Focus:\n', win.get('stdout', '').strip())
    
    # Check activities on display
    act = await run_adb_shell(f"dumpsys activity activities | grep -E 'Display #{disp_id}|Task|ActivityRecord'", ser)
    print('Activities on display:\n', act.get('stdout', '').strip()[:1000])

    snap = await capture_external_screenshot(ser, bypass_lock=True)
    if snap:
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        print('Screenshot shape:', img.shape)
        mean_bgr = np.mean(img, axis=(0,1))
        print('Mean BGR:', mean_bgr)
        h, w = img.shape[:2]
        center = img[int(h*0.2):int(h*0.8), int(w*0.2):int(w*0.8)]
        print('Center mean BGR:', np.mean(center, axis=(0,1)))
        os.makedirs('scratch', exist_ok=True)
        cv2.imwrite('scratch/current_device_screen.png', img)
        print('Saved scratch/current_device_screen.png')

asyncio.run(inspect())
