import pytest
import uuid
from fastapi.testclient import TestClient
from main import app
import db
from services import state

client = TestClient(app)

def test_device_profiles_crud():
    # 1. List profiles
    res = client.get("/api/device/profiles")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "success"
    profiles = data.get("profiles")
    assert isinstance(profiles, list)

    # 2. Upsert profile
    test_id = f"test_device_{uuid.uuid4().hex[:6]}"
    create_payload = {
        "id": test_id,
        "name": "Custom Test Hardware",
        "display_name": "Custom Test Hardware",
        "model_name": "test_model_x",
        "manufacturer": "TestCorp",
        "serial": "TEST123456",
        "target_dpi": 260,
        "display_width": 2560,
        "display_height": 1440,
        "display_id": 9,
        "lines_per_page": 55,
        "step_size": 54,
        "settle_delay_ms": 60,
        "hid_config": {
            "ctrl_key": 113,
            "home_key": 122,
            "end_key": 123,
            "down_key": 20,
            "repeat_delay_ms": 20,
            "action_settle_ms": 60
        }
    }
    res = client.post("/api/device/profiles", json=create_payload)
    assert res.status_code == 200
    created = res.json().get("profile")
    assert created["id"] == test_id
    assert created["target_dpi"] == 260
    assert created["lines_per_page"] == 55

    # 3. Retrieve and delete
    res = client.delete(f"/api/device/profiles/{test_id}")
    assert res.status_code == 200
    assert res.json().get("status") == "success"


def test_device_extract_specs_and_apply():
    # Dynamic hardware extraction over ADB (or mock fallback if no physical device attached)
    res = client.get("/api/device/extract-specs")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") in ("ok", "mock")
    specs = data.get("specs")
    assert "model" in specs
    assert "active_dpi" in specs
    assert "display_width" in specs
    assert "display_height" in specs
    assert "lines_per_page" in specs
    assert "step_size" in specs
    assert "hid_config" in specs

    # Apply characteristics
    apply_payload = {
        "target_dpi": specs["active_dpi"],
        "width": specs["display_width"],
        "height": specs["display_height"],
        "lines_per_page": specs["lines_per_page"],
        "step_size": specs["step_size"],
        "settle_delay_ms": 50,
        "hid_config": specs["hid_config"]
    }
    res = client.post("/api/device/apply-characteristics", json=apply_payload)
    assert res.status_code == 200
    assert res.json().get("status") == "ok"


def test_project_device_settings_and_lock_toggle():
    proj_name = f"DeviceLockTest_{uuid.uuid4().hex[:6]}"
    create_res = client.post("/api/projects", json={
        "name": proj_name,
        "description": "Testing device characteristics and lock enforcement",
        "target_total_lines": 500,
        "device_model": "pixel_8",
        "device_name": "Google Pixel 8 Pro",
        "target_dpi": 220,
        "display_width": 1920,
        "display_height": 1080,
        "display_id": 8,
        "lines_per_page": 49,
        "step_size": 48,
        "lock_device": True
    })
    assert create_res.status_code == 200
    proj_data = create_res.json()
    proj_id = proj_data["id"]

    try:
        # Get settings
        get_res = client.get(f"/api/projects/{proj_id}/device-settings")
        assert get_res.status_code == 200
        settings = get_res.json().get("settings")
        assert settings["device_model"] == "pixel_8"
        assert settings["target_dpi"] == 220
        assert settings["lock_device"] == 1

        # Update settings
        upd_res = client.post(f"/api/projects/{proj_id}/device-settings", json={
            "device_model": "pixel_10",
            "device_name": "Google Pixel 10 Pro",
            "target_dpi": 320,
            "display_width": 2560,
            "display_height": 1440,
            "display_id": 9,
            "lines_per_page": 60,
            "step_size": 59,
            "settle_delay_ms": 40,
            "lock_device": False
        })
        assert upd_res.status_code == 200
        updated = upd_res.json().get("project")
        assert updated["device_model"] == "pixel_10"
        assert updated["target_dpi"] == 320
        assert updated["lock_device"] == 0

        # Toggle lock
        lock_res = client.post(f"/api/projects/{proj_id}/lock-device", json={"lock_device": True})
        assert lock_res.status_code == 200
        assert lock_res.json().get("project")["lock_device"] == 1
    finally:
        client.delete(f"/api/projects/{proj_id}")


