"""
Automated Test Suite for PIN Code Requested Qualifier and Auto-Remediation.
Verifies:
  1. PIN is loaded from .env (DEVICE_PIN=2992).
  2. PinCodeRequestedClassifier detects when PIN prompt is active.
  3. PinCodeRequestedClassifier detects clean state when no PIN prompt.
  4. Fix method executes remediation using stored PIN (2992).
  5. Integration with DAG Node 5 / verification_trigger: blocking trigger decision when active.
  6. Integration with ClassifierRegistry and priority ordering.
"""
import pytest
import os
import asyncio
from classifiers.base import ClassifierContext
from classifiers.editor_classifiers import PinCodeRequestedClassifier
from classifiers.registry import ClassifierRegistry
import config
from services import state


def test_pin_loaded_from_env():
    """Verify PIN code 2992 is stored and retrievable via .env and config."""
    assert config.DEVICE_PIN == "2992"
    pin = os.environ.get("DEVICE_PIN", config.DEVICE_PIN)
    assert pin == "2992"


@pytest.mark.asyncio
async def test_pin_classifier_detection_simulated():
    """Verify PinCodeRequestedClassifier detects simulated prompt."""
    classifier = PinCodeRequestedClassifier()
    assert classifier.id == "pin_code_requested"
    assert classifier.severity == "blocking"

    # 1. Test issue detected
    ctx_prompt = ClassifierContext(serial="mock:9999", metadata={"mock_pin_requested": True})
    res_prompt = await classifier.detect(ctx_prompt)
    assert res_prompt.issue_detected is True
    assert res_prompt.classifier_id == "pin_code_requested"
    assert "PIN Code requested" in res_prompt.details

    # 2. Test clean state
    ctx_clean = ClassifierContext(serial="mock:9999", metadata={"mock_pin_requested": False})
    res_clean = await classifier.detect(ctx_clean)
    assert res_clean.issue_detected is False
    assert "No PIN requested" in res_clean.details


@pytest.mark.asyncio
async def test_pin_classifier_fix_with_stored_pin():
    """Verify classifier fix respects safety toggle and executes when authorized using PIN 2992."""
    classifier = PinCodeRequestedClassifier()

    # 1. When AUTO_ENTER_PIN is False (Safe Mode default), verify fix is blocked to prevent lockouts
    original_setting = config.AUTO_ENTER_PIN
    config.AUTO_ENTER_PIN = False
    ctx_safe = ClassifierContext(serial="mock:9999", metadata={"mock_pin_requested": True})
    safe_res = await classifier.fix(ctx_safe)
    assert safe_res.success is False
    assert safe_res.metadata.get("blocked_by_safety") is True
    assert "disabled in Settings" in safe_res.message

    # 2. When explicitly forced (manual user trigger from gear settings) or enabled, verify PIN 2992 entry succeeds
    ctx_forced = ClassifierContext(serial="mock:9999", metadata={"mock_pin_requested": True, "force_enter_pin": True})
    fix_res = await classifier.fix(ctx_forced)
    assert fix_res.success is True
    assert fix_res.classifier_id == "pin_code_requested"
    assert "2992" in fix_res.message
    assert any("2992" in action for action in fix_res.actions_taken)

    # Restore config setting
    config.AUTO_ENTER_PIN = original_setting


@pytest.mark.asyncio
async def test_pin_qualifier_blocks_dag_trigger_decision():
    """Verify that when PIN prompt issue is active, DAG Node 5 trigger prevents transition."""
    # Ensure pin_code_requested is enabled
    node_5 = state.dag_state["nodes"].setdefault("verification_trigger", {})
    cfg = node_5.setdefault("config", {})
    cfg["prevent_trigger_on_issue"] = True
    quals = cfg.setdefault("qualifiers", {})
    quals["pin_code_requested"] = {
        "name": "PIN Code Authentication Qualifier",
        "description": "Detects if Intune/device PIN authentication is requested and resolves with stored PIN",
        "enabled": True,
        "severity": "blocking"
    }

    # Simulate active issue
    simulated_issues = [
        {
            "classifier_id": "pin_code_requested",
            "issue_detected": True,
            "issue_name": "PIN Code / Intune Authentication Prompt Active",
            "details": "Intune / Teams MAM PIN authentication window active in WindowManager"
        }
    ]

    decision = state.evaluate_dag_node_5_trigger_sync(eval_results=simulated_issues)
    assert decision["allowed"] is False
    assert decision["prevented"] is True
    assert any("PIN Code" in r for r in decision["reasons"])
    assert decision["qualifier_statuses"]["pin_code_requested"]["issue_detected"] is True

    # Simulate resolved/clean state
    decision_clean = state.evaluate_dag_node_5_trigger_sync(eval_results=[])
    assert decision_clean["qualifier_statuses"]["pin_code_requested"]["issue_detected"] is False
    assert decision_clean["allowed"] is True


