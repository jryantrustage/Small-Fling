import asyncio, json, os, re, subprocess, time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import cv2
import numpy as np

from alignment_engine import detect_teams_markdown_alignment
import config

DEVICE_PROFILES = {
    "pixel_10": {"id": "pixel_10", "displayName": "Pixel 10", "lines_per_page": 49, "arrow_count_init": 99, "arrow_count_step": 48, "step_size": 48},
    "pixel_8": {"id": "pixel_8", "displayName": "Pixel 8", "lines_per_page": 49, "arrow_count_init": 99, "arrow_count_step": 48, "step_size": 48}
}

def init_device_model_from_cache() -> str:
    try:
        cf = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
        if cf.exists():
            c = json.loads(cf.read_text())
            last, p10, p8 = c.get("last_address", ""), c.get("pixel_10_address", ""), c.get("pixel_8_address", "")
            if last and last == p8: return "pixel_8"
            if last and last == p10: return "pixel_10"
    except Exception: pass
    return "pixel_8"

current_device_model = init_device_model_from_cache()
target_adb_serial: Optional[str] = None

def _exec_adb_sync(args: List[str], timeout: float = 4.0, text: bool = True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            [(getattr(config, "ADB_PATH", None) or "adb")] + args,
            capture_output=True,
            text=text,
            encoding="utf-8" if text else None,
            errors="replace" if text else None,
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
    if ser and "mock" in str(ser).lower():
        return {"status": "ok", "stdout": "", "stderr": "", "code": 0}
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
        cf = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
        cdata = {}
        if cf.exists():
            try: cdata = json.loads(cf.read_text())
            except Exception: pass
        p8_addr = cdata.get("pixel_8_address", "")
        p10_addr = cdata.get("pixel_10_address", "")
        p8_ip = p8_addr.split(":")[0] if ":" in p8_addr else p8_addr
        p10_ip = p10_addr.split(":")[0] if ":" in p10_addr else p10_addr

        for line in res.stdout.splitlines()[1:]:
            line = line.strip()
            if not line or line.startswith("*"): continue
            parts = line.split()
            if len(parts) >= 2:
                model = "unknown"
                for p in parts[2:]:
                    if p.startswith("model:"): model = p.split(":", 1)[1]
                ser = parts[0]
                lower_line = line.lower()
                # Prioritize hardware product/model signatures over stale cache entries
                if any(k in lower_line for k in ["pixel_8", "husky", "shiba"]):
                    model = "Pixel_8"
                    display_name = "Pixel 8"
                elif any(k in lower_line for k in ["pixel_10", "mustang", "frankel"]):
                    model = "Pixel_10"
                    display_name = "Pixel 10"
                elif (p8_addr and ser == p8_addr) or (p8_ip and ser.startswith(p8_ip)):
                    model = "Pixel_8"
                    display_name = "Pixel 8"
                elif (p10_addr and ser == p10_addr) or (p10_ip and ser.startswith(p10_ip)):
                    model = "Pixel_10"
                    display_name = "Pixel 10"
                else:
                    display_name = model.replace("_", " ") if model != "unknown" else ser

                devs.append({"serial": ser, "status": parts[1], "model": model, "displayName": display_name, "raw": line})
        return {"status": "ok", "devices": devs}
    except Exception as e:
        return {"status": "error", "error": str(e), "devices": []}

# Concurrency lock to serialize screencap execution over ADB
_screencap_lock = asyncio.Lock()

# Per-(serial, mode) short-TTL in-memory frame cache to prevent cross-device contamination
_frame_cache: Dict[Tuple[str, str], Dict[str, Any]] = {}

# Per-serial display mapping cache
_display_map_cache: Dict[str, Dict[str, str]] = {}
_display_map_cache_ts: Dict[str, float] = {}
_cached_external_display_id: Dict[str, Tuple[int, float]] = {}

# Active serial cache & reconnect debounce
_active_serial_cache: Optional[str] = None
_active_serial_cache_ts: float = 0.0
_last_reconnect_ts: float = 0.0

# Cached standby frame
_standby_frame_cache: Dict[str, bytes] = {}

def _get_or_create_standby_frame(mode: str = "desktop") -> bytes:
    if mode in _standby_frame_cache:
        return _standby_frame_cache[mode]
    img = np.zeros((540, 960, 3), dtype=np.uint8)
    img[:] = (23, 17, 13) # #0d1117 in BGR
    title = f"MATRIX CAPTURE STUDIO  |  {mode.upper()} VIEW"
    sub = "Awaiting live display stream from Android device..."
    cv2.putText(img, title, (60, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (157, 255, 0), 2, cv2.LINE_AA)
    cv2.putText(img, sub, (60, 290), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (158, 148, 139), 1, cv2.LINE_AA)
    _, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])
    frame_bytes = jpg.tobytes()
    _standby_frame_cache[mode] = frame_bytes
    return frame_bytes

async def get_active_adb_serial(requested_serial: Optional[str] = None, force_refresh: bool = False) -> Optional[str]:
    if requested_serial and "mock" in str(requested_serial).lower():
        return requested_serial
    global current_device_model, target_adb_serial, _active_serial_cache, _active_serial_cache_ts, _last_reconnect_ts
    now = time.time()
    if not force_refresh and not requested_serial and _active_serial_cache and (now - _active_serial_cache_ts < 3.5):
        return _active_serial_cache

    try:
        res = await asyncio.to_thread(_exec_adb_sync, ["devices", "-l"], 2.0)
        active = []
        for line in res.stdout.splitlines()[1:]:
            parts = line.strip().split()
            if len(parts) >= 2 and parts[1] == "device":
                model = next((p.split(":", 1)[1] for p in parts[2:] if p.startswith("model:")), "unknown")
                active.append({"serial": parts[0], "model": model, "raw": line.strip()})
        if not active:
            _active_serial_cache = None
            _active_serial_cache_ts = now
            # Debounced auto-reconnect to cached wireless address (at most once every 12s)
            if now - _last_reconnect_ts > 12.0:
                _last_reconnect_ts = now
                cf = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
                if cf.exists():
                    try:
                        cdata = json.loads(cf.read_text())
                        pref = cdata.get("last_address") or (cdata.get("pixel_10_address") if "10" in current_device_model.lower() else cdata.get("pixel_8_address"))
                        if pref:
                            cres = await asyncio.to_thread(_exec_adb_sync, ["connect", pref], 2.0)
                            if "connected" in cres.stdout.lower() or "already" in cres.stdout.lower():
                                _active_serial_cache = pref
                                _active_serial_cache_ts = time.time()
                                return pref
                    except Exception:
                        pass
            return None

        found_serial = None
        if requested_serial:
            for dev in active:
                if dev["serial"] == requested_serial or requested_serial in dev["serial"]:
                    return dev["serial"]
            if ":" in requested_serial:
                ip_pfx = requested_serial.split(":")[0]
                for dev in active:
                    if dev["serial"].startswith(ip_pfx):
                        return dev["serial"]
            return None

        # Prioritize explicit target serial set by user in UI
        if target_adb_serial:
            for dev in active:
                if dev["serial"] == target_adb_serial or target_adb_serial in dev["serial"]:
                    found_serial = dev["serial"]
                    break
            if not found_serial and ":" in target_adb_serial:
                ip_pfx = target_adb_serial.split(":")[0]
                for dev in active:
                    if dev["serial"].startswith(ip_pfx):
                        found_serial = dev["serial"]
                        break

        if not found_serial and len(active) > 1:
            for dev in active:
                s = dev["serial"]
                if _display_map_cache.get(s, {}).get("desktop"):
                    found_serial = s
                    break

        if not found_serial:
            pref = "pixel_8" if "8" in current_device_model.lower() else "pixel_10"
            p8_keys, p10_keys = ["pixel_8", "husky", "shiba"], ["pixel_10", "mustang", "frankel"]
            keys = p8_keys if pref == "pixel_8" else p10_keys

            for dev in active:
                m = (dev["model"] + " " + dev["raw"]).lower()
                if any(k in m for k in keys):
                    found_serial = dev["serial"]
                    break

        if not found_serial:
            found_serial = active[0]["serial"]

        if found_serial:
            m = ""
            for dev in active:
                if dev["serial"] == found_serial:
                    m = (dev.get("model", "") + " " + dev.get("raw", "")).lower()
                    break
            if any(k in m for k in ["pixel_8", "husky", "shiba"]):
                current_device_model = "pixel_8"
            elif any(k in m for k in ["pixel_10", "mustang", "frankel"]):
                current_device_model = "pixel_10"

        _active_serial_cache = found_serial
        _active_serial_cache_ts = now
        return found_serial
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

