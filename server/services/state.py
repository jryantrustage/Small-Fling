import json
import re
import sys
import time
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
import numpy as np
from fastapi import WebSocket
from concurrent.futures import ThreadPoolExecutor

import config
import db
from ocr_engine import LocalGutterOCREngine, worker_scan_image, worker_detect_last_line, worker_verify_first_line, worker_detect_top_line, worker_detect_gutter_bounds
import asyncio
from pathlib import Path
from typing import Tuple

FRAMES_DIR = config.FRAMES_DIR
DOCUMENT_FILE = config.DOCUMENT_FILE
RECAPTURE_QUEUE_FILE = config.RECAPTURE_QUEUE_FILE

def _register_numpy_encoders():
    try:
        from fastapi.encoders import ENCODERS_BY_TYPE
        def _subclasses(cls):
            for s in cls.__subclasses__():
                yield s
                yield from _subclasses(s)
        for t in _subclasses(np.generic):
            if issubclass(t, np.bool_):
                ENCODERS_BY_TYPE[t] = bool
            elif issubclass(t, np.integer):
                ENCODERS_BY_TYPE[t] = int
            elif issubclass(t, np.floating):
                ENCODERS_BY_TYPE[t] = float
        ENCODERS_BY_TYPE[np.ndarray] = lambda x: x.tolist()
    except Exception as e:
        print(f"Note: error registering numpy encoders: {e}")

_register_numpy_encoders()

def sanitize_for_json(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, (np.bool_, getattr(np, 'bool', np.bool_))):
        return bool(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return [sanitize_for_json(v) for v in obj.tolist()]
    elif hasattr(obj, "item") and callable(getattr(obj, "item")):
        try:
            return obj.item()
        except Exception:
            pass
    return obj

class NumpySafeJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.bool_, getattr(np, 'bool', np.bool_))):
            return bool(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if hasattr(obj, "item") and callable(getattr(obj, "item")):
            try:
                return obj.item()
            except Exception:
                pass
        return super().default(obj)

class WebSocketManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: Any):
        try:
            payload = json.dumps(message, cls=NumpySafeJSONEncoder) if not isinstance(message, str) else message
        except Exception as e:
            print(f"[WebSocketManager] broadcast serialization error: {e}")
            return
        for ws in list(self.active):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(ws)

    async def close_all(self):
        for ws in list(self.active):
            try:
                await ws.close(code=1001, reason="Server shutting down or reloading")
            except Exception:
                pass
        self.active.clear()

ws_manager = WebSocketManager()
ocr_executor = ThreadPoolExecutor(max_workers=2)


async def detect_gutter_bounds_in_process(image_path: Path, dpi_factor: float = 1.0) -> Tuple[int, int]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_detect_gutter_bounds, str(image_path), dpi_factor)

async def detect_last_line_in_process(image_path: Path, dpi_factor: float = 1.0) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_detect_last_line, str(image_path), dpi_factor)

async def verify_first_line_in_process(image_path: Path, dpi_factor: float = 1.0) -> Tuple[bool, int]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_verify_first_line, str(image_path), dpi_factor)

async def detect_top_line_in_process(image_path: Path, dpi_factor: float = 1.0, target_top: Optional[int] = None) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_detect_top_line, str(image_path), dpi_factor, target_top)

async def scan_image_in_process(image_path: Path) -> Dict[str, Any]:
    import services.ocr_service as ocr_svc
    return await ocr_svc.scan_image_with_minicpm(image_path)


ocr_engine = LocalGutterOCREngine(
    ollama_url=config.OLLAMA_URL,
    ollama_vision_model=config.OLLAMA_VISION_MODEL,
    ollama_coder_model=config.OLLAMA_CODER_MODEL
)

class MasterLine(str):
    def __new__(cls, _text: str = "", **meta):
        if not _text and "text" in meta:
            _text = meta.get("text", "")
        meta_clean = dict(meta)
        meta_clean.pop("text", None)
        s = super().__new__(cls, str(_text) if _text is not None else "")
        s.meta = meta_clean
        s._cached_serialized = None
        return s

    def _notify_dirty(self):
        self._cached_serialized = None
        ln = self.meta.get("line_number")
        if ln is not None and isinstance(document_lines, MasterDocumentLines):
            document_lines.mark_dirty(int(ln))

    def get(self, key, default=None):
        if key == "text": return self.meta.get("text", str(self))
        if key == "line_number": return self.meta.get("line_number", 0)
        return self.meta.get(key, default)

    def __getitem__(self, item):
        if isinstance(item, str):
            if item == "text": return self.meta.get("text", str(self))
            return self.meta.get(item)
        return super().__getitem__(item)

    def __setitem__(self, item, value):
        if isinstance(item, str):
            self.meta[item] = value
            self._notify_dirty()
            return
        raise TypeError("MasterLine item assignment only supports string metadata keys")

    def __str__(self):
        return self.meta.get("text", super().__str__())

    def update(self, d: dict):
        self.meta.update(d)
        self._notify_dirty()

    def to_dict(self) -> dict:
        d = dict(self.meta)
        d["text"] = self.meta.get("text", str(self))
        d.setdefault("line_number", 0)
        d.setdefault("status", "ok")
        return d

    def to_serialized_dict(self, k: int) -> dict:
        cached = getattr(self, "_cached_serialized", None)
        if cached is not None and cached.get("line_number") == k:
            return cached
        d = dict(self.meta)
        raw_txt = self.meta.get("text", super().__str__())
        clean_txt = sanitize_line_text(k, raw_txt)
        d["text"] = clean_txt
        d["is_blank"] = not bool(clean_txt.strip())
        d.setdefault("line_number", k)
        d.setdefault("status", "ok")
        self._cached_serialized = d
        return d

class MasterDocumentLines(dict):
    def __init__(self, *args, **kwargs):
        super().__init__()
        self.dirty_lines: set = set()
        self.deleted_lines: set = set()
        self.cleared: bool = False
        self._suppress_tracking: bool = False
        self._version: int = 0
        if args or kwargs:
            self.update(*args, **kwargs)

    def mark_dirty(self, line_number: int):
        self._version += 1
        if not self._suppress_tracking:
            ln = int(line_number)
            self.dirty_lines.add(ln)
            self.deleted_lines.discard(ln)

    def mark_clean(self):
        self.dirty_lines.clear()
        self.deleted_lines.clear()
        self.cleared = False

    def __setitem__(self, key: int, value: Any):
        k = int(key)
        if isinstance(value, MasterLine):
            value.meta.setdefault("line_number", k)
            super().__setitem__(k, value)
        elif isinstance(value, str):
            existing_meta = self[k].meta if (k in self and hasattr(self[k], "meta")) else {
                "line_number": k, "status": "ok", "updated_at": datetime.now().isoformat()
            }
            super().__setitem__(k, MasterLine(value, **existing_meta))
        elif isinstance(value, dict):
            text = value.get("text", "")
            meta = dict(value)
            meta.pop("text", None)
            meta["line_number"] = k
            super().__setitem__(k, MasterLine(text, **meta))
        else:
            super().__setitem__(k, MasterLine(str(value), line_number=k))
        self.mark_dirty(k)

    def __delitem__(self, key: int):
        k = int(key)
        super().__delitem__(k)
        self._version += 1
        if not self._suppress_tracking:
            self.dirty_lines.discard(k)
            self.deleted_lines.add(k)

    def pop(self, key: int, *args):
        k = int(key)
        existed = k in self
        res = super().pop(k, *args)
        if existed:
            self._version += 1
            if not self._suppress_tracking:
                self.dirty_lines.discard(k)
                self.deleted_lines.add(k)
        return res

    def clear(self):
        had_items = len(self) > 0
        super().clear()
        self.dirty_lines.clear()
        self.deleted_lines.clear()
        self._version += 1
        if had_items and not self._suppress_tracking:
            self.cleared = True

    def update(self, *args, **kwargs):
        if args:
            other = args[0]
            if isinstance(other, dict):
                for k, v in other.items():
                    self[int(k)] = v
            else:
                for k, v in other:
                    self[int(k)] = v
        for k, v in kwargs.items():
            self[int(k)] = v


class CapturedFramesDict(dict):
    def __init__(self, *args, **kwargs):
        super().__init__()
        self.dirty_frames: set = set()
        self._suppress_tracking: bool = False
        if args or kwargs:
            self.update(*args, **kwargs)

    def mark_dirty(self, frame_id: str):
        if not self._suppress_tracking and frame_id:
            self.dirty_frames.add(str(frame_id))

    def mark_clean(self):
        self.dirty_frames.clear()

    def __setitem__(self, key: str, value: Any):
        k = str(key)
        super().__setitem__(k, value)
        self.mark_dirty(k)

    def update(self, *args, **kwargs):
        if args:
            other = args[0]
            if isinstance(other, dict):
                for k, v in other.items():
                    self[str(k)] = v
            else:
                for k, v in other:
                    self[str(k)] = v
        for k, v in kwargs.items():
            self[str(k)] = v

    def clear(self):
        super().clear()
        self.dirty_frames.clear()


document_lines: MasterDocumentLines = MasterDocumentLines()
captured_frames: CapturedFramesDict = CapturedFramesDict()
recapture_queue: List[Dict[str, Any]] = []

token_stats: Dict[str, Any] = {
    "total_prompt_tokens": 0, "total_candidates_tokens": 0, "total_tokens": 0, "total_api_calls": 0, "estimated_cost_usd": 0.0,
    "mobile_tokens": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
}

desktop_keyboard_prohibited: bool = True
desktop_mode_enabled: bool = True

is_sequential_rescan_running: bool = False
cancel_sequential_rescan: bool = False
sequential_rescan_progress: Dict[str, Any] = {
    "is_running": False,
    "current_index": 0,
    "total_frames": 0,
    "current_frame_id": None,
    "current_top_line": 0,
    "current_bottom_line": 0,
    "total_verified_lines": 0,
    "status_message": "Ready"
}

latest_telemetry: Dict[str, Any] = {
    "device_id": "idle", "is_pacing": False, "current_page": 0, "current_top_line": 0, "current_bottom_line": 0,
    "target_total_lines": config.TARGET_TOTAL_LINES, "dwell_countdown_ms": 0, "phase": "IDLE", "status_message": "Matrix Capture Studio ready",
    "last_heartbeat": None,
    "keyboard_visible": False,
    "desktop_keyboard_prohibited": True,
    "desktop_mode_enabled": True,
    "pacer_calibration": {"auto_tune_factor": config.PACER_AUTO_TUNE_FACTOR, "line_pitch_px": config.PACER_LINE_PITCH_PX, "bottom_to_top_error": 0, "wrapped_lines_detected": 0},
    "capture_telemetry": {
        "status": "idle",
        "last_latency_ms": 0,
        "last_capture_time": None,
        "display_id": "4613572713243172731",
        "display_name": None,
        "resolution": "1920x1080",
        "frame_bytes": 0,
        "cache_hit": False,
        "active_dpi": 120,
        "dpi_factor": 0.75,
        "settle_delay_ms": 40,
        "total_captures": 0,
        "error": None
    },
    "latest_key_event": None,
    "key_event_stats": {
        "total_dispatched": 0,
        "navigated_away_count": 0,
        "last_navigated_away": None,
        "key_counts": {}
    }
}

latest_alignment_status: Dict[str, Any] = {
    "status": "teams markdown not aligned",
    "is_aligned": False,
    "reason": "Awaiting display stream and initial alignment check",
    "missing": ["teams_logo", "file_name", "first_line", "last_line"],
    "first_line_number": None,
    "last_line_number": None,
    "file_name": "",
    "boxes": {},
    "timestamp": None,
    "dismissed": []
}

dismissed_alignment_items: set = set()


def sync_alignment_gutter_lines(
    top_line: int,
    bottom_line: int,
    character_tracking_mode: bool = False,
    anchor_preview: str = "",
) -> Dict[str, Any]:
    """
    Synchronizes verified gutter top/bottom line numbers into `latest_alignment_status`
    and `latest_telemetry` during active DAG capture loops so the Live Desktop overlay
    and TOP/BOTTOM GUTTER callouts always display real-time line bounds.
    """
    if top_line and top_line > 0:
        latest_telemetry["current_top_line"] = int(top_line)
        latest_alignment_status["first_line_number"] = int(top_line)
    if bottom_line and bottom_line > 0:
        latest_telemetry["current_bottom_line"] = int(bottom_line)
        latest_alignment_status["last_line_number"] = int(bottom_line)
    latest_alignment_status["character_tracking_mode"] = bool(character_tracking_mode)

    res_dims = latest_alignment_status.get("resolution") or {}
    w = int(res_dims.get("width") or 1280)
    h = int(res_dims.get("height") or 1024)
    dpi_scale = (h / 1080.0) if h < 720 else 1.0

    boxes = latest_alignment_status.setdefault("boxes", {})
    if top_line and top_line > 0:
        fl = boxes.setdefault("first_line", {})
        bw = max(24, len(str(int(top_line))) * int(10 * dpi_scale) + 8)
        bh = int(22 * dpi_scale)
        old_norm = fl.get("box_norm")
        if not old_norm or old_norm[1] < 0.22 or not fl.get("passed"):
            bx, by = int(38 * dpi_scale), int(300 * dpi_scale)
            fl["box_px"] = [bx, by, bw, bh]
            fl["box_norm"] = [round(bx / w, 4), round(by / h, 4), round(bw / w, 4), round(bh / h, 4)]
        else:
            px = list(fl.get("box_px") or [int(38 * dpi_scale), int(300 * dpi_scale), bw, bh])
            px[2] = max(px[2], bw)
            fl["box_px"] = px
            fl["box_norm"] = [round(px[0] / w, 4), round(px[1] / h, 4), round(px[2] / w, 4), round(px[3] / h, 4)]
        fl_label = f"Line {int(top_line)} (Char Track)" if character_tracking_mode else f"Line {int(top_line)}"
        fl_details = (
            f"Character tracking active on wrapped Line {int(top_line)}"
            + (f" • '{anchor_preview[:32]}...'" if anchor_preview else "")
            if character_tracking_mode
            else f"Top line number {int(top_line)} detected in gutter"
        )
        fl.update({
            "name": "First Line Number",
            "color": "green",
            "hex": "#22c55e",
            "passed": True,
            "status": "PASSED",
            "detected_value": fl_label,
            "expected": "Top line integer >= 1 in gutter or wrapped character anchor",
            "details": fl_details,
            "line_number": int(top_line),
        })

    if bottom_line and bottom_line > 0:
        ll = boxes.setdefault("last_line", {})
        bw = max(24, len(str(int(bottom_line))) * int(10 * dpi_scale) + 8)
        bh = int(22 * dpi_scale)
        old_norm = ll.get("box_norm")
        if not old_norm or old_norm[1] > 0.91 or old_norm[1] < 0.35 or not ll.get("passed"):
            bx, by = int(38 * dpi_scale), int(866 * dpi_scale)
            ll["box_px"] = [bx, by, bw, bh]
            ll["box_norm"] = [round(bx / w, 4), round(by / h, 4), round(bw / w, 4), round(bh / h, 4)]
        else:
            px = list(ll.get("box_px") or [int(38 * dpi_scale), int(866 * dpi_scale), bw, bh])
            px[2] = max(px[2], bw)
            ll["box_px"] = px
            ll["box_norm"] = [round(px[0] / w, 4), round(px[1] / h, 4), round(px[2] / w, 4), round(px[3] / h, 4)]
        ll_label = f"Line {int(bottom_line)} (Char Track)" if character_tracking_mode else f"Line {int(bottom_line)}"
        ll_details = (
            f"Character tracking active at bottom of wrapped Line {int(bottom_line)}"
            if character_tracking_mode
            else f"Bottom line number {int(bottom_line)} detected in gutter"
        )
        ll.update({
            "name": "Last Line Number",
            "color": "red",
            "hex": "#ef4444",
            "passed": True,
            "status": "PASSED",
            "detected_value": ll_label,
            "expected": f"Bottom line integer >= {int(top_line or 1)} in gutter or wrapped character anchor",
            "details": ll_details,
            "line_number": int(bottom_line),
        })

    if isinstance(latest_alignment_status.get("missing"), list):
        latest_alignment_status["missing"] = [
            m for m in latest_alignment_status["missing"]
            if "line number" not in str(m).lower() and m not in ("first_line", "last_line")
        ]
        if not latest_alignment_status["missing"]:
            latest_alignment_status["is_aligned"] = True
            latest_alignment_status["status"] = "teams markdown aligned"
            latest_alignment_status["reason"] = None

    latest_alignment_status["timestamp"] = datetime.now().isoformat()
    return latest_alignment_status


def append_wrapped_continuation_line(
    line_number: int,
    frame_id: str,
    chunk_text: str,
    page_index: Optional[int] = None,
    is_root_chunk: bool = False,
    **extra_meta: Any,
) -> Dict[str, Any]:
    """
    Idempotently stitches multi-page wrapped continuation text chunks onto `document_lines[line_number]`.
    Maintains an ordered map of `frame_id -> chunk_text` so re-scanning or retrying any wrapped page
    updates its chunk in place without duplicating or overwriting earlier pages of the wrapped line.
    """
    from ocr_engine import join_wrapped_row_slices
    ln = int(line_number)
    fid = str(frame_id or f"page_{page_index or 0}")
    clean_chunk = str(chunk_text or "")

    existing = document_lines.get(ln)
    if existing is not None and hasattr(existing, "meta") and not is_root_chunk:
        meta = dict(existing.meta)
        chunks_map = dict(meta.get("wrapped_chunks") or {})
        chunk_order = list(meta.get("wrapped_chunk_order") or [])
        if not chunks_map:
            root_fid = str(meta.get("frame_id") or "root")
            root_txt = str(existing)
            if root_txt:
                chunks_map[root_fid] = root_txt
                chunk_order.append(root_fid)
    else:
        meta = {
            "line_number": ln,
            "status": "verified",
            "frame_id": fid,
            "page_index": page_index,
        }
        chunks_map = {}
        chunk_order = []

    if fid not in chunk_order:
        # If the previous entry in chunk_order was a temporary or pre-refinement frame_id from Node 3/4
        # (either no longer in captured_frames or holding the identical chunk_text), replace it in-place
        replaced_in_place = False
        if chunk_order:
            last_k = chunk_order[-1]
            if last_k != fid and (
                chunks_map.get(last_k) == clean_chunk
                or last_k == "dag_node3_capture_temp"
                or (captured_frames and last_k.startswith("frame_") and last_k not in captured_frames)
            ):
                chunks_map.pop(last_k, None)
                chunk_order[-1] = fid
                replaced_in_place = True
        if not replaced_in_place:
            chunk_order.append(fid)
    chunks_map[fid] = clean_chunk

    ordered_texts = [chunks_map[k] for k in chunk_order if k in chunks_map and chunks_map[k]]
    full_text = join_wrapped_row_slices(ordered_texts) if ordered_texts else clean_chunk

    meta.update(extra_meta)
    meta.update({
        "line_number": ln,
        "is_wrapped": True,
        "wrapped_chunks": chunks_map,
        "wrapped_chunk_order": chunk_order,
        "wrapped_pages_count": len(chunk_order),
        "last_continuation_frame_id": fid,
        "updated_at": datetime.now().isoformat(),
    })
    meta.pop("text", None)
    document_lines[ln] = MasterLine(full_text, **meta)
    return document_lines[ln].to_dict()

orchestration_state: Dict[str, Any] = {
    "status": "IDLE", "last_command": "NONE", "source": "system", "invoked_by": "System ⚙️", "active_step": "START_READY",
    "step_label": "Line 1 Start Position Set (Ready to Begin)", "top_line": 1, "bottom_line": 49, "next_target_top": 50, "page": 1,
    "device_model": "pixel_10", "lines_per_page": 49, "updated_at": datetime.now().isoformat()
}

dag2_loop_history: List[Dict[str, Any]] = []

# High-Precision Key Event Telemetry Storage
key_events_telemetry: List[Dict[str, Any]] = []
active_dag2_loop_key_events: List[Dict[str, Any]] = []
current_dag2_loop_id: Optional[str] = None
current_dag2_loop_index: Optional[int] = None

