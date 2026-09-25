import json
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import WebSocket
from concurrent.futures import ThreadPoolExecutor

import config
import db
from ocr_engine import LocalGutterOCREngine, worker_scan_image, worker_detect_last_line, worker_verify_first_line, worker_detect_top_line
import asyncio
from pathlib import Path
from typing import Tuple

FRAMES_DIR = config.FRAMES_DIR
DOCUMENT_FILE = config.DOCUMENT_FILE
RECAPTURE_QUEUE_FILE = config.RECAPTURE_QUEUE_FILE

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
        payload = json.dumps(message) if not isinstance(message, str) else message
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


async def detect_last_line_in_process(image_path: Path) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_detect_last_line, str(image_path))

async def verify_first_line_in_process(image_path: Path) -> Tuple[bool, int]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_verify_first_line, str(image_path))

async def detect_top_line_in_process(image_path: Path) -> int:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_detect_top_line, str(image_path))

async def scan_image_in_process(image_path: Path) -> Dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(ocr_executor, worker_scan_image, str(image_path), config.OLLAMA_URL, config.OLLAMA_VISION_MODEL, 15)

ocr_engine = LocalGutterOCREngine(
    ollama_url=config.OLLAMA_URL,
    ollama_vision_model=config.OLLAMA_VISION_MODEL,
    ollama_coder_model=config.OLLAMA_CODER_MODEL
)

class MasterLine(str):
    def __new__(cls, text: str = "", **meta):
        s = super().__new__(cls, str(text) if text is not None else "")
        s.meta = dict(meta)
        return s

    def get(self, key, default=None):
        if key == "text": return str(self)
        if key == "line_number": return self.meta.get("line_number", 0)
        return self.meta.get(key, default)

    def __getitem__(self, item):
        if isinstance(item, str):
            if item == "text": return str(self)
            return self.meta.get(item)
        return super().__getitem__(item)

    def update(self, d: dict):
        self.meta.update(d)

    def to_dict(self) -> dict:
        d = dict(self.meta)
        d["text"] = str(self)
        d.setdefault("line_number", 0)
        d.setdefault("status", "ok")
        return d

class MasterDocumentLines(dict):
    def __setitem__(self, key: int, value: Any):
        k = int(key)
        if isinstance(value, MasterLine):
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

document_lines: Dict[int, str] = MasterDocumentLines()
captured_frames: Dict[str, Dict[str, Any]] = {}
recapture_queue: List[Dict[str, Any]] = []

token_stats: Dict[str, Any] = {
    "total_prompt_tokens": 0, "total_candidates_tokens": 0, "total_tokens": 0, "total_api_calls": 0, "estimated_cost_usd": 0.0,
    "mobile_tokens": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
}

