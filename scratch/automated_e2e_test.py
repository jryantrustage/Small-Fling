import urllib.request, json, time, sys, os

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_URL = "http://localhost:8000"

def api_post(endpoint, payload=None, timeout=120):
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def api_get(endpoint, timeout=30):
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    print("=" * 70, flush=True)
    print("🚀 STARTING AUTOMATED END-TO-END PIPELINE VALIDATION TEST", flush=True)
    print("=" * 70, flush=True)

    # 1. Reset state to clean starting point
    print("\n[Step 1] Resetting system state...", flush=True)
    reset_res = api_post("/api/reset-state", {})
    print(f"Reset response: {reset_res.get('status')} - {reset_res.get('message')}", flush=True)

    # 2. Run DAG Group 1 (Initialize)
    print("\n[Step 2] Executing DAG 1 (Initialize: EOF Calibration & Return to Line 1)...", flush=True)
    try:
        init_res = api_post("/api/dag/groups/initialize/run", {}, timeout=90)
        print(f"DAG 1 Result: Status={init_res.get('status')}", flush=True)
        if init_res.get("status") != "success":
            print(f"❌ DAG 1 Failed: {init_res.get('error') or init_res}", flush=True)
            return False, "DAG 1 Initialization Failed"
        print(f"✔ DAG 1 Complete: Total lines calibrated = {init_res.get('total_lines')}, Line 1 verified = {init_res.get('verified')}", flush=True)
    except Exception as e:
        print(f"❌ Error during DAG 1: {e}", flush=True)
        return False, f"DAG 1 Exception: {e}"

    # 3. Run DAG Group 2 Capture Cycles
    NUM_CYCLES = 3
    print(f"\n[Step 3] Executing {NUM_CYCLES} Automated DAG 2 Capture Cycles...", flush=True)

    page_history = []
    
    for cycle_num in range(1, NUM_CYCLES + 1):
        print(f"\n-------------------------------------------------------------", flush=True)
        print(f"▶ Cycle {cycle_num}/{NUM_CYCLES}: Capturing Page {cycle_num}...", flush=True)
        print(f"-------------------------------------------------------------", flush=True)

        t0 = time.time()
        try:
            cycle_res = api_post("/api/dag/groups/capture_entire_markdown/run", {"single_cycle": True}, timeout=90)
            elapsed = time.time() - t0
        except Exception as e:
            print(f"❌ Exception in Cycle {cycle_num}: {e}", flush=True)
            return False, f"Cycle {cycle_num} Exception: {e}"

        status = cycle_res.get("status")
        if status != "success":
            err = cycle_res.get("error") or cycle_res.get("message") or str(cycle_res)
            print(f"❌ Cycle {cycle_num} Failed with status '{status}': {err}", flush=True)
            return False, f"Cycle {cycle_num} Error: {err}"

        n3 = cycle_res.get("node3", {})
        n5 = cycle_res.get("node5", {})
        n4 = cycle_res.get("node4", {})
        n6 = cycle_res.get("node6", {})
        n7 = cycle_res.get("node7", {})
        n8 = cycle_res.get("node8", {})

        top_line = n5.get("top_line")
        bottom_line = n5.get("bottom_line")
        target_next = n5.get("target_top_line")
        settled_top = n6.get("new_top_line")
        arrows = n6.get("arrow_count")
        reached = n6.get("reached")

        print(f"  • Frame Acquire (Node 3): Status={n3.get('status')}", flush=True)
        print(f"  • Gutter Verify (Node 5): Top=Ln {top_line}, Bottom=Ln {bottom_line} (Span: {bottom_line - top_line + 1 if (bottom_line and top_line) else '?'})", flush=True)
        print(f"  • Vision OCR    (Node 4): Status={n4.get('status')}, Extracted={n4.get('lines_count')} lines", flush=True)
        print(f"  • Viewport Pacer (Node 6): Target=Ln {target_next} → Settled=Ln {settled_top} (Reached={reached}, Keys={arrows})", flush=True)
        print(f"  • Trigger Qual  (Node 7): Allowed={n7.get('allowed')} ({n7.get('message')})", flush=True)
        print(f"  • Document Stt  (Node 8): Total Verified Lines={n8.get('total_captured_lines')}", flush=True)
        print(f"  ⏱ Cycle Duration: {elapsed:.2f}s", flush=True)

        # STRICT CONTINUITY CHECK:
        # Check alignment against previous page if not page 1
        if page_history:
            prev_cycle, prev_top, prev_bottom = page_history[-1]
            expected_current_top = prev_bottom + 1
            if top_line != expected_current_top:
                msg = f"ALIGNMENT GAP/DUPLICATE DETECTED: Page {cycle_num} top is Ln {top_line}, but previous page bottom was Ln {prev_bottom} (expected Ln {expected_current_top})!"
                print(f"❌ {msg}", flush=True)
                return False, msg
            else:
                print(f"  ✔ CONTINUITY VALIDATED: Page {cycle_num} top (Ln {top_line}) == Page {prev_cycle} bottom ({prev_bottom}) + 1", flush=True)

        # Check next page alignment readiness
        if settled_top != target_next:
            msg = f"NEXT PAGE ALIGNMENT MISMATCH: Viewport settled at Ln {settled_top}, expected Ln {target_next}!"
            print(f"❌ {msg}", flush=True)
            return False, msg
        else:
            print(f"  ✔ NEXT PAGE ALIGNED: Viewport ready for Page {cycle_num + 1} at Ln {target_next}", flush=True)

        page_history.append((cycle_num, top_line, bottom_line))

    # 4. Final summary metrics
    print("\n" + "=" * 70, flush=True)
    print("🏆 ALL TEST CYCLES COMPLETED SUCCESSFULLY!", flush=True)
    print("=" * 70, flush=True)
    status_summary = api_get("/api/status")
    doc_metrics = status_summary.get("metrics", {})
    print(f"Final Document Metrics:", flush=True)
    print(f"  • Total Frames Captured: {doc_metrics.get('total_frames')}", flush=True)
    print(f"  • Verified Lines Count: {doc_metrics.get('verified_lines_count')}", flush=True)
    print(f"  • Min Line: {doc_metrics.get('min_line')}, Max Line: {doc_metrics.get('max_line')}", flush=True)
    print("\nPage Progression Log:", flush=True)
    for p, top, bot in page_history:
        print(f"  - Page {p}: Ln {top} → Ln {bot} (Next target: {bot + 1})", flush=True)

    return True, "E2E Automated Testing Succeeded"

if __name__ == "__main__":
    success, message = main()
    sys.exit(0 if success else 1)
