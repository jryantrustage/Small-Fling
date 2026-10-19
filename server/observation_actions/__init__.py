"""
Observation Actions Registry:
Manages decoupled environmental anomaly detectors and self-healing workaround actions.
"""

from typing import Dict, List, Optional, Any
from .base_action import (
    ObservationContext,
    ActionContext,
    ObservationActionPlugin,
    BaseObservationAction,
    ObservationVerdict,
    WorkaroundResult,
)
from .action_view_to_edit import ViewToEditAction
from .action_light_to_dark import LightToDarkAction
from .action_close_keyboard import CloseKeyboardAction
from .action_detect_top_line import DetectTopLineAction
from .action_detect_bottom_line import DetectBottomLineAction
from .action_open_markdown_from_onedrive import (
    OpenMarkdownFromOneDriveAction,
    RecoverMarkdownEditorAction,
)
from .discovery_observer import (
    DynamicIssueDiscoveryObserver,
    DynamicObservationDiscoveryEngine,
)


class ObservationActionRegistry:
    """Registry maintaining active Observation-Workaround Action plugins."""

    def __init__(self):
        self._actions: Dict[str, ObservationActionPlugin] = {}
        # Register standard catalog
        self.register(OpenMarkdownFromOneDriveAction())
        self.register(CloseKeyboardAction())
        self.register(ViewToEditAction())
        self.register(LightToDarkAction())
        self.register(DetectTopLineAction())
        self.register(DetectBottomLineAction())

    def register(self, action: ObservationActionPlugin) -> None:
        self._actions[action.id] = action

    def unregister(self, action_id: str) -> None:
        self._actions.pop(action_id, None)

    def get_action(self, action_id: str) -> Optional[ObservationActionPlugin]:
        return self._actions.get(action_id)

    def list_all_actions(self) -> List[ObservationActionPlugin]:
        # Return sorted by priority
        return sorted(self._actions.values(), key=lambda a: a.priority)

    def get_all_actions(self) -> List[ObservationActionPlugin]:
        return self.list_all_actions()

    def get_catalog(self) -> List[Dict[str, Any]]:
        return [a.to_catalog_dict() for a in self.list_all_actions()]


observation_action_registry = ObservationActionRegistry()

__all__ = [
    # Base Classes & Data Models
    "ObservationContext",
    "ActionContext",
    "ObservationActionPlugin",
    "BaseObservationAction",
    "ObservationVerdict",
    "WorkaroundResult",
    # Registry & Discovery
    "ObservationActionRegistry",
    "observation_action_registry",
    "DynamicIssueDiscoveryObserver",
    "DynamicObservationDiscoveryEngine",
    # Action Plugins
    "ViewToEditAction",
    "LightToDarkAction",
    "CloseKeyboardAction",
    "DetectTopLineAction",
    "DetectBottomLineAction",
    "OpenMarkdownFromOneDriveAction",
    "RecoverMarkdownEditorAction",
]
