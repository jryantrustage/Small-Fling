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
        return {
            "classifier_id": self.classifier_id,
            "issue_detected": self.issue_detected,
            "issue_name": self.issue_name,
            "fix_name": self.fix_name,
            "severity": self.severity,
            "confidence": self.confidence,
            "details": self.details,
            "target_coordinates": list(self.target_coordinates) if self.target_coordinates else None,
            "metadata": self.metadata,
        }


@dataclass
class FixResult:
    classifier_id: str
    success: bool
    message: str
    actions_taken: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "classifier_id": self.classifier_id,
            "success": self.success,
            "message": self.message,
            "actions_taken": self.actions_taken,
            "metadata": self.metadata,
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
