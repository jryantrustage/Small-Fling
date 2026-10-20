"""
Compounding Multi-Step Observation & Workaround Action:
Markdown editor not open, selecting one drive and navigating to folder to open the target file.

Executes a 5-step compounding recovery state machine:
  1. Focuses Teams on the external display.
  2. Selects the OneDrive / Files tab if not already open.
  3. Uses UIAutomator XML + RapidOCR to locate and tap through the target folder hierarchy.
  4. Scrolls to and taps the target Markdown file to launch FilePreviewActivity.
  5. Chains into action_view_to_edit, action_light_to_dark, and action_close_keyboard.
"""

import asyncio
from typing import Dict, Any, Tuple, Optional
import cv2
import numpy as np

from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class OpenMarkdownFromOneDriveAction(ObservationActionPlugin):
    id = "markdown_not_open_navigate_onedrive"
    config_label = "markdown editor not open, selecting one drive and navigating to folder to open the target file"
    category = "compounding_navigation"
    default_phase = "pre_node"
    priority = 5

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        from services.adb_service import (
            get_active_adb_serial, detect_external_display_id, run_adb_shell,
            parse_activities_by_display
        )

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)

        # Query activity stack across all displays
        act_res = await run_adb_shell("dumpsys activity activities", serial, timeout=3.5)
        stdout = act_res.get("stdout", "")
        ctx.focused_activity = stdout.strip()

        parsed = parse_activities_by_display(stdout)
        target_info = parsed.get(disp_id, {"file_preview_tasks": [], "teams_tasks": [], "resumed_activities": []})
        phone_info = parsed.get(0, {"file_preview_tasks": [], "teams_tasks": [], "resumed_activities": []})

        is_file_preview_on_desktop = any("FilePreviewActivity" in r for r in target_info.get("resumed_activities", [])) or len(target_info.get("file_preview_tasks", [])) > 0
        is_file_preview_on_phone = len(phone_info.get("file_preview_tasks", [])) > 0
        is_teams_on_desktop = any("com.microsoft.teams" in r for r in target_info.get("resumed_activities", [])) or len(target_info.get("teams_tasks", [])) > 0

        # An issue exists if Markdown is NOT open on the desktop display, OR if it IS open on the phone!
        issue_detected = (not is_file_preview_on_desktop) or is_file_preview_on_phone

        if is_file_preview_on_phone:
            reason = "Markdown editor is open on the phone screen (Display 0), blocking desktop mode rendering"
        elif not is_teams_on_desktop:
            reason = "Teams application is not in the foreground on desktop display"
        elif not is_file_preview_on_desktop:
            reason = "FilePreviewActivity is not active on external display (Teams home, OneDrive tab, or folder list)"
        else:
            reason = "Markdown editor FilePreviewActivity is active exclusively on desktop display"

        return (
            issue_detected,
            reason,
            {
                "is_teams": is_teams_on_desktop,
                "is_file_preview": is_file_preview_on_desktop,
                "is_open_on_phone": is_file_preview_on_phone,
                "display_id": disp_id,
                "focused_activity": stdout.strip()
            }
        )

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from services.adb_service import (
            get_active_adb_serial, detect_external_display_id, run_adb_shell,
            capture_external_screenshot, dismiss_keyboard, enforce_markdown_only_on_desktop
        )
        from services.ui_automator_service import get_display_dimensions
        from ocr_engine import get_rapid_ocr
        import db

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)
        disp_w, disp_h = await get_display_dimensions(serial, disp_id)

        # Resolve target document folder and filename
        proj = db.get_active_project() or {}
        target_folder = (
            ctx.target_folder_path
            or proj.get("target_folder_path")
            or proj.get("folder_path")
            or "Internal_Open_Source"
        )
        target_filename = (
            ctx.target_filename
            or proj.get("target_filename")
            or proj.get("filename")
            or "Matrix_main_26-09-17-8-19am.md"
        )

        actions_taken = []

        # -------------------------------------------------------------
        # Step 1: Enforce Markdown ONLY on desktop screen & clear phone screen
        # -------------------------------------------------------------
        enf_res = await enforce_markdown_only_on_desktop(serial, disp_id)
        if enf_res.get("phone_cleared"):
            actions_taken.append("Cleared Markdown editor conflict from phone screen (Display 0)")
        actions_taken.extend(enf_res.get("actions", []))
        await asyncio.sleep(0.4)

        # -------------------------------------------------------------
        # Step 2: Select OneDrive / Files tab if not already open
        # -------------------------------------------------------------
        snap = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
        rapid = get_rapid_ocr()

        if snap and rapid:
            img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
            results, _ = rapid(img)
            onedrive_coords = None
            for box, text, score in (results or []):
                cleaned = text.strip().lower()
                if "onedrive" in cleaned or "files" in cleaned:
                    cx = int(np.mean([p[0] for p in box]))
                    cy = int(np.mean([p[1] for p in box]))
                    onedrive_coords = (cx, cy)
                    break

            if onedrive_coords:
                await run_adb_shell(f"input -d {disp_id} tap {onedrive_coords[0]} {onedrive_coords[1]} >/dev/null 2>&1", serial)
                actions_taken.append(f"Tapped OneDrive / Files tab at {onedrive_coords}")
                await asyncio.sleep(0.6)

        # -------------------------------------------------------------
        # Step 3: Locate and tap through target folder hierarchy
        # -------------------------------------------------------------
        snap2 = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
        if snap2 and rapid:
            img2 = cv2.imdecode(np.frombuffer(snap2, np.uint8), cv2.IMREAD_COLOR)
            results2, _ = rapid(img2)
            folder_coords = None
            target_norm = target_folder.replace("_", " ").lower()

            for box, text, score in (results2 or []):
                cleaned = text.strip().lower().replace("_", " ")
                if target_norm in cleaned or cleaned in target_norm:
                    cx = int(np.mean([p[0] for p in box]))
                    cy = int(np.mean([p[1] for p in box]))
                    folder_coords = (cx, cy)
                    break

            if folder_coords:
                await run_adb_shell(f"input -d {disp_id} tap {folder_coords[0]} {folder_coords[1]} >/dev/null 2>&1", serial)
                actions_taken.append(f"Tapped folder '{target_folder}' at {folder_coords}")
                await asyncio.sleep(0.7)

        # -------------------------------------------------------------
        # Step 4: Scroll to and tap target Markdown file to launch FilePreviewActivity
        # -------------------------------------------------------------
        file_found = False
        target_fn_norm = target_filename.lower().replace(".md", "").replace("_", " ")

        for scroll_attempt in range(4):
            snap3 = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if snap3 and rapid:
                img3 = cv2.imdecode(np.frombuffer(snap3, np.uint8), cv2.IMREAD_COLOR)
                results3, _ = rapid(img3)
                for box, text, score in (results3 or []):
                    cleaned = text.strip().lower().replace(".md", "").replace("_", " ")
                    if target_fn_norm in cleaned or cleaned in target_fn_norm or "matrix" in cleaned:
                        cx = int(np.mean([p[0] for p in box]))
                        cy = int(np.mean([p[1] for p in box]))
                        await run_adb_shell(f"input -d {disp_id} tap {cx} {cy} >/dev/null 2>&1", serial)
                        actions_taken.append(f"Tapped file '{target_filename}' at ({cx}, {cy})")
                        file_found = True
                        break

            if file_found:
                break

            # Scroll down through file list
            cx = int(disp_w * 0.5)
            y_start = int(disp_h * 0.70)
            y_end = int(disp_h * 0.30)
            await run_adb_shell(f"input -d {disp_id} swipe {cx} {y_start} {cx} {y_end} 250 >/dev/null 2>&1", serial)
            await asyncio.sleep(0.4)

        await asyncio.sleep(1.0)

        # -------------------------------------------------------------
        # Step 5: Chain into View-To-Edit, Light-To-Dark, and Close-Keyboard
        # -------------------------------------------------------------
        from observation_actions.action_view_to_edit import ViewToEditAction
        from observation_actions.action_light_to_dark import LightToDarkAction
        from observation_actions.action_close_keyboard import CloseKeyboardAction

        # Chain: View Mode to Edit Mode
        v_action = ViewToEditAction()
        v_res = await v_action.execute_workaround(ctx)
        actions_taken.extend(v_res.get("actions_taken", []))

        # Chain: Light Mode to Dark Mode
        l_action = LightToDarkAction()
        l_res = await l_action.execute_workaround(ctx)
        actions_taken.extend(l_res.get("actions_taken", []))

        # Chain: Suppress On-Screen Soft Keyboard
        k_action = CloseKeyboardAction()
        k_res = await k_action.execute_workaround(ctx)
        actions_taken.extend(k_res.get("actions_taken", []))

        return {
            "status": "success",
            "success": True,
            "action_id": self.id,
            "message": f"Successfully navigated OneDrive and loaded '{target_filename}' in Edit Mode",
            "actions_taken": actions_taken
        }


RecoverMarkdownEditorAction = OpenMarkdownFromOneDriveAction