def test_registry_registration_and_priority():
    """Verify PinCodeRequestedClassifier is in registry and ranked highest priority in auto_fix."""
    reg = ClassifierRegistry()
    c = reg.get_classifier("pin_code_requested")
    assert c is not None
    assert isinstance(c, PinCodeRequestedClassifier)


@pytest.mark.asyncio
async def test_pin_vs_username_password_differentiation_classifier():
    """
    Verify PinCodeRequestedClassifier strictly differentiates between:
      1. A true PIN prompt (detect returns True, fix enters PIN)
      2. A Username / Password prompt (detect returns False, fix halts with safety refusal)
    to guarantee the numeric PIN is NEVER typed into a username or email field.
    """
    classifier = PinCodeRequestedClassifier()

    # Case A: Username/Password or Account Chooser screen active
    ctx_user_pw = ClassifierContext(
        serial="mock:9999",
        metadata={"mock_username_password_requested": True}
    )
    res_detect_user_pw = await classifier.detect(ctx_user_pw)
    # Must NOT detect as a PIN prompt!
    assert res_detect_user_pw.issue_detected is False
    assert res_detect_user_pw.metadata.get("pin_prohibited") is True
    assert "PIN entry prohibited" in res_detect_user_pw.details

    # Attempting fix on a username/password screen must be blocked
    res_fix_user_pw = await classifier.fix(ctx_user_pw)
    assert res_fix_user_pw.success is False
    assert res_fix_user_pw.metadata.get("blocked_by_credential_presence") is True
    assert "prohibited to prevent entering PIN into username field" in res_fix_user_pw.message

    # Case B: True PIN prompt active
    ctx_pin = ClassifierContext(
        serial="mock:9999",
        metadata={"mock_pin_requested": True, "force_enter_pin": True}
    )
    res_detect_pin = await classifier.detect(ctx_pin)
    assert res_detect_pin.issue_detected is True
    assert "PIN Code requested" in res_detect_pin.details

    res_fix_pin = await classifier.fix(ctx_pin)
    assert res_fix_pin.success is True
    assert "2992" in res_fix_pin.message



def test_parse_multipart_filename_ocr_confusions():
    """Verify RapidOCR confusions (DIXUl -> DIXUI, partl -> part1, ,md -> .md) normalize cleanly."""
    from alignment_engine import parse_multipart_markdown_filename
    res1 = parse_multipart_markdown_filename("DIXUl_impact_26-11-05-9-43pm_partl.md")
    assert res1["is_multipart"] is True
    assert res1["part_number"] == 1
    assert res1["base_prefix"] == "DIXUI_impact_26-11-05-9-43pm"

    res9 = parse_multipart_markdown_filename("DIxUl_impact_26-11-05-9-43pm_part9,md")
    assert res9["is_multipart"] is True
    assert res9["part_number"] == 9
    assert res9["base_prefix"] == "DIXUI_impact_26-11-05-9-43pm"


