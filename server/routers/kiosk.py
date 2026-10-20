from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any

from services import kiosk_service

router = APIRouter(prefix="/api/device/kiosk", tags=["kiosk"])

class KioskLockRequest(BaseModel):
    display_id: int = 13
    package_id: str = "com.microsoft.teams"
    target_type: Optional[str] = "auto"  # "auto", "markdown_viewer", "teams_app"
    mode: str = "kiosk"
    restrictions: Optional[Dict[str, Any]] = None
    serial: Optional[str] = None

class KioskReleaseRequest(BaseModel):
    admin_pin: Optional[str] = None
    serial: Optional[str] = None

class KioskAutoRefreshRequest(BaseModel):
    display_id: Optional[int] = None
    serial: Optional[str] = None

class DesktopModeToggleRequest(BaseModel):
    enabled: Optional[bool] = None
    enable: Optional[bool] = None
    serial: Optional[str] = None

    @property
    def is_enabled(self) -> bool:
        if self.enabled is not None:
            return self.enabled
        if self.enable is not None:
            return self.enable
        return True

class KeyboardProhibitRequest(BaseModel):
    prohibit: bool
    serial: Optional[str] = None

@router.get("/displays")
async def get_displays_endpoint(serial: Optional[str] = None):
    displays = await kiosk_service.get_connected_displays(serial)
    return {"status": "ok", "displays": displays, "count": len(displays)}

@router.get("/status")
async def get_kiosk_status_endpoint(serial: Optional[str] = None):
    status = await kiosk_service.query_kiosk_status(serial)
    return status

@router.get("/desktop-mode")
@router.get("/desktop-mode/verify")
async def get_desktop_mode_endpoint(serial: Optional[str] = None):
    return await kiosk_service.verify_desktop_mode_status(serial)

@router.post("/desktop-mode")
@router.post("/desktop-mode/toggle")
async def toggle_desktop_mode_endpoint(req: DesktopModeToggleRequest):
    res = await kiosk_service.toggle_desktop_mode(enable=req.is_enabled, serial=req.serial)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to toggle desktop mode"))
    return res

@router.post("/desktop-mode/verify")
async def post_desktop_mode_verify_endpoint(req: Optional[DesktopModeToggleRequest] = None):
    serial = req.serial if req else None
    return await kiosk_service.verify_desktop_mode_status(serial)

@router.get("/keyboard-prohibit")
async def get_keyboard_prohibit_endpoint(serial: Optional[str] = None):
    from services import state
    return {
        "status": "ok",
        "prohibited": getattr(state, "desktop_keyboard_prohibited", True)
    }

@router.post("/keyboard-prohibit")
async def set_keyboard_prohibit_endpoint(req: KeyboardProhibitRequest):
    res = await kiosk_service.set_desktop_keyboard_prohibition(prohibit=req.prohibit, serial=req.serial)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to update keyboard prohibition"))
    return res

@router.post("/lock")
async def lock_external_display_endpoint(req: KioskLockRequest):
    res = await kiosk_service.lock_external_display(
        display_id=req.display_id,
        package_id=req.package_id,
        target_type=req.target_type or "auto",
        mode=req.mode,
        restrictions=req.restrictions,
        serial=req.serial
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to lock display"))
    return res

@router.post("/release")
async def release_lock_endpoint(req: KioskReleaseRequest):
    res = await kiosk_service.release_lock(
        admin_pin=req.admin_pin,
        serial=req.serial
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to release lock"))
    return res

@router.post("/provision-admin")
async def provision_admin_endpoint(serial: Optional[str] = None):
    return await kiosk_service.provision_device_admin(serial)

@router.post("/auto-refresh")
async def auto_refresh_endpoint(req: KioskAutoRefreshRequest):
    res = await kiosk_service.auto_refresh_external_display(
        display_id=req.display_id,
        serial=req.serial
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to auto-refresh display"))
    return res
