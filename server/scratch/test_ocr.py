import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from services.ocr_service import scan_image_with_minicpm

async def main():
    img_path = Path("scratch/live_cap.png")
    res = await scan_image_with_minicpm(img_path)
    print("Model used:", res.get("model_used"))
    print("Top line:", res.get("top_line"))
    print("Bottom line:", res.get("bottom_line"))
    print("Total lines extracted:", len(res.get("lines", [])))
    for line in res.get("lines", []):
        print(f"{line['line_number']}: {line['text']}")

if __name__ == "__main__":
    asyncio.run(main())
