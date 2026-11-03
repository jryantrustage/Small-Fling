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

def extract_numbers_from_slice(crop: np.ndarray, max_x_min: Optional[int] = None) -> List[int]:
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
        clean = text.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1').replace('/', '7').replace('|', '1')
        clean = re.sub(r'(\d)\s+(\d)', r'\1\2', clean)
        if m := re.search(r'^(\d+)', clean):
            try:
                n = int(m.group(1))
                if 0 < n < 2000000:
                    pts = np.array(bbox)
                    x_min = int(np.min(pts[:, 0])) if pts.ndim == 2 else 0
                    if max_x_min is not None and x_min > max_x_min:
                        continue
                    y_min = int(np.min(pts[:, 1])) if pts.ndim == 2 else 0
                    nums.append((y_min, n))
            except Exception: pass
    nums.sort(key=lambda x: x[0])
    return [n for _, n in nums]

def correct_gutter_sequence(gutter_items: List[Tuple[int, int]], min_content_y: int = 295) -> List[Tuple[int, int]]:
    """
    Validates and corrects line numbers in a vertical gutter column while preserving
    legitimate wrapped-line sequences (where dy between consecutive line numbers n and n+1
    is a multiple of the visual row pitch ~27px).
    Detects and corrects OCR outliers (such as truncated numbers like 69 instead of 697
    or 11 instead of 119) using dynamic-programming monotonic sequence consensus.
    """
    if not gutter_items:
        return []
    raw_sorted = sorted(gutter_items, key=lambda it: it[0])
    if len(raw_sorted) <= 1:
        return raw_sorted

    # 0. Deduplicate multiple OCR boxes on the exact same visual row (abs(dy) < 14px)
    sorted_items: List[Tuple[int, int]] = []
    for y_pos, num in raw_sorted:
        if sorted_items and abs(y_pos - sorted_items[-1][0]) < 14:
            # Keep the candidate with more digits (less likely to be a truncated fragment)
            if len(str(num)) > len(str(sorted_items[-1][1])):
                sorted_items[-1] = (y_pos, num)
        else:
            sorted_items.append((y_pos, num))

    if len(sorted_items) <= 1:
        return sorted_items

    # 1. Estimate single visual row pitch (~27px at 1080p)
    row_pitches = []
    for i in range(len(sorted_items) - 1):
        dy = sorted_items[i + 1][0] - sorted_items[i][0]
        dn = sorted_items[i + 1][1] - sorted_items[i][1]
        if 18 <= dy <= 34:
            row_pitches.append(float(dy))
        elif dn > 0 and 18 <= (dy / dn) <= 32:
            row_pitches.append(float(dy) / float(dn))
    row_pitch = float(np.median(row_pitches)) if row_pitches else 27.0

    # 2. Find the highest-scoring chain of mutually consistent gutter numbers (handles wrapped lines!)
    n_items = len(sorted_items)
    dp_score = [10] * n_items
    dp_prev = [-1] * n_items

    for j in range(n_items):
        yj, nj = sorted_items[j]
        for i in range(j):
            yi, ni = sorted_items[i]
            dy = yj - yi
            if dy < 14:
                continue
            visual_rows = max(1, int(round(dy / row_pitch)))
            dn = nj - ni
            idx_step = j - i
            # Valid progression: line number increases by at least 1 per distinct gutter row
            # and by at most visual_rows + 1 (since each logical line occupies >= 1 visual row).
            if idx_step <= dn <= (visual_rows + 1):
                if idx_step == 1 and dn == 1:
                    bonus = 100
                elif dn == idx_step:
                    bonus = 85
                elif abs(dn - visual_rows) <= 1:
                    bonus = 65
                else:
                    bonus = 40
                cand_score = dp_score[i] + bonus
                if cand_score >= dp_score[j]:
                    dp_score[j] = cand_score
                    dp_prev[j] = i

    best_end = int(np.argmax(dp_score))
    inlier_indices = []
    curr = best_end
    while curr != -1:
        inlier_indices.append(curr)
        curr = dp_prev[curr]
    inlier_indices.reverse()
    inlier_set = set(inlier_indices)

    # 3. Preserve all inlier numbers verbatim; repair only genuine OCR outliers
    cleaned: List[Tuple[int, int]] = []
    first_inlier = inlier_indices[0]
    last_inlier = inlier_indices[-1]

    for idx, (y_pos, num) in enumerate(sorted_items):
        if idx in inlier_set:
            cleaned.append((y_pos, num))
            continue

        if idx < first_inlier:
            y_ref, n_ref = sorted_items[first_inlier]
            step_rows = first_inlier - idx
            seq_est = max(1, n_ref - step_rows)
            pitch_est = max(1, int(round(n_ref - (y_ref - y_pos) / row_pitch)))
            if (y_ref - y_pos) <= 3.5 * row_pitch * step_rows or str(seq_est).startswith(str(num)) or str(seq_est).endswith(str(num)):
                cleaned.append((y_pos, seq_est))
            else:
                cleaned.append((y_pos, pitch_est))
        elif idx > last_inlier:
            y_ref, n_ref = sorted_items[last_inlier]
            step_rows = idx - last_inlier
            seq_est = n_ref + step_rows
            pitch_est = n_ref + max(1, int(round((y_pos - y_ref) / row_pitch)))
            # Each gutter entry is drawn on the first visual row of the next logical line
            if (y_pos - y_ref) <= 5.5 * row_pitch * step_rows or str(seq_est).startswith(str(num)) or str(seq_est).endswith(str(num)):
                cleaned.append((y_pos, seq_est))
            else:
                cleaned.append((y_pos, pitch_est))
        else:
            # Outlier bounded between two inliers i_prev < idx < i_next
            i_prev = max(i for i in inlier_indices if i < idx)
            i_next = min(i for i in inlier_indices if i > idx)
            y_p, n_p = sorted_items[i_prev]
            y_n, n_n = sorted_items[i_next]
            if (n_n - n_p) == (i_next - i_prev):
                cleaned.append((y_pos, n_p + (idx - i_prev)))
            else:
                interp = int(round(n_p + (n_n - n_p) * ((y_pos - y_p) / max(1.0, float(y_n - y_p)))))
                cleaned.append((y_pos, max(n_p + 1, min(n_n - 1, interp))))

    # 4. Only prepend Line 1 if Line 2 is on the 2nd visual row and narrow single-digit '1' was missed
    if cleaned and cleaned[0][1] == 2:
        first_y, _ = cleaned[0]
        if (min_content_y + 18) <= first_y <= (min_content_y + 52):
            proj_y = max(min_content_y, int(round(first_y - row_pitch)))
            cleaned.insert(0, (proj_y, 1))

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
    # Check if last element is a truncated prefix of second-to-last element + 1 (e.g. 118, 11 -> 119)
    if res[-2] > 10 and res[-1] < res[-2]:
        expected_last = res[-2] + 1
        if str(expected_last).startswith(str(res[-1])) or res[-2] - res[-1] >= 5:
            res[-1] = expected_last
    return res

