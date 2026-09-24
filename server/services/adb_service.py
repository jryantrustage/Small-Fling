import asyncio, json, os, re, subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import cv2
import numpy as np

from alignment_engine import detect_teams_markdown_alignment
import config

DEVICE_PROFILES = {
    "pixel_10": {"id": "pixel_10", "displayName": "Pixel 10", "lines_per_page": 47, "arrow_count_init": 95, "arrow_count_step": 47, "step_size": 47},
    "pixel_8": {"id": "pixel_8", "displayName": "Pixel 8", "lines_per_page": 31, "arrow_count_init": 63, "arrow_count_step": 30, "step_size": 30}
}

def init_device_model_from_cache() -> str:
    try:
        cf = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
        if cf.exists():
            c = json.loads(cf.read_text())
            last, p10, p8 = c.get("last_address", ""), c.get("pixel_10_address", ""), c.get("pixel_8_address", "")
            if last and last == p10: return "pixel_10"
            if last and last == p8: return "pixel_8"
    except Exception: pass
    return "pixel_10"

current_device_model = init_device_model_from_cache()
target_adb_serial: Optional[str] = None

def _exec_adb_sync(args: List[str], timeout: float = 4.0, text: bool = True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            [(getattr(config, "ADB_PATH", None) or "adb")] + args,
            capture_output=True,
            text=text,
            timeout=timeout,
            stdin=subprocess.DEVNULL
        )
    except Exception as e:
        return subprocess.CompletedProcess(
            args=args,
            returncode=-1,
            stdout="" if text else b"",
            stderr=str(e).encode() if not text else str(e)
        )

def _exec_adb_sync_bin(args: List[str], timeout: float = 6.0) -> subprocess.CompletedProcess:
    return _exec_adb_sync(args, timeout=timeout, text=False)

def _extract_png_bytes(data: Optional[bytes]) -> Optional[bytes]:
    if not data: return None
    idx = data.find(b"\x89PNG\r\n\x1a\n")
    return data[idx:] if idx >= 0 else None

def _png_to_jpeg(png_bytes: Optional[bytes], quality: int = 80, max_dim: int = 1280) -> Optional[bytes]:
    if not png_bytes: return None
    img = cv2.imdecode(np.frombuffer(png_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None or img.size == 0: return None
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    _, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return jpg.tobytes()

async def run_adb_shell(cmd_str: str, serial: Optional[str] = None, timeout: float = 5.0) -> Dict[str, Any]:
    ser = await get_active_adb_serial(serial)
    cmd = (["-s", ser] if ser else []) + ["shell", cmd_str]
    try:
        res = await asyncio.to_thread(_exec_adb_sync, cmd, timeout)
        return {"status": "ok" if res.returncode == 0 else "error", "stdout": res.stdout, "stderr": res.stderr, "code": res.returncode}
    except Exception as e:
        return {"status": "exception", "error": str(e), "code": -1}

async def list_adb_devices() -> Dict[str, Any]:
    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["devices", "-l"], 3.0)
        devs = []
        for line in res.stdout.splitlines()[1:]:
            line = line.strip()
            if not line or line.startswith("*"): continue
            parts = line.split()
            if len(parts) >= 2:
                model = "unknown"
                for p in parts[2:]:
                    if p.startswith("model:"): model = p.split(":", 1)[1]
                devs.append({"serial": parts[0], "status": parts[1], "model": model, "displayName": model.replace("_", " "), "raw": line})
        return {"status": "ok", "devices": devs}
    except Exception as e:
        return {"status": "error", "error": str(e), "devices": []}

async def get_active_adb_serial(requested_serial: Optional[str] = None) -> Optional[str]:
    global current_device_model, target_adb_serial
    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["devices", "-l"], 3.0)
        active = []
        for line in res.stdout.splitlines()[1:]:
            parts = line.strip().split()
            if len(parts) >= 2 and parts[1] == "device":
                model = next((p.split(":", 1)[1] for p in parts[2:] if p.startswith("model:")), "unknown")
                active.append({"serial": parts[0], "model": model, "raw": line.strip()})
        if not active: return None
        if requested_serial:
            for dev in active:
                if dev["serial"] == requested_serial or requested_serial in dev["serial"]: return dev["serial"]

        pref = "pixel_8" if "8" in current_device_model.lower() else "pixel_10"
        p8_keys, p10_keys = ["pixel_8", "husky", "shiba", "pixel 8"], ["pixel_10", "mustang", "frankel", "pixel 10"]
        keys = p8_keys if pref == "pixel_8" else p10_keys

        for dev in active:
            m = (dev["model"] + " " + dev["raw"]).lower()
            if any(k in m for k in keys): return dev["serial"]
        if target_adb_serial:
            for dev in active:
                if dev["serial"] == target_adb_serial: return dev["serial"]
        return active[0]["serial"]
    except Exception:
        return None

