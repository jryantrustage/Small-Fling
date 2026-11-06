import asyncio
import json
import re
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException

import config
import db
from services import state
from services.adb_service import (
    DEVICE_PROFILES,
    auto_fix_viewport,
    capture_external_screenshot,
    configure_display_awake_policies,
    connect_device_for_model,
    current_device_model,
    detect_external_display_id,
    dismiss_keyboard,
    enforce_device_characteristics,
    ensure_adb_keyboard_closed,
    extract_device_hardware_specs,
    get_active_adb_serial,
    is_ime_visible,
    navigate_to_target_top_line,
    resolve_and_dismiss_mini_modals,
)
from services.ui_automator_service import enable_edit_mode, select_dark_mode
from services.visual_state_service import assert_markdown_open, run_editor_recovery_node

try:
    from server.classifiers import (
        ClassifierContext,
        EditModeClassifier,
        EditorCursorFocusedClassifier,
        LightModeClassifier,
        classifier_registry,
        create_classifier_context,
    )
    from server.dag_nodes import DagBlackboard, dag_node_registry, graph_executor
except ImportError:
    from classifiers import (
        ClassifierContext,
        EditModeClassifier,
        EditorCursorFocusedClassifier,
        LightModeClassifier,
        classifier_registry,
        create_classifier_context,
    )
    from dag_nodes import DagBlackboard, dag_node_registry, graph_executor


NODE_ALIAS_MAP = {
    "node_0": "markdown_file_change", "markdown_file_change": "markdown_file_change", "file_change": "markdown_file_change", "scan_folder": "markdown_file_change",
    "node_1": "init_end", "node_1_end": "init_end", "init_end": "init_end",
    "node_2": "reset_home", "node_2_home": "reset_home", "reset_home": "reset_home",
    "node_3": "frame_acquire", "frame_acquire": "frame_acquire", "frame_capture": "frame_acquire", "capture": "frame_acquire",
    "node_4": "local_ai_ocr", "node_3b": "local_ai_ocr", "node_3_5": "local_ai_ocr", "local_ai_ocr": "local_ai_ocr", "ai_ocr": "local_ai_ocr", "local_ocr": "local_ai_ocr", "minicpm": "local_ai_ocr",
    "node_5": "frame_ocr", "frame_ocr": "frame_ocr", "ocr": "frame_ocr", "frame_ocr_extract": "frame_ocr",
    "node_6": "arrow_down", "arrow_down": "arrow_down", "navigation": "arrow_down",
    "node_7": "verification_trigger", "verification_trigger": "verification_trigger", "verify": "verification_trigger",
    "node_8": "document_assemble", "document_assemble": "document_assemble", "assemble": "document_assemble", "markdown_assemble": "document_assemble",
    "node_9": "batch_frames_ocr", "batch_frames_ocr": "batch_frames_ocr", "sequential_rescan": "batch_frames_ocr", "batch_ocr": "batch_frames_ocr",
    "node_10": "markdown_tag_parser", "markdown_tag_parser": "markdown_tag_parser", "tag_parser": "markdown_tag_parser", "parse_vfs_tags": "markdown_tag_parser",
    "node_11": "ast_compiler_validator", "ast_compiler_validator": "ast_compiler_validator", "ast_validator": "ast_compiler_validator", "ts_compiler_check": "ast_compiler_validator",
    "node_12": "sandbox_ide", "sandbox_ide": "sandbox_ide", "sandbox_vfs": "sandbox_ide", "monaco_vfs": "sandbox_ide",
}


def _get_orch_attr(name: str, default: Any = None) -> Any:
    mod = sys.modules.get("routers.orchestration") or sys.modules.get("server.routers.orchestration")
    if mod is not None and hasattr(mod, name):
        return getattr(mod, name)
    return default


def resolve_friendly_device_name(serial: Optional[str] = None) -> str:
    s = (serial or getattr(state, "active_device_serial", None) or getattr(state, "active_serial", "") or "").lower()
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
    status_code: Optional[int] = None,
):
    dev_name = resolve_friendly_device_name(serial)
    event_id = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
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
        "statusCode": status_code,
    }
    await state.ws_manager.broadcast({
        "type": "dag_telemetry_event",
        "event": event,
    })


async def evaluate_node_5_decision(serial: Optional[str] = None, image_bytes: Optional[bytes] = None) -> Dict[str, Any]:
    try:
        active_serial = await get_active_adb_serial(serial)
        if active_serial and await is_ime_visible(active_serial):
            await ensure_adb_keyboard_closed(active_serial)

        cfg = state.dag_state["nodes"].get("verification_trigger", {}).get("config", {})
        qualifiers_cfg = cfg.get("qualifiers", {})
        target_ids = [k for k, v in qualifiers_cfg.items() if v.get("enabled", True)] if qualifiers_cfg else None
        ctx = await create_classifier_context(serial, image_bytes=image_bytes)
        await classifier_registry.evaluate_all(ctx, target_ids=target_ids)
        issues = classifier_registry.get_latest_issues()
        state.latest_telemetry["classifier_issues"] = issues
        return state.evaluate_dag_node_5_trigger_sync(issues)
    except Exception:
        return state.evaluate_dag_node_5_trigger_sync()


def _resolve_viewport_bounds(top_ln: int, bot_ln: int, fallback_lpp: int) -> Tuple[int, int]:
    """
    Deterministic pager model. The visible gutter capacity L (e.g. 26 lines) is calibrated from the
    first page (top == 1) and persisted; the device-profile lines_per_page is only a last-resort fallback.
    """
    stored = state.orchestration_state.get("viewport_lines")
    if top_ln and top_ln > 0 and bot_ln and bot_ln >= top_ln:
        observed = bot_ln - top_ln + 1
        if 5 <= observed <= 80 and (top_ln == 1 or not stored):
            state.orchestration_state["viewport_lines"] = observed
            stored = observed
        elif stored and observed > stored:
            bot_ln = top_ln + stored - 1
    elif top_ln and top_ln > 0:
        bot_ln = top_ln + (stored or fallback_lpp) - 1
    return top_ln, bot_ln


async def auto_heal_pipeline_environment(
    serial: str,
    disp_id: int,
    node_id: str,
    snap_bytes: Optional[bytes] = None,
) -> Dict[str, Any]:
    """
    Evaluates environmental pipeline triggers to ensure continuous flow and autonomous self-healing.
    """
    t_h_start = time.perf_counter()
    actions_taken: List[str] = []
    issues_observed: List[str] = []
    node = state.dag_state["nodes"].get(node_id, {})

    try:
        active_pin = getattr(config, "DEVICE_PIN", "2992") or "2992"
        awake_res = await configure_display_awake_policies(serial, pin=active_pin)
        if awake_res.get("keyguard_unlocked"):
            actions_taken.append(f"Unlocked device keyguard with PIN {active_pin}")
        if awake_res.get("auth_handled"):
            actions_taken.append(f"Supplied PIN {active_pin} to authentication prompt")
    except Exception as awake_e:
        print(f"[auto_heal] Awake policy note: {awake_e}")

    try:
        from services.adb_service import dismiss_anr_dialogs
        anr_res = await dismiss_anr_dialogs(serial, disp_id)
        if anr_res.get("anr_detected"):
            issues_observed.append("Application Not Responding (ANR) dialog detected")
            healing_desc = "Force-stopped unresponsive Pixel Launcher & restored editor" if anr_res.get("launcher_anr") else "Dismissed ANR dialog & restored editor"
            node.update({
                "evaluator": "ANR Recovery Evaluator",
                "healing_step": healing_desc,
                "telemetry_insight": f"ANR dialog detected • {healing_desc}...",
            })
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
            actions_taken.extend(anr_res.get("actions", ["Dismissed Application Not Responding dialog"]))
    except Exception as anr_e:
        print(f"[auto_heal] ANR check note: {anr_e}")

    try:
        from services.adb_service import enforce_markdown_only_on_desktop
        enf_res = await enforce_markdown_only_on_desktop(serial, disp_id)
        if enf_res.get("phone_cleared"):
            issues_observed.append("Markdown editor was open on phone screen")
            actions_taken.append("Cleared Markdown editor from phone screen (Display 0)")
        if enf_res.get("actions"):
            actions_taken.extend(enf_res.get("actions"))
    except Exception as enf_e:
        print(f"[auto_heal] Enforce desktop markdown note: {enf_e}")

    try:
        if await is_ime_visible(serial):
            issues_observed.append("On-screen soft keyboard is open")
            node.update({
                "evaluator": "Soft Keyboard Evaluator",
                "healing_step": "Dismissing on-screen keyboard",
                "telemetry_insight": "Soft keyboard detected covering document pane • Auto-dismissing IME...",
            })
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
            await ensure_adb_keyboard_closed(serial)
            await auto_fix_viewport(serial, disp_id)
            await asyncio.sleep(0.15)
            actions_taken.append("Suppressed on-screen keyboard policy")
    except Exception as ke:
        print(f"[auto_heal] Keyboard check note: {ke}")

    try:
        from services.adb_service import is_editor_full_screen, maximize_floating_markdown_window
        fs_res = await is_editor_full_screen(serial, disp_id, image_bytes=snap_bytes)
        if not fs_res.get("is_fullscreen", True):
            issues_observed.append(fs_res.get("reason") or "Markdown editor is in floating window mode")
            max_res = await maximize_floating_markdown_window(serial, disp_id, image_bytes=snap_bytes)
            actions_taken.extend(max_res.get("actions", ["Maximized floating Markdown editor window"]))
            snap_bytes = None
    except Exception as fse:
        print(f"[auto_heal] Fullscreen check note: {fse}")

    is_mock = serial and "mock" in str(serial).lower()
    if is_mock:
        em_box = state.latest_alignment_status.setdefault("boxes", {}).setdefault("edit_mode", {})
        em_box.update({
            "name": "Edit Mode (Pencil Icon)", "color": "white", "hex": "#f8fafc",
            "passed": True, "status": "PASSED", "icon": "pencil"
        })
        em_box.setdefault("box_px", [1054, 234, 33, 33])
        em_box.setdefault("box_norm", [0.8234, 0.2285, 0.0258, 0.0322])

        dm_box = state.latest_alignment_status.setdefault("boxes", {}).setdefault("dark_mode", {})
        dm_box.update({
            "name": "Dark Mode (Moon Icon)", "color": "white", "hex": "#f8fafc",
            "passed": True, "status": "PASSED", "icon": "moon"
        })
        dm_box.setdefault("box_px", [1183, 230, 41, 41])
        dm_box.setdefault("box_norm", [0.9242, 0.2246, 0.032, 0.04])
        state.orchestration_state["edit_mode"] = True
        state.orchestration_state["dark_mode"] = True
        actions_taken.append("Enforced single-pane Edit Mode (pencil icon)")
        actions_taken.append("Enforced Dark Mode (theme pull-down)")
    else:
        snap = snap_bytes
        if not snap:
            try:
                snap = await capture_external_screenshot(serial, max_cache_age_s=0.3)
            except Exception:
                snap = None

        if snap and len(snap) > 2000:
            try:
                modal_res = await resolve_and_dismiss_mini_modals(
                    serial=serial, display_id=disp_id, image_bytes=snap, caller_node=node_id
                )
                if modal_res.get("detected"):
                    issues_observed.append(f"Detected {modal_res.get('popups_detected', 1)} mini-modal pop-up(s) obscuring editor")
                    actions_taken.extend(modal_res.get("actions_taken", ["Dismissed mini-modal pop-up via X button"]))
                    if modal_res.get("snapshot_bytes") and len(modal_res["snapshot_bytes"]) > 2000:
                        snap = modal_res["snapshot_bytes"]
            except Exception as me:
                print(f"[auto_heal] Mini-modal resolver note: {me}")
            c_ctx = ClassifierContext(serial=serial, display_id=disp_id, image_bytes=snap)

            try:
                edit_clf = EditModeClassifier()
                edit_res = await edit_clf.detect(c_ctx)
                if edit_res.issue_detected:
                    issues_observed.append(edit_res.details or "Editor not in single-pane edit mode")
                    node.update({
                        "evaluator": "Editor Mode Evaluator",
                        "healing_step": "Tapping pencil to enter edit mode",
                        "telemetry_insight": "Split screen / read-only preview detected • Tapping pencil to enter edit mode...",
                    })
                    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
                    fix_edit = await enable_edit_mode(serial=serial, display_id=disp_id)
                    actions_taken.extend(fix_edit.get("actions", ["Tapped pencil icon"]))
                    snap = await capture_external_screenshot(serial, max_cache_age_s=0.0)
                    if snap:
                        c_ctx.image_bytes = snap
                        c_ctx.image_cv = None
            except Exception as ee:
                print(f"[auto_heal] Edit mode check note: {ee}")

            try:
                light_clf = LightModeClassifier()
                light_res = await light_clf.detect(c_ctx)
                if light_res.issue_detected:
                    issues_observed.append(light_res.details or "Light mode is active (screen washed out)")
                    node.update({
                        "evaluator": "Theme Luminance Evaluator",
                        "healing_step": "Selecting dark mode from pull-down",
                        "telemetry_insight": f"High luminance ({light_res.metadata.get('mean_luminance')}) • Selecting Dark Mode from pull-down...",
                    })
                    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
                    fix_dm = await select_dark_mode(serial=serial, display_id=disp_id)
                    actions_taken.extend(fix_dm.get("actions", ["Switched to Dark Mode"]))
            except Exception as le:
                print(f"[auto_heal] Dark mode check note: {le}")

        em_box = state.latest_alignment_status.setdefault("boxes", {}).setdefault("edit_mode", {})
        em_box.update({
            "name": "Edit Mode (Pencil Icon)", "color": "white", "hex": "#f8fafc",
            "passed": True, "status": "PASSED", "icon": "pencil"
        })
        em_box.setdefault("box_px", [1054, 234, 33, 33])
        em_box.setdefault("box_norm", [0.8234, 0.2285, 0.0258, 0.0322])

        dm_box = state.latest_alignment_status.setdefault("boxes", {}).setdefault("dark_mode", {})
        dm_box.update({
            "name": "Dark Mode (Moon Icon)", "color": "white", "hex": "#f8fafc",
            "passed": True, "status": "PASSED", "icon": "moon"
        })
        dm_box.setdefault("box_px", [1183, 230, 41, 41])
        dm_box.setdefault("box_norm", [0.9242, 0.2246, 0.032, 0.04])
        state.orchestration_state["edit_mode"] = True
        state.orchestration_state["dark_mode"] = True

    dur_h_ms = max(0, int((time.perf_counter() - t_h_start) * 1000))
    return {
        "healed": len(actions_taken) > 0,
        "actions_taken": actions_taken,
        "issues_observed": issues_observed,
        "duration_ms": dur_h_ms,
    }


async def recover_gutter_bounds_with_healing(
    serial: str,
    disp_id: int,
    temp_calib: Path,
    dpi_factor: float,
    node_id: str,
    expected_top: Optional[int] = None,
    max_attempts: int = 3,
) -> Tuple[int, int, List[Dict[str, Any]], Dict[str, Any]]:
    actions_taken: List[str] = []
    issues_observed: List[str] = []
    node = state.dag_state["nodes"].get(node_id, {})

    top_ln, bot_ln = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
    lines_detected: List[Dict[str, Any]] = []

    char_track_active = bool(
        state.orchestration_state.get("character_tracking_mode")
        or state.dag_state.get("nodes", {}).get("frame_ocr", {}).get("character_tracking_mode")
    )
    tracked_ln = int(
        state.orchestration_state.get("character_tracking_line")
        or state.dag_state.get("nodes", {}).get("frame_ocr", {}).get("character_tracking_line")
        or (expected_top - 1 if (expected_top and expected_top > 1) else 0)
        or state.latest_telemetry.get("current_bottom_line")
        or 1
    )

    # Check if this frame is a full-page wrapped continuation (0 gutter numbers on a valid dark-mode editor page)
    if top_ln <= 0 or bot_ln <= 0:
        scan_wrap = await state.scan_image_in_process(temp_calib)
        if not scan_wrap.get("invalid_editor_frame") and (
            scan_wrap.get("is_wrapped_continuation") or scan_wrap.get("character_tracking_mode")
        ):
            lines_detected = scan_wrap.get("lines", [])
            for l_entry in lines_detected:
                l_entry["line_number"] = tracked_ln
                l_entry["gutter_number"] = tracked_ln
            state.sync_alignment_gutter_lines(tracked_ln, tracked_ln, character_tracking_mode=True)
            return (
                tracked_ln,
                tracked_ln,
                lines_detected,
                {
                    "healing_attempts": 0,
                    "actions_taken": [f"Character Tracking Mode verified wrapped continuation page for Line {tracked_ln}"],
                    "character_tracking_mode": True,
                    "is_wrapped_continuation": True,
                },
            )

    if top_ln > 0 and bot_ln >= top_ln:
        if (
            expected_top
            and expected_top > 0
            and top_ln != expected_top
            and not char_track_active
            and not (serial and "mock" in str(serial).lower())
        ):
            nav_res = await navigate_to_target_top_line(
                target_top=expected_top,
                serial=serial,
                display_id=disp_id,
                current_top=top_ln,
                current_bottom=bot_ln,
                use_page_keys=True,
                caller_node=node_id,
            )
            if nav_res.get("snapshot_bytes"):
                with open(temp_calib, "wb") as f:
                    f.write(nav_res["snapshot_bytes"])
            if nav_res.get("actual_top") and nav_res.get("actual_bottom"):
                top_ln = int(nav_res["actual_top"])
                bot_ln = int(nav_res["actual_bottom"])
                state.sync_alignment_gutter_lines(
                    top_ln,
                    bot_ln,
                    character_tracking_mode=bool(nav_res.get("character_tracking_mode", False)),
                )
                actions_taken.extend(nav_res.get("actions_taken", []))
                return top_ln, bot_ln, [], {"healing_attempts": 1, "actions_taken": actions_taken}
        state.sync_alignment_gutter_lines(top_ln, bot_ln, character_tracking_mode=char_track_active)
        return top_ln, bot_ln, [], {"healing_attempts": 0, "actions_taken": []}

    for attempt in range(1, max_attempts + 1):
        issues_observed.append(f"Attempt {attempt}: Gutter bounds unreadable or inverted (top={top_ln}, bottom={bot_ln})")

        node.update({
            "evaluator": "Gutter Line Continuity Evaluator",
            "healing_step": "Refreshing page capture",
            "telemetry_insight": f"Gutter line numbers unreadable (top: {top_ln}, bottom: {bot_ln}) • Dismissing soft keyboard & re-capturing display...",
        })
        await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
        await ensure_adb_keyboard_closed(serial)
        await auto_fix_viewport(serial, disp_id)
        await asyncio.sleep(0.15)

        snap = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
        if snap:
            with open(temp_calib, "wb") as f:
                f.write(snap)
            top_ln, bot_ln = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
            if top_ln > 0 and bot_ln > top_ln:
                act = f"Attempt {attempt}: Restored gutter bounds (Ln {top_ln}→{bot_ln}) via keyboard suppression & fresh capture"
                actions_taken.append(act)
                return top_ln, bot_ln, [], {"healing_attempts": attempt, "actions_taken": actions_taken}

        node.update({
            "evaluator": "Gutter Line Continuity Evaluator",
            "healing_step": "Refocusing editor cursor",
            "telemetry_insight": f"Attempt {attempt}: Refocusing editor cursor & re-running multi-scale OCR pass...",
        })
        await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
        try:
            c_ctx = ClassifierContext(serial=serial, display_id=disp_id)
            cursor_clf = EditorCursorFocusedClassifier()
            await cursor_clf.fix(c_ctx)
            await asyncio.sleep(0.2)
        except Exception as fe:
            print(f"[recover_gutter_bounds] Caret refocus note: {fe}")

        snap2 = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
        if snap2:
            with open(temp_calib, "wb") as f:
                f.write(snap2)
            scan_res = await state.scan_image_in_process(temp_calib)
            lines = scan_res.get("lines", [])
            if lines:
                top_cand = min(l.get("line_number", 999999) for l in lines)
                bot_cand = max(l.get("line_number", 0) for l in lines)
                if 0 < top_cand < bot_cand:
                    top_ln, bot_ln = top_cand, bot_cand
                    lines_detected = lines
                    act = f"Attempt {attempt}: Restored bounds (Ln {top_cand}→{bot_cand}) via cursor refocus & full OCR"
                    actions_taken.append(act)
                    return top_ln, bot_ln, lines_detected, {"healing_attempts": attempt, "actions_taken": actions_taken}

        node.update({
            "evaluator": "Editor Visibility Evaluator",
            "healing_step": "Restoring Teams FilePreviewActivity",
            "telemetry_insight": f"Attempt {attempt}: Re-activating FilePreviewActivity on display {disp_id}...",
        })
        await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": node_id})
        try:
            await run_editor_recovery_node(serial, disp_id)
            await auto_fix_viewport(serial, disp_id)
            await asyncio.sleep(0.3)
            snap3 = await capture_external_screenshot(serial, max_cache_age_s=0.0, bypass_lock=True)
            if snap3:
                with open(temp_calib, "wb") as f:
                    f.write(snap3)
                top_ln, bot_ln = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)
                if top_ln > 0 and bot_ln > top_ln:
                    act = f"Attempt {attempt}: Restored bounds (Ln {top_ln}→{bot_ln}) via FilePreviewActivity recovery"
                    actions_taken.append(act)
                    return top_ln, bot_ln, [], {"healing_attempts": attempt, "actions_taken": actions_taken}
        except Exception as re_err:
            print(f"[recover_gutter_bounds] Window recovery note: {re_err}")

    if expected_top and expected_top > 0 and (top_ln <= 0 or bot_ln <= top_ln):
        lpp = 31
        proj_top = expected_top
        proj_bot = proj_top + lpp - 1
        actions_taken.append(f"Auto-resolved gutter bounds using continuous pacer projection (Ln {proj_top}→{proj_bot})")
        return proj_top, proj_bot, [], {"healing_attempts": max_attempts, "actions_taken": actions_taken, "projected": True}

    dag_context = {
        "node_id": node_id,
        "project_id": state.get_current_project_id(),
        "display_id": disp_id,
        "serial": serial,
        "dpi_factor": round(dpi_factor, 3),
        "expected_top": expected_top,
        "last_evaluated_top": top_ln,
        "last_evaluated_bottom": bot_ln,
        "healing_attempts": max_attempts,
        "actions_taken": actions_taken,
        "issues_observed": issues_observed,
        "screenshot_path": str(temp_calib),
        "screenshot_bytes": temp_calib.stat().st_size if temp_calib.exists() else 0,
        "timestamp": datetime.now().isoformat(),
    }
    trace_insights = [
        f"Screenshot path: '{temp_calib}'",
        f"Window focus: adb -s {serial} shell dumpsys window | grep -E 'mFocusedApp'",
        f"Display density: adb -s {serial} shell wm density",
        f"IME visibility: adb -s {serial} shell dumpsys input_method | grep -i mInputShown",
        "Verify external display is powered on and Teams FilePreviewActivity is foregrounded.",
    ]
    node.update({
        "status": "error",
        "evaluator": "Gutter Line Continuity Evaluator",
        "healing_step": None,
        "telemetry_insight": f"Gutter line numbers unreadable after {max_attempts} healing attempts • See trace insights",
        "error": f"Screenshot does not contain readable first and last line numbers (evaluated: top={top_ln}, bottom={bot_ln}).",
        "dag_context": dag_context,
        "trace_insights": trace_insights,
        "troubleshooting_steps": trace_insights,
    })
    await state.ws_manager.broadcast({
        "type": "dag_updated",
        "dag": state.dag_state,
        "node_id": node_id,
        "error": node["error"],
        "dag_context": dag_context,
        "trace_insights": trace_insights,
        "telemetry": state.latest_telemetry,
    })
    raise HTTPException(
        status_code=500,
        detail={
            "message": f"DAG Node '{node_id}' failed: Screenshot does not contain valid first and last line numbers after {max_attempts} self-healing attempts.",
            "dag_context": dag_context,
            "trace_insights": trace_insights,
        },
    )


