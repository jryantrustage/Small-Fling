import sys, asyncio
sys.path.insert(0, 'server')
from pathlib import Path
from services.ocr_service import scan_image_with_minicpm

async def test_ocr():
    p = Path('scratch/after_real_pencil.png')
    res = await scan_image_with_minicpm(p, expected_top=1)
    print("Status:", res.get("status"))
    print("Top line:", res.get("top_line"), "Bottom line:", res.get("bottom_line"))
    print("Model used:", res.get("model_used"))
    lines = res.get("lines", [])
    print(f"Extracted {len(lines)} lines:")
    for l in lines[:25]:
        print(f"  {l.get('line_number')}: {l.get('text')}")

asyncio.run(test_ocr())
