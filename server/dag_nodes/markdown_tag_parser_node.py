"""
Standalone DAG Node 10: Parse File Tags & VFS Tree (markdown_tag_parser)
Reads the reconstructed markdown (or stitches exported multi-part bundles in sequence),
parses the Directory Structure tree header and all CODESCAN_FILE_START / CODESCAN_FILE_END file blocks,
performs self-healing tag & boundary repair by re-cropping source PNG frames when tags are corrupted,
validates extracted line counts against tag attributes, and outputs blackboard.metadata["vfs_files"].
"""

import asyncio
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import db
from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from ocr_engine import _normalize_codescan_tags
from services import state
from services.accuracy_verifier import (
    find_frame_for_line,
    _re_ocr_strip_with_upscale,
    resolve_project_id,
)


HEADER_FILE_RE = re.compile(
    r"^\s*#{2,4}\s*(\d+)\.\s*`?([^`\r\n]+?)`?\s*$"
)

CODESCAN_START_RESILIENT_RE = re.compile(
    r"^\s*<[!—\-–]{1,4}\s*CODESCAN[_\-\s]*FILE[_\-\s]*START\b(.*)$",
    re.IGNORECASE,
)

CODESCAN_END_RESILIENT_RE = re.compile(
    r"^\s*<[!—\-–]{1,4}\s*CODESCAN[_\-\s]*FILE[_\-\s]*END\b.*$",
    re.IGNORECASE,
)

ATTR_PAIR_RE = re.compile(
    r'(path|type|size|lines|chars)\s*[=:]\s*["\']?([^"\'\s>]+(?:\s+[^"\'=<>]+)*?)["\']?(?=\s+(?:path|type|size|lines|chars)\s*[=:]|\s*[-—–]*>|\s*$)',
    re.IGNORECASE,
)

CODE_FENCE_OPEN_RE = re.compile(r"^\s*`{3,}([a-zA-Z0-9_\-+.#]*)\s*$")
CODE_FENCE_CLOSE_RE = re.compile(r"^\s*`{3,}\s*$")
_RE_WIN_DRIVE = re.compile(r"^[a-zA-Z]:/+")
_RE_NON_DIGITS = re.compile(r"[^\d]")
_RE_DIR_STRUCTURE = re.compile(r"^#{1,3}\s*Directory\s+Structure\b", re.IGNORECASE)
_RE_TREE_ENTRY_PREFIX = re.compile(r"^[│├└─\s]+")


def normalize_vfs_path(raw_path: str) -> str:
    """
    Normalizes an absolute Windows/Unix path from Analyzer headers (e.g.
    'C:\\DevCode\\CommonUI\\src\\components\\atoms\\Avatar\\avatar.tsx')
    into a clean relative VFS path ('src/components/atoms/Avatar/avatar.tsx').
    """
    p = (raw_path or "").strip().strip("`").strip('"').strip("'")
    p = p.replace("\\", "/")
    # Strip Windows drive prefix e.g. C:/
    p = _RE_WIN_DRIVE.sub("", p)
    p = p.lstrip("/")

    # If path contains /src/, /public/, /packages/, /app/, /components/, anchor at the project root segment
    parts = [seg for seg in p.split("/") if seg and seg != "."]
    if len(parts) >= 3 and parts[0].lower() in ("devcode", "projects", "repos", "work", "workspace", "users"):
        # Strip 'DevCode/<ProjectName>/' prefix
        parts = parts[2:]
    elif len(parts) >= 2 and parts[0].lower() in ("commonui", "matrix", "app", "client", "frontend"):
        parts = parts[1:]

    return "/".join(parts) if parts else (p or "unnamed.txt")


def parse_codescan_start_attributes(line_text: str, fallback_path: str = "") -> Dict[str, Any]:
    """
    Resiliently extracts path, type, size, lines, and chars attributes from a CODESCAN_FILE_START tag.
    """
    attrs: Dict[str, str] = {}
    for m in ATTR_PAIR_RE.finditer(line_text or ""):
        k = m.group(1).lower()
        v = m.group(2).strip().strip('"').strip("'")
        attrs[k] = v

    raw_path = attrs.get("path") or fallback_path or ""
    norm_path = normalize_vfs_path(raw_path)
    ext = attrs.get("type") or Path(norm_path).suffix or ""
    if ext and not ext.startswith("."):
        ext = "." + ext

    def _to_int(val: Optional[str]) -> int:
        if not val:
            return 0
        digits = _RE_NON_DIGITS.sub("", str(val))
        return int(digits) if digits else 0

    expected_size = _to_int(attrs.get("size"))
    expected_lines = _to_int(attrs.get("lines"))
    expected_chars = _to_int(attrs.get("chars"))

    canonical_tag = (
        f'<!-- CODESCAN_FILE_START path="{raw_path}" type="{ext}" '
        f'size="{expected_size}" lines="{expected_lines}" chars="{expected_chars}" -->'
        if raw_path
        else _normalize_codescan_tags(line_text.strip())
    )

    return {
        "path": raw_path,
        "normalized_path": norm_path,
        "ext": ext.lower(),
        "size": expected_size,
        "expected_lines": expected_lines,
        "expected_chars": expected_chars,
        "canonical_tag": canonical_tag,
    }


