import time
import logging
from typing import Optional, Tuple, Dict, Any, List

import cv2
import numpy as np

logger = logging.getLogger("matrixcapture.capture_card")

class CaptureCardService:
    def __init__(self):
        self._last_frame: Optional[bytes] = None
        self._last_devices_ts: float = 0
        self._cached_devices: List[Dict[str, Any]] = []
        self._cached_cards: List[Dict[str, Any]] = []

    def list_video_sources(self, force_refresh: bool = False) -> Dict[str, Any]:
        now = time.time()
        if not force_refresh and (now - self._last_devices_ts < 5.0) and self._cached_devices:
            return {
                "devices": self._cached_devices,
                "capture_cards": self._cached_cards,
                "has_capture_card": len(self._cached_cards) > 0,
                "preferred_index": self._cached_cards[0]["index"] if self._cached_cards else (0 if self._cached_devices else None)
            }

        devices = []
        try:
            import comtypes
            comtypes.CoInitialize()
            try:
                from pygrabber.dshow_graph import FilterGraph
                names = FilterGraph().get_input_devices()
                for idx, name in enumerate(names):
                    is_card = any(k in name.lower() for k in ["usb3 video", "capture", "cam link", "hdmi", "uvc video", "elgato", "avermedia"])
                    devices.append({
                        "index": idx,
                        "name": name,
                        "is_capture_card": is_card
                    })
            finally:
                comtypes.CoUninitialize()
        except Exception as e:
            logger.warning(f"FilterGraph enumeration note: {e}")
            # Fallback direct detection
            devices = [{"index": 0, "name": "USB3 Video (DirectShow)", "is_capture_card": True}]

        self._cached_devices = devices
        self._cached_cards = [d for d in devices if d.get("is_capture_card")]
        self._last_devices_ts = now

        return {
            "devices": devices,
            "capture_cards": self._cached_cards,
            "has_capture_card": len(self._cached_cards) > 0,
            "preferred_index": self._cached_cards[0]["index"] if self._cached_cards else (0 if devices else None)
        }

    def get_capture_card_device(self) -> Tuple[Optional[int], Optional[str]]:
        info = self.list_video_sources()
        if info["capture_cards"]:
            card = info["capture_cards"][0]
            return card["index"], card["name"]
        return None, None

    def grab_frame(self, device_index: Optional[int] = None, quality: int = 80, max_dim: int = 1280) -> Tuple[Optional[bytes], Dict[str, Any]]:
        target_idx, name = (device_index, f"Device #{device_index}") if device_index is not None else self.get_capture_card_device()
        if target_idx is None:
            return None, {"status": "not_found", "error": "No capture card detected"}

        cap = None
        try:
            cap = cv2.VideoCapture(target_idx, cv2.CAP_DSHOW)
            if cap and cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
                ret, frame = cap.read()
                if ret and frame is not None and frame.size > 0:
                    mean_lum = float(np.mean(frame))
                    if mean_lum > 1.0: # Valid non-black frame
                        h, w = frame.shape[:2]
                        if max_dim and max(h, w) > max_dim:
                            scale = max_dim / float(max(h, w))
                            frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
                        jpg_bytes = buf.tobytes()
                        self._last_frame = jpg_bytes
                        return jpg_bytes, {
                            "status": "ok",
                            "source": "capture_card",
                            "device_name": name,
                            "resolution": f"{w}x{h}",
                            "mean_luminance": round(mean_lum, 1)
                        }
        except Exception as e:
            logger.debug(f"Capture attempt failed with CAP_DSHOW: {e}")
        finally:
            if cap and cap.isOpened():
                cap.release()

        # Device is busy (e.g. Windows Camera app holds exclusive lock)
        return None, {
            "status": "busy",
            "device_name": name,
            "error": f"Capture card '{name}' is in use by another application (e.g. Windows Camera app)."
        }

    def create_hud_standby_frame(self, title: str = "DESKTOP MODE STANDBY", subtitle: str = "", hint: str = "") -> bytes:
        img = np.zeros((720, 1280, 3), dtype=np.uint8)
        img[:] = (22, 17, 13) # Dark background #0d1116

        # Outer card frame
        cv2.rectangle(img, (24, 24), (1256, 696), (61, 54, 48), 2)
        # Top banner
        cv2.rectangle(img, (24, 24), (1256, 76), (34, 27, 22), -1)
        cv2.circle(img, (50, 50), 6, (0, 255, 157), -1)
        cv2.putText(img, "MATRIX CAPTURE STUDIO  ·  LIVE DESKTOP MONITOR", (68, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 157), 2)

        # Center Status Warning Card
        cv2.rectangle(img, (160, 200), (1120, 520), (30, 24, 20), -1)
        cv2.rectangle(img, (160, 200), (1120, 520), (88, 166, 255), 1)

        # Title
        cv2.putText(img, title, (190, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.90, (255, 255, 255), 2)
        # Subtitle
        if subtitle:
            cv2.putText(img, subtitle, (190, 330), cv2.FONT_HERSHEY_SIMPLEX, 0.70, (65, 179, 227), 2)
        # Hint
        if hint:
            cv2.putText(img, hint, (190, 390), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)

        # Instructions pill
        cv2.rectangle(img, (190, 440), (1090, 485), (40, 35, 30), -1)
        cv2.putText(img, "TIP: Close Windows Camera app so Matrix Capture can access the capture card directly.", (205, 468), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 255, 157), 1)

        # Gutter guides
        cv2.putText(img, "▲ TOP GUTTER: Line #1", (36, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 157), 1)
        cv2.putText(img, "▼ BOTTOM GUTTER: Line #47", (36, 675), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 157), 1)

        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buf.tobytes()

capture_card_mgr = CaptureCardService()
