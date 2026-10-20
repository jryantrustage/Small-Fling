import sys
sys.path.extend(['c:/Projects/Small-Fling/server', 'c:/Projects/Small-Fling/server/services', 'c:/Projects/Small-Fling/server/core'])
import db

evs = db.get_telemetry_events(limit=30)
for e in reversed(evs):
    print(f"[{e.get('timestamp')}] [{e.get('category')}] {e.get('message')}")
