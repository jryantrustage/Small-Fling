---
name: teams-onedrive-markdown-navigator
description: >-
  Automates waking and unlocking the Android Phone Screen (Display #0) using the
  Phone Unlock PIN 1213, opening Microsoft Teams on the Android Desktop Display,
  handling the Microsoft Teams Passcode 2992 prompt (including the Blank White
  Teams Fingerprint screen -> Escape -> Desktop PIN 2992), navigating through
  OneDrive -> Markdowns -> ficus-platform -> <bundle_folder> -> <part_file>.md,
  and assuring the Markdown editor opens in Fullscreen, Dark Mode, and
  Single-Pane Edit Mode. Strictly separates Phone Unlock PIN 1213 from Teams
  Passcode 2992 to prevent device or app lockout.
---

# Teams OneDrive Markdown Navigator & Dual-PIN Authentication Skill

## Critical Rule: Strict Separation Between Phone Unlock PIN (`1213`) and Teams Passcode (`2992`)

> [!CAUTION]
> **NEVER mix up the two PINs (`1213` vs `2992`) — mixing them up will cause an Android OS lockout or Microsoft Teams Intune lockout:**
>
> | Credential | Value | Target Display | Exact Screen / Condition | Entry Method |
> | :--- | :--- | :--- | :--- | :--- |
> | **Phone Unlock PIN** | **`1213`** | **Phone Screen (`Display #0`)** | `dumpsys window policy` has `showing=true` / `inputRestricted=true` (`com.android.systemui:id/pin_pad_grid` / `com.android.systemui:id/pinEntry`) | `input touchscreen -d 0 tap <x> <y>` on the `1080×2404` keypad (`1`: `235,1016`, `2`: `541,1016`, `1`: `235,1016`, `3`: `847,1016`, `Enter`: `847,1823`) |
> | **Teams Passcode** | **`2992`** | **Desktop Display (`Display #<ext_id>`)** | Microsoft Teams / Intune `"Enter your PIN"` (`mam_pin_prompt`) or Blank White Teams Fingerprint Screen $\rightarrow$ `Escape` (`keyevent 111`) $\rightarrow$ `"Enter your PIN"` | `input -d <ext_id> text 2992` + `Enter` (`keyevent 66`) |

---

## Overview

This skill automates unlocking the phone, authenticating Microsoft Teams, and opening or recovering a target Markdown file inside a multi-part bundle on the external Android Desktop Display (`Display #<ext_id>`):

1. **Phone Screen Wake & Unlock (`1213` on `Display #0` ONLY)**:
   - Wakes `Display #0` (`input -d 0 keyevent 224`) and checks `detect_phone_lockscreen_state`.
   - **Only when `showing=true` or `inputRestricted=true`**, kills any background `uiautomator` process (`pkill -f uiautomator || true`), brings up the Android SystemUI Keyguard bouncer, clears any partial digits (`DEL` at `235, 1823`), and taps **`1213`** + `Enter` via `input touchscreen -d 0 tap`.
   - **Never** enters `2992` on the Android Phone Lockscreen!
2. **Teams Passcode `2992` Authentication (Teams Prompt ONLY)**:
   - Directs HID to the Desktop Display (`Display #<ext_id>`) and opens/focuses the Microsoft Teams app (`com.microsoft.teams/com.microsoft.skype.teams.Launcher`).
   - When Microsoft Teams on the Desktop Display shows the **Blank White Teams Fingerprint Screen** (`"Teams"` header at top-left over a blank white window while the phone prompts `"Access Teams"` / `"Touch the fingerprint sensor"`), sends `Escape` (`keyevent 111`) to dismiss the biometric prompt and display `"Enter your PIN"`, then enters Teams Passcode **`2992`** into the verified Teams `"Enter your PIN"` field and clicks `OK` / `Enter`.
   - **Never** enters `1213` into the Teams PIN prompt, and **never** enters `2992` into the Markdown editor!
3. **Teams OneDrive Folder Path Navigation**:
   - Navigates step-by-step inside Microsoft Teams on the Desktop Display through the OneDrive folder hierarchy:
     $$\text{Teams App} \rightarrow \texttt{"OneDrive"} \rightarrow \texttt{"Markdowns"} \rightarrow \texttt{"ficus-platform"} \rightarrow \texttt{"<bundle\_folder>"} \rightarrow \texttt{"<target\_file>.md"}$$
   - Catalogs all markdown parts in the bundle folder (`MD 1 / N .. MD N / N`) into `multipart_bundle_state["predetermined_parts"]` for the Process Scope Queue.
   - Re-checks for the Teams PIN `2992` prompt at each transition step.
4. **Fullscreen + Dark Mode + Edit Mode Assurance**:
   - Assures the Markdown editor opens on the Desktop Display.
   - Maximizes the Teams Markdown editor window to **Fullscreen** if floating (`_detect_floating_teams_window_cv` / `is_editor_full_screen`).
   - Assures **Dark Mode** is enabled (Moon icon in the formatting toolbar).
   - Assures **Single-Pane Edit Mode** is active (Pencil icon in the formatting toolbar, closing any Side-by-Side preview pane) so gutter line numbers (`1..N`) are crisp and aligned.

---

## Quick Start

Run the helper CLI script [navigate_teams_markdown.py](./scripts/navigate_teams_markdown.py) to perform the full operation (Phone wake/unlock with `1213` if locked $\rightarrow$ Teams auth with `2992` if prompted $\rightarrow$ OneDrive navigation $\rightarrow$ Fullscreen Dark Edit Mode) for a specific bundle and markdown file:

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py full-run `
  --bundle "DIXUI_impact_26-11-05-9-43pm" `
  --file "DIXUI_impact_26-11-05-9-43pm_part5.md" `
  --part 5 `
  --phone-pin 1213 `
  --pin 2992 `
  --output storage/navigation_result.json
```

Or call the live FastAPI endpoint directly:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/device/navigate-onedrive-markdown" `
  -ContentType "application/json" `
  -Body '{"bundle_folder_name":"DIXUI_impact_26-11-05-9-43pm","target_file_name":"DIXUI_impact_26-11-05-9-43pm_part5.md","target_part_number":5,"open_editor":true}'
```

---

## Utility Scripts

The CLI script [scripts/navigate_teams_markdown.py](./scripts/navigate_teams_markdown.py) provides four subcommands (all writing structured JSON results to `--output`):

### 1. `full-run`
Opens Teams on the Desktop Display, handles the Teams PIN `2992` prompt if shown, navigates `"OneDrive"` $\rightarrow$ `"Markdowns"` $\rightarrow$ `"ficus-platform"` $\rightarrow$ `<bundle>` $\rightarrow$ `<file>`, and assures the Markdown editor is in Fullscreen + Dark Mode + Edit Mode.

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py full-run `
  --bundle "DIXUI_impact_26-11-05-9-43pm" `
  --file "DIXUI_impact_26-11-05-9-43pm_part5.md" `
  --part 5 `
  --pin 2992 `
  --output storage/nav_full_run.json
```

### 2. `auth-teams-pin`
Checks the Desktop Display screenshot via `detect_teams_auth_or_fingerprint_screen_cv` and, if Teams is prompting for authentication (Blank White Teams Fingerprint screen or `"Enter your PIN"`), sends `Escape` (if needed) and enters PIN `2992` on the Desktop Display.

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py auth-teams-pin `
  --pin 2992 `
  --output storage/auth_result.json
```

### 3. `navigate`
Navigates from the Teams app through `"OneDrive"` $\rightarrow$ `"Markdowns"` $\rightarrow$ `"ficus-platform"` $\rightarrow$ `<bundle>` $\rightarrow$ `<file>`, handling any Teams PIN `2992` prompt along the way.

```powershell
python .agents/skills/teams-onedrive-markdown-navigator/scripts/navigate_teams_markdown.py navigate `
  --bundle "DIXUI_impact_26-11-05-9-43pm" `
  --file "DIXUI_impact_26-11-05-9-43pm_part5.md" `
  --part 5 `
  --output storage/nav_only.json
```

### 4. `prepare-editor`
Verifies and enforces that the open Teams Markdown editor on the Desktop Display is maximized to **Fullscreen**, switched to **Dark Mode**, and in **Single-Pane Edit Mode** (and checks the Undo `↶` button state).

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

## Common Mistakes to Avoid

1. **Never Enter `2992` on the Phone Display (`Display #0`) or in the Markdown Editor**:
   - Always capture explicitly from the Desktop Display (`capture_display_screenshot("desktop")`) and verify `detect_teams_auth_or_fingerprint_screen_cv(img)["detected"] == True` before sending `2992`.
2. **Always Check for Teams PIN Prompt After Opening Teams or Tapping a Markdown File**:
   - Microsoft Teams may display the Blank White Fingerprint screen or `"Enter your PIN"` either when launching Teams or when opening a `.md` file from OneDrive. Always run `_ensure_teams_authenticated_if_needed` before and after tapping the file.
3. **Preserve Native Desktop Density (`131` DPI on `1280x1024`)**:
   - Do not override desktop density to `220` DPI during navigation, as `wm density` recreates the Teams activity surface and hides the Undo (`↶`) button.
