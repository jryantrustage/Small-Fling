import asyncio
from services.adb_service import run_adb_shell

async def main():
    cmd = "logcat -d -t 200 | grep -E 'ActivityTaskManager|InputDispatcher|ANR in|am_anr|FilePreviewActivity' | tail -n 30"
    out = await run_adb_shell(cmd)
    print(out.get("stdout"))

if __name__ == "__main__":
    asyncio.run(main())