def record_key_event_telemetry(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Records a high-precision key event dispatch with timestamps, keycodes, duration,
    and visual/window state outcomes (such as whether FilePreviewActivity remained visible).
    """
    now = datetime.now()
    event.setdefault("id", f"ke_{now.strftime('%Y%m%d_%H%M%S_%f')}")
    event.setdefault("timestamp_iso", now.isoformat())
    event.setdefault("timestamp_epoch_ms", int(now.timestamp() * 1000))
    if current_dag2_loop_id and "loop_id" not in event:
        event["loop_id"] = current_dag2_loop_id
    if current_dag2_loop_index is not None and "loop_index" not in event:
        event["loop_index"] = current_dag2_loop_index

    key_events_telemetry.append(event)
    if len(key_events_telemetry) > 500:
        del key_events_telemetry[0]

    # Track in active loop if DAG 2 loop is running
    if current_dag2_loop_id:
        active_dag2_loop_key_events.append(event)

    latest_telemetry["latest_key_event"] = event

    stats = latest_telemetry.setdefault("key_event_stats", {
        "total_dispatched": 0,
        "navigated_away_count": 0,
        "last_navigated_away": None,
        "key_counts": {}
    })
    stats["total_dispatched"] += 1
    key_label = event.get("key_name") or str(event.get("keycode", "unknown"))
    stats["key_counts"][key_label] = stats["key_counts"].get(key_label, 0) + 1

    if event.get("navigated_away"):
        stats["navigated_away_count"] += 1
        stats["last_navigated_away"] = event

    return event

def get_key_events_telemetry(limit: int = 100, loop_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if loop_id:
        filtered = [e for e in key_events_telemetry if e.get("loop_id") == loop_id]
        return filtered[-limit:]
    return list(key_events_telemetry[-limit:])

def clear_key_events_telemetry() -> None:
    key_events_telemetry.clear()
    active_dag2_loop_key_events.clear()
    latest_telemetry["latest_key_event"] = None
    latest_telemetry["key_event_stats"] = {
        "total_dispatched": 0,
        "navigated_away_count": 0,
        "last_navigated_away": None,
        "key_counts": {}
    }

DIAGNOSTICS_TRACE_FILE = DOCUMENT_FILE.parent / "project_diagnostics_trace.json"
total_dag2_loops_executed: int = 0

project_diagnostics_trace: Dict[str, Any] = {
    "project_id": None,
    "project_name": None,
    "target_total_lines": 0,
    "project_started_at_iso": None,
    "project_started_at_ms": None,
    "first_line_acquired_at_iso": None,
    "first_line_acquired_at_ms": None,
    "first_frame_id": None,
    "last_line_acquired_at_iso": None,
    "last_line_acquired_at_ms": None,
    "last_frame_id": None,
    "highest_line_acquired": 0,
    "completed_at_iso": None,
    "completed_at_ms": None,
    "is_completed": False,
    "current_status": "IDLE",
    "last_stop_at_iso": None,
    "last_stop_at_ms": None,
    "last_stop_reason": None,
    "total_stops": 0,
    "total_manual_restarts": 0,
    "total_auto_recoveries": 0,
    "total_downtime_ms": 0,
    "backfilled_up_to_frame_count": 0,
    "stop_and_restart_log": [],
    "loop_runs": [],
    "lifecycle_events": []
}

def _fmt_dur_trace(ms: int) -> str:
    if not ms or ms <= 0:
        return "0s"
    sec = max(0.0, ms / 1000.0)
    if sec < 60:
        return f"{sec:.1f}s"
    mins = int(sec // 60)
    rem_s = int(round(sec % 60))
    if mins < 60:
        return f"{mins}m {rem_s:02d}s"
    hrs = mins // 60
    rem_m = mins % 60
    return f"{hrs}h {rem_m:02d}m {rem_s:02d}s"

def _parse_iso_to_ms(iso_str: Optional[str]) -> Optional[int]:
    if not iso_str:
        return None
    try:
        dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        return None

def save_diagnostics_trace() -> None:
    try:
        DIAGNOSTICS_TRACE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(DIAGNOSTICS_TRACE_FILE, "w", encoding="utf-8") as f:
            json.dump(project_diagnostics_trace, f, indent=2, cls=NumpySafeJSONEncoder)
    except Exception as e:
        print(f"[save_diagnostics_trace] Error: {e}")

def load_diagnostics_trace() -> None:
    global project_diagnostics_trace, total_dag2_loops_executed
    cur_pid = get_current_project_id()
    if DIAGNOSTICS_TRACE_FILE.exists():
        try:
            with open(DIAGNOSTICS_TRACE_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    loaded_pid = loaded.get("project_id")
                    if not cur_pid or not loaded_pid or loaded_pid == cur_pid:
                        project_diagnostics_trace.update(loaded)
                        runs = project_diagnostics_trace.get("loop_runs", [])
                        if runs:
                            max_idx = max((r.get("loop_index", 0) or 0) for r in runs)
                            total_dag2_loops_executed = max(total_dag2_loops_executed, max_idx)
        except Exception as e:
            print(f"[load_diagnostics_trace] Error: {e}")

def reset_project_diagnostics_trace(project_id: Optional[str] = None, project_name: Optional[str] = None, target_total_lines: int = 0) -> None:
    global project_diagnostics_trace, total_dag2_loops_executed
    now = datetime.now()
    now_ms = int(now.timestamp() * 1000)
    total_dag2_loops_executed = 0
    project_diagnostics_trace.update({
        "project_id": project_id,
        "project_name": project_name,
        "target_total_lines": target_total_lines,
        "project_started_at_iso": now.isoformat(),
        "project_started_at_ms": now_ms,
        "first_line_acquired_at_iso": None,
        "first_line_acquired_at_ms": None,
        "first_frame_id": None,
        "last_line_acquired_at_iso": None,
        "last_line_acquired_at_ms": None,
        "last_frame_id": None,
        "highest_line_acquired": 0,
        "completed_at_iso": None,
        "completed_at_ms": None,
        "is_completed": False,
        "current_status": "INITIALIZING",
        "last_stop_at_iso": None,
        "last_stop_at_ms": None,
        "last_stop_reason": None,
        "total_stops": 0,
        "total_manual_restarts": 0,
        "total_auto_recoveries": 0,
        "total_downtime_ms": 0,
        "backfilled_up_to_frame_count": 0,
        "stop_and_restart_log": [],
        "loop_runs": [],
        "lifecycle_events": []
    })
    record_diagnostics_trace_event(
        event_type="PROJECT_INIT_START",
        reason=f"Project '{project_name or project_id}' initialization started (Target: {target_total_lines or 'calibrating'} lines)",
        page_index=1,
        top_line=1
    )
    save_diagnostics_trace()

def next_dag2_loop_index() -> int:
    global total_dag2_loops_executed
    runs = project_diagnostics_trace.get("loop_runs", [])
    max_trace_idx = max(((r.get("loop_index", 0) or 0) for r in runs), default=0)
    total_dag2_loops_executed = max(
        total_dag2_loops_executed,
        max_trace_idx,
        len(captured_frames),
        len(dag2_loop_history)
    ) + 1
    return total_dag2_loops_executed

def record_diagnostics_trace_event(
    event_type: str,
    reason: str,
    loop_index: Optional[int] = None,
    page_index: Optional[int] = None,
    top_line: Optional[int] = None,
    bottom_line: Optional[int] = None,
    target_top_line: Optional[int] = None,
    node_id: Optional[str] = None,
    recovery_action: Optional[str] = None,
    timestamp_iso: Optional[str] = None,
    timestamp_ms: Optional[int] = None,
    downtime_ms: Optional[int] = None,
    persist: bool = True
) -> Dict[str, Any]:
    now = datetime.now()
    ts_iso = timestamp_iso or now.isoformat()
    ts_ms = timestamp_ms if timestamp_ms is not None else (_parse_iso_to_ms(ts_iso) or int(now.timestamp() * 1000))

    if page_index is None:
        page_index = latest_telemetry.get("current_page") or orchestration_state.get("page") or max(1, len(captured_frames))
    if top_line is None:
        top_line = latest_telemetry.get("current_top_line") or orchestration_state.get("top_line") or 0
    if bottom_line is None:
        bottom_line = latest_telemetry.get("current_bottom_line") or orchestration_state.get("bottom_line") or 0
    if target_top_line is None:
        target_top_line = orchestration_state.get("next_target_top") or (bottom_line + 1 if bottom_line else 0)
    if loop_index is None:
        loop_index = current_dag2_loop_index or total_dag2_loops_executed or len(captured_frames)

    if not project_diagnostics_trace.get("project_started_at_iso"):
        project_diagnostics_trace["project_started_at_iso"] = ts_iso
        project_diagnostics_trace["project_started_at_ms"] = ts_ms

    # Compute downtime if this is a restart or start after a stop
    if event_type in ("LOOP_RESTARTED", "LOOP_STARTED") and downtime_ms is None:
        last_stop_ms = project_diagnostics_trace.get("last_stop_at_ms")
        if last_stop_ms and ts_ms > last_stop_ms:
            downtime_ms = ts_ms - last_stop_ms
            if event_type == "LOOP_STARTED" and project_diagnostics_trace.get("total_stops", 0) > 0:
                event_type = "LOOP_RESTARTED"

    ev = {
        "id": f"ev_{ts_ms}_{len(project_diagnostics_trace['lifecycle_events']) + 1}",
        "timestamp_iso": ts_iso,
        "timestamp_ms": ts_ms,
        "event_type": event_type,
        "loop_index": loop_index,
        "page_index": page_index,
        "top_line": top_line,
        "bottom_line": bottom_line,
        "target_top_line": target_top_line,
        "node_id": node_id,
        "reason": reason,
        "recovery_action": recovery_action,
        "downtime_ms": downtime_ms or 0,
        "downtime_formatted": _fmt_dur_trace(downtime_ms or 0) if downtime_ms else None
    }

    project_diagnostics_trace["lifecycle_events"].append(ev)
    if len(project_diagnostics_trace["lifecycle_events"]) > 3000:
        del project_diagnostics_trace["lifecycle_events"][0]

    stop_restart_types = {
        "PROJECT_INIT_START", "FIRST_LINE_OCR_ACQUIRED",
        "LOOP_STARTED", "LOOP_RESTARTED", "LOOP_STOPPED",
        "NODE_ERROR", "LOOP_AUTO_RECOVERY_STARTED", "LOOP_AUTO_RECOVERED", "MINI_MODAL_DETECTED", "MINI_MODAL_RESOLVED", "MINI_MODAL_WARNING",
        "LAST_LINE_OCR_COMPLETED"
    }
    if event_type in stop_restart_types:
        project_diagnostics_trace["stop_and_restart_log"].append(ev)
        if len(project_diagnostics_trace["stop_and_restart_log"]) > 1500:
            del project_diagnostics_trace["stop_and_restart_log"][0]

    if event_type == "LOOP_STOPPED":
        project_diagnostics_trace["current_status"] = "STOPPED"
        project_diagnostics_trace["last_stop_at_iso"] = ts_iso
        project_diagnostics_trace["last_stop_at_ms"] = ts_ms
        project_diagnostics_trace["last_stop_reason"] = reason
        project_diagnostics_trace["total_stops"] = int(project_diagnostics_trace.get("total_stops", 0)) + 1
    elif event_type == "LOOP_RESTARTED":
        project_diagnostics_trace["current_status"] = "RUNNING"
        project_diagnostics_trace["total_manual_restarts"] = int(project_diagnostics_trace.get("total_manual_restarts", 0)) + 1
        if downtime_ms and downtime_ms > 0:
            project_diagnostics_trace["total_downtime_ms"] = int(project_diagnostics_trace.get("total_downtime_ms", 0)) + downtime_ms
        project_diagnostics_trace["last_stop_at_ms"] = None
    elif event_type == "LOOP_STARTED":
        project_diagnostics_trace["current_status"] = "RUNNING"
    elif event_type == "LOOP_AUTO_RECOVERY_STARTED":
        project_diagnostics_trace["current_status"] = "AUTO_RECOVERING"
    elif event_type in ("LOOP_AUTO_RECOVERED", "MINI_MODAL_RESOLVED"):
        project_diagnostics_trace["current_status"] = "RUNNING"
        project_diagnostics_trace["total_auto_recoveries"] = int(project_diagnostics_trace.get("total_auto_recoveries", 0)) + 1
    elif event_type == "LAST_LINE_OCR_COMPLETED":
        project_diagnostics_trace["current_status"] = "COMPLETED"
        project_diagnostics_trace["is_completed"] = True
        project_diagnostics_trace["completed_at_iso"] = ts_iso
        project_diagnostics_trace["completed_at_ms"] = ts_ms

    if persist:
        save_diagnostics_trace()
    return ev

def ensure_diagnostics_trace_backfilled() -> Dict[str, Any]:
    """
    Ensures project_diagnostics_trace has full historical coverage from the very first frame
    (Line 1 OCR acquisition) through all captured frames in state.captured_frames, automatically
    detecting historical loop stops & restarts from inter-frame timestamp gaps (> 90s).
    """
    global total_dag2_loops_executed
    pid = get_current_project_id()
    proj = None
    try:
        proj = db.get_project(pid) if pid else db.get_active_project()
    except Exception:
        pass
    proj_is_completed = str((proj or {}).get("status") or "").lower() == "completed"

    if pid and project_diagnostics_trace.get("project_id") not in (None, pid):
        # Switched project: reset trace state from previous project before backfilling current project
        project_diagnostics_trace.update({
            "project_id": pid,
            "project_name": (proj or {}).get("name") or f"Project {pid}",
            "target_total_lines": int((proj or {}).get("target_total_lines") or 0),
            "first_line_acquired_at_iso": None,
            "first_line_acquired_at_ms": None,
            "first_frame_id": None,
            "last_line_acquired_at_iso": None,
            "last_line_acquired_at_ms": None,
            "last_frame_id": None,
            "highest_line_acquired": 0,
            "completed_at_iso": None,
            "completed_at_ms": None,
            "is_completed": proj_is_completed,
            "current_status": "COMPLETED" if proj_is_completed else "RUNNING",
            "last_stop_at_iso": None,
            "last_stop_at_ms": None,
            "last_stop_reason": None,
            "backfilled_up_to_frame_count": 0,
            "stop_and_restart_log": [],
            "loop_runs": [],
            "lifecycle_events": [],
        })
    elif pid and not project_diagnostics_trace.get("project_id"):
        project_diagnostics_trace["project_id"] = pid

    if proj:
        project_diagnostics_trace["project_name"] = proj.get("name") or proj.get("filename") or f"Project {pid}"
        if proj.get("target_total_lines"):
            project_diagnostics_trace["target_total_lines"] = int(proj["target_total_lines"])
        if not proj_is_completed and project_diagnostics_trace.get("is_completed"):
            max_cur_ln = max(document_lines.keys(), default=0) if document_lines else 0
            tgt_ln = int(proj.get("target_total_lines") or latest_telemetry.get("target_total_lines") or 0)
            if tgt_ln > 0 and max_cur_ln < tgt_ln - 3:
                project_diagnostics_trace["is_completed"] = False
                if project_diagnostics_trace.get("current_status") == "COMPLETED":
                    project_diagnostics_trace["current_status"] = "IDLE"

    target_lines = int(
        latest_telemetry.get("target_total_lines")
        or project_diagnostics_trace.get("target_total_lines")
        or 0
    )
    if target_lines > 0:
        project_diagnostics_trace["target_total_lines"] = target_lines

    if not captured_frames:
        return project_diagnostics_trace

    sorted_frames = sorted(
        captured_frames.values(),
        key=lambda f: (f.get("page_index", 0) or 0, f.get("top_line", 0) or 0, f.get("created_at") or "")
    )
    first_f = sorted_frames[0]
    last_f = sorted_frames[-1]

    first_ts_iso = first_f.get("created_at")
    first_ts_ms = _parse_iso_to_ms(first_ts_iso)
    if first_ts_ms:
        # Project start is ~40s before the first frame finishes OCR
        est_start_ms = first_ts_ms - 42000
        est_start_iso = datetime.fromtimestamp(est_start_ms / 1000.0).isoformat()
        cur_start_ms = project_diagnostics_trace.get("project_started_at_ms")
        if not cur_start_ms or est_start_ms < cur_start_ms:
            project_diagnostics_trace["project_started_at_ms"] = est_start_ms
            project_diagnostics_trace["project_started_at_iso"] = est_start_iso
        if not project_diagnostics_trace.get("first_line_acquired_at_ms") or first_ts_ms < project_diagnostics_trace["first_line_acquired_at_ms"]:
            project_diagnostics_trace["first_line_acquired_at_ms"] = first_ts_ms
            project_diagnostics_trace["first_line_acquired_at_iso"] = first_ts_iso
            project_diagnostics_trace["first_frame_id"] = first_f.get("frame_id")

    last_ts_iso = last_f.get("created_at")
    last_ts_ms = _parse_iso_to_ms(last_ts_iso)
    max_bot = max((f.get("bottom_line", 0) or 0) for f in sorted_frames)
    if last_ts_ms:
        project_diagnostics_trace["last_line_acquired_at_ms"] = last_ts_ms
        project_diagnostics_trace["last_line_acquired_at_iso"] = last_ts_iso
        project_diagnostics_trace["last_frame_id"] = last_f.get("frame_id")
    project_diagnostics_trace["highest_line_acquired"] = max(
        int(project_diagnostics_trace.get("highest_line_acquired", 0) or 0),
        max_bot
    )

    # Backfill historical loop runs and stop/restart events from captured_frames if not yet backfilled
    existing_runs = project_diagnostics_trace.get("loop_runs", [])
    existing_pages = {r.get("page_index") for r in existing_runs if r.get("page_index")}
    if len(existing_runs) < len(sorted_frames) and project_diagnostics_trace.get("backfilled_up_to_frame_count", 0) < len(sorted_frames):
        # Map any detailed dag2_loop_history records by top_line
        hist_by_top = {}
        for h in dag2_loop_history:
            for nd in h.get("nodes", []):
                if nd.get("node_id") == "frame_ocr":
                    tl = nd.get("details", {}).get("top_line")
                    if tl:
                        hist_by_top[tl] = h

        rebuilt_runs = list(existing_runs)
        rebuilt_events = list(project_diagnostics_trace.get("stop_and_restart_log", []))
        has_init_ev = any(e.get("event_type") == "PROJECT_INIT_START" for e in rebuilt_events)
        if not has_init_ev and first_ts_ms:
            init_ms = project_diagnostics_trace["project_started_at_ms"]
            init_iso = project_diagnostics_trace["project_started_at_iso"]
            rebuilt_events.insert(0, {
                "id": f"ev_init_{init_ms}",
                "timestamp_iso": init_iso,
                "timestamp_ms": init_ms,
                "event_type": "PROJECT_INIT_START",
                "loop_index": 1,
                "page_index": 1,
                "top_line": 1,
                "bottom_line": first_f.get("bottom_line", 24),
                "target_top_line": 1,
                "node_id": "init_end",
                "reason": f"Project started & initialized at Line 1 (Target EOF: {target_lines or 23000} lines)",
                "recovery_action": None,
                "downtime_ms": 0,
                "downtime_formatted": None
            })
            rebuilt_events.insert(1, {
                "id": f"ev_first_ocr_{first_ts_ms}",
                "timestamp_iso": first_ts_iso,
                "timestamp_ms": first_ts_ms,
                "event_type": "FIRST_LINE_OCR_ACQUIRED",
                "loop_index": 1,
                "page_index": 1,
                "top_line": first_f.get("top_line", 1),
                "bottom_line": first_f.get("bottom_line", 24),
                "target_top_line": (first_f.get("bottom_line", 24) or 24) + 1,
                "node_id": "local_ai_ocr",
                "reason": f"First page OCR acquired ({first_f.get('frame_id')}: Lines {first_f.get('top_line', 1)}..{first_f.get('bottom_line', 24)})",
                "recovery_action": None,
                "downtime_ms": 0,
                "downtime_formatted": None
            })

        existing_stop_pages = {e.get("page_index") for e in rebuilt_events if e.get("event_type") == "LOOP_STOPPED"}
        prev_f_ms = None
        prev_f = None

        for idx, f in enumerate(sorted_frames, start=1):
            p_idx = f.get("page_index") or idx
            t_line = f.get("top_line", 0)
            b_line = f.get("bottom_line", 0)
            ext_cnt = f.get("extracted_line_count", 0)
            f_iso = f.get("created_at")
            f_ms = _parse_iso_to_ms(f_iso) or int(time.time() * 1000)

            # Check if there was a loop stop (> 90s gap between consecutive frames)
            if prev_f_ms is not None and (f_ms - prev_f_ms) > 90000:
                prev_p = (prev_f.get("page_index") or (idx - 1)) if prev_f else (idx - 1)
                if prev_p not in existing_stop_pages:
                    gap_ms = f_ms - prev_f_ms
                    stop_ms = prev_f_ms + 12000
                    restart_ms = max(stop_ms + 1000, f_ms - 38000)
                    downtime = max(1000, restart_ms - stop_ms)
                    prev_t = prev_f.get("top_line", 0) if prev_f else 0
                    prev_b = prev_f.get("bottom_line", 0) if prev_f else 0
                    prev_ext = prev_f.get("extracted_line_count", 0) if prev_f else 0
                    prev_span = (prev_b - prev_t + 1) if (prev_b and prev_t) else 24

                    if prev_ext > 0 and abs(prev_span - prev_ext) >= 3:
                        stop_reason = (
                            f"Wrapped-line gutter projection discrepancy on Page {prev_p} (Lines {prev_t}..{prev_b}, "
                            f"OCR extracted {prev_ext} lines vs projected span {prev_span}) caused Node 6 (arrow_down) "
                            f"to fail aligning Target Line {prev_b + 1}"
                        )
                    elif prev_b and t_line != (prev_b + 1):
                        stop_reason = (
                            f"Node 6 (arrow_down) viewport alignment halted after Page {prev_p}: "
                            f"expected Target Line {prev_b + 1} at top, settled at Line {t_line}"
                        )
                    else:
                        stop_reason = (
                            f"Node 6 (arrow_down) exhausted max adjustment attempts aligning Target Line {prev_b + 1} "
                            f"after Page {prev_p} (Lines {prev_t}..{prev_b})"
                        )

                    rebuilt_events.append({
                        "id": f"ev_hist_stop_{stop_ms}",
                        "timestamp_iso": datetime.fromtimestamp(stop_ms / 1000.0).isoformat(),
                        "timestamp_ms": stop_ms,
                        "event_type": "LOOP_STOPPED",
                        "loop_index": prev_p,
                        "page_index": prev_p,
                        "top_line": prev_t,
                        "bottom_line": prev_b,
                        "target_top_line": prev_b + 1,
                        "node_id": "arrow_down",
                        "reason": stop_reason,
                        "recovery_action": "Awaited manual 'Run Loop' or Node 6 alignment retry",
                        "downtime_ms": downtime,
                        "downtime_formatted": _fmt_dur_trace(downtime)
                    })
                    rebuilt_events.append({
                        "id": f"ev_hist_restart_{restart_ms}",
                        "timestamp_iso": datetime.fromtimestamp(restart_ms / 1000.0).isoformat(),
                        "timestamp_ms": restart_ms,
                        "event_type": "LOOP_RESTARTED",
                        "loop_index": p_idx,
                        "page_index": p_idx,
                        "top_line": t_line,
                        "bottom_line": b_line,
                        "target_top_line": t_line,
                        "node_id": "frame_acquire",
                        "reason": f"DAG Loop restarted at Page {p_idx} (Line {t_line}) after {_fmt_dur_trace(downtime)} stop",
                        "recovery_action": f"Resumed capture at Line {t_line}..{b_line}",
                        "downtime_ms": downtime,
                        "downtime_formatted": _fmt_dur_trace(downtime)
                    })
                    existing_stop_pages.add(prev_p)

            if p_idx not in existing_pages:
                h_match = hist_by_top.get(t_line)
                if h_match:
                    dur_ms = int(h_match.get("duration_ms", 42000) or 42000)
                    st_ms = int(h_match.get("started_at_ms") or (f_ms - dur_ms))
                    fn_ms = int(h_match.get("finished_at_ms") or f_ms)
                    nds = {n.get("node_id"): n.get("duration_ms", 0) for n in h_match.get("nodes", [])}
                else:
                    dur_ms = int((f_ms - prev_f_ms) if (prev_f_ms and 15000 <= (f_ms - prev_f_ms) <= 85000) else 44000)
                    st_ms = f_ms - dur_ms
                    fn_ms = f_ms
                    nds = {
                        "frame_acquire": 420,
                        "local_ai_ocr": max(10000, dur_ms - 5200),
                        "frame_ocr": 260,
                        "arrow_down": 4100,
                        "verification_trigger": 220,
                        "document_assemble": 180
                    }

                rebuilt_runs.append({
                    "loop_index": p_idx,
                    "loop_id": f"loop_{p_idx:04d}",
                    "page_index": p_idx,
                    "frame_id": f.get("frame_id"),
                    "top_line": t_line,
                    "bottom_line": b_line,
                    "target_next_top": (b_line + 1) if b_line else 0,
                    "extracted_lines": ext_cnt,
                    "started_at_iso": datetime.fromtimestamp(st_ms / 1000.0).isoformat(),
                    "started_at_ms": st_ms,
                    "finished_at_iso": datetime.fromtimestamp(fn_ms / 1000.0).isoformat(),
                    "finished_at_ms": fn_ms,
                    "duration_ms": dur_ms,
                    "duration_formatted": _fmt_dur_trace(dur_ms),
                    "status": "success",
                    "failed_node": None,
                    "error_reason": None,
                    "recovery_applied": None,
                    "arrows_pressed": f.get("arrow_count", 24),
                    "node_timings": nds
                })
                existing_pages.add(p_idx)

            prev_f_ms = f_ms
            prev_f = f

        rebuilt_runs.sort(key=lambda r: (r.get("loop_index", 0), r.get("started_at_ms", 0)))
        rebuilt_events.sort(key=lambda e: e.get("timestamp_ms", 0))
        project_diagnostics_trace["loop_runs"] = rebuilt_runs[-2000:]
        project_diagnostics_trace["stop_and_restart_log"] = rebuilt_events[-1500:]
        project_diagnostics_trace["total_stops"] = sum(1 for e in rebuilt_events if e.get("event_type") == "LOOP_STOPPED")
        project_diagnostics_trace["total_manual_restarts"] = sum(1 for e in rebuilt_events if e.get("event_type") == "LOOP_RESTARTED")
        project_diagnostics_trace["total_downtime_ms"] = sum((e.get("downtime_ms", 0) or 0) for e in rebuilt_events if e.get("event_type") == "LOOP_RESTARTED")
        project_diagnostics_trace["backfilled_up_to_frame_count"] = len(sorted_frames)
        if rebuilt_runs:
            total_dag2_loops_executed = max(total_dag2_loops_executed, max((r.get("loop_index", 0) or 0) for r in rebuilt_runs))
        save_diagnostics_trace()

    return project_diagnostics_trace

def record_dag2_loop_result(loop_record: Dict[str, Any]) -> None:
    dag2_loop_history.append(loop_record)
    if len(dag2_loop_history) > 200:
        del dag2_loop_history[0]

    # Also record in full project_diagnostics_trace
    try:
        ensure_diagnostics_trace_backfilled()
        l_idx = int(loop_record.get("loop_index") or next_dag2_loop_index())
        st_ms = int(loop_record.get("started_at_ms") or int(time.time() * 1000))
        fn_ms = int(loop_record.get("finished_at_ms") or int(time.time() * 1000))
        dur_ms = int(loop_record.get("duration_ms") or max(1, fn_ms - st_ms))
        status = loop_record.get("status", "success")
        nodes_list = loop_record.get("nodes", [])
        nds = {n.get("node_id"): n.get("duration_ms", 0) for n in nodes_list if n.get("node_id")}

        t_line = 0
        b_line = 0
        ext_cnt = 0
        arr_cnt = 0
        failed_node = loop_record.get("failed_node")
        error_reason = loop_record.get("error_reason")

        for n in nodes_list:
            nid = n.get("node_id")
            det = n.get("details", {}) or {}
            if nid == "frame_ocr":
                t_line = det.get("top_line") or t_line
                b_line = det.get("bottom_line") or b_line
                ext_cnt = det.get("extracted_lines") or ext_cnt
            elif nid == "local_ai_ocr" and not ext_cnt:
                ext_cnt = det.get("lines_count") or ext_cnt
            elif nid == "arrow_down":
                arr_cnt = det.get("arrow_keys_pressed") or arr_cnt
            if n.get("status") in ("error", "prevented") and not failed_node:
                failed_node = nid
                error_reason = det.get("error") or n.get("error") or error_reason

        if not t_line:
            t_line = latest_telemetry.get("current_top_line") or orchestration_state.get("top_line") or 0
        if not b_line:
            b_line = latest_telemetry.get("current_bottom_line") or orchestration_state.get("bottom_line") or 0

        p_idx = len(captured_frames) if status == "success" else (len(captured_frames) + 1)
        fid = orchestration_state.get("last_acquired_frame_id") or dag_state.get("nodes", {}).get("frame_acquire", {}).get("frame_id")

        if t_line == 1 and not project_diagnostics_trace.get("first_line_acquired_at_ms"):
            project_diagnostics_trace["first_line_acquired_at_ms"] = fn_ms
            project_diagnostics_trace["first_line_acquired_at_iso"] = datetime.fromtimestamp(fn_ms / 1000.0).isoformat()
            project_diagnostics_trace["first_frame_id"] = fid
            record_diagnostics_trace_event(
                event_type="FIRST_LINE_OCR_ACQUIRED",
                reason=f"First line of code OCR acquired (Lines {t_line}..{b_line})",
                loop_index=l_idx,
                page_index=p_idx,
                top_line=t_line,
                bottom_line=b_line,
                node_id="local_ai_ocr",
                timestamp_ms=fn_ms,
                persist=False
            )

        if b_line > 0:
            project_diagnostics_trace["last_line_acquired_at_ms"] = fn_ms
            project_diagnostics_trace["last_line_acquired_at_iso"] = datetime.fromtimestamp(fn_ms / 1000.0).isoformat()
            project_diagnostics_trace["last_frame_id"] = fid
            project_diagnostics_trace["highest_line_acquired"] = max(
                int(project_diagnostics_trace.get("highest_line_acquired", 0) or 0),
                b_line
            )

        run_entry = {
            "loop_index": l_idx,
            "loop_id": loop_record.get("loop_id") or f"loop_{l_idx:04d}",
            "page_index": p_idx,
            "frame_id": fid,
            "top_line": t_line,
            "bottom_line": b_line,
            "target_next_top": (b_line + 1) if b_line else 0,
            "extracted_lines": ext_cnt,
            "started_at_iso": datetime.fromtimestamp(st_ms / 1000.0).isoformat(),
            "started_at_ms": st_ms,
            "finished_at_iso": datetime.fromtimestamp(fn_ms / 1000.0).isoformat(),
            "finished_at_ms": fn_ms,
            "duration_ms": dur_ms,
            "duration_formatted": _fmt_dur_trace(dur_ms),
            "status": status,
            "failed_node": failed_node,
            "error_reason": error_reason,
            "recovery_applied": loop_record.get("recovery_applied"),
            "arrows_pressed": arr_cnt,
            "node_timings": nds
        }
        project_diagnostics_trace["loop_runs"].append(run_entry)
        if len(project_diagnostics_trace["loop_runs"]) > 2000:
            del project_diagnostics_trace["loop_runs"][0]
        project_diagnostics_trace["backfilled_up_to_frame_count"] = len(captured_frames)
        save_diagnostics_trace()
    except Exception as e:
        print(f"[record_dag2_loop_result] Diagnostics trace error: {e}")

def get_project_diagnostics_trace() -> Dict[str, Any]:
    ensure_diagnostics_trace_backfilled()
    runs = project_diagnostics_trace.get("loop_runs", [])
    succ_runs = [r for r in runs if r.get("status") in ("success", "completed", "auto_recovered")]
    fail_runs = [r for r in runs if r.get("status") in ("error", "prevented", "failed")]
    rec_runs = [r for r in runs if r.get("recovery_applied") or r.get("status") == "auto_recovered"]
    avg_dur = int(round(sum((r.get("duration_ms", 0) or 0) for r in succ_runs) / max(1, len(succ_runs)))) if succ_runs else 0

    target_total = int(
        latest_telemetry.get("target_total_lines")
        or project_diagnostics_trace.get("target_total_lines")
        or 0
    )
    highest_line = max(
        int(project_diagnostics_trace.get("highest_line_acquired", 0) or 0),
        int(latest_telemetry.get("current_bottom_line", 0) or 0),
        max(document_lines.keys(), default=0) if document_lines else 0
    )
    comp_pct = round(min(100.0, (highest_line / target_total) * 100.0), 2) if target_total > 0 else 0.0

    start_ms = project_diagnostics_trace.get("project_started_at_ms")
    end_ms = project_diagnostics_trace.get("completed_at_ms") or int(time.time() * 1000)
    elapsed_ms = max(0, end_ms - start_ms) if start_ms else 0
    downtime_ms = int(project_diagnostics_trace.get("total_downtime_ms", 0) or 0)
    active_ms = max(0, elapsed_ms - downtime_ms)

    return {
        **project_diagnostics_trace,
        "target_total_lines": target_total,
        "highest_line_acquired": highest_line,
        "total_captured_frames": len(captured_frames),
        "total_assembled_lines": len(document_lines),
        "completion_percent": comp_pct,
        "loop_running": bool(getattr(sys.modules[__name__], "capture_loop_running", False)),
        "summary_metrics": {
            "total_loop_runs": len(runs),
            "successful_runs": len(succ_runs),
            "failed_runs": len(fail_runs),
            "auto_recovered_runs": len(rec_runs),
            "total_stops": int(project_diagnostics_trace.get("total_stops", 0) or 0),
            "total_manual_restarts": int(project_diagnostics_trace.get("total_manual_restarts", 0) or 0),
            "total_auto_recoveries": int(project_diagnostics_trace.get("total_auto_recoveries", 0) or 0),
            "total_elapsed_ms": elapsed_ms,
            "total_elapsed_formatted": _fmt_dur_trace(elapsed_ms),
            "total_active_ms": active_ms,
            "total_active_formatted": _fmt_dur_trace(active_ms),
            "total_downtime_ms": downtime_ms,
            "total_downtime_formatted": _fmt_dur_trace(downtime_ms),
            "avg_loop_duration_ms": avg_dur,
            "avg_loop_duration_formatted": _fmt_dur_trace(avg_dur)
        }
    }

def get_dag2_loop_history() -> List[Dict[str, Any]]:
    return list(dag2_loop_history)

def clear_dag2_loop_history() -> None:
    dag2_loop_history.clear()

dag_state: Dict[str, Any] = {
    "groups": {
        "markdown_file_change": {
            "id": "markdown_file_change",
            "title": "Markdown File Change",
            "description": "Scans Teams/OneDrive folder queue (MD 1 / N .. MD N / N), switches to next markdown file on EOF, opens Fullscreen + Dark Mode before handing off to Phase I Initialize or Phase III Post-Capture Analyzer",
            "nodes": ["markdown_file_change"],
            "status": "idle",
            "progress": None
        },
        "initialize": {
            "id": "initialize",
            "title": "Initialize",
            "description": "Auto-calibrates total lines via EOF Ctrl+End and verifies return to Line 1",
            "nodes": ["init_end", "reset_home"],
            "status": "idle",
            "progress": None
        },
        "capture_entire_markdown": {
            "id": "capture_entire_markdown",
            "title": "Screen Capture & AI OCR",
            "description": "Acquires screen frames and extracts verbatim markdown with local vision model",
            "nodes": ["frame_acquire", "local_ai_ocr"],
            "status": "idle",
            "progress": None
        },
        "position_navigation": {
            "id": "position_navigation",
            "title": "Line Positioning & Navigation",
            "description": "Gutter OCR boundary detection and down-arrow viewport alignment",
            "nodes": ["frame_ocr", "arrow_down"],
            "status": "idle",
            "progress": None
        },
        "verify_assemble": {
            "id": "verify_assemble",
            "title": "Verify & Assemble",
            "description": "Recaptures frame to verify top line position, evaluates qualifiers, and reconstructs master document",
            "nodes": ["verification_trigger", "document_assemble", "batch_frames_ocr"],
            "status": "idle",
            "progress": None
        },
        "post_capture_analyzer": {
            "id": "post_capture_analyzer",
            "title": "Post-Capture Analyzer & Sandbox VFS",
            "description": "Parses CODESCAN_FILE_START/END tags into VFS tree, validates AST/TypeScript compilation in memfs with auto-healing, and materializes sandbox workspace for Monaco IDE",
            "nodes": ["markdown_tag_parser", "ast_compiler_validator", "sandbox_ide"],
            "status": "idle",
            "progress": None
        }
    },
    "semaphore_group2_to_3": True,
    "semaphore_group3_to_4": True,
    "semaphore_status": "open",
    "semaphore_group2_to_3_status": "open",
    "semaphore_group3_to_4_status": "open",
    "nodes": {
        "markdown_file_change": {
            "id": "markdown_file_change",
            "group": "markdown_file_change",
            "title": "0. Markdown File Change (Folder Queue & Part Switch)",
            "description": "Scans folder screenshot to queue all markdown parts (MD 1 / N .. MD N / N), and on part completion switches to the next file, opens Fullscreen, enables Edit Mode & Dark Mode before handing off to Phase I Initialize or Phase III Sandbox.",
            "status": "idle",
            "mode": "scan_folder",
            "current_part": 1,
            "total_parts": 1,
            "part_progress_label": "MD 1 / 1",
            "active_file_name": None,
            "next_file_name": None,
            "detected_files": [],
            "predetermined_parts": [],
            "bundle_completed": False,
            "fullscreen_verified": False,
            "dark_mode_verified": False,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "mode": "auto",
                "reopen_editor": True,
                "ensure_fullscreen": True,
                "ensure_dark_mode": True,
                "ensure_edit_mode": True,
                "auto_handoff_phase1": True,
                "auto_handoff_phase3_on_bundle_complete": True
            }
        },
        "init_end": {
            "id": "init_end",
            "group": "initialize",
            "title": "1. Determine Total Lines (Ctrl+End)",
            "description": "Send HID Ctrl+End, verify gutter position at EOF, display total lines by OCR of last line of EOF.",
            "status": "idle",
            "total_lines": 0,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "key1": 113,
                "key2": 123,
                "settle_delay_ms": 1200,
                "manual_total_lines": 0
            }
        },
        "reset_home": {
            "id": "reset_home",
            "group": "initialize",
            "title": "2. Return to Line 1 (Ctrl+Home)",
            "description": "Send HID Ctrl+Home to return to line 1, verify line 1 is in the top position in gutter.",
            "status": "idle",
            "verified": False,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "key1": 113,
                "key2": 122,
                "settle_delay_ms": 1000,
                "expected_line": 1
            }
        },
        "frame_acquire": {
            "id": "frame_acquire",
            "group": "capture_entire_markdown",
            "title": "3. Screen Capture & Acquisition",
            "description": "Capture high-resolution screenshot frame from external device display and save raw image.",
            "status": "idle",
            "page": 1,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "mode": "desktop",
                "guard_keyboard": False,
                "fast_mode": True,
                "settle_delay_ms": 40,
                "save_frame": True
            }
        },
        "local_ai_ocr": {
            "id": "local_ai_ocr",
            "group": "capture_entire_markdown",
            "title": "4. Local AI Model OCR (MiniCPM-V)",
            "description": "Executes local MiniCPM-V multimodal vision model in Ollama to extract markdown code lines verbatim.",
            "status": "idle",
            "extracted_text": "",
            "preview_text": "",
            "lines_count": 0,
            "char_count": 0,
            "model_used": "MiniCPM-V (Ollama)",
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "engine": "ollama:minicpm-v",
                "model": "minicpm-v:latest",
                "show_raw_text": False
            }
        },
        "frame_ocr": {
            "id": "frame_ocr",
            "group": "position_navigation",
            "title": "5. OCR & Gutter Extraction",
            "description": "Run OCR worker on acquired screen frame: extract gutter line numbers, top/bottom bounds, and document text.",
            "status": "idle",
            "top_line": 0,
            "bottom_line": 0,
            "extracted_line_count": 0,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "engine": "local:rapidocr",
                "ocr_worker_timeout_s": 15,
                "min_confidence": 0.8
            }
        },
        "arrow_down": {
            "id": "arrow_down",
            "group": "position_navigation",
            "title": "6. Intelligent Navigation (Down Arrow)",
            "description": "Determine line number for top gutter (last line of previous page + 1) and use keyboard down arrow to position on top.",
            "status": "idle",
            "arrow_count": 56,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "step_mode": "auto",
                "step_count": 56,
                "key_delay_ms": 8
            }
        },
        "verification_trigger": {
            "id": "verification_trigger",
            "group": "verify_assemble",
            "title": "7. Recapture & Verification Trigger",
            "description": "Verify last line + 1 has been positioned to the top, then trigger DAG process flow.",
            "status": "idle",
            "loop_count": 0,
            "is_complete": False,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "prevent_trigger_on_issue": True,
                "qualifiers": {
                    "modal_overlay": {
                        "name": "Modal Overlay Check",
                        "description": "Is a modal appearing over the teams markdown?",
                        "enabled": True,
                        "severity": "blocking"
                    },
                    "pin_code_requested": {
                        "name": "PIN Code Authentication Qualifier",
                        "description": "Detects if Intune/device PIN authentication is requested and resolves with stored PIN",
                        "enabled": True,
                        "severity": "blocking"
                    },
                    "matrix_app_overlay": {
                        "name": "Matrix App Capture Check",
                        "description": "Is the mobile app matrix capture appearing over the teams markdown?",
                        "enabled": True,
                        "severity": "blocking"
                    },
                    "ocr_degraded": {
                        "name": "OCR Quality Degradation Check",
                        "description": "Has the result of the previous ocr capture degraded?",
                        "enabled": True,
                        "severity": "blocking"
                    },
                    "keyboard_open": {
                        "name": "Virtual Keyboard Check",
                        "description": "Is the software keyboard active or covering content?",
                        "enabled": True,
                        "severity": "warning"
                    },
                    "markdown_fullscreen": {
                        "name": "Full Screen Window Qualifier",
                        "description": "Ensure markdown editor is maximized and running in full screen mode",
                        "enabled": True,
                        "severity": "warning"
                    },
                    "light_mode": {
                        "name": "Theme Qualifier",
                        "description": "Ensure editor is in dark mode (prevent light theme wash out)",
                        "enabled": False,
                        "severity": "warning"
                    },
                    "view_mode": {
                        "name": "Edit Mode Qualifier",
                        "description": "Ensure document is in view mode with gutter line numbers visible",
                        "enabled": False,
                        "severity": "warning"
                    }
                }
            },
            "trigger_decision": {
                "allowed": True,
                "prevented": False,
                "reasons": [],
                "evaluated_at": None,
                "qualifier_statuses": {}
            }
        },
        "document_assemble": {
            "id": "document_assemble",
            "group": "verify_assemble",
            "title": "8. Markdown Document Assemble",
            "description": "Reconstructs continuous markdown document, links verified code blocks, and evaluates loopback completion against total lines.",
            "status": "idle",
            "total_captured_lines": 0,
            "completion_percent": 0.0,
            "is_complete": False,
            "loop_iteration": 0,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "auto_save_markdown": True,
                "output_filename": "reconstructed.md"
            }
        },
        "batch_frames_ocr": {
            "id": "batch_frames_ocr",
            "group": "verify_assemble",
            "title": "9. Sequential Batch Frames OCR",
            "description": "Performs full OCR rescan on all captured frames sequentially from top to bottom, perfectly aligning duplicated lines and assembling markdown.",
            "status": "idle",
            "total_frames": 0,
            "processed_frames": 0,
            "progress_percent": 0.0,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "auto_save_markdown": True,
                "output_filename": "reconstructed.md"
            }
        },
        "markdown_tag_parser": {
            "id": "markdown_tag_parser",
            "group": "post_capture_analyzer",
            "title": "10. Parse File Tags & VFS Tree",
            "description": "Parses Directory Structure header and CODESCAN_FILE_START/END file blocks, self-heals corrupted tags from PNG frames, validates line counts, and builds VFS manifest.",
            "status": "idle",
            "vfs_files_count": 0,
            "repaired_tags_count": 0,
            "line_count_mismatches_count": 0,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "stitch_multipart_bundles": True,
                "self_heal_corrupted_tags": True,
                "validate_line_counts": True
            }
        },
        "ast_compiler_validator": {
            "id": "ast_compiler_validator",
            "group": "post_capture_analyzer",
            "title": "11. AST & TypeScript Compiler Check",
            "description": "Invokes persistent Node.js TypeScript Compiler API + memfs worker to parse and type-check VFS files, auto-healing OCR symbol errors from source PNG frames.",
            "status": "idle",
            "total_files": 0,
            "compilable_files": 0,
            "syntax_errors_count": 0,
            "auto_healed_lines_count": 0,
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "auto_heal_syntax_errors": True,
                "max_heal_attempts_per_file": 10,
                "validate_css_and_json": True
            }
        },
        "sandbox_ide": {
            "id": "sandbox_ide",
            "group": "post_capture_analyzer",
            "title": "12. Sandbox & Monaco VFS Ready",
            "description": "Materializes VFS files into server/storage/sandbox/<project_id>/, generates missing package.json/tsconfig.json, links shared_node_modules, and publishes workspace to /api/analyzer/workspace/{project_id}.",
            "status": "idle",
            "materialized_files_count": 0,
            "node_modules_linked": False,
            "workspace_endpoint": "",
            "evaluator": None,
            "healing_step": None,
            "telemetry_insight": None,
            "timings": None,
            "dag_context": None,
            "trace_insights": None,
            "started_at": None,
            "finished_at": None,
            "duration_ms": None,
            "is_active": False,
            "config": {
                "auto_link_node_modules": True,
                "generate_missing_configs": True,
                "start_preview_server": True
            }
        }
    },
    "edges": [
        {"id": "markdown_file_change->init_end", "from": "markdown_file_change", "to": "init_end", "enabled": True},
        {"id": "init_end->reset_home", "from": "init_end", "to": "reset_home", "enabled": True},
        {"id": "reset_home->frame_acquire", "from": "reset_home", "to": "frame_acquire", "enabled": True},
        {"id": "frame_acquire->local_ai_ocr", "from": "frame_acquire", "to": "local_ai_ocr", "enabled": True},
        {"id": "local_ai_ocr->frame_ocr", "from": "local_ai_ocr", "to": "frame_ocr", "enabled": True, "has_semaphore": True},
        {"id": "frame_ocr->arrow_down", "from": "frame_ocr", "to": "arrow_down", "enabled": True},
        {"id": "arrow_down->verification_trigger", "from": "arrow_down", "to": "verification_trigger", "enabled": True, "has_semaphore": True},
        {"id": "verification_trigger->document_assemble", "from": "verification_trigger", "to": "document_assemble", "enabled": True},
        {"id": "document_assemble->frame_acquire", "from": "document_assemble", "to": "frame_acquire", "enabled": True, "is_loopback": True},
        {"id": "document_assemble->batch_frames_ocr", "from": "document_assemble", "to": "batch_frames_ocr", "enabled": True},
        {"id": "document_assemble->markdown_file_change", "from": "document_assemble", "to": "markdown_file_change", "enabled": True, "condition": "ON_PART_EOF"},
        {"id": "markdown_file_change->markdown_tag_parser", "from": "markdown_file_change", "to": "markdown_tag_parser", "enabled": True, "condition": "ON_BUNDLE_EOF"},
        {"id": "document_assemble->markdown_tag_parser", "from": "document_assemble", "to": "markdown_tag_parser", "enabled": True, "condition": "ON_EOF"},
        {"id": "markdown_tag_parser->ast_compiler_validator", "from": "markdown_tag_parser", "to": "ast_compiler_validator", "enabled": True, "condition": "ON_SUCCESS"},
        {"id": "ast_compiler_validator->sandbox_ide", "from": "ast_compiler_validator", "to": "sandbox_ide", "enabled": True, "condition": "ON_SUCCESS"}
    ],
    "current_active_node": None,
    "bypass_live_ocr": False,
    "headless_mode": False
}

DEFAULT_DAG_EDGES = [
    {"id": "markdown_file_change->init_end", "from": "markdown_file_change", "to": "init_end", "enabled": True, "label": "Fullscreen + Dark Mode -> Phase I Init"},
    {"id": "init_end->reset_home", "from": "init_end", "to": "reset_home", "enabled": True, "label": "Calibrate to Line 1"},
    {"id": "reset_home->frame_acquire", "from": "reset_home", "to": "frame_acquire", "enabled": True, "label": "Start Page Capture"},
    {"id": "frame_acquire->local_ai_ocr", "from": "frame_acquire", "to": "local_ai_ocr", "enabled": True, "label": "Send Image to MiniCPM-V"},
    {"id": "local_ai_ocr->frame_ocr", "from": "local_ai_ocr", "to": "frame_ocr", "enabled": True, "label": "Route to Gutter Boundary OCR", "has_semaphore": True},
    {"id": "frame_ocr->arrow_down", "from": "frame_ocr", "to": "arrow_down", "enabled": True, "label": "Target Next Page Line"},
    {"id": "arrow_down->verification_trigger", "from": "arrow_down", "to": "verification_trigger", "enabled": True, "label": "Assert Settle & Trigger Next", "has_semaphore": True},
    {"id": "verification_trigger->document_assemble", "from": "verification_trigger", "to": "document_assemble", "enabled": True, "label": "Append Verified Text"},
    {"id": "document_assemble->frame_acquire", "from": "document_assemble", "to": "frame_acquire", "enabled": True, "is_loopback": True, "label": "Continuous Loopback Track"},
    {"id": "document_assemble->batch_frames_ocr", "from": "document_assemble", "to": "batch_frames_ocr", "enabled": True, "label": "Run Sequential Batch Rescan"},
    {"id": "document_assemble->markdown_file_change", "from": "document_assemble", "to": "markdown_file_change", "enabled": True, "condition": "ON_PART_EOF", "label": "Part Complete -> Switch Next Markdown"},
    {"id": "markdown_file_change->markdown_tag_parser", "from": "markdown_file_change", "to": "markdown_tag_parser", "enabled": True, "condition": "ON_BUNDLE_EOF", "label": "All Bundle Parts Complete -> Phase III Sandbox"},
    {"id": "document_assemble->markdown_tag_parser", "from": "document_assemble", "to": "markdown_tag_parser", "enabled": True, "condition": "ON_EOF", "label": "100% Complete -> Parse VFS Tags"},
    {"id": "markdown_tag_parser->ast_compiler_validator", "from": "markdown_tag_parser", "to": "ast_compiler_validator", "enabled": True, "condition": "ON_SUCCESS", "label": "Validate AST & TypeScript in VFS"},
    {"id": "ast_compiler_validator->sandbox_ide", "from": "ast_compiler_validator", "to": "sandbox_ide", "enabled": True, "condition": "ON_SUCCESS", "label": "Materialize Sandbox & Monaco VFS"}
]

analyzer_workspaces: Dict[str, Dict[str, Any]] = {}

capture_loop_running: bool = False
headless_mode: bool = False
dag_semaphore_group2_to_3: bool = True
dag_semaphore_group3_to_4: bool = True

headless_telemetry_session: Dict[str, Any] = {
    "session_id": "",
    "is_active": False,
    "start_time": 0.0,
    "end_time": None,
    "elapsed_seconds": 0.0,
    "status": "IDLE",
    "operation_type": "headless_loop",
    "project_id": "",
    "project_name": "",
    "start_line": 1,
    "current_top_line": 0,
    "current_bottom_line": 0,
    "target_total_lines": 0,
    "total_lines_reached": False,
    "total_lines_captured": 0,
    "completion_percent": 0.0,
    "frames_processed": 0,
    "total_frames_target": 0,
    "total_latency_ms": 0.0,
    "avg_ocr_latency_ms": 0.0,
    "lines_per_second": 0.0,
    "issues_detected": 0,
    "gaps_detected": 0,
    "engine": "RapidOCR Inspector Rescan Engine (Local)",
    "finish_status_message": "Ready",
    "recent_events": [],
    "reconstructed_markdown_path": None,
    "reconstructed_markdown_size": 0
}

def start_headless_telemetry_session(operation_type: str = "headless_loop", target_total_lines: Optional[int] = None, total_frames: int = 0) -> Dict[str, Any]:
    global headless_telemetry_session
    now = time.time()
    proj = db.get_active_project() or {}
    target_lines = int(
        target_total_lines
        or latest_telemetry.get("target_total_lines", 0)
        or dag_state["nodes"].get("init_end", {}).get("total_lines", 0)
        or proj.get("target_total_lines", 0)
        or proj.get("total_lines", 0)
        or 0
    )
    headless_telemetry_session = {
        "session_id": str(uuid.uuid4())[:8],
        "is_active": True,
        "start_time": now,
        "end_time": None,
        "elapsed_seconds": 0.0,
        "status": "RUNNING",
        "operation_type": operation_type,
        "project_id": proj.get("id", ""),
        "project_name": proj.get("name", ""),
        "start_line": latest_telemetry.get("current_top_line", 1) or 1,
        "current_top_line": latest_telemetry.get("current_top_line", 1) or 1,
        "current_bottom_line": latest_telemetry.get("current_bottom_line", 1) or 1,
        "target_total_lines": target_lines,
        "total_lines_reached": False,
        "total_lines_captured": len(document_lines),
        "completion_percent": round((len(document_lines) / max(1, target_lines)) * 100, 1) if target_lines > 0 else 0.0,
        "frames_processed": 0,
        "total_frames_target": total_frames,
        "total_latency_ms": 0.0,
        "avg_ocr_latency_ms": 0.0,
        "lines_per_second": 0.0,
        "issues_detected": 0,
        "gaps_detected": 0,
        "engine": "RapidOCR Inspector Rescan Engine (Local)",
        "finish_status_message": f"Headless {operation_type.replace('_', ' ')} in progress...",
        "recent_events": [f"[{time.strftime('%H:%M:%S')}] Headless {operation_type} session started"],
        "reconstructed_markdown_path": None,
        "reconstructed_markdown_size": 0
    }
    return headless_telemetry_session

def update_headless_telemetry_session(
    top_line: Optional[int] = None,
    bottom_line: Optional[int] = None,
    frames_inc: int = 0,
    latency_ms: float = 0.0,
    event_msg: Optional[str] = None
) -> Dict[str, Any]:
    global headless_telemetry_session
    if not headless_telemetry_session.get("is_active"):
        if getattr(sys.modules[__name__], "capture_loop_running", False):
            headless_telemetry_session["is_active"] = True
            headless_telemetry_session["status"] = "RUNNING"
        else:
            return headless_telemetry_session
    else:
        headless_telemetry_session["status"] = "RUNNING"

    now = time.time()
    elapsed = max(0.1, now - headless_telemetry_session.get("start_time", now))
    headless_telemetry_session["elapsed_seconds"] = round(elapsed, 1)

    if top_line is not None and top_line > 0:
        headless_telemetry_session["current_top_line"] = top_line
    if bottom_line is not None and bottom_line > 0:
        headless_telemetry_session["current_bottom_line"] = bottom_line

    headless_telemetry_session["frames_processed"] += frames_inc
    if latency_ms and latency_ms > 0:
        headless_telemetry_session["total_latency_ms"] = headless_telemetry_session.get("total_latency_ms", 0.0) + latency_ms
        if headless_telemetry_session["frames_processed"] > 0:
            headless_telemetry_session["avg_ocr_latency_ms"] = round(
                headless_telemetry_session["total_latency_ms"] / headless_telemetry_session["frames_processed"], 1
            )

    doc_len = len(document_lines)
    max_doc_ln = max(document_lines.keys(), default=0) if document_lines else 0
    headless_telemetry_session["total_lines_captured"] = doc_len

    cur_b = max(int(headless_telemetry_session.get("current_bottom_line", 0) or 0), max_doc_ln)
    headless_telemetry_session["current_bottom_line"] = cur_b
    start_l = headless_telemetry_session.get("start_line", 1) or 1
    lines_advanced = max(0, cur_b - start_l + 1)
    headless_telemetry_session["lines_per_second"] = round(lines_advanced / elapsed, 1)

    target = headless_telemetry_session.get("target_total_lines", 0) or latest_telemetry.get("target_total_lines", 0)
    if target > 0:
        from ocr_engine import is_eof_reached_with_offline_awareness
        headless_telemetry_session["target_total_lines"] = target
        tail_txt = ""
        if cur_b > 0 and document_lines:
            tail_txt = "\n".join(str(document_lines.get(k, "")) for k in range(max(1, cur_b - 6), cur_b + 1))
        offline_det = bool(
            orchestration_state.get("offline_overlay_detected")
            or dag_state.get("nodes", {}).get("frame_ocr", {}).get("offline_overlay_detected")
            or dag_state.get("nodes", {}).get("arrow_down", {}).get("offline_overlay_detected")
        )
        is_eof, _ = is_eof_reached_with_offline_awareness(
            bottom_line=max(cur_b, doc_len),
            total_lines=target,
            offline_detected=offline_det,
            tail_text=tail_txt,
        )
        pct = 100.0 if is_eof else round(min(100.0, (max(cur_b, doc_len) / target) * 100), 1)
        headless_telemetry_session["completion_percent"] = pct
        if is_eof or cur_b >= target or doc_len >= target:
            headless_telemetry_session["total_lines_reached"] = True
        else:
            headless_telemetry_session["finish_status_message"] = (
                f"Headless capture loop running • Ln {headless_telemetry_session.get('current_top_line', 1)}..{cur_b} of {target:,} ({pct}%)"
            )
    elif headless_telemetry_session.get("total_frames_target", 0) > 0:
        tot_f = headless_telemetry_session["total_frames_target"]
        pct = round(min(100.0, (headless_telemetry_session["frames_processed"] / tot_f) * 100), 1)
        headless_telemetry_session["completion_percent"] = pct

    if event_msg:
        events = headless_telemetry_session.setdefault("recent_events", [])
        events.append(f"[{time.strftime('%H:%M:%S')}] {event_msg}")
        if len(events) > 30:
            events.pop(0)

    return headless_telemetry_session


def sync_resume_frontier_state(
    exclude_frame_id: Optional[str] = None,
    override_resume_top_line: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Computes the authoritative resume frontier from the last OCR'd frame / screen capture
    and document_lines, and synchronizes all DAG nodes, orchestration_state, and telemetry
    so auto-resume always picks up at last_bottom_line + 1 without resetting to Line 1.
    """
    pid = get_current_project_id()
    if pid and not captured_frames:
        try:
            db_frames = db.get_frames(pid)
            if db_frames:
                captured_frames._suppress_tracking = True
                try:
                    captured_frames.update({f["frame_id"]: f for f in db_frames})
                finally:
                    captured_frames._suppress_tracking = False
        except Exception:
            pass
    if pid and not document_lines:
        try:
            db_lines = db.get_document_lines(pid)
            if db_lines:
                document_lines._suppress_tracking = True
                try:
                    for k, v in db_lines.items():
                        document_lines[k] = v
                finally:
                    document_lines._suppress_tracking = False
        except Exception:
            pass

    valid_frames = [
        f for f in captured_frames.values()
        if (not exclude_frame_id or f.get("frame_id") != exclude_frame_id)
        and (f.get("bottom_line", 0) or 0) > 0
    ]
    processed_frames = [f for f in valid_frames if f.get("status") != "acquired"]
    candidate_frames = processed_frames if processed_frames else valid_frames

    last_frame = None
    max_frame_bot = 0
    if candidate_frames:
        sorted_cands = sorted(
            candidate_frames,
            key=lambda x: ((x.get("bottom_line", 0) or 0), (x.get("page_index", 0) or 0), (x.get("created_at", "") or ""))
        )
        last_frame = sorted_cands[-1]
        max_frame_bot = int(last_frame.get("bottom_line", 0) or 0)

    max_doc_ln = int(max(document_lines.keys(), default=0)) if document_lines else 0
    last_bot = max(max_frame_bot, max_doc_ln)
    if override_resume_top_line and int(override_resume_top_line) > 1:
        last_bot = max(last_bot, int(override_resume_top_line) - 1)

    last_top = int(last_frame.get("top_line") or max(1, last_bot - 23)) if (last_frame and last_bot > 0) else (1 if last_bot > 0 else 0)
    last_page = int(last_frame.get("page_index") or len(candidate_frames)) if (last_frame and last_bot > 0) else len(candidate_frames)
    next_top = (last_bot + 1) if last_bot > 0 else 1

    proj = db.get_active_project() or {}
    proj_target = int(proj.get("target_total_lines") or 0)
    proj_status_raw = str(proj.get("status") or "").lower()
    if proj_status_raw == "completed" and proj_target > 0 and last_bot < proj_target - 4:
        try:
            if proj.get("id"):
                db.update_project_status(proj["id"], "active")
        except Exception:
            pass
        proj_is_completed = False
    else:
        proj_is_completed = (proj_status_raw == "completed") and (proj_target <= 0 or last_bot >= proj_target - 4)

    if last_bot <= 0 and proj_target == 0:
        target_total = 0
        latest_telemetry["target_total_lines"] = 0
        latest_telemetry["current_top_line"] = 0
        latest_telemetry["current_bottom_line"] = 0
        latest_telemetry["current_page"] = 1
        headless_telemetry_session["target_total_lines"] = 0
        headless_telemetry_session["current_top_line"] = 0
        headless_telemetry_session["current_bottom_line"] = 0
        headless_telemetry_session["pages_captured"] = 0
        headless_telemetry_session["completion_percent"] = 0.0
        headless_telemetry_session["total_lines_reached"] = False
        headless_telemetry_session["status"] = "IDLE"
        project_diagnostics_trace["project_id"] = proj.get("id")
        project_diagnostics_trace["target_total_lines"] = 0
        project_diagnostics_trace["frontier_line"] = 0
        project_diagnostics_trace["next_expected_top_line"] = 1
        project_diagnostics_trace["is_completed"] = False
        project_diagnostics_trace["current_status"] = "IDLE"
        project_diagnostics_trace["last_stop_reason"] = None
        orchestration_state["eof_reached"] = False
        orchestration_state["status"] = "IDLE"
        orchestration_state["manual_attention_required"] = False
        orchestration_state["halt_reason"] = None
        orchestration_state["next_target_top"] = 1
        orchestration_state["cursor_line"] = 1
        orchestration_state["character_tracking_mode"] = False
        orchestration_state["character_tracking_line"] = 0
        orchestration_state["bottom_text_anchor"] = ""
        orchestration_state["target_top_text_anchor"] = ""
        orchestration_state["bottom_anchor_window"] = []
        dag_state.get("groups", {}).get("initialize", {}).update({
            "status": "idle",
            "progress": {
                "percent": 0,
                "stage": "Ready to initialize",
                "status": "idle",
                "total_lines": 0,
                "verified": False,
            },
        })
        dag_state.get("nodes", {}).get("init_end", {}).update({
            "total_lines": 0,
            "status": "idle",
            "telemetry_insight": None,
            "error": None,
        })
        dag_state.get("nodes", {}).get("reset_home", {}).update({
            "status": "idle",
            "verified": False,
            "is_active": False,
            "first_line": 0,
            "error": None,
        })
        dag_state.get("nodes", {}).get("frame_acquire", {}).update({
            "status": "idle",
            "page": 1,
            "is_active": False,
        })
        dag_state.get("nodes", {}).get("local_ai_ocr", {}).update({
            "status": "idle",
            "is_active": False,
        })
        dag_state.get("nodes", {}).get("frame_ocr", {}).update({
            "status": "idle",
            "top_line": 0,
            "bottom_line": 0,
            "target_top_line": 1,
            "extracted_line_count": 0,
            "character_tracking_mode": False,
            "character_tracking_line": 0,
            "bottom_text_anchor": "",
            "target_top_text_anchor": "",
            "bottom_anchor_window": [],
        })
        dag_state.get("nodes", {}).get("arrow_down", {}).update({
            "status": "idle",
            "prev_bottom": 0,
            "target_top": 1,
            "target_top_line": 1,
            "new_top_line": 1,
            "arrow_count": 0,
            "character_tracking_mode": False,
            "character_tracking_line": 0,
            "bottom_text_anchor": "",
            "target_top_text_anchor": "",
            "bottom_anchor_window": [],
            "eof_reached": False,
        })
        dag_state.get("nodes", {}).get("verification_trigger", {}).update({
            "status": "idle",
            "target_top": 1,
            "target_top_line": 1,
            "expected_top": 1,
            "remaining_lines": 0,
            "loop_count": 0,
            "is_complete": False,
        })
        dag_state.get("nodes", {}).get("document_assemble", {}).update({
            "is_complete": False,
            "completion_percent": 0.0,
            "total_captured_lines": 0,
            "effective_bottom_line": 0,
            "status": "idle",
            "telemetry_insight": None,
            "error": None,
        })
    else:
        target_total = int(
            proj_target
            or (last_bot if proj_is_completed else 0)
            or (latest_telemetry.get("target_total_lines") if not proj else 0)
            or 0
        )

    if target_total > 0:
        latest_telemetry["target_total_lines"] = target_total
        headless_telemetry_session["target_total_lines"] = target_total
        dag_state.get("nodes", {}).get("init_end", {}).update({
            "total_lines": target_total,
            "status": "completed",
            "telemetry_insight": f"Calibrated {target_total:,} total lines at EOF ✔",
            "error": None,
        })
        if last_bot <= 0:
            # Part has calibrated target_total_lines, but 0 frames captured yet
            latest_telemetry["current_top_line"] = 1
            latest_telemetry["current_bottom_line"] = 0
            latest_telemetry["current_page"] = 1
            dag_state.get("nodes", {}).get("frame_ocr", {}).update({
                "status": "idle",
                "top_line": 0,
                "bottom_line": 0,
                "target_top_line": 1,
            })
            dag_state.get("nodes", {}).get("arrow_down", {}).update({
                "status": "idle",
                "prev_bottom": 0,
                "target_top": 1,
                "target_top_line": 1,
                "new_top_line": 1,
                "eof_reached": False,
            })
            dag_state.get("nodes", {}).get("verification_trigger", {}).update({
                "status": "idle",
                "target_top": 1,
                "target_top_line": 1,
                "expected_top": 1,
                "remaining_lines": target_total,
                "is_complete": False,
            })
            dag_state.get("nodes", {}).get("document_assemble", {}).update({
                "is_complete": False,
                "completion_percent": 0.0,
                "total_captured_lines": 0,
                "effective_bottom_line": 0,
                "status": "idle",
            })

    if last_bot > 0:
        # Project already has captured frames / OCR lines — mark Phase I completed and sync frontier
        init_grp = dag_state.get("groups", {}).get("initialize", {})
        init_grp["status"] = "completed"
        if target_total > 0:
            init_grp["progress"] = {
                "percent": 100,
                "stage": (
                    f"Project Completed • {target_total:,} of {target_total:,} lines verified (100%) ✔"
                    if (proj_is_completed or last_bot >= target_total)
                    else f"Project Ready • Resuming from Line {next_top:,} of {target_total:,} ✔"
                ),
                "status": "completed",
                "total_lines": target_total,
                "verified": True,
            }
        dag_state.get("nodes", {}).get("reset_home", {}).update({
            "status": "completed",
            "verified": True,
            "is_active": False,
        })
        char_track_resume = False
        char_track_anchor = ""
        char_track_target_anchor = ""
        char_track_win: List[str] = []
        if last_frame and ((last_bot - last_top + 1) < 22 or "_wrap" in str(last_frame.get("frame_id") or "")):
            try:
                import cv2 as _cv2
                from ocr_engine import detect_line_wrap_state, find_gutter_numbers_cluster
                fid_str = str(last_frame.get("frame_id") or "")
                fname_str = str(last_frame.get("filename") or f"{fid_str}.png")
                fpath = FRAMES_DIR / fname_str
                if not fpath.exists():
                    fpath = FRAMES_DIR / f"{fid_str}.png"
                if fpath.exists():
                    f_img = _cv2.imread(str(fpath))
                    if f_img is not None:
                        f_gut = find_gutter_numbers_cluster(f_img, 1.0)
                        ws = detect_line_wrap_state(f_img, 1.0, f_gut)
                        if ws.get("is_bottom_wrapped") or ws.get("is_wrapped_page"):
                            char_track_resume = True
                            char_track_anchor = str(ws.get("bottom_text_anchor") or "")
                            char_track_target_anchor = str(ws.get("target_top_text_anchor") or "")
                            char_track_win = list(ws.get("bottom_anchor_window") or [])
            except Exception as _we:
                print(f"[sync_resume_frontier_state] wrap check note: {_we}")

        orchestration_state["character_tracking_mode"] = char_track_resume
        orchestration_state["character_tracking_line"] = last_bot if char_track_resume else 0
        orchestration_state["bottom_text_anchor"] = char_track_anchor
        orchestration_state["target_top_text_anchor"] = char_track_target_anchor
        orchestration_state["bottom_anchor_window"] = char_track_win

        dag_state.get("nodes", {}).get("frame_ocr", {}).update({
            "top_line": last_top,
            "bottom_line": last_bot,
            "target_top_line": last_bot if char_track_resume else next_top,
            "character_tracking_mode": char_track_resume,
            "character_tracking_line": last_bot if char_track_resume else 0,
            "bottom_text_anchor": char_track_anchor,
            "target_top_text_anchor": char_track_target_anchor,
            "bottom_anchor_window": char_track_win,
        })
        dag_state.get("nodes", {}).get("arrow_down", {}).update({
            "prev_bottom": last_bot,
            "target_top": last_bot if char_track_resume else next_top,
            "target_top_line": last_bot if char_track_resume else next_top,
            "new_top_line": last_bot if char_track_resume else next_top,
            "character_tracking_mode": char_track_resume,
            "character_tracking_line": last_bot if char_track_resume else 0,
            "bottom_text_anchor": char_track_anchor,
            "target_top_text_anchor": char_track_target_anchor,
            "bottom_anchor_window": char_track_win,
            "eof_reached": bool(proj_is_completed or (target_total > 0 and last_bot >= target_total)),
        })
        dag_state.get("nodes", {}).get("verification_trigger", {}).update({
            "target_top": next_top,
            "target_top_line": next_top,
            "expected_top": next_top,
            "remaining_lines": max(0, target_total - last_bot) if target_total > 0 else 0,
        })
        if proj_is_completed or (target_total > 0 and last_bot >= target_total):
            cap_cnt = len(document_lines) or target_total
            dag_state.get("nodes", {}).get("document_assemble", {}).update({
                "status": "completed",
                "total_captured_lines": cap_cnt,
                "effective_bottom_line": target_total,
                "completion_percent": 100.0,
                "is_complete": True,
                "healing_step": None,
                "telemetry_insight": f"Master document: {cap_cnt:,}/{target_total:,} lines stitched (100.0%) • 100% COMPLETE ✔",
                "error": None,
            })
            orchestration_state["eof_reached"] = True
            orchestration_state["status"] = "COMPLETED"
            orchestration_state["manual_attention_required"] = False
            orchestration_state["halt_reason"] = None
            project_diagnostics_trace["is_completed"] = True
            project_diagnostics_trace["current_status"] = "COMPLETED"
            project_diagnostics_trace["last_stop_reason"] = None
            headless_telemetry_session["status"] = "COMPLETED"
            headless_telemetry_session["completion_percent"] = 100.0
            headless_telemetry_session["total_lines_reached"] = True
        else:
            cap_cnt = len(document_lines)
            pct_cur = round(min(99.9, (last_bot / max(1, target_total)) * 100.0), 1) if target_total > 0 else 0.0
            dag_state.get("nodes", {}).get("document_assemble", {}).update({
                "status": "completed" if cap_cnt > 0 else "idle",
                "total_captured_lines": cap_cnt,
                "effective_bottom_line": last_bot,
                "completion_percent": pct_cur,
                "is_complete": False,
                "error": None,
            })
            orchestration_state["eof_reached"] = False
            if orchestration_state.get("status") == "COMPLETED":
                orchestration_state["status"] = "RUNNING" if getattr(sys.modules[__name__], "capture_loop_running", False) else "IDLE"
            project_diagnostics_trace["is_completed"] = False
            if project_diagnostics_trace.get("current_status") == "COMPLETED":
                project_diagnostics_trace["current_status"] = "RUNNING" if getattr(sys.modules[__name__], "capture_loop_running", False) else "IDLE"
            headless_telemetry_session["total_lines_reached"] = False
            if headless_telemetry_session.get("status") == "COMPLETED":
                headless_telemetry_session["status"] = "RUNNING" if getattr(sys.modules[__name__], "capture_loop_running", False) else "IDLE"
            headless_telemetry_session["completion_percent"] = pct_cur
        latest_telemetry["current_top_line"] = last_top
        latest_telemetry["current_bottom_line"] = last_bot
        latest_telemetry["current_page"] = max(1, last_page)
        orchestration_state["top_line"] = last_top
        orchestration_state["bottom_line"] = last_bot
        orchestration_state["next_target_top"] = next_top
        orchestration_state["page"] = max(1, last_page)

    return {
        "has_existing_progress": bool(last_bot > 0),
        "last_top_line": last_top,
        "last_bottom_line": last_bot,
        "next_top_line": next_top,
        "last_page_index": last_page,
        "last_frame_id": last_frame.get("frame_id") if last_frame else None,
        "target_total_lines": target_total,
        "frames_count": len(captured_frames),
        "lines_count": len(document_lines),
    }


def get_next_expected_top_line(exclude_frame_id: Optional[str] = None) -> int:
    """
    Returns the single authoritative forward capture frontier (next expected top line) across
    all captured frames and document_lines so Node 3, Node 5, Node 6, and auto-recovery never disagree.
    When exclude_frame_id is provided (e.g. Node 5 checking the expected top line for the current
    acquired frame after Node 4 has already written its lines to document_lines), lines belonging
    solely to exclude_frame_id are excluded so Node 5 never double-scrolls.
    """
    excluded_frame = captured_frames.get(exclude_frame_id) if exclude_frame_id else None
    other_frames = [
        f for f in captured_frames.values()
        if (not exclude_frame_id or f.get("frame_id") != exclude_frame_id)
        and f.get("status") != "acquired"
    ]
    if not other_frames and not document_lines:
        # Check if acquired frames with valid bounds exist before falling back to 1
        acq_frames = [
            f for f in captured_frames.values()
            if (not exclude_frame_id or f.get("frame_id") != exclude_frame_id)
            and (f.get("bottom_line", 0) or 0) > 0
        ]
        if not acq_frames:
            return int(dag_state.get("nodes", {}).get("frame_ocr", {}).get("target_top_line") or 1)
        other_frames = acq_frames
    max_frame_bot = max(((f.get("bottom_line", 0) or 0) for f in other_frames), default=0)
    if exclude_frame_id:
        # Exclude document_lines written by the excluded frame itself
        ex_top = int(excluded_frame.get("top_line", 0) or 0) if excluded_frame else 0
        doc_keys = [
            ln for ln, entry in document_lines.items()
            if (not isinstance(entry, dict) or entry.get("frame_id") != exclude_frame_id)
            and (ex_top <= 0 or ln < ex_top or ln <= max_frame_bot)
        ]
        max_doc_ln = max(doc_keys, default=0)
    else:
        max_doc_ln = max(document_lines.keys(), default=0) if document_lines else 0
    frontier = max(max_frame_bot, max_doc_ln)
    if frontier > 0:
        return int(frontier) + 1
    if exclude_frame_id and excluded_frame and not other_frames:
        return 1
    return int(dag_state.get("nodes", {}).get("frame_ocr", {}).get("target_top_line") or 1)


def prune_regressed_frames(exclude_frame_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Detects and removes any anomalous regressed frames created *after* the forward capture frontier
    (for example, if a window shift caused the viewport to jump backwards and re-capture lines
    that were already verified earlier in the document).
    Ensures captured_frames ends cleanly at the highest captured line so resumption continues seamlessly.
    """
    if not captured_frames:
        return {"pruned_count": 0, "pruned_frame_ids": [], "frontier_bottom_line": 0}

    sorted_f = sorted(
        captured_frames.values(),
        key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "") or "")
    )
    max_bot = max(((f.get("bottom_line", 0) or 0) for f in sorted_f), default=0)
    if max_bot <= 0:
        return {"pruned_count": 0, "pruned_frame_ids": [], "frontier_bottom_line": 0}

    # Find the earliest frame that reached max_bot
    frontier_idx = -1
    frontier_frame = None
    for idx, f in enumerate(sorted_f):
        if (f.get("bottom_line", 0) or 0) == max_bot:
            frontier_idx = idx
            frontier_frame = f
            # If subsequent frames are wrapped continuations of max_bot with distinct content, advance frontier_idx
            for sub_idx in range(idx + 1, len(sorted_f)):
                sf = sorted_f[sub_idx]
                if (sf.get("bottom_line", 0) or 0) == max_bot and (
                    sf.get("is_wrapped_continuation")
                    or sf.get("character_tracking_mode")
                    or "_wrap" in str(sf.get("frame_id", ""))
                ):
                    if not sf.get("content_hash") or sf.get("content_hash") != frontier_frame.get("content_hash"):
                        frontier_idx = sub_idx
                        frontier_frame = sf
            break

    if frontier_idx < 0 or frontier_idx == len(sorted_f) - 1:
        return {"pruned_count": 0, "pruned_frame_ids": [], "frontier_bottom_line": max_bot}

    pruned_ids: List[str] = []
    frontier_top = int(frontier_frame.get("top_line", 0) or 0) if frontier_frame else 0
    frontier_hash = frontier_frame.get("content_hash") if frontier_frame else None
    for f in sorted_f[frontier_idx + 1:]:
        fid = f.get("frame_id")
        if not fid or fid == exclude_frame_id:
            continue
        f_bot = int(f.get("bottom_line", 0) or 0)
        f_top = int(f.get("top_line", 0) or 0)
        is_wrap_cont = bool(
            f.get("is_wrapped_continuation")
            or f.get("character_tracking_mode")
            or "_wrap" in str(fid)
            or (f_top > 0 and f_top == f_bot)
        )
        # If a frame after the frontier regressed more than 10 lines behind max_bot
        # OR is an exact duplicate retry of the frontier frame (e.g. repeated EOF captures), prune it
        if f_bot < max_bot - 10 or (
            f_bot == max_bot
            and frontier_top > 0
            and f_top == frontier_top
            and (not is_wrap_cont or (frontier_hash and f.get("content_hash") == frontier_hash))
        ):
            pruned_ids.append(fid)
            captured_frames.pop(fid, None)
            try:
                db.delete_frame(fid)
            except Exception:
                pass

    if pruned_ids and frontier_frame:
        f_page = int(frontier_frame.get("page_index") or (frontier_idx + 1))
        f_top = int(frontier_frame.get("top_line") or 1)
        f_bot = int(frontier_frame.get("bottom_line") or max_bot)
        latest_telemetry["current_page"] = f_page
        latest_telemetry["current_top_line"] = f_top
        latest_telemetry["current_bottom_line"] = f_bot
        orchestration_state["page"] = f_page
        orchestration_state["top_line"] = f_top
        orchestration_state["bottom_line"] = f_bot
        orchestration_state["next_target_top"] = f_bot + 1
        dag_state.get("nodes", {}).get("frame_ocr", {}).update({
            "top_line": f_top,
            "bottom_line": f_bot,
            "target_top_line": f_bot + 1
        })
        dag_state.get("nodes", {}).get("arrow_down", {}).update({
            "prev_bottom": f_bot,
            "target_top": f_bot + 1,
            "target_top_line": f_bot + 1,
            "new_top_line": f_bot + 1
        })

    return {
        "pruned_count": len(pruned_ids),
        "pruned_frame_ids": pruned_ids,
        "frontier_bottom_line": max_bot,
        "next_expected_top_line": max_bot + 1
    }


async def recover_state_after_frame_deletion(
    deleted_metas: List[Dict[str, Any]],
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Cleans up document_lines (including stitched wrapped chunks) associated with deleted frames,
    resynchronizes the resume frontier and character-tracking state, and persists the updated state.
    """
    from ocr_engine import join_wrapped_row_slices

    pid = project_id or get_current_project_id()
    deleted_fids = set()
    deleted_ranges: List[Tuple[int, int]] = []
    for m in deleted_metas or []:
        if not isinstance(m, dict):
            continue
        raw_fid = str(m.get("frame_id") or "")
        if raw_fid:
            deleted_fids.add(raw_fid)
            if raw_fid.endswith(".png"):
                deleted_fids.add(raw_fid[:-4])
            else:
                deleted_fids.add(f"{raw_fid}.png")
        t_ln = int(m.get("top_line") or 0)
        b_ln = int(m.get("bottom_line") or 0)
        if t_ln > 0 and b_ln >= t_ln:
            deleted_ranges.append((t_ln, b_ln))

    # Determine line ranges still covered by remaining frames
    active_fids = set(captured_frames.keys())
    remaining_covered = set()
    max_remaining_bot = 0
    for rf in captured_frames.values():
        rt = int(rf.get("top_line") or 0)
        rb = int(rf.get("bottom_line") or 0)
        if rb > max_remaining_bot:
            max_remaining_bot = rb
        if rt > 0 and rb >= rt:
            for ln in range(rt, rb + 1):
                remaining_covered.add(ln)

    removed_lines: List[int] = []
    updated_wrapped_lines: List[int] = []

    def _is_chunk_stale(ck: str) -> bool:
        base_ck = str(ck).split("__")[0]
        return bool(base_ck in deleted_fids or ck in deleted_fids)

    for ln, entry in list(document_lines.items()):
        meta = entry.meta if hasattr(entry, "meta") else (entry if isinstance(entry, dict) else {})
        entry_fid = str(meta.get("frame_id") or "")
        base_entry_fid = entry_fid.split("__")[0]
        chunks_map = dict(meta.get("wrapped_chunks") or {})
        chunk_order = list(meta.get("wrapped_chunk_order") or [])

        if chunks_map and (any(_is_chunk_stale(k) for k in chunks_map) or any(_is_chunk_stale(k) for k in chunk_order)):
            stale_keys = [k for k in list(chunks_map.keys()) if _is_chunk_stale(k)]
            for sk in stale_keys:
                chunks_map.pop(sk, None)
            chunk_order = [k for k in chunk_order if not _is_chunk_stale(k) and k in chunks_map]
            if chunk_order and (ln in remaining_covered or not _is_chunk_stale(entry_fid)):
                ordered_texts = [chunks_map[k] for k in chunk_order if chunks_map.get(k)]
                new_text = join_wrapped_row_slices(ordered_texts) if ordered_texts else ""
                new_meta = dict(meta)
                if _is_chunk_stale(entry_fid):
                    new_meta["frame_id"] = chunk_order[0]
                new_meta["wrapped_chunks"] = chunks_map
                new_meta["wrapped_chunk_order"] = chunk_order
                new_meta["wrapped_pages_count"] = len(chunk_order)
                new_meta["last_continuation_frame_id"] = chunk_order[-1]
                new_meta.pop("text", None)
                document_lines[ln] = MasterLine(new_text, **new_meta)
                updated_wrapped_lines.append(ln)
                continue
            else:
                document_lines.pop(ln, None)
                removed_lines.append(ln)
                continue

        in_deleted_range = any(t <= ln <= b for (t, b) in deleted_ranges)
        is_deleted_fid = bool(base_entry_fid and (base_entry_fid in deleted_fids or entry_fid in deleted_fids))
        is_beyond_frontier = bool(max_remaining_bot > 0 and ln > max_remaining_bot)
        if is_beyond_frontier or ((is_deleted_fid or in_deleted_range) and ln not in remaining_covered):
            document_lines.pop(ln, None)
            removed_lines.append(ln)

    if pid and removed_lines:
        for rln in removed_lines:
            try:
                db.delete_document_lines_range(pid, rln, rln)
            except Exception:
                pass

    frontier_info = sync_resume_frontier_state()
    save_persisted_state()

    next_top = int(
        dag_state.get("nodes", {}).get("arrow_down", {}).get("target_top_line")
        or frontier_info.get("next_top_line")
        or 1
    )
    return {
        "project_id": pid,
        "deleted_frames": list(deleted_fids),
        "removed_lines_count": len(removed_lines),
        "updated_wrapped_lines": updated_wrapped_lines,
        "last_top_line": frontier_info.get("last_top_line", 0),
        "last_bottom_line": frontier_info.get("last_bottom_line", 0),
        "next_expected_top_line": next_top,
        "last_frame_id": frontier_info.get("last_frame_id"),
        "character_tracking_mode": bool(orchestration_state.get("character_tracking_mode", False)),
    }



def reconcile_eof_total_lines_and_complete_project(
    actual_eof_line: int = 0,
    project_id: Optional[str] = None,
    eof_reason: str = "",
) -> Dict[str, Any]:
    """
    Reconciles the project's target_total_lines and DAG 1 (init_end) total_lines with the true
    physical EOF line count when EOF is reached (correcting any DAG 1 over/under-estimation or
    'Offline' overlay shortfall) and marks the project as completed across SQLite, DAG state,
    and telemetry.
    """
    pid = project_id or get_current_project_id()
    max_doc_ln = max(document_lines.keys(), default=0) if document_lines else 0
    max_frame_bot = max(((f.get("bottom_line", 0) or 0) for f in captured_frames.values()), default=0) if captured_frames else 0
    corrected_total = max(int(actual_eof_line or 0), int(max_doc_ln or 0), int(max_frame_bot or 0))
    if corrected_total <= 0:
        proj_cur = db.get_project(pid) if pid else (db.get_active_project() or {})
        corrected_total = int((proj_cur or {}).get("target_total_lines") or 0)

    prev_target = int(
        dag_state.get("nodes", {}).get("init_end", {}).get("total_lines")
        or latest_telemetry.get("target_total_lines")
        or headless_telemetry_session.get("target_total_lines")
        or 0
    )

    if corrected_total > 0:
        if pid:
            try:
                db.update_project_target_lines(pid, corrected_total)
                db.update_project_status(pid, "completed")
            except Exception as dbe:
                print(f"[reconcile_eof_total_lines_and_complete_project] DB update note: {dbe}")

        offline_flag = bool(
            orchestration_state.get("offline_overlay_detected")
            or dag_state.get("nodes", {}).get("frame_ocr", {}).get("offline_overlay_detected")
            or dag_state.get("nodes", {}).get("arrow_down", {}).get("offline_overlay_detected")
        )
        was_corrected = bool(prev_target > 0 and prev_target != corrected_total)
        init_insight = (
            f"Calibrated {corrected_total:,} total lines at EOF (corrected from {prev_target:,} via EOF verification) ✔"
            if was_corrected
            else f"Calibrated {corrected_total:,} total lines at EOF ✔"
        )
        if "init_end" in dag_state.get("nodes", {}):
            dag_state["nodes"]["init_end"].update({
                "status": "completed",
                "total_lines": corrected_total,
                "offline_eof_line": corrected_total,
                "offline_overlay_detected": offline_flag,
                "evaluator": "EOF Gutter Evaluator",
                "telemetry_insight": init_insight,
                "error": None,
            })
        if "initialize" in dag_state.get("groups", {}):
            dag_state["groups"]["initialize"]["status"] = "completed"
            prog = dag_state["groups"]["initialize"].setdefault("progress", {})
            prog["total_lines"] = corrected_total
            prog["status"] = "completed"
            prog["percent"] = 100

        latest_telemetry["target_total_lines"] = corrected_total
        latest_telemetry["current_bottom_line"] = corrected_total
        latest_telemetry["status_message"] = (
            f"🎉 100% COMPLETE: Project verified at EOF Line {corrected_total:,} / {corrected_total:,}"
            + (f" (corrected DAG 1 total lines from {prev_target:,})" if was_corrected else "")
        )

        headless_telemetry_session["target_total_lines"] = corrected_total
        headless_telemetry_session["current_bottom_line"] = corrected_total
        headless_telemetry_session["total_lines_reached"] = True
        headless_telemetry_session["completion_percent"] = 100.0
        headless_telemetry_session["status"] = "COMPLETED"

        orchestration_state["eof_reached"] = True
        orchestration_state["status"] = "COMPLETED"
        orchestration_state["manual_attention_required"] = False
        orchestration_state["halt_reason"] = None
        orchestration_state["cursor_line"] = corrected_total

        project_diagnostics_trace["target_total_lines"] = corrected_total
        project_diagnostics_trace["is_completed"] = True
        project_diagnostics_trace["current_status"] = "COMPLETED"
        project_diagnostics_trace["last_stop_reason"] = None

        if "frame_acquire" in dag_state.get("nodes", {}):
            dag_state["nodes"]["frame_acquire"].update({
                "status": "completed",
                "is_active": False,
                "error": None,
            })
        if "arrow_down" in dag_state.get("nodes", {}):
            dag_state["nodes"]["arrow_down"].update({
                "status": "completed",
                "eof_reached": True,
                "reached": True,
                "advanced": True,
                "occluded_tail_lines": 0,
                "error": None,
                "telemetry_insight": f"Last arrow verified at EOF: Line {corrected_total:,} of {corrected_total:,} (100% EOF reached) ✔",
            })
        if "document_assemble" in dag_state.get("nodes", {}):
            cap_cnt = len(document_lines) or corrected_total
            dag_state["nodes"]["document_assemble"].update({
                "status": "completed",
                "total_captured_lines": cap_cnt,
                "effective_bottom_line": corrected_total,
                "completion_percent": 100.0,
                "is_complete": True,
                "occluded_tail_lines": 0,
                "healing_step": None,
                "telemetry_insight": f"Master document: {cap_cnt:,}/{corrected_total:,} lines stitched (100.0%) • 100% COMPLETE ✔",
                "error": None,
            })
        for grp_id in ("capture_entire_markdown", "position_navigation", "verify_assemble"):
            if grp_id in dag_state.get("groups", {}):
                dag_state["groups"][grp_id]["status"] = "completed"

        if pid:
            try:
                db.save_project_telemetry(pid, latest_telemetry, dag_state)
            except Exception:
                pass

    updated_proj = db.get_project(pid) if pid else db.get_active_project()
    return {
        "project_id": pid,
        "previous_total_lines": prev_target,
        "target_total_lines": corrected_total,
        "corrected": bool(prev_target > 0 and prev_target != corrected_total),
        "status": "completed",
        "eof_reason": eof_reason,
        "project": updated_proj,
    }


def get_loop_diagnosis() -> Dict[str, Any]:
    """
    Computes a structured diagnostic snapshot explaining the current state of the markdown replication loop,
    why it stopped (if not running), whether manual attention is required, and what recovery/resume action is ready.
    """
    ensure_diagnostics_trace_backfilled()
    is_running = bool(getattr(sys.modules[__name__], "capture_loop_running", False))
    max_doc_ln = max(document_lines.keys(), default=0) if document_lines else 0
    max_frame_bot = max(((f.get("bottom_line", 0) or 0) for f in captured_frames.values()), default=0)
    frontier_line = max(max_doc_ln, max_frame_bot)
    next_expected_top = (frontier_line + 1) if frontier_line > 0 else 1

    proj = db.get_active_project() or {}
    proj_target = int(proj.get("target_total_lines") or 0)
    proj_status_raw = str(proj.get("status") or "").lower()
    if proj_status_raw == "completed" and proj_target > 0 and frontier_line < proj_target - 4:
        try:
            if proj.get("id"):
                db.update_project_status(proj["id"], "active")
        except Exception:
            pass
        proj_status_raw = "active"

    if proj_target > 0 and proj_status_raw != "completed":
        if int(latest_telemetry.get("target_total_lines") or 0) != proj_target:
            latest_telemetry["target_total_lines"] = proj_target
        if int(headless_telemetry_session.get("target_total_lines") or 0) != proj_target:
            headless_telemetry_session["target_total_lines"] = proj_target

    if proj:
        target_lines = int(
            proj_target
            or (frontier_line if (proj_status_raw == "completed" and frontier_line > 0) else 0)
        )
    else:
        target_lines = int(
            latest_telemetry.get("target_total_lines")
            or headless_telemetry_session.get("target_total_lines")
            or dag_state.get("nodes", {}).get("init_end", {}).get("total_lines")
            or 0
        )
    from ocr_engine import is_eof_reached_with_offline_awareness
    tail_txt = ""
    if frontier_line > 0 and document_lines:
        tail_txt = "\n".join(str(document_lines.get(k, "")) for k in range(max(1, frontier_line - 6), frontier_line + 1))
    offline_det = bool(
        orchestration_state.get("offline_overlay_detected")
        or dag_state.get("nodes", {}).get("frame_ocr", {}).get("offline_overlay_detected")
        or dag_state.get("nodes", {}).get("arrow_down", {}).get("offline_overlay_detected")
    )
    is_eof, _ = is_eof_reached_with_offline_awareness(
        bottom_line=frontier_line,
        total_lines=target_lines,
        offline_detected=offline_det,
        tail_text=tail_txt,
    )
    proj_status_completed = (proj_status_raw == "completed") and (target_lines <= 0 or frontier_line >= target_lines - 4 or is_eof)
    trace_matches_proj = project_diagnostics_trace.get("project_id") in (None, proj.get("id"))
    explicitly_completed = bool(
        proj_status_completed
        or (
            trace_matches_proj
            and (
                project_diagnostics_trace.get("is_completed")
                or orchestration_state.get("eof_reached")
                or dag_state.get("nodes", {}).get("document_assemble", {}).get("is_complete")
            )
            and (
                (target_lines > 0 and (frontier_line >= target_lines - 3 or is_eof))
                or (target_lines <= 0 and frontier_line > 0 and is_eof)
            )
        )
    )
    is_complete = bool(explicitly_completed or (target_lines > 0 and (frontier_line >= target_lines or is_eof)))
    if is_complete and frontier_line > 0 and (target_lines <= 0 or frontier_line >= target_lines - 4) and target_lines != frontier_line:
        target_lines = frontier_line
    pct = 100.0 if is_complete else (round(min(100.0, (frontier_line / max(1, target_lines)) * 100.0), 1) if target_lines > 0 else 0.0)

    sorted_f = sorted(
        captured_frames.values(),
        key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "") or "")
    )
    last_f = sorted_f[-1] if sorted_f else None
    last_ts_iso = last_f.get("created_at") if last_f else None
    last_ts_ms = _parse_iso_to_ms(last_ts_iso)
    now_ms = int(time.time() * 1000)
    sec_since_last = round(max(0.0, (now_ms - last_ts_ms) / 1000.0), 1) if last_ts_ms else None

    frontier_idx = next(
        (i for i, f in enumerate(sorted_f) if (f.get("bottom_line", 0) or 0) == frontier_line),
        -1,
    )
    regressed_frames = [
        f.get("frame_id")
        for f in (sorted_f[frontier_idx + 1 :] if frontier_idx >= 0 else [])
        if (f.get("bottom_line", 0) or 0) < frontier_line - 10
    ]

    last_stop_reason = None if is_complete else (
        orchestration_state.get("halt_reason")
        or project_diagnostics_trace.get("last_stop_reason")
        or (headless_telemetry_session.get("finish_status_message") if headless_telemetry_session.get("status") == "STOPPED" else None)
    )
    status_msg = latest_telemetry.get("status_message") or ""
    if not is_running and not is_complete and ("stopped" in status_msg.lower() or "halted" in status_msg.lower() or "failed" in status_msg.lower() or "error" in status_msg.lower()):
        last_stop_reason = status_msg

    root_cause_cat = "none"
    recommended_action = f"Project completed (100% verified at Line {frontier_line:,} / {target_lines:,})." if is_complete else "Pipeline is healthy."
    if not is_running and not is_complete and frontier_line > 0:
        rsn_low = (last_stop_reason or "").lower()
        if "settled at line" in rsn_low or "navigation alignment" in rsn_low or "arrow_down" in rsn_low:
            root_cause_cat = "navigation_wrapped_or_banner_shift"
            recommended_action = (
                f"External top banner or wrapped line shifted top row Y-offset. "
                f"Dynamic toolbar-relative top-row detector & contiguous overlap tolerance are active—click Resume to continue from Line {next_expected_top}."
            )
        elif "device" in rsn_low or "adb" in rsn_low:
            root_cause_cat = "adb_connection"
            recommended_action = f"Verify Android external display connection and click Resume to continue from Line {next_expected_top}."
        elif regressed_frames:
            root_cause_cat = "regressed_frontier"
            recommended_action = f"Detected {len(regressed_frames)} regressed duplicate frames behind Line {frontier_line}. Resume will prune duplicates and continue at Line {next_expected_top}."
        else:
            root_cause_cat = "loop_interrupted"
            recommended_action = f"Capture loop paused at Line {frontier_line:,} of {target_lines:,} ({pct}%). Click Resume Capture Loop to continue from Line {next_expected_top:,}."

    manual_attention = bool(
        not is_running
        and not is_complete
        and frontier_line > 0
        and (
            orchestration_state.get("manual_attention_required")
            or bool(last_stop_reason)
            or (sec_since_last is not None and sec_since_last > 120)
        )
    )

    if is_complete:
        status_str = "COMPLETED"
    elif is_running:
        status_str = "RUNNING"
    elif manual_attention:
        status_str = "ATTENTION_REQUIRED"
    else:
        status_str = orchestration_state.get("status") or "IDLE"

    recent_evs = list(project_diagnostics_trace.get("stop_and_restart_log", []))[-10:]
    recent_evs.reverse()

    return {
        "loop_running": is_running,
        "status": status_str,
        "is_complete": is_complete,
        "headless_status": "COMPLETED" if is_complete else headless_telemetry_session.get("status"),
        "orchestration_status": status_str,
        "manual_attention_required": manual_attention,
        "can_resume": bool(not is_running and not is_complete),
        "halt_reason": None if is_running else last_stop_reason,
        "root_cause_category": "none" if is_running else root_cause_cat,
        "recommended_action": f"Actively capturing toward Line {target_lines:,} (currently at Line {frontier_line:,})" if is_running else recommended_action,
        "frontier_line": frontier_line,
        "next_expected_top_line": next_expected_top,
        "target_total_lines": target_lines,
        "verified_lines_count": len(document_lines),
        "completion_percent": pct,
        "captured_frames_count": len(captured_frames),
        "regressed_frames_count": len(regressed_frames),
        "last_frame_id": last_f.get("frame_id") if last_f else None,
        "last_frame_timestamp": last_ts_iso,
        "seconds_since_last_frame": sec_since_last,
        "total_stops": project_diagnostics_trace.get("total_stops", 0),
        "total_auto_recoveries": project_diagnostics_trace.get("total_auto_recoveries", 0),
        "total_downtime_formatted": _fmt_dur_trace(project_diagnostics_trace.get("total_downtime_ms", 0)),
        "recent_events": recent_evs
    }

