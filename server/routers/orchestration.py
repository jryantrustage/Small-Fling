import asyncio, time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
import config, db
import services.ocr_service as ocr_svc
from models import OcrSelectionRequest, OrchestrationRequest, PipelineModeRequest, TelemetryUpdateRequest
from services import state
from services.adb_service import capture_external_screenshot, check_and_update_alignment, detect_external_display_id, detect_mini_modal_popups, get_active_adb_serial, navigate_to_target_top_line, resolve_and_dismiss_mini_modals
from routers.dag_helpers import *
try:
    from server.dag_nodes import DagBlackboard, dag_node_registry, graph_executor
    from server.observation_actions import observation_action_registry
    from server.observation_actions.base_action import ActionContext
    from server.observation_actions.discovery_observer import DynamicObservationDiscoveryEngine
except ImportError:
    from dag_nodes import DagBlackboard, dag_node_registry, graph_executor
    from observation_actions import observation_action_registry
    from observation_actions.base_action import ActionContext
    from observation_actions.discovery_observer import DynamicObservationDiscoveryEngine
from routers.dag_helpers import _resolve_viewport_bounds
router = APIRouter(tags=["Orchestration & Telemetry"])
_current_running_node_task: Optional[asyncio.Task] = None
_current_running_node_id: Optional[str] = None
capture_loop_task: Optional[asyncio.Task] = None
class DismissItemPayload(BaseModel):
    item_id: str
    dismissed: bool = True
@router.get("/api/alignment/status")
@router.get("/api/device/alignment")
async def get_alignment_status_api():
    return state.latest_alignment_status
@router.post("/api/alignment/check")
@router.post("/api/device/alignment/check")
async def trigger_alignment_check_api():
    return await check_and_update_alignment()
@router.post("/api/alignment/dismiss")
@router.post("/api/device/alignment/dismiss-item")
async def dismiss_alignment_item_api(payload: DismissItemPayload):
    if payload.dismissed:
        state.dismissed_alignment_items.add(payload.item_id)
    else:
        state.dismissed_alignment_items.discard(payload.item_id)
    return {"status": "success", "item_id": payload.item_id, "dismissed": payload.dismissed, "dismissed_items": list(state.dismissed_alignment_items), "alignment": await check_and_update_alignment()}
@router.get("/api/alignment/dismissed")
async def get_dismissed_alignment_items_api():
    return {"dismissed_items": list(state.dismissed_alignment_items)}
@router.get("/api/telemetry")
async def get_telemetry():
    return {"telemetry": state.get_fresh_telemetry(), "token_stats": state.token_stats, "alignment": state.latest_alignment_status, "document_summary": state.get_document_metrics(), "loop_diagnosis": state.get_loop_diagnosis()}
@router.post("/api/telemetry")
async def update_telemetry(p: TelemetryUpdateRequest):
    return await handle_telemetry_update(p)
@router.get("/api/orchestrate")
async def get_orchestration_state():
    return {"orchestration": state.orchestration_state, "telemetry": state.get_fresh_telemetry(), "loop_diagnosis": state.get_loop_diagnosis()}
@router.post("/api/orchestrate")
async def handle_orchestration_command(payload: OrchestrationRequest):
    return await handle_orchestrate_command(payload)
@router.get("/api/dag/status")
async def get_dag_status():
    proj = db.get_active_project()
    target_tot = proj.get("target_total_lines", 0) if proj else state.latest_telemetry.get("target_total_lines", 0)
    node_5 = state.dag_state["nodes"].get("verification_trigger", {})
    return {"status": "success", "dag": state.dag_state, "target_total_lines": target_tot, "current_top_line": state.latest_telemetry.get("current_top_line", 0), "current_bottom_line": state.latest_telemetry.get("current_bottom_line", 0), "current_page": state.latest_telemetry.get("current_page", 1), "active_node": state.dag_state.get("current_active_node"), "node_5_config": node_5.get("config", {}), "trigger_decision": node_5.get("trigger_decision", {}), "telemetry": state.get_fresh_telemetry(), "latest_telemetry": state.get_fresh_telemetry(), "capture_telemetry": state.latest_telemetry.get("capture_telemetry", {}), "loop_diagnosis": state.get_loop_diagnosis()}
@router.get("/api/dag/nodes/metadata")
async def get_all_dag_nodes_metadata():
    return {"status": "success", "nodes": [n.get_metadata() for n in dag_node_registry.get_all_nodes()]}
@router.get("/api/dag/nodes/{node_id}/config")
async def get_dag_node_config(node_id: str):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    dag_node = dag_node_registry.get_node(target_key)
    return {"status": "success", "node_id": target_key, "title": dag_node.title if dag_node else node.get("title", ""), "config": dag_node.get_config() if dag_node else node.get("config", {}), "status_code": node.get("status", "idle"), "trigger_decision": node.get("trigger_decision", {}) if target_key == "verification_trigger" else None}
@router.get("/api/dag/nodes/{node_id}/root-cause")
async def get_dag_node_root_cause(node_id: str):
    from services.performance_analyzer import analyze_node_performance, generate_ai_resolution_prompt
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    if target_key not in state.dag_state["nodes"]:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    analysis = analyze_node_performance(target_key, state.dag_state, state.latest_telemetry)
    analysis["markdown_prompt"] = generate_ai_resolution_prompt(analysis, state.dag_state, state.latest_telemetry)
    return {"status": "success", **analysis}
