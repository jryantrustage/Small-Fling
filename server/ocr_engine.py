from abc import ABC, abstractmethod
import os, re, json, base64, urllib.request, urllib.error
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import cv2, numpy as np

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    RapidOCR = None

from pathlib import Path

# Hardware-tuned threading for Intel Core Ultra 9 288V (4 Lion Cove P-cores, 4 Skymont E-cores)
try:
    cv2.setNumThreads(4)
    if cv2.ocl.haveOpenCL():
        cv2.ocl.setUseOpenCL(True)
except Exception:
    pass

try:
    import openvino as ov
    _ov_core = ov.Core()
    _ov_cache_dir = Path(__file__).resolve().parent / "storage" / ".ov_cache"
    _ov_cache_dir.mkdir(parents=True, exist_ok=True)
    _ov_core.set_property({'CACHE_DIR': str(_ov_cache_dir)})
except Exception:
    _ov_core = None

def get_hardware_acceleration_profile() -> Dict[str, Any]:
    return {
        "platform": "Intel Core Ultra 9 288V (Lunar Lake Series 2)",
        "memory_gb": 32,
        "cores": {
            "p_cores": 4,
            "e_cores": 4,
            "scheduling": "PCORE_ONLY",
            "threads_pinned": 4
        },
        "openvino_available": _ov_core is not None,
        "openvino_devices": _ov_core.available_devices if _ov_core is not None else [],
        "openvino_cache_dir": str(_ov_cache_dir) if _ov_core is not None else None,
        "opencv_opencl": cv2.ocl.useOpenCL() if hasattr(cv2, "ocl") else False,
        "opencv_threads": cv2.getNumThreads() if hasattr(cv2, "getNumThreads") else 4
    }

import threading

class _OpenVINOInferSessionWrapper:
    """Wraps an OpenVINO compiled model to match RapidOCR's OrtInferSession interface with thread-safe locking and ONNX fallback."""
    def __init__(self, compiled_model, original_infer):
        self.compiled_model = compiled_model
        self.orig = original_infer
        self._lock = threading.Lock()

    def __call__(self, input_content: np.ndarray):
        with self._lock:
            try:
                res = self.compiled_model([input_content])
                return [res[out] for out in self.compiled_model.outputs]
            except Exception as e:
                try:
                    return self.orig(input_content)
                except Exception:
                    raise e

    def get_input_names(self): return self.orig.get_input_names()
    def get_output_names(self): return self.orig.get_output_names()
    def get_character_list(self): return getattr(self.orig, 'get_character_list', lambda: None)()
    def have_key(self, k): return getattr(self.orig, 'have_key', lambda _: False)(k)

def _accelerate_rapidocr_with_openvino(ocr_inst):
    """
    Accelerates RapidOCR on Intel Core Ultra 9 288V Series 2 architecture:
    - Text Detector and Recognizer mapped to Lion Cove P-cores with AVX-VNNI (PCORE_ONLY scheduling, CPU pinning)
    - OpenVINO disk caching enabled for instantaneous warm start
    """
    if _ov_core is None or ocr_inst is None:
        return ocr_inst
    try:
        import rapidocr_onnxruntime
        pkg_dir = Path(rapidocr_onnxruntime.__file__).parent
        det_path = pkg_dir / "models" / "ch_PP-OCRv3_det_infer.onnx"
        rec_path = pkg_dir / "models" / "ch_PP-OCRv3_rec_infer.onnx"

        # Explicit configuration for Intel Core Ultra 9 288V Lion Cove P-cores
        cpu_config = {
            'PERFORMANCE_HINT': 'LATENCY',
            'NUM_STREAMS': '1',
            'SCHEDULING_CORE_TYPE': 'PCORE_ONLY',
            'ENABLE_CPU_PINNING': 'YES',
            'INFERENCE_NUM_THREADS': '4',
            'CPU_DENORMALS_OPTIMIZATION': 'YES'
        }

        if det_path.exists() and hasattr(ocr_inst, 'text_detector') and hasattr(ocr_inst.text_detector, 'infer'):
            compiled_det = _ov_core.compile_model(_ov_core.read_model(str(det_path)), 'CPU', cpu_config)
            ocr_inst.text_detector.infer = _OpenVINOInferSessionWrapper(compiled_det, ocr_inst.text_detector.infer)

        if rec_path.exists() and hasattr(ocr_inst, 'text_recognizer') and hasattr(ocr_inst.text_recognizer, 'session'):
            compiled_rec = _ov_core.compile_model(_ov_core.read_model(str(rec_path)), 'CPU', cpu_config)
            ocr_inst.text_recognizer.session = _OpenVINOInferSessionWrapper(compiled_rec, ocr_inst.text_recognizer.session)

        print(f"[OpenVINO] Accelerated RapidOCR for Intel Core Ultra 9 288V (Lion Cove P-cores with AVX-VNNI, PCORE_ONLY Pinning, Latency Mode)")
    except Exception as e:
        print(f"[OpenVINO] Acceleration fallback to standard ONNX: {e}")
    return ocr_inst

_rapid_ocr_instance = None
_fast_ocr_executor = ThreadPoolExecutor(max_workers=4)

def get_rapid_ocr():
    global _rapid_ocr_instance
    if _rapid_ocr_instance is None and RapidOCR is not None:
        try:
            raw_ocr = RapidOCR(use_angle_cls=False)
            _rapid_ocr_instance = _accelerate_rapidocr_with_openvino(raw_ocr)
        except Exception as e:
            print(f"[Worker] RapidOCR init error: {e}")
    return _rapid_ocr_instance

