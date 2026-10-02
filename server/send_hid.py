#!/usr/bin/env python3
"""
send_hid.py - CLI tool for dispatching HID input events to external Android desktop displays.
Supports click/tap, keyevent, key combinations (e.g. Ctrl+Home, Ctrl+End), and scroll bursts.
"""

import argparse
import subprocess
import sys
import time
from typing import Optional


def get_default_serial() -> str:
    """Finds the first connected ADB device serial."""
    try:
        out = subprocess.check_output(["adb", "devices"], text=True, timeout=3)
        lines = [l.split("\t")[0].strip() for l in out.strip().splitlines()[1:] if "\tdevice" in l]
        return lines[0] if lines else ""
    except Exception:
        return ""


def run_adb(cmd: str, serial: Optional[str] = None) -> bool:
    """Executes an adb shell command."""
    ser = serial or get_default_serial()
    if not ser:
        print("[send_hid] Error: No connected ADB device found", file=sys.stderr)
        return False
    try:
        subprocess.run(["adb", "-s", ser, "shell", cmd], check=True, timeout=5.0)
        return True
    except Exception as e:
        print(f"[send_hid] Command error: {e}", file=sys.stderr)
        return False


def detect_display(serial: Optional[str] = None) -> int:
    """Detects the external desktop display ID from dumpsys display."""
    ser = serial or get_default_serial()
    if not ser:
        return 0
    try:
        import re
        out = subprocess.check_output(["adb", "-s", ser, "shell", "dumpsys", "display"], text=True, timeout=3.0)
        m = re.search(r'DisplayViewport\{type=EXTERNAL.*?displayId=(\d+)', out)
        if m and int(m.group(1)) != 0:
            return int(m.group(1))
        for line in out.splitlines():
            if "EXTERNAL" in line:
                m2 = re.search(r'(?:mDisplayId|displayId)[= ]+(\d+)', line)
                if m2 and int(m2.group(1)) != 0:
                    return int(m2.group(1))
    except Exception:
        pass
    return 0


def main():
    parser = argparse.ArgumentParser(description="Dispatch HID events via ADB")
    parser.add_argument("--action", type=str, default="click", choices=["click", "tap", "key", "combo", "scroll"])
    parser.add_argument("--x", type=int, default=960, help="X coordinate for click/tap")
    parser.add_argument("--y", type=int, default=540, help="Y coordinate for click/tap")
    parser.add_argument("--key", type=int, default=20, help="Android keycode (e.g. 20 for down arrow)")
    parser.add_argument("--key1", type=int, default=113, help="First keycode in combination (e.g. 113 for Ctrl)")
    parser.add_argument("--key2", type=int, default=122, help="Second keycode in combination (e.g. 122 for Move Home)")
    parser.add_argument("--count", type=int, default=1, help="Repetition count for scroll/keyevent")
    parser.add_argument("--display", type=int, default=0, help="External display ID (0 for auto-detect)")
    parser.add_argument("--serial", type=str, default="", help="ADB device serial")
    parser.add_argument("--keep_keyboard_closed", action="store_true", default=True, help="Auto-suppress virtual keyboard after tap")

    args = parser.parse_args()
    ser = args.serial or get_default_serial()
    if args.display <= 0 or args.display == 135:
        detected = detect_display(ser)
        if detected > 0:
            args.display = detected

    if args.action in ("click", "tap"):
        cmd = f"input -d {args.display} tap {args.x} {args.y}" if args.display > 0 else f"input tap {args.x} {args.y}"
        success = run_adb(cmd, ser)
        if success and args.keep_keyboard_closed:
            time.sleep(0.1)
            # Dismiss virtual keyboard if tap triggered it, without sending Back (keyevent 4)
            run_adb("am broadcast -a com.matrixcapture.app.ACTION_CLOSE_KEYBOARD >/dev/null 2>&1", ser)
            run_adb(f"input -d {args.display} keyevent 111", ser)
        print(f"[send_hid] Click at ({args.x}, {args.y}) on display {args.display}: {'SUCCESS' if success else 'FAILED'}")
        sys.exit(0 if success else 1)

    elif args.action == "key":
        cmd = f"input -d {args.display} keyevent {args.key}" if args.display > 0 else f"input keyevent {args.key}"
        success = run_adb(cmd, ser)
        print(f"[send_hid] Keyevent {args.key}: {'SUCCESS' if success else 'FAILED'}")
        sys.exit(0 if success else 1)

    elif args.action == "scroll":
        # Constrained Key Bounds: strictly emit PageDown (93) or DownArrow (20) scancodes,
        # omitting mobile virtual keyboard toggle gestures entirely.
        if args.key not in (20, 93):
            print(f"[send_hid] Rejected scroll keycode {args.key}. Scoped strictly to DownArrow (20) or PageDown (93).", file=sys.stderr)
            sys.exit(1)
        keys = " ".join([str(args.key)] * args.count)
        cmd = f"input -d {args.display} keyevent {keys}" if args.display > 0 else f"input keyevent {keys}"
        success = run_adb(cmd, ser)
        print(f"[send_hid] Scroll {args.count}x (key {args.key}): {'SUCCESS' if success else 'FAILED'}")
        sys.exit(0 if success else 1)

    elif args.action == "combo":
        # Dispatches modifier combination (e.g. Ctrl + Home / End) via Android input keycombination
        # with duration flag to preserve modifier state
        cmds = []
        if args.display > 0:
            cmds.append(f"input -d {args.display} keycombination -t 150 {args.key1} {args.key2}")
        cmds.append(f"input keycombination -t 150 {args.key1} {args.key2}")
        cmd = "; ".join(cmds)
        success = run_adb(cmd, ser)
        print(f"[send_hid] Combo {args.key1}+{args.key2} on display {args.display}: {'SUCCESS' if success else 'FAILED'}")
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
