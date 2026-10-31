"""
Observation & Workaround Action: Mini-modal / toast pop-up detected over Teams Markdown editor.
Detects floating dark-gray mini-modals (e.g., 'Something went wrong so we couldn't upload...',
'Unable to auto-save. Please save manually to avoid losing work.') and invokes a touch/mouse
click resolver over the right-side 'X' close control of each detected mini-modal.
"""

from typing import Dict, Any, Tuple
from observation_actions.base_action import (
    ObservationActionPlugin,
    ObservationContext,
)


class DismissMiniModalPopupAction(ObservationActionPlugin):
    id = "mini_modal_popup_dismiss"
    config_label = "mini-modal pop-up detected, click X to close"
    category = "environment"
    default_phase = "pre_node"
    priority = 12

    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        from services.adb_service import (
            get_active_adb_serial,
            capture_external_screenshot,
            detect_mini_modal_popups,
        )

        snap = ctx.image_bytes
        if not snap:
            serial = ctx.serial or await get_active_adb_serial()
            if serial and "mock" not in str(serial).lower():
                snap = await capture_external_screenshot(serial, max_cache_age_s=0.3, bypass_lock=True)

        det = detect_mini_modal_popups(snap)
        detected = bool(det.get("detected"))
        popups = det.get("popups", [])
        target_coords = tuple(popups[0]["close_button"]) if popups else None

        if detected:
            coords_str = ", ".join([f"({p['close_button'][0]}, {p['close_button'][1]})" for p in popups])
            reason = f"Detected {len(popups)} mini-modal pop-up(s) over editor; close 'X' control(s) at {coords_str}"
        else:
            reason = "No mini-modal pop-ups detected over editor"

        return (
            detected,
            reason,
            {
                "count": len(popups),
                "popups": popups,
                "target_coordinates": target_coords,
                "close_targets": det.get("close_targets", []),
            },
        )

    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        from services.adb_service import (
            get_active_adb_serial,
            detect_external_display_id,
            resolve_and_dismiss_mini_modals,
        )

        serial = ctx.serial or await get_active_adb_serial()
        disp_id = ctx.display_id or await detect_external_display_id(serial)

        res = await resolve_and_dismiss_mini_modals(
            serial=serial,
            display_id=disp_id,
            image_bytes=ctx.image_bytes,
            caller_node=ctx.node_id or "observation_action",
        )

        if res.get("snapshot_bytes") and ctx.blackboard is not None:
            ctx.blackboard.latest_frame_bytes = res["snapshot_bytes"]
            ctx.blackboard.current_image_bytes = res["snapshot_bytes"]

        return {
            "status": "success" if res.get("resolved") else "error",
            "success": bool(res.get("resolved")),
            "action_id": self.id,
            "message": (
                f"Closed {res.get('popups_dismissed', 0)} mini-modal pop-up(s) via 'X' control"
                if res.get("resolved")
                else "Attempted mini-modal dismissal via 'X' control"
            ),
            "actions_taken": res.get("actions_taken", []),
            "clicks_dispatched": res.get("clicks_dispatched", []),
        }

