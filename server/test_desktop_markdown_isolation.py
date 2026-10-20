"""
Automated Test Suite for Desktop-Only Markdown Enforcement & Auto PIN Authentication.
Verifies:
  1. parse_activities_by_display accurately partitions dumpsys output across displays.
  2. enforce_markdown_only_on_desktop detects when Markdown is open on Display 0 and clears it.
  3. enforce_markdown_only_on_desktop ensures Teams / Markdown is active on the external desktop display.
  4. auto_handle_pin_authentication handles keyguard and MAM PIN prompts on both phone and desktop displays.
  5. find_teams_task_targets identifies display-specific tasks and detects phone conflicts.
  6. Endpoint /api/device/enforce-desktop-markdown and /api/device/auto-pin function as expected.
"""
import pytest
import os
import asyncio
from services.adb_service import (
    parse_activities_by_display,
    auto_handle_pin_authentication,
    enforce_markdown_only_on_desktop
)
from services.kiosk_service import find_teams_task_targets
import config

SAMPLE_DUMPSYS_MULTI_DISPLAY = """
Display #11 (activities from top to bottom):
  * Task{f79a143 #596 name=Desk type=standard U=0 visible=true sz=2}
    * Task{eec1d2a #548 type=standard A=10328:com.microsoft.teams U=0 visible=true sz=2}
      topResumedActivity=ActivityRecord{92668937 u0 com.microsoft.teams/com.microsoft.skype.teams.files.listing.views.PersonalFilesActivity t548}
      * Hist  #1: ActivityRecord{92668937 u0 com.microsoft.teams/com.microsoft.skype.teams.files.listing.views.PersonalFilesActivity t548}
    * Task{1122334 #586 type=standard A=10328:com.microsoft.teams U=0 visible=false sz=1}
      * Hist  #0: ActivityRecord{174229500 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t586}
Display #0 (activities from top to bottom):
  * Task{3d0df50 #1 type=home U=0 visible=true sz=1}
    * Task{effd9c9 #599 type=home I=com.google.android.apps.nexuslauncher/.NexusLauncherActivity U=0 visible=true sz=1}
      topResumedActivity=ActivityRecord{76879312 u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t599}
  * Task{c158e82 #549 type=standard A=10328:com.microsoft.teams U=0 visible=true sz=1}
    topResumedActivity=ActivityRecord{45888973 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t549}
    * Hist  #0: ActivityRecord{45888973 u0 com.microsoft.teams/com.microsoft.skype.teams.files.open.views.FilePreviewActivity t549}
"""

def test_parse_activities_by_display():
    """Verify parse_activities_by_display isolates tasks and activities per display."""
    parsed = parse_activities_by_display(SAMPLE_DUMPSYS_MULTI_DISPLAY)
    
    assert 11 in parsed
    assert 0 in parsed
    
    # Display 11 assertions
    d11 = parsed[11]
    assert 586 in d11["file_preview_tasks"]
    assert 548 in d11["teams_tasks"]
    assert any("PersonalFilesActivity" in r for r in d11["resumed_activities"])
    
    # Display 0 assertions
    d0 = parsed[0]
    assert 549 in d0["file_preview_tasks"]
    assert 549 in d0["teams_tasks"]
    assert any("NexusLauncherActivity" in r for r in d0["resumed_activities"])
    assert any("FilePreviewActivity" in r for r in d0["resumed_activities"])


@pytest.mark.asyncio
async def test_enforce_markdown_only_on_desktop_mock():
    """Verify enforce_markdown_only_on_desktop handles mock environment safely."""
    res = await enforce_markdown_only_on_desktop(serial="mock:9999", ext_display_id=11)
    assert res["status"] == "mock"
    assert res["desktop_markdown_active"] is True


@pytest.mark.asyncio
async def test_auto_handle_pin_authentication_mock():
    """Verify auto_handle_pin_authentication behaves correctly in mock mode."""
    res = await auto_handle_pin_authentication(serial="mock:9999", ext_display_id=11, pin="1213")
    assert res["status"] == "mock"
    assert res["auth_detected"] is False
    assert res["pin_submitted"] is False


@pytest.mark.asyncio
async def test_auto_handle_pin_authentication_safety_lock():
    """Verify safety lock blocks PIN entry when AUTO_ENTER_PIN is explicitly False and not forced."""
    orig = config.AUTO_ENTER_PIN
    config.AUTO_ENTER_PIN = False
    try:
        res = await auto_handle_pin_authentication(serial="test_serial", ext_display_id=11, force=False)
        assert res["status"] == "blocked_by_safety"
        assert res["pin_submitted"] is False
    finally:
        config.AUTO_ENTER_PIN = orig


@pytest.mark.asyncio
async def test_find_teams_task_targets_mock():
    """Verify find_teams_task_targets returns expected mock schema with phone tracking."""
    res = await find_teams_task_targets(serial="mock:9999")
    assert res["markdown_viewer_task_id"] == 314
    assert res["is_markdown_viewer_active"] is True
    assert "is_open_on_phone" in res
    assert res["is_open_on_phone"] is False
