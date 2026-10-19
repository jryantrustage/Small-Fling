"""
Dynamic Graph Executor for Wireable DAG Execution.
Executes the workflow by following active user-connected edges in state.dag_state["edges"]
rather than a hardcoded Python sequence.
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Set

from dag_nodes.base import BaseDagNode, DagBlackboard, NodeExecutionResult
from dag_nodes.registry import node_registry, NodeRegistry, CANONICAL_ALIASES
from services import state

logger = logging.getLogger("dag_executor")


class DagGraphExecutor:
    """
    Executes DAG workflows strictly based on user-connected edges and modular BaseDagNode instances.
    Supports single-node runs, dynamic wire traversal, branching conditions, and loopbacks.
    """

    def __init__(self, registry: Optional[NodeRegistry] = None):
        self.registry = registry or node_registry

    def get_node(self, node_id: str) -> Optional[BaseDagNode]:
        """Resolves node instance from registry by ID or alias."""
        return self.registry.get_node(node_id)

    def get_outgoing_edges(self, source_id: str) -> List[Dict[str, Any]]:
        """Returns all active, enabled outgoing edges from source_id."""
        edges = state.dag_state.get("edges", [])
        canonical_source = CANONICAL_ALIASES.get(source_id, source_id)
        result = []
        for e in edges:
            if not e.get("enabled", True):
                continue
            e_from = CANONICAL_ALIASES.get(e.get("from"), e.get("from"))
            if e_from == canonical_source:
                result.append(e)
        return result

    def get_incoming_edges(self, target_id: str) -> List[Dict[str, Any]]:
        """Returns all active, enabled incoming edges to target_id."""
        edges = state.dag_state.get("edges", [])
        canonical_target = CANONICAL_ALIASES.get(target_id, target_id)
        result = []
        for e in edges:
            if not e.get("enabled", True):
                continue
            e_to = CANONICAL_ALIASES.get(e.get("to"), e.get("to"))
            if e_to == canonical_target:
                result.append(e)
        return result

    def is_edge_connected(self, from_node: str, to_node: str) -> bool:
        """Checks if an active, enabled edge exists between from_node and to_node."""
        c_from = CANONICAL_ALIASES.get(from_node, from_node)
        c_to = CANONICAL_ALIASES.get(to_node, to_node)
        for e in state.dag_state.get("edges", []):
            if not e.get("enabled", True):
                continue
            ef = CANONICAL_ALIASES.get(e.get("from"), e.get("from"))
            et = CANONICAL_ALIASES.get(e.get("to"), e.get("to"))
            if ef == c_from and et == c_to:
                return True
        return False

    async def run_single_node(
        self,
        node_id: str,
        blackboard: Optional[DagBlackboard] = None
    ) -> NodeExecutionResult:
        """Executes a single DAG node in isolation with its attached observation actions."""
        node = self.get_node(node_id)
        if not node:
            return NodeExecutionResult(
                status="error",
                node_id=node_id,
                message=f"Node '{node_id}' not found in DAG registry."
            )

        bb = blackboard or DagBlackboard(
            project_id=state.get_current_project_id(),
            total_lines=state.dag_state.get("nodes", {}).get("init_end", {}).get("total_lines", 0)
        )
        return await node.run(bb)

    async def execute_from(
        self,
        start_node_id: str,
        blackboard: Optional[DagBlackboard] = None,
        max_steps: int = 500
    ) -> List[NodeExecutionResult]:
        """
        Traverses and executes the DAG graph dynamically starting from start_node_id
        strictly following user-connected edges in state.dag_state["edges"].
        """
        bb = blackboard or DagBlackboard(
            project_id=state.get_current_project_id(),
            total_lines=state.dag_state.get("nodes", {}).get("init_end", {}).get("total_lines", 0)
        )

        history: List[NodeExecutionResult] = []
        current_node_id: Optional[str] = CANONICAL_ALIASES.get(start_node_id, start_node_id)
        step_count = 0

        while current_node_id and step_count < max_steps:
            step_count += 1
            node = self.get_node(current_node_id)
            if not node:
                logger.warning(f"No node found in registry for {current_node_id}; stopping traversal.")
                break

            # Mark active node in state and broadcast
            state.dag_state["current_active_node"] = node.id
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": node.id,
                "status": "running"
            })

            # Execute node with attached actions lifecycle
            res = await node.run(bb)
            history.append(res)

            # Broadcast node completion
            await state.ws_manager.broadcast({
                "type": "dag_updated",
                "dag": state.dag_state,
                "node_id": node.id,
                "result": res.to_dict()
            })

            # Error handling branch
            if res.status == "error":
                error_edges = [
                    e for e in self.get_outgoing_edges(current_node_id)
                    if e.get("condition") == "ON_ERROR"
                ]
                if error_edges:
                    current_node_id = CANONICAL_ALIASES.get(error_edges[0].get("to"), error_edges[0].get("to"))
                    continue
                else:
                    logger.info(f"Unhandled error at node {current_node_id}; halting execution traversal.")
                    break

            # Document Assemble EOF / Loopback handling
            if node.id == "document_assemble":
                if res.is_complete:
                    eof_edges = [
                        e for e in self.get_outgoing_edges(current_node_id)
                        if e.get("condition") == "ON_EOF"
                    ]
                    if eof_edges:
                        current_node_id = CANONICAL_ALIASES.get(eof_edges[0].get("to"), eof_edges[0].get("to"))
                    else:
                        logger.info("Document assembly 100% complete and no EOF edge; finishing workflow.")
                        break
                else:
                    loop_edges = [
                        e for e in self.get_outgoing_edges(current_node_id)
                        if e.get("condition") in ("ON_LOOP_CONTINUE", None, "ON_SUCCESS")
                    ]
                    if loop_edges:
                        current_node_id = CANONICAL_ALIASES.get(loop_edges[0].get("to"), loop_edges[0].get("to"))
                    else:
                        logger.info("Document assemble loopback edge disconnected; cycle finished.")
                        break
                continue

            # Standard outgoing edges (ON_SUCCESS or default unconditioned edge)
            outgoing = [
                e for e in self.get_outgoing_edges(current_node_id)
                if e.get("condition") in ("ON_SUCCESS", None, "default")
            ]
            if outgoing:
                next_raw = outgoing[0].get("to")
                current_node_id = CANONICAL_ALIASES.get(next_raw, next_raw)
            else:
                logger.info(f"Node {current_node_id} has no enabled outgoing edge; flow complete.")
                current_node_id = None

        state.dag_state["current_active_node"] = None
        return history

    async def execute_full_pipeline(
        self,
        serial: Optional[str] = None,
        project_id: Optional[str] = None,
        start_node_id: str = "init_end"
    ) -> List[NodeExecutionResult]:
        """
        Executes the entire workflow starting from init_end following user's configured edges.
        """
        from services.adb_service import get_active_adb_serial, detect_external_display_id

        active_serial = await get_active_adb_serial(serial)
        disp_id = await detect_external_display_id(active_serial)
        proj_id = project_id or state.get_current_project_id()

        bb = DagBlackboard(
            active_serial=active_serial,
            display_id=disp_id,
            project_id=proj_id,
            top_line=state.dag_state["nodes"].get("frame_ocr", {}).get("top_line", 0),
            bottom_line=state.dag_state["nodes"].get("frame_ocr", {}).get("bottom_line", 0),
            total_lines=state.dag_state["nodes"].get("init_end", {}).get("total_lines", 0)
        )

        return await self.execute_from(start_node_id, blackboard=bb)


# Global singleton instances
dag_graph_executor = DagGraphExecutor(node_registry)
graph_executor = dag_graph_executor
GraphExecutor = DagGraphExecutor

__all__ = [
    "DagGraphExecutor",
    "GraphExecutor",
    "dag_graph_executor",
    "graph_executor",
]
