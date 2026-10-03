import os
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient

import db
import config
from main import app
from services import state

client = TestClient(app)

def test_delete_project_with_15_captures():
    # 1. Create a project
    proj = db.create_project("Project_15_Captures_Test", "Automated test project with 15 captured frames", 1000)
    proj_id = proj["id"]
    assert proj_id is not None
    db.activate_project(proj_id)
    state.load_persisted_state()

    storage_frames = Path(config.FRAMES_DIR)
    storage_frames.mkdir(parents=True, exist_ok=True)

    # 2. Generate 15 capture frames, images, and document lines
    frame_filenames = []
    lines_dict = {}
    for i in range(1, 16):
        top_ln = (i - 1) * 30 + 1
        bottom_ln = i * 30
        fid = f"frame_test_{i:03d}_{top_ln:05d}_{bottom_ln:05d}"
        fn = f"{fid}.png"
        frame_filenames.append(fn)

        # Create realistic dummy image file on disk in frames storage
        img_path = storage_frames / fn
        img = Image.new("RGB", (320, 240), color=(15, 23, 42))
        img.save(img_path)
        assert img_path.exists()

        # Also create a raw capture file matching the pattern
        raw_path = storage_frames / f"raw_capture_p{i:03d}_{fid}.png"
        raw_img = Image.new("RGB", (320, 240), color=(10, 15, 30))
        raw_img.save(raw_path)
        assert raw_path.exists()

        # Save frame in DB
        db.save_frame(
            project_id=proj_id,
            frame_id=fid,
            filename=fn,
            top_line=top_ln,
            bottom_line=bottom_ln,
            page_index=i,
            file_size=img_path.stat().st_size,
            status="processed",
            extracted_line_count=30,
            model_used="gemini-3.6-flash"
        )

        for ln in range(top_ln, bottom_ln + 1):
            lines_dict[ln] = {
                "line_number": ln,
                "text": f"Line {ln}: Verified content from frame {i}",
                "confidence": 0.99,
                "frame_id": fid,
                "is_verified": 1
            }

    db.save_document_lines(proj_id, lines_dict)
    state.load_persisted_state()

    # 3. Verify the setup before deletion
    p = db.get_project(proj_id)
    assert p is not None
    assert p["frame_count"] == 15
    assert p["line_count"] == 450
    assert len(db.get_frames(proj_id)) == 15
    assert len(db.get_document_lines(proj_id)) == 450
    assert len(state.captured_frames) == 15
    for fn in frame_filenames:
        assert (storage_frames / fn).exists()

    # 4. Perform Delete via DELETE /api/projects/{project_id}
    res = client.delete(f"/api/projects/{proj_id}")
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["status"] == "success"
    assert res_data["deleted_project_id"] == proj_id

    # 5. Verify database records are thoroughly cleaned up
    assert db.get_project(proj_id) is None
    assert db.get_frames(proj_id) == []
    assert db.get_document_lines(proj_id) == {}
    
    with db.get_connection() as conn:
        c = conn.cursor()
        assert c.execute("SELECT COUNT(*) FROM frames WHERE project_id = ?;", (proj_id,)).fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM document_lines WHERE project_id = ?;", (proj_id,)).fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM project_telemetry WHERE project_id = ?;", (proj_id,)).fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM projects WHERE id = ?;", (proj_id,)).fetchone()[0] == 0

    # 6. Verify all 15 image files and raw captures are deleted from storage
    for fn in frame_filenames:
        assert not (storage_frames / fn).exists(), f"Frame file {fn} still exists!"
        stem = Path(fn).stem
        assert list(storage_frames.glob(f"*{stem}*")) == [], f"Associated files for {stem} still exist!"

    # 7. Verify state reload
    state.load_persisted_state()
    if db.get_active_project() is None:
        assert len(state.captured_frames) == 0
        assert len(state.document_lines) == 0
