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
    "locked_task_id": -1,
    "foreground_package": "",
    "device_owner_active": False,
    "active_admin_active": False,
    "displays": [],
    "peripheral_restrictions": {
        "suppress_hotkeys": True,
        "disable_status_bar": True,
        "prevent_sleep": True
    },
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

    kiosk_state.update({
        "connected": True,
        "serial": ser,
        "lock_status": lock_status,
        "kiosk_mode": "kiosk" if lock_status != "UNLOCKED" else kiosk_state.get("kiosk_mode", "freeform"),
        "target_display_id": target_did,
        "locked_package": locked_pkg or kiosk_state.get("locked_package", ""),
        "locked_task_id": locked_task_id,
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
    mode: str = "kiosk",
    restrictions: Optional[Dict[str, Any]] = None,
    serial: Optional[str] = None
) -> Dict[str, Any]:
    global kiosk_state
    ser = await adb.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active device connected"}

    if restrictions:
        kiosk_state["peripheral_restrictions"].update(restrictions)

    restr = kiosk_state["peripheral_restrictions"]

    # 1. Apply system-level dock & sleep restrictions
    if restr.get("prevent_sleep", True):
        # 3 = Stay awake on AC/USB
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

    # 5. Find task ID of the target package or top task on external display and lock it
    res_tasks = await adb.run_adb_shell("dumpsys activity tasks | grep -E 'Task\\{.*A=.*\\}' | head -n 5", ser)
    out_tasks = res_tasks.get("stdout", "") if res_tasks.get("status") == "ok" else ""
    
    task_id_to_lock = None
    if package_id:
        pkg_m = re.search(rf'#(\d+)\s+type=\w+\s+A=\d+:{re.escape(package_id)}', out_tasks)
        if pkg_m:
            task_id_to_lock = int(pkg_m.group(1))

    if not task_id_to_lock:
        # Fallback to top task
        top_m = re.search(r'#(\d+)\s+type=standard', out_tasks)
        if top_m:
            task_id_to_lock = int(top_m.group(1))

    if task_id_to_lock:
        lock_res = await adb.run_adb_shell(f"am task lock {task_id_to_lock}", ser)
        kiosk_state["locked_task_id"] = task_id_to_lock

    # Refresh and broadcast state
    await asyncio.sleep(0.2)
    updated = await query_kiosk_status(ser)
    await ws_manager.broadcast({
        "type": "kiosk_state_changed",
        "data": updated
    })

    return {
        "status": "ok",
        "message": f"Locked external display #{display_id} to {package_id}",
        "kiosk_state": updated
    }

async def release_lock(admin_pin: Optional[str] = None, serial: Optional[str] = None) -> Dict[str, Any]:
    global kiosk_state
    ser = await adb.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active device connected"}

    # 1. Stop Task Lock via Android ActivityManager
    await adb.run_adb_shell("am task lock stop", ser)

    # 2. Send Release Broadcast to Android KioskManager
    await adb.run_adb_shell("am broadcast -a com.matrixcapture.app.action.RELEASE_LOCK", ser)

    # 3. Restore global system restrictions
    await adb.run_adb_shell("settings put global policy_control null", ser)

    kiosk_state["lock_status"] = "UNLOCKED"
    kiosk_state["locked_package"] = ""
    kiosk_state["locked_task_id"] = -1

    await asyncio.sleep(0.1)
    updated = await query_kiosk_status(ser)
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
    if not ser:
        return {"status": "error", "message": "No active device connected"}

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
