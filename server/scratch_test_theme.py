import asyncio, cv2, numpy as np
from services.adb_service import run_adb_shell, capture_external_screenshot
from ocr_engine import get_rapid_ocr

async def main():
    ser = "adb-39101FDJG00142-D6sgkp._adb-tls-connect._tcp"
    disp_id = 9
    
    # 1. Tap theme anchor at 1877, 149
    print("Tapping theme anchor at (1877, 149)...")
    await run_adb_shell(f"input -d {disp_id} tap 1877 149", ser)
    await asyncio.sleep(0.4)
    
    # 2. Capture screenshot of opened menu
    snap = await capture_external_screenshot(ser, max_cache_age_s=0.0)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    cv2.imwrite("dropdown_test.png", img)
    print("Saved dropdown_test.png")
    
    # 3. Run OCR on upper right area (y: 100..400, x: 1500..1920)
    crop = img[100:450, 1500:1920]
    cv2.imwrite("dropdown_crop.png", crop)
    ocr = get_rapid_ocr()
    res, _ = ocr(crop)
    if res:
        for b, txt, s in res:
            pts = np.array(b)
            cx = 1500 + int(pts[:, 0].mean())
            cy = 100 + int(pts[:, 1].mean())
            print(f"Detected: '{txt}' at center ({cx}, {cy})")
    else:
        print("No text in dropdown crop")

if __name__ == "__main__":
    asyncio.run(main())
