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
    db.activate_project(proj_id)
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

    # 7. Verify state reload and idempotent repeat delete
    state.load_persisted_state()
    if db.get_active_project() is None:
        assert len(state.captured_frames) == 0
        assert len(state.document_lines) == 0

    res_repeat = client.delete(f"/api/projects/{proj_id}")
    assert res_repeat.status_code == 200
    assert res_repeat.json()["status"] == "success"


def test_project_and_markdown_download_counters():
    proj = db.create_project("Counter_Test_Project", "Verify download counters", 100)
    proj_id = proj["id"]
    db.activate_project(proj_id)
    db.save_document_lines(proj_id, {
        1: {"line_number": 1, "text": "# Heading 1", "confidence": 0.99, "frame_id": "f1", "is_verified": 1},
        2: {"line_number": 2, "text": "Body text", "confidence": 0.99, "frame_id": "f1", "is_verified": 1},
    })
    state.load_persisted_state()

    initial = db.get_project(proj_id)
    assert initial["project_download_count"] == 0
    assert initial["markdown_download_count"] == 0

    # 1. Export markdown via project endpoint
    md_res1 = client.get(f"/api/projects/{proj_id}/export-markdown")
    assert md_res1.status_code == 200
    assert md_res1.headers.get("x-markdown-download-count") == "1"
    assert db.get_project(proj_id)["markdown_download_count"] == 1

    # 2. Export markdown via active document endpoint
    md_res2 = client.get("/api/document/export-markdown")
    assert md_res2.status_code == 200
    assert md_res2.headers.get("x-markdown-download-count") == "2"
    assert db.get_project(proj_id)["markdown_download_count"] == 2

    # 3. Export project zip archive twice
    zip_res1 = client.get(f"/api/projects/{proj_id}/export")
    assert zip_res1.status_code == 200
    assert zip_res1.headers.get("x-project-download-count") == "1"
    assert db.get_project(proj_id)["project_download_count"] == 1

    zip_res2 = client.get(f"/api/projects/{proj_id}/export")
    assert zip_res2.status_code == 200
    assert zip_res2.headers.get("x-project-download-count") == "2"

    # Verify /api/projects list includes both counters
    list_res = client.get("/api/projects")
    assert list_res.status_code == 200
    matched = next((p for p in list_res.json() if p["id"] == proj_id), None)
    assert matched is not None
    assert matched["project_download_count"] == 2
    assert matched["markdown_download_count"] == 2

    # Clean up test project
    del_res = client.delete(f"/api/projects/{proj_id}")
    assert del_res.status_code == 200


