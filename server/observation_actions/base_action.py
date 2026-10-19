"""
Base definitions for decoupled Observation & Workaround Action plugins.
Defines ObservationContext and ObservationActionPlugin base class.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List, Tuple, Literal
from dataclasses import dataclass, field
import cv2
import numpy as np


@dataclass
class ObservationContext:
    """
    Context container providing real-time hardware, visual, activity,
    and UIAutomator context to observation and workaround plugins.
    """
    # Hardware & Display Context
    serial: Optional[str] = None
    display_id: Optional[int] = None

    # Visual & OCR Context
    image_bgr: Optional[np.ndarray] = None
    image_bytes: Optional[bytes] = None

    # UI & Window State Context
    uiautomator_xml: Optional[str] = None
    focused_activity: Optional[str] = None

    # Line Kinematics Context
    expected_top_line: Optional[int] = None
    expected_bottom_line: Optional[int] = None

    # Target Document / Project Navigation Context
    target_folder_path: Optional[str] = None
    target_filename: Optional[str] = None

    # Pipeline Node & State Context
    node_id: Optional[str] = None
    blackboard: Optional[Any] = None
    project_id: Optional[str] = None
    alignment_data: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def image_cv(self) -> Optional[np.ndarray]:
        """Provides cv2 BGR image array, decoding from image_bytes if needed."""
        if self.image_bgr is not None:
            return self.image_bgr
        if self.image_bytes:
            nparr = np.frombuffer(self.image_bytes, np.uint8)
            decoded = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            self.image_bgr = decoded
            return decoded
        return None

    @image_cv.setter
    def image_cv(self, img: Optional[np.ndarray]) -> None:
        self.image_bgr = img


ActionContext = ObservationContext


@dataclass
class ObservationVerdict:
    """Detailed observation diagnosis result."""
    action_id: str
    detected: bool
    confidence: float = 1.0
    reason: str = ""
    target_coordinates: Optional[Tuple[int, int]] = None
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action_id": self.action_id,
            "id": self.action_id,
            "detected": bool(self.detected),
            "confidence": float(self.confidence),
            "reason": str(self.reason),
            "target_coordinates": [int(c) for c in self.target_coordinates] if self.target_coordinates else None,
            "details": self.details,
        }


@dataclass
class WorkaroundResult:
    """Execution output from a workaround action."""
    action_id: str
    success: bool
    message: str
    actions_taken: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action_id": self.action_id,
            "id": self.action_id,
            "success": bool(self.success),
            "message": str(self.message),
            "actions_taken": [str(a) for a in self.actions_taken],
            "metadata": self.metadata,
        }


class ObservationActionPlugin(ABC):
    """
    Abstract base class for decoupled Observation-Workaround Action Plugins.
    Enables observing environmental anomalies and executing deterministic self-healing
    workarounds independently of DAG node execution.
    """
    id: str = "base_action"
    config_label: str = "Base Action"
    category: Literal["environment", "gutter_ocr", "compounding_navigation"] = "environment"
    default_phase: Literal["pre_node", "post_node", "on_error"] = "pre_node"
    priority: int = 100

    @property
    def action_id(self) -> str:
        return self.id

    @action_id.setter
    def action_id(self, val: str) -> None:
        self.id = val

    @property
    def label(self) -> str:
        return self.config_label

    @label.setter
    def label(self, val: str) -> None:
        self.config_label = val

    @property
    def hook_phase(self) -> Literal["pre", "post", "error", "continuous"]:
        phase_map = {
            "pre_node": "pre",
            "post_node": "post",
            "on_error": "error"
        }
        return phase_map.get(self.default_phase, "pre")

    @hook_phase.setter
    def hook_phase(self, val: str) -> None:
        rev_map = {
            "pre": "pre_node",
            "post": "post_node",
            "error": "on_error",
            "continuous": "pre_node"
        }
        self.default_phase = rev_map.get(val, "pre_node")

    @property
    def is_compounding(self) -> bool:
        return self.category == "compounding_navigation"

    @property
    def description(self) -> str:
        return self.config_label

    @abstractmethod
    async def detect_by_observation(self, ctx: ObservationContext) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Observes the live display, window, or OCR state to detect if this issue is present.
        Returns:
            Tuple[detected (bool), reason (str), details (Dict[str, Any])]
        """
        pass

    @abstractmethod
    async def execute_workaround(self, ctx: ObservationContext) -> Dict[str, Any]:
        """
        Executes the corrective workaround to heal the environment or recover line state.
        Returns:
            Dict[str, Any] containing at least {"status": "success", "message": "...", "actions_taken": [...]}
        """
        pass

    async def observe(self, ctx: Any) -> ObservationVerdict:
        """Adapter method for DAG nodes and legacy observation callers."""
        obs_ctx = ctx if isinstance(ctx, ObservationContext) else ObservationContext(
            serial=getattr(ctx, "serial", None),
            display_id=getattr(ctx, "display_id", None),
            image_bytes=getattr(ctx, "image_bytes", None),
            image_bgr=getattr(ctx, "image_cv", None),
            node_id=getattr(ctx, "node_id", None),
            blackboard=getattr(ctx, "blackboard", None),
            project_id=getattr(ctx, "project_id", None),
        )
        detected, reason, details = await self.detect_by_observation(obs_ctx)
        coords = details.get("target_coordinates") if isinstance(details, dict) else None
        return ObservationVerdict(
            action_id=self.id,
            detected=detected,
            confidence=0.98 if detected else 0.05,
            reason=reason,
            target_coordinates=coords,
            details=details if isinstance(details, dict) else {"raw": details}
        )

    async def remediate(self, ctx: Any) -> WorkaroundResult:
        """Adapter method for DAG nodes and legacy remediation callers."""
        obs_ctx = ctx if isinstance(ctx, ObservationContext) else ObservationContext(
            serial=getattr(ctx, "serial", None),
            display_id=getattr(ctx, "display_id", None),
            image_bytes=getattr(ctx, "image_bytes", None),
            image_bgr=getattr(ctx, "image_cv", None),
            node_id=getattr(ctx, "node_id", None),
            blackboard=getattr(ctx, "blackboard", None),
            project_id=getattr(ctx, "project_id", None),
        )
        res_dict = await self.execute_workaround(obs_ctx)
        success = res_dict.get("success", res_dict.get("status") == "success")
        msg = res_dict.get("message", "Workaround completed")
        actions_taken = res_dict.get("actions_taken", [])
        return WorkaroundResult(
            action_id=self.id,
            success=success,
            message=msg,
            actions_taken=actions_taken,
            metadata=res_dict
        )

    def to_catalog_dict(self) -> Dict[str, Any]:
        return {
            "action_id": self.id,
            "id": self.id,
            "label": self.config_label,
            "config_label": self.config_label,
            "description": self.config_label,
            "category": self.category,
            "default_phase": self.default_phase,
            "hook_phase": self.hook_phase,
            "is_compounding": self.is_compounding,
            "priority": self.priority,
        }


BaseObservationAction = ObservationActionPlugin

__all__ = [
    "ObservationContext",
    "ActionContext",
    "ObservationActionPlugin",
    "BaseObservationAction",
    "ObservationVerdict",
    "WorkaroundResult"
]
