import sys
import asyncio
sys.path.extend(['c:/Projects/Small-Fling/server', 'c:/Projects/Small-Fling/server/services', 'c:/Projects/Small-Fling/server/core'])
import adb_service
from routers.orchestration import _execute_dag_group_capture_markdown_impl

async def t():
    try:
        ser = await adb_service.get_active_adb_serial()
        print(f"Active serial: {ser}")
        # Run single cycle of DAG 2
        print("Running _execute_dag_group_capture_markdown_impl()...")
        res = await _execute_dag_group_capture_markdown_impl(serial=ser)
        print("Result status:", res.get("status"))
        print("Nodes count:", len(res.get("nodes", [])))
        for n in res.get("nodes", []):
            print(f"  - Node {n.get('node_id')}: status={n.get('status')}, duration={n.get('duration_ms')}ms")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(t())
