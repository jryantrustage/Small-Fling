import urllib.request
import json
import time
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Fetch first 2 frame ids
req_f = urllib.request.Request('http://localhost:8000/api/frames')
with urllib.request.urlopen(req_f) as resp:
    frames = json.loads(resp.read().decode())[:2]
    fids = [f['frame_id'] for f in frames]
    print('Testing sequential rescan on 2 frames:', fids)

req_rescan = urllib.request.Request(
    'http://localhost:8000/api/ocr/rescan-all-frames',
    data=json.dumps({'frame_ids': fids}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req_rescan) as resp:
    start_res = json.loads(resp.read().decode())
    print('Start rescan response:', start_res)

# Poll telemetry
for i in range(15):
    time.sleep(0.5)
    req_t = urllib.request.Request('http://localhost:8000/api/dag/headless/telemetry')
    with urllib.request.urlopen(req_t) as resp:
        t = json.loads(resp.read().decode())
        telem = t.get('telemetry', {})
        print(f"Poll {i}: status={telem.get('status')}, frames={telem.get('frames_processed')}, top={telem.get('current_top_line')}, bottom={telem.get('current_bottom_line')}")
        if telem.get('status') == 'COMPLETED':
            print("SUCCESS! Completed finish status message:", telem.get('finish_status_message'))
            print("Lines per second:", telem.get('lines_per_second'))
            print("Avg OCR latency ms:", telem.get('avg_ocr_latency_ms'))
            break
