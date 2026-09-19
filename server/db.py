import sqlite3
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
import os

DB_PATH = Path(__file__).parent / "data" / "matrix_capture.db"
DATA_DIR = Path(__file__).parent / "data"
FRAMES_DIR = Path(__file__).parent / "data" / "frames"

def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Projects Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            target_total_lines INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            is_active INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)

        # 2. Frames Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS frames (
            frame_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            top_line INTEGER NOT NULL,
            bottom_line INTEGER NOT NULL,
            page_index INTEGER NOT NULL,
            file_size INTEGER DEFAULT 0,
            status TEXT DEFAULT 'processed',
            extracted_line_count INTEGER DEFAULT 0,
            custom_offset_y REAL DEFAULT 0.0,
            token_usage_json TEXT DEFAULT '{}',
            bounding_boxes_json TEXT DEFAULT '{}',
            model_used TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        """)

        # 3. Document Lines Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_lines (
            project_id TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            line_text TEXT NOT NULL,
            confidence REAL DEFAULT 1.0,
            frame_id TEXT DEFAULT '',
            is_verified INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (project_id, line_number),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        """)

        # 4. Telemetry and Token Stats State per Project
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS project_telemetry (
            project_id TEXT PRIMARY KEY,
            telemetry_json TEXT DEFAULT '{}',
            token_stats_json TEXT DEFAULT '{}',
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        """)

        # Ensure default project exists
        cursor.execute("SELECT COUNT(*) as cnt FROM projects;")
        count = cursor.fetchone()["cnt"]
        if count == 0:
            now = datetime.now().isoformat()
            cursor.execute("""
            INSERT INTO projects (id, name, description, target_total_lines, status, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, ("proj_default", "Default Project", "Default MatrixCapture workspace", 0, "active", 1, now, now))
            
            cursor.execute("""
            INSERT INTO project_telemetry (project_id, telemetry_json, token_stats_json, updated_at)
            VALUES (?, ?, ?, ?);
            """, ("proj_default", "{}", "{}", now))
            conn.commit()

        # Migrate existing persisted_state.json if present and default project has no frames
        migrate_persisted_json_if_needed(conn)

def migrate_persisted_json_if_needed(conn: sqlite3.Connection):
    doc_file = DATA_DIR / "persisted_state.json"
    if not doc_file.exists():
        return

    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as cnt FROM frames WHERE project_id = 'proj_default';")
    if cursor.fetchone()["cnt"] > 0:
        return

    try:
        with open(doc_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        now = datetime.now().isoformat()
        
        # Insert frames
        frames = data.get("frames", {})
        for fid, f in frames.items():
            cursor.execute("""
            INSERT OR REPLACE INTO frames (
                frame_id, project_id, filename, top_line, bottom_line, page_index,
                file_size, status, extracted_line_count, custom_offset_y, token_usage_json,
                bounding_boxes_json, model_used, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                fid,
                "proj_default",
                f.get("filename", f"{fid}.png"),
                f.get("top_line", 0),
                f.get("bottom_line", 0),
                f.get("page_index", 1),
                f.get("file_size", 0),
                f.get("status", "processed"),
                f.get("extracted_line_count", 0),
                0.0,
                json.dumps(f.get("token_usage", {})),
                json.dumps(f.get("bounding_boxes", {})),
                f.get("model_used", ""),
                f.get("created_at", now)
            ))

        # Insert lines
        lines = data.get("lines", {})
        for lnum_str, ldata in lines.items():
            lnum = int(lnum_str)
            cursor.execute("""
            INSERT OR REPLACE INTO document_lines (
                project_id, line_number, line_text, confidence, frame_id, is_verified, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
            """, (
                "proj_default",
                lnum,
                ldata.get("text", ""),
                ldata.get("confidence", 1.0),
                ldata.get("frame_id", ""),
                1 if ldata.get("verified", False) else 0,
                now
            ))

        # Insert telemetry and tokens
        tel = data.get("latest_telemetry", {})
        tok = data.get("token_stats", {})
        cursor.execute("""
        INSERT OR REPLACE INTO project_telemetry (project_id, telemetry_json, token_stats_json, updated_at)
        VALUES (?, ?, ?, ?);
        """, ("proj_default", json.dumps(tel), json.dumps(tok), now))

        conn.commit()
        print("[DB] Successfully migrated persisted_state.json into SQLite 'proj_default'.")
    except Exception as e:
        print(f"[DB] Error migrating persisted_state.json: {e}")

# --- Project Management Functions ---

def get_active_project() -> Dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM projects WHERE is_active = 1 LIMIT 1;")
        row = cursor.fetchone()
        if row:
            return dict(row)
        # Fallback to first project or create default
        cursor.execute("SELECT * FROM projects LIMIT 1;")
        row = cursor.fetchone()
        if row:
            cursor.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (row["id"],))
            conn.commit()
            return dict(row)
        
        now = datetime.now().isoformat()
        cursor.execute("""
        INSERT INTO projects (id, name, description, target_total_lines, status, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, ("proj_default", "Default Project", "Default MatrixCapture workspace", 0, "active", 1, now, now))
        conn.commit()
        return {"id": "proj_default", "name": "Default Project", "description": "", "target_total_lines": 0, "status": "active", "is_active": 1, "created_at": now, "updated_at": now}

def get_projects() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT 
            p.*,
            COUNT(DISTINCT f.frame_id) as frame_count,
            COUNT(DISTINCT l.line_number) as line_count,
            MIN(l.line_number) as min_line,
            MAX(l.line_number) as max_line
        FROM projects p
        LEFT JOIN frames f ON p.id = f.project_id
        LEFT JOIN document_lines l ON p.id = l.project_id
        GROUP BY p.id
        ORDER BY p.updated_at DESC;
        """)
        return [dict(row) for row in cursor.fetchall()]

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT 
            p.*,
            COUNT(DISTINCT f.frame_id) as frame_count,
            COUNT(DISTINCT l.line_number) as line_count,
            MIN(l.line_number) as min_line,
            MAX(l.line_number) as max_line
        FROM projects p
        LEFT JOIN frames f ON p.id = f.project_id
        LEFT JOIN document_lines l ON p.id = l.project_id
        WHERE p.id = ?
        GROUP BY p.id;
        """, (project_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def create_project(name: str, description: str = "", target_total_lines: int = 0) -> Dict[str, Any]:
    now = datetime.now().isoformat()
    project_id = f"proj_{int(datetime.now().timestamp())}_{abs(hash(name)) % 10000}"
    with get_connection() as conn:
        cursor = conn.cursor()
        # Deactivate other projects
        cursor.execute("UPDATE projects SET is_active = 0;")
        cursor.execute("""
        INSERT INTO projects (id, name, description, target_total_lines, status, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (project_id, name.strip(), description.strip(), target_total_lines, "active", 1, now, now))
        
        cursor.execute("""
        INSERT INTO project_telemetry (project_id, telemetry_json, token_stats_json, updated_at)
        VALUES (?, ?, ?, ?);
        """, (project_id, "{}", "{}", now))
        conn.commit()
    return get_project(project_id) or {}

def activate_project(project_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM projects WHERE id = ?;", (project_id,))
        if not cursor.fetchone():
            return False
        cursor.execute("UPDATE projects SET is_active = 0;")
        cursor.execute("UPDATE projects SET is_active = 1, updated_at = ? WHERE id = ?;", (datetime.now().isoformat(), project_id))
        conn.commit()
        return True

def delete_project(project_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT is_active FROM projects WHERE id = ?;", (project_id,))
        row = cursor.fetchone()
        if not row:
            return False
        was_active = bool(row["is_active"])
        
        # Get frame filenames to delete
        cursor.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,))
        filenames = [r["filename"] for r in cursor.fetchall()]
        
        cursor.execute("DELETE FROM projects WHERE id = ?;", (project_id,))
        conn.commit()

        # Delete image files from disk
        for fn in filenames:
            try:
                (FRAMES_DIR / fn).unlink(missing_ok=True)
            except Exception:
                pass

        # If deleted project was active, make another project active
        if was_active:
            cursor.execute("SELECT id FROM projects ORDER BY updated_at DESC LIMIT 1;")
            fallback = cursor.fetchone()
            if fallback:
                cursor.execute("UPDATE projects SET is_active = 1 WHERE id = ?;", (fallback["id"],))
                conn.commit()
            else:
                # Re-initialize default project
                init_db()
        return True

def abort_project(project_id: str) -> bool:
    """
    Aborts a project, resets its line state, deletes captured frames from DB & disk,
    and sets its status to 'aborted'.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM projects WHERE id = ?;", (project_id,))
        if not cursor.fetchone():
            return False

        # Get filenames to purge
        cursor.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,))
        filenames = [r["filename"] for r in cursor.fetchall()]
        
        # Purge frames and lines
        cursor.execute("DELETE FROM frames WHERE project_id = ?;", (project_id,))
        cursor.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        
        now = datetime.now().isoformat()
        cursor.execute("UPDATE projects SET status = 'aborted', updated_at = ? WHERE id = ?;", (now, project_id))
        cursor.execute("UPDATE project_telemetry SET telemetry_json = '{}', updated_at = ? WHERE project_id = ?;", (now, project_id))
        conn.commit()

        for fn in filenames:
            try:
                (FRAMES_DIR / fn).unlink(missing_ok=True)
            except Exception:
                pass
        return True

def clear_project_data(project_id: str) -> bool:
    """
    Clears all frames and OCR lines for a project while keeping the project active and reset to 0 lines.
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM frames WHERE project_id = ?;", (project_id,))
        filenames = [r["filename"] for r in cursor.fetchall()]

        cursor.execute("DELETE FROM frames WHERE project_id = ?;", (project_id,))
        cursor.execute("DELETE FROM document_lines WHERE project_id = ?;", (project_id,))
        
        now = datetime.now().isoformat()
        cursor.execute("UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?;", (now, project_id))
        cursor.execute("UPDATE project_telemetry SET telemetry_json = '{}', updated_at = ? WHERE project_id = ?;", (now, project_id))
        conn.commit()

        for fn in filenames:
            try:
                (FRAMES_DIR / fn).unlink(missing_ok=True)
            except Exception:
                pass
        return True

# --- Frames Operations (Sequential Sorting) ---

def get_frames(project_id: str) -> List[Dict[str, Any]]:
    """
    Returns all frames for the given project, strictly sorted in ascending order
    by top_line, then page_index (Ln 1 -> 10 on top, Ln 11 -> 19 below, etc.)
    """
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT * FROM frames 
        WHERE project_id = ? 
        ORDER BY top_line ASC, page_index ASC, created_at ASC;
        """, (project_id,))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["token_usage"] = json.loads(d.get("token_usage_json") or "{}")
            except Exception:
                d["token_usage"] = {}
            try:
                d["bounding_boxes"] = json.loads(d.get("bounding_boxes_json") or "{}")
            except Exception:
                d["bounding_boxes"] = {}
            result.append(d)
        return result

def save_frame(
    project_id: str,
    frame_id: str,
    filename: str,
    top_line: int,
    bottom_line: int,
    page_index: int,
    file_size: int = 0,
    status: str = "processed",
    extracted_line_count: int = 0,
    custom_offset_y: float = 0.0,
    token_usage: Dict[str, Any] = None,
    bounding_boxes: Dict[str, Any] = None,
    model_used: str = "",
    created_at: str = None
) -> Dict[str, Any]:
    now = created_at or datetime.now().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT OR REPLACE INTO frames (
            frame_id, project_id, filename, top_line, bottom_line, page_index,
            file_size, status, extracted_line_count, custom_offset_y, token_usage_json,
            bounding_boxes_json, model_used, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            frame_id,
            project_id,
            filename,
            top_line,
            bottom_line,
            page_index,
            file_size,
            status,
            extracted_line_count,
            custom_offset_y,
            json.dumps(token_usage or {}),
            json.dumps(bounding_boxes or {}),
            model_used,
            now
        ))
        cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id))
        conn.commit()
    return {
        "frame_id": frame_id,
        "project_id": project_id,
        "filename": filename,
        "top_line": top_line,
        "bottom_line": bottom_line,
        "page_index": page_index,
        "file_size": file_size,
        "status": status,
        "extracted_line_count": extracted_line_count,
        "custom_offset_y": custom_offset_y,
        "token_usage": token_usage or {},
        "bounding_boxes": bounding_boxes or {},
        "model_used": model_used,
        "created_at": now
    }