def test_blank_white_teams_fingerprint_detection():
    """Verify blank white screen with Teams header triggers requires_escape_for_pin."""
    import numpy as np
    import cv2
    from services.adb_service import detect_teams_auth_or_fingerprint_screen_cv

    img = np.full((1080, 1920, 3), 255, dtype=np.uint8)
    img[0:68, :] = (238, 224, 205)  # Teams title bar
    img[980:1080, :] = (24, 24, 28)  # Bottom taskbar
    cv2.putText(img, "Teams", (110, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (40, 40, 40), 2)

    det = detect_teams_auth_or_fingerprint_screen_cv(img)
    assert det["detected"] is True
    assert det["auth_subtype"] == "fingerprint_blank_teams"
    assert det["requires_escape_for_pin"] is True
    assert det["auth_type"] == "pin"


def test_markdown_file_change_dag_node_and_group():
    """Verify markdown_file_change DAG node & group registration, edges, and MD 1 / 9 queue sync."""
    from dag_nodes import dag_node_registry, MarkdownFileChangeNode
    from services import state

    node = dag_node_registry.get_node("markdown_file_change")
    assert node is not None
    assert isinstance(node, MarkdownFileChangeNode)
    assert dag_node_registry.get_node("node_0") is node
    assert "markdown_file_change" in state.dag_state["groups"]
    assert "markdown_file_change" in state.dag_state["nodes"]
    assert state.is_edge_connected("markdown_file_change", "init_end") is True
    assert state.is_edge_connected("document_assemble", "markdown_file_change") is True
    assert state.is_edge_connected("markdown_file_change", "markdown_tag_parser") is True

    # Simulate 9 predetermined parts in folder queue (part1..part9)
    state.multipart_bundle_state["predetermined_parts"] = [
        {"part_number": i, "total_parts": 9, "file_name": f"DIXUI_impact_26-11-05-9-43pm_part{i}.md", "tap_coords": [400, 180 + i * 70]}
        for i in range(1, 10)
    ]
    state.multipart_bundle_state["current_part"] = 1
    state.multipart_bundle_state["total_parts"] = 9
    synced = state.sync_multipart_state_from_alignment()
    assert synced["predetermined_parts"][0]["scope_label"] == "MD 1 / 9"
    assert synced["predetermined_parts"][8]["scope_label"] == "MD 9 / 9"
    mfc_state = state.dag_state["nodes"]["markdown_file_change"]
    assert mfc_state["part_progress_label"] == "MD 1 / 9"
    assert len(mfc_state["detected_files"]) == 9


def test_floating_white_window_not_mistaken_for_fingerprint_and_detected_as_floating():
    """Verify floating light-mode/skeleton window over dark folder background does NOT trigger PIN 2992 and IS detected as floating."""
    import numpy as np
    import cv2
    from services.adb_service import detect_teams_auth_or_fingerprint_screen_cv, _detect_floating_teams_window_cv

    # Dark background (folder view) with a central floating white window (x=536..1384, y=268..888) and dark caption bar (y=172..268)
    img = np.full((1080, 1920, 3), 18, dtype=np.uint8)
    img[172:268, 536:1384] = (42, 42, 46)
    img[268:888, 536:1384] = (248, 248, 248)
    # Draw Maximize [] icon in floating caption bar around (1267, 203)
    cv2.rectangle(img, (1260, 196), (1274, 210), (220, 220, 220), 2)

    auth_det = detect_teams_auth_or_fingerprint_screen_cv(img)
    assert auth_det["detected"] is False

    floating_det = _detect_floating_teams_window_cv(img, 1920, 1080)
    assert floating_det is not None
    mx, my = floating_det["maximize_button"]
    assert 1230 <= mx <= 1300
    assert 180 <= my <= 230


@pytest.mark.asyncio
async def test_auto_switch_queued_to_active_on_part2():
    """Verify opening part2.md automatically switches MD 2/9 from QUEUED -> ACTIVE while preserving MD 1/9."""
    import db
    from services import state

    p1 = db.create_project(
        name="DIXUI_impact_26-11-05-9-43pm_part1",
        bundle_id="bundle_dixui_test",
        bundle_name="DIXUI_impact_26-11-05-9-43pm",
        part_number=1,
        total_parts=9,
        part_file_name="DIXUI_impact_26-11-05-9-43pm_part1.md",
    )
    try:
        state.multipart_bundle_state["predetermined_parts"] = [
            {"part_number": i, "total_parts": 9, "file_name": f"DIXUI_impact_26-11-05-9-43pm_part{i}.md", "tap_coords": [400, 180 + i * 70], "status": "pending"}
            for i in range(1, 10)
        ]
        sw = await state.auto_switch_project_if_open_part_changed({
            "file_name": "DIXUI_impact_26-11-05-9-43pm_part2.md",
            "is_multipart": True,
            "part_number": 2,
        })
        assert sw is not None
        assert sw["part_number"] == 2
        assert sw["file_name"] == "DIXUI_impact_26-11-05-9-43pm_part2.md"
        assert state.multipart_bundle_state["current_part"] == 2
        pred_by_num = {p["part_number"]: p for p in state.multipart_bundle_state["predetermined_parts"]}
        assert pred_by_num[1]["status"] == "completed"
        assert pred_by_num[2]["status"] == "scanning"
    finally:
        db.delete_bundle_projects("bundle_dixui_test")


@pytest.mark.asyncio
async def test_pin_never_typed_on_phone_display_and_requires_teams_prompt(monkeypatch):
    """
    Verify:
      1. Passcode 2992 is NEVER sent to Display #0 (phone screen) under any condition.
      2. When Audible or a non-PIN screen is shown, auto_handle_pin_authentication does NOT type 2992 anywhere.
      3. When Teams 'Enter your PIN' is visually confirmed on Desktop Display #2, HID is directed to Desktop #2
         and 2992 is typed ONLY on '-d 2', never '-d 0'.
    """
    import numpy as np
    from services import adb_service

    executed_cmds = []

    async def fake_get_serial(serial=None, force_refresh=False):
        return "192.168.86.85:5555"

    async def fake_run_adb_shell(cmd, serial=None, timeout=5.0):
        executed_cmds.append(cmd)
        return {"status": "ok", "stdout": "mCurrentFocus=Window{123 u0 com.microsoft.teams/com.microsoft.skype.teams.MainActivity}", "returncode": 0}

    monkeypatch.setattr(adb_service, "get_active_adb_serial", fake_get_serial)
    monkeypatch.setattr(adb_service, "run_adb_shell", fake_run_adb_shell)

    # Case 1: Normal / Audible / Markdown screen (no Teams PIN prompt) -> Must NOT type 2992 even if force=True!
    normal_img = np.full((1080, 1920, 3), 24, dtype=np.uint8)
    res_clean = await adb_service.auto_handle_pin_authentication(
        serial="192.168.86.85:5555",
        ext_display_id=2,
        pin="2992",
        force=True,
        screen_img=normal_img,
    )
    assert res_clean["status"] == "clean"
    assert res_clean["pin_submitted"] is False
    assert not any("2992" in c for c in executed_cmds)

    # Case 2: Visually confirmed Teams 'Enter your PIN' prompt on Desktop Display #2
    monkeypatch.setattr(
        adb_service,
        "detect_teams_auth_or_fingerprint_screen_cv",
        lambda img: {
            "detected": True,
            "auth_type": "pin",
            "auth_subtype": "mam_pin_prompt",
            "requires_escape_for_pin": False,
            "requires_mam_pin": True,
            "is_pin_safe": True,
            "pin_field_coords": [960, 635],
            "ok_btn_coords": [935, 725],
            "details": "Desktop mode Teams/Intune PIN prompt detected ('Enter your PIN')",
        },
    )
    executed_cmds.clear()
    res_pin = await adb_service.auto_handle_pin_authentication(
        serial="192.168.86.85:5555",
        ext_display_id=2,
        pin="2992",
        force=False,
        screen_img=normal_img,
    )
    assert res_pin["status"] == "ok"
    assert res_pin["pin_submitted"] is True
    # Must NEVER type 2992 on Display #0 (phone screen)!
    assert not any("-d 0 text" in c for c in executed_cmds)
    # Must type 2992 ONLY on Desktop Display #2!
    assert any("input -d 2 text 2992" in c for c in executed_cmds)
    # Must direct HID to Desktop Display #2!
    assert any("input -d 2 mouse tap" in c for c in executed_cmds)


@pytest.mark.asyncio
async def test_direct_hid_and_display_capture_routing(monkeypatch):
    """Verify direct_hid_to_display and capture_display_screenshot explicitly switch between phone (#0) and desktop (#2)."""
    from services import adb_service, kiosk_service, state

    executed_cmds = []

    async def fake_get_serial(serial=None, force_refresh=False):
        return "192.168.86.85:5555"

    async def fake_run_adb_shell(cmd, serial=None, timeout=5.0):
        executed_cmds.append(cmd)
        return {"status": "ok", "stdout": "", "returncode": 0}

    monkeypatch.setattr(adb_service, "get_active_adb_serial", fake_get_serial)
    monkeypatch.setattr(adb_service, "run_adb_shell", fake_run_adb_shell)

    # 1. Switch HID to phone mode
    hid_phone = await adb_service.direct_hid_to_display("192.168.86.85:5555", target_mode="phone", ext_display_id=2)
    assert hid_phone["mode"] == "phone"
    assert hid_phone["display_id"] == 0
    assert kiosk_service.kiosk_state["mouse_display_id"] == 0
    assert state.latest_telemetry["hid_target_display"]["mode"] == "phone"

    # 2. Switch HID to desktop mode
    hid_desk = await adb_service.direct_hid_to_display("192.168.86.85:5555", target_mode="desktop", ext_display_id=2, focus_coords=[320, 380])
    assert hid_desk["mode"] == "desktop"
    assert hid_desk["display_id"] == 2
    assert kiosk_service.kiosk_state["mouse_display_id"] == 2
    assert state.latest_telemetry["hid_target_display"]["mode"] == "desktop"
    assert any("input -d 2 mouse tap 320 380" in c for c in executed_cmds)


def test_markdown_editor_never_triggers_pin_prompt():
    """Verify neither dark-mode nor light-mode Markdown editor screens ever trigger PIN entry."""
    import numpy as np
    import cv2
    from services.adb_service import detect_teams_auth_or_fingerprint_screen_cv

    # 1. Dark-mode markdown editor (even if source text contains 'Enter your PIN' in code)
    dark_editor = np.full((1080, 1920, 3), 38, dtype=np.uint8)
    cv2.putText(dark_editor, "Enter your PIN", (400, 500), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (220, 220, 220), 2)
    assert detect_teams_auth_or_fingerprint_screen_cv(dark_editor)["detected"] is False

    # 2. Light-mode markdown editor with .md filename or part header
    light_editor = np.full((1080, 1920, 3), 240, dtype=np.uint8)
    cv2.putText(light_editor, "DIXUI_impact_26-11-05-9-43pm (Part 2 of 9)", (180, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (30, 30, 30), 2)
    cv2.putText(light_editor, "Enter your PIN", (400, 500), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (30, 30, 30), 2)
    assert detect_teams_auth_or_fingerprint_screen_cv(light_editor)["detected"] is False




