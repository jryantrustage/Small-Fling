"""
Dynamic Issue Discovery Observer:
Observes live display + ADB window state, dynamically discovers which atomic
or compounding issues are currently present, and returns recommended workaround
action IDs that can be attached to the active node with 1 click.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional

from observation_actions.base_action import (
    ObservationContext,
    ObservationVerdict,
    WorkaroundResult,
    ObservationActionPlugin,
)

logger = logging.getLogger("discovery_observer")


class DynamicIssueDiscoveryObserver:
    """
    Evaluates real-time display and window state against registered Observation Action plugins.
    Discovers active issues and returns recommended workaround actions to attach to DAG nodes.
    """

    @classmethod
    async def observe_live_environment(
        cls,
        serial: Optional[str] = None,
        display_id: Optional[int] = None,
        image_bytes: Optional[bytes] = None,
        active_node_id: Optional[str] = None,
        blackboard: Optional[Any] = None
    ) -> Dict[str, Any]:
        from observation_actions import observation_action_registry
        from services.adb_service import (
            get_active_adb_serial, detect_external_display_id,
            capture_external_screenshot, run_adb_shell
        )
        from services import state

        active_serial = serial or await get_active_adb_serial()
        disp_id = display_id or await detect_external_display_id(active_serial)

        # 1. Capture live frame if not supplied
        snap = image_bytes
        if snap is None:
            snap = await capture_external_screenshot(active_serial, max_cache_age_s=0.0, bypass_lock=True)

        # 2. Inspect active focused window and activity
        act_res = await run_adb_shell(
            "dumpsys activity activities | grep -E 'topResumedActivity|mFocusedApp'",
            active_serial,
            timeout=1.0
        )
        focused_act = act_res.get("stdout", "").strip()

        ctx = ObservationContext(
            serial=active_serial,
            display_id=disp_id,
            image_bytes=snap,
            focused_activity=focused_act,
            node_id=active_node_id,
            blackboard=blackboard,
            project_id=state.get_current_project_id()
        )

        all_plugins = observation_action_registry.list_all_actions()
        detected_issues = []
        clean_actions = []

        # 3. Concurrently observe all registered issue plugins
        async def _eval(plugin: ObservationActionPlugin):
            try:
                detected, reason, details = await plugin.detect_by_observation(ctx)
                return plugin, detected, reason, details
            except Exception as e:
                logger.warning(f"Error evaluating plugin {plugin.id}: {e}")
                return plugin, False, f"Observation exception: {e}", {}

        eval_tasks = [_eval(p) for p in all_plugins]
        eval_results = await asyncio.gather(*eval_tasks, return_exceptions=False)

        for plugin, detected, reason, details in eval_results:
            coords = details.get("target_coordinates") if isinstance(details, dict) else None
            if detected:
                detected_issues.append({
                    "action_id": plugin.id,
                    "id": plugin.id,
                    "config_label": plugin.config_label,
                    "label": plugin.config_label,
                    "category": plugin.category,
                    "default_phase": plugin.default_phase,
                    "hook_phase": plugin.hook_phase,
                    "is_compounding": plugin.is_compounding,
                    "reason": reason,
                    "target_coordinates": coords,
                    "details": details,
                    "priority": plugin.priority
                })
            else:
                clean_actions.append(plugin.id)

        # Sort issues by priority (compounding and critical first)
        detected_issues.sort(key=lambda x: x["priority"])

        # 4. Check which detected issues are currently attached vs unattached on active node
        attached_to_node: List[str] = []
        if active_node_id and active_node_id in state.dag_state.get("nodes", {}):
            node_data = state.dag_state["nodes"][active_node_id]
            attached_to_node = node_data.get("attached_actions", [])

        unattached_detected = [
            issue for issue in detected_issues
            if issue["action_id"] not in attached_to_node
        ]

        # 5. Recommended action IDs ready for 1-click binding
        recommended_actions = [d["action_id"] for d in detected_issues]

        diagnosis_payload = {
            "status": "success",
            "timestamp": asyncio.get_event_loop().time(),
            "active_node_id": active_node_id,
            "display_id": disp_id,
            "serial": active_serial,
            "detected_issues_count": len(detected_issues),
            "detected_issues": detected_issues,
            "unattached_detected": unattached_detected,
            "clean_actions": clean_actions,
            "recommended_actions": recommended_actions,
        }

        # Broadcast live diagnosis to WebSocket subscribers
        if detected_issues:
            from services.state import ws_manager, latest_telemetry
            latest_telemetry["latest_observation_diagnosis"] = diagnosis_payload
            await ws_manager.broadcast({
                "type": "observation_diagnosis",
                "diagnosis": diagnosis_payload
            })

        return diagnosis_payload

    @classmethod
    async def auto_remediate_all_detected(
        cls,
        serial: Optional[str] = None,
        display_id: Optional[int] = None,
        image_bytes: Optional[bytes] = None,
        active_node_id: Optional[str] = None,
        blackboard: Optional[Any] = None
    ) -> List[WorkaroundResult]:
        from observation_actions import observation_action_registry
        from services.adb_service import get_active_adb_serial, detect_external_display_id

        active_serial = serial or await get_active_adb_serial()
        disp_id = display_id or await detect_external_display_id(active_serial)

        diagnosis = await cls.observe_live_environment(
            serial=active_serial,
            display_id=disp_id,
            image_bytes=image_bytes,
            active_node_id=active_node_id,
            blackboard=blackboard
        )

        results: List[WorkaroundResult] = []
        ctx = ObservationContext(
            serial=active_serial,
            display_id=disp_id,
            image_bytes=image_bytes,
            node_id=active_node_id,
            blackboard=blackboard
        )

        for issue in diagnosis.get("detected_issues", []):
            action_id = issue["action_id"]
            # Guard against unprompted OneDrive file navigation gymnastics during DAG execution
            if action_id == "markdown_not_open_navigate_onedrive":
                continue
            action = observation_action_registry.get_action(action_id)
            if action:
                try:
                    res = await action.remediate(ctx)
                    results.append(res)
                except Exception as ex:
                    results.append(WorkaroundResult(
                        action_id=action_id,
                        success=False,
                        message=f"Remediation error: {ex}"
                    ))

        return results

    # Compatibility alias for diagnose_environment
    diagnose_environment = observe_live_environment


DynamicObservationDiscoveryEngine = DynamicIssueDiscoveryObserver

__all__ = [
    "DynamicIssueDiscoveryObserver",
    "DynamicObservationDiscoveryEngine"
]
