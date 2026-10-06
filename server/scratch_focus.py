import db

events = db.get_telemetry_events(limit=40)
for ev in reversed(events):
    print(f"[{ev.get('timestamp')}] [{ev.get('category')}] {ev.get('message')}")
