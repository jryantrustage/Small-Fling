import asyncio
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
from services import ocr_service as ocr_svc

async def run():
    img_path = Path("server/storage/frames/raw_capture_p001_20261009_050315_047.png")
    res = await ocr_svc.scan_image_with_minicpm(img_path, expected_top=1)
    print("Top:", res.get("top_line"), "Bot:", res.get("bottom_line"), "Lines count:", len(res.get("lines", [])))
    for l in res.get("lines", [])[:35]:
        print(f"{l['line_number']:2d}: {l['text']}")

if __name__ == "__main__":
    asyncio.run(run())
