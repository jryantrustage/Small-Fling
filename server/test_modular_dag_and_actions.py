"""
Tests for Modular Standalone DAG Nodes, Decoupled Observation Actions, and Wireable Graph Execution.
"""

import pytest
from fastapi.testclient import TestClient
import main
from services import state
from dag_nodes import dag_node_registry, graph_executor, DagBlackboard
from observation_actions import observation_action_registry


def test_observation_actions_catalog_and_registry():
    with TestClient(main.app) as client:
        res = client.get("/api/dag/observation-actions")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        action_ids = [a["action_id"] for a in data["actions"]]
        
        # Verify all required action IDs are present
        assert "view_mode_to_edit_mode" in action_ids
        assert "light_mode_to_dark_mode" in action_ids
        assert "keyboard_detected_close" in action_ids
        assert "top_line_missing_detect" in action_ids
        assert "bottom_line_missing_detect" in action_ids
        assert "markdown_not_open_navigate_onedrive" in action_ids


def test_observation_actions_scan_and_remediate():
    with TestClient(main.app) as client:
        # 1. Scan
        res_scan = client.post("/api/dag/observation-actions/scan", json={"serial": "mock:9999"})
        assert res_scan.status_code == 200
        scan_data = res_scan.json()
        assert scan_data["status"] == "success"
        assert "total_checked" in scan_data
        assert scan_data["total_checked"] >= 6

        # 2. Remediate atomic action (close keyboard)
        res_rem = client.post("/api/dag/observation-actions/keyboard_detected_close/remediate", json={"serial": "mock:9999"})
        assert res_rem.status_code == 200
        rem_data = res_rem.json()
        assert rem_data["status"] == "success"
        assert rem_data["action_id"] == "keyboard_detected_close"


def test_node_canvas_positioning_and_clean_layout():
    with TestClient(main.app) as client:
        # 1. Patch position for a node
        res_pos = client.patch("/api/dag/nodes/frame_acquire/position", json={"x": 550.0, "y": 220.0})
        assert res_pos.status_code == 200
        assert res_pos.json()["position"] == {"x": 550.0, "y": 220.0}
        assert state.dag_state["nodes"]["frame_acquire"]["position"] == {"x": 550.0, "y": 220.0}

        # 2. Snap to clean layout
        res_clean = client.post("/api/dag/layout/clean")
        assert res_clean.status_code == 200
        assert res_clean.json()["status"] == "success"
        layout = res_clean.json()["layout"]
        assert layout["frame_acquire"] == {"x": 500.0, "y": 140.0}
        assert state.dag_state["nodes"]["frame_acquire"]["position"] == {"x": 500.0, "y": 140.0}


def test_node_attached_actions_binding():
    with TestClient(main.app) as client:
        custom_actions = ["keyboard_detected_close", "light_mode_to_dark_mode"]
        res = client.patch("/api/dag/nodes/init_end/actions", json={"attached_actions": custom_actions})
        assert res.status_code == 200
        assert res.json()["attached_actions"] == custom_actions
        assert state.dag_state["nodes"]["init_end"]["attached_actions"] == custom_actions

        node_inst = dag_node_registry.get_node("init_end")
        assert node_inst is not None
        assert node_inst.get_attached_actions() == custom_actions


def test_interactive_edge_wiring():
    with TestClient(main.app) as client:
        # 1. Add edge
        res_edge = client.post("/api/dag/edges", json={
            "from": "local_ai_ocr",
            "to": "arrow_down",
            "condition": "ON_SUCCESS"
        })
        assert res_edge.status_code == 200
        edge_id = res_edge.json()["edge"]["id"]
        assert any(e["id"] == edge_id for e in state.dag_state["edges"])

        # 2. Delete edge
        res_del = client.delete(f"/api/dag/edges/{edge_id}")
        assert res_del.status_code == 200
        assert not any(e["id"] == edge_id for e in state.dag_state["edges"])


@pytest.mark.asyncio
async def test_standalone_node_registry_and_blackboard():
    # Verify all 8 standalone DAG nodes are loaded
    nodes = dag_node_registry.list_nodes()
    expected = [
        "init_end", "reset_home", "frame_acquire", "local_ai_ocr",
        "frame_ocr", "arrow_down", "verification_trigger", "document_assemble"
    ]
    for exp in expected:
        assert exp in nodes
        assert nodes[exp].node_id == exp
        assert nodes[exp].title is not None
        assert isinstance(nodes[exp].get_position(), dict)

    # Test single node mock run
    bb = DagBlackboard(active_serial="mock:9999", top_line=1, bottom_line=24)
    res = await graph_executor.run_single_node("arrow_down", bb)
    assert res.status == "success"
    assert res.data["target_top_line"] == 25