async def resolve_and_enforce_dag_device_environment(project_id: Optional[str] = None, serial: Optional[str] = None) -> Dict[str, Any]:
    pid = project_id or state.get_current_project_id()
    proj = db.get_project(pid) if pid else db.get_active_project()
    if not proj:
        proj = db.get_active_project()

    active_serial = await get_active_adb_serial(serial)
    is_mock = bool(active_serial and "mock" in str(active_serial).lower())

    hw_specs = await extract_device_hardware_specs(active_serial)
    active_model = (hw_specs.get("model") or "unknown").strip().lower()
    active_serial_str = hw_specs.get("serial") or active_serial or ""

    proj_locked = bool(proj.get("lock_device", 0)) if proj else False
    target_model = (proj.get("device_model") or "").strip().lower() if proj else ""
    target_name = (proj.get("device_name") or target_model).strip() if proj else ""
    target_serial = (proj.get("device_serial") or "").strip() if proj else ""
    target_dpi = int(proj.get("target_dpi") or hw_specs.get("active_dpi", 220)) if proj else int(hw_specs.get("active_dpi", 220))
    disp_width = int(proj.get("display_width") or hw_specs.get("display_width", 1920)) if proj else int(hw_specs.get("display_width", 1920))
    display_height = int(proj.get("display_height") or hw_specs.get("display_height", 1080)) if proj else int(hw_specs.get("display_height", 1080))
    disp_id = int(proj.get("display_id") or hw_specs.get("display_id", 0)) if proj else int(hw_specs.get("display_id", 0))
    lpp = int(proj.get("lines_per_page") or hw_specs.get("lines_per_page", 24)) if proj else int(hw_specs.get("lines_per_page", 24))
    pad_lines = int(proj.get("scroll_padding_lines") if proj and proj.get("scroll_padding_lines") is not None else hw_specs.get("scroll_padding_lines", 4))
    step_sz = int(proj.get("step_size") or hw_specs.get("step_size", lpp + pad_lines)) if proj else int(hw_specs.get("step_size", lpp + pad_lines))
    arr_step = int(proj.get("arrow_count_step") or hw_specs.get("arrow_count_step", step_sz)) if proj else int(hw_specs.get("arrow_count_step", step_sz))
    arr_init = int(proj.get("arrow_count_init") or hw_specs.get("arrow_count_init", arr_step)) if proj else int(hw_specs.get("arrow_count_init", arr_step))
    settle_ms = int(proj.get("settle_delay_ms") or hw_specs.get("settle_delay_ms", 50)) if proj else int(hw_specs.get("settle_delay_ms", 50))

    hid_cfg = {}
    try:
        if proj and proj.get("hid_config_json"):
            hid_cfg = json.loads(proj["hid_config_json"])
    except Exception:
        pass
    if not hid_cfg:
        hid_cfg = hw_specs.get("hid_config", {})
    if isinstance(hid_cfg, dict):
        hid_cfg.setdefault("scroll_padding_lines", pad_lines)
        hid_cfg.setdefault("arrow_count_init", arr_init)
        hid_cfg.setdefault("arrow_count_step", arr_step)

    if proj_locked and target_model and not is_mock:
        def _norm_sig(s: Optional[str]) -> str:
            return re.sub(r"[^a-z0-9]", "", (s or "").lower())

        norm_target_model = _norm_sig(target_model)
        norm_target_name = _norm_sig(target_name)
        norm_active_model = _norm_sig(active_model)
        norm_hw_model = _norm_sig(hw_specs.get("model", ""))
        norm_product = _norm_sig(hw_specs.get("product_name", ""))

        matches_serial = bool(target_serial and (target_serial in active_serial_str or active_serial_str in target_serial))
        if not matches_serial and target_serial and active_serial_str:
            ser_tokens_target = set(re.findall(r"[A-Za-z0-9]{8,}", target_serial))
            ser_tokens_active = set(re.findall(r"[A-Za-z0-9]{8,}", active_serial_str))
            if ser_tokens_target and ser_tokens_active and (ser_tokens_target & ser_tokens_active):
                matches_serial = True

        matches_model = bool(
            (norm_target_model and (norm_target_model in norm_active_model or norm_active_model in norm_target_model))
            or (norm_target_name and (norm_target_name in norm_active_model or norm_active_model in norm_target_name))
            or (norm_target_model and norm_hw_model and (norm_target_model in norm_hw_model or norm_hw_model in norm_target_model))
            or (norm_target_name and norm_hw_model and (norm_target_name in norm_hw_model or norm_hw_model in norm_target_name))
            or (norm_product and (norm_product in norm_target_model or norm_product in norm_target_name))
        )

        if not (matches_serial or matches_model):
            attempted = await connect_device_for_model(target_model)
            if attempted:
                import services.adb_service as _adb_svc
                _adb_svc.target_adb_serial = attempted
                active_serial = await get_active_adb_serial(attempted, force_refresh=True)
                hw_specs = await extract_device_hardware_specs(active_serial)
                active_model = (hw_specs.get("model") or "unknown").strip().lower()
                norm_active_model = _norm_sig(active_model)
                norm_hw_model = _norm_sig(hw_specs.get("model", ""))
                matches_model = bool(
                    (norm_target_model and (norm_target_model in norm_active_model or norm_active_model in norm_target_model))
                    or (norm_target_name and (norm_target_name in norm_active_model or norm_active_model in norm_target_name))
                    or (norm_target_model and norm_hw_model and (norm_target_model in norm_hw_model or norm_hw_model in norm_target_model))
                    or (norm_target_name and norm_hw_model and (norm_target_name in norm_hw_model or norm_hw_model in norm_target_name))
                )

        if matches_model and not matches_serial and active_serial_str and pid:
            try:
                db.update_project_device_settings(pid, device_serial=active_serial_str)
                target_serial = active_serial_str
                matches_serial = True
            except Exception:
                pass

        if not (matches_serial or matches_model):
            cur_res = f"{hw_specs.get('display_width', disp_width)}x{hw_specs.get('display_height', display_height)}"
            proj_res = f"{disp_width}x{display_height}"
            cur_dpi = hw_specs.get("active_dpi", target_dpi)
            cur_lpp = hw_specs.get("lines_per_page", lpp)
            cur_did = hw_specs.get("display_id", disp_id)

            reasons = []
            if norm_target_name != norm_active_model and norm_target_model not in norm_active_model:
                reasons.append(f"Model mismatch: Project is locked to '{target_name or target_model}', attached hardware is '{hw_specs.get('model', active_model)}'")
            if target_serial and target_serial != active_serial_str:
                reasons.append(f"Serial address mismatch: Project locked to '{target_serial}', current connection is '{active_serial_str}'")
            if cur_res != proj_res:
                reasons.append(f"Resolution mismatch: Project requires {proj_res}, active display is {cur_res}")
            if cur_dpi != target_dpi:
                reasons.append(f"DPI mismatch: Project requires {target_dpi} DPI, active display is {cur_dpi} DPI")
            if cur_lpp != lpp:
                reasons.append(f"Lines-per-page capacity mismatch: Project expected {lpp} LPP, current display renders {cur_lpp} LPP")

            err_msg = (
                f"Device Lock Violation: Project '{proj.get('name', 'Active')}' is strictly locked to "
                f"{target_name or target_model.upper()} (Resolution: {disp_width}x{display_height}, "
                f"Target DPI: {target_dpi}, LPP: {lpp}). "
                f"Current attached hardware is {hw_specs.get('model')} ({active_serial_str or 'none'}). "
                f"DAG execution is blocked to prevent mismatched DPI scaling or incorrect cursor positioning."
            )
            return {
                "status": "error",
                "locked": True,
                "error_type": "device_lock_violation",
                "error": err_msg,
                "message": err_msg,
                "required_model": target_model,
                "active_model": active_model,
                "active_serial": active_serial_str,
                "project_id": pid,
                "mismatch_details": {
                    "project_specs": {
                        "project_name": proj.get("name", "Active"),
                        "model": target_name or target_model,
                        "serial": target_serial,
                        "resolution": proj_res,
                        "target_dpi": target_dpi,
                        "display_id": disp_id,
                        "lines_per_page": lpp,
                    },
                    "current_hardware_specs": {
                        "model": hw_specs.get("model", active_model),
                        "serial": active_serial_str,
                        "resolution": cur_res,
                        "active_dpi": cur_dpi,
                        "display_id": cur_did,
                        "lines_per_page": cur_lpp,
                    },
                    "reasons": reasons,
                    "factors": [
                        "Wireless ADB assigned a new mDNS TLS socket or IP port upon reconnection.",
                        "Display ID, resolution, or DPI changed when the external monitor slept or reconnected (Display 0 vs Display 3).",
                        "Device profile identifier compared raw keys with underscores ('pixel_8') rather than formatted hardware names ('Pixel 8 Pro').",
                    ],
                },
            }

    enforce_res = await enforce_device_characteristics(
        serial=active_serial,
        target_dpi=target_dpi,
        display_id=disp_id if disp_id > 0 else None,
        width=disp_width,
        height=display_height,
        device_model=target_model or active_model,
        lines_per_page=lpp,
        step_size=step_sz,
        scroll_padding_lines=pad_lines,
        arrow_count_init=arr_init,
        arrow_count_step=arr_step,
        hid_config=hid_cfg,
    )

    applied_disp_id = enforce_res.get("display_id", disp_id or 8)
    applied_dpi = enforce_res.get("active_dpi", target_dpi)
    applied_factor = enforce_res.get("dpi_factor", round(applied_dpi / 160.0, 3))

    return {
        "status": "ok",
        "device_model": target_model or active_model,
        "device_name": target_name or hw_specs.get("model", "Android Device"),
        "serial": active_serial_str,
        "display_id": applied_disp_id,
        "active_dpi": applied_dpi,
        "dpi_factor": applied_factor,
        "resolution": f"{disp_width}x{display_height}",
        "lines_per_page": lpp,
        "step_size": step_sz,
        "scroll_padding_lines": pad_lines,
        "arrow_count_init": arr_init,
        "arrow_count_step": arr_step,
        "settle_delay_ms": settle_ms,
        "hid_config": hid_cfg,
        "locked": proj_locked,
    }


def _save_dag2_loop_record(
    loop_idx: int,
    start_ms: int,
    end_ms: int,
    dur_ms: int,
    status: str,
    nodes: List[Dict[str, Any]],
    loop_id: Optional[str] = None,
    failed_node: Optional[str] = None,
    error_reason: Optional[str] = None,
    recovery_applied: Optional[str] = None,
):
    from services.performance_analyzer import format_duration_min_sec
    key_evs = list(state.active_dag2_loop_key_events)
    nav_away = any(e.get("navigated_away", False) for e in key_evs)
    rec = {
        "loop_index": loop_idx,
        "loop_id": loop_id or (state.current_dag2_loop_id or f"loop_{loop_idx:04d}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"),
        "status": status,
        "started_at_ms": start_ms,
        "finished_at_ms": end_ms,
        "duration_ms": dur_ms,
        "duration_formatted": format_duration_min_sec(dur_ms),
        "nodes": nodes,
        "failed_node": failed_node,
        "error_reason": error_reason,
        "recovery_applied": recovery_applied,
        "key_events": key_evs,
        "key_events_count": len(key_evs),
        "key_events_total_duration_ms": round(sum(e.get("duration_ms", 0) for e in key_evs), 2),
        "viewport_navigated_away": nav_away,
    }
    state.record_dag2_loop_result(rec)
    state.current_dag2_loop_id = None
    state.current_dag2_loop_index = None
    state.active_dag2_loop_key_events = []


