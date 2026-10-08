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
        CREATE TABLE IF NOT EXISTS device_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            display_name TEXT DEFAULT '',
            model_name TEXT DEFAULT '',
            manufacturer TEXT DEFAULT '',
            serial TEXT DEFAULT '',
            target_dpi INTEGER DEFAULT 220,
            display_width INTEGER DEFAULT 1920,
            display_height INTEGER DEFAULT 1080,
            display_id INTEGER DEFAULT 0,
            lines_per_page INTEGER DEFAULT 49,
            step_size INTEGER DEFAULT 48,
            scroll_padding_lines INTEGER DEFAULT 4,
            arrow_count_init INTEGER DEFAULT 56,
            arrow_count_step INTEGER DEFAULT 28,
            settle_delay_ms INTEGER DEFAULT 50,
            hid_config_json TEXT DEFAULT '{}',
            is_active INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)
        # Ensure device-specific enforcement columns exist
        existing_cols = {row["name"] for row in c.execute("PRAGMA table_info(projects);").fetchall()}
        columns_to_add = [
            ("device_model", "TEXT DEFAULT 'pixel_8'"),
            ("device_name", "TEXT DEFAULT ''"),
            ("device_serial", "TEXT DEFAULT ''"),
            ("target_dpi", "INTEGER DEFAULT 220"),
            ("display_width", "INTEGER DEFAULT 1920"),
            ("display_height", "INTEGER DEFAULT 1080"),
            ("display_id", "INTEGER DEFAULT 0"),
            ("lines_per_page", "INTEGER DEFAULT 49"),
            ("step_size", "INTEGER DEFAULT 48"),
            ("scroll_padding_lines", "INTEGER DEFAULT 4"),
            ("arrow_count_init", "INTEGER DEFAULT 56"),
            ("arrow_count_step", "INTEGER DEFAULT 28"),
            ("settle_delay_ms", "INTEGER DEFAULT 50"),
            ("lock_device", "INTEGER DEFAULT 0"),
            ("hid_config_json", "TEXT DEFAULT '{}'")
        ]
        for col_name, col_def in columns_to_add:
            if col_name not in existing_cols:
                c.execute(f"ALTER TABLE projects ADD COLUMN {col_name} {col_def};")

        # Also ensure scroll_padding_lines column exists on device_profiles if table was created earlier
        prof_cols = {row["name"] for row in c.execute("PRAGMA table_info(device_profiles);").fetchall()}
        if "scroll_padding_lines" not in prof_cols:
            c.execute("ALTER TABLE device_profiles ADD COLUMN scroll_padding_lines INTEGER DEFAULT 4;")

        # Seed default editable templates in device_profiles if none exist
        if c.execute("SELECT COUNT(*) FROM device_profiles;").fetchone()[0] == 0:
            now = datetime.now().isoformat()
            default_hid_json = json.dumps({
                "ctrl_keycode": 113,
                "home_keycode": 122,
                "end_keycode": 123,
                "down_keycode": 20,
                "settle_delay_ms": 50,
                "key_repeat_delay_ms": 15,
                "dispatch_method": "accelerated_batch",
                "scroll_padding_lines": 4,
                "arrow_count_init": 56,
                "arrow_count_step": 28
            })
            c.execute("""
            INSERT INTO device_profiles VALUES
            ('prof_pixel_8', 'Pixel 8 Pro', 'Pixel 8 Pro (1080p @ 220 DPI)', 'pixel_8', 'Google', '', 220, 1920, 1080, 0, 24, 28, 4, 56, 28, 50, ?, 1, ?, ?),
            ('prof_pixel_10', 'Pixel 10 Pro XL', 'Pixel 10 Pro XL (1080p @ 220 DPI)', 'pixel_10', 'Google', '', 220, 1920, 1080, 0, 24, 28, 4, 56, 28, 50, ?, 0, ?, ?);
            """, (default_hid_json, now, now, default_hid_json, now, now))

        # Clean up any legacy default project and orphaned frames
        c.execute("DELETE FROM projects WHERE id = 'proj_default';")
        conn.commit()

def get_device_profiles() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM device_profiles ORDER BY is_active DESC, updated_at DESC;")
        rows = c.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try: d["hid_config"] = json.loads(d.get("hid_config_json") or "{}")
            except Exception: d["hid_config"] = {}
            result.append(d)
        return result