def update_frame_position(frame_id: str, custom_offset_y: float) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE frames SET custom_offset_y = ? WHERE frame_id = ?;", (custom_offset_y, frame_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_frame(frame_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM frames WHERE frame_id = ?;", (frame_id,))
        row = cursor.fetchone()
        if not row:
            return False
        fn = row["filename"]
        cursor.execute("DELETE FROM frames WHERE frame_id = ?;", (frame_id,))
        cursor.execute("DELETE FROM document_lines WHERE frame_id = ?;", (frame_id,))
        conn.commit()
        try:
            (FRAMES_DIR / fn).unlink(missing_ok=True)
        except Exception:
            pass
        return True

# --- Document Lines Operations ---

def get_document_lines(project_id: str) -> Dict[int, Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT * FROM document_lines 
        WHERE project_id = ? 
        ORDER BY line_number ASC;
        """, (project_id,))
        rows = cursor.fetchall()
        result = {}
        for r in rows:
            result[r["line_number"]] = {
                "line_number": r["line_number"],
                "text": r["line_text"],
                "confidence": r["confidence"],
                "frame_id": r["frame_id"],
                "verified": bool(r["is_verified"]),
                "updated_at": r["updated_at"]
            }
        return result

def save_document_lines(project_id: str, lines: Dict[int, Dict[str, Any]]):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        for lnum, ldata in lines.items():
            cursor.execute("""
            INSERT OR REPLACE INTO document_lines (
                project_id, line_number, line_text, confidence, frame_id, is_verified, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?);
            """, (
                project_id,
                lnum,
                ldata.get("text", ""),
                ldata.get("confidence", 1.0),
                ldata.get("frame_id", ""),
                1 if ldata.get("verified", False) else 0,
                ldata.get("updated_at", now)
            ))
        cursor.execute("UPDATE projects SET updated_at = ? WHERE id = ?;", (now, project_id))
        conn.commit()

def save_document_line(project_id: str, line_number: int, text: str, confidence: float = 1.0, frame_id: str = "", verified: bool = False):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT OR REPLACE INTO document_lines (
            project_id, line_number, line_text, confidence, frame_id, is_verified, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (
            project_id,
            line_number,
            text,
            confidence,
            frame_id,
            1 if verified else 0,
            now
        ))
        conn.commit()

# --- Telemetry & Token Stats State Operations ---

def get_project_telemetry(project_id: str) -> Dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT telemetry_json, token_stats_json FROM project_telemetry WHERE project_id = ?;", (project_id,))
        row = cursor.fetchone()
        if row:
            try:
                tel = json.loads(row["telemetry_json"] or "{}")
            except Exception:
                tel = {}
            try:
                tok = json.loads(row["token_stats_json"] or "{}")
            except Exception:
                tok = {}
            return {"telemetry": tel, "token_stats": tok}
        return {"telemetry": {}, "token_stats": {}}

def save_project_telemetry(project_id: str, telemetry: Dict[str, Any], token_stats: Dict[str, Any]):
    now = datetime.now().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT OR REPLACE INTO project_telemetry (project_id, telemetry_json, token_stats_json, updated_at)
        VALUES (?, ?, ?, ?);
        """, (
            project_id,
            json.dumps(telemetry or {}),
            json.dumps(token_stats or {}),
            now
        ))
        conn.commit()