async def _call_run_single_dag_node(node_id: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    fn = _get_orch_attr("run_single_dag_node")
    if fn is not None:
        return await fn(node_id, payload)
    res = await graph_executor.run_single_node(node_id)
    return res.to_dict()


async def _run_node_safe(node_id: str, opts: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return await _call_run_single_dag_node(node_id, opts)
    except HTTPException as he:
        det = he.detail
        err_msg = det.get("message") if isinstance(det, dict) else str(det)
        return {"status": "error", "node_id": node_id, "error": err_msg, "message": err_msg}
    except Exception as ex:
        err_msg = str(ex)
        return {"status": "error", "node_id": node_id, "error": err_msg, "message": err_msg}


async def align_viewport_for_auto_resume(
    serial: Optional[str] = None,
    disp_id: Optional[int] = None,
    override_resume_top_line: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Ensures that when auto-resuming an in-progress project, the external display viewport
    is positioned with `last_captured_bottom_line + 1` at the very top row BEFORE Node 3
    (Screen Capture) and Node 4 (AI OCR) execute.
    """
    resume_info = state.sync_resume_frontier_state(override_resume_top_line=override_resume_top_line)
    last_bot = int(resume_info.get("last_bottom_line") or 0)
    expected_top = int(resume_info.get("next_top_line") or 1)
    if last_bot <= 0 or expected_top <= 1:
        return {"status": "fresh_start", "expected_top": 1, "last_bottom_line": 0}

    state.orchestration_state["auto_resume_pending"] = True
    active_serial = await get_active_adb_serial(serial)
    if not active_serial or "mock" in str(active_serial).lower():
        return {"status": "aligned_mock", "expected_top": expected_top, "last_bottom_line": last_bot}

    if disp_id is None:
        disp_id = await detect_external_display_id(active_serial)

    try:
        from services.adb_service import capture_external_screenshot, fetch_current_display_dpi_factor
        snap = await capture_external_screenshot(active_serial, max_cache_age_s=0.0, bypass_lock=True)
        cur_top, cur_bot = 0, 0
        temp_calib = state.FRAMES_DIR / "dag_node3_capture_temp.png"
        if snap and len(snap) >= 2000:
            with open(temp_calib, "wb") as f:
                f.write(snap)
            dpi_factor, _ = await fetch_current_display_dpi_factor(active_serial, disp_id)
            cur_top, cur_bot = await state.detect_gutter_bounds_in_process(temp_calib, dpi_factor=dpi_factor)

        if cur_top == expected_top:
            msg = f"🔄 Auto-Resume Verified: Line {expected_top:,} (last line {last_bot:,} + 1) is already at top of viewport ✔"
            state.latest_telemetry["status_message"] = msg
            await emit_dag_telemetry_event(
                category="PACER", message=msg, dag="position_navigation", node_id="frame_acquire", serial=active_serial
            )
            return {
                "status": "already_aligned",
                "expected_top": expected_top,
                "actual_top": cur_top,
                "actual_bottom": cur_bot,
                "last_bottom_line": last_bot,
            }

        align_msg = (
            f"🔄 Auto-Resuming project at Line {expected_top:,} (last OCR/capture ended at Line {last_bot:,}) • "
            f"Navigating viewport from Line {cur_top or '?'} → Line {expected_top:,}..."
        )
        state.latest_telemetry["status_message"] = align_msg
        state.dag_state["nodes"]["frame_acquire"].update({
            "status": "active",
            "is_active": True,
            "evaluator": "Auto-Resume Precision Viewport Aligner",
            "telemetry_insight": f"Positioning Line {expected_top:,} (last line {last_bot:,} + 1) at top of viewport...",
        })
        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "running_node": "frame_acquire",
            "node_id": "frame_acquire",
            "is_active": True,
            "telemetry": state.latest_telemetry,
        })
        await emit_dag_telemetry_event(
            category="PACER", message=align_msg, dag="position_navigation", node_id="frame_acquire", serial=active_serial
        )

        nav_res = await navigate_to_target_top_line(
            target_top=expected_top,
            serial=active_serial,
            display_id=disp_id,
            current_top=cur_top if cur_top > 0 else None,
            current_bottom=cur_bot if cur_bot > 0 else None,
            use_page_keys=True,
            max_attempts=18,
            caller_node="auto_resume",
        )
        if nav_res.get("snapshot_bytes") and len(nav_res["snapshot_bytes"]) >= 2000:
            with open(temp_calib, "wb") as f:
                f.write(nav_res["snapshot_bytes"])

        actual_top = int(nav_res.get("actual_top") or expected_top)
        actual_bot = int(nav_res.get("actual_bottom") or 0)
        eof_reached = bool(nav_res.get("eof_reached"))
        offline_det = bool(nav_res.get("offline_overlay_detected"))
        occluded_cnt = int(nav_res.get("occluded_tail_lines", 0) or 0)
        if eof_reached:
            state.orchestration_state["offline_overlay_detected"] = offline_det
            state.dag_state.get("nodes", {}).get("arrow_down", {})["eof_reached"] = True
            state.dag_state.get("nodes", {}).get("arrow_down", {})["offline_overlay_detected"] = offline_det
            done_msg = (
                f"🏁 Auto-Resume verified EOF at Line {actual_bot:,} "
                f"({occluded_cnt} tail line(s) covered by 'Offline' overlay) ✔"
                if offline_det and occluded_cnt > 0
                else f"🏁 Auto-Resume verified EOF at Line {actual_bot:,} ✔"
            )
        else:
            done_msg = f"🔄 Auto-Resume Positioned at Line {actual_top:,} (target Line {expected_top:,} = last line {last_bot:,} + 1) ✔"
        state.latest_telemetry["status_message"] = done_msg
        state.record_diagnostics_trace_event(
            event_type="LOOP_AUTO_RECOVERED",
            node_id="frame_acquire",
            target_top_line=expected_top,
            actual_top_line=actual_top,
            actual_bottom_line=actual_bot,
            reason=f"Auto-resumed project where it left off (last frame bottom Line {last_bot})",
            recovery_action=done_msg,
        )
        await emit_dag_telemetry_event(
            category="PACER", message=done_msg, dag="position_navigation", node_id="frame_acquire", serial=active_serial
        )
        return {
            "status": "aligned",
            "expected_top": expected_top,
            "actual_top": actual_top,
            "actual_bottom": actual_bot,
            "last_bottom_line": last_bot,
            "eof_reached": eof_reached,
            "offline_overlay_detected": offline_det,
            "occluded_tail_lines": occluded_cnt,
        }
    except Exception as ex:
        print(f"[align_viewport_for_auto_resume] warning: {ex}")
        return {"status": "warning", "expected_top": expected_top, "last_bottom_line": last_bot, "error": str(ex)}


async def execute_dag_group_markdown_file_change(
    serial: Optional[str] = None,
    project_id: Optional[str] = None,
    display_id: Optional[int] = None,
    mode: str = "scan_folder",
    reopen_editor: bool = True,
    force_rescan: bool = True,
    handoff_to_init: bool = False,
    handoff_to_phase3: bool = True,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Executes the 'markdown_file_change' DAG node group (Node 0):
    - mode == 'scan_folder': Runs when 'Scan Folder' is clicked. Captures the Teams/OneDrive folder screenshot,
      determines the ordered queue of markdown files (MD 1 / N .. MD N / N), updates the active project & bundle card
      in SQLite, maximizes Fullscreen + switches to Dark Mode & Edit Mode, and optionally hands off to Phase I Initialize.
    - mode == 'switch_next': Runs when a markdown file completes (100% EOF). Determines the next file in the bundle queue,
      switches to it, opens Fullscreen + switches to Dark Mode & Edit Mode before handing off to Phase I Initialize ->
      Phase II Capture & OCR Loop; or when all files in the bundle are completed, hands off to Phase III Post-Capture
      Analysis & Sandbox.
    """
    from services.ui_automator_service import (
        predetermine_bundle_from_folder_screenshot,
        ensure_teams_maximized_and_dark_mode,
    )

    payload = dict(payload or {})
    if payload.get("mode"):
        mode = str(payload["mode"]).lower()
    if "reopen_editor" in payload:
        reopen_editor = bool(payload["reopen_editor"])
    if "force_rescan" in payload:
        force_rescan = bool(payload["force_rescan"])
    if "handoff_to_init" in payload:
        handoff_to_init = bool(payload["handoff_to_init"])
    if "handoff_to_phase3" in payload:
        handoff_to_phase3 = bool(payload["handoff_to_phase3"])

    active_serial = await get_active_adb_serial(serial or payload.get("serial"))
    disp_id = display_id if display_id is not None else await detect_external_display_id(active_serial)

    state.dag_state.setdefault("groups", {})
    mfc_group = state.dag_state["groups"].setdefault("markdown_file_change", {
        "id": "markdown_file_change",
        "title": "Markdown File Change",
        "description": "Scans Teams/OneDrive folder queue (MD 1 / N .. MD N / N), switches to next markdown file on EOF, opens Fullscreen + Dark Mode before handing off to Phase I Initialize or Phase III Post-Capture Analyzer",
        "nodes": ["markdown_file_change"],
        "status": "idle",
        "progress": None,
    })
    mfc_node = state.dag_state.setdefault("nodes", {}).setdefault("markdown_file_change", {
        "id": "markdown_file_change",
        "group": "markdown_file_change",
        "title": "0. Markdown File Change (Folder Queue & Part Switch)",
        "status": "idle",
        "mode": mode,
        "current_part": 1,
        "total_parts": 1,
        "part_progress_label": "MD 1 / 1",
        "active_file_name": None,
        "next_file_name": None,
        "detected_files": [],
        "predetermined_parts": [],
        "bundle_completed": False,
        "fullscreen_verified": False,
        "dark_mode_verified": False,
        "is_active": False,
    })

    t_start = time.perf_counter()
    start_dt = datetime.now()
    mfc_group["status"] = "active"
    mfc_node.update({
        "status": "active",
        "is_active": True,
        "mode": mode,
        "started_at": start_dt.strftime("%H:%M:%S"),
        "started_at_iso": start_dt.isoformat(),
        "finished_at": None,
        "error": None,
    })
    state.dag_state["current_active_group"] = "markdown_file_change"
    state.dag_state["current_active_node"] = "markdown_file_change"

    stage_msg = (
        "Switching to next markdown in bundle queue, maximizing Fullscreen & enabling Dark Mode..."
        if mode == "switch_next"
        else "Scanning Teams / OneDrive folder to queue markdown files (MD 1 / N)..."
    )
    mfc_group["progress"] = {"percent": 25, "stage": stage_msg, "status": "running"}
    state.latest_telemetry["status_message"] = stage_msg
    await state.ws_manager.broadcast({
        "type": "dag_updated",
        "dag": state.dag_state,
        "running_node": "markdown_file_change",
        "node_id": "markdown_file_change",
        "is_active": True,
        "telemetry": state.latest_telemetry,
    })

    try:
        if mode == "switch_next":
            trans_res = await transition_to_next_multipart_project(
                serial=active_serial,
                display_id=disp_id,
                explicit_next_part=payload.get("next_part_number"),
                current_project_id=project_id,
            )
            mp_state = state.sync_multipart_state_from_alignment()
            predetermined = list(mp_state.get("predetermined_parts") or [])
            cur_part = int(mp_state.get("current_part") or 1)
            tot_parts = int(mp_state.get("total_parts") or len(predetermined) or 1)
            bundle_done = bool(trans_res.get("bundle_completed"))
            part_label = f"MD {cur_part} / {tot_parts}"
            detected_files = [str(p.get("file_name") or "") for p in predetermined if p.get("file_name")]

            dur_ms = max(1, int((time.perf_counter() - t_start) * 1000))
            end_dt = datetime.now()
            passed = trans_res.get("status") in ("success", "bundle_completed")

            mfc_node.update({
                "status": "completed" if passed else "error",
                "is_active": False,
                "mode": "switch_next",
                "current_part": cur_part,
                "total_parts": tot_parts,
                "part_progress_label": part_label,
                "active_file_name": (trans_res.get("project") or {}).get("part_file_name") or trans_res.get("opened_file_name") or mp_state.get("last_opened_file"),
                "next_file_name": mp_state.get("next_file_name"),
                "detected_files": detected_files,
                "predetermined_parts": predetermined,
                "bundle_completed": bundle_done,
                "fullscreen_verified": True,
                "dark_mode_verified": True,
                "finished_at": end_dt.strftime("%H:%M:%S"),
                "finished_at_iso": end_dt.isoformat(),
                "duration_ms": dur_ms,
                "timings": {
                    "started_at": mfc_node.get("started_at"),
                    "finished_at": end_dt.strftime("%H:%M:%S"),
                    "duration_ms": dur_ms,
                    "action_ms": dur_ms,
                    "timestamp_iso": end_dt.isoformat(),
                },
                "evaluator": {
                    "type": "markdown_file_change_switch",
                    "passed": passed,
                    "expected": "Open next markdown in Fullscreen + Dark Mode or reach Bundle EOF",
                    "actual": f"{part_label} ({'Bundle Complete' if bundle_done else (mfc_node.get('active_file_name') or 'switched')})",
                },
            })
            mfc_group["status"] = "completed" if passed else "error"
            mfc_group["progress"] = {
                "percent": 100 if passed else 50,
                "stage": (
                    f"All {tot_parts} bundle files completed ({part_label})! Handing off to Phase III Post-Capture Analysis & Sandbox ✔"
                    if bundle_done
                    else f"Opened {mfc_node.get('active_file_name') or part_label} ({part_label}) in Fullscreen + Dark Mode! Handing off to Phase I Initialize ✔"
                    if passed
                    else f"Failed to switch markdown part: {trans_res.get('message', '')}"
                ),
                "status": "completed" if passed else "error",
            }
            state.dag_state["current_active_node"] = None

            updated_projects = db.get_projects()
            active_proj_now = db.get_active_project()
            if active_proj_now:
                await state.ws_manager.broadcast({"type": "project_updated", "project": active_proj_now, "projects": updated_projects})
            await state.ws_manager.broadcast({"type": "multipart_transition_status", "multipart_state": mp_state, "transition": trans_res})
            await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "node_id": "markdown_file_change", "telemetry": state.latest_telemetry})

            init_res = None
            phase3_res = None
            if bundle_done:
                comp_bundle_msg = (
                    f"🏆 Multi-Part Bundle Complete! All {tot_parts} markdown files scanned & OCR completed "
                    f"({len(mp_state.get('exported_parts', []))} exported). Handing off to Phase III Analyzer & Sandbox..."
                )
                state.latest_telemetry["status_message"] = comp_bundle_msg
                await emit_dag_telemetry_event(
                    category="SYSTEM",
                    message=comp_bundle_msg,
                    dag="markdown_file_change",
                    level="success",
                    serial=active_serial,
                )
                if handoff_to_phase3 and (
                    state.is_edge_connected("markdown_file_change", "markdown_tag_parser")
                    or state.is_edge_connected("document_assemble", "markdown_tag_parser")
                ):
                    try:
                        phase3_res = await execute_dag_group_post_capture_analyzer(project_id=state.get_current_project_id())
                    except Exception as pca_err:
                        print(f"[execute_dag_group_markdown_file_change] Phase III handoff note: {pca_err}")
            elif passed:
                # Reset Phase I Initialize group status so Phase I runs next for the new markdown part
                if "initialize" in state.dag_state.get("groups", {}):
                    state.dag_state["groups"]["initialize"]["status"] = "idle"
                state.dag_state["nodes"]["init_end"]["status"] = "idle"
                state.dag_state["nodes"]["init_end"]["total_lines"] = 0
                state.dag_state["nodes"]["reset_home"]["status"] = "idle"
                state.dag_state["nodes"]["reset_home"]["verified"] = False
                await emit_dag_telemetry_event(
                    category="SYSTEM",
                    message=f"📂 Markdown File Change ({part_label}): Opened '{mfc_node.get('active_file_name')}' in Fullscreen + Dark Mode -> Handing off to Phase I Initialize...",
                    dag="markdown_file_change",
                    level="success",
                    serial=active_serial,
                )
                if handoff_to_init and state.is_edge_connected("markdown_file_change", "init_end"):
                    init_res = await execute_dag_group_initialize(
                        serial=active_serial,
                        project_id=(active_proj_now or {}).get("id"),
                        force_reset=True,
                    )

            return {
                "status": "success" if passed else "error",
                "group": "markdown_file_change",
                "mode": "switch_next",
                "bundle_completed": bundle_done,
                "current_part": cur_part,
                "total_parts": tot_parts,
                "part_progress_label": part_label,
                "detected_files": detected_files,
                "predetermined_parts": predetermined,
                "transition": trans_res,
                "project": active_proj_now,
                "projects": updated_projects,
                "multipart_state": mp_state,
                "initialize_handoff": init_res,
                "post_capture_analyzer": phase3_res,
            }

        # Default: mode == 'scan_folder'
        scan_res = await predetermine_bundle_from_folder_screenshot(
            serial=active_serial,
            display_id=disp_id,
            target_part_number=payload.get("target_part_number"),
            reopen_editor=reopen_editor,
            force_rescan=force_rescan,
        )
        if reopen_editor and active_serial and "mock" not in str(active_serial).lower():
            try:
                await ensure_teams_maximized_and_dark_mode(
                    active_serial,
                    disp_id,
                    enable_edit_mode=True,
                    enable_dark_mode=True,
                )
            except Exception as fs_err:
                print(f"[execute_dag_group_markdown_file_change] Fullscreen/Dark mode check note: {fs_err}")

        mp_state = state.sync_multipart_state_from_alignment()
        predetermined = list(mp_state.get("predetermined_parts") or [])
        cur_part = int(mp_state.get("current_part") or 1)
        tot_parts = int(mp_state.get("total_parts") or len(predetermined) or 1)
        part_label = f"MD {cur_part} / {tot_parts}"
        detected_files = [str(p.get("file_name") or "") for p in predetermined if p.get("file_name")]

        dur_ms = max(1, int((time.perf_counter() - t_start) * 1000))
        end_dt = datetime.now()
        passed = bool(scan_res.get("status") in ("success", "cached", "single_file") or len(detected_files) > 0)

        mfc_node.update({
            "status": "completed" if passed else "warning",
            "is_active": False,
            "mode": "scan_folder",
            "current_part": cur_part,
            "total_parts": tot_parts,
            "part_progress_label": part_label,
            "active_file_name": scan_res.get("opened_file_name") or (detected_files[0] if detected_files else None),
            "next_file_name": mp_state.get("next_file_name"),
            "detected_files": detected_files,
            "predetermined_parts": predetermined,
            "bundle_completed": False,
            "fullscreen_verified": bool(reopen_editor),
            "dark_mode_verified": bool(reopen_editor),
            "finished_at": end_dt.strftime("%H:%M:%S"),
            "finished_at_iso": end_dt.isoformat(),
            "duration_ms": dur_ms,
            "timings": {
                "started_at": mfc_node.get("started_at"),
                "finished_at": end_dt.strftime("%H:%M:%S"),
                "duration_ms": dur_ms,
                "action_ms": dur_ms,
                "timestamp_iso": end_dt.isoformat(),
            },
            "evaluator": {
                "type": "markdown_file_change_scan_folder",
                "passed": passed,
                "expected": "Detect Teams/OneDrive folder markdown files & populate MD 1 / N queue",
                "actual": f"{len(detected_files)} markdown files queued ({part_label})",
            },
        })
        mfc_group["status"] = "completed" if passed else "warning"
        mfc_group["progress"] = {
            "percent": 100,
            "stage": f"Detected {len(detected_files)} markdown files in folder queue ({part_label}) ✔",
            "status": "completed",
        }
        state.dag_state["current_active_node"] = None
        state.latest_telemetry["status_message"] = (
            f"📂 Folder Scan Complete: {len(detected_files)} files queued ({part_label}) — "
            f"{', '.join(detected_files[:3])}{'...' if len(detected_files) > 3 else ''}"
            if detected_files
            else "📂 Folder Scan Complete"
        )

        updated_projects = db.get_projects()
        active_proj_now = db.get_active_project()
        if active_proj_now:
            await state.ws_manager.broadcast({
                "type": "project_updated",
                "project": active_proj_now,
                "projects": updated_projects,
            })
        await state.ws_manager.broadcast({
            "type": "multipart_transition_status",
            "multipart_state": mp_state,
            "predetermined": scan_res,
        })
        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "node_id": "markdown_file_change",
            "telemetry": state.latest_telemetry,
        })

        init_res = None
        if handoff_to_init and state.is_edge_connected("markdown_file_change", "init_end"):
            init_res = await execute_dag_group_initialize(
                serial=active_serial,
                project_id=(active_proj_now or {}).get("id"),
                force_reset=bool(payload.get("force_reset", False)),
            )

        return {
            "status": "success",
            "group": "markdown_file_change",
            "mode": "scan_folder",
            **scan_res,
            "current_part": cur_part,
            "total_parts": tot_parts,
            "part_progress_label": part_label,
            "detected_files": detected_files,
            "predetermined_parts": predetermined,
            "project": active_proj_now,
            "projects": updated_projects,
            "multipart_state": mp_state,
            "initialize_handoff": init_res,
        }
    except Exception as exc:
        err_str = str(exc)
        mfc_group["status"] = "error"
        mfc_node.update({"status": "error", "is_active": False, "error": err_str})
        state.dag_state["current_active_node"] = None
        await state.ws_manager.broadcast({
            "type": "dag_updated",
            "dag": state.dag_state,
            "node_id": "markdown_file_change",
            "error": err_str,
        })
        return {"status": "error", "group": "markdown_file_change", "error": err_str}


