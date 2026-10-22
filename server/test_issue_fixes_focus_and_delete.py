import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from main import app
from observation_actions import observation_action_registry
from observation_actions.base_action import ObservationContext
from services.dag_event_queue import queue_dag_event, get_active_events, get_event_history
from services import state
import db

client = TestClient(app)

def test_delete_frame_endpoint_resilient_without_404():
    """Verify delete_frame succeeds even if frame is not in database (Issue 1)."""
    fid = "nonexistent_stuck_frame_123"
    state.captured_frames[fid] = {"frame_id": fid, "filename": f"{fid}.png"}
    res = client.delete(f"/api/frames/{fid}")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["frame_id"] == fid
    assert fid not in state.captured_frames

    # Deleting again (already deleted) should also return 200 and not crash with 404
    res2 = client.delete(f"/api/frames/{fid}")
    assert res2.status_code == 200
    assert res2.json()["status"] == "success"

def test_focus_editor_action_registered():
    """Verify FocusEditorAction is registered in ObservationActionRegistry."""
    act = observation_action_registry.get_action("editor_not_focused_gain_focus")
    assert act is not None
    assert act.id == "editor_not_focused_gain_focus"
    assert act.category == "focus"

@pytest.mark.asyncio
async def test_queue_dag_event_lifecycle():
    """Verify queue_dag_event records, executes, broadcasts, and resolves events."""
    executed = False
    async def sample_handler():
        nonlocal executed
        executed = True
        return {"calibrated": True}

    res = await queue_dag_event(
        event_type="editor_focus_lost",
        category="FOCUS",
        message="Test focus lost recovery",
        node_id="init_end",
        handler=sample_handler
    )
    assert res["status"] == "resolved"
    assert executed is True
    assert res["result"]["calibrated"] is True
    history = get_event_history(limit=5)
    assert any(e["event_type"] == "editor_focus_lost" for e in history)

@pytest.mark.asyncio
async def test_ensure_editor_content_focused_mock():
    """Verify ensure_editor_content_focused coordinates execution."""
    from services.adb_service import ensure_editor_content_focused
    with patch("services.adb_service.run_adb_shell", new_callable=AsyncMock) as mock_shell, \
         patch("services.adb_service.get_active_adb_serial", new_callable=AsyncMock, return_value="mock_serial"), \
         patch("services.adb_service.detect_external_display_id", new_callable=AsyncMock, return_value=2), \
         patch("services.adb_service.get_display_dimensions", new_callable=AsyncMock, return_value=(1920, 1080)):
        mock_shell.return_value = {"status": "ok", "stdout": "Task{123 #99 type=standard com.microsoft.teams}"}
        res = await ensure_editor_content_focused("mock_serial", 2)
        assert res["status"] == "ok"
        assert res["display_id"] == 2
        assert len(res["actions"]) >= 2
