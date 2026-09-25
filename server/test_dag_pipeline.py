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