@router.get("/api/dag/performance/prompt")
async def get_dag_performance_prompt(node_id: Optional[str] = None):
    from services.performance_analyzer import analyze_node_performance, generate_ai_resolution_prompt
    target_key = NODE_ALIAS_MAP.get(node_id, node_id) if node_id else (state.dag_state.get("current_active_node") or "init_end")
    analysis = analyze_node_performance(target_key, state.dag_state, state.latest_telemetry)
    return {"status": "success", "node_id": target_key, "category": analysis.get("category"), "title": analysis.get("title"), "severity": analysis.get("severity"), "markdown_prompt": generate_ai_resolution_prompt(analysis, state.dag_state, state.latest_telemetry)}
@router.post("/api/dag/nodes/{node_id}/config")
async def update_dag_node_config(node_id: str, payload: Dict[str, Any]):
    return await handle_node_config_update(node_id, payload)
@router.get("/api/dag/observation-actions")
@router.get("/api/dag/observations/actions")
async def get_observation_actions():
    return {"status": "success", "actions": observation_action_registry.get_catalog()}
@router.post("/api/dag/observation-actions/scan")
@router.post("/api/dag/observations/discover")
@router.get("/api/dag/observations/discover")
async def scan_observation_actions(payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    serial = payload.get("serial") or await get_active_adb_serial()
    disp_id = payload.get("display_id") or await detect_external_display_id(serial)
    active_node = payload.get("node_id") or state.dag_state.get("current_active_node") or "frame_acquire"
    snap = await capture_external_screenshot(serial, max_cache_age_s=0.2)
    diagnosis = await DynamicObservationDiscoveryEngine.diagnose_environment(serial=serial, display_id=disp_id, active_node_id=active_node, image_bytes=snap)
    return {"status": "success", "total_checked": len(observation_action_registry.list_all_actions()), **diagnosis}
@router.post("/api/dag/observation-actions/{action_id}/remediate")
async def remediate_observation_action(action_id: str, payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    serial = payload.get("serial") or await get_active_adb_serial()
    disp_id = payload.get("display_id") or await detect_external_display_id(serial)
    act = observation_action_registry.get_action(action_id)
    if not act:
        raise HTTPException(status_code=404, detail=f"Observation action '{action_id}' not found")
    snap = await capture_external_screenshot(serial, max_cache_age_s=0.2)
    ctx = ActionContext(serial=serial, display_id=disp_id, image_bytes=snap, node_id=payload.get("node_id", "manual"), project_id=state.get_current_project_id())
    res = await act.remediate(ctx)
    return {"status": "success" if res.success else "error", "action_id": action_id, "label": act.label, "result": res.to_dict()}
@router.patch("/api/dag/nodes/{node_id}/actions")
@router.post("/api/dag/nodes/{node_id}/actions")
async def update_node_attached_actions(node_id: str, payload: Dict[str, Any]):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    action_ids = list(payload.get("attached_actions", []))
    node["attached_actions"] = action_ids
    if backend_node := dag_node_registry.get_node(target_key):
        backend_node.set_attached_actions(action_ids)
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": target_key})
    return {"status": "success", "node_id": target_key, "attached_actions": action_ids}
@router.patch("/api/dag/nodes/{node_id}/position")
@router.post("/api/dag/nodes/{node_id}/position")
async def update_node_canvas_position(node_id: str, payload: Dict[str, Any]):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    x, y = float(payload.get("x", 0.0)), float(payload.get("y", 0.0))
    node["position"] = {"x": x, "y": y}
    if backend_node := dag_node_registry.get_node(target_key):
        backend_node.set_position(x, y)
    return {"status": "success", "node_id": target_key, "position": node["position"]}
@router.post("/api/dag/nodes/positions/batch")
async def update_batch_node_canvas_positions(payload: Dict[str, Any]):
    items = payload.get("positions", payload) if isinstance(payload.get("positions"), dict) else payload
    updated = {}
    for node_id, pos in items.items():
        if isinstance(pos, dict):
            target_key = NODE_ALIAS_MAP.get(node_id, node_id)
            if node := state.dag_state["nodes"].get(target_key):
                x, y = float(pos.get("x", 0.0)), float(pos.get("y", 0.0))
                node["position"] = {"x": x, "y": y}
                if backend_node := dag_node_registry.get_node(target_key):
                    backend_node.set_position(x, y)
                updated[target_key] = node["position"]
    return {"status": "success", "positions": updated}
@router.post("/api/dag/layout/clean")
async def snap_to_clean_layout():
    clean_coords = {"init_end": {"x": 60.0, "y": 140.0}, "reset_home": {"x": 280.0, "y": 140.0}, "frame_acquire": {"x": 500.0, "y": 140.0}, "local_ai_ocr": {"x": 720.0, "y": 140.0}, "frame_ocr": {"x": 940.0, "y": 140.0}, "arrow_down": {"x": 1160.0, "y": 140.0}, "verification_trigger": {"x": 1380.0, "y": 140.0}, "document_assemble": {"x": 1600.0, "y": 140.0}, "batch_frames_ocr": {"x": 1820.0, "y": 140.0}, "markdown_tag_parser": {"x": 2040.0, "y": 140.0}, "ast_compiler_validator": {"x": 2260.0, "y": 140.0}, "sandbox_ide": {"x": 2480.0, "y": 140.0}}
    for nid, pos in clean_coords.items():
        if nid in state.dag_state.get("nodes", {}):
            state.dag_state["nodes"][nid]["position"] = dict(pos)
            if backend_node := dag_node_registry.get_node(nid):
                backend_node.set_position(pos["x"], pos["y"])
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state})
    return {"status": "success", "layout": clean_coords}
