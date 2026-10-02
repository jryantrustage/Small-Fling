"""
Visual state inspection and pre-navigation safety service.
Ensures no rogue HID keystrokes are sent if the viewport has navigated away
from the active markdown viewer to a file list, directory, or blank pane.
"""

import asyncio
import base64
import json
import re
import subprocess
import cv2
import numpy as np
import requests
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
import config
from services.adb_service import (
    run_adb_shell, get_active_adb_serial, detect_external_display_id,
    capture_external_screenshot, auto_fix_viewport, is_ime_visible
)
from ocr_engine import fast_detect_gutter_bounds

OLLAMA_API = "http://localhost:11434/api/generate"
OLLAMA_GENERATE_API = OLLAMA_API


def query_visual_model(
    image_bytes: bytes,
    prompt: str,
    model: Optional[str] = None,
    max_tokens: int = 50,
    format_type: Optional[str] = "json"
) -> str:
    """Dispatches a fast, low-token visual question to local Ollama."""
    model_name = model or config.OLLAMA_VISION_MODEL or "minicpm-v"
    base64_frame = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "model": model_name,
        "prompt": prompt,
        "images": [base64_frame],
        "format": "json" if format_type == "json" else format_type,
        "stream": False,
        "options": {
            "temperature": 0.0,
            "num_predict": max_tokens
        }
    }
    if not format_type:
        payload.pop("format", None)

    try:
        res = requests.post(OLLAMA_GENERATE_API, json=payload, timeout=12.0).json()
        return res.get("response", "").strip()
    except Exception as e:
        print(f"[VisualModel] Query error on {model_name}: {e}")
        return ""


def optimize_frame_for_vlm(base64_frame: str, max_dim: int = 768) -> str:
    """Downscales full HD screenshot to lightweight JPEG thumbnail for fast VLM inference."""
    try:
        import io
        from PIL import Image
        raw_bytes = base64.b64decode(base64_frame)
        img = Image.open(io.BytesIO(raw_bytes))
        if img.width > max_dim or img.height > max_dim:
            img.thumbnail((max_dim, max_dim))
            img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        pass
    return base64_frame


def is_markdown_view_active(base64_frame: str, model: Optional[str] = None) -> bool:
    """
    Lightweight visual check to verify if the viewport is currently displaying
    the markdown editor/viewer before issuing scroll keystrokes.
    """
    model_name = model or config.OLLAMA_VISION_MODEL or "minicpm-v:latest"
    prompt = (
        "Look at this screen capture. Is the markdown document viewer currently open "
        "and visible, or has it navigated away to a list, blank pane, or directory?\n"
        "Answer with a single JSON object: {\"markdown_open\": true|false}"
    )
    vlm_frame = optimize_frame_for_vlm(base64_frame)
    payload = {
        "model": model_name,  # or paligemma2
        "prompt": prompt,
        "images": [vlm_frame],
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.0,
            "num_predict": 50
        }
    }
    try:
        res = requests.post(OLLAMA_API, json=payload, timeout=20.0).json()
        raw_resp = res.get("response", "{}").strip()
        try:
            data = json.loads(raw_resp)
            return bool(data.get("markdown_open", data.get("is_viewer_active", False)))
        except Exception:
            # PaliGemma direct token response fallback (e.g. "yes", "true")
            lowered = raw_resp.lower()
            if "false" in lowered or "no" in lowered:
                return False
            return any(w in lowered for w in ("true", "yes", "open", "viewer"))
    except Exception as e:
        print(f"[is_markdown_view_active] Query error on {model_name}: {e}")
        return False


def classify_editor_viewport(image_bytes: bytes, model: Optional[str] = None) -> Dict[str, Any]:
    """
    Evaluates whether the viewport contains the active markdown viewer/document reader
    or has navigated away to a desktop wallpaper, folder browser, or blank pane.
    """
    prompt = (
        "Look at this screen capture. Is the markdown document viewer currently open "
        "and visible, or has it navigated away to a list, blank pane, or directory?\n"
        "Answer with a single JSON object: {\"markdown_open\": true|false}"
    )
    raw = query_visual_model(image_bytes, prompt, model=model, max_tokens=50, format_type="json")

    # Parse structured JSON response
    parsed: Dict[str, Any] = {}
    if raw:
        try:
            parsed = json.loads(raw)
        except Exception:
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except Exception:
                    pass

    is_viewer = parsed.get("markdown_open", parsed.get("is_viewer_active"))
    state_label = parsed.get("viewport_state", "unknown")

    if is_viewer is None:
        # Fallback keyword matching if JSON parse failed
        raw_lower = raw.lower()
        is_viewer = any(k in raw_lower for k in ["viewer", "document", "editor", "true"])
        if is_viewer:
            state_label = "viewer"
        elif any(k in raw_lower for k in ["file_browser", "directory", "list"]):
            state_label = "directory"
        elif any(k in raw_lower for k in ["blank", "desktop", "wallpaper"]):
            state_label = "blank"
        else:
            state_label = "unknown"

    return {
        "status": "success" if raw else "timeout",
        "state": state_label,
        "is_viewer_active": bool(is_viewer),
        "raw_response": raw,
        "parsed": parsed
    }