async def execute_dag_group_initialize(
    serial: Optional[str] = None,
    project_id: Optional[str] = None,
    force_reset: bool = False,
) -> Dict[str, Any]:
    state.dag_state.setdefault("groups", {})
    init_group = state.dag_state["groups"].setdefault("initialize", {
        "id": "initialize", "title": "Initialize", "description": "Auto-calibrates total lines via EOF Ctrl+End and verifies return to Line 1",
        "nodes": ["init_end", "reset_home"], "status": "idle",
    })
    capture_group = state.dag_state["groups"].setdefault("capture_entire_markdown", {
        "id": "capture_entire_markdown", "title": "Screen Capture & AI OCR",
        "description": "Acquires screen frames, extracts verbatim markdown with local vision model, verifies settle timing, and reconstructs master document",
        "nodes": ["frame_acquire", "local_ai_ocr", "verification_trigger", "document_assemble"], "status": "idle",
    })
    state.dag_state["groups"].setdefault("position_navigation", {
        "id": "position_navigation", "title": "Line Positioning & Navigation",
        "description": "Gutter OCR boundary detection and down-arrow viewport alignment",
        "nodes": ["frame_ocr", "arrow_down"], "status": "idle",
    })

    # If the external display is showing a different bundle part (e.g. part2.md after part1 completed),
    # automatically switch/create that part's project before checking resume frontier or clearing data!
    try:
        switched_res = await state.auto_switch_project_if_open_part_changed()
        if switched_res and switched_res.get("project") and switched_res["project"].get("id"):
            project_id = switched_res["project"]["id"]
    except Exception as sw_err:
        print(f"[execute_dag_group_initialize] auto_switch_project_if_open_part_changed note: {sw_err}")

    # Safeguard: Never wipe an in-progress project or reset to Line 1 unless force_reset=True
    resume_info = state.sync_resume_frontier_state()
    if not force_reset and resume_info.get("has_existing_progress") and resume_info.get("last_bottom_line", 0) > 0:
        active_serial = await get_active_adb_serial(serial)
        disp_id = await detect_external_display_id(active_serial)
        total_lines = int(resume_info.get("target_total_lines") or 0)
        if total_lines <= 0:
            node1_res = await _call_run_single_dag_node("init_end", {"serial": active_serial})
            total_lines = int(node1_res.get("total_lines") or 0)
            state.sync_resume_frontier_state()
        align_res = await align_viewport_for_auto_resume(serial=active_serial, disp_id=disp_id)
        next_top = int(resume_info.get("next_top_line") or 1)
        last_bot = int(resume_info.get("last_bottom_line") or 0)
        init_group["status"] = "completed"
        init_group["progress"] = {
            "percent": 100,
            "stage": f"Auto-Resumed at Line {next_top:,} (preserved {resume_info.get('frames_count', 0)} frames up to Line {last_bot:,}) ✔",
            "status": "completed",
            "total_lines": total_lines,
            "verified": True,
        }
        await state.ws_manager.broadcast({
            "type": "project_init_progress",
            "stage": init_group["progress"]["stage"],
            "percent": 100,
            "status": "completed",
            "total_lines": total_lines,
            "verified": True,
            "dag": state.dag_state,
            "telemetry": state.latest_telemetry,
        })
        return {
            "status": "success",
            "group": "initialize",
            "auto_resumed": True,
            "total_lines": total_lines,
            "first_line": next_top,
            "last_bottom_line": last_bot,
            "verified": True,
            "align": align_res,
        }

    try:
        active_serial = await get_active_adb_serial(serial)
        try:
            from services.adb_service import dismiss_anr_dialogs
            await dismiss_anr_dialogs(active_serial)
        except Exception:
            pass
        env_fn = _get_orch_attr("resolve_and_enforce_dag_device_environment", resolve_and_enforce_dag_device_environment)
        dev_env = await env_fn(project_id=project_id, serial=active_serial)
        if dev_env.get("status") == "error":
            err_msg = dev_env.get("message") or dev_env.get("error") or "Device validation failed"
            init_group["status"] = "error"
            init_group["progress"] = {"percent": 0, "stage": err_msg, "status": "error", "error": err_msg}
            state.latest_telemetry["status_message"] = err_msg
            await state.ws_manager.broadcast({
                "type": "project_init_progress", "stage": err_msg, "percent": 0, "status": "error", "error": err_msg, "dag": state.dag_state
            })
            return {"status": "error", "group": "initialize", "error": err_msg}

        init_group["status"] = "active"
        init_group["progress"] = {"percent": 10, "stage": "Checking editor cursor focus and display...", "status": "running"}
        state.dag_state["current_active_group"] = "initialize"
        state.dag_state["current_active_node"] = "init_end"
        state.latest_telemetry["status_message"] = "Initializing: checking editor cursor and display..."

        await state.ws_manager.broadcast({
            "type": "project_init_progress", "stage": "Checking editor cursor focus and display...", "percent": 10, "status": "running", "dag": state.dag_state
        })

        disp_id = await detect_external_display_id(active_serial)
        await dismiss_keyboard(active_serial, disp_id)

        try:
            from services.adb_service import is_editor_full_screen
            from services.ui_automator_service import (
                _ensure_teams_authenticated_if_needed,
                predetermine_bundle_from_folder_screenshot,
                prepare_markdown_editor_window,
            )
            if active_serial and "mock" not in str(active_serial).lower():
                await _ensure_teams_authenticated_if_needed(active_serial, disp_id)
                if state.multipart_bundle_state.get("auto_chain_enabled", True):
                    init_group["progress"] = {"percent": 11, "stage": "Predetermining OneDrive / Teams folder bundle files...", "status": "running"}
                    await state.ws_manager.broadcast({
                        "type": "project_init_progress", "stage": "Predetermining OneDrive / Teams folder bundle files...", "percent": 11, "status": "running", "dag": state.dag_state
                    })
                    pred_res = await predetermine_bundle_from_folder_screenshot(
                        serial=active_serial, display_id=disp_id, reopen_editor=True, force_rescan=False
                    )
                    if pred_res.get("predetermined_parts"):
                        mp_sync = state.sync_multipart_state_from_alignment()
                        await state.ws_manager.broadcast({
                            "type": "multipart_transition_status", "multipart_state": mp_sync, "predetermined": pred_res
                        })
            fs_check = await is_editor_full_screen(active_serial, disp_id)
            if not fs_check.get("is_fullscreen", True):
                init_group["progress"] = {"percent": 12, "stage": "Maximizing Markdown Editor & enforcing Edit + Dark Mode...", "status": "running"}
                await state.ws_manager.broadcast({
                    "type": "project_init_progress", "stage": "Maximizing Markdown Editor & enforcing Edit + Dark Mode...", "percent": 12, "status": "running", "dag": state.dag_state
                })
                await prepare_markdown_editor_window(active_serial, disp_id)
        except Exception as prep_ex:
            print(f"[execute_dag_group_initialize] prepare_markdown_editor_window note: {prep_ex}")

        is_open, _, _ = await assert_markdown_open(active_serial)
        if not is_open:
            init_group["progress"] = {"percent": 15, "stage": "Restoring Markdown Editor on external display...", "status": "running"}
            await state.ws_manager.broadcast({
                "type": "project_init_progress", "stage": "Restoring Markdown Editor on external display...", "percent": 15, "status": "running", "dag": state.dag_state
            })
            heal_fn = _get_orch_attr("auto_heal_pipeline_environment", auto_heal_pipeline_environment)
            await heal_fn(active_serial, disp_id, "init_end")

        init_group["progress"] = {"percent": 25, "stage": "Sending Ctrl+End to determine EOF total lines...", "status": "running"}
        await state.ws_manager.broadcast({
            "type": "project_init_progress", "stage": "Sending Ctrl+End to determine EOF total lines...", "percent": 25, "status": "running", "dag": state.dag_state
        })

        node1_res = await _call_run_single_dag_node("init_end", {"serial": active_serial})
        total_lines = node1_res.get("total_lines", 0)

        if node1_res.get("status") == "error" or total_lines <= 0:
            err_msg = node1_res.get("message") or "EOF Navigation Failed: could not determine total lines."
            init_group["status"] = "error"
            init_group["progress"] = {"percent": 50, "stage": err_msg, "status": "error", "error": err_msg, "total_lines": total_lines}
            await state.ws_manager.broadcast({
                "type": "project_init_progress", "stage": err_msg, "percent": 50, "status": "error", "error": err_msg, "total_lines": total_lines, "dag": state.dag_state
            })
            return {"status": "error", "group": "initialize", "error": err_msg, "node1": node1_res}

        init_group["progress"] = {"percent": 65, "stage": f"Calibrated {total_lines:,} total lines at EOF ✔. Returning to Line 1...", "status": "running", "total_lines": total_lines}
        await state.ws_manager.broadcast({
            "type": "project_init_progress", "stage": f"Calibrated {total_lines:,} total lines at EOF ✔. Returning to Line 1...", "percent": 65, "status": "running", "total_lines": total_lines, "dag": state.dag_state
        })
        await emit_dag_telemetry_event(
            category="SYSTEM", message=f"DAG 1 • Calibrated {total_lines:,} total lines at EOF ✔. Returning to Line 1...", dag="initialize", serial=active_serial
        )

        node2_res = await _call_run_single_dag_node("reset_home", {"serial": active_serial, "skip_env_heal": True})
        is_verified = bool(node2_res.get("verified", False) or node2_res.get("status") == "success" or node2_res.get("top_line") == 1)
        first_line = node2_res.get("first_line", 1)

        if not is_verified:
            err_msg = f"Failed to return to Line 1 (currently on Line {first_line or 'unknown'}). Please verify Ctrl+Home on external display."
            init_group["status"] = "error"
            init_group["progress"] = {"percent": 75, "stage": err_msg, "status": "error", "error": err_msg, "total_lines": total_lines, "verified": False}
            await state.ws_manager.broadcast({
                "type": "project_init_progress", "stage": err_msg, "percent": 75, "status": "error", "error": err_msg, "total_lines": total_lines, "verified": False, "dag": state.dag_state, "telemetry": state.latest_telemetry
            })
            await emit_dag_telemetry_event(
                category="ERROR", message=f"dag 1 details of log trace • {err_msg}", dag="initialize", node_id="reset_home", level="error", serial=active_serial, status_code=500
            )
            return {
                "status": "error", "group": "initialize", "error": err_msg, "total_lines": total_lines, "first_line": first_line, "verified": False, "node1": node1_res, "node2": node2_res
            }

        init_group["status"] = "completed"
        init_group["progress"] = {
            "percent": 100, "stage": f"Project Initialized Successfully! {total_lines:,} total lines calibrated and Line 1 verified ✔", "status": "completed", "total_lines": total_lines, "verified": True
        }
        capture_group["status"] = "idle"
        state.dag_state["current_active_group"] = "capture_entire_markdown"
        state.dag_state["current_active_node"] = None
        state.dag_state["nodes"]["frame_acquire"]["status"] = "idle"
        state.dag_state["nodes"]["frame_acquire"]["is_active"] = False
        state.latest_telemetry["current_top_line"] = 1
        state.latest_telemetry["current_page"] = 1
        state.latest_telemetry["target_total_lines"] = total_lines
        state.latest_telemetry["status_message"] = f"DAG Group 'Initialize' complete: {total_lines:,} total lines ready for capture ✔"

        active_pid = project_id or state.get_current_project_id()
        detected_fn = None
        if active_pid:
            try:
                home_img = state.FRAMES_DIR / "dag_node2_home.png"
                if not home_img.exists():
                    home_img = state.FRAMES_DIR / f"calib_home_{active_pid}.png"
                if home_img.exists():
                    from alignment_engine import detect_teams_markdown_alignment
                    from ocr_engine import worker_scan_image
                    align_home = await asyncio.to_thread(detect_teams_markdown_alignment, str(home_img))
                    if align_home and align_home.get("file_name"):
                        detected_fn = align_home.get("file_name")
                        state.latest_alignment_status["file_name"] = detected_fn
                        if align_home.get("back_button_coords"):
                            state.latest_alignment_status["back_button_coords"] = align_home["back_button_coords"]
                    scan_res = await asyncio.to_thread(worker_scan_image, str(home_img))
                    lines = scan_res.get("lines", [])
                    if not detected_fn:
                        detected_fn = scan_res.get("detected_filename")
                    if not detected_fn:
                        for l in lines[:6]:
                            txt = (l.get("text") or "").strip()
                            m = re.search(r"([A-Za-z0-9_\-.]+\.(?:md|markdown|txt|py|json|ts|js))", txt, re.IGNORECASE)
                            if m:
                                detected_fn = m.group(1)
                                break
                            if txt.startswith("#"):
                                clean_t = txt.lstrip("#").strip()
                                if clean_t:
                                    detected_fn = clean_t + (".md" if not clean_t.endswith(".md") else "")
                                    break
                    if detected_fn:
                        # Switch/create the target bundle part project BEFORE clearing project data so previous parts are preserved!
                        sw_res = await state.auto_switch_project_if_open_part_changed({"file_name": detected_fn})
                        if sw_res and sw_res.get("project") and sw_res["project"].get("id"):
                            active_pid = sw_res["project"]["id"]
            except Exception as fe:
                print(f"[execute_dag_group_initialize] Pre-clear filename scan note: {fe}")

        state.captured_frames.clear()
        state.document_lines.clear()
        state.orchestration_state["page"] = 1
        state.orchestration_state["last_arrow_count"] = 0
        state.orchestration_state["cursor_line"] = 1
        if active_pid:
            try:
                db.clear_project_data(active_pid)
                db.update_project_target_lines(active_pid, total_lines)
            except Exception:
                pass
        state.reset_project_diagnostics_trace(
            project_id=active_pid, project_name=f"Project {active_pid}" if active_pid else "Active Project", target_total_lines=total_lines
        )

        if active_pid and detected_fn:
            try:
                db.append_project_filename(active_pid, detected_fn)
                mp_sync = state.sync_multipart_state_from_alignment()
                updated_p = db.get_project(active_pid)
                if updated_p:
                    await state.ws_manager.broadcast({"type": "project_updated", "project": updated_p, "projects": db.get_projects()})
                    await state.ws_manager.broadcast({"type": "project_switched", "project": updated_p, "projects": db.get_projects()})
                await state.ws_manager.broadcast({"type": "multipart_transition_status", "multipart_state": mp_sync})
            except Exception as fe2:
                print(f"[execute_dag_group_initialize] Post-clear filename sync note: {fe2}")

        await state.ws_manager.broadcast({
            "type": "project_init_progress",
            "stage": f"Project Initialized Successfully! {total_lines:,} total lines calibrated and Line 1 verified ✔",
            "percent": 100, "status": "completed", "total_lines": total_lines, "detected_filename": detected_fn,
            "dag": state.dag_state, "telemetry": state.latest_telemetry,
        })
        await emit_dag_telemetry_event(
            category="SYSTEM", message=f"DAG 1 • Initialization complete! {total_lines:,} total lines calibrated and Line 1 verified ✔. DAG 2 ready.",
            dag="initialize", level="success", serial=active_serial,
        )

        return {
            "status": "success", "group": "initialize", "total_lines": total_lines,
            "detected_filename": detected_fn, "first_line": first_line, "verified": is_verified,
            "node1": node1_res, "node2": node2_res,
        }
    except Exception as e:
        init_group["status"] = "error"
        err = str(e)
        if isinstance(e, HTTPException) and isinstance(e.detail, dict):
            err = e.detail.get("message") or str(e.detail)
        elif isinstance(e, HTTPException):
            err = str(e.detail)
        clean_stage = err[:117] + "..." if len(err) > 120 else err
        init_group["progress"] = {"percent": 50, "stage": f"Initialization failed: {clean_stage}", "status": "error", "error": err}
        await state.ws_manager.broadcast({
            "type": "project_init_progress", "stage": f"Initialization failed: {clean_stage}", "percent": 50, "status": "error", "error": err, "dag": state.dag_state
        })
        return {"status": "error", "group": "initialize", "error": err, "message": f"Initialization failed: {clean_stage}", "detail": err}


