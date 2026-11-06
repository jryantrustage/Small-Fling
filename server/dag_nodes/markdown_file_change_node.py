"""
Standalone DAG Node 0: Markdown File Change (Folder Queue Discovery & Automated Multi-Part File Switch)
Runs when 'Scan Folder' is clicked to predetermine the Teams/OneDrive folder queue (MD 1 / N .. MD N / N),
and runs on markdown part completion (100% EOF) to switch to the next file, maximize Fullscreen,
enable Edit Mode & Dark Mode before handing off to Phase I Initialize -> Phase II Capture & OCR Loop,
or handing off to Phase III Post-Capture Analyzer & Sandbox when all bundle files are complete.
"""

from typing import Dict, Any, List
from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial,
    detect_external_display_id,
)
from services.ui_automator_service import (
    predetermine_bundle_from_folder_screenshot,
    ensure_teams_maximized_and_dark_mode,
)
from services import state
import db


class MarkdownFileChangeNode(BaseDagNode):
    step = "0"
    id = "markdown_file_change"
    node_id = "markdown_file_change"
    title = "0. Markdown File Change (Folder Queue & Part Switch)"
    short_name = "Markdown File Change"
    category = "markdown_file_change"
    accent_color = "#d2a8ff"
    default_position = {"x": 20.0, "y": 40.0}
    default_config = {
        "mode": "auto",  # "scan_folder" | "switch_next" | "auto"
        "reopen_editor": True,
        "ensure_fullscreen": True,
        "ensure_dark_mode": True,
        "ensure_edit_mode": True,
        "auto_handoff_phase1": True,
        "auto_handoff_phase3_on_bundle_complete": True,
    }
    config = default_config.copy()

    def __init__(self):
        super().__init__()
        self.attached_actions = [
            "pin_authentication_guard",
            "folder_manifest_discovery",
            "fullscreen_dark_mode_guard",
        ]

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        cfg = blackboard.config or self.get_config()
        mode = str(cfg.get("mode") or "auto").lower()

        active_proj = db.get_active_project() or {}
        project_id = blackboard.project_id or active_proj.get("id")

        if mode == "auto":
            # If we are at 100% EOF on the current document and have a multipart queue, switch to next
            total_target = int(state.dag_state["nodes"]["init_end"].get("total_lines") or 0)
            max_cap = max(state.document_lines.keys()) if state.document_lines else 0
            if total_target > 0 and max_cap >= total_target:
                mode = "switch_next"
            else:
                mode = "scan_folder"

        node_state = state.dag_state["nodes"].get("markdown_file_change", {})

        if mode == "switch_next":
            from routers.dag_helpers import transition_to_next_multipart_project
            trans_res = await transition_to_next_multipart_project(
                serial=serial,
                current_project_id=project_id,
                broadcast_fn=None,
            )
            mp_state = state.sync_multipart_state_from_alignment()
            predetermined: List[Dict[str, Any]] = list(mp_state.get("predetermined_parts") or [])
            cur_part = int(mp_state.get("current_part") or 1)
            tot_parts = int(mp_state.get("total_parts") or len(predetermined) or 1)
            bundle_done = bool(trans_res.get("bundle_completed"))

            part_label = f"MD {cur_part} / {tot_parts}" if tot_parts > 0 else f"MD {cur_part}"
            detected_files = [str(p.get("file_name") or "") for p in predetermined if p.get("file_name")]

            node_state.update({
                "mode": "switch_next",
                "current_part": cur_part,
                "total_parts": tot_parts,
                "part_progress_label": part_label,
                "active_file_name": trans_res.get("next_file_name") or mp_state.get("next_file_name") or active_proj.get("part_file_name") or active_proj.get("name"),
                "next_file_name": mp_state.get("next_file_name"),
                "detected_files": detected_files,
                "predetermined_parts": predetermined,
                "bundle_completed": bundle_done,
                "fullscreen_verified": True,
                "dark_mode_verified": True,
            })

            passed = trans_res.get("status") in ("success", "bundle_completed")
            detail = (
                f"All {tot_parts} bundle files completed ({part_label}) -> Handing off to Phase III Analyzer & Sandbox"
                if bundle_done
                else f"Switched to {trans_res.get('next_file_name') or part_label} (Fullscreen + Dark Mode) -> Handing off to Phase I Initialize"
                if passed
                else f"File switch status: {trans_res.get('status')} ({trans_res.get('message', '')})"
            )
            return NodeExecutionResult(
                passed=passed,
                status="completed" if passed else "error",
                detail=detail,
                evaluator={
                    "type": "markdown_file_change_switch",
                    "passed": passed,
                    "expected": "Next bundle markdown opened in Fullscreen + Dark Mode or Bundle EOF",
                    "actual": detail,
                },
                extra_node_fields={
                    "mode": "switch_next",
                    "current_part": cur_part,
                    "total_parts": tot_parts,
                    "part_progress_label": part_label,
                    "active_file_name": node_state.get("active_file_name"),
                    "next_file_name": node_state.get("next_file_name"),
                    "detected_files": detected_files,
                    "predetermined_parts": predetermined,
                    "bundle_completed": bundle_done,
                    "transition_result": trans_res,
                },
            )

        # Default: mode == "scan_folder"
        reopen_editor = bool(cfg.get("reopen_editor", True))
        scan_res = await predetermine_bundle_from_folder_screenshot(
            serial=serial,
            display_id=disp_id,
            reopen_editor=reopen_editor,
            force_rescan=True,
        )
        if reopen_editor and (cfg.get("ensure_fullscreen", True) or cfg.get("ensure_dark_mode", True)):
            try:
                await ensure_teams_maximized_and_dark_mode(
                    serial,
                    disp_id,
                    enable_edit_mode=bool(cfg.get("ensure_edit_mode", True)),
                    enable_dark_mode=bool(cfg.get("ensure_dark_mode", True)),
                )
            except Exception as e:
                print(f"[MarkdownFileChangeNode] Fullscreen/Dark Mode post-scan guard warning: {e}")

        mp_state = state.sync_multipart_state_from_alignment()
        predetermined = list(mp_state.get("predetermined_parts") or [])
        cur_part = int(mp_state.get("current_part") or 1)
        tot_parts = int(mp_state.get("total_parts") or len(predetermined) or 1)
        part_label = f"MD {cur_part} / {tot_parts}" if tot_parts > 0 else f"MD {cur_part}"
        detected_files = [str(p.get("file_name") or "") for p in predetermined if p.get("file_name")]

        passed = bool(scan_res.get("status") == "success" or len(detected_files) > 0)
        detail = (
            f"Queued {len(detected_files)} markdown files ({part_label}): {', '.join(detected_files[:4])}"
            + (f" (+{len(detected_files) - 4} more)" if len(detected_files) > 4 else "")
            if detected_files
            else f"Folder scan completed ({scan_res.get('status', 'done')})"
        )

        return NodeExecutionResult(
            passed=passed,
            status="completed" if passed else "warning",
            detail=detail,
            evaluator={
                "type": "markdown_file_change_scan_folder",
                "passed": passed,
                "expected": ">= 1 markdown file detected in Teams/OneDrive folder queue",
                "actual": f"{len(detected_files)} files detected ({part_label})",
            },
            extra_node_fields={
                "mode": "scan_folder",
                "current_part": cur_part,
                "total_parts": tot_parts,
                "part_progress_label": part_label,
                "active_file_name": mp_state.get("last_opened_file") or (detected_files[0] if detected_files else None),
                "next_file_name": mp_state.get("next_file_name"),
                "detected_files": detected_files,
                "predetermined_parts": predetermined,
                "bundle_completed": False,
                "scan_result": scan_res,
            },
        )
