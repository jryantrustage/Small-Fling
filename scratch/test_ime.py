import asyncio, sys
sys.path.insert(0, 'server')
from services.adb_service import is_ime_visible, run_adb_shell

async def check():
    ser = 'adb-39101FDJG00142-D6sgkp._adb-tls-connect._tcp'
    v = await is_ime_visible(ser, force_check=True)
    print('is_ime_visible:', v)
    res = await run_adb_shell("dumpsys input_method", ser)
    for line in res.get('stdout', '').splitlines():
        if any(k in line for k in ['mInputShown', 'mImeWindowVis', 'mCurFocusedWindow']):
            print('  ', line.strip())

asyncio.run(check())