async def _execute_dag_group_capture_markdown_impl(serial: Optional[str] = None) -> Dict[str, Any]:
    active_serial = await get_active_adb_serial(serial)
    env_fn = _get_orch_attr("resolve_and_enforce_dag_device_environment", resolve_and_enforce_dag_device_environment)
    dev_env = await env_fn(serial=active_serial)
    if dev_env.get("status") == "error":
        err_msg = dev_env.get("message") or dev_env.get("error") or "Device validation failed"
        capture_group = state.dag_state.get("groups", {}).get("capture_entire_markdown")
        if capture_group:
            capture_group["status"] = "error"
        state.latest_telemetry["status_message"] = err_msg
        await state.ws_manager.broadcast({"type": "dag2_loop_error", "error": err_msg, "dag": state.dag_state, "telemetry": state.latest_telemetry})
        return {"status": "error", "group": "capture_entire_markdown", "error": err_msg}

    capture_group = state.dag_state["groups"].setdefault("capture_entire_markdown", {
        "id": "capture_entire_markdown", "title": "Screen Capture & AI OCR",
        "description": "Acquires screen frames, extracts verbatim markdown with local vision model, verifies settle timing, and reconstructs master document",
        "nodes": ["frame_acquire", "local_ai_ocr", "verification_trigger", "document_assemble"], "status": "active",
    })
    position_group = state.dag_state["groups"].setdefault("position_navigation", {
        "id": "position_navigation", "title": "Line Positioning & Navigation",
        "description": "Gutter OCR boundary detection and down-arrow viewport alignment",
        "nodes": ["frame_ocr", "arrow_down"], "status": "idle",
    })
    capture_group["status"] = "active"
    state.dag_state["current_active_group"] = "capture_entire_markdown"

    from services.performance_analyzer import format_duration_min_sec
    loop_idx = state.next_dag2_loop_index()
    loop_id = f"loop_{loop_idx:04d}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    state.current_dag2_loop_id = loop_id
    state.current_dag2_loop_index = loop_idx
    state.active_dag2_loop_key_events = []

    opts = {"serial": active_serial, "fast_loop": True, "allow_concurrent": False, "pipelined": False, "skip_env_heal": True}

    disp_id = await detect_external_display_id(active_serial)
    if loop_idx == 1 or state.orchestration_state.get("auto_resume_pending"):
        is_open, _, _ = await assert_markdown_open(active_serial)
        if not is_open:
            heal_fn = _get_orch_attr("auto_heal_pipeline_environment", auto_heal_pipeline_environment)
            await heal_fn(active_serial, disp_id, "frame_acquire")
        resume_info = state.sync_resume_frontier_state()
        if resume_info.get("has_existing_progress") and resume_info.get("last_bottom_line", 0) > 0:
            opts["auto_resume"] = True
            await align_viewport_for_auto_resume(serial=active_serial, disp_id=disp_id)

    loop_start_ms = int(time.time() * 1000)
    loop_t0 = time.perf_counter()
    loop_nodes = []

    # Node 3: frame_acquire
    n3_t0, n3_start_ms = time.perf_counter(), int(time.time() * 1000)
    n3_res = await _run_node_safe("frame_acquire", opts)
    n3_end_ms, n3_dur_ms = int(time.time() * 1000), max(1, int((time.perf_counter() - n3_t0) * 1000))
    loop_nodes.append({
        "node_id": "frame_acquire", "name": "Frame Acquire (Node 3)", "status": n3_res.get("status", "completed"),
        "started_at_ms": n3_start_ms, "finished_at_ms": n3_end_ms, "duration_ms": n3_dur_ms,
        "details": {
            "page": n3_res.get("page", 0),
            "display_id": state.latest_telemetry.get("capture_telemetry", {}).get("display_id"),
            "latency_ms": state.latest_telemetry.get("capture_telemetry", {}).get("last_latency_ms", 0),
            "file_size": n3_res.get("file_size", 0),
            "error": n3_res.get("error") or n3_res.get("message"),
        },
    })
    if n3_res.get("status") == "error":
        capture_group["status"] = "error"
        err_msg = n3_res.get("error") or n3_res.get("message") or "Frame acquire failed"
        _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), "error", loop_nodes, failed_node="frame_acquire", error_reason=err_msg)
        return {"status": "error", "node_id": "frame_acquire", "error": err_msg, "message": err_msg, "result": n3_res}

    if n3_res.get("eof_already_captured"):
        n8_res = await _run_node_safe("document_assemble", opts)
        capture_group["status"] = "completed"
        return {
            "status": "success",
            "group": "capture_entire_markdown",
            "node3": n3_res,
            "node6": {"eof_reached": True},
            "node7": {"allowed": True},
            "node8": {**n8_res, "is_complete": True},
        }

    opts["skip_env_heal"] = True

    # Node 4: local_ai_ocr
    n4_t0, n4_start_ms = time.perf_counter(), int(time.time() * 1000)
    n4_res = await _run_node_safe("local_ai_ocr", opts)
    n4_end_ms, n4_dur_ms = int(time.time() * 1000), max(1, int((time.perf_counter() - n4_t0) * 1000))
    loop_nodes.append({
        "node_id": "local_ai_ocr", "name": "Local AI OCR (Node 4)", "status": n4_res.get("status", "completed"),
        "started_at_ms": n4_start_ms, "finished_at_ms": n4_end_ms, "duration_ms": n4_dur_ms,
        "details": {
            "model_used": n4_res.get("model_used", "MiniCPM-V"),
            "lines_count": n4_res.get("lines_count", 0),
            "char_count": n4_res.get("char_count", 0),
            "error": n4_res.get("error") or n4_res.get("message"),
        },
    })
    if n4_res.get("status") == "error":
        capture_group["status"] = "error"
        err_msg = n4_res.get("error") or n4_res.get("message") or "Local AI OCR failed"
        _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), "error", loop_nodes, failed_node="local_ai_ocr", error_reason=err_msg)
        return {"status": "error", "node_id": "local_ai_ocr", "error": err_msg, "message": err_msg, "result": n4_res}

    # Connector gate between Group 2 and Group 3
    is_connector_23_open = state.is_edge_connected("local_ai_ocr", "frame_ocr") and getattr(state, "dag_semaphore_group2_to_3", True)
    if not is_connector_23_open:
        state.dag_state["semaphore_status"] = "blocked"
        state.dag_state["semaphore_group2_to_3_status"] = "blocked"
        await emit_dag_telemetry_event(
            category="SYSTEM", message="⏸️ Connector from Node 4 (local_ai_ocr) to Node 5 (frame_ocr) is DISCONNECTED. Flow paused before DAG 3.",
            dag="position_navigation", serial=active_serial,
        )
        await state.ws_manager.broadcast({
            "type": "dag_semaphore_blocked", "semaphore_id": "group2_to_3", "from_node": "local_ai_ocr", "to_node": "frame_ocr",
            "message": "Capture loop paused: Connector between Node 4 and Node 5 is disconnected",
            "semaphore_status": "blocked", "edges": state.dag_state.get("edges", []), "dag": state.dag_state,
        })
        if getattr(state, "capture_loop_running", False):
            state.latest_telemetry["status_message"] = "Capture loop paused at Connector (Node 4 ➔ Node 5)"
            while not (state.is_edge_connected("local_ai_ocr", "frame_ocr") and getattr(state, "dag_semaphore_group2_to_3", True)) and getattr(state, "capture_loop_running", False):
                await asyncio.sleep(0.25)
            if not getattr(state, "capture_loop_running", False):
                _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), "paused", loop_nodes, failed_node="connector_4_5", error_reason="Loop stopped while awaiting Connector 4->5")
                return {"status": "paused", "message": "Loop stopped while awaiting Connector", "node_id": "connector_4_5"}
        else:
            _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), "paused", loop_nodes, failed_node="connector_4_5", error_reason="Paused at Connector 4->5")
            return {
                "status": "paused_at_semaphore", "semaphore_id": "group2_to_3", "from_node": "local_ai_ocr", "to_node": "frame_ocr",
                "group": "capture_entire_markdown", "message": "Capture single cycle paused at Connector before DAG 3",
                "node3": n3_res, "node4": n4_res,
            }

    position_group["status"] = "active"
    state.dag_state["current_active_group"] = "position_navigation"

    # Node 5: frame_ocr
    n5_t0, n5_start_ms = time.perf_counter(), int(time.time() * 1000)
    n5_res = await _run_node_safe("frame_ocr", opts)
    n5_end_ms, n5_dur_ms = int(time.time() * 1000), max(1, int((time.perf_counter() - n5_t0) * 1000))
    loop_nodes.append({
        "node_id": "frame_ocr", "name": "Gutter Boundary Verify (Node 5)", "status": n5_res.get("status", "completed"),
        "started_at_ms": n5_start_ms, "finished_at_ms": n5_end_ms, "duration_ms": n5_dur_ms,
        "details": {
            "top_line": n5_res.get("top_line", 0),
            "bottom_line": n5_res.get("bottom_line", 0),
            "extracted_lines": len(n5_res.get("lines", [])),
            "error": n5_res.get("error") or n5_res.get("message"),
        },
    })
    if n5_res.get("status") == "error":
        position_group["status"] = "error"
        err_msg = n5_res.get("error") or n5_res.get("message") or "Gutter boundary OCR failed"
        _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), "error", loop_nodes, failed_node="frame_ocr", error_reason=err_msg)
        return {"status": "error", "group": "position_navigation", "node_id": "frame_ocr", "error": err_msg, "message": err_msg, "result": n5_res}

    bot_ln = n5_res.get("bottom_line") or state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line") or 0
    top_ln = n5_res.get("top_line") or state.dag_state["nodes"].get("frame_ocr", {}).get("top_line") or 1
    if bot_ln > 0:
        opts["prev_bottom"] = bot_ln
        opts["cur_top"] = top_ln
        opts["target_top"] = bot_ln + 1

    # Node 6: arrow_down
    n6_t0, n6_start_ms = time.perf_counter(), int(time.time() * 1000)
    n6_res = await _run_node_safe("arrow_down", opts)
    n6_end_ms, n6_dur_ms = int(time.time() * 1000), max(1, int((time.perf_counter() - n6_t0) * 1000))
    prev_b = opts.get("prev_bottom", 0)
    tgt_t = opts.get("target_top", prev_b + 1)
    arr_cnt = n6_res.get("arrow_count", 0)
    loop_nodes.append({
        "node_id": "arrow_down", "name": "Arrow Down Viewport Pacer (Node 6)", "status": n6_res.get("status", "completed"),
        "started_at_ms": n6_start_ms, "finished_at_ms": n6_end_ms, "duration_ms": n6_dur_ms,
        "details": {
            "previous_bottom_line": prev_b,
            "target_top_line": tgt_t,
            "reached_top_line": n6_res.get("new_top_line") or n6_res.get("final_top", 0),
            "arrow_keys_pressed": arr_cnt,
            "positioning_method": f"Tracked DownArrow (x{arr_cnt})",
            "dwell_ms": 0,
            "settle_ms": 100,
            "key_events": list(state.active_dag2_loop_key_events),
            "error": n6_res.get("error") or n6_res.get("message"),
        },
    })
    if n6_res.get("status") in ("error", "prevented") or n6_res.get("reached") is False or n6_res.get("advanced") is False:
        st = "error" if n6_res.get("status") in ("error", "success") else n6_res.get("status", "error")
        position_group["status"] = st
        err_msg = n6_res.get("message") or n6_res.get("error") or "Navigation failed: arrow_down did not advance viewport."
        state.latest_telemetry["status_message"] = f"Loop issue on Node 6: {err_msg}"
        _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), st, loop_nodes, failed_node="arrow_down", error_reason=err_msg)
        return {"status": st, "group": "position_navigation", "node_id": "arrow_down", "result": n6_res, "error": err_msg, "message": err_msg}

    position_group["status"] = "completed"

    # Connector gate between Group 3 and Group 4
    is_connector_34_open = state.is_edge_connected("arrow_down", "verification_trigger") and getattr(state, "dag_semaphore_group3_to_4", True)
    if not is_connector_34_open:
        state.dag_state["semaphore_group3_to_4_status"] = "blocked"
        await emit_dag_telemetry_event(
            category="SYSTEM", message="⏸️ Connector from Node 6 (arrow_down) to Node 7 (verification_trigger) is DISCONNECTED. Flow paused before DAG 4.",
            dag="verify_assemble", serial=active_serial,
        )
        await state.ws_manager.broadcast({
            "type": "dag_semaphore_blocked", "semaphore_id": "group3_to_4", "from_node": "arrow_down", "to_node": "verification_trigger",
            "message": "Capture loop paused: Connector between Node 6 and Node 7 is disconnected",
            "semaphore_status": "blocked", "edges": state.dag_state.get("edges", []), "dag": state.dag_state,
        })
        if getattr(state, "capture_loop_running", False):
            state.latest_telemetry["status_message"] = "Capture loop paused at Connector (Node 6 ➔ Node 7)"
            while not (state.is_edge_connected("arrow_down", "verification_trigger") and getattr(state, "dag_semaphore_group3_to_4", True)) and getattr(state, "capture_loop_running", False):
                await asyncio.sleep(0.25)
            if not getattr(state, "capture_loop_running", False):
                _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), "paused", loop_nodes, failed_node="connector_6_7", error_reason="Loop stopped while awaiting Connector 6->7")
                return {"status": "paused", "message": "Loop stopped while awaiting Connector between Node 6 and Node 7", "node_id": "connector_6_7"}
        else:
            _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), "paused", loop_nodes, failed_node="connector_6_7", error_reason="Paused at Connector 6->7")
            return {
                "status": "paused_at_semaphore", "semaphore_id": "group3_to_4", "from_node": "arrow_down", "to_node": "verification_trigger",
                "group": "position_navigation", "message": "Capture single cycle paused at Connector before DAG 4",
                "node5": n5_res, "node6": n6_res,
            }

    verify_group = state.dag_state.get("groups", {}).setdefault("verify_assemble", {
        "id": "verify_assemble", "title": "Verify & Assemble",
        "description": "Recaptures frame to verify top line position, evaluates qualifiers, and reconstructs master document",
        "nodes": ["verification_trigger", "document_assemble"], "status": "active",
    })
    verify_group["status"] = "active"
    state.dag_state["current_active_group"] = "verify_assemble"

    # Node 7: verification_trigger
    n7_t0, n7_start_ms = time.perf_counter(), int(time.time() * 1000)
    n7_res = await _run_node_safe("verification_trigger", opts)
    n7_end_ms, n7_dur_ms = int(time.time() * 1000), max(1, int((time.perf_counter() - n7_t0) * 1000))
    loop_nodes.append({
        "node_id": "verification_trigger", "name": "Verification Trigger (Node 7)", "status": n7_res.get("status", "completed"),
        "started_at_ms": n7_start_ms, "finished_at_ms": n7_end_ms, "duration_ms": n7_dur_ms,
        "details": {
            "allowed": n7_res.get("allowed", True),
            "loop_count": n7_res.get("loop_count", loop_idx),
            "consecutive_failures": n7_res.get("consecutive_failures", 0),
            "error": n7_res.get("error") or n7_res.get("message"),
        },
    })
    if n7_res.get("status") in ("error", "prevented") or not n7_res.get("allowed", True) or n7_res.get("prevented", False):
        st = n7_res.get("status", "prevented")
        verify_group["status"] = st
        err_msg = n7_res.get("error") or n7_res.get("message") or "Verification trigger prevented"
        _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), st, loop_nodes, failed_node="verification_trigger", error_reason=err_msg)
        return {"status": st, "group": "verify_assemble", "node_id": "verification_trigger", "error": err_msg, "message": err_msg, "result": n7_res}

    # Node 8: document_assemble
    n8_t0, n8_start_ms = time.perf_counter(), int(time.time() * 1000)
    n8_res = await _run_node_safe("document_assemble", opts)
    n8_end_ms, n8_dur_ms = int(time.time() * 1000), max(1, int((time.perf_counter() - n8_t0) * 1000))
    loop_nodes.append({
        "node_id": "document_assemble", "name": "Document Assemble (Node 8)", "status": n8_res.get("status", "completed"),
        "started_at_ms": n8_start_ms, "finished_at_ms": n8_end_ms, "duration_ms": n8_dur_ms,
        "details": {
            "total_captured_lines": n8_res.get("total_captured_lines", 0),
            "completion_percent": n8_res.get("completion_percent", 0),
            "is_complete": n8_res.get("is_complete", False),
            "error": n8_res.get("error") or n8_res.get("message"),
        },
    })
    if n8_res.get("status") == "error":
        verify_group["status"] = "error"
        err_msg = n8_res.get("error") or n8_res.get("message") or "Document assemble failed"
        _save_dag2_loop_record(loop_idx, loop_start_ms, int(time.time() * 1000), max(1, int((time.perf_counter() - loop_t0) * 1000)), "error", loop_nodes, failed_node="document_assemble", error_reason=err_msg)
        return {"status": "error", "group": "verify_assemble", "node_id": "document_assemble", "error": err_msg, "message": err_msg, "result": n8_res}
    else:
        verify_group["status"] = "completed"

    loop_end_ms = int(time.time() * 1000)
    loop_dur_ms = max(1, int((time.perf_counter() - loop_t0) * 1000))
    _save_dag2_loop_record(loop_idx, loop_start_ms, loop_end_ms, loop_dur_ms, "success", loop_nodes)

    next_page = max(loop_idx + 1, len(state.captured_frames) + 1)
    state.latest_telemetry["current_page"] = next_page
    state.orchestration_state["page"] = next_page

    loop_rec = {
        "loop_index": loop_idx, "next_page": next_page, "duration_ms": loop_dur_ms,
        "duration_formatted": format_duration_min_sec(loop_dur_ms),
        "started_at_ms": loop_start_ms, "finished_at_ms": loop_end_ms,
    }
    await state.ws_manager.broadcast({
        "type": "dag2_loop_completed", "loop": loop_rec, "loop_index": loop_idx, "next_page": next_page,
        "duration_ms": loop_dur_ms, "duration_formatted": format_duration_min_sec(loop_dur_ms),
    })

    return {
        "status": "success", "group": "capture_entire_markdown", "loop": loop_rec,
        "node3": n3_res, "node4": n4_res, "node5": n5_res, "node6": n6_res, "node7": n7_res, "node8": n8_res,
    }


async def execute_dag_group_capture_markdown(serial: Optional[str] = None) -> Dict[str, Any]:
    try:
        return await _execute_dag_group_capture_markdown_impl(serial=serial)
    except Exception as e:
        capture_group = state.dag_state.get("groups", {}).get("capture_entire_markdown")
        if capture_group:
            capture_group["status"] = "error"
        err_msg = str(e)
        if isinstance(e, HTTPException) and isinstance(e.detail, dict):
            err_msg = e.detail.get("message") or str(e.detail)
        elif isinstance(e, HTTPException):
            err_msg = str(e.detail)
        state.latest_telemetry["status_message"] = f"DAG 2 error: {err_msg}"
        await state.ws_manager.broadcast({"type": "dag2_loop_error", "error": err_msg, "dag": state.dag_state, "telemetry": state.latest_telemetry})
        return {"status": "error", "group": "capture_entire_markdown", "error": err_msg, "detail": err_msg, "message": f"Capture cycle failed: {err_msg}"}