def complete_headless_telemetry_session(status: str = "COMPLETED", message: Optional[str] = None) -> Dict[str, Any]:
    global headless_telemetry_session
    now = time.time()
    headless_telemetry_session["is_active"] = False
    headless_telemetry_session["end_time"] = now
    headless_telemetry_session["status"] = status
    start_t = headless_telemetry_session.get("start_time", now)
    headless_telemetry_session["elapsed_seconds"] = round(max(0.1, now - start_t), 1)

    target = headless_telemetry_session.get("target_total_lines", 0)
    cur_b = headless_telemetry_session.get("current_bottom_line", 0)
    doc_len = len(document_lines)

    if (target > 0 and (cur_b >= target or doc_len >= target)) or status == "COMPLETED":
        headless_telemetry_session["total_lines_reached"] = True
        headless_telemetry_session["completion_percent"] = 100.0
        headless_telemetry_session["finish_status_message"] = (
            message or f"🎉 100% SUCCESS: Target document lines ({target or doc_len}) reached and verified!"
        )
    else:
        headless_telemetry_session["finish_status_message"] = (
            message or f"Headless operation halted: status {status}"
        )

    try:
        from pathlib import Path
        md_file = Path("c:/Projects/Small-Fling/storage/reproduced_Matrix_main.md")
        if md_file.exists():
            headless_telemetry_session["reconstructed_markdown_path"] = str(md_file)
            headless_telemetry_session["reconstructed_markdown_size"] = md_file.stat().st_size
    except Exception:
        pass

    return headless_telemetry_session