latest_telemetry: Dict[str, Any] = {
    "device_id": "idle", "is_pacing": False, "current_page": 0, "current_top_line": 0, "current_bottom_line": 0,
    "target_total_lines": config.TARGET_TOTAL_LINES, "dwell_countdown_ms": 0, "phase": "IDLE", "status_message": "Matrix Capture Studio ready",
    "last_heartbeat": None,
    "pacer_calibration": {"auto_tune_factor": config.PACER_AUTO_TUNE_FACTOR, "line_pitch_px": config.PACER_LINE_PITCH_PX, "bottom_to_top_error": 0, "wrapped_lines_detected": 0}
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

orchestration_state: Dict[str, Any] = {
    "status": "IDLE", "last_command": "NONE", "source": "system", "invoked_by": "System ⚙️", "active_step": "START_READY",
    "step_label": "Line 1 Start Position Set (Ready to Begin)", "top_line": 1, "bottom_line": 49, "next_target_top": 50, "page": 1,
    "device_model": "pixel_10", "lines_per_page": 49, "updated_at": datetime.now().isoformat()
}

dag_state: Dict[str, Any] = {
    "groups": {
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
            "title": "Capture Entire Markdown",
            "description": "Acquires pages, offloads to OCR worker, and steps down through markdown document",
            "nodes": ["frame_acquire", "arrow_down", "verification_trigger"],
            "status": "idle",
            "progress": None
        }
    },
    "nodes": {
        "init_end": {
            "id": "init_end",
            "group": "initialize",
            "title": "1. Determine Total Lines (Ctrl+End)",
            "description": "Send HID Ctrl+End, verify gutter position at EOF, display total lines by OCR of last line of EOF.",
            "status": "idle",
            "total_lines": 0,
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
            "description": "Screen capture and acquisition: offload to dedicated OCR worker process.",
            "status": "idle",
            "page": 1,
            "config": {
                "mode": "desktop",
                "ocr_worker_timeout_s": 15,
                "save_frame": True
            }
        },
        "arrow_down": {
            "id": "arrow_down",
            "group": "capture_entire_markdown",
            "title": "4. Intelligent Navigation (Down Arrow)",
            "description": "Determine line number for top gutter (last line of previous page + 1) and use keyboard down arrow to position on top.",
            "status": "idle",
            "arrow_count": 47,
            "config": {
                "step_mode": "auto",
                "step_count": 47,
                "key_delay_ms": 8
            }
        },
        "verification_trigger": {
            "id": "verification_trigger",
            "group": "capture_entire_markdown",
            "title": "5. Verify Trigger",
            "description": "Verify last line + 1 has been positioned to the top, then trigger DAG process flow.",
            "status": "idle",
            "loop_count": 0,
            "is_complete": False,
            "config": {
                "prevent_trigger_on_issue": True,
                "qualifiers": {
                    "modal_overlay": {
                        "name": "Modal Overlay Check",
                        "description": "Is a modal appearing over the teams markdown?",
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
                        "severity": "blocking"
                    },
                    "light_mode": {
                        "name": "Theme Qualifier",
                        "description": "Ensure editor is in dark mode (prevent light theme wash out)",
                        "enabled": False,
                        "severity": "warning"
                    },
                    "view_mode": {
                        "name": "Edit Mode Qualifier",
                        "description": "Ensure document is in edit mode with gutter line numbers visible",
                        "enabled": True,
                        "severity": "blocking"
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
        }
    },
    "edges": [
        {"from": "init_end", "to": "reset_home"},
        {"from": "reset_home", "to": "frame_acquire"},
        {"from": "frame_acquire", "to": "arrow_down"},
        {"from": "arrow_down", "to": "verification_trigger"},
        {"from": "verification_trigger", "to": "frame_acquire", "is_loopback": True}
    ],
    "current_active_node": "init_end"
}

current_pipeline_mode = "cloud"
selected_ocr_engine = "local"

def format_device_name(source: Optional[str]) -> str:
    s = (source or "").lower()
    return "Web Studio 💻" if "web" in s else ("Mobile App 📱" if "mobile" in s else ("Floating HUD 🪟" if "hud" in s else ("Auto-Pacer ⚡" if "pacer" in s else ("Backend API ⚙️" if "api" in s else "System ⚙️"))))

def get_current_project_id() -> Optional[str]:
    p = db.get_active_project()
    return p["id"] if p else None

def get_serialized_lines() -> List[Dict[str, Any]]:
    return [
        document_lines[k].to_dict() if hasattr(document_lines[k], "to_dict")
        else (document_lines[k] if isinstance(document_lines[k], dict)
              else {"line_number": k, "gutter_number": k, "text": str(document_lines[k]), "status": "ok", "is_blank": not bool(str(document_lines[k]).strip()), "confidence": 1.0, "frame_id": "", "sources": [], "notes": "Master line", "updated_at": datetime.now().isoformat()})
        for k in sorted(document_lines.keys())
    ]

def get_document_metrics() -> Dict[str, Any]:
    sl = get_serialized_lines()
    return {
        "document_lines": len(document_lines),
        "total_lines": len(document_lines),
        "min_line": min(document_lines.keys()) if document_lines else 0,
        "max_line": max(document_lines.keys()) if document_lines else 0,
        "total_frames": len(captured_frames),
        "captured_frames": len(captured_frames),
        "pending_recaptures": len(recapture_queue),
        "verified_overlaps": sum(1 for ln in sl if ln.get("status") == "verified_overlap"),
        "verified_overlap_lines": sum(1 for ln in sl if ln.get("status") == "verified_overlap"),
        "issues_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"]),
        "issue_count": sum(1 for ln in sl if ln.get("status") in ["flagged", "missing", "overlap_conflict"])
    }

def get_fresh_telemetry() -> Dict[str, Any]:
    t = dict(latest_telemetry)
    hb = t.get("last_heartbeat")
    if not hb or (datetime.now() - datetime.fromisoformat(hb)).total_seconds() >= 4.0:
        t["is_pacing"], t["dwell_countdown_ms"], t["phase"] = False, 0, "STANDBY"
        if t.get("status_message") in ["Testing Telemetry Sync", "Idle", "Ready"]:
            t["status_message"] = "Pacer Standby / Awaiting Device Connection"
    return t

def load_persisted_state():
    global document_lines, captured_frames, recapture_queue, token_stats, latest_telemetry
    try:
        p = db.get_active_project()
        if not p:
            document_lines.clear()
            captured_frames.clear()
            latest_telemetry["current_page"] = 0
            latest_telemetry["current_top_line"] = 0
            latest_telemetry["current_bottom_line"] = 0
            return
        pid = p["id"]
        lines_db = db.get_document_lines(pid)
        document_lines.clear()
        for k, v in lines_db.items(): document_lines[k] = v
        captured_frames = {f["frame_id"]: f for f in db.get_frames(pid)}
        tel = db.get_project_telemetry(pid)
        if tel.get("telemetry"): latest_telemetry.update(tel["telemetry"])
        if tel.get("token_stats"): token_stats.update(tel["token_stats"])
        if p.get("target_total_lines"): latest_telemetry["target_total_lines"] = p["target_total_lines"]
    except Exception as e:
        print(f"Error loading state from SQLite: {e}")

    if RECAPTURE_QUEUE_FILE.exists():
        try:
            with open(RECAPTURE_QUEUE_FILE, "r", encoding="utf-8") as f:
                recapture_queue.extend(json.load(f))
        except Exception:
            pass

def save_persisted_state():
    try:
        pid = get_current_project_id()
        if not pid:
            return
        for fid, f in captured_frames.items():
            db.save_frame(pid, fid, f.get("filename", f"{fid}.png"), f.get("top_line", 0), f.get("bottom_line", 0), f.get("page_index", 1), f.get("file_size", 0), f.get("status", "processed"), f.get("extracted_line_count", 0), f.get("custom_offset_y", 0.0), f.get("token_usage", {}), f.get("bounding_boxes", {}), f.get("model_used", ""), f.get("created_at"))
        db.save_document_lines(pid, document_lines)
        db.save_project_telemetry(pid, latest_telemetry, token_stats)
        with open(DOCUMENT_FILE, "w", encoding="utf-8") as f:
            json.dump({"lines": {str(k): v.to_dict() if hasattr(v, "to_dict") else (v if isinstance(v, dict) else {"text": str(v)}) for k, v in sorted(document_lines.items())}, "frames": captured_frames, "token_stats": token_stats, "latest_telemetry": latest_telemetry, "updated_at": datetime.now().isoformat()}, f, indent=2)
        with open(RECAPTURE_QUEUE_FILE, "w", encoding="utf-8") as f:
            json.dump(recapture_queue, f, indent=2)
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
    known_issues = eval_results or latest_telemetry.get("classifier_issues", [])
    issue_map = {item.get("classifier_id", ""): item for item in known_issues}

    # Also evaluate OCR degradation directly from captured frames
    sorted_f = sorted(captured_frames.values(), key=lambda x: (x.get("page_index", 0) or 0, x.get("created_at", "")))
    if sorted_f:
        last_f = sorted_f[-1]
        status = last_f.get("status", "")
        cnt = last_f.get("extracted_line_count", 0)
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
            if prev_cnt >= 20 and cnt < 5:
                issue_map["ocr_degraded"] = {
                    "classifier_id": "ocr_degraded",
                    "issue_detected": True,
                    "issue_name": "previous ocr capture degraded",
                    "details": f"OCR line count dropped severely ({prev_cnt} -> {cnt} lines)"
                }
        elif cnt == 0 and status == "processed":
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

        if prevent_enforced and is_enabled and has_issue:
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

    dag_state["nodes"]["frame_acquire"].update({"status": "completed", "top_line": top_line, "bottom_line": bottom_line})
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