def test_post_and_patch_node_actions_endpoint():
    with TestClient(main.app) as client:
        # Test POST /api/dag/nodes/{node_id}/actions
        post_actions = ["keyboard_detected_close", "light_mode_to_dark_mode"]
        res_post = client.post("/api/dag/nodes/frame_ocr/actions", json={"attached_actions": post_actions})
        assert res_post.status_code == 200
        assert res_post.json()["status"] == "success"
        assert res_post.json()["attached_actions"] == post_actions
        assert state.dag_state["nodes"]["frame_ocr"]["attached_actions"] == post_actions

        # Test PATCH /api/dag/nodes/{node_id}/actions
        patch_actions = ["keyboard_detected_close"]
        res_patch = client.patch("/api/dag/nodes/frame_ocr/actions", json={"attached_actions": patch_actions})
        assert res_patch.status_code == 200
        assert res_patch.json()["status"] == "success"
        assert res_patch.json()["attached_actions"] == patch_actions
        assert state.dag_state["nodes"]["frame_ocr"]["attached_actions"] == patch_actions


def test_patch_node_position_endpoint():
    with TestClient(main.app) as client:
        res = client.patch("/api/dag/nodes/init_end/position", json={"x": 123.5, "y": 567.8})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["position"] == {"x": 123.5, "y": 567.8}
        assert state.dag_state["nodes"]["init_end"]["position"] == {"x": 123.5, "y": 567.8}


def test_dag_blackboard_kinematics_and_frame_memory():
    bb = DagBlackboard(
        latest_frame_bytes=b"sample_frame_bytes",
        active_project={"id": "proj_123", "name": "Test Project"}
    )
    assert bb.latest_frame_bytes == b"sample_frame_bytes"
    assert bb.active_project["name"] == "Test Project"

    # Test kinematics dictionary getter
    kin = bb.kinematics
    assert "top_line" in kin
    assert "bottom_line" in kin
    assert "target_next_top" in kin
    assert "calibrated_capacity_L" in kin
    assert "scroll_padding_bottom" in kin
    assert "caret_pinned" in kin

    # Test kinematics setter
    bb.kinematics = {
        "top_line": 10,
        "bottom_line": 40,
        "target_next_top": 41,
        "calibrated_capacity_L": 31,
        "scroll_padding_bottom": 4,
        "caret_pinned": True
    }
    assert bb.top_line == 10
    assert bb.bottom_line == 40
    assert bb.target_next_top == 41
    assert bb.calibrated_capacity_L == 31
    assert bb.scroll_padding_bottom == 4
    assert bb.caret_pinned is True


@pytest.mark.asyncio
async def test_all_individual_dag_node_classes_and_execute_interface():
    from dag_nodes.base import BaseDagNode
    from dag_nodes.init_end_node import InitEndNode
    from dag_nodes.reset_home_node import ResetHomeNode
    from dag_nodes.frame_acquire_node import FrameAcquireNode
    from dag_nodes.local_ai_ocr_node import LocalAiOcrNode
    from dag_nodes.frame_ocr_node import FrameOcrNode
    from dag_nodes.arrow_down_node import ArrowDownPagerNode
    from dag_nodes.verification_trigger_node import VerificationTriggerNode
    from dag_nodes.document_assemble_node import DocumentAssembleNode

    node_classes = [
        (InitEndNode, "init_end"),
        (ResetHomeNode, "reset_home"),
        (FrameAcquireNode, "frame_acquire"),
        (LocalAiOcrNode, "local_ai_ocr"),
        (FrameOcrNode, "frame_ocr"),
        (ArrowDownPagerNode, "arrow_down"),
        (VerificationTriggerNode, "verification_trigger"),
        (DocumentAssembleNode, "document_assemble"),
    ]

    for cls, expected_id in node_classes:
        inst = cls()
        assert isinstance(inst, BaseDagNode)
        assert inst.id == expected_id
        assert inst.node_id == expected_id
        assert inst.title is not None
        assert isinstance(inst.default_position, dict)
        assert hasattr(inst, "config")
        assert hasattr(inst, "attached_actions")
        assert callable(getattr(inst, "execute"))

    # Test execute method directly on a node
    bb = DagBlackboard(active_serial="mock:9999", top_line=1, bottom_line=31)
    doc_node = DocumentAssembleNode()
    result_dict = await doc_node.execute(bb)
    assert isinstance(result_dict, dict)
    assert result_dict["status"] == "success"
    assert result_dict["node_id"] == "document_assemble"


def test_registry_dynamic_plugin_registration():
    from dag_nodes.base import BaseDagNode, NodeExecutionResult
    from dag_nodes.registry import NodeRegistry

    reg = NodeRegistry(auto_discover=True)
    assert reg.get_node("init_end") is not None
    assert reg.get_node("document_assemble") is not None

    # Verify a new subclass can be dropped in and registered dynamically
    class CustomDroppedNode(BaseDagNode):
        id = "custom_dynamic_node"
        title = "Dynamic Custom Node"

        async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
            return NodeExecutionResult(status="success", node_id=self.id)

    reg.register(CustomDroppedNode)
    retrieved = reg.get_node("custom_dynamic_node")
    assert retrieved is not None
    assert retrieved.title == "Dynamic Custom Node"


