import sqlite3, json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional

import config

_LEGACY_DB_PATH = Path(__file__).parent / "data" / "matrix_capture.db"
DATA_DIR, FRAMES_DIR = config.DATA_DIR, config.FRAMES_DIR
DB_PATH = DATA_DIR / "matrix_capture.db"

def _ensure_storage_db_migrated():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if _LEGACY_DB_PATH.exists() and _LEGACY_DB_PATH.stat().st_size > 4096:
        if not DB_PATH.exists() or DB_PATH.stat().st_size < 4096:
            try:
                src = sqlite3.connect(str(_LEGACY_DB_PATH), timeout=10.0)
                dst = sqlite3.connect(str(DB_PATH), timeout=10.0)
                with dst:
                    src.backup(dst)
                dst.close()
                src.close()
            except Exception as e:
                import shutil
                shutil.copy2(str(_LEGACY_DB_PATH), str(DB_PATH))

_ensure_storage_db_migrated()

def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True); FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
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
        CREATE TABLE IF NOT EXISTS project_reference_lines (project_id TEXT NOT NULL, line_number INTEGER NOT NULL, text_content TEXT NOT NULL, PRIMARY KEY (project_id, line_number));
        CREATE TABLE IF NOT EXISTS vfs_files (
            project_id TEXT NOT NULL,
            path TEXT NOT NULL,
            normalized_path TEXT DEFAULT '',
            ext TEXT DEFAULT '',
            content TEXT DEFAULT '',
            start_md_line INTEGER DEFAULT 0,
            end_md_line INTEGER DEFAULT 0,
            expected_lines INTEGER DEFAULT 0,
            actual_lines INTEGER DEFAULT 0,
            expected_chars INTEGER DEFAULT 0,
            actual_chars INTEGER DEFAULT 0,
            tag_status TEXT DEFAULT 'verified',
            source_frame_ids_json TEXT DEFAULT '[]',
            metadata_json TEXT DEFAULT '{}',
            updated_at TEXT NOT NULL,
            PRIMARY KEY (project_id, path),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
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
            ("hid_config_json", "TEXT DEFAULT '{}'"),
            ("project_download_count", "INTEGER DEFAULT 0"),
            ("markdown_download_count", "INTEGER DEFAULT 0"),
            ("bundle_id", "TEXT DEFAULT ''"),
            ("bundle_name", "TEXT DEFAULT ''"),
            ("part_number", "INTEGER DEFAULT 0"),
            ("total_parts", "INTEGER DEFAULT 0"),
            ("part_file_name", "TEXT DEFAULT ''")
        ]
        for col_name, col_def in columns_to_add:
            if col_name not in existing_cols:
                c.execute(f"ALTER TABLE projects ADD COLUMN {col_name} {col_def};")

        # Also ensure scroll_padding_lines column exists on device_profiles if table was created earlier
        prof_cols = {row["name"] for row in c.execute("PRAGMA table_info(device_profiles);").fetchall()}
        if "scroll_padding_lines" not in prof_cols:
            c.execute("ALTER TABLE device_profiles ADD COLUMN scroll_padding_lines INTEGER DEFAULT 4;")

        # Ensure arrow_count column exists on frames table
        frame_cols = {row["name"] for row in c.execute("PRAGMA table_info(frames);").fetchall()}
        if "arrow_count" not in frame_cols:
            c.execute("ALTER TABLE frames ADD COLUMN arrow_count INTEGER DEFAULT 0;")

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

BUNDLES_DIR = DATA_DIR.parent / "storage" / "bundles"
EXPORTS_DIR = DATA_DIR.parent / "storage" / "exports"

def _infer_bundle_metadata(
    name: str,
    description: str = "",
    bundle_id: str = "",
    bundle_name: str = "",
    part_number: int = 0,
    total_parts: int = 0,
    part_file_name: str = ""
) -> Dict[str, Any]:
    import re
    raw_name = (name or "").strip()
    raw_desc = (description or "").strip()
    b_id = (bundle_id or "").strip()
    b_name = (bundle_name or "").strip()
    p_num = int(part_number or 0)
    t_parts = int(total_parts or 0)
    p_fn = (part_file_name or "").strip()

    # Check description for "Part X of Y"
    if t_parts <= 0 and raw_desc:
        m_tot = re.search(r"Part\s*(\d+)\s*of\s*(\d+)", raw_desc, re.IGNORECASE)
        if m_tot:
            if p_num <= 0:
                p_num = int(m_tot.group(1))
            t_parts = int(m_tot.group(2))

    # Extract explicit file from description if present
    desc_file = ""
    if raw_desc:
        m_df = re.search(r"([A-Za-z0-9_\-.]+_part\d+\.(?:md|markdown|txt))", raw_desc, re.IGNORECASE)
        if m_df:
            desc_file = m_df.group(1)
        else:
            m_f = re.search(r"File:\s*([^\s(|]+)", raw_desc, re.IGNORECASE)
            if m_f:
                desc_file = m_f.group(1).strip()

    candidates = [c for c in (p_fn, desc_file, raw_name) if c]
    part_pattern = re.compile(
        r"^(?P<prefix>.+?)(?:[_\-\s]+|\b)part[_\-\s]*(?P<part>\d+)(?:\s*(?:of|/)\s*(?P<total>\d+))?(?:\s*\(Imported\))?(?P<ext>\.md|\.markdown|\.txt)?$",
        re.IGNORECASE
    )

    matched_prefix = ""
    for cand in candidates:
        clean_cand = re.sub(r"\s*\(Imported\)\s*$", "", cand.strip(), flags=re.IGNORECASE)
        m = part_pattern.match(clean_cand)
        if m:
            matched_prefix = (m.group("prefix") or "").strip(" _-.")
            if p_num <= 0:
                p_num = int(m.group("part"))
            if t_parts <= 0 and m.group("total"):
                t_parts = int(m.group("total"))
            if not p_fn:
                ext = m.group("ext") or ".md"
                safe_pfx = re.sub(r"\s+", "_", matched_prefix)
                p_fn = f"{safe_pfx}_part{p_num}{ext}"
            break

    if matched_prefix and not b_name:
        # Normalize triple-repeated typo characters in display name if any (e.g. "commmon" -> "common")
        b_name = re.sub(r"([a-zA-Z])\1{2,}", r"\1\1", matched_prefix)

    if (matched_prefix or b_name) and not b_id:
        base_for_slug = b_name or matched_prefix
        norm_slug = re.sub(r"([a-zA-Z])\1{2,}", r"\1\1", base_for_slug.lower())
        norm_slug = re.sub(r"[^a-z0-9]+", "_", norm_slug).strip("_")
        if norm_slug:
            b_id = f"bundle_{norm_slug}"

    if b_id and not p_fn and raw_name:
        safe_n = re.sub(r'[<>:"/\\|?*]+', "_", raw_name)
        if not safe_n.lower().endswith(".md"):
            safe_n = f"{safe_n}.md"
        p_fn = safe_n

    return {
        "bundle_id": b_id,
        "bundle_name": b_name,
        "part_number": p_num,
        "total_parts": t_parts,
        "part_file_name": p_fn,
        "is_bundle_part": bool(b_id and p_num > 0)
    }

