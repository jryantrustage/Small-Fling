import urllib.request, json, sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

url = "http://localhost:8000/api/dag/groups/capture_entire_markdown/run"
payload = json.dumps({"single_cycle": True}).encode("utf-8")
req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

print(">>> Triggering DAG 2 Single Cycle <<<", flush=True)
try:
    with urllib.request.urlopen(req, timeout=90) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print("\n=== DAG 2 Result ===", flush=True)
        print("Status:", res.get("status"), flush=True)
        print("Loop Record:", res.get("loop"), flush=True)
        for nid in ["node3", "node5", "node4", "node6", "node7", "node8"]:
            node = res.get(nid, {})
            print(f"\n--- {nid.upper()} ({node.get('node_id', nid)}) ---", flush=True)
            print("Status:", node.get("status"), flush=True)
            if nid == "node5":
                print(f"Page Top: {node.get('top_line')}, Bottom: {node.get('bottom_line')}, Next Target: {node.get('target_top_line')}", flush=True)
            elif nid == "node6":
                print(f"Arrow Keys Pressed: {node.get('arrow_count')}", flush=True)
                print(f"Target Top: {node.get('target_top_line')}, Settled Top: {node.get('new_top_line')}", flush=True)
                print(f"Reached Target: {node.get('reached')}", flush=True)
                print(f"Insight: {node.get('telemetry_insight')}", flush=True)
            elif nid == "node7":
                print(f"Allowed: {node.get('allowed')}, Message: {node.get('message')}", flush=True)
            elif nid == "node8":
                print(f"Total Captured Lines: {node.get('total_captured_lines')}", flush=True)
except Exception as e:
    print("Error calling DAG 2 endpoint:", e, flush=True)
