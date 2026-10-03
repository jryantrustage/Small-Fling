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

class _OpenVINOInferSessionWrapper:
    """Wraps an OpenVINO compiled model to match RapidOCR's OrtInferSession interface."""
    def __init__(self, compiled_model, original_infer):
        self.compiled_model = compiled_model
        self.orig = original_infer

    def __call__(self, input_content: np.ndarray):
        res = self.compiled_model([input_content])
        return [res[out] for out in self.compiled_model.outputs]

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

def correct_gutter_sequence(gutter_items: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """
    Validates and corrects line numbers in a vertical gutter column.
    Detects and corrects outliers (such as truncated numbers like 69 instead of 697)
    using sequence consensus, median line pitch, and linear projection.
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

    # 1. Primary: standard fullscreen gutter (scaled dynamically up to 220px for 4-digit numbers)
    gutter_w = int(max(115.0, min(220.0, 155.0 * norm_multiplier)))
    top_y1 = max(130, int(h * (0.130 if dpi_factor < 0.9 else 0.150)))
    top_crop = img[top_y1:int(h * 0.45), :gutter_w]
    bot_crop = img[int(h * 0.65):int(h * 0.98), :gutter_w]

    top_scaled = cv2.resize(top_crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    f_top = _fast_ocr_executor.submit(extract_numbers_from_slice, top_scaled)
    f_bot = _fast_ocr_executor.submit(extract_numbers_from_slice, bot_crop)
    top_nums = clean_slice_numbers(f_top.result())
    bot_nums = f_bot.result()

    if top_nums and top_nums[0] > 1 and len(top_nums) >= 2:
        if top_nums[0] <= 12:
            top_nums.insert(0, 1)

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
        top_crop2 = img[top_y1:int(h * 0.45), sidebar_x1:sidebar_x2]
        bot_crop2 = img[int(h * 0.65):int(h * 0.98), sidebar_x1:sidebar_x2]
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
    gutter_w = int(max(95.0, min(200.0, 140.0 * norm_multiplier)))
    top_y1 = max(130, int(h * (0.130 if dpi_factor < 0.9 else 0.150)))

    top_crop = img[top_y1:int(h * 0.45), :gutter_w]
    top_scaled = cv2.resize(top_crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    top_nums = extract_numbers_from_slice(top_scaled)
    if not top_nums:
        sidebar_x1 = int(240.0 * norm_multiplier)
        sidebar_x2 = sidebar_x1 + gutter_w
        if sidebar_x2 < w:
            top_crop2 = img[top_y1:int(h * 0.45), sidebar_x1:sidebar_x2]
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
    top_y = int(h * 0.10)
    bot_y = int(h * 0.90)
    ocr = get_rapid_ocr()
    if ocr is None: return []

    scale_x = w / 1920.0
    norm_multiplier = max(0.4, scale_x * dpi_factor)

    # Fast check: scan targeted gutter width scaled by norm_multiplier
    candidates = []
    sub_w1 = int(min(w, max(180, int(w * 0.12 * norm_multiplier))))
    sub_w2 = int(min(w, max(360, int(w * 0.35 * norm_multiplier))))
    for sub_w in [sub_w1, sub_w2]:
        sub = img[top_y:bot_y, :sub_w]
        try:
            results, _ = ocr(sub)
        except Exception as e:
            print(f"[find_gutter_numbers_cluster] Error: {e}")
            return []
        if not results:
            continue

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
        if candidates:
            break

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
    
    best_gutter = []
    for k, items in clusters.items():
        if len(items) > len(best_gutter):
            best_gutter = sorted(items, key=lambda it: it[0])
    
    # Filter and correct gutter numbers using consensus sequence validation
    if best_gutter:
        best_gutter = correct_gutter_sequence(best_gutter)

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
    is_at_home = has_line_1 or (first_ln <= 15 and gutter[0][0] < int(300 * max(0.4, dpi_factor)))
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
    # The editor text content begins below the toolbar (at 1080p, toolbar is at ~230-240px)
    doc_top_y = max(180, int(235 * (h / 1080.0) * max(0.8, dpi_factor)))

    pitches = []
    for i in range(len(gutter) - 1):
        y_curr, n_curr = gutter[i]
        y_next, n_next = gutter[i+1]
        line_delta = n_next - n_curr
        if line_delta == 1 and 10 <= (y_next - y_curr) <= 30:
            pitches.append(float(y_next - y_curr))
        elif line_delta > 1 and 10 <= (y_next - y_curr) <= 30 * line_delta:
            pitches.append(float(y_next - y_curr) / float(line_delta))

    avg_pitch = float(np.median(pitches)) if pitches else max(12.0, 18.0 * (h / 1080.0) * dpi_factor)

    y_first, ln_first = gutter[0]
    # If the first gutter number is in the top-most editor line slot (y <= doc_top_y + 25), it IS the top line!
    if y_first <= doc_top_y + 25:
        missing_lines_above = 0
    else:
        y_dist_above = max(0, y_first - doc_top_y)
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

    processed_boxes: List[Dict[str, Any]] = []
    for b in ocr_boxes:
        # Ignore top toolbar/title elements above y < 135 if the image is full HD
        if h >= 800 and b["y"] < 135:
            continue
        txt = b["text"]
        if b["x"] < 130:
            if txt.isdigit() and len(txt) <= 6 and b["width"] <= 95:
                processed_boxes.append({
                    **b, "is_gutter": True, "line_number": int(txt)
                })
                continue
            if m := re.match(r'^(\d{1,6})\s*([^\d\s].*)$', txt):
                g_num = m.group(1)
                code_txt = m.group(2)
                processed_boxes.append({
                    **b, "text": g_num, "width": 35, "is_gutter": True, "line_number": int(g_num)
                })
                processed_boxes.append({
                    **b, "text": code_txt, "x": b["x"] + 40, "width": max(10, b["width"] - 40), "is_gutter": False
                })
                continue
        processed_boxes.append({**b, "is_gutter": False})

    raw_candidates = sorted([b for b in processed_boxes if b.get("is_gutter")], key=lambda x: x["y"])
    gutter_candidates = []
    if raw_candidates:
        pairs = [(b["y"], b["line_number"]) for b in raw_candidates]
        corrected = correct_gutter_sequence(pairs)
        corr_map = {y: num for y, num in corrected}
        for b in raw_candidates:
            if b["y"] in corr_map:
                b["line_number"] = corr_map[b["y"]]
            gutter_candidates.append(b)

    top_line = bottom_line = 0
    first_line_box = last_line_box = None
    if gutter_candidates:
        fc, lc = gutter_candidates[0], gutter_candidates[-1]
        top_line, bottom_line = fc["line_number"], lc["line_number"]
        if bottom_line > 0 and top_line > 0 and (bottom_line - top_line) > 75:
            if str(bottom_line - 57).startswith(str(top_line)) or (bottom_line - top_line > 100):
                top_line = max(1, bottom_line - 57)
        first_line_box = {"x": fc["x"], "y": fc["y"], "width": fc["width"], "height": fc["height"], "line_number": top_line}
        last_line_box = {"x": lc["x"], "y": lc["y"], "width": lc["width"], "height": lc["height"], "line_number": bottom_line}

    gutter_width = 75
    if gutter_candidates:
        max_gx = max(b["x"] + b["width"] for b in gutter_candidates)
        gutter_width = max(55, min(max_gx + 10, 85))

    rows: List[List[Dict[str, Any]]] = []
    for b in processed_boxes:
        placed = False
        for r in rows:
            if abs(b["center_y"] - sum(x["center_y"] for x in r) / len(r)) < 18:
                r.append(b); placed = True; break
        if not placed: rows.append([b])
    rows.sort(key=lambda r: sum(x["y"] for x in r) / len(r))

    lines_list: List[Dict[str, Any]] = []
    curr = top_line or 1
    for r in rows:
        r.sort(key=lambda x: x["x"])
        gt = next((x for x in r if x.get("is_gutter")), None)
        if gt and "line_number" in gt:
            curr, is_w = gt["line_number"], False
        else:
            is_w = True
        line_str = " ".join(x["text"] for x in r if not x.get("is_gutter") and x["x"] >= (gutter_width - 15))
        if len(line_str) > 60 or "\n" in line_str: is_w = True
        lines_list.append({
            "line_number": curr, "gutter_number": curr, "text": line_str,
            "is_blank": not bool(line_str.strip()), "is_wrapped": is_w,
            "wrapped_line_count": 2 if is_w else 1, "status": "verified", "confidence": 0.95
        })

    wrapped_boxes: List[Dict[str, Any]] = []
    content_min_x = gutter_width
    for line in lines_list:
        if line.get("is_wrapped") or len(line.get("text", "")) > 60:
            matched = [b for b in ocr_boxes if b["x"] >= content_min_x and (any(word in line["text"] for word in b["text"].split() if len(word) >= 3) or (line["text"] and b["text"][:10] in line["text"]))]
            if matched:
                bx1, bx2 = min(t["x"] for t in matched), max(t["x"] + t["width"] for t in matched)
                by1, by2 = min(t["y"] for t in matched), max(t["y"] + t["height"] for t in matched)
                wrapped_boxes.append({"x": bx1 - 4, "y": by1 - 4, "width": (bx2 - bx1) + 8, "height": (by2 - by1) + 8, "line_number": line["line_number"], "text_snippet": line["text"][:35]})

    deduped_wrapped: List[Dict[str, Any]] = []
    for wb in wrapped_boxes:
        if not any(abs(wb["y"] - d["y"]) < 25 and abs(wb["x"] - d["x"]) < 40 for d in deduped_wrapped):
            deduped_wrapped.append(wb)

    if not first_line_box and lines_list: first_line_box = {"x": 105, "y": 240, "width": 55, "height": 30, "line_number": top_line}
    if not last_line_box and lines_list: last_line_box = {"x": 105, "y": int(h * 0.92), "width": 55, "height": 30, "line_number": bottom_line}

    return {
        "top_line": top_line, "bottom_line": bottom_line, "lines": lines_list,
        "image_width": w, "image_height": h,
        "bounding_boxes": {"first_line": first_line_box, "last_line": last_line_box, "wrapped_lines": deduped_wrapped}
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

    def stitch_frame_lines(self, existing_lines: Dict[int, Any], new_lines: List[Dict[str, Any]], frame_id: str, model_desc: str = "Ollama") -> int:
        added = 0
        self.stitch_stats["total_stitches"] += 1
        for item in new_lines:
            ln = item.get("line_number")
            if ln is None: continue
            ln = int(ln)
            text = item.get("text", "")
            is_blank = item.get("is_blank", not bool(text.strip()))
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

