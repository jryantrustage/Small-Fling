from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any
from pathlib import Path
import json

from models import DeviceSelectRequest, AdbCommandRequest, AdbConnectRequest, AdbPairRequest
from services import adb_service as adb
from services.state import ws_manager, latest_telemetry, orchestration_state

router = APIRouter(tags=["device"])

@router.get("/api/device")
@router.get("/api/device/info")
async def get_device_info():
    return await adb.get_device_info()

@router.post("/api/device/select")
async def select_device_api(req: DeviceSelectRequest):
    if req.device_model:
        dev = req.device_model.lower().strip()
        if "8" in dev:
            adb.current_device_model = "pixel_8"
        elif "10" in dev:
            adb.current_device_model = "pixel_10"
        
        ser_for_model = await adb.connect_device_for_model(adb.current_device_model)
        if ser_for_model:
            adb.target_adb_serial = ser_for_model
            
    if req.serial is not None:
        adb.target_adb_serial = req.serial.strip() if req.serial.strip() else None

    if adb.target_adb_serial and not req.device_model:
        devs_res = await adb.list_adb_devices()
        matched = next((d for d in devs_res.get("devices", []) if d["serial"] == adb.target_adb_serial), None)
        if matched:
            m = (matched.get("model", "") + " " + matched.get("raw", "")).lower()
            if any(k in m for k in ["pixel_8", "husky", "shiba", "8"]):
                adb.current_device_model = "pixel_8"
            elif any(k in m for k in ["pixel_10", "mustang", "frankel", "10"]):
                adb.current_device_model = "pixel_10"

    active_ser = await adb.get_active_adb_serial(adb.target_adb_serial)
    if active_ser:
        adb.target_adb_serial = active_ser
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

    latest_telemetry["status_message"] = f"Switched to {info.get('active_model')} ({lpp} Lines/Page) ✔"
    await ws_manager.broadcast({"type": "device_selected", "data": info, "orchestration": orchestration_state, "telemetry": latest_telemetry})
    return info

@router.get("/api/adb/devices")
async def get_adb_devices():
    return await adb.list_adb_devices()

@router.get("/api/device/screen")
async def device_screen_endpoint(mode: str = "desktop", serial: Optional[str] = None, quality: int = Query(80, ge=30, le=95), max_dim: int = Query(1280, ge=480, le=1920)):
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

@router.post("/api/device/close-keyboard")
async def close_keyboard_endpoint(serial: Optional[str] = None):
    closed = await adb.ensure_adb_keyboard_closed(serial)
    return {"status": "ok", "keyboard_closed": closed}

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

@router.post("/api/adb/connect")
async def adb_connect(req: AdbConnectRequest):
    import asyncio, subprocess
    addr = req.address.strip()
    p = await asyncio.to_thread(subprocess.run, ["adb", "connect", addr], capture_output=True, text=True, timeout=8.0)
    out = ((p.stdout or "") + ("\n" + p.stderr if p.stderr else "")).strip()
    is_success = (p.returncode == 0) and ("connected to" in out.lower() or "already connected" in out.lower())
    if is_success:
        adb.target_adb_serial = addr
        active = await adb.get_active_adb_serial(addr)
        if active:
            adb.target_adb_serial = active
    return {"status": "ok" if is_success else "error", "output": out}

@router.post("/api/adb/pair")
async def adb_pair(req: AdbPairRequest):
    import asyncio, subprocess
    addr = req.address.strip()
    code = req.code.strip()
    p = await asyncio.to_thread(subprocess.run, ["adb", "pair", addr, code], capture_output=True, text=True, timeout=10.0)
    out = ((p.stdout or "") + ("\n" + p.stderr if p.stderr else "")).strip()
    is_success = (p.returncode == 0) and ("successfully paired" in out.lower() or ("paired" in out.lower() and "fail" not in out.lower()))
    return {"status": "ok" if is_success else "error", "output": out}

@router.post("/api/adb/command")
async def adb_command(req: AdbCommandRequest):
    res = await adb.run_adb_shell(req.command, req.serial)
    return res