def sanitize_input_display_id(display_id: Any) -> Optional[int]:
    """
    Validates and sanitizes display ID for Android /system/bin/input command.
    Android input command only supports 32-bit signed integers and specifically
    logical display IDs (typically 0-255). 64-bit SurfaceFlinger physical IDs
    (e.g., 4613572713243172731) cause NumberFormatException or IllegalArgumentException.
    Returns:
        int if 0 < display_id <= 255, else None
    """
    try:
        if display_id is None:
            return None
        did = int(display_id)
        if 0 < did <= 255:
            return did
        return None
    except (ValueError, TypeError):
        return None

async def detect_external_display_id(serial: Optional[str] = None, force_refresh: bool = False) -> int:
    global current_device_model, _cached_external_display_id
    if serial and "mock" in str(serial).lower():
        return 14
    ser = await get_active_adb_serial(serial)
    if not ser:
        return 8 if ("10" in current_device_model.lower() or "mustang" in current_device_model.lower()) else 4

    now = time.time()
    if not force_refresh and ser in _cached_external_display_id:
        cached_id, ts = _cached_external_display_id[ser]
        if (now - ts) < 30.0:
            return cached_id

    detected_id = None
    res = await run_adb_shell("dumpsys display", ser, timeout=2.5)
    if res.get("status") == "ok" and res.get("stdout"):
        out = res["stdout"]
        # 1. First priority: look for DisplayViewport with type=EXTERNAL
        m = re.search(r'DisplayViewport\{type=EXTERNAL.*?displayId=(\d+)', out)
        if m and 0 < int(m.group(1)) <= 255:
            detected_id = int(m.group(1))
        # 2. Look for DisplayInfo with displayId X ... type EXTERNAL
        if not detected_id:
            m = re.search(r'displayId\s+(\d+).*?type\s+EXTERNAL', out, re.DOTALL)
            if m and 0 < int(m.group(1)) <= 255:
                detected_id = int(m.group(1))
        # 3. Check for any non-zero displayId associated with EXTERNAL
        if not detected_id:
            for line in out.splitlines():
                if "EXTERNAL" in line:
                    m = re.search(r'(?:mDisplayId|displayId)[= ]+(\d+)', line)
                    if m and 0 < int(m.group(1)) <= 255:
                        detected_id = int(m.group(1))
                        break
        # 4. Check which display is actively hosting Teams
        if not detected_id:
            try:
                res_win = await run_adb_shell("dumpsys window windows | grep -E 'Display #[0-9]+|com.microsoft.teams'", ser, timeout=2.0)
                if res_win.get("status") == "ok" and res_win.get("stdout"):
                    cur_disp = None
                    for line in res_win["stdout"].splitlines():
                        m_d = re.search(r'Display #(\d+)', line)
                        if m_d:
                            cur_disp = int(m_d.group(1))
                        if cur_disp and 0 < cur_disp <= 255 and "com.microsoft.teams" in line:
                            detected_id = cur_disp
                            break
            except Exception:
                pass
        # 5. Fallback search for any non-zero display id in dumpsys
        if not detected_id:
            for line in out.splitlines():
                m = re.search(r'(?:mDisplayId|displayId)=(\d+)', line)
                if m and 0 < int(m.group(1)) <= 255:
                    detected_id = int(m.group(1))
                    break

    if detected_id is None:
        detected_id = 8 if ("10" in current_device_model.lower() or "mustang" in current_device_model.lower()) else 4

    _cached_external_display_id[ser] = (detected_id, now)
    return detected_id

