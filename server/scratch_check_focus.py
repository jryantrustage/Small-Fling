import asyncio
from services.adb_service import run_adb_shell

async def main():
    print("Tapping on header at 200, 80 on display 9...")
    await run_adb_shell("input -d 9 tap 200 80")
    await asyncio.sleep(0.5)
    f = await run_adb_shell("dumpsys window displays | grep -E 'Display: |mCurrentFocus|mFocusedApp'")
    print(f.get("stdout"))

if __name__ == "__main__":
    asyncio.run(main())
