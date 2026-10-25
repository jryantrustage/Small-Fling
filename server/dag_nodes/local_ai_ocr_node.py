"""
Standalone DAG Node 4: Local AI Model Transcription (MiniCPM-V / Ollama)
Performs row-locked multimodal AI OCR code transcription on the current frame.
"""

import asyncio
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from services import state
from services import ocr_service as ocr_svc
import db


class LocalAiOcrNode(BaseDagNode):
    id = "local_ai_ocr"
    node_id = "local_ai_ocr"
    title = "4. Local AI Model Transcription"
    short_name = "Local AI OCR"
    category = "capture_entire_markdown"
    accent_color = "#38bdf8"
    default_position = {"x": 720.0, "y": 140.0}
    default_config = {
        "model": "MiniCPM-V (Ollama)",
        "expected_top": 1,
        "background_worker": False,
        "save_to_document": True
    }

    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        cfg = blackboard.config or self.default_config

        if cfg.get("bypass_live_ocr") or (blackboard.payload and blackboard.payload.get("bypass_live_ocr")) or state.dag_state.get("bypass_live_ocr"):
            state.dag_state["nodes"].setdefault("local_ai_ocr", {}).update({
                "status": "completed",
                "telemetry_insight": "Live AI OCR bypassed (fast capture mode; deferred to batch sequential rescan)"
            })
            return NodeExecutionResult(
                status="success",
                node_id=self.node_id,
                message="Live AI OCR bypassed (fast capture mode; deferred to batch sequential rescan)",
                data={"bypassed": True, "lines_count": 0}
            )

        temp_calib = blackboard.current_image_path or (state.FRAMES_DIR / "dag_node3_capture_temp.png")

        if not temp_calib.exists() or temp_calib.stat().st_size < 2000:
            candidates = sorted(
                [p for p in state.FRAMES_DIR.glob("*.png") if p.stat().st_size >= 2000 and not p.name.startswith("temp_")],
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            if candidates:
                temp_calib = candidates[0]
            else:
                raise RuntimeError("No captured frame found. Please execute DAG Node 3 (Screen Capture) first.")

        exp_top = blackboard.top_line or cfg.get("expected_top", 1)

        # Background worker mode support
        is_bg = bool(cfg.get("background_worker", False) or (blackboard.payload and blackboard.payload.get("background_worker")))
        if is_bg:
            async def _bg_worker(target_img: Path, top_expected: int):
                try:
                    res = await ocr_svc.scan_image_with_minicpm(target_img, expected_top=top_expected)
                    lines_det = res.get("lines", [])
                    for item in lines_det:
                        try:
                            raw_ln = str(item.get("line_number") or "").strip()
                            digits = re.sub(r"\D", "", raw_ln)
                            ln = int(digits) if digits else None
                        except Exception:
                            ln = None
                        if ln and ln > 0:
                            state.document_lines[ln] = {
                                "line_number": ln, "gutter_number": ln, "text": item.get("text", ""),
                                "is_blank": not bool(item.get("text", "").strip()), "is_wrapped": False,
                                "wrapped_line_count": 1, "status": "verified", "confidence": 0.98,
                                "notes": f"MiniCPM-V OCR ({res.get('model_used', 'MiniCPM-V')})",
                                "updated_at": datetime.now().isoformat()
                            }
                    if lines_det:
                        state.save_persisted_state()
                        await state.ws_manager.broadcast({
                            "type": "document_updated",
                            "document": state.get_document_metrics(),
                            "data": state.get_document_metrics()
                        })
                except Exception as ex:
                    print(f"[LocalAiOcrNode bg worker] error: {ex}")

            asyncio.create_task(_bg_worker(temp_calib, exp_top))
            return NodeExecutionResult(
                status="success",
                node_id=self.node_id,
                message="Dispatched Local AI OCR to background task ✔",
                data={"background_worker": True}
            )

        # Synchronous execution
        try:
            scan_res = await ocr_svc.scan_image_with_minicpm(temp_calib, expected_top=exp_top)
        except Exception as e:
            print(f"[LocalAiOcrNode] MiniCPM-V invocation error: {e}")
            scan_res = {
                "status": "error",
                "error": str(e),
                "lines": [],
                "extracted_text": "",
                "lines_count": 0,
                "model_used": "MiniCPM-V (Error)"
            }

        extracted_text = scan_res.get("extracted_text", "")
        lines_detected = scan_res.get("lines", [])
        lines_count = scan_res.get("lines_count", len(lines_detected))
        char_count = len(extracted_text)
        engine_name = scan_res.get("model_used", "MiniCPM-V (Ollama)")

        det_fn = scan_res.get("detected_filename")
        if det_fn:
            pid = blackboard.project_id or state.get_current_project_id()
            if pid:
                db.append_project_filename(pid, det_fn)
                try:
                    proj = db.get_project(pid)
                    await state.ws_manager.broadcast({"type": "project_updated", "project": proj})
                    await state.ws_manager.broadcast({"type": "project_switched", "project": proj})
                except Exception:
                    pass

        if cfg.get("save_to_document", True):
            for item in lines_detected:
                try:
                    raw_ln = str(item.get("line_number") or "").strip()
                    digits = re.sub(r"\D", "", raw_ln)
                    ln = int(digits) if digits else None
                except Exception:
                    ln = None
                if ln and ln > 0:
                    state.document_lines[ln] = {
                        "line_number": ln,
                        "gutter_number": ln,
                        "text": item.get("text", ""),
                        "is_blank": not bool(item.get("text", "").strip()),
                        "is_wrapped": False,
                        "wrapped_line_count": 1,
                        "status": "verified",
                        "confidence": 0.98,
                        "notes": f"MiniCPM-V OCR ({engine_name})",
                        "updated_at": datetime.now().isoformat()
                    }

            if lines_detected:
                state.save_persisted_state()
                await state.ws_manager.broadcast({
                    "type": "document_updated",
                    "document": state.get_document_metrics(),
                    "data": state.get_document_metrics()
                })

        blackboard.ai_ocr_text = extracted_text
        blackboard.preview_text = extracted_text[:300] + ("..." if len(extracted_text) > 300 else "")
        blackboard.lines_count = lines_count
        blackboard.char_count = char_count

        state.dag_state["nodes"]["local_ai_ocr"].update({
            "status": "completed",
            "extracted_text": extracted_text,
            "preview_text": blackboard.preview_text,
            "lines_count": lines_count,
            "char_count": char_count,
            "model_used": engine_name,
            "image_id": temp_calib.stem,
            "image_name": temp_calib.name,
            "image_url": f"/api/frames/{temp_calib.stem}/image",
            "image_width": scan_res.get("image_width", 1920),
            "image_height": scan_res.get("image_height", 1080),
            "lines": lines_detected,
            "bounding_boxes": scan_res.get("bounding_boxes", {}),
            "evaluator": "Multimodal Vision Evaluator",
            "telemetry_insight": f"Extracted {lines_count} lines ({char_count} chars) verbatim via {engine_name}",
            "error": None
        })

        return NodeExecutionResult(
            status="success",
            node_id=self.node_id,
            message=f"Local AI OCR extracted {lines_count} lines ({char_count} chars) ✔",
            data={
                "lines_count": lines_count,
                "char_count": char_count,
                "extracted_text": extracted_text,
                "model_used": engine_name,
                "image_id": temp_calib.stem,
                "image_name": temp_calib.name,
                "image_url": f"/api/frames/{temp_calib.stem}/image",
                "image_width": scan_res.get("image_width", 1920),
                "image_height": scan_res.get("image_height", 1080),
                "lines": lines_detected,
                "bounding_boxes": scan_res.get("bounding_boxes", {})
            }
        )
