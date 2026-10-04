import json
from alignment_engine import detect_teams_markdown_alignment

snap_bytes = open('current_screen_debug.png', 'rb').read()
res = detect_teams_markdown_alignment(snap_bytes, dpi_factor=1.0)
print('is_aligned:', res.get('is_aligned'))
print('reason:', res.get('reason'))
for k, v in res.get('boxes', {}).items():
    print(f"  {k}: passed={v.get('passed')}, box_px={v.get('box_px')}, val={v.get('detected_value')}")