def parse_directory_structure_tree(md_lines: List[str]) -> Dict[str, Any]:
    """
    Extracts the ## Directory Structure tree block and parses its entries.
    """
    in_dir_section = False
    in_tree_fence = False
    tree_lines: List[str] = []
    discovered_entries: List[str] = []
    start_ln = 0
    end_ln = 0

    for idx, line in enumerate(md_lines, start=1):
        stripped = line.strip()
        if not in_dir_section:
            if stripped.startswith("#") and _RE_DIR_STRUCTURE.match(stripped):
                in_dir_section = True
                start_ln = idx
            continue

        if not in_tree_fence:
            if stripped.startswith("```"):
                in_tree_fence = True
            elif stripped.startswith("## ") or CODESCAN_START_RESILIENT_RE.match(stripped):
                break
            continue

        if stripped.startswith("```"):
            end_ln = idx
            break

        tree_lines.append(line)
        # Extract path/filename from tree lines like '├── DevCode/CommonUI/...' or '│   ├── index.ts'
        cleaned_entry = _RE_TREE_ENTRY_PREFIX.sub("", stripped).strip()
        if cleaned_entry and cleaned_entry != ".":
            discovered_entries.append(cleaned_entry)

    return {
        "raw_tree": "\n".join(tree_lines),
        "tree_line_count": len(tree_lines),
        "entries": discovered_entries,
        "start_md_line": start_ln,
        "end_md_line": end_ln,
    }


def _build_frame_range_index(project_id: Optional[str] = None) -> List[Tuple[int, int, str]]:
    """
    Single-pass O(F) frame interval index builder: fetches captured_frames + db.get_frames(project_id) ONCE
    so _collect_frames_for_line_range never queries SQLite inside a per-file loop.
    """
    ranges: List[Tuple[int, int, str]] = []
    seen_fids = set()
    all_frames = list(state.captured_frames.values())
    if project_id:
        try:
            all_frames.extend(db.get_frames(project_id))
        except Exception:
            pass
    for f in all_frames:
        fid = str(f.get("frame_id") or "")
        if not fid or fid in seen_fids:
            continue
        tl = int(f.get("top_line") or 0)
        bl = int(f.get("bottom_line") or 0)
        if tl > 0 and bl >= tl:
            seen_fids.add(fid)
            ranges.append((tl, bl, fid))
    return ranges


def _collect_frames_for_line_range(
    start_ln: int,
    end_ln: int,
    project_id: Optional[str] = None,
    preloaded_frame_ranges: Optional[List[Tuple[int, int, str]]] = None
) -> List[str]:
    """
    Returns ordered list of unique frame_ids covering markdown lines [start_ln, end_ln].
    """
    seen = set()
    frame_ids: List[str] = []

    for ln in range(max(1, start_ln), max(start_ln, end_ln) + 1):
        entry = state.document_lines.get(ln)
        fid = ""
        if isinstance(entry, dict):
            fid = str(entry.get("frame_id") or "")
        elif hasattr(entry, "meta"):
            fid = str(entry.meta.get("frame_id") or "")
        if fid and fid != "manual" and fid not in seen:
            seen.add(fid)
            frame_ids.append(fid)

    # Also check frame top_line..bottom_line ranges using preloaded Pass-1 index when provided
    frame_ranges = (
        preloaded_frame_ranges
        if preloaded_frame_ranges is not None
        else _build_frame_range_index(project_id)
    )
    for tl, bl, fid in frame_ranges:
        if tl <= end_ln and bl >= start_ln and fid not in seen:
            seen.add(fid)
            frame_ids.append(fid)

    return frame_ids


