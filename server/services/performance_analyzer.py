import json
from typing import Dict, Any, List, Optional
from datetime import datetime

def analyze_node_performance(node_id: str, dag_state: Dict[str, Any], telemetry: Dict[str, Any]) -> Dict[str, Any]:
    nodes = dag_state.get("nodes", {})
    node = nodes.get(node_id, {})
    timings = node.get("timings") or {}
    node_err = node.get("error")
    is_error = node.get("status") == "error" or bool(node_err)

    duration_ms = timings.get("duration_ms") or node.get("duration_ms")
    precheck_ms = timings.get("precheck_ms", 0)
    action_ms = timings.get("action_ms", 0)
    healing_ms = timings.get("healing_ms", 0)

    capture_tel = telemetry.get("capture_telemetry", {})
    capture_rtt_ms = capture_tel.get("last_latency_ms", 0)
    ocr_latency_ms = telemetry.get("ocr_latency_ms", 0) or 45
    pacer_calib = telemetry.get("pacer_calibration", {})
    auto_tune_factor = pacer_calib.get("auto_tune_factor", 1.0)
    wrapped_lines = pacer_calib.get("wrapped_lines_detected", 0)

    total = duration_ms or (precheck_ms + action_ms + healing_ms) or 1
    precheck_pct = round((precheck_ms / total) * 100, 1) if total else 0.0
    action_pct = round((action_ms / total) * 100, 1) if total else 0.0
    healing_pct = round((healing_ms / total) * 100, 1) if total else 0.0

    evidence = []
    remediations = []
    category = "HEALTHY"
    title = "Pipeline Execution Healthy & Nominal"
    severity = "healthy"
    summary = f"Node '{node_id}' executed within normal operational boundaries ({duration_ms or total}ms)."

    # 1. Unresolved Hard Error
    if is_error:
        category = "UNRESOLVED_ERROR"
        severity = "critical"
        title = f"Hard Failure in Node '{node_id}'"
        summary = f"Node encountered a blocking failure: {node_err or 'Unknown exception'}"
        evidence.append(f"Node status is 'error': {node_err}")
        if node.get("trace_insights"):
            for ti in node["trace_insights"]:
                evidence.append(ti)
        remediations.append("Inspect trace insights and execute recommended ADB remediation commands.")
        remediations.append("Verify display focus and ensure software keyboard is suppressed.")

    # 2. Auto-Healing Churn & Focus Interception
    elif healing_ms > 2500 or (total > 1500 and healing_pct > 35):
        category = "AUTO_HEALING_CHURN"
        severity = "critical" if healing_ms > 5000 else "warning"
        title = "Auto-Healing Recovery Churn & Focus Interception"
        summary = f"Auto-healing consumed {healing_ms}ms ({healing_pct}% of node duration), indicating repeated focus or keyboard recovery."
        evidence.append(f"Auto-healing took {healing_ms}ms out of {total}ms total execution time ({healing_pct}%).")
        evidence.append(f"Current Evaluator: {node.get('evaluator', 'Standard Evaluator')}")
        if node.get("healing_step"):
            evidence.append(f"Last Healing Action: {node.get('healing_step')}")
        if telemetry.get("keyboard_visible"):
            evidence.append("Soft keyboard (IME) was detected active on display during execution.")
        remediations.append("Enforce persistent soft keyboard suppression (`settings put secure show_ime_with_hard_keyboard 0`).")
        remediations.append("Prevent activity re-creation: avoid unconditional `am start` calls when window is already focused.")
        remediations.append("Check `dumpsys input_method` to ensure InputMethodManager window does not retain active focus.")

    # 3. OCR / Vision Inference Bottleneck
    elif (node_id in ("local_ai_ocr", "frame_ocr") and (action_ms > 2500 or ocr_latency_ms > 1500)) or ocr_latency_ms > 2500:
        category = "OCR_BOTTLENECK"
        severity = "critical" if (ocr_latency_ms > 3500 or action_ms > 4000) else "warning"
        title = "OCR / Multimodal Vision Inference Latency Spike"
        summary = f"OCR inference took {ocr_latency_ms or action_ms}ms per frame, creating an upstream throughput bottleneck."
        evidence.append(f"OCR inference latency measured at {ocr_latency_ms or action_ms}ms (nominal baseline: < 350ms).")
        evidence.append(f"Active OCR Engine / Model: {telemetry.get('active_pipeline_mode', 'local')}")
        remediations.append("Crop inference region strictly to the numeric line gutter (x: 0-250px) rather than scanning full 1080p frame.")
        remediations.append("Verify Ollama model concurrency and check CPU/GPU offload thread count.")
        remediations.append("Consider switching gutter line reading to lightweight ONNX RapidOCR and reserving Vision LLM for verbatim text.")

    # 4. ADB Screencap Transport Overhead
    elif (node_id == "frame_acquire" and (action_ms > 800 or capture_rtt_ms > 350)) or capture_rtt_ms > 500:
        category = "ADB_SCREENSHOT_OVERHEAD"
        severity = "warning"
        title = "ADB Transport & Screencap RTT Latency"
        summary = f"ADB screenshot capture took {capture_rtt_ms or action_ms}ms per frame (nominal: < 80ms over USB, < 150ms over Wi-Fi)."
        evidence.append(f"Screencap round-trip time: {capture_rtt_ms or action_ms}ms.")
        evidence.append(f"Target Display ID: {capture_tel.get('display_id', 'External Desktop')}")
        evidence.append(f"Payload Size: {round((capture_tel.get('frame_bytes', 0) / 1024), 1)} KB.")
        remediations.append("Cache SurfaceFlinger display IDs to eliminate sequential `dumpsys SurfaceFlinger` queries.")
        remediations.append("Ensure ADB over USB (5000000 baud) or switch Wi-Fi to 5GHz low-latency band.")
        remediations.append("Enable hot frame memory cache reuse when viewport has not moved.")

    # 5. Environment Precheck Delay
    elif precheck_ms > 3000 or (total > 2000 and precheck_pct > 40):
        category = "PRECHECK_BLOCKING"
        severity = "warning"
        title = "Sequential Environment Precheck Blocking"
        summary = f"Prechecks required {precheck_ms}ms ({precheck_pct}% of total execution) before node action began."
        evidence.append(f"Precheck phase duration: {precheck_ms}ms.")
        remediations.append("Run independent environment classifiers concurrently via `asyncio.gather()`.")
        remediations.append("Skip environment healing (`skip_env_heal=True`) after first successful cycle.")

    # 6. Viewport Pacing / Settle Delay
    elif node_id == "arrow_down" and (duration_ms and duration_ms > 2000):
        category = "VIEWPORT_SCROLL_LAG"
        severity = "warning"
        title = "Viewport Scroll & Animation Settle Latency"
        summary = f"Pacer dwell and viewport settling took {duration_ms}ms."
        evidence.append(f"Pacer auto-tune factor: {auto_tune_factor}x.")
        evidence.append(f"Wrapped lines detected: {wrapped_lines}.")
        remediations.append("Tune settle delay: lower default settle delay from 300ms to 150ms.")
        remediations.append("Detect scroll velocity stop via 2-frame optical difference rather than fixed timers.")

    if not evidence:
        evidence.append(f"Total node runtime: {duration_ms or total}ms.")
        evidence.append(f"Precheck: {precheck_ms}ms ({precheck_pct}%), Action: {action_ms}ms ({action_pct}%), Healing: {healing_ms}ms ({healing_pct}%).")
        evidence.append(f"OCR latency: {ocr_latency_ms}ms, Screen grab latency: {capture_rtt_ms}ms.")

    if not remediations:
        remediations.append("Maintain existing calibration parameters and continue monitoring loop timings.")

    return {
        "node_id": node_id,
        "title": title,
        "category": category,
        "severity": severity,
        "summary": summary,
        "evidence": evidence,
        "remediations": remediations,
        "metrics": {
            "duration_ms": duration_ms or total,
            "precheck_ms": precheck_ms,
            "action_ms": action_ms,
            "healing_ms": healing_ms,
            "ocr_latency_ms": ocr_latency_ms,
            "capture_rtt_ms": capture_rtt_ms,
            "precheck_pct": precheck_pct,
            "action_pct": action_pct,
            "healing_pct": healing_pct
        }
    }


