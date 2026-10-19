"""
Dynamic Node Registry for Standalone Modular DAG Nodes.
Auto-discovers BaseDagNode subclasses in server/dag_nodes/ so adding a new node
only requires dropping a new .py file into the directory.
"""

import importlib
import inspect
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Type

from dag_nodes.base import BaseDagNode

logger = logging.getLogger("dag_node_registry")

CANONICAL_ALIASES = {
    "node_1": "init_end",
    "node_2": "reset_home",
    "node_3": "frame_acquire",
    "node_4": "local_ai_ocr",
    "node_5": "frame_ocr",
    "gutter_ocr": "frame_ocr",
    "node_6": "arrow_down",
    "node_7": "verification_trigger",
    "node_8": "document_assemble",
}


class NodeRegistry:
    """
    Registry that maintains all available DAG nodes and auto-discovers
    BaseDagNode subclasses from the server/dag_nodes directory.
    """

    def __init__(self, auto_discover: bool = True):
        self._nodes: Dict[str, BaseDagNode] = {}
        self._node_classes: Dict[str, Type[BaseDagNode]] = {}
        if auto_discover:
            self.auto_discover()

    def register(self, node_or_cls: Any) -> None:
        """Registers a BaseDagNode instance or class."""
        if inspect.isclass(node_or_cls) and issubclass(node_or_cls, BaseDagNode):
            node_id = getattr(node_or_cls, "id", None) or getattr(node_or_cls, "node_id", None)
            if node_id:
                self._node_classes[node_id] = node_or_cls
                try:
                    instance = node_or_cls()
                    self._nodes[node_id] = instance
                except Exception as e:
                    logger.warning(f"Could not instantiate DAG node class {node_or_cls}: {e}")
        elif isinstance(node_or_cls, BaseDagNode):
            node_id = node_or_cls.id or node_or_cls.node_id
            self._nodes[node_id] = node_or_cls
            self._node_classes[node_id] = type(node_or_cls)

    def get_node(self, node_id: str) -> Optional[BaseDagNode]:
        """Resolves node instance by ID or alias."""
        canonical = CANONICAL_ALIASES.get(node_id, node_id)
        return self._nodes.get(canonical)

    def list_nodes(self) -> Dict[str, BaseDagNode]:
        """Returns a copy of all registered node instances keyed by canonical ID."""
        return dict(self._nodes)

    def get_all_nodes(self) -> List[BaseDagNode]:
        """Returns list of unique BaseDagNode instances."""
        return list(self._nodes.values())

    def auto_discover(self) -> None:
        """
        Dynamically scans server/dag_nodes/ for Python files containing BaseDagNode
        subclasses and registers them.
        """
        current_dir = Path(__file__).resolve().parent
        ignored_files = {
            "__init__.py",
            "base.py",
            "base_node.py",
            "registry.py",
            "executor.py",
            "graph_executor.py"
        }

        # First discover canonical *_node.py files, then others
        py_files = sorted(current_dir.glob("*.py"))
        for py_file in py_files:
            if py_file.name in ignored_files:
                continue

            module_name = py_file.stem
            full_module_path = f"dag_nodes.{module_name}"

            try:
                mod = importlib.import_module(full_module_path)
            except Exception as e:
                # Try fallback server.dag_nodes
                try:
                    mod = importlib.import_module(f"server.dag_nodes.{module_name}")
                except Exception as e2:
                    logger.warning(f"Failed to import DAG node module {module_name}: {e2}")
                    continue

            for attr_name in dir(mod):
                attr = getattr(mod, attr_name, None)
                if (
                    inspect.isclass(attr)
                    and issubclass(attr, BaseDagNode)
                    and attr is not BaseDagNode
                ):
                    node_id = getattr(attr, "id", None) or getattr(attr, "node_id", None)
                    if node_id:
                        self.register(attr)


# Global singleton instances
node_registry = NodeRegistry()
dag_node_registry = node_registry
DagNodeRegistry = NodeRegistry

__all__ = [
    "NodeRegistry",
    "DagNodeRegistry",
    "node_registry",
    "dag_node_registry",
    "CANONICAL_ALIASES"
]
