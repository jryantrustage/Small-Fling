---
name: teams-onedrive-markdown-navigator
description: >-
  Automates opening Microsoft Teams on the Android Desktop Display, handling
  PIN 2992 authentication safely, navigating through OneDrive -> Markdowns ->
  ficus-platform -> <bundle_folder> -> <part_file>.md, and ensuring the
  Markdown editor opens in Fullscreen, Dark Mode, and Single-Pane Edit Mode.
  Use when opening, switching, or recovering a multi-part Markdown bundle file
  in Teams OneDrive.
---

# Teams OneDrive Markdown Navigator & Editor Preparation Skill

## Overview

This skill automates the end-to-end operation of opening or recovering a target Markdown file inside a multi-part bundle in Microsoft Teams on the external Android Desktop Display:

1. **PIN `2992` Authentication**:
   - If the Android OS Keyguard bouncer (`element:BouncerContent` / `com.android.systemui:id/pin_pad_grid` with `KeyguardServiceDelegate showing=true`) is locking the display, unlocks the verified SystemUI PIN pad using `2992` (with $\ge 400\text{ ms}$ inter-tap spacing so double-Digits like `99` are not coalesced into a double-tap).
   - If Microsoft Teams on the Desktop Display (`Display #<ext_id>`) shows the **Blank White Teams Fingerprint Screen**, sends `Escape` (`keyevent 111`) to prompt for the desktop PIN, then enters `2992` into the verified Teams `"Enter your PIN"` field.
   - **Strict Safety Guard**: Never types `2992` into the Markdown editor (`body_mean < 200` or gutter line numbers present) or into non-keyguard phone apps.
2. **Teams OneDrive Folder Path Navigation**:
   - Opens/focuses Microsoft Teams (`com.microsoft.teams`) on the external Desktop Display (`--display <ext_id>`).
   - Navigates step-by-step through the OneDrive folder hierarchy:
     $$\text{Teams App} \rightarrow \texttt{"OneDrive"} \rightarrow \texttt{"Markdowns"} \rightarrow \texttt{"ficus-platform"} \rightarrow \texttt{"<bundle\_folder>"} \rightarrow \texttt{"<target\_file>.md"}$$
   - Catalogs all markdown parts in the bundle folder (`MD 1 / N .. MD N / N`) into the Process Scope Queue.
3. **Fullscreen + Dark Mode + Edit Mode Assurance**:
   - Maximizes the Teams Markdown editor window if floating (`_detect_floating_teams_window_cv` / `is_editor_full_screen`).
   - Switches the theme to **Dark Mode** (Moon icon in toolbar).
   - Switches the editor to **Single-Pane Edit Mode** (Pencil icon in toolbar, closing any Side-by-Side preview pane) so gutter line numbers (`1..N`) are crisp and aligned.

---

## Quick Start

Run the helper CLI script [navigate_teams_markdown.py](./scripts/navigate_teams_markdown.py) to perform the full operation for a specific bundle and markdown file:

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py full-run `
  --bundle "DIXUI_impact_26-11-05-9-43pm" `
  --file "DIXUI_impact_26-11-05-9-43pm_part5.md" `
  --part 5 `
  --pin 2992 `
  --output storage/navigation_result.json
```

Or invoke the live backend endpoint directly:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/device/navigate-onedrive-markdown" `
  -ContentType "application/json" `
  -Body '{"bundle_folder_name":"DIXUI_impact_26-11-05-9-43pm","target_file_name":"DIXUI_impact_26-11-05-9-43pm_part5.md","target_part_number":5,"open_editor":true}'
```

---

## Utility Scripts

The CLI script [scripts/navigate_teams_markdown.py](./scripts/navigate_teams_markdown.py) provides four subcommands (all writing structured JSON to `--output`):

### 1. `full-run`
Executes PIN `2992` unlock/authentication, navigates `Teams -> OneDrive -> Markdowns -> ficus-platform -> <bundle> -> <file>`, and enforces Fullscreen + Dark Mode + Edit Mode.

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py full-run `
  --bundle "DIXUI_impact_26-11-05-9-43pm" `
  --file "DIXUI_impact_26-11-05-9-43pm_part5.md" `
  --part 5 `
  --output storage/nav_full_run.json
```

### 2. `unlock-and-auth`
Verifies and unlocks the SystemUI Keyguard (`showing=true` + `com.android.systemui:id/pin_pad_grid`) or Teams MAM PIN prompt (`Enter your PIN`) using PIN `2992`.

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py unlock-and-auth `
  --pin 2992 `
  --output storage/auth_result.json
```

### 3. `navigate`
Navigates from the Teams main screen through `"OneDrive"` $\rightarrow$ `"Markdowns"` $\rightarrow$ `"ficus-platform"` $\rightarrow$ `<bundle>` $\rightarrow$ `<file>`.

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py navigate `
  --bundle "DIXUI_impact_26-11-05-9-43pm" `
  --file "DIXUI_impact_26-11-05-9-43pm_part5.md" `
  --part 5 `
  --output storage/nav_only.json
```

### 4. `prepare-editor`
Verifies that the currently open Teams Markdown editor on the Desktop Display is maximized to **Fullscreen**, switched to **Dark Mode**, and in **Single-Pane Edit Mode** (with Undo `↶` button check if accidental edits occurred).

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py prepare-editor `
  --output storage/prepare_editor.json
```

---

## Key Codebase References

- [`navigate_teams_onedrive_path_to_markdown`](file:///c:/Projects/Small-Fling/server/services/ui_automator_service.py#L1697-L1995): Core OCR + UI Automator multi-hop navigator in [`server/services/ui_automator_service.py`](file:///c:/Projects/Small-Fling/server/services/ui_automator_service.py).
- [`prepare_markdown_editor_window`](file:///c:/Projects/Small-Fling/server/services/ui_automator_service.py#L465-L610): Enforces Fullscreen, Dark Mode, and Single-Pane Edit Mode.
- [`detect_teams_auth_or_fingerprint_screen_cv`](file:///c:/Projects/Small-Fling/server/services/adb_service.py#L809-L968) & [`auto_handle_pin_authentication`](file:///c:/Projects/Small-Fling/server/services/adb_service.py#L1099-L1272): Safe Teams PIN `2992` handler in [`server/services/adb_service.py`](file:///c:/Projects/Small-Fling/server/services/adb_service.py).
- [`MarkdownFileChangeNode`](file:///c:/Projects/Small-Fling/server/dag_nodes/markdown_file_change_node.py#L23-L190): DAG Node 0 (`0. Markdown File Change`) that orchestrates folder scanning and automatic multi-part transitions.

---

## Common Pitfalls & Safety Rules

1. **Inter-Tap Delay on Repeated Digits (`9` $\rightarrow$ `9` in `2992`)**:
   - When tapping `2992` on a Compose PIN pad (`com.android.systemui:id/pin_pad_grid`), always wait $\ge 400\text{ ms}$ between taps so the two taps on `9` are not interpreted by Android's `DoubleTapTimeout` ($300\text{ ms}$) as a single double-tap gesture.
2. **Never Type `2992` Into the Markdown Editor**:
   - Always check `detect_teams_auth_or_fingerprint_screen_cv(img)` before sending `input -d <ext_id> text 2992`. Dark-mode editors (`body_mean < 200`) and screens with gutter line numbers must never receive PIN keystrokes.
3. **Preserve Native Desktop Density (`131` DPI on `1280x1024`)**:
   - Do not override desktop density to `220` DPI during navigation, as `wm density` recreates the Teams activity surface and hides the Undo (`↶`) button.
