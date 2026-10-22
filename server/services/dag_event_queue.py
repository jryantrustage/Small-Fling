"""
DAG Event Queue & Remediation Engine:
Provides an asynchronous, high-priority event queue for capturing and resolving
DAG-blocking incidents (e.g. lost editor focus, overlay occlusion, IME obstruction).
Broadcasts queue states to WebSocket subscribers and emits rich telemetry events.
"""

import asyncio
import time
import logging
import inspect
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime

logger = logging.getLogger("dag_event_queue")

_event_history: List[Dict[str, Any]] = []
_active_events: Dict[str, Dict[str, Any]] = {}


async def queue_dag_event(
    event_type: str,
    category: str = "FOCUS",
    message: str = "",
    node_id: Optional[str] = None,
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    automated_steps: Optional[List[Dict[str, Any]]] = None,
    handler: Optional[Callable[..., Any]] = None,
    blackboard: Optional[Any] = None,
    timeout_s: float = 12.0
) -> Dict[str, Any]:
    """
    Queues a high-priority incident event when an issue blocks the DAG flow,
    broadcasts progress across WebSocket and telemetry, and executes the
    automated remediation handler.
    """
    from services import state

    event_id = f"ev_{int(time.time() * 1000)}_{len(_event_history) + 1}"
    now_str = datetime.now().strftime("%I:%M:%S %p").lstrip("0")

    event_payload = {
        "id": event_id,
        "event_id": event_id,
        "event_type": event_type,
        "category": category,
        "node_id": node_id,
        "status": "queued",
        "message": message,
        "serial": serial,
        "display_id": display_id,
        "automated_steps": automated_steps or [],
        "created_at": now_str,
        "timestamp": time.time(),
        "resolved": False,
        "error": None
    }

    _active_events[event_id] = event_payload
    _event_history.append(event_payload)
    state.latest_telemetry["latest_dag_event"] = event_payload

    # 1. Broadcast queued state over WebSocket
    await state.ws_manager.broadcast({
        "type": "dag_event_queued",
        "event": event_payload
    })

    # 2. Emit telemetry event
    try:
        from routers.orchestration import emit_dag_telemetry_event
        await emit_dag_telemetry_event(
            category=category,
            message=f"[Event Queued] {message}",
            dag="initialize",
            node_id=node_id,
            level="warning",
            serial=serial,
            troubleshooting_steps=automated_steps
        )
    except Exception as te:
        logger.warning(f"Could not emit dag telemetry event: {te}")

    # 3. Execute automated handler if supplied
    if handler:
        t0 = time.perf_counter()
        try:
            event_payload["status"] = "executing"
            await state.ws_manager.broadcast({
                "type": "dag_event_progress",
                "event_id": event_id,
                "status": "executing",
                "message": f"Executing automated steps: {message}"
            })

            # Run handler with timeout
            if inspect.iscoroutinefunction(handler):
                res = await asyncio.wait_for(handler(), timeout=timeout_s)
            else:
                res = handler()

            duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            event_payload.update({
                "status": "resolved",
                "resolved": True,
                "duration_ms": duration_ms,
                "result": res
            })
            _active_events.pop(event_id, None)

            # Broadcast resolution
            await state.ws_manager.broadcast({
                "type": "dag_event_resolved",
                "event_id": event_id,
                "event": event_payload,
                "result": res
            })

            try:
                from routers.orchestration import emit_dag_telemetry_event
                await emit_dag_telemetry_event(
                    category=category,
                    message=f"[Event Resolved ✔] {message} in {duration_ms}ms",
                    dag="initialize",
                    node_id=node_id,
                    level="info",
                    serial=serial
                )
            except Exception:
                pass

            return {"status": "resolved", "event_id": event_id, "duration_ms": duration_ms, "result": res}

        except Exception as ex:
            duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            err_msg = str(ex)
            event_payload.update({
                "status": "failed",
                "resolved": False,
                "duration_ms": duration_ms,
                "error": err_msg
            })
            _active_events.pop(event_id, None)

            await state.ws_manager.broadcast({
                "type": "dag_event_failed",
                "event_id": event_id,
                "event": event_payload,
                "error": err_msg
            })

            try:
                from routers.orchestration import emit_dag_telemetry_event
                await emit_dag_telemetry_event(
                    category="ERROR",
                    message=f"[Event Failed] {message}: {err_msg}",
                    dag="initialize",
                    node_id=node_id,
                    level="error",
                    serial=serial
                )
            except Exception:
                pass

            return {"status": "failed", "event_id": event_id, "duration_ms": duration_ms, "error": err_msg}

    return {"status": "queued", "event_id": event_id}


def get_active_events() -> List[Dict[str, Any]]:
    return list(_active_events.values())


def get_event_history(limit: int = 50) -> List[Dict[str, Any]]:
    return _event_history[-limit:]
