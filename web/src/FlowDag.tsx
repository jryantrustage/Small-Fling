import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Check, AlertTriangle, RotateCw, Sliders, Zap, Lock, Unlock,
  ChevronRight, Sparkles, X, Activity
} from 'lucide-react';
import type { ProjectData } from './types';
import type {
  DagStatusData, NodeMeta, DagEdge, DagGroup
} from './types/dag';
import { NODES_METADATA } from './types/dag';
import { calculateNodeLiveStatus } from './utils/dagDiagnostics';
import { UniversalNodeConfigModal } from './components/dag/DagConfigModals';

export interface FlowDagProps {
  apiBase: string;
  activeProjectId?: string | null;
  activeProject?: ProjectData | null;
  onOpenSettings?: (tab?: string) => void;
  activeDeviceSerial?: string | null;
  currentTopLine?: number;
  currentBottomLine?: number;
  targetTotalLines?: number;
  currentPage?: number;
  isOrchestrating?: boolean;
  onRefresh?: () => void;
  selectedDag?: 'all' | 'initialize' | 'capture_entire_markdown' | 'position_navigation' | 'verify_assemble' | 'post_capture_analyzer';
  onSelectDag?: (dag: any) => void;
  selectedNodeId?: string | null;
  onSelectNodeId?: (nodeId: string | null) => void;
  projectInitProgress?: {
    active: boolean;
    percent: number;
    stage: string;
    status: 'running' | 'completed' | 'error';
    totalLines?: number;
    error?: string;
    projectName?: string;
  } | null;
  onDismissInitProgress?: () => void;
  onRetryInit?: () => void;
  eventsLog?: Array<{
    id: string;
    timestamp: string;
    category: string;
    message: string;
    data?: any;
    dag?: string;
  }>;
  onClose?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  desktopKeyboardProhibited?: boolean;
  onToggleProhibitKeyboard?: (prohibit?: boolean) => void;
  desktopModeEnabled?: boolean;
  onToggleDesktopMode?: (enable: boolean) => void;
  desktopVerification?: any;
  onOpenHeadlessTelemetry?: () => void;
}

interface RibbonStepConfig {
  id: string;
  stepNum: number;
  label: string;
  phase: 1 | 2 | 3;
}

const RIBBON_STEPS: RibbonStepConfig[] = [
  // Phase I — Initialize
  { id: 'init_end', stepNum: 1, label: '1. EOF Total Lines', phase: 1 },
  { id: 'reset_home', stepNum: 2, label: '2. Home Line 1', phase: 1 },
  // Phase II — Capture & OCR Loop
  { id: 'frame_acquire', stepNum: 3, label: '3. Screen Capture', phase: 2 },
  { id: 'local_ai_ocr', stepNum: 4, label: '4. AI OCR', phase: 2 },
  { id: 'frame_ocr', stepNum: 5, label: '5. Line Pos Verify', phase: 2 },
  { id: 'arrow_down', stepNum: 6, label: '6. Pacer Down', phase: 2 },
  { id: 'verification_trigger', stepNum: 7, label: '7. Trigger', phase: 2 },
  { id: 'document_assemble', stepNum: 8, label: '8. Assemble', phase: 2 },
  { id: 'batch_frames_ocr', stepNum: 9, label: '9. Batch Rescan', phase: 2 },
  // Phase III — Post-Capture Analyzer & Sandbox
  { id: 'markdown_tag_parser', stepNum: 10, label: '10. Parse File Tags', phase: 3 },
  { id: 'ast_compiler_validator', stepNum: 11, label: '11. TS AST Compile', phase: 3 },
  { id: 'sandbox_ide', stepNum: 12, label: '12. Sandbox & Monaco', phase: 3 },
];

