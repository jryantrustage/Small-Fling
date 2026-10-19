"""
Standalone DAG Node 3: Screen Capture & Acquisition
Captures lossless external display PNG frame into DagBlackboard and storage.
"""

import asyncio
import time
import struct
from typing import Dict, Any, Optional
from pathlib import Path
from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services.adb_service import (
    get_active_adb_serial, detect_external_display_id, capture_external_screenshot,
    dismiss_keyboard
)
from services import state
import db


class FrameAcquireNode(BaseDagNode):
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

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        serial = blackboard.active_serial or await get_active_adb_serial()
        disp_id = blackboard.display_id or await detect_external_display_id(serial)
        cfg = blackboard.config or self.default_config

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

        # 4. Save to disk
        pid = blackboard.project_id or state.get_current_project_id()
        page_idx = state.orchestration_state.get("page", 1)
        raw_fn = f"raw_capture_p{page_idx:03d}_{int(time.time())}.png"
        raw_path = state.FRAMES_DIR / raw_fn
        with open(raw_path, "wb") as f:
            f.write(snap)

        temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
        with open(temp_calib, "wb") as f:
            f.write(snap)

        blackboard.current_image_bytes = snap
        blackboard.latest_frame_bytes = snap
        blackboard.current_image_path = raw_path

        state.dag_state["nodes"]["frame_acquire"].update({
            "status": "completed",
            "page": page_idx,
            "filename": raw_fn,
            "resolution": f"{w_px}x{h_px}",
            "evaluator": "Display Frame Evaluator",
            "telemetry_insight": f"Frame {page_idx} captured ({w_px}x{h_px}, {round(len(snap)/1024, 1)} KB, {cap_duration_ms}ms) ✔",
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Acquired external display frame {page_idx} ({w_px}x{h_px})",
            data={
                "page": page_idx,
                "filename": raw_fn,
                "width": w_px,
                "height": h_px,
                "bytes_size": len(snap),
                "capture_ms": cap_duration_ms
            }
        )