def classify_editor_modes_vlm(image_bytes: bytes, model: Optional[str] = None) -> Dict[str, Any]:
    """
    Evaluates whether the Teams markdown editor is in:
    1. Dark Mode (dark background vs light mode / white background).
    2. Edit Mode (pencil icon selected / single editor pane vs split-screen preview with duplicated text).
    """
    prompt = (
        "Analyze this Microsoft Teams Markdown document screen capture:\n"
        "1. Is the interface in Dark Mode (dark theme / background) or Light Mode (white / bright background)?\n"
        "2. Is the editor in Edit Mode (pencil icon active, single pane) or is it in split-screen / preview mode "
        "where text is duplicated side-by-side in two panes?\n"
        "Answer with a single JSON object:\n"
        "{\"dark_mode\": true|false, \"edit_mode\": true|false, \"split_screen_detected\": true|false, \"reason\": \"short description\"}"
    )
    raw = query_visual_model(image_bytes, prompt, model=model, max_tokens=100, format_type="json")
    parsed: Dict[str, Any] = {}
    if raw:
        try:
            parsed = json.loads(raw)
        except Exception:
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except Exception:
                    pass

    dark_mode = parsed.get("dark_mode")
    edit_mode = parsed.get("edit_mode")
    split_screen = parsed.get("split_screen_detected")

    if dark_mode is None and raw:
        r_low = raw.lower()
        if "dark_mode\": true" in r_low or "dark theme" in r_low or "dark mode" in r_low:
            dark_mode = True
        elif "light" in r_low:
            dark_mode = False

    if edit_mode is None and raw:
        r_low = raw.lower()
        if "split" in r_low or "duplicate" in r_low:
            split_screen = True
            edit_mode = False
        elif "edit_mode\": true" in r_low or "pencil active" in r_low or "edit active" in r_low:
            edit_mode = True

    return {
        "status": "success" if raw else "timeout",
        "dark_mode": dark_mode,
        "edit_mode": edit_mode,
        "split_screen_detected": bool(split_screen),
        "raw_response": raw,
        "parsed": parsed
    }


