import asyncio
import json
import time
import urllib.request
import urllib.error
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def log(msg: str):
    print(msg, flush=True)

def api_post(endpoint: str, payload: dict = None) -> dict:
    url = f"http://localhost:8000{endpoint}"
    data = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def api_get(endpoint: str) -> dict:
    url = f"http://localhost:8000{endpoint}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    log("==================================================")
    log("STARTING LIVE DAG LOOP VERIFICATION")
    log("==================================================")

    # 1. Start continuous loop via API
    start_res = api_post("/api/dag/loop/start")
    log(f"Start Loop API Response: {start_res}")

    pages_seen = set()
    start_time = time.time()
    max_wait = 180  # 3 minutes max

    while time.time() - start_time < max_wait:
        time.sleep(2.5)
        try:
            status = api_get("/api/dag/status")
            tel = status.get("telemetry", {})
            cur_p = tel.get("current_page", 0)
            top_ln = tel.get("current_top_line", 0)
            bot_ln = tel.get("current_bottom_line", 0)
            msg = tel.get("status_message", "")
            active_node = status.get("dag", {}).get("current_active_node")

            doc = api_get("/api/document")
            doc_count = len(doc.get("lines", []))

            frames = api_get("/api/frames")
            log(f"  [Loop] Active={active_node}, Page={cur_p}, Frames={len(frames)}, MasterDocLines={doc_count} | StatusMsg={msg}")

            if len(frames) >= 4 and doc_count >= 80:
                log("\n>>> Successfully captured 4 continuous pages without looping!")
                break
        except Exception as e:
            log(f"  Error polling status: {e}")

    # Stop continuous loop
    try:
        stop_res = api_post("/api/dag/loop/stop")
        log(f"\nStop Loop API Response: {stop_res}")
    except Exception as e:
        log(f"Error stopping loop: {e}")

    # Inspect reproduced markdown file
    out_file = Path("c:/Projects/Small-Fling/storage/reproduced_Matrix_main.md")
    if out_file.exists():
        content = out_file.read_text(encoding="utf-8")
        lines = content.splitlines()
        log("\n==================================================")
        log("REPRODUCTION VERIFICATION SUMMARY")
        log("==================================================")
        log(f"Output File: {out_file}")
        log(f"File Size: {out_file.stat().st_size} bytes")
        log(f"Total Reconstructed Lines: {len(lines)}")
        log("\nFirst 15 lines of reproduced file:")
        for i, l in enumerate(lines[:15]):
            log(f"  {i+1:>3}: {l}")
        log("\nLast 15 lines of reproduced file:")
        for i, l in enumerate(lines[-15:]):
            log(f"  {len(lines)-15+i+1:>3}: {l}")

if __name__ == "__main__":
    main()