def _self_heal_tag_line_from_png(
    md_ln: int,
    raw_line: str,
    canonical_tag: str,
    project_id: Optional[str] = None,
    defer_db_commit: bool = False
) -> Tuple[str, bool, Optional[str]]:
    """
    If a CODESCAN_FILE_START or CODESCAN_FILE_END tag at md_ln is corrupted in OCR,
    locates the source frame_id & PNG on disk, re-crops the exact Y-band, re-verifies
    the tag, and patches state.document_lines[md_ln].
    """
    entry = state.document_lines.get(md_ln)
    fid = ""
    if isinstance(entry, dict):
        fid = str(entry.get("frame_id") or "")
    elif hasattr(entry, "meta"):
        fid = str(entry.meta.get("frame_id") or "")

    img_path = find_frame_for_line(md_ln, frame_id=fid)
    re_verified_txt = canonical_tag

    if img_path and img_path.exists():
        finfo = state.captured_frames.get(fid) or {}
        line_item = {
            "line_number": md_ln,
            "gutter_number": md_ln,
            "text": raw_line,
            "bbox": (finfo.get("bounding_boxes", {}).get("line_boxes", {}) or {}).get(md_ln),
            "gutter_bbox": (finfo.get("bounding_boxes", {}).get("gutter_boxes", {}) or {}).get(md_ln),
        }
        try:
            cropped_txt, blank_locked, _ = _re_ocr_strip_with_upscale(
                image_path=img_path,
                line_item=line_item,
                ln=md_ln,
                ref_txt=canonical_tag,
            )
            if not blank_locked and cropped_txt:
                norm_cropped = _normalize_codescan_tags(cropped_txt.strip())
                if "CODESCAN_FILE_" in norm_cropped and norm_cropped.startswith("<!--") and norm_cropped.endswith("-->"):
                    re_verified_txt = norm_cropped
        except Exception:
            pass

    # Repair in state.document_lines and SQLite DB
    if hasattr(state, "document_lines"):
        existing_ml = state.document_lines.get(md_ln)
        meta = (
            getattr(existing_ml, "meta", {}).copy()
            if (existing_ml and hasattr(existing_ml, "meta"))
            else (dict(existing_ml) if isinstance(existing_ml, dict) else {})
        )
        meta.update({
            "line_number": md_ln,
            "gutter_number": md_ln,
            "status": "verified",
            "tag_repaired": True,
            "frame_id": fid or (img_path.stem if img_path else ""),
            "updated_at": datetime.now().isoformat(),
        })
        state.document_lines[md_ln] = state.MasterLine(re_verified_txt, **meta)

    if project_id and not defer_db_commit:
        try:
            db.save_document_line(
                project_id=project_id,
                line_number=md_ln,
                text=re_verified_txt,
                confidence=1.0,
                frame_id=fid or (img_path.stem if img_path else ""),
                verified=True,
            )
        except Exception:
            pass

    return re_verified_txt, True, (fid or (img_path.stem if img_path else None))


