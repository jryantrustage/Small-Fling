"""
Base classes and blackboard memory model for standalone, modular DAG nodes.
Defines DagBlackboard, BaseDagNode, and NodeExecutionResult.
"""

from abc import ABC, abstractmethod
import asyncio
import time
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from pathlib import Path

from observation_actions.base_action import ActionContext, WorkaroundResult
from observation_actions import observation_action_registry
from observation_actions.discovery_observer import DynamicObservationDiscoveryEngine


@dataclass
class DagBlackboard:
    """Shared pipeline memory passed sequentially or concurrently across DAG nodes."""
    # Active hardware & target context
    active_serial: str = ""
    display_id: int = 0
    project_id: str = ""
    active_project: Optional[Dict[str, Any]] = None

    # In-memory frame snapshots
    latest_frame_bytes: Optional[bytes] = None
    latest_frame_bgr: Optional[Any] = None
    current_image_bytes: Optional[bytes] = None
    current_image_path: Optional[Path] = None

    # Kinematics state
    top_line: int = 0
    bottom_line: int = 0
    target_next_top: int = 0
    calibrated_capacity_L: int = 49
    scroll_padding_bottom: int = 5
    caret_pinned: bool = True
    total_lines: int = 0

    # Pipeline configurations & outputs
    config: Dict[str, Any] = field(default_factory=dict)
    payload: Dict[str, Any] = field(default_factory=dict)
    ocr_results: Dict[str, Any] = field(default_factory=dict)
    ai_ocr_text: str = ""
    preview_text: str = ""
    lines_count: int = 0
    char_count: int = 0
    arrow_count: int = 56
    loop_iteration: int = 0
    is_complete: bool = False
    dpi_factor: float = 1.0
    active_dpi: int = 220
    actions_run: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def kinematics(self) -> Dict[str, Any]:
        """Provides kinematics dictionary access."""
        return {
            "top_line": self.top_line,
            "bottom_line": self.bottom_line,
            "target_next_top": self.target_next_top,
            "calibrated_capacity_L": self.calibrated_capacity_L,
            "scroll_padding_bottom": self.scroll_padding_bottom,
            "caret_pinned": self.caret_pinned,
        }

    @kinematics.setter
    def kinematics(self, values: Dict[str, Any]) -> None:
        """Allows setting kinematics via dictionary."""
        if not isinstance(values, dict):
            return
        if "top_line" in values:
            self.top_line = int(values["top_line"])
        if "bottom_line" in values:
            self.bottom_line = int(values["bottom_line"])
        if "target_next_top" in values:
            self.target_next_top = int(values["target_next_top"])
        if "calibrated_capacity_L" in values:
            self.calibrated_capacity_L = int(values["calibrated_capacity_L"])
        if "scroll_padding_bottom" in values:
            self.scroll_padding_bottom = int(values["scroll_padding_bottom"])
        if "caret_pinned" in values:
            self.caret_pinned = bool(values["caret_pinned"])


@dataclass
class NodeExecutionResult:
    """Standardized output returned by every DAG node execution."""
    status: str  # "success" | "error" | "prevented" | "aborted" | "skipped"
    node_id: str
    message: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    duration_ms: float = 0.0
    actions_run: List[str] = field(default_factory=list)
    timings: Dict[str, Any] = field(default_factory=dict)
    total_lines: Optional[int] = None
    top_line: Optional[int] = None
    bottom_line: Optional[int] = None
    is_complete: Optional[bool] = None

    def to_dict(self) -> Dict[str, Any]:
        res = {
            "status": self.status,
            "node_id": self.node_id,
            "id": self.node_id,
            "message": self.message,
            "data": self.data,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "actions_run": self.actions_run,
            "timings": self.timings,
            "total_lines": self.total_lines,
            "top_line": self.top_line,
            "bottom_line": self.bottom_line,
            "is_complete": self.is_complete
        }
        if self.data and isinstance(self.data, dict):
            for k, v in self.data.items():
                if k not in res or res[k] is None:
                    res[k] = v
        return res