@router.get("/api/dag/config/bypass-live-ocr")
async def get_bypass_live_ocr():
    return {"status": "success", "bypass_live_ocr": bool(state.dag_state.get("bypass_live_ocr", False))}
@router.post("/api/dag/config/bypass-live-ocr")
async def toggle_bypass_live_ocr(req: Optional[Dict[str, Any]] = None):
    cur = bool(state.dag_state.get("bypass_live_ocr", False))
    state.dag_state["bypass_live_ocr"] = bool(req.get("bypass") if req and "bypass" in req else not cur)
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state})
    return {"status": "success", "bypass_live_ocr": state.dag_state["bypass_live_ocr"]}
@router.get("/api/dag/config/headless-mode")
async def get_headless_mode():
    return {"status": "success", "headless_mode": bool(state.dag_state.get("headless_mode", False) or getattr(state, "headless_mode", False))}
@router.post("/api/dag/config/headless-mode")
async def toggle_headless_mode(req: Optional[Dict[str, Any]] = None):
    cur = bool(state.dag_state.get("headless_mode", False) or getattr(state, "headless_mode", False))
    new_val = bool(req.get("headless_mode") if "headless_mode" in req else req.get("enabled")) if (req and ("headless_mode" in req or "enabled" in req)) else not cur
    state.headless_mode = state.dag_state["headless_mode"] = bool(new_val)
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state})
    await state.ws_manager.broadcast({"type": "headless_mode_updated", "headless_mode": state.headless_mode})
    return {"status": "success", "headless_mode": state.headless_mode}
@router.get("/api/dag/headless/telemetry")
async def get_headless_telemetry():
    return {"status": "success", "telemetry": state.headless_telemetry_session, "is_running": bool(state.headless_telemetry_session.get("is_active", False) or getattr(state, "capture_loop_running", False))}
@router.post("/api/dag/headless/target-lines")
async def set_headless_target_lines(req: Dict[str, Any]):
    target = int(req.get("target_total_lines", 0))
    if target > 0:
        state.latest_telemetry["target_total_lines"] = target
        state.dag_state["nodes"].setdefault("init_end", {})["total_lines"] = target
        state.headless_telemetry_session["target_total_lines"] = target
        if (proj := db.get_active_project()) and proj.get("id"):
            db.update_project_target_lines(proj["id"], target)
        await state.ws_manager.broadcast({"type": "telemetry_updated", "telemetry": state.latest_telemetry})
        await state.ws_manager.broadcast({"type": "headless_telemetry_progress", "telemetry": state.headless_telemetry_session})
    return {"status": "success", "target_total_lines": state.latest_telemetry.get("target_total_lines", 0), "telemetry": state.headless_telemetry_session}
@router.post("/api/dag/edges")
async def add_or_update_dag_edge(payload: Dict[str, Any]):
    from_node, to_node = payload.get("from"), payload.get("to")
    if not from_node or not to_node:
        raise HTTPException(status_code=400, detail="'from' and 'to' node IDs required")
    edge_id = payload.get("id") or f"{from_node}->{to_node}"
    edge_obj = {"id": edge_id, "from": from_node, "to": to_node, "condition": payload.get("condition", "ON_SUCCESS"), "enabled": payload.get("enabled", True)}
    edges = state.dag_state.setdefault("edges", [])
    existing = next((e for e in edges if e.get("id") == edge_id or (e.get("from") == from_node and e.get("to") == to_node)), None)
    if existing:
        existing.update(edge_obj)
    else:
        edges.append(edge_obj)
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state})
    return {"status": "success", "edge": edge_obj}
@router.delete("/api/dag/edges/{edge_id}")
async def delete_dag_edge(edge_id: str):
    state.dag_state["edges"] = [e for e in state.dag_state.get("edges", []) if e.get("id") != edge_id]
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state})
    return {"status": "success", "removed": edge_id}
async def abort_running_node(target_node_id: Optional[str] = None, reason: str = "Operation aborted") -> Optional[str]:
    global _current_running_node_task, _current_running_node_id, capture_loop_task
    aborted_node, curr_task = None, asyncio.current_task()
    if getattr(state, "capture_loop_running", False):
        state.capture_loop_running = False
        state.latest_telemetry["is_pacing"] = False
        if capture_loop_task and capture_loop_task is not curr_task and not capture_loop_task.done():
            capture_loop_task.cancel()
    task_to_cancel = _current_running_node_task
    if task_to_cancel and task_to_cancel is not curr_task and not task_to_cancel.done():
        running_id = _current_running_node_id
        if target_node_id is None or target_node_id == running_id:
            aborted_node = running_id
            task_to_cancel.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task_to_cancel), timeout=0.15)
            except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                pass
            _current_running_node_task = _current_running_node_id = None
    now_str = datetime.now().strftime("%H:%M:%S")
    for nid, nval in state.dag_state.get("nodes", {}).items():
        if nval.get("status") == "active" or nval.get("is_active"):
            nval.update({"status": "aborted", "is_active": False, "error": reason, "finished_at": now_str})
            aborted_node = aborted_node or nid
    if state.dag_state.get("current_active_node") == aborted_node:
        state.dag_state["current_active_node"] = None
    if aborted_node:
        await state.ws_manager.broadcast({"type": "dag_node_aborted", "node_id": aborted_node, "reason": reason, "dag": state.dag_state, "telemetry": state.latest_telemetry})
    return aborted_node