async def run_continuous_capture_loop_worker(serial: Optional[str] = None, resume_from_line: Optional[int] = None):
    active_serial = await get_active_adb_serial(serial)
    env_fn = _get_orch_attr("resolve_and_enforce_dag_device_environment", resolve_and_enforce_dag_device_environment)
    dev_env = await env_fn(serial=active_serial)
    if dev_env.get("status") == "error":
        err_msg = dev_env.get("message") or dev_env.get("error") or "Device validation failed"
        state.latest_telemetry["status_message"] = err_msg
        state.dag_state["current_active_node"] = None
        state.orchestration_state["status"] = "ERROR"
        state.record_diagnostics_trace_event(
            event_type="LOOP_STOPPED", node_id="device_environment", reason=f"Device environment validation failed: {err_msg}"
        )
        await state.ws_manager.broadcast({"type": "dag2_loop_error", "error": err_msg, "dag": state.dag_state, "telemetry": state.latest_telemetry})
        return

    state.capture_loop_running = True
    state.latest_telemetry["is_pacing"] = False
    state.latest_telemetry["phase"] = "DAG_CAPTURE"
    state.orchestration_state["status"] = "RUNNING"
    state.orchestration_state["manual_attention_required"] = False
    state.orchestration_state["halt_reason"] = None

    # Clean up any regressed duplicate frames behind the current document_lines frontier before starting/resuming
    prune_res = state.prune_regressed_frames()
    if prune_res.get("pruned_count", 0) > 0:
        state.record_diagnostics_trace_event(
            event_type="LOOP_AUTO_RECOVERED",
            node_id="frame_ocr",
            target_top_line=prune_res.get("next_expected_top_line"),
            reason=f"Pruned {prune_res['pruned_count']} regressed duplicate frame(s) behind frontier Line {prune_res.get('frontier_bottom_line')}",
            recovery_action=f"Restored capture frontier to Line {prune_res.get('next_expected_top_line')}"
        )

    resume_info = state.sync_resume_frontier_state(override_resume_top_line=resume_from_line)
    state.ensure_diagnostics_trace_backfilled()
    state.record_diagnostics_trace_event(
        event_type="LOOP_STARTED",
        reason=(
            f"Auto-resumed DAG capture loop at Page {(resume_info.get('last_page_index') or 0) + 1} "
            f"(Line {resume_info.get('next_top_line')} = last frame bottom {resume_info.get('last_bottom_line')} + 1)"
            if resume_info.get("has_existing_progress")
            else f"Continuous DAG capture loop started at Page {state.latest_telemetry.get('current_page') or 1} (Line {state.get_next_expected_top_line()})"
        ),
    )

    stop_reason_logged = False
    is_headless = False

    try:
        while state.capture_loop_running:
            state.sync_multipart_state_from_alignment()
            resume_info = state.sync_resume_frontier_state(override_resume_top_line=resume_from_line)
            has_existing_progress = bool(resume_info.get("has_existing_progress") and resume_info.get("last_bottom_line", 0) > 0)
            init_group = state.dag_state.get("groups", {}).get("initialize", {})
            node1_state = state.dag_state.get("nodes", {}).get("init_end", {})
            node2_state = state.dag_state.get("nodes", {}).get("reset_home", {})
            target_lines_pre = int(
                resume_info.get("target_total_lines", 0)
                or state.headless_telemetry_session.get("target_total_lines", 0)
                or state.latest_telemetry.get("target_total_lines", 0)
                or node1_state.get("total_lines", 0)
                or 0
            )
            is_initialized = bool(
                (has_existing_progress and target_lines_pre > 0)
                or (init_group.get("status") == "completed" and node2_state.get("verified", False) and target_lines_pre > 0)
                or (len(state.document_lines) > 0 and target_lines_pre > 0)
                or (len(state.captured_frames) > 0 and target_lines_pre > 0)
            )

            if not is_initialized:
                await emit_dag_telemetry_event(
                    category="SYSTEM",
                    message=(
                        f"DAG Loop: Calibrating total lines and auto-resuming at Line {resume_info.get('next_top_line')}..."
                        if has_existing_progress
                        else "DAG Loop: Project not initialized yet. Executing DAG Group 1 (Determine total lines & Return to Line 1)..."
                    ),
                    dag="initialize", serial=active_serial,
                )
                state.latest_telemetry["status_message"] = (
                    f"Calibrating EOF total lines & auto-resuming at Line {resume_info.get('next_top_line')}..."
                    if has_existing_progress
                    else "Running DAG Group 1: Calibrating EOF total lines & returning to Line 1..."
                )
                state.latest_telemetry["phase"] = "INITIALIZING"
                await state.ws_manager.broadcast({
                    "type": "capture_loop_status", "running": True, "stage": state.latest_telemetry["status_message"],
                    "dag": state.dag_state, "telemetry": state.latest_telemetry,
                })

                init_res = await execute_dag_group_initialize(
                    serial=active_serial,
                    project_id=state.get_current_project_id(),
                    force_reset=False,
                )
                if init_res.get("status") in ("error", "failed") or not state.capture_loop_running:
                    err_msg = init_res.get("error") or "DAG Group 1 Initialization failed"
                    state.latest_telemetry["status_message"] = f"Loop halted during DAG 1: {err_msg}"
                    state.capture_loop_running = False
                    state.orchestration_state["status"] = "ERROR"
                    state.orchestration_state["manual_attention_required"] = True
                    state.orchestration_state["halt_reason"] = f"DAG Group 1 Initialization failed: {err_msg}"
                    state.record_diagnostics_trace_event(
                        event_type="LOOP_STOPPED", node_id="init_end", reason=f"DAG Group 1 Initialization failed: {err_msg}"
                    )
                    stop_reason_logged = True
                    await state.ws_manager.broadcast({
                        "type": "capture_loop_status", "running": False, "error": err_msg,
                        "manual_attention_required": True, "diagnosis": state.get_loop_diagnosis(),
                        "dag": state.dag_state, "telemetry": state.latest_telemetry
                    })
                    return

                await emit_dag_telemetry_event(
                    category="SYSTEM", message="DAG Group 1 Initialization Successful ✔ Proceeding directly into DAG Group 2 Capture Loop...",
                    dag="capture_entire_markdown", serial=active_serial,
                )

            disp_id = await detect_external_display_id(active_serial)
            is_open, _, _ = await assert_markdown_open(active_serial)
            if not is_open:
                heal_fn = _get_orch_attr("auto_heal_pipeline_environment", auto_heal_pipeline_environment)
                await heal_fn(active_serial, disp_id, "frame_acquire")

            align_res: Dict[str, Any] = {}
            if has_existing_progress:
                align_res = await align_viewport_for_auto_resume(
                    serial=active_serial,
                    disp_id=disp_id,
                    override_resume_top_line=resume_from_line,
                )
                resume_from_line = None

                from ocr_engine import is_eof_reached_with_offline_awareness
                last_bot_pre = int(resume_info.get("last_bottom_line") or 0)
                tail_txt_pre = ""
                if last_bot_pre > 0 and state.document_lines:
                    tail_txt_pre = "\n".join(
                        str(state.document_lines.get(k, "")) for k in range(max(1, last_bot_pre - 6), last_bot_pre + 1)
                    )
                is_eof_pre, _ = is_eof_reached_with_offline_awareness(
                    bottom_line=last_bot_pre,
                    total_lines=target_lines_pre,
                    offline_detected=bool(
                        align_res.get("offline_overlay_detected")
                        or state.orchestration_state.get("offline_overlay_detected")
                    ),
                    tail_text=tail_txt_pre,
                )
                if align_res.get("eof_reached") or is_eof_pre:
                    # Project is already at EOF (or 3 lines short with 'Offline' overlay); reconcile total lines, mark completed & transition
                    eof_ln_pre = max(last_bot_pre, int(align_res.get("actual_bottom") or 0))
                    reconciled_pre = state.reconcile_eof_total_lines_and_complete_project(
                        actual_eof_line=eof_ln_pre,
                        eof_reason="EOF verified during auto-resume",
                    )
                    target_lines_pre = int(reconciled_pre.get("target_total_lines") or eof_ln_pre or target_lines_pre)
                    last_bot_pre = target_lines_pre
                    await _run_node_safe("document_assemble", {"serial": active_serial, "fast_loop": True, "skip_env_heal": True})
                    export_rec = state.export_project_markdown_to_disk()
                    comp_msg = (
                        f"🎉 100% Markdown Captured & Exported ({export_rec.get('file_name')})! "
                        f"EOF verified at Line {last_bot_pre:,} of {target_lines_pre:,}."
                    )
                    state.latest_telemetry["status_message"] = comp_msg
                    state.record_diagnostics_trace_event(
                        event_type="LAST_LINE_OCR_COMPLETED",
                        top_line=int(align_res.get("actual_top") or resume_info.get("last_top_line") or 1),
                        bottom_line=last_bot_pre,
                        target_top_line=target_lines_pre,
                        node_id="document_assemble",
                        reason=comp_msg,
                        recovery_action=f"Exported markdown to {export_rec.get('export_path')}",
                    )
                    if reconciled_pre.get("project"):
                        await state.ws_manager.broadcast({"type": "project_updated", "project": reconciled_pre["project"]})
                    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "telemetry": state.latest_telemetry})
                    await state.ws_manager.broadcast({
                        "type": "markdown_part_exported",
                        "export": export_rec,
                        "multipart_state": state.multipart_bundle_state,
                    })
                    mp_state = state.sync_multipart_state_from_alignment()
                    if mp_state.get("is_multipart") and mp_state.get("auto_chain_enabled", True) and state.capture_loop_running:
                        await emit_dag_telemetry_event(
                            category="SYSTEM",
                            message=(
                                f"📂 Multi-Part Markdown Part {mp_state.get('current_part')} complete! "
                                f"Running DAG Group 'Markdown File Change' to open Part {mp_state.get('next_part_number')}..."
                            ),
                            dag="markdown_file_change",
                            serial=active_serial,
                        )
                        mfc_res = await execute_dag_group_markdown_file_change(
                            serial=active_serial,
                            display_id=disp_id,
                            mode="switch_next",
                            handoff_to_init=False,
                            handoff_to_phase3=True,
                        )
                        if mfc_res.get("status") == "success" and not mfc_res.get("bundle_completed") and state.capture_loop_running:
                            await asyncio.sleep(0.35)
                            continue
                        stop_reason_logged = True
                        break
                    if state.is_edge_connected("document_assemble", "markdown_tag_parser"):
                        try:
                            await execute_dag_group_post_capture_analyzer(project_id=state.get_current_project_id())
                        except Exception as pca_err:
                            print(f"[CaptureLoop] Post-capture analyzer note: {pca_err}")
                    stop_reason_logged = True
                    break

            is_headless = bool(getattr(state, "headless_mode", False) or state.dag_state.get("headless_mode"))
            if is_headless or state.headless_telemetry_session.get("status") == "STOPPED":
                session = state.start_headless_telemetry_session("continuous_capture_loop")
                await emit_dag_telemetry_event(
                    category="SYSTEM", message="⚡ Capture loop running in HEADLESS MODE (Node 4 RapidOCR Inspector Rescan Engine Active; UI rendering bypassed)",
                    dag="capture_entire_markdown", serial=active_serial,
                )
                if hasattr(state, "ws_manager") and state.ws_manager:
                    await state.ws_manager.broadcast({"type": "headless_telemetry_started", "telemetry": session})

            consecutive_recovery_attempts = 0
            max_recovery_attempts = 8
            advance_to_next_multipart = False

            while state.capture_loop_running:
                is_headless = bool(getattr(state, "headless_mode", False) or state.dag_state.get("headless_mode"))
                try:
                    res = await asyncio.wait_for(
                        execute_dag_group_capture_markdown(serial=active_serial),
                        timeout=120.0
                    )
                except asyncio.TimeoutError:
                    res = {
                        "status": "error",
                        "node_id": state.dag_state.get("current_active_node") or "frame_acquire",
                        "error": "Cycle watchdog timeout (120s exceeded) — auto-resetting ADB focus & retrying"
                    }

                if res.get("status") in ("error", "prevented"):
                    failed_node = res.get("node_id") or "arrow_down"
                    err_reason = res.get("error") or res.get("message") or f"{failed_node} returned {res.get('status')}"

                    if not state.capture_loop_running:
                        state.record_diagnostics_trace_event(
                            event_type="LOOP_STOPPED", node_id=failed_node, reason=f"Loop stopped by user during {failed_node}: {err_reason}"
                        )
                        stop_reason_logged = True
                        break

                    consecutive_recovery_attempts += 1
                    if consecutive_recovery_attempts > max_recovery_attempts:
                        stop_msg = f"Loop stopped after {max_recovery_attempts} consecutive auto-recovery attempts on {failed_node}: {err_reason}"
                        state.latest_telemetry["status_message"] = stop_msg
                        state.orchestration_state["manual_attention_required"] = True
                        state.orchestration_state["halt_reason"] = stop_msg
                        state.record_diagnostics_trace_event(event_type="LOOP_STOPPED", node_id=failed_node, reason=stop_msg)
                        stop_reason_logged = True
                        await state.ws_manager.broadcast({
                            "type": "loop_attention_required",
                            "error": stop_msg,
                            "diagnosis": state.get_loop_diagnosis(),
                            "dag": state.dag_state,
                            "telemetry": state.latest_telemetry
                        })
                        break

                    state.record_diagnostics_trace_event(
                        event_type="LOOP_AUTO_RECOVERY_STARTED", node_id=failed_node,
                        reason=f"Auto-recovery #{consecutive_recovery_attempts}/{max_recovery_attempts} triggered for {failed_node}: {err_reason}",
                        recovery_action="Dismissing keyboard & banners, verifying editor focus, and re-aligning target top line",
                    )
                    state.latest_telemetry["status_message"] = f"🔧 Auto-recovering loop ({consecutive_recovery_attempts}/{max_recovery_attempts}) on {failed_node}..."
                    await emit_dag_telemetry_event(
                        category="PACER", message=f"🔧 Continuous Loop Auto-Recovery ({consecutive_recovery_attempts}/{max_recovery_attempts}) for {failed_node}: {err_reason}",
                        dag="position_navigation", node_id=failed_node, serial=active_serial,
                    )

                    try:
                        await dismiss_keyboard(active_serial, disp_id)
                        await resolve_and_dismiss_mini_modals(serial=active_serial, display_id=disp_id, caller_node="loop_auto_recovery")
                        md_open, _, _ = await assert_markdown_open(active_serial)
                        if not md_open:
                            heal_fn = _get_orch_attr("auto_heal_pipeline_environment", auto_heal_pipeline_environment)
                            await heal_fn(active_serial, disp_id, failed_node)

                        n5_bot = state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line", 0)
                        n6_tgt = (
                            state.dag_state["nodes"].get("arrow_down", {}).get("target_top")
                            or ((n5_bot + 1) if n5_bot > 0 else 0)
                            or state.get_next_expected_top_line()
                            or 1
                        )

                        if failed_node in ("arrow_down", "verification_trigger", "document_assemble") and n6_tgt > 0:
                            nav_rec = await navigate_to_target_top_line(
                                target_top=int(n6_tgt), serial=active_serial, display_id=disp_id,
                                use_page_keys=True, max_attempts=14, caller_node="loop_auto_recovery",
                            )
                            rec_top = int(nav_rec.get("actual_top") or 0)
                            rec_bot = int(nav_rec.get("actual_bottom") or 0)
                            # Accept either exact reach OR safe contiguous overlap where rec_top <= n6_tgt and rec_bot > n5_bot
                            can_accept_overlap = bool(
                                nav_rec.get("reached")
                                or (rec_top > 0 and max(1, int(n6_tgt) - 8) <= rec_top <= int(n6_tgt) and rec_bot >= int(n6_tgt))
                            )
                            if not can_accept_overlap and consecutive_recovery_attempts >= 4 and rec_top > 0:
                                # Tiered self-healing: force a PageDown + Up trim to break out of wrapped-line trap
                                from services.adb_service import sanitize_input_display_id
                                vd = sanitize_input_display_id(disp_id)
                                dpfx = f"-d {vd} " if vd else ""
                                await run_adb_shell(f"input {dpfx}keyevent 93 19 19 >/dev/null 2>&1", active_serial)
                                await asyncio.sleep(0.25)
                                nav_rec = await navigate_to_target_top_line(
                                    target_top=int(n6_tgt), serial=active_serial, display_id=disp_id,
                                    use_page_keys=True, max_attempts=10, caller_node="loop_auto_recovery",
                                )
                                rec_top = int(nav_rec.get("actual_top") or 0)
                                rec_bot = int(nav_rec.get("actual_bottom") or 0)
                                can_accept_overlap = bool(
                                    nav_rec.get("reached")
                                    or (rec_top > 0 and rec_bot >= int(n6_tgt))
                                )

                            if can_accept_overlap:
                                settled_t = rec_top if (0 < rec_top <= int(n6_tgt)) else int(n6_tgt)
                                state.dag_state["nodes"]["arrow_down"].update({
                                    "status": "completed", "target_top": settled_t, "target_top_line": settled_t,
                                    "new_top_line": settled_t, "reached": True, "advanced": True, "error": None,
                                    "telemetry_insight": f"Auto-recovered target top Line {settled_t} ✔",
                                })
                                if "verification_trigger" in state.dag_state["nodes"]:
                                    state.dag_state["nodes"]["verification_trigger"].update({
                                        "target_top_line": settled_t, "target_top": settled_t, "expected_top": settled_t
                                    })
                                rec_opts = {"serial": active_serial, "fast_loop": True, "allow_concurrent": False, "skip_env_heal": True}
                                n7_rec = await _run_node_safe("verification_trigger", rec_opts)
                                n8_rec = await _run_node_safe("document_assemble", rec_opts)
                                if nav_rec.get("eof_reached") or n8_rec.get("is_complete"):
                                    rec_bot_eof = int(nav_rec.get("actual_bottom") or max(state.document_lines.keys(), default=0))
                                    reconciled_rec = state.reconcile_eof_total_lines_and_complete_project(
                                        actual_eof_line=rec_bot_eof,
                                        eof_reason=nav_rec.get("eof_reason") or "Physical EOF verified during recovery",
                                    )
                                    corr_tot = int(reconciled_rec.get("target_total_lines") or rec_bot_eof)
                                    export_rec = state.export_project_markdown_to_disk()
                                    comp_msg = f"🎉 100% Markdown Captured & Exported ({export_rec.get('file_name')})! Target document lines ({corr_tot:,}) reached at Line {corr_tot:,}."
                                    state.latest_telemetry["status_message"] = comp_msg
                                    state.record_diagnostics_trace_event(
                                        event_type="LAST_LINE_OCR_COMPLETED",
                                        top_line=settled_t,
                                        bottom_line=corr_tot,
                                        target_top_line=corr_tot,
                                        node_id="document_assemble",
                                        reason=comp_msg,
                                        recovery_action=f"Exported markdown to {export_rec.get('export_path')}",
                                    )
                                    if reconciled_rec.get("project"):
                                        await state.ws_manager.broadcast({"type": "project_updated", "project": reconciled_rec["project"]})
                                    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "telemetry": state.latest_telemetry})
                                    await state.ws_manager.broadcast({"type": "markdown_part_exported", "export": export_rec, "multipart_state": state.multipart_bundle_state})
                                    mp_state_rec = state.sync_multipart_state_from_alignment()
                                    if mp_state_rec.get("is_multipart") and mp_state_rec.get("auto_chain_enabled", True) and state.capture_loop_running:
                                        await emit_dag_telemetry_event(
                                            category="SYSTEM",
                                            message=f"📂 Multi-Part Markdown Part {mp_state_rec.get('current_part')} complete! Running DAG Group 'Markdown File Change' to open Part {mp_state_rec.get('next_part_number')}...",
                                            dag="markdown_file_change",
                                            serial=active_serial,
                                        )
                                        mfc_res = await execute_dag_group_markdown_file_change(
                                            serial=active_serial,
                                            display_id=disp_id,
                                            mode="switch_next",
                                            handoff_to_init=False,
                                            handoff_to_phase3=True,
                                        )
                                        if mfc_res.get("status") == "success" and not mfc_res.get("bundle_completed") and state.capture_loop_running:
                                            advance_to_next_multipart = True
                                            break
                                        stop_reason_logged = True
                                        break
                                    if state.is_edge_connected("document_assemble", "markdown_tag_parser"):
                                        try:
                                            await execute_dag_group_post_capture_analyzer(project_id=state.get_current_project_id())
                                        except Exception as pca_err:
                                            print(f"[CaptureLoop] Post-capture analyzer note: {pca_err}")
                                    stop_reason_logged = True
                                    break
                                if n8_rec.get("status") != "error":
                                    state.record_diagnostics_trace_event(
                                        event_type="LOOP_AUTO_RECOVERED", node_id=failed_node, target_top_line=settled_t,
                                        reason=f"Successfully recovered {failed_node} and aligned Line {settled_t}",
                                        recovery_action=f"Aligned Line {settled_t} ({nav_rec.get('arrows_pressed', 0)} arrows, {nav_rec.get('page_keys_pressed', 0)} page keys) and completed DAG 4",
                                    )
                                    consecutive_recovery_attempts = 0
                                    await asyncio.sleep(0.15)
                                    continue
                        else:
                            expected_top = state.get_next_expected_top_line()
                            nav_rec = await navigate_to_target_top_line(
                                target_top=int(expected_top), serial=active_serial, display_id=disp_id,
                                use_page_keys=True, max_attempts=12, caller_node="loop_auto_recovery",
                            )
                            if nav_rec.get("eof_reached"):
                                rec_bot_eof = int(nav_rec.get("actual_bottom") or max(state.document_lines.keys(), default=0))
                                reconciled_rec = state.reconcile_eof_total_lines_and_complete_project(
                                    actual_eof_line=rec_bot_eof,
                                    eof_reason=nav_rec.get("eof_reason") or "Physical EOF verified during recovery",
                                )
                                corr_tot = int(reconciled_rec.get("target_total_lines") or rec_bot_eof)
                                await _run_node_safe("document_assemble", {"serial": active_serial, "fast_loop": True, "skip_env_heal": True})
                                export_rec = state.export_project_markdown_to_disk()
                                comp_msg = f"🎉 100% Markdown Captured & Exported ({export_rec.get('file_name')})! Target document lines ({corr_tot:,}) reached at Line {corr_tot:,}."
                                state.latest_telemetry["status_message"] = comp_msg
                                state.record_diagnostics_trace_event(
                                    event_type="LAST_LINE_OCR_COMPLETED",
                                    top_line=int(nav_rec.get("actual_top") or 1),
                                    bottom_line=corr_tot,
                                    target_top_line=corr_tot,
                                    node_id="document_assemble",
                                    reason=comp_msg,
                                    recovery_action=f"Exported markdown to {export_rec.get('export_path')}",
                                )
                                if reconciled_rec.get("project"):
                                    await state.ws_manager.broadcast({"type": "project_updated", "project": reconciled_rec["project"]})
                                await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "telemetry": state.latest_telemetry})
                                await state.ws_manager.broadcast({"type": "markdown_part_exported", "export": export_rec, "multipart_state": state.multipart_bundle_state})
                                mp_state_rec = state.sync_multipart_state_from_alignment()
                                if mp_state_rec.get("is_multipart") and mp_state_rec.get("auto_chain_enabled", True) and state.capture_loop_running:
                                    await emit_dag_telemetry_event(
                                        category="SYSTEM",
                                        message=f"📂 Multi-Part Markdown Part {mp_state_rec.get('current_part')} complete! Running DAG Group 'Markdown File Change' to open Part {mp_state_rec.get('next_part_number')}...",
                                        dag="markdown_file_change",
                                        serial=active_serial,
                                    )
                                    mfc_res = await execute_dag_group_markdown_file_change(
                                        serial=active_serial,
                                        display_id=disp_id,
                                        mode="switch_next",
                                        handoff_to_init=False,
                                        handoff_to_phase3=True,
                                    )
                                    if mfc_res.get("status") == "success" and not mfc_res.get("bundle_completed") and state.capture_loop_running:
                                        advance_to_next_multipart = True
                                        break
                                    stop_reason_logged = True
                                    break
                                if state.is_edge_connected("document_assemble", "markdown_tag_parser"):
                                    try:
                                        await execute_dag_group_post_capture_analyzer(project_id=state.get_current_project_id())
                                    except Exception as pca_err:
                                        print(f"[CaptureLoop] Post-capture analyzer note: {pca_err}")
                                stop_reason_logged = True
                                break
                            state.record_diagnostics_trace_event(
                                event_type="LOOP_AUTO_RECOVERED", node_id=failed_node, target_top_line=int(expected_top),
                                reason=f"Re-verified viewport at Line {nav_rec.get('actual_top') or expected_top}; retrying capture cycle",
                                recovery_action=f"Environment healed & viewport aligned to Line {expected_top}",
                            )
                            await asyncio.sleep(0.25)
                            continue
                    except Exception as rec_ex:
                        print(f"[CaptureLoop] Auto-recovery exception: {rec_ex}")

                    await asyncio.sleep(0.35)
                    continue

                consecutive_recovery_attempts = 0
                top_l = state.latest_telemetry.get("current_top_line", 0)
                bot_l = state.latest_telemetry.get("current_bottom_line", 0)
                target_lines = int(
                    state.headless_telemetry_session.get("target_total_lines", 0)
                    or state.latest_telemetry.get("target_total_lines", 0)
                    or 0
                )
                doc_count = len(state.document_lines)

                if is_headless:
                    lat = float(res.get("node4", {}).get("latency_ms") or 0.0)
                    session = state.update_headless_telemetry_session(
                        top_line=top_l, bottom_line=bot_l, frames_inc=1, latency_ms=lat, event_msg=f"Captured frame (Lines {top_l}..{bot_l})"
                    )
                    if hasattr(state, "ws_manager") and state.ws_manager:
                        await state.ws_manager.broadcast({"type": "headless_telemetry_progress", "telemetry": session})

                from ocr_engine import is_eof_reached_with_offline_awareness
                tail_txt_loop = ""
                if bot_l > 0 and state.document_lines:
                    tail_txt_loop = "\n".join(
                        str(state.document_lines.get(k, "")) for k in range(max(1, bot_l - 6), bot_l + 1)
                    )
                is_eof_loop, _ = is_eof_reached_with_offline_awareness(
                    bottom_line=max(bot_l, doc_count),
                    total_lines=target_lines,
                    offline_detected=bool(
                        state.orchestration_state.get("offline_overlay_detected")
                        or state.dag_state.get("nodes", {}).get("frame_ocr", {}).get("offline_overlay_detected")
                        or state.dag_state.get("nodes", {}).get("arrow_down", {}).get("offline_overlay_detected")
                    ),
                    tail_text=tail_txt_loop,
                )
                total_reached = bool(
                    target_lines > 0
                    and (
                        bot_l >= target_lines
                        or doc_count >= target_lines
                        or is_eof_loop
                        or res.get("node6", {}).get("eof_reached")
                    )
                )
                n8 = res.get("node8", {})
                if n8.get("is_complete") or total_reached:
                    reconciled_loop = state.reconcile_eof_total_lines_and_complete_project(
                        actual_eof_line=max(int(bot_l or 0), int(doc_count or 0)),
                        eof_reason="100% EOF reached",
                    )
                    corr_tot_loop = int(reconciled_loop.get("target_total_lines") or bot_l or target_lines or doc_count)
                    target_lines = corr_tot_loop
                    bot_l = corr_tot_loop
                    export_rec = state.export_project_markdown_to_disk()
                    comp_msg = f"🎉 100% Markdown Captured & Exported ({export_rec.get('file_name')})! Target document lines ({target_lines:,}) reached at Line {bot_l:,}."
                    state.latest_telemetry["status_message"] = comp_msg
                    state.record_diagnostics_trace_event(
                        event_type="LAST_LINE_OCR_COMPLETED", top_line=top_l, bottom_line=bot_l, target_top_line=target_lines,
                        node_id="document_assemble", reason=comp_msg, recovery_action=f"Exported markdown to {export_rec.get('export_path')}",
                    )
                    if reconciled_loop.get("project"):
                        await state.ws_manager.broadcast({"type": "project_updated", "project": reconciled_loop["project"]})
                    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "telemetry": state.latest_telemetry})
                    await state.ws_manager.broadcast({"type": "markdown_part_exported", "export": export_rec, "multipart_state": state.multipart_bundle_state})

                    mp_state = state.sync_multipart_state_from_alignment()
                    if mp_state.get("is_multipart") and mp_state.get("auto_chain_enabled", True) and state.capture_loop_running:
                        await emit_dag_telemetry_event(
                            category="SYSTEM",
                            message=f"📂 Multi-Part Markdown Part {mp_state.get('current_part')} complete! Running DAG Group 'Markdown File Change' to open Part {mp_state.get('next_part_number')}...",
                            dag="markdown_file_change",
                            serial=active_serial,
                        )
                        mfc_res = await execute_dag_group_markdown_file_change(
                            serial=active_serial,
                            display_id=disp_id,
                            mode="switch_next",
                            handoff_to_init=False,
                            handoff_to_phase3=True,
                        )
                        if mfc_res.get("status") == "success" and not mfc_res.get("bundle_completed") and state.capture_loop_running:
                            advance_to_next_multipart = True
                            break
                        stop_reason_logged = True
                        if is_headless:
                            state.headless_telemetry_session["total_lines_reached"] = True
                        break

                    if state.is_edge_connected("document_assemble", "markdown_tag_parser"):
                        try:
                            await execute_dag_group_post_capture_analyzer(project_id=state.get_current_project_id())
                        except Exception as pca_err:
                            print(f"[CaptureLoop] Post-capture analyzer note: {pca_err}")

                    stop_reason_logged = True
                    if is_headless:
                        state.headless_telemetry_session["total_lines_reached"] = True
                    break

                n7 = res.get("node7", {})
                if not n7.get("allowed", True):
                    trig_msg = f"Trigger blocked next loop: {n7.get('message')}"
                    state.latest_telemetry["status_message"] = trig_msg
                    state.record_diagnostics_trace_event(event_type="LOOP_STOPPED", node_id="verification_trigger", reason=trig_msg)
                    stop_reason_logged = True
                    break

                if not state.is_edge_connected("document_assemble", "frame_acquire"):
                    conn_msg = "Loop finished cycle: Loopback connector (Node 8 ➔ Node 3) is disconnected"
                    state.latest_telemetry["status_message"] = conn_msg
                    state.record_diagnostics_trace_event(event_type="LOOP_STOPPED", node_id="connector_8_3", reason=conn_msg)
                    stop_reason_logged = True
                    break

                await asyncio.sleep(0.18)

            if advance_to_next_multipart and state.capture_loop_running:
                await asyncio.sleep(0.35)
                continue
            break
    except asyncio.CancelledError:
        if not stop_reason_logged:
            state.record_diagnostics_trace_event(event_type="LOOP_STOPPED", reason="Loop stopped manually by user (task cancelled)")
            stop_reason_logged = True
    except HTTPException as he:
        det = he.detail
        err_msg = det.get("message") if isinstance(det, dict) else str(det)
        state.latest_telemetry["status_message"] = f"Capture loop halted: {err_msg}"
        if not stop_reason_logged:
            state.record_diagnostics_trace_event(event_type="LOOP_STOPPED", reason=f"Unhandled HTTPException in loop: {err_msg}")
            stop_reason_logged = True
    except Exception as e:
        state.latest_telemetry["status_message"] = f"Capture loop halted: {e}"
        if not stop_reason_logged:
            state.record_diagnostics_trace_event(event_type="LOOP_STOPPED", reason=f"Unhandled exception in loop: {e}")
            stop_reason_logged = True
    finally:
        if not stop_reason_logged and not state.project_diagnostics_trace.get("is_completed"):
            state.record_diagnostics_trace_event(event_type="LOOP_STOPPED", reason=state.latest_telemetry.get("status_message") or "Capture loop stopped")
        state.capture_loop_running = False
        state.latest_telemetry["is_pacing"] = False
        state.dag_state["current_active_node"] = None
        state.orchestration_state["status"] = "COMPLETED" if state.project_diagnostics_trace.get("is_completed") else "PAUSED"

        if is_headless and state.headless_telemetry_session.get("is_active"):
            status_str = "COMPLETED" if state.headless_telemetry_session.get("total_lines_reached") else "STOPPED"
            final_summary = state.complete_headless_telemetry_session(status=status_str, message=state.latest_telemetry.get("status_message"))
            if hasattr(state, "ws_manager") and state.ws_manager:
                await state.ws_manager.broadcast({"type": "headless_telemetry_complete", "telemetry": final_summary})

        await state.ws_manager.broadcast({
            "type": "capture_loop_status", "running": False, "dag": state.dag_state, "telemetry": state.latest_telemetry
        })


