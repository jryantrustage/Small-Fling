import cv2, sys, numpy as np
sys.path.insert(0, r'c:\Projects\Small-Fling\server')
from ocr_engine import get_rapid_ocr, correct_gutter_sequence

def find_gutter_clean(img):
    h, w = img.shape[:2]
    top_y = max(int(h * 0.12), 275)
    bot_y = int(h * 0.96)
    ocr = get_rapid_ocr()
    sub_w = int(min(w, max(480, int(w * 0.45))))
    sub = img[top_y:bot_y, :sub_w]
    results, _ = ocr(sub)
    candidates = []
    import re
    for bbox, text, score in results or []:
        clean = text.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1')
        if m := re.search(r'^(\d+)', clean):
            try:
                num = int(m.group(1))
                if 0 < num < 500000:
                    y_min = top_y + int(np.min(np.array(bbox)[:, 1]))
                    candidates.append((int(np.min(np.array(bbox)[:, 0])), y_min, num))
            except ValueError: pass

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

    scored = []
    for k, items in clusters.items():
        sorted_items = sorted(items, key=lambda it: it[0])
        asc = sum(1 for i in range(len(sorted_items) - 1) if 0 < sorted_items[i+1][1] - sorted_items[i][1] <= 10 and sorted_items[i+1][0] > sorted_items[i][0])
        scored.append((len(sorted_items) + asc * 3, sorted_items))
    scored.sort(key=lambda x: x[0], reverse=True)
    best = scored[0][1] if scored else []
    return correct_gutter_sequence(best) if best else []

img2 = cv2.imread(r'C:\Users\aspfo\.gemini\antigravity-ide\brain\33d55930-a08d-4360-8053-0358827dc171\screen_ok.png')
g2 = find_gutter_clean(img2)
print("screen_ok clean gutter:", g2[:5])
img = cv2.imread(r'c:\Projects\Small-Fling\captured_snap.png')
g1 = find_gutter_clean(img)
print("captured_snap clean gutter:", g1[:5])
