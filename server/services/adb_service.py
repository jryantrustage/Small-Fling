import asyncio
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List
import cv2
import numpy as np

from datetime import datetime
from alignment_engine import detect_teams_markdown_alignment
import config

DEVICE_PROFILES = {
    "pixel_10": {
        "id": "pixel_10",
        "displayName": "Pixel 10",
        "lines_per_page": 47,
        "arrow_count_init": 95,
        "arrow_count_step": 47,
        "step_size": 47
    },
    "pixel_8": {
        "id": "pixel_8",
        "displayName": "Pixel 8",
        "lines_per_page": 31,
        "arrow_count_init": 63,
        "arrow_count_step": 30,
        "step_size": 30
    }
}

def init_device_model_from_cache() -> str:
    try:
        cache_file = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
        if cache_file.exists():
            cdata = json.loads(cache_file.read_text())
            last = cdata.get("last_address", "")
            p10 = cdata.get("pixel_10_address", "")
            p8 = cdata.get("pixel_8_address", "")
            if last and last == p10:
                return "pixel_10"
            if last and last == p8:
                return "pixel_8"
    except Exception:
        pass
    return "pixel_10"

current_device_model = init_device_model_from_cache()
target_adb_serial: Optional[str] = None

def _exec_adb_sync(args: List[str], timeout: float = 4.0) -> subprocess.CompletedProcess:
    adb_bin = getattr(config, "ADB_PATH", None) or "adb"
    cmd = [adb_bin] + args
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

def _exec_adb_sync_bin(args: List[str], timeout: float = 6.0) -> subprocess.CompletedProcess:
    adb_bin = getattr(config, "ADB_PATH", None) or "adb"
    cmd = [adb_bin] + args
    return subprocess.run(cmd, capture_output=True, timeout=timeout)

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
        lines = res.stdout.splitlines()
        devs = []
        for line in lines[1:]:
            line = line.strip()
            if not line or line.startswith("*"): continue
            parts = line.split()
            if len(parts) >= 2:
                model = "unknown"
                for p in parts[2:]:
                    if p.startswith("model:"): model = p.split(":", 1)[1]
                disp_name = model.replace("_", " ")
                devs.append({"serial": parts[0], "status": parts[1], "model": model, "displayName": disp_name, "raw": line})
        return {"status": "ok", "devices": devs}
    except Exception as e:
        return {"status": "error", "error": str(e), "devices": []}

async def get_active_adb_serial(requested_serial: Optional[str] = None) -> Optional[str]:
    global current_device_model, target_adb_serial
    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["devices", "-l"], 3.0)
        lines = res.stdout.splitlines()
        active = []
        for line in lines[1:]:
            line = line.strip()
            if not line or line.startswith("*"): continue
            parts = line.split()
            if len(parts) >= 2 and parts[1] == "device":
                model = "unknown"
                for p in parts[2:]:
                    if p.startswith("model:"): model = p.split(":", 1)[1]
                active.append({"serial": parts[0], "model": model, "raw": line})
        if not active:
            return requested_serial or target_adb_serial

        if requested_serial:
            for dev in active:
                if dev["serial"] == requested_serial or requested_serial in dev["serial"]:
                    return dev["serial"]

        pref = "pixel_8" if "8" in current_device_model.lower() else "pixel_10"
        if target_adb_serial:
            for dev in active:
                if dev["serial"] == target_adb_serial:
                    m = (dev["model"] + " " + dev["raw"]).lower()
                    if pref == "pixel_8" and any(k in m for k in ["pixel_8", "husky", "shiba", "pixel 8"]):
                        return dev["serial"]
                    elif pref == "pixel_10" and any(k in m for k in ["pixel_10", "mustang", "frankel", "pixel 10"]):
                        return dev["serial"]

        for dev in active:
            m = (dev["model"] + " " + dev["raw"]).lower()
            if pref == "pixel_8" and any(k in m for k in ["pixel_8", "husky", "shiba", "pixel 8"]):
                return dev["serial"]
            elif pref == "pixel_10" and any(k in m for k in ["pixel_10", "mustang", "frankel", "pixel 10"]):
                return dev["serial"]

        if target_adb_serial:
            for dev in active:
                if dev["serial"] == target_adb_serial: return dev["serial"]

        return active[0]["serial"]
    except Exception:
        return requested_serial or target_adb_serial

