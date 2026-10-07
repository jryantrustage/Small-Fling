# Test Image Fixtures & Ground-Truth Reference Assets

This directory contains organized, curated test image assets for end-to-end verification, DAG calibration, and OCR regression testing across Small-Fling.

## Directory Structure

```
tests/test_images/
├── dag_calibration/
│   ├── dag1_baseline_home.png        # Line 1 baseline verification in gutter OCR
│   ├── dag1_final_success.png        # Successful Ctrl+End EOF state & last line detection
│   └── dag_target32_check.png        # Target line positioning verification
├── device_profiles/
│   ├── pixel8_pro_desktop.png        # Pixel 8 Pro external desktop display (Display 4, 31 lines/page)
│   └── pixel10_pro_xl_desktop.png    # Pixel 10 Pro XL external desktop display (Display 9, 47 lines/page)
├── editor_states/
│   ├── editor_dark_mode.jpg          # Dark mode active theme verification in Teams Markdown editor
│   ├── editor_freeform_menu.jpg      # Context / action dropdown with freeform mode selected
│   ├── editor_fullscreen.png         # Fullscreen mode verification
│   ├── editor_reading_mode.jpg       # Settled reading / preview mode
│   └── editor_toolbar.png            # Main editor action toolbar
├── navigation/
│   ├── nav_after_ctrl_end.png        # Viewport after Ctrl+End HID combination
│   ├── nav_after_fling.png           # Viewport after vertical fling gesture
│   ├── nav_after_pgdn.png            # Viewport after Page Down keystroke
│   └── nav_after_swipe.png           # Viewport after directional swipe gesture
└── ui_crops/
    ├── gutter_slice.png              # Isolated code gutter line number region for OCR testing
    ├── pencil_icon_crop.png          # Edit mode pencil icon template for feature matching
    ├── scrollbar_crop.png            # Scrollbar track / thumb position indicator
    └── toolbar_crop.png              # Action button toolbar crop
```

## Guidelines
- Avoid committing ad-hoc intermediate screencaps directly into root or `server/`.
- Temporary scratch captures must use `scratch/` or `server/storage/frames/` and be cleaned up after tests.
