#!/usr/bin/env python3
"""
CLI Helper Script for `teams-onedrive-markdown-navigator` Skill.
Performs:
  1. Safe PIN 2992 authentication (unlocking SystemUI keyguard bouncer if `showing=true`
     and/or handling the Teams Desktop PIN / Blank White Fingerprint prompt).
  2. Navigating Microsoft Teams on the external Desktop Display through:
     Teams App -> "OneDrive" -> "Markdowns" -> "ficus-platform" -> "<bundle_folder>" -> "<target_file>.md"
  3. Ensuring the opened Teams Markdown editor is in Fullscreen, Dark Mode, and Single-Pane Edit Mode.

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

# Canonical Pixel 8 Pro (1080x2404 override) SystemUI Compose Bouncer ('com.android.systemui:id/pin_pad_grid') coordinates
SYSTEMUI_PIN_PAD_COORDS: Dict[str, tuple[int, int]] = {
    "1": (235, 1016),
    "2": (541, 1016),
    "3": (847, 1016),
    "4": (235, 1285),
    "5": (541, 1285),
    "6": (847, 1285),
    "7": (235, 1554),
    "8": (541, 1554),
    "9": (847, 1554),
    "delete": (235, 1823),
    "0": (541, 1823),
    "enter": (847, 1823),
}


async def check_and_unlock_keyguard_if_showing(
    serial: str,
    pin: str = "2992",
) -> Dict[str, Any]:
    """
    Checks `dumpsys window policy` for `KeyguardServiceDelegate showing=true`.
    If `showing=true`, wakes the screen and immediately taps the digits of `pin` + Enter
    within the 10-second lockscreen wake window (never running a slow uiautomator dump
    between `keyevent 224` and the taps).
    """
    from services import adb_service

    actions: List[str] = []
    pol = await adb_service.run_adb_shell("dumpsys window policy", serial, timeout=3.0)
    pol_out = pol.get("stdout", "") or ""
    is_showing = "showing=true" in pol_out and "inputRestricted=true" in pol_out

    if not is_showing:
        return {
            "keyguard_was_showing": False,
            "keyguard_unlocked": True,
            "actions": ["Keyguard already unlocked (showing=false)"],
        }

    # Dismiss any pending biometric overlay on Display 0 and bring up BouncerContent, then immediately wake + tap PIN
    await adb_service.run_adb_shell(
        "input keyevent 224 && sleep 0.3 && input keyevent 111 && sleep 0.3 && input swipe 540 1900 540 500 250",
        serial,
        timeout=5.0,
    )
    await asyncio.sleep(0.8)

    # Build a single uninterrupted shell command after `input keyevent 224` so all taps complete in < 2.0s
    tap_parts = ["input keyevent 224", "sleep 0.35"]
    for ch in str(pin).strip():
        if ch in SYSTEMUI_PIN_PAD_COORDS:
            x, y = SYSTEMUI_PIN_PAD_COORDS[ch]
            tap_parts.append(f"input tap {x} {y}")
            tap_parts.append("sleep 0.28")
    ex, ey = SYSTEMUI_PIN_PAD_COORDS["enter"]
    tap_parts.append(f"input tap {ex} {ey}")

    await adb_service.run_adb_shell(" && ".join(tap_parts), serial, timeout=8.0)
    actions.append(f"Tapped PIN ({len(pin)} digits) + Enter on verified SystemUI keyguard bouncer")
    await asyncio.sleep(1.5)

    pol_after = await adb_service.run_adb_shell("dumpsys window policy", serial, timeout=3.0)
    after_out = pol_after.get("stdout", "") or ""
    unlocked = "showing=false" in after_out or "inputRestricted=false" in after_out
    return {
        "keyguard_was_showing": True,
        "keyguard_unlocked": unlocked,
        "actions": actions,
    }


async def run_unlock_and_auth(pin: str = "2992", serial: Optional[str] = None) -> Dict[str, Any]:
    from services import adb_service

    ser = await adb_service.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active ADB device connected"}
    ext_id = await adb_service.detect_external_display_id(ser)

    kg_res = await check_and_unlock_keyguard_if_showing(ser, pin=pin)
    teams_auth_res = await adb_service.auto_handle_pin_authentication(
        serial=ser,
        ext_display_id=ext_id,
        pin=pin,
        force=False,
    )
    return {
        "status": "ok",
        "serial": ser,
        "desktop_display_id": ext_id,
        "keyguard": kg_res,
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
    from services import adb_service, ui_automator_service as uia

    ser = await adb_service.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active ADB device connected"}
    ext_id = await adb_service.detect_external_display_id(ser)

    await check_and_unlock_keyguard_if_showing(ser, pin=pin)
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
    import cv2
    import numpy as np
    from alignment_engine import detect_teams_markdown_alignment
    from services import adb_service, ui_automator_service as uia

    ser = await adb_service.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active ADB device connected"}
    ext_id = await adb_service.detect_external_display_id(ser)

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
        description="Navigate Teams OneDrive folder path, handle PIN 2992, and prepare Fullscreen Dark Mode Edit Mode."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # 1. unlock-and-auth
    p_auth = subparsers.add_parser("unlock-and-auth", help="Unlock keyguard / authenticate Teams with PIN 2992")
    p_auth.add_argument("--pin", default="2992", help="PIN code (default: 2992)")
    p_auth.add_argument("--serial", default=None, help="Optional ADB serial")
    p_auth.add_argument("--output", required=True, help="Output JSON file path")

    # 2. navigate
    p_nav = subparsers.add_parser("navigate", help="Navigate Teams -> OneDrive -> Markdowns -> ficus-platform -> bundle -> file")
    p_nav.add_argument("--bundle", required=True, help="Bundle folder name (e.g. DIXUI_impact_26-11-05-9-43pm)")
    p_nav.add_argument("--file", required=True, help="Target markdown file name (e.g. DIXUI_impact_26-11-05-9-43pm_part5.md)")
    p_nav.add_argument("--part", type=int, default=5, help="Target part number (default: 5)")
    p_nav.add_argument("--pin", default="2992", help="PIN code (default: 2992)")
    p_nav.add_argument("--serial", default=None, help="Optional ADB serial")
    p_nav.add_argument("--output", required=True, help="Output JSON file path")

    # 3. prepare-editor
    p_prep = subparsers.add_parser("prepare-editor", help="Assure Markdown editor is Fullscreen + Dark Mode + Edit Mode")
    p_prep.add_argument("--serial", default=None, help="Optional ADB serial")
    p_prep.add_argument("--output", required=True, help="Output JSON file path")

    # 4. full-run
    p_full = subparsers.add_parser("full-run", help="Run full PIN 2992 auth + OneDrive navigation + Fullscreen Dark Edit Mode")
    p_full.add_argument("--bundle", default="DIXUI_impact_26-11-05-9-43pm", help="Bundle folder name")
    p_full.add_argument("--file", default="DIXUI_impact_26-11-05-9-43pm_part5.md", help="Target markdown file name")
    p_full.add_argument("--part", type=int, default=5, help="Target part number")
    p_full.add_argument("--pin", default="2992", help="PIN code (default: 2992)")
    p_full.add_argument("--serial", default=None, help="Optional ADB serial")
    p_full.add_argument("--output", required=True, help="Output JSON file path")

    args = parser.parse_args()

    if args.command == "unlock-and-auth":
        res = asyncio.run(run_unlock_and_auth(pin=args.pin, serial=args.serial))
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
            auth_r = await run_unlock_and_auth(pin=args.pin, serial=args.serial)
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
                "auth": auth_r,
                "navigation": nav_r,
                "editor": prep_r,
            }
        res = asyncio.run(_full())
        write_output(res, args.output)


if __name__ == "__main__":
    main()
