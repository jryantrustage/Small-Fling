import asyncio
import cv2
import numpy as np
from services import adb_service as adb
from alignment_engine import detect_teams_markdown_alignment
from ocr_engine import find_gutter_numbers_cluster

async def test_dpi(dpi):
    await adb.run_adb_shell(f'wm density {dpi} -d 7')
    await asyncio.sleep(1.0)
    snap = await adb.capture_external_screenshot(bypass_lock=True, max_cache_age_s=0.0)
    if not snap:
        print(f"No snapshot captured for DPI {dpi}")
        return
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    factor = dpi / 160.0
    gutter = find_gutter_numbers_cluster(img, dpi_factor=factor)
    align = detect_teams_markdown_alignment(img, dpi_factor=factor)
    print(f"\n--- Results for DPI {dpi} (factor {factor:.2f}) ---")
    print(f"Gutter lines count: {len(gutter)}")
    if gutter:
        print(f"First gutter line: {gutter[0]}, Last gutter line: {gutter[-1]}")
    print(f"Is aligned: {align.get('is_aligned')}")
    print(f"Alignment status: {align.get('status')}")
    print(f"Boxes keys: {list(align.get('boxes', {}).keys()) if isinstance(align.get('boxes'), dict) else len(align.get('boxes', []))}")
    if isinstance(align.get('boxes'), dict):
        for k, v in align['boxes'].items():
            print(f"  Box {k}: status={v.get('status')}, bounds={v.get('box')}")

async def main():
    for d in [160, 180, 200, 220]:
        await test_dpi(d)

if __name__ == "__main__":
    asyncio.run(main())
