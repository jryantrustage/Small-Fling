import sys, json
from pathlib import Path
from PIL import Image, ImageDraw

# Add server to sys.path
server_dir = Path(__file__).resolve().parent.parent / "server"
sys.path.insert(0, str(server_dir))

import db
import config
from services import state

def setup_project():
    proj_name = "Matrix_15_Captures_Delete_Test"
    
    # Check if exists and delete old
    for p in db.get_projects():
        if p["name"] == proj_name or "15_Captures" in p["name"]:
            db.delete_project(p["id"])

    proj = db.create_project(proj_name, "Thorough 15-capture deletion test project", 1000)
    pid = proj["id"]
    db.activate_project(pid)

    storage_frames = Path(config.FRAMES_DIR)
    storage_frames.mkdir(parents=True, exist_ok=True)

    frames = []
    lines_dict = {}

    for i in range(1, 16):
        top_ln = (i - 1) * 30 + 1
        bottom_ln = i * 30
        fid = f"frame_p{i:02d}_{top_ln:04d}_{bottom_ln:04d}"
        fn = f"{fid}.png"

        # Create distinct valid image
        img = Image.new("RGB", (480, 320), color=(20 + i * 5, 30 + i * 8, 40 + i * 10))
        d = ImageDraw.Draw(img)
        d.text((20, 20), f"Frame {i}: Lines {top_ln}-{bottom_ln}", fill=(255, 255, 255))
        img_path = storage_frames / fn
        img.save(img_path)

        # Create raw capture
        raw_path = storage_frames / f"raw_capture_p{i:03d}_{fid}.png"
        img.save(raw_path)

        frame_data = db.save_frame(
            project_id=pid,
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
        frames.append(frame_data)

        for ln in range(top_ln, bottom_ln + 1):
            lines_dict[ln] = {
                "line_number": ln,
                "text": f"Line {ln}: Verified content from frame {i}",
                "confidence": 0.99,
                "frame_id": fid,
                "is_verified": 1
            }

    db.save_document_lines(pid, lines_dict)
    state.load_persisted_state()

    print(json.dumps({
        "status": "ok",
        "project_id": pid,
        "project_name": proj_name,
        "frame_count": len(frames),
        "line_count": len(lines_dict)
    }))

if __name__ == "__main__":
    setup_project()