def _normalize_project_row(row: Any) -> Dict[str, Any]:
    d = dict(row)
    d["project_download_count"] = int(d.get("project_download_count") or 0)
    d["markdown_download_count"] = int(d.get("markdown_download_count") or 0)
    frame_cnt = int(d.get("frame_count") or 0)
    line_cnt = int(d.get("line_count") or 0)
    raw_verified = int(d.get("verified_line_count") or 0)
    verified_cnt = raw_verified if raw_verified > 0 else line_cnt
    max_ln = int(d.get("max_line") or 0)
    target_ln = int(d.get("target_total_lines") or 0)
    d["frame_count"] = frame_cnt
    d["line_count"] = line_cnt
    d["verified_lines"] = verified_cnt
    d["total_lines"] = max(max_ln, line_cnt) if (max_ln > 0 or line_cnt > 0) else target_ln
    b_meta = _infer_bundle_metadata(
        name=d.get("name") or "",
        description=d.get("description") or "",
        bundle_id=d.get("bundle_id") or "",
        bundle_name=d.get("bundle_name") or "",
        part_number=int(d.get("part_number") or 0),
        total_parts=int(d.get("total_parts") or 0),
        part_file_name=d.get("part_file_name") or ""
    )
    d.update(b_meta)
    return d

def get_active_project() -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        c = conn.cursor()
        for q in [
            """SELECT p.*,
                (SELECT COUNT(*) FROM frames f WHERE f.project_id = p.id) as frame_count,
                (SELECT COUNT(*) FROM document_lines l WHERE l.project_id = p.id) as line_count,
                (SELECT COUNT(*) FROM document_lines l WHERE l.project_id = p.id AND l.is_verified = 1) as verified_line_count,
                (SELECT MIN(l.line_number) FROM document_lines l WHERE l.project_id = p.id) as min_line,
                (SELECT MAX(l.line_number) FROM document_lines l WHERE l.project_id = p.id) as max_line
               FROM projects p WHERE p.is_active = 1 LIMIT 1;""",
            """SELECT p.*,
                (SELECT COUNT(*) FROM frames f WHERE f.project_id = p.id) as frame_count,
                (SELECT COUNT(*) FROM document_lines l WHERE l.project_id = p.id) as line_count,
                (SELECT COUNT(*) FROM document_lines l WHERE l.project_id = p.id AND l.is_verified = 1) as verified_line_count,
                (SELECT MIN(l.line_number) FROM document_lines l WHERE l.project_id = p.id) as min_line,
                (SELECT MAX(l.line_number) FROM document_lines l WHERE l.project_id = p.id) as max_line
               FROM projects p ORDER BY p.created_at DESC LIMIT 1;"""
        ]:
            c.execute(q); row = c.fetchone()
            if row:
                if not row["is_active"]:
                    c.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (row["id"],))
                    conn.commit()
                return _normalize_project_row(row)
        return None

def get_projects() -> List[Dict[str, Any]]:
    sql = """
    SELECT p.*,
        (SELECT COUNT(*) FROM frames f WHERE f.project_id = p.id) as frame_count,
        (SELECT COUNT(*) FROM document_lines l WHERE l.project_id = p.id) as line_count,
        (SELECT COUNT(*) FROM document_lines l WHERE l.project_id = p.id AND l.is_verified = 1) as verified_line_count,
        (SELECT MIN(l.line_number) FROM document_lines l WHERE l.project_id = p.id) as min_line,
        (SELECT MAX(l.line_number) FROM document_lines l WHERE l.project_id = p.id) as max_line
    FROM projects p
    ORDER BY p.created_at DESC;
    """
    return [_normalize_project_row(r) for r in _execute(sql, fetchall=True)]

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    sql = """
    SELECT p.*,
        (SELECT COUNT(*) FROM frames f WHERE f.project_id = p.id) as frame_count,
        (SELECT COUNT(*) FROM document_lines l WHERE l.project_id = p.id) as line_count,
        (SELECT COUNT(*) FROM document_lines l WHERE l.project_id = p.id AND l.is_verified = 1) as verified_line_count,
        (SELECT MIN(l.line_number) FROM document_lines l WHERE l.project_id = p.id) as min_line,
        (SELECT MAX(l.line_number) FROM document_lines l WHERE l.project_id = p.id) as max_line
    FROM projects p
    WHERE p.id = ?;
    """
    r = _execute(sql, (project_id,), fetchone=True)
    return _normalize_project_row(r) if r else None

def get_bundle_projects(bundle_id: str) -> List[Dict[str, Any]]:
    if not bundle_id:
        return []
    all_projs = get_projects()
    matched = [p for p in all_projs if p.get("bundle_id") == bundle_id]
    matched.sort(key=lambda p: (int(p.get("part_number") or 999), p.get("created_at") or ""))
    return matched

