import asyncio, json, os, re, subprocess, time, logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
logger = logging.getLogger("adb_service")
import cv2
import numpy as np

from alignment_engine import detect_teams_markdown_alignment
import config

DEVICE_PROFILES = {
    "pixel_10": {
        "id": "pixel_10",
        "displayName": "Pixel 10",
        "friendly_name": "Pixel 10 Pro XL",
        "lines_per_page": 24,
        "scroll_padding_lines": 4,
        "arrow_count_init": 28,
        "arrow_count_step": 28,
        "step_size": 28,
        "default_dpi": 220,
        "display_width": 1920,
        "display_height": 1080,
        "default_display_id": 8,
        "model_keys": ["pixel_10", "mustang", "frankel", "63100"]
    },
    "pixel_8": {
        "id": "pixel_8",
        "displayName": "Pixel 8",
        "friendly_name": "Pixel 8 Pro",
        "lines_per_page": 24,
        "scroll_padding_lines": 4,
        "arrow_count_init": 28,
        "arrow_count_step": 28,
        "step_size": 28,
        "default_dpi": 220,
        "display_width": 1920,
        "display_height": 1080,
        "default_display_id": 11,
        "model_keys": ["pixel_8", "husky", "shiba", "39101"]
    }
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
    if str(mode).lower() == "phone":
        img = np.zeros((1202, 540, 3), dtype=np.uint8)
        img[:] = (23, 17, 13)  # #0d1117 in BGR
        cv2.putText(img, "PHONE DISPLAY #0", (40, 560), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (157, 255, 0), 2, cv2.LINE_AA)
        cv2.putText(img, "Connecting to Phone View...", (40, 610), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (158, 148, 139), 1, cv2.LINE_AA)
    else:
        img = np.zeros((540, 960, 3), dtype=np.uint8)
        img[:] = (23, 17, 13)  # #0d1117 in BGR
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
    if not force_refresh and cached and (now - cached_ts < (300.0 if "desktop" in cached else 3.0)):
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


_phone_ui_xml_cache: Dict[str, Dict[str, Any]] = {}
_phone_ui_refresh_lock: Dict[str, bool] = {}
_phone_last_wake_ts: Dict[str, float] = {}


async def _refresh_phone_ui_xml_async(serial: str) -> Optional[str]:
    """
    Asynchronously refreshes the Display #0 UIAutomator XML hierarchy in `/sdcard/uidump.xml`
    without blocking the MJPEG stream loop.
    """
    if _phone_ui_refresh_lock.get(serial):
        return _phone_ui_xml_cache.get(serial, {}).get("xml")
    _phone_ui_refresh_lock[serial] = True
    try:
        now = time.time()
        if now - _phone_last_wake_ts.get(serial, 0.0) > 3.5:
            _phone_last_wake_ts[serial] = now
            await run_adb_shell("input -d 0 keyevent 224", serial, timeout=1.5)
        res = await run_adb_shell(
            "uiautomator dump /sdcard/uidump.xml >/dev/null 2>&1 && cat /sdcard/uidump.xml",
            serial,
            timeout=6.0,
        )
        out = res.get("stdout", "") or ""
        idx = out.find("<?xml")
        if idx >= 0:
            xml_str = out[idx:]
            _phone_ui_xml_cache[serial] = {"xml": xml_str, "ts": time.time()}
            return xml_str
    except Exception:
        pass
    finally:
        _phone_ui_refresh_lock[serial] = False
    return _phone_ui_xml_cache.get(serial, {}).get("xml")


def _render_phone_ui_hierarchy_canvas(xml_str: str, width: int = 1080, height: int = 2404) -> np.ndarray:
    """
    Renders a crisp, pixel-accurate 1080x2404 visual representation of Display #0 from its
    live UIAutomator XML hierarchy when Android SurfaceFlinger redacts a FLAG_SECURE window
    (such as SystemUI NotificationShade / Keyguard Bouncer) to black in `screencap`.
    """
    import xml.etree.ElementTree as ET

    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    canvas[:] = (28, 20, 14)  # Deep Material Dark background (#0e141c in BGR)

    # Top status banner
    cv2.rectangle(canvas, (0, 0), (width, 145), (38, 28, 18), -1)
    cv2.putText(
        canvas,
        "PHONE DISPLAY #0  |  LIVE UI MIRROR",
        (48, 56),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.92,
        (157, 255, 0),
        2,
        cv2.LINE_AA,
    )
    xml_low = (xml_str or "").lower()
    if "pin_pad_grid" in xml_low or "pinentry" in xml_low or "keyguard_bouncer" in xml_low:
        sub_banner = "ANDROID OS LOCKSCREEN  |  PHONE UNLOCK PIN = 1213 (NEVER 2992)"
        sub_color = (80, 210, 255)
    elif "access teams" in xml_low or "biometric" in xml_low or "fingerprint sensor" in xml_low:
        sub_banner = "TEAMS BIOMETRIC PROMPT  |  DISMISS -> TEAMS PASSCODE = 2992"
        sub_color = (255, 195, 80)
    else:
        sub_banner = "SECURE SURFACE MIRROR  |  PHONE PIN: 1213  |  TEAMS PIN: 2992"
        sub_color = (200, 210, 220)
    cv2.putText(
        canvas,
        sub_banner,
        (48, 112),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.72,
        sub_color,
        2,
        cv2.LINE_AA,
    )

    if not xml_str or "<?xml" not in xml_str:
        cv2.putText(
            canvas,
            "Waking Phone Screen (Display #0)...",
            (180, height // 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.1,
            (220, 210, 200),
            2,
            cv2.LINE_AA,
        )
        cv2.rectangle(canvas, (390, height - 56), (690, height - 42), (235, 235, 235), -1)
        return canvas

    try:
        idx = xml_str.find("<?xml")
        root = ET.fromstring(xml_str[idx:])
        b_re = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")

        for el in root.iter("node"):
            b_str = el.attrib.get("bounds", "")
            m = b_re.search(b_str)
            if not m:
                continue
            x1, y1, x2, y2 = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
            bw, bh = x2 - x1, y2 - y1
            if bw <= 4 or bh <= 4:
                continue

            rid = el.attrib.get("resource-id", "") or ""
            txt = (el.attrib.get("text", "") or "").strip()
            desc = (el.attrib.get("content-desc", "") or "").strip()
            cls = el.attrib.get("class", "") or ""
            clickable = el.attrib.get("clickable", "false") == "true"

            # 1. PIN Entry Field
            if "pinEntry" in rid:
                cv2.rectangle(canvas, (x1, y1), (x2, y2), (48, 36, 24), -1)
                cv2.rectangle(canvas, (x1, y1), (x2, y2), (248, 189, 56), 3)
                display_pin = "* " * len(txt) if txt else "PIN Entry Area"
                font_scale = 1.6 if txt else 1.05
                color = (255, 255, 255) if txt else (170, 160, 150)
                (tw, th), _ = cv2.getTextSize(display_pin.strip(), cv2.FONT_HERSHEY_SIMPLEX, font_scale, 2)
                tx = x1 + max(16, (bw - tw) // 2)
                ty = y1 + (bh + th) // 2
                cv2.putText(canvas, display_pin.strip(), (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 2, cv2.LINE_AA)
                continue

            # 2. Clickable Keypad / Action Buttons
            if clickable and bw < int(width * 0.85) and bh < 360:
                is_enter = "key_enter" in rid or desc.lower() == "enter"
                is_del = "delete_button" in rid or desc.lower() == "delete"
                fill_bgr = (180, 105, 35) if is_enter else ((52, 42, 34) if not is_del else (48, 38, 48))
                border_bgr = (255, 190, 90) if is_enter else (95, 80, 68)
                pad = 8
                cv2.rectangle(canvas, (x1 + pad, y1 + pad), (x2 - pad, y2 - pad), fill_bgr, -1)
                cv2.rectangle(canvas, (x1 + pad, y1 + pad), (x2 - pad, y2 - pad), border_bgr, 2)

                label = txt or desc
                if is_enter and not txt:
                    label = "ENTER"
                elif is_del and not txt:
                    label = "DEL"
                if label:
                    f_scale = 1.9 if len(label) == 1 else (1.05 if len(label) <= 9 else 0.85)
                    thick = 3 if len(label) == 1 else 2
                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, f_scale, thick)
                    tx = x1 + max(10, (bw - tw) // 2)
                    ty = y1 + (bh + th) // 2
                    cv2.putText(canvas, label, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, f_scale, (250, 250, 250), thick, cv2.LINE_AA)
                continue

            # 3. Non-button Text Labels (e.g. "Enter PIN", "Added security required...", Clock, etc.)
            if txt and "Button" not in cls:
                f_scale = 1.45 if bh > 75 and len(txt) <= 16 else 0.92
                thick = 2
                words = txt.split()
                lines: List[str] = []
                cur = ""
                max_w = max(240, bw - 80)
                for w_tok in words:
                    cand = f"{cur} {w_tok}".strip()
                    (tw, _), _ = cv2.getTextSize(cand, cv2.FONT_HERSHEY_SIMPLEX, f_scale, thick)
                    if tw <= max_w or not cur:
                        cur = cand
                    else:
                        lines.append(cur)
                        cur = w_tok
                if cur:
                    lines.append(cur)

                line_h = int(42 * f_scale)
                total_h = len(lines) * line_h
                start_y = y1 + max(32, (bh - total_h) // 2 + int(28 * f_scale))
                for i, ln_str in enumerate(lines[:3]):
                    (tw, _), _ = cv2.getTextSize(ln_str, cv2.FONT_HERSHEY_SIMPLEX, f_scale, thick)
                    tx = x1 + max(24, (bw - tw) // 2)
                    ty = min(height - 20, start_y + i * line_h)
                    cv2.putText(canvas, ln_str, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, f_scale, (240, 244, 248), thick, cv2.LINE_AA)
    except Exception:
        pass

    # Bottom navigation gesture pill
    cv2.rectangle(canvas, (390, height - 56), (690, height - 42), (235, 235, 235), -1)
    return canvas


async def capture_phone_screenshot(serial: Optional[str] = None, max_cache_age_s: float = 0.35, bypass_lock: bool = True) -> Optional[bytes]:
    """
    Explicitly captures a screenshot from the internal phone display (Display #0),
    keeping it strictly isolated from the external desktop display frame cache.
    If Display #0 is dimmed or showing a FLAG_SECURE surface (such as the SystemUI
    NotificationShade / Keyguard Bouncer which SurfaceFlinger redacts to black),
    wakes Display #0 and renders the live Display #0 UI hierarchy so the phone screen
    is always visible when selected.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return None
    if ser and "mock" in str(ser).lower():
        return _get_or_create_standby_frame("phone")

    cache_key = (ser, "phone")
    now = time.time()
    cached = _frame_cache.get(cache_key)
    if cached and cached.get("raw_png") and (now - cached.get("ts", 0.0) < max_cache_age_s):
        return cached["raw_png"]

    acquired_lock = False
    if not bypass_lock:
        try:
            await asyncio.wait_for(_screencap_lock.acquire(), timeout=0.08)
            acquired_lock = True
        except asyncio.TimeoutError:
            if cached and cached.get("raw_png"):
                return cached["raw_png"]

    try:
        # Keep phone screen awake while Phone Mirror View is actively polled
        if now - _phone_last_wake_ts.get(ser, 0.0) > 4.0:
            _phone_last_wake_ts[ser] = now
            asyncio.create_task(run_adb_shell("input -d 0 keyevent 224", ser, timeout=1.5))

        # Fast-path: use cached SurfaceFlinger physical display ID for Display #0 (phone)
        phone_id = _display_map_cache.get(ser, {}).get("phone")
        if not phone_id or len(str(phone_id)) <= 4:
            disp_map = await detect_surfaceflinger_displays(ser)
            phone_id = disp_map.get("phone", "0")

        cmd = (
            ["-s", ser, "exec-out", "screencap", "-d", str(phone_id), "-p"]
            if (phone_id and len(str(phone_id)) > 4)
            else ["-s", ser, "exec-out", "screencap", "-d", "0", "-p"]
        )
        res = await asyncio.to_thread(_exec_adb_sync_bin, cmd, 4.5)
        if res.returncode != 0 or not res.stdout:
            res = await asyncio.to_thread(_exec_adb_sync_bin, ["-s", ser, "exec-out", "screencap", "-p"], 4.0)
        if res.returncode == 0 and (png_bytes := _extract_png_bytes(res.stdout)):
            # Check if SurfaceFlinger redacted Display #0 due to FLAG_SECURE (mean < 2.2 above navbar)
            try:
                img = cv2.imdecode(np.frombuffer(png_bytes, np.uint8), cv2.IMREAD_COLOR)
                if img is not None and img.size > 0:
                    h, w = img.shape[:2]
                    upper_mean = float(np.mean(img[: int(h * 0.90), :]))
                    if upper_mean < 2.2:
                        cached_xml_entry = _phone_ui_xml_cache.get(ser)
                        xml_str = cached_xml_entry.get("xml", "") if cached_xml_entry else ""
                        xml_age = (now - cached_xml_entry.get("ts", 0.0)) if cached_xml_entry else 999.0
                        if not xml_str:
                            cat_res = await run_adb_shell("cat /sdcard/uidump.xml", ser, timeout=1.2)
                            cat_out = cat_res.get("stdout", "") or ""
                            if "<?xml" in cat_out:
                                xml_str = cat_out[cat_out.find("<?xml") :]
                                _phone_ui_xml_cache[ser] = {"xml": xml_str, "ts": now - 1.5}
                        if xml_age > 12.0 and not _phone_ui_refresh_lock.get(ser):
                            asyncio.create_task(_refresh_phone_ui_xml_async(ser))
                        synth_img = _render_phone_ui_hierarchy_canvas(xml_str, width=w or 1080, height=h or 2404)
                        ok_enc, enc_buf = cv2.imencode(".png", synth_img)
                        if ok_enc:
                            png_bytes = enc_buf.tobytes()
            except Exception:
                pass

            _update_frame_cache(ser, "phone", png_bytes)
            return png_bytes
        if cached and cached.get("raw_png"):
            return cached["raw_png"]
        return None
    finally:
        if acquired_lock:
            _screencap_lock.release()


async def capture_display_screenshot(
    target_display: str = "desktop",
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    max_cache_age_s: float = 0.35,
    bypass_lock: bool = True,
) -> Optional[bytes]:
    """
    Explicitly controls which display ('desktop' vs 'phone' or numeric display_id) screenshots
    are obtained from, preventing cross-display capture ambiguity when controlling dual screens.
    """
    mode = str(target_display or "desktop").strip().lower()
    if display_id is not None and int(display_id) == 0:
        mode = "phone"
    elif display_id is not None and int(display_id) > 0:
        mode = "desktop"

    try:
        from services import state as app_state
        app_state.latest_telemetry["active_capture_display"] = {
            "target": mode,
            "display_id": int(display_id) if display_id is not None else (0 if mode == "phone" else app_state.latest_telemetry.get("capture_telemetry", {}).get("display_id")),
            "ts": time.time(),
        }
    except Exception:
        pass

    if mode == "phone":
        return await capture_phone_screenshot(serial=serial, max_cache_age_s=max_cache_age_s, bypass_lock=bypass_lock)
    return await capture_external_screenshot(serial=serial, max_cache_age_s=max_cache_age_s, bypass_lock=bypass_lock)


async def direct_hid_to_display(
    serial: Optional[str] = None,
    target_mode: str = "desktop",
    ext_display_id: Optional[int] = None,
    focus_coords: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """
    Explicitly directs Mouse and Keyboard HID routing between the Phone screen (Display #0)
    and Desktop Mode screen (External Display #ext_id).
      - When target_mode == 'desktop':
          * Routes mouse pointer & hardware keyboard focus to ext_id
          * Suppresses on-screen soft keyboard (show_ime_with_hard_keyboard=0)
          * Updates kiosk_state['mouse_display_id'] = ext_id
      - When target_mode == 'phone':
          * Routes focus to Display #0 without tapping arbitrary phone app search bars
          * Restores phone on-screen keyboard (show_ime_with_hard_keyboard=1)
          * Updates kiosk_state['mouse_display_id'] = 0
    """
    ser = await get_active_adb_serial(serial)
    mode = "phone" if str(target_mode or "").strip().lower() in ("phone", "0", "mobile") else "desktop"
    actions: List[str] = []

    if not ser or "mock" in str(ser).lower():
        return {"status": "mock", "mode": mode, "display_id": 0 if mode == "phone" else (ext_display_id or 2), "actions": actions}

    ext_id = ext_display_id if (ext_display_id and ext_display_id > 0) else await detect_external_display_id(ser)
    target_disp_id = 0 if mode == "phone" else (ext_id or 0)

    if mode == "desktop" and target_disp_id > 0:
        fx, fy = (int(focus_coords[0]), int(focus_coords[1])) if (focus_coords and len(focus_coords) >= 2) else (240, 40)
        await run_adb_shell(
            f"settings put secure show_ime_with_hard_keyboard 0; "
            f"input -d {target_disp_id} mouse tap {fx} {fy} >/dev/null 2>&1",
            ser,
            timeout=2.0,
        )
        actions.append(f"Directed mouse & keyboard HID to desktop display #{target_disp_id} at ({fx}, {fy})")
    else:
        target_disp_id = 0
        if focus_coords and len(focus_coords) >= 2:
            fx, fy = int(focus_coords[0]), int(focus_coords[1])
            await run_adb_shell(
                f"input -d 0 keyevent 224; settings put secure show_ime_with_hard_keyboard 1; "
                f"input touchscreen -d 0 tap {fx} {fy} >/dev/null 2>&1",
                ser,
                timeout=2.5,
            )
            actions.append(f"Directed HID to phone display #0 at ({fx}, {fy})")
        else:
            await run_adb_shell("input -d 0 keyevent 224; settings put secure show_ime_with_hard_keyboard 1", ser, timeout=2.0)
            actions.append("Directed HID to phone display #0 (woke Display #0 and restored phone soft IME)")
        if (ser, "phone") in _frame_cache:
            _frame_cache[(ser, "phone")]["ts"] = 0.0
        asyncio.create_task(_refresh_phone_ui_xml_async(ser))

    try:
        from services import kiosk_service, state as app_state
        kiosk_service.kiosk_state["mouse_display_id"] = target_disp_id
        app_state.latest_telemetry["hid_target_display"] = {
            "mode": mode,
            "display_id": target_disp_id,
            "ts": time.time(),
        }
    except Exception:
        pass

    return {
        "status": "ok",
        "mode": mode,
        "display_id": target_disp_id,
        "actions": actions,
    }

_phone_screencap_lock = asyncio.Lock()


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

    active_lock = _phone_screencap_lock if mode == "phone" else _screencap_lock
    lock_timeout = 1.5 if mode == "phone" else 0.08
    acquired = False
    try:
        await asyncio.wait_for(active_lock.acquire(), timeout=lock_timeout)
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
        else:  # mode == "phone"
            raw_bytes = await capture_phone_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True)
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
    finally:
        if acquired:
            active_lock.release()

    # If capture failed on this frame, return previous cached frame or standby frame
    if cached:
        jpg = _get_cached_jpeg(cached, quality=quality, max_dim=max_dim)
        if jpg:
            return jpg
    return _get_or_create_standby_frame(mode)

def detect_teams_auth_or_fingerprint_screen_cv(screen_img: Optional[np.ndarray]) -> Dict[str, Any]:
    """
    Analyzes an external desktop display screenshot for:
      1. Blank White Teams Screen (Image 3): Teams titlebar at top-left ('Teams') with a pure blank white
         body (mean_lum >= 236, std <= 12, white_pct >= 94%). Indicates the phone is displaying a
         fingerprint prompt to unlock. Pressing ESCAPE (keycode 111) prompts for the PIN on desktop mode.
      2. Desktop Mode Teams / Intune PIN Screen (Image 4): Full-screen light gray/white Intune page
         (body_mean >= 200, left_mean >= 200, right_mean >= 200, <= 22 OCR tokens, no markdown/gutter)
         containing BOTH 'Managed by your organization' (or 'Forgot your PIN') AND 'Enter your PIN'.
    """
    if screen_img is None or getattr(screen_img, "size", 0) == 0:
        return {"detected": False, "auth_type": "none"}

    try:
        h, w = screen_img.shape[:2]
        scale_x = w / 1920.0
        scale_y = h / 1080.0

        by1, by2 = max(0, int(120 * scale_y)), min(h, int(930 * scale_y))
        bx1, bx2 = max(0, int(40 * scale_x)), min(w, int(1880 * scale_x))
        body = screen_img[by1:by2, bx1:bx2]
        body_mean = float(np.mean(body)) if body.size > 0 else 0.0
        body_std = float(np.std(body)) if body.size > 0 else 255.0
        white_pct = float(np.mean(body > 238) * 100.0) if body.size > 0 else 0.0

        left_margin = screen_img[by1:by2, max(0, int(40 * scale_x)):min(w, int(350 * scale_x))]
        right_margin = screen_img[by1:by2, max(0, int(1570 * scale_x)):min(w, int(1880 * scale_x))]
        left_mean = float(np.mean(left_margin)) if left_margin.size > 0 else 0.0
        right_mean = float(np.mean(right_margin)) if right_margin.size > 0 else 0.0

        # FAST GUARD 1: Both the Teams PIN prompt (body_mean ~232) and Blank White Fingerprint screen (body_mean ~250)
        # are full-screen light/white surfaces across the body AND left/right margins.
        # Dark-mode Markdown Editor (~38) or Folder View (~18) or floating windows over dark backgrounds
        # have body_mean < 200 or dark margins -> immediately return False without running OCR!
        if body_mean < 200.0 or left_mean < 200.0 or right_mean < 200.0:
            return {"detected": False, "auth_type": "none"}

        from ocr_engine import get_rapid_ocr, find_gutter_numbers_cluster
        # FAST GUARD 2: If the Markdown editor line-number gutter is present (even in Light Mode),
        # this is a Markdown editor — NEVER an authentication or PIN screen!
        try:
            gutter_cluster = find_gutter_numbers_cluster(screen_img)
            if gutter_cluster and len(gutter_cluster) >= 2:
                return {"detected": False, "auth_type": "none"}
        except Exception:
            pass

        r = get_rapid_ocr()
        res, _ = r(screen_img) if r is not None else ([], None)

        tokens = []
        has_teams_top_left = False
        body_tokens = []
        pin_field_coords = [int(960 * scale_x), int(635 * scale_y)]
        ok_btn_coords = [int(935 * scale_x), int(725 * scale_y)]

        for box, txt, score in (res or []):
            pts = np.array(box)
            tx1, ty1 = int(pts[:, 0].min()), int(pts[:, 1].min())
            tx2, ty2 = int(pts[:, 0].max()), int(pts[:, 1].max())
            tcx, tcy = (tx1 + tx2) // 2, (ty1 + ty2) // 2
            clean = str(txt).strip()
            clean_low = clean.lower()
            clean_nospace = re.sub(r"\s+", "", clean_low)
            tokens.append((tx1, ty1, tx2, ty2, clean, clean_low, clean_nospace))

            if ty1 < int(145 * scale_y) and tx1 < int(480 * scale_x) and "team" in clean_low:
                has_teams_top_left = True
            elif by1 <= tcy <= by2:
                body_tokens.append(clean_low)

            if clean_nospace == "pin" or "enteryourpin" in clean_nospace:
                if clean_nospace == "pin":
                    pin_field_coords = [int(960 * scale_x), tcy]
                else:
                    pin_field_coords = [int(960 * scale_x), min(int(920 * scale_y), ty2 + int(42 * scale_y))]
            elif clean_nospace == "ok" and tcy > int(550 * scale_y):
                ok_btn_coords = [tcx, tcy]

        full_text = " ".join(t[5] for t in tokens)
        full_nospace = "".join(t[6] for t in tokens)

        non_auth_keywords = (
            ".md", "part", "saving", "almosthere", "changesarebeing", "modifiedby",
            "generatedby", "directorystructure", "filesinthispart", "characters", "devcode"
        )
        has_markdown_or_folder_tokens = any(kw in full_nospace for kw in non_auth_keywords)

        # GUARD 3: Never match a screen that has Markdown/folder tokens or dense document text (> 22 OCR lines)
        if has_markdown_or_folder_tokens or len(tokens) > 22:
            return {"detected": False, "auth_type": "none"}

        # Check for Desktop Mode PIN Prompt (Image 4: 'Managed by your organization' + 'Enter your PIN' + 'Forgot your PIN')
        has_enter_your_pin = ("enteryourpin" in full_nospace or "confirmyourpin" in full_nospace)
        has_org_or_forgot_pin = (
            "managedbyyourorganization" in full_nospace
            or "forgotyourpin" in full_nospace
            or "needtochangeit" in full_nospace
        )
        if has_enter_your_pin and has_org_or_forgot_pin:
            return {
                "detected": True,
                "auth_type": "pin",
                "auth_subtype": "mam_pin_prompt",
                "requires_escape_for_pin": False,
                "requires_mam_pin": True,
                "is_pin_safe": True,
                "pin_field_coords": pin_field_coords,
                "ok_btn_coords": ok_btn_coords,
                "details": "Desktop mode Teams/Intune PIN prompt detected ('Managed by your organization' + 'Enter your PIN')",
            }

        # Check for Blank White Teams Screen (Image 3: Teams in top-left + blank white body -> Fingerprint prompt on phone)
        header_strip = screen_img[max(0, int(32 * scale_y)):min(h, int(108 * scale_y)), max(0, int(20 * scale_x)):min(w, int(1900 * scale_x))]
        header_mean = float(np.mean(header_strip)) if header_strip.size > 0 else 0.0
        subheader_strip = screen_img[max(0, int(112 * scale_y)):min(h, int(205 * scale_y)), max(0, int(80 * scale_x)):min(w, int(1840 * scale_x))]
        subheader_mean = float(np.mean(subheader_strip)) if subheader_strip.size > 0 else 0.0
        is_blank_white_body = (
            body_mean >= 236.0
            and body_std <= 12.0
            and white_pct >= 94.0
            and left_mean >= 230.0
            and right_mean >= 230.0
            and subheader_mean >= 230.0
            and len(body_tokens) == 0
            and not has_markdown_or_folder_tokens
        )
        if is_blank_white_body and (has_teams_top_left or header_mean >= 180.0):
            return {
                "detected": True,
                "auth_type": "pin",
                "auth_subtype": "fingerprint_blank_teams",
                "requires_escape_for_pin": True,
                "requires_mam_pin": True,
                "is_pin_safe": True,
                "pin_field_coords": pin_field_coords,
                "ok_btn_coords": ok_btn_coords,
                "details": "Blank white Teams screen detected (phone displaying fingerprint unlock; send Escape to prompt for PIN 2992 on desktop)",
            }

        # Check for Username / Password / OAuth prompt (only when not a PIN prompt)
        user_pw_phrases = [
            "sign in", "sign-in", "email, phone, or skype", "email or phone",
            "pick an account", "use another account", "enter password",
            "enter your password", "keep me signed in", "work or school account"
        ]
        if any(p in full_text for p in user_pw_phrases):
            return {
                "detected": True,
                "auth_type": "username_password",
                "auth_subtype": "oauth_or_password",
                "requires_escape_for_pin": False,
                "requires_mam_pin": False,
                "is_pin_safe": False,
                "details": "Username/Password or Microsoft Sign-In text detected via OCR",
            }
    except Exception:
        pass

    return {"detected": False, "auth_type": "none"}


async def detect_auth_screen_type(
    serial: Optional[str] = None,
    ext_display_id: Optional[int] = None,
    screen_img: Optional[np.ndarray] = None
) -> Dict[str, Any]:
    """
    Differentiates between:
      1. 'pin': A visually verified Teams numeric PIN prompt on the Desktop Display ('Enter your PIN' /
         'Managed by your organization') or a Blank White Teams screen on the Desktop Display where
         the phone is displaying a fingerprint prompt for Teams and Escape prompts for the desktop PIN.
         STRICTLY requires visual confirmation on the Desktop Display so that numeric fields or search
         bars on the phone (e.g. Audible) NEVER trigger PIN entry!
      2. 'username_password': A Username, Email, Password, or OAuth sign-in screen
         (e.g., BrokerAuthorizationActivity, AccountChooserActivity, SignInActivity, Webview).
         STRICTLY PROHIBITS PIN ENTRY so PIN digits (e.g. 2992) are never typed into username fields!
      3. 'none': Normal application screen (clean, no auth prompt).
    """
    if screen_img is not None:
        cv_eval = detect_teams_auth_or_fingerprint_screen_cv(screen_img)
        if cv_eval.get("detected"):
            return {
                "auth_type": cv_eval["auth_type"],
                "auth_subtype": cv_eval.get("auth_subtype", ""),
                "details": cv_eval.get("details", ""),
                "is_pin_safe": bool(cv_eval.get("is_pin_safe", False)),
                "requires_keyguard_unlock": False,
                "requires_mam_pin": bool(cv_eval.get("requires_mam_pin", False)),
                "requires_escape_for_pin": bool(cv_eval.get("requires_escape_for_pin", False)),
                "pin_field_coords": cv_eval.get("pin_field_coords"),
                "ok_btn_coords": cv_eval.get("ok_btn_coords"),
            }
        return {
            "auth_type": "none",
            "details": "External display screenshot shows no authentication prompt",
            "is_pin_safe": False,
            "requires_keyguard_unlock": False,
            "requires_mam_pin": False,
            "requires_escape_for_pin": False,
        }

    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {
            "auth_type": "none",
            "details": "Mock or disconnected device",
            "is_pin_safe": False,
            "requires_keyguard_unlock": False,
            "requires_mam_pin": False,
            "requires_escape_for_pin": False,
        }

    # 1. Check Window Manager & Activity Stack for Username / Password / OAuth Webview prompts
    combined_acts = ""
    try:
        win_chk = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", ser, timeout=1.2)
        combined_acts += win_chk.get("stdout", "") + "\n"
        act_chk = await run_adb_shell("dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity'", ser, timeout=1.2)
        combined_acts += act_chk.get("stdout", "")
    except Exception:
        pass

    combined_acts_lower = combined_acts.lower()

    username_pw_indicators = [
        "brokerauthorizationactivity", "accountchooseractivity", "signinactivity",
        "oauthactivity", "webauthactivity", "authorizeactivity", "browsersigninactivity",
        "identityactivity", "com.microsoft.identity.client", "com.azure.authenticator"
    ]
    detected_user_pw = [ind for ind in username_pw_indicators if ind in combined_acts_lower]
    if detected_user_pw:
        return {
            "auth_type": "username_password",
            "details": f"Username / Account Chooser / OAuth activity active ({', '.join(detected_user_pw)})",
            "is_pin_safe": False,
            "requires_keyguard_unlock": False,
            "requires_mam_pin": False,
            "requires_escape_for_pin": False,
        }

    # 2. Require Microsoft Teams to be present in the active window/activity state before considering any Teams PIN prompt
    if combined_acts_lower and "com.microsoft.teams" not in combined_acts_lower:
        return {
            "auth_type": "none",
            "details": "Microsoft Teams is not active in window focus; skipping PIN check",
            "is_pin_safe": False,
            "requires_keyguard_unlock": False,
            "requires_mam_pin": False,
            "requires_escape_for_pin": False,
        }

    # 3. Live screenshot visual verification explicitly from the Desktop Display (NEVER Display #0)
    try:
        snap_bytes = await capture_display_screenshot(
            target_display="desktop",
            serial=ser,
            display_id=ext_display_id,
            max_cache_age_s=0.25,
            bypass_lock=True,
        )
        if snap_bytes:
            img_live = cv2.imdecode(np.frombuffer(snap_bytes, np.uint8), cv2.IMREAD_COLOR)
            if img_live is not None:
                cv_eval = detect_teams_auth_or_fingerprint_screen_cv(img_live)
                if cv_eval.get("detected"):
                    return {
                        "auth_type": cv_eval["auth_type"],
                        "auth_subtype": cv_eval.get("auth_subtype", ""),
                        "details": cv_eval.get("details", ""),
                        "is_pin_safe": bool(cv_eval.get("is_pin_safe", False)),
                        "requires_keyguard_unlock": False,
                        "requires_mam_pin": bool(cv_eval.get("requires_mam_pin", False)),
                        "requires_escape_for_pin": bool(cv_eval.get("requires_escape_for_pin", False)),
                        "pin_field_coords": cv_eval.get("pin_field_coords"),
                        "ok_btn_coords": cv_eval.get("ok_btn_coords"),
                    }
    except Exception:
        pass

    return {
        "auth_type": "none",
        "details": "No Teams authentication prompt active on desktop display",
        "is_pin_safe": False,
        "requires_keyguard_unlock": False,
        "requires_mam_pin": False,
        "requires_escape_for_pin": False,
    }


async def auto_handle_pin_authentication(
    serial: Optional[str] = None,
    ext_display_id: Optional[int] = None,
    pin: Optional[str] = None,
    force: bool = False,
    screen_img: Optional[np.ndarray] = None
) -> Dict[str, Any]:
    """
    Assures PIN code authentication is automatically handled ONLY when Microsoft Teams on the
    external desktop display explicitly prompts for a PIN ('Enter your PIN' / 'mam_pin_prompt')
    or displays the Blank White Teams Fingerprint Screen ('fingerprint_blank_teams' -> Escape -> 'Enter your PIN').

    STRICT SAFETY INVARIANTS:
      - NEVER types the PIN (2992) on the phone display (Display #0), preventing accidental entry into
        phone apps (such as Audible, messages, or browser search bars).
      - NEVER types the PIN unless 'Enter your PIN' is visually confirmed on the desktop display (#ext_id).
      - Explicitly directs Mouse & Keyboard HID between phone and desktop mode as necessary.
    """
    import config
    teams_pin_default = getattr(config, "TEAMS_PIN", None) or getattr(config, "DEVICE_PIN", "2992") or "2992"
    phone_unlock_pin_val = getattr(config, "PHONE_UNLOCK_PIN", "1213") or "1213"
    # STRICT TWO-PIN SEPARATION GUARD: Never allow Phone Unlock PIN (1213) to be entered into Teams PIN prompt!
    if not pin or str(pin).strip() == str(phone_unlock_pin_val).strip():
        active_pin = teams_pin_default
    else:
        active_pin = str(pin).strip()
    auto_pin_enabled = getattr(config, "AUTO_ENTER_PIN", True)

    if not auto_pin_enabled and not force:
        return {
            "status": "blocked_by_safety",
            "auth_detected": False,
            "auth_type": "none",
            "pin_submitted": False,
            "keyguard_unlocked": False,
            "actions": ["Automated PIN entry is disabled in Settings (Safe Lock)"]
        }

    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {
            "status": "mock",
            "auth_detected": False,
            "auth_type": "none",
            "pin_submitted": False,
            "keyguard_unlocked": False,
            "actions": []
        }

    ext_id = ext_display_id if (ext_display_id and ext_display_id > 0) else await detect_external_display_id(ser)
    if not ext_id or ext_id <= 0:
        return {
            "status": "no_external_display",
            "auth_detected": False,
            "auth_type": "none",
            "pin_submitted": False,
            "keyguard_unlocked": False,
            "actions": ["No external desktop display detected; refusing to type PIN on phone display #0"]
        }

    actions: List[str] = []

    # 1. Differentiate Authentication Screen Type using explicit Desktop Display capture
    auth_eval = await detect_auth_screen_type(ser, ext_id, screen_img=screen_img)
    auth_type = auth_eval.get("auth_type", "none")

    # 2. If Username / Password / Account Chooser is detected: STRICTLY PROHIBIT PIN ENTRY!
    if auth_type == "username_password":
        msg = f"Username / Password prompt detected ({auth_eval.get('details')}). Suppressed automated PIN entry to prevent entering PIN into username field."
        actions.append(msg)
        try:
            from services.state import ws_manager
            await ws_manager.broadcast({
                "type": "auth_credential_required",
                "auth_type": "username_password",
                "message": msg,
                "details": auth_eval
            })
        except Exception:
            pass
        return {
            "status": "blocked_username_password",
            "auth_detected": True,
            "auth_type": "username_password",
            "pin_submitted": False,
            "keyguard_unlocked": False,
            "message": msg,
            "actions": actions
        }

    # 3. If no Teams auth prompt is active on the desktop display, return clean immediately
    if auth_type != "pin":
        return {
            "status": "clean",
            "auth_detected": False,
            "auth_type": "none",
            "pin_submitted": False,
            "keyguard_unlocked": False,
            "actions": []
        }

    # 4. Handle Visually Verified Teams Fingerprint / PIN Prompt on Desktop Display (#ext_id)
    pin_submitted = False
    try:
        pin_coords = auth_eval.get("pin_field_coords") or [960, 635]
        ok_coords = auth_eval.get("ok_btn_coords") or [935, 725]
        confirmed_mam_pin_prompt = bool(auth_eval.get("auth_subtype") == "mam_pin_prompt")

        # A. Blank White Teams Screen on Desktop -> Phone is displaying Teams Fingerprint Prompt
        #    Direct HID to dismiss the fingerprint prompt with ESCAPE (keyevent 111), then return HID to Desktop
        if auth_eval.get("requires_escape_for_pin"):
            # Check if phone display #0 actually has BiometricPrompt / AuthController focused
            win_chk = await run_adb_shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'", ser, timeout=1.2)
            win_out_low = (win_chk.get("stdout", "") or "").lower()
            has_phone_biometric_dialog = any(
                k in win_out_low for k in ("biometric", "authcontroller", "fingerprint")
            )
            if has_phone_biometric_dialog:
                await direct_hid_to_display(ser, target_mode="phone", ext_display_id=ext_id)
                await run_adb_shell("input -d 0 keyevent 111", ser, timeout=1.5)
                actions.append("Directed HID to phone display #0 and sent ESCAPE (keyevent 111) to dismiss biometric prompt")

            await direct_hid_to_display(ser, target_mode="desktop", ext_display_id=ext_id, focus_coords=[240, 40])
            await run_adb_shell(f"input -d {ext_id} keyevent 111", ser, timeout=2.0)
            actions.append(
                f"Directed HID to desktop display #{ext_id} and sent ESCAPE (keyevent 111) on blank white Teams screen to prompt for PIN"
            )
            await asyncio.sleep(0.9)

            # Capture a fresh screenshot explicitly from the desktop display (#ext_id) to confirm 'Enter your PIN' appeared
            confirmed_mam_pin_prompt = False
            try:
                snap_after_esc = await capture_display_screenshot(
                    target_display="desktop",
                    serial=ser,
                    display_id=ext_id,
                    max_cache_age_s=0.0,
                    bypass_lock=True,
                )
                if snap_after_esc:
                    img_after_esc = cv2.imdecode(np.frombuffer(snap_after_esc, np.uint8), cv2.IMREAD_COLOR)
                    if img_after_esc is not None:
                        esc_eval = detect_teams_auth_or_fingerprint_screen_cv(img_after_esc)
                        if esc_eval.get("pin_field_coords"):
                            pin_coords = esc_eval["pin_field_coords"]
                        if esc_eval.get("ok_btn_coords"):
                            ok_coords = esc_eval["ok_btn_coords"]
                        if esc_eval.get("detected") and esc_eval.get("auth_subtype") == "mam_pin_prompt":
                            confirmed_mam_pin_prompt = True
                        else:
                            actions.append("Post-Escape desktop screenshot did not show 'Enter your PIN' prompt; skipped PIN typing")
            except Exception as esc_err:
                actions.append(f"Post-Escape desktop verification failed ({esc_err}); skipped PIN typing for safety")

        # B. Enter PIN 2992 ONLY when 'Enter your PIN' (mam_pin_prompt) is visually confirmed on Desktop Display (#ext_id)
        #    NEVER send 'input -d 0 text 2992' to the phone screen, and NEVER send Backspace (keyevent 67)!
        if confirmed_mam_pin_prompt and ext_id and ext_id > 0:
            px, py = int(pin_coords[0]), int(pin_coords[1])
            ox, oy = int(ok_coords[0]), int(ok_coords[1])
            await direct_hid_to_display(ser, target_mode="desktop", ext_display_id=ext_id, focus_coords=[px, py])
            await run_adb_shell(
                f"input -d {ext_id} tap {px} {py}; "
                f"sleep 0.15; "
                f"input -d {ext_id} text {active_pin}; "
                f"sleep 0.2; "
                f"input -d {ext_id} keyevent 66; "
                f"input -d {ext_id} tap {ox} {oy}",
                ser,
                timeout=3.5
            )
            pin_submitted = True
            actions.append(f"Directed HID to desktop display #{ext_id} and submitted PIN {active_pin} to verified Teams PIN prompt")

        if actions:
            try:
                from services.state import ws_manager
                await ws_manager.broadcast({
                    "type": "pin_authentication_handled",
                    "pin_length": len(active_pin),
                    "auth_subtype": auth_eval.get("auth_subtype", "pin"),
                    "pin_submitted": pin_submitted,
                    "actions": actions
                })
            except Exception:
                pass

        return {
            "status": "ok",
            "auth_detected": True,
            "auth_type": "pin",
            "auth_subtype": auth_eval.get("auth_subtype", "pin"),
            "escape_sent": bool(auth_eval.get("requires_escape_for_pin", False)),
            "pin_submitted": pin_submitted,
            "keyguard_unlocked": False,
            "actions": actions
        }
    except Exception as e:
        return {
            "status": "error",
            "auth_detected": True,
            "auth_type": "pin",
            "pin_submitted": False,
            "keyguard_unlocked": False,
            "error": str(e),
            "actions": actions
        }

# Exact verified Pixel 8 (1080x2404) Android SystemUI Keyguard Bouncer keypad coordinates on Display #0
PHONE_KEYPAD_COORDS_1080X2404: Dict[str, Tuple[int, int]] = {
    "1": (235, 1016),
    "2": (541, 1016),
    "3": (847, 1016),
    "4": (235, 1285),
    "5": (541, 1285),
    "6": (847, 1285),
    "7": (235, 1554),
    "8": (541, 1554),
    "9": (847, 1554),
    "DEL": (235, 1823),
    "0": (541, 1823),
    "ENTER": (847, 1823),
}


async def detect_phone_lockscreen_state(serial: Optional[str] = None) -> Dict[str, Any]:
    """
    Inspects Display #0 window policy and active window focus to distinguish:
      1. Android OS Phone Lockscreen (`keyguard_showing=True` or `input_restricted=True`):
         -> Requires Phone Unlock PIN `1213` (NEVER `2992`).
      2. Teams Biometric Prompt on Display #0 (`has_teams_biometric=True`, `keyguard_showing=False`):
         -> Dismiss with Escape (keyevent 111), then enter Teams Passcode `2992` on Teams PIN prompt.
      3. Unlocked Phone Screen (`keyguard_showing=False`, `input_restricted=False`):
         -> Phone is already unlocked; no Phone PIN (`1213`) entry needed.
    """
    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {
            "status": "mock",
            "keyguard_showing": False,
            "input_restricted": False,
            "has_teams_biometric": False,
            "focused_window": "",
            "required_pin_type": "none",
        }

    res = await run_adb_shell(
        "dumpsys window policy | grep -E 'showing=|inputRestricted=|bouncerShowing='; "
        "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'",
        ser,
        timeout=2.5,
    )
    out = res.get("stdout", "") or ""
    out_low = out.lower()

    keyguard_showing = bool(re.search(r"\bshowing=true\b", out_low))
    input_restricted = bool(re.search(r"\binputrestricted=true\b", out_low))
    has_teams_biometric = any(k in out_low for k in ("biometricprompt", "authcontroller")) and not keyguard_showing

    if keyguard_showing or input_restricted:
        req_pin = "phone_unlock_1213"
    elif has_teams_biometric:
        req_pin = "teams_biometric_escape_then_2992"
    else:
        req_pin = "none"

    return {
        "status": "ok",
        "keyguard_showing": keyguard_showing,
        "input_restricted": input_restricted,
        "has_teams_biometric": has_teams_biometric,
        "focused_window": out.strip(),
        "required_pin_type": req_pin,
    }


async def unlock_phone_screen_1213(
    serial: Optional[str] = None,
    phone_pin: Optional[str] = None,
    handle_teams_auth_after: bool = False,
) -> Dict[str, Any]:
    """
    Wakes Display #0 and unlocks the Android OS Phone Lockscreen using strictly the
    Phone Unlock PIN (`1213`).

    CRITICAL SAFETY INVARIANTS (NEVER MIX UP THE TWO PINS):
      1. Phone OS Lockscreen (`Display #0`, `KeyguardServiceDelegate showing=true` / `com.android.systemui:id/pin_pad_grid`):
         -> Uses ONLY `1213` (`config.PHONE_UNLOCK_PIN`), tapped via `input touchscreen -d 0 tap <x> <y>`.
         -> NEVER enters `2992` on the Phone OS Lockscreen!
      2. Microsoft Teams Passcode (`2992`, `config.TEAMS_PIN`):
         -> Used ONLY when Microsoft Teams prompts for `"Enter your PIN"` (`mam_pin_prompt`).
         -> NEVER enters `1213` into Microsoft Teams!
    """
    import config

    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {"status": "mock", "keyguard_unlocked": True, "pin_used": "1213", "actions": []}

    default_phone_pin = getattr(config, "PHONE_UNLOCK_PIN", "1213") or "1213"
    teams_pin_val = getattr(config, "TEAMS_PIN", "2992") or "2992"

    # Guard against accidentally passing Teams PIN (2992) into Phone Unlock function
    if not phone_pin or str(phone_pin).strip() == str(teams_pin_val).strip():
        active_phone_pin = str(default_phone_pin).strip()
    else:
        active_phone_pin = str(phone_pin).strip()

    actions: List[str] = []

    # 1. Wake Display #0 and check lockscreen state
    await run_adb_shell("input -d 0 keyevent 224", ser, timeout=1.5)
    lock_state = await detect_phone_lockscreen_state(ser)
    actions.append(
        f"Checked Display #0 state: keyguard_showing={lock_state.get('keyguard_showing')}, "
        f"input_restricted={lock_state.get('input_restricted')}, "
        f"required_pin_type={lock_state.get('required_pin_type')}"
    )

    keyguard_unlocked = False
    if lock_state.get("keyguard_showing") or lock_state.get("input_restricted"):
        # Kill any in-flight uiautomator dump so touchscreen tap commands on Display #0 never block
        await run_adb_shell("pkill -f uiautomator || true", ser, timeout=1.5)

        # Reveal Keyguard Bouncer keypad on Display #0
        await run_adb_shell(
            "input -d 0 keyevent 224; "
            "input -d 0 keyevent 82; "
            "input touchscreen -d 0 swipe 540 1900 540 600 250",
            ser,
            timeout=3.0,
        )
        await asyncio.sleep(0.35)

        # Build single shell command to clear any partial digits (DEL x6) and tap 1-2-1-3 + ENTER on Display #0
        del_x, del_y = PHONE_KEYPAD_COORDS_1080X2404["DEL"]
        ent_x, ent_y = PHONE_KEYPAD_COORDS_1080X2404["ENTER"]
        cmd_parts = [f"input touchscreen -d 0 tap {del_x} {del_y}" for _ in range(6)]
        cmd_parts.append("sleep 0.15")
        for ch in active_phone_pin:
            if ch in PHONE_KEYPAD_COORDS_1080X2404:
                kx, ky = PHONE_KEYPAD_COORDS_1080X2404[ch]
                cmd_parts.append(f"input touchscreen -d 0 tap {kx} {ky}")
                cmd_parts.append("sleep 0.12")
        cmd_parts.append(f"input touchscreen -d 0 tap {ent_x} {ent_y}")

        await run_adb_shell("; ".join(cmd_parts), ser, timeout=8.0)
        actions.append(
            f"Entered Phone Unlock PIN ({active_phone_pin}) + ENTER on Display #0 Android Keyguard keypad via touchscreen -d 0"
        )
        await asyncio.sleep(0.55)

        post_state = await detect_phone_lockscreen_state(ser)
        keyguard_unlocked = not (post_state.get("keyguard_showing") or post_state.get("input_restricted"))
        actions.append(
            f"Post-unlock Display #0 verification: keyguard_showing={post_state.get('keyguard_showing')}, "
            f"unlocked={keyguard_unlocked}"
        )
        lock_state = post_state
    else:
        keyguard_unlocked = True
        actions.append("Phone Display #0 is already unlocked (showing=false); skipped entering 1213")

    # 2. If Teams BiometricPrompt ('Access Teams' / 'Touch the fingerprint sensor') is active on Display #0,
    #    dismiss it with ESCAPE so Teams can prompt for Teams PIN 2992 on desktop mode.
    if lock_state.get("has_teams_biometric"):
        await run_adb_shell("input -d 0 keyevent 111", ser, timeout=1.5)
        actions.append("Dismissed Teams BiometricPrompt on Display #0 via ESCAPE (keyevent 111)")
        await asyncio.sleep(0.3)

    # Mark cached phone frame stale so UI immediately refreshes live unlocked phone screen while preserving fallback
    if (ser, "phone") in _frame_cache:
        _frame_cache[(ser, "phone")]["ts"] = 0.0

    teams_auth_result = None
    if handle_teams_auth_after:
        teams_auth_result = await auto_handle_pin_authentication(
            serial=ser,
            pin=teams_pin_val,
            force=True,
        )
        if teams_auth_result.get("actions"):
            actions.extend(teams_auth_result["actions"])

    return {
        "status": "ok",
        "keyguard_unlocked": keyguard_unlocked,
        "phone_pin_used": active_phone_pin if (not lock_state.get("keyguard_showing")) else None,
        "teams_pin_configured": teams_pin_val,
        "lock_state": lock_state,
        "teams_auth": teams_auth_result,
        "actions": actions,
    }


async def configure_display_awake_policies(
    serial: Optional[str] = None,
    pin: Optional[str] = None,
    unlock_phone: bool = True,
    handle_teams_pin: bool = False,
) -> Dict[str, Any]:
    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {"status": "mock", "stay_on": True}

    import config
    phone_pin_val = getattr(config, "PHONE_UNLOCK_PIN", "1213") or "1213"

    result: Dict[str, Any] = {
        "status": "ok",
        "stay_on": True,
        "keyguard_unlocked": False,
        "auth_handled": False,
        "phone_unlock_pin": phone_pin_val,
        "teams_pin": getattr(config, "TEAMS_PIN", "2992") or "2992",
    }
    try:
        # 1. Enforce permanent stay-awake policy across all power connections & wake Display #0
        await run_adb_shell(
            "input -d 0 keyevent 224; "
            "svc power stayon true; "
            "settings put global stay_on_while_plugged_in 7; "
            "settings put system screen_off_timeout 2147483647; "
            "settings put global sleep_timeout -1; "
            "settings put secure lock_screen_lock_after_timeout 2147483647; "
            "settings put secure doze_enabled 0",
            ser,
            timeout=2.5
        )
        # 2. If unlock_phone is enabled, check & unlock Display #0 OS Lockscreen strictly with 1213 (never 2992)
        if unlock_phone:
            unlock_res = await unlock_phone_screen_1213(
                serial=ser,
                phone_pin=phone_pin_val,
                handle_teams_auth_after=handle_teams_pin,
            )
            result["keyguard_unlocked"] = bool(unlock_res.get("keyguard_unlocked", False))
            result["unlock_details"] = unlock_res
            if unlock_res.get("teams_auth") and unlock_res["teams_auth"].get("pin_submitted"):
                result["auth_handled"] = True
    except Exception as e:
        print(f"[configure_display_awake_policies] Note: {e}")
        result["error"] = str(e)
    return result

def parse_activities_by_display(dumpsys_output: str) -> Dict[int, Dict[str, Any]]:
    """
    Parses 'dumpsys activity activities' and organizes tasks, resumed activities,
    and package presence by display ID.
    """
    displays: Dict[int, Dict[str, Any]] = {}
    lines = dumpsys_output.splitlines()
    curr_disp = None
    curr_task_id = None

    for line in lines:
        sline = line.strip()
        disp_m = re.match(r'^(?:\s*)Display #(\d+)', sline)
        if disp_m:
            curr_disp = int(disp_m.group(1))
            if curr_disp not in displays:
                displays[curr_disp] = {
                    "file_preview_tasks": [],
                    "teams_tasks": [],
                    "resumed_activities": [],
                    "tasks": set()
                }
            curr_task_id = None
            continue

        if curr_disp is not None:
            # Terminate display scope when leaving the per-display tree
            if (
                sline.startswith("ActivityTaskSupervisor")
                or sline.startswith("Resumed activities in task")
                or sline.startswith("ResumedActivity:")
                or sline.startswith("Recent tasks:")
                or (not line.startswith(" ") and not line.startswith("\t") and not sline.startswith("Display #"))
            ):
                curr_disp = None
                continue

        if curr_disp is None:
            continue

        task_m = re.search(r'\bTask\{[0-9a-fA-F]+\s+#(\d+)', line)
        if task_m:
            curr_task_id = int(task_m.group(1))
            displays[curr_disp]["tasks"].add(curr_task_id)
            if "com.microsoft.teams" in line:
                if curr_task_id not in displays[curr_disp]["teams_tasks"]:
                    displays[curr_disp]["teams_tasks"].append(curr_task_id)

        act_m = re.search(r'ActivityRecord\{[0-9a-fA-F]+\s+u\d+\s+([^\s\}]+)(?:\s+t(\d+))?', line)
        if act_m:
            comp = act_m.group(1)
            tid = int(act_m.group(2)) if act_m.group(2) else curr_task_id
            if "FilePreviewActivity" in comp:
                if tid and tid not in displays[curr_disp]["file_preview_tasks"]:
                    displays[curr_disp]["file_preview_tasks"].append(tid)
            if "com.microsoft.teams" in comp:
                if tid and tid not in displays[curr_disp]["teams_tasks"]:
                    displays[curr_disp]["teams_tasks"].append(tid)

        top_m = re.search(r'topResumedActivity=ActivityRecord\{[0-9a-fA-F]+\s+u\d+\s+([^\s\}]+)', line)
        if top_m:
            displays[curr_disp]["resumed_activities"].append(top_m.group(1))

    return displays

async def enforce_markdown_only_on_desktop(
    serial: Optional[str] = None,
    ext_display_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Assures that the Markdown editor (FilePreviewActivity) ONLY opens and runs on the desktop mode screen
    (external display e.g. Display 11 / Display 8), without interfering with other apps on the phone screen
    (Display 0). Also handles Teams PIN prompts when visually confirmed on the desktop display.
    """
    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {
            "status": "mock",
            "phone_cleared": False,
            "desktop_markdown_active": True,
            "actions": []
        }

    ext_id = ext_display_id if (ext_display_id and ext_display_id > 0) else await detect_external_display_id(ser)
    if not ext_id or ext_id <= 0:
        return {
            "status": "no_external_display",
            "phone_cleared": False,
            "desktop_markdown_active": False,
            "actions": ["No external desktop display detected"]
        }

    actions = []
    phone_cleared = False
    from services import state
    # GUARD 1: If Desktop Mode is disabled by user, strictly do NOT interfere with phone screen!
    if not getattr(state, "desktop_mode_enabled", True):
        return {
            "status": "desktop_mode_disabled",
            "phone_cleared": False,
            "desktop_markdown_active": False,
            "actions": ["Desktop mode disabled; phone screen is untouched for user interaction"]
        }

    # GUARD 2: Query activity stack across all displays first
    act_res = await run_adb_shell("dumpsys activity activities", ser, timeout=3.5)
    out = act_res.get("stdout", "") if act_res.get("status") == "ok" else ""
    parsed = parse_activities_by_display(out)

    disp0_info = parsed.get(0, {"file_preview_tasks": [], "teams_tasks": [], "resumed_activities": []})
    ext_info = parsed.get(ext_id, {"file_preview_tasks": [], "teams_tasks": [], "resumed_activities": []})

    # Check if FilePreviewActivity is the topResumedActivity on Phone Display (Display 0)
    # Never send HOME to Display 0 if the user is using another app (e.g., Audible) on Display 0!
    ext_md_tasks_list = list(ext_info.get("file_preview_tasks", []))
    is_disp0_top_md = any("FilePreviewActivity" in r for r in disp0_info.get("resumed_activities", []))

    if is_disp0_top_md and not ext_md_tasks_list:
        await run_adb_shell("input -d 0 keyevent 3", ser, timeout=1.5)
        actions.append("Dispatched HOME keyevent to phone display #0 to background FilePreviewActivity")
        phone_cleared = True
        await asyncio.sleep(0.1)

    # Check status on External Desktop Display
    is_top_resumed_md = any("FilePreviewActivity" in r for r in ext_info.get("resumed_activities", []))
    is_ext_md_resumed = is_top_resumed_md or len(ext_md_tasks_list) > 0
    is_any_md_open = "FilePreviewActivity" in out

    if not is_ext_md_resumed and not is_any_md_open:
        await run_adb_shell(
            f"monkey -p com.microsoft.teams -c android.intent.category.LAUNCHER 1 --display {ext_id} >/dev/null 2>&1",
            ser,
            timeout=3.0
        )
        actions.append(f"Launched / focused Teams on desktop display #{ext_id}")
        await asyncio.sleep(0.3)
    elif ext_md_tasks_list and not is_top_resumed_md:
        top_tid = ext_md_tasks_list[0]
        await run_adb_shell(f"cmd activity task to-front {top_tid} >/dev/null 2>&1", ser, timeout=1.5)
        actions.append(f"Focused topmost FilePreviewActivity task #{top_tid} on display #{ext_id}")

    # Direct HID to desktop display and silently assure virtual keyboard is closed on desktop display
    await direct_hid_to_display(ser, target_mode="desktop", ext_display_id=ext_id)
    await dismiss_keyboard(ser, ext_id)

    return {
        "status": "ok",
        "display_id": ext_id,
        "phone_cleared": phone_cleared,
        "desktop_markdown_active": is_ext_md_resumed or is_any_md_open,
        "actions": actions,
    }

async def reposition_keyboard_assistant_overlay(
    serial: Optional[str] = None,
    ext_display_id: Optional[int] = None,
    target_x: int = 600,
    target_y: int = 140
) -> bool:
    """
    Checks if Gboard's floating assistant / suggestion bar (InputMethod window) is showing
    over the editor content on the external desktop display.
    If showing, drags the handle from default center (1050, 310) to the user's chosen title bar
    location (target_x=600, target_y=140, outlined in yellow) so it does not block editor text or line numbers.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return False
    ext_id = ext_display_id if (ext_display_id and ext_display_id > 0) else await detect_external_display_id(ser)
    try:
        win_chk = await run_adb_shell("dumpsys window | grep -E 'InputMethod.*shown=true|mIsFloatingLayer=true'", ser, timeout=1.2)
        out = win_chk.get("stdout", "")
        if "InputMethod" in out or "mIsFloatingLayer=true" in out:
            await run_adb_shell(f"input -d {ext_id} draganddrop 1050 310 {target_x} {target_y} 300 >/dev/null 2>&1", ser, timeout=1.5)
            await asyncio.sleep(0.15)
            return True
    except Exception as ex:
        logger.warning(f"Error repositioning keyboard assistant overlay: {ex}")
    return False


async def ensure_editor_content_focused(
    serial: Optional[str] = None,
    ext_display_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Guarantees active input focus and blinking cursor on the Teams editor content:
      1. Brings topmost Teams FilePreviewActivity task to the foreground ONLY if not already topResumedActivity
      2. Directs Mouse & Keyboard HID to the external desktop display
      3. Suppresses soft IMEs before tapping so touch input never pops up handwriting/soft keyboard
      4. Taps safe editor content coordinates on external display
      5. Settle delay to let focus register
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active ADB serial"}

    ext_id = ext_display_id if (ext_display_id and ext_display_id > 0) else await detect_external_display_id(ser)
    actions = []

    # 1. Check if FilePreviewActivity is already the topResumedActivity on ext_id;
    #    ONLY call task focus / to-front if it is NOT already the focused top activity!
    try:
        task_res = await run_adb_shell("dumpsys activity activities", ser, timeout=2.5)
        stdout = task_res.get("stdout", "")
        parsed = parse_activities_by_display(stdout)
        ext_info = parsed.get(ext_id, {"file_preview_tasks": [], "teams_tasks": [], "resumed_activities": []})
        is_top_resumed_md = any("FilePreviewActivity" in r for r in ext_info.get("resumed_activities", []))
        ext_md_tasks_list = list(ext_info.get("file_preview_tasks", []))
        if not is_top_resumed_md:
            if ext_md_tasks_list:
                tid = ext_md_tasks_list[0]
                await run_adb_shell(f"cmd activity task to-front {tid} >/dev/null 2>&1", ser, timeout=1.0)
                actions.append(f"Brought topmost FilePreviewActivity task #{tid} to front on display {ext_id}")
            else:
                m_t = re.search(r'ActivityRecord\{[0-9a-fA-F]+\s+u\d+\s+com\.microsoft\.teams/[^\s]*FilePreviewActivity\s+t(\d+)\}', stdout)
                if m_t:
                    tid = m_t.group(1)
                    await run_adb_shell(f"cmd activity task to-front {tid} >/dev/null 2>&1", ser, timeout=1.0)
                    actions.append(f"Focused Teams FilePreviewActivity task #{tid} on display {ext_id}")
    except Exception as te:
        actions.append(f"Task focus note: {te}")

    # 2. Suppress soft keyboard policy BEFORE tapping canvas so touch tap never opens Gboard/handwriting pad
    await dismiss_keyboard(ser, ext_id)

    # 3. Direct HID and tap safe editor content coordinates on external desktop display
    disp_w, disp_h = await get_display_dimensions(ser, ext_id)
    focus_x = int(disp_w * 0.25) if disp_w > 0 else 320
    focus_y = int(disp_h * 0.38) if disp_h > 0 else 380
    await direct_hid_to_display(ser, target_mode="desktop", ext_display_id=ext_id, focus_coords=[focus_x, focus_y])
    await run_adb_shell(f"input -d {ext_id} tap {focus_x} {focus_y} >/dev/null 2>&1", ser, timeout=1.0)
    actions.append(f"Directed HID and tapped editor content canvas at ({focus_x}, {focus_y}) on display {ext_id}")

    # 4. Suppress soft keyboard policy after tap
    await dismiss_keyboard(ser, ext_id)
    actions.append("Dismissed soft keyboard")

    await asyncio.sleep(0.18)
    return {
        "status": "ok",
        "display_id": ext_id,
        "actions": actions
    }


async def pulse_display_awake_heartbeat(serial: Optional[str] = None):
    ser = await get_active_adb_serial(serial)
    if not ser:
        return
    try:
        ext_id = await detect_external_display_id(ser)
        if ext_id and ext_id > 0:
            await run_adb_shell(f"input -d {ext_id} keyevent 224", ser)
    except Exception:
        pass

async def awake_keepalive_loop():
    while True:
        try:
            await asyncio.sleep(15.0)
            ser = await get_active_adb_serial()
            if ser:
                from services import state
                # If desktop mode is disabled, user is working on the phone screen: DO NOT INTERFERE!
                if not getattr(state, "desktop_mode_enabled", True):
                    await run_adb_shell(
                        "ime enable com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
                        "ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
                        "settings put secure show_ime_with_hard_keyboard 1",
                        ser,
                        timeout=1.5
                    )
                    continue

                # Only maintain power stay-awake policy and external display heartbeat in background;
                # NEVER auto-enter PINs or steal phone focus in the background keepalive loop!
                await configure_display_awake_policies(ser)
                await pulse_display_awake_heartbeat(ser)
                await dismiss_anr_dialogs(ser)
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

        # Inspect all InputMethod windows in WindowManager (Android 14/15/16 uses 'touchable region=' or 'touchableRegion=')
        win_chk = await run_adb_shell("dumpsys window windows", ser, timeout=2.0)
        win_out = win_chk.get("stdout", "")
        found_ime_blk = False
        for m_blk in re.finditer(r'Window\{[^\}]*InputMethod[^\}]*\}:.*?(?=Window\{|\Z)', win_out, re.DOTALL):
            blk = m_blk.group(0)
            if "mViewVisibility=0x0" not in blk:
                continue
            m_tr = re.search(r'touchable\s*region=SkRegion\(\((\d+),(\d+),(\d+),(\d+)\)\)', blk, re.IGNORECASE)
            if m_tr:
                found_ime_blk = True
                l, t, r, b = map(int, m_tr.groups())
                height = b - t
                if height > 200 and b > 600:
                    has_visible_window = True
                    break
        if not found_ime_blk:
            if "mInputShown=true" in out and "mViewVisibility=0x0" in win_out:
                has_visible_window = not ("Display #2" in win_out)

        _ime_visible_cache = {"val": has_visible_window, "ts": now}
        return has_visible_window
    except Exception:
        return False

async def dismiss_keyboard(serial: Optional[str] = None, display_id: Optional[int] = None) -> bool:
    """Closes soft keyboard on Android desktop display without disturbing phone display or editor content."""
    ser = await get_active_adb_serial(serial)
    if not ser: return True
    try:
        from services import state
        # If desktop mode is disabled, user is working on the phone screen: NEVER DISMISS OR INTERFERE WITH KEYBOARD!
        if not getattr(state, "desktop_mode_enabled", True):
            await run_adb_shell(
                "ime enable com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
                "ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME; "
                "settings put secure show_ime_with_hard_keyboard 1",
                ser,
                timeout=1.5
            )
            return True

        # Enforce hardware keyboard IME suppression and disable soft IME popups on external desktop displays
        # so touch taps in the markdown editor never trigger Gboard handwriting pad or voice IME bar.
        await run_adb_shell(
            "settings put secure show_ime_with_hard_keyboard 0; "
            "settings put secure accessibility_soft_keyboard_mode 1; "
            "ime disable com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME >/dev/null 2>&1; "
            "ime disable com.google.android.tts/com.google.android.apps.speech.tts.googletts.settings.asr.voiceime.VoiceInputMethodService >/dev/null 2>&1",
            ser,
            timeout=1.8
        )

        # Check if IME is still visible on screen!
        if not await is_ime_visible(ser, force_check=True):
            _ime_visible_cache["val"] = False
            _ime_visible_cache["ts"] = time.time()
            return True

        # IME is confirmed visible: dismiss cleanly via keyevent 111 (KEYCODE_ESCAPE)
        did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
        valid_d = sanitize_input_display_id(did)
        d_arg = f"-d {valid_d} " if (valid_d and valid_d > 0) else ""

        await run_adb_shell(f"input {d_arg}keyevent 111 >/dev/null 2>&1", ser, timeout=1.0)
        still_visible = await is_ime_visible(ser, force_check=True)
        _ime_visible_cache["val"] = still_visible
        _ime_visible_cache["ts"] = time.time()
        return not still_visible
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

async def dismiss_anr_dialogs(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Detects and dismisses Application Not Responding (ANR) or frozen app dialogs (e.g. 'Pixel Launcher isn't responding').
    If Pixel Launcher is unresponsive on the desktop display, force-stops and restarts it cleanly to immediately
    unfreeze input dispatch and return responsiveness to the Markdown editor.
    """
    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {"anr_detected": False, "actions": []}

    actions: List[str] = []
    try:
        # Check window manager for ANR dialogs across all displays
        chk = await run_adb_shell("dumpsys window windows | grep -iE 'Application Not Responding|isn\'t responding|Application Error|aerr'", ser, timeout=2.0)
        out = chk.get("stdout", "")

        proc_chk = await run_adb_shell("dumpsys activity processes | grep -iE 'not responding|anr'", ser, timeout=2.0)
        proc_out = proc_chk.get("stdout", "")

        has_anr = any(k in out for k in ["Application Not Responding", "isn't responding", "Application Error", "aerr"]) or ("not responding" in proc_out.lower())

        if not has_anr:
            return {"anr_detected": False, "actions": []}

        # 1. Check if Pixel Launcher is the unresponsive component
        is_launcher_anr = ("nexuslauncher" in out.lower()) or ("pixel launcher" in out.lower()) or ("nexuslauncher" in proc_out.lower())

        if is_launcher_anr:
            # Force stop Pixel Launcher. Android immediately restarts it cleanly in ~100ms.
            # This instantly dismisses the modal ANR dialog and unblocks touch/keyboard input dispatch!
            await run_adb_shell("am force-stop com.google.android.apps.nexuslauncher", ser, timeout=2.0)
            actions.append("Force-stopped unresponsive Pixel Launcher (auto-restarted cleanly by OS)")
            await asyncio.sleep(0.3)

        # 2. Broadcast system dialog dismissal
        await run_adb_shell("am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS", ser, timeout=1.5)
        actions.append("Broadcasted CLOSE_SYSTEM_DIALOGS")

        # 3. Dismiss on target display via coordinate taps and keyevents if dialog window persists
        did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
        disp_w, disp_h = await get_display_dimensions(ser, did)
        valid_d = sanitize_input_display_id(did)
        d_pfx = f"-d {valid_d} " if valid_d else ""

        # Android 14/15 landscape ANR dialog button coordinates:
        # Center X = disp_w // 2 (960 on 1080p)
        # "Close app" button is at ~41.5% height (448 on 1080p)
        # "Wait" button is at ~50.5% height (545 on 1080p)
        cx = disp_w // 2
        cy_close = int(disp_h * 0.415)
        cy_wait = int(disp_h * 0.505)

        # Tap 'Wait' / 'Close app'
        if is_launcher_anr:
            await run_adb_shell(f"input {d_pfx}tap {cx} {cy_close} >/dev/null 2>&1", ser, timeout=1.5)
            actions.append(f"Tapped 'Close app' button at ({cx}, {cy_close}) on display #{did}")
        else:
            await run_adb_shell(f"input {d_pfx}tap {cx} {cy_wait} >/dev/null 2>&1", ser, timeout=1.5)
            actions.append(f"Tapped 'Wait' button at ({cx}, {cy_wait}) on display #{did}")

        # Send Escape / Back keyevent to dismiss any lingering dialog overlay
        await run_adb_shell(f"input {d_pfx}keyevent 111 >/dev/null 2>&1", ser, timeout=1.0)
        await asyncio.sleep(0.15)

        # 4. Bring Markdown Viewer window back to front
        try:
            from services import kiosk_service
            tasks = await kiosk_service.find_teams_task_targets(ser)
            md_task = tasks.get("markdown_viewer_task_id")
            if md_task:
                await run_adb_shell(f"cmd activity task to-front {md_task}", ser, timeout=2.0)
                actions.append(f"Restored Markdown editor window (Task #{md_task}) to front")
        except Exception:
            pass

        return {
            "anr_detected": True,
            "launcher_anr": is_launcher_anr,
            "actions": actions
        }
    except Exception as e:
        return {"anr_detected": False, "error": str(e), "actions": actions}

def _detect_floating_teams_window_cv(
    cv_img: Optional[np.ndarray],
    disp_w: int = 1920,
    disp_h: int = 1080,
) -> Optional[Dict[str, Any]]:
    """
    Computer-vision detector for a floating freeform Teams window on the external desktop display
    (handles white skeleton loader, dark 'Your file is almost here' loading state, and light/dark editor).
    Returns dict with {'bounds': [bl, bt, br, bb], 'maximize_button': [mx, my], 'reason': str} if floating.
    """
    if cv_img is None or getattr(cv_img, "size", 0) == 0 or cv_img.shape[1] < 600:
        return None
    try:
        h_img, w_img = cv_img.shape[:2]
        scale_x = w_img / 1920.0
        scale_y = h_img / 1080.0
        gray_full = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)

        def _refine_max_btn(bl: int, bt: int, br: int, bb: int) -> list:
            mx = max(40, int(br - 117 * scale_x))
            my = max(15, int(bt + 31 * scale_y))
            x1 = max(0, min(w_img - 10, int(br - 155 * scale_x)))
            x2 = max(x1 + 10, min(w_img, int(br - 80 * scale_x)))
            y1 = max(0, min(h_img - 10, int(bt + 8 * scale_y)))
            y2 = max(y1 + 10, min(h_img, int(bt + 56 * scale_y)))
            roi = gray_full[y1:y2, x1:x2]
            if roi.size > 0:
                ys, xs = np.where(roi > 130)
                if len(xs) >= 6:
                    mx = int(np.mean(xs) + x1)
                    my = int(np.mean(ys) + y1)
            # Map from image coordinates to display coordinates if dimensions differ
            if w_img != disp_w or h_img != disp_h:
                mx = int(round(mx * (disp_w / float(w_img))))
                my = int(round(my * (disp_h / float(h_img))))
            return [mx, my]

        # 1. Check for bright white floating canvas surrounded by dark left/right desktop/folder margins (Screenshots 2 & 4)
        y_mid1, y_mid2 = int(h_img * 0.32), int(h_img * 0.72)
        left_strip = gray_full[y_mid1:y_mid2, :max(10, int(220 * scale_x))]
        right_strip = gray_full[y_mid1:y_mid2, max(0, w_img - int(220 * scale_x)):]
        center_strip = gray_full[y_mid1:y_mid2, int(w_img * 0.32):int(w_img * 0.68)]

        lum_left = float(np.mean(left_strip)) if left_strip.size > 0 else 0.0
        lum_right = float(np.mean(right_strip)) if right_strip.size > 0 else 0.0
        lum_center = float(np.mean(center_strip)) if center_strip.size > 0 else 0.0

        if lum_center > 140.0 and lum_left < 55.0 and lum_right < 55.0:
            col_means = np.mean(gray_full[y_mid1:y_mid2, :], axis=0)
            bright_cols = np.where(col_means > 135.0)[0]
            if len(bright_cols) >= int(300 * scale_x):
                bl = int(bright_cols[0])
                br = int(bright_cols[-1])
                row_means = np.mean(gray_full[:int(h_img * 0.88), bl:br], axis=1)
                bright_rows = np.where(row_means > 135.0)[0]
                canvas_top = int(bright_rows[0]) if len(bright_rows) > 0 else int(268 * scale_y)
                bb = int(bright_rows[-1]) if len(bright_rows) > 0 else int(888 * scale_y)
                # Floating window caption bar + file header bar sits ~95px above the white canvas top
                bt = max(int(60 * scale_y), canvas_top - int(95 * scale_y))
                # Refine bt by looking for the top edge of the dark-gray caption bar above canvas_top
                if canvas_top > int(60 * scale_y):
                    cap_profile = np.mean(gray_full[max(0, canvas_top - int(130 * scale_y)):canvas_top, bl:br], axis=1)
                    cap_rows = np.where((cap_profile >= 22.0) & (cap_profile <= 85.0))[0]
                    if len(cap_rows) >= int(20 * scale_y):
                        bt = max(0, canvas_top - int(130 * scale_y) + int(cap_rows[0]))
                bounds_disp = [
                    int(round(bl * (disp_w / float(w_img)))),
                    int(round(bt * (disp_h / float(h_img)))),
                    int(round(br * (disp_w / float(w_img)))),
                    int(round(bb * (disp_h / float(h_img)))),
                ]
                return {
                    "bounds": bounds_disp,
                    "maximize_button": _refine_max_btn(bl, bt, br, bb),
                    "reason": f"Floating white window canvas detected via CV ({bounds_disp[2] - bounds_disp[0]}x{bounds_disp[3] - bounds_disp[1]})",
                }

        # 2. Check for floating window inner 'Teams' titlebar or 'Your file is almost here' (Screenshot 3) via RapidOCR
        from ocr_engine import get_rapid_ocr
        ocr = get_rapid_ocr()
        if ocr is not None:
            res, _ = ocr(cv_img)
            inner_teams_box = None
            has_almost_here = False
            for box, txt, _score in (res or []):
                pts = np.array(box)
                tx1, ty1 = int(pts[:, 0].min()), int(pts[:, 1].min())
                tx2, ty2 = int(pts[:, 0].max()), int(pts[:, 1].max())
                clean_low = str(txt).strip().lower()
                if "almost here" in clean_low or "almosthere" in clean_low.replace(" ", ""):
                    has_almost_here = True
                # A fullscreen Teams window has 'Teams' at (x ~ 85, y ~ 50); a floating window has 'Teams' at x > 220, y > 105
                if "team" in clean_low and tx1 >= int(220 * scale_x) and int(105 * scale_y) <= ty1 <= int(360 * scale_y):
                    inner_teams_box = (tx1, ty1, tx2, ty2)
                    break

            if inner_teams_box is not None or has_almost_here:
                if inner_teams_box is not None:
                    tx1, ty1, tx2, ty2 = inner_teams_box
                    bl = max(int(200 * scale_x), tx1 - int(68 * scale_x))
                    bt = max(int(80 * scale_y), ty1 - int(22 * scale_y))
                else:
                    bl = int(536 * scale_x)
                    bt = int(172 * scale_y)
                # Find right edge br of the floating window caption bar via the 3 bright window controls ('_', '[]', 'X')
                cap_y1 = max(0, bt + int(8 * scale_y))
                cap_y2 = min(h_img, bt + int(54 * scale_y))
                cap_x1 = max(bl + int(300 * scale_x), int(1050 * scale_x))
                cap_x2 = min(w_img - int(180 * scale_x), int(1620 * scale_x))
                cap_roi = gray_full[cap_y1:cap_y2, cap_x1:cap_x2]
                br = int(1384 * scale_x)
                if cap_roi.size > 0:
                    _, xs_cap = np.where(cap_roi > 135)
                    if len(xs_cap) >= 8:
                        rightmost_icon_x = int(np.max(xs_cap)) + cap_x1
                        br = min(w_img - int(100 * scale_x), rightmost_icon_x + int(36 * scale_x))
                bb = int(888 * scale_y)
                bounds_disp = [
                    int(round(bl * (disp_w / float(w_img)))),
                    int(round(bt * (disp_h / float(h_img)))),
                    int(round(br * (disp_w / float(w_img)))),
                    int(round(bb * (disp_h / float(h_img)))),
                ]
                return {
                    "bounds": bounds_disp,
                    "maximize_button": _refine_max_btn(bl, bt, br, bb),
                    "reason": f"Floating Teams window caption bar detected via CV at bounds {bounds_disp}",
                }
    except Exception:
        pass
    return None


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

    # Match active topResumedActivity or visible Task hosting FilePreviewActivity (or any floating Teams task on Display #did):
    m_top = re.search(r'(?:topResumedActivity|resumedActivity|mResumedActivity)[:=]\s*ActivityRecord\{[0-9a-fA-F]+\s+u0\s+com\.microsoft\.teams/[^\s]*FilePreviewActivity\s+t(\d+)\}', search_block)
    tid: Optional[int] = None
    if m_top:
        tid = int(m_top.group(1))
    else:
        m_top_any_teams = re.search(r'(?:topResumedActivity|resumedActivity|mResumedActivity)[:=]\s*ActivityRecord\{[0-9a-fA-F]+\s+u0\s+com\.microsoft\.teams/[^\s]+\s+t(\d+)\}', search_block)
        if m_top_any_teams:
            tid = int(m_top_any_teams.group(1))
        else:
            m_vis = re.search(r'Task\{[0-9a-fA-F]+\s+#(\d+)\b[^\}]*visible=true[^\}]*\}.*?ActivityRecord\{[0-9a-fA-F]+\s+u0\s+com\.microsoft\.teams/[^\s]*FilePreviewActivity', search_block, re.DOTALL)
            if m_vis:
                tid = int(m_vis.group(1))
            else:
                m_act = re.search(r'ActivityRecord\{[0-9a-fA-F]+\s+u0\s+com\.microsoft\.teams/[^\s]*FilePreviewActivity\s+t(\d+)\}', search_block)
                if not m_act:
                    m_act = re.search(r'ActivityRecord\{[0-9a-fA-F]+\s+u0\s+com\.microsoft\.teams/[^\s]*FilePreviewActivity\s+t(\d+)\}', stdout)
                if m_act:
                    tid = int(m_act.group(1))

    mode = "unknown"
    bounds = [0, 0, disp_w, disp_h]

    def _resolve_maximize_btn(bnds: list, img_b: Optional[bytes]) -> list:
        bl, bt, br, bb = bnds
        mx = max(40, int(br - 117))
        my = max(15, int(bt + 31))
        if img_b and len(img_b) > 2000:
            try:
                cv_im = cv2.imdecode(np.frombuffer(img_b, np.uint8), cv2.IMREAD_COLOR)
                if cv_im is not None:
                    hi, wi = cv_im.shape[:2]
                    x1 = max(0, min(wi - 10, int(br - 155)))
                    x2 = max(x1 + 10, min(wi, int(br - 80)))
                    y1 = max(0, min(hi - 10, int(bt + 8)))
                    y2 = max(y1 + 10, min(hi, int(bt + 56)))
                    roi = cv_im[y1:y2, x1:x2]
                    if roi.size > 0:
                        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                        ys, xs = np.where(gray > 130)
                        if len(xs) >= 8:
                            mx = int(np.mean(xs) + x1)
                            my = int(np.mean(ys) + y1)
            except Exception:
                pass
        return [mx, my]

    if tid is not None:
        # Match task header line for FilePreviewActivity (with or without leading '*')
        m_head = re.search(rf'(?:\*\s+)?Task\{{[0-9a-fA-F]+\s+#{tid}\b[^}}]*?mode=(?P<mode>\w+)[^}}]*?\}}', search_block if search_block else stdout)
        if m_head:
            mode = m_head.group("mode").lower()

            # Isolate the task block to avoid picking up stale mGlobalConfig from other tasks
            task_pos = m_head.start()
            target_str = search_block if search_block else stdout
            next_task = re.search(r'\n\s*(?:\*\s+)?Task\{', target_str[task_pos + 1:])
            task_block = target_str[task_pos : task_pos + 1 + next_task.start()] if next_task else target_str[task_pos:]

            # Check direct bounds in task block: bounds=[l,t][r,b] or mBounds=Rect(l, t - r, b)
            m_b = re.search(r'bounds=\[(?P<bl>\d+),(?P<bt>\d+)\]\[(?P<br>\d+),(?P<bb>\d+)\]', task_block[:600])
            if m_b:
                bounds = [int(m_b.group("bl")), int(m_b.group("bt")), int(m_b.group("br")), int(m_b.group("bb"))]
            else:
                m_mb = re.search(r'mBounds=Rect\((?P<rl>\d+),\s*(?P<rt>\d+)\s*-\s*(?P<rr>\d+),\s*(?P<rb>\d+)\)', task_block[:600])
                if m_mb:
                    bounds = [int(m_mb.group("rl")), int(m_mb.group("rt")), int(m_mb.group("rr")), int(m_mb.group("rb"))]
                else:
                    m_cfg = re.search(r'(?:CurrentConfiguration|mOverrideConfig)=.*?winConfig=\{[^\}]*?mBounds=Rect\((?P<rl>\d+),\s*(?P<rt>\d+)\s*-\s*(?P<rr>\d+),\s*(?P<rb>\d+)\)', task_block)
                    if m_cfg:
                        bounds = [int(m_cfg.group("rl")), int(m_cfg.group("rt")), int(m_cfg.group("rr")), int(m_cfg.group("rb"))]
                    elif mode == "fullscreen":
                        bounds = [0, 0, disp_w, disp_h]

            w_span = bounds[2] - bounds[0]
            h_span = bounds[3] - bounds[1]

            # Check horizontal and vertical spans against display dimensions.
            # In Android Desktop Mode, windows are mode='freeform' even when maximized.
            is_horiz_max = (w_span >= disp_w - 60)
            is_vert_max = (h_span >= disp_h - 200)

            # If soft keyboard (IME) is visible, window height may temporarily be compressed;
            # do not treat an open keyboard on an otherwise maximized window as an unmaximized freeform window.
            if not is_vert_max and is_horiz_max:
                ime_up = await is_ime_visible(ser)
                if ime_up:
                    is_vert_max = True

            if mode == "freeform" and (not is_horiz_max or not is_vert_max):
                return {
                    "is_fullscreen": False,
                    "mode": mode,
                    "bounds": bounds,
                    "maximize_button": _resolve_maximize_btn(bounds, image_bytes),
                    "task_id": tid,
                    "display_id": did,
                    "display_dimensions": [disp_w, disp_h],
                    "reason": f"Activity task #{tid} is running in freeform window mode ({w_span}x{h_span})"
                }

            if not is_horiz_max or not is_vert_max:
                return {
                    "is_fullscreen": False,
                    "mode": mode,
                    "bounds": bounds,
                    "maximize_button": _resolve_maximize_btn(bounds, image_bytes),
                    "task_id": tid,
                    "display_id": did,
                    "display_dimensions": [disp_w, disp_h],
                    "reason": f"Activity task #{tid} bounds ({w_span}x{h_span}) are smaller than display viewport ({disp_w}x{disp_h})"
                }

            # Even if dumpsys task #tid appears maximized, check CV if image_bytes is provided in case a child dialog/floating window is open on top
            if image_bytes and len(image_bytes) > 2000:
                try:
                    cv_img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
                    cv_floating = _detect_floating_teams_window_cv(cv_img, disp_w, disp_h)
                    if cv_floating:
                        return {
                            "is_fullscreen": False,
                            "mode": "freeform_cv",
                            "bounds": cv_floating["bounds"],
                            "maximize_button": cv_floating["maximize_button"],
                            "task_id": tid,
                            "display_id": did,
                            "display_dimensions": [disp_w, disp_h],
                            "reason": cv_floating["reason"],
                        }
                except Exception:
                    pass

            return {
                "is_fullscreen": True,
                "mode": mode,
                "bounds": bounds,
                "task_id": tid,
                "display_id": did,
                "display_dimensions": [disp_w, disp_h],
                "reason": f"Activity task #{tid} occupies full display bounds"
            }

    # Computer Vision fallback / sanity check if image_bytes provided
    if image_bytes and len(image_bytes) > 2000:
        try:
            cv_img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
            if cv_img is not None and cv_img.shape[1] >= 600:
                cv_floating = _detect_floating_teams_window_cv(cv_img, disp_w, disp_h)
                if cv_floating:
                    return {
                        "is_fullscreen": False,
                        "mode": mode if mode != "unknown" else "windowed_margins",
                        "bounds": cv_floating["bounds"],
                        "maximize_button": cv_floating["maximize_button"],
                        "task_id": tid,
                        "display_id": did,
                        "display_dimensions": [disp_w, disp_h],
                        "reason": cv_floating["reason"],
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

async def maximize_floating_markdown_window(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    image_bytes: Optional[bytes] = None
) -> Dict[str, Any]:
    """
    Detects if the Teams Markdown Editor (FilePreviewActivity) is running in a floating
    freeform window (as occurs when opening a file from the Teams folder list) and clicks
    the Maximize ('[]') control in the floating window's top-right title bar to expand it
    to full screen.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"maximized": False, "was_floating": False, "reason": "No active device connected"}
    if "mock" in str(ser).lower() or "test" in str(ser).lower():
        return {"maximized": True, "was_floating": False, "actions": ["Verified full-screen window (mock)"]}

    did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
    snap = image_bytes or await capture_external_screenshot(ser, bypass_lock=True)
    fs_status = await is_editor_full_screen(ser, did, image_bytes=snap)
    actions = []

    if fs_status.get("is_fullscreen", True):
        return {
            "maximized": True,
            "was_floating": False,
            "fullscreen_status": fs_status,
            "actions": ["Markdown editor is already maximized to full screen"]
        }

    tid = fs_status.get("task_id")
    if tid:
        await run_adb_shell(f"am task focus {tid} >/dev/null 2>&1", ser)
        await asyncio.sleep(0.15)

    bnds = fs_status.get("bounds") or [536, 172, 1384, 888]
    default_max_btn = [max(40, int(bnds[2] - 117)), max(15, int(bnds[1] + 31))] if bnds[2] < 1800 else [1267, 203]
    max_btn = fs_status.get("maximize_button") or default_max_btn
    mx, my = int(max_btn[0]), int(max_btn[1])
    disp_pfx = f"-d {did} " if (did and did > 0) else ""

    # Click the Maximize [] button on the floating window title bar
    await run_adb_shell(f"input {disp_pfx}tap {mx} {my}", ser, timeout=2.5)
    actions.append(f"Tapped floating window Maximize [] control at ({mx}, {my}) on display #{did}")
    await asyncio.sleep(0.95)

    snap_after = await capture_external_screenshot(ser, bypass_lock=True)
    fs_after = await is_editor_full_screen(ser, did, image_bytes=snap_after)
    if not fs_after.get("is_fullscreen", True):
        if fs_after.get("maximize_button"):
            mx, my = int(fs_after["maximize_button"][0]), int(fs_after["maximize_button"][1])
        # Fallback: try mouse tap on the Maximize [] control
        await run_adb_shell(f"input {disp_pfx}mouse tap {mx} {my}", ser, timeout=2.5)
        actions.append(f"Dispatched fallback mouse tap on Maximize [] control at ({mx}, {my})")
        await asyncio.sleep(0.85)
        snap_after2 = await capture_external_screenshot(ser, bypass_lock=True)
        fs_after = await is_editor_full_screen(ser, did, image_bytes=snap_after2)

    await dismiss_keyboard(ser, did)
    return {
        "maximized": bool(fs_after.get("is_fullscreen", False)),
        "was_floating": True,
        "clicked_coords": [mx, my],
        "fullscreen_status": fs_after,
        "actions": actions
    }

async def auto_fix_viewport(serial: Optional[str] = None, display_id: Optional[int] = None) -> Dict[str, Any]:
    """
    High-speed viewport auto-fix & keyboard dismiss for external desktop displays:
    1. Sends AUTO_REFRESH_DISPLAY broadcast to MatrixCapture Kiosk app.
    2. Brings the editor task to front, and ONLY resizes if not already fullscreen
       (resizing an already-maximized FilePreviewActivity resets Teams to light mode and split view!).
    3. Dismisses any visible IME / soft keyboard cleanly on primary display (disp 0) without sending Escape to editor.
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

    # Do NOT execute cmd activity task resize on FilePreviewActivity; doing so corrupts the Chromium WebView
    # and forces Teams to reload, blanking out the editor and turning the canvas white.
    # Assure Markdown only opens and runs on desktop display and clear any phone screen conflicts
    await enforce_markdown_only_on_desktop(ser, display_id)

    cmd = (
        f"am broadcast -a com.matrixcapture.app.action.AUTO_REFRESH_DISPLAY --ei display_id {display_id} >/dev/null 2>&1; "
        f"settings put secure show_ime_with_hard_keyboard 0"
    )
    res = await run_adb_shell(cmd, ser, timeout=4.0)

    is_open = await is_ime_visible(ser, force_check=True)
    if is_open:
        await dismiss_keyboard(ser, display_id)
        is_open = await is_ime_visible(ser, force_check=True)

    # Check fullscreen status post-fix and maximize freeform floating window if needed
    fs_status = await is_editor_full_screen(ser, display_id)
    if not fs_status.get("is_fullscreen", True):
        max_res = await maximize_floating_markdown_window(ser, display_id)
        fs_status = max_res.get("fullscreen_status") or await is_editor_full_screen(ser, display_id)

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
    return await dismiss_keyboard(serial)

def get_available_device_profiles() -> List[Dict[str, Any]]:
    try:
        import db
        db_profs = db.get_device_profiles()
        if db_profs:
            return db_profs
    except Exception:
        pass
    return list(DEVICE_PROFILES.values())

async def extract_device_hardware_specs(serial: Optional[str] = None) -> Dict[str, Any]:
    """
    Dynamically extracts physical hardware parameters (DPI, resolution, display IDs, HID characteristics)
    directly from the active Android device over ADB with zero hardcoding.
    """
    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        return {
            "status": "mock",
            "serial": ser or "mock:5555",
            "model": "Simulated Device",
            "manufacturer": "Android",
            "product_name": "generic",
            "display_name": "Simulated Android Display (1920x1080 @ 220 DPI)",
            "display_id": 8,
            "display_width": 1920,
            "display_height": 1080,
            "physical_width": 1920,
            "physical_height": 1080,
            "physical_dpi": 220,
            "override_dpi": 220,
            "active_dpi": 220,
            "dpi_factor": 1.375,
            "lines_per_page": 24,
            "scroll_padding_lines": 4,
            "step_size": 28,
            "arrow_count_init": 28,
            "arrow_count_step": 28,
            "settle_delay_ms": 50,
            "hid_config": {
                "ctrl_keycode": 113,
                "home_keycode": 122,
                "end_keycode": 123,
                "down_keycode": 20,
                "settle_delay_ms": 50,
                "key_repeat_delay_ms": 15,
                "dispatch_method": "accelerated_batch",
                "scroll_padding_lines": 4,
                "arrow_count_init": 28,
                "arrow_count_step": 28
            }
        }

    m_res = await run_adb_shell("getprop ro.product.model", ser, timeout=2.0)
    model = (m_res.get("stdout") or "Android Device").strip()

    mfg_res = await run_adb_shell("getprop ro.product.manufacturer", ser, timeout=2.0)
    manufacturer = (mfg_res.get("stdout") or "").strip()

    dev_res = await run_adb_shell("getprop ro.product.device", ser, timeout=2.0)
    product_name = (dev_res.get("stdout") or "").strip()

    did = await detect_external_display_id(ser, force_refresh=True)

    phys_w, phys_h = 1920, 1080
    sz_res = await run_adb_shell(f"wm size -d {did}", ser, timeout=2.0)
    out_sz = sz_res.get("stdout", "") if sz_res.get("status") == "ok" else ""
    if m_phys := re.search(r'Physical size:\s*(\d+)x(\d+)', out_sz):
        d1, d2 = int(m_phys.group(1)), int(m_phys.group(2))
        phys_w, phys_h = max(d1, d2), min(d1, d2)
    width, height = phys_w, phys_h
    if m_ovr := re.search(r'Override size:\s*(\d+)x(\d+)', out_sz):
        d1, d2 = int(m_ovr.group(1)), int(m_ovr.group(2))
        width, height = max(d1, d2), min(d1, d2)

    phys_dpi, ovr_dpi = 160, 0
    den_res = await run_adb_shell(f"wm density -d {did}", ser, timeout=2.0)
    out_den = den_res.get("stdout", "") if den_res.get("status") == "ok" else ""
    if m_pd := re.search(r'Physical density:\s*(\d+)', out_den):
        phys_dpi = int(m_pd.group(1))
    if m_od := re.search(r'Override density:\s*(\d+)', out_den):
        ovr_dpi = int(m_od.group(1))
    active_dpi = ovr_dpi if ovr_dpi > 0 else (phys_dpi if phys_dpi > 0 else 220)
    dpi_factor = max(0.4, min(3.5, round(active_dpi / 160.0, 3)))

    virtual_h_dp = height / dpi_factor
    lpp = max(20, min(80, int(round(virtual_h_dp / 16.0))))
    scroll_padding = 4
    step_size = lpp + scroll_padding
    arrow_step = step_size
    arrow_init = arrow_step

    specs = {
        "status": "success",
        "serial": ser,
        "model": model,
        "manufacturer": manufacturer,
        "product_name": product_name,
        "display_name": f"{model} ({width}x{height} @ {active_dpi} DPI)",
        "display_id": did,
        "display_width": width,
        "display_height": height,
        "physical_width": phys_w,
        "physical_height": phys_h,
        "physical_dpi": phys_dpi,
        "override_dpi": ovr_dpi,
        "active_dpi": active_dpi,
        "dpi_factor": dpi_factor,
        "lines_per_page": lpp,
        "scroll_padding_lines": scroll_padding,
        "step_size": step_size,
        "arrow_count_init": arrow_init,
        "arrow_count_step": arrow_step,
        "settle_delay_ms": 50,
        "hid_config": {
            "ctrl_keycode": 113,
            "home_keycode": 122,
            "end_keycode": 123,
            "down_keycode": 20,
            "settle_delay_ms": 50,
            "key_repeat_delay_ms": 15,
            "dispatch_method": "accelerated_batch",
            "scroll_padding_lines": scroll_padding,
            "arrow_count_init": arrow_init,
            "arrow_count_step": arrow_step
        }
    }
    return specs

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

    available_profs = get_available_device_profiles()
    active_prof = next((p for p in available_profs if p.get("model_name") == current_device_model or p.get("id") == current_device_model or current_device_model in (p.get("id", "") + " " + p.get("model_name", ""))), None)
    if not active_prof and available_profs:
        active_prof = available_profs[0]

    try:
        from services import state
        state.active_device_serial = ser
        if ser:
            friendly_name = active_prof.get("name") if active_prof else ("Pixel 10 Pro XL" if current_device_model == "pixel_10" else "Pixel 8 Pro")
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
        "profile": active_prof or DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"]),
        "available_profiles": available_profs, "target_serial": target_adb_serial,
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

        base_cmds = [
            "settings put secure show_ime_with_hard_keyboard 0",
        ]
        if target_d and target_d > 0:
            base_cmds.append(f"input -d {target_d} keycombination -t 150 {key1} {key2}")
        else:
            base_cmds.append(f"input keycombination -t 150 {key1} {key2}")

        full_cmd = "; ".join(base_cmds)
        await run_adb_shell(full_cmd, ser, timeout=5.0)
        # Cleanly dismiss any IME popup triggered by caret repositioning
        await asyncio.sleep(0.08)
        if await is_ime_visible(ser):
            await dismiss_keyboard(ser, target_d)
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

    check_res = await run_adb_shell(f"wm density -d {did}", ser, timeout=1.8)
    out = check_res.get("stdout", "")
    current_dpi = 160
    if m_ovr := re.search(r'Override density:\s*(\d+)', out):
        current_dpi = int(m_ovr.group(1))
    elif m_phys := re.search(r'Physical density:\s*(\d+)', out):
        current_dpi = int(m_phys.group(1))

    # Preserve the display's existing density unless an explicit target_dpi was requested;
    # changing wm density while Teams is open recreates the activity surface and hides the Undo button!
    if target_dpi is None or target_dpi <= 0:
        target_dpi = current_dpi

    if current_dpi != target_dpi:
        await run_adb_shell(f"wm density {target_dpi} -d {did}", ser, timeout=2.0)
        current_dpi = target_dpi
        # Allow WindowManager and Pixel Launcher time to recreate display surfaces cleanly
        await asyncio.sleep(0.6)
        await dismiss_anr_dialogs(ser, did)

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


async def enforce_device_characteristics(
    serial: Optional[str] = None,
    target_dpi: Optional[int] = None,
    display_id: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    device_model: Optional[str] = None,
    lines_per_page: Optional[int] = None,
    step_size: Optional[int] = None,
    scroll_padding_lines: Optional[int] = None,
    arrow_count_init: Optional[int] = None,
    arrow_count_step: Optional[int] = None,
    hid_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Strictly verifies and enforces hardware characteristics (DPI scaling, display resolution, display ID, HID parameters)
    for the target device (Pixel 8 vs Pixel 10).
    Enforces wm density <target_dpi> -d <display_id> and inspects/verifies wm size.
    """
    ser = await get_active_adb_serial(serial)
    if not ser or "mock" in str(ser).lower():
        dpi = target_dpi or 220
        w = width or 1920
        h = height or 1080
        did = display_id or 8
        factor = max(0.4, min(3.5, round(dpi / 160.0, 3)))
        lpp = lines_per_page or 24
        pad = scroll_padding_lines if scroll_padding_lines is not None else 4
        step = step_size or (lpp + pad)
        a_step = arrow_count_step or step
        a_init = arrow_count_init or a_step
        h_cfg = hid_config or {}
        if isinstance(h_cfg, dict):
            h_cfg.setdefault("scroll_padding_lines", pad)
            h_cfg.setdefault("arrow_count_init", a_init)
            h_cfg.setdefault("arrow_count_step", a_step)
        try:
            from services import state
            state.orchestration_state["lines_per_page"] = lpp
            state.orchestration_state["step_size"] = step
            state.orchestration_state["scroll_padding_lines"] = pad
            state.orchestration_state["arrow_count_init"] = a_init
            state.orchestration_state["arrow_count_step"] = a_step
            state.orchestration_state["hid_config"] = h_cfg
        except Exception:
            pass
        return {
            "status": "ok",
            "mock": True,
            "display_id": did,
            "active_dpi": dpi,
            "dpi_factor": factor,
            "resolution": f"{w}x{h}",
            "width": w,
            "height": h,
            "lines_per_page": lpp,
            "step_size": step,
            "scroll_padding_lines": pad,
            "arrow_count_init": a_init,
            "arrow_count_step": a_step,
            "hid_config": h_cfg,
            "enforced": True
        }

    did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser, force_refresh=True)

    # 1. Resolve resolution from wm size -d <did>
    w_px, h_px = width or 1920, height or 1080
    size_res = await run_adb_shell(f"wm size -d {did}", ser, timeout=2.0)
    if size_res.get("status") == "ok":
        out_sz = size_res.get("stdout", "")
        if m_sz := re.search(r'(?:Physical|Override)\s*size:\s*(\d+)x(\d+)', out_sz):
            dim1, dim2 = int(m_sz.group(1)), int(m_sz.group(2))
            w_px, h_px = max(dim1, dim2), min(dim1, dim2)

    # 2. Resolve target DPI
    if not target_dpi or target_dpi <= 0:
        model_key = (device_model or current_device_model).lower()
        prof = DEVICE_PROFILES.get("pixel_10" if "10" in model_key else "pixel_8", DEVICE_PROFILES["pixel_8"])
        target_dpi = prof.get("default_dpi", 220)

    # 3. Enforce wm density <target_dpi> -d <did> only when outside calibrated tolerance
    check_res = await run_adb_shell(f"wm density -d {did}", ser, timeout=1.8)
    out_dpi = check_res.get("stdout", "")
    current_dpi = 160
    if m_ovr := re.search(r'Override density:\s*(\d+)', out_dpi):
        current_dpi = int(m_ovr.group(1))
    elif m_phys := re.search(r'Physical density:\s*(\d+)', out_dpi):
        val = int(m_phys.group(1))
        if val > 0: current_dpi = val

    if 190 <= current_dpi <= 240 and abs(current_dpi - target_dpi) <= 20:
        target_dpi = current_dpi

    if current_dpi != target_dpi:
        await run_adb_shell(f"wm density {target_dpi} -d {did}", ser, timeout=2.5)
        current_dpi = target_dpi
        # Allow WindowManager and Pixel Launcher time to recreate display surfaces cleanly
        await asyncio.sleep(0.6)
        await dismiss_anr_dialogs(ser, did)

    factor = max(0.4, min(3.5, round(current_dpi / 160.0, 3)))

    pad = scroll_padding_lines if scroll_padding_lines is not None else 4
    resolved_lpp = int(lines_per_page) if (lines_per_page and lines_per_page > 0) else 24
    resolved_step = int(step_size) if (step_size and step_size > 0) else (resolved_lpp + pad)
    resolved_arr_step = int(arrow_count_step) if (arrow_count_step and arrow_count_step > 0) else resolved_step
    resolved_arr_init = int(arrow_count_init) if (arrow_count_init and arrow_count_init > 0) else resolved_arr_step

    try:
        from services import state
        state.orchestration_state["lines_per_page"] = resolved_lpp
        state.orchestration_state["step_size"] = resolved_step
        state.orchestration_state["scroll_padding_lines"] = pad
        state.orchestration_state["arrow_count_init"] = resolved_arr_init
        state.orchestration_state["arrow_count_step"] = resolved_arr_step
        if hid_config:
            if isinstance(hid_config, dict):
                hid_config.setdefault("scroll_padding_lines", pad)
                hid_config.setdefault("arrow_count_init", resolved_arr_init)
                hid_config.setdefault("arrow_count_step", resolved_arr_step)
            state.orchestration_state["hid_config"] = hid_config
        state.orchestration_state["active_dpi"] = current_dpi
        state.orchestration_state["dpi_factor"] = factor
        state.orchestration_state["display_id"] = did

        state.latest_telemetry.setdefault("capture_telemetry", {})
        state.latest_telemetry["capture_telemetry"].update({
            "active_dpi": current_dpi,
            "dpi_factor": factor,
            "display_id": did,
            "resolution": f"{w_px}x{h_px}",
            "enforced_device": device_model or current_device_model,
            "lines_per_page": resolved_lpp,
            "scroll_padding_lines": pad,
            "arrow_count_init": resolved_arr_init,
            "arrow_count_step": resolved_arr_step
        })
    except Exception:
        pass

    return {
        "status": "ok",
        "display_id": did,
        "active_dpi": current_dpi,
        "dpi_factor": factor,
        "resolution": f"{w_px}x{h_px}",
        "width": w_px,
        "height": h_px,
        "lines_per_page": resolved_lpp,
        "step_size": resolved_step,
        "scroll_padding_lines": pad,
        "arrow_count_init": resolved_arr_init,
        "arrow_count_step": resolved_arr_step,
        "hid_config": hid_config or state.orchestration_state.get("hid_config", {}),
        "enforced": True
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
    from services import state
    chosen_method = method.lower()
    if chosen_method in ("auto", "arrow_down", "batched"):
        chosen_method = "arrow_down"

    shell_cmds = [
        "settings put secure show_ime_with_hard_keyboard 0"
    ]

    key_sequence = []
    prof_lpp = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_8", {"lines_per_page": 24})).get("lines_per_page", 24)
    page_stride = int(state.orchestration_state.get("viewport_lines") or prof_lpp or 24)

    if chosen_method in ("pagedown", "pageup", "page_up_down"):
        # Deterministic PageUp (92) / PageDown (93) + arrow micro-trimming (19/20)
        is_up = (delta_lines < 0) or (chosen_method == "pageup" and delta_lines >= 0)
        abs_delta = abs(delta_lines) if delta_lines != 0 else page_stride
        num_pages = max(1, min(15, abs_delta // max(1, page_stride)))
        rem = abs_delta - (num_pages * page_stride)
        page_key = "92" if is_up else "93"
        key_sequence = [page_key] * num_pages
        if rem > 0:
            trim_key = "19" if is_up else "20"
            key_sequence.extend([trim_key] * min(rem, 24))
        elif rem < 0:
            trim_key = "20" if is_up else "19"
            key_sequence.extend([trim_key] * min(abs(rem), 24))
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
        # Option B: Batched ADB DownArrow (20) or UpArrow (19) keyevents
        # Passing keyevents in a single shell command runs in < 1s without process-spawning overhead
        arrow_key = "19" if delta_lines < 0 else "20"
        count = max(1, min(abs(delta_lines), 200))
        key_sequence = [arrow_key] * count
        chunk_size = 70
        if count <= chunk_size:
            keys_str = " ".join(key_sequence)
            shell_cmds.append(f"input {disp_cmd}keyevent {keys_str} >/dev/null 2>&1")
        else:
            sub_cmds = []
            for i in range(0, count, chunk_size):
                chunk = key_sequence[i:i + chunk_size]
                sub_cmds.append(f"input {disp_cmd}keyevent {' '.join(chunk)} >/dev/null 2>&1")
            shell_cmds.append("; sleep 0.05; ".join(sub_cmds))

    full_cmd = "; ".join(shell_cmds)
    res = await run_adb_shell(full_cmd, ser, timeout=10.0)
    dur_ms = round((time.perf_counter() - t0) * 1000, 2)

    if chosen_method in ("pagedown", "pageup", "page_up_down"):
        ev_name = f"PageUp/Down({key_sequence[0]}) x{len(key_sequence)}"
    elif chosen_method == "swipe":
        ev_name = "TouchSwipe"
    else:
        ev_name = f"{'UpArrow(19)' if delta_lines < 0 else 'DownArrow(20)'} x{abs(delta_lines)}"
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


async def navigate_to_target_top_line(
    target_top: int,
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    current_top: Optional[int] = None,
    current_bottom: Optional[int] = None,
    lines_per_page: Optional[int] = None,
    use_page_keys: bool = True,
    max_attempts: int = 12,
    caller_node: str = "arrow_down",
    character_tracking_mode: Optional[bool] = None,
    character_tracking_line: Optional[int] = None,
    bottom_text_anchor: str = "",
    target_top_text_anchor: str = "",
    bottom_anchor_window: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Deterministically navigates the markdown editor viewport from ANY current gutter top/bottom range
    to place `target_top` on the very first line of the page (`actual_top == target_top`):
      1. If `target_top <= 1`: dispatches Ctrl+Home (113 + 122) or PageUp (92) to snap to Line 1.
      2. When far from `target_top` (`abs(diff) >= page_span` and `use_page_keys=True`):
         dispatches coarse PageDown (keycode 93) or PageUp (keycode 92) strides + arrow remainder.
      3. When within a page (`abs(diff) < page_span`) or refining after a coarse jump:
         dispatches batched DPAD_DOWN (keycode 20) or DPAD_UP (keycode 19) micro-trimming,
         automatically compensating for caret viewport traversal (`page_span - 1 + padding`) if a direction
         change or top/bottom caret unpinning occurs.
      4. When `character_tracking_mode` is active (a long wrapped line has no gutter numbers at the
         bottom of the page or across entire screens), locates `bottom_text_anchor + 1` (`target_top_text_anchor`)
         via row-slice OCR (`locate_character_anchor_row`) and uses Up/Down arrows to position `anchor + 1`
         at visual row 0 (`y ~ 309px`), transitioning back to Gutter Mode as soon as gutter numbers reappear.
    """
    from services import state
    import db
    from ocr_engine import (
        detect_top_line_from_image,
        find_gutter_numbers_cluster,
        detect_offline_editor_overlay,
        is_eof_reached_with_offline_awareness,
        locate_character_anchor_row,
        detect_line_wrap_state,
    )

    target_top = max(1, int(target_top))
    f_ocr_state = state.dag_state.get("nodes", {}).get("frame_ocr", {})
    char_mode = bool(
        character_tracking_mode
        if character_tracking_mode is not None
        else (
            f_ocr_state.get("character_tracking_mode")
            or state.orchestration_state.get("character_tracking_mode", False)
        )
    )
    tracked_ln = int(
        character_tracking_line
        or f_ocr_state.get("character_tracking_line")
        or state.orchestration_state.get("character_tracking_line")
        or max(1, target_top - 1)
    )
    bot_anchor = str(
        bottom_text_anchor
        or f_ocr_state.get("bottom_text_anchor")
        or state.orchestration_state.get("bottom_text_anchor")
        or ""
    )
    tgt_top_anchor = str(
        target_top_text_anchor
        or f_ocr_state.get("target_top_text_anchor")
        or state.orchestration_state.get("target_top_text_anchor")
        or ""
    )
    active_anchor_win = list(
        bottom_anchor_window
        or f_ocr_state.get("bottom_anchor_window")
        or state.orchestration_state.get("bottom_anchor_window")
        or []
    )
    ser = await get_active_adb_serial(serial)
    did = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
    valid_d = sanitize_input_display_id(did)
    disp_pfx = f"-d {valid_d} " if valid_d else ""

    active_proj = db.get_active_project() or {}
    target_total_lines = int(
        state.latest_telemetry.get("target_total_lines")
        or state.headless_telemetry_session.get("target_total_lines")
        or state.dag_state.get("nodes", {}).get("init_end", {}).get("total_lines")
        or active_proj.get("target_total_lines")
        or 0
    )

    prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_8", {"lines_per_page": 24}))
    page_span = int(
        lines_per_page
        or state.orchestration_state.get("viewport_lines")
        or prof.get("lines_per_page", 24)
        or 24
    )
    if current_top and current_bottom and current_bottom > current_top and 10 <= (current_bottom - current_top + 1) <= 75:
        page_span = current_bottom - current_top + 1

    padding = int(state.orchestration_state.get("scroll_padding_lines", 4) or 4)

    if not ser or "mock" in str(ser).lower():
        est_arrows = abs(target_top - (current_top or 1))
        actual_bot = target_top + page_span - 1
        state.orchestration_state["cursor_line"] = actual_bot
        state.orchestration_state["last_arrow_count"] = est_arrows
        state.latest_telemetry["current_top_line"] = target_top
        state.latest_telemetry["current_bottom_line"] = actual_bot
        return {
            "status": "ok",
            "reached": True,
            "target_top": target_top,
            "actual_top": target_top,
            "actual_bottom": actual_bot,
            "arrows_pressed": est_arrows,
            "page_keys_pressed": 0,
            "attempts": 1,
            "actions_taken": [f"Mock aligned viewport to top Ln {target_top} (Ln {target_top}..{actual_bot})"]
        }

    dpi_factor, _ = await fetch_current_display_dpi_factor(ser, did)
    await dismiss_keyboard(ser, valid_d)

    total_arrows = 0
    total_page_keys = 0
    actions_taken: List[str] = []
    actual_top: Optional[int] = current_top if (current_top and current_top > 0) else None
    actual_bot: Optional[int] = current_bottom if (current_bottom and current_bottom > 0) else None
    latest_snap: Optional[bytes] = None
    prev_top: Optional[int] = None
    prev_first_y: Optional[int] = None
    last_dir: Optional[str] = "down" if (actual_top is None or target_top >= actual_top) else "up"
    caret_pos: str = "top" if (target_top == 1 or actual_top == 1) else "bottom"
    stall_count = 0
    caret_span = 23  # The 1080p editor viewport always contains 24 visual rows (0..23 -> 23 row traversal)

    # Fast-path for target_top == 1 if currently far down the document
    if target_top == 1 and (actual_top is None or actual_top > page_span):
        await send_hid_keycombination(113, 122, serial=ser, caller_node=caller_node)
        await asyncio.sleep(0.35)
        await dismiss_keyboard(ser, valid_d)
        caret_pos = "top"
        actions_taken.append("Dispatched Ctrl+Home (113+122) to jump to Line 1")

    # Run up to max_attempts + 1 so that after attempt max_attempts dispatches keys,
    # one final post-keystroke verification screenshot is ALWAYS evaluated.
    for attempt in range(1, max_attempts + 2):
        snap = await capture_external_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True)
        if not snap:
            await asyncio.sleep(0.12)
            continue
        latest_snap = snap
        img = cv2.imdecode(np.frombuffer(snap, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            await asyncio.sleep(0.12)
            continue
        h_img = img.shape[0]
        scale_y = h_img / 1080.0

        det_top, meta = detect_top_line_from_image(img, target_top=target_top, dpi_factor=dpi_factor)
        gutter = find_gutter_numbers_cluster(img, dpi_factor=dpi_factor)
        row_pitch = float(meta.get("avg_pitch") or (27.0 * scale_y))
        top_row_y = float(meta.get("effective_top_row_y") or (304.0 * scale_y))
        max_top_row_y = int(meta.get("max_top_row_y") or (top_row_y + max(20.0 * scale_y, 0.75 * row_pitch)))
        wrapped_top_tolerance_y = int(round(top_row_y + 2.25 * row_pitch))

        first_g = gutter[0][1] if gutter else det_top
        first_y = gutter[0][0] if gutter else int(top_row_y)
        last_g = gutter[-1][1] if gutter else meta.get("bottom_gutter_line", 0)
        last_y = gutter[-1][0] if gutter else int(923 * scale_y)

        cur_t = first_g if (first_g and first_g > 0) else det_top
        if last_g and cur_t and last_g >= cur_t and 4 <= (last_g - cur_t + 1) <= 75:
            cur_bot = last_g
        else:
            cur_bot = (cur_t or target_top) + page_span - 1

        is_exact_or_wrapped_top = (
            (bool(gutter) and first_g == target_top and first_y <= max_top_row_y)
            or (not gutter and det_top == target_top and not char_mode)
        )
        # Safe contiguous overlap: after >=2 adjustment attempts, if cur_t is 1..5 lines above target_top
        # and the viewport includes target_top..cur_bot with forward progress, ZERO lines are skipped!
        is_contiguous_overlap = (
            not char_mode
            and attempt >= 3
            and bool(cur_t and cur_t > 0)
            and max(1, target_top - 5) <= cur_t <= target_top
            and cur_bot >= target_top + 2
            and (current_top is None or cur_t > current_top or target_top <= 2)
        )

        # Auto-activate Character Tracking Mode if called in Gutter Mode while the current viewport's bottom line
        # wraps off the bottom of the screen (trailing blank gutter rows below last_g) and target_top > last_g.
        if (
            not char_mode
            and character_tracking_mode is not False
            and attempt == 1
            and gutter
            and last_g
            and target_top > last_g
            and (target_top - last_g) <= 2
            and last_y < int(850 * scale_y)
        ):
            wrap_auto = detect_line_wrap_state(img, dpi_factor=dpi_factor, gutter=gutter)
            if wrap_auto.get("is_bottom_wrapped") and (
                wrap_auto.get("bottom_text_anchor") or wrap_auto.get("target_top_text_anchor")
            ):
                char_mode = True
                tracked_ln = int(last_g)
                bot_anchor = str(wrap_auto.get("bottom_text_anchor") or bot_anchor)
                tgt_top_anchor = str(wrap_auto.get("target_top_text_anchor") or tgt_top_anchor)
                active_anchor_win = list(wrap_auto.get("bottom_anchor_window") or active_anchor_win)
                state.orchestration_state.update({
                    "character_tracking_mode": True,
                    "character_tracking_line": tracked_ln,
                    "bottom_text_anchor": bot_anchor,
                    "target_top_text_anchor": tgt_top_anchor,
                    "bottom_anchor_window": active_anchor_win,
                })
                actions_taken.append(
                    f"Auto-activated Character Tracking Mode on wrapped Line {tracked_ln} (last gutter y={last_y}px, {wrap_auto.get('trailing_blank_gutter_rows')} wrapped rows)"
                )

        # Character Tracking Mode: when previous page ended inside a wrapped line (or current page has no gutter),
        # locate target_top_text_anchor (bottom_text_anchor + 1) and position it at visual row 0 (y ~ 309px).
        should_use_char_track = bool(
            char_mode
            or (character_tracking_mode is not False and not gutter and abs(target_top - tracked_ln) <= 2)
        )
        if should_use_char_track and (bot_anchor or tgt_top_anchor or any(active_anchor_win)) and not is_exact_or_wrapped_top:
            loc = locate_character_anchor_row(
                img,
                bottom_anchor=bot_anchor,
                target_top_anchor=tgt_top_anchor,
                bottom_anchor_window=active_anchor_win,
                dpi_factor=dpi_factor,
            )
            if loc.get("enriched_anchor_window"):
                active_anchor_win = loc["enriched_anchor_window"]
                if len(active_anchor_win) > 4 and active_anchor_win[4]:
                    tgt_top_anchor = active_anchor_win[4]

            if loc.get("found") and loc.get("target_top_row_idx") is not None:
                k_row = int(loc["target_top_row_idx"])
                if k_row == 0:
                    if latest_snap:
                        modal_res = await resolve_and_dismiss_mini_modals(
                            serial=ser,
                            display_id=valid_d,
                            image_bytes=latest_snap,
                            caller_node=caller_node,
                        )
                        if modal_res.get("detected") and modal_res.get("snapshot_bytes"):
                            latest_snap = modal_res["snapshot_bytes"]
                            actions_taken.extend(modal_res.get("actions_taken", []))

                    row0_txt = str(loc.get("current_row0_text") or "")
                    if gutter and first_g and first_g > 0:
                        # Gutter numbers reappeared! Keep character_tracking_mode=True if first_g is below row 0
                        # (so Node 3 & Node 5 capture the leading wrapped rows above first_g without scrolling first_g to row 0)
                        # or if the bottom of this page is also wrapped.
                        wrap_now = detect_line_wrap_state(img, dpi_factor=dpi_factor, gutter=gutter)
                        still_wrapped_bot = bool(wrap_now.get("is_bottom_wrapped", False))
                        has_leading_wrapped_rows = bool(first_y > max_top_row_y)
                        keep_char_mode_for_capture = bool(still_wrapped_bot or has_leading_wrapped_rows)
                        actual_top = int(first_g)
                        actual_bot = int(last_g or actual_top)
                        state.orchestration_state["cursor_line"] = actual_bot if caret_pos == "bottom" else actual_top
                        state.sync_alignment_gutter_lines(
                            actual_top,
                            actual_bot,
                            character_tracking_mode=keep_char_mode_for_capture,
                            anchor_preview=row0_txt,
                        )
                        actions_taken.append(
                            f"Character Tracking aligned anchor+1 at row 0 (conf={loc.get('confidence')}) and detected Gutter Line {actual_top}..{actual_bot} on check {attempt}"
                        )
                        return {
                            "status": "ok",
                            "reached": True,
                            "character_tracking_mode": keep_char_mode_for_capture,
                            "transitioned_to_gutter": True,
                            "matched_anchor_text": row0_txt,
                            "target_top": actual_top,
                            "actual_top": actual_top,
                            "actual_bottom": actual_bot,
                            "arrows_pressed": total_arrows,
                            "page_keys_pressed": total_page_keys,
                            "attempts": min(attempt, max_attempts),
                            "snapshot_bytes": latest_snap,
                            "actions_taken": actions_taken,
                        }
                    else:
                        # Entire page is a wrapped continuation of tracked_ln
                        actual_top = tracked_ln
                        actual_bot = tracked_ln
                        state.orchestration_state["cursor_line"] = tracked_ln
                        state.sync_alignment_gutter_lines(
                            tracked_ln,
                            tracked_ln,
                            character_tracking_mode=True,
                            anchor_preview=row0_txt,
                        )
                        actions_taken.append(
                            f"Character Tracking verified anchor+1 at row 0 for wrapped Line {tracked_ln} (conf={loc.get('confidence')}) on check {attempt}"
                        )
                        return {
                            "status": "ok",
                            "reached": True,
                            "character_tracking_mode": True,
                            "is_wrapped_continuation": True,
                            "matched_anchor_text": row0_txt,
                            "target_top": tracked_ln,
                            "actual_top": tracked_ln,
                            "actual_bottom": tracked_ln,
                            "arrows_pressed": total_arrows,
                            "page_keys_pressed": total_page_keys,
                            "attempts": min(attempt, max_attempts),
                            "snapshot_bytes": latest_snap,
                            "actions_taken": actions_taken,
                        }

                if attempt > max_attempts:
                    break

                cur_dir = "down" if k_row > 0 else "up"
                arrow_key = "20" if k_row > 0 else "19"
                needs_traverse = (
                    (cur_dir == "up" and caret_pos == "bottom")
                    or (cur_dir == "down" and caret_pos == "top")
                )
                if k_row >= 21 and not needs_traverse:
                    step_cnt = 20
                else:
                    step_cnt = abs(k_row) + (caret_span if needs_traverse else 0)
                step_cnt = max(1, min(60, step_cnt))
                keys = " ".join([arrow_key] * step_cnt)
                total_arrows += step_cnt
                await run_adb_shell(f"input {disp_pfx}keyevent {keys} >/dev/null 2>&1", ser)
                caret_pos = "bottom" if cur_dir == "down" else "top"
                last_dir = cur_dir
                actions_taken.append(
                    f"Attempt {attempt} [CharTrack Ln {tracked_ln}]: anchor+1 at row {k_row} (conf={loc.get('confidence')}) -> dispatched {step_cnt} {'Down(20)' if cur_dir == 'down' else 'Up(19)'} arrows (traverse={needs_traverse})"
                )
                await asyncio.sleep(0.18)
                await dismiss_keyboard(ser, valid_d)
                continue

        if is_exact_or_wrapped_top or is_contiguous_overlap:
            # Ensure no mini-modal / toast popup contaminates the aligned viewport frame
            if latest_snap:
                modal_res = await resolve_and_dismiss_mini_modals(
                    serial=ser,
                    display_id=valid_d,
                    image_bytes=latest_snap,
                    caller_node=caller_node
                )
                if modal_res.get("detected") and modal_res.get("snapshot_bytes"):
                    latest_snap = modal_res["snapshot_bytes"]
                    actions_taken.extend(modal_res.get("actions_taken", []))
            actual_top = target_top if is_exact_or_wrapped_top else int(cur_t)
            if last_g and last_g >= actual_top and (last_g - actual_top) <= 75:
                actual_bot = last_g
                page_span = actual_bot - actual_top + 1
            else:
                actual_bot = actual_top + page_span - 1

            wrap_check = detect_line_wrap_state(img, dpi_factor=dpi_factor, gutter=gutter)
            still_char_mode = bool(wrap_check.get("is_bottom_wrapped", False))
            state.orchestration_state["cursor_line"] = actual_bot if caret_pos == "bottom" else actual_top
            if total_arrows > 0 or total_page_keys > 0:
                state.orchestration_state["last_arrow_count"] = total_arrows + (total_page_keys * caret_span)
            state.sync_alignment_gutter_lines(actual_top, actual_bot, character_tracking_mode=still_char_mode)
            actions_taken.append(
                f"Verified top Line {actual_top} at y={first_y}px (range {actual_top}..{actual_bot}"
                + (", contiguous overlap" if is_contiguous_overlap and not is_exact_or_wrapped_top else "")
                + f") on check {attempt}"
            )
            return {
                "status": "ok",
                "reached": True,
                "character_tracking_mode": still_char_mode,
                "transitioned_to_gutter": bool(char_mode and not still_char_mode),
                "contiguous_overlap": bool(is_contiguous_overlap and not is_exact_or_wrapped_top),
                "target_top": target_top,
                "actual_top": actual_top,
                "actual_bottom": actual_bot,
                "arrows_pressed": total_arrows,
                "page_keys_pressed": total_page_keys,
                "attempts": min(attempt, max_attempts),
                "snapshot_bytes": latest_snap,
                "actions_taken": actions_taken
            }

        if not cur_t or cur_t <= 0:
            # Viewport has 0 gutter numbers (overshot into a massive wrapped line without anchor match):
            # Back up with UpArrows (19) so the gutter numbers above the wrapped line reappear!
            if attempt <= max_attempts:
                backup_cnt = (caret_span + 18) if caret_pos == "bottom" else 18
                keys = " ".join(["19"] * backup_cnt)
                total_arrows += backup_cnt
                await run_adb_shell(f"input {disp_pfx}keyevent {keys} >/dev/null 2>&1", ser)
                caret_pos = "top"
                last_dir = "up"
                actions_taken.append(
                    f"Attempt {attempt}: No gutter numbers visible (overshot into wrapped block) -> backed up {backup_cnt} Up(19) arrows toward Ln {target_top}"
                )
            await dismiss_keyboard(ser, valid_d)
            await asyncio.sleep(0.18)
            continue

        actual_top = cur_t
        actual_bot = cur_bot
        if last_g and last_g >= cur_t and 4 <= (last_g - cur_t + 1) <= 75:
            page_span = last_g - cur_t + 1

        # Check whether the viewport actually moved on the previous attempt
        viewport_moved = (
            prev_top is not None
            and (cur_t != prev_top or (prev_first_y is not None and abs(first_y - prev_first_y) >= 14))
        )
        if prev_top is not None:
            if viewport_moved:
                stall_count = 0
                caret_pos = "bottom" if last_dir == "down" else "top"
            else:
                stall_count += 1

        tail_lines_txt = ""
        if state.document_lines:
            tail_keys = sorted(state.document_lines.keys())[-8:]
            tail_lines_txt = "\n".join(str(state.document_lines.get(k, "")) for k in tail_keys)

        # Physical scroll-stall at EOF when DAG 1 total_lines overestimated the true document length:
        # Must only trigger after editor refocus (stall_count >= 2) has already been attempted and
        # subsequent downward scrolls still cannot advance (stall_count >= 5), AND actual_bot is near
        # target_total_lines (within 15% or <= 4000 lines when CODESCAN_FILE_END is at the very last line).
        near_expected_eof = (
            target_total_lines <= 0
            or actual_bot >= target_total_lines - 4
            or (
                actual_bot >= int(target_total_lines * 0.85)
                and (target_total_lines - actual_bot) <= 4500
                and "CODESCAN_FILE_END" in tail_lines_txt
            )
        )
        scroll_stalled_at_bottom = bool(
            target_top > cur_t
            and (total_arrows > 0 or total_page_keys > 0)
            and stall_count >= 5
            and near_expected_eof
        )

        # Multi-Situation EOF Detection (after down-arrow verification):
        # 1. Standard EOF: actual_bot >= target_total_lines (e.g. 32,881 / 32,881)
        # 2. 'Offline' Editor Overlay EOF: actual_bot is 1..4 lines short of target_total_lines
        #    (specifically 3 lines short, e.g. 32,878 vs 32,881) while the '[icon] Offline' badge
        #    is covering the bottom 3 gutter lines and down-arrow has been verified.
        # 3. Physical Scroll-Stall EOF: downward scrolling stalls at actual_bot when DAG 1 total_lines
        #    was inaccurate, automatically correcting DAG 1 total_lines and completing the project.
        if (
            target_top > 1
            and (
                (target_total_lines > 0 and actual_bot >= target_total_lines - 4 and (total_arrows > 0 or total_page_keys > 0 or actual_bot >= target_total_lines))
                or scroll_stalled_at_bottom
            )
        ):
            offline_det = bool(meta.get("offline_overlay_detected"))
            offline_info = meta.get("offline_info") or {}
            if not offline_det and (actual_bot < target_total_lines or scroll_stalled_at_bottom):
                offline_info = detect_offline_editor_overlay(img, use_ocr=True)
                offline_det = bool(offline_info.get("detected") or offline_info.get("badge_detected"))

            is_eof, eof_reason = is_eof_reached_with_offline_awareness(
                bottom_line=actual_bot,
                total_lines=target_total_lines,
                offline_detected=offline_det,
                tail_text=tail_lines_txt,
                scroll_stalled_at_bottom=scroll_stalled_at_bottom,
            )
            if is_eof:
                reconciled = state.reconcile_eof_total_lines_and_complete_project(
                    actual_eof_line=actual_bot,
                    eof_reason=eof_reason,
                )
                corrected_total = int(reconciled.get("target_total_lines") or actual_bot)
                occluded_cnt = max(0, corrected_total - actual_bot)
                state.orchestration_state["cursor_line"] = corrected_total
                if total_arrows > 0 or total_page_keys > 0:
                    state.orchestration_state["last_arrow_count"] = total_arrows + (total_page_keys * caret_span)
                state.latest_telemetry["current_top_line"] = actual_top
                state.latest_telemetry["current_bottom_line"] = corrected_total
                actions_taken.append(f"EOF verified after DownArrow check: {eof_reason} ✔")
                return {
                    "status": "ok",
                    "reached": True,
                    "eof_reached": True,
                    "offline_overlay_detected": offline_det,
                    "offline_info": offline_info,
                    "occluded_tail_lines": occluded_cnt,
                    "eof_reason": eof_reason,
                    "corrected_total_lines": corrected_total,
                    "target_top": target_top,
                    "actual_top": actual_top,
                    "actual_bottom": corrected_total,
                    "arrows_pressed": total_arrows,
                    "page_keys_pressed": total_page_keys,
                    "attempts": min(attempt, max_attempts),
                    "snapshot_bytes": latest_snap,
                    "actions_taken": actions_taken,
                }

        # If this was the final post-keystroke verification check, break out
        if attempt > max_attempts:
            break

        # Fast-path on attempt 1 when target_top is much closer to EOF (Ctrl+End) or Line 1 (Ctrl+Home) than to cur_t
        if attempt == 1 and use_page_keys:
            if (
                target_total_lines > 500
                and target_top > cur_t + 1500
                and 0 <= (target_total_lines - target_top) < (target_top - cur_t - 500)
            ):
                await send_hid_keycombination(113, 123, serial=ser, caller_node=caller_node)
                await asyncio.sleep(0.35)
                await dismiss_keyboard(ser, valid_d)
                caret_pos = "bottom"
                last_dir = "up"
                prev_top = cur_t
                prev_first_y = first_y
                actions_taken.append(
                    f"Attempt 1: Dispatched Ctrl+End (113+123) shortcut from Ln {cur_t} to EOF (~Ln {target_total_lines}) before PageUp to Ln {target_top}"
                )
                continue
            elif cur_t - target_top > 1500 and (target_top + 500) < (cur_t - target_top):
                await send_hid_keycombination(113, 122, serial=ser, caller_node=caller_node)
                await asyncio.sleep(0.35)
                await dismiss_keyboard(ser, valid_d)
                caret_pos = "top"
                last_dir = "down"
                prev_top = cur_t
                prev_first_y = first_y
                actions_taken.append(
                    f"Attempt 1: Dispatched Ctrl+Home (113+122) shortcut from Ln {cur_t} to Line 1 before PageDown to Ln {target_top}"
                )
                continue

        # Determine exact visual row delta and scroll direction using visible gutter Y-coordinates
        target_in_gutter = [y for (y, n) in gutter if n == target_top] if gutter else []
        rows_span_visible = max(1, int(round((last_y - first_y) / row_pitch))) if (gutter and len(gutter) >= 2) else caret_span
        avg_rows_per_line = (
            max(1.0, min(4.0, float(rows_span_visible) / float(max(1, last_g - first_g))))
            if (gutter and last_g > first_g)
            else 1.0
        )

        if target_in_gutter:
            y_t = target_in_gutter[0]
            cur_dir = "down"
            visual_rows_diff = max(1, int(round((y_t - top_row_y) / row_pitch)))
            diff = max(1, target_top - cur_t)
        elif gutter and last_g and target_top > last_g:
            cur_dir = "down"
            diff = target_top - cur_t
            rows_to_last = max(1, int(round((last_y - top_row_y) / row_pitch)))
            rem_lines = target_top - last_g
            if rem_lines == 1:
                visual_rows_diff = rows_to_last + 1
            else:
                visual_rows_diff = rows_to_last + max(rem_lines, int(round(rem_lines * avg_rows_per_line)))
        elif target_top > cur_t:
            cur_dir = "down"
            diff = target_top - cur_t
            visual_rows_diff = max(diff, int(round(diff * avg_rows_per_line)))
        else:
            # target_top < first_g (overshot downward; need to scroll UP)
            cur_dir = "up"
            lines_above = max(1, cur_t - target_top)
            diff = -lines_above
            if lines_above == 1 and first_y > max_top_row_y:
                # Only the top visual row(s) of target_top scrolled above top_row_y while its wrapped tail is still visible
                visual_rows_diff = 1
            else:
                visual_rows_diff = max(lines_above, int(round(lines_above * avg_rows_per_line)))

        # If stalled twice, tap inside the safe code area (never x=80 y=305 which can hit Undo/Redo if toolbar shifted)
        if stall_count >= 2:
            tap_x = int(350 * (img.shape[1] / 1920.0))
            tap_y = int(top_row_y + 10) if cur_dir == "up" else min(int(930 * scale_y), max(int(868 * scale_y), int(last_y)))
            await run_adb_shell(f"input {disp_pfx}tap {tap_x} {tap_y} >/dev/null 2>&1", ser)
            await asyncio.sleep(0.06)
            await dismiss_keyboard(ser, valid_d)
            caret_pos = "top" if cur_dir == "up" else "bottom"
            actions_taken.append(f"Refocused editor code area at ({tap_x}, {tap_y}) [{caret_pos}] after stall on Ln {cur_t}")

        # Decide between coarse PageUp/PageDown (92/93) and fine Arrow Up/Down (19/20)
        if use_page_keys and visual_rows_diff >= 36 and abs(diff) >= page_span and stall_count == 0 and not target_in_gutter:
            num_pages = max(1, min(60, visual_rows_diff // 24))
            rem_rows = visual_rows_diff - (num_pages * 24)
            page_key = "93" if cur_dir == "down" else "92"
            trim_key = "20" if cur_dir == "down" else "19"
            keys = [page_key] * num_pages
            total_page_keys += num_pages
            if 0 < rem_rows <= 12:
                keys.extend([trim_key] * rem_rows)
                total_arrows += rem_rows
            if len(keys) <= 30:
                cmd_str = f"input {disp_pfx}keyevent {' '.join(keys)} >/dev/null 2>&1"
            else:
                chunks = [keys[i:i + 30] for i in range(0, len(keys), 30)]
                cmd_str = "; sleep 0.04; ".join(
                    f"input {disp_pfx}keyevent {' '.join(ch)} >/dev/null 2>&1" for ch in chunks
                )
            await run_adb_shell(cmd_str, ser, timeout=8.0)
            caret_pos = "bottom" if cur_dir == "down" else "top"
            actions_taken.append(
                f"Attempt {attempt}: Coarse {'PageDown(93)' if cur_dir == 'down' else 'PageUp(92)'} x{num_pages}"
                + (f" + {rem_rows} arrows" if 0 < rem_rows <= 12 else "")
                + f" from Ln {cur_t} toward Ln {target_top} (rows={visual_rows_diff})"
            )
        else:
            arrow_key = "20" if cur_dir == "down" else "19"
            needs_caret_traverse = (
                (cur_dir == "up" and caret_pos == "bottom")
                or (cur_dir == "down" and caret_pos == "top")
                or stall_count == 1
            )
            if stall_count >= 2 and use_page_keys and visual_rows_diff >= 12:
                pkey = "93" if cur_dir == "down" else "92"
                total_page_keys += 1
                await run_adb_shell(f"input {disp_pfx}keyevent {pkey} >/dev/null 2>&1", ser)
                actions_taken.append(f"Attempt {attempt}: Unstall {'PageDown(93)' if cur_dir == 'down' else 'PageUp(92)'} from Ln {cur_t}")
                prev_top = cur_t
                prev_first_y = first_y
                last_dir = cur_dir
                caret_pos = "bottom" if cur_dir == "down" else "top"
                await asyncio.sleep(0.20)
                await dismiss_keyboard(ser, valid_d)
                continue
            elif cur_t == 1 and cur_dir == "down" and attempt == 1:
                adjust_step = min(70, caret_span + visual_rows_diff + padding)
            elif needs_caret_traverse:
                adjust_step = min(70, caret_span + visual_rows_diff)
            else:
                adjust_step = min(55, visual_rows_diff)

            adjust_step = max(1, adjust_step)
            keys = " ".join([arrow_key] * adjust_step)
            total_arrows += adjust_step
            await run_adb_shell(cmd_str := f"input {disp_pfx}keyevent {keys} >/dev/null 2>&1", ser)
            caret_pos = "bottom" if cur_dir == "down" else "top"
            actions_taken.append(
                f"Attempt {attempt}: Dispatched {adjust_step} {'Down(20)' if cur_dir == 'down' else 'Up(19)'} arrows from Ln {cur_t} (y={first_y}) toward Ln {target_top} (visual_rows={visual_rows_diff}, traverse={needs_caret_traverse})"
            )

        prev_top = cur_t
        prev_first_y = first_y
        last_dir = cur_dir
        await asyncio.sleep(0.18)
        await dismiss_keyboard(ser, valid_d)

    return {
        "status": "error",
        "reached": False,
        "target_top": target_top,
        "actual_top": actual_top,
        "actual_bottom": actual_bot,
        "arrows_pressed": total_arrows,
        "page_keys_pressed": total_page_keys,
        "attempts": max_attempts,
        "snapshot_bytes": latest_snap,
        "actions_taken": actions_taken
    }


def detect_mini_modal_popups(image_or_bytes: Any) -> Dict[str, Any]:
    """
    High-speed visual detector (<4ms) for Teams floating mini-modals / toast pop-ups
    (e.g. 'Something went wrong so we couldn\'t upload...', 'Unable to auto-save. Please save manually...').
    Identifies each floating modal bounding box (yellow box in reference) and computes the exact
    pixel center (close_x, close_y) of its right-side 'X' close control (red circle in reference).
    """
    try:
        if image_or_bytes is None:
            return {"detected": False, "count": 0, "popups": [], "close_targets": []}
        if isinstance(image_or_bytes, (bytes, bytearray)):
            if len(image_or_bytes) < 1000:
                return {"detected": False, "count": 0, "popups": [], "close_targets": []}
            arr = np.frombuffer(image_or_bytes, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        elif isinstance(image_or_bytes, np.ndarray):
            img = image_or_bytes
        else:
            return {"detected": False, "count": 0, "popups": [], "close_targets": []}

        if img is None or img.size == 0:
            return {"detected": False, "count": 0, "popups": [], "close_targets": []}

        h, w = img.shape[:2]
        sx = w / 1920.0
        sy = h / 1080.0

        # Search within editor document body (excluding top toolbar y<260 and bottom system bar y>972)
        y1, y2 = int(round(260 * sy)), int(round(972 * sy))
        x1, x2 = int(round(380 * sx)), int(round(1540 * sx))
        roi = img[y1:y2, x1:x2]
        if roi.size == 0:
            return {"detected": False, "count": 0, "popups": [], "close_targets": []}

        b = roi[:, :, 0].astype(np.int16)
        g = roi[:, :, 1].astype(np.int16)
        r = roi[:, :, 2].astype(np.int16)

        # Teams mini-modal / toast card surface is neutral dark gray BGR ~(48, 49, 50)
        # contrasting against the dark editor canvas BGR ~(31, 31, 31) and orange/amber syntax text.
        card_mask = (
            (np.abs(r - b) <= 8)
            & (np.abs(r - g) <= 8)
            & (g >= 42)
            & (g <= 58)
        ).astype(np.uint8) * 255

        kw = max(15, int(round(45 * sx)))
        kh = max(5, int(round(12 * sy)))
        closed = cv2.morphologyEx(card_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (kw, kh)))

        ow = max(40, int(round(180 * sx)))
        oh = max(12, int(round(32 * sy)))
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (ow, oh)))

        num_labels, _, stats, _ = cv2.connectedComponentsWithStats(opened)
        popups: List[Dict[str, Any]] = []

        for i in range(1, num_labels):
            rx, ry, rw, rh, area = stats[i]
            if rw < int(260 * sx) or rw > int(960 * sx):
                continue
            if rh < int(36 * sy) or rh > int(230 * sy):
                continue

            abs_x = x1 + int(rx)
            abs_y = y1 + int(ry)
            abs_w = int(rw)
            abs_h = int(rh)

            card_crop = img[abs_y:abs_y + abs_h, abs_x:abs_x + abs_w]
            cb = card_crop[:, :, 0].astype(np.int16)
            cg = card_crop[:, :, 1].astype(np.int16)
            cr = card_crop[:, :, 2].astype(np.int16)

            # Check for left red circular error/status icon
            red_mask = ((cr - cg > 60) & (cr > 165) & (cb < 155)).astype(np.uint8)
            red_pixels = int(np.sum(red_mask))
            red_center = None
            if red_pixels >= max(20, int(80 * sx * sy)):
                rys, rxs = np.where(red_mask > 0)
                red_center = [
                    int(round(abs_x + float(np.mean(rxs)))),
                    int(round(abs_y + float(np.mean(rys))))
                ]

            # Locate the 'X' close control in the right-side region of the mini-modal
            x_search_l = max(0, abs_w - int(round(65 * sx)))
            x_search_r = max(x_search_l + 1, abs_w - int(round(12 * sx)))
            y_search_t = max(0, int(round(10 * sy)))
            y_search_b = min(abs_h, int(round(60 * sy)))

            x_patch = card_crop[y_search_t:y_search_b, x_search_l:x_search_r]
            # Geometric fallback center for the 'X' button (35px from right edge, 31px from top edge at 1080p)
            close_x = abs_x + abs_w - int(round(35 * sx))
            close_y = abs_y + int(round(31 * sy))
            x_glyph_pixels = 0

            if x_patch.size > 0:
                gray_patch = cv2.cvtColor(x_patch, cv2.COLOR_BGR2GRAY)
                ys, xs = np.where(gray_patch > 110)
                x_glyph_pixels = int(len(xs))
                if x_glyph_pixels >= max(8, int(15 * sx * sy)):
                    close_x = int(round(abs_x + x_search_l + float(np.mean(xs))))
                    close_y = int(round(abs_y + y_search_t + float(np.mean(ys))))

            min_red = max(35, int(110 * sx * sy))
            min_x_glyph = max(8, int(18 * sx * sy))
            if red_pixels >= min_red or x_glyph_pixels >= min_x_glyph:
                conf = min(0.99, round(0.65 + (0.20 if red_pixels >= min_red else 0.0) + (0.14 if x_glyph_pixels >= min_x_glyph else 0.0), 2))
                popups.append({
                    "bbox": [abs_x, abs_y, abs_w, abs_h],
                    "close_button": [close_x, close_y],
                    "red_icon_center": red_center,
                    "red_icon_pixels": red_pixels,
                    "x_glyph_pixels": x_glyph_pixels,
                    "confidence": conf
                })

        # Also detect top notification / call banner (e.g. Microsoft Teams meeting banner at y=95..180)
        # which pushes the editor toolbar down by ~90px and has a right-side 'X' close button around (1892, 149).
        try:
            tb_y1, tb_y2 = int(round(98 * sy)), int(round(178 * sy))
            tb_x1, tb_x2 = int(round(200 * sx)), int(round(1500 * sx))
            tb_strip = img[tb_y1:tb_y2, tb_x1:tb_x2]
            if tb_strip.size > 0:
                tb_b = tb_strip[:, :, 0].astype(np.int16)
                tb_g = tb_strip[:, :, 1].astype(np.int16)
                indigo_ratio = float(np.mean((tb_b >= 55) & ((tb_b - tb_g) >= 15)))
                if indigo_ratio >= 0.45:
                    xb_x1, xb_x2 = int(round(1862 * sx)), min(w, int(round(1914 * sx)))
                    xb_y1, xb_y2 = int(round(105 * sy)), int(round(175 * sy))
                    xb_patch = img[xb_y1:xb_y2, xb_x1:xb_x2]
                    cx_top = int(round(1892 * sx))
                    cy_top = int(round(145 * sy))
                    x_cnt = 0
                    if xb_patch.size > 0:
                        xb_gray = cv2.cvtColor(xb_patch, cv2.COLOR_BGR2GRAY)
                        xys, xxs = np.where(xb_gray > 150)
                        x_cnt = int(len(xxs))
                        if x_cnt >= max(15, int(30 * sx * sy)):
                            cx_top = int(round(xb_x1 + float(np.mean(xxs))))
                            cy_top = int(round(xb_y1 + float(np.mean(xys))))
                    if x_cnt >= max(15, int(30 * sx * sy)):
                        popups.append({
                            "bbox": [0, tb_y1, w, tb_y2 - tb_y1],
                            "close_button": [cx_top, cy_top],
                            "red_icon_center": None,
                            "red_icon_pixels": 0,
                            "x_glyph_pixels": x_cnt,
                            "confidence": 0.96,
                            "banner_type": "teams_top_call_banner"
                        })
        except Exception:
            pass

        # Sort top-to-bottom by Y coordinate so closing upper toast first never shifts lower toast coordinates
        popups.sort(key=lambda p: p["bbox"][1])
        for idx, p_item in enumerate(popups, start=1):
            p_item["index"] = idx

        return {
            "detected": len(popups) > 0,
            "count": len(popups),
            "popups": popups,
            "close_targets": [p["close_button"] for p in popups]
        }
    except Exception as e:
        print(f"[detect_mini_modal_popups] Error: {e}")
        return {"detected": False, "count": 0, "popups": [], "close_targets": [], "error": str(e)}


async def resolve_and_dismiss_mini_modals(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    image_bytes: Optional[bytes] = None,
    caller_node: str = "frame_acquire",
    max_passes: int = 4
) -> Dict[str, Any]:
    """
    Detects any floating mini-modal / pop-up dialogs over the Teams Markdown editor before screen capture,
    fires a real-time detection & diagnostic trace event, invokes a touch/mouse click resolver over each
    mini-modal's 'X' close control, and re-acquires a clean uncontaminated screenshot.
    """
    from services import state
    t0 = time.perf_counter()
    ser = await get_active_adb_serial(serial)
    is_mock = bool(ser and "mock" in str(ser).lower())

    current_snap = image_bytes
    if not current_snap and ser and not is_mock:
        current_snap = await capture_external_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True)

    det = detect_mini_modal_popups(current_snap)
    if not det.get("detected"):
        return {
            "detected": False,
            "resolved": True,
            "popups_detected": 0,
            "popups_dismissed": 0,
            "clicks_dispatched": [],
            "actions_taken": [],
            "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
            "snapshot_bytes": current_snap
        }

    initial_popups = det.get("popups", [])
    initial_count = len(initial_popups)
    disp_id = display_id if (display_id and display_id > 0) else (await detect_external_display_id(ser) if ser else 3)
    valid_d = sanitize_input_display_id(disp_id) or (disp_id if (disp_id and disp_id > 0) else 3)
    disp_pfx = f"-d {valid_d} " if (valid_d and valid_d > 0) else ""

    coords_summary = ", ".join([f"X@({p['close_button'][0]},{p['close_button'][1]}) [box={p['bbox']}]" for p in initial_popups])
    det_msg = f"Detected {initial_count} mini-modal pop-up(s) obscuring editor in '{caller_node}': {coords_summary}"
    print(f"[MiniModalResolver] {det_msg}")

    # 1. Fire real-time detection event over WebSocket & record in Diagnostics Trace
    try:
        state.record_diagnostics_trace_event(
            event_type="MINI_MODAL_DETECTED",
            reason=det_msg,
            node_id=caller_node,
            recovery_action=f"Invoking touch/click resolver on X control(s): {[p['close_button'] for p in initial_popups]}"
        )
        await state.ws_manager.broadcast({
            "type": "mini_modal_detected",
            "caller_node": caller_node,
            "display_id": valid_d,
            "count": initial_count,
            "popups": initial_popups,
            "message": det_msg,
            "timestamp": datetime.now().isoformat()
        })
    except Exception:
        pass

    clicks_dispatched: List[Dict[str, Any]] = []
    actions_taken: List[str] = []

    if is_mock or not ser:
        return {
            "detected": True,
            "resolved": False,
            "popups_detected": initial_count,
            "popups_dismissed": 0,
            "clicks_dispatched": [],
            "actions_taken": [det_msg],
            "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
            "snapshot_bytes": current_snap
        }

    # 2. Iteratively click the 'X' close button on each detected mini-modal (top-to-bottom) and re-verify
    remaining_popups = initial_popups
    for pass_idx in range(1, max_passes + 1):
        if not remaining_popups:
            break

        # Click each detected popup's 'X' button from top to bottom so lower popups don't shift before being clicked
        cmd_parts = []
        for p_item in remaining_popups:
            cx, cy = p_item["close_button"]
            if pass_idx == 1:
                cmd_parts.append(f"input {disp_pfx}tap {cx} {cy} >/dev/null 2>&1")
                method_used = "touch_tap"
            else:
                # Fallback: dispatch both mouse click and touch tap on subsequent passes
                cmd_parts.append(f"input mouse {disp_pfx}tap {cx} {cy} >/dev/null 2>&1; input {disp_pfx}tap {cx} {cy} >/dev/null 2>&1")
                method_used = "mouse_and_touch_tap"

            clicks_dispatched.append({
                "pass": pass_idx,
                "popup_index": p_item.get("index", 1),
                "bbox": p_item["bbox"],
                "x": cx,
                "y": cy,
                "method": method_used
            })
            actions_taken.append(
                f"Pass {pass_idx}: Clicked mini-modal #{p_item.get('index', 1)} close 'X' at ({cx}, {cy}) [bbox={p_item['bbox']}]"
            )

        full_cmd = "; sleep 0.10; ".join(cmd_parts)
        await run_adb_shell(full_cmd, ser, timeout=4.0)
        await asyncio.sleep(0.22)

        # Ensure clicking inside the WebView did not pop up the soft keyboard
        await dismiss_keyboard(ser, valid_d)

        # Capture a fresh uncached screenshot to verify all mini-modals are gone
        fresh_snap = await capture_external_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True)
        if fresh_snap and len(fresh_snap) > 2000:
            current_snap = fresh_snap
            _update_frame_cache(ser, "desktop", current_snap)

        re_det = detect_mini_modal_popups(current_snap)
        remaining_popups = re_det.get("popups", [])
        if not re_det.get("detected"):
            break

    resolved = len(remaining_popups) == 0
    dismissed_count = max(0, initial_count - len(remaining_popups))
    dur_ms = round((time.perf_counter() - t0) * 1000, 2)

    res_msg = (
        f"Dismissed {dismissed_count}/{initial_count} mini-modal pop-up(s) via 'X' close control in {dur_ms}ms ✔"
        if resolved else
        f"Partially dismissed mini-modals ({len(remaining_popups)} remaining after {max_passes} passes)"
    )
    print(f"[MiniModalResolver] {res_msg}")

    # 3. Broadcast resolution event & record in Diagnostics Trace
    try:
        state.record_diagnostics_trace_event(
            event_type="MINI_MODAL_RESOLVED" if resolved else "MINI_MODAL_WARNING",
            reason=det_msg,
            node_id=caller_node,
            recovery_action=f"{res_msg} • Clicks: {[(c['x'], c['y']) for c in clicks_dispatched]}"
        )
        await state.ws_manager.broadcast({
            "type": "mini_modal_resolved",
            "caller_node": caller_node,
            "display_id": valid_d,
            "resolved": resolved,
            "popups_detected": initial_count,
            "popups_dismissed": dismissed_count,
            "clicks_dispatched": clicks_dispatched,
            "duration_ms": dur_ms,
            "message": res_msg,
            "timestamp": datetime.now().isoformat()
        })
    except Exception:
        pass

    return {
        "detected": True,
        "resolved": resolved,
        "popups_detected": initial_count,
        "popups_dismissed": dismissed_count,
        "remaining_popups": remaining_popups,
        "clicks_dispatched": clicks_dispatched,
        "actions_taken": actions_taken,
        "duration_ms": dur_ms,
        "snapshot_bytes": current_snap
    }



async def check_and_update_alignment(
    serial: Optional[str] = None,
    use_cached_only: bool = False,
    skip_classifiers: bool = False,
) -> Dict[str, Any]:
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
        max_age = 15.0 if use_cached_only else 1.5
        if cached_d.get("raw_png") and (time.time() - cached_d.get("ts", 0.0) < max_age):
            snap_bytes = cached_d["raw_png"]
        elif not use_cached_only:
            snap_bytes = await capture_external_screenshot(active_serial, bypass_lock=True)

        if snap_bytes:
            # Sync to frame cache so stream generator shares this fresh frame
            if not use_cached_only:
                _update_frame_cache(active_serial, "desktop", snap_bytes)

            dpi_factor, _ = await fetch_current_display_dpi_factor(active_serial)
            res = await asyncio.to_thread(detect_teams_markdown_alignment, snap_bytes, None, dpi_factor)
            res["device_connected"] = True
            res["timestamp"] = datetime.now().isoformat()
            if not skip_classifiers:
                try:
                    from classifiers.registry import classifier_registry
                    from classifiers.base import ClassifierContext
                    disp_id = await detect_external_display_id(active_serial)
                    classifier_ctx = ClassifierContext(serial=active_serial, display_id=disp_id, image_bytes=snap_bytes, alignment_data=res)
                    await classifier_registry.evaluate_all(classifier_ctx)
                    c_report = classifier_registry.get_status_report()
                    # Telemetry monitor loop is strictly passive/read-only: record classifier report without tactile interference
                    res["classifiers"], res["classifier_issues"] = c_report, c_report.get("issues", [])
                    if c_report.get("has_issues"): state.latest_telemetry["classifier_issues"] = c_report.get("issues", [])
                except Exception as ce: print(f"[check_and_update_alignment] Classifier error: {ce}")

            res = state.sanitize_for_json(res)
            state.latest_alignment_status.clear()
            state.latest_alignment_status.update(res)
            if getattr(state, "capture_loop_running", False):
                if (res.get("first_line_number") or 0) > 0:
                    try: state.latest_telemetry["current_top_line"] = int(res["first_line_number"])
                    except Exception: pass
                if (res.get("last_line_number") or 0) > 0:
                    try: state.latest_telemetry["current_bottom_line"] = int(res["last_line_number"])
                    except Exception: pass
            if not res.get("is_aligned", False) and state.orchestration_state.get("status") == "RUNNING":
                state.orchestration_state.update({"status": "PAUSED", "step_label": "PAUSED: teams markdown not aligned"})
                state.latest_telemetry["status_message"] = f"⚠️ teams markdown not aligned ({res.get('reason')})"

            # Automatically switch active bundle part from QUEUED -> ACTIVE when Live Desktop detects a different open part (e.g. part2.md)
            try:
                if res.get("is_multipart") and res.get("part_number"):
                    await state.auto_switch_project_if_open_part_changed(res)
                mp_sync = state.sync_multipart_state_from_alignment()
            except Exception as mp_err:
                print(f"[check_and_update_alignment] Multipart sync note: {mp_err}")
                mp_sync = state.multipart_bundle_state

            await state.ws_manager.broadcast({
                "type": "alignment_status", "alignment": state.latest_alignment_status,
                "data": state.latest_alignment_status, "classifiers": res.get("classifiers", {}),
                "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry,
                "multipart_state": mp_sync,
            })
        elif not use_cached_only:
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
    from services import state
    loop_tick = 0
    while True:
        try:
            await asyncio.sleep(2.5)
            loop_tick += 1
            if getattr(state, "headless_mode", False):
                continue
            serial = await get_active_adb_serial()
            if not serial:
                continue
            if getattr(state, "capture_loop_running", False):
                # While capture loop is running in visual mode, refresh alignment from cached frame
                # (zero ADB capture contention) immediately if currently unaligned or every 2nd tick (~5s).
                if not state.latest_alignment_status.get("is_aligned") or (loop_tick % 2 == 0):
                    await check_and_update_alignment(serial, use_cached_only=True, skip_classifiers=True)
                continue
            await check_and_update_alignment(serial)
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