async def connect_device_for_model(model_pref: str) -> Optional[str]:
    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["devices", "-l"], 3.0)
        for line in res.stdout.splitlines()[1:]:
            parts = line.strip().split()
            if len(parts) >= 2 and parts[1] == "device":
                m = line.lower()
                if model_pref == "pixel_10" and any(k in m for k in ["pixel_10", "mustang", "frankel", "pixel 10"]):
                    return parts[0]
                elif model_pref == "pixel_8" and any(k in m for k in ["pixel_8", "husky", "shiba", "pixel 8"]):
                    return parts[0]

        cache_file = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
        cached_addr = None
        if cache_file.exists():
            try:
                cdata = json.loads(cache_file.read_text())
                if model_pref == "pixel_10": cached_addr = cdata.get("pixel_10_address")
                elif model_pref == "pixel_8": cached_addr = cdata.get("pixel_8_address")
            except Exception: pass

        if cached_addr:
            cres = await asyncio.to_thread(_exec_adb_sync, ["connect", cached_addr], 5.0)
            if "connected" in cres.stdout.lower():
                return cached_addr

        mdns_res = await asyncio.to_thread(_exec_adb_sync, ["mdns", "services"], 4.0)
        for line in mdns_res.stdout.splitlines():
            line_str = line.strip()
            if "_adb-tls-connect._tcp" in line_str or "_adb._tcp" in line_str:
                parts = line_str.split()
                if len(parts) >= 3 and ":" in parts[-1]:
                    addr = parts[-1]
                    cres = await asyncio.to_thread(_exec_adb_sync, ["connect", addr], 4.0)
                    if "connected" in cres.stdout.lower():
                        chk = await asyncio.to_thread(_exec_adb_sync, ["-s", addr, "shell", "getprop ro.product.model"], 3.0)
                        chk_m = (chk.stdout + " " + line_str).lower()
                        if model_pref == "pixel_10" and any(k in chk_m for k in ["pixel 10", "pixel_10", "mustang"]):
                            return addr
                        elif model_pref == "pixel_8" and any(k in chk_m for k in ["pixel 8", "pixel_8", "husky"]):
                            return addr
    except Exception as e:
        print(f"Error in connect_device_for_model({model_pref}): {e}")
    return None

async def detect_external_display_id(serial: Optional[str] = None) -> int:
    ser = await get_active_adb_serial(serial)
    res = await run_adb_shell("dumpsys display | grep -E 'mDisplayId=[1-9]' | head -n 1", ser)
    if res.get("status") == "ok" and res.get("stdout"):
        m = re.search(r'mDisplayId=(\d+)', res["stdout"])
        if m:
            val = int(m.group(1))
            if val != 0: return val
    return 4

async def detect_surfaceflinger_displays(serial: Optional[str] = None) -> Dict[str, str]:
    ser = await get_active_adb_serial(serial)
    res_sf = await asyncio.to_thread(_exec_adb_sync, (["-s", ser] if ser else []) + ["shell", "dumpsys SurfaceFlinger --display-id"], 5.0)
    displays = {}
    if res_sf.returncode == 0 and res_sf.stdout:
        for line in res_sf.stdout.splitlines():
            m = re.search(r'Display\s+(\d+)', line)
            if m:
                did = m.group(1)
                if "port=0" in line:
                    displays["phone"] = did
                elif ("port=" in line and "port=0" not in line) or "MB16AMTR" in line or "display 256" in line:
                    displays["desktop"] = did
        all_ids = re.findall(r'Display\s+(\d+)', res_sf.stdout)
        if "phone" not in displays and len(all_ids) > 0:
            displays["phone"] = all_ids[0]
        if "desktop" not in displays and len(all_ids) > 1:
            displays["desktop"] = all_ids[1]
    return displays

async def detect_surfaceflinger_display_id(serial: Optional[str] = None) -> Optional[str]:
    disps = await detect_surfaceflinger_displays(serial)
    return disps.get("desktop")

