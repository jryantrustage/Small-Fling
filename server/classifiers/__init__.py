"""
Classifiers package exposing base types and the global classifier_registry.
"""

from .base import BaseClassifier, ClassifierContext, ClassificationResult, FixResult
from .registry import ClassifierRegistry, classifier_registry
from .editor_classifiers import (
    LightModeClassifier,
    ViewModeClassifier,
    KeyboardOpenClassifier,
)

__all__ = [
    "BaseClassifier",
    "ClassifierContext",
    "ClassificationResult",
    "FixResult",
    "ClassifierRegistry",
    "classifier_registry",
    "LightModeClassifier",
    "ViewModeClassifier",
    "KeyboardOpenClassifier",
]
