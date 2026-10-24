import asyncio
import io
import json
import zipfile
import pytest
from pathlib import Path
from PIL import Image

import db
import config
from services import state
from routers.projects import router as projects_router
from routers.frames_document import router as frames_router

@pytest.fixture(autouse=True)
def setup_db():
    db.init_db()

@pytest.mark.asyncio
async def test_markdown_export():
    from routers.projects import export_project_markdown

    # Create dummy project
    proj = db.create_project(name="Test Export MD Project", description="file_test.md")
    pid = proj["id"]

    # Insert document lines
    db.save_document_line(pid, 1, "# First Line Header", verified=True)
    db.save_document_line(pid, 2, "Second line paragraph", verified=True)
    db.save_document_line(pid, 4, "Fourth line (gap on 3)", verified=True)

    resp = await export_project_markdown(pid)
    assert resp.status_code == 200
    content = resp.body.decode("utf-8")
    lines = content.split("\n")
    assert lines[0] == "# First Line Header"
    assert lines[1] == "Second line paragraph"
    assert lines[2] == ""  # Gap line preserved
    assert lines[3] == "Fourth line (gap on 3)"

    # Clean up
    db.delete_project(pid)

@pytest.mark.asyncio
async def test_project_zip_export_and_import():
    from routers.projects import export_project_zip, import_project_zip
    from starlette.datastructures import UploadFile

    # 1. Create project with frames and lines
    proj = db.create_project(name="Test Zip Export Project", description="app.py")
    pid = proj["id"]

    # Create a dummy frame file on disk
    dummy_img_path = config.FRAMES_DIR / f"frame_{pid}_001.png"
    with Image.new("RGB", (1920, 1080), color=(10, 20, 30)) as im:
        im.save(dummy_img_path, format="PNG")

    db.save_frame(
        project_id=pid,
        frame_id=f"frame_{pid}_001",
        filename=dummy_img_path.name,
        top_line=1,
        bottom_line=48,
        page_index=1,
        status="processed",
        extracted_line_count=48
    )

    db.save_document_line(pid, 1, "def test_func():", verified=True)
    db.save_document_line(pid, 2, "    return 42", verified=True)

    # 2. Export project to zip
    resp = await export_project_zip(pid)
    assert resp.status_code == 200
    assert resp.media_type == "application/zip"
    zip_bytes = resp.body

    # Verify zip content
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        namelist = zf.namelist()
        assert "project_data.json" in namelist
        assert any(n.endswith(".md") for n in namelist)
        assert f"frames/{dummy_img_path.name}" in namelist

        raw_meta = zf.read("project_data.json").decode("utf-8")
        meta = json.loads(raw_meta)
        assert meta["project"]["name"] == "Test Zip Export Project"
        assert len(meta["frames"]) == 1
        assert len(meta["document_lines"]) == 2

    # 3. Test import using UploadFile
    upload_file = UploadFile(
        filename="test_project_archive.zip",
        file=io.BytesIO(zip_bytes)
    )

    import_resp = await import_project_zip(upload_file)
    assert import_resp["status"] == "success"
    imported_proj = import_resp["project"]
    new_pid = imported_proj["id"]

    # Verify imported database state
    imported_frames = db.get_frames(new_pid)
    assert len(imported_frames) == 1
    imported_lines = db.get_document_lines(new_pid)
    assert len(imported_lines) == 2
    assert imported_lines[1]["text"] == "def test_func():"
    assert imported_lines[2]["text"] == "    return 42"

    # Clean up
    db.delete_project(pid)
    db.delete_project(new_pid)
    dummy_img_path.unlink(missing_ok=True)

@pytest.mark.asyncio
async def test_frame_thumbnail_generation():
    from routers.frames_document import get_frame_thumbnail

    # Create dummy source image
    test_frame_id = "test_thumb_frame_001"
    source_img_path = config.FRAMES_DIR / f"{test_frame_id}.png"
    with Image.new("RGB", (1920, 1080), color=(50, 100, 150)) as im:
        im.save(source_img_path, format="PNG")

    try:
        resp = await get_frame_thumbnail(test_frame_id)
        assert resp.status_code == 200
        assert resp.media_type == "image/jpeg"
        assert "public, max-age=86400" in resp.headers.get("Cache-Control", "")

        # Verify generated thumbnail on disk
        thumb_file = db.THUMBNAILS_DIR / f"{test_frame_id}.jpg"
        assert thumb_file.exists()
        with Image.open(thumb_file) as im:
            # Aspect ratio 16:9 -> 384x216
            assert im.size == (384, 216)
    finally:
        source_img_path.unlink(missing_ok=True)
        (db.THUMBNAILS_DIR / f"{test_frame_id}.jpg").unlink(missing_ok=True)
