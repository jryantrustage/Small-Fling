import asyncio, sys, cv2, numpy as np, re
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot,
    dispatch_accelerated_viewport_step, dismiss_keyboard
)
from ocr_engine import get_rapid_ocr, correct_gutter_sequence

def find_real_gutter(img):
    if img is None: return []
    h, w = img.shape[:2]
    top_y = int(h * 0.08)
    bot_y = int(h * 0.96)
    ocr = get_rapid_ocr()
    if ocr is None: return []

    sub_w = int(min(w, max(480, int(w * 0.45))))
    sub = img[top_y:bot_y, :sub_w]
    results, _ = ocr(sub)
    if not results: return []

    candidates = []
    for bbox, text, score in results:
        clean = text.strip()
        pts = np.array(bbox)
        x_min = int(np.min(pts[:, 0]))
        y_min = top_y + int(np.min(pts[:, 1]))
        clean_num = clean.replace('B', '8').replace('S', '5').replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1')
        if m := re.search(r'^(\d+)', clean_num):
            try:
                num = int(m.group(1))
                if 0 < num < 500000:
                    candidates.append((x_min, y_min, num))
            except ValueError: pass

    if not candidates: return []
    clusters = {}
    for x, y, num in candidates:
        matched_k = None
        for k in clusters:
            if abs(k - x) <= 30:
                matched_k = k
                break
        if matched_k is None:
            matched_k = x
            clusters[matched_k] = []
        clusters[matched_k].append((y, num))

    scored_clusters = []
    for k, items in clusters.items():
        sorted_items = sorted(items, key=lambda it: it[0])
        asc_count = sum(1 for i in range(len(sorted_items) - 1) if 0 < sorted_items[i+1][1] - sorted_items[i][1] <= 10 and sorted_items[i+1][0] > sorted_items[i][0])
        score = len(sorted_items) + (asc_count * 3)
        scored_clusters.append((score, sorted_items))

    scored_clusters.sort(key=lambda x: x[0], reverse=True)
    best = scored_clusters[0][1] if scored_clusters else []
    return correct_gutter_sequence(best) if best else []

async def test():
    ser = await get_active_adb_serial()
    disp_id = await detect_external_display_id(ser)
    snap = await capture_external_screenshot(ser, bypass_lock=True, max_cache_age_s=0.0)
    img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
    gutter = find_real_gutter(img)
    print(f"REAL GUTTER: count={len(gutter)}")
    if gutter:
        print(f"  First: {gutter[0]}, Last: {gutter[-1]}")
        print(f"  Lines: {[n for _, n in gutter]}")

asyncio.run(test())