def generate_ai_resolution_prompt(analysis: Dict[str, Any], dag_state: Dict[str, Any], telemetry: Dict[str, Any]) -> str:
    node_id = analysis.get("node_id", "active_node")
    node = dag_state.get("nodes", {}).get(node_id, {})
    metrics = analysis.get("metrics", {})
    
    evidence_lines = "\n".join(f"- {e}" for e in analysis.get("evidence", []))
    remediation_lines = "\n".join(f"{idx+1}. {r}" for idx, r in enumerate(analysis.get("remediations", [])))

    prompt = f"""# 🛠️ System Performance Degradation Resolution Prompt

## Objective
Analyze the root cause of latency and performance degradation in the Small-Fling pagination & markdown extraction DAG pipeline, and implement code/configuration optimizations to resolve the bottleneck.

---

## 📌 Executive Summary
- **Target Node:** {node.get('title', node_id)} (`{node_id}`)
- **Group:** {node.get('group', 'initialize')}
- **Primary Root Cause Category:** `{analysis.get('category')}`
- **Diagnosis:** {analysis.get('title')}
- **Severity Level:** `{analysis.get('severity', 'warning').upper()}`
- **Execution Duration:** {metrics.get('duration_ms') or 'N/A'}ms ({round((metrics.get('duration_ms') or 0)/1000, 2)}s)
- **Status:** `{node.get('status', 'idle').upper()}`

### Summary
> {analysis.get('summary')}

---

## ⏱️ Detailed Latency & Phase Breakdown
| Phase | Duration | Percentage of Node Time | Target Baseline | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Total Duration** | {metrics.get('duration_ms') or 0}ms | 100% | < 1,500ms | {'⚠️ Degraded' if (metrics.get('duration_ms') or 0) > 1500 else '✔ Normal'} |
| **Environment Precheck** | {metrics.get('precheck_ms', 0)}ms | {metrics.get('precheck_pct', 0)}% | < 200ms | {'⚠️ High' if metrics.get('precheck_ms', 0) > 800 else '✔ Normal'} |
| **Primary Node Action** | {metrics.get('action_ms', 0)}ms | {metrics.get('action_pct', 0)}% | < 800ms | {'⚠️ High' if metrics.get('action_ms', 0) > 1200 else '✔ Normal'} |
| **Auto-Healing Recovery** | {metrics.get('healing_ms', 0)}ms | {metrics.get('healing_pct', 0)}% | 0ms | {'⛔ Excessive' if metrics.get('healing_ms', 0) > 2000 else ('⚠️ Present' if metrics.get('healing_ms', 0) > 0 else '✔ None')} |
| **OCR Vision Latency** | {metrics.get('ocr_latency_ms', 0)}ms | — | < 350ms | {'⚠️ Sluggish' if metrics.get('ocr_latency_ms', 0) > 1000 else '✔ Normal'} |
| **ADB Screencap RTT** | {metrics.get('capture_rtt_ms', 0)}ms | — | < 120ms | {'⚠️ High RTT' if metrics.get('capture_rtt_ms', 0) > 300 else '✔ Normal'} |

---

## 🔍 Root Cause Analysis & Diagnostic Evidence
{evidence_lines}

### Environmental & Device Context
- **Active Device Serial:** `{telemetry.get('device_id') or 'Connected ADB Device'}`
- **Target Display ID:** `{telemetry.get('capture_telemetry', {}).get('display_id') or 'External Desktop'}`
- **Active Density / DPI:** `{telemetry.get('capture_telemetry', {}).get('active_dpi', 120)} DPI` (`{telemetry.get('capture_telemetry', {}).get('dpi_factor', 0.75)}x`)
- **Keyboard Suppressed / Guarded:** `{telemetry.get('keyboard_visible') is False}`
- **Current Top Line:** `Ln {telemetry.get('current_top_line', 0)}`
- **Current Bottom Line:** `Ln {telemetry.get('current_bottom_line', 0)}`
- **Target Total Lines:** `{telemetry.get('target_total_lines', 0)}`

---

## 💻 Relevant Source Files & Code Architecture
- **Pipeline Orchestration & Timing:** [`server/routers/orchestration.py`](file:///c:/Projects/Small-Fling/server/routers/orchestration.py)
- **ADB & Display Subsystem:** [`server/services/adb_service.py`](file:///c:/Projects/Small-Fling/server/services/adb_service.py)
- **Classifiers & Viewport Healing:** [`server/classifiers/editor_classifiers.py`](file:///c:/Projects/Small-Fling/server/classifiers/editor_classifiers.py)
- **Local OCR & Vision Inference:** [`server/services/ocr_service.py`](file:///c:/Projects/Small-Fling/server/services/ocr_service.py)
- **Frontend DAG State & Diagnostics:** [`web/src/FlowDag.tsx`](file:///c:/Projects/Small-Fling/web/src/FlowDag.tsx)

---

## 🎯 Recommended Action Plan for AI
Please examine the evidence above and apply the following targeted remediations:
{remediation_lines}

### Expected Outcome
After applying the fixes, verify that:
1. Node `{node_id}` execution time drops below 1,500ms.
2. Auto-healing churn is eliminated during steady-state loops.
3. OCR inference and screencap round-trips meet target baselines.
"""
    return prompt.strip()