@router.post("/api/dag/auto-heal")
async def trigger_auto_heal(payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    ser = await get_active_adb_serial(payload.get("serial"))
    return await auto_heal_pipeline_environment(ser, await detect_external_display_id(ser), payload.get("node_id", "init_end"))
@router.post("/api/dag/navigate-to-line")
@router.post("/api/device/navigate-to-line")
async def api_navigate_to_line(payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    target_top = int(payload.get("target_top") or payload.get("target_top_line") or payload.get("line_number") or 1)
    ser = await get_active_adb_serial(payload.get("serial"))
    disp_id = payload.get("display_id") or await detect_external_display_id(ser)
    nav_res = await navigate_to_target_top_line(target_top=target_top, serial=ser, display_id=disp_id, current_top=payload.get("current_top"), current_bottom=payload.get("current_bottom"), lines_per_page=payload.get("lines_per_page"), use_page_keys=bool(payload.get("use_page_keys", True)), max_attempts=int(payload.get("max_attempts", 12)), caller_node=str(payload.get("caller_node", "navigate_to_line")))
    return {k: v for k, v in nav_res.items() if k != "snapshot_bytes"}
@router.post("/api/dag/nodes/{node_id}/run")
@router.post("/api/dag/run/{node_id}")
async def run_single_dag_node(node_id: str, payload: Optional[Dict[str, Any]] = None):
    """Executes a single DAG node strictly through dag_node_registry and DagGraphExecutor."""
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    dag_node = dag_node_registry.get_node(target_key)
    if not node or not dag_node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    payload = payload or {}
    is_post_capture_node = target_key in ("markdown_tag_parser", "ast_compiler_validator", "sandbox_ide")
    active_serial = payload.get("serial") or ("" if is_post_capture_node else await get_active_adb_serial(payload.get("serial")))
    cfg = dict(node.get("config", {}))
    if isinstance(payload.get("config"), dict):
        cfg.update(payload["config"])
    if "headless_mode" in payload:
        cfg["headless_mode"] = payload["headless_mode"]
    if target_key in ("init_end", "reset_home", "frame_acquire", "frame_ocr", "arrow_down", "verification_trigger"):
        dev_env = await resolve_and_enforce_dag_device_environment(serial=active_serial)
        if dev_env.get("status") == "error":
            err_msg = dev_env.get("message")
            node.update({"status": "error", "error": err_msg, "is_active": False})
            state.dag_state["current_active_node"] = None
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": target_key, "status": "error", "error": err_msg})
            raise HTTPException(status_code=400, detail=err_msg)
    global _current_running_node_task, _current_running_node_id
    curr_task = asyncio.current_task()
    allow_concurrent = bool(payload.get("allow_concurrent") or payload.get("pipelined") or payload.get("fast_loop"))
    if not allow_concurrent and _current_running_node_task and _current_running_node_task is not curr_task and not _current_running_node_task.done():
        await abort_running_node(reason=f"Operation aborted: Preempted by Node {target_key}")
    if not allow_concurrent:
        for k, v in state.dag_state.get("nodes", {}).items():
            if k != target_key:
                v["is_active"] = False
                if v.get("status") == "active":
                    v["status"] = "aborted"
                    v["error"] = f"Preempted by Node {target_key}"
    start_time, t_start = datetime.now(), time.perf_counter()
    started_at_str = start_time.strftime("%H:%M:%S")
    node.update({"started_at": started_at_str, "started_at_iso": start_time.isoformat(), "finished_at": None, "duration_ms": None, "is_active": True, "status": "active", "error": None, "dag_context": None, "trace_insights": None})
    state.dag_state["current_active_node"] = target_key
    _current_running_node_task, _current_running_node_id = curr_task, target_key
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "running_node": target_key, "node_id": target_key, "is_active": True, "started_at": started_at_str})
    try:
        disp_id = 0 if is_post_capture_node else await detect_external_display_id(active_serial)
        init_top = (state.orchestration_state.get("next_target_top") or state.latest_telemetry.get("current_top_line") or state.dag_state["nodes"].get("frame_ocr", {}).get("top_line", 0)) if target_key == "frame_acquire" else (state.dag_state["nodes"].get("frame_ocr", {}).get("top_line", 0) or state.latest_telemetry.get("current_top_line", 0))
        cur_fid = state.orchestration_state.get("last_acquired_frame_id") or state.dag_state["nodes"].get("frame_acquire", {}).get("frame_id")
        bb = DagBlackboard(active_serial=active_serial or "", display_id=disp_id, project_id=payload.get("project_id") or state.get_current_project_id() or "", config=cfg, payload=payload, frame_id=cur_fid, top_line=init_top, bottom_line=state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line", 0), total_lines=state.dag_state["nodes"].get("init_end", {}).get("total_lines", 0), metadata=dict(payload.get("metadata") or {}))
        exec_res = await graph_executor.run_single_node(target_key, blackboard=bb)
        if exec_res.status == "error":
            raise HTTPException(status_code=500, detail={"message": f"DAG Node '{target_key}' failed: {exec_res.error or exec_res.message}"})
        return exec_res.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        node.update({"status": "error", "error": str(e), "is_active": False})
        raise HTTPException(status_code=500, detail={"message": f"DAG Node '{target_key}' failed: {e}"})
    finally:
        end_time = datetime.now()
        dur_ms = max(1, int((time.perf_counter() - t_start) * 1000))
        node["finished_at"] = node.get("finished_at") or end_time.strftime("%H:%M:%S")
        node["finished_at_iso"] = node.get("finished_at_iso") or end_time.isoformat()
        node["duration_ms"] = node.get("duration_ms") or dur_ms
        node["is_active"] = False
        if node.get("status") == "active":
            node["status"] = "completed"
        timings = {"started_at": node.get("started_at"), "finished_at": node["finished_at"], "duration_ms": dur_ms, "action_ms": dur_ms, "timestamp_iso": end_time.isoformat()}
        node["timings"] = timings
        if state.dag_state.get("current_active_node") == target_key:
            state.dag_state["current_active_node"] = None
        if _current_running_node_task is curr_task:
            _current_running_node_task = _current_running_node_id = None
        await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": target_key, "timings": timings})
@router.post("/api/dag/nodes/abort")
@router.post("/api/dag/nodes/{node_id}/abort")
async def abort_dag_node_endpoint(node_id: Optional[str] = None):
    target_key = NODE_ALIAS_MAP.get(node_id, node_id) if node_id else None
    aborted_id = await abort_running_node(target_node_id=target_key, reason="Operation aborted by user request")
    return {"status": "success", "aborted_node": aborted_id, "message": f"Node '{aborted_id}' operation aborted successfully." if aborted_id else "No active node was running to abort."}
@router.post("/api/dag/nodes/node_5/evaluate")
@router.post("/api/dag/nodes/node_6/evaluate")
@router.post("/api/dag/nodes/verification_trigger/evaluate")
async def evaluate_dag_node_5_qualifiers(serial: Optional[str] = None):
    decision = await evaluate_node_5_decision(serial)
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "verification_trigger", "trigger_decision": decision})
    return {"status": "success", "node_id": "verification_trigger", "trigger_decision": decision, "allowed": decision.get("allowed", False), "prevented": decision.get("prevented", True), "message": "Trigger allowed ✔" if decision.get("allowed") else f"Trigger prevented: {', '.join(decision.get('reasons', []))} ⛔"}
