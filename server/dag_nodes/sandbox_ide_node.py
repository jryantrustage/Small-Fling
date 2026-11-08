"""
Standalone DAG Node 12: Sandbox & Monaco VFS Ready (sandbox_ide)
Materializes the parsed VFS files into server/storage/sandbox/<project_id>/,
generates or updates package.json and tsconfig.json if missing, links/installs physical
node_modules from a shared local cache (server/storage/shared_node_modules) using fast
junctions/symlinks, starts/refreshes the sandbox preview metadata, and publishes the
complete VFS tree, compiler diagnostics, and line-to-frame source map to
/api/analyzer/workspace/{project_id}.
"""

import asyncio
import json
import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services import state
from services.accuracy_verifier import resolve_project_id


def _sanitize_rel_path(rel_path: str) -> str:
    cleaned = (rel_path or "").strip().replace("\\", "/").lstrip("/")
    parts = [p for p in cleaned.split("/") if p not in ("", ".", "..")]
    return "/".join(parts)


def _create_directory_junction_or_symlink(link_path: Path, target_path: Path) -> bool:
    """
    Create a fast directory junction (Windows) or symlink (POSIX) from link_path -> target_path.
    """
    try:
        if not target_path.exists():
            return False
        if link_path.exists() or link_path.is_symlink():
            return True

        link_path.parent.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            proc = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(link_path), str(target_path)],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if proc.returncode == 0 and link_path.exists():
                return True
        try:
            os.symlink(str(target_path), str(link_path), target_is_directory=True)
            return True
        except Exception:
            return False
    except Exception:
        return False


def ensure_shared_node_modules(project_root: Path, shared_cache_dir: Path) -> bool:
    """
    Ensure `server/storage/shared_node_modules` is populated or linked from `web/node_modules`.
    """
    web_nm = project_root / "web" / "node_modules"
    if shared_cache_dir.exists():
        try:
            if any(shared_cache_dir.iterdir()):
                return True
        except Exception:
            pass

    if web_nm.exists():
        if shared_cache_dir.exists() and not any(shared_cache_dir.iterdir()):
            try:
                shared_cache_dir.rmdir()
            except Exception:
                pass
        if _create_directory_junction_or_symlink(shared_cache_dir, web_nm):
            return True

    shared_cache_dir.mkdir(parents=True, exist_ok=True)
    return shared_cache_dir.exists()