async def capture_external_screenshot(serial: Optional[str] = None) -> Optional[bytes]:
    ser = await get_active_adb_serial(serial)
    sf_id = await detect_surfaceflinger_display_id(ser)
    cmd = (["-s", ser] if ser else []) + ["exec-out", "screencap"]
    if sf_id:
        cmd.extend(["-d", sf_id])
    cmd.append("-p")
    cap = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 8.0)
    if cap.returncode == 0 and cap.stdout:
        idx = cap.stdout.find(b"\x89PNG\r\n\x1a\n")
        if idx >= 0:
            return cap.stdout[idx:]

    dev_path = "/sdcard/mc_calib_temp.png"
    sc_cmd = f"screencap {'-d ' + sf_id if sf_id else ''} -p {dev_path}"
    await asyncio.to_thread(_exec_adb_sync, (["-s", ser] if ser else []) + ["shell", sc_cmd], 6.0)
    pull_res = await asyncio.to_thread(_exec_adb_sync_bin, (["-s", ser] if ser else []) + ["exec-out", f"cat {dev_path} && rm -f {dev_path}"], 6.0)
    if pull_res.returncode == 0 and pull_res.stdout:
        idx = pull_res.stdout.find(b"\x89PNG\r\n\x1a\n")
        if idx >= 0:
            return pull_res.stdout[idx:]
    return None

async def capture_screen(mode: str = "desktop", serial: Optional[str] = None, quality: int = 80, max_dim: int = 1280) -> Optional[bytes]:
    ser = await get_active_adb_serial(serial)
    if not ser: return None
    
    disp_map = await detect_surfaceflinger_displays(ser)
    sf_id = disp_map.get(mode) or (disp_map.get("desktop") if mode == "desktop" else disp_map.get("phone"))

    cmd = ["-s", ser, "exec-out", "screencap"]
    if sf_id:
        cmd.extend(["-d", sf_id])
    cmd.append("-p")

    res = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 6.0)
    if res.returncode == 0 and res.stdout:
        png_idx = res.stdout.find(b"\x89PNG\r\n\x1a\n")
        if png_idx >= 0:
            png_data = res.stdout[png_idx:]
            img = cv2.imdecode(np.frombuffer(png_data, np.uint8), cv2.IMREAD_COLOR)
            if img is not None and img.size > 0:
                h, w = img.shape[:2]
                if max(h, w) > max_dim:
                    scale = max_dim / float(max(h, w))
                    nw, nh = int(w * scale), int(h * scale)
                    img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
                _, jpg_data = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
                return jpg_data.tobytes()

    if mode == "desktop":
        raw_png = await capture_external_screenshot(ser)
        if raw_png:
            img = cv2.imdecode(np.frombuffer(raw_png, np.uint8), cv2.IMREAD_COLOR)
            if img is not None and img.size > 0:
                h, w = img.shape[:2]
                if max(h, w) > max_dim:
                    scale = max_dim / float(max(h, w))
                    nw, nh = int(w * scale), int(h * scale)
                    img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
                _, jpg_data = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
                return jpg_data.tobytes()
    return None

async def mjpeg_stream_generator(mode: str = "desktop", serial: Optional[str] = None, fps: float = 2.0, quality: int = 75, max_dim: int = 960):
    interval = 1.0 / max(0.5, min(fps, 4.0))
    while True:
        jpg = await capture_screen(mode=mode, serial=serial, quality=quality, max_dim=max_dim)
        if jpg:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(jpg)).encode() + b"\r\n\r\n" +
                jpg + b"\r\n"
            )
        await asyncio.sleep(interval)

async def is_ime_visible(serial: Optional[str] = None) -> bool:
    try:
        ser = await get_active_adb_serial(serial)
        if not ser: return False

        chk = await run_adb_shell("dumpsys input_method | grep -E 'mInputShown=true|mImeWindowVis=[123]'", ser)
        out = chk.get("stdout", "")
        if "mInputShown=true" in out or any(f"mImeWindowVis={v}" in out for v in [1, 2, 3]):
            return True
        return False
    except Exception:
        return False

async def ensure_adb_keyboard_closed(serial: Optional[str] = None) -> bool:
    try:
        ser = await get_active_adb_serial(serial)
        if not ser:
            return False

        await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0", ser)

        chk_acc = await run_adb_shell("settings get secure enabled_accessibility_services", ser)
        acc_str = chk_acc.get("stdout", "")
        if "DesktopPaginationService" not in acc_str:
            svc_name = "com.matrixcapture.app/com.matrixcapture.app.service.DesktopPaginationService"
            new_acc = f"{acc_str.strip()}:{svc_name}" if acc_str.strip() and acc_str.strip() != "null" else svc_name
            await run_adb_shell(f"settings put secure enabled_accessibility_services {new_acc}", ser)
            await run_adb_shell("settings put secure accessibility_enabled 1", ser)

        if await is_ime_visible(ser):
            # 1. Broadcast to MatrixCapture Accessibility Service to suppress IME
            await run_adb_shell("am broadcast -a com.matrixcapture.app.ACTION_CLOSE_KEYBOARD", ser)
            # 2. Dismiss IME on display 0 (phone screen only, never external display)
            await run_adb_shell("input -d 0 keyevent 111", ser)
            await asyncio.sleep(0.1)
            if await is_ime_visible(ser):
                await run_adb_shell("input -d 0 keyevent 4", ser)
            return True
        return False
    except Exception:
        return False
    except Exception:
        return False