@router.post("/api/dag/loop/start")
@router.post("/api/dag/loop/resume")
async def start_dag_loop(payload: Optional[Dict[str, Any]] = None):
    global capture_loop_task
    payload = payload or {}
    if "headless_mode" in payload:
        state.headless_mode = state.dag_state["headless_mode"] = bool(payload["headless_mode"])
    if getattr(state, "capture_loop_running", False):
        return {"status": "already_running", "message": "Capture loop is already running", "diagnosis": state.get_loop_diagnosis()}
    state.capture_loop_running = True
    capture_loop_task = asyncio.create_task(run_continuous_capture_loop_worker(payload.get("serial")))
    await state.ws_manager.broadcast({"type": "capture_loop_status", "running": True, "dag": state.dag_state, "telemetry": state.latest_telemetry})
    return {"status": "started", "message": f"Capture loop started{' (Headless Mode)' if getattr(state, 'headless_mode', False) else ''}", "diagnosis": state.get_loop_diagnosis()}
@router.post("/api/dag/loop/stop")
async def stop_dag_loop():
    global capture_loop_task
    if getattr(state, "capture_loop_running", False):
        state.record_diagnostics_trace_event(event_type="LOOP_STOPPED", reason="Stopped manually by user via Stop Loop button")
    state.capture_loop_running = False
    if capture_loop_task and not capture_loop_task.done():
        capture_loop_task.cancel()
    state.latest_telemetry["is_pacing"] = False
    state.dag_state["current_active_node"] = None
    await state.ws_manager.broadcast({"type": "capture_loop_status", "running": False, "dag": state.dag_state, "telemetry": state.latest_telemetry})
    return {"status": "stopped", "message": "Capture loop stopped"}
@router.get("/api/dag/loop/status")
@router.get("/api/dag/loop/diagnosis")
async def get_dag_loop_status():
    return {"status": "success", "running": getattr(state, "capture_loop_running", False), "current_active_node": state.dag_state.get("current_active_node"), "diagnosis": state.get_loop_diagnosis()}
@router.get("/api/dag/semaphore")
async def get_dag_semaphore():
    s23, s34 = getattr(state, "dag_semaphore_group2_to_3", True), getattr(state, "dag_semaphore_group3_to_4", True)
    return {"status": "success", "enabled": s23 and s34, "semaphore_status": "open" if (s23 and s34) else "blocked", "semaphore_group2_to_3": s23, "semaphore_group3_to_4": s34, "semaphore_group2_to_3_status": "open" if s23 else "blocked", "semaphore_group3_to_4_status": "open" if s34 else "blocked", "group2_to_3": {"enabled": s23, "status": "open" if s23 else "blocked"}, "group3_to_4": {"enabled": s34, "status": "open" if s34 else "blocked"}}
@router.post("/api/dag/semaphore")
async def set_dag_semaphore(payload: Optional[Dict[str, Any]] = None):
    return await handle_set_semaphore(payload)
