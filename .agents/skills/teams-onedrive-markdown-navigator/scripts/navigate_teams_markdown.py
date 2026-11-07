#!/usr/bin/env python3
"""
CLI Helper Script for `teams-onedrive-markdown-navigator` Skill.
Performs:
  1. Safe Teams PIN 2992 authentication on the Desktop Mode screen ONLY:
     - Handles the Blank White Teams Fingerprint screen -> Escape -> Desktop PIN 2992.
     - Handles the Teams "Enter your PIN" / "Managed by your organization" screen -> PIN 2992.
     - NEVER types 2992 on the phone display (Display #0) or inside the Markdown editor.
  2. Navigating Microsoft Teams on the external Desktop Display through:
     Teams App -> "OneDrive" -> "Markdowns" -> "ficus-platform" -> "<bundle_folder>" -> "<target_file>.md"
  3. Assuring the opened Teams Markdown editor is in Fullscreen, Dark Mode, and Single-Pane Edit Mode.

All subcommands write structured JSON results to `--output`.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVER_DIR = REPO_ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


async def run_unlock_phone(phone_pin: str = "1213", serial: Optional[str] = None) -> Dict[str, Any]:
    """
    Wakes Display #0 and unlocks the Android OS Phone Lockscreen using strictly
    the Phone Unlock PIN (1213). Never enters 2992 on the Phone Lockscreen.
    """
    from services import adb_service

    ser = await adb_service.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active ADB device connected"}

    unlock_res = await adb_service.unlock_phone_screen_1213(
        serial=ser,
        phone_pin=phone_pin,
        handle_teams_auth_after=False,
    )
    return {
        "status": "ok",
        "serial": ser,
        "phone_unlock": unlock_res,
    }


async def run_auth_teams_pin(pin: str = "2992", serial: Optional[str] = None) -> Dict[str, Any]:
    """
    Authenticates Microsoft Teams on the Desktop Display (`Display #<ext_id>`) using PIN 2992
    ONLY when Teams displays the Blank White Fingerprint screen or the "Enter your PIN" screen.
    Never sends PIN digits to the phone display (`Display #0`) or into the Markdown editor.
    """
    from services import adb_service

    ser = await adb_service.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active ADB device connected"}
    ext_id = await adb_service.detect_external_display_id(ser)

    await adb_service.direct_hid_to_display(serial=ser, target_mode="desktop", ext_display_id=ext_id)
    teams_auth_res = await adb_service.auto_handle_pin_authentication(
        serial=ser,
        ext_display_id=ext_id,
        pin=pin,
        force=True,
    )
    return {
        "status": "ok",
        "serial": ser,
        "desktop_display_id": ext_id,
        "teams_pin_auth": teams_auth_res,
    }


async def run_navigate(
    bundle_folder: str,
    target_file: str,
    part_number: int,
    folder_path: Optional[List[str]] = None,
    open_editor: bool = True,
    pin: str = "2992",
    serial: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Opens Microsoft Teams on the Desktop Display, handles Teams PIN 2992 if prompted,
    navigates OneDrive -> Markdowns -> ficus-platform -> <bundle_folder> -> <target_file>.md,
    and prepares the Markdown editor in Fullscreen + Dark Mode + Edit Mode.
    """
    from services import adb_service, ui_automator_service as uia

    ser = await adb_service.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active ADB device connected"}
    ext_id = await adb_service.detect_external_display_id(ser)

    await adb_service.direct_hid_to_display(serial=ser, target_mode="desktop", ext_display_id=ext_id)
    nav_res = await uia.navigate_teams_onedrive_path_to_markdown(
        serial=ser,
        display_id=ext_id,
        bundle_folder_name=bundle_folder,
        target_file_name=target_file,
        target_part_number=part_number,
        folder_path=folder_path or list(uia.DEFAULT_TEAMS_ONEDRIVE_PATH),
        open_editor=open_editor,
    )
    return nav_res


async def run_prepare_editor(serial: Optional[str] = None) -> Dict[str, Any]:
    """
    Assures the currently open Teams Markdown editor window on the Desktop Display
    is maximized (Fullscreen), in Dark Mode, and in Single-Pane Edit Mode.
    Also checks for the Undo (`↶`) button if accidental edits occurred.
    """
    import cv2
    import numpy as np
    from alignment_engine import detect_teams_markdown_alignment
    from services import adb_service, ui_automator_service as uia

    ser = await adb_service.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active ADB device connected"}
    ext_id = await adb_service.detect_external_display_id(ser)

    await adb_service.direct_hid_to_display(serial=ser, target_mode="desktop", ext_display_id=ext_id)
    prep_res = await uia.prepare_markdown_editor_window(serial=ser, display_id=ext_id)
    snap = await adb_service.capture_display_screenshot("desktop", serial=ser, display_id=ext_id, max_cache_age_s=0.0)
    align_info: Dict[str, Any] = {}
    undo_info: Dict[str, Any] = {}
    if snap:
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            align_info = detect_teams_markdown_alignment(img)
            undo_info = uia.detect_undo_button_cv(img)

    return {
        "status": "ok" if prep_res.get("success") else "warning",
        "serial": ser,
        "desktop_display_id": ext_id,
        "prepare_result": prep_res,
        "alignment": {
            "is_aligned": align_info.get("is_aligned"),
            "file_name": align_info.get("file_name"),
            "edit_mode_active": align_info.get("edit_mode_active"),
            "dark_mode_active": align_info.get("dark_mode_active"),
            "first_line_number": align_info.get("first_line_number"),
            "last_line_number": align_info.get("last_line_number"),
        },
        "undo_button": undo_info,
    }


