import type { NodeMeta, PerformanceDiagnosis, DagStatusData, NodeLiveStatus } from '../types/dag';

/**
 * Modern, robust clipboard copy with fallback using built-in browser APIs
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Filter telemetry events specifically matching a DAG node
 */
export function filterNodeTelemetry(nodeId: string, ev: { message?: string; category?: string }): boolean {
  const msg = (ev.message || '').toLowerCase();
  const cat = (ev.category || '').toUpperCase();

  const matchers: Record<string, () => boolean> = {
    markdown_file_change: () => msg.includes('markdown_file_change') || msg.includes('file change') ||
      msg.includes('folder') || msg.includes('multi-part') || msg.includes('part ') || msg.includes('bundle'),
    init_end: () => msg.includes('init') || msg.includes('calibrat') || msg.includes('ctrl+end') ||
      msg.includes('end') || msg.includes('eof') || msg.includes('node 1') || msg.includes('total_lines'),
    reset_home: () => msg.includes('home') || msg.includes('ctrl+home') || msg.includes('node 2') ||
      msg.includes('line 1') || msg.includes('reset_home'),
    frame_acquire: () => msg.includes('frame_acquire') || msg.includes('capture') || msg.includes('screenshot') ||
      msg.includes('grab') || msg.includes('node 3') || cat === 'FRAME',
    local_ai_ocr: () => msg.includes('local_ai') || msg.includes('minicpm') || msg.includes('rapidocr') || msg.includes('onnx') ||
      msg.includes('ai ocr') || msg.includes('node 4') || msg.includes('node 3b') || msg.includes('verbatim'),
    frame_ocr: () => msg.includes('frame_ocr') || msg.includes('gutter') || msg.includes('line reader') ||
      msg.includes('node 5') || msg.includes('node 4') || (cat === 'OCR' && !msg.includes('local_ai')),
    arrow_down: () => msg.includes('arrow_down') || msg.includes('down arrow') || msg.includes('arrow') ||
      msg.includes('step') || msg.includes('pacer') || msg.includes('node 6') || msg.includes('node 5') || cat === 'PACER',
    verification_trigger: () => msg.includes('verification_trigger') || msg.includes('qualifier') || msg.includes('trigger') ||
      msg.includes('loopback') || msg.includes('decision') || msg.includes('node 7') || msg.includes('node 6'),
    document_assemble: () => msg.includes('assemble') || msg.includes('markdown') || msg.includes('reconstruct') ||
      msg.includes('node 8') || msg.includes('complete'),
    batch_frames_ocr: () => msg.includes('batch') || msg.includes('rescan') || msg.includes('sequential') ||
      msg.includes('node 9') || msg.includes('reconstructed.md')
  };

  return matchers[nodeId] ? matchers[nodeId]() : true;
}

/**
 * DRY computation of live status for any DAG node
 */
