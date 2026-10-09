import pytest
from unittest.mock import AsyncMock, patch
from classifiers.editor_classifiers import KeyboardOpenClassifier
from classifiers.base import ClassifierContext
from classifiers.registry import classifier_registry
from services.adb_service import dismiss_keyboard, is_ime_visible


@pytest.mark.asyncio
async def test_keyboard_open_classifier_registered():
    clf = classifier_registry.get_classifier("keyboard_open")
    assert clf is not None
    assert clf.id == "keyboard_open"
    assert clf.fix_description == "close keyboard"


@pytest.mark.asyncio
async def test_dismiss_keyboard_when_ime_open():
    """Verify dismiss_keyboard uses keyevent 4 to dismiss IME when open."""
    called_cmds = []

    async def mock_run_adb(cmd, *args, **kwargs):
        called_cmds.append(cmd)
        return {"status": "ok", "stdout": ""}

    with patch("services.adb_service.get_active_adb_serial", return_value="test-serial"), \
         patch("services.adb_service.run_adb_shell", side_effect=mock_run_adb), \
         patch("services.adb_service.is_ime_visible", side_effect=[True, False]):

        res = await dismiss_keyboard("test-serial", 13)
        assert res is True
        assert any("keyevent 4" in c for c in called_cmds)
        assert any("show_ime_with_hard_keyboard 0" in c for c in called_cmds)


@pytest.mark.asyncio
async def test_dismiss_keyboard_when_ime_already_closed():
    """Verify dismiss_keyboard does not dispatch keyevent 4 when IME is already closed."""
    called_cmds = []

    async def mock_run_adb(cmd, *args, **kwargs):
        called_cmds.append(cmd)
        return {"status": "ok", "stdout": ""}

    with patch("services.adb_service.get_active_adb_serial", return_value="test-serial"), \
         patch("services.adb_service.run_adb_shell", side_effect=mock_run_adb), \
         patch("services.adb_service.is_ime_visible", return_value=False):

        res = await dismiss_keyboard("test-serial", 13)
        assert res is True
        # Must not inject keyevent 4 if keyboard was never open
        assert not any("keyevent 4" in c for c in called_cmds)


@pytest.mark.asyncio
async def test_keyboard_open_classifier_fix():
    """Verify KeyboardOpenClassifier.fix calls dismiss_keyboard and returns success."""
    clf = KeyboardOpenClassifier()
    ctx = ClassifierContext(serial="test-serial", display_id=13)

    with patch("classifiers.editor_classifiers.get_active_adb_serial", return_value="test-serial"), \
         patch("classifiers.editor_classifiers.dismiss_keyboard", new_callable=AsyncMock) as mock_dismiss:
        mock_dismiss.return_value = True
        fix_res = await clf.fix(ctx)
        assert fix_res.success is True
        assert "Keyboard closed successfully" in fix_res.message
        mock_dismiss.assert_awaited_once_with("test-serial", 13)
