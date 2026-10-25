"""
DAG Nodes Package: Standalone, modular DAG node implementations, auto-discovery registry, and graph executor.
"""

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from dag_nodes.registry import (
    NodeRegistry,
    DagNodeRegistry,
    node_registry,
    dag_node_registry,
    CANONICAL_ALIASES,
)
from dag_nodes.executor import (
    DagGraphExecutor,
    GraphExecutor,
    dag_graph_executor,
    graph_executor,
)

from dag_nodes.init_end_node import InitEndNode
from dag_nodes.reset_home_node import ResetHomeNode
from dag_nodes.frame_acquire_node import FrameAcquireNode
from dag_nodes.local_ai_ocr_node import LocalAiOcrNode
from dag_nodes.frame_ocr_node import FrameOcrNode, GutterOcrNode
from dag_nodes.arrow_down_node import ArrowDownPagerNode, ArrowDownNode
from dag_nodes.verification_trigger_node import VerificationTriggerNode
from dag_nodes.document_assemble_node import DocumentAssembleNode
from dag_nodes.batch_frames_ocr_node import BatchFramesOcrNode

__all__ = [
    # Base and Blackboard
    "BaseDagNode",
    "DagBlackboard",
    "NodeExecutionResult",
    # Registry
    "NodeRegistry",
    "DagNodeRegistry",
    "node_registry",
    "dag_node_registry",
    "CANONICAL_ALIASES",
    # Executor
    "DagGraphExecutor",
    "GraphExecutor",
    "dag_graph_executor",
    "graph_executor",
    # Node Classes
    "InitEndNode",
    "ResetHomeNode",
    "FrameAcquireNode",
    "LocalAiOcrNode",
    "FrameOcrNode",
    "GutterOcrNode",
    "ArrowDownPagerNode",
    "ArrowDownNode",
    "VerificationTriggerNode",
    "DocumentAssembleNode",
    "BatchFramesOcrNode",
]