async def connect_device_for_model(model_pref: str) -> Optional[str]:
    try:
        keys = ["pixel_10", "mustang", "frankel", "pixel 10"] if model_pref == "pixel_10" else ["pixel_8", "husky", "shiba", "pixel 8"]
        res = await asyncio.to_thread(_exec_adb_sync, ["devices", "-l"], 3.0)
        for line in res.stdout.splitlines()[1:]:
            parts = line.strip().split()
            if len(parts) >= 2 and parts[1] == "device" and any(k in line.lower() for k in keys):
                return parts[0]

        cf = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
        if cf.exists():
            try:
                cdata = json.loads(cf.read_text())
                cached = cdata.get("pixel_10_address") if model_pref == "pixel_10" else cdata.get("pixel_8_address")
                if cached:
                    cres = await asyncio.to_thread(_exec_adb_sync, ["connect", cached], 5.0)
                    if "connected" in cres.stdout.lower(): return cached
            except Exception: pass

        mdns_res = await asyncio.to_thread(_exec_adb_sync, ["mdns", "services"], 4.0)
        for line in mdns_res.stdout.splitlines():
            ls = line.strip()
            if ("_adb-tls-connect._tcp" in ls or "_adb._tcp" in ls) and ":" in ls.split()[-1]:
                addr = ls.split()[-1]
                cres = await asyncio.to_thread(_exec_adb_sync, ["connect", addr], 4.0)
                if "connected" in cres.stdout.lower():
                    chk = await asyncio.to_thread(_exec_adb_sync, ["-s", addr, "shell", "getprop ro.product.model"], 3.0)
                    if any(k in (chk.stdout + " " + ls).lower() for k in keys): return addr
    except Exception as e:
        print(f"Error in connect_device_for_model({model_pref}): {e}")
    return None

async def detect_external_display_id(serial: Optional[str] = None) -> int:
    global current_device_model
    ser = await get_active_adb_serial(serial)
    if ser:
        res = await run_adb_shell("dumpsys display | grep -E 'mDisplayId=[1-9]|displayId=[1-9]' | head -n 5", ser)
        if res.get("status") == "ok" and res.get("stdout"):
            for line in res["stdout"].splitlines():
                m = re.search(r'(?:mDisplayId|displayId)=(\d+)', line)
                if m and int(m.group(1)) != 0:
                    return int(m.group(1))
    return 9 if ("10" in current_device_model.lower() or "mustang" in current_device_model.lower()) else 4

async def detect_surfaceflinger_displays(serial: Optional[str] = None) -> Dict[str, str]:
    ser = await get_active_adb_serial(serial)
    res = await asyncio.to_thread(_exec_adb_sync, (["-s", ser] if ser else []) + ["shell", "dumpsys SurfaceFlinger --display-id"], 5.0)
    displays = {}
    if res.returncode == 0 and res.stdout:
        for line in res.stdout.splitlines():
            m = re.search(r'Display\s+(\d+)', line)
            if m:
                did = m.group(1)
                if "port=0" in line: displays["phone"] = did
                elif ("port=" in line and "port=0" not in line) or "MB16AMTR" in line or "display 256" in line: displays["desktop"] = did
        all_ids = re.findall(r'Display\s+(\d+)', res.stdout)
        if "phone" not in displays and len(all_ids) > 0: displays["phone"] = all_ids[0]
        if "desktop" not in displays and len(all_ids) > 1: displays["desktop"] = all_ids[1]
    return displays

async def detect_surfaceflinger_display_id(serial: Optional[str] = None) -> Optional[str]:
    return (await detect_surfaceflinger_displays(serial)).get("desktop")

from services.capture_card_service import capture_card_mgr

