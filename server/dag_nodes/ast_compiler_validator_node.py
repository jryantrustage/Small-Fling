"""
Standalone DAG Node 11: AST & TypeScript Compiler Check (ast_compiler_validator)
Invokes the persistent Node.js worker (server/services/ts_analyzer_worker.mjs) using the
TypeScript Compiler API (typescript) and in-memory VFS (memfs) to parse and validate all
.ts, .tsx, .js, .jsx, .json, and .css files extracted by Node 10.
Maps compiler diagnostics back to global_md_line = file_entry.start_md_line + file_line,
re-crops the source PNG frame & runs OCR/symbol repair, and re-verifies compilation in memfs.
"""

import asyncio
import json
import re
import subprocess
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import db
from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services import state
from services.accuracy_verifier import (
    find_frame_for_line,
    _re_ocr_strip_with_upscale,
    resolve_project_id,
)

WORKER_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "services" / "ts_analyzer_worker.mjs"


class TsAnalyzerWorkerClient:
    """
    Manages a persistent Node.js subprocess running ts_analyzer_worker.mjs
    for fast in-memory VFS TypeScript/JSON/CSS AST validation.
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

    def validate_files_sync(self, vfs_files: List[Dict[str, Any]]) -> Dict[str, Any]:
        req_id = f"req_{uuid.uuid4().hex[:8]}"
        payload = {
            "id": req_id,
            "action": "validate",
            "files": [
                {
                    "path": f.get("path", ""),
                    "normalized_path": f.get("normalized_path", ""),
                    "ext": f.get("ext", ""),
                    "content": f.get("content", ""),
                    "start_md_line": f.get("start_md_line", 0),
                    "end_md_line": f.get("end_md_line", 0),
                }
                for f in vfs_files
            ],
        }
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
                    return json.loads(resp_line)
                except Exception as e:
                    if self._proc:
                        try:
                            self._proc.kill()
                        except Exception:
                            pass
                        self._proc = None
                    if attempt == 1:
                        return {
                            "status": "error",
                            "error": str(e),
                            "total_files": len(vfs_files),
                            "compilable_files": 0,
                            "syntax_errors_count": 0,
                            "diagnostics": [],
                        }
        return {
            "status": "error",
            "total_files": len(vfs_files),
            "compilable_files": 0,
            "syntax_errors_count": 0,
            "diagnostics": [],
        }


_ts_worker_client = TsAnalyzerWorkerClient()


def generate_ocr_symbol_repair_candidates(line_text: str, diag_message: str = "") -> List[str]:
    """
    Generates targeted candidate repairs for common OCR symbol errors on a single code line:
      - Unclosed backticks (` vs ' or missing closing `)
      - '|' vs 'I' vs 'l' in TypeScript union types or logical OR
      - ';' vs ':' at end of statement or inside type/property declarations
      - '{' vs '(' and '}' vs ')' mismatches
      - '= >' vs '=>' arrow corruption
      - Unclosed single or double quotes
    """
    s = line_text or ""
    if not s.strip():
        return []

    candidates: List[str] = []

    def _add(cand: str):
        if cand and cand != s and cand not in candidates:
            candidates.append(cand)

    # 1. Corrupted arrow '= >' -> '=>'
    if "= >" in s:
        _add(s.replace("= >", "=>"))

    # 2. Unclosed backticks (`)
    bt_count = s.count("`")
    if bt_count % 2 == 1:
        # Check if a single quote ' was misread instead of a closing/opening backtick `
        if "'" in s and "${" in s:
            _add(re.sub(r"'([^']*?\$?\{[^`']*?)'", r"`\1`", s))
            _add(s.replace("'", "`", 1))
            # Or replace last ' with `
            r_idx = s.rfind("'")
            if r_idx >= 0:
                _add(s[:r_idx] + "`" + s[r_idx + 1 :])
        # Append closing backtick before trailing semicolon/comma/paren
        m_trail = re.search(r"([;,)\]}]*)\s*$", s)
        if m_trail:
            split_pos = m_trail.start(1)
            _add(s[:split_pos] + "`" + s[split_pos:])

    # 3. Unclosed single or double quotes on a single line
    sq_count = len(re.findall(r"(?<!\\)'", s))
    if sq_count % 2 == 1 and "`" not in s:
        m_trail = re.search(r"([;,)\]}]*)\s*$", s)
        if m_trail:
            split_pos = m_trail.start(1)
            _add(s[:split_pos] + "'" + s[split_pos:])

    dq_count = len(re.findall(r'(?<!\\)"', s))
    if dq_count % 2 == 1 and "`" not in s:
        m_trail = re.search(r"([;,)\]}]*)\s*$", s)
        if m_trail:
            split_pos = m_trail.start(1)
            _add(s[:split_pos] + '"' + s[split_pos:])

    # 4. '|' vs 'I' vs 'l' in TypeScript union types or logical OR
    # e.g., 'string I number', 'boolean I null', 'a II b'
    if re.search(r"\b(?:string|number|boolean|any|void|null|undefined|unknown|never|JSX\.Element)\s+[Il]\s+\b", s):
        _add(
            re.sub(
                r"\b(string|number|boolean|any|void|null|undefined|unknown|never|JSX\.Element)\s+[Il]\s+",
                r"\1 | ",
                s,
            )
        )
    if re.search(r"\s+[Il]\s+(?:string|number|boolean|any|void|null|undefined|unknown|never)\b", s):
        _add(
            re.sub(
                r"\s+[Il]\s+(string|number|boolean|any|void|null|undefined|unknown|never)\b",
                r" | \1",
                s,
            )
        )
    if " II " in s or " Il " in s or " lI " in s:
        _add(s.replace(" II ", " || ").replace(" Il ", " || ").replace(" lI ", " || "))

    # 5. ';' vs ':' confusion
    # Trailing ':' where ';' is expected (e.g., import/export/return/const statements)
    stripped = s.rstrip()
    if stripped.endswith(":") and re.match(r"^\s*(?:import|export|return|const|let|var|type|throw)\b", stripped):
        _add(stripped[:-1] + ";")
    # ';' inside object/type property where ':' is expected (e.g. 'id; string;' -> 'id: string;')
    if re.match(r"^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\??\s*;\s*[a-zA-Z0-9_$'\"`{\[(]", s):
        _add(re.sub(r"^(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\??)\s*;\s*", r"\1: ", s, count=1))

    # 6. '{' vs '(' and '}' vs ')' mismatches
    # e.g., 'import { foo ) from' or 'import ( foo } from' or '({ a, b ))'
    if "{" in s and ")" in s and "}" not in s:
        if "import " in s or "export " in s or "const " in s:
            _add(re.sub(r"\{([^}]*?)\)", r"{\1}", s))
        if s.rstrip().endswith(")"):
            _add(s.rstrip()[:-1] + "}")
    if "(" in s and "}" in s and ")" not in s:
        _add(re.sub(r"\(([^)]*?)\}", r"(\1)", s))
        if s.rstrip().endswith("}"):
            _add(s.rstrip()[:-1] + ")")
    if s.count("(") > s.count(")") and "';' expected" in diag_message or "')' expected" in diag_message:
        m_semi = re.search(r"(;?\s*)$", s)
        if m_semi:
            pos = m_semi.start(1)
            _add(s[:pos] + ")" + s[pos:])
    if "'}' expected" in diag_message and not s.rstrip().endswith("}"):
        _add(s.rstrip() + " }")
    if "';' expected" in diag_message and not s.rstrip().endswith(";"):
        _add(s.rstrip() + ";")

    return candidates


def _resolve_frame_and_bbox_for_md_line(
    global_md_line: int,
    file_entry: Dict[str, Any],
    project_id: Optional[str] = None
) -> Tuple[str, Optional[Path], Optional[Dict[str, Any]]]:
    """
    Looks up the originating frame_id, PNG disk path, and line bounding box for global_md_line.
    """
    doc_entry = state.document_lines.get(global_md_line)
    fid = ""
    if isinstance(doc_entry, dict):
        fid = str(doc_entry.get("frame_id") or "")
    elif hasattr(doc_entry, "meta"):
        fid = str(doc_entry.meta.get("frame_id") or "")

    if not fid:
        for cand_fid in file_entry.get("source_frame_ids", []):
            finfo = state.captured_frames.get(cand_fid)
            if finfo and (finfo.get("top_line", 0) <= global_md_line <= finfo.get("bottom_line", 0)):
                fid = cand_fid
                break
        if not fid and file_entry.get("source_frame_ids"):
            fid = file_entry["source_frame_ids"][0]

    img_path = find_frame_for_line(global_md_line, frame_id=fid)
    if not fid and img_path:
        fid = img_path.stem

    bbox = None
    finfo = state.captured_frames.get(fid) or {}
    line_boxes = (finfo.get("bounding_boxes") or {}).get("line_boxes") or {}
    bbox = line_boxes.get(global_md_line) or line_boxes.get(str(global_md_line))

    return fid, img_path, bbox


class AstCompilerValidatorNode(BaseDagNode):
    step = "11"
    id = "ast_compiler_validator"
    node_id = "ast_compiler_validator"
    title = "11. AST & TypeScript Compiler Check"
    short_name = "AST & TS Check"
    category = "post_capture_analyzer"
    accent_color = "#d2a8ff"
    default_position = {"x": 2260.0, "y": 140.0}
    default_config = {
        "auto_heal_syntax_errors": True,
        "max_heal_attempts_per_file": 10,
        "validate_css_and_json": True,
    }
    config = default_config.copy()

    def __init__(self):
        super().__init__()
        self.attached_actions = []

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        project_id = resolve_project_id(blackboard.project_id)
        blackboard.project_id = project_id
        cfg = self.get_config()

        vfs_files: List[Dict[str, Any]] = blackboard.metadata.get("vfs_files") or []
        if not vfs_files and hasattr(state, "analyzer_workspaces"):
            ws = state.analyzer_workspaces.get(project_id) or {}
            vfs_files = ws.get("vfs_files") or []

        if not vfs_files:
            # Run Node 10 automatically if vfs_files haven't been populated yet
            from dag_nodes.markdown_tag_parser_node import MarkdownTagParserNode
            parser_node = MarkdownTagParserNode()
            await parser_node.execute_core(blackboard)
            vfs_files = blackboard.metadata.get("vfs_files") or []

        # 1. Run initial compilation pass in persistent Node.js TypeScript + memfs worker
        initial_res = await asyncio.to_thread(_ts_worker_client.validate_files_sync, vfs_files)
        initial_diagnostics: List[Dict[str, Any]] = initial_res.get("diagnostics", [])

        files_by_norm: Dict[str, Dict[str, Any]] = {
            f["normalized_path"]: f for f in vfs_files if f.get("normalized_path")
        }

        auto_healed_lines_count = 0
        healed_lines_details: List[Dict[str, Any]] = []

        # 2. Enrich diagnostics with global_md_line & source frame_id, and attempt targeted self-healing
        if initial_diagnostics and cfg.get("auto_heal_syntax_errors", True):
            # Group diagnostics by file normalized_path
            diags_by_file: Dict[str, List[Dict[str, Any]]] = {}
            for d in initial_diagnostics:
                np_key = d.get("normalized_path") or ""
                if np_key in files_by_norm:
                    diags_by_file.setdefault(np_key, []).append(d)

            max_per_file = int(cfg.get("max_heal_attempts_per_file", 10))
            for norm_path, file_diags in diags_by_file.items():
                file_entry = files_by_norm[norm_path]
                code_lines = (file_entry.get("content") or "").split("\n")
                start_md_line = int(file_entry.get("start_md_line", 0))

                # Baseline error count on this single file
                single_check = await asyncio.to_thread(_ts_worker_client.validate_files_sync, [file_entry])
                cur_err_count = int(single_check.get("syntax_errors_count", len(file_diags)))

                attempted_file_lines = set()
                # Build candidate target lines: diagnostic reported lines + any lines with odd backticks or symbol corruptions
                target_line_tasks: List[Tuple[int, Dict[str, Any]]] = []
                for d in file_diags[:max_per_file]:
                    fl = int(d.get("file_line", 1))
                    if 1 <= fl <= len(code_lines):
                        target_line_tasks.append((fl, d))
                # If an Unterminated template literal or multi-line token error occurs, TS reports EOF line;
                # also inspect lines in the file that have odd backtick count or symbol repair candidates.
                for idx_ln, raw_code_ln in enumerate(code_lines, start=1):
                    if raw_code_ln.count("`") % 2 == 1 or generate_ocr_symbol_repair_candidates(raw_code_ln, ""):
                        if not any(t[0] == idx_ln for t in target_line_tasks):
                            target_line_tasks.append((idx_ln, file_diags[0]))

                for file_line, d in target_line_tasks[:max_per_file * 2]:
                    if cur_err_count == 0:
                        break
                    if file_line in attempted_file_lines or not (1 <= file_line <= len(code_lines)):
                        continue
                    attempted_file_lines.add(file_line)

                    global_md_line = start_md_line + file_line
                    orig_line_txt = code_lines[file_line - 1]
                    fid, img_path, bbox = _resolve_frame_and_bbox_for_md_line(
                        global_md_line, file_entry, project_id=project_id
                    )

                    candidate_lines: List[str] = []

                    # 2a. Targeted high-resolution OCR re-verification on original PNG frame crop
                    if img_path and img_path.exists():
                        finfo = state.captured_frames.get(fid) or {}
                        gbox = ((finfo.get("bounding_boxes") or {}).get("gutter_boxes") or {}).get(global_md_line)
                        line_item = {
                            "line_number": global_md_line,
                            "gutter_number": global_md_line,
                            "text": orig_line_txt,
                            "bbox": bbox,
                            "gutter_bbox": gbox,
                        }
                        try:
                            re_ocr_txt, blank_locked, _ = await asyncio.to_thread(
                                _re_ocr_strip_with_upscale,
                                img_path,
                                line_item,
                                global_md_line,
                                "",
                            )
                            if not blank_locked and re_ocr_txt and re_ocr_txt != orig_line_txt:
                                candidate_lines.append(re_ocr_txt)
                                for sub_c in generate_ocr_symbol_repair_candidates(re_ocr_txt, d.get("message", "")):
                                    if sub_c not in candidate_lines:
                                        candidate_lines.append(sub_c)
                        except Exception:
                            pass

                    # 2b. Symbol repair candidates on original OCR line
                    for sym_c in generate_ocr_symbol_repair_candidates(orig_line_txt, d.get("message", "")):
                        if sym_c not in candidate_lines:
                            candidate_lines.append(sym_c)

                    # 2c. Test each candidate in memfs via ts_analyzer_worker
                    for cand_txt in candidate_lines:
                        trial_lines = list(code_lines)
                        trial_lines[file_line - 1] = cand_txt
                        trial_entry = dict(file_entry)
                        trial_entry["content"] = "\n".join(trial_lines)

                        trial_res = await asyncio.to_thread(_ts_worker_client.validate_files_sync, [trial_entry])
                        trial_errs = int(trial_res.get("syntax_errors_count", cur_err_count))

                        if trial_errs < cur_err_count:
                            # Candidate resolved syntax error(s)! Commit patch to VFS and state.document_lines
                            code_lines[file_line - 1] = cand_txt
                            file_entry["content"] = "\n".join(code_lines)
                            cur_err_count = trial_errs
                            auto_healed_lines_count += 1

                            if hasattr(state, "document_lines"):
                                existing_ml = state.document_lines.get(global_md_line)
                                meta = (
                                    getattr(existing_ml, "meta", {}).copy()
                                    if (existing_ml and hasattr(existing_ml, "meta"))
                                    else (dict(existing_ml) if isinstance(existing_ml, dict) else {})
                                )
                                meta.update({
                                    "line_number": global_md_line,
                                    "gutter_number": global_md_line,
                                    "status": "verified",
                                    "ast_healed": True,
                                    "frame_id": fid,
                                    "updated_at": datetime.now().isoformat(),
                                })
                                state.document_lines[global_md_line] = state.MasterLine(cand_txt, **meta)

                            if project_id:
                                try:
                                    db.save_document_line(
                                        project_id=project_id,
                                        line_number=global_md_line,
                                        text=cand_txt,
                                        confidence=0.99,
                                        frame_id=fid,
                                        verified=True,
                                    )
                                except Exception:
                                    pass

                            healed_lines_details.append({
                                "file_path": file_entry.get("path"),
                                "normalized_path": norm_path,
                                "file_line": file_line,
                                "global_md_line": global_md_line,
                                "frame_id": fid,
                                "bbox": bbox,
                                "original_text": orig_line_txt,
                                "healed_text": cand_txt,
                                "diagnostic_code": d.get("code"),
                                "diagnostic_message": d.get("message"),
                            })
                            break

        if auto_healed_lines_count > 0:
            try:
                state.save_persisted_state()
            except Exception:
                pass
            final_res = await asyncio.to_thread(_ts_worker_client.validate_files_sync, vfs_files)
        else:
            final_res = initial_res

        # Enrich final diagnostics with global_md_line, frame_id, and bbox
        final_diagnostics: List[Dict[str, Any]] = []
        for d in final_res.get("diagnostics", []):
            norm_p = d.get("normalized_path") or ""
            f_entry = files_by_norm.get(norm_p) or {}
            f_line = int(d.get("file_line", 1))
            g_md_line = int(f_entry.get("start_md_line", 0)) + f_line
            fid, _, bbox = _resolve_frame_and_bbox_for_md_line(g_md_line, f_entry, project_id=project_id)
            enriched = dict(d)
            enriched.update({
                "global_md_line": g_md_line,
                "frame_id": fid,
                "bbox": bbox,
            })
            final_diagnostics.append(enriched)

        compilation_summary = {
            "total_files": int(final_res.get("total_files", len(vfs_files))),
            "compilable_files": int(final_res.get("compilable_files", 0)),
            "syntax_errors_count": len(final_diagnostics),
            "initial_syntax_errors_count": len(initial_diagnostics),
            "auto_healed_lines_count": auto_healed_lines_count,
            "healed_lines": healed_lines_details,
            "typescript_version": final_res.get("typescript_version", ""),
            "diagnostics": final_diagnostics,
            "file_statuses": final_res.get("file_statuses", {}),
        }

        blackboard.metadata["compilation_summary"] = compilation_summary

        if not hasattr(state, "analyzer_workspaces"):
            state.analyzer_workspaces = {}
        ws_entry = state.analyzer_workspaces.setdefault(project_id, {})
        ws_entry["compilation_summary"] = compilation_summary
        ws_entry["vfs_files"] = vfs_files
        ws_entry["validated_at"] = datetime.now().isoformat()

        if self.id in state.dag_state.get("nodes", {}):
            state.dag_state["nodes"][self.id].update({
                "status": "completed",
                "total_files": compilation_summary["total_files"],
                "compilable_files": compilation_summary["compilable_files"],
                "syntax_errors_count": compilation_summary["syntax_errors_count"],
                "auto_healed_lines_count": auto_healed_lines_count,
                "compilation_summary": compilation_summary,
                "evaluator": "TypeScript AST & VFS Compiler Validator",
                "healing_step": f"Auto-healed {auto_healed_lines_count} syntax error line(s)" if auto_healed_lines_count else None,
                "telemetry_insight": (
                    f"AST Check: {compilation_summary['compilable_files']}/{compilation_summary['total_files']} files compilable • "
                    f"{compilation_summary['syntax_errors_count']} errors ({auto_healed_lines_count} auto-healed)"
                ),
                "error": None,
            })

        return NodeExecutionResult(
            status="success",
            node_id=self.id,
            message=(
                f"AST & TS Check: {compilation_summary['compilable_files']}/{compilation_summary['total_files']} compilable "
                f"({auto_healed_lines_count} lines auto-healed, {compilation_summary['syntax_errors_count']} errors remaining)"
            ),
            data={
                "project_id": project_id,
                "compilation_summary": compilation_summary,
                **compilation_summary,
            },
        )