def test_observation_context_fields():
    import numpy as np
    from observation_actions.base_action import ObservationContext

    dummy_img = np.zeros((100, 100, 3), dtype=np.uint8)
    ctx = ObservationContext(
        serial="mock:9999",
        display_id=2,
        image_bgr=dummy_img,
        uiautomator_xml="<hierarchy></hierarchy>",
        focused_activity="com.microsoft.teams/.FilePreviewActivity",
        expected_top_line=10,
        expected_bottom_line=40,
        target_folder_path="Test_Folder",
        target_filename="Test_Doc.md"
    )

    assert ctx.serial == "mock:9999"
    assert ctx.display_id == 2
    assert ctx.image_bgr is not None
    assert ctx.image_cv is not None
    assert ctx.uiautomator_xml == "<hierarchy></hierarchy>"
    assert "FilePreviewActivity" in ctx.focused_activity
    assert ctx.expected_top_line == 10
    assert ctx.expected_bottom_line == 40
    assert ctx.target_folder_path == "Test_Folder"
    assert ctx.target_filename == "Test_Doc.md"


@pytest.mark.asyncio
async def test_all_individual_action_plugin_files():
    from observation_actions.base_action import ObservationActionPlugin, ObservationContext
    from observation_actions.action_view_to_edit import ViewToEditAction
    from observation_actions.action_light_to_dark import LightToDarkAction
    from observation_actions.action_close_keyboard import CloseKeyboardAction
    from observation_actions.action_detect_top_line import DetectTopLineAction
    from observation_actions.action_detect_bottom_line import DetectBottomLineAction
    from observation_actions.action_open_markdown_from_onedrive import OpenMarkdownFromOneDriveAction

    plugins = [
        (
            ViewToEditAction(),
            "view_mode_to_edit_mode",
            "view mode detected, switching to edit mode",
            "environment",
            "pre_node"
        ),
        (
            LightToDarkAction(),
            "light_mode_to_dark_mode",
            "light mode detected, switching to dark mode",
            "environment",
            "pre_node"
        ),
        (
            CloseKeyboardAction(),
            "keyboard_detected_close",
            "keyboard detected, closing keyboard",
            "environment",
            "pre_node"
        ),
        (
            DetectTopLineAction(),
            "top_line_missing_detect",
            "line number at top not detected, detecting line number at top",
            "gutter_ocr",
            "on_error"
        ),
        (
            DetectBottomLineAction(),
            "bottom_line_missing_detect",
            "line number at bottom not detected",
            "gutter_ocr",
            "on_error"
        ),
        (
            OpenMarkdownFromOneDriveAction(),
            "markdown_not_open_navigate_onedrive",
            "markdown editor not open, selecting one drive and navigating to folder to open the target file",
            "compounding_navigation",
            "pre_node"
        ),
    ]

    ctx = ObservationContext(serial="mock:9999", expected_top_line=1, expected_bottom_line=31)

    for p, exp_id, exp_label, exp_cat, exp_phase in plugins:
        assert isinstance(p, ObservationActionPlugin)
        assert p.id == exp_id
        assert p.config_label == exp_label
        assert p.category == exp_cat
        assert p.default_phase == exp_phase

        # Test observation interface
        detected, reason, details = await p.detect_by_observation(ctx)
        assert isinstance(detected, bool)
        assert isinstance(reason, str)
        assert isinstance(details, dict)

        # Test workaround interface (mock safe)
        if p.id in ("keyboard_detected_close", "top_line_missing_detect", "bottom_line_missing_detect"):
            res = await p.execute_workaround(ctx)
            assert isinstance(res, dict)
            assert "status" in res


def test_discovery_observer_endpoint():
    with TestClient(main.app) as client:
        res = client.post("/api/dag/observations/discover", json={"serial": "mock:9999", "node_id": "frame_acquire"})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "detected_issues" in data
        assert "unattached_detected" in data
        assert "recommended_actions" in data
        assert isinstance(data["recommended_actions"], list)


@pytest.mark.asyncio
async def test_dynamic_issue_discovery_observer_python_api():
    from observation_actions.discovery_observer import DynamicIssueDiscoveryObserver

    # Test observe_live_environment
    diagnosis = await DynamicIssueDiscoveryObserver.observe_live_environment(
        serial="mock:9999",
        display_id=2,
        active_node_id="frame_acquire"
    )
    assert diagnosis["status"] == "success"
    assert "detected_issues" in diagnosis
    assert "recommended_actions" in diagnosis
    assert isinstance(diagnosis["detected_issues"], list)

    # Test auto_remediate_all_detected
    remedy_results = await DynamicIssueDiscoveryObserver.auto_remediate_all_detected(
        serial="mock:9999",
        display_id=2,
        active_node_id="frame_acquire"
    )
    assert isinstance(remedy_results, list)