async def verify_viewport_before_keystroke(serial: Optional[str] = None, image_bytes: Optional[bytes] = None) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Lightweight visual check invoked before issuing scroll keystrokes (e.g. down arrows).
    Prevents rogue HID events from derailing the run if the viewport navigated away.
    Returns: (is_safe_to_scroll, reason, details)
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return False, "No active device connected via ADB", {"connected": False}

    if ser and "mock" in str(ser).lower():
        return True, "Mock device verified", {"tier": "mock"}

    # 1. Quick check: Is soft keyboard currently covering the view?
    ime_visible = await is_ime_visible(ser)
    if ime_visible:
        disp_id = await detect_external_display_id(ser)
        await auto_fix_viewport(ser, disp_id)
        # Re-check after auto-fix
        if await is_ime_visible(ser):
            return False, "Soft keyboard is active on screen; keystrokes prevented to avoid text disruption", {"keyboard_open": True}

    snap = image_bytes or await capture_external_screenshot(ser, max_cache_age_s=0.25, bypass_lock=True)
    if not snap:
        return False, "Unable to capture external display screenshot for pre-scroll visual check", {"captured": False}

    # 2. Tier 1 (Ultra-fast CV gutter check, ~2ms): If line numbers are clearly present in left gutter, it is 100% in editor
    nparr = np.frombuffer(snap, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is not None:
        t_top, t_bot = fast_detect_gutter_bounds(img, dpi_factor=1.0)
        if t_top > 0 or t_bot > 0:
            return True, f"Markdown editor verified via gutter bounds (Ln {t_top} -> {t_bot})", {"tier": "fast_cv", "top": t_top, "bottom": t_bot}

    # 3. Tier 2 (Visual Model VQA via Ollama, ~80ms): Verify if screen is in viewer or directory
    vqa_res = classify_editor_viewport(snap)
    if vqa_res.get("is_viewer_active"):
        return True, "Markdown editor verified via visual model inspection", {"tier": "vqa", "vqa_res": vqa_res}

    state = vqa_res.get("state", "unknown")
    if state in ("directory", "list"):
        return False, "Viewport has navigated away to a file list/directory; scroll keystrokes suppressed", {"tier": "vqa", "state": state, "vqa_res": vqa_res}
    elif state == "blank":
        return False, "Viewport displays blank pane or inactive window; scroll keystrokes suppressed", {"tier": "vqa", "state": state, "vqa_res": vqa_res}

    # If VQA was ambiguous or timed out, allow if Teams activity is confirmed active in window manager
    win_chk = await run_adb_shell("dumpsys window | grep -E 'mFocusedApp.*FilePreviewActivity'", ser, timeout=1.5)
    if "FilePreviewActivity" in (win_chk.get("stdout") or ""):
        return True, "Teams FilePreviewActivity verified focused in window manager", {"tier": "window_manager"}

    return False, f"Viewport check failed (state: {state}); keystrokes suppressed to prevent rogue HID actions", {"tier": "vqa", "state": state}


async def assert_markdown_open(serial: Optional[str] = None, image_bytes: Optional[bytes] = None) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Pre-Scroll Assertion:
    Evaluates whether the markdown document viewer is currently open and visible
    before dispatching an arrow-down or page-down keystroke.
    """
    return await verify_viewport_before_keystroke(serial, image_bytes)


async def run_editor_recovery_node(
    serial: Optional[str] = None,
    display_id: Optional[int] = None,
    file_target_coords: Optional[Tuple[int, int]] = None
) -> Dict[str, Any]:
    """
    Recovery node diverted to when pre-scroll assertion fails (markdown_open == False).
    Suppresses virtual keyboard and brings Teams task to front.
    NEVER taps or selects files in directories to avoid navigating out of user's active file.
    """
    ser = await get_active_adb_serial(serial)
    if not ser:
        return {"success": False, "markdown_open": False, "reason": "No ADB device connected"}

    if ser and "mock" in str(ser).lower():
        return {"success": True, "markdown_open": True, "reason": "Mock device verified"}

    disp_id = display_id if (display_id is not None and display_id > 0) else await detect_external_display_id(ser)
    actions = []

    # 1. Soft keyboard suppression without keyevent 4 (Back)
    await run_adb_shell("settings put secure show_ime_with_hard_keyboard 0; input -d 0 keyevent 111 >/dev/null 2>&1", ser)
    if disp_id > 0:
        await run_adb_shell(f"input -d {disp_id} keyevent 111", ser)
    actions.append("Suppressed on-screen keyboard policy")

    # 2. Bring Teams task to front on external display (does not launch or restart activity)
    try:
        res_tasks = await run_adb_shell("dumpsys activity tasks | grep -E 'Task\\{.*com\\.microsoft\\.teams'", ser, timeout=2.5)
        out_tasks = res_tasks.get("stdout", "") if res_tasks.get("status") == "ok" else ""
        if out_tasks:
            m_t = re.search(r'#(\d+)\s+type=', out_tasks)
            if m_t:
                task_id = m_t.group(1)
                await run_adb_shell(f"cmd activity task to-front {task_id}", ser)
                actions.append(f"Brought Teams task #{task_id} to front")
    except Exception:
        pass

    await asyncio.sleep(0.3)

    # 3. Re-check pre-scroll assertion
    is_safe, reason, details = await assert_markdown_open(ser)

    return {
        "success": is_safe,
        "markdown_open": is_safe,
        "reason": reason,
        "actions_taken": actions,
        "details": details
    }


async def recover_viewport(file_target_coords: Tuple[int, int] = (120, 340), serial: Optional[str] = None, display_id: Optional[int] = None) -> bool:
    """Convenience helper to refocus and reopen the markdown viewer using target coordinates."""
    res = await run_editor_recovery_node(serial=serial, display_id=display_id, file_target_coords=file_target_coords)
    return bool(res.get("success", False))
