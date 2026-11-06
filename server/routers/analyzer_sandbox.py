"""
FastAPI Router (`server/routers/analyzer_sandbox.py`) for Post-Capture Analyzer & Sandbox Monaco VFS.

Endpoints:
  - `GET /api/analyzer/workspace/{project_id}`:
      Returns the VFS file tree, file contents, tag parse report, compiler diagnostics,
      and `global_md_line -> frame_id` mapping.
  - `POST /api/analyzer/workspace/{project_id}/file`:
      Saves edits made in Monaco back to both the sandbox VFS and the corresponding
      `state.document_lines` range, then re-runs incremental TypeScript AST validation.
  - `POST /api/analyzer/workspace/{project_id}/verify-line-from-frame`:
      Given a `global_md_line`, returns the cropped PNG slice from the original screen capture
      alongside the current OCR text and VLM re-transcription.
"""

import asyncio
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import db
from dag_nodes.sandbox_ide_node import (
    _sanitize_rel_path,
    build_line_to_frame_source_map,
    build_vfs_hierarchy_tree,
)
from routers.orchestration import execute_dag_group_post_capture_analyzer
from services import state
from services.accuracy_verifier import resolve_project_id
from services.analyzer_bridge import (
    DEFAULT_TSCONFIG,
    analyzer_bridge,
    build_worker_files_map,
    verify_line_from_frame_slice_sync,
)

router = APIRouter(tags=["Analyzer Sandbox & Monaco VFS"])


class SaveVfsFileRequest(BaseModel):
    path: Optional[str] = None
    normalized_path: Optional[str] = None
    content: Optional[str] = None
    sync_document_lines: bool = True
    include_semantic: bool = False


class VerifyLineFromFrameRequest(BaseModel):
    global_md_line: int
    frame_id: Optional[str] = None
    run_vlm: bool = True
    apply_patch: bool = False


def _build_global_md_line_to_frame_id_map(
    source_map: Dict[str, Any],
    project_id: Optional[str] = None,
) -> Dict[int, str]:
    """
    Constructs a direct `{ global_md_line: frame_id }` mapping across all captured document lines
    and VFS source map entries.
    """
    mapping: Dict[int, str] = {}

    for ln, entry in state.document_lines.items():
        fid = ""
        if isinstance(entry, dict):
            fid = str(entry.get("frame_id") or "")
        elif hasattr(entry, "meta"):
            fid = str(entry.meta.get("frame_id") or "")
        if fid:
            mapping[int(ln)] = fid

    by_md_line = (source_map or {}).get("by_md_line") or {}
    for md_ln, info in by_md_line.items():
        if isinstance(info, dict) and info.get("frame_id"):
            mapping.setdefault(int(md_ln), str(info["frame_id"]))

    if not mapping and project_id:
        try:
            for ln, row in db.get_document_lines(project_id).items():
                if row.get("frame_id"):
                    mapping[int(ln)] = str(row["frame_id"])
        except Exception:
            pass

    return mapping


