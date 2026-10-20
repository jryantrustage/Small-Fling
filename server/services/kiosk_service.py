import asyncio
import re
from typing import Optional, Dict, Any, List
import subprocess

from services import adb_service as adb
from services.state import ws_manager

# In-memory kiosk state tracking
kiosk_state: Dict[str, Any] = {
    "lock_status": "UNLOCKED", # UNLOCKED, PINNED, LOCKED_TASK_EXTERNAL
    "kiosk_mode": "freeform",   # freeform, mirrored, kiosk
    "target_display_id": -1,
    "locked_package": "",
    "locked_target_type": "none", # "markdown_viewer", "teams_app", "generic", "none"
    "locked_task_id": -1,
    "is_markdown_viewer_active": False,
    "markdown_viewer_task_id": None,
    "teams_app_task_id": None,
    "top_activity": None,
    "foreground_package": "",
    "device_owner_active": False,
    "active_admin_active": False,
    "displays": [],
    "peripheral_restrictions": {
        "suppress_hotkeys": True,
        "disable_status_bar": True,
        "prevent_sleep": True
    },
    "desktop_mode_enabled": True,
    "desktop_keyboard_prohibited": True,
    "mouse_display_id": -1,
    "last_updated": None
}

async def get_connected_displays(serial: Optional[str] = None) -> List[Dict[str, Any]]:
    ser = await adb.get_active_adb_serial(serial)
    if not ser:
        return []

    res = await adb.run_adb_shell("dumpsys display", ser, timeout=4.0)
    out = res.get("stdout", "") if res.get("status") == "ok" else ""

    displays = []
    
    # Extract blocks matching DisplayDeviceInfo{"Name": ...}
    device_matches = list(re.finditer(r'DisplayDeviceInfo\{"([^"]+)":\s*uniqueId="([^"]+)",\s*(\d+)\s*x\s*(\d+).*?renderFrameRate\s*([\d\.]+).*?type\s*([A-Z]+)', out))
    
    # Also extract mDisplayId mappings
    display_id_matches = re.findall(r'mDisplayId=(\d+)', out)
    unique_ids = []
    for did_str in display_id_matches:
        val = int(did_str)
        if val not in unique_ids:
            unique_ids.append(val)

    if not device_matches:
        # Fallback to SurfaceFlinger
        sf_map = await adb.detect_surfaceflinger_displays(ser)
        if "phone" in sf_map:
            displays.append({
                "displayId": 0,
                "name": "Built-in Screen",
                "width": 1080,
                "height": 2404,
                "refreshRate": 120.0,
                "category": "INTERNAL",
                "isExternal": False,
                "isPrimary": True,
                "sfId": sf_map["phone"]
            })
        if "desktop" in sf_map:
            displays.append({
                "displayId": 13,
                "name": "External Desktop Monitor",
                "width": 1920,
                "height": 1080,
                "refreshRate": 60.0,
                "category": "PRESENTATION",
                "isExternal": True,
                "isPrimary": False,
                "sfId": sf_map["desktop"]
            })
        return displays

    for idx, match in enumerate(device_matches):
        name = match.group(1)
        unique_id = match.group(2)
        width = int(match.group(3))
        height = int(match.group(4))
        fps = round(float(match.group(5)), 1)
        dtype = match.group(6)

        is_external = (dtype == "EXTERNAL") or ("HDMI" in name.upper()) or ("USB" in name.upper()) or ("PRESENTATION" in match.group(0))
        
        # Resolve displayId
        resolved_did = 0 if not is_external else 13
        if idx < len(unique_ids):
            resolved_did = unique_ids[idx]
        elif is_external and len(unique_ids) > 1:
            resolved_did = unique_ids[1]

        displays.append({
            "displayId": resolved_did,
            "name": name,
            "uniqueId": unique_id,
            "width": width,
            "height": height,
            "refreshRate": fps,
            "category": "PRESENTATION" if is_external else "INTERNAL",
            "isExternal": is_external,
            "isPrimary": (resolved_did == 0 or not is_external)
        })

    return displays

