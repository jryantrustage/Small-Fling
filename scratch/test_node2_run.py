import sys
import asyncio
sys.path.extend(['c:/Projects/Small-Fling/server', 'c:/Projects/Small-Fling/server/services', 'c:/Projects/Small-Fling/server/core'])
import adb_service
from routers.orchestration import run_single_dag_node

async def t():
    try:
        ser = await adb_service.get_active_adb_serial()
        print('Sending Ctrl+End to move away from line 1...')
        await adb_service.send_hid_keycombination(113, 123, serial=ser)
        await asyncio.sleep(1.0)
        print('Calling run_single_dag_node("reset_home")...')
        res = await run_single_dag_node('reset_home', {'skip_env_heal': True})
        print(f"Result status: {res.get('status')}")
        print(f"Result verified: {res.get('verified')}")
        print(f"Result first_line: {res.get('first_line')}")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(t())
