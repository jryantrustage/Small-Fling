import asyncio, sys
sys.path.insert(0, 'server')
from services.adb_service import run_adb_shell, detect_external_display_id, capture_external_screenshot

async def check():
    ser = 'adb-39101FDJG00142-D6sgkp._adb-tls-connect._tcp'
    did = await detect_external_display_id(ser)
    top = await run_adb_shell("dumpsys activity activities | grep -E 'ResumedActivity|topResumedActivity'", ser)
    print(f"External display: {did}")
    print(f"Top activity:\n{top.get('stdout')}")
    snap = await capture_external_screenshot(ser, max_cache_age_s=0)
    if snap:
        with open('scratch/live_screen.png', 'wb') as f:
            f.write(snap)
        print(f"Saved scratch/live_screen.png ({len(snap)} bytes)")
    from ocr_engine import detect_top_line_from_image, find_gutter_numbers_cluster
    import cv2, numpy as np
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    top_line, meta = detect_top_line_from_image(img)
    gutters = find_gutter_numbers_cluster(img)
    print(f"Current detected top line: {top_line}")
    print(f"Current gutter lines: {[g[1] for g in gutters] if gutters else 'None'}")

if __name__ == '__main__':
    asyncio.run(check())
