"""
Registry and orchestration for screen and setup classifiers.
Allows dynamic registration of general-purpose classifiers and coordinated fix actions.
"""

import asyncio
from typing import Dict, List, Optional, Any
from .base import BaseClassifier, ClassifierContext, ClassificationResult, FixResult
from .editor_classifiers import (
    LightModeClassifier,
    ViewModeClassifier,
    KeyboardOpenClassifier,
    ModalOverlayClassifier,
    MatrixAppOverlayClassifier,
    OcrDegradedClassifier,
)


class ClassifierRegistry:
    def __init__(self):
        self._classifiers: Dict[str, BaseClassifier] = {}
        self._latest_results: List[ClassificationResult] = []
        self._auto_fix_enabled: bool = False

        # Register default general-purpose classifiers
        self.register(KeyboardOpenClassifier())
        self.register(ViewModeClassifier())
        self.register(LightModeClassifier())
        self.register(ModalOverlayClassifier())
        self.register(MatrixAppOverlayClassifier())
        self.register(OcrDegradedClassifier())

    def register(self, classifier: BaseClassifier) -> None:
        """Register a new classifier."""
        self._classifiers[classifier.id] = classifier

    def unregister(self, classifier_id: str) -> None:
        """Unregister a classifier by ID."""
        self._classifiers.pop(classifier_id, None)

    def get_classifier(self, classifier_id: str) -> Optional[BaseClassifier]:
        return self._classifiers.get(classifier_id)

    def list_classifiers(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": c.id,
                "issue_description": c.issue_description,
                "fix_description": c.fix_description,
                "severity": c.severity,
            }
            for c in self._classifiers.values()
        ]

    async def evaluate_all(self, context: ClassifierContext) -> List[ClassificationResult]:
        """Run all registered classifiers and return results."""
        try:
            from services.state import dismissed_alignment_items
            dismissed_set = set(dismissed_alignment_items)
        except Exception:
            dismissed_set = set()

        results: List[ClassificationResult] = []
        for c in self._classifiers.values():
            if c.id in dismissed_set or f"classifier_{c.id}" in dismissed_set:
                results.append(
                    ClassificationResult(
                        classifier_id=c.id,
                        issue_detected=False,
                        issue_name=c.issue_description,
                        fix_name=c.fix_description,
                        details="Classifier issue dismissed by user as false positive",
                    )
                )
                continue

            try:
                res = await c.detect(context)
                if c.id in dismissed_set or f"classifier_{c.id}" in dismissed_set:
                    res.issue_detected = False
                results.append(res)
            except Exception as e:
                results.append(
                    ClassificationResult(
                        classifier_id=c.id,
                        issue_detected=False,
                        issue_name=c.issue_description,
                        fix_name=c.fix_description,
                        details=f"Detection error: {e}",
                    )
                )
        self._latest_results = results
        return results

    async def fix_classifier(self, classifier_id: str, context: ClassifierContext) -> FixResult:
        """Execute fix for a specific classifier."""
        c = self._classifiers.get(classifier_id)
        if not c:
            return FixResult(
                classifier_id=classifier_id,
                success=False,
                message=f"Classifier '{classifier_id}' not found.",
            )
        try:
            return await c.fix(context)
        except Exception as e:
            return FixResult(
                classifier_id=classifier_id,
                success=False,
                message=f"Fix error: {e}",
            )

    async def fix_all(self, context: ClassifierContext) -> List[FixResult]:
        """Execute fix actions for all detected issues in priority order."""
        eval_results = await self.evaluate_all(context)
        fix_results: List[FixResult] = []
        # Priority order: close keyboard first so toolbar is unobstructed, then view mode, then light mode
        priority = ["keyboard_open", "view_mode", "light_mode"]
        sorted_detected = sorted(
            [r for r in eval_results if r.issue_detected],
            key=lambda r: priority.index(r.classifier_id) if r.classifier_id in priority else 99,
        )

        for res in sorted_detected:
            fix_res = await self.fix_classifier(res.classifier_id, context)
            fix_results.append(fix_res)
            # Allow display and input server to settle
            await asyncio.sleep(0.35)
            # If keyboard was closed, refresh external screenshot for subsequent fixes
            if res.classifier_id == "keyboard_open":
                try:
                    from services.adb_service import capture_external_screenshot
                    new_snap = await capture_external_screenshot(context.serial)
                    if new_snap:
                        context.image_bytes = new_snap
                        context.image_cv = None
                except Exception:
                    pass

        return fix_results

    def get_latest_issues(self) -> List[Dict[str, Any]]:
        """Return only active detected issues."""
        return [r.to_dict() for r in self._latest_results if r.issue_detected]

    def get_status_report(self) -> Dict[str, Any]:
        """Return summary of all classifiers and active issues."""
        issues = [r.to_dict() for r in self._latest_results if r.issue_detected]
        return {
            "has_issues": len(issues) > 0,
            "issue_count": len(issues),
            "issues": issues,
            "all_results": [r.to_dict() for r in self._latest_results],
            "registered_classifiers": self.list_classifiers(),
            "auto_fix_enabled": self._auto_fix_enabled,
        }


# Global registry instance
classifier_registry = ClassifierRegistry()