def sync_project_part_markdown_file(project_id: str) -> Optional[Path]:
    import re
    proj = get_project(project_id)
    if not proj:
        return None
    lines_dict = get_document_lines(project_id)
    if not lines_dict:
        content = ""
    else:
        sorted_keys = sorted(lines_dict.keys())
        min_k = sorted_keys[0] if sorted_keys else 1
        max_k = sorted_keys[-1] if sorted_keys else 0
        content = "\n".join(
            lines_dict[k].get("text", "") if k in lines_dict else ""
            for k in range(min_k, max_k + 1)
        )
    raw_fn = proj.get("part_file_name") or proj.get("name") or f"{project_id}.md"
    safe_fn = re.sub(r'[<>:"/\\|?*]+', "_", raw_fn.strip())
    if not safe_fn.lower().endswith(".md"):
        safe_fn = f"{safe_fn}.md"

    written_path: Optional[Path] = None
    b_id = proj.get("bundle_id")
    if b_id:
        try:
            b_dir = BUNDLES_DIR / re.sub(r'[<>:"/\\|?*]+', "_", b_id)
            b_dir.mkdir(parents=True, exist_ok=True)
            b_path = b_dir / safe_fn
            b_path.write_text(content, encoding="utf-8")
            written_path = b_path
        except Exception:
            pass
    try:
        EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
        e_path = EXPORTS_DIR / safe_fn
        e_path.write_text(content, encoding="utf-8")
        if written_path is None:
            written_path = e_path
    except Exception:
        pass
    return written_path

def delete_bundle_projects(bundle_id: str) -> List[str]:
    import shutil, re
    parts = get_bundle_projects(bundle_id)
    deleted_ids = []
    for p in parts:
        pid = p.get("id")
        if pid and delete_project(pid):
            deleted_ids.append(pid)
    if bundle_id:
        try:
            b_dir = BUNDLES_DIR / re.sub(r'[<>:"/\\|?*]+', "_", bundle_id)
            if b_dir.exists():
                shutil.rmtree(b_dir, ignore_errors=True)
        except Exception:
            pass
    return deleted_ids

def increment_project_download_count(project_id: str, download_type: str = "project") -> Optional[Dict[str, Any]]:
    if not project_id:
        return None
    col = "markdown_download_count" if download_type == "markdown" else "project_download_count"
    now = datetime.now().isoformat()
    with get_connection() as conn:
        c = conn.cursor()
        try:
            c.execute(f"UPDATE projects SET {col} = COALESCE({col}, 0) + 1, updated_at = ? WHERE id = ?;", (now, project_id))
        except sqlite3.OperationalError:
            for cname in ("project_download_count", "markdown_download_count"):
                try:
                    c.execute(f"ALTER TABLE projects ADD COLUMN {cname} INTEGER DEFAULT 0;")
                except sqlite3.OperationalError:
                    pass
            c.execute(f"UPDATE projects SET {col} = COALESCE({col}, 0) + 1, updated_at = ? WHERE id = ?;", (now, project_id))
        conn.commit()
    return get_project(project_id)

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
    hid_config_json: str = "{}",
    bundle_id: str = "",
    bundle_name: str = "",
    part_number: int = 0,
    total_parts: int = 0,
    part_file_name: str = ""
) -> Dict[str, Any]:
    now, pid = datetime.now().isoformat(), f"proj_{int(datetime.now().timestamp() * 1000)}_{abs(hash(name)) % 10000}"
    b_meta = _infer_bundle_metadata(
        name=name,
        description=description,
        bundle_id=bundle_id,
        bundle_name=bundle_name,
        part_number=part_number,
        total_parts=total_parts,
        part_file_name=part_file_name
    )
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("UPDATE projects SET is_active = 0;")
        c.execute(
            """INSERT INTO projects (
                id, name, description, target_total_lines, status, is_active, created_at, updated_at,
                device_model, device_name, device_serial, target_dpi, display_width, display_height, display_id,
                lines_per_page, step_size, scroll_padding_lines, arrow_count_init, arrow_count_step, settle_delay_ms, lock_device, hid_config_json,
                bundle_id, bundle_name, part_number, total_parts, part_file_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);""",
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
                hid_config_json or "{}",
                b_meta["bundle_id"],
                b_meta["bundle_name"],
                b_meta["part_number"],
                b_meta["total_parts"],
                b_meta["part_file_name"]
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

def update_project_status(project_id: str, status: str) -> bool:
    with get_connection() as conn:
        conn.cursor().execute("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?;", ((status or "active").strip(), datetime.now().isoformat(), project_id))
        conn.commit()
    return True

def update_project_description(project_id: str, description: str) -> bool:
    with get_connection() as conn:
        conn.cursor().execute("UPDATE projects SET description = ?, updated_at = ? WHERE id = ?;", (description.strip(), datetime.now().isoformat(), project_id))
        conn.commit()
    return True

def update_project_bundle_metadata(
    project_id: str,
    bundle_id: Optional[str] = None,
    bundle_name: Optional[str] = None,
    part_number: Optional[int] = None,
    total_parts: Optional[int] = None,
    part_file_name: Optional[str] = None,
) -> bool:
    proj = get_project(project_id)
    if not proj:
        return False
    b_meta = _infer_bundle_metadata(
        name=proj.get("name") or "",
        description=proj.get("description") or "",
        bundle_id=bundle_id if bundle_id is not None else (proj.get("bundle_id") or ""),
        bundle_name=bundle_name if bundle_name is not None else (proj.get("bundle_name") or ""),
        part_number=part_number if part_number is not None else int(proj.get("part_number") or 0),
        total_parts=total_parts if total_parts is not None else int(proj.get("total_parts") or 0),
        part_file_name=part_file_name if part_file_name is not None else (proj.get("part_file_name") or ""),
    )
    with get_connection() as conn:
        c = conn.cursor()
        c.execute(
            """
            UPDATE projects
            SET bundle_id = ?, bundle_name = ?, part_number = ?, total_parts = ?, part_file_name = ?, updated_at = ?
            WHERE id = ?;
            """,
            (
                b_meta["bundle_id"],
                b_meta["bundle_name"],
                b_meta["part_number"],
                b_meta["total_parts"],
                b_meta["part_file_name"],
                datetime.now().isoformat(),
                project_id,
            ),
        )
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
    new_desc = cur_desc if clean_fn in cur_desc else (f"{cur_desc} | {clean_fn}" if cur_desc else clean_fn)
    if new_desc != cur_desc:
        update_project_description(project_id, new_desc)
    try:
        update_project_bundle_metadata(project_id, part_file_name=clean_fn)
    except Exception:
        pass
    return new_desc

def activate_project(project_id: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor()
        if not c.execute("SELECT id FROM projects WHERE id = ?;", (project_id,)).fetchone(): return False
        c.execute("UPDATE projects SET is_active = 0;"); c.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (project_id,))
        conn.commit(); return True

STORAGE_FRAMES_DIR = Path(__file__).parent / "storage" / "frames"
THUMBNAILS_DIR = Path(__file__).parent / "data" / "thumbnails"
ALL_FRAMES_DIRS = [FRAMES_DIR, STORAGE_FRAMES_DIR, THUMBNAILS_DIR]

def _remove_frame_files(filenames: List[str], project_id: Optional[str] = None):
    import os
    import re
    seen_dirs = set()
    unique_dirs = []
    for fdir in ALL_FRAMES_DIRS:
        if not fdir or not fdir.exists():
            continue
        try:
            resolved = str(fdir.resolve()).lower()
        except Exception:
            resolved = str(fdir).lower()
        if resolved not in seen_dirs:
            seen_dirs.add(resolved)
            unique_dirs.append(fdir)

    stems = {Path(fn).stem for fn in filenames if fn}
    small_stems = list(stems) if len(stems) <= 60 else []

    for fdir in unique_dirs:
        # 1. Fast O(1) direct unlinks for known filenames
        for fn in filenames:
            if not fn:
                continue
            try:
                (fdir / fn).unlink(missing_ok=True)
            except OSError:
                pass
        if project_id:
            for prefix in ("calib_end_", "calib_home_"):
                try:
                    (fdir / f"{prefix}{project_id}.png").unlink(missing_ok=True)
                except OSError:
                    pass

        # 2. Single O(M) directory scan instead of O(N * M) repeated globs
        if not stems and not project_id:
            continue
        try:
            with os.scandir(fdir) as it:
                for entry in it:
                    if not entry.is_file():
                        continue
                    ename = entry.name
                    estem = Path(ename).stem
                    matched = False
                    if project_id and project_id in ename:
                        matched = True
                    elif estem in stems:
                        matched = True
                    elif estem.startswith("raw_capture_"):
                        stripped = re.sub(r"^raw_capture_p\d+_", "", estem)
                        if stripped in stems:
                            matched = True
                    elif small_stems and any(s in ename for s in small_stems):
                        matched = True
                    if matched:
                        try:
                            Path(entry.path).unlink(missing_ok=True)
                        except OSError:
                            pass
        except OSError:
            pass

def delete_project(project_id: str) -> bool:
    fns: List[str] = []
    with get_connection() as conn:
        c = conn.cursor()
        row = c.execute("SELECT is_active FROM projects WHERE id = ?;", (project_id,)).fetchone()
        if not row:
            return False
        was_active = bool(row["is_active"])
        try:
            fns = [r["filename"] for r in c.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,)).fetchall()]
        except sqlite3.OperationalError:
            fns = []
        
        # Explicitly clean up related tables to ensure thorough deletion
        for tbl in ("frames", "document_lines", "vfs_files", "project_telemetry", "project_reference_lines"):
            try:
                c.execute(f"DELETE FROM {tbl} WHERE project_id = ?;", (project_id,))
            except sqlite3.OperationalError:
                pass
        c.execute("DELETE FROM projects WHERE id = ?;", (project_id,))

        if was_active:
            fb = c.execute("SELECT id FROM projects ORDER BY created_at DESC LIMIT 1;").fetchone()
            if fb:
                c.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (fb["id"],))
        conn.commit()

    _remove_frame_files(fns, project_id)
    return True

