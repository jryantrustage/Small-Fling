from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any

from services import kiosk_service

router = APIRouter(prefix="/api/device/kiosk", tags=["kiosk"])

class KioskLockRequest(BaseModel):
    display_id: int = 13
    package_id: str = "com.microsoft.teams"
    mode: str = "kiosk"
    restrictions: Optional[Dict[str, Any]] = None
    serial: Optional[str] = None

class KioskReleaseRequest(BaseModel):
    admin_pin: Optional[str] = None
    serial: Optional[str] = None

@router.get("/displays")
async def get_displays_endpoint(serial: Optional[str] = None):
    displays = await kiosk_service.get_connected_displays(serial)
    return {"status": "ok", "displays": displays, "count": len(displays)}

@router.get("/status")
async def get_kiosk_status_endpoint(serial: Optional[str] = None):
    status = await kiosk_service.query_kiosk_status(serial)
    return status

@router.post("/lock")
async def lock_external_display_endpoint(req: KioskLockRequest):
    res = await kiosk_service.lock_external_display(
        display_id=req.display_id,
        package_id=req.package_id,
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