def _format_workspace_response(project_id: str, ws: Dict[str, Any]) -> Dict[str, Any]:
    vfs_files: List[Dict[str, Any]] = ws.get("vfs_files") or []
    files_map = build_worker_files_map(vfs_files)
    comp_summary = ws.get("compilation_summary") or {
        "total_files": len(vfs_files),
        "compilable_files": len(vfs_files),
        "syntax_errors_count": 0,
        "semantic_errors_count": 0,
        "auto_healed_lines_count": 0,
        "diagnostics": [],
        "syntactic_diagnostics": [],
        "semantic_diagnostics": [],
    }
    diagnostics = comp_summary.get("diagnostics") or []
    source_map = ws.get("line_to_frame_map") or build_line_to_frame_source_map(vfs_files)
    md_to_frame_id = _build_global_md_line_to_frame_id_map(source_map, project_id=project_id)
    source_map["global_md_line_to_frame_id"] = md_to_frame_id

    repaired_tags = ws.get("repaired_tags") or []
    line_count_mismatches = ws.get("line_count_mismatches") or []
    dir_tree = ws.get("directory_tree") or {}

    tag_parse_report = {
        "total_files": len([f for f in vfs_files if f.get("tag_status") != "generated"]),
        "total_vfs_files_with_generated": len(vfs_files),
        "repaired_tags_count": len(repaired_tags),
        "repaired_tags": repaired_tags,
        "line_count_mismatches_count": len(line_count_mismatches),
        "line_count_mismatches": line_count_mismatches,
        "directory_tree": dir_tree,
        "sources": ws.get("sources") or [],
    }

    return {
        **ws,
        "status": "ok",
        "project_id": project_id,
        "vfs_tree": ws.get("vfs_tree") or [],
        "vfs_files": vfs_files,
        "files": files_map,
        "tag_parse_report": tag_parse_report,
        "compiler_diagnostics": diagnostics,
        "syntactic_diagnostics": comp_summary.get("syntactic_diagnostics", diagnostics),
        "semantic_diagnostics": comp_summary.get("semantic_diagnostics", []),
        "compilation_summary": comp_summary,
        "global_md_line_to_frame_id": md_to_frame_id,
        "line_to_frame_map": source_map,
    }


@router.get("/api/analyzer/workspace")
@router.get("/api/analyzer/workspace/{project_id}")
async def get_analyzer_workspace_endpoint(
    project_id: Optional[str] = None,
    refresh: bool = False,
):
    """
    Returns the VFS file tree, file contents, tag parse report, compiler diagnostics,
    and `global_md_line -> frame_id` mapping.
    """
    pid = resolve_project_id(project_id)
    workspaces = getattr(state, "analyzer_workspaces", {}) or {}
    ws = workspaces.get(pid) or workspaces.get(project_id or "")

    if refresh or not ws or not ws.get("vfs_tree"):
        await execute_dag_group_post_capture_analyzer(project_id=pid)
        workspaces = getattr(state, "analyzer_workspaces", {}) or {}
        ws = workspaces.get(pid) or workspaces.get("default") or {}

    return _format_workspace_response(pid, ws)


