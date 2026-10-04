"""
Classifiers package exposing base types and the global classifier_registry.
"""

from .base import BaseClassifier, ClassifierContext, ClassificationResult, FixResult, create_classifier_context
from .registry import ClassifierRegistry, classifier_registry
from .editor_classifiers import (
    LightModeClassifier,
    EditModeClassifier,
    ViewModeClassifier,
    KeyboardOpenClassifier,
    Line1StuckClassifier,
    TeamsMarkdownVisibleClassifier,
    EditorCursorFocusedClassifier,
    MarkdownFullScreenClassifier,
)

__all__ = [
    "BaseClassifier",
    "ClassifierContext",
    "ClassificationResult",
    "FixResult",
    "create_classifier_context",
    "ClassifierRegistry",
    "classifier_registry",
    "LightModeClassifier",
    "EditModeClassifier",
    "ViewModeClassifier",
    "KeyboardOpenClassifier",
    "Line1StuckClassifier",
    "TeamsMarkdownVisibleClassifier",
    "EditorCursorFocusedClassifier",
    "MarkdownFullScreenClassifier",
]