export function calculateNodeLiveStatus(
  nodeId: string,
  dagStatus: DagStatusData,
  activeRunningId: string | null,
  targetTotalLines = 0
): NodeLiveStatus {
  const nodeData = dagStatus.dag?.nodes?.[nodeId] || {};
  const backendActiveNode = dagStatus.dag?.current_active_node || dagStatus.active_node || '';
  const isLoopActive = Boolean(dagStatus.loop_running || dagStatus.loop_diagnosis?.loop_running);
  const isThisActive =
    activeRunningId === nodeId ||
    nodeData.status === 'active' ||
    nodeData.status === 'running' ||
    (isLoopActive && backendActiveNode === nodeId);
  const startedAt = nodeData.started_at || null;
  const finishedAt = nodeData.finished_at || null;
  const durationMs = typeof nodeData.duration_ms === 'number' ? nodeData.duration_ms : null;
  const healingStep = nodeData.healing_step || null;
  const evaluator = nodeData.evaluator || null;
  const telemetryInsight = nodeData.telemetry_insight || null;
  const timings = nodeData.timings || null;
  const dagContext = nodeData.dag_context || null;
  const traceInsights = Array.isArray(nodeData.trace_insights) ? nodeData.trace_insights : null;
  const nodeError = nodeData.error || null;
  const hasError = Boolean(nodeData.status === 'error' || nodeError);

  if (nodeData.status === 'aborted') {
    return {
      isRunning: false, isActive: false, isError: true, isAborted: true, isDone: false,
      statusLabel: 'ABORTED', metricLabel: nodeError ? 'Aborted ⏹' : 'Aborted',
      evaluator: evaluator || 'Abort Evaluator', healingStep: null, telemetryInsight: 'Execution aborted by user',
      color: '#e3b341', startedAt, finishedAt, durationMs, timings, dagContext, traceInsights, nodeError
    };
  }

  const effectiveTotal = dagStatus.target_total_lines !== undefined ? dagStatus.target_total_lines : targetTotalLines;
  const effectiveTop = dagStatus.current_top_line !== undefined ? dagStatus.current_top_line : 1;
  const diagFrontier = dagStatus.loop_diagnosis?.frontier_line || 0;
  const effectiveBottom = Math.max(
    dagStatus.current_bottom_line ?? 0,
    diagFrontier,
    dagStatus.dag?.nodes?.frame_ocr?.bottom_line ?? 0
  );
  const nextTargetTop = Math.max(1, effectiveBottom + 1);

  // Dynamic overrides per node type
  let isDone = false;
  let isError = hasError;
  let statusLabel = isThisActive ? 'RUNNING' : 'IDLE';
  let metricLabel = healingStep || '';
  let defaultEvaluator = 'Standard Evaluator';
  let defaultInsight: string | null = null;
  let color = '#8b949e';

  switch (nodeId) {
    case 'markdown_file_change': {
      const isMfcDone = !isError && nodeData.status === 'completed';
      isDone = isMfcDone;
      const curPart = Number(nodeData.current_part || 1);
      const totParts = Number(nodeData.total_parts || (Array.isArray(nodeData.predetermined_parts) ? nodeData.predetermined_parts.length : 1) || 1);
      const filesCount = Array.isArray(nodeData.detected_files) ? nodeData.detected_files.length : (Array.isArray(nodeData.predetermined_parts) ? nodeData.predetermined_parts.length : 0);
      const bundleDone = Boolean(nodeData.bundle_completed);
      const partLabel = nodeData.part_progress_label || `MD ${curPart} / ${totParts}`;
      defaultEvaluator = 'Folder Queue & Part Switch Evaluator';
      metricLabel = healingStep || (
        isThisActive
          ? (nodeData.mode === 'switch_next' ? `Switching ${partLabel}...` : 'Scanning Folder...')
          : (filesCount > 0 || totParts > 1 ? `${partLabel} (${filesCount || totParts} Files)` : (isMfcDone ? partLabel : 'Scan Folder Queue'))
      );
      statusLabel = isThisActive
        ? (nodeData.mode === 'switch_next' ? 'SWITCHING' : 'SCANNING')
        : (isError ? 'FAILED' : (bundleDone ? 'BUNDLE EOF' : (isMfcDone ? (nodeData.mode === 'switch_next' ? 'SWITCHED' : 'QUEUED') : 'READY')));
      defaultInsight = bundleDone
        ? `All ${totParts} bundle markdown files completed -> Handed off to Phase III`
        : (isMfcDone
            ? `Folder queue active (${partLabel}): ${nodeData.active_file_name || 'Fullscreen + Dark Mode verified'}`
            : 'Scans Teams/OneDrive folder queue & switches markdown files on EOF');
      color = isError ? '#ff7b72' : (isMfcDone ? '#00ff9d' : '#d2a8ff');
      break;
    }
    case 'init_end': {
      const isCalibrated = !isError && nodeData.status === 'completed' && (nodeData.total_lines || 0) > 0;
      isDone = isCalibrated;
      defaultEvaluator = 'EOF Gutter Evaluator';
      metricLabel = isCalibrated ? `${nodeData.total_lines.toLocaleString()} Lines` : (healingStep || evaluator || 'Auto Detect');
      statusLabel = isThisActive ? (healingStep ? 'HEALING' : 'CALIBRATING') : (isCalibrated ? 'CALIBRATED' : (isError ? (healingStep ? 'HEALING' : 'EVALUATED') : 'NOT RUN'));
      defaultInsight = isCalibrated ? `Calibrated ${nodeData.total_lines} total lines at EOF` : (healingStep || 'Ctrl+End calibration');
      color = isError ? (healingStep ? '#ffa657' : '#ff7b72') : (isCalibrated ? '#00ff9d' : '#58a6ff');
      break;
    }
    case 'reset_home': {
      const isVerified = nodeData.status === 'completed' && Boolean(nodeData.verified);
      isDone = isVerified;
      isError = nodeData.status === 'error' || (nodeData.status === 'completed' && !nodeData.verified);
      defaultEvaluator = 'Line 1 Gutter Evaluator';
      metricLabel = isVerified ? 'Line 1 Verified' : (healingStep || (isThisActive ? 'Verifying Line 1' : 'Verify Line 1'));
      statusLabel = isThisActive ? (healingStep ? 'HEALING' : 'RESETTING') : (isVerified ? 'VERIFIED' : (isError ? 'FAILED' : 'READY'));
      defaultInsight = isVerified ? 'Line 1 verified at top gutter' : (healingStep || 'Ctrl+Home top alignment');
      color = isVerified ? '#00ff9d' : (isError ? (healingStep ? '#ffa657' : '#ff7b72') : '#a371f7');
      break;
    }
    case 'frame_acquire': {
      isDone = !isError && nodeData.status === 'completed';
      defaultEvaluator = 'Display Frame Acquisition Evaluator';
      metricLabel = healingStep || (isDone ? 'Frame Grab' : 'Grab Screen');
      statusLabel = isThisActive ? 'ACQUIRING' : (isError ? 'FAILED' : (isDone ? 'CAPTURED' : 'READY'));
      defaultInsight = isDone ? 'Screen frame acquired and saved' : 'Awaiting frame grab trigger';
      color = isError ? (healingStep ? '#ffa657' : '#ff7b72') : (isDone ? '#00ff9d' : '#00ff9d');
      break;
    }
    case 'local_ai_ocr': {
      const is3bDone = !isError && (nodeData.status === 'completed' || Boolean(nodeData.extracted_text) || dagStatus.dag?.nodes?.frame_ocr?.status === 'completed');
      isDone = is3bDone;
      defaultEvaluator = 'MiniCPM-V Vision LLM Evaluator';
      metricLabel = healingStep || (nodeData.lines_count ? `${nodeData.lines_count} lines` : 'MiniCPM-V');
      statusLabel = isThisActive ? 'INFERRING' : (isError ? 'FAILED' : (is3bDone ? 'EXTRACTED' : 'READY'));
      defaultInsight = is3bDone ? `Extracted ${nodeData.lines_count || 0} lines verbatim` : 'Multimodal code extraction via MiniCPM-V';
      color = isError ? (healingStep ? '#ffa657' : '#ff7b72') : (is3bDone ? '#00ff9d' : '#388bfd');
      break;
    }
    case 'frame_ocr': {
      isDone = !isError && nodeData.status === 'completed';
      const repCnt = Number(nodeData.repaired_lines_count || 0);
      defaultEvaluator = 'Gutter & Line Position Evaluator';
      metricLabel = healingStep || (
        isDone
          ? (repCnt > 0
              ? `Ln ${nodeData.top_line || 1}→${nodeData.bottom_line || 0} (${repCnt} Fixed)`
              : `Ln ${nodeData.top_line || 1}→${nodeData.bottom_line || 0} Pos✔`)
          : 'Row Pos Verify'
      );
      statusLabel = isThisActive ? 'VERIFYING' : (isError ? 'FAILED' : (isDone ? 'POS VERIFIED' : 'READY'));
      defaultInsight = isDone
        ? `Gutter & 1:1 Line Pos Verified: Ln ${nodeData.top_line || 1}→${nodeData.bottom_line}${repCnt > 0 ? ` (repaired ${repCnt} shifted)` : ''}`
        : 'Verifying 1:1 line positions & gutter bounds';
      color = isError ? (healingStep ? '#ffa657' : '#ff7b72') : (isDone ? '#00ff9d' : '#8957e5');
      break;
    }
    case 'arrow_down': {
      isDone = nodeData.status === 'completed';
      defaultEvaluator = 'Navigation & Viewport Evaluator';
      metricLabel = healingStep || `Target Ln ${nextTargetTop}`;
      statusLabel = isThisActive ? (healingStep ? 'ALIGNING' : 'STEPPING') : (isDone ? 'STEPPED' : 'READY');
      defaultInsight = `Viewport stepped down to target Line ${nextTargetTop}`;
      color = '#ffa657';
      break;
    }
    case 'verification_trigger': {
      const isTriggerFired = dagStatus.verification_trigger_fired || (effectiveTotal > 0 && effectiveTop >= effectiveTotal);
      const isPrevented = Boolean(dagStatus.trigger_decision?.prevented);
      isDone = isTriggerFired;
      isError = isPrevented && !healingStep;
      defaultEvaluator = 'Completion Qualifier Evaluator';
      metricLabel = isThisActive ? (healingStep || 'Evaluating...') : (isTriggerFired ? '100% Captured' : (isPrevented ? (healingStep || 'Blocked ⛔') : `Ln ${nextTargetTop}`));
      statusLabel = isThisActive ? 'VERIFYING' : (isTriggerFired ? 'FIRED' : (isPrevented ? 'PREVENTED' : 'PENDING'));
      defaultInsight = isTriggerFired ? 'All document lines captured & verified' : (isPrevented ? (dagStatus.trigger_decision?.reasons?.[0] || 'Loop qualifiers prevented transition') : `Target line ${nextTargetTop} ready`);
      color = isThisActive ? '#ffa657' : (isTriggerFired ? '#00ff9d' : (isPrevented ? (healingStep ? '#ffa657' : '#ff7b72') : '#58a6ff'));
      break;
    }
    case 'document_assemble': {
      const isComplete = Boolean(nodeData.is_complete);
      isDone = nodeData.status === 'completed';
      defaultEvaluator = 'Document Integrity Evaluator';
      metricLabel = isComplete ? '100% Verified' : (nodeData.total_captured_lines ? `${nodeData.total_captured_lines} lines` : (healingStep || 'Reconstruct'));
      statusLabel = isThisActive ? 'ASSEMBLING' : (isComplete ? 'COMPLETE' : (isDone ? 'ASSEMBLED' : 'READY'));
      defaultInsight = isComplete ? 'Complete markdown file assembled & saved' : `${nodeData.total_captured_lines || 0} lines stitched`;
      color = isComplete ? '#00ff9d' : (isDone ? '#388bfd' : '#8b949e');
      break;
    }
    case 'batch_frames_ocr': {
      isDone = nodeData.status === 'completed';
      defaultEvaluator = 'Sequential Frame Align Evaluator';
      const pct = typeof nodeData.progress_percent === 'number' ? `${Math.round(nodeData.progress_percent)}%` : '';
      metricLabel = isThisActive ? (pct || 'Rescanning...') : (isDone ? 'Rescanned' : 'Batch Rescan');
      statusLabel = isThisActive ? 'RESCANNING' : (isDone ? 'COMPLETE' : 'READY');
      defaultInsight = isDone ? 'All frames rescanned sequentially top-to-bottom' : 'Sequential frame OCR alignment';
      color = isThisActive ? '#00ff9d' : (isDone ? '#388bfd' : '#8b949e');
      break;
    }
    case 'markdown_tag_parser': {
      isDone = !isError && nodeData.status === 'completed';
      defaultEvaluator = 'CODESCAN Tag & VFS Evaluator';
      const filesCount = nodeData.files_parsed ?? nodeData.vfs_file_count ?? 0;
      metricLabel = isThisActive ? 'Parsing VFS...' : (isDone ? `${filesCount} files` : 'VFS Tags');
      statusLabel = isThisActive ? 'PARSING' : (isError ? 'FAILED' : (isDone ? 'PARSED' : 'READY'));
      defaultInsight = isDone ? `Parsed ${filesCount} VFS files from markdown` : 'Parses CODESCAN_FILE_START/END tags into VFS';
      color = isThisActive ? '#38bdf8' : (isDone ? '#00ff9d' : '#38bdf8');
      break;
    }
    case 'ast_compiler_validator': {
      isDone = !isError && nodeData.status === 'completed';
      defaultEvaluator = 'TypeScript AST memfs Evaluator';
      const errCount = nodeData.diagnostics_count ?? nodeData.error_count ?? 0;
      metricLabel = isThisActive ? 'Compiling AST...' : (isDone ? (errCount === 0 ? '0 TS Errors' : `${errCount} diags`) : 'TS Check');
      statusLabel = isThisActive ? 'COMPILING' : (isError ? 'FAILED' : (isDone ? 'VALIDATED' : 'READY'));
      defaultInsight = isDone ? `Validated VFS AST (${errCount} diagnostics)` : 'In-memory TypeScript AST & semantic validation';
      color = isThisActive ? '#f59e0b' : (isDone ? '#00ff9d' : '#f59e0b');
      break;
    }
    case 'sandbox_ide': {
      isDone = !isError && nodeData.status === 'completed';
      defaultEvaluator = 'Sandbox Materializer Evaluator';
      metricLabel = isThisActive ? 'Materializing...' : (isDone ? 'IDE Ready' : 'Monaco IDE');
      statusLabel = isThisActive ? 'MOUNTING' : (isError ? 'FAILED' : (isDone ? 'READY' : 'STANDBY'));
      defaultInsight = isDone ? 'Sandbox materialized & ready in Monaco IDE' : 'Materializes VFS to disk & opens Monaco Sandbox';
      color = isThisActive ? '#10b981' : (isDone ? '#00ff9d' : '#10b981');
      break;
    }
  }

  return {
    isRunning: isThisActive,
    isActive: isThisActive,
    isError,
    isDone,
    statusLabel,
    metricLabel,
    evaluator: evaluator || defaultEvaluator,
    healingStep,
    telemetryInsight: telemetryInsight || defaultInsight,
    color,
    startedAt,
    finishedAt,
    durationMs,
    timings,
    dagContext,
    traceInsights,
    nodeError
  };
}