async def capture_external_screenshot(serial: Optional[str] = None) -> Optional[bytes]:
    # 1. Try Hardware Video Capture Card (USB3 Video / DirectShow) first
    try:
        jpg, meta = capture_card_mgr.grab_frame(quality=90, max_dim=1920)
        if jpg:
            return jpg
    except Exception as ce:
        print(f"[capture_external_screenshot] Capture card read note: {ce}")

    # 2. Multi-strategy ADB screencap
    ser = await get_active_adb_serial(serial)
    if not ser:
        return None

    ext_id = str(await detect_external_display_id(ser))
    sf_id = await detect_surfaceflinger_display_id(ser)
    ids_to_try = [i for i in [ext_id, sf_id] if i]
    if not ids_to_try:
        ids_to_try = ["13", "4", "2", "1"]

    for did in ids_to_try:
        cmd = ["-s", ser, "exec-out", "screencap", "-d", str(did), "-p"]
        cap = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 5.0)
        if cap.returncode == 0 and (png_bytes := _extract_png_bytes(cap.stdout)):
            return png_bytes

    # Fallback without -d
    cmd_default = ["-s", ser, "exec-out", "screencap", "-p"]
    cap_def = await asyncio.to_thread(_exec_adb_sync_bin, cmd_default, 5.0)
    if cap_def.returncode == 0 and (png_bytes := _extract_png_bytes(cap_def.stdout)):
        return png_bytes

    # Fallback to file pull
    dev_path = "/sdcard/mc_calib_temp.png"
    await asyncio.to_thread(_exec_adb_sync, ["-s", ser, "shell", f"screencap -p {dev_path}"], 5.0)
    pull = await asyncio.to_thread(_exec_adb_sync_bin, ["-s", ser, "exec-out", f"cat {dev_path} && rm -f {dev_path}"], 5.0)
    return _extract_png_bytes(pull.stdout) if pull.returncode == 0 else None

async def capture_screen(mode: str = "desktop", serial: Optional[str] = None, quality: int = 80, max_dim: int = 1280) -> Optional[bytes]:
    # Priority 1: Hardware Capture Card for desktop mode
    if mode == "desktop":
        try:
            jpg, meta = capture_card_mgr.grab_frame(quality=quality, max_dim=max_dim)
            if jpg:
                return jpg
        except Exception:
            pass

    # Priority 2: ADB Screencap
    ser = await get_active_adb_serial(serial)
    if ser:
        if mode == "desktop":
            raw_bytes = await capture_external_screenshot(ser)
            if raw_bytes:
                return _png_to_jpeg(raw_bytes, quality, max_dim)
        else:
            cmd = ["-s", ser, "exec-out", "screencap", "-p"]
            res = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 4.0)
            if res.returncode == 0 and (jpg := _png_to_jpeg(_extract_png_bytes(res.stdout), quality, max_dim)):
                return jpg

    # Priority 3: Branded HUD Standby frame rather than 503 error
    if mode == "desktop":
        sources = capture_card_mgr.list_video_sources()
        if sources.get("has_capture_card"):
            return capture_card_mgr.create_hud_standby_frame(
                title="DESKTOP CAPTURE CARD IN USE",
                subtitle="USB3 Video is open in Windows Camera App",
                hint="Close Windows Camera app to stream directly in Matrix Capture Studio."
            )
        else:
            return capture_card_mgr.create_hud_standby_frame(
                title="LIVE DESKTOP STANDBY",
                subtitle="Awaiting ADB or HDMI Capture Card connection",
                hint="Connect via Wireless ADB (.\\scripts\\pixel_device_helper.ps1 connect) or plug in HDMI Capture Card."
            )
    return None

async def configure_display_awake_policies(serial: Optional[str] = None):
    ser = await get_active_adb_serial(serial)
    if not ser: return
    try:
        # Stay awake on AC, USB, Wireless power (1 | 2 | 4 = 7)
        await run_adb_shell("settings put global stay_on_while_plugged_in 7", ser)
        # Maximum screen off timeout (~24.8 days)
        await run_adb_shell("settings put system screen_off_timeout 2147483647", ser)
        # Disable sleep timeout
        await run_adb_shell("settings put global sleep_timeout -1", ser)
        # Force power stay on
        await run_adb_shell("svc power stayon true", ser)
        # Disable doze/ambient sleep
        await run_adb_shell("settings put secure doze_enabled 0", ser)
    except Exception:
        pass

