"""
Re-export DynamicIssueDiscoveryObserver and DynamicObservationDiscoveryEngine for backward compatibility.
"""
from observation_actions.discovery_observer import (
    DynamicIssueDiscoveryObserver,
    DynamicObservationDiscoveryEngine,
)

__all__ = [
    "DynamicIssueDiscoveryObserver",
    "DynamicObservationDiscoveryEngine",
]
