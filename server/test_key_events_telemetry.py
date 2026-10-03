import pytest
from fastapi.testclient import TestClient
from main import app
from services import state
from services.adb_service import record_dispatched_key_event
from services.performance_analyzer import analyze_dag2_performance_report

client = TestClient(app)

@pytest.mark.asyncio
async def test_key_event_telemetry_recording_and_correlation():
    # 1. Clear telemetry
    state.clear_key_events_telemetry()
    state.current_dag2_loop_id = "loop_042_20261003_120000"
    state.current_dag2_loop_index = 42

    # 2. Record benign key event
    ev1 = await record_dispatched_key_event(
        key_name="arrow_down_batched",
        keycodes=[20, 20, 20],
        shell_command="input keyevent 20 20 20",
        display_id=8,
        duration_ms=52.4,
        caller_node="arrow_down",
        details={"pre_activity": "FilePreviewActivity", "post_activity": "FilePreviewActivity"},
        check_window_state=False
    )
    assert ev1["navigated_away"] is False
    assert ev1["loop_id"] == "loop_042_20261003_120000"
    assert ev1["loop_index"] == 42
    assert ev1["duration_ms"] == 52.4

    # 3. Record disruptive key event (e.g. unexpected key combination causing focus loss)
    ev2 = await record_dispatched_key_event(
        key_name="disruptive_nav_key",
        keycodes=[111],
        shell_command="input keyevent 111",
        display_id=8,
        duration_ms=18.9,
        caller_node="arrow_down",
        details={"pre_activity": "FilePreviewActivity", "post_activity": "MainActivity"},
        check_window_state=False
    )
    assert ev2["navigated_away"] is True
    assert ev2["loop_id"] == "loop_042_20261003_120000"

    # 4. Verify telemetry state
    all_events = state.get_key_events_telemetry()
    assert len(all_events) == 2
    assert state.latest_telemetry["key_event_stats"]["navigated_away_count"] == 1
    assert state.latest_telemetry["key_event_stats"]["last_navigated_away"]["key_name"] == "disruptive_nav_key"

@pytest.mark.asyncio
async def test_performance_report_viewport_diagnostics():
    report = analyze_dag2_performance_report()
    assert "key_events_telemetry" in report
    assert "key_events_summary" in report
    assert "viewport_integrity_audit" in report

    ke_summary = report["key_events_summary"]
    assert ke_summary["total_dispatched"] == 2
    assert ke_summary["navigated_away_incidents"] == 1
    assert len(ke_summary["critical_incidents"]) == 1
    assert ke_summary["critical_incidents"][0]["key_name"] == "disruptive_nav_key"

    audit = report["viewport_integrity_audit"]
    assert audit["status"] == "DEGRADED_VIEWPORT_DISMISSED"
    assert audit["is_markdown_view_intact"] is False
    assert len(audit["culprit_events"]) == 1

    prompt = report.get("ai_optimization_prompt", "")
    assert "CRITICAL VIEWPORT DISRUPTION DETECTED" in prompt
    assert "disruptive_nav_key" in prompt

def test_telemetry_endpoints():
    res = client.get("/api/telemetry/key-events")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["count"] == 2

    # Clear endpoint
    clr_res = client.post("/api/telemetry/key-events/clear")
    assert clr_res.status_code == 200
    assert clr_res.json()["status"] == "success"

    res_after = client.get("/api/telemetry/key-events")
    assert res_after.json()["count"] == 0
