import pytest
import requests
import json

SERVER_URL = "http://127.0.0.1:8000"

def test_dag_and_calibration_lifecycle():
    # 1. Create a new project
    proj_res = requests.post(
        f"{SERVER_URL}/api/projects",
        json={"name": "DAG Test Markdown", "description": "Deterministic Key Flow", "target_total_lines": 0}
    )
    assert proj_res.status_code == 200
    proj_data = proj_res.json()
    proj_id = proj_data["id"]
    print(f"Created project {proj_id}")

    # 2. Check DAG state (with automated calibration, init_end immediately finishes or is active)
    dag_res = requests.get(f"{SERVER_URL}/api/dag/status")
    assert dag_res.status_code == 200
    dag_data = dag_res.json()["dag"]
    assert "init_end" in dag_data["nodes"]
    assert dag_data["nodes"]["init_end"]["status"] in ("active", "completed")

    # 3. Calibrate End via Ctrl+End synthetic frame
    from pathlib import Path
    test_img_path = Path(__file__).parent / "storage" / "frames" / "test_synthetic_p09.png"
    if not test_img_path.exists():
        test_img_path.parent.mkdir(parents=True, exist_ok=True)
        import cv2, numpy as np
        dummy = np.zeros((1080, 1920, 3), dtype=np.uint8)
        cv2.putText(dummy, "151", (110, 500), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        cv2.imwrite(str(test_img_path), dummy)

    with open(test_img_path, "rb") as f:
        calib_res = requests.post(
            f"{SERVER_URL}/api/projects/{proj_id}/calibrate-end",
            files={"file": ("test_synthetic_p09.png", f, "image/png")}
        )
    assert calib_res.status_code == 200
    calib_data = calib_res.json()
    print(f"Ctrl+End Calibration: total_lines = {calib_data['total_lines']}")
    assert calib_data["total_lines"] >= 151

    # 4. Verify Home via Ctrl+Home synthetic frame
    with open(test_img_path, "rb") as f:
        home_res = requests.post(
            f"{SERVER_URL}/api/projects/{proj_id}/verify-home",
            files={"file": ("test_synthetic_p09.png", f, "image/png")}
        )
    assert home_res.status_code == 200
    home_data = home_res.json()
    print(f"Ctrl+Home Verification: {home_data}")
    assert "verified" in home_data

    # 5. Verify DAG updated
    dag_res2 = requests.get(f"{SERVER_URL}/api/dag/status")
    assert dag_res2.status_code == 200
    dag_nodes = dag_res2.json()["dag"]["nodes"]
    assert dag_nodes["init_end"]["status"] == "completed"
    assert dag_nodes["reset_home"]["status"] == "completed"
    assert dag_nodes["frame_acquire"]["status"] == "active"
    print("DAG verified through End Scan and Home Reset!")
