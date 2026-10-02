"""
Unified helper utilities for DAG orchestration, node state synchronization, and WebSocket telemetry dispatch.
Provides DRY wrappers for broadcasting and telemetry to eliminate duplicate payload boilerplate.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
import time
import random
from services import state
from services.adb_service import current_device_model


def resolve_friendly_device_name(serial: Optional[str] = None) -> str:
    s = (serial or state.active_device_serial or "").lower()
    if any(k in s for k in ["63100", "mustang", "frankel", "pixel_10", "pixel 10"]):
        return "Pixel 10"
    if any(k in s for k in ["39101", "husky", "shiba", "pixel_8", "pixel 8"]):
        return "Pixel 8"
    dev_model = getattr(state, "current_device_model", "") or current_device_model
    if "10" in str(dev_model):
        return "Pixel 10"
    if "8" in str(dev_model):
        return "Pixel 8"
    return "Pixel 10"


async def broadcast_dag_update(node_id: Optional[str] = None, **extra) -> None:
    """Unified WebSocket broadcast for DAG state changes."""
    msg = {
        "type": "dag_updated",
        "dag": state.dag_state,
        "telemetry": state.latest_telemetry
    }
    if node_id:
        msg["node_id"] = node_id
    msg.update(extra)
    await state.ws_manager.broadcast(msg)


async def emit_dag_telemetry_event(
    category: str,
    message: str,
    dag: str = "initialize",
    node_id: Optional[str] = None,
    level: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    trace_insights: Optional[List[str]] = None,
    troubleshooting_steps: Optional[List[Dict[str, Any]]] = None,
    serial: Optional[str] = None,
    status_code: Optional[int] = None
) -> None:
    """Unified telemetry event generator with friendly device prefixing."""
    dev_name = resolve_friendly_device_name(serial)
    event_id = f"{int(time.time() * 1000)}-{random.randint(100, 999)}"
    timestamp = datetime.now().strftime("%I:%M:%S %p").lstrip("0")

    formatted_msg = message
    if not formatted_msg.lower().startswith(dev_name.lower()):
        formatted_msg = f"{dev_name}: {message}"

    event = {
        "id": event_id,
        "timestamp": timestamp,
        "category": category,
        "message": formatted_msg,
        "dag": dag,
        "device": dev_name,
        "nodeId": node_id,
        "level": level or ("error" if category == "ERROR" else "info"),
        "data": data,
        "traceInsights": trace_insights,
        "troubleshootingSteps": troubleshooting_steps,
        "statusCode": status_code
    }
    await state.ws_manager.broadcast({
        "type": "dag_telemetry_event",
        "event": event
    })
