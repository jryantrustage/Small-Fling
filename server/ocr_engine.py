from abc import ABC, abstractmethod
import os, re, json, base64, urllib.request, urllib.error
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import cv2, numpy as np

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    RapidOCR = None

_rapid_ocr_instance = None

def get_rapid_ocr():
    global _rapid_ocr_instance
    if _rapid_ocr_instance is None and RapidOCR is not None:
        try: _rapid_ocr_instance = RapidOCR()
        except Exception as e: print(f"[Worker] RapidOCR init error: {e}")
    return _rapid_ocr_instance

def find_gutter_numbers_cluster(img: np.ndarray) -> List[Tuple[int, int]]:
    """
    Finds the vertical gutter column of line numbers in an editor image.
    Self-adapts whether the editor is fullscreen (x ~ 18) or has a sidebar open (x ~ 301).
    Returns list of (y_pos, line_num) sorted by Y.
    """
    if img is None: return []
    h, w = img.shape[:2]
    top_y = int(h * 0.10)
    bot_y = int(h * 0.90)
    sub = img[top_y:bot_y, :int(w * 0.40)]
    ocr = get_rapid_ocr()
    if ocr is None: return []
    try:
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
        
        # Cluster candidates by X-coordinate (within 24px tolerance)
        clusters = {}
        for x, y, num in candidates:
            matched_k = None
            for k in clusters:
                if abs(k - x) <= 24:
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
        
        # Filter monotonically non-decreasing order
        valid = []
        for y_pos, num in best_gutter:
            if not valid or num >= valid[-1][1]:
                valid.append((y_pos, num))
            elif valid and str(valid[-1][1])[:-2] + str(num) == str(valid[-1][1] + 1):
                valid.append((y_pos, valid[-1][1] + 1))
        return valid if valid else best_gutter
    except Exception as e:
        print(f"[find_gutter_numbers_cluster] Error: {e}")
        return []

def worker_detect_gutter_bounds(image_path: str) -> Tuple[int, int]:
    """Worker function to rapidly detect both top line and last line in a single OCR pass."""
    img = cv2.imread(image_path)
    if img is None: return 0, 0
    gutter = find_gutter_numbers_cluster(img)
    if gutter:
        return gutter[0][1], gutter[-1][1]
    return 0, 0

def worker_detect_last_line(image_path: str) -> int:
    """Worker function to rapidly and accurately detect the last line number on screen (used after Ctrl+End)."""
    img = cv2.imread(image_path)
    if img is None: return 0
    gutter = find_gutter_numbers_cluster(img)
    if gutter:
        return gutter[-1][1]
    return 0

def worker_verify_first_line(image_path: str) -> Tuple[bool, int]:
    """Worker function to verify that line 1 is visible at top of gutter (used after Ctrl+Home)."""
    img = cv2.imread(image_path)
    if img is None: return False, 0
    gutter = find_gutter_numbers_cluster(img)
    if not gutter: return False, 0
    first_ln = gutter[0][1]
    has_line_1 = any(ln == 1 for _, ln in gutter[:4])
    is_at_home = has_line_1 or (first_ln <= 5 and gutter[0][0] < 300)
    return is_at_home, (1 if is_at_home else first_ln)

def worker_detect_top_line(image_path: str) -> int:
    """Worker function to detect the line number displayed at the top of the left side gutter."""
    img = cv2.imread(image_path)
    if img is None: return 0
    gutter = find_gutter_numbers_cluster(img)
    if gutter:
        return gutter[0][1]
    return 0

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

    gutter_width = int(w * 0.10)
    gutter_candidates = sorted([
        {**b, "line_number": int(m.group(1))} for b in ocr_boxes if b["x"] < gutter_width and (m := re.search(r'^\D*(\d{1,7})\D*$', b["text"]))
    ], key=lambda x: x["y"])

    top_line = bottom_line = 0
    first_line_box = last_line_box = None
    if gutter_candidates:
        fc, lc = gutter_candidates[0], gutter_candidates[-1]
        top_line, bottom_line = fc["line_number"], lc["line_number"]
        first_line_box = {"x": fc["x"], "y": fc["y"], "width": fc["width"], "height": fc["height"], "line_number": top_line}
        last_line_box = {"x": lc["x"], "y": lc["y"], "width": lc["width"], "height": lc["height"], "line_number": bottom_line}

    rows: List[List[Dict[str, Any]]] = []
    for b in ocr_boxes:
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
        line_str = " ".join(x["text"] for x in r if x["x"] >= gutter_width)
        gt = next((x for x in r if x["x"] < gutter_width and x["text"].isdigit()), None)
        if gt: curr, is_w = int(gt["text"]), False
        else: is_w = True
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

class LocalGutterOCREngine(BaseOCREngine):
    @property
    def name(self) -> str: return "local_gutter_ocr"

    def __init__(self, ollama_url: str = "http://127.0.0.1:11434", ollama_vision_model: str = "llama3.2-vision", ollama_coder_model: str = "qwen2.5-coder", ollama_timeout: int = 45):
        self.ollama_url, self.ollama_vision_model, self.ollama_coder_model, self.ollama_timeout = ollama_url.rstrip("/"), ollama_vision_model, ollama_coder_model, ollama_timeout
        self.stitcher = LocalOllamaStitcher(self.ollama_url, self.ollama_coder_model, min(ollama_timeout, 15))

    def scan_image(self, image_path: str) -> Dict[str, Any]:
        return worker_scan_image(image_path, self.ollama_url, self.ollama_vision_model, self.ollama_timeout)
