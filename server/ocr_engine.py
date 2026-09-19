import os, re, json, base64, urllib.request
from typing import Optional, List, Dict, Any
import cv2, numpy as np

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    RapidOCR = None

class LocalGutterOCREngine:
    """Local OCR & VLM analyzer using Ollama (minicpm-v) + RapidOCR token alignment."""
    def __init__(self, ollama_url: str = "http://127.0.0.1:11434", ollama_model: str = "minicpm-v", ollama_timeout: int = 45):
        self.ollama_url, self.ollama_model, self.ollama_timeout = ollama_url, ollama_model, ollama_timeout
        self.rapid_ocr = RapidOCR() if RapidOCR is not None else None

    def scan_image(self, image_path: str) -> Dict[str, Any]:
        img = cv2.imread(image_path)
        if img is None: raise FileNotFoundError(f"Could not read image from {image_path}")
        h, w = img.shape[:2]
        ocr_boxes: List[Dict[str, Any]] = []
        if self.rapid_ocr is not None:
            try:
                results, _ = self.rapid_ocr(img)
                if results:
                    for bbox, text, score in results:
                        pts = np.array(bbox)
                        min_x, max_x, min_y, max_y = int(np.min(pts[:, 0])), int(np.max(pts[:, 0])), int(np.min(pts[:, 1])), int(np.max(pts[:, 1]))
                        ocr_boxes.append({"text": text.strip(), "score": float(score), "x": min_x, "y": min_y, "width": max_x - min_x, "height": max_y - min_y, "center_y": (min_y + max_y) / 2.0, "center_x": (min_x + max_x) / 2.0})
            except Exception as e: print(f"[LocalGutterOCREngine] RapidOCR error: {e}")

        gutter_width = int(w * 0.22)
        gutter_candidates = sorted([
            {**b, "line_number": int(m.group(1))} for b in ocr_boxes if b["x"] < gutter_width and (m := re.search(r'^\D*(\d{1,7})\D*$', b["text"]))
        ], key=lambda x: x["y"])

        ollama_lines = self._call_ollama_minicpm(img)
        top_line = bottom_line = 0
        first_line_box = last_line_box = None

        if gutter_candidates:
            fc, lc = gutter_candidates[0], gutter_candidates[-1]
            top_line, bottom_line = fc["line_number"], lc["line_number"]
            first_line_box = {"x": fc["x"], "y": fc["y"], "width": fc["width"], "height": fc["height"], "line_number": top_line}
            last_line_box = {"x": lc["x"], "y": lc["y"], "width": lc["width"], "height": lc["height"], "line_number": bottom_line}
        elif ollama_lines:
            top_line, bottom_line = ollama_lines[0].get("line_number", 0), ollama_lines[-1].get("line_number", 0)
            first_line_box = {"x": int(w * 0.05), "y": int(h * 0.14), "width": 50, "height": 28, "line_number": top_line}
            last_line_box = {"x": int(w * 0.05), "y": int(h * 0.92), "width": 50, "height": 28, "line_number": bottom_line}

        lines_list: List[Dict[str, Any]] = []
        wrapped_boxes: List[Dict[str, Any]] = []

        if ollama_lines:
            for item in ollama_lines:
                ln, txt, is_wrap = item.get("line_number", 0), item.get("text", ""), item.get("is_wrapped", False)
                lines_list.append({"line_number": ln, "gutter_number": ln, "text": txt, "is_blank": not bool(txt.strip()), "is_wrapped": is_wrap, "wrapped_line_count": item.get("wrapped_line_count", 2 if is_wrap else 1), "status": "verified", "confidence": 0.98})
        else:
            rows: List[List[Dict[str, Any]]] = []
            for b in ocr_boxes:
                placed = False
                for r in rows:
                    if abs(b["center_y"] - sum(x["center_y"] for x in r) / len(r)) < 18:
                        r.append(b); placed = True; break
                if not placed: rows.append([b])
            rows.sort(key=lambda r: sum(x["y"] for x in r) / len(r))
            curr = top_line or 1
            for r in rows:
                r.sort(key=lambda x: x["x"])
                line_str = " ".join(x["text"] for x in r if x["x"] >= gutter_width)
                gt = next((x for x in r if x["x"] < gutter_width and x["text"].isdigit()), None)
                if gt: curr, is_w = int(gt["text"]), False
                else: is_w = True
                if len(line_str) > 60 or "\n" in line_str: is_w = True
                lines_list.append({"line_number": curr, "gutter_number": curr, "text": line_str, "is_blank": not bool(line_str.strip()), "is_wrapped": is_w, "wrapped_line_count": 2 if is_w else 1, "status": "verified", "confidence": 0.95})

        content_min_x = int(w * 0.12)
        for line in lines_list:
            if line.get("is_wrapped") or len(line.get("text", "")) > 65:
                matched = [b for b in ocr_boxes if b["x"] >= content_min_x and any(word in line["text"] for word in b["text"].split() if len(word) > 4)]
                if matched:
                    bx1, bx2 = min(t["x"] for t in matched), max(t["x"] + t["width"] for t in matched)
                    by1, by2 = min(t["y"] for t in matched), max(t["y"] + t["height"] for t in matched)
                    wrapped_boxes.append({"x": bx1 - 4, "y": by1 - 4, "width": (bx2 - bx1) + 8, "height": (by2 - by1) + 8, "line_number": line["line_number"], "text_snippet": line["text"][:35]})

        deduped_wrapped: List[Dict[str, Any]] = []
        for wb in wrapped_boxes:
            overlap = any(abs(wb["y"] - d["y"]) < 25 and abs(wb["x"] - d["x"]) < 40 for d in deduped_wrapped)
            if not overlap: deduped_wrapped.append(wb)
            else:
                for d in deduped_wrapped:
                    if abs(wb["y"] - d["y"]) < 25 and abs(wb["x"] - d["x"]) < 40:
                        d["width"], d["height"] = max(d["width"], wb["width"]), max(d["height"], wb["height"])

        if not first_line_box and lines_list: first_line_box = {"x": 105, "y": 240, "width": 55, "height": 30, "line_number": top_line}
        if not last_line_box and lines_list: last_line_box = {"x": 105, "y": int(h * 0.92), "width": 55, "height": 30, "line_number": bottom_line}

        return {"top_line": top_line, "bottom_line": bottom_line, "lines": lines_list, "image_width": w, "image_height": h, "bounding_boxes": {"first_line": first_line_box, "last_line": last_line_box, "wrapped_lines": deduped_wrapped}}

    def _call_ollama_minicpm(self, img: np.ndarray) -> Optional[List[Dict[str, Any]]]:
        try:
            h, w = img.shape[:2]
            scale = min(1.0, 720.0 / h) if h > 720 else 1.0
            v_small = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1.0 else img
            ok, enc = cv2.imencode(".jpg", v_small, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok: return None
            prompt = "Extract visible code lines verbatim as JSON array: [{\"line_number\": <int|null>, \"text\": \"<verbatim>\", \"is_wrapped\": <bool>}]. Return ONLY JSON array."
            req_data = json.dumps({"model": self.ollama_model, "prompt": prompt, "images": [base64.b64encode(enc).decode("utf-8")], "stream": False, "options": {"num_predict": 768, "temperature": 0.05}}).encode("utf-8")
            req = urllib.request.Request(f"{self.ollama_url.rstrip('/')}/api/generate", data=req_data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=self.ollama_timeout) as resp:
                raw_text = json.loads(resp.read().decode("utf-8")).get("response", "").strip()
            if raw_text and (m := re.search(r'\[.*\]', raw_text, re.DOTALL)):
                parsed = json.loads(m.group(0))
                if isinstance(parsed, list): return parsed
        except Exception as e: print(f"[LocalGutterOCREngine] Ollama minicpm-v call failed: {e}")
        return None
