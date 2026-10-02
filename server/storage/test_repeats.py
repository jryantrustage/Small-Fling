import urllib.request
import json
import time

for i in range(1, 4):
    t0 = time.time()
    req = urllib.request.Request(
        'http://localhost:8000/api/dag/groups/initialize/run',
        data=b'{}',
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as res:
        dt = round(time.time() - t0, 2)
        data = json.loads(res.read().decode('utf-8'))
        print(f"Run #{i}: HTTP {res.status} | total_lines={data.get('total_lines')} | first_line={data.get('first_line')} | time={dt}s | verified={data.get('verified')}")
