import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from services.adb_service import capture_external_screenshot

async def main():
    snap = await capture_external_screenshot(max_cache_age_s=0.0)
    out_path = Path(__file__).parent / "current_display2.png"
    out_path.write_bytes(snap)
    print(f"Captured current Display 2: {len(snap)} bytes -> {out_path}")

if __name__ == "__main__":
    asyncio.run(main())
