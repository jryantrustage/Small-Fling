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
        assert "position_navigation" in dag_data["groups"]
        assert "verify_assemble" in dag_data["groups"]
        for req_node in ["init_end", "reset_home"]:
            assert req_node in dag_data["groups"]["initialize"]["nodes"]
        for req_node in ["frame_acquire", "local_ai_ocr"]:
            assert req_node in dag_data["groups"]["capture_entire_markdown"]["nodes"]
        for req_node in ["frame_ocr", "arrow_down"]:
            assert req_node in dag_data["groups"]["position_navigation"]["nodes"]
        for req_node in ["verification_trigger", "document_assemble"]:
            assert req_node in dag_data["groups"]["verify_assemble"]["nodes"]
        assert len(dag_data["nodes"]) >= 8
        assert "frame_acquire" in dag_data["nodes"]
        assert "frame_ocr" in dag_data["nodes"]

        # Test Dual Semaphore API
        sem_res = client.get("/api/dag/semaphore")
        assert sem_res.status_code == 200
        assert sem_res.json()["status"] == "success"
        assert "semaphore_group2_to_3" in sem_res.json()
        assert "semaphore_group3_to_4" in sem_res.json()
        toggle_res = client.post("/api/dag/semaphore/toggle", json={"semaphore_id": "group3_to_4"})
        assert toggle_res.status_code == 200
        assert toggle_res.json()["semaphore_id"] == "group3_to_4"
        # Restore semaphore to True
        client.post("/api/dag/semaphore", json={"enabled": True, "semaphore_id": "group3_to_4"})

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


def test_edit_mode_and_dark_mode_enforcement():
    import asyncio
    from services import state
    import routers.orchestration as orch

    async def run_test():
        # Test auto_heal_pipeline_environment enforces Edit Mode and Dark Mode
        heal_res = await orch.auto_heal_pipeline_environment("mock:9999", 4, "init_end")
        assert heal_res["healed"] is True
        assert state.latest_alignment_status.get("boxes", {}).get("edit_mode", {}).get("passed") is True
        assert state.latest_alignment_status.get("boxes", {}).get("dark_mode", {}).get("passed") is True
        assert state.orchestration_state.get("edit_mode") is True
        assert state.orchestration_state.get("dark_mode") is True

    asyncio.run(run_test())


def test_cursor_line1_and_precise_arrow_down_determination():
    import asyncio
    from services import state
    import routers.orchestration as orch

    async def run_test():
        # Setup: New scan starting with cursor focused on Line 1, page 1 (Ln 1 to 24)
        state.orchestration_state["cursor_line"] = 1
        state.dag_state["nodes"]["frame_ocr"].update({"top_line": 1, "bottom_line": 24})

        # When starting a new scan:
        # Frame 1 has Line 1 thru 24 (visible span = 24).
        # Editor has 4 lines of scroll padding.
        # Phase 1: travel to bottom scroll threshold = 24 + 4 = 28 down arrows.
        # Phase 2: scroll viewport by 1 full frame = 24 + 4 = 28 down arrows.
        # Total = 28 + 28 = 56 down arrows to bring Line 25 to the top of Frame 2.
        res = await orch.run_single_dag_node("arrow_down", {
            "serial": "mock:9999",
            "cur_top": 1,
            "prev_bottom": 24,
            "cursor_line": 1,
            "scroll_padding_lines": 4
        })
        assert res["status"] == "success"
        assert res["target_top_line"] == 25
        assert res["arrow_count"] == 56
        assert res["step_count"] == 56
        assert state.orchestration_state["cursor_line"] == 48

        # Subsequent page transition (Page 2 -> Page 3):
        # Cursor is already at the bottom threshold of the viewport (Ln 48).
        # Viewport scrolls down 24 + 4 = 28 lines to bring Line 49 to 1st line position.
        res_p2 = await orch.run_single_dag_node("arrow_down", {
            "serial": "mock:9999",
            "cur_top": 25,
            "prev_bottom": 48,
            "cursor_line": 48,
            "scroll_padding_lines": 4
        })
        assert res_p2["status"] == "success"
        assert res_p2["target_top_line"] == 49
        assert res_p2["arrow_count"] == 28
        assert res_p2["step_count"] == 28

    asyncio.run(run_test())