def build_vfs_hierarchy_tree(
    vfs_files: List[Dict[str, Any]],
    diagnostics_by_file: Dict[str, List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """
    Build a nested directory + file tree structure for Monaco Editor / VFS File Tree UI.
    """
    root_children: Dict[str, Any] = {}

    for f in sorted(vfs_files, key=lambda item: item.get("normalized_path", item.get("path", ""))):
        norm_path = _sanitize_rel_path(f.get("normalized_path") or f.get("path") or "")
        if not norm_path:
            continue
        parts = norm_path.split("/")
        cursor = root_children
        curr_rel = ""
        for idx, part in enumerate(parts):
            curr_rel = f"{curr_rel}/{part}" if curr_rel else part
            is_file = idx == len(parts) - 1
            if is_file:
                file_diags = diagnostics_by_file.get(norm_path, [])
                cursor[part] = {
                    "name": part,
                    "path": norm_path,
                    "type": "file",
                    "ext": f.get("ext") or Path(norm_path).suffix.lower(),
                    "size": f.get("size", 0),
                    "expected_size": f.get("expected_size", f.get("size", 0)),
                    "actual_size": f.get("actual_size", 0),
                    "size_delta": f.get("size_delta", 0),
                    "size_matches": f.get("size_matches", False),
                    "expected_lines": f.get("expected_lines", 0),
                    "actual_lines": f.get("actual_lines", 0),
                    "line_count_delta": f.get("line_count_delta", 0),
                    "lines_matches": f.get("lines_matches", False),
                    "expected_chars": f.get("expected_chars", 0),
                    "actual_chars": f.get("actual_chars", 0),
                    "chars_delta": f.get("chars_delta", 0),
                    "chars_matches": f.get("chars_matches", False),
                    "has_start_marker": f.get("has_start_marker", True),
                    "has_end_marker": f.get("has_end_marker", True),
                    "markers_paired": f.get("markers_paired", True),
                    "all_metrics_match": f.get("all_metrics_match", False),
                    "distinct_verification": f.get("distinct_verification"),
                    "mismatch_reasons": f.get("mismatch_reasons", []),
                    "tag_start_md_line": f.get("tag_start_md_line", f.get("start_md_line", 1)),
                    "start_md_line": f.get("start_md_line", 1),
                    "end_md_line": f.get("end_md_line", 1),
                    "source_frame_ids": f.get("source_frame_ids", []),
                    "tag_status": f.get("tag_status", "verified"),
                    "diagnostics_count": len(file_diags),
                    "diagnostics": file_diags,
                }
            else:
                if part not in cursor or cursor[part].get("type") != "directory":
                    cursor[part] = {
                        "name": part,
                        "path": curr_rel,
                        "type": "directory",
                        "children_map": {},
                    }
                cursor = cursor[part]["children_map"]

    def _serialize_map(node_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        dirs: List[Dict[str, Any]] = []
        files: List[Dict[str, Any]] = []
        for name, item in sorted(node_map.items(), key=lambda kv: kv[0].lower()):
            if item.get("type") == "directory":
                children = _serialize_map(item.get("children_map", {}))
                diag_sum = sum(int(c.get("diagnostics_count", 0)) for c in children)
                dirs.append(
                    {
                        "name": name,
                        "path": item["path"],
                        "type": "directory",
                        "diagnostics_count": diag_sum,
                        "children": children,
                    }
                )
            else:
                files.append(item)
        return dirs + files

    return _serialize_map(root_children)


def build_line_to_frame_source_map(vfs_files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build bidirectional mapping between:
      - VFS file lines `(normalized_path, file_line)` -> `{global_md_line, frame_id, bbox}`
      - Global markdown line `global_md_line` -> `{normalized_path, file_line, frame_id, bbox}`
    """
    by_file: Dict[str, Dict[int, Dict[str, Any]]] = {}
    by_md_line: Dict[int, Dict[str, Any]] = {}

    frame_lookup: Dict[str, Dict[str, Any]] = {}
    if isinstance(state.captured_frames, dict):
        for fid, fr in state.captured_frames.items():
            frame_lookup[str(fid)] = fr

    for f in vfs_files:
        norm_path = _sanitize_rel_path(f.get("normalized_path") or f.get("path") or "")
        if not norm_path:
            continue
        start_md_line = int(f.get("start_md_line") or 0)
        if start_md_line <= 0:
            # Generated config files (not originating from markdown lines)
            continue
        content = f.get("content") or ""
        lines_list = content.split("\n")
        file_map: Dict[int, Dict[str, Any]] = {}

        for idx in range(len(lines_list)):
            file_ln = idx + 1
            global_md_ln = start_md_line + file_ln
            doc_entry = state.document_lines.get(global_md_ln)
            frame_id = ""
            if isinstance(doc_entry, dict):
                frame_id = str(doc_entry.get("frame_id") or "")
            elif hasattr(doc_entry, "meta"):
                frame_id = str(doc_entry.meta.get("frame_id") or "")

            if not frame_id and f.get("source_frame_ids"):
                frame_id = str(f["source_frame_ids"][0])

            bbox = None
            if frame_id and frame_id in frame_lookup:
                fr = frame_lookup[frame_id]
                line_boxes = (fr.get("bounding_boxes") or {}).get("line_boxes") or {}
                bbox = line_boxes.get(global_md_ln) or line_boxes.get(str(global_md_ln))
                if bbox is None:
                    for gl in fr.get("ground_truth_lines") or []:
                        if int(gl.get("line_number", -1)) == global_md_ln:
                            bbox = gl.get("bbox")
                            break

            mapping_info = {
                "file_path": norm_path,
                "file_line": file_ln,
                "global_md_line": global_md_ln,
                "frame_id": frame_id,
                "bbox": bbox,
            }
            file_map[file_ln] = mapping_info
            by_md_line[global_md_ln] = mapping_info

        by_file[norm_path] = file_map

    return {
        "by_file": by_file,
        "by_md_line": by_md_line,
    }


class SandboxIdeNode(BaseDagNode):
    step = "12"
    id = "sandbox_ide"
    node_id = "sandbox_ide"
    title = "12. Sandbox & Monaco VFS Ready"
    short_name = "Sandbox & IDE"
    category = "post_capture_analyzer"
    accent_color = "#58a6ff"
    default_position = {"x": 2480.0, "y": 140.0}
    default_config = {
        "auto_link_node_modules": True,
        "generate_missing_configs": True,
        "start_preview_server": True,
    }
    config = default_config.copy()

    def __init__(self):
        super().__init__()
        self.attached_actions = []

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        project_id = resolve_project_id(blackboard.project_id)
        blackboard.project_id = project_id
        safe_project_id = re.sub(r"[^a-zA-Z0-9_\-.]", "_", project_id or "default") or "default"
        cfg = self.get_config()

        vfs_files: List[Dict[str, Any]] = blackboard.metadata.get("vfs_files") or []
        if not vfs_files and hasattr(state, "analyzer_workspaces"):
            ws = state.analyzer_workspaces.get(project_id) or {}
            vfs_files = ws.get("vfs_files") or []

        # If Node 10 / Node 11 haven't populated vfs_files yet, run them automatically
        if not vfs_files:
            from dag_nodes.markdown_tag_parser_node import MarkdownTagParserNode
            from dag_nodes.ast_compiler_validator_node import AstCompilerValidatorNode

            parser_node = MarkdownTagParserNode()
            await parser_node.execute_core(blackboard)
            vfs_files = blackboard.metadata.get("vfs_files") or []

            validator_node = AstCompilerValidatorNode()
            await validator_node.execute_core(blackboard)

        compilation_summary: Dict[str, Any] = blackboard.metadata.get("compilation_summary") or {}
        if not compilation_summary and hasattr(state, "analyzer_workspaces"):
            ws = state.analyzer_workspaces.get(project_id) or {}
            compilation_summary = ws.get("compilation_summary") or {}

        if not compilation_summary:
            from dag_nodes.ast_compiler_validator_node import AstCompilerValidatorNode
            validator_node = AstCompilerValidatorNode()
            await validator_node.execute_core(blackboard)
            compilation_summary = blackboard.metadata.get("compilation_summary") or {}

        project_root = Path(__file__).resolve().parent.parent.parent
        storage_root = project_root / "server" / "storage"
        sandbox_dir = storage_root / "sandbox" / safe_project_id
        shared_nm_dir = storage_root / "shared_node_modules"

        def _materialize_sandbox_sync() -> Dict[str, Any]:
            sandbox_dir.mkdir(parents=True, exist_ok=True)
            materialized_count = 0
            existing_rel_paths = set()
            materialized_vfs = list(vfs_files)

            for file_entry in materialized_vfs:
                norm_path = _sanitize_rel_path(file_entry.get("normalized_path") or file_entry.get("path") or "")
                if not norm_path:
                    continue
                existing_rel_paths.add(norm_path)
                dest_path = (sandbox_dir / norm_path).resolve()
                if not str(dest_path).startswith(str(sandbox_dir.resolve())):
                    continue
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                content = file_entry.get("content")
                if content is None:
                    content = ""
                dest_path.write_text(content, encoding="utf-8")
                materialized_count += 1

            generated_configs: List[str] = []
            if cfg.get("generate_missing_configs", True):
                pkg_json_path = sandbox_dir / "package.json"
                if "package.json" not in existing_rel_paths and not pkg_json_path.exists():
                    default_pkg = {
                        "name": f"codescan-sandbox-{safe_project_id.lower()}",
                        "private": True,
                        "version": "0.1.0",
                        "type": "module",
                        "scripts": {
                            "dev": "vite",
                            "build": "tsc && vite build",
                            "preview": "vite preview",
                        },
                        "dependencies": {
                            "react": "^19.0.0",
                            "react-dom": "^19.0.0",
                        },
                        "devDependencies": {
                            "typescript": "^5.8.0",
                            "vite": "^6.0.0",
                        },
                    }
                    pkg_content = json.dumps(default_pkg, indent=2) + "\n"
                    pkg_json_path.write_text(pkg_content, encoding="utf-8")
                    generated_configs.append("package.json")
                    materialized_vfs.append(
                        {
                            "index": len(materialized_vfs) + 1,
                            "path": "package.json",
                            "normalized_path": "package.json",
                            "ext": ".json",
                            "expected_lines": len(pkg_content.splitlines()),
                            "actual_lines": len(pkg_content.splitlines()),
                            "line_count_delta": 0,
                            "content": pkg_content,
                            "start_md_line": 0,
                            "end_md_line": 0,
                            "source_frame_ids": [],
                            "tag_status": "generated",
                        }
                    )
                    materialized_count += 1

                tsconfig_path = sandbox_dir / "tsconfig.json"
                if "tsconfig.json" not in existing_rel_paths and not tsconfig_path.exists():
                    default_tsconfig = {
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
                        },
                        "include": ["src", "."],
                    }
                    ts_content = json.dumps(default_tsconfig, indent=2) + "\n"
                    tsconfig_path.write_text(ts_content, encoding="utf-8")
                    generated_configs.append("tsconfig.json")
                    materialized_vfs.append(
                        {
                            "index": len(materialized_vfs) + 1,
                            "path": "tsconfig.json",
                            "normalized_path": "tsconfig.json",
                            "ext": ".json",
                            "expected_lines": len(ts_content.splitlines()),
                            "actual_lines": len(ts_content.splitlines()),
                            "line_count_delta": 0,
                            "content": ts_content,
                            "start_md_line": 0,
                            "end_md_line": 0,
                            "source_frame_ids": [],
                            "tag_status": "generated",
                        }
                    )
                    materialized_count += 1

            node_modules_linked = False
            if cfg.get("auto_link_node_modules", True):
                if ensure_shared_node_modules(project_root, shared_nm_dir):
                    sandbox_nm = sandbox_dir / "node_modules"
                    node_modules_linked = _create_directory_junction_or_symlink(sandbox_nm, shared_nm_dir)

            return {
                "materialized_count": materialized_count,
                "generated_configs": generated_configs,
                "node_modules_linked": node_modules_linked,
                "vfs_files": materialized_vfs,
            }

        mat_info = await asyncio.to_thread(_materialize_sandbox_sync)
        vfs_files = mat_info["vfs_files"]
        materialized_count = mat_info["materialized_count"]
        generated_configs = mat_info["generated_configs"]
        node_modules_linked = mat_info["node_modules_linked"]

        # Group diagnostics by normalized_path
        diagnostics_by_file: Dict[str, List[Dict[str, Any]]] = {}
        for diag in compilation_summary.get("diagnostics") or []:
            fp = _sanitize_rel_path(diag.get("normalized_path") or diag.get("file_path") or "")
            if fp:
                diagnostics_by_file.setdefault(fp, []).append(diag)

        vfs_tree = build_vfs_hierarchy_tree(vfs_files, diagnostics_by_file)
        source_map = build_line_to_frame_source_map(vfs_files)

        workspace_endpoint = f"/api/analyzer/workspace/{safe_project_id}"
        preview_server_info = {
            "status": "ready",
            "mode": "sandbox_vfs_preview",
            "sandbox_dir": str(sandbox_dir),
            "workspace_url": workspace_endpoint,
            "entry_candidates": [
                f.get("normalized_path")
                for f in vfs_files
                if f.get("normalized_path")
                in ("index.html", "src/main.tsx", "src/App.tsx", "src/index.tsx", "src/index.ts", "App.tsx")
            ],
            "updated_at": time.time(),
        }

        if not hasattr(state, "analyzer_workspaces") or not isinstance(state.analyzer_workspaces, dict):
            state.analyzer_workspaces = {}

        existing_ws = state.analyzer_workspaces.get(project_id) or {}
        workspace_payload = {
            **existing_ws,
            "status": "ok",
            "project_id": project_id,
            "safe_project_id": safe_project_id,
            "updated_at": datetime.now().isoformat(),
            "sandbox_dir": str(sandbox_dir),
            "shared_node_modules_dir": str(shared_nm_dir),
            "node_modules_linked": node_modules_linked,
            "generated_configs": generated_configs,
            "materialized_files_count": materialized_count,
            "directory_tree": blackboard.metadata.get("directory_tree") or existing_ws.get("directory_tree") or {},
            "vfs_files": vfs_files,
            "vfs_tree": vfs_tree,
            "compilation_summary": compilation_summary,
            "line_to_frame_map": source_map,
            "preview_server": preview_server_info,
            "workspace_endpoint": workspace_endpoint,
        }

        state.analyzer_workspaces[project_id] = workspace_payload
        state.analyzer_workspaces[safe_project_id] = workspace_payload
        state.analyzer_workspaces["default"] = workspace_payload

        blackboard.metadata["sandbox_workspace"] = workspace_payload
        blackboard.metadata["vfs_tree"] = vfs_tree
        blackboard.metadata["line_to_frame_map"] = source_map

        if self.id in state.dag_state.get("nodes", {}):
            state.dag_state["nodes"][self.id].update({
                "status": "completed",
                "sandbox_dir": str(sandbox_dir),
                "materialized_files_count": materialized_count,
                "generated_configs": generated_configs,
                "node_modules_linked": node_modules_linked,
                "workspace_endpoint": workspace_endpoint,
                "evaluator": "Sandbox & Monaco VFS Publisher",
                "healing_step": f"Generated {', '.join(generated_configs)}" if generated_configs else None,
                "telemetry_insight": (
                    f"Sandbox ready: {materialized_count} files in {sandbox_dir.name} • "
                    f"node_modules={'linked ✔' if node_modules_linked else 'unlinked'} • {workspace_endpoint}"
                ),
                "error": None,
            })

        return NodeExecutionResult(
            status="success",
            node_id=self.id,
            message=(
                f"Materialized {materialized_count} VFS files into {sandbox_dir} "
                f"(node_modules_linked={node_modules_linked}) and published to {workspace_endpoint}"
            ),
            data={
                "project_id": project_id,
                "sandbox_dir": str(sandbox_dir),
                "shared_node_modules_dir": str(shared_nm_dir),
                "materialized_files_count": materialized_count,
                "generated_configs": generated_configs,
                "node_modules_linked": node_modules_linked,
                "workspace_endpoint": workspace_endpoint,
                "preview_server": preview_server_info,
                "vfs_tree": vfs_tree,
                "line_to_frame_map_count": len(source_map.get("by_md_line", {})),
            },
        )