class BaseDagNode(ABC):
    """
    Abstract base class for all standalone, modular DAG nodes.
    Defines id, title, default_position, config, attached_actions,
    and execution lifecycle.
    """
    id: str = "base"
    title: str = "Base Node"
    short_name: str = "Base"
    category: str = "general"
    accent_color: str = "#58a6ff"
    default_position: Dict[str, float] = {"x": 100.0, "y": 100.0}
    config: Dict[str, Any] = {}
    default_config: Dict[str, Any] = {}

    def __init__(self):
        # Default attached observation actions: only safe keyboard dismissal to prevent disruptive blind taps
        self.attached_actions: List[str] = [
            "keyboard_detected_close"
        ]

    @property
    def node_id(self) -> str:
        return self.id

    @node_id.setter
    def node_id(self, val: str) -> None:
        self.id = val

    def get_position(self) -> Dict[str, float]:
        from services import state
        node_state = state.dag_state.get("nodes", {}).get(self.id, {})
        return node_state.get("position", self.default_position)

    def set_position(self, x: float, y: float) -> None:
        from services import state
        if self.id in state.dag_state.get("nodes", {}):
            state.dag_state["nodes"][self.id]["position"] = {"x": float(x), "y": float(y)}

    def get_attached_actions(self) -> List[str]:
        from services import state
        node_state = state.dag_state.get("nodes", {}).get(self.id, {})
        return node_state.get("attached_actions", self.attached_actions)

    def set_attached_actions(self, action_ids: List[str]) -> None:
        from services import state
        if self.id in state.dag_state.get("nodes", {}):
            state.dag_state["nodes"][self.id]["attached_actions"] = list(action_ids)
        self.attached_actions = list(action_ids)

    async def _run_actions_for_phase(
        self,
        phase: str,
        blackboard: DagBlackboard,
        actions_taken_list: List[str]
    ) -> None:
        attached = self.get_attached_actions()
        ctx = ActionContext(
            serial=blackboard.active_serial,
            display_id=blackboard.display_id,
            image_bytes=blackboard.latest_frame_bytes or blackboard.current_image_bytes,
            node_id=self.id,
            blackboard=blackboard,
            project_id=blackboard.project_id
        )

        for act_id in attached:
            act = observation_action_registry.get_action(act_id)
            if not act:
                continue

            matches_phase = (
                act.hook_phase == phase or
                phase == "continuous" or
                (phase == "pre" and act.hook_phase in ("pre", "continuous")) or
                (phase == "error" and act.hook_phase in ("error", "pre"))
            )
            if not matches_phase:
                continue

            try:
                verd = await act.observe(ctx)
                if verd.detected:
                    res = await act.remediate(ctx)
                    msg = f"[{act.label}] {res.message}"
                    actions_taken_list.append(msg)
                    blackboard.actions_run.append(msg)
            except Exception as ex:
                actions_taken_list.append(f"[{act_id} failed: {ex}]")

    async def run(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        """Runs the node through pre-actions, core execution, post-actions, and error recovery."""
        t0 = time.perf_counter()
        actions_run: List[str] = []
        timings: Dict[str, Any] = {}

        # 1. Pre-execution Phase
        t_pre = time.perf_counter()
        if not (blackboard.payload and blackboard.payload.get("skip_env_heal")):
            await self._run_actions_for_phase("pre", blackboard, actions_run)
        timings["pre_actions_ms"] = round((time.perf_counter() - t_pre) * 1000, 2)

        # 2. Core Execution Phase
        t_core = time.perf_counter()
        try:
            res = await self.execute_core(blackboard)
            timings["core_ms"] = round((time.perf_counter() - t_core) * 1000, 2)
        except Exception as e:
            timings["core_ms"] = round((time.perf_counter() - t_core) * 1000, 2)
            # 4. Error Phase: Run Dynamic Discovery Engine & on-error workarounds
            t_err = time.perf_counter()
            await self._run_actions_for_phase("error", blackboard, actions_run)
            remedy_results = await DynamicObservationDiscoveryEngine.auto_remediate_all_detected(
                serial=blackboard.active_serial,
                display_id=blackboard.display_id,
                active_node_id=self.id,
                blackboard=blackboard
            )
            for r in remedy_results:
                if r.success:
                    actions_run.append(f"[Discovered Remedy] {r.message}")

            timings["error_remedy_ms"] = round((time.perf_counter() - t_err) * 1000, 2)

            if remedy_results:
                try:
                    res = await self.execute_core(blackboard)
                    res.actions_run = actions_run
                    res.timings = timings
                    res.duration_ms = round((time.perf_counter() - t0) * 1000, 2)
                    return res
                except Exception as retry_err:
                    e = retry_err

            total_ms = round((time.perf_counter() - t0) * 1000, 2)
            return NodeExecutionResult(
                status="error",
                node_id=self.id,
                message=f"Node {self.id} failed: {e}",
                error=str(e),
                duration_ms=total_ms,
                actions_run=actions_run,
                timings=timings
            )

        # 3. Post-execution Phase
        t_post = time.perf_counter()
        await self._run_actions_for_phase("post", blackboard, actions_run)
        timings["post_actions_ms"] = round((time.perf_counter() - t_post) * 1000, 2)

        total_ms = round((time.perf_counter() - t0) * 1000, 2)
        res.duration_ms = total_ms
        res.actions_run.extend(actions_run)
        res.timings = timings
        return res

    async def execute(self, blackboard: DagBlackboard) -> Dict[str, Any]:
        """
        Executes node logic and returns standard Dictionary format.
        Fulfills: async def execute(self, blackboard: DagBlackboard) -> Dict[str, Any]
        """
        result = await self.run(blackboard)
        return result.to_dict()

    @abstractmethod
    async def execute_core(self, blackboard: DagBlackboard) -> NodeExecutionResult:
        """Core payload logic specific to this DAG node."""
        pass