def test_multipart_bundle_storage_activation_and_import_export():
    import io
    import json
    import zipfile

    storage_frames = Path(config.FRAMES_DIR)
    storage_frames.mkdir(parents=True, exist_ok=True)
    bundle_name = "DIXUI_impact_26-11-05-9-43pm"
    bundle_id = "bundle_dixui_impact_26-11-05-9-43pm"

    # Clean up any leftover bundle from prior runs
    db.delete_bundle_projects(bundle_id)

    created_part_ids = []
    for part_idx in range(1, 4):
        part_file = f"{bundle_name}_part{part_idx}.md"
        proj = db.create_project(
            name=part_file,
            description=f"File: {part_file}",
            target_total_lines=100 * part_idx,
            bundle_id=bundle_id,
            bundle_name=bundle_name,
            part_number=part_idx,
            total_parts=3,
            part_file_name=part_file,
        )
        pid = proj["id"]
        created_part_ids.append(pid)

        fid = f"bundle_p{part_idx}_frame_001"
        fn = f"{fid}.png"
        img_path = storage_frames / fn
        Image.new("RGB", (200, 120), color=(20 * part_idx, 40, 80)).save(img_path)

        db.save_frame(
            project_id=pid,
            frame_id=fid,
            filename=fn,
            top_line=1,
            bottom_line=20,
            page_index=1,
            file_size=img_path.stat().st_size,
            status="processed",
            extracted_line_count=20,
        )
        lines = {
            ln: {
                "line_number": ln,
                "text": f"Part {part_idx} Line {ln} content",
                "confidence": 0.98,
                "frame_id": fid,
                "is_verified": 1 if ln <= 15 else 0,
            }
            for ln in range(1, 21)
        }
        db.save_document_lines(pid, lines)
        db.save_project_telemetry(
            pid,
            {"current_page": part_idx, "current_top_line": 1, "current_bottom_line": 20},
            {"total_tokens": 100 * part_idx, "total_api_calls": part_idx},
        )
        md_disk_path = db.sync_project_part_markdown_file(pid)
        assert md_disk_path is not None and md_disk_path.exists()
        assert f"Part {part_idx} Line 1 content" in md_disk_path.read_text(encoding="utf-8")

    # Verify /api/projects returns bundle metadata and verified/total line counts
    list_res = client.get("/api/projects")
    assert list_res.status_code == 200
    bundle_parts = [p for p in list_res.json() if p.get("bundle_id") == bundle_id]
    assert len(bundle_parts) == 3
    for p in bundle_parts:
        assert p["frame_count"] == 1
        assert p["total_lines"] == 20
        assert p["verified_lines"] == 15

    # Activate Part 2 and verify full context + OCR inspector data loads immediately
    part2_id = created_part_ids[1]
    act_res = client.post(f"/api/projects/{part2_id}/activate")
    assert act_res.status_code == 200
    act_data = act_res.json()
    assert act_data["project"]["id"] == part2_id
    assert len(act_data["frames"]) == 1
    assert act_data["frames"][0]["frame_id"] == "bundle_p2_frame_001"
    assert act_data["document"]["total_lines"] == 20
    assert any("Part 2 Line 1 content" in ln["text"] for ln in act_data["document"]["lines"])

    ocr_res = client.get("/api/ocr/inspect?image_id=bundle_p2_frame_001")
    assert ocr_res.status_code == 200
    ocr_data = ocr_res.json()
    assert ocr_data["image_id"] == "bundle_p2_frame_001"
    assert ocr_data["lines_count"] == 20
    assert len(ocr_data["lines"]) == 20
    assert len(ocr_data["bounding_boxes"]["gutter_boxes"]) == 20

    # Export the multi-part bundle ZIP archive
    export_res = client.get(f"/api/projects/bundle/{bundle_id}/export")
    assert export_res.status_code == 200
    zip_bytes = export_res.content
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = zf.namelist()
        assert "project_data.json" in names
        assert f"parts/{bundle_name}_part1.md" in names
        assert f"parts/{bundle_name}_part2.md" in names
        assert f"parts/{bundle_name}_part3.md" in names
        manifest = json.loads(zf.read("project_data.json").decode("utf-8"))
        assert manifest["is_bundle"] is True
        assert manifest["total_parts_count"] == 3
        assert len(manifest["parts"]) == 3

    # Delete the entire bundle
    del_bundle_res = client.delete(f"/api/projects/bundle/{bundle_id}")
    assert del_bundle_res.status_code == 200
    assert len(db.get_bundle_projects(bundle_id)) == 0

    # Re-import the multi-part bundle ZIP archive
    import_res = client.post(
        "/api/projects/import",
        files={"file": (f"{bundle_name}_bundle.zip", zip_bytes, "application/zip")},
    )
    assert import_res.status_code == 200
    imp_data = import_res.json()
    assert imp_data["status"] == "success"
    assert imp_data["is_bundle"] is True
    assert imp_data["parts_count"] == 3

    restored_parts = db.get_bundle_projects(bundle_id)
    assert len(restored_parts) == 3
    for rp in restored_parts:
        assert rp["frame_count"] == 1
        assert rp["total_lines"] == 20
        assert rp["verified_lines"] == 15

    # Clean up restored bundle
    client.delete(f"/api/projects/bundle/{bundle_id}")


