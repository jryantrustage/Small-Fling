import requests
import json
import sys

try:
    print("Calling /api/navigation/goto-line for target 48...")
    r = requests.post("http://127.0.0.1:8000/api/navigation/goto-line", json={"target_line": 48}, timeout=60)
    print("Status:", r.status_code)
    print("Response:", r.text)
except Exception as e:
    print("Error:", e, file=sys.stderr)