async def pulse_display_awake_heartbeat(serial: Optional[str] = None):
    ser = await get_active_adb_serial(serial)
    if not ser: return
    try:
        # Send keyevent 224 (KEYCODE_WAKEUP) to reset sleep counter
        await run_adb_shell("input keyevent 224", ser)
        # In Android Desktop Mode, external displays time out due to inactivity unless input events occur on them
        ext_id = await detect_external_display_id(ser)
        if ext_id and ext_id > 0:
            await run_adb_shell(f"input -d {ext_id} keyevent 224", ser)
            # Simulated micro-motion to reset external display inactivity timer
            await run_adb_shell(f"input -d {ext_id} motionevent MOVE 500 500", ser)
    except Exception:
        pass

async def awake_keepalive_loop():
    while True:
        try:
            await asyncio.sleep(20.0)
            ser = await get_active_adb_serial()
            if ser:
                await configure_display_awake_policies(ser)
                await pulse_display_awake_heartbeat(ser)
        except Exception:
            await asyncio.sleep(10.0)

async def mjpeg_stream_generator(mode: str = "desktop", serial: Optional[str] = None, fps: float = 2.0, quality: int = 75, max_dim: int = 960):
    interval = 1.0 / max(0.5, min(fps, 4.0))
    while True:
        jpg = await capture_screen(mode=mode, serial=serial, quality=quality, max_dim=max_dim)
        if jpg:
            yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpg)).encode() + b"\r\n\r\n" + jpg + b"\r\n"
        await asyncio.sleep(interval)

async def is_ime_visible(serial: Optional[str] = None) -> bool:
    try:
        ser = await get_active_adb_serial(serial)
        if not ser: return False
        chk = await run_adb_shell("dumpsys input_method | grep -E 'mInputShown=true|mImeWindowVis=[123]'", ser)
        out = chk.get("stdout", "")
        return "mInputShown=true" in out or any(f"mImeWindowVis={v}" in out for v in [1, 2, 3])
    except Exception: return False

async def ensure_adb_keyboard_closed(serial: Optional[str] = None) -> bool:
    try:
        ser = await get_active_adb_serial(serial)
        if not ser: return False
        await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0", ser)
        chk_acc = await run_adb_shell("settings get secure enabled_accessibility_services", ser)
        acc_str = chk_acc.get("stdout", "")
        if "DesktopPaginationService" not in acc_str:
            svc = "com.matrixcapture.app/com.matrixcapture.app.service.DesktopPaginationService"
            new_acc = f"{acc_str.strip()}:{svc}" if acc_str.strip() and acc_str.strip() != "null" else svc
            await run_adb_shell(f"settings put secure enabled_accessibility_services {new_acc}", ser)
            await run_adb_shell("settings put secure accessibility_enabled 1", ser)

        if await is_ime_visible(ser):
            await run_adb_shell("am broadcast -a com.matrixcapture.app.ACTION_CLOSE_KEYBOARD", ser)
            await run_adb_shell("input -d 0 keyevent 111", ser)
            await asyncio.sleep(0.1)
            if await is_ime_visible(ser): await run_adb_shell("input -d 0 keyevent 4", ser)
            return True
        return False
    except Exception: return False

async def get_device_info() -> Dict[str, Any]:
    global current_device_model
    ser = await get_active_adb_serial()
    devs = (await list_adb_devices()).get("devices", [])
    matched = next((d for d in devs if d["serial"] == ser), None)
    active_model = matched.get("model", current_device_model) if matched else current_device_model
    if matched and target_adb_serial is None:
        m = active_model.lower()
        if any(k in m for k in ["pixel_8", "husky", "shiba", "8"]): current_device_model = "pixel_8"
        elif any(k in m for k in ["pixel_10", "mustang", "frankel", "10"]): current_device_model = "pixel_10"
    disp_map = await detect_surfaceflinger_displays(ser) if ser else {}
    return {
        "status": "success", "connected": bool(ser), "active_serial": ser,
        "active_model": active_model.replace("_", " "), "device_model": current_device_model,
        "profile": DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"]),
        "available_profiles": list(DEVICE_PROFILES.values()), "target_serial": target_adb_serial,
        "devices": devs, "displays": {"desktop": bool(disp_map.get("desktop")), "phone": bool(disp_map.get("phone"))}
    }

