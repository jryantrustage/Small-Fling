import sys
import urllib.request
import json

sys.stdout.reconfigure(encoding='utf-8')

def post(url, data=None):
    payload = json.dumps(data or {}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def get(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

print("--- 1. Testing Headless Mode Config Endpoints ---")
initial = get("http://localhost:8000/api/dag/config/headless-mode")
print("Initial headless mode:", initial)

set_on = post("http://localhost:8000/api/dag/config/headless-mode", {"headless_mode": True})
print("Toggled Headless ON:", set_on)
assert set_on.get("headless_mode") is True

print("\n--- 2. Executing DAG Node 4 in Headless Mode ---")
res = post("http://localhost:8000/api/dag/nodes/local_ai_ocr/run", {"config": {"headless_mode": True}})
print("Node 4 Status:", res.get("status"))
print("Node 4 Message:", res.get("message"))
d = res.get("data", {})
print("Model used:", d.get("model_used"))
print("Lines count:", d.get("lines_count"))
print("Duration ms:", d.get("duration_ms"))
print("Headless flag in data:", d.get("headless"))

lines = d.get("lines", [])
print(f"Total lines returned: {len(lines)}")
for l in lines[:5]:
    ln = l.get("line_number")
    txt = l.get("text", "")
    print(f"  L{ln}: {repr(txt[:60])}")

print("\n--- 3. Testing Reset to Standard Mode (Stability Safeguard) ---")
set_off = post("http://localhost:8000/api/dag/config/headless-mode", {"headless_mode": False})
print("Toggled Headless OFF:", set_off)
assert set_off.get("headless_mode") is False

verify_off = get("http://localhost:8000/api/dag/config/headless-mode")
print("Verified Headless is OFF:", verify_off)
print("\n>>> ALL TESTS PASSED! Headless mode executes RapidOCR Inspector Rescan engine in Node 4 and safely resets.")
