"""
Standalone DAG Node 3: Screen Capture & Acquisition
Captures lossless external display PNG frame into DagBlackboard and storage.
"""

import asyncio
import time
import struct
from datetime import datetime
from typing import Dict, Any, Optional
from pathlib import Path
from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot,
    dismiss_keyboard, fetch_current_display_dpi_factor, DEVICE_PROFILES, current_device_model
)
from services import state
import db


class FrameAcquireNode(BaseDagNode):
    step = "3"
    id = "frame_acquire"
    node_id = "frame_acquire"
    title = "3. Screen Capture & Acquisition"
    short_name = "Screen Capture"
    category = "capture_entire_markdown"
    accent_color = "#00ff9d"
    default_position = {"x": 500.0, "y": 140.0}
    default_config = {
        "mode": "desktop",
        "guard_keyboard": False,
        "fast_mode": True,
        "settle_delay_ms": 40,
        "save_frame": True
    }
    config = default_config.copy()

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        cfg = blackboard.config or self.get_config()

        # 1. Settle delay
        settle_ms = float(cfg.get("settle_delay_ms", 40)) / 1000.0
        if settle_ms > 0:
            await asyncio.sleep(settle_ms)

        # 2. Acquire lossless external screenshot
        t_cap_start = time.perf_counter()
        snap = await capture_external_screenshot(serial, max_cache_age_s=0.2, bypass_lock=True)
        cap_duration_ms = round((time.perf_counter() - t_cap_start) * 1000, 2)

        if not snap or len(snap) < 2000 or not snap.startswith(b"\x89PNG\r\n\x1a\n"):
            raise RuntimeError("Screen capture failed: invalid or empty image stream received from display.")

        # 3. Determine dimensions from PNG IHDR
        w_px, h_px = 1920, 1080
        if len(snap) >= 24:
            try:
                w_px, h_px = struct.unpack(">II", snap[16:24])
            except Exception:
                pass

        # 4. Save temporary screenshot to run gutter bounds detection
        temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
        with open(temp_calib, "wb") as f:
            f.write(snap)

        dpi_factor, active_dpi = await fetch_current_display_dpi_factor(serial, disp_id)
        t_det, b_det = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)

        # 5. Determine line bounds and page index
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES.get("pixel_8", {"lines_per_page": 24}))
        lpp = prof.get("lines_per_page", 24)

        target_top = (
            blackboard.top_line
            or (blackboard.config or {}).get("target_top")
            or state.latest_telemetry.get("current_top_line")
        )

        pid = blackboard.project_id or state.get_current_project_id()
        existing_frames = db.get_frames(pid) if pid else list(state.captured_frames.values())
        is_first_frame = (len(existing_frames) == 0) or (target_top == 1) or (blackboard.top_line == 1)

        if is_first_frame or not existing_frames:
            top_ln = 1
            bot_ln = b_det if (b_det > 0 and b_det > 1) else (1 + lpp - 1)
            page_idx = 1
        elif t_det > 0:
            top_ln = t_det
            bot_ln = b_det if b_det > 0 else (top_ln + lpp - 1)
            page_idx = len(existing_frames) + 1
        elif target_top and target_top > 0:
            top_ln = target_top
            bot_ln = top_ln + lpp - 1
            page_idx = len(existing_frames) + 1
        else:
            top_ln = 1
            bot_ln = lpp
            page_idx = len(existing_frames) + 1

        # Accurate arrow_count resolution for this frame
        if page_idx <= 1 or top_ln <= 1:
            arr_count = 0
        else:
            recorded_arrows = (
                state.orchestration_state.get("last_arrow_count")
                or state.dag_state["nodes"].get("arrow_down", {}).get("arrow_count")
                or blackboard.arrow_count
            )
            if recorded_arrows and recorded_arrows > 0:
                arr_count = recorded_arrows
            elif page_idx == 2 or top_ln <= (lpp + 2):
                arr_count = 49  # Calibrated initial down arrows for Page 1 -> 2
            else:
                arr_count = 24  # Calibrated step down arrows for Page N -> N+1

        # 6. Save image files
        now_dt = datetime.now()
        now_str = now_dt.strftime("%Y%m%d_%H%M%S_%f")[:19]
        fid = f"frame_{top_ln:05d}_{bot_ln:05d}_{now_str}"
        fn = f"{fid}.png"
        frame_path = state.FRAMES_DIR / fn
        with open(frame_path, "wb") as f:
            f.write(snap)

        raw_fn = f"raw_capture_p{page_idx:03d}_{int(time.time())}.png"
        raw_path = state.FRAMES_DIR / raw_fn
        with open(raw_path, "wb") as f:
            f.write(snap)

        blackboard.current_image_bytes = snap
        blackboard.latest_frame_bytes = snap
        blackboard.current_image_path = frame_path
        blackboard.frame_id = fid
        blackboard.page_index = page_idx
        blackboard.top_line = top_ln
        blackboard.bottom_line = bot_ln
        blackboard.arrow_count = arr_count
        pid = blackboard.project_id or state.get_current_project_id()

        # 6. Save to Database
        if pid:
            try:
                db.save_frame(
                    project_id=pid,
                    frame_id=fid,
                    filename=fn,
                    top_line=top_ln,
                    bottom_line=bot_ln,
                    page_index=page_idx,
                    file_size=len(snap),
                    status="acquired",
                    extracted_line_count=0,
                    model_used="Display Capture (Node 3)",
                    created_at=now_dt.isoformat(),
                    arrow_count=arr_count
                )
            except Exception as e:
                print(f"[FrameAcquireNode] db.save_frame note: {e}")

        # 7. Update in-memory captured_frames
        frame_info = {
            "frame_id": fid,
            "project_id": pid,
            "filename": fn,
            "top_line": top_ln,
            "bottom_line": bot_ln,
            "page_index": page_idx,
            "file_size": len(snap),
            "status": "acquired",
            "created_at": now_dt.isoformat(),
            "extracted_line_count": 0,
            "model_used": "Display Capture (Node 3)",
            "arrow_count": arr_count
        }
        state.captured_frames[fid] = frame_info

        # 8. Update Telemetry
        dpi_factor, active_dpi = await fetch_current_display_dpi_factor(serial, disp_id)
        disp_title = "MB16AMTR" if ("mb16amtr" in str(disp_id).lower() or len(str(disp_id)) > 10) else f"Display #{disp_id}"
        total_caps = state.latest_telemetry.get("capture_telemetry", {}).get("total_captures", 0) + 1

        state.latest_telemetry["capture_telemetry"] = {
            "status": "completed",
            "last_latency_ms": cap_duration_ms,
            "last_capture_time": now_dt.isoformat(),
            "display_id": str(disp_id),
            "display_name": disp_title,
            "resolution": f"{w_px}x{h_px}",
            "active_dpi": active_dpi,
            "dpi_factor": dpi_factor,
            "frame_bytes": len(snap),
            "cache_hit": cap_duration_ms < 60,
            "settle_delay_ms": int(settle_ms * 1000),
            "total_captures": total_caps,
            "page": page_idx,
            "error": None
        }
        state.latest_telemetry["current_page"] = page_idx
        state.latest_telemetry["current_top_line"] = top_ln
        state.latest_telemetry["current_bottom_line"] = bot_ln
        state.latest_telemetry["status_message"] = f"Frame #{page_idx} acquired ({w_px}x{h_px}, {round(len(snap)/1024, 1)} KB in {cap_duration_ms}ms) ✔"

        state.dag_state["nodes"]["frame_acquire"].update({
            "status": "completed",
            "page": page_idx,
            "filename": fn,
            "frame_id": fid,
            "file_size": len(snap),
            "resolution": f"{w_px}x{h_px}",
            "evaluator": "Display Frame Evaluator",
            "telemetry_insight": f"Frame {page_idx} captured ({w_px}x{h_px}, {round(len(snap)/1024, 1)} KB, {cap_duration_ms}ms) ✔",
            "error": None
        })

        # 9. Broadcast new_frame and telemetry to UI
        await state.ws_manager.broadcast({
            "type": "new_frame",
            "frame": frame_info,
            "data": frame_info
        })
        await state.ws_manager.broadcast({
            "type": "telemetry",
            "telemetry": state.latest_telemetry
        })
        try:
            from routers.orchestration import emit_dag_telemetry_event
            await emit_dag_telemetry_event(
                category="FRAME",
                message=f"DAG 2 • Captured Frame {page_idx} ({w_px}x{h_px}, {round(len(snap)/1024, 1)} KB, {cap_duration_ms}ms)",
                dag="capture_entire_markdown",
                node_id="frame_acquire",
                serial=serial,
                data=frame_info
            )
        except Exception:
            pass

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Acquired external display frame {page_idx} ({w_px}x{h_px})",
            data={
                "frame_id": fid,
                "page": page_idx,
                "filename": fn,
                "width": w_px,
                "height": h_px,
                "bytes_size": len(snap),
                "capture_ms": cap_duration_ms,
                "top_line": top_ln,
                "bottom_line": bot_ln
            }
        )