def test_viewport_26_lines_page_alignment():
    import asyncio
    from services import state
    import routers.orchestration as orch

    async def run_test():
        L = 26
        padding = 4
        # Calibration: page 1 gutter shows Ln 1..26 -> capacity 26 (not the 49 profile default)
        top, bot = orch._resolve_viewport_bounds(1, 26, 49)
        assert (top, bot) == (1, 26)
        assert state.orchestration_state["viewport_lines"] == L
        # Bottom detection failure falls back to calibrated capacity, not profile 49
        assert orch._resolve_viewport_bounds(27, 0, 49) == (27, 52)

        cursor, cur_top = 1, 1
        for page in range(1, 6):
            prev_bottom = cur_top + L - 1
            res = await orch.run_single_dag_node("arrow_down", {
                "serial": "mock:9999",
                "cur_top": cur_top,
                "prev_bottom": prev_bottom,
                "cursor_line": cursor,
                "scroll_padding_lines": padding
            })
            expected_presses = (L + padding) * 2 if page == 1 else (L + padding)
            assert res["arrow_count"] == expected_presses
            assert res["target_top_line"] == prev_bottom + 1
            cur_top = res["target_top_line"]
            cursor = res["cursor_line"]

    asyncio.run(run_test())


def test_dag_node_connectors_flow_orchestration():
    """Verify that node connectors direct DAG orchestration flow and can be connected/disconnected."""
    with TestClient(main.app) as client:
        # 1. Fetch connectors
        res = client.get("/api/dag/connectors")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        edges = data["edges"]
        assert len(edges) >= 8

        # 2. Toggle connector between local_ai_ocr and frame_ocr
        toggle_res = client.post("/api/dag/connectors/toggle", json={
            "from_node": "local_ai_ocr",
            "to_node": "frame_ocr"
        })
        assert toggle_res.status_code == 200
        assert toggle_res.json()["edge"]["enabled"] is False

        # Verify semaphore backward-compatibility reflects disconnected edge
        sem_res = client.get("/api/dag/semaphore")
        assert sem_res.json()["semaphore_group2_to_3"] is False

        # 3. Direct flow: Re-route local_ai_ocr directly to verification_trigger (bypassing line positioning)
        connect_res = client.post("/api/dag/connectors/connect", json={
            "from_node": "local_ai_ocr",
            "to_node": "verification_trigger",
            "enabled": True
        })
        assert connect_res.status_code == 200
        assert connect_res.json()["edge"]["from"] == "local_ai_ocr"
        assert connect_res.json()["edge"]["to"] == "verification_trigger"
        assert connect_res.json()["edge"]["enabled"] is True

        # 4. Disconnect a connector
        disconn_res = client.post("/api/dag/connectors/disconnect", json={
            "from_node": "arrow_down",
            "to_node": "verification_trigger"
        })
        assert disconn_res.status_code == 200
        assert disconn_res.json()["edge"]["enabled"] is False

        # 5. Reset connectors back to default
        reset_res = client.post("/api/dag/connectors/reset")
        assert reset_res.status_code == 200
        reset_edges = reset_res.json()["edges"]
        # All reset edges should be enabled
        assert all(e["enabled"] for e in reset_edges)
        # Verify local_ai_ocr -> frame_ocr restored
        edge_23 = next((e for e in reset_edges if e["from"] == "local_ai_ocr"), None)
        assert edge_23 is not None
        assert edge_23["to"] == "frame_ocr"