def _purge_project_data(project_id: str, new_status: str) -> bool:
    with get_connection() as conn:
        c = conn.cursor()
        if not c.execute("SELECT id FROM projects WHERE id = ?;", (project_id,)).fetchone():
            return False
        fns = [r["filename"] for r in c.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,)).fetchall()]
        c.execute("DELETE FROM frames WHERE project_id = ?;", (project_id,))
        c.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        c.execute("DELETE FROM vfs_files WHERE project_id = ?;", (project_id,))
        now = datetime.now().isoformat()
        c.execute("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?;", (new_status, now, project_id))
        c.execute("UPDATE project_telemetry SET telemetry_json = '{}', updated_at = ? WHERE project_id = ?;", (now, project_id))
        conn.commit()
        _remove_frame_files(fns, project_id)
        return True

def abort_project(project_id: str) -> bool: return _purge_project_data(project_id, "aborted")
def clear_project_data(project_id: str) -> bool: return _purge_project_data(project_id, "active")

def get_frames(project_id: Optional[str], include_boxes: bool = False) -> List[Dict[str, Any]]:
    if not project_id:
        return []
    if include_boxes:
        sql = "SELECT * FROM frames WHERE project_id = ? ORDER BY page_index ASC, created_at ASC, top_line ASC;"
    else:
        sql = """
        SELECT frame_id, project_id, filename, top_line, bottom_line, page_index,
               file_size, status, extracted_line_count, custom_offset_y,
               token_usage_json, model_used, created_at, arrow_count
        FROM frames
        WHERE project_id = ?
        ORDER BY page_index ASC, created_at ASC, top_line ASC;
        """
    rows = _execute(sql, (project_id,), fetchall=True)
    res = []
    for r in rows:
        d = dict(r)
        try:
            d["token_usage"] = json.loads(d.pop("token_usage_json", None) or "{}")
        except Exception:
            d["token_usage"] = {}
        if include_boxes:
            try:
                d["bounding_boxes"] = json.loads(d.pop("bounding_boxes_json", None) or "{}")
            except Exception:
                d["bounding_boxes"] = {}
        res.append(d)
    return res

