import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio, cv2, numpy as np
from services.adb_service import capture_external_screenshot, get_active_adb_serial, detect_external_display_id, run_adb_shell
from ocr_engine import find_gutter_numbers_cluster

async def test():
    serial = await get_active_adb_serial()
    disp = await detect_external_display_id(serial)
    
    # 1. Before
    snap1 = await capture_external_screenshot(serial, max_cache_age_s=0)
    img1 = cv2.imdecode(np.frombuffer(snap1, np.uint8), cv2.IMREAD_COLOR)
    g1 = find_gutter_numbers_cluster(img1)
    t1 = g1[0][1] if g1 else None
    b1 = g1[-1][1] if g1 else None
    print(f"BEFORE: top={t1}, bottom={b1}")
    
    # 2. Send 25 down arrows
    keys = " ".join(["20"] * 25)
    print(f"Sending 25 down arrows to display {disp}...")
    res = await run_adb_shell(f"input -d {disp} keyevent {keys}", serial)
    print("Shell code:", res.get("code"))
    await asyncio.sleep(0.4)
    
    # 3. After
    snap2 = await capture_external_screenshot(serial, max_cache_age_s=0)
    img2 = cv2.imdecode(np.frombuffer(snap2, np.uint8), cv2.IMREAD_COLOR)
    g2 = find_gutter_numbers_cluster(img2)
    t2 = g2[0][1] if g2 else None
    b2 = g2[-1][1] if g2 else None
    print(f"AFTER: top={t2}, bottom={b2}")
    
    if t2 != t1:
        print(f"SUCCESS: Viewport moved from {t1} to {t2} (delta = {t2 - t1})!")
    else:
        print("STILL SAME: Viewport did not move.")

if __name__ == "__main__":
    asyncio.run(test())
