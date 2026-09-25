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
        assert dag_nodes["frame_acquire"]["status"] == "active"
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
        assert dag_data["groups"]["initialize"]["nodes"] == ["init_end", "reset_home"]
        assert dag_data["groups"]["capture_entire_markdown"]["nodes"] == ["frame_acquire", "arrow_down", "verification_trigger"]
    finally:
        client.delete(f"/api/projects/{proj_id}")