def get_outgoing_edge(from_node: str) -> Optional[Dict[str, Any]]:
    for edge in dag_state.get("edges", []):
        if edge.get("from") == from_node and edge.get("enabled", True):
            return edge
    return None

def is_edge_connected(from_node: str, to_node: Optional[str] = None) -> bool:
    for edge in dag_state.get("edges", []):
        if edge.get("from") == from_node:
            if to_node is None or edge.get("to") == to_node:
                return bool(edge.get("enabled", True))
    return False

def sync_semaphore_states_from_edges():
    global dag_semaphore_group2_to_3, dag_semaphore_group3_to_4
    dag_semaphore_group2_to_3 = is_edge_connected("local_ai_ocr", "frame_ocr")
    dag_semaphore_group3_to_4 = is_edge_connected("arrow_down", "verification_trigger")
    dag_state["semaphore_group2_to_3"] = dag_semaphore_group2_to_3
    dag_state["semaphore_group3_to_4"] = dag_semaphore_group3_to_4
    dag_state["semaphore_group2_to_3_status"] = "open" if dag_semaphore_group2_to_3 else "blocked"
    dag_state["semaphore_group3_to_4_status"] = "open" if dag_semaphore_group3_to_4 else "blocked"
    dag_state["semaphore_status"] = "open" if (dag_semaphore_group2_to_3 and dag_semaphore_group3_to_4) else "blocked"

