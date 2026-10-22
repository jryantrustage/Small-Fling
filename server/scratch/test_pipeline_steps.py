import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from dag_nodes.executor import dag_graph_executor
from dag_nodes.base import DagBlackboard
from services import state

async def test_pipeline():
    bb = DagBlackboard()
    print("--- 1. Node 3 (frame_acquire) ---")
    res3 = await dag_graph_executor.run_single_node("frame_acquire", bb)
    print(f"Node 3: status={res3.status}, msg={res3.message}")

    print("\n--- 2. Node 5 (frame_ocr) ---")
    res5 = await dag_graph_executor.run_single_node("frame_ocr", bb)
    print(f"Node 5: status={res5.status}, top={res5.top_line}, bot={res5.bottom_line}")
    print(f"Extracted lines count in state: {len(state.document_lines)}")
    for ln in sorted(state.document_lines.keys())[:25]:
        val = state.document_lines[ln]
        txt = val.get("text") if isinstance(val, dict) else (val.text if hasattr(val, "text") else str(val))
        print(f"Line {ln:>2}: {txt[:80]}")

    print("\n--- 3. Node 6 (arrow_down) ---")
    res6 = await dag_graph_executor.run_single_node("arrow_down", bb)
    print(f"Node 6: status={res6.status}, msg={res6.message}")

    print("\n--- 4. Node 7 (verification_trigger) ---")
    res7 = await dag_graph_executor.run_single_node("verification_trigger", bb)
    print(f"Node 7: status={res7.status}, msg={res7.message}")

    print("\n--- 5. Node 8 (document_assemble) ---")
    res8 = await dag_graph_executor.run_single_node("document_assemble", bb)
    print(f"Node 8: status={res8.status}, msg={res8.message}")

    # Check reproduced file
    out_file = Path("c:/Projects/Small-Fling/storage/reproduced_Matrix_main.md")
    if out_file.exists():
        print(f"\nReproduced file exists! Size: {out_file.stat().st_size} bytes")

    # Reset back to line 1
    await dag_graph_executor.run_single_node("reset_home", bb)

if __name__ == "__main__":
    asyncio.run(test_pipeline())
