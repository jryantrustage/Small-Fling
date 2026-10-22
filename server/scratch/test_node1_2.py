import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from dag_nodes.executor import dag_graph_executor
from dag_nodes.base import DagBlackboard

async def test_nodes():
    print("--- Testing Node 1 (init_end) ---")
    bb = DagBlackboard()
    res1 = await dag_graph_executor.run_single_node("init_end", bb)
    print(f"Node 1 Status: {res1.status}, Total Lines: {res1.total_lines}")

    print("\n--- Testing Node 2 (reset_home) ---")
    res2 = await dag_graph_executor.run_single_node("reset_home", bb)
    print(f"Node 2 Status: {res2.status}")

if __name__ == "__main__":
    asyncio.run(test_nodes())