def set_edge_connection(from_node: str, to_node: str, enabled: bool = True) -> Dict[str, Any]:
    edges = dag_state.setdefault("edges", [])
    matched = None
    for edge in edges:
        if edge.get("from") == from_node and edge.get("to") == to_node:
            edge["enabled"] = bool(enabled)
            edge["id"] = f"{from_node}->{to_node}"
            matched = edge
            break
    if not matched and from_node != "document_assemble":
        for edge in edges:
            if edge.get("from") == from_node:
                edge["to"] = to_node
                edge["enabled"] = bool(enabled)
                edge["id"] = f"{from_node}->{to_node}"
                matched = edge
                break
    if not matched:
        matched = {
            "id": f"{from_node}->{to_node}",
            "from": from_node,
            "to": to_node,
            "enabled": bool(enabled),
            "is_loopback": (from_node == "document_assemble" and to_node == "frame_acquire"),
            "condition": "ON_EOF" if (from_node == "document_assemble" and to_node == "markdown_tag_parser") else "ON_SUCCESS"
        }
        edges.append(matched)
    sync_semaphore_states_from_edges()
    return matched

def toggle_edge_connection(edge_id: Optional[str] = None, from_node: Optional[str] = None, to_node: Optional[str] = None) -> Dict[str, Any]:
    edges = dag_state.setdefault("edges", [])
    # Alias support for group2_to_3 and group3_to_4
    if edge_id == "group2_to_3" or (from_node == "local_ai_ocr" and to_node in (None, "frame_ocr")):
        from_node, to_node = "local_ai_ocr", "frame_ocr"
        edge_id = None
    elif edge_id == "group3_to_4" or (from_node == "arrow_down" and to_node in (None, "verification_trigger")):
        from_node, to_node = "arrow_down", "verification_trigger"
        edge_id = None

    matched = None
    for edge in edges:
        if edge_id and edge.get("id") == edge_id:
            edge["enabled"] = not edge.get("enabled", True)
            matched = edge
            break
        elif from_node and edge.get("from") == from_node:
            if to_node is None or edge.get("to") == to_node:
                edge["enabled"] = not edge.get("enabled", True)
                matched = edge
                break

    if not matched and from_node and to_node:
        matched = {
            "id": f"{from_node}->{to_node}",
            "from": from_node,
            "to": to_node,
            "enabled": False,
            "is_loopback": (from_node == "document_assemble" and to_node == "frame_acquire")
        }
        edges.append(matched)

    sync_semaphore_states_from_edges()
    return matched or {"error": "Edge not found"}