@pytest.mark.asyncio
async def test_dag_device_environment_resolution():
    from routers.orchestration import resolve_and_enforce_dag_device_environment
    test_name = f"TestResProject_{uuid.uuid4().hex[:6]}"
    new_proj = db.create_project(
        name=test_name,
        description="Dynamic extraction test",
        target_total_lines=100,
        device_model="pixel_8",
        device_name="Pixel 8 Pro",
        target_dpi=220,
        display_width=1920,
        display_height=1080,
        display_id=8,
        lines_per_page=49,
        step_size=48,
        lock_device=False
    )
    try:
        db.activate_project(new_proj["id"])
        env = await resolve_and_enforce_dag_device_environment(project_id=new_proj["id"])
        assert env.get("status") == "ok"
        assert env.get("active_dpi") == 220
        assert env.get("lines_per_page") == 49
    finally:
        db.delete_project(new_proj["id"])


@pytest.mark.asyncio
async def test_scroll_padding_and_arrow_count_calibration_and_persistence():
    import uuid
    import routers.orchestration as orch
    from services import state

    # 1. Create project with 24 lines per page and 4 padding lines (User's exact scenario)
    test_name = f"CalibProject_{uuid.uuid4().hex[:6]}"
    create_res = client.post("/api/projects", json={
        "name": test_name,
        "description": "56 arrow down calibration test",
        "target_total_lines": 100,
        "lines_per_page": 24,
        "scroll_padding_lines": 4
    })
    assert create_res.status_code == 200
    pdata = create_res.json()
    pid = pdata["id"]

    try:
        # 2. Check that step_size, arrow_count_step, and arrow_count_init are calibrated (28 and 56)
        assert pdata["scroll_padding_lines"] == 4
        assert pdata["arrow_count_step"] == 28   # 24 visible + 4 padding
        assert pdata["arrow_count_init"] == 56   # (24 + 4) * 2 = 56 down arrows

        # 3. Verify get settings returns these
        get_res = client.get(f"/api/projects/{pid}/device-settings")
        assert get_res.status_code == 200
        settings = get_res.json()["settings"]
        assert settings["scroll_padding_lines"] == 4
        assert settings["arrow_count_init"] == 56
        assert settings["arrow_count_step"] == 28

        # 4. Activate project and test arrow_down execution for 24-line viewport
        db.activate_project(pid)
        res_init = await orch.run_single_dag_node("arrow_down", {
            "serial": "mock:9999",
            "cur_top": 1,
            "prev_bottom": 24,
            "cursor_line": 1
        })
        assert res_init["status"] == "success"
        assert res_init["target_top_line"] == 25
        assert res_init["arrow_count"] == 56
        assert res_init["step_count"] == 56

        # Step transition to Page 3
        res_step = await orch.run_single_dag_node("arrow_down", {
            "serial": "mock:9999",
            "cur_top": 25,
            "prev_bottom": 48,
            "cursor_line": 48
        })
        assert res_step["status"] == "success"
        assert res_step["target_top_line"] == 49
        assert res_step["arrow_count"] == 28
        assert res_step["step_count"] == 28

        # 5. Test Gear icon modal save with custom overrides (e.g. 5 padding, 60 init, 30 step)
        upd_res = client.post(f"/api/projects/{pid}/device-settings", json={
            "device_model": "pixel_8",
            "lines_per_page": 24,
            "scroll_padding_lines": 5,
            "arrow_count_init": 60,
            "arrow_count_step": 30
        })
        assert upd_res.status_code == 200
        upd_proj = upd_res.json()["project"]
        assert upd_proj["scroll_padding_lines"] == 5
        assert upd_proj["arrow_count_init"] == 60
        assert upd_proj["arrow_count_step"] == 30
    finally:
        db.delete_project(pid)


