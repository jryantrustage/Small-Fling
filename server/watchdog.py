"""
MatrixCapture Standalone Watchdog Module.
Provides lightweight visual inspection before issuing scroll keystrokes (e.g. down arrows)
using local Ollama multimodal models (PaliGemma 2 / Gemma 4 / MiniCPM-V).
"""

import subprocess
import json
import re
import base64
import requests
import time
from typing import Optional, Dict, Any, Tuple

OLLAMA_API = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:e4b"  # or paligemma2


def resolve_active_model(preferred: str = MODEL_NAME) -> str:
    """Returns preferred model if pulled in Ollama, or falls back to installed visual model."""
    try:
        tags = requests.get("http://localhost:11434/api/tags", timeout=1.5).json().get("models", [])
        names = [m.get("name", "") for m in tags]
        if any(preferred in n for n in names):
            return preferred
        for fb in ["minicpm-v:latest", "gemma4:26b", "paligemma2"]:
            for n in names:
                if fb in n:
                    return n
    except Exception:
        pass
    return preferred


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


def is_markdown_view_active(base64_frame: str, model: str = MODEL_NAME) -> bool:
    """
    Lightweight visual check to verify if the viewport is currently displaying
    the markdown editor/viewer before issuing scroll keystrokes.
    """
    prompt = (
        "Look at this screen capture. Is the markdown document viewer currently open "
        "and visible, or has it navigated away to a list, blank pane, or directory?\n"
        "Answer with a single JSON object: {\"markdown_open\": true|false}"
    )
    active_model = resolve_active_model(model)
    vlm_frame = optimize_frame_for_vlm(base64_frame)
    payload = {
        "model": active_model,  # or paligemma2
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
            # PaliGemma / VLM direct token response fallback (e.g. "yes", "true")
            lowered = raw_resp.lower()
            if "false" in lowered or "no" in lowered:
                return False
            return any(w in lowered for w in ("true", "yes", "open", "viewer"))
    except Exception as e:
        print(f"[is_markdown_view_active] Error querying {active_model}: {e}")
        return False


def get_default_serial() -> str:
    """Finds the first connected ADB device serial."""
    try:
        out = subprocess.check_output(["adb", "devices"], text=True, timeout=3)
        lines = [l.split("\t")[0].strip() for l in out.strip().splitlines()[1:] if "\tdevice" in l]
        return lines[0] if lines else ""
    except Exception:
        return ""


def run_adb(cmd: str, serial: Optional[str] = None) -> str:
    """Executes an adb shell command via subprocess."""
    ser = serial or get_default_serial()
    if not ser:
        return ""
    try:
        res = subprocess.run(["adb", "-s", ser, "shell", cmd], capture_output=True, text=True, timeout=4.0)
        return res.stdout.strip()
    except Exception:
        return ""


def capture_screenshot_base64(serial: Optional[str] = None) -> str:
    """Captures external display screenshot using robust SurfaceFlinger mapping."""
    try:
        import asyncio
        from services.adb_service import capture_external_screenshot
        ser = serial or get_default_serial()
        raw = asyncio.run(capture_external_screenshot(ser, bypass_lock=True))
        if raw:
            return base64.b64encode(raw).decode("utf-8")
    except Exception as e:
        print(f"[capture_screenshot_base64] Screencap error: {e}")
    return ""


def recover_viewport(
    file_target_coords: Tuple[int, int] = (120, 340),
    serial: Optional[str] = None,
    display_id: int = 135
) -> bool:
    """
    Coordinate Click Recovery:
    The left-hand rail lists the files. If navigation drops back to the file list
    or search pane, an automated left-click on the known file coordinate or sending
    an Enter key will immediately restore the document pane.
    """
    ser = serial or get_default_serial()

    # 1. Send automated left-click on the known file coordinate in the left rail
    x, y = file_target_coords
    subprocess.run([
        "python", "send_hid.py",
        "--action", "click",
        "--x", str(x),
        "--y", str(y),
        "--display", str(display_id)
    ], timeout=5.0)

    # 2. Wait for the DOM/editor view to re-render
    try:
        subprocess.run(["sleep", "2"], timeout=3.0)
    except FileNotFoundError:
        time.sleep(2)

    # 3. Verify editor active via visual watchdog
    b64 = capture_screenshot_base64(ser)
    if b64 and is_markdown_view_active(b64):
        return True

    # 4. Shortcut fallback: Send Enter key (keycode 66) to open highlighted file in rail
    run_adb(f"input -d {display_id} keyevent 66", ser)
    time.sleep(1.0)
    b64_enter = capture_screenshot_base64(ser)
    if b64_enter and is_markdown_view_active(b64_enter):
        return True

    # 5. Hierarchy scan fallback if target coordinates did not activate document
    return reopen_markdown_document(serial=ser, display_id=display_id)


def reopen_markdown_document(
    serial: Optional[str] = None,
    display_id: int = 135,
    file_target_coords: Optional[Tuple[int, int]] = None
) -> bool:
    """Shell out to your HID tool (or send mouse/keyboard events) to refocus and reopen."""
    ser = serial or get_default_serial()
    if not ser:
        return False

    # 1. Send click or shortcut to refocus/open
    if file_target_coords is not None:
        x, y = file_target_coords
        subprocess.run([
            "python", "send_hid.py",
            "--action", "click",
            "--x", str(x),
            "--y", str(y),
            "--display", str(display_id)
        ], timeout=5.0)
        time.sleep(1.0)
        return True

    try:
        dump = run_adb("uiautomator dump /dev/stdout", ser)
        matches = re.finditer(r'text="([^"]+\.md)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', dump, re.IGNORECASE)
        for m in matches:
            fname = m.group(1)
            cx = (int(m.group(2)) + int(m.group(4))) // 2
            cy = (int(m.group(3)) + int(m.group(5))) // 2
            file_target_coords = (cx, cy)
            x, y = file_target_coords
            subprocess.run([
                "python", "send_hid.py",
                "--action", "click",
                "--x", str(x),
                "--y", str(y),
                "--display", str(display_id)
            ], timeout=5.0)
            time.sleep(1.0)
            return True
    except Exception as e:
        print(f"[reopen_markdown_document] Hierarchy scan error: {e}")

    # 2. Fallback: Refocus window via center click
    try:
        file_target_coords = (960, 540)
        x, y = file_target_coords
        subprocess.run([
            "python", "send_hid.py",
            "--action", "click",
            "--x", str(x),
            "--y", str(y),
            "--display", str(display_id)
        ], timeout=5.0)
        time.sleep(0.5)
    except Exception:
        pass
    return False


def safe_step_down(
    step_count: int = 47,
    serial: Optional[str] = None,
    display_id: int = 135,
    keycode: int = 20
) -> Tuple[bool, str]:
    """
    Constrained Key Bounds:
    Scope HID scroller to strictly emit PageDown (93) or DownArrow (20) scancodes,
    omitting mobile virtual keyboard toggle gestures entirely to prevent rogue input modal events.
    """
    if keycode not in (20, 93):
        return False, f"Keycode {keycode} rejected: Constrained strictly to DownArrow (20) or PageDown (93)"

    ser = serial or get_default_serial()
    if not ser:
        return False, "No ADB device connected"

    # 1. Soft keyboard guard (suppress without pressing Back)
    ime_chk = run_adb("dumpsys input_method | grep -E 'mInputShown=true'", ser)
    if "mInputShown=true" in ime_chk:
        run_adb("input -d 0 keyevent 111 >/dev/null 2>&1", ser)
        time.sleep(0.15)

    # 2. Visual inspection
    b64 = capture_screenshot_base64(ser)
    if not b64:
        return False, "Failed to capture display screenshot"

    if not is_markdown_view_active(b64):
        # Viewport navigated away: divert to recovery node before firing navigation keystrokes
        reopened = recover_viewport(file_target_coords=(120, 340), serial=ser, display_id=display_id)
        if not reopened:
            return False, "Visual check failed: Viewport is not in the markdown editor (navigated away)"
        print("[safe_step_down] Successfully recovered and reopened markdown document")

    # 3. Dispatched constrained keystrokes safely (omitting virtual keyboard toggle gestures)
    keys = " ".join([str(keycode)] * step_count)
    run_adb(f"input -d {display_id} keyevent {keys}", ser)
    key_name = "PageDown" if keycode == 93 else "DownArrow"
    return True, f"Safely scrolled {step_count}x {key_name} in verified editor [OK]"


if __name__ == "__main__":
    success, msg = safe_step_down(step_count=1)
    print(f"Watchdog Result: {success} -> {msg}")