@router.post("/api/analyzer/workspace/{project_id}/file")
@router.put("/api/analyzer/workspace/{project_id}/file")
@router.post("/api/analyzer/workspace/{project_id}")
async def save_analyzer_workspace_file_endpoint(
    project_id: str,
    payload: Dict[str, Any],
):
    """
    Saves edits made in Monaco back to both the sandbox VFS and the corresponding
    `state.document_lines` range, then re-runs incremental TypeScript AST validation.
    """
    pid = resolve_project_id(project_id)
    safe_project_id = re.sub(r"[^a-zA-Z0-9_\-.]", "_", pid or "default") or "default"

    raw_file_path = (payload.get("normalized_path") or payload.get("path") or payload.get("file") or "").strip()
    new_content = payload.get("content")
    sync_doc_lines = bool(payload.get("sync_document_lines", True))
    include_semantic = bool(payload.get("include_semantic", False))

    if not raw_file_path or new_content is None:
        # Full workspace rebuild requested
        res = await execute_dag_group_post_capture_analyzer(project_id=pid, payload=payload)
        ws = (getattr(state, "analyzer_workspaces", {}) or {}).get(pid) or {}
        formatted = _format_workspace_response(pid, ws)
        formatted["pipeline_result"] = res
        return formatted

    workspaces = getattr(state, "analyzer_workspaces", {}) or {}
    ws = workspaces.get(pid) or workspaces.get(safe_project_id)
    if not ws or not ws.get("vfs_files"):
        await execute_dag_group_post_capture_analyzer(project_id=pid)
        ws = (getattr(state, "analyzer_workspaces", {}) or {}).get(pid) or {}

    vfs_files: List[Dict[str, Any]] = list(ws.get("vfs_files") or [])
    norm_target = _sanitize_rel_path(raw_file_path)

    matched_entry: Optional[Dict[str, Any]] = None
    for f_entry in vfs_files:
        f_norm = _sanitize_rel_path(f_entry.get("normalized_path") or f_entry.get("path") or "")
        if f_norm == norm_target or f_entry.get("path") == raw_file_path:
            matched_entry = f_entry
            break

    new_content_str = str(new_content)
    new_lines = new_content_str.split("\n")
    updated_md_lines: List[int] = []

    if matched_entry is not None:
        start_md_line = int(matched_entry.get("start_md_line") or 0)
        old_actual_lines = int(matched_entry.get("actual_lines") or 0)
        matched_entry["content"] = new_content_str
        matched_entry["actual_lines"] = len(new_lines)
        matched_entry["actual_chars"] = len(new_content_str)
        expected_lines = int(matched_entry.get("expected_lines") or 0)
        matched_entry["line_count_delta"] = (len(new_lines) - expected_lines) if expected_lines > 0 else 0

        if start_md_line > 0 and sync_doc_lines:
            # Update the corresponding range in state.document_lines and SQLite
            default_fid = (
                matched_entry["source_frame_ids"][0]
                if matched_entry.get("source_frame_ids")
                else ""
            )
            max_span = max(old_actual_lines, len(new_lines))
            now_iso = datetime.now().isoformat()
            batch_dirty_lines = []
            for idx in range(1, len(new_lines) + 1):
                g_ln = start_md_line + idx
                ln_txt = new_lines[idx - 1]
                existing_ml = state.document_lines.get(g_ln)
                meta = (
                    getattr(existing_ml, "meta", {}).copy()
                    if (existing_ml and hasattr(existing_ml, "meta"))
                    else (dict(existing_ml) if isinstance(existing_ml, dict) else {})
                )
                fid = str(meta.get("frame_id") or default_fid)
                meta.update({
                    "line_number": g_ln,
                    "gutter_number": g_ln,
                    "frame_id": fid,
                    "status": "verified",
                    "edited_in_monaco": True,
                    "updated_at": now_iso,
                })
                state.document_lines[g_ln] = state.MasterLine(ln_txt, **meta)
                updated_md_lines.append(g_ln)
                batch_dirty_lines.append({
                    "line_number": g_ln,
                    "text": ln_txt,
                    "confidence": 1.0,
                    "frame_id": fid,
                    "verified": True,
                })
            if pid and pid != state.get_current_project_id() and batch_dirty_lines:
                try:
                    db.save_dirty_state_transaction(
                        pid,
                        dirty_lines=batch_dirty_lines,
                        deleted_lines=[],
                        cleared=False,
                        dirty_frames=[],
                        deleted_frames=[],
                        telemetry=None,
                    )
                except Exception:
                    pass
    else:
        matched_entry = {
            "index": len(vfs_files) + 1,
            "path": norm_target,
            "normalized_path": norm_target,
            "ext": Path(norm_target).suffix.lower(),
            "expected_lines": len(new_lines),
            "actual_lines": len(new_lines),
            "line_count_delta": 0,
            "content": new_content_str,
            "start_md_line": 0,
            "end_md_line": 0,
            "source_frame_ids": [],
            "tag_status": "edited",
        }
        vfs_files.append(matched_entry)

    # Materialize edited file to physical sandbox directory on disk
    project_root = Path(__file__).resolve().parent.parent.parent
    sandbox_dir = project_root / "server" / "storage" / "sandbox" / safe_project_id
    sandbox_dir.mkdir(parents=True, exist_ok=True)
    dest_file = (sandbox_dir / norm_target).resolve()
    if str(dest_file).startswith(str(sandbox_dir.resolve())):
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(dest_file.write_text, new_content_str, "utf-8")

    # Extract tsconfig from VFS if present
    tsconfig_obj = DEFAULT_TSCONFIG
    for f_item in vfs_files:
        if _sanitize_rel_path(f_item.get("normalized_path") or f_item.get("path") or "") == "tsconfig.json":
            try:
                tsconfig_obj = json.loads(f_item.get("content") or "{}")
            except Exception:
                tsconfig_obj = DEFAULT_TSCONFIG
            break

    # Re-run incremental TypeScript AST & semantic validation via analyzer_bridge
    ts_res = await analyzer_bridge.validate_files(
        files=vfs_files,
        tsconfig=tsconfig_obj,
        include_semantic_in_diagnostics=include_semantic,
        project_id=pid,
    )

    prev_comp = ws.get("compilation_summary") or {}
    compilation_summary = {
        "total_files": int(ts_res.get("total_files", len(vfs_files))),
        "compilable_files": int(ts_res.get("compilable_files", 0)),
        "syntax_errors_count": int(ts_res.get("syntax_errors_count", 0)),
        "semantic_errors_count": int(ts_res.get("semantic_errors_count", 0)),
        "auto_healed_lines_count": int(prev_comp.get("auto_healed_lines_count", 0)),
        "healed_lines": prev_comp.get("healed_lines", []),
        "typescript_version": ts_res.get("typescript_version", ""),
        "diagnostics": ts_res.get("diagnostics", []),
        "syntactic_diagnostics": ts_res.get("syntactic_diagnostics", []),
        "semantic_diagnostics": ts_res.get("semantic_diagnostics", []),
        "file_statuses": ts_res.get("file_statuses", {}),
    }

    diagnostics_by_file: Dict[str, List[Dict[str, Any]]] = {}
    for diag in compilation_summary["diagnostics"]:
        fp = _sanitize_rel_path(diag.get("normalized_path") or diag.get("file") or "")
        if fp:
            diagnostics_by_file.setdefault(fp, []).append(diag)

    vfs_tree = build_vfs_hierarchy_tree(vfs_files, diagnostics_by_file)
    source_map = build_line_to_frame_source_map(vfs_files)

    ws.update({
        "updated_at": datetime.now().isoformat(),
        "vfs_files": vfs_files,
        "vfs_tree": vfs_tree,
        "compilation_summary": compilation_summary,
        "line_to_frame_map": source_map,
        "_vfs_dirty": True,
    })
    state.analyzer_workspaces[pid] = ws
    state.analyzer_workspaces[safe_project_id] = ws
    if pid:
        try:
            db.save_vfs_files(pid, vfs_files)
            ws["_vfs_dirty"] = False
        except Exception:
            pass

    try:
        await asyncio.to_thread(state.save_persisted_state)
    except Exception:
        pass

    formatted = _format_workspace_response(pid, ws)
    formatted["updated_file"] = norm_target
    formatted["updated_global_md_lines"] = updated_md_lines
    formatted["file_diagnostics"] = diagnostics_by_file.get(norm_target, [])
    return formatted