def write_output(payload: Dict[str, Any], output_path: str) -> None:
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Success! Data written to: {out_file}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Navigate Teams OneDrive folder path, handle Teams PIN 2992 on Desktop Display, and prepare Fullscreen Dark Mode Edit Mode."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # 0. unlock-phone
    p_unlock = subparsers.add_parser(
        "unlock-phone",
        help="Wake Display #0 and unlock Android OS Phone Lockscreen with PIN 1213 (never 2992)",
    )
    p_unlock.add_argument("--phone-pin", default="1213", help="Phone OS unlock PIN (default: 1213)")
    p_unlock.add_argument("--serial", default=None, help="Optional ADB serial")
    p_unlock.add_argument("--output", required=True, help="Output JSON file path")

    # 1. auth-teams-pin
    p_auth = subparsers.add_parser(
        "auth-teams-pin",
        help="Authenticate Teams on the Desktop Display with PIN 2992 (handles Blank White Fingerprint -> Escape -> PIN 2992)",
    )
    p_auth.add_argument("--pin", default="2992", help="Teams PIN code (default: 2992)")
    p_auth.add_argument("--serial", default=None, help="Optional ADB serial")
    p_auth.add_argument("--output", required=True, help="Output JSON file path")

    # 2. navigate
    p_nav = subparsers.add_parser(
        "navigate",
        help="Navigate Teams -> OneDrive -> Markdowns -> ficus-platform -> bundle -> file",
    )
    p_nav.add_argument("--bundle", required=True, help="Bundle folder name (e.g. DIXUI_impact_26-11-05-9-43pm)")
    p_nav.add_argument("--file", required=True, help="Target markdown file name (e.g. DIXUI_impact_26-11-05-9-43pm_part5.md)")
    p_nav.add_argument("--part", type=int, default=5, help="Target part number (default: 5)")
    p_nav.add_argument("--pin", default="2992", help="Teams PIN code (default: 2992)")
    p_nav.add_argument("--serial", default=None, help="Optional ADB serial")
    p_nav.add_argument("--output", required=True, help="Output JSON file path")

    # 3. prepare-editor
    p_prep = subparsers.add_parser(
        "prepare-editor",
        help="Assure Markdown editor is Fullscreen + Dark Mode + Edit Mode",
    )
    p_prep.add_argument("--serial", default=None, help="Optional ADB serial")
    p_prep.add_argument("--output", required=True, help="Output JSON file path")

    # 4. full-run
    p_full = subparsers.add_parser(
        "full-run",
        help="Run Phone Unlock (1213) + Teams PIN (2992) auth + OneDrive navigation + Fullscreen Dark Edit Mode",
    )
    p_full.add_argument("--bundle", default="DIXUI_impact_26-11-05-9-43pm", help="Bundle folder name")
    p_full.add_argument("--file", default="DIXUI_impact_26-11-05-9-43pm_part5.md", help="Target markdown file name")
    p_full.add_argument("--part", type=int, default=5, help="Target part number")
    p_full.add_argument("--phone-pin", default="1213", help="Phone OS unlock PIN (default: 1213)")
    p_full.add_argument("--pin", default="2992", help="Teams PIN code (default: 2992)")
    p_full.add_argument("--serial", default=None, help="Optional ADB serial")
    p_full.add_argument("--output", required=True, help="Output JSON file path")

    args = parser.parse_args()

    if args.command == "unlock-phone":
        res = asyncio.run(run_unlock_phone(phone_pin=args.phone_pin, serial=args.serial))
        write_output(res, args.output)
    elif args.command in ("auth-teams-pin", "unlock-and-auth"):
        res = asyncio.run(run_auth_teams_pin(pin=args.pin, serial=args.serial))
        write_output(res, args.output)
    elif args.command == "navigate":
        res = asyncio.run(
            run_navigate(
                bundle_folder=args.bundle,
                target_file=args.file,
                part_number=args.part,
                pin=args.pin,
                serial=args.serial,
            )
        )
        write_output(res, args.output)
    elif args.command == "prepare-editor":
        res = asyncio.run(run_prepare_editor(serial=args.serial))
        write_output(res, args.output)
    elif args.command == "full-run":
        async def _full():
            unlock_r = await run_unlock_phone(phone_pin=args.phone_pin, serial=args.serial)
            auth_r = await run_auth_teams_pin(pin=args.pin, serial=args.serial)
            nav_r = await run_navigate(
                bundle_folder=args.bundle,
                target_file=args.file,
                part_number=args.part,
                pin=args.pin,
                serial=args.serial,
            )
            prep_r = await run_prepare_editor(serial=args.serial)
            return {
                "status": nav_r.get("status", "ok"),
                "bundle": args.bundle,
                "file": args.file,
                "part": args.part,
                "phone_unlock": unlock_r,
                "auth": auth_r,
                "navigation": nav_r,
                "editor": prep_r,
            }
        res = asyncio.run(_full())
        write_output(res, args.output)


if __name__ == "__main__":
    main()
