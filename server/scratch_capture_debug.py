import asyncio
from services.adb_service import capture_external_screenshot
from pathlib import Path

async def main():
    snap = await capture_external_screenshot(max_cache_age_s=0.0)
    if snap:
        out_p = Path("current_screen_debug.png")
        out_p.write_bytes(snap)
        print(f"Saved {len(snap)} bytes to {out_p.resolve()}")
    else:
        print("Failed to capture screenshot")

if __name__ == "__main__":
    asyncio.run(main())
