import pytest
import sqlite3
from pathlib import Path
import db
from services import state

@pytest.fixture(autouse=True)
def clean_test_remnants():
    """
    Automatic fixture that captures existing project state before any test
    and cleans up all created projects, frames, and calibration artifacts after each test,
    restoring the user's active project.
    """
    orig_active = db.get_active_project()
    orig_projects = db.get_projects()
    orig_project_ids = {p["id"] for p in orig_projects}

    yield

    # Clean up any new projects created during test execution
    try:
        current_projects = db.get_projects()
        for p in current_projects:
            if p["id"] not in orig_project_ids or any(tag in p["name"] for tag in ("DAG ", "E2E ", "Test", "Synth")):
                db.delete_project(p["id"])

        # Restore original active project
        if orig_active:
            db.activate_project(orig_active["id"])
    except Exception as e:
        print(f"[conftest] Project cleanup error: {e}")

    # Remove temporary test png files and calibration artifacts
    frames_dir = state.FRAMES_DIR
    if frames_dir.exists():
        for pattern in ("calib_*.png", "dag_node*.png", "test_synthetic_*.png", "temp_scan_*.png"):
            for f in frames_dir.glob(pattern):
                try:
                    f.unlink(missing_ok=True)
                except Exception:
                    pass