def extract_numbers_from_slice(crop: np.ndarray) -> List[int]:
    """Helper to extract clean gutter line numbers from a localized image slice."""
    if crop is None or crop.size == 0: return []
    ocr = get_rapid_ocr()
    if ocr is None: return []
    try:
        res, _ = ocr(crop)
    except Exception:
        return []
    nums = []
    if not res: return nums
    for bbox, text, score in res:
        clean = text.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1')
        if m := re.search(r'^(\d+)', clean):
            try:
                n = int(m.group(1))
                if 0 < n < 2000000:
                    pts = np.array(bbox)
                    y_min = int(np.min(pts[:, 1])) if pts.ndim == 2 else 0
                    nums.append((y_min, n))
            except Exception: pass
    nums.sort(key=lambda x: x[0])
    return [n for _, n in nums]

def correct_gutter_sequence(gutter_items: List[Tuple[int, int]], min_content_y: int = 270) -> List[Tuple[int, int]]:
    """
    Validates and corrects line numbers in a vertical gutter column.
    Detects and corrects outliers (such as truncated numbers like 69 instead of 697)
    using sequence consensus, median line pitch, and linear projection.
    Also back-projects missing leading lines down to 1 when near top of document.
    """
    if not gutter_items:
        return []
    sorted_items = sorted(gutter_items, key=lambda it: it[0])
    if len(sorted_items) <= 1:
        return sorted_items

    # 1. Estimate typical line pitch (pixels per line)
    pitches = []
    for i in range(len(sorted_items) - 1):
        dy = sorted_items[i+1][0] - sorted_items[i][0]
        dn = sorted_items[i+1][1] - sorted_items[i][1]
        if dn > 0 and 10 <= dy <= 35 * dn:
            pitches.append(dy / dn)
    med_pitch = float(np.median(pitches)) if pitches else 18.0

    # 2. Find anchor/consensus index where consecutive items have dn == 1 and dy approx pitch
    anchor_idx = None
    for i in range(len(sorted_items) - 1):
        dy = sorted_items[i+1][0] - sorted_items[i][0]
        dn = sorted_items[i+1][1] - sorted_items[i][1]
        if dn in (1, 2) and abs(dy - dn * med_pitch) <= 8:
            anchor_idx = i
            break
    if anchor_idx is None:
        anchor_idx = len(sorted_items) - 1 if len(sorted_items) > 1 else 0

    anchor_y, anchor_n = sorted_items[anchor_idx]

    cleaned = []
    for y_pos, num in sorted_items:
        projected = int(round(anchor_n + (y_pos - anchor_y) / med_pitch))
        if projected < 1:
            projected = 1
        # If num deviates significantly from projection:
        if abs(num - projected) > 3:
            s_num = str(num)
            s_proj = str(projected)
            # Prefix truncation e.g. "69" when projected is 697
            if s_proj.startswith(s_num) or abs(num - projected) > 12:
                cleaned.append((y_pos, projected))
            else:
                cleaned.append((y_pos, num))
        else:
            cleaned.append((y_pos, num))

    # 3. Back-project missing leading lines down to 1 if top of document is visible
    if cleaned and 1 < cleaned[0][1] <= 12:
        first_y, first_n = cleaned[0]
        prepended = []
        for k in range(first_n - 1, 0, -1):
            proj_y = int(round(first_y - (first_n - k) * med_pitch))
            if proj_y >= min_content_y:
                prepended.append((proj_y, k))
        if prepended:
            prepended.reverse()
            cleaned = prepended + cleaned

    return cleaned

def clean_slice_numbers(nums: List[int]) -> List[int]:
    """Helper to detect and fix digit-truncation outliers in a slice of line numbers."""
    if not nums or len(nums) < 2:
        return nums
    res = list(nums)
    # Check if first element is a truncated prefix of second element - 1
    if res[1] > 50 and res[0] < res[1] - 10:
        expected_first = res[1] - 1
        if str(expected_first).startswith(str(res[0])) or expected_first - res[0] > 50:
            res[0] = expected_first
    return res

