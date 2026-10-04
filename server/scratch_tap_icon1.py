import asyncio, cv2
from services.adb_service import run_adb_shell, capture_external_screenshot

async def main():
    ser = "adb-39101FDJG00142-D6sgkp._adb-tls-connect._tcp"
    disp_id = 9
    print("Tapping Icon 1 at (1732, 82) on display 9...")
    await run_adb_shell(f"input -d {disp_id} tap 1732 82", ser)
    # Suppress soft keyboard immediately
    await run_adb_shell(f"settings put secure show_ime_with_hard_keyboard 0; input -d {disp_id} keyevent 111; input -d 0 keyevent 111", ser)
    await asyncio.sleep(0.5)
    
    snap = await capture_external_screenshot(ser, max_cache_age_s=0.0)
    img = cv2.imdecode(cv2.imdecode(snap, cv2.IMREAD_COLOR) if False else None, cv2.IMREAD_COLOR) if False else None
    with open("after_icon1_tap.png", "wb") as f:
        f.write(snap)
    print("Saved after_icon1_tap.png")

if __name__ == "__main__":
    asyncio.run(main())
