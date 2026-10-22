import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import asyncio
from dag_nodes.executor import dag_graph_executor
from dag_nodes.base import DagBlackboard
from services import state
from services.adb_service import get_active_adb_serial, detect_external_display_id

async def run_reproduction(max_pages: int = 15):
    print("==================================================")
    print("STARTING AUTOMATED FULL MARKDOWN REPRODUCTION")
    print("==================================================")

    ser = await get_active_adb_serial()
    disp_id = await detect_external_display_id(ser)
    bb = DagBlackboard(active_serial=ser, display_id=disp_id)

    # 1. Reset to Home (Line 1)
    print("\n[Step 1] Navigating to Line 1 (Home)...")
    res_home = await dag_graph_executor.run_single_node("reset_home", bb)
    print(f"Home verification: {res_home.status} - {res_home.message}")

    page = 1
    state.document_lines.clear()

    while page <= max_pages:
        print(f"\n--- [PAGE {page}] ---")

        # Node 3: Acquire Frame
        res3 = await dag_graph_executor.run_single_node("frame_acquire", bb)
        print(f"Node 3 (Capture): status={res3.status}, page={res3.data.get('page')}, lines={res3.top_line}..{res3.bottom_line}")

        # Node 5: Extract Lines (OCR + Accessibility Buffer)
        res5 = await dag_graph_executor.run_single_node("frame_ocr", bb)
        print(f"Node 5 (Extract): status={res5.status}, top={res5.top_line}, bot={res5.bottom_line}")
        print(f"Total lines in master document so far: {len(state.document_lines)}")

        # Node 8: Document Assemble
        res8 = await dag_graph_executor.run_single_node("document_assemble", bb)
        print(f"Node 8 (Assemble): {res8.message}")

        if res8.is_complete:
            print("Document 100% complete!")
            break

        # Node 6: Step Down
        res6 = await dag_graph_executor.run_single_node("arrow_down", bb)
        print(f"Node 6 (Arrow Down): status={res6.status}, msg={res6.message}")
        if res6.status == "error":
            print(f"Navigation error: {res6.error}. Stopping loop.")
            break

        # Node 7: Verification Trigger
        res7 = await dag_graph_executor.run_single_node("verification_trigger", bb)
        print(f"Node 7 (Verify): status={res7.status}, msg={res7.message}")
        if res7.status != "success":
            print(f"Verification halted: {res7.message}")
            break

        page += 1

    # Final Document Assemble
    res_final = await dag_graph_executor.run_single_node("document_assemble", bb)
    out_file = Path("c:/Projects/Small-Fling/storage/reproduced_Matrix_main.md")
    if out_file.exists():
        content = out_file.read_text(encoding="utf-8")
        lines = content.splitlines()
        print("\n==================================================")
        print("REPRODUCTION SUMMARY")
        print("==================================================")
        print(f"Output File: {out_file}")
        print(f"File Size: {out_file.stat().st_size} bytes")
        print(f"Total Reconstructed Lines: {len(lines)}")
        print("\nFirst 15 lines of reproduced file:")
        for i, l in enumerate(lines[:15]):
            print(f"  {i+1:>3}: {l}")
        print("\nLast 10 lines of reproduced file:")
        for i, l in enumerate(lines[-10:]):
            print(f"  {len(lines)-10+i+1:>3}: {l}")

if __name__ == "__main__":
    asyncio.run(run_reproduction(max_pages=5))