async def send_hid_keycombination(key1: int, key2: int, serial: Optional[str] = None):
    from services import state
    # 1. Update orchestration state so connected Android app immediately executes it via HTTP
    cmd_name = "CTRL_END" if key2 == 123 else ("CTRL_HOME" if key2 == 122 else f"KEY_{key1}_{key2}")
    state.orchestration_state.update({
        "last_command": cmd_name,
        "updated_at": datetime.now().isoformat(),
        "source": "studio"
    })

    # 2. Silently ensure soft keyboard is suppressed without sending destructive Back/Escape
    ser = await get_active_adb_serial(serial)
    if ser:
        await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0", ser)

        disp_id = await detect_external_display_id(ser)
        model_disp = 9 if ("10" in current_device_model.lower() or "mustang" in current_device_model.lower()) else 4

        # Dispatch to detected display
        if disp_id > 0:
            await run_adb_shell(f"input -d {disp_id} keycombination {key1} {key2}", ser)
        # Dispatch to model-specific display (e.g. 9 on Pixel 10, 4 on Pixel 8)
        if model_disp != disp_id:
            await run_adb_shell(f"input -d {model_disp} keycombination {key1} {key2}", ser)

        # Dispatch to global focused window (vital for desktop freeform windows)
        await asyncio.sleep(0.04)
        await run_adb_shell(f"input keycombination {key1} {key2}", ser)

        # For EOF / Line 1 jump, also send KEYCODE_MOVE_END (123) / KEYCODE_MOVE_HOME (122)
        if key2 in [122, 123]:
            await asyncio.sleep(0.02)
            await run_adb_shell(f"input keyevent {key2}", ser)

async def check_and_update_alignment(serial: Optional[str] = None) -> Dict[str, Any]:
    from services import state
    active_serial = await get_active_adb_serial(serial)
    if not active_serial: return state.latest_alignment_status
    try:
        snap_bytes = await capture_external_screenshot(active_serial)
        if snap_bytes:
            res = await asyncio.to_thread(detect_teams_markdown_alignment, snap_bytes)
            res["timestamp"] = datetime.now().isoformat()
            try:
                from classifiers.registry import classifier_registry
                from classifiers.base import ClassifierContext
                disp_id = await detect_external_display_id(active_serial)
                await classifier_registry.evaluate_all(ClassifierContext(serial=active_serial, display_id=disp_id, image_bytes=snap_bytes, alignment_data=res))
                c_report = classifier_registry.get_status_report()
                res["classifiers"], res["classifier_issues"] = c_report, c_report.get("issues", [])
                if c_report.get("has_issues"): state.latest_telemetry["classifier_issues"] = c_report.get("issues", [])
            except Exception as ce: print(f"[check_and_update_alignment] Classifier error: {ce}")

            state.latest_alignment_status.clear()
            state.latest_alignment_status.update(res)
            if not res.get("is_aligned", False) and state.orchestration_state.get("status") == "RUNNING":
                state.orchestration_state.update({"status": "PAUSED", "step_label": "PAUSED: teams markdown not aligned"})
                state.latest_telemetry["status_message"] = f"⚠️ teams markdown not aligned ({res.get('reason')})"

            await state.ws_manager.broadcast({
                "type": "alignment_status", "alignment": state.latest_alignment_status,
                "data": state.latest_alignment_status, "classifiers": res.get("classifiers", {}),
                "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry
            })
    except Exception as e: print(f"[check_and_update_alignment] Error: {e}")
    return state.latest_alignment_status

async def alignment_monitor_loop():
    while True:
        try:
            await asyncio.sleep(2.5)
            serial = await get_active_adb_serial()
            if serial: await check_and_update_alignment(serial)
        except Exception: await asyncio.sleep(4.0)

