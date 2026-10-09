import cv2, sys, numpy as np, re
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
from ocr_engine import get_rapid_ocr, correct_gutter_sequence

def find_best_cluster(img, dpi_factor=1.0):
    if img is None: return []
    h, w = img.shape[:2]
    top_y = int(h * 0.08)
    bot_y = int(h * 0.96)
    ocr = get_rapid_ocr()
    if ocr is None: return []

    scale_x = w / 1920.0
    norm_multiplier = max(0.4, scale_x * dpi_factor)
    sub_w = int(min(w, max(480, int(w * 0.45 * norm_multiplier))))
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
    x_tol = max(18, int(24.0 * norm_multiplier))
    clusters = {}
    for x, y, num in candidates:
        matched_k = None
        for k in clusters:
            if abs(k - x) <= x_tol:
                matched_k = k
                break
        if matched_k is None:
            matched_k = x
            clusters[matched_k] = []
        clusters[matched_k].append((y, num))

    scored_clusters = []
    for k, items in clusters.items():
        sorted_items = sorted(items, key=lambda it: it[0])
        # Score based on count and ascending progression
        asc_count = 0
        for i in range(len(sorted_items) - 1):
            dn = sorted_items[i+1][1] - sorted_items[i][1]
            dy = sorted_items[i+1][0] - sorted_items[i][0]
            if 0 < dn <= 10 and dy > 0:
                asc_count += 1
        score = len(sorted_items) + (asc_count * 3)
        scored_clusters.append((score, sorted_items))

    scored_clusters.sort(key=lambda x: x[0], reverse=True)
    best_gutter = scored_clusters[0][1] if scored_clusters else []
    if best_gutter:
        best_gutter = correct_gutter_sequence(best_gutter)
    return best_gutter

img = cv2.imread(r'c:\Projects\Small-Fling\captured_snap.png')
print("Best cluster on captured_snap.png:", find_best_cluster(img))
img2 = cv2.imread(r'C:\Users\aspfo\.gemini\antigravity-ide\brain\33d55930-a08d-4360-8053-0358827dc171\screen_ok.png')
print("Best cluster on screen_ok.png:", find_best_cluster(img2))