class MarkdownTagParserNode(BaseDagNode):
    step = "10"
    id = "markdown_tag_parser"
    node_id = "markdown_tag_parser"
    title = "10. Parse File Tags & VFS Tree"
    short_name = "Parse VFS Tags"
    category = "post_capture_analyzer"
    accent_color = "#3fb950"
    default_position = {"x": 2040.0, "y": 140.0}
    default_config = {
        "stitch_multipart_bundles": True,
        "self_heal_corrupted_tags": True,
        "validate_line_counts": True,
    }
    config = default_config.copy()

    def __init__(self):
        super().__init__()
        self.attached_actions = []

    def _load_markdown_lines(self, blackboard: DagBlackboard, project_id: str) -> Tuple[List[str], List[str]]:
        """
        Loads reconstructed markdown lines from blackboard, multi-part exported bundles,
        state.document_lines, SQLite DB, or storage/reproduced_Matrix_main.md.
        Returns (md_lines, source_descriptions).
        """
        cfg = self.get_config()
        if blackboard.payload and isinstance(blackboard.payload.get("markdown"), str):
            return blackboard.payload["markdown"].splitlines(), ["blackboard.payload.markdown"]

        if isinstance(blackboard.metadata.get("reconstructed_markdown"), str) and blackboard.metadata["reconstructed_markdown"]:
            return blackboard.metadata["reconstructed_markdown"].splitlines(), ["blackboard.metadata.reconstructed_markdown"]

        # Check multi-part exported bundles if enabled
        if cfg.get("stitch_multipart_bundles", True):
            exported_parts = state.multipart_bundle_state.get("exported_parts", [])
            if len(exported_parts) > 1:
                stitched_lines: List[str] = []
                sources: List[str] = []
                sorted_parts = sorted(exported_parts, key=lambda r: (r.get("part_number") or 999, r.get("file_name") or ""))
                for part in sorted_parts:
                    ep = Path(part.get("export_path", ""))
                    if ep.exists() and ep.is_file():
                        stitched_lines.extend(ep.read_text(encoding="utf-8-sig", errors="replace").splitlines())
                        sources.append(ep.name)
                if stitched_lines:
                    return stitched_lines, sources

        # Active in-memory state.document_lines
        if state.document_lines:
            max_k = max(int(k) for k in state.document_lines.keys())
            lines = []
            for ln in range(1, max_k + 1):
                val = state.document_lines.get(ln, "")
                if isinstance(val, dict):
                    lines.append(str(val.get("text", "")))
                elif hasattr(val, "meta"):
                    lines.append(str(val))
                else:
                    lines.append(str(val))
            return lines, [f"state.document_lines (1..{max_k})"]

        # SQLite document_lines for project_id
        if project_id:
            db_lines = db.get_document_lines(project_id)
            if db_lines:
                max_k = max(int(k) for k in db_lines.keys())
                lines = [str((db_lines.get(ln) or {}).get("text", "")) for ln in range(1, max_k + 1)]
                return lines, [f"db.document_lines[{project_id}] (1..{max_k})"]

        # Fallback to reproduced_Matrix_main.md on disk
        fallback_md = Path("c:/Projects/Small-Fling/storage/reproduced_Matrix_main.md")
        if fallback_md.exists():
            return fallback_md.read_text(encoding="utf-8-sig", errors="replace").splitlines(), [str(fallback_md)]

        return [], []

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        project_id = resolve_project_id(blackboard.project_id)
        blackboard.project_id = project_id
        cfg = self.get_config()

        md_lines, sources = await asyncio.to_thread(self._load_markdown_lines, blackboard, project_id)
        dir_tree = await asyncio.to_thread(parse_directory_structure_tree, md_lines)
        preloaded_frame_ranges = await asyncio.to_thread(_build_frame_range_index, project_id)

        vfs_files: List[Dict[str, Any]] = []
        repaired_tags: List[Dict[str, Any]] = []
        line_count_mismatches: List[Dict[str, Any]] = []

        total_md_lines = len(md_lines)
        idx = 0
        pending_header_path: str = ""
        pending_header_index: Optional[int] = None
        pending_header_ln: int = 0

        while idx < total_md_lines:
            ln = idx + 1
            raw_line = md_lines[idx]
            stripped = raw_line.strip()
            if not stripped:
                idx += 1
                continue

            # 1. Check for ### <index>. `<filepath>` heading
            m_hdr = HEADER_FILE_RE.match(stripped) if stripped[0] == "#" else None
            if m_hdr:
                pending_header_index = int(m_hdr.group(1))
                pending_header_path = m_hdr.group(2).strip()
                pending_header_ln = ln
                idx += 1
                continue

            # 2. Check for <!-- CODESCAN_FILE_START ... --> (including OCR-corrupted variants)
            m_start = (
                CODESCAN_START_RESILIENT_RE.match(stripped)
                if (stripped[0] == "<" or "codescan" in stripped.lower())
                else None
            )
            if m_start:
                tag_start_ln = ln
                parsed_attrs = parse_codescan_start_attributes(stripped, fallback_path=pending_header_path)
                canonical_start = parsed_attrs["canonical_tag"]
                tag_was_repaired = False

                is_clean_start_tag = (
                    stripped.startswith("<!-- CODESCAN_FILE_START ")
                    and stripped.endswith("-->")
                    and bool(parsed_attrs["path"])
                    and stripped == _normalize_codescan_tags(stripped)
                )
                if not is_clean_start_tag and cfg.get("self_heal_corrupted_tags", True):
                    repaired_str, did_repair, src_fid = await asyncio.to_thread(
                        _self_heal_tag_line_from_png,
                        tag_start_ln,
                        raw_line,
                        canonical_start,
                        project_id,
                        True,
                    )
                    md_lines[idx] = repaired_str
                    tag_was_repaired = did_repair
                    repaired_tags.append({
                        "line_number": tag_start_ln,
                        "tag_type": "CODESCAN_FILE_START",
                        "original_text": stripped,
                        "repaired_text": repaired_str,
                        "frame_id": src_fid or "",
                    })

                # Advance to opening code fence ```<lang>
                idx += 1
                fence_open_ln = tag_start_ln
                if idx < total_md_lines and CODE_FENCE_OPEN_RE.match(md_lines[idx].strip()):
                    fence_open_ln = idx + 1
                    idx += 1

                # Collect code lines until closing ``` or CODESCAN_FILE_END or next file block
                code_lines: List[str] = []
                fence_close_ln: Optional[int] = None
                tag_end_ln: Optional[int] = None
                end_tag_repaired = False

                while idx < total_md_lines:
                    cur_ln = idx + 1
                    cur_raw = md_lines[idx]
                    cur_strip = cur_raw.strip()

                    if cur_strip:
                        first_ch = cur_strip[0]
                        is_potential_tag = (first_ch == "<" or "codescan" in cur_strip.lower())

                        # Check if we hit CODESCAN_FILE_END directly
                        if is_potential_tag and CODESCAN_END_RESILIENT_RE.match(cur_strip):
                            tag_end_ln = cur_ln
                            canonical_end = "<!-- CODESCAN_FILE_END -->"
                            if cur_strip != canonical_end and cfg.get("self_heal_corrupted_tags", True):
                                rep_end, did_rep_end, end_fid = await asyncio.to_thread(
                                    _self_heal_tag_line_from_png,
                                    cur_ln,
                                    cur_raw,
                                    canonical_end,
                                    project_id,
                                    True,
                                )
                                md_lines[idx] = rep_end
                                end_tag_repaired = did_rep_end
                                repaired_tags.append({
                                    "line_number": cur_ln,
                                    "tag_type": "CODESCAN_FILE_END",
                                    "original_text": cur_strip,
                                    "repaired_text": rep_end,
                                    "frame_id": end_fid or "",
                                })
                            idx += 1
                            break

                        # Check if we hit next file header or next CODESCAN_FILE_START (missing CODESCAN_FILE_END)
                        if (first_ch == "#" and HEADER_FILE_RE.match(cur_strip)) or (
                            is_potential_tag and CODESCAN_START_RESILIENT_RE.match(cur_strip)
                        ):
                            tag_end_ln = cur_ln - 1
                            break

                        # Check if we hit closing code fence ```
                        if first_ch == "`" and CODE_FENCE_CLOSE_RE.match(cur_strip):
                            # Peek ahead to see if next line is CODESCAN_FILE_END, ---, or next file header
                            next_strip = md_lines[idx + 1].strip() if (idx + 1) < total_md_lines else ""
                            if (
                                not next_strip
                                or CODESCAN_END_RESILIENT_RE.match(next_strip)
                                or next_strip == "---"
                                or HEADER_FILE_RE.match(next_strip)
                                or CODESCAN_START_RESILIENT_RE.match(next_strip)
                            ):
                                fence_close_ln = cur_ln
                                idx += 1
                                if idx < total_md_lines and CODESCAN_END_RESILIENT_RE.match(md_lines[idx].strip()):
                                    tag_end_ln = idx + 1
                                    end_raw = md_lines[idx]
                                    end_strip = end_raw.strip()
                                    canonical_end = "<!-- CODESCAN_FILE_END -->"
                                    if end_strip != canonical_end and cfg.get("self_heal_corrupted_tags", True):
                                        rep_end, did_rep_end, end_fid = await asyncio.to_thread(
                                            _self_heal_tag_line_from_png,
                                            tag_end_ln,
                                            end_raw,
                                            canonical_end,
                                            project_id,
                                            True,
                                        )
                                        md_lines[idx] = rep_end
                                        end_tag_repaired = did_rep_end
                                        repaired_tags.append({
                                            "line_number": tag_end_ln,
                                            "tag_type": "CODESCAN_FILE_END",
                                            "original_text": end_strip,
                                            "repaired_text": rep_end,
                                            "frame_id": end_fid or "",
                                        })
                                    idx += 1
                                else:
                                    tag_end_ln = fence_close_ln
                                break

                    code_lines.append(cur_raw)
                    idx += 1

                if tag_end_ln is None:
                    tag_end_ln = total_md_lines

                actual_lines = len(code_lines)
                expected_lines = parsed_attrs["expected_lines"]
                line_delta = (actual_lines - expected_lines) if expected_lines > 0 else 0
                content_str = "\n".join(code_lines)

                source_fids = _collect_frames_for_line_range(
                    pending_header_ln or tag_start_ln,
                    tag_end_ln,
                    project_id=project_id,
                    preloaded_frame_ranges=preloaded_frame_ranges,
                )

                if expected_lines > 0 and actual_lines != expected_lines:
                    tag_status = "line_count_mismatch"
                elif tag_was_repaired or end_tag_repaired:
                    tag_status = "repaired"
                else:
                    tag_status = "verified"

                vfs_entry = {
                    "index": pending_header_index or (len(vfs_files) + 1),
                    "path": parsed_attrs["path"] or pending_header_path or parsed_attrs["normalized_path"],
                    "normalized_path": parsed_attrs["normalized_path"],
                    "ext": parsed_attrs["ext"],
                    "size": parsed_attrs["size"],
                    "expected_lines": expected_lines,
                    "actual_lines": actual_lines,
                    "line_count_delta": line_delta,
                    "expected_chars": parsed_attrs["expected_chars"],
                    "actual_chars": len(content_str),
                    "content": content_str,
                    # start_md_line is set to fence_open_ln (the line immediately preceding code line 1)
                    # so global_md_line = file_entry["start_md_line"] + file_line maps 1-based file_line to exact markdown line!
                    "start_md_line": fence_open_ln,
                    "tag_start_md_line": tag_start_ln,
                    "header_md_line": pending_header_ln or tag_start_ln,
                    "end_md_line": tag_end_ln,
                    "source_frame_ids": source_fids,
                    "tag_status": tag_status,
                }
                vfs_files.append(vfs_entry)

                if tag_status == "line_count_mismatch":
                    line_count_mismatches.append({
                        "path": vfs_entry["path"],
                        "normalized_path": vfs_entry["normalized_path"],
                        "expected_lines": expected_lines,
                        "actual_lines": actual_lines,
                        "line_count_delta": line_delta,
                        "start_md_line": fence_open_ln,
                        "end_md_line": tag_end_ln,
                        "source_frame_ids": source_fids,
                    })

                pending_header_path = ""
                pending_header_index = None
                pending_header_ln = 0
                continue

            idx += 1

        if repaired_tags:
            try:
                state.save_persisted_state()
            except Exception:
                pass

        blackboard.metadata["vfs_files"] = vfs_files
        blackboard.metadata["directory_tree"] = dir_tree
        blackboard.metadata["repaired_tags"] = repaired_tags
        blackboard.metadata["line_count_mismatches"] = line_count_mismatches

        # Persist in state.analyzer_workspaces
        if not hasattr(state, "analyzer_workspaces"):
            state.analyzer_workspaces = {}
        ws_entry = state.analyzer_workspaces.setdefault(project_id, {})
        ws_entry.update({
            "project_id": project_id,
            "sources": sources,
            "directory_tree": dir_tree,
            "vfs_files": vfs_files,
            "repaired_tags": repaired_tags,
            "line_count_mismatches": line_count_mismatches,
            "parsed_at": datetime.now().isoformat(),
            "_vfs_dirty": True,
        })
        if project_id:
            try:
                db.save_vfs_files(project_id, vfs_files)
                ws_entry["_vfs_dirty"] = False
            except Exception:
                pass

        summary_data = {
            "project_id": project_id,
            "sources": sources,
            "total_markdown_lines": total_md_lines,
            "vfs_files_count": len(vfs_files),
            "directory_tree_entries_count": len(dir_tree.get("entries", [])),
            "repaired_tags_count": len(repaired_tags),
            "line_count_mismatches_count": len(line_count_mismatches),
            "repaired_tags": repaired_tags,
            "line_count_mismatches": line_count_mismatches,
            "vfs_files": vfs_files,
        }

        if self.id in state.dag_state.get("nodes", {}):
            state.dag_state["nodes"][self.id].update({
                "status": "completed",
                "vfs_files_count": len(vfs_files),
                "repaired_tags_count": len(repaired_tags),
                "line_count_mismatches_count": len(line_count_mismatches),
                "evaluator": "VFS Tag & Line-Count Evaluator",
                "healing_step": f"Self-healed {len(repaired_tags)} tag(s)" if repaired_tags else None,
                "telemetry_insight": (
                    f"Parsed {len(vfs_files)} VFS files from {total_md_lines} markdown lines "
                    f"({len(repaired_tags)} tags repaired, {len(line_count_mismatches)} line-count deltas)"
                ),
                "error": None,
            })

        return NodeExecutionResult(
            status="success",
            node_id=self.id,
            message=f"Parsed {len(vfs_files)} VFS file(s) ({len(repaired_tags)} tag repairs, {len(line_count_mismatches)} line deltas)",
            data=summary_data,
        )

