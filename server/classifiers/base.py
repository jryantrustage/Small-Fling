"""
Base definitions for general-purpose screen and app setup classifiers and fixing actions.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
import numpy as np


@dataclass
class ClassifierContext:
    serial: Optional[str] = None
    display_id: Optional[int] = None
    image_bytes: Optional[bytes] = None
    image_cv: Optional[np.ndarray] = None
    alignment_data: Optional[Dict[str, Any]] = None
    target_coordinates: Optional[Tuple[int, int]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ClassificationResult:
    classifier_id: str
    issue_detected: bool
    issue_name: str
    fix_name: str
    severity: str = "warning"  # "blocking" | "warning" | "info"
    confidence: float = 1.0
    details: str = ""
    target_coordinates: Optional[Tuple[int, int]] = None  # [x, y] in screen pixels if tap target exists
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        from services.state import sanitize_for_json
        return {
            "classifier_id": str(self.classifier_id),
            "issue_detected": bool(self.issue_detected),
            "issue_name": str(self.issue_name),
            "fix_name": str(self.fix_name),
            "severity": str(self.severity),
            "confidence": float(self.confidence),
            "details": str(self.details),
            "target_coordinates": [int(c) for c in self.target_coordinates] if self.target_coordinates else None,
            "metadata": sanitize_for_json(self.metadata),
        }


@dataclass
class FixResult:
    classifier_id: str
    success: bool
    message: str
    actions_taken: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        from services.state import sanitize_for_json
        return {
            "classifier_id": str(self.classifier_id),
            "success": bool(self.success),
            "message": str(self.message),
            "actions_taken": [str(a) for a in self.actions_taken],
            "metadata": sanitize_for_json(self.metadata),
        }


class BaseClassifier(ABC):
    """
    Abstract base class for all setup classifiers.
    Subclasses define detection logic and the remediation action.
    """
    id: str = "base"
    issue_description: str = "Generic issue"
    fix_description: str = "Generic fix"
    severity: str = "warning"

    @abstractmethod
    async def detect(self, context: ClassifierContext) -> ClassificationResult:
        """
        Evaluate context (screen image, display dumpsys, ADB state) to determine
        if this issue is present.
        """
        pass

    @abstractmethod
    async def fix(self, context: ClassifierContext) -> FixResult:
        """
        Execute remediation action (e.g. tap toggle icon, send key event, etc.).
        """
        pass

async def create_classifier_context(serial: Optional[str] = None) -> ClassifierContext:
    from services.adb_service import get_active_adb_serial, detect_external_display_id, capture_external_screenshot
    from services import state
    active_serial = await get_active_adb_serial(serial)
    disp_id = await detect_external_display_id(active_serial)
    snap = await capture_external_screenshot(active_serial)
    return ClassifierContext(
        serial=active_serial,
        display_id=disp_id,
        image_bytes=snap,
        alignment_data=state.latest_alignment_status
    )