async def fetch_current_display_dpi_factor(serial: Optional[str] = None, display_id: Optional[int] = None) -> Tuple[float, int]:
    """
    Fetches the active density/DPI of the external display directly from the phone via ADB right before OCR.
    Parses 'wm density -d <displayId>' output:
      Physical density: 193
      Override density: 120
    Returns:
        (dpi_factor, active_dpi)
    Where:
        dpi_factor = active_dpi / 160.0 (normalized against baseline Android MDPI 160 DPI)
    Example:
        At 120 DPI -> dpi_factor is 0.75
        At 160 DPI -> dpi_factor is 1.0
        At 240 DPI -> dpi_factor is 1.5
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return 1.0, 160

    did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
    res = await run_adb_shell(f"wm density -d {did}", ser, timeout=1.8)
    out = res.get("stdout", "") if res.get("status") == "ok" else ""

    active_dpi = 160
    if out:
        if m_ovr := re.search(r'Override density:\s*(\d+)', out):
            active_dpi = int(m_ovr.group(1))
        elif m_phys := re.search(r'Physical density:\s*(\d+)', out):
            val = int(m_phys.group(1))
            if val > 0:
                active_dpi = val

    factor = max(0.4, min(3.0, round(active_dpi / 160.0, 3)))
    return factor, active_dpi


async def detect_surfaceflinger_displays(serial: Optional[str] = None, force_refresh: bool = False) -> Dict[str, str]:
    global _display_map_cache, _display_map_cache_ts
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {}

    now = time.time()
    cached = _display_map_cache.get(ser)
    cached_ts = _display_map_cache_ts.get(ser, 0.0)
    if not force_refresh and cached and (now - cached_ts < 300.0):
        return cached

    displays = {}
    # 1. SurfaceFlinger display id enumeration
    res = await asyncio.to_thread(_exec_adb_sync, ["-s", ser, "shell", "dumpsys SurfaceFlinger --display-id"], 3.0)
    if res.returncode == 0 and res.stdout:
        for line in res.stdout.splitlines():
            m = re.search(r'Display\s+(\d+)', line)
            if m:
                did = m.group(1)
                if "port=0" in line:
                    displays["phone"] = did
                elif ("port=" in line and "port=0" not in line) or any(k in line.lower() for k in ["hdmi", "usb", "mb16amtr", "external", "display 256"]):
                    displays["desktop"] = did
        all_ids = re.findall(r'Display\s+(\d+)', res.stdout)
        if "phone" not in displays and len(all_ids) > 0:
            displays["phone"] = all_ids[0]
        if "desktop" not in displays and len(all_ids) > 1:
            for d in all_ids:
                if d != displays.get("phone"):
                    displays["desktop"] = d
                    break

    # 2. Check dumpsys display for external DisplayViewport uniqueId (64-bit SurfaceFlinger id)
    if "desktop" not in displays:
        res_disp = await run_adb_shell("dumpsys display", ser, timeout=2.5)
        if res_disp.get("status") == "ok" and res_disp.get("stdout"):
            out = res_disp["stdout"]
            m_vp = re.search(r'DisplayViewport\{type=EXTERNAL.*?uniqueId=\'local:(\d+)\'', out)
            if m_vp:
                displays["desktop"] = m_vp.group(1)
            else:
                m_sp = re.search(r'StablePhysical\{id=(\d+),\s*port=([1-9]\d*)\}', out)
                if m_sp:
                    displays["desktop"] = m_sp.group(1)

    if "phone" not in displays:
        displays["phone"] = "0"

    _display_map_cache[ser] = displays
    _display_map_cache_ts[ser] = now
    return displays

async def detect_surfaceflinger_display_id(serial: Optional[str] = None) -> Optional[str]:
    return (await detect_surfaceflinger_displays(serial)).get("desktop")

def _update_frame_cache(serial: str, mode: str, png_bytes: bytes):
    _frame_cache[(serial, mode)] = {"bytes": None, "raw_png": png_bytes, "ts": time.time()}

def _get_cached_jpeg(cached: Optional[Dict[str, Any]], quality: int = 75, max_dim: int = 1280) -> Optional[bytes]:
    if not cached:
        return None
    if cached.get("bytes"):
        return cached["bytes"]
    raw = cached.get("raw_png")
    if raw:
        jpg = _png_to_jpeg(raw, quality=quality, max_dim=max_dim)
        if jpg:
            cached["bytes"] = jpg
            return jpg
    return None

async def capture_external_screenshot(serial: Optional[str] = None, max_cache_age_s: float = 0.35, bypass_lock: bool = True) -> Optional[bytes]:
    ser = await get_active_adb_serial(serial)
    if not ser:
        return None
    if ser and "mock" in str(ser).lower():
        return _get_or_create_standby_frame("desktop")

    cache_key = (ser, "desktop")
    now = time.time()
    cached = _frame_cache.get(cache_key)
    if cached and cached.get("raw_png") and (now - cached.get("ts", 0.0) < max_cache_age_s):
        return cached["raw_png"]

    acquired_lock = False
    if not bypass_lock:
        try:
            await asyncio.wait_for(_screencap_lock.acquire(), timeout=0.08)
            acquired_lock = True
            cached = _frame_cache.get(cache_key)
            if cached and cached.get("raw_png") and (time.time() - cached.get("ts", 0.0) < max_cache_age_s):
                return cached["raw_png"]
        except asyncio.TimeoutError:
            if cached and cached.get("raw_png"):
                return cached["raw_png"]

    try:
        # Fast-path: use in-memory known desktop display ID without calling dumpsys
        known_id = _display_map_cache.get(ser, {}).get("desktop")
        if not known_id:
            from services import state as app_state
            known_id = app_state.latest_telemetry.get("capture_telemetry", {}).get("display_id")

        if not known_id or str(known_id) in ("0", "phone"):
            disp_map = await detect_surfaceflinger_displays(ser)
            known_id = disp_map.get("desktop")

        # 1. Try detected external display via known SurfaceFlinger or display ID
        if known_id and str(known_id) not in ("0", "phone"):
            cmd = ["-s", ser, "exec-out", "screencap", "-d", str(known_id), "-p"]
            cap = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 3.0)
            if cap.returncode == 0 and (png_bytes := _extract_png_bytes(cap.stdout)):
                from services import state as app_state
                app_state.latest_telemetry.setdefault("capture_telemetry", {})["display_id"] = str(known_id)
                _update_frame_cache(ser, "desktop", png_bytes)
                return png_bytes
            else:
                # If cached ID failed, refresh display mapping once
                disp_map = await detect_surfaceflinger_displays(ser, force_refresh=True)
                known_id = disp_map.get("desktop")
                if known_id and str(known_id) not in ("0", "phone"):
                    cmd = ["-s", ser, "exec-out", "screencap", "-d", str(known_id), "-p"]
                    cap = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 3.0)
                    if cap.returncode == 0 and (png_bytes := _extract_png_bytes(cap.stdout)):
                        from services import state as app_state
                        app_state.latest_telemetry.setdefault("capture_telemetry", {})["display_id"] = str(known_id)
                        _update_frame_cache(ser, "desktop", png_bytes)
                        return png_bytes

        # 2. Check other active SurfaceFlinger displays if any (excluding phone display)
        res = await asyncio.to_thread(_exec_adb_sync, ["-s", ser, "shell", "dumpsys SurfaceFlinger --display-id"], 2.0)
        if res.returncode == 0 and res.stdout:
            all_ids = re.findall(r'Display\s+(\d+)', res.stdout)
            phone_id = _display_map_cache.get(ser, {}).get("phone", "0")
            for did in all_ids:
                if did != phone_id and did != known_id:
                    cmd = ["-s", ser, "exec-out", "screencap", "-d", str(did), "-p"]
                    cap = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 2.0)
                    if cap.returncode == 0 and (png_bytes := _extract_png_bytes(cap.stdout)):
                        if ser not in _display_map_cache:
                            _display_map_cache[ser] = {}
                        _display_map_cache[ser]["desktop"] = str(did)
                        _update_frame_cache(ser, "desktop", png_bytes)
                        return png_bytes

        # Never fall back to internal phone screen (display 0) for desktop mode!
        if cached and cached.get("raw_png") and (time.time() - cached.get("ts", 0.0) < 5.0):
            return cached["raw_png"]
        return None
    finally:
        if acquired_lock:
            _screencap_lock.release()

async def capture_screen(mode: str = "desktop", serial: Optional[str] = None, quality: int = 80, max_dim: int = 1280) -> Optional[bytes]:
    ser = await get_active_adb_serial(serial)
    if not ser:
        return _get_or_create_standby_frame(mode)

    cache_key = (ser, mode)
    now = time.time()
    # Fast-path cache check: return fresh frame if captured within last 600ms
    cached = _frame_cache.get(cache_key)
    if cached and (now - cached.get("ts", 0.0) < 0.6):
        jpg = _get_cached_jpeg(cached, quality=quality, max_dim=max_dim)
        if jpg:
            return jpg

    acquired = False
    try:
        # Non-blocking lock acquisition with 80ms timeout
        await asyncio.wait_for(_screencap_lock.acquire(), timeout=0.08)
        acquired = True
    except asyncio.TimeoutError:
        # If lock is held, return cached frame immediately
        if cached:
            jpg = _get_cached_jpeg(cached, quality=quality, max_dim=max_dim)
            if jpg:
                return jpg
        return _get_or_create_standby_frame(mode)

    try:
        # Re-check cache inside lock
        cached = _frame_cache.get(cache_key)
        if cached and (time.time() - cached.get("ts", 0.0) < 0.6):
            jpg = _get_cached_jpeg(cached, quality=quality, max_dim=max_dim)
            if jpg:
                return jpg

        if mode == "desktop":
            raw_bytes = await capture_external_screenshot(ser, bypass_lock=True)
            if raw_bytes:
                cached = _frame_cache.get(cache_key)
                if cached:
                    jpg = _get_cached_jpeg(cached, quality=quality, max_dim=max_dim)
                    if jpg:
                        return jpg
                jpg = _png_to_jpeg(raw_bytes, quality, max_dim)
                if jpg:
                    _frame_cache[cache_key] = {"bytes": jpg, "raw_png": raw_bytes, "ts": time.time()}
                    return jpg
        else: # mode == "phone"
            disp_map = await detect_surfaceflinger_displays(ser)
            phone_id = disp_map.get("phone", "0")
            cmd = ["-s", ser, "exec-out", "screencap", "-d", str(phone_id), "-p"] if (phone_id and len(str(phone_id)) > 4) else ["-s", ser, "exec-out", "screencap", "-p"]
            res = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 3.0)
            if res.returncode != 0 or not res.stdout:
                res = await asyncio.to_thread(_exec_adb_sync_bin, ["-s", ser, "exec-out", "screencap", "-p"], 3.0)
            if res.returncode == 0 and (png_bytes := _extract_png_bytes(res.stdout)):
                _frame_cache[cache_key] = {"bytes": None, "raw_png": png_bytes, "ts": time.time()}
                jpg = _png_to_jpeg(png_bytes, quality, max_dim)
                if jpg:
                    _frame_cache[cache_key]["bytes"] = jpg
                    return jpg
    finally:
        if acquired:
            _screencap_lock.release()

    # If capture failed on this frame, return previous cached frame or standby frame
    if cached:
        jpg = _get_cached_jpeg(cached, quality=quality, max_dim=max_dim)
        if jpg:
            return jpg
    return _get_or_create_standby_frame(mode)

async def configure_display_awake_policies(serial: Optional[str] = None):
    ser = await get_active_adb_serial(serial)
    if not ser: return
    try:
        await run_adb_shell("settings put global stay_on_while_plugged_in 7", ser)
        await run_adb_shell("settings put system screen_off_timeout 2147483647", ser)
        await run_adb_shell("settings put global sleep_timeout -1", ser)
        await run_adb_shell("svc power stayon true", ser)
        await run_adb_shell("settings put secure doze_enabled 0", ser)
    except Exception:
        pass

async def pulse_display_awake_heartbeat(serial: Optional[str] = None):
    ser = await get_active_adb_serial(serial)
    if not ser: return
    try:
        await run_adb_shell("input keyevent 224", ser)
        ext_id = await detect_external_display_id(ser)
        if ext_id and ext_id > 0:
            await run_adb_shell(f"input -d {ext_id} keyevent 224", ser)
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
    try:
        while True:
            jpg = await capture_screen(mode=mode, serial=serial, quality=quality, max_dim=max_dim)
            if jpg:
                yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpg)).encode() + b"\r\n\r\n" + jpg + b"\r\n"
            await asyncio.sleep(interval)
    except (asyncio.CancelledError, GeneratorExit):
        pass

_ime_visible_cache: Dict[str, Any] = {"val": False, "ts": 0.0}

async def is_ime_visible(serial: Optional[str] = None, force_check: bool = False) -> bool:
    global _ime_visible_cache
    now = time.time()
    if not force_check and (now - _ime_visible_cache["ts"] < 2.0):
        return _ime_visible_cache["val"]
    try:
        ser = await get_active_adb_serial(serial)
        if not ser: return False
        chk = await run_adb_shell("dumpsys input_method", ser, timeout=2.0)
        out = chk.get("stdout", "")
        has_visible_window = False
        for line in out.splitlines():
            line_str = line.strip()
            if "mImeWindowVis=" in line_str:
                val_part = line_str.split("mImeWindowVis=")[1].split()[0]
                if any(v in val_part for v in ["2", "3", "0x2", "0x3"]):
                    has_visible_window = True
                    break
            if "minputshown=true" in line_str.lower():
                has_visible_window = True
                break

        _ime_visible_cache = {"val": has_visible_window, "ts": now}
        return has_visible_window
    except Exception:
        return False

async def dismiss_keyboard(serial: Optional[str] = None, display_id: Optional[int] = None) -> bool:
    """Closes soft keyboard on Android device if open without disturbing editor content."""
    ser = await get_active_adb_serial(serial)
    if not ser: return True
    try:
        did = display_id or await detect_external_display_id(ser)
        is_open = await is_ime_visible(ser, force_check=True)
        if is_open:
            cmd = f"settings put secure show_ime_with_hard_keyboard 0; input -d {did} keyevent 111 >/dev/null 2>&1; input -d 0 keyevent 111 >/dev/null 2>&1"
            await run_adb_shell(cmd, ser, timeout=2.0)
            await asyncio.sleep(0.08)
            is_open = await is_ime_visible(ser, force_check=True)
        return not is_open
    except Exception:
        return True

async def get_display_dimensions(serial: Optional[str] = None, display_id: Optional[int] = None) -> Tuple[int, int]:
    """Retrieves physical or override width and height for the given display ID."""
    ser = await get_active_adb_serial(serial)
    if not ser:
        return 1920, 1080
    did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
    try:
        out = await run_adb_shell("dumpsys display", ser, timeout=3.0)
        stdout = out.get("stdout", "")
        pattern = rf'displayId\s+{did}.*?real\s+(\d+)\s+x\s+(\d+)'
        m = re.search(pattern, stdout, re.DOTALL)
        if m:
            return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    return 1920, 1080

async def is_editor_full_screen(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    image_bytes: Optional[bytes] = None
) -> Dict[str, Any]:
    """
    Detects whether the Teams Markdown editor window (FilePreviewActivity) on the target
    desktop display is in full-screen mode vs freeform / windowed / floating mode.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {
            "is_fullscreen": False,
            "mode": "unknown",
            "bounds": [0, 0, 0, 0],
            "task_id": None,
            "display_id": 0,
            "display_dimensions": [1920, 1080],
            "reason": "No active device connected via ADB"
        }

    did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
    disp_w, disp_h = await get_display_dimensions(ser, did)

    out = await run_adb_shell("dumpsys activity activities", ser, timeout=4.0)
    stdout = out.get("stdout", "")

    # Restrict search to target display if present
    d_match = re.search(rf'Display #{did}\b.*?(?=Display #|\Z)', stdout, re.DOTALL)
    search_block = d_match.group(0) if d_match else stdout

    # Match Task for FilePreviewActivity:
    task_pattern = re.compile(
        r'\*\s+Task\{[0-9a-fA-F]+\s+#(?P<tid>\d+)[^}]*?mode=(?P<mode>\w+)[^}]*?\}.*?'
        r'(?:bounds=\[(?P<bl>\d+),(?P<bt>\d+)\]\[(?P<br>\d+),(?P<bb>\d+)\]|mBounds=Rect\((?P<rl>\d+),\s*(?P<rt>\d+)\s*-\s*(?P<rr>\d+),\s*(?P<rb>\d+)\)).*?'
        r'FilePreviewActivity',
        re.DOTALL
    )
    m = task_pattern.search(search_block)
    if not m:
        m = task_pattern.search(stdout)

    tid: Optional[int] = None
    mode = "unknown"
    bounds = [0, 0, disp_w, disp_h]

    if m:
        tid = int(m.group("tid"))
        mode = m.group("mode").lower()
        l = int(m.group("bl") or m.group("rl") or 0)
        t = int(m.group("bt") or m.group("rt") or 0)
        r = int(m.group("br") or m.group("rr") or disp_w)
        b = int(m.group("bb") or m.group("rb") or disp_h)
        bounds = [l, t, r, b]

        w_span = r - l
        h_span = b - t

        # In Android Desktop Mode, all maximized windows have mode='freeform' spanning display bounds.
        # Only treat as not fullscreen if bounds are significantly smaller than the display.
        if w_span < (disp_w - 80) or h_span < (disp_h - 160) or l > 60 or t > 100:
            return {
                "is_fullscreen": False,
                "mode": mode,
                "bounds": bounds,
                "task_id": tid,
                "display_id": did,
                "display_dimensions": [disp_w, disp_h],
                "reason": f"Activity task #{tid} is running in {mode} window mode (bounds {bounds} are smaller than display viewport {disp_w}x{disp_h})"
            }

    # Computer Vision fallback / sanity check if image_bytes provided
    if image_bytes and len(image_bytes) > 2000:
        try:
            cv_img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
            if cv_img is not None and cv_img.shape[1] >= 600:
                h_img, w_img = cv_img.shape[:2]
                left_strip = cv_img[int(h_img * 0.2):int(h_img * 0.8), :35]
                right_strip = cv_img[int(h_img * 0.2):int(h_img * 0.8), w_img - 35:]
                center_strip = cv_img[int(h_img * 0.3):int(h_img * 0.7), int(w_img * 0.25):int(w_img * 0.75)]

                lum_left = float(np.mean(left_strip)) if left_strip.size > 0 else 0.0
                lum_right = float(np.mean(right_strip)) if right_strip.size > 0 else 0.0
                lum_center = float(np.mean(center_strip)) if center_strip.size > 0 else 0.0

                if (lum_left < 10.0 or lum_right < 10.0) and lum_center > 25.0:
                    return {
                        "is_fullscreen": False,
                        "mode": mode if mode != "unknown" else "windowed_margins",
                        "bounds": bounds,
                        "task_id": tid,
                        "display_id": did,
                        "display_dimensions": [disp_w, disp_h],
                        "reason": f"Display stream contains desktop margins (left lum={lum_left:.1f}, right lum={lum_right:.1f}, center lum={lum_center:.1f})"
                    }
        except Exception:
            pass

    return {
        "is_fullscreen": True,
        "mode": mode if mode != "unknown" else "fullscreen",
        "bounds": bounds,
        "task_id": tid,
        "display_id": did,
        "display_dimensions": [disp_w, disp_h],
        "reason": "Markdown editor occupies full screen display bounds"
    }