async def get_live_view_metadata(serial: Optional[str] = None, mode: str = "desktop") -> Dict[str, Any]:
    from services import state
    active_ser = await get_active_adb_serial(serial)
    devs = (await list_adb_devices()).get("devices", [])
    matched = next((d for d in devs if d["serial"] == active_ser), None) if active_ser else None
    model_name = matched.get("model", current_device_model) if matched else current_device_model

    disp_id, disp_name, resolution, fps, state_str = None, "External Display (HDMI)" if mode == "desktop" else "Built-in Screen", "1920x1080" if mode == "desktop" else "1080x2400", 60.0, "ON"
    if active_ser:
        try:
            disp_map = await detect_surfaceflinger_displays(active_ser)
            disp_id = disp_map.get(mode) or disp_map.get("desktop")
            res_d = await run_adb_shell("dumpsys display | grep -E 'DisplayDeviceInfo.*HDMI|DisplayDeviceInfo.*Display 4|DisplayDeviceInfo.*MB16'", active_ser)
            if res_d.get("status") == "ok" and res_d.get("stdout"):
                out = res_d["stdout"]
                if m_res := re.search(r'(\d+)\s*x\s*(\d+)', out): resolution = f"{m_res.group(1)}x{m_res.group(2)}"
                if m_fps := re.search(r'renderFrameRate\s+([\d\.]+)|fps=([\d\.]+)', out): fps = float(m_fps.group(1) or m_fps.group(2))
                if m_name := re.search(r'name=([^,]+)|displayName="([^"]+)"', out): disp_name = m_name.group(1) or m_name.group(2)
        except Exception: pass

    running_processes, focused_app, focused_window, ime_vis, hard_suppressed = [], "", "", False, True
    if active_ser:
        try:
            res_w = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", active_ser)
            if res_w.get("status") == "ok" and res_w.get("stdout"):
                for line in res_w["stdout"].splitlines():
                    if "mFocusedApp" in line and not focused_app: focused_app = line.strip()
                    elif "mCurrentFocus" in line and not focused_window: focused_window = line.strip()

            res_p = await run_adb_shell("ps -A -o USER,PID,PPID,VSZ,RSS,NAME", active_ser)
            if res_p.get("status") == "ok" and res_p.get("stdout"):
                for line in res_p["stdout"].splitlines():
                    if any(k in line for k in ["com.microsoft.teams", "com.matrixcapture.app"]):
                        parts = line.split()
                        if len(parts) >= 6:
                            p_name = parts[5]
                            p_rss = int(parts[4]) if parts[4].isdigit() else 0
                            act = ""
                            if "teams" in p_name and "com.microsoft.teams/" in focused_app:
                                if m_act := re.search(r'com\.microsoft\.teams/([^\s}]+)', focused_app): act = m_act.group(1).split(".")[-1]
                            running_processes.append({
                                "name": p_name, "label": "Microsoft Teams (Markdown Viewer)" if "teams" in p_name else "MatrixCapture Engine",
                                "pid": parts[1], "ppid": parts[2], "user": parts[0], "rss_kb": p_rss, "rss_mb": round(p_rss / 1024.0, 1),
                                "activity": act or ("FilePreviewActivity" if "teams" in p_name else "DesktopPaginationService"),
                                "is_focused": p_name in focused_app or p_name in focused_window
                            })
            ime_vis = await is_ime_visible(active_ser)
            chk_supp = await run_adb_shell("settings get secure show_ime_with_hard_keyboard", active_ser)
            hard_suppressed = (chk_supp.get("stdout", "").strip() == "0")
        except Exception as pe: print(f"Error fetching process attributes: {pe}")

    align = state.latest_alignment_status or {}
    first_ln = align.get("first_line_number", 0) or state.latest_telemetry.get("current_top_line", 0)
    last_ln = align.get("last_line_number", 0) or state.latest_telemetry.get("current_bottom_line", 0)
    vis_count = (last_ln - first_ln + 1) if (last_ln > 0 and first_ln > 0 and last_ln >= first_ln) else 0

    return {
        "timestamp": datetime.now().isoformat(), "live_mode": mode,
        "device": {"serial": active_ser, "model": model_name.replace("_", " "), "target_serial": target_adb_serial, "connected": bool(active_ser)},
        "display": {"name": disp_name, "display_id": str(disp_id) if disp_id else "4", "mode": mode, "resolution": resolution, "fps": fps, "state": state_str},
        "processes": {"focused_app": focused_app, "focused_window": focused_window, "running_processes": running_processes,
                      "keyboard_status": {"ime_visible": ime_vis, "hard_keyboard_suppressed": hard_suppressed}},
        "gutter_stats": {
            "first_line_number": first_ln, "last_line_number": last_ln, "visible_lines": vis_count,
            "alignment_status": align.get("status", "teams markdown aligned" if align.get("is_aligned") else "pending"),
            "is_aligned": align.get("is_aligned", False), "file_name": align.get("file_name", "Matrix_main_26-09-17-8-19am.md"),
            "dark_mode": align.get("boxes", {}).get("dark_mode", {}).get("passed", True),
            "edit_mode": align.get("boxes", {}).get("edit_mode", {}).get("passed", True),
            "line_range": f"{first_ln} - {last_ln}" if (first_ln > 0 and last_ln > 0) else "Gutter detecting...",
            "boxes": {"first_line": align.get("boxes", {}).get("first_line"), "last_line": align.get("boxes", {}).get("last_line")}
        }
    }
