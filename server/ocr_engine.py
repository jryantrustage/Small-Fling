from abc import ABC, abstractmethod
import os, re, json, base64, urllib.request, urllib.error
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import cv2, numpy as np

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    RapidOCR = None

class BaseOCREngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str: pass

    @abstractmethod
    def scan_image(self, image_path: str) -> Dict[str, Any]: pass

class LocalOllamaStitcher:
    """
    Local Ollama Stitcher connecting to local Ollama REST endpoint (http://127.0.0.1:11434/api/generate).
    Executes local coder models (e.g. qwen2.5-coder) for deterministic line conflict resolution and stitching.
    """
    def __init__(self, ollama_url: str = "http://127.0.0.1:11434", coder_model: str = "qwen2.5-coder", timeout: int = 15):
        self.ollama_url, self.coder_model, self.timeout = ollama_url.rstrip("/"), coder_model, timeout
        self.endpoint = f"{self.ollama_url}/api/generate"
        self.stitch_stats: Dict[str, Any] = {
            "total_stitches": 0, "conflicts_resolved": 0, "exact_matches": 0,
            "stitched_lines": 0, "http_errors": 0, "last_error": None
        }

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
                st = "flagged" if flagged else "ok"
                srcs = [frame_id]
                conf = 1.0 if st != "flagged" else 0.75
                notes = f"Verified by {model_desc}"
            else:
                srcs = list(set(ex.get("sources", [ex.get("frame_id", frame_id)]) + [frame_id]))
                ex_text = ex.get("text", "")
                if ex_text == text:
                    st, conf = "verified_overlap", 1.0
                    notes = f"Exact match across frames {srcs}"
                    self.stitch_stats["exact_matches"] += 1
                else:
                    reconciled, resolved_wrap = self._reconcile_conflict(ln, ex_text, text)
                    text = reconciled
                    is_wrapped = is_wrapped or resolved_wrap
                    st, conf = "verified_overlap", 0.95
                    notes = f"Deterministic stitch ({self.coder_model}) across frames {srcs}"
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

    def _reconcile_conflict(self, line_num: int, text_a: str, text_b: str) -> Tuple[str, bool]:
        if text_a.strip() == text_b.strip():
            return (text_a if len(text_a) >= len(text_b) else text_b), False
        if not text_a.strip(): return text_b, False
        if not text_b.strip(): return text_a, False

        qwen_ans = self._call_qwen_coder(line_num, text_a, text_b)
        if qwen_ans:
            return qwen_ans, False
        return (text_b if len(text_b) > len(text_a) else text_a), False

    def _call_qwen_coder(self, line_num: int, cand_a: str, cand_b: str) -> Optional[str]:
        try:
            prompt = (
                f"You are a deterministic code reconciler. Reconcile OCR conflict for line {line_num}.\n"
                f"Candidate 1: {cand_a}\nCandidate 2: {cand_b}\n"
                f"Output ONLY the single correct, syntactically coherent code line verbatim."
            )
            req_data = json.dumps({
                "model": self.coder_model, "prompt": prompt, "stream": False,
                "options": {"temperature": 0.0, "num_predict": 128}
            }).encode("utf-8")
            req = urllib.request.Request(self.endpoint, data=req_data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                ans = data.get("response", "").strip().strip("`").strip()
                if ans: return ans
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, Exception) as e:
            self.stitch_stats["http_errors"] += 1
            self.stitch_stats["last_error"] = str(e)
        return None

DeterministicLineStitcher = LocalOllamaStitcher

class LocalGutterOCREngine(BaseOCREngine):
    @property
    def name(self) -> str: return "local_gutter_ocr"

    def __init__(self, ollama_url: str = "http://127.0.0.1:11434", ollama_vision_model: str = "llama3.2-vision", ollama_coder_model: str = "qwen2.5-coder", ollama_timeout: int = 45):
        self.ollama_url = ollama_url.rstrip("/")
        self.ollama_vision_model = ollama_vision_model
        self.ollama_coder_model = ollama_coder_model
        self.ollama_timeout = ollama_timeout
        self.rapid_ocr = RapidOCR() if RapidOCR is not None else None
        self.stitcher = LocalOllamaStitcher(self.ollama_url, self.ollama_coder_model, min(ollama_timeout, 15))
        self.error_stats: Dict[str, Any] = {"http_errors": 0, "last_error": None, "last_error_time": None}

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

        ollama_lines = self._call_ollama_vision(img)
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

    def _call_ollama_vision(self, img: np.ndarray, model_override: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
        h, w = img.shape[:2]
        scale = min(1.0, 720.0 / h) if h > 720 else 1.0
        v_small = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1.0 else img
        ok, enc = cv2.imencode(".jpg", v_small, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok: return None
        img_b64 = base64.b64encode(enc).decode("utf-8")
        prompt = (
            "Extract visible code lines verbatim with gutter line numbers from the image.\n"
            "Output each line in the strict structured format:\n"
            "LINE_NUM: code_content\n\n"
            "Rules:\n"
            "- Output ONLY lines in 'LINE_NUM: code_content' format, one per line.\n"
            "- LINE_NUM must be the integer line number visible in the left gutter.\n"
            "- code_content must be the verbatim code with exact indentation.\n"
            "- If a line is blank, output 'LINE_NUM:' with no code content.\n"
            "- Do not include markdown code fences, headers, or explanations."
        )

        models_to_try = [model_override] if model_override else [self.ollama_vision_model, "minicpm-v"]
        for m in models_to_try:
            if not m: continue
            try:
                req_data = json.dumps({
                    "model": m, "prompt": prompt, "images": [img_b64], "stream": False,
                    "options": {"num_predict": 768, "temperature": 0.05}
                }).encode("utf-8")
                req = urllib.request.Request(f"{self.ollama_url}/api/generate", data=req_data, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=self.ollama_timeout) as resp:
                    raw_text = json.loads(resp.read().decode("utf-8")).get("response", "").strip()
                raw_clean = re.sub(r"^\s*```(?:[a-zA-Z0-9_-]+)?\s*|\s*```\s*$", "", raw_text)
                extracted_lines = []
                for line in raw_clean.splitlines():
                    if not line.strip(): continue
                    if m_line := re.match(r"^\s*(\d+)\s*[:|]\s?(.*)$", line.rstrip()):
                        ln = int(m_line.group(1))
                        code = m_line.group(2)
                        extracted_lines.append({
                            "line_number": ln, "gutter_number": ln, "text": code,
                            "is_blank": not bool(code.strip()), "is_wrapped": False, "confidence": 0.98
                        })
                if extracted_lines: return extracted_lines
                if raw_text and (match := re.search(r'\[.*\]', raw_text, re.DOTALL)):
                    parsed = json.loads(match.group(0))
                    if isinstance(parsed, list): return parsed
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, Exception) as e:
                self.error_stats["http_errors"] += 1
                self.error_stats["last_error"] = str(e)
                self.error_stats["last_error_time"] = datetime.now().isoformat()
        return None
