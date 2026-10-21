import pytest
import asyncio
from unittest.mock import AsyncMock, patch
import numpy as np

from classifiers.editor_classifiers import MarkdownFullScreenClassifier
from classifiers.base import ClassifierContext
from classifiers.registry import classifier_registry
from services.adb_service import is_editor_full_screen


@pytest.mark.asyncio
async def test_markdown_fullscreen_classifier_registered():
    clf = classifier_registry.get_classifier("markdown_fullscreen")
    assert clf is not None
    assert clf.id == "markdown_fullscreen"
    assert "full screen" in clf.issue_description.lower()


@pytest.mark.asyncio
async def test_is_editor_full_screen_detection_fullscreen():
    mock_stdout = """
Display #9 (activities from top to bottom):
  * Task{8f240cd #321 type=standard A=10328:com.microsoft.teams U=0 visible=true visibleRequested=true mode=fullscreen translucent=false sz=1}
    bounds=[0,0][1920,1080]
    * Hist  #0: ActivityRecord{262956644 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t321}
"""
    with patch("services.adb_service.get_active_adb_serial", return_value="test-serial"), \
         patch("services.adb_service.detect_external_display_id", return_value=9), \
         patch("services.adb_service.get_display_dimensions", return_value=(1920, 1080)), \
         patch("services.adb_service.run_adb_shell", return_value={"status": "ok", "stdout": mock_stdout}):
        
        status = await is_editor_full_screen("test-serial", 9)
        assert status["is_fullscreen"] is True
        assert status["mode"] == "fullscreen"
        assert status["task_id"] == 321


@pytest.mark.asyncio
async def test_is_editor_full_screen_detection_freeform():
    mock_stdout = """
Display #9 (activities from top to bottom):
  * Task{8f240cd #321 type=standard A=10328:com.microsoft.teams U=0 visible=true visibleRequested=true mode=freeform translucent=false sz=1}
    bounds=[100,100][1200,800]
    * Hist  #0: ActivityRecord{262956644 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t321}
"""
    with patch("services.adb_service.get_active_adb_serial", return_value="test-serial"), \
         patch("services.adb_service.detect_external_display_id", return_value=9), \
         patch("services.adb_service.get_display_dimensions", return_value=(1920, 1080)), \
         patch("services.adb_service.run_adb_shell", return_value={"status": "ok", "stdout": mock_stdout}):
        
        status = await is_editor_full_screen("test-serial", 9)
        assert status["is_fullscreen"] is False
        assert status["mode"] == "freeform"
        assert status["task_id"] == 321
        assert "freeform window mode" in status["reason"]

        clf = MarkdownFullScreenClassifier()
        ctx = ClassifierContext(serial="test-serial", display_id=9)
        res = await clf.detect(ctx)
        assert res.issue_detected is True
        assert res.classifier_id == "markdown_fullscreen"


@pytest.mark.asyncio
async def test_is_editor_full_screen_detection_small_bounds():
    mock_stdout = """
Display #9 (activities from top to bottom):
  * Task{8f240cd #321 type=standard A=10328:com.microsoft.teams U=0 visible=true visibleRequested=true mode=fullscreen translucent=false sz=1}
    mBounds=Rect(300, 200 - 1400, 800)
    * Hist  #0: ActivityRecord{262956644 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t321}
"""
    with patch("services.adb_service.get_active_adb_serial", return_value="test-serial"), \
         patch("services.adb_service.detect_external_display_id", return_value=9), \
         patch("services.adb_service.get_display_dimensions", return_value=(1920, 1080)), \
         patch("services.adb_service.run_adb_shell", return_value={"status": "ok", "stdout": mock_stdout}):
        
        status = await is_editor_full_screen("test-serial", 9)
        assert status["is_fullscreen"] is False
        assert "smaller than display viewport" in status["reason"]


@pytest.mark.asyncio
async def test_markdown_fullscreen_fix():
    clf = MarkdownFullScreenClassifier()
    ctx = ClassifierContext(serial="test-serial", display_id=9)

    with patch("classifiers.editor_classifiers.get_active_adb_serial", return_value="test-serial"), \
         patch("classifiers.editor_classifiers.detect_external_display_id", return_value=9), \
         patch("classifiers.editor_classifiers.auto_fix_viewport", return_value={"status": "ok", "is_fullscreen": True}):
        
        fix_res = await clf.fix(ctx)
        assert fix_res.success is True
        assert len(fix_res.actions_taken) > 0


@pytest.mark.asyncio
async def test_is_editor_full_screen_top_resumed_priority_over_background_task():
    # Background task t53 has freeform floating bounds, but foreground topResumedActivity is t62 with full desktop bounds
    mock_stdout = """
Display #4 (activities from top to bottom):
  * Task{e45a259 #59 name=Desk type=undefined U=0 visible=true visibleRequested=true mode=freeform translucent=true sz=5}
    * Task{605e102 #62 type=standard A=10328:com.microsoft.teams U=0 rootTaskId=59 visible=true visibleRequested=true mode=freeform translucent=false sz=1}
      mBounds=Rect(0, 39 - 1920, 1003)
      topResumedActivity=ActivityRecord{194478850 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t62}
      * Hist  #0: ActivityRecord{194478850 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t62}
    * Task{1122334 #53 type=standard A=10328:com.microsoft.teams U=0 rootTaskId=59 visible=false mode=freeform sz=1}
      mBounds=Rect(453, 159 - 1835, 936)
      * Hist  #0: ActivityRecord{193579778 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t53}
"""
    with patch("services.adb_service.get_active_adb_serial", return_value="test-serial"), \
         patch("services.adb_service.detect_external_display_id", return_value=4), \
         patch("services.adb_service.get_display_dimensions", return_value=(1920, 1080)), \
         patch("services.adb_service.run_adb_shell", return_value={"status": "ok", "stdout": mock_stdout}):
        
        status = await is_editor_full_screen("test-serial", 4)
        assert status["is_fullscreen"] is True
        assert status["task_id"] == 62
        assert status["bounds"] == [0, 39, 1920, 1003]


@pytest.mark.asyncio
async def test_is_editor_full_screen_keyboard_visible_not_flagged_as_freeform():
    # When soft keyboard is visible, height is compressed (e.g. 600px), but width is full 1920
    mock_stdout = """
Display #4 (activities from top to bottom):
  * Task{e45a259 #59 name=Desk type=undefined U=0 visible=true visibleRequested=true mode=freeform translucent=true sz=5}
    * Task{605e102 #62 type=standard A=10328:com.microsoft.teams U=0 rootTaskId=59 visible=true visibleRequested=true mode=freeform translucent=false sz=1}
      mBounds=Rect(0, 39 - 1920, 650)
      topResumedActivity=ActivityRecord{194478850 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t62}
      * Hist  #0: ActivityRecord{194478850 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t62}
"""
    with patch("services.adb_service.get_active_adb_serial", return_value="test-serial"), \
         patch("services.adb_service.detect_external_display_id", return_value=4), \
         patch("services.adb_service.get_display_dimensions", return_value=(1920, 1080)), \
         patch("services.adb_service.is_ime_visible", return_value=True), \
         patch("services.adb_service.run_adb_shell", return_value={"status": "ok", "stdout": mock_stdout}):
        
        status = await is_editor_full_screen("test-serial", 4)
        assert status["is_fullscreen"] is True
        assert status["task_id"] == 62

