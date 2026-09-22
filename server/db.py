import sqlite3, json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional

DB_PATH = Path(__file__).parent / "data" / "matrix_capture.db"
DATA_DIR, FRAMES_DIR = Path(__file__).parent / "data", Path(__file__).parent / "data" / "frames"

def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True); FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
    conn.row_factory = sqlite3.Row; conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def _execute(sql: str, params: tuple = (), commit: bool = True, fetchone: bool = False, fetchall: bool = False):
    with get_connection() as conn:
        c = conn.cursor(); c.execute(sql, params)
        res = c.fetchone() if fetchone else (c.fetchall() if fetchall else c.rowcount)
        if commit: conn.commit()
        return res

def init_db():
    with get_connection() as conn:
        c = conn.cursor()
        c.executescript("""
        CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', target_total_lines INTEGER DEFAULT 0, status TEXT DEFAULT 'active', is_active INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS frames (frame_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, filename TEXT NOT NULL, top_line INTEGER NOT NULL, bottom_line INTEGER NOT NULL, page_index INTEGER NOT NULL, file_size INTEGER DEFAULT 0, status TEXT DEFAULT 'processed', extracted_line_count INTEGER DEFAULT 0, custom_offset_y REAL DEFAULT 0.0, token_usage_json TEXT DEFAULT '{}', bounding_boxes_json TEXT DEFAULT '{}', model_used TEXT DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS document_lines (project_id TEXT NOT NULL, line_number INTEGER NOT NULL, line_text TEXT NOT NULL, confidence REAL DEFAULT 1.0, frame_id TEXT DEFAULT '', is_verified INTEGER DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (project_id, line_number), FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS project_telemetry (project_id TEXT PRIMARY KEY, telemetry_json TEXT DEFAULT '{}', token_stats_json TEXT DEFAULT '{}', updated_at TEXT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE);
        """)
        # Clean up any legacy default project and orphaned frames
        c.execute("DELETE FROM projects WHERE id = 'proj_default';")
        conn.commit()

def get_active_project() -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        c = conn.cursor()
        for q in ["SELECT * FROM projects WHERE is_active = 1 LIMIT 1;", "SELECT * FROM projects ORDER BY created_at DESC LIMIT 1;"]:
            c.execute(q); row = c.fetchone()
            if row:
                if not row["is_active"]:
                    c.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (row["id"],))
                    conn.commit()
                return dict(row)
        return None

def get_projects() -> List[Dict[str, Any]]:
    sql = "SELECT p.*, COUNT(DISTINCT f.frame_id) as frame_count, COUNT(DISTINCT l.line_number) as line_count, MIN(l.line_number) as min_line, MAX(l.line_number) as max_line FROM projects p LEFT JOIN frames f ON p.id = f.project_id LEFT JOIN document_lines l ON p.id = l.project_id GROUP BY p.id ORDER BY p.created_at DESC;"
    return [dict(r) for r in _execute(sql, fetchall=True)]

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    sql = "SELECT p.*, COUNT(DISTINCT f.frame_id) as frame_count, COUNT(DISTINCT l.line_number) as line_count, MIN(l.line_number) as min_line, MAX(l.line_number) as max_line FROM projects p LEFT JOIN frames f ON p.id = f.project_id LEFT JOIN document_lines l ON p.id = l.project_id WHERE p.id = ? GROUP BY p.id;"
    r = _execute(sql, (project_id,), fetchone=True)
    return dict(r) if r else None

def create_project(name: str, description: str = "", target_total_lines: int = 0) -> Dict[str, Any]:
    now, pid = datetime.now().isoformat(), f"proj_{int(datetime.now().timestamp())}_{abs(hash(name)) % 10000}"
    with get_connection() as conn:
        c = conn.cursor(); c.execute("UPDATE projects SET is_active = 0;")
        c.execute("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?);", (pid, name.strip(), description.strip(), target_total_lines, "active", 1, now, now))
        c.execute("INSERT INTO project_telemetry VALUES (?, ?, ?, ?);", (pid, "{}", "{}", now))
        conn.commit()
    return get_project(pid) or {}

def activate_project(project_id: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor()
        if not c.execute("SELECT id FROM projects WHERE id = ?;", (project_id,)).fetchone(): return False
        c.execute("UPDATE projects SET is_active = 0;"); c.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (project_id,))
        conn.commit(); return True

def delete_project(project_id: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor(); row = c.execute("SELECT is_active FROM projects WHERE id = ?;", (project_id,)).fetchone()
        if not row: return False
        was_active = bool(row["is_active"])
        fns = [r["filename"] for r in c.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,)).fetchall()]
        c.execute("DELETE FROM projects WHERE id = ?;", (project_id,)); conn.commit()
        for fn in fns: (FRAMES_DIR / fn).unlink(missing_ok=True)
        if was_active:
            fb = c.execute("SELECT id FROM projects ORDER BY created_at DESC LIMIT 1;").fetchone()
            if fb: c.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (fb["id"],)); conn.commit()
        return True