def save_frame(project_id: str, frame_id: str, filename: str, top_line: int, bottom_line: int, page_index: int, file_size: int = 0, status: str = "processed", extracted_line_count: int = 0, custom_offset_y: float = 0.0, token_usage: Dict[str, Any] = None, bounding_boxes: Dict[str, Any] = None, model_used: str = "", created_at: str = None, arrow_count: int = 0) -> Dict[str, Any]:
    now = created_at or datetime.now().isoformat()
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("""
            INSERT OR REPLACE INTO frames (
                frame_id, project_id, filename, top_line, bottom_line, page_index,
                file_size, status, extracted_line_count, custom_offset_y,
                token_usage_json, bounding_boxes_json, model_used, created_at, arrow_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (frame_id, project_id, filename, top_line, bottom_line, page_index, file_size, status, extracted_line_count, custom_offset_y, json.dumps(token_usage or {}), json.dumps(bounding_boxes or {}), model_used, now, arrow_count or 0))
        c.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id)); conn.commit()
    return {"frame_id": frame_id, "project_id": project_id, "filename": filename, "top_line": top_line, "bottom_line": bottom_line, "page_index": page_index, "file_size": file_size, "status": status, "extracted_line_count": extracted_line_count, "custom_offset_y": custom_offset_y, "token_usage": token_usage or {}, "bounding_boxes": bounding_boxes or {}, "model_used": model_used, "created_at": now, "arrow_count": arrow_count or 0}

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

def get_document_lines_window(
    project_id: Optional[str],
    from_line: Optional[int] = None,
    to_line: Optional[int] = None,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Asynchronously queries a window/slice of document lines directly from SQLite DB
    between from_line and to_line, returning only the requested range and global line metrics.
    """
    if not project_id:
        return {"total_lines": 0, "lines": [], "min_line": 0, "max_line": 0, "from_line": 0, "to_line": 0, "count": 0}
    with get_connection() as conn:
        c = conn.cursor()
        stats = c.execute(
            "SELECT COUNT(*), MIN(line_number), MAX(line_number) FROM document_lines WHERE project_id = ?;",
            (project_id,)
        ).fetchone()
        total_count = stats[0] or 0
        min_line = stats[1] or 0
        max_line = stats[2] or 0

        params: List[Any] = [project_id]
        where_clauses = ["project_id = ?"]
        if from_line is not None and from_line > 0:
            where_clauses.append("line_number >= ?")
            params.append(from_line)
        if to_line is not None and to_line > 0:
            where_clauses.append("line_number <= ?")
            params.append(to_line)

        sql = f"SELECT * FROM document_lines WHERE {' AND '.join(where_clauses)} ORDER BY line_number ASC"
        if from_line is None and to_line is None:
            sql += " LIMIT ? OFFSET ?"
            params.extend([max(1, limit), max(0, offset)])
        elif limit and (to_line is None or (from_line and to_line - from_line > limit)):
            sql += " LIMIT ?"
            params.append(limit)

        rows = c.execute(sql, params).fetchall()
        lines = [
            {
                "line_number": r["line_number"],
                "gutter_number": r["line_number"],
                "text": r["line_text"],
                "confidence": r["confidence"],
                "frame_id": r["frame_id"],
                "verified": bool(r["is_verified"]),
                "status": "verified" if r["is_verified"] else "unverified",
                "updated_at": r["updated_at"]
            }
            for r in rows
        ]
        actual_from = lines[0]["line_number"] if lines else (from_line or 0)
        actual_to = lines[-1]["line_number"] if lines else (to_line or 0)
        return {
            "total_lines": total_count,
            "min_line": min_line,
            "max_line": max_line,
            "from_line": actual_from,
            "to_line": actual_to,
            "count": len(lines),
            "lines": lines
        }


def _extract_line_row(project_id: str, lnum: int, ld: Any, now: str) -> tuple:
    if isinstance(ld, dict) or hasattr(ld, "get"):
        txt = ld.get("text", str(ld))
        conf = float(ld.get("confidence", 1.0) or 1.0)
        fid = str(ld.get("frame_id", "") or "")
        ver = 1 if (ld.get("verified", False) or ld.get("is_verified", False) or ld.get("status") == "verified") else 0
        upd = str(ld.get("updated_at") or now)
    else:
        txt = str(ld) if ld is not None else ""
        conf = 1.0
        fid = ""
        ver = 0
        upd = now
    return (project_id, int(lnum), txt, conf, fid, ver, upd)


def save_document_lines(project_id: str, lines: Dict[int, Dict[str, Any]]):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        c = conn.cursor()
        if not lines:
            c.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        else:
            rows = [_extract_line_row(project_id, lnum, ld, now) for lnum, ld in lines.items()]
            c.executemany(
                "INSERT OR REPLACE INTO document_lines (project_id, line_number, line_text, confidence, frame_id, is_verified, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);",
                rows
            )
            existing = [r[0] for r in c.execute("SELECT line_number FROM document_lines WHERE project_id = ?;", (project_id,)).fetchall()]
            to_del = [ln for ln in existing if ln not in lines]
            if to_del:
                for i in range(0, len(to_del), 500):
                    chunk = to_del[i:i + 500]
                    placeholders = ",".join("?" * len(chunk))
                    c.execute(f"DELETE FROM document_lines WHERE project_id = ? AND line_number IN ({placeholders});", [project_id] + chunk)
        c.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id))
        conn.commit()

def save_document_line(project_id: str, line_number: int, text: str, confidence: float = 1.0, frame_id: str = "", verified: bool = False):
    now = datetime.now().isoformat()
    _execute("INSERT OR REPLACE INTO document_lines VALUES (?, ?, ?, ?, ?, ?, ?);", (project_id, line_number, text, confidence, frame_id, 1 if verified else 0, now))

def delete_document_line(project_id: str, line_number: int):
    if not project_id:
        return
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM document_lines WHERE project_id = ? AND line_number = ?;", (project_id, line_number))
        now = datetime.now().isoformat()
        c.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id))
        conn.commit()

