import urllib.request
import json
import time
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://localhost:8000"

def get(endpoint):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def post(endpoint, data=None):
    payload = json.dumps(data or {}).encode('utf-8')
    req = urllib.request.Request(
        f"{BASE_URL}{endpoint}",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

print("=== 1. Testing Headless Mode & Config ===")
h_status = get("/api/dag/config/headless-mode")
print("Initial headless mode:", h_status)
toggled = post("/api/dag/config/headless-mode", {"headless_mode": True})
assert toggled.get("headless_mode") is True
print("Toggled headless mode ON: OK")

print("\n=== 2. Testing Target Lines Setting ===")
set_target = post("/api/dag/headless/target-lines", {"target_total_lines": 100})
assert set_target.get("target_total_lines") == 100
print("Set target lines to 100: OK")

print("\n=== 3. Testing Headless Telemetry Session Lifecycle in State ===")
import sys
sys.path.insert(0, ".")
from services import state

# Start session
sess = state.start_headless_telemetry_session("continuous_capture_loop", target_total_lines=100)
assert sess["is_active"] is True
assert sess["target_total_lines"] == 100
assert sess["status"] == "RUNNING"
print("Session started:", sess["session_id"], "| Target:", sess["target_total_lines"])

# Update session partway
sess = state.update_headless_telemetry_session(top_line=1, bottom_line=49, frames_inc=1, latency_ms=45.2, event_msg="Captured frame 1")
assert sess["frames_processed"] == 1
assert sess["current_bottom_line"] == 49
assert sess["completion_percent"] == 49.0
assert sess["total_lines_reached"] is False
print(f"Updated frame 1: Bottom Ln {sess['current_bottom_line']} | {sess['completion_percent']}% | Lines Reached: {sess['total_lines_reached']}")

# Update session reaching total lines
sess = state.update_headless_telemetry_session(top_line=45, bottom_line=102, frames_inc=1, latency_ms=42.1, event_msg="Captured frame 2 - Reached EOF")
assert sess["frames_processed"] == 2
assert sess["current_bottom_line"] == 102
assert sess["completion_percent"] == 100.0
assert sess["total_lines_reached"] is True
print(f"Updated frame 2: Bottom Ln {sess['current_bottom_line']} | {sess['completion_percent']}% | Lines Reached: {sess['total_lines_reached']} OK")

# Complete session
summary = state.complete_headless_telemetry_session("COMPLETED")
assert summary["is_active"] is False
assert summary["status"] == "COMPLETED"
assert summary["total_lines_reached"] is True
assert "100% SUCCESS" in summary["finish_status_message"]
print("Completed summary message:", summary["finish_status_message"])
print("Elapsed runtime:", summary["elapsed_seconds"], "s")

# Verify endpoint returns completed session
api_summary = get("/api/dag/headless/telemetry")
assert api_summary["telemetry"]["total_lines_reached"] is True
assert api_summary["telemetry"]["status"] == "COMPLETED"
print("API returned completed telemetry session successfully: OK")

print("\n>>> ALL HEADLESS TELEMETRY TESTS PASSED SUCCESSFULLY! <<<")