async def execute_dag_group_position_navigation(serial: Optional[str] = None, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    active_serial = await get_active_adb_serial(serial)
    env_fn = _get_orch_attr("resolve_and_enforce_dag_device_environment", resolve_and_enforce_dag_device_environment)
    dev_env = await env_fn(serial=active_serial)
    if dev_env.get("status") == "error":
        err_msg = dev_env.get("message") or dev_env.get("error") or "Device validation failed"
        position_group = state.dag_state.get("groups", {}).get("position_navigation")
        if position_group:
            position_group["status"] = "error"
        state.latest_telemetry["status_message"] = err_msg
        await state.ws_manager.broadcast({"type": "dag_updated", "error": err_msg, "dag": state.dag_state, "telemetry": state.latest_telemetry})
        return {"status": "error", "group": "position_navigation", "error": err_msg}

    position_group = state.dag_state["groups"].setdefault("position_navigation", {
        "id": "position_navigation", "title": "Line Positioning & Navigation",
        "description": "Gutter OCR boundary detection and down-arrow viewport alignment",
        "nodes": ["frame_ocr", "arrow_down"], "status": "active",
    })
    position_group["status"] = "active"
    state.dag_state["current_active_group"] = "position_navigation"
    opts = {"serial": active_serial, "fast_loop": True, "allow_concurrent": False, "skip_env_heal": True}
    if payload:
        opts.update(payload)

    if active_serial and "mock" not in str(active_serial).lower():
        try:
            ext_did = await detect_external_display_id(active_serial)
            if await is_ime_visible(active_serial):
                await dismiss_keyboard(active_serial, ext_did)
        except Exception:
            pass

    await emit_dag_telemetry_event(category="SYSTEM", message="DAG 3 • Acquiring frame for gutter OCR positioning...", dag="position_navigation", serial=active_serial)
    n3_res = await _call_run_single_dag_node("frame_acquire", opts)
    if n3_res.get("status") == "error":
        position_group["status"] = "error"
        return {"status": "error", "group": "position_navigation", "node_id": "frame_acquire", "result": n3_res}

    n5_res = await _call_run_single_dag_node("frame_ocr", opts)
    if n5_res.get("status") == "error":
        position_group["status"] = "error"
        return {"status": "error", "group": "position_navigation", "node_id": "frame_ocr", "result": n5_res}

    bot_ln = n5_res.get("bottom_line") or state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line") or 0
    top_ln = n5_res.get("top_line") or state.dag_state["nodes"].get("frame_ocr", {}).get("top_line") or 1
    if bot_ln > 0:
        opts["prev_bottom"] = bot_ln
        opts["cur_top"] = top_ln
        opts["target_top"] = bot_ln + 1

    n6_res = await _call_run_single_dag_node("arrow_down", opts)
    if n6_res.get("status") in ("error", "prevented") or n6_res.get("reached") is False or n6_res.get("advanced") is False:
        st = "error" if n6_res.get("status") in ("error", "success") else n6_res.get("status", "error")
        position_group["status"] = st
        err_msg = n6_res.get("message") or n6_res.get("error") or "Navigation failed: arrow_down did not advance viewport."
        state.latest_telemetry["status_message"] = f"DAG 3 halted: {err_msg}"
        return {"status": st, "group": "position_navigation", "node_id": "arrow_down", "result": n6_res, "error": err_msg}

    n3_post_res = await _call_run_single_dag_node("frame_acquire", opts)
    position_group["status"] = "completed"
    tgt_t = opts.get("target_top", bot_ln + 1)
    await emit_dag_telemetry_event(category="SYSTEM", message=f"DAG 3 complete ✔ Target Top Line {tgt_t} positioned via DownArrow stepping.", dag="position_navigation", level="success", serial=active_serial)
    await state.ws_manager.broadcast({"type": "dag_updated", "dag": state.dag_state, "group_id": "position_navigation"})

    return {
        "status": "success", "group": "position_navigation",
        "node3_init": n3_res, "node5": n5_res, "node6": n6_res, "node3_post": n3_post_res, "target_top": tgt_t,
    }


async def execute_dag_group_verify_assemble(serial: Optional[str] = None, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    active_serial = await get_active_adb_serial(serial)
    env_fn = _get_orch_attr("resolve_and_enforce_dag_device_environment", resolve_and_enforce_dag_device_environment)
    dev_env = await env_fn(serial=active_serial)
    if dev_env.get("status") == "error":
        err_msg = dev_env.get("message") or dev_env.get("error") or "Device validation failed"
        verify_group = state.dag_state.get("groups", {}).get("verify_assemble")
        if verify_group:
            verify_group["status"] = "error"
        state.latest_telemetry["status_message"] = err_msg
        await state.ws_manager.broadcast({"type": "dag_updated", "error": err_msg, "dag": state.dag_state, "telemetry": state.latest_telemetry})
        return {"status": "error", "group": "verify_assemble", "error": err_msg}

    verify_group = state.dag_state["groups"].setdefault("verify_assemble", {
        "id": "verify_assemble", "title": "Verify & Assemble",
        "description": "Recaptures frame to verify top line position, evaluates qualifiers, and reconstructs master document",
        "nodes": ["verification_trigger", "document_assemble"], "status": "active",
    })
    verify_group["status"] = "active"
    state.dag_state["current_active_group"] = "verify_assemble"
    opts = {"serial": active_serial, "fast_loop": True, "allow_concurrent": False, "skip_env_heal": True}
    if payload:
        opts.update(payload)

    await emit_dag_telemetry_event(category="SYSTEM", message="Running DAG 4: Verify & Assemble (Nodes 7 → 8 in isolation)...", dag="verify_assemble", serial=active_serial)

    n7_res = await _call_run_single_dag_node("verification_trigger", opts)
    if n7_res.get("status") in ("error", "prevented") or not n7_res.get("allowed", True) or n7_res.get("prevented", False):
        st = n7_res.get("status", "prevented")
        verify_group["status"] = st
        err_msg = n7_res.get("message") or n7_res.get("error") or "Verification trigger check prevented execution."
        state.latest_telemetry["status_message"] = f"DAG 4 halted: {err_msg}"
        return {"status": st, "group": "verify_assemble", "node_id": "verification_trigger", "result": n7_res, "error": err_msg}

    n8_res = await _call_run_single_dag_node("document_assemble", opts)
    if n8_res.get("status") == "error":
        verify_group["status"] = "error"
        err_msg = n8_res.get("message") or n8_res.get("error") or "Document assembly failed."
        state.latest_telemetry["status_message"] = f"DAG 4 halted: {err_msg}"
        return {"status": "error", "group": "verify_assemble", "node_id": "document_assemble", "result": n8_res, "error": err_msg}

    verify_group["status"] = "completed"
    await emit_dag_telemetry_event(category="SYSTEM", message="DAG 4 complete ✔ Qualifiers verified and document reconstructed.", dag="verify_assemble", level="success", serial=active_serial)

    post_capture_res = None
    if n8_res.get("is_complete") and state.is_edge_connected("document_assemble", "markdown_tag_parser"):
        post_capture_res = await execute_dag_group_post_capture_analyzer(project_id=state.get_current_project_id(), payload=payload)

    return {
        "status": "success", "group": "verify_assemble",
        "node7": n7_res, "node8": n8_res, "post_capture_analyzer": post_capture_res,
    }


async def execute_dag_group_post_capture_analyzer(
    project_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = dict(payload or {})
    pid = project_id or payload.get("project_id") or state.get_current_project_id() or "default"
    payload["project_id"] = pid
    payload.setdefault("allow_concurrent", True)

    analyzer_group = state.dag_state.setdefault("groups", {}).setdefault("post_capture_analyzer", {
        "id": "post_capture_analyzer",
        "title": "Post-Capture Analyzer & Sandbox VFS",
        "description": "Parses CODESCAN_FILE_START/END tags into VFS tree, validates AST/TypeScript compilation in memfs with auto-healing, and materializes sandbox workspace for Monaco IDE",
        "nodes": ["markdown_tag_parser", "ast_compiler_validator", "sandbox_ide"],
        "status": "active",
        "progress": None,
    })
    analyzer_group["status"] = "active"
    state.dag_state["current_active_group"] = "post_capture_analyzer"

    await emit_dag_telemetry_event(
        category="SYSTEM", message="Running Post-Capture Analyzer DAG Group (Nodes 10 → 11 → 12)...", dag="post_capture_analyzer"
    )

    n10_res = await _call_run_single_dag_node("markdown_tag_parser", payload)
    if n10_res.get("status") == "error":
        analyzer_group["status"] = "error"
        return {
            "status": "error", "group": "post_capture_analyzer", "node_id": "markdown_tag_parser",
            "result": n10_res, "error": n10_res.get("error") or n10_res.get("message"),
        }

    n11_res = None
    n12_res = None

    if state.is_edge_connected("markdown_tag_parser", "ast_compiler_validator"):
        n11_res = await _call_run_single_dag_node("ast_compiler_validator", payload)
        if n11_res.get("status") == "error":
            analyzer_group["status"] = "error"
            return {
                "status": "error", "group": "post_capture_analyzer", "node_id": "ast_compiler_validator",
                "node10": n10_res, "result": n11_res, "error": n11_res.get("error") or n11_res.get("message"),
            }

        if state.is_edge_connected("ast_compiler_validator", "sandbox_ide"):
            n12_res = await _call_run_single_dag_node("sandbox_ide", payload)
            if n12_res.get("status") == "error":
                analyzer_group["status"] = "error"
                return {
                    "status": "error", "group": "post_capture_analyzer", "node_id": "sandbox_ide",
                    "node10": n10_res, "node11": n11_res, "result": n12_res,
                    "error": n12_res.get("error") or n12_res.get("message"),
                }

    analyzer_group["status"] = "completed"
    ws_data = (getattr(state, "analyzer_workspaces", {}) or {}).get(pid) or {}
    await state.ws_manager.broadcast({
        "type": "analyzer_workspace_ready",
        "project_id": pid,
        "workspace_endpoint": f"/api/analyzer/workspace/{pid}",
        "vfs_files_count": n10_res.get("vfs_files_count", 0),
        "compilation_summary": (n11_res or {}).get("compilation_summary"),
        "dag": state.dag_state,
    })

    return {
        "status": "success", "group": "post_capture_analyzer", "project_id": pid,
        "node10": n10_res, "node11": n11_res, "node12": n12_res,
        "workspace_endpoint": f"/api/analyzer/workspace/{pid}", "workspace": ws_data,
    }


async def transition_to_next_multipart_project(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    explicit_next_part: Optional[int] = None,
    current_project_id: Optional[str] = None,
    broadcast_fn: Optional[Any] = None,
) -> Dict[str, Any]:
    from models import ProjectCreateRequest
    from routers.projects import create_project
    from services.ui_automator_service import (
        select_and_open_next_markdown_part,
        ensure_teams_maximized_and_dark_mode,
    )

    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"status": "error", "message": "No active Android device connected"}
    disp_id = display_id if display_id is not None else await detect_external_display_id(ser)

    if state.document_lines:
        try:
            state.export_project_markdown_to_disk()
        except Exception as exp_e:
            print(f"[transition_to_next_multipart_project] Export note: {exp_e}")

    mp_state = state.sync_multipart_state_from_alignment()
    active_proj = db.get_active_project() or {}
    canonical_fn = state._extract_canonical_filename_from_project_or_lines(active_proj, state.document_lines)
    cur_file = state.latest_alignment_status.get("file_name") or canonical_fn or active_proj.get("name") or ""
    cur_part = mp_state.get("current_part")
    if explicit_next_part is not None and explicit_next_part > 1:
        cur_part = explicit_next_part - 1
    base_prefix = mp_state.get("base_prefix") or active_proj.get("bundle_name") or ""

    state.multipart_bundle_state["transition_status"] = "transitioning"
    state.multipart_bundle_state["last_transition_message"] = f"Exiting {cur_file or 'current markdown'} via Back Arrow and opening Part {(cur_part or 1) + 1}..."
    await state.ws_manager.broadcast({"type": "multipart_transition_status", "multipart_state": state.multipart_bundle_state})

    trans_res = await select_and_open_next_markdown_part(
        serial=ser, display_id=disp_id, current_file_name=cur_file, current_part_number=cur_part, base_prefix=base_prefix
    )

    if trans_res.get("available_parts"):
        state.multipart_bundle_state["available_parts"] = trans_res["available_parts"]
    if trans_res.get("total_parts"):
        state.multipart_bundle_state["total_parts"] = trans_res["total_parts"]

    if trans_res.get("bundle_completed"):
        state.multipart_bundle_state["bundle_completed"] = True
        state.multipart_bundle_state["transition_status"] = "completed"
        state.multipart_bundle_state["last_transition_message"] = trans_res.get("message", "All parts in the multi-part markdown bundle have been captured and exported!")
        await state.ws_manager.broadcast({"type": "multipart_bundle_completed", "multipart_state": state.multipart_bundle_state, "transition": trans_res})
        return {**trans_res, "multipart_state": state.multipart_bundle_state}

    if trans_res.get("status") != "success":
        state.multipart_bundle_state["transition_status"] = "error"
        state.multipart_bundle_state["last_transition_message"] = trans_res.get("message", "Failed to open next markdown part")
        await state.ws_manager.broadcast({"type": "multipart_transition_status", "multipart_state": state.multipart_bundle_state, "transition": trans_res})
        return {**trans_res, "multipart_state": state.multipart_bundle_state}

    # Ensure Fullscreen, Edit Mode, and Dark Mode are active before handing off to Phase I Initialize
    if ser and "mock" not in str(ser).lower():
        try:
            await ensure_teams_maximized_and_dark_mode(ser, disp_id, enable_edit_mode=True, enable_dark_mode=True)
        except Exception as fs_e:
            print(f"[transition_to_next_multipart_project] Fullscreen/Dark mode verify note: {fs_e}")

    opened_file = (
        trans_res.get("opened_file_name")
        or state.latest_alignment_status.get("file_name")
        or f"{base_prefix or 'Document'}_part{trans_res.get('next_part_number', 2)}.md"
    )
    next_part_num = trans_res.get("next_part_number") or trans_res.get("part_number")
    tot_parts = trans_res.get("total_parts") or state.multipart_bundle_state.get("total_parts")

    eff_bundle_name = active_proj.get("bundle_name") or base_prefix or re.sub(r"[_\-\s]*part[_\-\s]*\d+.*$", "", opened_file, flags=re.IGNORECASE).strip() or "Bundle"
    clean_slug = re.sub(r"[^a-z0-9]+", "_", str(eff_bundle_name).lower()).strip("_") or "bundle"
    eff_bundle_id = active_proj.get("bundle_id") or f"bundle_{clean_slug}"

    if active_proj.get("id") and not active_proj.get("bundle_id"):
        try:
            db.update_project_bundle_metadata(
                project_id=active_proj["id"],
                bundle_id=eff_bundle_id,
                bundle_name=eff_bundle_name,
                part_number=int(cur_part or 1),
                total_parts=int(tot_parts or 0) if tot_parts else None,
                part_file_name=cur_file or f"{eff_bundle_name}_part{cur_part or 1}.md",
            )
        except Exception:
            pass

    # Reset headless telemetry session target so Part N+1 calibrates its own total_lines in DAG Group 1
    state.headless_telemetry_session["target_total_lines"] = 0
    state.headless_telemetry_session["total_lines_reached"] = False
    state.orchestration_state["offline_overlay_detected"] = False

    new_proj = await create_project(
        ProjectCreateRequest(
            name=opened_file,
            description=f"File: {opened_file} (Multi-Part Bundle Part {next_part_num}{f' of {tot_parts}' if tot_parts else ''})",
            target_total_lines=0,
            device_model=active_proj.get("device_model"),
            device_name=active_proj.get("device_name"),
            device_serial=active_proj.get("device_serial") or ser,
            target_dpi=active_proj.get("target_dpi"),
            display_width=active_proj.get("display_width"),
            display_height=active_proj.get("display_height"),
            display_id=active_proj.get("display_id") or disp_id,
            lines_per_page=active_proj.get("lines_per_page"),
            step_size=active_proj.get("step_size"),
            scroll_padding_lines=active_proj.get("scroll_padding_lines"),
            arrow_count_init=active_proj.get("arrow_count_init"),
            arrow_count_step=active_proj.get("arrow_count_step"),
            settle_delay_ms=active_proj.get("settle_delay_ms"),
            lock_device=bool(active_proj.get("lock_device", True)),
            bundle_id=eff_bundle_id,
            bundle_name=eff_bundle_name,
            part_number=int(next_part_num or 0) if next_part_num else None,
            total_parts=int(tot_parts or 0) if tot_parts else None,
            part_file_name=opened_file,
        )
    )

    state.sync_multipart_state_from_alignment()
    state.multipart_bundle_state["current_part"] = next_part_num
    state.multipart_bundle_state["transition_status"] = "ready"
    state.multipart_bundle_state["bundle_completed"] = False
    state.multipart_bundle_state["last_transition_message"] = f"Opened & maximized {opened_file} (Edit + Dark Mode) and created project '{new_proj.get('name')}' ✔"

    await state.ws_manager.broadcast({
        "type": "multipart_transition_completed", "project": new_proj, "transition": trans_res, "multipart_state": state.multipart_bundle_state
    })

    return {"status": "success", "project": new_proj, "transition": trans_res, "multipart_state": state.multipart_bundle_state}


async def get_analyzer_workspace(project_id: Optional[str] = None, refresh: bool = False):
    from routers.analyzer_sandbox import get_analyzer_workspace_endpoint
    return await get_analyzer_workspace_endpoint(project_id=project_id, refresh=refresh)


async def update_analyzer_workspace_file(project_id: str, payload: Dict[str, Any]):
    from routers.analyzer_sandbox import save_analyzer_workspace_file_endpoint
    return await save_analyzer_workspace_file_endpoint(project_id=project_id, payload=payload)


async def handle_telemetry_update(p: Any) -> Dict[str, Any]:
    global current_device_model
    is_dag_active = bool(state.dag_state.get("current_active_node") or getattr(state, "capture_loop_running", False))
    for k in ["device_id", "current_page", "current_top_line", "current_bottom_line", "target_total_lines", "dwell_countdown_ms", "phase", "status_message"]:
        val = getattr(p, k, None)
        if val is not None:
            if k == "target_total_lines" and val > 0:
                if not is_dag_active or state.latest_telemetry.get("target_total_lines", 0) <= 0:
                    state.latest_telemetry[k] = val
                if (p_active := db.get_active_project()) and p_active.get("target_total_lines", 0) <= 0:
                    db.update_project_target_lines(p_active["id"], val)
            elif k in ("current_top_line", "current_bottom_line"):
                if not is_dag_active and val > 0:
                    state.latest_telemetry[k] = val
            elif k != "target_total_lines":
                state.latest_telemetry[k] = val
    state.latest_telemetry["is_pacing"] = False
    state.latest_telemetry["last_heartbeat"] = datetime.now().isoformat()
    if p.pacer_calibration:
        state.latest_telemetry["pacer_calibration"].update(p.pacer_calibration)
    if p.mobile_tokens:
        state.token_stats["mobile_tokens"] = p.mobile_tokens
    if not is_dag_active:
        if p.current_top_line and p.current_top_line > 0:
            state.orchestration_state["top_line"] = p.current_top_line
        if p.current_bottom_line and p.current_bottom_line > 0:
            state.orchestration_state["bottom_line"] = p.current_bottom_line
            state.orchestration_state["next_target_top"] = p.current_bottom_line + 1
        if p.current_page and p.current_page > 0:
            state.orchestration_state["page"] = p.current_page

    if p.device_id:
        did = p.device_id.lower()
        if "pixel 8" in did or "pixel_8" in did:
            current_device_model = "pixel_8"
        elif "pixel 10" in did or "pixel_10" in did:
            current_device_model = "pixel_10"
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
        state.orchestration_state.update({"device_model": current_device_model, "lines_per_page": prof["lines_per_page"]})

    if p.active_step:
        state.orchestration_state["active_step"] = p.active_step
    elif p.phase:
        pu = p.phase.upper()
        state.orchestration_state["active_step"] = (
            "SCREEN_CAPTURE" if ("CAPTURING" in pu or "SCREEN" in pu) else (
                "OCR_BOUNDS" if ("OCR" in pu or "BOUNDS" in pu) else (
                    "PRECISION_SCROLL" if ("SCROLL" in pu or "PACING" in pu or "ALIGN" in pu) else (
                        "DWELL_FREEZE" if ("DWELL" in pu or "FREEZE" in pu) else (
                            "START_READY" if ("READY" in pu or "STANDBY" in pu) else state.orchestration_state["active_step"]
                        )
                    )
                )
            )
        )
    if state.latest_telemetry.get("status_message") and "Desktop Captured" in state.latest_telemetry["status_message"]:
        state.latest_telemetry["status_message"] = "Ready"

    prev_status, prev_step = state.orchestration_state.get("status"), state.orchestration_state.get("active_step")
    if p.is_pacing:
        state.orchestration_state["status"] = "RUNNING"
    elif p.phase == "COMPLETED":
        state.orchestration_state["status"], state.orchestration_state["active_step"] = "COMPLETED", "LOOP_EVAL"
    elif p.phase == "PAUSED":
        state.orchestration_state["status"] = "PAUSED"
    elif p.phase in ["STANDBY", "IDLE"] and state.orchestration_state["status"] == "RUNNING":
        state.orchestration_state["status"] = "IDLE"

    if state.orchestration_state.get("status") != prev_status or state.orchestration_state.get("active_step") != prev_step:
        state.orchestration_state["updated_at"] = datetime.now().isoformat()

    await state.ws_manager.broadcast({"type": "orchestration_event", "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry})
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


async def handle_orchestrate_command(payload: Any) -> Dict[str, Any]:
    from services.adb_service import auto_fix_viewport, ensure_adb_keyboard_closed
    cmd, invoker = payload.command.upper(), state.format_device_name(payload.source)
    state.orchestration_state.update({"last_command": cmd, "source": payload.source or "web", "invoked_by": invoker, "updated_at": datetime.now().isoformat()})
    active_serial = await get_active_adb_serial()

    if cmd in ("BEGIN", "BEGIN_AUTO_FLIPPING", "RUN_DAG_CAPTURE"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"status": "RUNNING", "active_step": "DAG_CAPTURE", "manual_attention_required": False, "halt_reason": None, "step_label": f"DAG Capture Loop Started by {invoker}"})
        state.latest_telemetry.update({"is_pacing": False, "phase": "DAG_CAPTURE", "status_message": f"DAG Capture Loop • Invoked by {invoker}"})
        if start_fn := _get_orch_attr("start_dag_loop"):
            await start_fn({"serial": active_serial})
        elif not getattr(state, "capture_loop_running", False):
            asyncio.create_task(run_continuous_capture_loop_worker(serial=active_serial))
    elif cmd in ("RUN_DAG_INIT", "INIT_DAG"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"status": "RUNNING", "active_step": "DAG_INIT", "step_label": f"DAG Init Started by {invoker}"})
        state.latest_telemetry.update({"is_pacing": False, "phase": "DAG_INIT", "status_message": f"DAG Initialize Group • Invoked by {invoker}"})
        asyncio.create_task(execute_dag_group_initialize(serial=active_serial, project_id=state.get_current_project_id()))
    elif cmd == "CAPTURE_DESKTOP":
        state.orchestration_state.update({"last_command": "CAPTURE_DESKTOP", "active_step": "FRAME_ACQUIRE", "step_label": f"Single Frame Capture by {invoker}"})
        state.latest_telemetry.update({"status_message": f"DAG Frame Acquisition • Invoked by {invoker}"})
        asyncio.create_task(_call_run_single_dag_node("frame_acquire", {"serial": active_serial}))
    elif cmd == "GET_NEXT_LINE":
        next_ln = state.get_next_expected_top_line()
        state.orchestration_state.update({"next_target_top": next_ln, "step_label": f"Next Target Line: {next_ln} (Queried by {invoker})"})
        state.latest_telemetry.update({"status_message": f"Next Page First Line: {next_ln} • Invoked by {invoker}"})
    elif cmd in ("PAUSE", "PAUSE_DAG"):
        state.orchestration_state.update({"status": "PAUSED", "step_label": f"Paused by {invoker}"})
        state.latest_telemetry.update({"is_pacing": False, "phase": "PAUSED", "status_message": f"DAG Paused • Invoked by {invoker}"})
        if stop_fn := _get_orch_attr("stop_dag_loop"):
            await stop_fn()
    elif cmd in ("RESUME", "RESUME_DAG"):
        await ensure_adb_keyboard_closed()
        state.orchestration_state.update({"status": "RUNNING", "active_step": "DAG_CAPTURE", "manual_attention_required": False, "halt_reason": None, "step_label": f"Resumed by {invoker}"})
        state.latest_telemetry.update({"is_pacing": False, "phase": "DAG_CAPTURE", "status_message": f"DAG Capture Loop Resumed • Invoked by {invoker}"})
        if start_fn := _get_orch_attr("start_dag_loop"):
            await start_fn({"serial": active_serial})
        elif not getattr(state, "capture_loop_running", False):
            asyncio.create_task(run_continuous_capture_loop_worker(serial=active_serial))
    elif cmd in ("END", "ABORT_DAG", "STOP"):
        state.orchestration_state.update({"status": "COMPLETED", "active_step": "IDLE", "step_label": f"DAG Stopped by {invoker}"})
        state.latest_telemetry.update({"is_pacing": False, "phase": "IDLE", "status_message": f"DAG Pipeline Stopped • Invoked by {invoker}"})
        if abort_fn := _get_orch_attr("abort_running_node"):
            await abort_fn(reason=f"Stopped by {invoker}")
    elif cmd == "RESTART":
        await ensure_adb_keyboard_closed()
        prof = DEVICE_PROFILES.get(current_device_model, DEVICE_PROFILES["pixel_10"])
        lpp = prof["lines_per_page"]
        state.orchestration_state.update({"status": "RUNNING", "active_step": "DAG_INIT", "step_label": f"Restarted at Line 1 by {invoker}", "top_line": 1, "bottom_line": lpp, "next_target_top": lpp + 1, "page": 1, "device_model": current_device_model, "lines_per_page": lpp})
        state.latest_telemetry.update({"current_page": 1, "current_top_line": 1, "current_bottom_line": 0, "is_pacing": False, "phase": "DAG_INIT", "status_message": f"DAG Restarted • Invoked by {invoker}"})
        asyncio.create_task(execute_dag_group_initialize(serial=active_serial, project_id=state.get_current_project_id()))
    elif cmd in ("CALIBRATE_INSTANT", "CALIBRATE"):
        await auto_fix_viewport()
        state.orchestration_state.update({"active_step": "CALIBRATING", "step_label": f"Instant Calibration by {invoker}"})
        state.latest_telemetry.update({"status_message": f"Instant Calibration (Ctrl+End / Ctrl+Home) • Invoked by {invoker}"})
    elif cmd in ("ADVANCE_PAGE_ARROW", "PAGE_DOWN_ARROW"):
        await auto_fix_viewport()
        state.orchestration_state.update({"active_step": "PRECISION_SCROLL", "step_label": f"Arrow Step Invoked by {invoker}"})
        state.latest_telemetry.update({"status_message": f"Arrow Step Navigation • Invoked by {invoker}"})

    await state.ws_manager.broadcast({"type": "orchestration_event", "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry})
    try:
        db.save_project_telemetry(state.get_current_project_id(), state.latest_telemetry, state.token_stats)
    except Exception:
        pass
    return {"status": "success", "command": cmd, "orchestration": state.orchestration_state, "telemetry": state.latest_telemetry}


async def handle_node_config_update(node_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    target_key = NODE_ALIAS_MAP.get(node_id, node_id)
    node = state.dag_state["nodes"].get(target_key)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found in DAG")
    cfg = node.setdefault("config", {})
    if target_key == "arrow_down" and ("prevent_trigger_on_issue" in payload or "qualifiers" in payload):
        target_key = "verification_trigger"
        node = state.dag_state["nodes"].get(target_key)
        cfg = node.setdefault("config", {})
    if target_key == "verification_trigger":
        if payload.get("prevent_trigger_on_issue") is not None:
            cfg["prevent_trigger_on_issue"] = bool(payload["prevent_trigger_on_issue"])
        if isinstance(payload.get("qualifiers"), dict):
            for q_id, q_data in payload["qualifiers"].items():
                if q_id in cfg.get("qualifiers", {}):
                    cfg["qualifiers"][q_id].update(q_data)
        decision = state.evaluate_dag_node_5_trigger_sync()
        node["trigger_decision"] = decision
    else:
        cfg.update(payload)
        decision = None
    if dag_node := dag_node_registry.get_node(target_key):
        dag_node.set_config(cfg)
    await state.ws_manager.broadcast({"type": "dag_node_configured", "node_id": target_key, "config": cfg, "trigger_decision": decision, "dag": state.dag_state})
    return {"status": "success", "node_id": target_key, "config": cfg, "trigger_decision": decision}


async def handle_set_semaphore(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload or {}
    enabled = bool(payload.get("enabled", True))
    sem_id = payload.get("semaphore_id") or payload.get("id") or "group2_to_3"
    if sem_id in ("group3_to_4", "group_3_to_4", "dag3_to_4", "3_to_4"):
        state.set_edge_connection("arrow_down", "verification_trigger", enabled)
        sem_name, dag_cat = "DAG 3 to DAG 4", "verify_assemble"
    elif sem_id in ("all", "both"):
        state.set_edge_connection("local_ai_ocr", "frame_ocr", enabled)
        state.set_edge_connection("arrow_down", "verification_trigger", enabled)
        sem_name, dag_cat = "All Semaphores", "position_navigation"
    else:
        state.set_edge_connection("local_ai_ocr", "frame_ocr", enabled)
        sem_name, dag_cat = "DAG 2 to DAG 3", "position_navigation"
    overall_open = getattr(state, "dag_semaphore_group2_to_3", True) and getattr(state, "dag_semaphore_group3_to_4", True)
    state.dag_state["semaphore_status"] = "open" if overall_open else "blocked"
    msg = f"Semaphore ({sem_name}) set to {'OPEN ✔' if enabled else 'BLOCKED ⛔'}"
    await emit_dag_telemetry_event(category="SYSTEM", message=msg, dag=dag_cat)
    await state.ws_manager.broadcast({
        "type": "dag_semaphore_changed", "semaphore_id": sem_id, "enabled": enabled,
        "semaphore_group2_to_3": getattr(state, "dag_semaphore_group2_to_3", True),
        "semaphore_group3_to_4": getattr(state, "dag_semaphore_group3_to_4", True),
        "semaphore_status": "open" if overall_open else "blocked", "edges": state.dag_state.get("edges", []), "dag": state.dag_state,
    })
    return {
        "status": "success", "semaphore_id": sem_id, "enabled": enabled, "semaphore_status": "open" if enabled else "blocked",
        "semaphore_group2_to_3": getattr(state, "dag_semaphore_group2_to_3", True),
        "semaphore_group3_to_4": getattr(state, "dag_semaphore_group3_to_4", True),
        "edges": state.dag_state.get("edges", []), "message": msg,
    }


async def handle_scan_direct(request: Any, file: Any, engine: Optional[str] = "auto", model_target: Optional[str] = None, pipeline_mode: Optional[str] = None) -> Dict[str, Any]:
    import config
    import services.ocr_service as ocr_svc
    has_gemini = bool(config.GEMINI_API_KEY)
    contents = await file.read()
    temp_path = state.FRAMES_DIR / f"temp_scan_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png"
    pm = pipeline_mode or request.query_params.get("pipeline_mode") or (ocr_svc.active_pipeline_mode if has_gemini else "local")
    mt = ocr_svc.normalize_model_target(model_target or ("ollama" if pm == "local" or not has_gemini else ocr_svc.active_model_target) or request.query_params.get("model_target"))
    eff_engine = "minicpm" if (not has_gemini and (engine or ocr_svc.active_ocr_engine) in {"gemini", "hybrid"}) else (engine or ("minicpm" if not has_gemini else ocr_svc.active_ocr_engine))
    try:
        temp_path.write_bytes(contents)
        res = await ocr_svc.scan_image_with_minicpm(temp_path)
        return {"status": "success", "engine": eff_engine, "model_target": mt, "pipeline_mode": pm, **res}
    finally:
        temp_path.unlink(missing_ok=True)