def delete_document_lines(project_id: str, line_numbers: List[int]):
    if not project_id or not line_numbers:
        return
    with get_connection() as conn:
        c = conn.cursor()
        for i in range(0, len(line_numbers), 500):
            chunk = line_numbers[i:i + 500]
            placeholders = ",".join("?" * len(chunk))
            c.execute(f"DELETE FROM document_lines WHERE project_id = ? AND line_number IN ({placeholders});", [project_id] + chunk)
        now = datetime.now().isoformat()
        c.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id))
        conn.commit()

def clear_document_lines(project_id: str):
    if not project_id:
        return
    with get_connection() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        now = datetime.now().isoformat()
        c.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id))
        conn.commit()

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

def import_project_data(
    project_row: Dict[str, Any],
    frames: List[Dict[str, Any]],
    document_lines: List[Dict[str, Any]],
    telemetry: Dict[str, Any],
    activate: bool = True,
    override_bundle_id: Optional[str] = None,
    override_bundle_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Inserts a complete imported project with its frames, document lines,
    and telemetry into the database and optionally marks it active.
    """
    now = datetime.now().isoformat()
    with get_connection() as conn:
        c = conn.cursor()
        existing = c.execute("SELECT id FROM projects WHERE id = ?;", (project_row.get("id"),)).fetchone()
        was_remapped = False
        if existing:
            was_remapped = True
            orig_id = project_row.get("id", "proj")
            new_id = f"{orig_id}_imp_{int(datetime.now().timestamp() * 1000)}"
            new_name = project_row.get("name", "Imported Project")
            if "(Imported)" not in new_name and not override_bundle_id:
                new_name = f"{new_name} (Imported)"
        else:
            new_id = project_row.get("id") or f"proj_{int(datetime.now().timestamp() * 1000)}_{abs(hash(project_row.get('name', 'imp'))) % 10000}"
            new_name = project_row.get("name", "Imported Project")

        b_meta = _infer_bundle_metadata(
            name=new_name,
            description=project_row.get("description", ""),
            bundle_id=override_bundle_id or project_row.get("bundle_id") or "",
            bundle_name=override_bundle_name or project_row.get("bundle_name") or "",
            part_number=int(project_row.get("part_number") or 0),
            total_parts=int(project_row.get("total_parts") or 0),
            part_file_name=project_row.get("part_file_name") or ""
        )

        if activate:
            c.execute("UPDATE projects SET is_active = 0;")

        target_lines_val = int(project_row.get("target_total_lines", 0) or 0)
        if target_lines_val <= 0 and document_lines:
            max_dl_ln = max((int(dl.get("line_number") or 0) for dl in document_lines if dl.get("line_number") is not None), default=0)
            target_lines_val = max(max_dl_ln, len(document_lines))

        c.execute("""
            INSERT INTO projects (
                id, name, description, target_total_lines, status, is_active, created_at, updated_at,
                device_model, device_name, device_serial, target_dpi, display_width, display_height, display_id,
                lines_per_page, step_size, scroll_padding_lines, arrow_count_init, arrow_count_step, settle_delay_ms, lock_device, hid_config_json,
                bundle_id, bundle_name, part_number, total_parts, part_file_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            new_id,
            new_name,
            project_row.get("description", ""),
            target_lines_val,
            project_row.get("status", "active"),
            1 if activate else 0,
            project_row.get("created_at", now),
            now,
            project_row.get("device_model", "pixel_8"),
            project_row.get("device_name", ""),
            project_row.get("device_serial", ""),
            int(project_row.get("target_dpi", 220)),
            int(project_row.get("display_width", 1920)),
            int(project_row.get("display_height", 1080)),
            int(project_row.get("display_id", 0)),
            int(project_row.get("lines_per_page", 49)),
            int(project_row.get("step_size", 48)),
            int(project_row.get("scroll_padding_lines", 4)),
            int(project_row.get("arrow_count_init", 56)),
            int(project_row.get("arrow_count_step", 28)),
            int(project_row.get("settle_delay_ms", 50)),
            1 if project_row.get("lock_device") else 0,
            project_row.get("hid_config_json", "{}"),
            b_meta["bundle_id"],
            b_meta["bundle_name"],
            b_meta["part_number"],
            b_meta["total_parts"],
            b_meta["part_file_name"]
        ))

        frame_id_map: Dict[str, str] = {}
        suffix = new_id[-8:]
        # Insert frames
        for f in frames:
            orig_fid = f.get("frame_id")
            if not orig_fid:
                continue
            existing_frame = c.execute("SELECT project_id FROM frames WHERE frame_id = ?;", (orig_fid,)).fetchone()
            if was_remapped or (existing_frame and existing_frame["project_id"] != new_id):
                fid = f"{orig_fid}_{suffix}"
            else:
                fid = orig_fid
            frame_id_map[orig_fid] = fid

            tok_json = json.dumps(f.get("token_usage", {})) if isinstance(f.get("token_usage"), dict) else (f.get("token_usage_json") or "{}")
            bbox_json = json.dumps(f.get("bounding_boxes", {})) if isinstance(f.get("bounding_boxes"), dict) else (f.get("bounding_boxes_json") or "{}")
            c.execute("""
                INSERT OR REPLACE INTO frames (
                    frame_id, project_id, filename, top_line, bottom_line, page_index,
                    file_size, status, extracted_line_count, custom_offset_y,
                    token_usage_json, bounding_boxes_json, model_used, created_at, arrow_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                fid,
                new_id,
                f.get("filename", f"{orig_fid}.png"),
                int(f.get("top_line", 0)),
                int(f.get("bottom_line", 0)),
                int(f.get("page_index", 0)),
                int(f.get("file_size", 0)),
                f.get("status", "processed"),
                int(f.get("extracted_line_count", 0)),
                float(f.get("custom_offset_y", 0.0)),
                tok_json,
                bbox_json,
                f.get("model_used", ""),
                f.get("created_at", now),
                int(f.get("arrow_count", 0))
            ))

        # Insert document_lines
        for dl in document_lines:
            lnum = dl.get("line_number")
            if lnum is None:
                continue
            raw_fid = dl.get("frame_id", "")
            mapped_fid = frame_id_map.get(raw_fid, raw_fid)
            c.execute("""
                INSERT OR REPLACE INTO document_lines (
                    project_id, line_number, line_text, confidence, frame_id, is_verified, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?);
            """, (
                new_id,
                int(lnum),
                dl.get("text", dl.get("line_text", "")),
                float(dl.get("confidence", 1.0)),
                mapped_fid,
                1 if (dl.get("verified") or dl.get("is_verified") or dl.get("status") == "verified" or dl.get("verified") is None) else 0,
                dl.get("updated_at", now)
            ))

        # Insert telemetry
        tel_data = telemetry.get("telemetry", {}) if isinstance(telemetry, dict) else {}
        tok_data = telemetry.get("token_stats", {}) if isinstance(telemetry, dict) else {}
        c.execute("""
            INSERT OR REPLACE INTO project_telemetry (
                project_id, telemetry_json, token_stats_json, updated_at
            ) VALUES (?, ?, ?, ?);
        """, (
            new_id,
            json.dumps(tel_data),
            json.dumps(tok_data),
            now
        ))
        conn.commit()

    try:
        sync_project_part_markdown_file(new_id)
    except Exception:
        pass

    return get_project(new_id) or {}


def ensure_reference_lines_table(conn: Optional[sqlite3.Connection] = None):
    sql = """
    CREATE TABLE IF NOT EXISTS project_reference_lines (
        project_id TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        text_content TEXT NOT NULL,
        PRIMARY KEY (project_id, line_number)
    );
    """
    if conn is not None:
        conn.execute(sql)
    else:
        with get_connection() as c_conn:
            c_conn.execute(sql)
            c_conn.commit()


def save_project_reference_lines(project_id: str, lines: Any) -> int:
    """
    Stores reference markdown lines indexed 1..N in SQLite table
    project_reference_lines (project_id, line_number, text_content).
    """
    if not project_id:
        return 0
    rows: List[tuple] = []
    if isinstance(lines, dict):
        for ln, txt in sorted(lines.items(), key=lambda x: int(x[0])):
            rows.append((project_id, int(ln), str(txt if txt is not None else "")))
    elif isinstance(lines, str):
        for idx, txt in enumerate(lines.splitlines(), start=1):
            rows.append((project_id, idx, str(txt)))
    else:
        for idx, txt in enumerate(lines or [], start=1):
            rows.append((project_id, idx, str(txt if txt is not None else "")))

    with get_connection() as conn:
        ensure_reference_lines_table(conn)
        c = conn.cursor()
        c.execute("DELETE FROM project_reference_lines WHERE project_id = ?;", (project_id,))
        if rows:
            c.executemany(
                "INSERT OR REPLACE INTO project_reference_lines (project_id, line_number, text_content) VALUES (?, ?, ?);",
                rows
            )
        conn.commit()
    return len(rows)


def get_project_reference_lines(
    project_id: Optional[str],
    from_line: Optional[int] = None,
    to_line: Optional[int] = None
) -> Dict[int, str]:
    """
    Retrieves reference markdown lines indexed by line_number (1..N) from project_reference_lines.
    """
    if not project_id:
        return {}
    with get_connection() as conn:
        ensure_reference_lines_table(conn)
        c = conn.cursor()
        clauses = ["project_id = ?"]
        params: List[Any] = [project_id]
        if from_line is not None and from_line > 0:
            clauses.append("line_number >= ?")
            params.append(int(from_line))
        if to_line is not None and to_line > 0:
            clauses.append("line_number <= ?")
            params.append(int(to_line))
        sql = f"SELECT line_number, text_content FROM project_reference_lines WHERE {' AND '.join(clauses)} ORDER BY line_number ASC;"
        rows = c.execute(sql, tuple(params)).fetchall()
        return {int(r["line_number"]): r["text_content"] for r in rows}


def get_project_reference_count(project_id: Optional[str]) -> int:
    if not project_id:
        return 0
    with get_connection() as conn:
        ensure_reference_lines_table(conn)
        row = conn.execute(
            "SELECT COUNT(*) FROM project_reference_lines WHERE project_id = ?;",
            (project_id,)
        ).fetchone()
        return int(row[0] or 0) if row else 0


def clear_project_reference_lines(project_id: str) -> int:
    if not project_id:
        return 0
    with get_connection() as conn:
        ensure_reference_lines_table(conn)
        c = conn.cursor()
        c.execute("DELETE FROM project_reference_lines WHERE project_id = ?;", (project_id,))
        conn.commit()
        return c.rowcount


def ensure_vfs_files_table(conn: Optional[sqlite3.Connection] = None):
    sql = """
    CREATE TABLE IF NOT EXISTS vfs_files (
        project_id TEXT NOT NULL,
        path TEXT NOT NULL,
        normalized_path TEXT DEFAULT '',
        ext TEXT DEFAULT '',
        content TEXT DEFAULT '',
        start_md_line INTEGER DEFAULT 0,
        end_md_line INTEGER DEFAULT 0,
        expected_lines INTEGER DEFAULT 0,
        actual_lines INTEGER DEFAULT 0,
        expected_chars INTEGER DEFAULT 0,
        actual_chars INTEGER DEFAULT 0,
        tag_status TEXT DEFAULT 'verified',
        source_frame_ids_json TEXT DEFAULT '[]',
        metadata_json TEXT DEFAULT '{}',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, path),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    """
    if conn is not None:
        conn.execute(sql)
    else:
        with get_connection() as c_conn:
            c_conn.execute(sql)
            c_conn.commit()


def _upsert_vfs_files_cursor(c: sqlite3.Cursor, project_id: str, vfs_files: List[Dict[str, Any]], now: str):
    c.execute("DELETE FROM vfs_files WHERE project_id = ?;", (project_id,))
    if not vfs_files:
        return
    rows = []
    for vf in vfs_files:
        if not isinstance(vf, dict):
            continue
        path = str(vf.get("path") or vf.get("normalized_path") or "")
        if not path:
            continue
        norm_path = str(vf.get("normalized_path") or path)
        ext = str(vf.get("ext") or "")
        content = str(vf.get("content") or "")
        start_ln = int(vf.get("start_md_line") or 0)
        end_ln = int(vf.get("end_md_line") or 0)
        exp_lines = int(vf.get("expected_lines") or 0)
        act_lines = int(vf.get("actual_lines") or 0)
        exp_chars = int(vf.get("expected_chars") or 0)
        act_chars = int(vf.get("actual_chars") or len(content))
        tag_status = str(vf.get("tag_status") or "verified")
        fids_json = json.dumps(vf.get("source_frame_ids") or [])
        meta_copy = {k: v for k, v in vf.items() if k != "content"}
        meta_json = json.dumps(meta_copy)
        rows.append((
            project_id, path, norm_path, ext, content,
            start_ln, end_ln, exp_lines, act_lines, exp_chars, act_chars,
            tag_status, fids_json, meta_json, now
        ))
    if rows:
        c.executemany(
            """INSERT OR REPLACE INTO vfs_files (
                project_id, path, normalized_path, ext, content,
                start_md_line, end_md_line, expected_lines, actual_lines,
                expected_chars, actual_chars, tag_status,
                source_frame_ids_json, metadata_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);""",
            rows
        )


def save_vfs_files(project_id: str, vfs_files: List[Dict[str, Any]]) -> int:
    if not project_id:
        return 0
    now = datetime.now().isoformat()
    with get_connection() as conn:
        ensure_vfs_files_table(conn)
        c = conn.cursor()
        _upsert_vfs_files_cursor(c, project_id, vfs_files, now)
        conn.commit()
    return len(vfs_files or [])


def get_vfs_files(project_id: Optional[str]) -> List[Dict[str, Any]]:
    if not project_id:
        return []
    with get_connection() as conn:
        ensure_vfs_files_table(conn)
        rows = conn.execute(
            "SELECT * FROM vfs_files WHERE project_id = ? ORDER BY start_md_line ASC, path ASC;",
            (project_id,)
        ).fetchall()
        result: List[Dict[str, Any]] = []
        for idx, r in enumerate(rows, start=1):
            try:
                meta = json.loads(r["metadata_json"] or "{}")
            except Exception:
                meta = {}
            try:
                fids = json.loads(r["source_frame_ids_json"] or "[]")
            except Exception:
                fids = []
            entry = dict(meta)
            entry.update({
                "index": entry.get("index", idx),
                "path": r["path"],
                "normalized_path": r["normalized_path"] or r["path"],
                "ext": r["ext"],
                "content": r["content"],
                "start_md_line": r["start_md_line"],
                "end_md_line": r["end_md_line"],
                "expected_lines": r["expected_lines"],
                "actual_lines": r["actual_lines"],
                "expected_chars": r["expected_chars"],
                "actual_chars": r["actual_chars"],
                "tag_status": r["tag_status"],
                "source_frame_ids": fids,
                "updated_at": r["updated_at"],
            })
            result.append(entry)
        return result


def save_dirty_state_transaction(
    project_id: str,
    dirty_frames: Optional[List[Dict[str, Any]]] = None,
    dirty_lines: Optional[Dict[int, Any]] = None,
    deleted_lines: Optional[List[int]] = None,
    clear_all_lines: bool = False,
    telemetry: Optional[Dict[str, Any]] = None,
    token_stats: Optional[Dict[str, Any]] = None,
    vfs_files: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """
    Commits dirty frames, dirty document_lines, deleted lines, vfs_files, and telemetry
    for project_id in a single atomic SQLite WAL transaction.
    """
    if not project_id:
        return
    now = datetime.now().isoformat()
    with get_connection() as conn:
        c = conn.cursor()

        if dirty_frames:
            frame_rows = []
            for f in dirty_frames:
                fid = f.get("frame_id")
                if not fid:
                    continue
                frame_rows.append((
                    fid,
                    project_id,
                    f.get("filename", f"{fid}.png"),
                    int(f.get("top_line", 0) or 0),
                    int(f.get("bottom_line", 0) or 0),
                    int(f.get("page_index", 1) or 1),
                    int(f.get("file_size", 0) or 0),
                    str(f.get("status", "processed") or "processed"),
                    int(f.get("extracted_line_count", 0) or 0),
                    float(f.get("custom_offset_y", 0.0) or 0.0),
                    json.dumps(f.get("token_usage") or {}),
                    json.dumps(f.get("bounding_boxes") or {}),
                    str(f.get("model_used", "") or ""),
                    str(f.get("created_at") or now),
                    int(f.get("arrow_count", 0) or 0),
                ))
            if frame_rows:
                c.executemany(
                    """INSERT OR REPLACE INTO frames (
                        frame_id, project_id, filename, top_line, bottom_line, page_index,
                        file_size, status, extracted_line_count, custom_offset_y,
                        token_usage_json, bounding_boxes_json, model_used, created_at, arrow_count
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);""",
                    frame_rows
                )

        if clear_all_lines:
            c.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        elif deleted_lines:
            del_list = [int(ln) for ln in deleted_lines]
            for i in range(0, len(del_list), 500):
                chunk = del_list[i:i + 500]
                placeholders = ",".join("?" * len(chunk))
                c.execute(
                    f"DELETE FROM document_lines WHERE project_id = ? AND line_number IN ({placeholders});",
                    [project_id] + chunk
                )

        if dirty_lines:
            line_rows = [
                _extract_line_row(project_id, lnum, ld, now)
                for lnum, ld in dirty_lines.items()
            ]
            if line_rows:
                c.executemany(
                    """INSERT OR REPLACE INTO document_lines (
                        project_id, line_number, line_text, confidence, frame_id, is_verified, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?);""",
                    line_rows
                )

        if vfs_files is not None:
            ensure_vfs_files_table(conn)
            _upsert_vfs_files_cursor(c, project_id, vfs_files, now)

        if telemetry is not None or token_stats is not None:
            c.execute(
                "INSERT OR REPLACE INTO project_telemetry (project_id, telemetry_json, token_stats_json, updated_at) VALUES (?, ?, ?, ?);",
                (
                    project_id,
                    json.dumps(telemetry or {}),
                    json.dumps(token_stats or {}),
                    now,
                )
            )

        c.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id))
        conn.commit()