def _purge_project_data(project_id: str, new_status: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor()
        if not c.execute("SELECT id FROM projects WHERE id = ?;", (project_id,)).fetchone(): return False
        fns = [r["filename"] for r in c.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,)).fetchall()]
        c.execute("DELETE FROM frames WHERE project_id = ?;", (project_id,)); c.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        now = datetime.now().isoformat()
        c.execute("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?;", (new_status, now, project_id))
        c.execute("UPDATE project_telemetry SET telemetry_json = '{}', updated_at = ? WHERE project_id = ?;", (now, project_id))
        conn.commit()
        for fn in fns: (FRAMES_DIR / fn).unlink(missing_ok=True)
        return True

def abort_project(project_id: str) -> bool: return _purge_project_data(project_id, "aborted")
def clear_project_data(project_id: str) -> bool: return _purge_project_data(project_id, "active")

def get_frames(project_id: Optional[str]) -> List[Dict[str, Any]]:
    if not project_id: return []
    rows = _execute("SELECT * FROM frames WHERE project_id = ? ORDER BY top_line ASC, page_index ASC, created_at ASC;", (project_id,), fetchall=True)
    res = []
    for r in rows:
        d = dict(r)
        for k, col in [("token_usage", "token_usage_json"), ("bounding_boxes", "bounding_boxes_json")]:
            try: d[k] = json.loads(d.get(col) or "{}")
            except Exception: d[k] = {}
        res.append(d)
    return res

def save_frame(project_id: str, frame_id: str, filename: str, top_line: int, bottom_line: int, page_index: int, file_size: int = 0, status: str = "processed", extracted_line_count: int = 0, custom_offset_y: float = 0.0, token_usage: Dict[str, Any] = None, bounding_boxes: Dict[str, Any] = None, model_used: str = "", created_at: str = None) -> Dict[str, Any]:
    now = created_at or datetime.now().isoformat()
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO frames VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);", (frame_id, project_id, filename, top_line, bottom_line, page_index, file_size, status, extracted_line_count, custom_offset_y, json.dumps(token_usage or {}), json.dumps(bounding_boxes or {}), model_used, now))
        c.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id)); conn.commit()
    return {"frame_id": frame_id, "project_id": project_id, "filename": filename, "top_line": top_line, "bottom_line": bottom_line, "page_index": page_index, "file_size": file_size, "status": status, "extracted_line_count": extracted_line_count, "custom_offset_y": custom_offset_y, "token_usage": token_usage or {}, "bounding_boxes": bounding_boxes or {}, "model_used": model_used, "created_at": now}

def update_frame_position(frame_id: str, custom_offset_y: float) -> bool:
    return _execute("UPDATE frames SET custom_offset_y = ? WHERE frame_id = ?;", (custom_offset_y, frame_id)) > 0

def delete_frame(frame_id: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor(); row = c.execute("SELECT filename FROM frames WHERE frame_id = ?;", (frame_id,)).fetchone()
        if not row: return False
        c.execute("DELETE FROM frames WHERE frame_id = ?;", (frame_id,)); c.execute("DELETE FROM document_lines WHERE frame_id = ?;", (frame_id,)); conn.commit()
        (FRAMES_DIR / row["filename"]).unlink(missing_ok=True); return True

def get_document_lines(project_id: Optional[str]) -> Dict[int, Dict[str, Any]]:
    if not project_id: return {}
    rows = _execute("SELECT * FROM document_lines WHERE project_id = ? ORDER BY line_number ASC;", (project_id,), fetchall=True)
    return {r["line_number"]: {"line_number": r["line_number"], "text": r["line_text"], "confidence": r["confidence"], "frame_id": r["frame_id"], "verified": bool(r["is_verified"]), "updated_at": r["updated_at"]} for r in rows}

def save_document_lines(project_id: str, lines: Dict[int, Dict[str, Any]]):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        c = conn.cursor()
        for lnum, ld in lines.items():
            c.execute("INSERT OR REPLACE INTO document_lines VALUES (?, ?, ?, ?, ?, ?, ?);", (project_id, lnum, ld.get("text", ""), ld.get("confidence", 1.0), ld.get("frame_id", ""), 1 if ld.get("verified", False) else 0, ld.get("updated_at", now)))
        c.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id)); conn.commit()

def save_document_line(project_id: str, line_number: int, text: str, confidence: float = 1.0, frame_id: str = "", verified: bool = False):
    now = datetime.now().isoformat()
    _execute("INSERT OR REPLACE INTO document_lines VALUES (?, ?, ?, ?, ?, ?, ?);", (project_id, line_number, text, confidence, frame_id, 1 if verified else 0, now))

def get_project_telemetry(project_id: Optional[str]) -> Dict[str, Any]:
    if not project_id: return {"telemetry": {}, "token_stats": {}}
    row = _execute("SELECT telemetry_json, token_stats_json FROM project_telemetry WHERE project_id = ?;", (project_id,), fetchone=True)
    if not row: return {"telemetry": {}, "token_stats": {}}
    try: tel = json.loads(row["telemetry_json"] or "{}")
    except Exception: tel = {}
    try: tok = json.loads(row["token_stats_json"] or "{}")
    except Exception: tok = {}
    return {"telemetry": tel, "token_stats": tok}

def save_project_telemetry(project_id: str, telemetry: Dict[str, Any], token_stats: Dict[str, Any]):
    _execute("INSERT OR REPLACE INTO project_telemetry VALUES (?, ?, ?, ?);", (project_id, json.dumps(telemetry or {}), json.dumps(token_stats or {}), datetime.now().isoformat()))