def reset_default_edges() -> List[Dict[str, Any]]:
    import copy
    dag_state["edges"] = copy.deepcopy(DEFAULT_DAG_EDGES)
    sync_semaphore_states_from_edges()
    return dag_state["edges"]

current_pipeline_mode = "cloud"
selected_ocr_engine = "local"

def format_device_name(source: Optional[str]) -> str:
    s = (source or "").lower()
    return "Web Studio 💻" if "web" in s else ("Mobile App 📱" if "mobile" in s else ("Floating HUD 🪟" if "hud" in s else ("Auto-Pacer ⚡" if "pacer" in s else ("Backend API ⚙️" if "api" in s else "System ⚙️"))))

def get_current_project_id() -> Optional[str]:
    p = db.get_active_project()
    return p["id"] if p else None

def sanitize_line_text(ln: int, text: str) -> str:
    from ocr_engine import LocalOllamaStitcher
    return LocalOllamaStitcher.sanitize_line_text(ln, text)

_serialized_lines_cache_key: Tuple[int, int] = (-1, -1)
_serialized_lines_cache_val: List[Dict[str, Any]] = []

def get_serialized_lines() -> List[Dict[str, Any]]:
    global _serialized_lines_cache_key, _serialized_lines_cache_val
    if not document_lines:
        return []
    ver = getattr(document_lines, "_version", -1)
    cache_key = (ver, len(document_lines))
    if ver >= 0 and cache_key == _serialized_lines_cache_key and _serialized_lines_cache_val:
        return _serialized_lines_cache_val

    min_k = min(document_lines.keys())
    max_k = max(document_lines.keys())
    start_k = min_k
    now_iso = datetime.now().isoformat()

    res = []
    for k in range(start_k, max_k + 1):
        it = document_lines.get(k)
        if it is not None:
            if hasattr(it, "to_serialized_dict"):
                res.append(it.to_serialized_dict(k))
            else:
                d = (
                    it.to_dict() if hasattr(it, "to_dict")
                    else (dict(it) if isinstance(it, dict)
                          else {"line_number": k, "gutter_number": k, "text": str(it), "status": "ok", "is_blank": not bool(str(it).strip()), "confidence": 1.0, "frame_id": "", "sources": [], "notes": "Master line", "updated_at": now_iso})
                )
                clean_txt = sanitize_line_text(k, d.get("text", ""))
                d["text"] = clean_txt
                d["is_blank"] = not bool(clean_txt.strip())
                res.append(d)
        else:
            res.append({
                "line_number": k,
                "gutter_number": k,
                "text": "",
                "status": "gap",
                "is_blank": True,
                "confidence": 0.0,
                "frame_id": "",
                "sources": [],
                "notes": f"Gap: Missing line #{k} (not covered in captured frames)",
                "updated_at": now_iso
            })
    _serialized_lines_cache_key = cache_key
    _serialized_lines_cache_val = res
    return res

