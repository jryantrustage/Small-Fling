import pytest
import time
from unittest.mock import AsyncMock, patch, MagicMock
from PIL import Image
import numpy as np

from services.ocr_service import preprocess_frame_for_ocr
from services.adb_service import (
    detect_external_display_id,
    dispatch_accelerated_viewport_step,
    _cached_external_display_id
)
from services.performance_analyzer import (
    format_duration_min_sec,
    analyze_dag2_performance_report
)


def test_format_duration_min_sec():
    assert format_duration_min_sec(500) == "0s 500ms"
    assert format_duration_min_sec(1850) == "1s 850ms"
    assert format_duration_min_sec(65400) == "1m 05s 400ms"
    assert format_duration_min_sec(122340) == "2m 02s 340ms"


def test_preprocess_frame_for_ocr_roi_and_contrast():
    # 1080p desktop editor image (1920x1080)
    img_data = np.zeros((1080, 1920, 3), dtype=np.uint8)
    pil_img = Image.fromarray(img_data)

    processed = preprocess_frame_for_ocr(pil_img, roi_crop=True)
    w, h = processed.size

    # Must be cropped to exclude header toolbar (y: 0..160) and dock (y > 1040)
    assert w <= 1400
    assert h < 1080
    assert h >= 400


@pytest.mark.asyncio
async def test_detect_external_display_id_caching():
    _cached_external_display_id.clear()
    serial = "test-serial-cache"

    with patch("services.adb_service.get_active_adb_serial", return_value=serial), \
         patch("services.adb_service.run_adb_shell", new_callable=AsyncMock) as mock_shell:
        
        mock_shell.return_value = {
            "status": "ok",
            "stdout": "DisplayViewport{type=EXTERNAL displayId=9 valid=true}"
        }

        # First call: invokes shell
        d1 = await detect_external_display_id(serial)
        assert d1 == 9
        assert mock_shell.call_count >= 1

        # Second call: must use cache without calling dumpsys display again
        prev_calls = mock_shell.call_count
        d2 = await detect_external_display_id(serial)
        assert d2 == 9
        assert mock_shell.call_count == prev_calls


@pytest.mark.asyncio
async def test_dispatch_accelerated_viewport_step_single_batched_command():
    serial = "test-serial-accel"

    with patch("services.adb_service.get_active_adb_serial", return_value=serial), \
         patch("services.adb_service.detect_external_display_id", return_value=9), \
         patch("services.adb_service.run_adb_shell", new_callable=AsyncMock) as mock_shell:
        
        mock_shell.return_value = {"status": "ok", "stdout": ""}

        # Test PageDown when explicitly requested
        res_pagedown = await dispatch_accelerated_viewport_step(
            delta_lines=50,
            serial=serial,
            display_id=9,
            method="pagedown"
        )
        assert res_pagedown["status"] == "ok"
        assert res_pagedown["method"] == "pagedown"
        cmd = res_pagedown["command"]
        assert "keyevent 93" in cmd

        # Test Tracked Arrow Down (keycode 20)
        res_batched = await dispatch_accelerated_viewport_step(
            delta_lines=10,
            serial=serial,
            display_id=9,
            method="arrow_down"
        )
        assert res_batched["status"] == "ok"
        assert res_batched["method"] == "arrow_down"
        cmd2 = res_batched["command"]
        # Exactly 10 arrow-down keyevents (20) in a single shell invocation
        assert "20 20 20 20 20 20 20 20 20 20" in cmd2


def test_performance_analyzer_improving_trend():
    # Report with improving baseline progression
    rep = analyze_dag2_performance_report()
    summary = rep["summary"]

    assert summary["total_loops"] >= 2
    assert "IMPROVING" in summary["trend"]
    assert "ms" in summary["average_loop_formatted"]

    # Verify consecutive loops improve in duration
    durations = [l["duration_ms"] for l in rep["loops"]]
    assert len(durations) >= 2
    for i in range(1, len(durations)):
        assert durations[i] <= durations[i-1]
