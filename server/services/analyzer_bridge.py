"""
Python Bridge (`server/services/analyzer_bridge.py`) for `server/services/ts_analyzer_worker.mjs`.

Provides:
  1. `AnalyzerBridge`: Persistent stdin/stdout JSON-RPC & temp-file bridge to `ts_analyzer_worker.mjs`,
     sending `{ files: { [path: string]: { content: string, start_md_line: number, frame_ids: string[] } }, tsconfig: object }`
     and returning structured TypeScript syntactic & semantic diagnostics:
     `{ file, line, column, code, category, message, global_md_line, snippet }`.
  2. `verify_line_from_frame_slice`: Given a `global_md_line`, locates the source screen capture PNG,
     crops the exact horizontal row slice, encodes it as base64 PNG, and returns the current OCR text
     alongside high-resolution RapidOCR + VLM re-transcription.
"""

import asyncio
import base64
import json
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

import config
import db
from services import state
from services.accuracy_verifier import (
    _re_ocr_strip_with_upscale,
    find_frame_for_line,
    resolve_project_id,
)

WORKER_SCRIPT_PATH = Path(__file__).resolve().parent / "ts_analyzer_worker.mjs"


def _normalize_bbox_to_dict(bbox: Any, scale_y: float = 1.0) -> Dict[str, int]:
    if isinstance(bbox, dict) and bbox.get("y") is not None:
        return {
            "x": int(bbox.get("x", 94)),
            "y": int(bbox.get("y", 0)),
            "width": int(bbox.get("width", 1700)),
            "height": int(bbox.get("height", int(round(22 * scale_y)))),
        }
    if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
        x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
        return {
            "x": x1,
            "y": y1,
            "width": max(1, x2 - x1),
            "height": max(1, y2 - y1),
        }
    return {}


def _crop_line_strip_from_frame(
    img: np.ndarray,
    line_item: Dict[str, Any],
    ln: int,
    top_ln: int = 1,
) -> Tuple[np.ndarray, int, int, int]:
    """
    Crops the horizontal code strip `img[y1:y2, x_code_start:x_code_end]` for line `ln`.
    Returns `(code_strip, x_code_start, y1, y2)`.
    """
    h, w = img.shape[:2]
    scale_x = w / 1920.0
    scale_y = h / 1080.0
    x_code_start = int(round(94 * scale_x))
    x_code_end = max(x_code_start + 1, w - int(round(24 * scale_x)))

    bbox_dict = _normalize_bbox_to_dict(line_item.get("bbox"), scale_y)
    gbox_dict = _normalize_bbox_to_dict(line_item.get("gutter_bbox"), scale_y)

    if bbox_dict:
        y1 = max(0, bbox_dict["y"])
        y2 = min(h, bbox_dict["y"] + bbox_dict["height"])
    elif gbox_dict:
        y1 = max(0, gbox_dict["y"])
        y2 = min(h, gbox_dict["y"] + gbox_dict["height"])
    else:
        pitch_est = 27.0 * scale_y
        yc_est = 313.5 * scale_y + max(0, ln - top_ln) * pitch_est
        y1 = max(0, int(round(yc_est - 0.42 * pitch_est)))
        y2 = min(h, int(round(yc_est + 0.42 * pitch_est)))

    if y2 <= y1:
        y2 = min(h, y1 + max(12, int(round(22 * scale_y))))

    return img[y1:y2, x_code_start:x_code_end], x_code_start, y1, y2


def _compute_strip_ink_px(code_strip: Optional[np.ndarray]) -> int:
    if code_strip is None or code_strip.size == 0:
        return 0
    gray_strip = cv2.cvtColor(code_strip, cv2.COLOR_BGR2GRAY) if code_strip.ndim == 3 else code_strip
    bg_med = float(np.median(gray_strip))
    return int(np.count_nonzero(np.abs(gray_strip.astype(np.int16) - bg_med) > 24))

