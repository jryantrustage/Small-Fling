import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import asyncio
from services.adb_service import run_adb_shell, get_active_adb_serial

async def main():
    ser = await get_active_adb_serial()
    # Let's inspect IClipboard methods using oatdump or grep on framework or dex
    cmd = 'CLASSPATH=/system/framework/framework.jar app_process /system/bin com.android.commands.am.Am'
    # Or let's inspect dumpsys clipboard or cmd
    res = await run_adb_shell("cmd clipboard", ser)
    print("cmd clipboard:", res)
    # Check if there is termux or python or any helper on device
    res2 = await run_adb_shell("which termux-clipboard-get", ser)
    print("termux-clipboard-get:", res2)

if __name__ == "__main__":
    asyncio.run(main())