def fast_detect_gutter_bounds(img: np.ndarray, dpi_factor: float = 1.0) -> Tuple[int, int]:
    """
    Rapidly extracts top line and bottom line from the editor gutter.
    Uses full-column sequence consensus on the primary gutter strip first so right-aligned
    multi-digit numbers (up to x=99 at 220 DPI) are never truncated at x=90 and bottom-border
    digits have sufficient padding for detection.
    """
    if img is None: return 0, 0
    gutter = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
    if len(gutter) >= 2:
        t_c, b_c = gutter[0][1], gutter[-1][1]
        if 0 < t_c <= b_c and (b_c - t_c) <= 75:
            return t_c, b_c

    h, w = img.shape[:2]
    scale_x = w / 1920.0
    norm_multiplier = max(0.4, scale_x * dpi_factor)

    # 1. Primary: standard fullscreen gutter with generous right padding (x <= 145) and x_min filter (x_min <= 96)
    gutter_w = int(max(125.0, min(145.0, 115.0 * norm_multiplier)))
    max_gutter_xmin = int(96 * scale_x)
    top_y1 = max(275, int(h * 0.255))
    top_y2 = min(h - 150, int(h * 0.65))
    top_crop = img[top_y1:top_y2, :gutter_w]
    bot_y1 = int(h * 0.55)
    bot_y2 = min(int(h * 0.898), h - 110)
    bot_crop = img[bot_y1:bot_y2, :gutter_w]

    top_scaled = cv2.resize(top_crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    f_top = _fast_ocr_executor.submit(extract_numbers_from_slice, top_scaled, int(max_gutter_xmin * 1.5))
    f_bot = _fast_ocr_executor.submit(extract_numbers_from_slice, bot_crop, max_gutter_xmin)
    top_nums = clean_slice_numbers(f_top.result())
    bot_nums = clean_slice_numbers(f_bot.result())

    if top_nums and bot_nums:
        t, b = top_nums[0], bot_nums[-1]
        if b > 0 and t > 0 and (b - t) > 75:
            if str(b - 57).startswith(str(t)) or (b - t > 100):
                t = max(1, b - 57)
        if 0 < t <= b:
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
        bot_nums2 = clean_slice_numbers(f_bot2.result())
        if top_nums2 and top_nums2[0] > 1 and len(top_nums2) >= 2:
            if top_nums2[0] <= 12:
                top_nums2.insert(0, 1)
        if top_nums2 and bot_nums2:
            t2, b2 = top_nums2[0], bot_nums2[-1]
            if b2 > 0 and t2 > 0 and (b2 - t2) > 75:
                if str(b2 - 57).startswith(str(t2)) or (b2 - t2 > 100):
                    t2 = max(1, b2 - 57)
            if 0 < t2 <= b2:
                return t2, b2

    if gutter:
        return gutter[0][1], gutter[-1][1]

    # Return partial if either top or bot detected, ensuring bot is never an inverted truncation < top
    t = (top_nums or (top_nums2 if 'top_nums2' in locals() else []) or [0])[0]
    b = (bot_nums or (bot_nums2 if 'bot_nums2' in locals() else []) or [0])[-1]
    if b > 0 and t > 0 and b < t:
        b = 0
    return t, b

def fast_verify_first_line(img: np.ndarray, dpi_factor: float = 1.0) -> Tuple[bool, int]:
    """Rapidly checks whether Line 1 (or <= 15) is visible at top gutter slice using normalized DPI scaling."""
    if img is None: return False, 0
    h, w = img.shape[:2]
    scale_x = w / 1920.0
    norm_multiplier = max(0.4, scale_x * dpi_factor)
    gutter_w = int(max(115.0, min(240.0, 125.0 * norm_multiplier)))
    top_y1 = max(275, int(h * 0.255))
    top_y2 = min(h - 150, int(h * 0.60))

    top_crop = img[top_y1:top_y2, :gutter_w]
    top_scaled = cv2.resize(top_crop, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    top_nums = extract_numbers_from_slice(top_scaled, int(96 * scale_x * 1.5))
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

_last_gutter_offline_info: Dict[str, Any] = {
    "detected": False,
    "offline_detected": False,
    "text": "",
    "confidence": 0.0,
    "bbox": [],
    "last_visible_line_above_pill": 0,
    "occluded_lines_allowance": 3,
}


def detect_offline_editor_overlay(image_or_bytes: Any, use_ocr: bool = True) -> Dict[str, Any]:
    """
    Detects the floating '[cloud-slash icon] Offline' badge in the bottom-left corner of the
    Teams Markdown Editor (which appears after a file remains open for a period of time and
    occludes the bottom 3 gutter line numbers, e.g. showing line 32878 as the last visible line
    when total_lines is 32881).
    """
    global _last_gutter_offline_info
    default_res = {
        "detected": False,
        "offline_detected": False,
        "text": "",
        "confidence": 0.0,
        "bbox": [],
        "last_visible_line_above_pill": 0,
        "occluded_lines_allowance": 3,
    }
    try:
        img = None
        if isinstance(image_or_bytes, (str, Path)):
            img = cv2.imread(str(image_or_bytes))
        elif isinstance(image_or_bytes, (bytes, bytearray)):
            if len(image_or_bytes) >= 1000:
                img = cv2.imdecode(np.frombuffer(image_or_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        elif isinstance(image_or_bytes, np.ndarray):
            img = image_or_bytes

        if img is None or img.size == 0:
            return default_res

        h, w = img.shape[:2]
        sx = w / 1920.0
        sy = h / 1080.0

        # 1. Fast CV check on the bottom-left pill area (y: 890..985, x: 16..158 at 1080p)
        py1, py2 = max(0, int(round(935 * sy))), min(h, int(round(982 * sy)))
        px1, px2 = max(0, int(round(20 * sx))), min(w, int(round(150 * sx)))
        pill_crop = img[py1:py2, px1:px2]

        by1, by2 = max(0, int(round(875 * sy))), min(h, int(round(915 * sy)))
        bx1, bx2 = max(0, int(round(190 * sx))), min(w, int(round(300 * sx)))
        bg_crop = img[by1:by2, bx1:bx2]

        cv_pill_detected = False
        if pill_crop.size > 0 and bg_crop.size > 0:
            pill_med = np.median(pill_crop, axis=(0, 1))
            bg_med = np.median(bg_crop, axis=(0, 1))
            # Neutral dark-gray pill (~[41,41,41]) contrasting against editor bg (~[31,31,31])
            luma_diff = float(np.mean(pill_med) - np.mean(bg_med))
            is_neutral = abs(float(pill_med[0]) - float(pill_med[2])) <= 8.0
            pill_gray = cv2.cvtColor(pill_crop, cv2.COLOR_BGR2GRAY)
            bright_px = int(np.sum(pill_gray > 100))
            if 5.5 <= luma_diff <= 32.0 and is_neutral and bright_px >= max(12, int(35 * sx * sy)):
                cv_pill_detected = True

        # 2. RapidOCR check on bottom-left gutter + pill ROI (y: 855..988, x: 5..235 at 1080p)
        ocr_detected = False
        matched_text = ""
        matched_conf = 0.0
        matched_bbox: List[int] = [px1, py1, max(1, px2 - px1), max(1, py2 - py1)]
        last_vis_ln = 0

        if use_ocr:
            ocr = get_rapid_ocr()
            if ocr is not None:
                ry1, ry2 = max(0, int(round(855 * sy))), min(h, int(round(988 * sy)))
                rx1, rx2 = max(0, int(round(5 * sx))), min(w, int(round(235 * sx)))
                roi = img[ry1:ry2, rx1:rx2]
                if roi.size > 0:
                    res, _ = ocr(roi)
                    if res:
                        for box, txt, score in res:
                            clean = str(txt).strip()
                            low = clean.lower()
                            pts = np.array(box)
                            bx_min = rx1 + int(np.min(pts[:, 0]))
                            by_min = ry1 + int(np.min(pts[:, 1]))
                            bw_box = int(np.max(pts[:, 0]) - np.min(pts[:, 0]))
                            bh_box = int(np.max(pts[:, 1]) - np.min(pts[:, 1]))
                            if any(k in low for k in ("offline", "offlin", "ffline", "offl")):
                                ocr_detected = True
                                matched_text = clean
                                matched_conf = float(score)
                                matched_bbox = [bx_min, by_min, bw_box, bh_box]
                            elif bx_min <= int(105 * sx):
                                clean_num = clean.replace("B", "8").replace("O", "0").replace("o", "0").replace("I", "1").replace("l", "1")
                                if m_n := re.match(r"^(\d+)$", clean_num):
                                    val_n = int(m_n.group(1))
                                    if 0 < val_n < 500000 and val_n > last_vis_ln:
                                        last_vis_ln = val_n

        detected = bool(ocr_detected or cv_pill_detected)
        out = {
            "detected": detected,
            "offline_detected": detected,
            "cv_pill_detected": cv_pill_detected,
            "ocr_detected": ocr_detected,
            "text": matched_text or ("Offline" if detected else ""),
            "confidence": round(matched_conf if ocr_detected else (0.85 if cv_pill_detected else 0.0), 3),
            "bbox": matched_bbox if detected else [],
            "last_visible_line_above_pill": last_vis_ln,
            "occluded_lines_allowance": 3 if detected else 0,
        }
        _last_gutter_offline_info = out
        return out
    except Exception as e:
        print(f"[detect_offline_editor_overlay] warning: {e}")
        return default_res


def is_eof_reached_with_offline_awareness(
    bottom_line: int,
    total_lines: int,
    offline_detected: bool = False,
    tail_text: str = "",
) -> Tuple[bool, str]:
    """
    Evaluates whether the markdown scan has reached the end of the file (EOF) under either situation:
      1. Standard EOF: bottom_line >= total_lines
      2. 'Offline' Editor Overlay EOF: the '[icon] Offline' badge in the bottom-left gutter covers
         the last ~3 lines (so bottom_line is 1..4 lines short of total_lines, e.g. 32,878 vs 32,881).
    """
    b = int(bottom_line or 0)
    t = int(total_lines or 0)
    if t <= 0 or b <= 0:
        return False, ""
    if b >= t:
        return True, f"Reached total lines ({b:,} / {t:,})"
    shortfall = t - b
    has_end_marker = "CODESCAN_FILE_END" in (tail_text or "")
    if 1 <= shortfall <= 4 and (offline_detected or _last_gutter_offline_info.get("detected") or has_end_marker):
        return (
            True,
            f"Reached last visible line {b:,} of {t:,} ({shortfall} lines short due to 'Offline' markdown editor overlay)",
        )
    return False, ""


def find_gutter_numbers_cluster(img: np.ndarray, dpi_factor: float = 1.0) -> List[Tuple[int, int]]:
    """
    Finds the vertical gutter column of line numbers in an editor image.
    Self-adapts whether the editor is fullscreen or has a sidebar open.
    Applies dpi_factor to scale scan slices and X-clustering tolerance.
    """
    global _last_gutter_offline_info
    if img is None: return []
    h, w = img.shape[:2]
    ocr = get_rapid_ocr()
    if ocr is None: return []

    scale_x = w / 1920.0
    scale_y = h / 1080.0
    norm_multiplier = max(0.4, scale_x * dpi_factor)

    # Crop with extra vertical margin (275..985 at 1080p) so RapidOCR detector never misses
    # the 1st row (y~303), 24th row (y~923..943), or the bottom-left 'Offline' pill (y~955..975).
    crop_top_y = max(265, int(275 * scale_y))
    crop_bot_y = min(h - 85, int(985 * scale_y))

    # Strict valid vertical bounds for unclipped editor lines (excludes toolbar above 295 and clipped 25th row at y>=948)
    valid_min_y = max(292, int(295 * scale_y))
    valid_max_y = min(h - 135, int(936 * scale_y))
    offline_hit_in_gutter = False
    offline_bbox_in_gutter: List[int] = []
    offline_conf_in_gutter = 0.0

    def _parse_ocr_candidates(ocr_results, max_x: Optional[int] = None) -> List[Tuple[int, int, int]]:
        nonlocal offline_hit_in_gutter, offline_bbox_in_gutter, offline_conf_in_gutter
        cands = []
        if not ocr_results:
            return cands
        for bbox, text, score in ocr_results:
            clean = text.strip()
            low_clean = clean.lower()
            pts = np.array(bbox)
            x_min = int(np.min(pts[:, 0]))
            y_min = crop_top_y + int(np.min(pts[:, 1]))
            if y_min >= int(840 * scale_y) and any(k in low_clean for k in ("offline", "offlin", "ffline")):
                offline_hit_in_gutter = True
                offline_conf_in_gutter = float(score)
                offline_bbox_in_gutter = [
                    x_min,
                    y_min,
                    int(np.max(pts[:, 0]) - np.min(pts[:, 0])),
                    int(np.max(pts[:, 1]) - np.min(pts[:, 1])),
                ]
                continue
            if y_min < valid_min_y or y_min > valid_max_y:
                continue
            if max_x is not None and x_min > max_x:
                continue
            clean_num = clean.replace('B', '8').replace('S', '5').replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1').replace('/', '7').replace('|', '1')
            clean_num = re.sub(r'(\d)\s+(\d)', r'\1\2', clean_num)
            if m := re.search(r'^(\d+)', clean_num):
                try:
                    num = int(m.group(1))
                    if 0 < num < 500000:
                        cands.append((x_min, y_min, num))
                except ValueError:
                    pass
        return cands

    # 1. Primary fast scan on the dedicated left gutter strip (x=0..145, filtering x_min <= 96)
    primary_w = int(min(w, max(125, int(145 * scale_x))))
    max_gutter_x = int(96 * scale_x)
    candidates = []
    try:
        res_primary, _ = ocr(img[crop_top_y:crop_bot_y, :primary_w])
        candidates = _parse_ocr_candidates(res_primary, max_x=max_gutter_x)
    except Exception as e:
        print(f"[find_gutter_numbers_cluster] Primary strip error: {e}")

    # 2. Fallback to wider scan if fewer than 3 gutter numbers found (e.g., sidebar open)
    if len(candidates) < 3:
        sub_w = int(min(w, max(480, int(w * 0.45 * norm_multiplier))))
        try:
            res_wide, _ = ocr(img[crop_top_y:crop_bot_y, :sub_w])
            wide_cands = _parse_ocr_candidates(res_wide, max_x=None)
            if len(wide_cands) > len(candidates):
                candidates = wide_cands
        except Exception as e:
            print(f"[find_gutter_numbers_cluster] Wide fallback error: {e}")

    if not candidates:
        return []

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
        best_gutter = correct_gutter_sequence(best_gutter, min_content_y=valid_min_y)

    valid = []
    for y_pos, num in best_gutter:
        if not valid or num >= valid[-1][1]:
            valid.append((y_pos, num))
        elif valid and str(valid[-1][1])[:-2] + str(num) == str(valid[-1][1] + 1):
            valid.append((y_pos, valid[-1][1] + 1))
    final_gutter = valid if valid else best_gutter
    last_vis = final_gutter[-1][1] if final_gutter else 0
    if offline_hit_in_gutter:
        _last_gutter_offline_info = {
            "detected": True,
            "offline_detected": True,
            "ocr_detected": True,
            "text": "Offline",
            "confidence": round(offline_conf_in_gutter, 3),
            "bbox": offline_bbox_in_gutter,
            "last_visible_line_above_pill": last_vis,
            "occluded_lines_allowance": 3,
        }
    else:
        cv_chk = detect_offline_editor_overlay(img, use_ocr=False)
        if cv_chk.get("detected"):
            cv_chk["last_visible_line_above_pill"] = last_vis
            _last_gutter_offline_info = cv_chk
        else:
            _last_gutter_offline_info = {
                "detected": False,
                "offline_detected": False,
                "text": "",
                "confidence": 0.0,
                "bbox": [],
                "last_visible_line_above_pill": last_vis,
                "occluded_lines_allowance": 0,
            }
    return final_gutter


def worker_detect_gutter_bounds(image_path: str, dpi_factor: float = 1.0) -> Tuple[int, int]:
    """Worker function to rapidly detect both top line and last line in a single OCR pass."""
    img = cv2.imread(image_path)
    if img is None: return 0, 0
    # Primary path: consensus gutter bounds
    top, bot = fast_detect_gutter_bounds(img, dpi_factor=dpi_factor)
    if top > 0 and bot >= top and (bot - top) <= 75:
        return top, bot
    # Fallback to column clustering
    gutter = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
    if gutter:
        return gutter[0][1], gutter[-1][1]
    if top > 0 and bot < top:
        bot = 0
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

def detect_editor_first_row_y(img: np.ndarray, gutter: Optional[List[Tuple[int, int]]] = None, avg_pitch: float = 27.0) -> Tuple[float, int]:
    """
    Dynamically determines the Y coordinate of the first visible text row in the Markdown editor.
    Normally at 1080p, the blue Edit-mode pencil icon sits at y~251px and row 0 sits at y~304px.
    If an external top banner (e.g. Microsoft Teams call bar) shifts the editor toolbar down
    (e.g. pencil icon at y~341px), row 0 shifts down correspondingly to y~393px.
    Returns (effective_top_row_y, max_top_row_y).
    """
    h, w = img.shape[:2]
    scale_x = w / 1920.0
    scale_y = h / 1080.0
    default_top_y = 304.0 * scale_y

    try:
        # Locate the active Edit-mode blue pencil pill in the formatting toolbar (x: 1580..1740, y: 180..380)
        y1, y2 = max(0, int(180 * scale_y)), min(h, int(380 * scale_y))
        x1, x2 = max(0, int(1580 * scale_x)), min(w, int(1740 * scale_x))
        roi = img[y1:y2, x1:x2]
        if roi.size > 0:
            b = roi[:, :, 0].astype(np.int16)
            r = roi[:, :, 2].astype(np.int16)
            blue_mask = (b > 140) & ((b - r) > 50)
            bys, _ = np.where(blue_mask)
            if len(bys) >= max(12, int(20 * scale_x * scale_y)):
                pencil_cy = float(y1) + float(np.mean(bys))
                top_row_y = pencil_cy + (53.0 * scale_y)
                max_top_y = int(round(top_row_y + max(18.0 * scale_y, 0.72 * avg_pitch)))
                return top_row_y, max_top_y
    except Exception:
        pass

    return default_top_y, int(round(default_top_y + max(18.0 * scale_y, 0.72 * avg_pitch)))


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

    pitches = []
    for i in range(len(gutter) - 1):
        y_curr, n_curr = gutter[i]
        y_next, n_next = gutter[i+1]
        line_delta = n_next - n_curr
        if line_delta == 1 and 10 <= (y_next - y_curr) <= 35:
            pitches.append(float(y_next - y_curr))
        elif line_delta > 1 and 10 <= (y_next - y_curr) <= 35 * line_delta:
            pitches.append(float(y_next - y_curr) / float(line_delta))

    avg_pitch = float(np.median(pitches)) if pitches else max(16.0, 27.0 * (h / 1080.0))

    top_row_y, max_top_row_y = detect_editor_first_row_y(img, gutter=gutter, avg_pitch=avg_pitch)
    doc_top_y = max(260, int(round(top_row_y - 9.0 * (h / 1080.0))))

    y_first, ln_first = gutter[0]
    y_dist_above = max(0.0, float(y_first) - top_row_y)
    if ln_first == 1 or y_first <= max_top_row_y or y_dist_above <= avg_pitch * 0.72:
        first_gutter_row_offset = 0
        missing_lines_above = 0
        effective_top = ln_first
    else:
        # When y_first > max_top_row_y, the visual rows above y_first have a blank gutter because
        # they are the wrapped continuation tail of line (ln_first - 1).
        first_gutter_row_offset = max(1, int(round(y_dist_above / avg_pitch)))
        missing_lines_above = 1 if ln_first > 1 else 0
        if target_top is not None and target_top == ln_first and first_gutter_row_offset > 2:
            # Only treat target_top as not-yet-at-top if more than 2 wrapped continuation rows precede it
            effective_top = max(1, ln_first - 1)
        else:
            effective_top = ln_first


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
        "first_gutter_row_offset": first_gutter_row_offset,
        "doc_top_y": doc_top_y,
        "effective_top_row_y": round(top_row_y, 1),
        "max_top_row_y": max_top_row_y,
        "missing_lines_above": missing_lines_above,
        "avg_pitch": avg_pitch,
        "effective_top": effective_top,
        "caret": caret_info,
        "gutter_count": len(gutter),
        "bottom_gutter_line": gutter[-1][1],
        "bottom_gutter_y": gutter[-1][0],
        "offline_overlay_detected": bool(_last_gutter_offline_info.get("detected")),
        "offline_info": dict(_last_gutter_offline_info),
    }

def worker_detect_top_line(image_path: str, dpi_factor: float = 1.0, target_top: Optional[int] = None) -> int:
    """Worker function to detect the line number displayed at the top of the left side gutter, accounting for word wrap."""
    img = cv2.imread(image_path)
    if img is None: return 0
    top, _ = detect_top_line_from_image(img, target_top=target_top, dpi_factor=dpi_factor)
    return top

def _normalize_codescan_tags(text: str) -> str:
    """
    Normalizes common OCR corruptions on CODESCAN_FILE_END and CODESCAN_FILE_START tags,
    as well as fullwidth CJK punctuation emitted by PP-OCRv3:
      - Auto-corrects '<--- CODESCAN_FILE_END ---' or '<!-- CODESCAN_FILE_END ---' (and variants)
        to '<!-- CODESCAN_FILE_END -->'.
      - Validates and normalizes '<!-- CODESCAN_FILE_START ... -->' syntax and key="value" attributes.
    """
    if not text:
        return text
    # Replace fullwidth CJK punctuation from PP-OCRv3 with standard ASCII code symbols
    text = (
        text.replace("\uff08", "(")
        .replace("\uff09", ")")
        .replace("\uff1a", ":")
        .replace("\uff1b", ";")
        .replace("\uff0c", ",")
    )
    stripped = text.strip()
    if not stripped:
        return text

    # 1. Normalize CODESCAN_FILE_END variants
    if re.search(r"<\s*!?\s*\-*\s*C[O0]DESCAN[_\s]*FILE[_\s]*END\b", stripped, re.IGNORECASE) or re.match(
        r"^\s*<[\-!\s]*C[O0]DESCAN[_\s]*FILE[_\s]*END[\-\s>]*$", stripped, re.IGNORECASE
    ):
        return "<!-- CODESCAN_FILE_END -->"

    # 2. Validate & normalize CODESCAN_FILE_START syntax
    m_start = re.match(
        r"^\s*<\s*!?\s*\-*\s*C[O0]DESCAN[_\s]*FILE[_\s]*START\b(.*)$",
        stripped,
        re.IGNORECASE,
    )
    if m_start:
        rest = m_start.group(1).strip()
        # Strip trailing comment closure variants (--->, -->, ---, --, ->, >)
        rest = re.sub(r"[\-\s>]+$", "", rest).strip()
        # Validate and normalize known attributes: path, type, size, lines, chars
        # Repair unquoted or half-quoted attribute values e.g. size="2082 or lines=62
        def _fix_attr(m_attr: re.Match) -> str:
            key = m_attr.group(1).lower()
            raw_val = m_attr.group(2).strip().strip("\"'`")
            return f'{key}="{raw_val}"'

        rest = re.sub(
            r'\b(path|type|size|lines|chars)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s"\'>]+)',
            _fix_attr,
            rest,
            flags=re.IGNORECASE,
        )
        # Catch trailing unclosed quote on final attribute
        rest = re.sub(
            r'\b(path|type|size|lines|chars)\s*=\s*["\']([^"\'\s>]+)$',
            lambda m: f'{m.group(1).lower()}="{m.group(2)}"',
            rest,
            flags=re.IGNORECASE,
        )
        return f"<!-- CODESCAN_FILE_START {rest} -->" if rest else "<!-- CODESCAN_FILE_START -->"

    return text


def worker_scan_image(image_path: str, ollama_url: str = "", ollama_vision_model: str = "", ollama_timeout: int = 15) -> Dict[str, Any]:
    """
    Top-level multi-process worker for full image OCR, deterministic RANSAC gutter grid solving,
    blank-line pixel energy gating, & non-overlapping bounding boxes.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Image not found: {image_path}")
    h, w = img.shape[:2]
    scale_x = w / 1920.0
    scale_y = h / 1080.0

    ocr_boxes: List[Dict[str, Any]] = []
    ocr = get_rapid_ocr()
    if ocr is not None:
        try:
            results, _ = ocr(img)
            if results:
                for bbox, text, score in results:
                    pts = np.array(bbox)
                    min_x, max_x = int(np.min(pts[:, 0])), int(np.max(pts[:, 0]))
                    min_y, max_y = int(np.min(pts[:, 1])), int(np.max(pts[:, 1]))
                    ocr_boxes.append({
                        "text": text.strip(),
                        "score": float(score),
                        "x": min_x,
                        "y": min_y,
                        "width": max_x - min_x,
                        "height": max_y - min_y,
                        "center_y": (min_y + max_y) / 2.0,
                        "center_x": (min_x + max_x) / 2.0,
                    })
        except Exception as e:
            print(f"[worker_scan_image] RapidOCR error: {e}")

    # 1. Left Gutter ROI & Editor Boundaries:
    # Gutter ROI: x: 0..92px (scaled by w / 1920.0), y: 280..960px (scaled by h / 1080.0)
    gutter_roi_y1 = max(0, int(round(280 * scale_y)))
    gutter_roi_y2 = min(h, int(round(960 * scale_y)))
    gutter_roi_x_max = int(round(92 * scale_x))

    # Strict unclipped editor line vertical bounds (excludes top toolbar <=292 and bottom clipped/status bar >=944)
    ed_top = max(gutter_roi_y1, int(round(295 * scale_y)))
    ed_bot = min(gutter_roi_y2, int(round(943 * scale_y)), h - int(round(135 * scale_y)))

    gx_min = max(16, int(round(28 * scale_x)))
    gx_max = gutter_roi_x_max
    x_code_start = int(round(94 * scale_x))
    x_code_end = max(x_code_start + 1, w - 24)
    content_min_x = x_code_start
    content_max_x = min(x_code_end, int(round(1896 * scale_x)))

    def _clean_gutter_digits(s: str) -> str:
        c = s.strip().replace('B', '8').replace('S', '5').replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1').replace('/', '7').replace('|', '1')
        return re.sub(r'(\d)\s+(\d)', r'\1\2', c)

    # 2. Detect all gutter numbers in the left gutter ROI (x: 0..92px, y: 280..960px scaled)
    raw_gutter_pairs: List[Tuple[float, int, Dict[str, Any]]] = []
    content_boxes: List[Dict[str, Any]] = []

    for b in ocr_boxes:
        cy = b["center_y"]
        if cy < gutter_roi_y1 or cy > gutter_roi_y2:
            continue
        if cy < ed_top or cy > ed_bot:
            continue
        txt = b["text"].strip()
        bx = b["x"]
        bw = b["width"]

        # Filter Android/Teams status pills like "Offline" appearing near the bottom bar
        if txt.lower() in ["offline", "online", "syncing", "saved"] and cy > (ed_bot - 30 * scale_y):
            continue

        if bx <= gx_max:
            clean_g = _clean_gutter_digits(txt)
            if clean_g.isdigit() and 0 < int(clean_g) < 500000:
                raw_gutter_pairs.append((cy, int(clean_g), b))
            elif m := re.match(r'^(\d{1,6})\s+(.+)$', txt):
                g_num = int(m.group(1))
                c_txt = m.group(2).strip()
                raw_gutter_pairs.append((cy, g_num, {**b, "width": max(24, gx_max - bx)}))
                if c_txt:
                    content_boxes.append({
                        **b,
                        "x": max(content_min_x, bx + 28),
                        "text": c_txt,
                        "width": max(30, bw - 28),
                    })
            elif (bx + bw) >= content_min_x:
                content_boxes.append(b)
        elif bx < content_max_x:
            content_boxes.append(b)

    # Dedicated left-gutter ROI pass (with slight right margin to prevent clipping right-aligned last digit)
    if ocr is not None:
        try:
            gutter_crop_w = min(w, int(round(104 * scale_x)))
            gutter_crop = img[gutter_roi_y1:gutter_roi_y2, 0:gutter_crop_w]
            if gutter_crop.size > 0:
                g_res, _ = ocr(gutter_crop)
                for bbox, text, score in (g_res or []):
                    pts = np.array(bbox)
                    gx1, gy1 = int(np.min(pts[:, 0])), gutter_roi_y1 + int(np.min(pts[:, 1]))
                    gx2, gy2 = int(np.max(pts[:, 0])), gutter_roi_y1 + int(np.max(pts[:, 1]))
                    gcy = (gy1 + gy2) / 2.0
                    if gx1 <= gx_max and ed_top <= gcy <= ed_bot:
                        clean_g = _clean_gutter_digits(text)
                        if m_g := re.match(r'^(\d{1,6})$', clean_g):
                            g_num = int(m_g.group(1))
                            if 0 < g_num < 500000:
                                if not any(abs(existing_cy - gcy) < 12.0 * scale_y for existing_cy, _, _ in raw_gutter_pairs):
                                    raw_gutter_pairs.append((
                                        gcy,
                                        g_num,
                                        {
                                            "text": str(g_num),
                                            "score": float(score),
                                            "x": gx1,
                                            "y": gy1,
                                            "width": max(16, min(gx2, gx_max) - gx1),
                                            "height": max(14, gy2 - gy1),
                                            "center_y": gcy,
                                            "center_x": (gx1 + gx2) / 2.0,
                                        },
                                    ))
        except Exception as e:
            print(f"[worker_scan_image] Gutter ROI scan note: {e}")

    raw_gutter_pairs.sort(key=lambda p: p[0])

    # Consensus sequence validation to repair any truncated/misread gutter numbers
    pairs_for_corr = [(int(round(p[0])), p[1]) for p in raw_gutter_pairs]
    corrected_pairs = correct_gutter_sequence(pairs_for_corr, min_content_y=ed_top)

    # Preserve exact sub-pixel cy from raw_gutter_pairs
    cy_lookup: Dict[int, float] = {}
    box_lookup: Dict[int, Dict[str, Any]] = {}
    for f_cy, raw_n, b_dict in raw_gutter_pairs:
        iy = int(round(f_cy))
        cy_lookup[iy] = f_cy
        box_lookup[iy] = b_dict

    avg_gw = max(24, int(np.mean([p[2]["width"] for p in raw_gutter_pairs]))) if raw_gutter_pairs else max(24, gx_max - gx_min)

    valid_pairs: List[Tuple[float, int, Dict[str, Any]]] = []
    for iy, c_num in corrected_pairs:
        exact_cy = cy_lookup.get(iy, float(iy))
        b = box_lookup.get(iy)
        if not b:
            b = {
                "x": gx_min,
                "y": int(round(exact_cy - 12 * scale_y)),
                "width": avg_gw,
                "height": int(round(24 * scale_y)),
                "confidence": 0.95,
            }
        valid_pairs.append((exact_cy, c_num, {**b, "line_number": c_num}))

    # 3. Deterministic Gutter Grid Solver:
    # Estimate median single-row pitch (~27.0px at 1080p) and fit RANSAC linear regression
    default_pitch = 27.0 * scale_y
    pitch_samples: List[float] = []
    for i in range(len(valid_pairs) - 1):
        dy = valid_pairs[i + 1][0] - valid_pairs[i][0]
        dn = valid_pairs[i + 1][1] - valid_pairs[i][1]
        if dn == 1 and (18.0 * scale_y) <= dy <= (33.5 * scale_y):
            pitch_samples.append(float(dy))
        elif dn > 1 and (18.0 * scale_y) <= (dy / dn) <= (32.5 * scale_y):
            pitch_samples.append(float(dy) / float(dn))

    pitch_y = float(np.median(pitch_samples)) if pitch_samples else default_pitch

    if len(valid_pairs) >= 2:
        # Map each detected gutter number to its visual row offset v_i (accounting for multi-row wrapped lines where dy > 1.5 * pitch_y)
        v_offsets = [0]
        for i in range(1, len(valid_pairs)):
            dy = valid_pairs[i][0] - valid_pairs[i - 1][0]
            dn = max(1, valid_pairs[i][1] - valid_pairs[i - 1][1])
            if dn == 1 and dy > 1.5 * pitch_y:
                v_step = max(2, int(round(dy / pitch_y)))
            else:
                v_step = max(dn, int(round(dy / pitch_y)))
            v_offsets.append(v_offsets[-1] + v_step)

        # RANSAC inlier selection on (v_i, cy_i)
        best_inlier_idxs: List[int] = []
        inlier_tol = 0.38 * pitch_y
        for i in range(len(valid_pairs)):
            cy_i = valid_pairs[i][0]
            v_i = v_offsets[i]
            inliers = [
                j for j in range(len(valid_pairs))
                if abs((valid_pairs[j][0] - cy_i) - (v_offsets[j] - v_i) * pitch_y) <= inlier_tol
            ]
            if len(inliers) > len(best_inlier_idxs):
                best_inlier_idxs = inliers

        if len(best_inlier_idxs) >= 2:
            v_in = np.array([v_offsets[idx] for idx in best_inlier_idxs], dtype=np.float64)
            y_in = np.array([valid_pairs[idx][0] for idx in best_inlier_idxs], dtype=np.float64)
            slope, y_v0 = np.polyfit(v_in, y_in, 1)
            if (19.0 * scale_y) <= slope <= (34.0 * scale_y):
                pitch_y = float(slope)
                y_v0 = float(y_v0)
            else:
                y_v0 = float(np.median(y_in - v_in * pitch_y))
        else:
            y_v0 = float(valid_pairs[0][0])

        # Determine top_ln and bot_ln strictly within valid line-center viewport bounds [min_center_y, max_center_y]
        min_center_y = 300.0 * scale_y
        max_center_y = 940.0 * scale_y

        first_ln = valid_pairs[0][1]
        first_cy = y_v0
        rows_above = max(0, int(np.floor((first_cy - min_center_y) / pitch_y + 0.18)))
        top_line = max(1, first_ln - rows_above)

        last_ln = valid_pairs[-1][1]
        last_cy = y_v0 + v_offsets[-1] * pitch_y
        rows_below = max(0, int(np.floor((max_center_y - last_cy) / pitch_y + 0.18)))
        bottom_line = max(top_line, last_ln + rows_below)

        # Build exact y_center(ln) for every integer line ln in range(top_line, bottom_line + 1):
        # When no wrapped lines exist on the page, v_offsets[k] == valid_pairs[k][1] - first_ln,
        # so y_center(ln) = y_0 + (ln - top_line) * pitch_y identically.
        y_0 = first_cy - (first_ln - top_line) * pitch_y
        y_centers: Dict[int, float] = {}

        # Anchor each detected gutter number to the fitted RANSAC visual row grid
        anchor_lns = [valid_pairs[i][1] for i in range(len(valid_pairs))]
        anchor_ys = [y_v0 + v_offsets[i] * pitch_y for i in range(len(valid_pairs))]

        for ln in range(top_line, bottom_line + 1):
            if ln <= anchor_lns[0]:
                y_centers[ln] = anchor_ys[0] + (ln - anchor_lns[0]) * pitch_y
            elif ln >= anchor_lns[-1]:
                y_centers[ln] = anchor_ys[-1] + (ln - anchor_lns[-1]) * pitch_y
            else:
                # Find bounding anchors anchor_lns[k] <= ln <= anchor_lns[k+1]
                k = 0
                for idx_a in range(len(anchor_lns) - 1):
                    if anchor_lns[idx_a] <= ln <= anchor_lns[idx_a + 1]:
                        k = idx_a
                        break
                ln_a, ln_b = anchor_lns[k], anchor_lns[k + 1]
                ya, yb = anchor_ys[k], anchor_ys[k + 1]
                if ln == ln_a:
                    y_centers[ln] = ya
                elif ln == ln_b:
                    y_centers[ln] = yb
                else:
                    # Interpolate across intermediate lines
                    y_centers[ln] = ya + (ln - ln_a) * pitch_y
    elif len(valid_pairs) == 1:
        y0_pt, ln0_pt, _ = valid_pairs[0]
        min_center_y = 300.0 * scale_y
        max_center_y = 940.0 * scale_y
        rows_above = max(0, int(np.floor((y0_pt - min_center_y) / pitch_y + 0.18)))
        top_line = max(1, ln0_pt - rows_above)
        y_0 = y0_pt - (ln0_pt - top_line) * pitch_y
        rows_total = max(1, int(np.floor((max_center_y - y_0) / pitch_y + 0.18)) + 1)
        bottom_line = top_line + rows_total - 1
        y_centers = {ln: y_0 + (ln - top_line) * pitch_y for ln in range(top_line, bottom_line + 1)}
    else:
        top_line = 1
        bottom_line = 24
        y_0 = 313.5 * scale_y
        y_centers = {ln: y_0 + (ln - top_line) * pitch_y for ln in range(top_line, bottom_line + 1)}

    gutter_boxes: Dict[int, Dict[str, Any]] = {}
    line_boxes: Dict[int, Dict[str, Any]] = {}
    lines_list: List[Dict[str, Any]] = []

    half_strip = 0.42 * pitch_y
    char_pitch_x = 8.2 * scale_x
    sep_end_col = max(4, int(round(14 * scale_x)))
    bleed_end_col = max(1, int(round(3 * scale_x)))

    for ln in range(top_line, bottom_line + 1):
        yc = y_centers[ln]
        y_top_ln = yc - half_strip
        y_bot_ln = yc + half_strip

        # Check for wrapped line: y_center(ln + 1) - y_center(ln) > 1.5 * pitch_y
        if (ln + 1) in y_centers and (y_centers[ln + 1] - yc) > 1.5 * pitch_y:
            dY = y_centers[ln + 1] - yc
            is_wrapped = True
            wrapped_line_count = max(2, int(round(dY / pitch_y)))
            y_top_next = y_centers[ln + 1] - half_strip
            strip_y1 = max(0, int(round(y_top_ln)))
            strip_y2 = min(h, int(round(y_top_next)))
        else:
            is_wrapped = False
            wrapped_line_count = 1
            strip_y1 = max(0, int(round(y_top_ln)))
            strip_y2 = min(h, int(round(y_bot_ln)))

        if strip_y2 <= strip_y1:
            strip_y2 = min(h, strip_y1 + max(16, int(round(0.84 * pitch_y))))

        box_h = strip_y2 - strip_y1

        # Gutter box aligned to the first visual row of line ln
        gbox_h = max(14, int(round(0.84 * pitch_y)))
        gbox = {
            "x": gx_min,
            "y": strip_y1,
            "width": avg_gw,
            "height": gbox_h,
            "line_number": ln,
            "confidence": 0.98,
        }
        gutter_boxes[ln] = gbox

        # 4. Blank-Line Pixel Energy Gate on horizontal code strip img[y1:y2, x_code_start:img_w - 24]
        code_strip = img[strip_y1:strip_y2, x_code_start:x_code_end]
        if code_strip.size > 0:
            gray_strip = cv2.cvtColor(code_strip, cv2.COLOR_BGR2GRAY) if code_strip.ndim == 3 else code_strip
            bg_med = float(np.median(gray_strip))
            fg_mask = np.abs(gray_strip.astype(np.int16) - bg_med) > 24
            # Ignore 1-3px right-edge bleed of right-aligned gutter digits at x=94..96 when separator channel (x=97..107) is empty
            if fg_mask.shape[1] > sep_end_col and np.count_nonzero(fg_mask[:, bleed_end_col:sep_end_col]) == 0:
                fg_mask[:, :bleed_end_col] = False
            ink_px = int(np.count_nonzero(fg_mask))
        else:
            bg_med = 20.0
            ink_px = 0

        if ink_px < 10:
            # Strictly lock blank line: never allow text from adjacent rows to shift onto this line
            content_box = {
                "x": content_min_x,
                "y": strip_y1,
                "width": int(content_max_x - content_min_x),
                "height": box_h,
                "line_number": ln,
                "interpolated": True,
            }
            line_boxes[ln] = content_box
            lines_list.append({
                "line_number": ln,
                "gutter_number": ln,
                "text": "",
                "is_blank": True,
                "blank_locked": True,
                "ink_px": ink_px,
                "is_wrapped": False,
                "wrapped_line_count": 1,
                "status": "verified",
                "confidence": 1.0,
                "y_top": strip_y1,
                "y_bottom": strip_y2,
                "y_center": round(yc, 2),
                "bbox": content_box,
                "gutter_bbox": gbox,
            })
            continue

        # 5. Non-blank line (ink_px >= 10): match content boxes strictly within [strip_y1, strip_y2]
        matched_words = [
            b for b in content_boxes
            if content_min_x <= (b["x"] + b["width"]) <= (content_max_x + 30)
            and strip_y1 <= b["center_y"] <= strip_y2
        ]

        if is_wrapped and len(matched_words) > 1:
            matched_words.sort(key=lambda b: (int(round((b["center_y"] - yc) / pitch_y)), b["x"]))
        else:
            matched_words.sort(key=lambda b: b["x"])

        if matched_words:
            rx_min = max(content_min_x, int(min(b["x"] for b in matched_words)))
            rx_max = int(min(content_max_x, max(b["x"] + b["width"] for b in matched_words)))
            content_box = {
                "x": rx_min,
                "y": strip_y1,
                "width": max(50, rx_max - rx_min),
                "height": box_h,
                "line_number": ln,
            }
            first_word_x = matched_words[0]["x"]
            indent_spaces = max(0, int(round((first_word_x - (content_min_x + 14 * scale_x)) / max(1.0, char_pitch_x))))
            indent_prefix = " " * indent_spaces if indent_spaces >= 2 else ""
            line_str = indent_prefix + " ".join(b["text"] for b in matched_words)
            avg_conf = float(np.mean([b.get("score", 0.95) for b in matched_words]))
        else:
            content_box = {
                "x": content_min_x,
                "y": strip_y1,
                "width": int(content_max_x - content_min_x),
                "height": box_h,
                "line_number": ln,
                "interpolated": True,
            }
            line_str = ""
            avg_conf = 0.90
            # Localized padded row OCR for faint symbols (e.g. ```, ., };, ---) when ink_px >= 10
            if ocr is not None and code_strip.size > 0:
                clean_crop = code_strip[:, bleed_end_col:] if code_strip.shape[1] > bleed_end_col else code_strip
                bg_val = int(round(bg_med))
                padded = cv2.copyMakeBorder(clean_crop, 8, 8, 8, 8, cv2.BORDER_CONSTANT, value=(bg_val, bg_val, bg_val))
                sc_res, _ = ocr(padded)
                if not sc_res:
                    sc_gray = cv2.cvtColor(padded, cv2.COLOR_BGR2GRAY) if padded.ndim == 3 else padded
                    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
                    enhanced_sc = clahe.apply(sc_gray)
                    sc_res, _ = ocr(enhanced_sc)
                if sc_res:
                    sorted_sc = sorted(sc_res, key=lambda x: float(np.min(np.array(x[0])[:, 0])))
                    first_x = max(0.0, float(np.min(np.array(sorted_sc[0][0])[:, 0])) - 8.0)
                    indent_spaces = max(0, int(round((first_x - 11.0 * scale_x) / max(1.0, char_pitch_x))))
                    indent_prefix = " " * indent_spaces if indent_spaces >= 2 else ""
                    line_str = indent_prefix + " ".join(r[1].strip() for r in sorted_sc if r[1].strip())
                    avg_conf = float(np.mean([float(r[2]) for r in sorted_sc]))
                elif 10 <= ink_px <= 90:
                    # Micro-glyph geometric fallback for standalone ``` or . missed by PP-OCR text detector
                    ys_fg, xs_fg = np.where(fg_mask)
                    if len(xs_fg) > 0:
                        x_span = int(xs_fg.max() - xs_fg.min() + 1)
                        y_mean_rel = float(ys_fg.mean()) / max(1.0, float(fg_mask.shape[0]))
                        active_cols = np.count_nonzero(fg_mask.any(axis=0))
                        if x_span <= int(round(8 * scale_x)) and y_mean_rel >= 0.45:
                            line_str = "."
                        elif int(round(16 * scale_x)) <= x_span <= int(round(36 * scale_x)) and active_cols <= x_span - 4 and y_mean_rel <= 0.55:
                            line_str = "```"

        line_str = LocalOllamaStitcher.sanitize_line_text(ln, line_str)
        is_blank = False

        line_boxes[ln] = content_box
        lines_list.append({
            "line_number": ln,
            "gutter_number": ln,
            "text": line_str,
            "is_blank": is_blank,
            "blank_locked": False,
            "ink_px": ink_px,
            "is_wrapped": is_wrapped,
            "wrapped_line_count": wrapped_line_count,
            "status": "verified",
            "confidence": round(max(0.85, min(0.99, avg_conf)), 3),
            "y_top": strip_y1,
            "y_bottom": strip_y2,
            "y_center": round(yc, 2),
            "bbox": content_box,
            "gutter_bbox": gbox,
        })

    first_line_box = line_boxes.get(top_line, {"x": content_min_x, "y": ed_top, "width": 55, "height": int(pitch_y), "line_number": top_line})
    last_line_box = line_boxes.get(bottom_line, {"x": content_min_x, "y": ed_bot - int(pitch_y), "width": 55, "height": int(pitch_y), "line_number": bottom_line})

    return {
        "top_line": top_line,
        "bottom_line": bottom_line,
        "pitch_y": round(pitch_y, 3),
        "lines": lines_list,
        "image_width": w,
        "image_height": h,
        "bounding_boxes": {
            "first_line": first_line_box,
            "last_line": last_line_box,
            "wrapped_lines": [l["bbox"] for l in lines_list if l.get("is_wrapped")],
            "line_boxes": line_boxes,
            "gutter_boxes": gutter_boxes,
        },
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
        cleaned = (
            (text or "")
            .replace("\uff08", "(")
            .replace("\uff09", ")")
            .replace("\uff1a", ":")
            .replace("\uff1b", ";")
            .replace("\uff0c", ",")
            .rstrip()
        )
        stripped = cleaned.strip()
        if not stripped:
            return ""
        # Strip synthetic row tag [L12]: or L12: if echoed by VLM
        m_tag = re.match(r"^\[?L(\d{1,6})\]?\s*(?:[:|.)\]>\-]\s*|\s+)(.*)$", stripped, re.IGNORECASE)
        if m_tag:
            cleaned_body = m_tag.group(2).rstrip()
            stripped = cleaned_body.strip()
            if not stripped:
                return ""
            cleaned = cleaned_body
        if re.match(r"^\[?L\d{1,6}\]?$", stripped, re.IGNORECASE):
            return ""
        if stripped.isdigit():
            val = int(stripped)
            if abs(val - ln) <= 4:
                return ""
        m = re.match(r"^(\d{1,6})\s*([>#`\.\-\|\{\[\s\"'].*|[a-zA-Z_\-\.\/].*)$", stripped)
        if m:
            val = int(m.group(1))
            if abs(val - ln) <= 4 or abs(val - (ln - 1)) <= 2:
                cleaned = m.group(2).strip()
                stripped = cleaned
        m2 = re.match(r"^(\d{1,6})\s*([├│└].*)$", stripped)
        if m2:
            val = int(m2.group(1))
            if abs(val - ln) <= 4:
                cleaned = m2.group(2).strip()
                stripped = cleaned
        normalized_tag = _normalize_codescan_tags(stripped)
        if normalized_tag != stripped:
            return normalized_tag
        return cleaned

    def stitch_frame_lines(self, existing_lines: Dict[int, Any], new_lines: List[Dict[str, Any]], frame_id: str, model_desc: str = "Ollama") -> int:
        added = 0
        self.stitch_stats["total_stitches"] += 1
        for item in new_lines:
            ln = item.get("line_number")
            if ln is None: continue
            ln = int(ln)
            blank_locked = bool(item.get("blank_locked", False))
            if blank_locked:
                text = ""
                is_blank = True
            else:
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