export const FlowDag: React.FC<FlowDagProps> = ({
  apiBase,
  activeProjectId,
  activeProject,
  activeDeviceSerial,
  targetTotalLines = 0,
  onRefresh,
  selectedNodeId,
  onSelectNodeId,
  desktopKeyboardProhibited = true,
  onToggleProhibitKeyboard,
}) => {
  const [dagStatus, setDagStatus] = useState<DagStatusData | null>(null);
  const [popoverNodeId, setPopoverNodeId] = useState<string | null>(null);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [runningPhase, setRunningPhase] = useState<number | null>(null);
  const [nodeActionFeedback, setNodeActionFeedback] = useState<string>('');
  const [universalConfigNode, setUniversalConfigNode] = useState<NodeMeta | null>(null);

  // Tunable parameters inside the compact node popover
  const [linesPerPage, setLinesPerPage] = useState<number>(activeProject?.lines_per_page || 49);
  const [scrollPaddingLines, setScrollPaddingLines] = useState<number>(activeProject?.scroll_padding_lines ?? 4);
  const [settleDelayMs, setSettleDelayMs] = useState<number>(activeProject?.settle_delay_ms || 50);
  const [headlessMode, setHeadlessMode] = useState<boolean>(false);
  const [isSavingParams, setIsSavingParams] = useState<boolean>(false);

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeProject) {
      if (activeProject.lines_per_page) setLinesPerPage(activeProject.lines_per_page);
      if (activeProject.scroll_padding_lines !== undefined && activeProject.scroll_padding_lines !== null) {
        setScrollPaddingLines(activeProject.scroll_padding_lines);
      }
      if (activeProject.settle_delay_ms) setSettleDelayMs(activeProject.settle_delay_ms);
    }
  }, [activeProject?.id, activeProject?.lines_per_page, activeProject?.scroll_padding_lines, activeProject?.settle_delay_ms]);

  const fetchDagStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/dag/status`);
      if (res.ok) {
        const d: DagStatusData = await res.json();
        setDagStatus(d);
        const hm = Boolean(d?.dag?.headless_mode ?? d?.headless_mode);
        setHeadlessMode(hm);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchDagStatus();
    const timer = window.setInterval(fetchDagStatus, 1400);
    return () => window.clearInterval(timer);
  }, [fetchDagStatus]);

  // Close compact popover on outside click
  useEffect(() => {
    if (!popoverNodeId) return;
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverNodeId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [popoverNodeId]);

  const handleClickStep = (nodeId: string) => {
    onSelectNodeId?.(nodeId);
    setNodeActionFeedback('');
    setPopoverNodeId((prev) => (prev === nodeId ? null : nodeId));
  };

  // Run single node in isolation
  const handleRunNodeIsolated = async (nodeId: string) => {
    setRunningNodeId(nodeId);
    setNodeActionFeedback(`Running ${nodeId}...`);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/${encodeURIComponent(nodeId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: activeProjectId,
          serial: activeDeviceSerial,
          isolated: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNodeActionFeedback(`✔ Completed ${nodeId}`);
        await fetchDagStatus();
        onRefresh?.();
      } else {
        setNodeActionFeedback(`⚠ ${data.detail || data.error || 'Execution error'}`);
      }
    } catch (e: any) {
      setNodeActionFeedback(`⚠ ${e.message}`);
    } finally {
      setRunningNodeId(null);
    }
  };

  const frontierBottomLine =
    dagStatus?.loop_diagnosis?.frontier_line !== undefined && dagStatus.loop_diagnosis.frontier_line > 0
      ? dagStatus.loop_diagnosis.frontier_line
      : Math.max(
          dagStatus?.current_bottom_line || 0,
          dagStatus?.dag?.nodes?.frame_ocr?.bottom_line || 0
        );
  const autoResumeTopLine =
    dagStatus?.loop_diagnosis?.next_expected_top_line !== undefined && dagStatus.loop_diagnosis.next_expected_top_line > 0
      ? dagStatus.loop_diagnosis.next_expected_top_line
      : frontierBottomLine > 0
        ? frontierBottomLine + 1
        : 1;

  // Run an entire phase group (Phase I: initialize, Phase II: capture_entire_markdown, Phase III: post_capture_analyzer)
  const handleRunPhase = async (phase: 1 | 2 | 3) => {
    let forceReset = false;
    if (phase === 1 && frontierBottomLine > 0) {
      const ok = window.confirm(
        `Project already has captured lines up to Line ${frontierBottomLine.toLocaleString()}.\n\nClick OK only if you want to RESET to Line 1 and clear existing progress, or Cancel to keep your progress and use Phase II to auto-resume at Line ${autoResumeTopLine.toLocaleString()}.`
      );
      if (!ok) return;
      forceReset = true;
    }
    setRunningPhase(phase);
    const groupMap: Record<number, DagGroup> = {
      1: 'initialize',
      2: 'capture_entire_markdown',
      3: 'post_capture_analyzer',
    };
    const groupName = groupMap[phase];
    try {
      await fetch(`${apiBase}/api/dag/groups/${groupName}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: activeProjectId,
          serial: activeDeviceSerial,
          force_reset: forceReset || undefined,
          resume_from_line: phase === 2 && frontierBottomLine > 0 ? autoResumeTopLine : undefined,
        }),
      });
      await fetchDagStatus();
      onRefresh?.();
    } finally {
      setRunningPhase(null);
    }
  };

  // Toggle outgoing edge / connector for a node
  const handleToggleOutgoingEdge = async (nodeId: string, edge: DagEdge) => {
    const nextEnabled = !(edge.enabled !== false);
    try {
      await fetch(`${apiBase}/api/dag/edges/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_node: nodeId,
          to_node: edge.to,
          enabled: nextEnabled,
        }),
      });
      await fetchDagStatus();
    } catch {}
  };

  // Toggle semaphore gate
  const handleToggleSemaphore = async (semKey: 'semaphore_group2_to_3' | 'semaphore_group3_to_4') => {
    const currentVal = Boolean(dagStatus?.dag?.[semKey] ?? true);
    try {
      await fetch(`${apiBase}/api/dag/semaphore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [semKey]: !currentVal }),
      });
      await fetchDagStatus();
    } catch {}
  };

  // Save tuned parameters (lines_per_page, scroll_padding_lines, settle_delay_ms, headless_mode)
  const handleSaveNodeParams = async () => {
    setIsSavingParams(true);
    try {
      await fetch(`${apiBase}/api/dag/headless-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless_mode: headlessMode }),
      });

      if (activeProjectId) {
        const stepSize = Math.max(1, linesPerPage + scrollPaddingLines);
        await fetch(`${apiBase}/api/projects/${encodeURIComponent(activeProjectId)}/device-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lines_per_page: Number(linesPerPage),
            step_size: stepSize,
            scroll_padding_lines: Number(scrollPaddingLines),
            arrow_count_init: stepSize * 2,
            arrow_count_step: stepSize,
            settle_delay_ms: Number(settleDelayMs),
          }),
        });
      }
      setNodeActionFeedback('✔ Parameters saved');
      await fetchDagStatus();
      onRefresh?.();
    } catch (e: any) {
      setNodeActionFeedback(`⚠ ${e.message}`);
    } finally {
      setIsSavingParams(false);
    }
  };

  // Attached self-healing quick actions inside node popover
  const handleSelfHealAction = async (action: 'autofix_viewport' | 'prepare_editor' | 'auto_heal_gt') => {
    setNodeActionFeedback('Running self-heal...');
    try {
      if (action === 'autofix_viewport') {
        await fetch(`${apiBase}/api/device/autofix-viewport`, { method: 'POST' });
        setNodeActionFeedback('✔ Viewport & IME healed');
      } else if (action === 'prepare_editor') {
        await fetch(`${apiBase}/api/device/kiosk/prepare-markdown-editor`, { method: 'POST' });
        setNodeActionFeedback('✔ Editor maximized + dark mode');
      } else if (action === 'auto_heal_gt' && activeProjectId) {
        await fetch(`${apiBase}/api/projects/${encodeURIComponent(activeProjectId)}/auto-heal-mismatches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        setNodeActionFeedback('✔ Mismatched lines re-OCRed');
      }
      onRefresh?.();
    } catch (e: any) {
      setNodeActionFeedback(`⚠ ${e.message}`);
    }
  };

  const [isResumingLoop, setIsResumingLoop] = useState<boolean>(false);

  const handleResumeLoopFromBanner = async (healFirst = false) => {
    setIsResumingLoop(true);
    try {
      if (healFirst) {
        await fetch(`${apiBase}/api/device/autofix-viewport`, { method: 'POST' }).catch(() => {});
      }
      await fetch(`${apiBase}/api/dag/loop/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: activeProjectId,
          serial: activeDeviceSerial,
        }),
      });
      await fetchDagStatus();
      onRefresh?.();
    } catch {} finally {
      setIsResumingLoop(false);
    }
  };

  const getStepStatus = (stepId: string) => {
    const meta = NODES_METADATA.find((n) => n.id === stepId);
    if (!meta || !dagStatus) {
      return {
        isRunning: false,
        isActive: false,
        isDone: false,
        isError: false,
        statusLabel: 'READY',
        metricLabel: '',
        telemetryInsight: null as string | null,
      };
    }
    const live = calculateNodeLiveStatus(
      stepId,
      dagStatus,
      runningNodeId,
      targetTotalLines
    );
    return live;
  };

  const edges: DagEdge[] = dagStatus?.dag?.edges || [];
  const activePopoverMeta = popoverNodeId
    ? NODES_METADATA.find((n) => n.id === popoverNodeId) || null
    : null;
  const activePopoverEdges = popoverNodeId
    ? edges.filter((e) => e.from === popoverNodeId)
    : [];

  const renderPhaseGroup = (
    phaseNum: 1 | 2 | 3,
    phaseTitle: string,
    phaseAccent: string
  ) => {
    const steps = RIBBON_STEPS.filter((s) => s.phase === phaseNum);
    return (
      <div className="dag-ribbon-phase-group" key={phaseNum} data-testid={`dag-phase-${phaseNum}`}>
        <div className="dag-ribbon-phase-header">
          <span className="dag-phase-dot" style={{ background: phaseAccent, color: phaseAccent }} />
          <span className="dag-phase-title">{phaseTitle}</span>
          {phaseNum === 2 && frontierBottomLine > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#00ff9d',
                background: 'rgba(0, 255, 157, 0.12)',
                border: '1px solid rgba(0, 255, 157, 0.35)',
                borderRadius: 4,
                padding: '1px 5px',
                marginRight: 4,
              }}
              title={`Last captured frame ended at Line ${frontierBottomLine.toLocaleString()} • Next capture & OCR starts at Line ${autoResumeTopLine.toLocaleString()} on top`}
            >
              Resume Ln {autoResumeTopLine.toLocaleString()}
            </span>
          )}
          <button
            type="button"
            className="dag-phase-run-btn"
            onClick={() => handleRunPhase(phaseNum)}
            disabled={runningPhase === phaseNum}
            title={
              phaseNum === 2 && frontierBottomLine > 0
                ? `Auto-Resume Capture & OCR Loop at Line ${autoResumeTopLine.toLocaleString()} (last line ${frontierBottomLine.toLocaleString()} + 1 on top)`
                : `Run all nodes in ${phaseTitle}`
            }
          >
            {runningPhase === phaseNum ? <RotateCw size={9} className="spin" /> : <Play size={9} />}
          </button>
        </div>
        <div className="dag-ribbon-steps-row">
          {steps.map((step, idx) => {
            const st = getStepStatus(step.id);
            const meta = NODES_METADATA.find((n) => n.id === step.id);
            const isSelected = popoverNodeId === step.id || selectedNodeId === step.id;
            const isRunning = runningNodeId === step.id || st.isRunning || st.isActive;
            const outgoingDisabled = edges
              .filter((e) => e.from === step.id)
              .some((e) => e.enabled === false);

            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  className={`dag-ribbon-node-pill ${isSelected ? 'selected' : ''} ${
                    isRunning ? 'running heat-lamp-active' : ''
                  } ${st.isError ? 'error' : st.isDone ? 'done' : ''}`}
                  onClick={() => handleClickStep(step.id)}
                  data-testid={`dag-ribbon-node-${step.id}`}
                  title={`${step.label}${st.metricLabel ? ` • ${st.metricLabel}` : ''}${st.telemetryInsight ? `\n${st.telemetryInsight}` : ''}\n(Click to configure or run in isolation)`}
                >
                  <div className="dag-node-top-row">
                    <div className="dag-node-left-head">
                      <span
                        className="dag-node-step-badge"
                        style={
                          !isRunning && !st.isDone && meta?.accentColor
                            ? {
                                borderColor: `${meta.accentColor}66`,
                                color: meta.accentColor,
                                background: `${meta.accentColor}1f`,
                              }
                            : undefined
                        }
                      >
                        {step.stepNum}
                      </span>
                      <span className="dag-node-step-name">{step.label.replace(/^\d+\.\s*/, '')}</span>
                    </div>
                    {isRunning ? (
                      <RotateCw size={10} className="spin" color="#ff9100" />
                    ) : st.isError ? (
                      <AlertTriangle size={10} color="#f85149" />
                    ) : st.isDone ? (
                      <Check size={10} color="#00ff9d" />
                    ) : null}
                  </div>
                  <div className="dag-node-bottom-row">
                    <span className="dag-node-metric-text">
                      {st.metricLabel || meta?.subhead || 'Ready'}
                    </span>
                    <span
                      style={{
                        fontSize: '8px',
                        fontWeight: 800,
                        letterSpacing: '0.3px',
                        color: isRunning
                          ? '#ff9100'
                          : st.isError
                          ? '#f85149'
                          : st.isDone
                          ? '#00ff9d'
                          : '#6e7681',
                      }}
                    >
                      {isRunning ? '🔥 ACTIVE' : st.statusLabel || 'IDLE'}
                    </span>
                  </div>
                </button>
                {idx < steps.length - 1 && (
                  <span
                    className={`dag-ribbon-connector ${outgoingDisabled ? 'disabled' : ''} ${
                      isRunning ? 'active-flow' : ''
                    }`}
                    title={outgoingDisabled ? 'Connector paused' : 'Active transition'}
                  >
                    ➔
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  const loopDiag = dagStatus?.loop_diagnosis;
  const showAttentionBanner = Boolean(
    loopDiag &&
      !loopDiag.loop_running &&
      !loopDiag.is_complete &&
      (loopDiag.manual_attention_required ||
        loopDiag.headless_status === 'STOPPED' ||
        loopDiag.orchestration_status === 'PAUSED')
  );

  return (
    <div className="dag-pipeline-ribbon-wrapper" data-testid="interactive-dag-ribbon">
      <div className="dag-pipeline-ribbon">
        {renderPhaseGroup(1, 'Phase I — Initialize', '#58a6ff')}
        <span className="dag-phase-divider">➔</span>
        {renderPhaseGroup(2, 'Phase II — Capture & OCR Loop', '#00ff9d')}
        <span className="dag-phase-divider">➔</span>
        {renderPhaseGroup(3, 'Phase III — Post-Capture Analyzer & Sandbox', '#38bdf8')}
      </div>

      {/* Loop Stopped / Manual Attention Required Alert & One-Click Resume Banner */}
      {showAttentionBanner && loopDiag && (
        <div className="loop-attention-banner" data-testid="loop-attention-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <AlertTriangle size={16} color="#ff7b72" style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(248, 81, 73, 0.25)',
                    border: '1px solid #f85149',
                    color: '#ffa198',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  ⚠ LOOP HALTED — ATTENTION / AUTO-RESUME READY
                </span>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f0f6fc', fontFamily: 'var(--font-mono)' }}>
                  Frontier: Ln {loopDiag.frontier_line.toLocaleString()} / {loopDiag.target_total_lines.toLocaleString()} ({loopDiag.completion_percent}%) • Next Target: Ln {loopDiag.next_expected_top_line.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#e6edf3',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={loopDiag.halt_reason || loopDiag.recommended_action}
              >
                <strong>Diagnosis:</strong> {loopDiag.halt_reason || 'Capture loop paused before reaching target total lines.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => handleResumeLoopFromBanner(true)}
              disabled={isResumingLoop}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                borderColor: '#38bdf8',
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.12)',
              }}
              title="Dismiss any top notification banners, heal soft keyboard/viewport, and resume capture loop"
            >
              <Sparkles size={12} />
              <span>Heal Viewport &amp; Resume</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => handleResumeLoopFromBanner(false)}
              disabled={isResumingLoop}
              data-testid="resume-capture-loop-btn"
              style={{
                padding: '5px 12px',
                fontSize: '11.5px',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #059669, #10b981)',
                borderColor: '#34d399',
                color: '#022c22',
                boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)',
              }}
            >
              <Play size={12} />
              <span>{isResumingLoop ? 'Resuming...' : `▶ Resume Capture Loop (Ln ${loopDiag.next_expected_top_line})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Compact Single-Card Node Popover */}
      {popoverNodeId && activePopoverMeta && (
        <div
          ref={popoverRef}
          className="dag-compact-node-popover"
          data-testid={`dag-node-popover-${popoverNodeId}`}
        >
          <div className="dag-popover-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                className="dag-popover-step-badge"
                style={{ background: activePopoverMeta.accentColor }}
              >
                Step {activePopoverMeta.step}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '12px', color: '#f0f6fc' }}>
                  {activePopoverMeta.fullName}
                </div>
                <div style={{ fontSize: '10.5px', color: '#8b949e' }}>
                  {activePopoverMeta.subhead}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setPopoverNodeId(null)}
            >
              <X size={13} />
            </button>
          </div>

          <p style={{ fontSize: '11px', color: '#c9d1d9', margin: '6px 0 10px', lineHeight: 1.4 }}>
            {activePopoverMeta.desc}
          </p>

          {/* Primary Node Isolation & Connector Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => handleRunNodeIsolated(popoverNodeId)}
              disabled={runningNodeId === popoverNodeId}
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              <Play size={11} />
              <span>{runningNodeId === popoverNodeId ? 'Running...' : 'Run Node in Isolation'}</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setUniversalConfigNode(activePopoverMeta)}
              style={{ padding: '4px 8px', fontSize: '10.5px' }}
            >
              <Sliders size={11} />
              <span>Full Node Config</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => handleToggleSemaphore('semaphore_group2_to_3')}
              style={{ padding: '4px 8px', fontSize: '10.5px' }}
              title="Toggle Semaphore Gate between Capture and Navigation"
            >
              {dagStatus?.dag?.semaphore_group2_to_3 !== false ? (
                <>
                  <Unlock size={11} color="#00ff9d" />
                  <span>Gate Open</span>
                </>
              ) : (
                <>
                  <Lock size={11} color="#f85149" />
                  <span>Gate Paused</span>
                </>
              )}
            </button>
          </div>

          {/* Outgoing Connectors */}
          {activePopoverEdges.length > 0 && (
            <div className="dag-popover-section">
              <div className="dag-popover-section-title">Outgoing Connectors</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {activePopoverEdges.map((edge) => {
                  const enabled = edge.enabled !== false;
                  return (
                    <button
                      key={`${edge.from}->${edge.to}`}
                      type="button"
                      className={`btn btn-sm ${enabled ? 'btn-outline' : 'btn-danger'}`}
                      onClick={() => handleToggleOutgoingEdge(popoverNodeId, edge)}
                      style={{ padding: '2px 8px', fontSize: '10px' }}
                    >
                      <span>
                        {edge.from} <ChevronRight size={10} /> {edge.to} ({enabled ? 'ON' : 'OFF'})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tunable Parameters Grid */}
          <div className="dag-popover-section">
            <div className="dag-popover-section-title">Node &amp; Loop Parameters</div>
            <div className="dag-popover-params-grid">
              <label>
                <span>lines_per_page</span>
                <input
                  type="number"
                  value={linesPerPage}
                  onChange={(e) => setLinesPerPage(Number(e.target.value) || 49)}
                />
              </label>
              <label>
                <span>scroll_padding_lines</span>
                <input
                  type="number"
                  value={scrollPaddingLines}
                  onChange={(e) => setScrollPaddingLines(Number(e.target.value) || 0)}
                />
              </label>
              <label>
                <span>settle_delay_ms</span>
                <input
                  type="number"
                  value={settleDelayMs}
                  onChange={(e) => setSettleDelayMs(Number(e.target.value) || 50)}
                />
              </label>
              <label>
                <span>headless_mode</span>
                <button
                  type="button"
                  className={`btn btn-sm ${headlessMode ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setHeadlessMode((h) => !h)}
                  style={{ height: '24px', padding: '0 8px', fontSize: '10px', justifyContent: 'center' }}
                >
                  <Zap size={10} />
                  <span>{headlessMode ? 'Enabled' : 'Disabled'}</span>
                </button>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => handleSelfHealAction('autofix_viewport')}
                  style={{ padding: '2px 7px', fontSize: '10px' }}
                  title="Self-heal: Dismiss Android soft keyboard and focus editor"
                >
                  <Sparkles size={10} color="#00ff9d" />
                  <span>Heal Viewport</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => handleSelfHealAction('prepare_editor')}
                  style={{ padding: '2px 7px', fontSize: '10px' }}
                  title="Self-heal: Maximize editor window in Edit + Dark Mode"
                >
                  <span>Maximize + Dark</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => onToggleProhibitKeyboard?.(!desktopKeyboardProhibited)}
                  style={{ padding: '2px 7px', fontSize: '10px' }}
                >
                  <span>IME Guard: {desktopKeyboardProhibited ? 'ON' : 'OFF'}</span>
                </button>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleSaveNodeParams}
                disabled={isSavingParams}
                style={{ padding: '3px 10px', fontSize: '10.5px' }}
              >
                <span>{isSavingParams ? 'Saving...' : 'Apply Params'}</span>
              </button>
            </div>
          </div>

          {nodeActionFeedback && (
            <div
              style={{
                marginTop: '8px',
                padding: '4px 8px',
                borderRadius: '4px',
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: '10.5px',
                color: '#38bdf8',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Activity size={11} />
              <span>{nodeActionFeedback}</span>
            </div>
          )}
        </div>
      )}

      {/* Full Node Configuration Modal (when requested from popover) */}
      {universalConfigNode && (
        <UniversalNodeConfigModal
          isOpen={Boolean(universalConfigNode)}
          nodeId={universalConfigNode.id}
          nodeTitle={universalConfigNode.fullName}
          apiBase={apiBase}
          activeSerial={activeDeviceSerial}
          nodeConfig={dagStatus?.dag?.nodes?.[universalConfigNode.id]?.config || {}}
          initialAttachedActions={dagStatus?.dag?.nodes?.[universalConfigNode.id]?.attached_actions || []}
          onClose={() => setUniversalConfigNode(null)}
          onSave={async (cfg, actions) => {
            try {
              await fetch(`${apiBase}/api/dag/nodes/${encodeURIComponent(universalConfigNode.id)}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: cfg, attached_actions: actions }),
              });
            } catch {}
            await fetchDagStatus();
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};

export default FlowDag;
