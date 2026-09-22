import os
import sys
import json
import time
import asyncio
import requests
import websockets
import numpy as np
import cv2

SERVER_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws"

def create_synthetic_frame_image(filepath: str):
    """Creates a synthetic 1920x1080 screenshot matching the Teams code viewer mock."""
    img = np.zeros((1080, 1920, 3), dtype=np.uint8)
    # Dark editor background #161B22
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
        # Gutter line number
        cv2.putText(img, str(ln_num), (110, y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 150, 150), 2)
        # Text content (wrapped if long)
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

    cv2.imwrite(filepath, img)
    return filepath

import pytest
@pytest.mark.asyncio
async def test_full_pipeline():
    print("=== 1. Testing Server Health ===")
    res = requests.get(f"{SERVER_URL}/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print(f"Health OK: {res.json()['status']}")

    print("\n=== 2. Testing /api/next-page-line endpoint ===")
    res = requests.get(f"{SERVER_URL}/api/next-page-line")
    assert res.status_code == 200, f"Failed next-page-line: {res.text}"
    data = res.json()
    print(f"Next Page Line data: {data}")
    assert "next_page_first_line" in data

    from pathlib import Path
    frames_dir = Path(__file__).parent / "storage" / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    test_img_path = str(frames_dir / "test_synthetic_p09.png")
    create_synthetic_frame_image(test_img_path)

    async with websockets.connect(WS_URL) as ws:
        print("Connected to WebSocket successfully!")
        # Send a ping
        await ws.send(json.dumps({"type": "ping"}))
        pong = await asyncio.wait_for(ws.recv(), timeout=5.0)
        print(f"Received WebSocket response: {pong}")
        assert "pong" in pong

        print("\n=== 4. Uploading Frame with sync=false (Manual Review Flow) ===")
        with open(test_img_path, "rb") as f:
            upload_res = requests.post(
                f"{SERVER_URL}/api/upload-frame",
                files={"file": ("test_synthetic_p09.png", f, "image/png")},
                data={"top_line": "114", "bottom_line": "151", "page_index": "9", "sync": "false"}
            )
        assert upload_res.status_code == 200, f"Upload failed: {upload_res.text}"
        upload_data = upload_res.json()
        print(f"Upload response: {upload_data}")
        frame_id = upload_data["frame_id"]

        # Verify WebSocket received new_frame event
        ws_msg_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        ws_msg = json.loads(ws_msg_raw)
        print(f"WebSocket received pushed frame event: {ws_msg.get('type')}, frame_id: {ws_msg.get('frame', {}).get('frame_id')}")
        assert ws_msg.get("type") == "new_frame"
        assert ws_msg.get("frame", {}).get("frame_id") == frame_id

        print("\n=== 5. Testing Next Page Line after Upload ===")
        npl_res = requests.get(f"{SERVER_URL}/api/next-page-line")
        npl_data = npl_res.json()
        print(f"Next page line returned: {npl_data}")
        assert npl_data["next_page_first_line"] == 152 or npl_data["last_bottom_line"] >= 151

        print(f"\n=== 6. Testing 'Send Image for OCR Scan' (/api/frames/{frame_id}/scan) ===")
        scan_res = requests.post(f"{SERVER_URL}/api/frames/{frame_id}/scan")
        assert scan_res.status_code == 200, f"Scan failed: {scan_res.text}"
        scan_data = scan_res.json()
        print(f"Scan status: {scan_data['status']}")
        print(f"Detected top line: {scan_data['top_line']}, bottom line: {scan_data['bottom_line']}")
        print(f"Extracted lines count: {len(scan_data['lines'])}")

        # Verify Bounding Boxes
        bboxes = scan_data.get("bounding_boxes", {})
        print(f"First line bbox (Green): {bboxes.get('first_line')}")
        print(f"Last line bbox (Red): {bboxes.get('last_line')}")
        print(f"Wrapped lines bboxes (Yellow): {len(bboxes.get('wrapped_lines', []))} boxes")

        assert bboxes.get("first_line") is not None, "First line bbox (Green) must not be null"
        assert bboxes.get("last_line") is not None, "Last line bbox (Red) must not be null"
        assert len(bboxes.get("wrapped_lines", [])) >= 1, "Wrapped lines bboxes (Yellow) should be detected"

        # Verify WebSocket broadcasted ocr_completed
        ws_ocr_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
        print(f"WebSocket received ocr_completed event: {ws_ocr_msg.get('type')}")
        assert ws_ocr_msg.get("type") == "ocr_completed"

    print("\n=== ALL AUTOMATION TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    asyncio.run(test_full_pipeline())