@router.post("/api/dag/semaphore/toggle")
async def toggle_dag_semaphore(payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    sem_id = payload.get("semaphore_id") or payload.get("id") or "group2_to_3"
    current = getattr(state, "dag_semaphore_group3_to_4", True) if sem_id in ("group3_to_4", "group_3_to_4", "dag3_to_4", "3_to_4") else getattr(state, "dag_semaphore_group2_to_3", True)
    return await handle_set_semaphore({"enabled": not current, "semaphore_id": sem_id})
@router.post("/api/dag/semaphore/{semaphore_id}/toggle")
async def toggle_dag_semaphore_by_id(semaphore_id: str):
    return await toggle_dag_semaphore({"semaphore_id": semaphore_id})
@router.get("/api/dag/connectors")
async def get_dag_connectors():
    edges = state.dag_state.get("edges", [])
    return {"status": "success", "edges": edges, "count": len(edges), "adjacency": {e["from"]: e["to"] for e in edges if e.get("enabled", True)}}
@router.post("/api/dag/connectors/toggle")
async def toggle_dag_connector(payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    edge = state.toggle_edge_connection(edge_id=payload.get("edge_id") or payload.get("id"), from_node=payload.get("from_node") or payload.get("from"), to_node=payload.get("to_node") or payload.get("to"))
    msg = f"Connector ({edge.get('from', 'node')} ➔ {edge.get('to', 'node')}) set to {'CONNECTED ⚡' if edge.get('enabled', True) else 'DISCONNECTED ✂️'}"
    await emit_dag_telemetry_event(category="SYSTEM", message=msg, dag="position_navigation")
    await state.ws_manager.broadcast({"type": "dag_connector_updated", "edge": edge, "edges": state.dag_state.get("edges", []), "message": msg, "dag": state.dag_state})
    return {"status": "success", "edge": edge, "edges": state.dag_state.get("edges", []), "message": msg}
@router.post("/api/dag/connectors/connect")
async def connect_dag_nodes(payload: Dict[str, Any]):
    from_node, to_node = payload.get("from_node") or payload.get("from"), payload.get("to_node") or payload.get("to")
    if not from_node or not to_node:
        raise HTTPException(status_code=400, detail="from_node and to_node are required")
    enabled = bool(payload.get("enabled", True))
    edge = state.set_edge_connection(from_node, to_node, enabled=enabled)
    msg = f"Flow directed: ({from_node} ➔ {to_node}) [{'CONNECTED ⚡' if enabled else 'DISCONNECTED ✂️'}]"
    await emit_dag_telemetry_event(category="SYSTEM", message=msg, dag="position_navigation")
    await state.ws_manager.broadcast({"type": "dag_connector_updated", "edge": edge, "edges": state.dag_state.get("edges", []), "message": msg, "dag": state.dag_state})
    return {"status": "success", "edge": edge, "edges": state.dag_state.get("edges", []), "message": msg}
@router.post("/api/dag/connectors/disconnect")
async def disconnect_dag_connector(payload: Dict[str, Any]):
    edge_id = payload.get("edge_id") or payload.get("id")
    from_node, to_node = payload.get("from_node") or payload.get("from"), payload.get("to_node") or payload.get("to")
    if edge_id:
        for e in state.dag_state.get("edges", []):
            if e.get("id") == edge_id:
                from_node, to_node = e.get("from"), e.get("to")
                break
    edge = state.set_edge_connection(from_node, to_node, enabled=False) if (from_node and to_node) else state.toggle_edge_connection(edge_id=edge_id, from_node=from_node, to_node=to_node)
    msg = f"Connector ({from_node} ➔ {to_node}) DISCONNECTED ✂️"
    await emit_dag_telemetry_event(category="SYSTEM", message=msg, dag="position_navigation")
    await state.ws_manager.broadcast({"type": "dag_connector_updated", "edge": edge, "edges": state.dag_state.get("edges", []), "message": msg, "dag": state.dag_state})
    return {"status": "success", "edge": edge, "edges": state.dag_state.get("edges", []), "message": msg}
@router.post("/api/dag/connectors/reset")
async def reset_dag_connectors():
    edges = state.reset_default_edges()
    msg = "All DAG connectors reset to standard sequential flow ✔"
    await emit_dag_telemetry_event(category="SYSTEM", message=msg, dag="position_navigation")
    await state.ws_manager.broadcast({"type": "dag_connector_updated", "edges": edges, "message": msg, "dag": state.dag_state})
    return {"status": "success", "edges": edges, "message": msg}
@router.post("/api/dag/groups/{group_id}/run")
async def run_dag_group_endpoint(group_id: str, payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    serial = payload.get("serial")
    if group_id in {"initialize", "init"}:
        return await execute_dag_group_initialize(serial=serial, project_id=payload.get("project_id"))
    elif group_id in {"capture_entire_markdown", "capture"}:
        return await execute_dag_group_capture_markdown(serial=serial) if payload.get("single_cycle") else await start_dag_loop({"serial": serial})
    elif group_id in {"position_navigation", "positioning", "dag_3", "group_3"}:
        return await execute_dag_group_position_navigation(serial=serial, payload=payload)
    elif group_id in {"verify_assemble", "verify", "assemble", "dag_4", "group_4"}:
        return await execute_dag_group_verify_assemble(serial=serial, payload=payload)
    elif group_id in {"post_capture_analyzer", "analyzer", "post_capture", "dag_5", "group_5"}:
        return await execute_dag_group_post_capture_analyzer(project_id=payload.get("project_id"), payload=payload)
    raise HTTPException(status_code=400, detail=f"Unknown DAG group: {group_id}")
@router.get("/api/pipeline/mode")
async def get_pipeline_mode():
    ocr_svc.sync_pipeline_mode_with_keys()
    return {"status": "success", "pipeline_mode": ocr_svc.active_pipeline_mode, "mode": ocr_svc.active_pipeline_mode, "model_target": ocr_svc.active_model_target, "ocr_engine": ocr_svc.active_ocr_engine, "engine": ocr_svc.active_ocr_engine, "gemini_available": bool(config.GEMINI_API_KEY), "ollama_url": config.OLLAMA_URL, "ollama_vision_model": config.OLLAMA_VISION_MODEL, "ollama_coder_model": config.OLLAMA_CODER_MODEL, "ollama_model": config.OLLAMA_MODEL}
@router.post("/api/pipeline/mode")
async def set_pipeline_mode(req: PipelineModeRequest):
    m = req.mode.strip().lower()
    if m not in {"cloud", "local"}:
        raise HTTPException(status_code=400, detail="Invalid pipeline mode. Must be 'cloud' or 'local'.")
    if m == "cloud" and not config.GEMINI_API_KEY:
        raise HTTPException(status_code=400, detail="Cloud Pipeline requires a Gemini API key.")
    ocr_svc.active_pipeline_mode = m
    ocr_svc.active_model_target, ocr_svc.active_ocr_engine = ("ollama", "minicpm") if m == "local" else ("gemini", "auto")
    payload = {"type": "pipeline_mode_changed", "pipeline_mode": m, "mode": m, "model_target": ocr_svc.active_model_target, "ocr_engine": ocr_svc.active_ocr_engine, "engine": ocr_svc.active_ocr_engine}
    await state.ws_manager.broadcast(payload)
    return {"status": "success", **payload}
@router.get("/api/ocr/engines")
async def get_ocr_engines():
    has_gemini = bool(config.GEMINI_API_KEY)
    ocr_svc.sync_pipeline_mode_with_keys()
    return {"engines": [{"id": "minicpm", "name": "Local MiniCPM-V (Ollama Vision)", "available": True, "type": "local"}, {"id": "auto", "name": "Auto (Gemini with MiniCPM-V Fallback)" if has_gemini else "Auto (Local MiniCPM-V)", "available": True, "type": "auto"}, {"id": "gemini", "name": "Gemini 2.5 Cloud Vision", "available": has_gemini, "type": "cloud"}, {"id": "hybrid", "name": "Hybrid (Gemini Text + Local MiniCPM-V)", "available": has_gemini, "type": "hybrid"}], "active_engine": ocr_svc.active_ocr_engine, "model_targets": ["ollama", "gemini"], "active_model_target": ocr_svc.active_model_target, "pipeline_mode": ocr_svc.active_pipeline_mode}
@router.post("/api/ocr/select-engine")
async def select_ocr_engine(req: OcrSelectionRequest):
    has_gemini = bool(config.GEMINI_API_KEY)
    if req.engine:
        eng = "minicpm" if req.engine.lower() in {"local", "minicpm", "ollama"} else req.engine.lower()
        if eng not in {"minicpm", "auto", "gemini", "hybrid"}:
            raise HTTPException(status_code=400, detail=f"Invalid engine '{req.engine}'.")
        if eng in {"gemini", "hybrid"} and not has_gemini:
            raise HTTPException(status_code=400, detail=f"Engine '{req.engine}' requires a configured Gemini API key.")
        ocr_svc.active_ocr_engine = eng
    if req.model_target:
        ocr_svc.active_model_target = ocr_svc.normalize_model_target(req.model_target)
    await state.ws_manager.broadcast({"type": "ocr_engine_changed", "active_engine": ocr_svc.active_ocr_engine, "active_model_target": ocr_svc.active_model_target})
    return {"status": "success", "active_engine": ocr_svc.active_ocr_engine, "active_model_target": ocr_svc.active_model_target}
@router.post("/api/ocr/scan-direct")
async def scan_direct(request: Request, file: UploadFile = File(...), engine: Optional[str] = Form("auto"), model_target: Optional[str] = Form(None), pipeline_mode: Optional[str] = Form(None)):
    return await handle_scan_direct(request, file, engine, model_target, pipeline_mode)
@router.get("/api/dag/report/dag2")
async def get_dag2_performance_report():
    from services.performance_analyzer import analyze_dag2_performance_report
    report = analyze_dag2_performance_report(state.get_dag2_loop_history(), state.latest_telemetry)
    report["diagnostics_trace"] = state.get_project_diagnostics_trace()
    return report
@router.get("/api/dag/diagnostics-trace")
async def get_dag_diagnostics_trace_endpoint():
    return {"status": "success", "diagnostics_trace": state.get_project_diagnostics_trace()}
@router.post("/api/dag/diagnostics-trace/rebuild")
async def rebuild_dag_diagnostics_trace_endpoint():
    state.project_diagnostics_trace["backfilled_up_to_frame_count"] = 0
    return {"status": "success", "diagnostics_trace": state.get_project_diagnostics_trace()}
@router.post("/api/dag/report/dag2/clear")
async def clear_dag2_performance_report():
    state.clear_dag2_loop_history()
    return {"status": "success", "message": "DAG 2 loop performance history cleared"}
@router.get("/api/dag/report/dag2/accuracy")
def get_dag2_accuracy_audit():
    from services.accuracy_verifier import run_gemini_38_accuracy_audit
    return run_gemini_38_accuracy_audit(force_refresh=False)
@router.post("/api/dag/report/dag2/audit-accuracy")
def trigger_dag2_accuracy_audit():
    from services.accuracy_verifier import run_gemini_38_accuracy_audit
    return run_gemini_38_accuracy_audit(force_refresh=True)
@router.post("/api/projects/{project_id}/reference-markdown")
async def orchestration_upload_reference_markdown(project_id: str, request: Request, file_path: Optional[str] = None, path: Optional[str] = None):
    from routers.frames_document import upload_project_reference_markdown
    return await upload_project_reference_markdown(project_id=project_id, request=request, file_path=file_path, path=path)
@router.get("/api/projects/{project_id}/ground-truth-score")
async def orchestration_get_ground_truth_score(project_id: str, max_line: Optional[int] = None):
    from services.accuracy_verifier import score_against_reference_markdown
    return await asyncio.to_thread(score_against_reference_markdown, project_id=project_id, max_line=max_line)
@router.post("/api/projects/{project_id}/auto-heal-mismatches")
async def orchestration_auto_heal_mismatches(project_id: str, lines: Optional[str] = None, req: Optional[Dict[str, Any]] = None):
    from routers.frames_document import auto_heal_project_mismatches
    return await auto_heal_project_mismatches(project_id=project_id, lines=lines, req=req)
@router.get("/api/telemetry/key-events")
async def get_key_events_telemetry_endpoint(limit: int = 50, loop_id: Optional[str] = None):
    events = state.get_key_events_telemetry(limit=limit, loop_id=loop_id)
    return {"status": "success", "count": len(events), "events": events, "stats": state.latest_telemetry.get("key_event_stats", {})}
@router.post("/api/telemetry/key-events/clear")
async def clear_key_events_telemetry_endpoint():
    state.clear_key_events_telemetry()
    return {"status": "success", "message": "Key events telemetry buffer cleared"}
@router.get("/api/dag/mini-modals/detect")
async def api_detect_mini_modals(serial: Optional[str] = None):
    ser = await get_active_adb_serial(serial)
    return {"status": "success", "serial": ser, **detect_mini_modal_popups(await capture_external_screenshot(ser, max_cache_age_s=0.0, bypass_lock=True) if ser else None)}
@router.post("/api/dag/mini-modals/resolve")
async def api_resolve_mini_modals(payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    ser = await get_active_adb_serial(payload.get("serial"))
    disp_id = payload.get("display_id") or await detect_external_display_id(ser)
    res = await resolve_and_dismiss_mini_modals(serial=ser, display_id=disp_id, caller_node=str(payload.get("caller_node", "manual_api")))
    return {"status": "success", "serial": ser, "display_id": disp_id, **{k: v for k, v in res.items() if k != "snapshot_bytes"}}
@router.post("/api/device/prepare-markdown-editor")
async def api_prepare_markdown_editor(payload: Optional[Dict[str, Any]] = None):
    from services.ui_automator_service import prepare_markdown_editor_window
    payload, ser = payload or {}, await get_active_adb_serial((payload or {}).get("serial"))
    if not ser:
        raise HTTPException(status_code=400, detail="No active Android device connected")
    res = await prepare_markdown_editor_window(serial=ser, display_id=payload.get("display_id") or await detect_external_display_id(ser))
    mp_state = state.sync_multipart_state_from_alignment(state.latest_alignment_status)
    await state.ws_manager.broadcast({"type": "alignment_status", "alignment": state.latest_alignment_status, "multipart_state": mp_state})
    return {**res, "alignment": state.latest_alignment_status, "multipart_state": mp_state}
@router.get("/api/dag/multipart/status")
async def api_get_multipart_status():
    return {"status": "success", "multipart_state": state.sync_multipart_state_from_alignment(), "alignment_file_name": state.latest_alignment_status.get("file_name", ""), "back_button_coords": state.latest_alignment_status.get("back_button_coords")}
@router.post("/api/dag/multipart/config")
async def api_update_multipart_config(payload: Dict[str, Any]):
    if "auto_chain_enabled" in payload:
        state.multipart_bundle_state["auto_chain_enabled"] = bool(payload["auto_chain_enabled"])
    mp_state = state.sync_multipart_state_from_alignment()
    await state.ws_manager.broadcast({"type": "multipart_transition_status", "multipart_state": mp_state})
    return {"status": "success", "multipart_state": mp_state}
@router.post("/api/dag/multipart/export-current")
async def api_export_current_markdown(payload: Optional[Dict[str, Any]] = None):
    payload = payload or {}
    rec = state.export_project_markdown_to_disk(project_id=payload.get("project_id"), explicit_file_name=payload.get("file_name"))
    await state.ws_manager.broadcast({"type": "markdown_part_exported", "export": rec, "multipart_state": state.multipart_bundle_state})
    return {"status": "success", "export": rec, "multipart_state": state.multipart_bundle_state}
@router.get("/api/dag/multipart/exports/{file_name}")
async def api_download_exported_markdown(file_name: str):
    exp_path = Path("c:/Projects/Small-Fling/storage/exports") / Path(file_name).name
    if not exp_path.exists():
        raise HTTPException(status_code=404, detail=f"Exported file '{exp_path.name}' not found")
    return PlainTextResponse(content=exp_path.read_text(encoding="utf-8"), media_type="text/markdown; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{exp_path.name}"'})
@router.post("/api/dag/multipart/transition-next")
async def api_transition_next_multipart(payload: Optional[Dict[str, Any]] = None):
    global capture_loop_task
    payload = payload or {}
    next_part = payload.get("next_part_number")
    res = await transition_to_next_multipart_project(serial=payload.get("serial"), display_id=payload.get("display_id"), explicit_next_part=int(next_part) if next_part is not None else None)
    if res.get("status") == "success" and payload.get("auto_start_loop") and not getattr(state, "capture_loop_running", False):
        state.capture_loop_running = True
        capture_loop_task = asyncio.create_task(run_continuous_capture_loop_worker(payload.get("serial")))
        res["loop_started"] = True
    return res