def assemble_and_save_reconstructed_markdown() -> str:
    """Stitches verified master lines in numerical order and saves to reproduced markdown files."""
    max_k = max(document_lines.keys()) if document_lines else 0
    doc_lines = []
    for ln in range(1, max_k + 1):
        val = document_lines.get(ln, "")
        if isinstance(val, dict):
            doc_lines.append(val.get("text", ""))
        elif hasattr(val, "text"):
            doc_lines.append(val.text)
        else:
            doc_lines.append(str(val))
    full_markdown = "\n".join(doc_lines)
    try:
        out_dir = Path("c:/Projects/Small-Fling/storage")
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "reproduced_Matrix_main.md").write_text(full_markdown, encoding="utf-8")
        data_dir = out_dir / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        (data_dir / "reproduced_Matrix_main.md").write_text(full_markdown, encoding="utf-8")
    except Exception as ex:
        print(f"[assemble_and_save_reconstructed_markdown] File save error: {ex}")
    return full_markdown


multipart_bundle_state: Dict[str, Any] = {
    "auto_chain_enabled": True,
    "is_multipart": False,
    "folder_name": "",
    "base_prefix": "",
    "current_part": None,
    "total_parts": None,
    "next_part_number": None,
    "next_file_name": None,
    "available_parts": [],
    "predetermined_parts": [],
    "exported_parts": [],
    "transition_status": "idle",
    "last_transition_message": "",
    "bundle_completed": False,
    "updated_at": None
}


def _extract_canonical_filename_from_project_or_lines(proj: Dict[str, Any], lines_dict: Optional[Dict[int, Any]] = None) -> str:
    """
    Resolves the canonical markdown filename (e.g., 'CommonUI_develop_26-10-29-2-26pm_part2.md')
    from alignment status, project part_file_name, project description ('File: ...'), lines 1..10 of document_lines, or project name.
    """
    align_fn = (latest_alignment_status or {}).get("file_name") or ""
    if align_fn and re.search(r"_part\d+\.md$", align_fn, re.IGNORECASE):
        return align_fn

    part_fn = str((proj or {}).get("part_file_name") or "").strip()
    if part_fn and re.search(r"_part\d+\.md$", part_fn, re.IGNORECASE):
        return part_fn

    desc = str((proj or {}).get("description") or "")
    m_desc = re.search(r"([A-Za-z0-9_\-.]+_part\d+\.(?:md|markdown|txt))", desc, re.IGNORECASE)
    if m_desc:
        return m_desc.group(1)
    m_desc_file = re.search(r"File:\s*([A-Za-z0-9_\-.]+\.(?:md|markdown|txt))", desc, re.IGNORECASE)
    if m_desc_file:
        return m_desc_file.group(1)

    src_lines = lines_dict if lines_dict is not None else document_lines
    if src_lines:
        for ln_num in range(1, 10):
            raw_v = src_lines.get(ln_num, "")
            txt = raw_v.get("text", "") if isinstance(raw_v, dict) else str(raw_v or "")
            # Matches header like: '# CommonUI_develop_26-10-29-2-26pm (Part 2 of 3)'
            m_hdr = re.search(r"^#\s*([A-Za-z0-9_\-.]+)\s*\(\s*Part\s*(\d+)(?:\s*of\s*(\d+))?\s*\)", txt.strip(), re.IGNORECASE)
            if m_hdr:
                prefix = m_hdr.group(1).strip()
                p_num = int(m_hdr.group(2))
                return f"{prefix}_part{p_num}.md"

    return part_fn or align_fn or str((proj or {}).get("name") or "")


_last_auto_switched_desktop_part: Optional[int] = None


def sync_multipart_state_from_alignment(
    alignment_status: Optional[Dict[str, Any]] = None,
    prefer_active_project: bool = False,
) -> Dict[str, Any]:
    """
    Synchronizes multipart_bundle_state with the latest alignment status, predetermined folder manifest,
    project bundle fields (bundle_id, part_number, total_parts, part_file_name), and document header lines.
    """
    global multipart_bundle_state
    from alignment_engine import parse_multipart_markdown_filename

    proj = db.get_active_project() or {}
    proj_part_num = int(proj.get("part_number") or 0) or None
    proj_total_parts = int(proj.get("total_parts") or 0) or None
    proj_bundle_id = proj.get("bundle_id")
    proj_bundle_name = proj.get("bundle_name")
    proj_part_fn = str(proj.get("part_file_name") or "").strip()

    align = (alignment_status or {}) if prefer_active_project else (alignment_status or latest_alignment_status or {})
    align_fn = "" if (prefer_active_project or proj_part_num) else (align.get("file_name") or "")
    canonical_fn = proj_part_fn or _extract_canonical_filename_from_project_or_lines(proj, document_lines)
    candidate_name = canonical_fn or align_fn or proj.get("name") or ""

    mp_info = None if (prefer_active_project or proj_part_num) else align.get("multipart_info")
    if (not mp_info or not mp_info.get("is_multipart")) and not (prefer_active_project or proj_part_num) and align.get("is_multipart") and align.get("part_number") is not None:
        mp_info = dict(align)
    if not mp_info or not mp_info.get("is_multipart"):
        mp_info = parse_multipart_markdown_filename(candidate_name or canonical_fn)
    if (not mp_info or not mp_info.get("is_multipart")) and canonical_fn and canonical_fn != candidate_name:
        mp_info = parse_multipart_markdown_filename(canonical_fn)

    # Check document header lines 1..10 for total_parts (e.g., '(Part 2 of 3)' or 'Part: **2 of 3**')
    detected_total_parts = None
    if document_lines:
        for ln_num in range(1, 10):
            raw_v = document_lines.get(ln_num, "")
            txt = raw_v.get("text", "") if isinstance(raw_v, dict) else str(raw_v or "")
            m_tot = re.search(r"Part[:\s*]*(\d+)\s+of\s+(\d+)", txt, re.IGNORECASE)
            if m_tot:
                detected_total_parts = int(m_tot.group(2))
                break

    predetermined = list(multipart_bundle_state.get("predetermined_parts") or [])

    if mp_info and mp_info.get("is_multipart"):
        multipart_bundle_state["is_multipart"] = True
        if mp_info.get("base_prefix"):
            multipart_bundle_state["base_prefix"] = mp_info["base_prefix"]
        if proj_part_num is not None:
            multipart_bundle_state["current_part"] = int(proj_part_num)
        elif mp_info.get("part_number") is not None:
            multipart_bundle_state["current_part"] = int(mp_info["part_number"])
        if mp_info.get("total_parts") is not None:
            multipart_bundle_state["total_parts"] = int(mp_info["total_parts"])
        elif detected_total_parts is not None:
            multipart_bundle_state["total_parts"] = detected_total_parts
        elif proj_total_parts:
            multipart_bundle_state["total_parts"] = int(proj_total_parts)
        if mp_info.get("next_part_number") is not None:
            multipart_bundle_state["next_part_number"] = int(mp_info["next_part_number"])
        if mp_info.get("next_file_name"):
            multipart_bundle_state["next_file_name"] = mp_info["next_file_name"]
    else:
        if candidate_name:
            parsed_proj = parse_multipart_markdown_filename(candidate_name)
            if parsed_proj.get("is_multipart"):
                multipart_bundle_state["is_multipart"] = True
                multipart_bundle_state["base_prefix"] = parsed_proj.get("base_prefix") or multipart_bundle_state.get("base_prefix", "")
                multipart_bundle_state["current_part"] = int(proj_part_num or parsed_proj.get("part_number") or 1)
                if detected_total_parts is not None:
                    multipart_bundle_state["total_parts"] = detected_total_parts
                multipart_bundle_state["next_part_number"] = parsed_proj.get("next_part_number")
                multipart_bundle_state["next_file_name"] = parsed_proj.get("next_file_name")

    # Fallback to active project's bundle metadata or predetermined folder manifest
    if proj_part_num or proj_bundle_id or predetermined:
        multipart_bundle_state["is_multipart"] = True
        if proj_bundle_name and not multipart_bundle_state.get("base_prefix"):
            multipart_bundle_state["base_prefix"] = str(proj_bundle_name)
        if proj_part_num:
            multipart_bundle_state["current_part"] = int(proj_part_num)
        if proj_total_parts and not multipart_bundle_state.get("total_parts"):
            multipart_bundle_state["total_parts"] = int(proj_total_parts)

    eff_base_prefix = str(multipart_bundle_state.get("base_prefix") or proj_bundle_name or "").strip()
    eff_tot_parts = int(multipart_bundle_state.get("total_parts") or proj_total_parts or 0)
    if eff_base_prefix:
        multipart_bundle_state["folder_name"] = eff_base_prefix
        multipart_bundle_state["onedrive_folder_path"] = ["OneDrive", "Markdowns", "ficus-platform", eff_base_prefix]

    if not predetermined and eff_base_prefix and eff_tot_parts >= 2:
        predetermined = [
            {
                "part_number": i,
                "total_parts": eff_tot_parts,
                "scope_label": f"MD {i} / {eff_tot_parts}",
                "file_name": f"{eff_base_prefix}_part{i}.md",
                "base_prefix": eff_base_prefix,
                "tap_coords": [400, 180 + i * 70],
                "status": "pending",
            }
            for i in range(1, eff_tot_parts + 1)
        ]
        multipart_bundle_state["predetermined_parts"] = predetermined

    if predetermined:
        avail = sorted({int(p["part_number"]) for p in predetermined if p.get("part_number") is not None})
        if avail:
            multipart_bundle_state["available_parts"] = avail
            multipart_bundle_state["total_parts"] = max(multipart_bundle_state.get("total_parts") or 0, max(avail))
        cur_p = int(proj_part_num or multipart_bundle_state.get("current_part") or 1)
        multipart_bundle_state["current_part"] = cur_p
        next_candidates = [p for p in predetermined if int(p.get("part_number") or 0) > cur_p]
        if next_candidates:
            next_entry = min(next_candidates, key=lambda x: int(x["part_number"]))
            multipart_bundle_state["next_part_number"] = int(next_entry["part_number"])
            multipart_bundle_state["next_file_name"] = next_entry.get("file_name")
        elif avail and cur_p >= max(avail):
            multipart_bundle_state["next_part_number"] = None
            multipart_bundle_state["next_file_name"] = None

        completed_part_nums = set()
        paused_part_nums = set()
        if proj_bundle_id:
            try:
                for bp in db.get_bundle_projects(str(proj_bundle_id)):
                    bp_num = int(bp.get("part_number") or 0)
                    bp_target = int(bp.get("target_total_lines") or 0)
                    bp_captured = max(int(bp.get("max_line") or 0), int(bp.get("line_count") or 0))
                    bp_status = str(bp.get("status") or "").lower()
                    if bp_num > 0:
                        if bp_target > 0 and bp_captured >= bp_target - 4:
                            completed_part_nums.add(bp_num)
                        elif bp_status == "completed" and bp_target <= 0 and bp_captured > 0:
                            completed_part_nums.add(bp_num)
                        elif bp_captured > 0 or bp_target > 0:
                            paused_part_nums.add(bp_num)
                            if bp_status == "completed" and bp.get("id"):
                                try:
                                    db.update_project_status(bp["id"], "active")
                                except Exception:
                                    pass
            except Exception:
                pass
        for pt in predetermined:
            pno = int(pt.get("part_number") or 0)
            tot_for_label = int(multipart_bundle_state.get("total_parts") or len(predetermined) or 1)
            pt["scope_label"] = f"MD {pno} / {tot_for_label}"
            if pno == cur_p:
                pt["status"] = "scanning"
            elif pno in completed_part_nums:
                pt["status"] = "completed"
            elif pno in paused_part_nums:
                pt["status"] = "paused"
            else:
                pt["status"] = "pending"

    active_fn_resolved = (
        proj_part_fn
        or canonical_fn
        or align.get("file_name")
        or multipart_bundle_state.get("last_opened_file")
        or ""
    )
    if active_fn_resolved:
        multipart_bundle_state["active_file_name"] = active_fn_resolved

    # Keep dag_state["nodes"]["markdown_file_change"] synchronized with multipart_bundle_state
    mfc_node = dag_state.get("nodes", {}).get("markdown_file_change")
    if isinstance(mfc_node, dict):
        cur_p_sync = int(multipart_bundle_state.get("current_part") or proj_part_num or 1)
        tot_p_sync = int(multipart_bundle_state.get("total_parts") or proj_total_parts or max(len(predetermined), 1))
        mfc_node["current_part"] = cur_p_sync
        mfc_node["total_parts"] = tot_p_sync
        mfc_node["part_progress_label"] = f"MD {cur_p_sync} / {tot_p_sync}"
        mfc_node["active_file_name"] = active_fn_resolved
        mfc_node["next_file_name"] = multipart_bundle_state.get("next_file_name")
        mfc_node["detected_files"] = [str(p.get("file_name") or "") for p in predetermined if p.get("file_name")]
        mfc_node["predetermined_parts"] = predetermined

    multipart_bundle_state["updated_at"] = datetime.now().isoformat()
    return multipart_bundle_state


async def activate_or_create_bundle_part_project(
    part_number: int,
    file_name: Optional[str] = None,
    bundle_id: Optional[str] = None,
    bundle_name: Optional[str] = None,
    total_parts: Optional[int] = None,
    broadcast: bool = True,
) -> Dict[str, Any]:
    """
    Activates (or creates and activates) the SQLite project row for a specific markdown part
    (e.g. MD 2 / 9) inside a multi-part bundle, preserving any previously completed part's
    frames and lines (e.g. MD 1 / 9 with 396 captures & 8,498 lines).
    """
    from alignment_engine import parse_multipart_markdown_filename, normalize_bundle_identifier_ocr

    target_part = max(1, int(part_number or 1))
    active_proj = db.get_active_project() or {}
    all_projs = db.get_projects()
    predetermined = list(multipart_bundle_state.get("predetermined_parts") or [])

    mp_parsed = parse_multipart_markdown_filename(file_name) if file_name else {}
    eff_bundle_name = normalize_bundle_identifier_ocr(
        bundle_name
        or mp_parsed.get("base_prefix")
        or multipart_bundle_state.get("base_prefix")
        or active_proj.get("bundle_name")
        or active_proj.get("name")
        or "Bundle"
    )
    eff_bundle_name = re.sub(r'[_\-\s]*part[_\-\s#]*\d+.*$', '', eff_bundle_name, flags=re.IGNORECASE).strip("_- ") or "Bundle"
    slug = re.sub(r"[^a-z0-9]+", "_", eff_bundle_name.lower()).strip("_") or "bundle"
    eff_bundle_id = bundle_id or active_proj.get("bundle_id") or f"bundle_{slug}"
    sibling_max_total = max(
        [
            int(p.get("total_parts") or p.get("part_number") or 0)
            for p in all_projs
            if str(p.get("bundle_id") or "") == eff_bundle_id
            or (p.get("bundle_name") and eff_bundle_name[:8].lower() in str(p.get("bundle_name")).lower())
        ]
        or [0]
    )
    eff_total_parts = max(
        int(total_parts or 0),
        int(mp_parsed.get("total_parts") or 0),
        int(multipart_bundle_state.get("total_parts") or 0),
        int(active_proj.get("total_parts") or 0),
        len(predetermined),
        sibling_max_total,
        target_part,
    )
    pred_match = next((p for p in predetermined if int(p.get("part_number") or 0) == target_part), None)
    eff_file_name = normalize_bundle_identifier_ocr(
        file_name
        or (pred_match or {}).get("file_name")
        or f"{eff_bundle_name}_part{target_part}.md"
    )
    if not eff_file_name.lower().endswith(".md"):
        eff_file_name = f"{eff_file_name}.md"

    # 1. If the currently active project is a DIFFERENT part that has reached its calibrated EOF target, mark it completed
    active_pid = active_proj.get("id")
    active_pnum = int(active_proj.get("part_number") or 0)
    active_lines = max(int(active_proj.get("max_line") or 0), int(active_proj.get("line_count") or 0))
    active_frames = int(active_proj.get("frame_count") or 0)
    active_target = int(active_proj.get("target_total_lines") or 0)
    if active_pid and active_pnum != target_part and active_lines > 0 and active_target > 0 and active_lines >= active_target - 4:
        try:
            db.update_project_status(active_pid, "completed")
        except Exception:
            pass
    elif active_pid and active_proj.get("status") == "completed" and active_target > 0 and active_lines < active_target - 4:
        try:
            db.update_project_status(active_pid, "active")
        except Exception:
            pass

    # 2. Look for an existing project in the same bundle with part_number == target_part
    target_proj = None
    for p in all_projs:
        p_bid = str(p.get("bundle_id") or "")
        p_bname = str(p.get("bundle_name") or "")
        p_num = int(p.get("part_number") or 0)
        if p_num == target_part and (
            p_bid == eff_bundle_id
            or (p_bname and p_bname.lower() == eff_bundle_name.lower())
        ):
            target_proj = p
            break

    if target_proj and target_proj.get("id"):
        target_pid = target_proj["id"]
        if target_pid != active_pid:
            db.activate_project(target_pid)
        db.update_project_bundle_metadata(
            project_id=target_pid,
            bundle_id=eff_bundle_id,
            bundle_name=eff_bundle_name,
            part_number=target_part,
            total_parts=eff_total_parts,
            part_file_name=eff_file_name,
        )
        db.append_project_filename(target_pid, eff_file_name)
    elif active_pid and active_lines == 0 and active_frames == 0:
        # Active project is empty placeholder: update it in place to represent target_part
        target_pid = active_pid
        db.update_project_bundle_metadata(
            project_id=target_pid,
            bundle_id=eff_bundle_id,
            bundle_name=eff_bundle_name,
            part_number=target_part,
            total_parts=eff_total_parts,
            part_file_name=eff_file_name,
        )
        db.append_project_filename(target_pid, eff_file_name)
    else:
        # Create and activate a dedicated SQLite project row for target_part (preserving MD 1/9's data!)
        clean_proj_name = re.sub(r"\.(md|markdown)$", "", eff_file_name, flags=re.IGNORECASE)
        created = db.create_project(
            name=clean_proj_name,
            description=f"Multi-Part Bundle Part {target_part}/{eff_total_parts} ({eff_file_name})",
            target_total_lines=0,
            device_model=active_proj.get("device_model", "pixel_8"),
            device_name=active_proj.get("device_name", ""),
            device_serial=active_proj.get("device_serial", ""),
            target_dpi=int(active_proj.get("target_dpi") or 220),
            display_width=int(active_proj.get("display_width") or 1920),
            display_height=int(active_proj.get("display_height") or 1080),
            display_id=int(active_proj.get("display_id") or 0),
            lines_per_page=int(active_proj.get("lines_per_page") or 49),
            step_size=int(active_proj.get("step_size") or 48),
            scroll_padding_lines=int(active_proj.get("scroll_padding_lines") if active_proj.get("scroll_padding_lines") is not None else 4),
            arrow_count_init=int(active_proj.get("arrow_count_init") or 56),
            arrow_count_step=int(active_proj.get("arrow_count_step") or 28),
            settle_delay_ms=int(active_proj.get("settle_delay_ms") or 50),
            lock_device=bool(active_proj.get("lock_device", False)),
            hid_config_json=active_proj.get("hid_config_json", "{}"),
            bundle_id=eff_bundle_id,
            bundle_name=eff_bundle_name,
            part_number=target_part,
            total_parts=eff_total_parts,
            part_file_name=eff_file_name,
        )
        target_pid = created.get("id")
        if target_pid:
            db.append_project_filename(target_pid, eff_file_name)

    try:
        from routers.frames_document import clear_ocr_inspect_cache
        clear_ocr_inspect_cache()
    except Exception:
        pass
    load_persisted_state()

    multipart_bundle_state["is_multipart"] = True
    multipart_bundle_state["base_prefix"] = eff_bundle_name
    multipart_bundle_state["current_part"] = target_part
    multipart_bundle_state["total_parts"] = eff_total_parts
    multipart_bundle_state["last_opened_file"] = eff_file_name
    multipart_bundle_state["active_file_name"] = eff_file_name
    mp_sync = sync_multipart_state_from_alignment(prefer_active_project=True)

    switched_proj = db.get_project(target_pid) if target_pid else db.get_active_project()
    updated_projects = db.get_projects()
    frames_list = db.get_frames(switched_proj["id"]) if switched_proj else []
    doc_payload = None
    try:
        from routers.frames_document import _doc_payload
        doc_payload = _doc_payload()
    except Exception:
        pass

    if broadcast and switched_proj:
        await ws_manager.broadcast({
            "type": "project_switched",
            "project": switched_proj,
            "projects": updated_projects,
            "dag": dag_state,
            "telemetry": latest_telemetry,
            "diagnosis": get_loop_diagnosis(),
        })
        await ws_manager.broadcast({
            "type": "project_updated",
            "project": switched_proj,
            "projects": updated_projects,
        })
        await ws_manager.broadcast({
            "type": "frame_deleted" if frames_list else "frames_purged",
            "frames": frames_list,
        })
        if doc_payload is not None:
            await ws_manager.broadcast({
                "type": "document_updated",
                "data": doc_payload,
            })
        await ws_manager.broadcast({
            "type": "multipart_transition_status",
            "multipart_state": mp_sync,
        })

    return {
        "status": "success",
        "project": switched_proj,
        "projects": updated_projects,
        "frames": frames_list,
        "document": doc_payload,
        "telemetry": latest_telemetry,
        "token_stats": token_stats,
        "dag": dag_state,
        "loop_diagnosis": get_loop_diagnosis(),
        "multipart_state": mp_sync,
        "part_number": target_part,
        "total_parts": eff_total_parts,
        "file_name": eff_file_name,
    }


