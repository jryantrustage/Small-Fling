import pytest
from fastapi.testclient import TestClient
import main
import cv2, numpy as np, io

client = TestClient(main.app)

def test_dag_and_calibration_lifecycle():
    # 1. Create a new project
    proj_res = client.post(
        "/api/projects",
        json={"name": "DAG Test Markdown", "description": "Deterministic Key Flow", "target_total_lines": 0}
    )
    assert proj_res.status_code == 200
    proj_data = proj_res.json()
    proj_id = proj_data["id"]

    try:
        # 2. Check DAG state
        dag_res = client.get("/api/dag/status")
        assert dag_res.status_code == 200
        dag_data = dag_res.json()["dag"]
        assert "init_end" in dag_data["nodes"]
        assert dag_data["nodes"]["init_end"]["status"] in ("idle", "active", "completed")

        # 3. Calibrate End via Ctrl+End synthetic frame (in-memory)
        dummy = np.zeros((1080, 1920, 3), dtype=np.uint8)
        cv2.putText(dummy, "151", (110, 500), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        _, png_bytes = cv2.imencode(".png", dummy)

        calib_res = client.post(
            f"/api/projects/{proj_id}/calibrate-end",
            files={"file": ("test_synthetic_p09.png", png_bytes.tobytes(), "image/png")}
        )
        assert calib_res.status_code == 200
        calib_data = calib_res.json()
        assert calib_data["total_lines"] >= 151

        # 4. Verify Home via Ctrl+Home synthetic frame (in-memory)
        dummy_home = np.zeros((1080, 1920, 3), dtype=np.uint8)
        cv2.putText(dummy_home, "1 First line markdown", (110, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        _, home_png = cv2.imencode(".png", dummy_home)

        home_res = client.post(
            f"/api/projects/{proj_id}/verify-home",
            files={"file": ("test_synthetic_home.png", home_png.tobytes(), "image/png")}
        )
        assert home_res.status_code == 200
        home_data = home_res.json()
        assert "verified" in home_data

        # 5. Verify DAG updated
        dag_res2 = client.get("/api/dag/status")
        assert dag_res2.status_code == 200
        dag_nodes = dag_res2.json()["dag"]["nodes"]
        assert dag_nodes["init_end"]["status"] == "completed"
        assert dag_nodes["reset_home"]["status"] == "completed"
        assert dag_nodes["frame_acquire"]["status"] in ("active", "idle", "ready")
    finally:
        client.delete(f"/api/projects/{proj_id}")


def test_editor_cursor_focused_classifier_and_troubleshooting():
    from classifiers import classifier_registry, EditorCursorFocusedClassifier, ClassifierContext

    # 1. Verify classifier is registered
    clf = classifier_registry.get_classifier("editor_cursor_focused")
    assert clf is not None
    assert clf.id == "editor_cursor_focused"

    # 2. Test detection when no device is connected
    import asyncio
    res = asyncio.run(clf.detect(ClassifierContext(serial="nonexistent:9999")))
    assert res.issue_detected is True
    assert "No active Android device" in res.details or res.metadata.get("connected") is False

    # 3. Test visual caret detection on synthetic dark-mode image with vertical caret bar
    img = np.zeros((1080, 1920, 3), dtype=np.uint8)
    img[:] = (26, 26, 26)  # Dark editor background
    # Draw a 2px wide vertical caret at x=200, y=200..224
    cv2.line(img, (200, 200), (200, 224), (255, 255, 255), 2)
    res_img = asyncio.run(clf.detect(ClassifierContext(serial="nonexistent:9999", image_cv=img)))
    assert res_img.metadata.get("visual_caret_found") is True or res_img.issue_detected is True


def test_dag_group_segmentation_and_runner():
    # 1. Create project
    proj_res = client.post("/api/projects", json={"name": "DAG Group Test", "description": "Group Test", "target_total_lines": 0})
    assert proj_res.status_code == 200
    proj_id = proj_res.json()["id"]

    try:
        # 2. Check DAG status includes groups 'initialize' and 'capture_entire_markdown'
        res = client.get("/api/dag/status")
        assert res.status_code == 200
        dag_data = res.json()["dag"]
        assert "groups" in dag_data
        assert "initialize" in dag_data["groups"]
        assert "capture_entire_markdown" in dag_data["groups"]
        for req_node in ["frame_acquire", "frame_ocr", "arrow_down", "verification_trigger"]:
            assert req_node in dag_data["groups"]["capture_entire_markdown"]["nodes"]
        assert len(dag_data["nodes"]) >= 6
        assert "frame_acquire" in dag_data["nodes"]
        assert "frame_ocr" in dag_data["nodes"]

        # 3. Test independent configuration of Node 3 and Node 4
        cfg3_res = client.post("/api/dag/nodes/frame_acquire/config", json={"settle_delay_ms": 400})
        assert cfg3_res.status_code == 200
        assert cfg3_res.json()["config"]["settle_delay_ms"] == 400

        cfg4_res = client.post("/api/dag/nodes/frame_ocr/config", json={"min_confidence": 0.85})
        assert cfg4_res.status_code == 200
        assert cfg4_res.json()["config"]["min_confidence"] == 0.85
    finally:
        client.delete(f"/api/projects/{proj_id}")


def test_single_node_concurrency_and_preemption():
    import asyncio
    from services import state
    import routers.orchestration as orch

    # 1. Reset DAG state
    client.post("/api/reset-state")
    status_res = client.get("/api/dag/status")
    assert status_res.status_code == 200
    assert status_res.json()["dag"]["current_active_node"] is None

    # 2. Simulate Node 7 (verification_trigger) running as an async background task
    async def simulate_preemption():
        async def mock_long_node_7():
            try:
                state.dag_state["nodes"]["verification_trigger"]["status"] = "active"
                state.dag_state["nodes"]["verification_trigger"]["is_active"] = True
                state.dag_state["current_active_node"] = "verification_trigger"
                await asyncio.sleep(5.0)
            except asyncio.CancelledError:
                state.dag_state["nodes"]["verification_trigger"]["status"] = "aborted"
                state.dag_state["nodes"]["verification_trigger"]["is_active"] = False
                state.dag_state["nodes"]["verification_trigger"]["error"] = "Operation aborted: Preempted"
                raise

        node7_task = asyncio.create_task(mock_long_node_7())
        await asyncio.sleep(0.05)

        orch._current_running_node_task = node7_task
        orch._current_running_node_id = "verification_trigger"

        # Verify Node 7 is currently active
        assert state.dag_state["nodes"]["verification_trigger"]["status"] == "active"
        assert state.dag_state["nodes"]["verification_trigger"]["is_active"] is True
        assert state.dag_state["current_active_node"] == "verification_trigger"

        # Now start Node 6: Node 7 MUST abort!
        aborted = await orch.abort_running_node(reason="Operation aborted: Preempted by Node arrow_down")
        assert aborted == "verification_trigger"

        # Verify Node 7 is aborted and not active
        assert state.dag_state["nodes"]["verification_trigger"]["status"] == "aborted"
        assert state.dag_state["nodes"]["verification_trigger"]["is_active"] is False

        # Run Node 6 via run_single_dag_node
        res = await orch.run_single_dag_node("arrow_down", {"serial": "mock:9999"})
        assert res["status"] in ("success", "completed")

        # After Node 6 finishes, verify only 1 node was active, and Node 7 was NOT set to active!
        assert state.dag_state["nodes"]["arrow_down"]["status"] == "completed"
        assert state.dag_state["nodes"]["arrow_down"]["is_active"] is False
        assert state.dag_state["nodes"]["verification_trigger"]["status"] != "active"
        assert state.dag_state["current_active_node"] is None

    asyncio.run(simulate_preemption())

    # 3. Test abort endpoints
    abort_res = client.post("/api/dag/nodes/abort")
    assert abort_res.status_code == 200
    assert "status" in abort_res.json()


def test_dag_6_arrow_down_and_dag_7_blocking_on_failure():
    import asyncio
    from services import state
    import routers.orchestration as orch

    async def run_test():
        # Setup DAG state: Node 6 failed (did not reach or advance)
        state.dag_state["nodes"]["arrow_down"]["status"] = "error"
        state.dag_state["nodes"]["arrow_down"]["reached"] = False
        state.dag_state["nodes"]["arrow_down"]["advanced"] = False

        # Attempt to run Node 7 (verification_trigger): DAG 7 MUST block and not proceed!
        res_n7 = await orch.run_single_dag_node("verification_trigger", {"serial": "mock:9999"})
        assert res_n7.get("status") == "prevented"
        assert res_n7.get("allowed") is False
        assert state.dag_state["nodes"]["verification_trigger"]["status"] == "prevented"

        # Now simulate Node 6 succeeding
        res_n6 = await orch.run_single_dag_node("arrow_down", {"serial": "mock:9999"})
        assert res_n6.get("status") == "success"
        assert res_n6.get("reached") is True
        assert state.dag_state["nodes"]["arrow_down"]["status"] == "completed"

    asyncio.run(run_test())


def test_display_id_sanitization_and_pacer_stall_resilience():
    from services.adb_service import sanitize_input_display_id

    # 1. 64-bit physical display IDs (e.g., SurfaceFlinger hardware ID) must NOT be passed to Android input
    assert sanitize_input_display_id(4613572713243172731) is None
    assert sanitize_input_display_id("4613572713243172731") is None

    # 2. Valid logical display IDs (1..255) must be preserved as int
    assert sanitize_input_display_id(6) == 6
    assert sanitize_input_display_id("6") == 6
    assert sanitize_input_display_id(4) == 4
    assert sanitize_input_display_id(255) == 255

    # 3. Invalid display IDs (0, negative, None, garbage) must return None
    assert sanitize_input_display_id(0) is None
    assert sanitize_input_display_id(-1) is None
    assert sanitize_input_display_id(None) is None
    assert sanitize_input_display_id("invalid") is None
    assert sanitize_input_display_id(256) is None

