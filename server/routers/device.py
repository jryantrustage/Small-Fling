from fastapi import APIRouter, HTTPException, Query, Response, Request
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any
from pathlib import Path
import json
import time

import db
from models import (
    DeviceSelectRequest, AdbCommandRequest, AdbConnectRequest, AdbPairRequest,
    DeviceProfileRequest, ApplyCharacteristicsRequest
)
from services import adb_service as adb
from services.state import ws_manager, latest_telemetry, orchestration_state

router = APIRouter(tags=["device"])

@router.get("/api/device")
@router.get("/api/device/info")
async def get_device_info():
    return await adb.get_device_info()

@router.get("/api/device/profiles")
async def get_device_profiles_endpoint():
    profs = db.get_device_profiles()
    if not profs:
        profs = list(adb.DEVICE_PROFILES.values())
    return {"status": "success", "profiles": profs}

@router.post("/api/device/profiles")
async def upsert_device_profile_endpoint(req: DeviceProfileRequest):
    data = req.dict()
    saved = db.upsert_device_profile(data)
    await ws_manager.broadcast({"type": "device_profile_updated", "profile": saved})
    return {"status": "success", "profile": saved}

@router.delete("/api/device/profiles/{profile_id}")
async def delete_device_profile_endpoint(profile_id: str):
    ok = db.delete_device_profile(profile_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Profile not found")
    await ws_manager.broadcast({"type": "device_profile_deleted", "profile_id": profile_id})
    return {"status": "success", "deleted": True}

@router.get("/api/device/extract-specs")
async def extract_device_specs_endpoint(serial: Optional[str] = None):
    specs = await adb.extract_device_hardware_specs(serial)
    return {"status": "ok", "specs": specs}

@router.post("/api/device/apply-characteristics")
async def apply_device_characteristics_endpoint(req: ApplyCharacteristicsRequest):
    res = await adb.enforce_device_characteristics(
        serial=req.serial,
        target_dpi=req.target_dpi,
        display_id=req.display_id,
        width=req.display_width,
        height=req.display_height,
        device_model=req.device_model,
        lines_per_page=req.lines_per_page,
        step_size=req.step_size,
        scroll_padding_lines=req.scroll_padding_lines,
        arrow_count_init=req.arrow_count_init,
        arrow_count_step=req.arrow_count_step,
        hid_config=req.hid_config
    )
    info = await adb.get_device_info()
    await ws_manager.broadcast({"type": "device_selected", "data": info, "device_info": info, "orchestration": orchestration_state, "telemetry": latest_telemetry})
    return res

@router.post("/api/device/select")
async def select_device_api(req: DeviceSelectRequest):
    if req.device_model:
        dev = req.device_model.lower().strip()
        if "8" in dev:
            adb.current_device_model = "pixel_8"
        elif "10" in dev:
            adb.current_device_model = "pixel_10"

    # Reset active serial cache so new selection immediately activates
    adb._active_serial_cache = None
    adb._active_serial_cache_ts = 0.0

    devs_res = await adb.list_adb_devices()
    connected_devs = devs_res.get("devices", [])

    matched = None
    # 1. If explicit serial provided and matches an active device
    if req.serial and req.serial.strip():
        ser_in = req.serial.strip()
        matched = next((d for d in connected_devs if d["serial"] == ser_in or ser_in in d["serial"]), None)
        # If port changed, match by IP prefix
        if not matched and ":" in ser_in:
            ip_pref = ser_in.split(":")[0]
            matched = next((d for d in connected_devs if d["serial"].startswith(ip_pref)), None)

    # 2. If no match yet, find connected device matching selected model
    if not matched:
        keys = ["pixel_10", "mustang", "frankel"] if adb.current_device_model == "pixel_10" else ["pixel_8", "husky", "shiba"]
        matched = next((d for d in connected_devs if any(k in (d.get("model", "") + " " + d.get("displayName", "") + " " + d.get("raw", "")).lower() for k in keys)), None)

    # 3. If still not matched, attempt wireless auto-connect for this model
    if not matched:
        ser_for_model = await adb.connect_device_for_model(adb.current_device_model)
        if ser_for_model:
            adb.target_adb_serial = ser_for_model

    if matched:
        adb.target_adb_serial = matched["serial"]
        m = (matched.get("model", "") + " " + matched.get("raw", "")).lower()
        if any(k in m for k in ["pixel_8", "husky", "shiba"]):
            adb.current_device_model = "pixel_8"
        elif any(k in m for k in ["pixel_10", "mustang", "frankel"]):
            adb.current_device_model = "pixel_10"

    active_ser = await adb.get_active_adb_serial(adb.target_adb_serial, force_refresh=True)
    if active_ser:
        adb.target_adb_serial = active_ser
        adb._active_serial_cache = active_ser
        adb._active_serial_cache_ts = time.time()
        try:
            from services import state
            state.active_device_serial = active_ser
        except Exception:
            pass
        try:
            cache_file = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
            cdata = {}
            if cache_file.exists():
                try: cdata = json.loads(cache_file.read_text())
                except Exception: pass
            cdata["last_address"] = active_ser
            if adb.current_device_model == "pixel_10": cdata["pixel_10_address"] = active_ser
            elif adb.current_device_model == "pixel_8": cdata["pixel_8_address"] = active_ser
            cache_file.write_text(json.dumps(cdata, indent=2))
        except Exception: pass

    profile = adb.DEVICE_PROFILES[adb.current_device_model]
    lpp = profile["lines_per_page"]
    orchestration_state["device_model"] = adb.current_device_model
    orchestration_state["lines_per_page"] = lpp
    if orchestration_state.get("page", 1) <= 1 and (orchestration_state.get("active_step") == "START_READY" or orchestration_state.get("status") == "IDLE"):
        orchestration_state["bottom_line"] = lpp
        orchestration_state["next_target_top"] = lpp + 1
        
    info = await get_device_info()
    await adb.ensure_adb_keyboard_closed(adb.target_adb_serial)
    await adb.calibrate_display_dpi(adb.target_adb_serial)
    asyncio.create_task(adb.check_and_update_alignment(adb.target_adb_serial))

    latest_telemetry["status_message"] = f"Switched to {info.get('active_model')} ({lpp} Lines/Page) ✔"
    await ws_manager.broadcast({"type": "device_selected", "data": info, "device_info": info, "orchestration": orchestration_state, "telemetry": latest_telemetry})
    res_dict = dict(info)
    res_dict["device_info"] = info
    return res_dict

@router.get("/api/adb/devices")
async def get_adb_devices():
    return await adb.list_adb_devices()

import asyncio

@router.get("/api/device/screen")
async def device_screen_endpoint(
    mode: str = "desktop",
    serial: Optional[str] = None,
    format: str = Query("jpeg"),
    quality: int = Query(80, ge=30, le=100),
    max_dim: int = Query(1280, ge=480, le=3840)
):
    ser = await adb.get_active_adb_serial(serial)
    if format.lower() == "png":
        png_bytes = await adb.capture_display_screenshot(target_display=mode, serial=ser, bypass_lock=True)
        if not png_bytes:
            raise HTTPException(status_code=503, detail="Failed to capture screen PNG")
        return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "no-store, must-revalidate"})

    jpg = await adb.capture_screen(mode=mode, serial=serial, quality=quality, max_dim=max_dim)
    if not jpg:
        raise HTTPException(status_code=503, detail="Failed to capture screen")
    return Response(content=jpg, media_type="image/jpeg", headers={"Cache-Control": "no-store, must-revalidate"})