async def get_device_info() -> Dict[str, Any]:
    global current_device_model
    ser = await get_active_adb_serial()
    devs_res = await list_adb_devices()
    devs = devs_res.get("devices", [])
    matched = next((d for d in devs if d["serial"] == ser), None)
    active_model_name = matched.get("model", current_device_model) if matched else current_device_model
    
    if matched and target_adb_serial is None:
        m = active_model_name.lower()
        if any(k in m for k in ["pixel_8", "husky", "shiba", "8"]):
            current_device_model = "pixel_8"
        elif any(k in m for k in ["pixel_10", "mustang", "frankel", "10"]):
            current_device_model = "pixel_10"
            
    disp_map = await detect_surfaceflinger_displays(ser) if ser else {}
    profile = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
    return {
        "status": "success",
        "connected": bool(ser),
        "active_serial": ser,
        "active_model": active_model_name.replace("_", " "),
        "device_model": current_device_model,
        "profile": profile,
        "available_profiles": list(DEVICE_PROFILES.values()),
        "target_serial": target_adb_serial,
        "devices": devs,
        "displays": {
            "desktop": bool(disp_map.get("desktop")),
            "phone": bool(disp_map.get("phone"))
        }
    }

async def send_hid_keycombination(key1: int, key2: int, serial: Optional[str] = None):
    await ensure_adb_keyboard_closed(serial)
    disp_id = await detect_external_display_id(serial)
    if disp_id > 0:
        await run_adb_shell(f"input -d {disp_id} keycombination {key1} {key2}", serial)
    else:
        await run_adb_shell(f"input keycombination {key1} {key2}", serial)

async def check_and_update_alignment(serial: Optional[str] = None) -> Dict[str, Any]:
    from services import state
    active_serial = await get_active_adb_serial(serial)
    if not active_serial:
        return state.latest_alignment_status
    try:
        snap_bytes = await capture_external_screenshot(active_serial)
        if snap_bytes:
            res = await asyncio.to_thread(detect_teams_markdown_alignment, snap_bytes)
            res["timestamp"] = datetime.now().isoformat()

            # Evaluate general-purpose classifiers
            try:
                from classifiers.registry import classifier_registry
                from classifiers.base import ClassifierContext
                disp_id = await detect_external_display_id(active_serial)
                c_ctx = ClassifierContext(serial=active_serial, display_id=disp_id, image_bytes=snap_bytes, alignment_data=res)
                await classifier_registry.evaluate_all(c_ctx)
                c_report = classifier_registry.get_status_report()
                res["classifiers"] = c_report
                res["classifier_issues"] = c_report.get("issues", [])
                if c_report.get("has_issues"):
                    state.latest_telemetry["classifier_issues"] = c_report.get("issues", [])
            except Exception as ce:
                print(f"[check_and_update_alignment] Classifier error: {ce}")

            state.latest_alignment_status.clear()
            state.latest_alignment_status.update(res)
            if not res.get("is_aligned", False):
                if state.orchestration_state.get("status") == "RUNNING":
                    state.orchestration_state["status"] = "PAUSED"
                    state.orchestration_state["step_label"] = "PAUSED: teams markdown not aligned"
                    state.latest_telemetry["status_message"] = f"⚠️ teams markdown not aligned ({res.get('reason')})"
            await state.ws_manager.broadcast({
                "type": "alignment_status",
                "alignment": state.latest_alignment_status,
                "data": state.latest_alignment_status,
                "classifiers": res.get("classifiers", {}),
                "orchestration": state.orchestration_state,
                "telemetry": state.latest_telemetry
            })
    except Exception as e:
        print(f"[check_and_update_alignment] Error: {e}")
    return state.latest_alignment_status

async def alignment_monitor_loop():
    while True:
        try:
            await asyncio.sleep(2.5)
            serial = await get_active_adb_serial()
            if serial:
                await check_and_update_alignment(serial)
        except Exception:
            await asyncio.sleep(4.0)