async def auto_fix_viewport(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    High-speed viewport auto-fix & keyboard dismiss for external desktop displays:
    1. Sends AUTO_REFRESH_DISPLAY broadcast to MatrixCapture Kiosk app.
    2. Brings the editor task to front, and ONLY resizes if not already fullscreen
       (resizing an already-maximized FilePreviewActivity resets Teams to light mode and split view!).
    3. Dismisses any visible IME / soft keyboard cleanly without sending Back key to editor.
    4. Enforces hardware keyboard IME suppression.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active device connected"}

    if display_id is None or display_id <= 0:
        disp_id = await detect_external_display_id(ser)
        display_id = disp_id if disp_id > 0 else (12 if ("10" in current_device_model.lower() or "mustang" in current_device_model.lower()) else 4)

    disp_w, disp_h = await get_display_dimensions(ser, display_id)

    # Dynamically calibrate DPI to optimal 24-35 lines viewport height (only modifies density if changed)
    calib = await calibrate_display_dpi(ser, display_id)
    act_dpi = calib.get("active_dpi", 220)

    # Check fullscreen status beforehand
    fs_status = await is_editor_full_screen(ser, display_id)
    is_fs = fs_status.get("is_fullscreen", False)

    # Only resize if the task is NOT already fullscreen.
    # Invoking task resize on an already maximized FilePreviewActivity reloads the document,
    # resetting user settings back to Light Mode and Split/Preview view!
    if not is_fs:
        resize_block = f"cmd activity task resize \"$top_tid\" 0 0 {disp_w} {disp_h} >/dev/null 2>&1; "
    else:
        resize_block = ""

    cmd = (
        f"am broadcast -a com.matrixcapture.app.action.AUTO_REFRESH_DISPLAY --ei display_id {display_id} >/dev/null 2>&1; "
        f"top_tid=$(dumpsys activity activities | grep -E 'FilePreviewActivity.*t[0-9]+' | head -n 1 | grep -oE 't[0-9]+' | tr -d 't'); "
        f"if [ -z \"$top_tid\" ]; then top_tid=$(dumpsys activity activities | grep -E 'topResumedActivity|mFocusedApp' | head -n 1 | grep -oE 't[0-9]+' | tr -d 't'); fi; "
        f"if [ -n \"$top_tid\" ]; then "
        f"  {resize_block}"
        f"  cmd activity task to-front \"$top_tid\" >/dev/null 2>&1; "
        f"fi; "
        f"settings put secure show_ime_with_hard_keyboard 0; "
        f"input -d {display_id} keyevent 111 >/dev/null 2>&1; "
        f"input -d 0 keyevent 111 >/dev/null 2>&1"
    )
    res = await run_adb_shell(cmd, ser, timeout=4.0)

    is_open = await is_ime_visible(ser, force_check=True)
    if is_open:
        # Dismiss on target external display as well as primary screen
        await run_adb_shell(f"input -d {display_id} keyevent 111 >/dev/null 2>&1; input -d 0 keyevent 111 >/dev/null 2>&1", ser, timeout=2.0)
        is_open = await is_ime_visible(ser, force_check=True)

    # Check fullscreen status post-fix
    fs_status = await is_editor_full_screen(ser, display_id)

    try:
        from services import state
        state.latest_telemetry["keyboard_visible"] = is_open
        state.latest_telemetry["editor_fullscreen"] = fs_status.get("is_fullscreen", True)
        await state.ws_manager.broadcast({
            "type": "viewport_refreshed",
            "display_id": display_id,
            "keyboard_closed": not is_open,
            "keyboard_visible": is_open,
            "is_fullscreen": fs_status.get("is_fullscreen", True),
            "fullscreen_status": fs_status
        })
    except Exception:
        pass

    return {
        "status": "ok",
        "display_id": display_id,
        "keyboard_closed": not is_open,
        "keyboard_visible": is_open,
        "is_fullscreen": fs_status.get("is_fullscreen", True),
        "fullscreen_status": fs_status,
        "output": res.get("stdout", "")
    }

async def ensure_adb_keyboard_closed(serial: Optional[str] = None) -> bool:
    """
    Suppresses the on-screen soft keyboard without resizing tasks or reflowing documents.
    """
    try:
        ser = await get_active_adb_serial(serial)
        if not ser: return False
        disp_id = await detect_external_display_id(ser)
        await run_adb_shell(
            f"settings put secure show_ime_with_hard_keyboard 0; "
            f"input -d {disp_id} keyevent 111 >/dev/null 2>&1; "
            f"input -d 0 keyevent 111 >/dev/null 2>&1",
            ser, timeout=2.0
        )
        is_open = await is_ime_visible(ser, force_check=True)
        return not is_open
    except Exception: return False

async def get_device_info() -> Dict[str, Any]:
    global current_device_model
    ser = await get_active_adb_serial()
    devs = (await list_adb_devices()).get("devices", [])
    matched = next((d for d in devs if d["serial"] == ser), None)
    if matched:
        m = (matched.get("model", "") + " " + matched.get("raw", "")).lower()
        if any(k in m for k in ["pixel_10", "mustang", "frankel"]): current_device_model = "pixel_10"
        elif any(k in m for k in ["pixel_8", "husky", "shiba"]): current_device_model = "pixel_8"
    active_model = matched.get("model", current_device_model) if matched else current_device_model
    try:
        from services import state
        state.active_device_serial = ser
        if ser:
            friendly_name = "Pixel 10 Pro XL" if current_device_model == "pixel_10" else "Pixel 8 Pro"
            state.latest_telemetry["active_serial"] = ser
            state.latest_telemetry["device_id"] = friendly_name
            state.latest_telemetry["device_model"] = current_device_model
    except Exception:
        pass
    disp_map = await detect_surfaceflinger_displays(ser) if ser else {}

    cf = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
    cdata = {}
    if cf.exists():
        try: cdata = json.loads(cf.read_text())
        except Exception: pass
    p8_addr = cdata.get("pixel_8_address", "")
    p10_addr = cdata.get("pixel_10_address", "")
    p8_available = any(d.get("status") == "device" and (d.get("displayName") == "Pixel 8" or "8" in d.get("model", "").lower() or (p8_addr and p8_addr in d.get("serial", ""))) for d in devs)
    p10_available = any(d.get("status") == "device" and (d.get("displayName") == "Pixel 10" or "10" in d.get("model", "").lower() or (p10_addr and p10_addr in d.get("serial", ""))) for d in devs)

    return {
        "status": "success", "connected": bool(ser), "active_serial": ser,
        "active_model": active_model.replace("_", " "), "device_model": current_device_model,
        "profile": DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"]),
        "available_profiles": list(DEVICE_PROFILES.values()), "target_serial": target_adb_serial,
        "devices": devs, "displays": {"desktop": bool(disp_map.get("desktop")), "phone": bool(disp_map.get("phone"))},
        "pixel_8_address": p8_addr,
        "pixel_10_address": p10_addr,
        "pixel_8_available": p8_available,
        "pixel_10_available": p10_available,
        "cached_addresses": cdata
    }

async def record_dispatched_key_event(
    key_name: str,
    keycodes: List[int],
    shell_command: str,
    display_id: Optional[int],
    duration_ms: float,
    serial: Optional[str] = None,
    caller_node: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    check_window_state: bool = True
) -> Dict[str, Any]:
    """
    Captures high-precision telemetry for key event dispatches, checking window states
    to diagnose whether any key event causes the Markdown Viewer (FilePreviewActivity) to navigate away.
    """
    from services import state
    pre_window = (details or {}).get("pre_activity") or ""
    post_window = (details or {}).get("post_activity") or ""
    navigated_away = (details or {}).get("navigated_away", False)

    if check_window_state and serial and "mock" not in str(serial).lower():
        try:
            res_win = await run_adb_shell("dumpsys activity activities | grep -E topResumedActivity", serial, timeout=1.8)
            post_window = res_win.get("stdout", "").strip() if res_win.get("status") == "ok" else ""
            if pre_window and "FilePreviewActivity" in pre_window and ("FilePreviewActivity" not in post_window):
                navigated_away = True
                print(f"[DIAGNOSTIC ALERT ⚠️] Key event '{key_name}' on display #{display_id} caused window switch away from FilePreviewActivity! Pre: {pre_window} -> Post: {post_window}")
        except Exception:
            pass
    elif pre_window and post_window:
        if "FilePreviewActivity" in pre_window and ("FilePreviewActivity" not in post_window):
            navigated_away = True

    event = {
        "key_name": key_name,
        "keycodes": keycodes,
        "shell_command": shell_command,
        "display_id": display_id,
        "duration_ms": duration_ms,
        "caller_node": caller_node or "system",
        "pre_activity": pre_window,
        "post_activity": post_window,
        "navigated_away": navigated_away,
        "details": details or {}
    }

    state.record_key_event_telemetry(event)
    try:
        await state.ws_manager.broadcast({
            "type": "key_event_telemetry",
            "event": event
        })
    except Exception:
        pass

    return event

async def send_hid_keycombination(key1: int, key2: int, serial: Optional[str] = None, caller_node: Optional[str] = None):
    from services import state
    t0 = time.perf_counter()
    # 1. Update orchestration state so connected Android app immediately executes it via HTTP
    cmd_name = "CTRL_END" if key2 == 123 else ("CTRL_HOME" if key2 == 122 else f"KEY_{key1}_{key2}")
    state.orchestration_state.update({
        "last_command": cmd_name,
        "updated_at": datetime.now().isoformat(),
        "source": "studio"
    })

    # 2. Silently ensure soft keyboard is suppressed, focus editor, and dispatch hardware keycombination (O(1) instant jump)
    ser = await get_active_adb_serial(serial)
    if ser:
        pre_act = ""
        if "mock" not in str(ser).lower():
            try:
                res_w = await run_adb_shell("dumpsys activity activities | grep -E topResumedActivity", ser, timeout=1.5)
                pre_act = res_w.get("stdout", "").strip() if res_w.get("status") == "ok" else ""
            except Exception:
                pass

        disp_id = await detect_external_display_id(ser)
        valid_d = sanitize_input_display_id(disp_id)
        target_d = valid_d if valid_d is not None else (8 if ("10" in current_device_model.lower() or "mustang" in current_device_model.lower()) else 4)

        # Check and ensure window focus on target display to prevent InputDispatcher 5000ms hang/ANR
        try:
            focus_chk = await run_adb_shell(f"dumpsys window displays | grep -A 2 'Display: mDisplayId={target_d}'", ser, timeout=1.0)
            focus_out = focus_chk.get("stdout", "")
            if "FilePreviewActivity" not in focus_out:
                # Tap title bar safely at (200, 80) to acquire focus without cursor disruption
                await run_adb_shell(f"input -d {target_d} tap 200 80 >/dev/null 2>&1", ser, timeout=1.0)
        except Exception:
            pass

        base_cmds = [
            "settings put secure show_ime_with_hard_keyboard 0",
            f"input -d {target_d} keyevent 111 >/dev/null 2>&1" if target_d else "input keyevent 111 >/dev/null 2>&1",
            "input -d 0 keyevent 111 >/dev/null 2>&1",
        ]
        if target_d and target_d > 0:
            base_cmds.append(f"input -d {target_d} keycombination -t 150 {key1} {key2}")
            # If Ctrl+End: execute single smooth inertial EOF fling assist (never flood input queue with 8 rapid swipes)
            if key1 == 113 and key2 == 123:
                base_cmds.append(f"input -d {target_d} swipe 300 850 300 150 200")
            # If Ctrl+Home: execute single smooth inertial Home fling assist
            elif key1 == 113 and key2 == 122:
                base_cmds.append(f"input -d {target_d} swipe 400 250 400 900 200")
        else:
            base_cmds.append(f"input keycombination -t 150 {key1} {key2}")

        full_cmd = "; ".join(base_cmds)
        await run_adb_shell(full_cmd, ser, timeout=5.0)
        dur_ms = round((time.perf_counter() - t0) * 1000, 2)

        await record_dispatched_key_event(
            key_name=cmd_name,
            keycodes=[key1, key2],
            shell_command=full_cmd,
            display_id=target_d,
            duration_ms=dur_ms,
            serial=ser,
            caller_node=caller_node or "send_hid_keycombination",
            details={"pre_activity": pre_act, "key1": key1, "key2": key2},
            check_window_state=True
        )


async def calibrate_display_dpi(serial: Optional[str] = None, display_id: Optional[int] = None, target_dpi: Optional[int] = None) -> Dict[str, Any]:
    """
    Automated dynamic DPI calibration check for external desktop display.
    Dynamically derives target DPI based on display physical resolution (or height)
    to target 24 to 35 visible lines (~780dp virtual height):
      - 1080p (h=1080) -> 220 DPI (yields ~28-32 lines)
      - 1440p (h=1440) -> 290 DPI (yields ~28-32 lines)
      - 720p  (h=720)  -> 150 DPI (yields ~28-32 lines)
    If a specific target_dpi is passed, uses that explicitly.
    """
    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        chosen_dpi = target_dpi or 220
        return {"status": "ok", "active_dpi": chosen_dpi, "dpi_factor": round(chosen_dpi / 160.0, 3)}

    did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
    
    # Check display resolution
    h_px = 1080
    size_res = await run_adb_shell(f"wm size -d {did}", ser, timeout=1.8)
    if size_res.get("status") == "ok":
        out_sz = size_res.get("stdout", "")
        if m_sz := re.search(r'(?:Physical|Override)\s*size:\s*(\d+)x(\d+)', out_sz):
            dim1, dim2 = int(m_sz.group(1)), int(m_sz.group(2))
            h_px = min(dim1, dim2)

    if target_dpi is None or target_dpi <= 0:
        # Calibrate to target ~780dp virtual height for 24-35 lines
        target_dpi = max(140, min(360, int(round((h_px / 780.0) * 160.0 / 10.0) * 10)))

    check_res = await run_adb_shell(f"wm density -d {did}", ser, timeout=1.8)
    out = check_res.get("stdout", "")
    current_dpi = 160
    if m_ovr := re.search(r'Override density:\s*(\d+)', out):
        current_dpi = int(m_ovr.group(1))
    elif m_phys := re.search(r'Physical density:\s*(\d+)', out):
        current_dpi = int(m_phys.group(1))

    if current_dpi != target_dpi:
        await run_adb_shell(f"wm density {target_dpi} -d {did}", ser, timeout=2.0)
        current_dpi = target_dpi

    factor = max(0.4, min(3.5, round(current_dpi / 160.0, 3)))
    try:
        from services import state
        if "capture_telemetry" in state.latest_telemetry:
            state.latest_telemetry["capture_telemetry"]["active_dpi"] = current_dpi
            state.latest_telemetry["capture_telemetry"]["dpi_factor"] = factor
    except Exception:
        pass

    return {
        "status": "ok",
        "display_id": did,
        "active_dpi": current_dpi,
        "dpi_factor": factor,
        "calibrated": True
    }


async def dispatch_accelerated_viewport_step(
    delta_lines: int,
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    method: str = "auto",
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Accelerated Viewport Stepping Engine:
    Replaces slow sequential multi-second loops of discrete keystrokes with high-speed,
    single-shell-process dispatch:
      - Option A (PageDown): Dispatches keycode 93 with micro-trimming (e.g. keycode 93 + delta remainder).
      - Option B (Batched Keyevents): Dispatches 'input keyevent 20 20 20 ...' in a single command.
      - Option C (Calibrated Gesture): Direct calibrated swipe fling with line pitch px calculation.
    Reduces positioning latency from > 5,000ms down to < 250ms!
    """
    t0 = time.perf_counter()
    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        dur_ms = 1.0
        from services import state
        state.record_key_event_telemetry({
            "key_name": f"{method.upper()}: {delta_lines}L (mock)",
            "keycodes": [93] if method == "pagedown" else [20],
            "shell_command": "mock",
            "display_id": display_id,
            "duration_ms": dur_ms,
            "caller_node": "arrow_down",
            "navigated_away": False,
            "details": {"delta_lines": delta_lines, "method": method}
        })
        return {
            "status": "ok",
            "method": method,
            "delta_lines": delta_lines,
            "duration_ms": 1,
            "command": "mock"
        }

    pre_act = (details or {}).get("pre_activity", "") if details else ""

    did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
    valid_d = sanitize_input_display_id(did)
    disp_cmd = f"-d {valid_d} " if valid_d else ""

    # Choose method
    chosen_method = method.lower()
    if chosen_method == "auto":
        # For large step (~35+ lines), PageDown keycode 93 with micro-trimming is optimal
        if delta_lines >= 35:
            chosen_method = "pagedown"
        elif delta_lines > 0:
            chosen_method = "batched"
        else:
            chosen_method = "batched"

    shell_cmds = [
        "settings put secure show_ime_with_hard_keyboard 0"
    ]

    key_sequence = []
    page_stride = 49  # Standard lines per page for desktop 1080p markdown editor
    if chosen_method == "pagedown":
        # Option A: Single PageDown command (keycode 93) + micro-adjustment
        rem = delta_lines - page_stride
        key_sequence = ["93"]  # KEYCODE_PAGE_DOWN
        if rem > 0:
            key_sequence.extend(["20"] * min(rem, 20))  # KEYCODE_DPAD_DOWN
        elif rem < 0:
            key_sequence.extend(["19"] * min(abs(rem), 20))  # KEYCODE_DPAD_UP
        keys_str = " ".join(key_sequence)
        shell_cmds.append(f"input {disp_cmd}keyevent {keys_str} >/dev/null 2>&1")
    elif chosen_method == "swipe":
        # Option C: Direct calibrated touch fling with line pitch px
        pitch = 16.0
        dy = int(round(delta_lines * pitch))
        dy_clamped = max(-600, min(600, dy))
        y_center = 600
        y_from = y_center + int(dy_clamped / 2)
        y_to = y_center - int(dy_clamped / 2)
        # Fast 120ms crisp gesture
        shell_cmds.append(f"input {disp_cmd}swipe 960 {y_from} 960 {y_to} 120 >/dev/null 2>&1")
    else:
        # Option B: Batched ADB Keyevents in a single concatenated shell command
        count = max(1, min(delta_lines, 80))
        key_sequence = ["20"] * count
        keys_str = " ".join(key_sequence)
        shell_cmds.append(f"input {disp_cmd}keyevent {keys_str} >/dev/null 2>&1")

    full_cmd = "; ".join(shell_cmds)
    res = await run_adb_shell(full_cmd, ser, timeout=2.0)
    dur_ms = round((time.perf_counter() - t0) * 1000, 2)

    ev_name = f"PageDown(93)" if chosen_method == "pagedown" else (f"DownArrow(20) x{delta_lines}" if chosen_method != "swipe" else "TouchSwipe")
    keycodes_list = [int(k) for k in key_sequence] if key_sequence else []

    # Record telemetry asynchronously without stalling the main pipeline thread
    asyncio.create_task(record_dispatched_key_event(
        key_name=ev_name,
        keycodes=keycodes_list,
        shell_command=full_cmd,
        display_id=valid_d,
        duration_ms=dur_ms,
        serial=ser,
        caller_node="arrow_down",
        details={
            "delta_lines": delta_lines,
            "method": chosen_method,
            "pre_activity": pre_act
        },
        check_window_state=False
    ))

    return {
        "status": "ok" if res.get("status") == "ok" else "error",
        "method": chosen_method,
        "delta_lines": delta_lines,
        "duration_ms": int(dur_ms),
        "output": res.get("stdout", ""),
        "command": full_cmd
    }



async def check_and_update_alignment(serial: Optional[str] = None) -> Dict[str, Any]:
    from services import state
    active_serial = await get_active_adb_serial(serial)
    if not active_serial:
        state.latest_alignment_status.update({
            "status": "device disconnected",
            "device_connected": False,
            "is_aligned": False,
            "reason": "No active Android device connected via ADB",
            "timestamp": datetime.now().isoformat()
        })
        await state.ws_manager.broadcast({
            "type": "alignment_status", "alignment": state.latest_alignment_status,
            "data": state.latest_alignment_status
        })
        return state.latest_alignment_status
    try:
        cache_key = (active_serial, "desktop")
        cached_d = _frame_cache.get(cache_key, {})
        snap_bytes = None
        if cached_d.get("raw_png") and (time.time() - cached_d.get("ts", 0.0) < 1.5):
            snap_bytes = cached_d["raw_png"]
        else:
            snap_bytes = await capture_external_screenshot(active_serial, bypass_lock=True)

        if snap_bytes:
            # Sync to frame cache so stream generator shares this fresh frame
            _update_frame_cache(active_serial, "desktop", snap_bytes)

            dpi_factor, _ = await fetch_current_display_dpi_factor(active_serial)
            res = await asyncio.to_thread(detect_teams_markdown_alignment, snap_bytes, None, dpi_factor)
            res["device_connected"] = True
            res["timestamp"] = datetime.now().isoformat()
            try:
                from classifiers.registry import classifier_registry
                from classifiers.base import ClassifierContext
                disp_id = await detect_external_display_id(active_serial)
                classifier_ctx = ClassifierContext(serial=active_serial, display_id=disp_id, image_bytes=snap_bytes, alignment_data=res)
                await classifier_registry.evaluate_all(classifier_ctx)
                c_report = classifier_registry.get_status_report()
                if c_report.get("has_issues") and getattr(classifier_registry, "_auto_fix_enabled", False):
                    try:
                        await classifier_registry.fix_all(classifier_ctx)
                        # Re-evaluate after auto-fix
                        await classifier_registry.evaluate_all(classifier_ctx)
                        c_report = classifier_registry.get_status_report()
                    except Exception as fe:
                        print(f"[check_and_update_alignment] Auto-fix error: {fe}")
                res["classifiers"], res["classifier_issues"] = c_report, c_report.get("issues", [])
                if c_report.get("has_issues"): state.latest_telemetry["classifier_issues"] = c_report.get("issues", [])
            except Exception as ce: print(f"[check_and_update_alignment] Classifier error: {ce}")

            res = state.sanitize_for_json(res)
            state.latest_alignment_status.clear()
            state.latest_alignment_status.update(res)
            if res.get("first_line_number") is not None:
                try: state.latest_telemetry["current_top_line"] = int(res["first_line_number"])
                except Exception: pass
            if res.get("last_line_number") is not None:
                try: state.latest_telemetry["current_bottom_line"] = int(res["last_line_number"])
                except Exception: pass
            if not res.get("is_aligned", False) and state.orchestration_state.get("status") == "RUNNING":
                state.orchestration_state.update({"status": "PAUSED", "step_label": "PAUSED: teams markdown not aligned"})
                state.latest_telemetry["status_message"] = f"⚠️ teams markdown not aligned ({res.get('reason')})"

            await state.ws_manager.broadcast({
                "type": "alignment_status", "alignment": state.latest_alignment_status,
                "data": state.latest_alignment_status, "classifiers": res.get("classifiers", {}),
                "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry
            })
        else:
            # Screenshot failed or stream unavailable: update alignment status to avoid false positive aligned state
            if state.latest_alignment_status.get("is_aligned"):
                state.latest_alignment_status.update({
                    "status": "teams markdown not aligned",
                    "is_aligned": False,
                    "reason": "External display capture failed / stream unavailable",
                    "timestamp": datetime.now().isoformat()
                })
                await state.ws_manager.broadcast({
                    "type": "alignment_status", "alignment": state.latest_alignment_status,
                    "data": state.latest_alignment_status
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