def get_device_profile(profile_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM device_profiles WHERE id = ?;", (profile_id,))
        row = c.fetchone()
        if not row: return None
        d = dict(row)
        try: d["hid_config"] = json.loads(d.get("hid_config_json") or "{}")
        except Exception: d["hid_config"] = {}
        return d

def upsert_device_profile(data: Dict[str, Any]) -> Dict[str, Any]:
    prof_id = data.get("id") or f"prof_{int(datetime.now().timestamp())}_{abs(hash(data.get('name', 'dev'))) % 1000}"
    name = data.get("name") or data.get("display_name") or "Custom Device Profile"
    disp_name = data.get("display_name") or name
    model = (data.get("model_name") or data.get("device_model") or "").strip().lower()
    mfg = data.get("manufacturer") or "Android"
    serial = data.get("serial") or ""
    dpi = int(data.get("target_dpi") or 220)
    width = int(data.get("display_width") or 1920)
    height = int(data.get("display_height") or 1080)
    disp_id = int(data.get("display_id") or 0)
    lpp = int(data.get("lines_per_page") or 49)
    scroll_pad = int(data.get("scroll_padding_lines") if data.get("scroll_padding_lines") is not None else 4)
    step = int(data.get("step_size") or (lpp + scroll_pad))
    arr_step = int(data.get("arrow_count_step") or step)
    arr_init = int(data.get("arrow_count_init") or (arr_step * 2))
    settle = int(data.get("settle_delay_ms") or 50)
    hid_raw = data.get("hid_config") or data.get("hid_config_json") or {}
    if isinstance(hid_raw, dict):
        hid_raw.setdefault("scroll_padding_lines", scroll_pad)
        hid_raw.setdefault("arrow_count_init", arr_init)
        hid_raw.setdefault("arrow_count_step", arr_step)
    hid_json = json.dumps(hid_raw) if isinstance(hid_raw, dict) else str(hid_raw)
    is_active = 1 if data.get("is_active") else 0
    now = datetime.now().isoformat()

    with get_connection() as conn:
        c = conn.cursor()
        if is_active:
            c.execute("UPDATE device_profiles SET is_active = 0;")
        c.execute("""
        INSERT INTO device_profiles (
            id, name, display_name, model_name, manufacturer, serial, target_dpi,
            display_width, display_height, display_id, lines_per_page, step_size,
            scroll_padding_lines, arrow_count_init, arrow_count_step, settle_delay_ms, hid_config_json,
            is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, display_name=excluded.display_name, model_name=excluded.model_name,
            manufacturer=excluded.manufacturer, serial=excluded.serial, target_dpi=excluded.target_dpi,
            display_width=excluded.display_width, display_height=excluded.display_height, display_id=excluded.display_id,
            lines_per_page=excluded.lines_per_page, step_size=excluded.step_size,
            scroll_padding_lines=excluded.scroll_padding_lines,
            arrow_count_init=excluded.arrow_count_init, arrow_count_step=excluded.arrow_count_step,
            settle_delay_ms=excluded.settle_delay_ms, hid_config_json=excluded.hid_config_json,
            is_active=excluded.is_active, updated_at=excluded.updated_at;
        """, (
            prof_id, name, disp_name, model, mfg, serial, dpi, width, height, disp_id,
            lpp, step, scroll_pad, arr_init, arr_step, settle, hid_json, is_active, now, now
        ))
        conn.commit()
    return get_device_profile(prof_id) or {}

def delete_device_profile(profile_id: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM device_profiles WHERE id = ?;", (profile_id,))
        conn.commit()
        return c.rowcount > 0

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

def create_project(
    name: str,
    description: str = "",
    target_total_lines: int = 0,
    device_model: str = "pixel_8",
    device_name: str = "",
    device_serial: str = "",
    target_dpi: int = 220,
    display_width: int = 1920,
    display_height: int = 1080,
    display_id: int = 0,
    lines_per_page: int = 49,
    step_size: int = 48,
    scroll_padding_lines: int = 4,
    arrow_count_init: int = 56,
    arrow_count_step: int = 28,
    settle_delay_ms: int = 50,
    lock_device: bool = False,
    hid_config_json: str = "{}"
) -> Dict[str, Any]:
    now, pid = datetime.now().isoformat(), f"proj_{int(datetime.now().timestamp())}_{abs(hash(name)) % 10000}"
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("UPDATE projects SET is_active = 0;")
        c.execute(
            """INSERT INTO projects (
                id, name, description, target_total_lines, status, is_active, created_at, updated_at,
                device_model, device_name, device_serial, target_dpi, display_width, display_height, display_id,
                lines_per_page, step_size, scroll_padding_lines, arrow_count_init, arrow_count_step, settle_delay_ms, lock_device, hid_config_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);""",
            (
                pid, name.strip(), description.strip(), target_total_lines, "active", 1, now, now,
                (device_model or "pixel_8").strip().lower(),
                (device_name or "").strip(),
                (device_serial or "").strip(),
                int(target_dpi or 220),
                int(display_width or 1920),
                int(display_height or 1080),
                int(display_id or 0),
                int(lines_per_page or 49),
                int(step_size or 48),
                int(scroll_padding_lines if scroll_padding_lines is not None else 4),
                int(arrow_count_init or 56),
                int(arrow_count_step or 28),
                int(settle_delay_ms or 50),
                1 if lock_device else 0,
                hid_config_json or "{}"
            )
        )
        c.execute("INSERT INTO project_telemetry VALUES (?, ?, ?, ?);", (pid, "{}", "{}", now))
        conn.commit()
    return get_project(pid) or {}

def update_project_device_settings(
    project_id: str,
    device_model: Optional[str] = None,
    device_name: Optional[str] = None,
    device_serial: Optional[str] = None,
    target_dpi: Optional[int] = None,
    display_width: Optional[int] = None,
    display_height: Optional[int] = None,
    display_id: Optional[int] = None,
    lines_per_page: Optional[int] = None,
    step_size: Optional[int] = None,
    scroll_padding_lines: Optional[int] = None,
    arrow_count_init: Optional[int] = None,
    arrow_count_step: Optional[int] = None,
    settle_delay_ms: Optional[int] = None,
    lock_device: Optional[bool] = None,
    hid_config_json: Optional[str] = None
) -> bool:
    proj = get_project(project_id)
    if not proj:
        return False
    updates = []
    params = []
    if device_model is not None:
        updates.append("device_model = ?")
        params.append(device_model.strip().lower())
    if device_name is not None:
        updates.append("device_name = ?")
        params.append(device_name.strip())
    if device_serial is not None:
        updates.append("device_serial = ?")
        params.append(device_serial.strip())
    if target_dpi is not None:
        updates.append("target_dpi = ?")
        params.append(int(target_dpi))
    if display_width is not None:
        updates.append("display_width = ?")
        params.append(int(display_width))
    if display_height is not None:
        updates.append("display_height = ?")
        params.append(int(display_height))
    if display_id is not None:
        updates.append("display_id = ?")
        params.append(int(display_id))
    if lines_per_page is not None:
        updates.append("lines_per_page = ?")
        params.append(int(lines_per_page))
    if step_size is not None:
        updates.append("step_size = ?")
        params.append(int(step_size))
    if scroll_padding_lines is not None:
        updates.append("scroll_padding_lines = ?")
        params.append(int(scroll_padding_lines))
    if arrow_count_init is not None:
        updates.append("arrow_count_init = ?")
        params.append(int(arrow_count_init))
    if arrow_count_step is not None:
        updates.append("arrow_count_step = ?")
        params.append(int(arrow_count_step))
    if settle_delay_ms is not None:
        updates.append("settle_delay_ms = ?")
        params.append(int(settle_delay_ms))
    if lock_device is not None:
        updates.append("lock_device = ?")
        params.append(1 if lock_device else 0)
    if hid_config_json is not None:
        updates.append("hid_config_json = ?")
        params.append(hid_config_json)

    if not updates:
        return True

    updates.append("updated_at = ?")
    params.append(datetime.now().isoformat())
    params.append(project_id)

    sql = f"UPDATE projects SET {', '.join(updates)} WHERE id = ?;"
    with get_connection() as conn:
        conn.cursor().execute(sql, tuple(params))
        conn.commit()
    return True

def toggle_project_device_lock(project_id: str, lock_device: Optional[bool] = None) -> bool:
    proj = get_project(project_id)
    if not proj:
        return False
    new_val = (not bool(proj.get("lock_device", 0))) if lock_device is None else bool(lock_device)
    return update_project_device_settings(project_id, lock_device=new_val)

def update_project_target_lines(project_id: str, target_total_lines: int) -> bool:
    with get_connection() as conn:
        conn.cursor().execute("UPDATE projects SET target_total_lines = ?, updated_at = ? WHERE id = ?;", (target_total_lines, datetime.now().isoformat(), project_id))
        conn.commit()
    return True

def update_project_description(project_id: str, description: str) -> bool:
    with get_connection() as conn:
        conn.cursor().execute("UPDATE projects SET description = ?, updated_at = ? WHERE id = ?;", (description.strip(), datetime.now().isoformat(), project_id))
        conn.commit()
    return True

def append_project_filename(project_id: str, filename: str) -> str:
    proj = get_project(project_id)
    if not proj:
        return ""
    cur_desc = (proj.get("description") or "").strip()
    clean_fn = filename.strip()
    if not clean_fn:
        return cur_desc
    if clean_fn in cur_desc:
        return cur_desc
    new_desc = f"{cur_desc} | {clean_fn}" if cur_desc else clean_fn
    update_project_description(project_id, new_desc)
    return new_desc

def activate_project(project_id: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor()
        if not c.execute("SELECT id FROM projects WHERE id = ?;", (project_id,)).fetchone(): return False
        c.execute("UPDATE projects SET is_active = 0;"); c.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (project_id,))
        conn.commit(); return True

STORAGE_FRAMES_DIR = Path(__file__).parent / "storage" / "frames"
ALL_FRAMES_DIRS = [FRAMES_DIR, STORAGE_FRAMES_DIR]

def _remove_frame_files(filenames: List[str], project_id: Optional[str] = None):
    for fdir in ALL_FRAMES_DIRS:
        if not fdir.exists():
            continue
        for fn in filenames:
            (fdir / fn).unlink(missing_ok=True)
            stem = Path(fn).stem
            for extra in fdir.glob(f"*{stem}*"):
                extra.unlink(missing_ok=True)
        if project_id:
            for extra in fdir.glob(f"*{project_id}*"):
                extra.unlink(missing_ok=True)

def delete_project(project_id: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor()
        row = c.execute("SELECT is_active FROM projects WHERE id = ?;", (project_id,)).fetchone()
        if not row:
            return False
        was_active = bool(row["is_active"])
        fns = [r["filename"] for r in c.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,)).fetchall()]
        
        # Explicitly clean up related tables to ensure thorough deletion
        c.execute("DELETE FROM frames WHERE project_id = ?;", (project_id,))
        c.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        c.execute("DELETE FROM project_telemetry WHERE project_id = ?;", (project_id,))
        c.execute("DELETE FROM projects WHERE id = ?;", (project_id,))
        conn.commit()

        _remove_frame_files(fns, project_id)

        if was_active:
            fb = c.execute("SELECT id FROM projects ORDER BY created_at DESC LIMIT 1;").fetchone()
            if fb:
                c.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (fb["id"],))
                conn.commit()
        return True