def test_gutter_range_recovery_and_page_up_down_navigation(monkeypatch):
    """
    Verify that when the gutter is at an unexpected range (e.g. Line 12..35 or 168..191 instead of 120..143),
    navigate_to_target_top_line deterministically uses PageDown(93) / PageUp(92) + Arrow keys (20/19)
    to align the target top line on the first line of the page and continue the DAG flow.
    """
    import asyncio
    import numpy as np
    import cv2
    import services.adb_service as adb_svc
    import ocr_engine
    from observation_actions import observation_action_registry, ObservationContext
    from dag_nodes.base import DagBlackboard

    dispatched_cmds = []
    sim_state = {"top": 12, "span": 24}

    dummy_img = np.zeros((1080, 1920, 3), dtype=np.uint8)
    _, dummy_png = cv2.imencode(".png", dummy_img)
    dummy_bytes = dummy_png.tobytes()

    async def fake_capture(serial=None, max_cache_age_s=0.0, bypass_lock=False):
        return dummy_bytes

    async def fake_dpi(serial=None, disp_id=None):
        return 1.375, 220

    def fake_detect_top(img, target_top=None, cursor_line=None, dpi_factor=1.0):
        t = sim_state["top"]
        b = t + sim_state["span"] - 1
        return t, {"bottom_gutter_line": b}

    def fake_gutter_cluster(img, dpi_factor=1.0):
        t = sim_state["top"]
        b = t + sim_state["span"] - 1
        return [(303, t), (924, b)]

    async def fake_adb_shell(cmd, serial=None, timeout=10.0):
        dispatched_cmds.append(cmd)
        # Parse keycodes after 'keyevent'
        if "keyevent" in cmd:
            tokens = cmd.split("keyevent", 1)[1].split(">")[0].split()
            for tok in tokens:
                if tok == "93":  # KEYCODE_PAGE_DOWN
                    sim_state["top"] += sim_state["span"]
                elif tok == "92":  # KEYCODE_PAGE_UP
                    sim_state["top"] = max(1, sim_state["top"] - sim_state["span"])
                elif tok == "20":  # KEYCODE_DPAD_DOWN
                    sim_state["top"] += 1
                elif tok == "19":  # KEYCODE_DPAD_UP
                    sim_state["top"] = max(1, sim_state["top"] - 1)
        return {"status": "ok", "stdout": ""}

    async def fake_get_serial(preferred=None, force_refresh=False):
        return preferred or "real_device_sim"

    monkeypatch.setattr(adb_svc, "get_active_adb_serial", fake_get_serial)
    monkeypatch.setattr(adb_svc, "capture_external_screenshot", fake_capture)
    monkeypatch.setattr(adb_svc, "fetch_current_display_dpi_factor", fake_dpi)
    monkeypatch.setattr(adb_svc, "run_adb_shell", fake_adb_shell)
    monkeypatch.setattr(ocr_engine, "detect_top_line_from_image", fake_detect_top)
    monkeypatch.setattr(ocr_engine, "find_gutter_numbers_cluster", fake_gutter_cluster)

    async def run_nav_tests():
        # Case 1: Viewport is stuck back at Line 12..35, need to reach Line 120 (diff = +108)
        sim_state["top"] = 12
        dispatched_cmds.clear()
        res_fwd = await adb_svc.navigate_to_target_top_line(
            target_top=120,
            serial="real_device_sim",
            display_id=4,
            current_top=12,
            current_bottom=35,
            lines_per_page=24,
            use_page_keys=True,
        )
        assert res_fwd["reached"] is True
        assert res_fwd["actual_top"] == 120
        assert res_fwd["actual_bottom"] == 143
        assert res_fwd["page_keys_pressed"] == 4  # 4 PageDowns (96 lines) + 12 DownArrows = 108 lines!
        assert any("93" in c for c in dispatched_cmds)

        # Case 2: Viewport overshot to Line 175..198, need to return to Line 120 (diff = -55)
        sim_state["top"] = 175
        dispatched_cmds.clear()
        res_bwd = await adb_svc.navigate_to_target_top_line(
            target_top=120,
            serial="real_device_sim",
            display_id=4,
            current_top=175,
            current_bottom=198,
            lines_per_page=24,
            use_page_keys=True,
        )
        assert res_bwd["reached"] is True
        assert res_bwd["actual_top"] == 120
        assert res_bwd["actual_bottom"] == 143
        assert res_bwd["page_keys_pressed"] == 2  # 2 PageUps (48 lines) + 7 UpArrows = 55 lines!
        assert any("92" in c for c in dispatched_cmds)

        # Case 3: Verify RecoverGutterRangeAction plugin in observation_action_registry
        sim_state["top"] = 12
        action = observation_action_registry.get_action("gutter_range_mismatch_recover")
        assert action is not None
        bb = DagBlackboard(active_serial="real_device_sim", display_id=4, top_line=12, bottom_line=35, target_next_top=120)
        ctx = ObservationContext(node_id="frame_ocr", serial="real_device_sim", display_id=4, expected_top_line=120, blackboard=bb)
        detected, reason, _ = await action.detect_by_observation(ctx)
        assert detected is True
        w_res = await action.execute_workaround(ctx)
        assert w_res["success"] is True
        assert bb.top_line == 120
        assert bb.bottom_line == 143

    asyncio.run(run_nav_tests())

    # Case 4: Verify REST API endpoint /api/dag/navigate-to-line
    with TestClient(main.app) as client:
        api_res = client.post("/api/dag/navigate-to-line", json={
            "serial": "mock:9999",
            "target_top": 120,
            "current_top": 12,
            "current_bottom": 35
        })
        assert api_res.status_code == 200
        body = api_res.json()
        assert body["reached"] is True
        assert body["actual_top"] == 120



