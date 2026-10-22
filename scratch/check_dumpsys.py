import sys, asyncio
sys.path.insert(0, 'server')
from services.adb_service import run_adb_shell, get_active_adb_serial
import re

async def check():
    ser = await get_active_adb_serial()
    res = await run_adb_shell("dumpsys activity tasks | grep -E 'Task\\{.*com\\.microsoft\\.teams'", ser)
    print("grep output:\n", res.get("stdout"))
    m_t = re.search(r'#(\d+)\s+type=', res.get("stdout", ""))
    if m_t:
        print("Matched tid:", m_t.group(1))

asyncio.run(check())
