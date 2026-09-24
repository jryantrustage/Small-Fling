"""
FastAPI router for general-purpose classifiers and fixing actions.
"""

import sys
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import APIRouter
from pydantic import BaseModel

SERVER_DIR = Path(__file__).resolve().parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

try:
    from server.classifiers import classifier_registry, create_classifier_context
except ImportError:
    from classifiers import classifier_registry, create_classifier_context
from services.adb_service import (
    capture_external_screenshot,
    check_and_update_alignment
)
from services import state

router = APIRouter(prefix="/api/classifiers", tags=["classifiers"])


class ClassifierConfigPayload(BaseModel):
    auto_fix_enabled: Optional[bool] = None


@router.get("/status")
async def get_classifiers_status(serial: Optional[str] = None):
    """
    Evaluates all registered classifiers on the current device screen and state.
    Returns detected setup issues and available fixing actions.
    """
    context = await create_classifier_context(serial)
    await classifier_registry.evaluate_all(context)
    report = classifier_registry.get_status_report()

    # Update latest telemetry with active issues
    issues = report.get("issues", [])
    if issues:
        state.latest_telemetry["classifier_issues"] = issues
        issue_names = [i["issue_name"] for i in issues]
        if state.orchestration_state.get("status") == "RUNNING":
            state.orchestration_state["status"] = "PAUSED"
            state.orchestration_state["step_label"] = f"PAUSED: {'; '.join(issue_names)}"
            state.latest_telemetry["status_message"] = f"⚠️ Setup issue: {'; '.join(issue_names)}"

    return {
        "status": "success",
        "serial": context.serial,
        "display_id": context.display_id,
        **report
    }


@router.post("/fix/{classifier_id}")
async def fix_single_classifier(classifier_id: str, serial: Optional[str] = None):
    """
    Executes the fix action for a specific classifier (e.g. 'light_mode', 'view_mode', 'keyboard_open').
    """
    context = await create_classifier_context(serial)
    res = await classifier_registry.fix_classifier(classifier_id, context)

    # Trigger alignment refresh so diagnostics and UI update immediately
    await check_and_update_alignment(context.serial)

    # Re-evaluate classifiers after fix
    context.image_bytes = await capture_external_screenshot(context.serial)
    context.alignment_data = state.latest_alignment_status
    await classifier_registry.evaluate_all(context)

    report = classifier_registry.get_status_report()

    # Broadcast updated status via WebSockets
    await state.ws_manager.broadcast({
        "type": "classifier_update",
        "fix_result": res.to_dict(),
        "classifier_status": report,
        "alignment": state.latest_alignment_status,
        "telemetry": state.latest_telemetry
    })

    return {
        "status": "success" if res.success else "warning",
        "fix_result": res.to_dict(),
        "current_report": report,
        "alignment": state.latest_alignment_status
    }


@router.post("/fix-all")
async def fix_all_classifiers(serial: Optional[str] = None):
    """
    Runs automated remediation for all detected setup issues in priority order.
    """
    context = await create_classifier_context(serial)
    fix_results = await classifier_registry.fix_all(context)

    # Refresh alignment and re-evaluate
    await check_and_update_alignment(context.serial)
    context.image_bytes = await capture_external_screenshot(context.serial)
    context.alignment_data = state.latest_alignment_status
    await classifier_registry.evaluate_all(context)

    report = classifier_registry.get_status_report()

    await state.ws_manager.broadcast({
        "type": "classifier_update",
        "fix_results": [f.to_dict() for f in fix_results],
        "classifier_status": report,
        "alignment": state.latest_alignment_status,
        "telemetry": state.latest_telemetry
    })

    return {
        "status": "success",
        "fix_results": [f.to_dict() for f in fix_results],
        "current_report": report,
        "alignment": state.latest_alignment_status
    }


@router.post("/config")
async def update_classifier_config(payload: ClassifierConfigPayload):
    if payload.auto_fix_enabled is not None:
        classifier_registry._auto_fix_enabled = payload.auto_fix_enabled
    return {
        "status": "success",
        "auto_fix_enabled": classifier_registry._auto_fix_enabled
    }