def _purge_project_data(project_id: str, new_status: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor()
        if not c.execute("SELECT id FROM projects WHERE id = ?;", (project_id,)).fetchone():
            return False
        fns = [r["filename"] for r in c.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,)).fetchall()]
        c.execute("DELETE FROM frames WHERE project_id = ?;", (project_id,))
        c.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        now = datetime.now().isoformat()
        c.execute("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?;", (new_status, now, project_id))
        c.execute("UPDATE project_telemetry SET telemetry_json = '{}', updated_at = ? WHERE project_id = ?;", (now, project_id))
        conn.commit()
        _remove_frame_files(fns, project_id)
        return True

def abort_project(project_id: str) -> bool: return _purge_project_data(project_id, "aborted")
def clear_project_data(project_id: str) -> bool: return _purge_project_data(project_id, "active")

def get_frames(project_id: Optional[str]) -> List[Dict[str, Any]]:
    if not project_id: return []
    rows = _execute("SELECT * FROM frames WHERE project_id = ? ORDER BY page_index ASC, created_at ASC, top_line ASC;", (project_id,), fetchall=True)
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
        c = conn.cursor()
        row = c.execute("SELECT filename FROM frames WHERE frame_id = ?;", (frame_id,)).fetchone()
        if not row:
            return False
        c.execute("DELETE FROM frames WHERE frame_id = ?;", (frame_id,))
        c.execute("DELETE FROM document_lines WHERE frame_id = ?;", (frame_id,))
        conn.commit()
        _remove_frame_files([row["filename"]])
        return True

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
