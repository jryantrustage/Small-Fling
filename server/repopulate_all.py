import asyncio
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from services.ocr_service import scan_image_with_minicpm
import db
from services import state

async def main():
    p = db.get_active_project()
    if not p:
        p = db.create_project("Matrix Capture")
    pid = p["id"]
    print("Active project ID:", pid)

    frames_to_process = [
        {
            "page_index": 1,
            "path": Path("storage/frames/raw_capture_p001_20261009_050315_047.png"),
            "expected_top": 1,
            "fid": "frame_00001_00024_20261009_050319_344",
            "top": 1,
            "bot": 24,
            "created_at": "2026-10-09T05:03:19.346838"
        },
        {
            "page_index": 2,
            "path": Path("storage/frames/raw_capture_p002_20261009_050428_374.png"),
            "expected_top": 74,
            "fid": "frame_00074_00097_20261009_050432_167",
            "top": 74,
            "bot": 97,
            "created_at": "2026-10-09T05:04:32.169152"
        },
        {
            "page_index": 3,
            "path": Path("storage/frames/raw_capture_p003_20261009_050524_669.png"),
            "expected_top": 98,
            "fid": "frame_00098_00121_20261009_050528_341",
            "top": 98,
            "bot": 121,
            "created_at": "2026-10-09T05:05:28.342999"
        }
    ]

    all_frames = {}
    all_lines = {}

    for item in frames_to_process:
        print(f"Scanning Pg {item['page_index']} ({item['path'].name}) with expected_top={item['expected_top']}...")
        res = await scan_image_with_minicpm(item["path"], expected_top=item["expected_top"])
        lines = res.get("lines", [])
        print(f"  Extracted {len(lines)} lines")

        frame_info = {
            "frame_id": item["fid"],
            "project_id": pid,
            "filename": f"{item['fid']}.png",
            "top_line": item["top"],
            "bottom_line": item["bot"],
            "page_index": item["page_index"],
            "file_size": item["path"].stat().st_size,
            "status": "processed",
            "created_at": item["created_at"],
            "extracted_line_count": len(lines),
            "ocr_top_line": res.get("top_line", item["top"]),
            "ocr_bottom_line": res.get("bottom_line", item["bot"]),
            "ocr_extracted_count": len(lines),
            "bounding_boxes": res.get("bounding_boxes", {}),
            "model_used": res.get("model_used", "MiniCPM-V (minicpm-v:latest)"),
            "token_usage": {"prompt_tokens": 0, "candidates_tokens": 0, "total_tokens": 0}
        }
        all_frames[item["fid"]] = frame_info

        # Save to SQLite frames
        db.save_frame(
            pid, item["fid"], frame_info["filename"],
            item["top"], item["bot"], item["page_index"],
            frame_info["file_size"], "processed", len(lines),
            0.0, frame_info["token_usage"], frame_info["bounding_boxes"],
            frame_info["model_used"], item["created_at"]
        )

        for l in lines:
            ln = l.get("line_number")
            if ln and ln > 0:
                all_lines[ln] = {
                    "line_number": ln,
                    "gutter_number": ln,
                    "text": l.get("text", ""),
                    "is_blank": not bool(l.get("text", "").strip()),
                    "is_wrapped": l.get("is_wrapped", False),
                    "wrapped_line_count": l.get("wrapped_line_count", 1),
                    "status": "verified",
                    "confidence": 0.98,
                    "frame_id": item["fid"],
                    "notes": f"MiniCPM-V OCR ({frame_info['model_used']})",
                    "updated_at": item["created_at"]
                }

    # Save to SQLite document_lines
    db.save_document_lines(pid, all_lines)

    # Save to DOCUMENT_FILE
    state.captured_frames.clear()
    state.captured_frames.update(all_frames)
    state.document_lines.clear()
    for k, v in all_lines.items():
        state.document_lines[k] = v
    state.save_persisted_state()

    print(f"DONE! Processed {len(all_frames)} frames, {len(all_lines)} total lines.")
    print("Page 1 first 5 lines:")
    for k in sorted(all_lines.keys())[:5]:
        print(f"  Ln {k}: {repr(all_lines[k]['text'])}")

if __name__ == "__main__":
    asyncio.run(main())
