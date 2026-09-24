try:
    from server import main
except ImportError:
    import main

from fastapi.testclient import TestClient
import pytest
import numpy as np
import cv2

client = TestClient(main.app)

def create_synthetic_frame_image() -> bytes:
    """Creates a synthetic 1920x1080 screenshot matching the Teams code viewer mock."""
    img = np.zeros((1080, 1920, 3), dtype=np.uint8)
    img[:] = (34, 27, 22)

    # Top title bar
    cv2.rectangle(img, (0, 0), (1920, 48), (24, 18, 14), -1)
    cv2.putText(img, "Matrix_main.md", (20, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1)

    # Left gutter line numbers
    lines = [
        (114, '"value": "Initial Disclosure and Fraud Statement"'),
        (115, '"status": "ok"'),
        (116, '"address": "02"'),
        (127, '"value": "The final step will be to record your voice signature. To begin, I will share a brief disclosure with you and gather your voice signature. Item 1: You have the right to apply for this coverage and authorize payment in writing."'),
        (133, '"value": "Note: per discussion with Mandy authun (compliance), we can remove the statement for all states except New York."'),
        (140, '"address": "05"'),
        (151, '"value": "See Fraud language tab and populate the appropriate fraud language"')
    ]

    y_start = 120
    line_pitch = 120
    for idx, (ln_num, text) in enumerate(lines):
        y = y_start + idx * line_pitch
        cv2.putText(img, str(ln_num), (110, y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 150, 150), 2)
        if len(text) > 80:
            part1 = text[:75]
            part2 = text[75:150]
            part3 = text[150:]
            cv2.putText(img, part1, (220, y), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (230, 230, 230), 1)
            if part2:
                cv2.putText(img, part2, (220, y + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (230, 230, 230), 1)
            if part3:
                cv2.putText(img, part3, (220, y + 50), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (230, 230, 230), 1)
        else:
            cv2.putText(img, text, (220, y), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (230, 230, 230), 1)

    _, buf = cv2.imencode(".png", img)
    return buf.tobytes()

def test_full_pipeline():
    # 1. Health check
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    assert res.json()["status"] == "healthy"

    # 2. Next page line
    res = client.get("/api/next-page-line")
    assert res.status_code == 200, f"Failed next-page-line: {res.text}"
    assert "next_page_first_line" in res.json()

    # 3. WebSocket ping/pong
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "ping"})
        pong = ws.receive_json()
        assert pong.get("type") == "pong"

    # 4. Ensure an active project exists
    proj_res = client.post(
        "/api/projects",
        json={"name": "E2E Synth Project", "description": "Automated E2E Verification"}
    )
    assert proj_res.status_code == 200

    # 5. Upload synthetic frame
    png_bytes = create_synthetic_frame_image()
    upload_res = client.post(
        "/api/upload-frame",
        files={"file": ("test_synthetic_p09.png", png_bytes, "image/png")},
        data={"top_line": "114", "bottom_line": "151", "page_index": "9", "sync": "false"}
    )
    assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
    upload_data = upload_res.json()
    frame_id = upload_data["frame_id"]

    # 6. Test Next Page Line after upload
    npl_res = client.get("/api/next-page-line")
    assert npl_res.status_code == 200
    npl_data = npl_res.json()
    assert npl_data["next_page_first_line"] == 152 or npl_data["last_bottom_line"] >= 151

    # 7. OCR scan and bounding box verification
    scan_res = client.post(f"/api/frames/{frame_id}/scan")
    assert scan_res.status_code == 200, f"Scan failed: {scan_res.text}"
    scan_data = scan_res.json()
    bboxes = scan_data.get("bounding_boxes", {})
    assert bboxes.get("first_line") is not None, "First line bbox (Green) must not be null"
    assert bboxes.get("last_line") is not None, "Last line bbox (Red) must not be null"
    assert len(bboxes.get("wrapped_lines", [])) >= 1, "Wrapped lines bboxes (Yellow) should be detected"

    # 8. Clean up
    client.post("/api/frames/purge")

