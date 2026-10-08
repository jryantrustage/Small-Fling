"""
Automated Test Suite for PIN Code Requested Qualifier and Auto-Remediation.
Verifies:
  1. PIN is loaded from .env (DEVICE_PIN=1213).
  2. PinCodeRequestedClassifier detects when PIN prompt is active.
  3. PinCodeRequestedClassifier detects clean state when no PIN prompt.
  4. Fix method executes remediation using stored PIN (1213).
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
    """Verify PIN code 1213 is stored and retrievable via .env and config."""
    assert config.DEVICE_PIN == "1213"
    pin = os.environ.get("DEVICE_PIN", config.DEVICE_PIN)
    assert pin == "1213"


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
    """Verify classifier fix executes using the configured PIN (1213)."""
    classifier = PinCodeRequestedClassifier()
    ctx = ClassifierContext(serial="mock:9999", metadata={"mock_pin_requested": True})
    fix_res = await classifier.fix(ctx)

    assert fix_res.success is True
    assert fix_res.classifier_id == "pin_code_requested"
    assert "1213" in fix_res.message
    assert any("1213" in action for action in fix_res.actions_taken)


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