@router.post("/api/analyzer/workspace/{project_id}/verify-line-from-frame")
async def verify_line_from_frame_endpoint(
    project_id: str,
    payload: Optional[Dict[str, Any]] = None,
    global_md_line: Optional[int] = Query(None),
    frame_id: Optional[str] = Query(None),
    run_vlm: bool = Query(True),
    apply_patch: bool = Query(False),
):
    """
    Given a `global_md_line`, returns the cropped PNG slice from the original screen capture
    alongside the current OCR text and VLM re-transcription.
    """
    payload = payload or {}
    target_md_line = payload.get("global_md_line") if "global_md_line" in payload else global_md_line
    if target_md_line is None:
        target_md_line = payload.get("line_number") or payload.get("line")
    if target_md_line is None or int(target_md_line) <= 0:
        raise HTTPException(status_code=400, detail="Valid 'global_md_line' (>= 1) is required.")

    fid_override = payload.get("frame_id") or frame_id
    should_run_vlm = bool(payload.get("run_vlm", run_vlm))
    should_apply = bool(payload.get("apply_patch", apply_patch))

    res = await asyncio.to_thread(
        verify_line_from_frame_slice_sync,
        project_id=project_id,
        global_md_line=int(target_md_line),
        frame_id_override=fid_override,
        run_vlm=should_run_vlm,
        apply_patch=should_apply,
    )
    return res