/**
 * Format complete node diagnostics in Markdown for AI inspection
 */
export function formatNodeDiagnosticsMarkdown(
  nodeMeta: NodeMeta,
  liveStatus: NodeLiveStatus,
  dagStatus: DagStatusData,
  eventsLog: Array<{ timestamp: string; category: string; message: string }> = [],
  activeProjectId?: string | null,
  activeDeviceSerial?: string | null
): string {
  const nodeEvents = eventsLog.filter(ev => filterNodeTelemetry(nodeMeta.id, ev));
  const timings = liveStatus.timings;
  const statusStr = liveStatus.isAborted ? '⏹ ABORTED' : (liveStatus.isError ? '⛔ ERROR' : (liveStatus.isDone ? '✔ COMPLETED' : (liveStatus.isRunning ? '⚡ ACTIVE' : 'IDLE')));

  const lines: string[] = [
    `### 🧩 DAG Node Trace & Diagnostics: Node ${nodeMeta.step} — ${nodeMeta.fullName}`,
    '',
    `- **Node ID:** \`${nodeMeta.id}\``,
    `- **Short Name:** ${nodeMeta.shortName}`,
    `- **Group:** ${nodeMeta.group === 'initialize' ? 'Initialize (DAG 1)' : 'Capture Entire Markdown (DAG 2)'}`,
    `- **Status:** ${statusStr}`,
    `- **Current Metric:** ${liveStatus.metricLabel || 'N/A'}`,
    `- **Evaluator:** ${liveStatus.evaluator || 'N/A'}`,
    `- **Healing Action:** ${liveStatus.healingStep || 'None (Optimal)'}`,
    `- **Telemetry Insight:** ${liveStatus.telemetryInsight || 'N/A'}`,
    `- **Description:** ${nodeMeta.desc}`,
    '',
    '#### ⏱ Execution Timings',
    `- **Started At:** ${liveStatus.startedAt || 'N/A'}`,
    `- **Finished At:** ${liveStatus.finishedAt || 'N/A'}`,
    `- **Elapsed Duration:** ${liveStatus.durationMs !== null ? `${(liveStatus.durationMs / 1000).toFixed(2)}s (${liveStatus.durationMs}ms)` : (liveStatus.isActive ? 'Active...' : 'N/A')}`
  ];

  if (timings) {
    lines.push('- **Detailed Timings Breakdown:**');
    lines.push(`  - Total Duration: ${timings.duration_ms ?? 'N/A'}ms`);
    lines.push(`  - Precheck Phase: ${timings.precheck_ms ?? 'N/A'}ms`);
    lines.push(`  - Node Action: ${timings.action_ms ?? 'N/A'}ms`);
    lines.push(`  - Auto-Healing: ${timings.healing_ms ?? 'N/A'}ms`);
  }
  lines.push('');

  if (liveStatus.nodeError) {
    lines.push('#### ❌ Error Details');
    lines.push(`> **Message:** ${liveStatus.nodeError}`);
    lines.push('');
  }

  if (liveStatus.traceInsights?.length) {
    lines.push('#### 🔍 Key Trace Insights & Remediation Commands');
    liveStatus.traceInsights.forEach(insight => {
      if (insight.startsWith('adb') || insight.startsWith('input') || insight.startsWith('cmd') || insight.startsWith('settings')) {
        lines.push(`- **Command:**\n  \`\`\`bash\n  ${insight}\n  \`\`\``);
      } else {
        lines.push(`- ${insight}`);
      }
    });
    lines.push('');
  }

  if (liveStatus.dagContext) {
    lines.push('#### 🌐 DAG Context & Environmental State');
    lines.push('```json');
    lines.push(JSON.stringify(liveStatus.dagContext, null, 2));
    lines.push('```');
    lines.push('');
  }

  lines.push('#### 📊 Live Node Telemetry & Environment');
  lines.push(`- **Active Project ID:** \`${activeProjectId || 'None'}\``);
  lines.push(`- **Active ADB Device Serial:** \`${activeDeviceSerial || 'Default'}\``);
  lines.push(`- **Target Total Lines:** ${dagStatus.target_total_lines || 0}`);
  lines.push(`- **Current Top Line:** ${dagStatus.current_top_line || 0}`);
  lines.push(`- **Current Bottom Line:** ${dagStatus.current_bottom_line || 0}`);
  lines.push(`- **Current Page:** ${dagStatus.current_page || 1}`);
  lines.push(`- **Soft Keyboard Closed / Guarded:** ${dagStatus.is_keyboard_guarded ? 'Yes' : 'No'}`);
  lines.push('');

  lines.push(`#### 📜 Filtered Telemetry Events (${nodeEvents.length} recorded)`);
  if (nodeEvents.length === 0) {
    lines.push('_No specific events logged for this node yet._');
  } else {
    nodeEvents.slice(-8).forEach(ev => {
      lines.push(`- \`[${ev.timestamp}]\` **[${ev.category}]** ${ev.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Discern root cause of performance degradation and generate AI prompt
 */
export function discernNodePerformance(
  nodeMeta: NodeMeta,
  liveStatus: NodeLiveStatus,
  dagStatus: DagStatusData,
  activeDeviceSerial?: string | null
): PerformanceDiagnosis {
  const timings = liveStatus.timings || {};
  const isError = liveStatus.isError;
  const duration_ms = timings.duration_ms ?? liveStatus.durationMs ?? 0;
  const precheck_ms = timings.precheck_ms ?? 0;
  const action_ms = timings.action_ms ?? 0;
  const healing_ms = timings.healing_ms ?? 0;
  const ocr_latency_ms = dagStatus.ocr_latency_ms || 45;
  const capture_rtt_ms = (dagStatus as any).capture_telemetry?.last_latency_ms || 0;

  const total = duration_ms || (precheck_ms + action_ms + healing_ms) || 1;
  const precheck_pct = Math.round((precheck_ms / total) * 100);
  const action_pct = Math.round((action_ms / total) * 100);
  const healing_pct = Math.round((healing_ms / total) * 100);

  const evidence: string[] = [];
  const remediations: string[] = [];
  let category: PerformanceDiagnosis['category'] = 'HEALTHY';
  let title = 'Pipeline Execution Healthy & Nominal';
  let severity: PerformanceDiagnosis['severity'] = 'healthy';
  let summary = `Node '${nodeMeta.shortName}' executed within nominal operational boundaries (${duration_ms || total}ms).`;

  if (isError) {
    category = 'UNRESOLVED_ERROR';
    severity = 'critical';
    title = `Hard Failure in Node '${nodeMeta.shortName}'`;
    summary = `Node encountered a blocking failure: ${liveStatus.nodeError || 'Execution failed'}`;
    evidence.push(`Node error state: ${liveStatus.nodeError || 'Unknown error'}`);
    liveStatus.traceInsights?.forEach(t => evidence.push(t));
    remediations.push('Inspect trace insights and execute recommended ADB remediation commands.');
    remediations.push('Ensure soft keyboard is suppressed with dumpsys input_method check.');
    remediations.push('Verify target window has focus before firing input actions.');
  } else if (healing_ms > 2500 || (total > 1500 && healing_pct > 35)) {
    category = 'AUTO_HEALING_CHURN';
    severity = healing_ms > 5000 ? 'critical' : 'warning';
    title = 'Auto-Healing Recovery Churn & Focus Interception';
    summary = `Auto-healing consumed ${healing_ms}ms (${healing_pct}% of node duration), indicating repeated focus or keyboard recovery.`;
    evidence.push(`Auto-healing took ${healing_ms}ms out of ${total}ms total execution time (${healing_pct}%).`);
    evidence.push(`Current Evaluator: ${liveStatus.evaluator || 'Standard Gutter Evaluator'}`);
    if (liveStatus.healingStep) evidence.push(`Last Healing Action: ${liveStatus.healingStep}`);
    remediations.push('Enforce persistent soft keyboard suppression (settings put secure show_ime_with_hard_keyboard 0).');
    remediations.push('Prevent activity re-creation: avoid unconditional am start when window is already focused.');
  } else if (((nodeMeta.id === 'local_ai_ocr' || nodeMeta.id === 'frame_ocr') && (action_ms > 2500 || ocr_latency_ms > 1500)) || ocr_latency_ms > 2500) {
    category = 'OCR_BOTTLENECK';
    severity = (ocr_latency_ms > 3500 || action_ms > 4000) ? 'critical' : 'warning';
    title = 'OCR / Multimodal Vision Inference Latency Spike';
    summary = `OCR inference took ${ocr_latency_ms || action_ms}ms per frame, creating an upstream throughput bottleneck.`;
    evidence.push(`OCR inference latency measured at ${ocr_latency_ms || action_ms}ms (nominal baseline: < 350ms).`);
    remediations.push('Crop inference region strictly to numeric line gutter (x: 0-250px) rather than scanning full frame.');
    remediations.push('Verify Ollama model concurrency and check CPU/GPU offload thread count.');
  } else if ((nodeMeta.id === 'frame_acquire' && (action_ms > 800 || capture_rtt_ms > 350)) || capture_rtt_ms > 500) {
    category = 'ADB_SCREENSHOT_OVERHEAD';
    severity = 'warning';
    title = 'ADB Transport & Screencap RTT Latency';
    summary = `ADB screenshot capture took ${capture_rtt_ms || action_ms}ms per frame (nominal: < 80ms over USB, < 150ms over Wi-Fi).`;
    evidence.push(`Screencap round-trip time: ${capture_rtt_ms || action_ms}ms.`);
    remediations.push('Cache SurfaceFlinger display IDs to eliminate sequential dumpsys SurfaceFlinger queries.');
    remediations.push('Ensure ADB over USB (5000000 baud) or switch Wi-Fi to 5GHz low-latency band.');
  } else if (precheck_ms > 3000 || (total > 2000 && precheck_pct > 40)) {
    category = 'PRECHECK_BLOCKING';
    severity = 'warning';
    title = 'Sequential Environment Precheck Blocking';
    summary = `Prechecks required ${precheck_ms}ms (${precheck_pct}% of total execution) before node action began.`;
    evidence.push(`Precheck phase duration: ${precheck_ms}ms.`);
    remediations.push('Run independent environment classifiers concurrently via asyncio.gather().');
  }

  if (evidence.length === 0) {
    evidence.push(`Total node runtime: ${duration_ms || total}ms.`);
    evidence.push(`Precheck: ${precheck_ms}ms (${precheck_pct}%), Action: ${action_ms}ms (${action_pct}%), Healing: ${healing_ms}ms (${healing_pct}%).`);
  }
  if (remediations.length === 0) {
    remediations.push('Maintain existing calibration parameters and continue monitoring loop timings.');
  }

  const hierarchy = (dagStatus as any)?.codescan_hierarchy || {};
  const steeringGuide = (dagStatus as any)?.ocr_steering_guide || {};
  const activeFile = hierarchy?.active_file || steeringGuide?.active_file_driver || {};
  const partInfo = hierarchy?.part || {};
  const bundleInfo = hierarchy?.bundle || {};

  const dagPositioningPrompt = `# 🎯 Prompt 1: DAG File Positioning & Optimal Character-Level OCR Acquisition

## Objective
Fix and steer the DAG operation (\`eof_calibration\`, \`home_navigation\`, \`frame_acquire\`, \`local_ai_ocr\`, \`frame_ocr\`, \`arrow_down\`, \`verification_trigger\`) that positions the Markdown file for acquisition and optimal OCR processing to assure every character in the file is 100% accurately acquired.

## Active Task Ground-Truth Context
- **Scan Scope:** \`${steeringGuide?.scan_scope || (bundleInfo?.is_multipart ? 'multi_part_bundle' : 'single_markdown')}\`
- **Bundle / Part:** \`${bundleInfo?.name || 'Markdown Scan'}\` — Part \`${partInfo?.number ?? 1}\` of \`${partInfo?.total_parts ?? 1}\` (Files in Part: \`${partInfo?.files_captured ?? 0}/${partInfo?.files_declared ?? 0}\`, Total Project Files: \`${bundleInfo?.total_project_files ?? 0}\`)
- **Part Header Totals:** Size \`${partInfo?.size_kb_captured ?? 0} / ${partInfo?.size_kb_declared ?? 0} KB\` • Lines \`${partInfo?.lines_captured ?? dagStatus.current_bottom_line} / ${partInfo?.lines_declared ?? dagStatus.target_total_lines}\` • Chars \`${partInfo?.chars_captured ?? 0} / ${partInfo?.chars_declared ?? 0}\`
- **Active File (\`CODESCAN_FILE_START\`):**
  - \`path\`: \`${activeFile?.path || 'N/A'}\`
  - \`type\`: \`${activeFile?.type || 'N/A'}\`
  - \`size\`: \`${activeFile?.actual_size ?? 0} / ${activeFile?.expected_size ?? 0} B\`
  - \`lines\`: \`${activeFile?.actual_lines ?? 0} / ${activeFile?.expected_lines ?? 0}\`
  - \`chars\`: \`${activeFile?.actual_chars ?? 0} / ${activeFile?.expected_chars ?? 0}\`
  - \`source_frame_ids\`: \`${(activeFile?.source_frame_ids || []).join(', ') || 'Pending'}\`

## Required DAG Positioning & Optimal OCR Directives
1. **Fullscreen Single-Pane Dark-Mode Viewport Enforcement (\`frame_acquire\` & \`alignment_engine.py\`)**:
   - Ensure Teams Markdown editor on Display \`#${liveStatus.dagContext?.display_id ?? 'External Desktop'}\` is in **Fullscreen**, **Single-Pane Edit Mode**, and **Dark Mode** (\`gutter_bg_mean < 48.0\`) with soft keyboard suppressed (\`show_ime_with_hard_keyboard 0\`).
   - Mask out the bottom-left floating \`Offline\` / \`Saving\` badge (\`x < 220, y > 0.88 * H\`) so it is never misread as gutter line \`205\`.
2. **Part Header Calibration & EOF Reconciliation (\`eof_calibration\` & \`document_assemble\`)**:
   - Parse top-of-file markers (\`# <bundle> (Part X of Y)\`, \`Part: **X of Y** | Files in this part: **N** (Total project files: **M**)\`, \`Part Size: **S KB** | Lines: **L** | Characters: **C**\`).
   - Reconcile \`target_total_lines\` directly with \`Lines: **L**\` from the part header so EOF calibration is immune to bottom-gutter occlusion.
3. **Deterministic Viewport Pacing & Multi-Page Wrapped Line Handling (\`arrow_down\` & \`verification_trigger\`)**:
   - Advance \`target_top_line = bottom_line + 1\` with calibrated \`DPAD_DOWN\` steps for standard lines.
   - When an ultra-long wrapped line (e.g. \`.svg\` \`<path d="M..."/>\` or minified bundle) spans multiple 1080p screens with \`gutter_numbers == []\` and \`text_rows >= 8\`, switch \`arrow_down\` to **Wrapped Continuation Page Advance Mode** (\`PAGE_DOWN\` / \`18x DPAD_DOWN\`) and concatenate distinct slices via \`_merge_wrapped_line_continuation()\` until accumulated characters match \`CODESCAN_FILE_START\` \`chars="..."\`.
4. **Character-Exact Row Slicing & Steered VLM Decoding (\`frame_ocr\` & \`ocr_service.py\`)**:
   - Slice each row horizontally from \`gutter_right_x + 12px\` to \`1916px\` with \`2x\` Lanczos upscaling and CLAHE normalization to preserve every glyph (\`|\`, \`;\`, \`_\`, \`"\`, \`<\`, \`>\`, \`\\\`, \`{\`, \`}\`).
   - Inject \`ocr_steering_guide.steering_prompt_hint\` into the OCR prompt so decoding is anchored to \`path\`, \`type\`, \`size\`, \`lines\`, and \`chars\`.`;

  const telemetrySteeringPrompt = `# 📡 Prompt 2: Single & Multi-Part Telemetry, Frame-to-OCR Correlation, & Instance-Data Steering Guide Re-Scan

## Objective
Enhance telemetry and tracking for both **single Markdown scans** and **multi-part Markdown bundle scans** so the OCR pipeline correlates every OCR result to its source screen capture (\`frame_id\`, \`filename\`, \`top_line..bottom_line\`, and row Y-coordinates) and executes targeted re-scans via the instance-data \`ocr_steering_guide\` to achieve 100% accurate Markdown reproduction.

## 1. Dual-Level Ground-Truth Drivers
1. **Top-of-File Part Header Driver (\`part_header_metadata\`)**:
   - Tracks \`is_multipart\`, \`bundle_name\`, \`part_number\`, \`total_parts\`, \`files_in_part\`, \`total_project_files\`, \`part_size_kb\`, \`declared_lines\`, and \`declared_chars\`.
   - Continuously audits captured totals against declared part attributes to compute \`overall_ocr_accuracy_pct\`.
2. **Per-File Marker Driver (\`<!-- CODESCAN_FILE_START path="..." type="..." size="..." lines="..." chars="..." -->\` .. \`<!-- CODESCAN_FILE_END -->\`)**:
   - Validates every embedded file for distinct metric equivalence:
     - \`actual_lines == expected_lines\`
     - \`actual_chars == expected_chars\`
     - \`actual_size == expected_size\` (UTF-8 bytes with CRLF/LF normalization check)

## 2. Bi-Directional Frame-to-OCR Correlation (\`source_frame_ids\`)
- Every captured screen frame (\`f_<timestamp>\`) records its \`frame_id\`, \`filename\`, \`top_line\`, \`bottom_line\`, and per-row Y-coordinate map (\`line_y_map\`).
- \`verify_codescan_file_markers_and_metrics()\` intersects each file's Markdown line span \`[start_md_line, end_md_line]\` with all frame \`[top_line, bottom_line]\` intervals to attach \`source_frame_ids\` to each file entry and to \`ocr_steering_guide.rescan_targets\`.

## 3. Instance-Data Steering Guide (\`ocr_steering_guide\`) & Closed-Loop Re-Scan
Embed \`ocr_steering_guide\` in \`state.latest_telemetry\`, \`state.orchestration_state\`, and \`blackboard.metadata\`:
\`\`\`json
${JSON.stringify({
  scan_scope: steeringGuide?.scan_scope || (bundleInfo?.is_multipart ? 'multi_part_bundle' : 'single_markdown'),
  goal: '100%_accurate_markdown_reproduction',
  part_header_driver: steeringGuide?.part_header_driver || partInfo,
  active_file_driver: steeringGuide?.active_file_driver || activeFile,
  rescan_targets: (steeringGuide?.rescan_targets || []).slice(0, 3)
}, null, 2)}
\`\`\`
- When \`ocr_steering_guide.requires_rescan == true\`, \`auto_rescan_mismatched_files_with_steering_guide()\` loads the correlated PNG screen captures (\`source_frame_ids\`), re-slices the exact row bands for \`md_line_range\`, runs steered OCR with \`steering_prompt_hint\`, updates \`lines_map\` in place, and re-verifies \`distinct_accuracy_pct == 100.0%\`.`;

  const prompt = `# 🛠️ System Performance & 100% OCR Accuracy Steering Prompt

## Objective
Analyze root cause of latency/performance and steer DAG file positioning, frame-to-OCR correlation, and targeted re-scanning in the Small-Fling pipeline.

---

## 📌 Executive Summary
- **Target Node:** ${nodeMeta.fullName} (\`${nodeMeta.id}\`)
- **Group:** ${nodeMeta.group}
- **Primary Root Cause Category:** \`${category}\`
- **Diagnosis:** ${title}
- **Severity Level:** \`${severity.toUpperCase()}\`
- **Execution Duration:** ${duration_ms || total}ms (${((duration_ms || total) / 1000).toFixed(2)}s)
- **Status:** \`${(liveStatus.statusLabel || 'IDLE').toUpperCase()}\`

### Summary
> ${summary}

---

## ⏱️ Detailed Latency & Phase Breakdown
| Phase | Duration | Percentage | Baseline | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Total Duration** | ${duration_ms || total}ms | 100% | < 1,500ms | ${(duration_ms || total) > 1500 ? '⚠️ Degraded' : '✔ Normal'} |
| **Environment Precheck** | ${precheck_ms}ms | ${precheck_pct}% | < 200ms | ${precheck_ms > 800 ? '⚠️ High' : '✔ Normal'} |
| **Primary Node Action** | ${action_ms}ms | ${action_pct}% | < 800ms | ${action_ms > 1200 ? '⚠️ High' : '✔ Normal'} |
| **Auto-Healing Recovery** | ${healing_ms}ms | ${healing_pct}% | 0ms | ${healing_ms > 2000 ? '⛔ Excessive' : (healing_ms > 0 ? '⚠️ Present' : '✔ None')} |
| **OCR Vision Latency** | ${ocr_latency_ms}ms | — | < 350ms | ${ocr_latency_ms > 1000 ? '⚠️ Sluggish' : '✔ Normal'} |
| **ADB Screencap RTT** | ${capture_rtt_ms}ms | — | < 120ms | ${capture_rtt_ms > 300 ? '⚠️ High RTT' : '✔ Normal'} |

---

## 🔍 Diagnostic Evidence
${evidence.map(e => `- ${e}`).join('\n')}

### Environmental Context
- **Active Device Serial:** \`${activeDeviceSerial || 'Connected ADB Device'}\`
- **Target Display ID:** \`${liveStatus.dagContext?.display_id ?? 'External Desktop'}\`
- **Active Density / DPI:** \`${liveStatus.dagContext?.active_dpi ?? 120} DPI\`
- **Keyboard Suppressed:** \`${dagStatus.is_keyboard_guarded}\`
- **Current Lines:** \`Ln ${dagStatus.current_top_line}→${dagStatus.current_bottom_line}\`

---

## 🎯 Recommended Action Plan for AI
${remediations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---

${dagPositioningPrompt}

---

${telemetrySteeringPrompt}
`;

  return {
    nodeId: nodeMeta.id,
    title,
    category,
    severity,
    summary,
    evidence,
    remediations,
    metrics: {
      duration_ms: duration_ms || total,
      precheck_ms,
      action_ms,
      healing_ms,
      ocr_latency_ms,
      capture_rtt_ms,
      precheck_pct,
      action_pct,
      healing_pct
    },
    markdown_prompt: prompt.trim(),
    promptDataUri: 'data:text/markdown;charset=utf-8,' + encodeURIComponent(prompt.trim()),
    dagPositioningPrompt: dagPositioningPrompt.trim(),
    telemetrySteeringPrompt: telemetrySteeringPrompt.trim()
  };
}
