import pytest
from fastapi.testclient import TestClient
import main

client = TestClient(main.app)

def test_kiosk_status_endpoint():
    res = client.get("/api/device/kiosk/status")
    assert res.status_code == 200
    data = res.json()
    assert "lock_status" in data
    assert "displays" in data
    assert "peripheral_restrictions" in data
    assert "device_owner_active" in data

def test_kiosk_displays_endpoint():
    res = client.get("/api/device/kiosk/displays")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"
    assert "displays" in data

def test_kiosk_lock_and_release_lifecycle():
    # Test locking external display
    lock_res = client.post("/api/device/kiosk/lock", json={
        "display_id": 13,
        "package_id": "com.microsoft.teams",
        "mode": "kiosk",
        "restrictions": {
            "suppress_hotkeys": True,
            "disable_status_bar": True,
            "prevent_sleep": True
        }
    })
    assert lock_res.status_code == 200
    lock_data = lock_res.json()
    assert lock_data.get("status") == "ok"

    # Test releasing lock
    rel_res = client.post("/api/device/kiosk/release", json={
        "admin_pin": "admin"
    })
    assert rel_res.status_code == 200
    rel_data = rel_res.json()
    assert rel_data.get("status") == "ok"
    assert rel_data.get("kiosk_state", {}).get("lock_status") == "UNLOCKED"

def test_kiosk_auto_refresh_endpoint():
    res = client.post("/api/device/kiosk/auto-refresh", json={
        "display_id": 14
    })
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"
    assert "refreshed_tasks" in data

def test_kiosk_lock_markdown_viewer_distinction():
    # Test locking specifically with target_type="markdown_viewer"
    lock_res = client.post("/api/device/kiosk/lock", json={
        "display_id": 8,
        "package_id": "com.microsoft.teams",
        "target_type": "markdown_viewer"
    })
    assert lock_res.status_code == 200
    lock_data = lock_res.json()
    assert lock_data.get("status") == "ok"
    assert lock_data.get("locked_target_type") in ("markdown_viewer", "generic")
    
    # Check kiosk status reports target distinction
    status_res = client.get("/api/device/kiosk/status")
    assert status_res.status_code == 200
    status = status_res.json()
    assert "is_markdown_viewer_active" in status
    assert "markdown_viewer_task_id" in status
    assert "teams_app_task_id" in status