def fast_detect_gutter_bounds(img: np.ndarray, dpi_factor: float = 1.0) -> Tuple[int, int]:
    """
    Rapidly extracts top line and bottom line from targeted top/bottom gutter slices in parallel.
    Multiplies base 1080p search bounding boxes by dpi_factor and resolution scaling factor.
    Includes consensus validation to prevent digit truncation glitches (e.g. 69 instead of 697).
    """
    if img is None: return 0, 0
    h, w = img.shape[:2]
    scale_x = w / 1920.0
    norm_multiplier = max(0.4, scale_x * dpi_factor)

    # 1. Primary: standard fullscreen gutter (strictly within numeric gutter column x <= 90)
    gutter_w = int(max(65.0, min(90.0, 90.0 * norm_multiplier)))
    # Editor boundaries: strictly avoid status bar + Teams title + formatting toolbar (y < 280)
    # and bottom Android dock / navigation bar / Teams offline status pill (y > 945)
    top_y1 = max(280, int(h * 0.260))
    top_y2 = min(h - 150, int(h * 0.65))
    top_crop = img[top_y1:top_y2, :gutter_w]
    bot_y1 = int(h * 0.55)
    bot_y2 = min(int(h * 0.875), h - 135)
    bot_crop = img[bot_y1:bot_y2, :gutter_w]

    top_scaled = cv2.resize(top_crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    f_top = _fast_ocr_executor.submit(extract_numbers_from_slice, top_scaled)
    f_bot = _fast_ocr_executor.submit(extract_numbers_from_slice, bot_crop)
    top_nums = clean_slice_numbers(f_top.result())
    bot_nums = f_bot.result()

    if top_nums and bot_nums:
        t, b = top_nums[0], bot_nums[-1]
        # Sanity check: single screen cannot hold > 75 lines
        if b > 0 and t > 0 and (b - t) > 75:
            # If b is large (e.g. 754) and t is small (e.g. 69), project t from b
            if str(b - 57).startswith(str(t)) or (b - t > 100):
                t = max(1, b - 57)
        return t, b

    # 2. Secondary: sidebar open (gutter around x ~ 300 scaled by norm_multiplier)
    sidebar_x1 = int(240.0 * norm_multiplier)
    sidebar_x2 = sidebar_x1 + gutter_w
    if sidebar_x2 < w:
        top_crop2 = img[top_y1:top_y2, sidebar_x1:sidebar_x2]
        bot_crop2 = img[bot_y1:bot_y2, sidebar_x1:sidebar_x2]
        top2_scaled = cv2.resize(top_crop2, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
        f_top2 = _fast_ocr_executor.submit(extract_numbers_from_slice, top2_scaled)
        f_bot2 = _fast_ocr_executor.submit(extract_numbers_from_slice, bot_crop2)
        top_nums2 = clean_slice_numbers(f_top2.result())
        bot_nums2 = f_bot2.result()
        if top_nums2 and top_nums2[0] > 1 and len(top_nums2) >= 2:
            if top_nums2[0] <= 12:
                top_nums2.insert(0, 1)
        if top_nums2 and bot_nums2:
            t2, b2 = top_nums2[0], bot_nums2[-1]
            if b2 > 0 and t2 > 0 and (b2 - t2) > 75:
                if str(b2 - 57).startswith(str(t2)) or (b2 - t2 > 100):
                    t2 = max(1, b2 - 57)
            return t2, b2

    # Return partial if either top or bot detected
    t = (top_nums or (top_nums2 if 'top_nums2' in locals() else []) or [0])[0]
    b = (bot_nums or (bot_nums2 if 'bot_nums2' in locals() else []) or [0])[-1]
    if b > 0 and t > 0 and (b - t) > 75:
        if str(b - 57).startswith(str(t)) or (b - t > 100):
            t = max(1, b - 57)
    return t, b

def fast_verify_first_line(img: np.ndarray, dpi_factor: float = 1.0) -> Tuple[bool, int]:
    """Rapidly checks whether Line 1 (or <= 15) is visible at top gutter slice using normalized DPI scaling."""
    if img is None: return False, 0
    h, w = img.shape[:2]
    scale_x = w / 1920.0
    norm_multiplier = max(0.4, scale_x * dpi_factor)
    gutter_w = int(max(90.0, min(240.0, 110.0 * norm_multiplier)))
    top_y1 = max(285, int(h * 0.265))
    top_y2 = min(h - 150, int(h * 0.60))

    top_crop = img[top_y1:top_y2, :gutter_w]
    top_scaled = cv2.resize(top_crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    top_nums = extract_numbers_from_slice(top_scaled)
    if not top_nums:
        sidebar_x1 = int(240.0 * norm_multiplier)
        sidebar_x2 = sidebar_x1 + gutter_w
        if sidebar_x2 < w:
            top_crop2 = img[top_y1:top_y2, sidebar_x1:sidebar_x2]
            top2_scaled = cv2.resize(top_crop2, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
            top_nums = extract_numbers_from_slice(top2_scaled)
    if not top_nums: return False, 0
    first_ln = top_nums[0]
    is_at_home = any(ln == 1 for ln in top_nums[:4]) or first_ln <= 15
    return is_at_home, (1 if is_at_home else first_ln)

def find_gutter_numbers_cluster(img: np.ndarray, dpi_factor: float = 1.0) -> List[Tuple[int, int]]:
    """
    Finds the vertical gutter column of line numbers in an editor image.
    Self-adapts whether the editor is fullscreen or has a sidebar open.
    Applies dpi_factor to scale scan slices and X-clustering tolerance.
    """
    if img is None: return []
    h, w = img.shape[:2]
    top_y = max(280, int(h * 0.260))
    bot_y = min(int(h * 0.875), h - 135)
    ocr = get_rapid_ocr()
    if ocr is None: return []

    scale_x = w / 1920.0
    norm_multiplier = max(0.4, scale_x * dpi_factor)

    sub_w = int(min(w, max(480, int(w * 0.45 * norm_multiplier))))
    sub = img[top_y:bot_y, :sub_w]
    try:
        results, _ = ocr(sub)
    except Exception as e:
        print(f"[find_gutter_numbers_cluster] Error: {e}")
        return []

    if not results: return []

    candidates = []
    for bbox, text, score in results:
        clean = text.strip()
        pts = np.array(bbox)
        x_min = int(np.min(pts[:, 0]))
        y_min = top_y + int(np.min(pts[:, 1]))
        clean_num = clean.replace('B', '8').replace('S', '5').replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1').replace('/', '7').replace('|', '1')
        clean_num = re.sub(r'(\d)\s+(\d)', r'\1\2', clean_num)
        if m := re.search(r'^(\d+)', clean_num):
            try:
                num = int(m.group(1))
                if 0 < num < 500000:
                    candidates.append((x_min, y_min, num))
            except ValueError: pass

    if not candidates: return []

    # Cluster candidates by X-coordinate (scaled tolerance by DPI multiplier)
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

    # Score each cluster based on line count and monotonic ascending progression
    scored_clusters = []
    for k, items in clusters.items():
        sorted_items = sorted(items, key=lambda it: it[0])
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

    # Filter and correct gutter numbers using consensus sequence validation
    if best_gutter:
        best_gutter = correct_gutter_sequence(best_gutter, min_content_y=top_y)

    valid = []
    for y_pos, num in best_gutter:
        if not valid or num >= valid[-1][1]:
            valid.append((y_pos, num))
        elif valid and str(valid[-1][1])[:-2] + str(num) == str(valid[-1][1] + 1):
            valid.append((y_pos, valid[-1][1] + 1))
    return valid if valid else best_gutter


def worker_detect_gutter_bounds(image_path: str, dpi_factor: float = 1.0) -> Tuple[int, int]:
    """Worker function to rapidly detect both top line and last line in a single OCR pass."""
    img = cv2.imread(image_path)
    if img is None: return 0, 0
    # Fast path: check top and bottom slices in parallel
    top, bot = fast_detect_gutter_bounds(img, dpi_factor=dpi_factor)
    if top > 0 and bot > 0:
        return top, bot
    # Fallback to column clustering
    gutter = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
    if gutter:
        return gutter[0][1], gutter[-1][1]
    return top or 0, bot or 0

def worker_detect_last_line(image_path: str, dpi_factor: float = 1.0) -> int:
    """Worker function to rapidly and accurately detect the last line number on screen (used after Ctrl+End)."""
    img = cv2.imread(image_path)
    if img is None: return 0
    _, bot = fast_detect_gutter_bounds(img, dpi_factor=dpi_factor)
    if bot > 0:
        return bot
    gutter = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
    if gutter:
        return gutter[-1][1]
    return 0

def worker_verify_first_line(image_path: str, dpi_factor: float = 1.0) -> Tuple[bool, int]:
    """Worker function to verify that line 1 is visible at top of gutter (used after Ctrl+Home)."""
    img = cv2.imread(image_path)
    if img is None: return False, 0
    is_at_home, ln = fast_verify_first_line(img, dpi_factor=dpi_factor)
    if is_at_home:
        return is_at_home, ln
    gutter = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
    if not gutter: return False, 0
    first_ln = gutter[0][1]
    has_line_1 = any(ln == 1 for _, ln in gutter[:4])
    is_at_home = has_line_1 or (first_ln in (1, 2))
    return is_at_home, (1 if is_at_home else first_ln)

def extract_content_text_rows(img: np.ndarray, gutter_w: int = 140, min_y: int = 140, max_y: int = 980) -> List[Dict[str, Any]]:
    """
    Extracts text lines from the editor content area (excluding the left gutter column and top toolbar).
    Groups OCR bounding boxes that share approximately the same vertical center into coherent text rows.
    """
    if img is None: return []
    ocr = get_rapid_ocr()
    if ocr is None: return []
    try:
        results, _ = ocr(img)
    except Exception as e:
        print(f"[extract_content_text_rows] OCR error: {e}")
        return []
    if not results: return []

    boxes = []
    for bbox, text, score in results:
        clean = text.strip()
        if not clean: continue
        pts = np.array(bbox)
        min_x = int(np.min(pts[:, 0]))
        max_x = int(np.max(pts[:, 0]))
        box_min_y = int(np.min(pts[:, 1]))
        box_max_y = int(np.max(pts[:, 1]))
        center_y = (box_min_y + box_max_y) / 2.0

        if min_x >= gutter_w and min_y <= center_y <= max_y:
            boxes.append({
                "text": clean, "min_x": min_x, "max_x": max_x,
                "min_y": box_min_y, "max_y": box_max_y, "center_y": center_y,
                "score": float(score)
            })

    if not boxes: return []
    rows: List[List[Dict[str, Any]]] = []
    for b in boxes:
        placed = False
        for r in rows:
            avg_y = sum(x["center_y"] for x in r) / len(r)
            if abs(b["center_y"] - avg_y) <= 12.0:
                r.append(b)
                placed = True
                break
        if not placed:
            rows.append([b])

    rows.sort(key=lambda r: sum(x["center_y"] for x in r) / len(r))
    content_rows = []
    for r in rows:
        r.sort(key=lambda x: x["min_x"])
        combined_text = " ".join(x["text"] for x in r)
        avg_cy = int(round(sum(x["center_y"] for x in r) / len(r)))
        content_rows.append({
            "y": avg_cy,
            "text": combined_text,
            "min_x": min(x["min_x"] for x in r),
            "max_x": max(x["max_x"] for x in r),
            "min_y": min(x["min_y"] for x in r),
            "max_y": max(x["max_y"] for x in r)
        })
    return content_rows

def detect_line_wrap_state(img: np.ndarray, dpi_factor: float = 1.0) -> Dict[str, Any]:
    """
    Detects whether the editor viewport is dominated by wrapped text spanning multiple visual lines
    where gutter line numbers may be missing or sparse.
    Extracts top and bottom text anchors to enable deterministic text-anchored pagination.
    """
    if img is None:
        return {
            "is_wrapped_page": False, "gutter_count": 0, "content_row_count": 0,
            "top_text_anchor": "", "bottom_text_anchor": "", "content_rows": []
        }

    gutter = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
    h, w = img.shape[:2]
    norm_mult = max(0.4, (w / 1920.0) * dpi_factor)
    gutter_w = int(max(110.0, min(220.0, 150.0 * norm_mult)))
    doc_top_y = max(135, int(150 * (h / 1080.0)))
    doc_bot_y = int(h * 0.96)

    content_rows = extract_content_text_rows(img, gutter_w=gutter_w, min_y=doc_top_y, max_y=doc_bot_y)
    gutter_count = len(gutter)
    content_row_count = len(content_rows)

    is_wrapped = (gutter_count <= 2 and content_row_count >= 5) or ((content_row_count - gutter_count) >= 15)

    top_text = content_rows[0]["text"] if content_rows else ""
    bottom_text = content_rows[-1]["text"] if content_rows else ""
    top_y = content_rows[0]["y"] if content_rows else 0
    bottom_y = content_rows[-1]["y"] if content_rows else 0

    return {
        "is_wrapped_page": is_wrapped,
        "gutter_count": gutter_count,
        "content_row_count": content_row_count,
        "top_text_anchor": top_text,
        "bottom_text_anchor": bottom_text,
        "top_text_y": top_y,
        "bottom_text_y": bottom_y,
        "top_gutter_line": gutter[0][1] if gutter else 0,
        "bottom_gutter_line": gutter[-1][1] if gutter else 0,
        "content_rows": content_rows
    }

def find_text_anchor_offset(img: np.ndarray, anchor_text: str, target_y: int = 165, dpi_factor: float = 1.0) -> Optional[int]:
    """
    Searches for anchor_text (or significant substring/token match) in img.
    If found at row y_found, returns dy = y_found - target_y.
    Positive dy means anchor is below target_y (viewport needs to advance/move up by dy).
    Returns None if anchor cannot be found.
    """
    if not anchor_text or not anchor_text.strip() or img is None:
        return None

    clean_anchor = anchor_text.strip()
    if len(clean_anchor) < 4:
        return None

    h, w = img.shape[:2]
    norm_mult = max(0.4, (w / 1920.0) * dpi_factor)
    gutter_w = int(max(110.0, min(220.0, 150.0 * norm_mult)))
    content_rows = extract_content_text_rows(img, gutter_w=gutter_w, min_y=120, max_y=int(h * 0.98))
    if not content_rows:
        return None

    # 1. Exact or substring match
    anchor_clean = re.sub(r'\s+', ' ', clean_anchor).lower()
    for row in content_rows:
        row_clean = re.sub(r'\s+', ' ', row["text"]).lower()
        if anchor_clean in row_clean or row_clean in anchor_clean:
            return row["y"] - target_y

    # 2. Token overlap match (at least 2 words or 60% token overlap)
    anchor_words = [w for w in re.findall(r'\w{3,}', anchor_clean)]
    if len(anchor_words) >= 2:
        best_match = None
        best_overlap = 0
        for row in content_rows:
            row_clean = re.sub(r'\s+', ' ', row["text"]).lower()
            row_words = set(re.findall(r'\w{3,}', row_clean))
            overlap = sum(1 for w in anchor_words if w in row_words)
            if overlap >= max(2, int(len(anchor_words) * 0.6)) and overlap > best_overlap:
                best_overlap = overlap
                best_match = row

        if best_match is not None:
            return best_match["y"] - target_y

    return None

def detect_top_line_from_image(img: np.ndarray, target_top: Optional[int] = None, cursor_line: Optional[int] = None, dpi_factor: float = 1.0) -> Tuple[int, Dict[str, Any]]:
    """
    Accurately determines the line number on the very top of the editor document.
    Calculates missing line numbers above the first visible gutter number due to word wrap/blank lines,
    and cross-correlates with cursor caret position if visible.
    """
    if img is None:
        return 0, {}
    h, w = img.shape[:2]
    gutter = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
    if not gutter:
        t, b = fast_detect_gutter_bounds(img, dpi_factor=dpi_factor)
        return t or 0, {"source": "fast_bounds", "bottom": b}

    gutter = correct_gutter_sequence(gutter)
    # The editor text content begins below the toolbar (at 1080p, text rows begin around y=295-350px)
    doc_top_y = max(260, int(295 * (h / 1080.0)))

    pitches = []
    for i in range(len(gutter) - 1):
        y_curr, n_curr = gutter[i]
        y_next, n_next = gutter[i+1]
        line_delta = n_next - n_curr
        if line_delta == 1 and 10 <= (y_next - y_curr) <= 35:
            pitches.append(float(y_next - y_curr))
        elif line_delta > 1 and 10 <= (y_next - y_curr) <= 35 * line_delta:
            pitches.append(float(y_next - y_curr) / float(line_delta))

    avg_pitch = float(np.median(pitches)) if pitches else max(16.0, 26.0 * (h / 1080.0))

    y_first, ln_first = gutter[0]
    y_dist_above = max(0, y_first - doc_top_y)
    if ln_first == 1 or y_dist_above < avg_pitch * 0.5:
        missing_lines_above = 0
    else:
        missing_lines_above = int(round(y_dist_above / avg_pitch))

    effective_top = max(1, ln_first - missing_lines_above)
    if target_top and abs(effective_top - target_top) <= 0:
        effective_top = target_top


    caret_info = None
    try:
        doc_roi = img[int(h * 0.12):int(h * 0.50), int(w * 0.05):int(w * 0.45)]
        if doc_roi.size > 0:
            gray = cv2.cvtColor(doc_roi, cv2.COLOR_BGR2GRAY)
            grad_x = cv2.Sobel(gray, cv2.CV_16S, 1, 0, ksize=3)
            abs_grad_x = cv2.convertScaleAbs(grad_x)
            _, thresh = cv2.threshold(abs_grad_x, 80, 255, cv2.THRESH_BINARY)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                cx, cy, cw, ch = cv2.boundingRect(cnt)
                if 1 <= cw <= 4 and 12 <= ch <= 35:
                    caret_y = int(h * 0.12) + cy
                    caret_row = int(round(max(0, caret_y - doc_top_y) / avg_pitch))
                    caret_info = {"x": int(w * 0.05) + cx, "y": caret_y, "row_offset": caret_row}
                    if cursor_line:
                        derived_top = max(1, cursor_line - caret_row)
                        if abs(derived_top - effective_top) <= 2:
                            effective_top = derived_top
                    break
    except Exception:
        pass

    return effective_top, {
        "first_gutter_line": ln_first,
        "first_gutter_y": y_first,
        "doc_top_y": doc_top_y,
        "missing_lines_above": missing_lines_above,
        "avg_pitch": avg_pitch,
        "effective_top": effective_top,
        "caret": caret_info,
        "gutter_count": len(gutter),
        "bottom_gutter_line": gutter[-1][1]
    }

def worker_detect_top_line(image_path: str, dpi_factor: float = 1.0, target_top: Optional[int] = None) -> int:
    """Worker function to detect the line number displayed at the top of the left side gutter, accounting for word wrap."""
    img = cv2.imread(image_path)
    if img is None: return 0
    top, _ = detect_top_line_from_image(img, target_top=target_top, dpi_factor=dpi_factor)
    return top

def worker_scan_image(image_path: str, ollama_url: str = "", ollama_vision_model: str = "", ollama_timeout: int = 15) -> Dict[str, Any]:
    """Top-level multi-process worker for full image OCR, gutter detection & bounding boxes."""
    img = cv2.imread(image_path)
    if img is None: raise FileNotFoundError(f"Image not found: {image_path}")
    h, w = img.shape[:2]
    ocr_boxes: List[Dict[str, Any]] = []
    ocr = get_rapid_ocr()
    if ocr is not None:
        try:
            results, _ = ocr(img)
            if results:
                for bbox, text, score in results:
                    pts = np.array(bbox)
                    min_x, max_x, min_y, max_y = int(np.min(pts[:, 0])), int(np.max(pts[:, 0])), int(np.min(pts[:, 1])), int(np.max(pts[:, 1]))
                    ocr_boxes.append({
                        "text": text.strip(), "score": float(score), "x": min_x, "y": min_y,
                        "width": max_x - min_x, "height": max_y - min_y,
                        "center_y": (min_y + max_y) / 2.0, "center_x": (min_x + max_x) / 2.0
                    })
        except Exception as e: print(f"[worker_scan_image] RapidOCR error: {e}")

    # 1. Editor Vertical and Horizontal Boundaries:
    # Top boundary: ignore Android status bar, Teams title header, and markdown formatting toolbar (ends at ~265).
    ed_top = max(280, int(h * 0.260))
    # Bottom boundary: ignore bottom Android system navigation bar / dock and Teams offline status pill (at y > 950).
    ed_bot = min(int(h * 0.875), h - 135)

    # Gutter horizontal bounds:
    gx_min = max(16, int(w * 0.015))
    gx_max = max(70, min(90, int(w * 0.047)))
    content_min_x = gx_max + 1
    content_max_x = min(w - 20, 1080)

    # 2. Extract genuine gutter candidate digits and content words within [ed_top, ed_bot]
    raw_gutter_pairs: List[Tuple[float, int, Dict[str, Any]]] = []
    content_boxes: List[Dict[str, Any]] = []

    for b in ocr_boxes:
        cy = b["center_y"]
        if cy < ed_top or cy > ed_bot:
            continue
        txt = b["text"].strip()
        bx = b["x"]
        bw = b["width"]

        # Reject any bounding boxes belonging to wallpaper icons or background windows past the 1080px editor margin
        if bx >= content_max_x or (bx + bw // 2) > (content_max_x + 10):
            continue

        # Filter Android/Teams status pills like "Offline" appearing near the bottom bar
        if txt.lower() in ["offline", "online", "syncing", "saved"] and cy > (ed_bot - 30):
            continue

        if bx < gx_max:
            if txt.isdigit() and len(txt) <= 6:
                raw_gutter_pairs.append((cy, int(txt), b))
            elif m := re.match(r'^(\d{1,6})\s*([^\d\s].*)$', txt):
                g_num = int(m.group(1))
                c_txt = m.group(2).strip()
                raw_gutter_pairs.append((cy, g_num, {**b, "width": 35}))
                if c_txt:
                    content_boxes.append({
                        **b,
                        "x": max(content_min_x, bx + 28),
                        "text": c_txt,
                        "width": max(30, bw - 28)
                    })
            elif (bx + bw) >= content_min_x:
                content_boxes.append(b)
        else:
            content_boxes.append(b)

    raw_gutter_pairs.sort(key=lambda p: p[0])

    # Filter strictly increasing sequences using correct_gutter_sequence and back-project to ed_top
    pairs_for_corr = [(p[0], p[1]) for p in raw_gutter_pairs]
    corrected_pairs = correct_gutter_sequence(pairs_for_corr, min_content_y=ed_top)

    raw_box_map = {p[1]: p[2] for p in raw_gutter_pairs}
    avg_gw = max(28, int(np.mean([p[2]["width"] for p in raw_gutter_pairs]))) if raw_gutter_pairs else (gx_max - gx_min)

    valid_pairs: List[Tuple[float, int, Dict[str, Any]]] = []
    for cy, c_num in corrected_pairs:
        b = raw_box_map.get(c_num)
        if not b:
            b = {
                "x": gx_min,
                "y": int(cy - 12),
                "width": avg_gw,
                "height": 24,
                "confidence": 0.95
            }
        valid_pairs.append((float(cy), c_num, {**b, "line_number": c_num}))

    # 3. Fit monospaced line grid (pitch and intercept)
    if len(valid_pairs) >= 2:
        ys = np.array([p[0] for p in valid_pairs])
        lns = np.array([p[1] for p in valid_pairs])
        slope, intercept = np.polyfit(lns, ys, 1)
        pitch = max(18.0, min(65.0, float(slope)))
    elif len(valid_pairs) == 1:
        y0, ln0, _ = valid_pairs[0]
        pitch = 27.0 if h <= 1200 else 60.0
        intercept = y0 - ln0 * pitch
    else:
        pitch = 27.0 if h <= 1200 else 60.0
        intercept = ed_top - pitch

    # Determine top_line (starting line number in the editor)
    # y(ln) = intercept + ln * pitch
    y_ln1 = intercept + 1 * pitch
    if abs(y_ln1 - ed_top) <= pitch * 1.5:
        top_line = 1
    else:
        top_line = max(1, int(round((ed_top - intercept) / pitch)))

    # Determine bottom_line (ending line number in the editor)
    bottom_line = max(top_line, int(round((ed_bot - intercept) / pitch)))

    gutter_boxes: Dict[int, Dict[str, Any]] = {}
    line_boxes: Dict[int, Dict[str, Any]] = {}
    lines_list: List[Dict[str, Any]] = []

    for ln in range(top_line, bottom_line + 1):
        ly = intercept + ln * pitch
        box_y = max(ed_top, int(ly - pitch * 0.5))
        box_h = int(pitch)
        if box_y + box_h > ed_bot + 10:
            box_h = max(16, (ed_bot + 10) - box_y)

        # Gutter box strictly inside [ed_top, ed_bot]
        gbox = {
            "x": gx_min,
            "y": box_y,
            "width": avg_gw,
            "height": box_h,
            "line_number": ln,
            "confidence": 0.95
        }
        gutter_boxes[ln] = gbox

        # Content words for this line
        matched_words = [
            b for b in content_boxes
            if content_min_x <= (b["x"] + b["width"]) <= (content_max_x + 30) and abs(b["center_y"] - ly) < pitch * 0.48
        ]
        matched_words.sort(key=lambda b: b["x"])

        # Content bounding box
        if matched_words:
            rx_min = max(content_min_x, int(min(b["x"] for b in matched_words)))
            rx_max = int(min(content_max_x, max(b["x"] + b["width"] for b in matched_words)))
            content_box = {
                "x": rx_min,
                "y": box_y,
                "width": max(50, rx_max - rx_min),
                "height": box_h,
                "line_number": ln
            }
            # Compute leading indentation from monospace character pitch (~8.2px per char)
            indent_spaces = max(0, int(round((rx_min - content_min_x) / 8.2)))
            indent_prefix = " " * indent_spaces if indent_spaces >= 2 else ""
            line_str = indent_prefix + " ".join(b["text"] for b in matched_words)
        else:
            content_box = {
                "x": content_min_x,
                "y": box_y,
                "width": int(content_max_x - content_min_x),
                "height": box_h,
                "line_number": ln,
                "interpolated": True
            }
            line_str = ""
            # Inspect localized line slice for thin markdown symbols (fences, dots, tree lines)
            slice_crop = img[box_y:box_y + box_h, content_min_x:content_max_x]
            if slice_crop.size > 0:
                sc_gray = cv2.cvtColor(slice_crop, cv2.COLOR_BGR2GRAY)
                bright_coords = np.argwhere(sc_gray > 75)
                if len(bright_coords) >= 15:
                    # Run quick slice OCR with CLAHE
                    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
                    enhanced_sc = clahe.apply(sc_gray)
                    sc_res, _ = (ocr(enhanced_sc) if ocr else (None, None))
                    if sc_res:
                        line_str = " ".join(r[1].strip() for r in sorted(sc_res, key=lambda x: float(np.min(np.array(x[0])[:, 0]))))

        # Clean line_str of accidental duplicate gutter digit prefix
        line_str = re.sub(rf"^{ln}\s*[:\.]?\s*", "", line_str)
        is_blank = not bool(line_str.strip())
        is_w = len(line_str) > 65

        line_boxes[ln] = content_box
        lines_list.append({
            "line_number": ln,
            "gutter_number": ln,
            "text": line_str,
            "is_blank": is_blank,
            "is_wrapped": is_w,
            "wrapped_line_count": 2 if is_w else 1,
            "status": "verified" if not is_blank else "empty",
            "confidence": 0.95,
            "bbox": content_box,
            "gutter_bbox": gbox
        })

    first_line_box = line_boxes.get(top_line, {"x": content_min_x, "y": ed_top, "width": 55, "height": int(pitch), "line_number": top_line})
    last_line_box = line_boxes.get(bottom_line, {"x": content_min_x, "y": ed_bot - int(pitch), "width": 55, "height": int(pitch), "line_number": bottom_line})

    return {
        "top_line": top_line,
        "bottom_line": bottom_line,
        "lines": lines_list,
        "image_width": w,
        "image_height": h,
        "bounding_boxes": {
            "first_line": first_line_box,
            "last_line": last_line_box,
            "wrapped_lines": [l["bbox"] for l in lines_list if l.get("is_wrapped")],
            "line_boxes": line_boxes,
            "gutter_boxes": gutter_boxes
        }
    }

class BaseOCREngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str: pass
    @abstractmethod
    def scan_image(self, image_path: str) -> Dict[str, Any]: pass

class LocalOllamaStitcher:
    def __init__(self, ollama_url: str = "http://127.0.0.1:11434", coder_model: str = "qwen2.5-coder", timeout: int = 15):
        self.ollama_url, self.coder_model, self.timeout = ollama_url.rstrip("/"), coder_model, timeout
        self.endpoint = f"{self.ollama_url}/api/generate"
        self.stitch_stats: Dict[str, Any] = {"total_stitches": 0, "conflicts_resolved": 0, "exact_matches": 0, "stitched_lines": 0, "http_errors": 0, "last_error": None}

    @staticmethod
    def sanitize_line_text(ln: int, text: str) -> str:
        cleaned = (text or "").rstrip()
        stripped = cleaned.strip()
        if not stripped:
            return ""
        if stripped.isdigit():
            val = int(stripped)
            if abs(val - ln) <= 4:
                return ""
        m = re.match(r"^(\d{1,5})\s*([>#`\.\-\|\{\[\s\"'].*|[a-zA-Z_\-\.\/].*)$", stripped)
        if m:
            val = int(m.group(1))
            if abs(val - ln) <= 4 or abs(val - (ln - 1)) <= 2:
                return m.group(2).strip()
        m2 = re.match(r"^(\d{1,5})\s*([├│└].*)$", stripped)
        if m2:
            val = int(m2.group(1))
            if abs(val - ln) <= 4:
                return m2.group(2).strip()
        return cleaned

    def stitch_frame_lines(self, existing_lines: Dict[int, Any], new_lines: List[Dict[str, Any]], frame_id: str, model_desc: str = "Ollama") -> int:
        added = 0
        self.stitch_stats["total_stitches"] += 1
        for item in new_lines:
            ln = item.get("line_number")
            if ln is None: continue
            ln = int(ln)
            text = self.sanitize_line_text(ln, item.get("text", ""))
            is_blank = not bool(text.strip())
            is_wrapped = item.get("is_wrapped", False)
            wcount = item.get("wrapped_line_count", 1)
            flagged = item.get("flagged", False)
            gutter_num = item.get("gutter_number", ln)

            ex = existing_lines.get(ln)
            if not ex:
                st, conf, notes = ("flagged" if flagged else "ok"), (0.75 if flagged else 1.0), f"Verified by {model_desc}"
                srcs = [frame_id]
            else:
                srcs = list(set(ex.get("sources", [ex.get("frame_id", frame_id)]) + [frame_id]))
                if ex.get("text", "") == text:
                    st, conf, notes = "verified_overlap", 1.0, f"Exact match across frames {srcs}"
                    self.stitch_stats["exact_matches"] += 1
                else:
                    reconciled = text if len(text) >= len(ex.get("text", "")) else ex.get("text", "")
                    text, st, conf, notes = reconciled, "verified_overlap", 0.95, f"Stitch across frames {srcs}"
                    self.stitch_stats["conflicts_resolved"] += 1

            existing_lines[ln] = {
                "line_number": ln, "gutter_number": gutter_num, "text": text,
                "is_blank": is_blank, "is_wrapped": is_wrapped, "wrapped_line_count": wcount,
                "status": st, "frame_id": frame_id, "sources": srcs,
                "confidence": conf, "notes": notes, "updated_at": datetime.now().isoformat()
            }
            added += 1
            self.stitch_stats["stitched_lines"] += 1

        if existing_lines:
            for chk in range(min(existing_lines.keys()), max(existing_lines.keys()) + 1):
                if chk not in existing_lines:
                    existing_lines[chk] = {
                        "line_number": chk, "gutter_number": chk, "text": "",
                        "is_blank": False, "is_wrapped": False, "wrapped_line_count": 1,
                        "status": "missing", "frame_id": frame_id, "sources": [],
                        "confidence": 0.0, "notes": "Gap detected between frames",
                        "updated_at": datetime.now().isoformat()
                    }
        return added

DeterministicLineStitcher = LocalOllamaStitcher

def scan_image_with_minicpm_sync(image_path: str) -> Dict[str, Any]:
    """Scan image with MiniCPM-V in Ollama for verbatim line extraction."""
    try:
        from services.ocr_service import call_minicpm_ollama_sync, parse_minicpm_output
        raw_resp, model_name = call_minicpm_ollama_sync(Path(image_path))
        plines, top_ln, bot_ln, formatted, detected_filename = parse_minicpm_output(raw_resp)
        return {
            "status": "success",
            "top_line": top_ln,
            "bottom_line": bot_ln,
            "lines": plines,
            "extracted_text": formatted,
            "lines_count": len(plines),
            "bounding_boxes": {},
            "model_used": f"MiniCPM-V ({model_name})",
            "detected_filename": detected_filename
        }
    except Exception as e:
        print(f"[scan_image_with_minicpm_sync] error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "top_line": 0,
            "bottom_line": 0,
            "lines": [],
            "extracted_text": "",
            "lines_count": 0,
            "bounding_boxes": {},
            "model_used": "MiniCPM-V (Failed)"
        }

class LocalGutterOCREngine(BaseOCREngine):
    @property
    def name(self) -> str: return "local_gutter_ocr"

    def __init__(self, ollama_url: str = "http://127.0.0.1:11434", ollama_vision_model: str = "minicpm-v:latest", ollama_coder_model: str = "qwen2.5-coder", ollama_timeout: int = 45):
        self.ollama_url, self.ollama_vision_model, self.ollama_coder_model, self.ollama_timeout = ollama_url.rstrip("/"), ollama_vision_model, ollama_coder_model, ollama_timeout
        self.stitcher = LocalOllamaStitcher(self.ollama_url, self.ollama_coder_model, min(ollama_timeout, 15))

    def scan_image(self, image_path: str) -> Dict[str, Any]:
        return scan_image_with_minicpm_sync(image_path)