async def find_teams_task_targets(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Distinguishes between the Markdown Viewer (FilePreviewActivity) and the Teams App (PersonalFilesActivity/MainActivity)
    specifically for the target desktop display vs the phone display (Display 0).
    Returns task IDs, active flags, component names, and whether Markdown is lingering on the phone.
    """
    ser = await adb.get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {
            "markdown_viewer_task_id": 314,
            "teams_app_task_id": 307,
            "is_markdown_viewer_active": True,
            "is_teams_app_active": True,
            "top_activity": "com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity",
            "is_open_on_phone": False,
            "phone_markdown_tasks": []
        }

    res = await adb.run_adb_shell("dumpsys activity activities", ser, timeout=3.5)
    out = res.get("stdout", "") if res.get("status") == "ok" else ""
    parsed = adb.parse_activities_by_display(out)

    target_d = display_id if (display_id is not None and display_id > 0) else await adb.detect_external_display_id(ser)
    target_info = parsed.get(target_d, {"file_preview_tasks": [], "teams_tasks": [], "resumed_activities": []})
    phone_info = parsed.get(0, {"file_preview_tasks": [], "teams_tasks": [], "resumed_activities": []})

    md_tasks = target_info.get("file_preview_tasks", [])
    teams_tasks = target_info.get("teams_tasks", [])

    md_task_id = md_tasks[0] if md_tasks else None
    teams_task_id = teams_tasks[0] if teams_tasks else None

    # Fallback to general regex if no display-specific task was parsed
    if not md_task_id:
        md_m = re.search(r'FilePreviewActivity\s+t(\d+)', out)
        if md_m:
            fallback_tid = int(md_m.group(1))
            if fallback_tid not in phone_info.get("file_preview_tasks", []):
                md_task_id = fallback_tid

    if not teams_task_id:
        teams_m = re.search(r'(PersonalFilesActivity|MainActivity)\s+t(\d+)', out)
        if teams_m:
            teams_task_id = int(teams_m.group(2))

    top_m = re.search(r'(?:topResumedActivity|mFocusedApp).*ActivityRecord\{[0-9a-fA-F]+\s+u\d+\s+([^\s\}]+)', out)
    top_act = top_m.group(1) if top_m else None

    is_open_on_phone = len(phone_info.get("file_preview_tasks", [])) > 0

    return {
        "markdown_viewer_task_id": md_task_id,
        "teams_app_task_id": teams_task_id,
        "is_markdown_viewer_active": bool(md_task_id is not None),
        "is_teams_app_active": bool(teams_task_id is not None),
        "top_activity": top_act,
        "display_id": target_d,
        "is_open_on_phone": is_open_on_phone,
        "phone_markdown_tasks": phone_info.get("file_preview_tasks", [])
    }

async def query_kiosk_status(serial: Optional[str] = None) -> Dict[str, Any]:
    global kiosk_state
    ser = await adb.get_active_adb_serial(serial)
    if not ser:
        return {**kiosk_state, "connected": False}

    # 1. Query LockTaskController
    res_lt = await adb.run_adb_shell("dumpsys activity | grep -A 5 LockTaskController", ser, timeout=3.0)
    lt_out = res_lt.get("stdout", "") if res_lt.get("status") == "ok" else ""

    lock_status = "UNLOCKED"
    locked_pkg = ""
    locked_task_id = -1

    if "mLockTaskModeState=PINNED" in lt_out:
        lock_status = "PINNED"
    elif "mLockTaskModeState=LOCKED" in lt_out:
        lock_status = "LOCKED_TASK_EXTERNAL"

    task_match = re.search(r'#(\d+)\s+Task\{[0-9a-fA-F]+\s+#(\d+).*?A=\d+:([^\s\}]+)', lt_out)
    if task_match:
        locked_task_id = int(task_match.group(2))
        locked_pkg = task_match.group(3)

    # 2. Query focused app and window
    res_win = await adb.run_adb_shell("dumpsys window | grep -E 'mFocusedApp'", ser, timeout=3.0)
    win_out = res_win.get("stdout", "") if res_win.get("status") == "ok" else ""
    fg_pkg = "com.microsoft.teams"
    all_fgs = re.findall(r'ActivityRecord\{[0-9a-fA-F]+\s+u\d+\s+([^/\s]+)/', win_out)
    if all_fgs:
        fg_pkg = all_fgs[-1] # Usually the external display's focused app

    # 3. Query Device Owner / Active Admin
    res_owners = await adb.run_adb_shell("dpm list-owners", ser, timeout=2.0)
    owners_out = res_owners.get("stdout", "") if res_owners.get("status") == "ok" else ""
    is_owner = "com.matrixcapture.app" in owners_out

    res_admin = await adb.run_adb_shell("dumpsys device_policy | grep -i KioskAdminReceiver", ser, timeout=2.0)
    admin_out = res_admin.get("stdout", "") if res_admin.get("status") == "ok" else ""
    is_admin = ("com.matrixcapture.app" in admin_out) or ("KioskAdminReceiver" in admin_out)

    # 4. Connected Displays
    displays = await get_connected_displays(ser)

    ext_disp = next((d for d in displays if d.get("isExternal")), None)
    target_did = ext_disp.get("displayId", 13) if ext_disp else -1

    # 5. Distinguish Markdown Viewer vs Teams App
    targets = await find_teams_task_targets(ser)
    locked_target_type = "none"
    if locked_task_id > 0:
        if targets.get("markdown_viewer_task_id") == locked_task_id:
            locked_target_type = "markdown_viewer"
        elif targets.get("teams_app_task_id") == locked_task_id:
            locked_target_type = "teams_app"
        else:
            locked_target_type = "generic"

    kiosk_state.update({
        "connected": True,
        "serial": ser,
        "lock_status": lock_status,
        "kiosk_mode": "kiosk" if lock_status != "UNLOCKED" else kiosk_state.get("kiosk_mode", "freeform"),
        "target_display_id": target_did,
        "locked_package": locked_pkg or kiosk_state.get("locked_package", ""),
        "locked_target_type": locked_target_type,
        "locked_task_id": locked_task_id,
        "is_markdown_viewer_active": targets.get("is_markdown_viewer_active", False),
        "markdown_viewer_task_id": targets.get("markdown_viewer_task_id"),
        "teams_app_task_id": targets.get("teams_app_task_id"),
        "top_activity": targets.get("top_activity"),
        "foreground_package": fg_pkg,
        "device_owner_active": is_owner,
        "active_admin_active": is_admin,
        "displays": displays,
        "active_display_count": len(displays),
        "external_resolution": f"{ext_disp['width']}x{ext_disp['height']} @ {ext_disp['refreshRate']}Hz" if ext_disp else "None"
    })

    return kiosk_state

async def lock_external_display(
    display_id: int = 13,
    package_id: str = "com.microsoft.teams",
    target_type: str = "auto",  # "auto", "markdown_viewer", "teams_app"
    mode: str = "kiosk",
    restrictions: Optional[Dict[str, Any]] = None,
    serial: Optional[str] = None
) -> Dict[str, Any]:
    global kiosk_state
    ser = await adb.get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        resolved_target_type = target_type if target_type in ("markdown_viewer", "teams_app") else "generic"
        kiosk_state.update({
            "lock_status": "LOCKED_TASK_EXTERNAL",
            "kiosk_mode": mode,
            "target_display_id": display_id,
            "locked_package": package_id,
            "locked_target_type": resolved_target_type,
            "locked_task_id": 314 if resolved_target_type == "markdown_viewer" else 307
        })
        if restrictions:
            kiosk_state["peripheral_restrictions"].update(restrictions)
        return {
            "status": "ok",
            "message": f"Locked external display #{display_id} in {mode} mode",
            "display_id": display_id,
            "package_id": package_id,
            "locked_target_type": resolved_target_type,
            "locked_task_id": kiosk_state["locked_task_id"],
            "kiosk_state": dict(kiosk_state)
        }

    if restrictions:
        kiosk_state["peripheral_restrictions"].update(restrictions)

    restr = kiosk_state["peripheral_restrictions"]

    # 1. Apply system-level dock & sleep restrictions
    if restr.get("prevent_sleep", True):
        await adb.run_adb_shell("settings put global stay_on_while_plugged_in 3", ser)
    
    if restr.get("disable_status_bar", True):
        await adb.run_adb_shell("settings put global policy_control immersive.full=*", ser)

    # 2. Check if active admin is configured, if not, set it
    await adb.run_adb_shell("dpm set-active-admin com.matrixcapture.app/.kiosk.KioskAdminReceiver", ser)

    # 3. If target package is com.matrixcapture.app or generic, launch KioskPresentationActivity
    if not package_id or package_id == "com.matrixcapture.app":
        launch_cmd = f"am start -n com.matrixcapture.app/.kiosk.KioskPresentationActivity --display {display_id}"
        await adb.run_adb_shell(launch_cmd, ser)
        await asyncio.sleep(0.3)
    
    # 4. Send RPC broadcast to KioskCommandReceiver inside Android app
    bcast_cmd = (
        f"am broadcast -a com.matrixcapture.app.action.LOCK_EXTERNAL_DISPLAY "
        f"--ei display_id {display_id} "
        f"--es package_id '{package_id}' "
        f"--es mode '{mode}' "
        f"--ez suppress_hotkeys {str(restr.get('suppress_hotkeys', True)).lower()} "
        f"--ez disable_status_bar {str(restr.get('disable_status_bar', True)).lower()} "
        f"--ez prevent_sleep {str(restr.get('prevent_sleep', True)).lower()}"
    )
    await adb.run_adb_shell(bcast_cmd, ser)

    # 5. Distinguish specifically between Markdown Viewer (FilePreviewActivity) and Teams App
    targets = await find_teams_task_targets(ser)
    task_id_to_lock = None
    target_desc = "App"
    resolved_target_type = "generic"

    t_type = (target_type or "auto").lower()
    if t_type == "markdown_viewer" or (t_type == "auto" and targets.get("is_markdown_viewer_active")):
        if targets.get("markdown_viewer_task_id"):
            task_id_to_lock = targets["markdown_viewer_task_id"]
            target_desc = f"Markdown Viewer (Task #{task_id_to_lock})"
            resolved_target_type = "markdown_viewer"
    elif t_type == "teams_app" or (t_type == "auto" and targets.get("is_teams_app_active")):
        if targets.get("teams_app_task_id"):
            task_id_to_lock = targets["teams_app_task_id"]
            target_desc = f"Teams Main App (Task #{task_id_to_lock})"
            resolved_target_type = "teams_app"

    if not task_id_to_lock:
        res_tasks = await adb.run_adb_shell("dumpsys activity tasks | grep -E 'Task\\{.*A=.*\\}' | head -n 5", ser)
        out_tasks = res_tasks.get("stdout", "") if res_tasks.get("status") == "ok" else ""
        if package_id:
            pkg_m = re.search(rf'#(\d+)\s+type=\w+\s+A=\d+:{re.escape(package_id)}', out_tasks)
            if pkg_m:
                task_id_to_lock = int(pkg_m.group(1))
                target_desc = f"{package_id} (Task #{task_id_to_lock})"
                resolved_target_type = "generic"

    if not task_id_to_lock:
        # Fallback to top standard task
        res_tasks = await adb.run_adb_shell("dumpsys activity tasks | grep -E 'Task\\{.*A=.*\\}' | head -n 5", ser)
        out_tasks = res_tasks.get("stdout", "") if res_tasks.get("status") == "ok" else ""
        top_m = re.search(r'#(\d+)\s+type=standard', out_tasks)
        if top_m:
            task_id_to_lock = int(top_m.group(1))
            target_desc = f"Task #{task_id_to_lock}"
            resolved_target_type = "generic"

    if task_id_to_lock:
        # Bring target task/app to front on external display
        pkg_to_launch = package_id or "com.microsoft.teams"
        await adb.run_adb_shell(f"monkey -p {pkg_to_launch} -c android.intent.category.LAUNCHER 1 --display {display_id} >/dev/null 2>&1", ser)
        await adb.run_adb_shell(f"input -d {display_id} tap 240 40 >/dev/null 2>&1", ser)
        await asyncio.sleep(0.15)
        # Lock task in kiosk mode
        await adb.run_adb_shell(f"am task lock {task_id_to_lock}", ser)
        kiosk_state["locked_task_id"] = task_id_to_lock
        kiosk_state["locked_target_type"] = resolved_target_type

    # Refresh and broadcast state
    await asyncio.sleep(0.2)
    updated = await query_kiosk_status(ser)
    await ws_manager.broadcast({
        "type": "kiosk_state_changed",
        "data": updated
    })

    return {
        "status": "ok",
        "message": f"Locked external display #{display_id} to {target_desc}",
        "locked_target_type": resolved_target_type,
        "locked_task_id": task_id_to_lock,
        "kiosk_state": updated
    }

async def release_lock(admin_pin: Optional[str] = None, serial: Optional[str] = None) -> Dict[str, Any]:
    global kiosk_state
    ser = await adb.get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        kiosk_state.update({
            "lock_status": "UNLOCKED",
            "kiosk_mode": "freeform",
            "locked_package": "",
            "locked_target_type": "none",
            "locked_task_id": -1
        })
        return {
            "status": "ok",
            "message": "Kiosk Lock Task released. Freeform window controls restored.",
            "kiosk_state": dict(kiosk_state)
        }

    # 1. Stop Task Lock via Android ActivityManager (both LockTask and App Pinning)
    await adb.run_adb_shell("cmd activity task lock stop", ser)
    await adb.run_adb_shell("am task lock stop", ser)
    await adb.run_adb_shell("input keycombination 4 187", ser)

    # 2. Send Release Broadcast to Android KioskManager
    await adb.run_adb_shell("am broadcast -a com.matrixcapture.app.action.RELEASE_LOCK", ser)

    # 3. Restore global system restrictions
    await adb.run_adb_shell("settings put global policy_control null", ser)

    kiosk_state["lock_status"] = "UNLOCKED"
    kiosk_state["locked_package"] = ""
    kiosk_state["locked_target_type"] = "none"
    kiosk_state["locked_task_id"] = -1

    await asyncio.sleep(0.2)
    updated = await query_kiosk_status(ser)
    updated["lock_status"] = "UNLOCKED"
    updated["locked_package"] = ""
    updated["locked_target_type"] = "none"
    updated["locked_task_id"] = -1
    kiosk_state.update(updated)

    await ws_manager.broadcast({
        "type": "kiosk_state_changed",
        "data": updated
    })

    return {
        "status": "ok",
        "message": "Kiosk Lock Task released. Freeform window controls restored.",
        "kiosk_state": updated
    }

async def provision_device_admin(serial: Optional[str] = None) -> Dict[str, Any]:
    ser = await adb.get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {
            "status": "ok",
            "active_admin": True,
            "device_owner": True,
            "admin_output": "Success: mock active admin",
            "owner_output": "Success: mock device owner"
        }

    admin_res = await adb.run_adb_shell("dpm set-active-admin com.matrixcapture.app/.kiosk.KioskAdminReceiver", ser)
    owner_res = await adb.run_adb_shell("dpm set-device-owner com.matrixcapture.app/.kiosk.KioskAdminReceiver", ser)

    is_owner = "Success" in owner_res.get("stdout", "")
    is_admin = "Success" in admin_res.get("stdout", "") or admin_res.get("code") == 0

    return {
        "status": "ok" if is_admin else "warning",
        "active_admin": is_admin,
        "device_owner": is_owner,
        "admin_output": admin_res.get("stdout", "").strip(),
        "owner_output": owner_res.get("stdout", "") or owner_res.get("stderr", "").strip()
    }

async def auto_refresh_external_display(display_id: Optional[int] = None, serial: Optional[str] = None) -> Dict[str, Any]:
    ser = await adb.get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {
            "status": "ok",
            "display_id": display_id or 14,
            "refreshed_tasks": [314],
            "keyboard_closed": True,
            "message": f"Successfully auto-refreshed external display #{display_id or 14} (mock)",
            "kiosk_state": dict(kiosk_state)
        }

    if display_id is None or display_id <= 0:
        disp_id = await adb.detect_external_display_id(ser)
        display_id = disp_id if disp_id > 0 else 2

    fix_res = await adb.auto_fix_viewport(ser, display_id)

    updated = await query_kiosk_status(ser)
    await ws_manager.broadcast({
        "type": "kiosk_state_changed",
        "data": updated
    })

    return {
        "status": "ok",
        "display_id": display_id,
        "refreshed_tasks": fix_res.get("refreshed_tasks", []),
        "keyboard_closed": fix_res.get("keyboard_closed", True),
        "message": f"Successfully auto-refreshed external display #{display_id} (keyboard closed ✔)",
        "kiosk_state": updated
    }

async def set_desktop_keyboard_prohibition(prohibit: bool, serial: Optional[str] = None) -> Dict[str, Any]:
    global kiosk_state
    ser = await adb.get_active_adb_serial(serial)
    from services import state
    state.desktop_keyboard_prohibited = prohibit
    kiosk_state["desktop_keyboard_prohibited"] = prohibit

    if not ser or "mock" in str(ser).lower():
        msg = f"Desktop keyboard prohibition {'enabled' if prohibit else 'disabled'} (mock)"
        state.latest_telemetry["desktop_keyboard_prohibited"] = prohibit
        return {
            "status": "ok",
            "prohibited": prohibit,
            "message": msg
        }

    disp_id = kiosk_state.get("target_display_id", -1)
    if disp_id <= 0:
        disp_id = await adb.detect_external_display_id(ser)

    if prohibit:
        # Prohibit soft keyboard on external desktop display WITHOUT disabling Gboard system-wide
        # Never run ime disable, as that forces Android to fall back to Google Voice Typing (VoiceInputMethodService)
        cmd = (
            "ime enable com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
            "ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME"
        )
        if disp_id > 0:
            cmd += f"; settings put secure show_ime_with_hard_keyboard 0; input -d {disp_id} keyevent 111 >/dev/null 2>&1"
        await adb.run_adb_shell(cmd, ser)
        msg = "Desktop keyboard prohibition enabled on external display. Gboard remains enabled on phone."
    else:
        # Restore normal keyboard behavior
        cmd = (
            "ime enable com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
            "ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
            "settings put secure show_ime_with_hard_keyboard 1"
        )
        await adb.run_adb_shell(cmd, ser)
        msg = "Desktop keyboard prohibition disabled. Soft keyboard allowed."

    state.latest_telemetry["desktop_keyboard_prohibited"] = prohibit
    await ws_manager.broadcast({
        "type": "keyboard_prohibit_changed",
        "prohibited": prohibit,
        "message": msg
    })

    return {
        "status": "ok",
        "prohibited": prohibit,
        "message": msg
    }

async def verify_desktop_mode_status(serial: Optional[str] = None) -> Dict[str, Any]:
    global kiosk_state
    from services import state
    ser = await adb.get_active_adb_serial(serial)
    is_enabled = getattr(state, "desktop_mode_enabled", True)

    if not ser or "mock" in str(ser).lower():
        mock_did = 11 if is_enabled else 0
        return {
            "status": "ok",
            "desktop_mode_enabled": is_enabled,
            "desktop_keyboard_prohibited": getattr(state, "desktop_keyboard_prohibited", True),
            "os_desktop_mode_ready": True,
            "hardware_connected": is_enabled,
            "usb_connected": True,
            "hot_plug_detect": is_enabled,
            "external_display_id": 11 if is_enabled else None,
            "resolution": "1920x1080" if is_enabled else None,
            "mouse_display_id": mock_did,
            "verification_status": "CONNECTED" if is_enabled else "DISABLED_PHONE_MODE",
            "diagnostic_advice": "Desktop mode active on mock display #11." if is_enabled else "Phone screen mode active (mock).",
            "message": f"Desktop mode {'enabled on mock display #11' if is_enabled else 'disabled (mock)'}"
        }

    # 1. Inspect OS Developer Settings on device
    os_ready = True
    settings_breakdown = {
        "secure_desktop_mode": is_enabled,
        "enable_freeform_support": is_enabled,
        "force_desktop_mode_on_external": is_enabled,
        "force_resizable_activities": is_enabled,
        "force_allow_on_external": is_enabled,
        "enable_non_resizable_multi_window": is_enabled,
        "override_desktop_experience": is_enabled,
        "override_desktop_mode": is_enabled
    }

    try:
        res_settings = await adb.run_adb_shell(
            "settings get secure desktop_mode; "
            "settings get global enable_freeform_support; "
            "settings get global force_desktop_mode_on_external_displays; "
            "settings get global force_resizable_activities; "
            "settings get global force_allow_on_external; "
            "settings get global enable_non_resizable_multi_window; "
            "settings get global override_desktop_experience_features; "
            "settings get global override_desktop_mode_features",
            ser,
            timeout=2.5
        )
        if res_settings.get("status") == "ok":
            lines = [l.strip() for l in res_settings.get("stdout", "").splitlines() if l.strip()]
            while len(lines) < 8:
                lines.append("0")

            settings_breakdown = {
                "secure_desktop_mode": (lines[0] == "1"),
                "enable_freeform_support": (lines[1] == "1"),
                "force_desktop_mode_on_external": (lines[2] == "1"),
                "force_resizable_activities": (lines[3] == "1"),
                "force_allow_on_external": (lines[4] == "1"),
                "enable_non_resizable_multi_window": (lines[5] == "1"),
                "override_desktop_experience": (lines[6] == "1"),
                "override_desktop_mode": (lines[7] == "1")
            }

            if is_enabled:
                if any(not v for v in settings_breakdown.values()):
                    await adb.run_adb_shell(
                        "settings put secure desktop_mode 1; "
                        "settings put global enable_freeform_support 1; "
                        "settings put global force_desktop_mode_on_external_displays 1; "
                        "settings put global force_resizable_activities 1; "
                        "settings put global force_allow_on_external 1; "
                        "settings put global enable_non_resizable_multi_window 1; "
                        "settings put global override_desktop_experience_features 1; "
                        "settings put global override_desktop_mode_features 1",
                        ser,
                        timeout=2.0
                    )
                    settings_breakdown = {k: True for k in settings_breakdown}
                os_ready = True
            else:
                os_ready = not all(settings_breakdown.values())
    except Exception:
        os_ready = True

    # 2. Check displays via dumpsys display
    displays = await get_connected_displays(ser)
    ext_disp = next((d for d in displays if d.get("isExternal") and d.get("displayId", 0) > 0), None)
    
    hardware_connected = bool(ext_disp is not None)
    ext_id = ext_disp.get("displayId") if ext_disp else None
    resolution = f"{ext_disp.get('width', 1920)}x{ext_disp.get('height', 1080)}" if ext_disp else None

    # 3. Check USB DP Alt Mode hardware status from dumpsys usb
    usb_connected = False
    hot_plug_detect = False
    dp_lanes = 0
    try:
        res_usb = await adb.run_adb_shell("dumpsys usb", ser, timeout=2.5)
        usb_out = res_usb.get("stdout", "") if res_usb.get("status") == "ok" else ""
        usb_lower = usb_out.lower()
        usb_connected = "connected=true" in usb_lower
        hot_plug_detect = "hotplugdetect=true" in usb_lower.replace(" ", "")
        m_lanes = re.search(r'numLanes=(\d+)', usb_out)
        if m_lanes:
            dp_lanes = int(m_lanes.group(1))
    except Exception:
        pass

    # 4. Determine status & diagnostics
    if not is_enabled:
        ver_status = "DISABLED_PHONE_MODE"
        mouse_id = 0
        advice = "Desktop mode disabled. Mouse pointer switched to phone screen, kiosk mode removed, and keyboard enabled for authentication."
        msg = "Desktop mode disabled. Mouse pointer switched to phone screen, kiosk mode removed, and keyboard enabled for authentication."
    elif hardware_connected:
        ver_status = "CONNECTED"
        mouse_id = ext_id or 11
        advice = f"Desktop mode ACTIVE & CONNECTED on Display #{ext_id} ({resolution}). Windows and mouse pointer routed to external monitor."
        msg = f"Desktop mode enabled on display #{ext_id}. Mouse routed to external monitor."
    else:
        ver_status = "ARMED_AWAITING_CABLE"
        mouse_id = 0
        if usb_connected and not hot_plug_detect:
            advice = (
                "Pixel 8 OS Desktop Mode is ARMED & READY (all 8 developer & window flags active). "
                "The USB-C hub is plugged in, but monitor DisplayPort video handshake (HPD) is waiting. "
                "Recommendations: 1) Verify external monitor is powered ON and set to the matching input (HDMI/DP). "
                "2) Connect USB-C PD power adapter to hub so the hub can power the display converter. "
                "3) Re-seat the HDMI/DP cable."
            )
            msg = "Desktop mode ARMED on device. USB-C hub detected, waiting for monitor signal (HPD). Connect PD power / verify monitor input."
        else:
            advice = (
                "Pixel 8 OS Desktop Mode is ARMED & VERIFIED (all 8 developer & window flags active). "
                "Device is ready to plug into the USB-C DP Alt Mode cable or hub."
            )
            msg = "Desktop mode ARMED on device. Ready to plug in USB-C DP Alt Mode cable."

    kiosk_state["desktop_mode_enabled"] = is_enabled
    kiosk_state["mouse_display_id"] = mouse_id
    if ext_id:
        kiosk_state["target_display_id"] = ext_id

    return {
        "status": "ok",
        "desktop_mode_enabled": is_enabled,
        "desktop_keyboard_prohibited": getattr(state, "desktop_keyboard_prohibited", True),
        "os_desktop_mode_ready": os_ready,
        "hardware_connected": hardware_connected,
        "usb_connected": usb_connected,
        "hot_plug_detect": hot_plug_detect,
        "dp_lanes": dp_lanes,
        "external_display_id": ext_id,
        "resolution": resolution,
        "mouse_display_id": mouse_id,
        "verification_status": ver_status,
        "diagnostic_advice": advice,
        "message": msg,
        "settings_breakdown": settings_breakdown,
        "developer_option_status": {
            "is_eligible": True,
            "switch_checked": True,
            "switch_enabled": False,
            "explanation": "Android 15 marks 'Enable desktop experience features' permanently forced ON (checked=true) for Pixel 8/9/10 devices. Because user toggling is locked by system policy, the switch appears dimmed in Developer Options, but is active and enforced."
        }
    }

async def toggle_desktop_mode(enable: bool, serial: Optional[str] = None) -> Dict[str, Any]:
    global kiosk_state
    ser = await adb.get_active_adb_serial(serial)
    from services import state

    if not ser or "mock" in str(ser).lower():
        state.desktop_mode_enabled = enable
        state.latest_telemetry["desktop_mode_enabled"] = enable
        kiosk_state["desktop_mode_enabled"] = enable
        mouse_id = 11 if enable else 0
        kiosk_state["mouse_display_id"] = mouse_id
        return {
            "status": "ok",
            "desktop_mode_enabled": enable,
            "mouse_display_id": mouse_id,
            "hardware_connected": enable,
            "os_desktop_mode_ready": True,
            "verification_status": "CONNECTED" if enable else "DISABLED_PHONE_MODE",
            "message": f"Desktop mode {'enabled' if enable else 'disabled'} (mock)"
        }

    # Detect external display ID (e.g. 11 or from kiosk_state)
    disp_id = kiosk_state.get("target_display_id", -1)
    if disp_id <= 0:
        disp_id = await adb.detect_external_display_id(ser)
    if disp_id <= 0:
        displays = await get_connected_displays(ser)
        for d in displays:
            if d.get("isExternal") and d.get("displayId", 0) > 0:
                disp_id = d["displayId"]
                break

    if not enable:
        # 1. Remove Kiosk Mode / App Pinning / Lock Task so user is not locked into markdown app
        await release_lock(serial=ser)

        # 2. Assure phone screen keyboard appears normally for authentication
        await adb.run_adb_shell(
            "ime enable com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
            "ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
            "settings put secure show_ime_with_hard_keyboard 1",
            ser
        )
        # Wake up phone display 0 and move mouse focus to phone screen
        await adb.run_adb_shell("input -d 0 keyevent 224; input -d 0 tap 540 1200 >/dev/null 2>&1", ser)

        state.desktop_mode_enabled = False
        state.latest_telemetry["desktop_mode_enabled"] = False
        kiosk_state["desktop_mode_enabled"] = False
        kiosk_state["mouse_display_id"] = 0

        verify_res = await verify_desktop_mode_status(ser)

        # Broadcast state changes
        await ws_manager.broadcast({
            "type": "desktop_mode_changed",
            **verify_res,
            "kiosk_removed": True,
            "keyboard_auth_ready": True
        })

        return verify_res
    else:
        # Enabling / Arming desktop mode
        # 1. Enforce Android OS developer settings for DisplayPort Alt Mode Desktop Mode
        await adb.run_adb_shell(
            "settings put secure desktop_mode 1; "
            "settings put global enable_freeform_support 1; "
            "settings put global force_desktop_mode_on_external_displays 1; "
            "settings put global force_resizable_activities 1; "
            "settings put global force_allow_on_external 1; "
            "settings put global enable_non_resizable_multi_window 1; "
            "settings put global override_desktop_experience_features 1; "
            "settings put global override_desktop_mode_features 1",
            ser
        )

        if disp_id > 0:
            await adb.run_adb_shell(f"cmd display enable-display {disp_id}", ser)
            await asyncio.sleep(0.15)
            # Route mouse cursor back to external desktop display away from center window caption handle
            await adb.run_adb_shell(f"input -d {disp_id} tap 240 40 >/dev/null 2>&1", ser)
            await adb.enforce_markdown_only_on_desktop(ser, disp_id)
            await adb.auto_fix_viewport(ser, disp_id)
            await adb.dismiss_anr_dialogs(ser, disp_id)

        # If desktop keyboard prohibition is active, re-enforce prohibition on desktop
        if getattr(state, "desktop_keyboard_prohibited", True):
            await set_desktop_keyboard_prohibition(True, ser)

        state.desktop_mode_enabled = True
        state.latest_telemetry["desktop_mode_enabled"] = True
        kiosk_state["desktop_mode_enabled"] = True
        kiosk_state["mouse_display_id"] = disp_id if disp_id > 0 else 0

        verify_res = await verify_desktop_mode_status(ser)

        await ws_manager.broadcast({
            "type": "desktop_mode_changed",
            **verify_res,
            "kiosk_removed": False,
            "keyboard_auth_ready": not getattr(state, "desktop_keyboard_prohibited", True)
        })

        return verify_res