@router.get("/api/device/stream")
async def device_stream_endpoint(mode: str = "desktop", serial: Optional[str] = None, fps: float = Query(2.0, ge=0.5, le=5.0), quality: int = Query(75, ge=30, le=95), max_dim: int = Query(960, ge=480, le=1920)):
    return StreamingResponse(
        adb.mjpeg_stream_generator(mode=mode, serial=serial, fps=fps, quality=quality, max_dim=max_dim),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@router.get("/api/device/live-meta")
async def get_device_live_meta_endpoint(mode: str = "desktop", serial: Optional[str] = None):
    return await adb.get_live_view_metadata(serial=serial, mode=mode)

@router.get("/api/device/capture-source")
async def get_device_capture_source_endpoint(serial: Optional[str] = None):
    ser = await adb.get_active_adb_serial(serial)
    disp_map = await adb.detect_surfaceflinger_displays(ser) if ser else {}
    has_ext = bool(disp_map.get("desktop"))
    return {
        "status": "ok",
        "has_external_display": has_ext,
        "adb_connected": bool(ser),
        "adb_serial": ser,
        "displays": disp_map,
        "preferred_source": "adb",
        "display_awake_policies": {
            "active": True,
            "stay_on_while_plugged_in": 7,
            "screen_off_timeout_ms": 2147483647
        }
    }

@router.post("/api/device/prevent-sleep")
async def prevent_sleep_endpoint(serial: Optional[str] = None):
    ser = await adb.get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No ADB device connected"}
    await adb.configure_display_awake_policies(ser)
    await adb.pulse_display_awake_heartbeat(ser)
    return {"status": "ok", "message": "Display awake policies enforced and pulse sent"}



@router.post("/api/device/close-keyboard")
async def close_keyboard_endpoint(serial: Optional[str] = None):
    closed = await adb.ensure_adb_keyboard_closed(serial)
    return {"status": "ok", "keyboard_closed": closed}

@router.get("/api/device/desktop-mode")
async def get_device_desktop_mode_endpoint(serial: Optional[str] = None):
    from services import state
    return {
        "status": "ok",
        "desktop_mode_enabled": getattr(state, "desktop_mode_enabled", True),
        "desktop_keyboard_prohibited": getattr(state, "desktop_keyboard_prohibited", True)
    }

@router.post("/api/device/desktop-mode")
@router.post("/api/device/desktop-mode/toggle")
async def toggle_device_desktop_mode_endpoint(req: Optional[Dict[str, Any]] = None):
    req = req or {}
    from services import kiosk_service
    enable = req.get("enabled", True)
    ser = req.get("serial")
    return await kiosk_service.toggle_desktop_mode(enable=enable, serial=ser)

@router.get("/api/device/keyboard/prohibit")
@router.get("/api/device/keyboard-prohibit")
async def get_device_keyboard_prohibit_endpoint(serial: Optional[str] = None):
    from services import state
    return {
        "status": "ok",
        "prohibited": getattr(state, "desktop_keyboard_prohibited", True)
    }

@router.post("/api/device/keyboard/prohibit")
@router.post("/api/device/keyboard-prohibit")
async def set_device_keyboard_prohibit_endpoint(req: Optional[Dict[str, Any]] = None):
    req = req or {}
    from services import kiosk_service
    prohibit = req.get("prohibit", True)
    ser = req.get("serial")
    return await kiosk_service.set_desktop_keyboard_prohibition(prohibit=prohibit, serial=ser)

@router.post("/api/device/autofix-viewport")
@router.post("/api/device/alignment/fix-viewport")
async def autofix_viewport_endpoint(req: Optional[Dict[str, Any]] = None):
    req = req or {}
    ser = await adb.get_active_adb_serial(req.get("serial"))
    disp_id = req.get("display_id")
    res = await adb.auto_fix_viewport(ser, disp_id)
    return res

@router.post("/api/device/key/{key_name}")
async def send_device_key_endpoint(key_name: str, req: Optional[Dict[str, Any]] = None):
    req = req or {}
    ser = await adb.get_active_adb_serial(req.get("serial"))
    disp_id = await adb.detect_external_display_id(ser)
    kn = key_name.lower().replace("-", "_").replace(" ", "_")
    target_d = disp_id or 3
    disp_w, disp_h = await adb.get_display_dimensions(ser, target_d)
    focus_x = min(disp_w // 3, 500) if disp_w > 0 else 500
    focus_y = min(disp_h // 2, 500) if disp_h > 0 else 500
    if "end" in kn:
        await adb.run_adb_shell(f"input -d {target_d} tap {focus_x} {focus_y} >/dev/null 2>&1", ser)
        await asyncio.sleep(0.08)
        await adb.dismiss_keyboard(ser, target_d)
        await asyncio.sleep(0.08)
        await adb.send_hid_keycombination(113, 123, ser)
    elif "home" in kn:
        await adb.run_adb_shell(f"input -d {target_d} tap {focus_x} {focus_y} >/dev/null 2>&1", ser)
        await asyncio.sleep(0.08)
        await adb.dismiss_keyboard(ser, target_d)
        await asyncio.sleep(0.08)
        await adb.send_hid_keycombination(113, 122, ser)
        await asyncio.sleep(0.2)
        await adb.dismiss_keyboard(ser, target_d)
    await adb.auto_fix_viewport(ser, disp_id)
    return {"status": "ok", "key": key_name}

@router.get("/api/device/keyboard-status")
async def get_keyboard_status(serial: Optional[str] = None):
    ser = await adb.get_active_adb_serial(serial)
    if not ser:
        return {"connected": False, "visible": False, "hard_keyboard_suppression": False}
    vis = await adb.is_ime_visible(ser)
    setting_chk = await adb.run_adb_shell("settings get secure show_ime_with_hard_keyboard", ser)
    suppressed = (setting_chk.get("stdout", "").strip() == "0")
    return {
        "connected": True,
        "serial": ser,
        "visible": vis,
        "hard_keyboard_suppression": suppressed
    }

@router.get("/api/device/fullscreen-status")
async def get_fullscreen_status(serial: Optional[str] = None, display_id: Optional[int] = None):
    ser = await adb.get_active_adb_serial(serial)
    if not ser:
        return {"connected": False, "is_fullscreen": False, "mode": "unknown", "reason": "No active device connected via ADB"}
    status = await adb.is_editor_full_screen(ser, display_id)
    return {
        "connected": True,
        "serial": ser,
        **status
    }

@router.post("/api/adb/connect")
@router.post("/api/device/connect-ip")
async def adb_connect(req: Request):
    import asyncio, subprocess
    data = await req.json()
    addr = (data.get("address") or data.get("ip") or "").strip()
    dev_model = (data.get("device_model") or data.get("model") or "").lower()
    if not addr:
        raise HTTPException(status_code=400, detail="Missing IP address/port")

    # Associate given IP/port with device in cache
    try:
        cache_file = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
        cdata = {}
        if cache_file.exists():
            try: cdata = json.loads(cache_file.read_text())
            except Exception: pass
        cdata["last_address"] = addr
        if "8" in dev_model:
            cdata["pixel_8_address"] = addr
            adb.current_device_model = "pixel_8"
        elif "10" in dev_model:
            cdata["pixel_10_address"] = addr
            adb.current_device_model = "pixel_10"
        else:
            if adb.current_device_model == "pixel_8": cdata["pixel_8_address"] = addr
            elif adb.current_device_model == "pixel_10": cdata["pixel_10_address"] = addr
        cache_file.write_text(json.dumps(cdata, indent=2))
    except Exception: pass

    p = await asyncio.to_thread(subprocess.run, ["adb", "connect", addr], capture_output=True, text=True, timeout=8.0)
    out = ((p.stdout or "") + ("\n" + p.stderr if p.stderr else "")).strip()
    is_success = (p.returncode == 0) and ("connected to" in out.lower() or "already connected" in out.lower())
    if is_success:
        adb.target_adb_serial = addr
        active = await adb.get_active_adb_serial(addr, force_refresh=True)
        if active:
            adb.target_adb_serial = active
    return {"status": "ok" if is_success else "error", "output": out}

@router.post("/api/adb/pair")
@router.post("/api/device/pair-ip")
async def adb_pair(req: Request):
    import asyncio, subprocess
    data = await req.json()
    addr = (data.get("address") or data.get("ip") or "").strip()
    code = (data.get("code") or "").strip()
    dev_model = (data.get("device_model") or data.get("model") or "").lower()
    if not addr or not code:
        raise HTTPException(status_code=400, detail="Missing IP address or pairing code")

    # Cache pairing address for target device
    try:
        cache_file = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
        cdata = {}
        if cache_file.exists():
            try: cdata = json.loads(cache_file.read_text())
            except Exception: pass
        if "8" in dev_model: cdata["pixel_8_address"] = addr
        elif "10" in dev_model: cdata["pixel_10_address"] = addr
        cache_file.write_text(json.dumps(cdata, indent=2))
    except Exception: pass

    p = await asyncio.to_thread(subprocess.run, ["adb", "pair", addr, code], capture_output=True, text=True, timeout=10.0)
    out = ((p.stdout or "") + ("\n" + p.stderr if p.stderr else "")).strip()
    is_success = (p.returncode == 0) and ("successfully paired" in out.lower() or ("paired" in out.lower() and "fail" not in out.lower()))
    return {"status": "ok" if is_success else "error", "output": out}

@router.post("/api/device/save-address")
async def save_device_address(req: Request):
    data = await req.json()
    model = (data.get("model") or data.get("device_model") or "").lower()
    addr = (data.get("address") or data.get("ip") or "").strip()
    cache_file = Path(__file__).resolve().parent.parent.parent / "scripts" / ".devices_cache.json"
    cdata = {}
    if cache_file.exists():
        try: cdata = json.loads(cache_file.read_text())
        except Exception: pass
    if "8" in model:
        cdata["pixel_8_address"] = addr
    elif "10" in model:
        cdata["pixel_10_address"] = addr
    if addr:
        cdata["last_address"] = addr
    cache_file.write_text(json.dumps(cdata, indent=2))
    info = await adb.get_device_info()
    return {"status": "ok", "cached_addresses": cdata, "device_info": info}

@router.post("/api/adb/command")
async def adb_command(req: AdbCommandRequest):
    res = await adb.run_adb_shell(req.command, req.serial)
    return res

@router.post("/api/device/stay-awake")
@router.post("/api/device/unlock")
async def device_unlock_and_awake_endpoint(req: Request):
    data = {}
    try: data = await req.json()
    except Exception: pass
    phone_pin = data.get("phone_pin") or getattr(config, "PHONE_UNLOCK_PIN", "1213") or "1213"
    serial = data.get("serial")
    unlock_phone = bool(data.get("unlock_phone", True))
    handle_teams_pin = bool(data.get("handle_teams_pin", True))
    res = await adb.configure_display_awake_policies(
        serial,
        pin=phone_pin,
        unlock_phone=unlock_phone,
        handle_teams_pin=handle_teams_pin,
    )
    return {"status": "ok", "details": res}

@router.post("/api/device/unlock-phone")
async def unlock_phone_screen_endpoint(req: Request):
    """
    Explicitly wakes Display #0 and unlocks the Android OS Phone Lockscreen using strictly
    the Phone Unlock PIN (1213), never mixing it up with the Microsoft Teams passcode (2992).
    """
    data = {}
    try: data = await req.json()
    except Exception: pass
    serial = data.get("serial")
    phone_pin = data.get("phone_pin") or getattr(config, "PHONE_UNLOCK_PIN", "1213") or "1213"
    handle_teams_after = bool(data.get("handle_teams_auth_after", False))
    res = await adb.unlock_phone_screen_1213(
        serial=serial,
        phone_pin=phone_pin,
        handle_teams_auth_after=handle_teams_after,
    )
    return {"status": "ok", "details": res}

@router.get("/api/system/hardware-profile")
async def get_hardware_profile_endpoint():
    """Returns local inference runtime hardware capabilities and Intel Lunar Lake Series 2 tuning profile."""
    from ocr_engine import get_hardware_acceleration_profile
    return {
        "status": "ok",
        "profile": get_hardware_acceleration_profile()
    }

@router.post("/api/device/dismiss-anr")
async def dismiss_anr_endpoint(req: Request):
    """Proactively dismisses any ANR or frozen app/launcher dialog and restores editor focus."""
    data = {}
    try: data = await req.json()
    except Exception: pass
    serial = data.get("serial")
    disp_id = data.get("display_id")
    res = await adb.dismiss_anr_dialogs(serial=serial, display_id=disp_id)
    return {"status": "ok", "details": res}

@router.post("/api/device/enforce-desktop-markdown")
async def enforce_desktop_markdown_endpoint(req: Request):
    """
    Assures that the Markdown editor only opens and runs on the desktop mode screen,
    clearing any instance from the phone screen to avoid paused/white screen conflicts.
    """
    data = {}
    try: data = await req.json()
    except Exception: pass
    serial = data.get("serial")
    disp_id = data.get("display_id")
    res = await adb.enforce_markdown_only_on_desktop(serial=serial, ext_display_id=disp_id)
    return {"status": "ok", "details": res}

@router.post("/api/device/auto-pin")
async def auto_pin_endpoint(req: Request):
    """
    Automatically enters the Teams/Intune PIN (2992) when a Teams PIN prompt is displayed on either
    the Phone Screen (Display #0) or the Desktop Display (#ext_id), while strictly separating Phone Unlock PIN (1213).
    """
    data = {}
    try: data = await req.json()
    except Exception: pass
    serial = data.get("serial")
    disp_id = data.get("display_id")
    pin = data.get("pin")
    force = bool(data.get("force", True))
    target_display = data.get("target_display") or data.get("mode")
    res = await adb.auto_handle_pin_authentication(
        serial=serial,
        ext_display_id=disp_id,
        pin=pin,
        force=force,
        target_display=target_display,
    )
    return {"status": "ok", "details": res}

@router.get("/api/device/hid-target")
async def get_hid_target_endpoint():
    """Returns the current Mouse & Keyboard HID target display ('desktop' vs 'phone') and active capture display."""
    from services import kiosk_service, state as app_state
    return {
        "status": "ok",
        "hid_target_display": app_state.latest_telemetry.get("hid_target_display") or {
            "mode": "desktop" if kiosk_service.kiosk_state.get("mouse_display_id", 0) > 0 else "phone",
            "display_id": kiosk_service.kiosk_state.get("mouse_display_id", 0),
        },
        "active_capture_display": app_state.latest_telemetry.get("active_capture_display") or {
            "target": "desktop",
            "display_id": app_state.latest_telemetry.get("capture_telemetry", {}).get("display_id"),
        },
    }

@router.post("/api/device/hid-target")
async def set_hid_target_endpoint(req: Request):
    """Explicitly directs Mouse & Keyboard HID focus between 'phone' (Display #0) and 'desktop' (External Display)."""
    data = {}
    try: data = await req.json()
    except Exception: pass
    serial = data.get("serial")
    target_mode = data.get("target_mode") or data.get("mode") or "desktop"
    disp_id = data.get("display_id")
    focus_coords = data.get("focus_coords")
    res = await adb.direct_hid_to_display(
        serial=serial,
        target_mode=target_mode,
        ext_display_id=disp_id,
        focus_coords=focus_coords,
    )
    return {"status": "ok", "details": res}


@router.post("/api/device/phone-tap")
@router.post("/api/device/display-tap")
async def display_tap_endpoint(req: Request):
    """
    Sends a touch/click tap to either the Phone Screen (Display #0, mode='phone')
    or the External Desktop Mode Display (Display #ext_id, mode='desktop') at normalized
    (norm_x, norm_y) or pixel (x, y) coordinates, and immediately invalidates the frame cache.
    """
    data = {}
    try: data = await req.json()
    except Exception: pass
    ser = await adb.get_active_adb_serial(data.get("serial"))
    if not ser:
        return {"status": "error", "message": "No active ADB device"}

    mode = str(data.get("mode") or "phone").strip().lower()
    if mode not in ("phone", "desktop"):
        mode = "phone"

    if mode == "desktop":
        ext_id = data.get("display_id") or await adb.detect_external_display_id(ser) or 3
        w, h = 1920, 1080
        cached = adb._frame_cache.get((ser, "desktop"))
        if cached and cached.get("raw_png"):
            try:
                import cv2, numpy as np
                img = cv2.imdecode(np.frombuffer(cached["raw_png"], np.uint8), cv2.IMREAD_COLOR)
                if img is not None and img.size > 0:
                    h, w = img.shape[:2]
            except Exception:
                pass
        else:
            try:
                dw, dh = await adb.get_display_dimensions(ser, ext_id)
                if dw > 0 and dh > 0:
                    w, h = dw, dh
            except Exception:
                pass

        if "norm_x" in data and "norm_y" in data:
            tx = max(0, min(w - 1, int(round(float(data["norm_x"]) * w))))
            ty = max(0, min(h - 1, int(round(float(data["norm_y"]) * h))))
        else:
            tx = int(data.get("x", w // 2))
            ty = int(data.get("y", h // 2))

        await adb.run_adb_shell(
            f"settings put secure show_ime_with_hard_keyboard 0; "
            f"input -d {ext_id} tap {tx} {ty} >/dev/null 2>&1",
            ser,
            timeout=3.0,
        )
        if (ser, "desktop") in adb._frame_cache:
            adb._frame_cache[(ser, "desktop")]["ts"] = 0.0
        return {"status": "ok", "serial": ser, "mode": "desktop", "display_id": ext_id, "x": tx, "y": ty, "resolution": f"{w}x{h}"}

    # Default: Phone Screen (Display #0)
    w, h = 1080, 2404
    cached = adb._frame_cache.get((ser, "phone"))
    if cached and cached.get("raw_png"):
        try:
            import cv2, numpy as np
            img = cv2.imdecode(np.frombuffer(cached["raw_png"], np.uint8), cv2.IMREAD_COLOR)
            if img is not None and img.size > 0:
                h, w = img.shape[:2]
        except Exception:
            pass

    if "norm_x" in data and "norm_y" in data:
        tx = max(0, min(w - 1, int(round(float(data["norm_x"]) * w))))
        ty = max(0, min(h - 1, int(round(float(data["norm_y"]) * h))))
    else:
        tx = int(data.get("x", w // 2))
        ty = int(data.get("y", h // 2))

    await adb.run_adb_shell(f"input -d 0 keyevent 224 && input touchscreen -d 0 tap {tx} {ty}", ser, timeout=3.0)
    if (ser, "phone") in adb._frame_cache:
        adb._frame_cache[(ser, "phone")]["ts"] = 0.0
    return {"status": "ok", "serial": ser, "mode": "phone", "display_id": 0, "x": tx, "y": ty, "resolution": f"{w}x{h}"}


@router.post("/api/device/phone-keypad")
async def phone_keypad_endpoint(req: Request):
    """
    Dedicated Phone Screen (Display #0) HID Numeric Keypad endpoint.
    Strictly routes digits (0-9), Enter (66), Backspace (67), Escape (111), or full PIN actions
    ONLY to the Phone Display #0 (-d 0), NEVER to Desktop Mode, and immediately refreshes the
    phone live stream frame cache so the user sees the input in real time.
    """
    data = {}
    try: data = await req.json()
    except Exception: pass
    ser = await adb.get_active_adb_serial(data.get("serial"))
    if not ser:
        return {"status": "error", "message": "No active ADB device"}

    action = str(data.get("action") or "key").strip().lower()
    key = str(data.get("key") or "").strip().upper()
    text_val = str(data.get("text") or "").strip()
    submit_enter = bool(data.get("submit_enter", False))
    focus_pin_box = bool(data.get("focus_pin_box", False))

    DIGIT_KEYCODES = {
        "0": 7, "1": 8, "2": 9, "3": 10, "4": 11,
        "5": 12, "6": 13, "7": 14, "8": 15, "9": 16,
    }

    if action == "phone_unlock_1213":
        res = await adb.unlock_phone_screen_1213(serial=ser, phone_pin="1213", handle_teams_auth_after=False)
        if (ser, "phone") in adb._frame_cache:
            adb._frame_cache[(ser, "phone")]["ts"] = 0.0
        return {"status": "ok", "target": "phone", "display_id": 0, "action": action, "details": res}

    if action == "teams_pin_2992":
        res = await adb.auto_handle_pin_authentication(
            serial=ser,
            pin="2992",
            force=True,
            target_display="phone",
        )
        if (ser, "phone") in adb._frame_cache:
            adb._frame_cache[(ser, "phone")]["ts"] = 0.0
        if (ser, "desktop") in adb._frame_cache:
            adb._frame_cache[(ser, "desktop")]["ts"] = 0.0
        return {"status": "ok", "target": "phone", "display_id": 0, "action": action, "details": res}

    cmds = ["input -d 0 keyevent 224"]
    if focus_pin_box:
        # Tap the Teams PIN input box on Display #0 (portrait 1080x2404 -> 540, 1035)
        cmds.append("input touchscreen -d 0 tap 540 1035")
        cmds.append("sleep 0.12")

    if action == "text" and text_val:
        safe_txt = "".join(ch for ch in text_val if ch.isalnum())
        if safe_txt:
            cmds.append(f"input -d 0 text {safe_txt}")
        if submit_enter:
            cmds.append("sleep 0.15")
            cmds.append("input -d 0 keyevent 66")
            cmds.append("input touchscreen -d 0 tap 540 1145")
    elif key in DIGIT_KEYCODES:
        kc = DIGIT_KEYCODES[key]
        cmds.append(f"input -d 0 keyevent {kc}")
    elif key in ("ENTER", "OK", "SUBMIT", "RETURN"):
        cmds.append("input -d 0 keyevent 66")
        if bool(data.get("tap_ok", False)):
            cmds.append("input touchscreen -d 0 tap 540 1145")
    elif key in ("BACKSPACE", "DEL", "DELETE"):
        cmds.append("input -d 0 keyevent 67")
    elif key in ("ESC", "ESCAPE"):
        cmds.append("input -d 0 keyevent 111")

    await adb.run_adb_shell("; ".join(cmds), ser, timeout=3.5)
    if (ser, "phone") in adb._frame_cache:
        adb._frame_cache[(ser, "phone")]["ts"] = 0.0
    if (ser, "desktop") in adb._frame_cache:
        adb._frame_cache[(ser, "desktop")]["ts"] = 0.0

    return {
        "status": "ok",
        "target": "phone",
        "display_id": 0,
        "action": action,
        "key": key,
        "text": text_val,
    }

@router.post("/api/device/undo-edits")
async def undo_markdown_edits_endpoint(req: Request):
    """Clicks the Undo ('↶') button in the Teams Markdown editor toolbar until all edits are undone."""
    from services import ui_automator_service as uia
    data = {}
    try: data = await req.json()
    except Exception: pass
    serial = data.get("serial")
    disp_id = data.get("display_id")
    max_clicks = int(data.get("max_clicks", 15))
    res = await uia.undo_markdown_edits(serial=serial, display_id=disp_id, max_clicks=max_clicks)
    return res

@router.post("/api/device/navigate-onedrive-markdown")
async def navigate_onedrive_markdown_endpoint(req: Request):
    """
    Navigates Teams on the desktop display through:
      Teams -> OneDrive -> Markdowns -> ficus-platform -> <bundle_folder_name> -> <target_file_name>
    and prepares the opened Markdown editor in Fullscreen + Dark Mode + Edit Mode.
    """
    from services import ui_automator_service as uia
    data = {}
    try: data = await req.json()
    except Exception: pass
    res = await uia.navigate_teams_onedrive_path_to_markdown(
        serial=data.get("serial"),
        display_id=data.get("display_id"),
        bundle_folder_name=data.get("bundle_folder_name") or data.get("bundle_name"),
        target_file_name=data.get("target_file_name") or data.get("file_name"),
        target_part_number=data.get("target_part_number") or data.get("part_number"),
        folder_path=data.get("folder_path"),
        open_editor=bool(data.get("open_editor", True)),
    )
    return res