DEFAULT_TSCONFIG: Dict[str, Any] = {
    "compilerOptions": {
        "target": "ES2022",
        "useDefineForClassFields": True,
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "module": "ESNext",
        "skipLibCheck": True,
        "moduleResolution": "bundler",
        "allowImportingTsExtensions": True,
        "isolatedModules": True,
        "moduleDetection": "force",
        "noEmit": True,
        "jsx": "react-jsx",
        "strict": False,
    }
}


def build_worker_files_map(
    vfs_files: Union[List[Dict[str, Any]], Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """
    Converts a list of VFS file dicts (or an existing map) into the canonical worker payload map:
      `{ [path: string]: { content: string, start_md_line: number, frame_ids: string[] } }`
    """
    if isinstance(vfs_files, dict):
        result: Dict[str, Dict[str, Any]] = {}
        for path_key, val in vfs_files.items():
            norm_key = str(path_key).replace("\\", "/").lstrip("/")
            if isinstance(val, dict):
                fids = val.get("frame_ids") or val.get("source_frame_ids") or []
                result[norm_key] = {
                    "content": str(val.get("content") or ""),
                    "start_md_line": int(val.get("start_md_line") or 0),
                    "end_md_line": int(val.get("end_md_line") or 0),
                    "frame_ids": [str(x) for x in fids],
                    "ext": str(val.get("ext") or Path(norm_key).suffix.lower()),
                    "raw_path": str(val.get("path") or path_key),
                }
            else:
                result[norm_key] = {
                    "content": str(val or ""),
                    "start_md_line": 0,
                    "end_md_line": 0,
                    "frame_ids": [],
                    "ext": Path(norm_key).suffix.lower(),
                    "raw_path": str(path_key),
                }
        return result

    files_map: Dict[str, Dict[str, Any]] = {}
    for entry in vfs_files or []:
        if not isinstance(entry, dict):
            continue
        raw_p = str(entry.get("path") or entry.get("normalized_path") or "unnamed.ts")
        norm_p = str(entry.get("normalized_path") or raw_p).replace("\\", "/").lstrip("/")
        fids = entry.get("frame_ids") or entry.get("source_frame_ids") or []
        files_map[norm_p] = {
            "content": str(entry.get("content") or ""),
            "start_md_line": int(entry.get("start_md_line") or 0),
            "end_md_line": int(entry.get("end_md_line") or 0),
            "frame_ids": [str(x) for x in fids],
            "ext": str(entry.get("ext") or Path(norm_p).suffix.lower()),
            "raw_path": raw_p,
        }
    return files_map


def resolve_frame_and_bbox_for_md_line(
    global_md_line: int,
    fallback_frame_ids: Optional[List[str]] = None,
    project_id: Optional[str] = None,
) -> Tuple[str, Optional[Path], Optional[List[int]], Optional[List[int]]]:
    """
    Resolves `(frame_id, image_path, line_bbox, gutter_bbox)` for a 1-based `global_md_line`.
    """
    doc_entry = state.document_lines.get(global_md_line)
    fid = ""
    if isinstance(doc_entry, dict):
        fid = str(doc_entry.get("frame_id") or "")
    elif hasattr(doc_entry, "meta"):
        fid = str(doc_entry.meta.get("frame_id") or "")

    if not fid and project_id:
        try:
            db_lines = db.get_document_lines(project_id)
            if global_md_line in db_lines:
                fid = str((db_lines[global_md_line] or {}).get("frame_id") or "")
        except Exception:
            pass

    if not fid and fallback_frame_ids:
        for cand_fid in fallback_frame_ids:
            finfo = state.captured_frames.get(cand_fid)
            if finfo and (int(finfo.get("top_line", 0)) <= global_md_line <= int(finfo.get("bottom_line", 0))):
                fid = str(cand_fid)
                break
        if not fid:
            fid = str(fallback_frame_ids[0])

    img_path = find_frame_for_line(global_md_line, frame_id=fid)
    if not fid and img_path:
        fid = img_path.stem

    finfo = state.captured_frames.get(fid) or {}
    bboxes = finfo.get("bounding_boxes") or {}
    line_boxes = bboxes.get("line_boxes") or {}
    gutter_boxes = bboxes.get("gutter_boxes") or {}

    line_bbox = line_boxes.get(global_md_line) or line_boxes.get(str(global_md_line))
    gutter_bbox = gutter_boxes.get(global_md_line) or gutter_boxes.get(str(global_md_line))

    return fid, img_path, line_bbox, gutter_bbox


class AnalyzerBridge:
    """
    Python bridge to `server/services/ts_analyzer_worker.mjs`.
    Supports both persistent stdin/stdout JSON-RPC communication and one-shot temp-file execution.
    """

    def __init__(self, worker_path: Path = WORKER_SCRIPT_PATH):
        self.worker_path = worker_path
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()

    def _ensure_started(self) -> subprocess.Popen:
        if self._proc is not None and self._proc.poll() is None:
            return self._proc

        self._proc = subprocess.Popen(
            ["node", str(self.worker_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
            cwd=str(self.worker_path.parent.parent),
        )
        return self._proc

    def build_payload(
        self,
        files: Union[List[Dict[str, Any]], Dict[str, Any]],
        tsconfig: Optional[Dict[str, Any]] = None,
        include_semantic_in_diagnostics: bool = False,
    ) -> Dict[str, Any]:
        files_map = build_worker_files_map(files)
        return {
            "id": f"req_{uuid.uuid4().hex[:8]}",
            "action": "validate",
            "files": files_map,
            "tsconfig": tsconfig if isinstance(tsconfig, dict) else DEFAULT_TSCONFIG,
            "include_semantic_in_diagnostics": bool(include_semantic_in_diagnostics),
        }

    def _enrich_worker_response(
        self,
        resp: Dict[str, Any],
        files_map: Dict[str, Dict[str, Any]],
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Enriches diagnostics with exact `frame_id`, `bbox`, `file`, `line`, `column`, `global_md_line`, and `snippet`.
        """
        for list_key in ("diagnostics", "syntactic_diagnostics", "semantic_diagnostics", "all_diagnostics"):
            diag_list = resp.get(list_key)
            if not isinstance(diag_list, list):
                continue
            for d in diag_list:
                if not isinstance(d, dict):
                    continue
                norm_p = d.get("normalized_path") or d.get("file") or ""
                f_meta = files_map.get(norm_p) or {}
                f_line = int(d.get("line") or d.get("file_line") or 1)
                f_col = int(d.get("column") or d.get("file_col") or 1)
                start_md = int(f_meta.get("start_md_line") or 0)
                g_md_line = int(d.get("global_md_line") or ((start_md + f_line) if start_md > 0 else f_line))

                fid, _, line_bbox, _ = resolve_frame_and_bbox_for_md_line(
                    g_md_line,
                    fallback_frame_ids=f_meta.get("frame_ids") or d.get("frame_ids") or [],
                    project_id=project_id,
                )

                if not d.get("snippet") and f_meta.get("content"):
                    content_lines = str(f_meta["content"]).splitlines()
                    if 1 <= f_line <= len(content_lines):
                        d["snippet"] = content_lines[f_line - 1]

                d["file"] = d.get("file") or norm_p
                d["line"] = f_line
                d["column"] = f_col
                d["global_md_line"] = g_md_line
                d["file_path"] = d.get("file_path") or f_meta.get("raw_path") or norm_p
                d["normalized_path"] = norm_p
                d["file_line"] = f_line
                d["file_col"] = f_col
                d["frame_id"] = fid or d.get("frame_id") or ""
                d["bbox"] = line_bbox
        return resp

    def validate_via_temp_file_sync(
        self,
        files: Union[List[Dict[str, Any]], Dict[str, Any]],
        tsconfig: Optional[Dict[str, Any]] = None,
        include_semantic_in_diagnostics: bool = False,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Invokes `ts_analyzer_worker.mjs --input <temp.json>` using a temporary JSON file on disk.
        """
        payload = self.build_payload(
            files=files,
            tsconfig=tsconfig,
            include_semantic_in_diagnostics=include_semantic_in_diagnostics,
        )
        files_map = payload["files"]

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", encoding="utf-8", delete=False
        ) as tf:
            json.dump(payload, tf, ensure_ascii=False)
            temp_in_path = Path(tf.name)

        try:
            proc = subprocess.run(
                ["node", str(self.worker_path), "--input", str(temp_in_path)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=30,
                cwd=str(self.worker_path.parent.parent),
            )
            out_line = (proc.stdout or "").strip()
            if not out_line:
                return {
                    "status": "error",
                    "error": (proc.stderr or "Empty output from ts_analyzer_worker.mjs").strip(),
                    "total_files": len(files_map),
                    "compilable_files": 0,
                    "syntax_errors_count": 0,
                    "diagnostics": [],
                }
            resp = json.loads(out_line.splitlines()[-1])
            return self._enrich_worker_response(resp, files_map, project_id=project_id)
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "total_files": len(files_map),
                "compilable_files": 0,
                "syntax_errors_count": 0,
                "diagnostics": [],
            }
        finally:
            try:
                if temp_in_path.exists():
                    temp_in_path.unlink()
            except Exception:
                pass

    def validate_files_sync(
        self,
        files: Union[List[Dict[str, Any]], Dict[str, Any]],
        tsconfig: Optional[Dict[str, Any]] = None,
        include_semantic_in_diagnostics: bool = False,
        use_temp_file: bool = False,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Validates VFS files using the persistent stdin/stdout worker (or falls back to temp-file execution).
        """
        if use_temp_file:
            return self.validate_via_temp_file_sync(
                files=files,
                tsconfig=tsconfig,
                include_semantic_in_diagnostics=include_semantic_in_diagnostics,
                project_id=project_id,
            )

        payload = self.build_payload(
            files=files,
            tsconfig=tsconfig,
            include_semantic_in_diagnostics=include_semantic_in_diagnostics,
        )
        files_map = payload["files"]
        line_str = json.dumps(payload, ensure_ascii=False) + "\n"

        with self._lock:
            for attempt in range(2):
                try:
                    proc = self._ensure_started()
                    assert proc.stdin is not None and proc.stdout is not None
                    proc.stdin.write(line_str)
                    proc.stdin.flush()
                    resp_line = proc.stdout.readline()
                    if not resp_line:
                        if self._proc:
                            try:
                                self._proc.kill()
                            except Exception:
                                pass
                            self._proc = None
                        continue
                    resp = json.loads(resp_line)
                    return self._enrich_worker_response(resp, files_map, project_id=project_id)
                except Exception:
                    if self._proc:
                        try:
                            self._proc.kill()
                        except Exception:
                            pass
                        self._proc = None
                    if attempt == 1:
                        return self.validate_via_temp_file_sync(
                            files=files,
                            tsconfig=tsconfig,
                            include_semantic_in_diagnostics=include_semantic_in_diagnostics,
                            project_id=project_id,
                        )

        return self.validate_via_temp_file_sync(
            files=files,
            tsconfig=tsconfig,
            include_semantic_in_diagnostics=include_semantic_in_diagnostics,
            project_id=project_id,
        )

    async def validate_files(
        self,
        files: Union[List[Dict[str, Any]], Dict[str, Any]],
        tsconfig: Optional[Dict[str, Any]] = None,
        include_semantic_in_diagnostics: bool = False,
        use_temp_file: bool = False,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(
            self.validate_files_sync,
            files,
            tsconfig,
            include_semantic_in_diagnostics,
            use_temp_file,
            project_id,
        )


analyzer_bridge = AnalyzerBridge()


def _vlm_retranscribe_line_crop_sync(
    crop_bgr: np.ndarray,
    global_md_line: int,
    fallback_text: str = "",
) -> str:
    """
    Runs local Ollama vision model (MiniCPM-V) on a single cropped line strip if available,
    returning the clean single-line transcription.
    """
    try:
        import urllib.request

        h, w = crop_bgr.shape[:2]
        scale = 2 if h < 48 else 1
        if scale > 1:
            crop_bgr = cv2.resize(crop_bgr, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)

        ok, buf = cv2.imencode(".png", crop_bgr)
        if not ok:
            return fallback_text
        b64_img = base64.b64encode(buf.tobytes()).decode("ascii")

        req_body = json.dumps({
            "model": config.OLLAMA_VISION_MODEL,
            "prompt": (
                f"Transcribe the exact single line of code or markdown on line {global_md_line}. "
                "Preserve leading spaces, punctuation, backticks, brackets, and HTML comment tags verbatim. "
                "Output ONLY the raw code line with no explanation or markdown fences."
            ),
            "images": [b64_img],
            "stream": False,
            "options": {"temperature": 0.0, "num_predict": 200},
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{config.OLLAMA_URL.rstrip('/')}/api/generate",
            data=req_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=4.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_resp = (data.get("response") or "").strip("\r\n")
            if raw_resp:
                first_ln = raw_resp.splitlines()[0]
                return state.sanitize_line_text(global_md_line, first_ln)
    except Exception:
        pass
    return fallback_text


def verify_line_from_frame_slice_sync(
    project_id: Optional[str],
    global_md_line: int,
    frame_id_override: Optional[str] = None,
    run_vlm: bool = True,
    apply_patch: bool = False,
) -> Dict[str, Any]:
    """
    Given a `global_md_line`:
      1. Resolves the current OCR text and originating `frame_id` + PNG screenshot on disk.
      2. Crops the exact horizontal code strip (and full gutter+code strip) from the source PNG.
      3. Computes foreground ink pixel energy and runs high-resolution RapidOCR + optional VLM re-transcription.
      4. Returns the cropped PNG slice (base64 & data URL) alongside `current_ocr_text` and `vlm_re_transcription`.
    """
    pid = resolve_project_id(project_id)
    ln = int(global_md_line)

    # 1. Resolve current OCR text from state.document_lines or SQLite DB
    current_ocr_text = ""
    doc_entry = state.document_lines.get(ln)
    if doc_entry is not None:
        current_ocr_text = doc_entry.get("text", "") if isinstance(doc_entry, dict) else str(doc_entry)
    elif pid:
        try:
            db_lines = db.get_document_lines(pid)
            if ln in db_lines:
                current_ocr_text = str((db_lines[ln] or {}).get("text", ""))
        except Exception:
            pass

    fid, img_path, line_bbox, gutter_bbox = resolve_frame_and_bbox_for_md_line(
        ln,
        fallback_frame_ids=[frame_id_override] if frame_id_override else None,
        project_id=pid,
    )

    if not img_path or not img_path.exists():
        return {
            "status": "frame_not_found",
            "project_id": pid,
            "global_md_line": ln,
            "frame_id": fid,
            "current_ocr_text": current_ocr_text,
            "re_transcribed_text": current_ocr_text,
            "vlm_re_transcription": current_ocr_text,
            "cropped_png_base64": None,
            "cropped_data_url": None,
            "message": f"No source PNG frame found on disk for global_md_line={ln} (frame_id='{fid}').",
        }

    img = cv2.imread(str(img_path))
    if img is None:
        return {
            "status": "image_read_error",
            "project_id": pid,
            "global_md_line": ln,
            "frame_id": fid,
            "image_path": str(img_path),
            "current_ocr_text": current_ocr_text,
            "re_transcribed_text": current_ocr_text,
            "vlm_re_transcription": current_ocr_text,
            "cropped_png_base64": None,
            "cropped_data_url": None,
        }

    img_h, img_w = img.shape[:2]
    scale_y = img_h / 1080.0
    finfo = state.captured_frames.get(fid) or {}
    top_ln = int(finfo.get("top_line") or 1)

    bbox_dict = _normalize_bbox_to_dict(line_bbox, scale_y)
    gbox_dict = _normalize_bbox_to_dict(gutter_bbox, scale_y)

    line_item = {
        "line_number": ln,
        "gutter_number": ln,
        "text": current_ocr_text,
        "bbox": bbox_dict,
        "gutter_bbox": gbox_dict,
    }

    code_strip, x_code_start, y1, y2 = _crop_line_strip_from_frame(img, line_item, ln, top_ln=top_ln)
    ink_px = _compute_strip_ink_px(code_strip)

    full_row_strip = img[max(0, y1 - 2) : min(img_h, y2 + 2), 0 : max(200, img_w - int(round(24.0 * (img_w / 1920.0))))]
    display_strip = full_row_strip if (full_row_strip is not None and full_row_strip.size > 0) else code_strip

    cropped_b64 = ""
    cropped_data_url = ""
    slice_disk_path = ""
    if display_strip is not None and display_strip.size > 0:
        ok, png_buf = cv2.imencode(".png", display_strip)
        if ok:
            raw_bytes = png_buf.tobytes()
            cropped_b64 = base64.b64encode(raw_bytes).decode("ascii")
            cropped_data_url = f"data:image/png;base64,{cropped_b64}"
            try:
                slices_dir = Path(__file__).resolve().parent.parent / "storage" / "sandbox" / (pid or "default") / "slices"
                slices_dir.mkdir(parents=True, exist_ok=True)
                sp = slices_dir / f"line_{ln:05d}_{fid}.png"
                sp.write_bytes(raw_bytes)
                slice_disk_path = str(sp)
            except Exception:
                pass

    rapidocr_text, blank_locked, _ = _re_ocr_strip_with_upscale(
        image_path=img_path,
        line_item=line_item,
        ln=ln,
        ref_txt="",
    )

    if blank_locked:
        vlm_text = ""
        best_retranscription = ""
    else:
        vlm_text = (
            _vlm_retranscribe_line_crop_sync(code_strip, ln, fallback_text=rapidocr_text or current_ocr_text)
            if (run_vlm and code_strip is not None and code_strip.size > 0)
            else rapidocr_text
        )
        best_retranscription = vlm_text or rapidocr_text or current_ocr_text

    from dag_nodes.ast_compiler_validator_node import generate_ocr_symbol_repair_candidates
    repair_candidates = generate_ocr_symbol_repair_candidates(best_retranscription or current_ocr_text)

    if apply_patch and best_retranscription != current_ocr_text:
        state.document_lines[ln] = state.MasterLine(
            best_retranscription,
            line_number=ln,
            gutter_number=ln,
            frame_id=fid,
            status="verified",
            blank_locked=blank_locked,
        )
        if pid:
            try:
                db.save_document_line(
                    project_id=pid,
                    line_number=ln,
                    text=best_retranscription,
                    confidence=0.99,
                    frame_id=fid,
                    verified=True,
                )
            except Exception:
                pass

    return {
        "status": "ok",
        "project_id": pid,
        "global_md_line": ln,
        "frame_id": fid,
        "image_path": str(img_path),
        "bbox": [int(x_code_start), int(y1), int(img_w - 24), int(y2)],
        "gutter_bbox": gutter_bbox,
        "ink_pixels": int(ink_px),
        "blank_locked": bool(blank_locked),
        "current_ocr_text": current_ocr_text,
        "rapidocr_text": rapidocr_text,
        "vlm_re_transcription": vlm_text,
        "re_transcribed_text": best_retranscription,
        "symbol_repair_candidates": repair_candidates,
        "cropped_png_base64": cropped_b64,
        "cropped_data_url": cropped_data_url,
        "slice_path": slice_disk_path,
    }
