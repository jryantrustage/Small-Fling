import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services import state
from ocr_engine import worker_scan_image
from services.ocr_service import rescan_lines_on_image_sync

frames = sorted(list(state.FRAMES_DIR.glob('frame_*.png')), key=lambda p: p.stat().st_mtime, reverse=True)
if not frames:
    print('No frames found')
    sys.exit(0)

test_frame = frames[0]
print(f'Testing on frame: {test_frame.name}')
t0 = time.perf_counter()
quick = worker_scan_image(str(test_frame))
t1 = time.perf_counter()
lines = quick.get("lines", [])
print(f'worker_scan_image took {(t1-t0)*1000:.1f}ms, detected {len(lines)} lines')

all_lns = [l.get('line_number') for l in lines if l.get('line_number')]
t2 = time.perf_counter()
updated, rescanned = rescan_lines_on_image_sync(test_frame, all_lns, lines, quick.get('bounding_boxes', {}))
t3 = time.perf_counter()
print(f'rescan_lines_on_image_sync took {(t3-t2)*1000:.1f}ms, rescanned {len(rescanned)} lines')
print(f'Total time: {(t3-t0)*1000:.1f}ms vs MiniCPM-V ~12000ms!')
for l in updated[:5]:
    print(f'  L{l.get("line_number")}: {repr(l.get("text", "")[:60])}')
