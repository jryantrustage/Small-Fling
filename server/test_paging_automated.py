"""
Automated Test Suite for Markdown Viewport Pagination and Gutter Alignment.

Validates the full pagination logic:
  1. Calibration of Viewport Capacity L = 26 from Page 1 (Ln 1 to 26).
  2. Transition from Page 1 to Page 2:
     - Cursor starts on Line 1.
     - (L - 1) = 25 cursor travel presses to reach bottom of page 1.
     - L = 26 viewport scroll presses to bring Line 27 to top of Page 2.
     - Total = 2L - 1 = 51 arrow downs.
     - Asserts Top of Page 2 is Line 27 (Bottom of Page 1 + 1).
  3. Subsequent page transitions (Page n -> Page n+1 for n >= 2):
     - Cursor already rests at the bottom line of the visible page.
     - Exactly L = 26 viewport scroll presses needed.
     - Asserts Top of Page n+1 == Bottom of Page n + 1 for each page through end of document.
  4. Robustness: OCR failure recovery ensures missing bottom detection uses calibrated L = 26
     rather than arbitrary device defaults.
"""
import pytest
import asyncio
from services import state
import routers.orchestration as orch


@pytest.mark.asyncio
async def test_full_markdown_file_pagination_through_end():
    """Simulates multi-page capture loop through end of markdown file (e.g. 50 pages)."""
    L = 26  # Calibrated viewport capacity (Page 1 visible gutter: Ln 1 to Ln 26)

    # 1. Page 1 calibration
    top_1, bot_1 = orch._resolve_viewport_bounds(1, 26, 49)
    assert top_1 == 1
    assert bot_1 == 26
    assert state.orchestration_state["viewport_lines"] == 26

    cursor_line = 1
    cur_top = 1
    total_target_lines = 1300  # 50 pages of 26 lines each

    for page_num in range(1, 51):
        prev_bottom = cur_top + L - 1
        expected_target_top = prev_bottom + 1

        # Calculate expected arrow downs based on formulated logic:
        # Page 1 -> 2: (L - 1) cursor navigation + L scroll presses = 2*L - 1 = 51
        # Page n -> n+1: L scroll presses = 26
        expected_arrow_count = (2 * L - 1) if page_num == 1 else L

        res = await orch.run_single_dag_node("arrow_down", {
            "serial": "mock:9999",
            "cur_top": cur_top,
            "prev_bottom": prev_bottom,
            "cursor_line": cursor_line
        })

        assert res["status"] == "success"
        assert res["arrow_count"] == expected_arrow_count, (
            f"Page {page_num} -> {page_num+1} failed: expected {expected_arrow_count} down arrows, got {res['arrow_count']}"
        )
        assert res["target_top_line"] == expected_target_top, (
            f"Page {page_num+1} top line mismatch: expected {expected_target_top}, got {res['target_top_line']}"
        )

        # Advance state to next page
        cur_top = res["target_top_line"]
        cursor_line = res["cursor_line"]

        # Next page top must ALWAYS equal previous bottom + 1
        assert cur_top == prev_bottom + 1

    # Verified all 50 pages sequentially advanced with zero gaps and zero overlaps


@pytest.mark.asyncio
async def test_ocr_degraded_bottom_fallback_to_calibrated_capacity():
    """Verify that if gutter OCR fails to detect the bottom line on Page 2+,
    it gracefully resolves using calibrated L (26) instead of device profile (49)."""
    # Given calibrated viewport
    state.orchestration_state["viewport_lines"] = 26

    # When Page 2 OCR top is 27, but bottom detection returns 0 or degraded
    top_p2, bot_p2 = orch._resolve_viewport_bounds(27, 0, fallback_lpp=49)
    assert top_p2 == 27
    assert bot_p2 == 52  # 27 + 26 - 1 = 52 (NOT 27 + 49 - 1 = 75!)

    # When advancing Page 2 -> 3
    res_p2_to_p3 = await orch.run_single_dag_node("arrow_down", {
        "serial": "mock:9999",
        "cur_top": 27,
        "prev_bottom": bot_p2,
        "cursor_line": bot_p2
    })
    assert res_p2_to_p3["arrow_count"] == 26
    assert res_p2_to_p3["target_top_line"] == 53  # Bottom 52 + 1 = 53 for Page 3 top!


def test_formula_mathematical_consistency():
    """Validates the mathematical formula for arbitrary page counts."""
    L = 26
    for page in range(1, 100):
        # Top of page n
        expected_top = 1 + (page - 1) * L
        expected_bottom = expected_top + L - 1
        if page == 1:
            presses_to_next = (L - 1) + L
        else:
            presses_to_next = L

        next_page_top = expected_bottom + 1
        assert next_page_top == 1 + page * L
        assert presses_to_next == (51 if page == 1 else 26)