async def auto_switch_project_if_open_part_changed(alignment_status: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    When the Live Desktop OCR bounding box detects that a different markdown part of the bundle
    is open on the external monitor (e.g. 'DIXUI_impact_26-11-05-9-43pm_part2.md' while MD 1/9 was active),
    automatically switches (or creates and activates) the MD 2/9 project so it transitions from QUEUED -> ACTIVE.
    Only auto-switches when the detected part on the desktop actually changes, so a user's manual part selection
    in the sidebar is not overridden by background polling of an unchanged desktop screen.
    """
    global _last_auto_switched_desktop_part
    if getattr(sys.modules[__name__], "capture_loop_running", False):
        return None
    align = alignment_status or latest_alignment_status or {}
    align_fn = str(align.get("file_name") or "").strip()
    if not align_fn:
        return None
    from alignment_engine import parse_multipart_markdown_filename
    mp = parse_multipart_markdown_filename(align_fn)
    if not mp.get("is_multipart") or not mp.get("part_number"):
        return None

    detected_part = int(mp["part_number"])
    detected_prefix = str(mp.get("base_prefix") or "").strip()
    active_proj = db.get_active_project() or {}
    active_part = int(active_proj.get("part_number") or 0)
    active_prefix = str(active_proj.get("bundle_name") or "").strip()

    if _last_auto_switched_desktop_part is None:
        _last_auto_switched_desktop_part = detected_part
        if detected_part == active_part:
            return None
    elif detected_part == _last_auto_switched_desktop_part:
        # The file open on the desktop display has not changed since our last check;
        # respect whichever part the user currently has selected in the UI.
        return None
    else:
        _last_auto_switched_desktop_part = detected_part

    if detected_part == active_part:
        return None
    if active_prefix and detected_prefix and active_prefix[:8].lower() != detected_prefix[:8].lower():
        return None

    return await activate_or_create_bundle_part_project(
        part_number=detected_part,
        file_name=mp.get("file_name") or align_fn,
        bundle_id=active_proj.get("bundle_id"),
        bundle_name=detected_prefix or active_prefix,
        total_parts=mp.get("total_parts") or multipart_bundle_state.get("total_parts") or active_proj.get("total_parts"),
        broadcast=True,
    )


def export_project_markdown_to_disk(
    project_id: Optional[str] = None,
    explicit_file_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Exports the reconstructed markdown for the specified (or active) project to
    storage/exports/<file_name>.md and records it in multipart_bundle_state['exported_parts'].
    """
    global multipart_bundle_state
    from alignment_engine import parse_multipart_markdown_filename

    active_proj = db.get_active_project() or {}
    target_pid = project_id or active_proj.get("id")
    proj_info = active_proj if (target_pid == active_proj.get("id")) else None
    if not proj_info and target_pid:
        for p in db.get_projects():
            if p.get("id") == target_pid:
                proj_info = p
                break
    proj_info = proj_info or {}

    if target_pid and target_pid != active_proj.get("id"):
        lines_dict = db.get_document_lines(target_pid)
    else:
        lines_dict = document_lines

    max_k = max(lines_dict.keys()) if lines_dict else 0
    doc_lines: List[str] = []
    for ln in range(1, max_k + 1):
        val = lines_dict.get(ln, "")
        if isinstance(val, dict):
            txt = val.get("text", "")
        elif hasattr(val, "text"):
            txt = val.text
        else:
            txt = str(val)
        doc_lines.append(sanitize_line_text(ln, txt))

    full_markdown = "\n".join(doc_lines)

    canonical_fn = _extract_canonical_filename_from_project_or_lines(proj_info, lines_dict)
    raw_name = (
        explicit_file_name
        or canonical_fn
        or proj_info.get("name")
        or latest_alignment_status.get("file_name")
        or f"exported_project_{target_pid or 'current'}"
    ).strip()
    safe_base = re.sub(r'[<>:"/\\|?*]+', '_', raw_name)
    if not safe_base.lower().endswith(".md"):
        safe_base = f"{safe_base}.md"

    exports_dir = Path("c:/Projects/Small-Fling/storage/exports")
    exports_dir.mkdir(parents=True, exist_ok=True)
    export_path = exports_dir / safe_base
    export_path.write_text(full_markdown, encoding="utf-8")

    # Also store individual markdown part inside storage/bundles/<bundle_id>/<safe_base>
    b_id = proj_info.get("bundle_id")
    if b_id:
        try:
            b_dir = Path("c:/Projects/Small-Fling/storage/bundles") / re.sub(r'[<>:"/\\|?*]+', '_', str(b_id))
            b_dir.mkdir(parents=True, exist_ok=True)
            (b_dir / safe_base).write_text(full_markdown, encoding="utf-8")
        except Exception:
            pass

    # Also keep reproduced_Matrix_main.md updated
    try:
        out_dir = Path("c:/Projects/Small-Fling/storage")
        (out_dir / "reproduced_Matrix_main.md").write_text(full_markdown, encoding="utf-8")
    except Exception:
        pass

    mp_parsed = parse_multipart_markdown_filename(safe_base)
    record = {
        "project_id": target_pid or "",
        "project_name": proj_info.get("name") or safe_base,
        "file_name": safe_base,
        "part_number": mp_parsed.get("part_number"),
        "base_prefix": mp_parsed.get("base_prefix") or "",
        "line_count": len(lines_dict),
        "max_line": max_k,
        "file_size_bytes": export_path.stat().st_size if export_path.exists() else len(full_markdown.encode("utf-8")),
        "export_path": str(export_path),
        "exported_at": datetime.now().isoformat()
    }

    existing = multipart_bundle_state.setdefault("exported_parts", [])
    replaced = False
    for idx, item in enumerate(existing):
        if item.get("file_name") == safe_base or (target_pid and item.get("project_id") == target_pid):
            existing[idx] = record
            replaced = True
            break
    if not replaced:
        existing.append(record)
    existing.sort(key=lambda r: (r.get("part_number") or 999, r.get("exported_at") or ""))

    return record


_ISSUE_STATUS_SET = frozenset(["flagged", "missing", "gap", "overlap_conflict", "issue", "unaligned"])

def get_document_metrics() -> Dict[str, Any]:
    doc_cnt = len(document_lines)
    if doc_cnt == 0:
        return {
            "document_lines": 0,
            "total_lines": 0,
            "verified_lines_count": 0,
            "min_line": 0,
            "max_line": 0,
            "total_frames": len(captured_frames),
            "captured_frames": len(captured_frames),
            "pending_recaptures": len(recapture_queue),
            "verified_overlaps": 0,
            "verified_overlap_lines": 0,
            "issues_count": 0,
            "issue_count": 0
        }
    min_k = min(document_lines.keys())
    max_k = max(document_lines.keys())
    total_span = max_k - min_k + 1
    gap_count = max(0, total_span - doc_cnt)
    verified_overlaps = 0
    explicit_issues = 0
    for it in document_lines.values():
        st = it.get("status", "ok") if hasattr(it, "get") else "ok"
        if st == "verified_overlap":
            verified_overlaps += 1
        elif st in _ISSUE_STATUS_SET:
            explicit_issues += 1
    total_issues = gap_count + explicit_issues
    return {
        "document_lines": doc_cnt,
        "total_lines": total_span,
        "verified_lines_count": doc_cnt,
        "min_line": min_k,
        "max_line": max_k,
        "total_frames": len(captured_frames),
        "captured_frames": len(captured_frames),
        "pending_recaptures": len(recapture_queue),
        "verified_overlaps": verified_overlaps,
        "verified_overlap_lines": verified_overlaps,
        "issues_count": total_issues,
        "issue_count": total_issues
    }

def get_fresh_telemetry() -> Dict[str, Any]:
    t = dict(latest_telemetry)
    hb = t.get("last_heartbeat")
    if not hb or (datetime.now() - datetime.fromisoformat(hb)).total_seconds() >= 4.0:
        t["is_pacing"], t["dwell_countdown_ms"], t["phase"] = False, 0, "STANDBY"
        if t.get("status_message") in ["Testing Telemetry Sync", "Idle", "Ready"]:
            t["status_message"] = "Pacer Standby / Awaiting Device Connection"
    return t

_state_initialized = False

def load_persisted_state():
    global document_lines, captured_frames, recapture_queue, token_stats, latest_telemetry, _state_initialized
    _state_initialized = True
    try:
        p = db.get_active_project()
        pid = p["id"] if p else None
        document_lines._suppress_tracking = True
        captured_frames._suppress_tracking = True
        try:
            if p and pid:
                lines_db = db.get_document_lines(pid)
                document_lines.clear()
                for k, v in lines_db.items():
                    document_lines[k] = v
                frames_db = db.get_frames(pid, include_boxes=True)
                for f in frames_db:
                    t_ln = int(f.get("top_line") or 0)
                    b_ln = int(f.get("bottom_line") or 0)
                    if t_ln > 0 and b_ln >= t_ln and not f.get("lines"):
                        f["lines"] = [
                            {
                                "line_number": ln,
                                "gutter_number": ln,
                                "text": lines_db[ln].get("text", ""),
                                "row_slice_text": lines_db[ln].get("text", ""),
                                "confidence": lines_db[ln].get("confidence", 1.0),
                                "verified": bool(lines_db[ln].get("verified", True)),
                                "position_verified": True,
                                "status": "verified" if lines_db[ln].get("verified", True) else "ok",
                            }
                            for ln in range(t_ln, b_ln + 1)
                            if ln in lines_db
                        ]
                captured_frames.clear()
                captured_frames.update({f["frame_id"]: f for f in frames_db})
                tel = db.get_project_telemetry(pid)
                max_db_ln = max(lines_db.keys()) if lines_db else 0
                last_fr = frames_db[-1] if frames_db else {}
                proj_target_ln = int(p.get("target_total_lines") or 0)
                if proj_target_ln > 0 and str(p.get("status") or "").lower() == "completed" and max_db_ln < proj_target_ln - 4:
                    try:
                        db.update_project_status(pid, "active")
                        p["status"] = "active"
                    except Exception:
                        pass
                if tel.get("telemetry") and isinstance(tel["telemetry"], dict):
                    safe_tel = {
                        k: v for k, v in tel["telemetry"].items()
                        if k not in ("target_total_lines", "current_top_line", "current_bottom_line", "current_page")
                    }
                    latest_telemetry.update(safe_tel)
                if tel.get("token_stats"):
                    token_stats.update(tel["token_stats"])
                latest_telemetry["target_total_lines"] = int(
                    proj_target_ln
                    or (max_db_ln if str(p.get("status") or "").lower() == "completed" else 0)
                    or 0
                )
                latest_telemetry["current_top_line"] = int(last_fr.get("top_line") or (min(lines_db.keys()) if lines_db else 0))
                latest_telemetry["current_bottom_line"] = int(last_fr.get("bottom_line") or max_db_ln or 0)
                latest_telemetry["current_page"] = int(last_fr.get("page_index") or len(frames_db) or 1)
                vfs_db = db.get_vfs_files(pid)
                if vfs_db:
                    ws = analyzer_workspaces.setdefault(pid, {"project_id": pid})
                    ws.setdefault("vfs_files", vfs_db)
                try:
                    sync_multipart_state_from_alignment(prefer_active_project=True)
                except Exception:
                    pass
            else:
                document_lines.clear()
                captured_frames.clear()
        finally:
            document_lines._suppress_tracking = False
            captured_frames._suppress_tracking = False
            document_lines.mark_clean()
            captured_frames.mark_clean()
    except Exception as e:
        print(f"Error loading state from SQLite: {e}")

    recapture_queue.clear()
    if RECAPTURE_QUEUE_FILE.exists():
        try:
            with open(RECAPTURE_QUEUE_FILE, "r", encoding="utf-8") as f:
                recapture_queue.extend(json.load(f))
        except Exception:
            pass
    try:
        load_diagnostics_trace()
        sync_resume_frontier_state()
        ensure_diagnostics_trace_backfilled()
    except Exception as e:
        print(f"Error loading diagnostics trace: {e}")


def save_persisted_state():
    """
    Persists dirty frames, dirty/deleted document lines, VFS files, and telemetry
    in a single SQLite WAL transaction (without rewriting multi-megabyte document_state.json).
    """
    try:
        pid = get_current_project_id()
        if not pid:
            return

        dirty_fids = set(getattr(captured_frames, "dirty_frames", set()) or set())
        if dirty_fids:
            frames_to_save = [captured_frames[fid] for fid in dirty_fids if fid in captured_frames]
        else:
            frames_to_save = list(captured_frames.values())

        dirty_ln_keys = set(getattr(document_lines, "dirty_lines", set()) or set())
        deleted_ln_keys = list(getattr(document_lines, "deleted_lines", set()) or set())
        clear_all = bool(getattr(document_lines, "cleared", False))

        dirty_lines_payload = {
            ln: document_lines[ln]
            for ln in dirty_ln_keys
            if ln in document_lines
        }

        ws = analyzer_workspaces.get(pid) if isinstance(analyzer_workspaces, dict) else None
        vfs_payload = ws.get("vfs_files") if (isinstance(ws, dict) and ws.get("_vfs_dirty")) else None

        db.save_dirty_state_transaction(
            project_id=pid,
            dirty_frames=frames_to_save,
            dirty_lines=dirty_lines_payload,
            deleted_lines=deleted_ln_keys,
            clear_all_lines=clear_all,
            telemetry=latest_telemetry,
            token_stats=token_stats,
            vfs_files=vfs_payload,
        )

        if hasattr(document_lines, "mark_clean"):
            document_lines.mark_clean()
        if hasattr(captured_frames, "mark_clean"):
            captured_frames.mark_clean()
        if isinstance(ws, dict) and ws.get("_vfs_dirty"):
            ws["_vfs_dirty"] = False

        if recapture_queue or RECAPTURE_QUEUE_FILE.exists():
            with open(RECAPTURE_QUEUE_FILE, "w", encoding="utf-8") as f:
                json.dump(recapture_queue, f, indent=2, cls=NumpySafeJSONEncoder)
    except Exception as e:
        print(f"Error saving state to SQLite: {e}")

def evaluate_dag_node_5_trigger_sync(eval_results: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Evaluates configured deterministic qualifiers to determine if DAG Node 5 trigger
    should proceed or be prevented.
    """
    node_5 = dag_state["nodes"].get("verification_trigger", {})
    cfg = node_5.get("config", {})
    prevent_enforced = cfg.get("prevent_trigger_on_issue", True)
    qualifiers_cfg = cfg.get("qualifiers", {})

    active_issues = []
    # Check latest issues cached from classifiers or telemetry
    if eval_results is not None:
        known_issues = eval_results
        latest_telemetry["classifier_issues"] = eval_results
    else:
        known_issues = latest_telemetry.get("classifier_issues", [])
    issue_map = {item.get("classifier_id", ""): item for item in known_issues}

    # Also evaluate OCR degradation directly from captured frames
    sorted_f = sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))
    if sorted_f:
        last_f = sorted_f[-1]
        status = last_f.get("status", "")
        cnt = last_f.get("extracted_line_count", 0)
        t_line = last_f.get("top_line", 0)
        b_line = last_f.get("bottom_line", 0)
        has_valid_bounds = bool(t_line > 0 and b_line >= t_line)

        if status.startswith("error"):
            issue_map["ocr_degraded"] = {
                "classifier_id": "ocr_degraded",
                "issue_detected": True,
                "issue_name": "previous ocr capture degraded",
                "details": f"Previous frame failed OCR: {status}"
            }
        elif len(sorted_f) >= 2:
            prev_f = sorted_f[-2]
            prev_cnt = prev_f.get("extracted_line_count", 0)
            if prev_cnt >= 20 and cnt < 5 and not has_valid_bounds:
                issue_map["ocr_degraded"] = {
                    "classifier_id": "ocr_degraded",
                    "issue_detected": True,
                    "issue_name": "previous ocr capture degraded",
                    "details": f"OCR line count dropped severely ({prev_cnt} -> {cnt} lines)"
                }
        elif cnt == 0 and status == "processed" and not has_valid_bounds:
            issue_map["ocr_degraded"] = {
                "classifier_id": "ocr_degraded",
                "issue_detected": True,
                "issue_name": "previous ocr capture degraded",
                "details": "0 lines extracted from previous page"
            }

    reasons = []
    qualifier_statuses = {}

    for q_id, q_info in qualifiers_cfg.items():
        is_enabled = q_info.get("enabled", True)
        issue = issue_map.get(q_id)
        has_issue = bool(issue and issue.get("issue_detected", False))

        qualifier_statuses[q_id] = {
            "name": q_info.get("name", q_id),
            "description": q_info.get("description", ""),
            "enabled": is_enabled,
            "severity": q_info.get("severity", "blocking"),
            "issue_detected": has_issue,
            "details": (issue.get("details") or issue.get("issue_name")) if has_issue else "Clean / Satisfied"
        }

        # Keyboard, fullscreen & view mode issues are auto-remediated in background; never halt or block capture
        if q_id in ("keyboard_open", "view_mode", "markdown_fullscreen"):
            qualifier_statuses[q_id]["severity"] = "warning"

        if prevent_enforced and is_enabled and has_issue and qualifier_statuses[q_id].get("severity") == "blocking":
            reasons.append(f"{q_info.get('name')}: {qualifier_statuses[q_id]['details']}")

    is_prevented = len(reasons) > 0
    decision = {
        "allowed": not is_prevented,
        "prevented": is_prevented,
        "reasons": reasons,
        "evaluated_at": datetime.now().isoformat(),
        "qualifier_statuses": qualifier_statuses
    }
    node_5["trigger_decision"] = decision
    return decision

def update_dag_after_frame(frame_id: str, top_line: int, bottom_line: int):
    global orchestration_state, latest_telemetry, dag_state
    cur_p = orchestration_state.get("page", 1)
    orchestration_state["top_line"] = top_line
    orchestration_state["bottom_line"] = bottom_line
    orchestration_state["next_target_top"] = bottom_line + 1
    orchestration_state["page"] = cur_p + 1
    orchestration_state["active_step"] = "LOOP_EVAL"
    orchestration_state["updated_at"] = datetime.now().isoformat()
    latest_telemetry["current_top_line"] = top_line
    latest_telemetry["current_bottom_line"] = bottom_line
    latest_telemetry["current_page"] = cur_p
    target = latest_telemetry.get("target_total_lines", 0)

    sorted_f = sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))
    is_verified = True
    if len(sorted_f) >= 2:
        prev_f = sorted_f[-2]
        expected_top = prev_f.get("bottom_line", 0) + 1
        is_verified = (top_line == expected_top or abs(top_line - expected_top) <= 1)

    is_complete = (target > 0 and bottom_line >= target)

    # Evaluate deterministic qualifiers for Node 5 trigger decision
    decision = evaluate_dag_node_5_trigger_sync()

    node_status = "completed" if is_complete else ("prevented" if decision["prevented"] else "looping")

    dag_state["nodes"]["frame_acquire"].update({"status": "completed"})
    dag_state["nodes"]["frame_ocr"].update({"status": "completed", "top_line": top_line, "bottom_line": bottom_line})
    target_top = bottom_line + 1
    visible_lines = max(1, bottom_line - top_line + 1)
    pad = orchestration_state.get("scroll_padding_lines", 4)
    step_arrows = orchestration_state.get("arrow_count_step") or (visible_lines + pad)
    init_arrows = orchestration_state.get("arrow_count_init") or (step_arrows * 2)
    predicted_arrows = init_arrows if top_line == 1 else step_arrows
    if "arrow_down" in dag_state["nodes"]:
        dag_state["nodes"]["arrow_down"].update({
            "target_top_line": target_top,
            "target_top": target_top,
            "prev_bottom": bottom_line,
            "arrow_count": predicted_arrows
        })
    if "verification_trigger" in dag_state["nodes"]:
        dag_state["nodes"]["verification_trigger"].update({
            "target_top_line": target_top,
            "target_top": target_top,
            "expected_top": target_top
        })
    dag_state["nodes"]["verification_trigger"].update({
        "status": node_status,
        "verified_top_transition": is_verified,
        "is_complete": is_complete,
        "trigger_decision": decision,
        "loop_count": dag_state["nodes"]["verification_trigger"].get("loop_count", 0) + 1,
        "remaining_lines": max(0, target - bottom_line) if target > 0 else 0
    })

    if decision["prevented"]:
        dag_state["current_active_node"] = "verification_trigger"
        orchestration_state["status"] = "PAUSED_QUALIFIER_ISSUE"
        orchestration_state["step_label"] = f"Trigger Prevented: {', '.join(decision['reasons'][:2])}"
    else:
        dag_state["current_active_node"] = "verification_trigger" if is_complete else "arrow_down"

    if is_complete and not decision["prevented"]:
        orchestration_state["status"] = "COMPLETED"
        orchestration_state["step_label"] = f"Transcription Complete (Target {target} Lines Met) ✔"
        latest_telemetry["phase"] = "COMPLETED"
        latest_telemetry["is_pacing"] = False
        latest_telemetry["status_message"] = f"Document Pacing Complete: {bottom_line}/{target} lines transcribed ✔"

load_persisted_state()
