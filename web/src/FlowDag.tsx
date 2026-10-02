import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers, RefreshCw, Check, X, Play, AlertTriangle,
  Maximize2, Minimize2, Square, Minus
} from 'lucide-react';
import { cleanErrorMessage } from './utils/logParser';
import type {
  DagStatusData, Node5ConfigState, TriggerDecisionState, PerformanceDiagnosis
} from './types/dag';
import { NODES_METADATA } from './types/dag';
import {
  copyToClipboard, calculateNodeLiveStatus, formatNodeDiagnosticsMarkdown, discernNodePerformance
} from './utils/dagDiagnostics';
import { DagSvgAssets } from './components/dag/DagSvgAssets';
import { MicroConnectingArrow, LoopbackArrow, LoopbackReturnTrack } from './components/dag/DagArrows';
import { DagNodeCard } from './components/dag/DagNodeCard';
import { DagNodePopover, DagBlockedDiagnosticBox } from './components/dag/DagNodePopover';
import { DagInspectorModal } from './components/dag/DagInspectorModal';
import { AiPerformancePromptModal } from './components/dag/AiPerformancePromptModal';
import {
  Node3CaptureConfigModal,
  Node4OcrConfigModal,
  Node6QualifierConfigModal,
  Node3bExtractedTextModal
} from './components/dag/DagConfigModals';

export interface FlowDagProps {
  apiBase: string;
  activeProjectId?: string | null;
  activeDeviceSerial?: string | null;
  currentTopLine?: number;
  currentBottomLine?: number;
  targetTotalLines?: number;
  currentPage?: number;
  isOrchestrating?: boolean;
  onRefresh?: () => void;
  selectedDag?: 'all' | 'initialize' | 'capture_entire_markdown';
  onSelectDag?: (dag: 'all' | 'initialize' | 'capture_entire_markdown') => void;
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
}

export const FlowDag: React.FC<FlowDagProps> = ({
  apiBase, activeProjectId, activeDeviceSerial, currentTopLine = 1, currentBottomLine = 49,
  targetTotalLines = 0, currentPage = 1, isOrchestrating: _isOrchestrating = false, onRefresh,
  selectedDag = 'all', onSelectDag, selectedNodeId, onSelectNodeId,
  projectInitProgress, onDismissInitProgress, onRetryInit, eventsLog = [],
  onClose, isMinimized = false, onToggleMinimize
}) => {
  // Navigation & selection state
  const [isMaximized, setIsMaximized] = useState(false);
  const [internalSelectedDag, setInternalSelectedDag] = useState<'all' | 'initialize' | 'capture_entire_markdown'>(selectedDag);
  const effectiveSelectedDag = onSelectDag ? selectedDag : internalSelectedDag;
  const handleDagSelect = (dag: 'all' | 'initialize' | 'capture_entire_markdown') => {
    if (onSelectDag) onSelectDag(dag);
    else setInternalSelectedDag(dag);
  };

  const [internalSelectedNodeId, setInternalSelectedNodeId] = useState<string>('init_end');
  const activeSelectedNodeId = selectedNodeId !== undefined ? selectedNodeId : internalSelectedNodeId;
  const handleSelectNode = (id: string | null) => {
    if (onSelectNodeId) onSelectNodeId(id);
    else setInternalSelectedNodeId(id || 'init_end');
  };

  const [pinnedHoverNodeId, setPinnedHoverNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [dismissedNode7Diagnostic, setDismissedNode7Diagnostic] = useState(false);

  // Modal display states
  const [isInspectorModalOpen, setIsInspectorModalOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptModalNodeId, setPromptModalNodeId] = useState<string>('init_end');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isNode3ConfigOpen, setIsNode3ConfigOpen] = useState(false);
  const [isNode4ConfigOpen, setIsNode4ConfigOpen] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isFixingQualifier, setIsFixingQualifier] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);
  const [nodeFeedback, setNodeFeedback] = useState<{ id: string; message: string; isError?: boolean } | null>(null);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  const [isLoopRunning, setIsLoopRunning] = useState<boolean>(false);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [runningGroupId, setRunningGroupId] = useState<string | null>(null);
  const [serverDiagnosisCache, setServerDiagnosisCache] = useState<Record<string, PerformanceDiagnosis>>({});

  const [dagStatus, setDagStatus] = useState<DagStatusData>({
    active_node: 'node_1_end', target_total_lines: targetTotalLines,
    current_top_line: currentTopLine, current_bottom_line: currentBottomLine,
    current_page: currentPage, is_keyboard_guarded: true, arrow_step_count: 48,
    verification_trigger_fired: false, ocr_worker_active: true, ocr_latency_ms: 45
  });

  const [node3Config, setNode3Config] = useState({
    settle_delay_ms: 300, guard_keyboard: true, mode: 'desktop'
  });

  const [node4Config, setNode4Config] = useState({
    engine: 'local:rapidocr', ocr_worker_timeout_s: 15, min_confidence: 0.8
  });

  const [node5Config, setNode5Config] = useState<Node5ConfigState>({
    prevent_trigger_on_issue: true,
    qualifiers: {
      modal_overlay: { name: 'Modal Overlay Check', description: 'Is a modal appearing over the teams markdown?', enabled: true, severity: 'blocking' },
      matrix_app_overlay: { name: 'Matrix App Capture Check', description: 'Is the mobile app matrix capture appearing over teams markdown?', enabled: true, severity: 'blocking' },
      ocr_degraded: { name: 'OCR Quality Degradation Check', description: 'Has previous ocr capture degraded?', enabled: true, severity: 'blocking' },
      keyboard_open: { name: 'Virtual Keyboard Check', description: 'Is software keyboard active or covering content?', enabled: true, severity: 'warning' },
      edit_mode: { name: 'Edit Mode Qualifier', description: 'Ensure editor is in single-pane edit mode', enabled: true, severity: 'blocking' },
      light_mode: { name: 'Theme Qualifier', description: 'Ensure editor is in dark mode', enabled: true, severity: 'blocking' },
      view_mode: { name: 'Legacy View Qualifier', description: 'Ensure document in single edit pane with gutter lines visible', enabled: false, severity: 'warning' }
    }
  });

  const [triggerDecision, setTriggerDecision] = useState<TriggerDecisionState>({ allowed: true, prevented: false, reasons: [] });

  const isAnyModalOpen = isInspectorModalOpen || isPromptModalOpen || isConfigModalOpen || isTextModalOpen || isNode3ConfigOpen || isNode4ConfigOpen;

  // Real-time synchronization
  useEffect(() => {
    const fetchDag = async () => {
      try {
        const res = await fetch(`${apiBase}/api/dag/status`);
        if (res.ok) {
          const d = await res.json();
          setDagStatus(prev => ({
            ...prev,
            ...d,
            target_total_lines: d.target_total_lines !== undefined ? d.target_total_lines : targetTotalLines,
            current_top_line: d.current_top_line || currentTopLine,
            current_bottom_line: d.current_bottom_line || currentBottomLine,
            current_page: d.current_page || currentPage
          }));
          if (d.node_5_config?.qualifiers) setNode5Config(prev => ({ ...prev, ...d.node_5_config, qualifiers: { ...prev.qualifiers, ...d.node_5_config.qualifiers } }));
          if (d.dag?.nodes?.frame_acquire?.config) setNode3Config(prev => ({ ...prev, ...d.dag.nodes.frame_acquire.config }));
          if (d.dag?.nodes?.frame_ocr?.config) setNode4Config(prev => ({ ...prev, ...d.dag.nodes.frame_ocr.config }));
          if (d.trigger_decision) setTriggerDecision(d.trigger_decision);
        }
        try {
          const lRes = await fetch(`${apiBase}/api/dag/loop/status`);
          if (lRes.ok) setIsLoopRunning(Boolean((await lRes.json()).running));
        } catch {}
      } catch {}
    };
    fetchDag();
    const t = setInterval(fetchDag, 1500);
    return () => clearInterval(t);
  }, [apiBase, targetTotalLines, currentTopLine, currentBottomLine, currentPage]);

  // Derived status computations
  const currentActiveNode = dagStatus.dag?.current_active_node || dagStatus.active_node || null;
  const activeNodeObj = currentActiveNode ? dagStatus.dag?.nodes?.[currentActiveNode] : null;
  const isCurrentNodeReallyActive = Boolean(activeNodeObj && (activeNodeObj.status === 'active' || activeNodeObj.is_active === true));
  const activeRunningId = runningNodeId || (isCurrentNodeReallyActive ? currentActiveNode : null);

  const initGroup = dagStatus.dag?.groups?.initialize || {};
  const captureGroup = dagStatus.dag?.groups?.capture_entire_markdown || {};

  const node1 = dagStatus.dag?.nodes?.init_end || {};
  const node2 = dagStatus.dag?.nodes?.reset_home || {};
  const node3b = dagStatus.dag?.nodes?.local_ai_ocr || {};

  const isNode1Running = activeRunningId === 'init_end';
  const isNode2Running = activeRunningId === 'reset_home';
  const isNode1Error = node1.status === 'error' || Boolean(node1.error);
  const isNode1Calibrated = !isNode1Error && node1.status === 'completed' && (node1.total_lines || 0) > 0;
  const isNode2Verified = node2.status === 'completed' && Boolean(node2.verified);

  const isInitGroupRunning = Boolean(runningGroupId === 'initialize' || initGroup.status === 'active' || isNode1Running || isNode2Running || (projectInitProgress?.active && projectInitProgress.status === 'running'));
  const isInitGroupCompleted = Boolean(!isInitGroupRunning && (initGroup.status === 'completed' || (isNode1Calibrated && isNode2Verified) || projectInitProgress?.status === 'completed'));
  const isInitGroupError = Boolean(!isInitGroupRunning && (initGroup.status === 'error' || isNode1Error || projectInitProgress?.status === 'error'));

  const isCaptureGroupRunning = Boolean(runningGroupId === 'capture_entire_markdown' || captureGroup.status === 'active' || isLoopRunning || (activeRunningId !== null && !['init_end', 'reset_home'].includes(activeRunningId)));

  // Single-purpose status resolver
  const getNodeLiveStatus = useCallback((id: string) => {
    return calculateNodeLiveStatus(id, dagStatus, activeRunningId, targetTotalLines);
  }, [dagStatus, activeRunningId, targetTotalLines]);

  const selectedNodeMeta = NODES_METADATA.find(n => n.id === activeSelectedNodeId) || NODES_METADATA[0];

  // Actions
  const handleRunNode = async (nodeId: string) => {
    setRunningNodeId(nodeId);
    setNodeFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/${nodeId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: activeDeviceSerial })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || `Failed to run ${nodeId}`);
      setNodeFeedback({ id: nodeId, message: data.message || `Node ${nodeId} ran successfully ✔`, isError: data.status === 'warning' });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: nodeId, message: `Node execution error: ${err.message}`, isError: true });
    } finally {
      setRunningNodeId(null);
    }
  };

  const handleAbortNode = async (nodeId?: string) => {
    try {
      const url = nodeId ? `${apiBase}/api/dag/nodes/${nodeId}/abort` : `${apiBase}/api/dag/nodes/abort`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      setRunningNodeId(null);
      setNodeFeedback({ id: nodeId || 'abort', message: data.message || 'Operation aborted ⏹' });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: nodeId || 'abort', message: `Abort error: ${err.message}`, isError: true });
    }
  };

  const handleRunGroup = async (groupId: string) => {
    setRunningGroupId(groupId);
    setNodeFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/groups/${groupId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: activeDeviceSerial, project_id: activeProjectId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || `Failed to run DAG group ${groupId}`);
      setNodeFeedback({
        id: groupId,
        message: data.status === 'success' ? `DAG Group executed successfully ✔` : (data.error || 'Execution completed'),
        isError: data.status === 'error'
      });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: groupId, message: `Group run error: ${err.message}`, isError: true });
    } finally {
      setRunningGroupId(null);
    }
  };

  const handleToggleLoop = async () => {
    try {
      if (isLoopRunning) {
        await fetch(`${apiBase}/api/dag/loop/stop`, { method: 'POST' });
        setIsLoopRunning(false);
        setNodeFeedback({ id: 'loop', message: 'Continuous capture loop stopped' });
      } else {
        await fetch(`${apiBase}/api/dag/loop/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial: activeDeviceSerial })
        });
        setIsLoopRunning(true);
        setNodeFeedback({ id: 'loop', message: 'Continuous capture loop started ✔' });
      }
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: 'loop', message: `Loop control error: ${err.message}`, isError: true });
    }
  };

  const handleCopyNodeDetailsForAi = async (nodeId: string) => {
    const meta = NODES_METADATA.find(n => n.id === nodeId) || NODES_METADATA[0];
    const live = getNodeLiveStatus(nodeId);
    const md = formatNodeDiagnosticsMarkdown(meta, live, dagStatus, eventsLog, activeProjectId, activeDeviceSerial);
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopiedNodeId(nodeId);
      setTimeout(() => setCopiedNodeId(null), 2500);
    }
  };

  const handleOpenPromptModal = async (nodeId: string) => {
    setPinnedHoverNodeId(null);
    setHoveredNodeId(null);
    setPromptModalNodeId(nodeId);
    setIsPromptModalOpen(true);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/${nodeId}/root-cause`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          const prompt = data.markdown_prompt || '';
          setServerDiagnosisCache(prev => ({
            ...prev,
            [nodeId]: {
              ...data,
              promptDataUri: 'data:text/markdown;charset=utf-8,' + encodeURIComponent(prompt)
            }
          }));
        }
      }
    } catch {}
  };

  // Node 5/6 Qualifier Handlers
  const handleAutoFixKeyboardAndUnblock = async () => {
    setIsFixingQualifier(true);
    try {
      await fetch(`${apiBase}/api/device/autofix-viewport`, { method: 'POST' });
      await fetch(`${apiBase}/api/classifiers/fix/keyboard_open`, { method: 'POST' });
      const res = await fetch(`${apiBase}/api/dag/nodes/verification_trigger/evaluate`, { method: 'POST' });
      if (res.ok) setTriggerDecision((await res.json()).trigger_decision);
      setNodeFeedback({ id: 'verification_trigger', message: 'Auto-fixed viewport & dismissed soft keyboard ✔' });
    } catch {
      setNodeFeedback({ id: 'verification_trigger', message: 'Failed to auto-fix viewport', isError: true });
    } finally {
      setIsFixingQualifier(false);
    }
  };

  const handleBypassKeyboardQualifier = async () => {
    setIsFixingQualifier(true);
    try {
      const updated = { ...node5Config.qualifiers, keyboard_open: { ...node5Config.qualifiers.keyboard_open, enabled: false } };
      const res = await fetch(`${apiBase}/api/dag/nodes/verification_trigger/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualifiers: updated })
      });
      if (res.ok) {
        const d = await res.json();
        setNode5Config(prev => ({ ...prev, qualifiers: updated }));
        if (d.trigger_decision) setTriggerDecision(d.trigger_decision);
      }
    } finally {
      setIsFixingQualifier(false);
    }
  };

  const handleEvaluateNode5 = async () => {
    setIsEvaluating(true);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/verification_trigger/evaluate`, { method: 'POST' });
      if (res.ok) setTriggerDecision((await res.json()).trigger_decision);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Save config handlers
  const handleSaveNode3 = async () => {
    setIsSavingConfig(true);
    try {
      await fetch(`${apiBase}/api/dag/nodes/frame_acquire/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node3Config) });
      setIsNode3ConfigOpen(false);
    } finally { setIsSavingConfig(false); }
  };

  const handleSaveNode4 = async () => {
    setIsSavingConfig(true);
    try {
      await fetch(`${apiBase}/api/dag/nodes/frame_ocr/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node4Config) });
      setIsNode4ConfigOpen(false);
    } finally { setIsSavingConfig(false); }
  };

  const handleSaveNode5 = async () => {
    setIsSavingConfig(true);
    try {
      await fetch(`${apiBase}/api/dag/nodes/verification_trigger/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node5Config) });
      setIsConfigModalOpen(false);
      setConfigFeedback('Configuration updated successfully');
      setTimeout(() => setConfigFeedback(null), 3000);
    } catch (err: any) {
      setConfigFeedback(`Failed to save config: ${err?.message || err}`);
    } finally { setIsSavingConfig(false); }
  };

  if (isMinimized) {
    return (
      <div style={{
        background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px',
        padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        color: '#e6edf3', fontFamily: 'var(--font-mono, monospace)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={14} color="#00ff9d" />
          <span style={{ fontWeight: 800, fontSize: '11px', color: '#00ff9d', letterSpacing: '0.6px' }}>PAGINATION FLOW DAG</span>
          <span style={{ fontSize: '9.5px', color: '#8b949e', background: '#161b22', border: '1px solid #30363d', padding: '1px 6px', borderRadius: '4px' }}>
            {isCaptureGroupRunning ? 'Capturing Cycle...' : (isInitGroupRunning ? 'Initializing...' : 'Ready')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onToggleMinimize} style={{ fontSize: '10.5px', padding: '2px 8px' }}>
            <Maximize2 size={11} style={{ marginRight: '4px' }} /> Restore DAG
          </button>
          {onClose && (
            <button type="button" className="win-btn win-btn-close" onClick={onClose} title="Close DAG Window">
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Active hover/pinned node
  const activeHoverNode = pinnedHoverNodeId
    ? NODES_METADATA.find(n => n.id === pinnedHoverNodeId)
    : (hoveredNodeId ? NODES_METADATA.find(n => n.id === hoveredNodeId) : null);

  const promptDiagnosis = serverDiagnosisCache[promptModalNodeId] || discernNodePerformance(
    NODES_METADATA.find(n => n.id === promptModalNodeId) || NODES_METADATA[0],
    getNodeLiveStatus(promptModalNodeId),
    dagStatus,
    activeDeviceSerial
  );

  return (
    <div style={{
      position: isMaximized ? 'fixed' : 'relative',
      zIndex: isMaximized ? 1200 : 50,
      background: '#0a0e17',
      border: '1px solid #30363d',
      borderRadius: '10px',
      padding: '8px 12px',
      color: '#e6edf3',
      fontFamily: 'var(--font-mono, monospace)',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      ...(isMaximized ? { inset: '14px', overflowY: 'auto', boxShadow: '0 12px 48px rgba(0,0,0,0.85)' } : {})
    }}>
      <DagSvgAssets />

      {/* TOP HEADER: STATUS & REFINED CONTROLS INTEGRATED WITH PROGRESS AREA */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minHeight: '26px' }}>
          {/* Left: Info & Progress Stage */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            {projectInitProgress && projectInitProgress.active ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '4px',
                  background: projectInitProgress.status === 'error' ? 'rgba(248,81,73,0.2)' : (projectInitProgress.status === 'completed' ? 'rgba(0,255,157,0.2)' : 'rgba(88,166,255,0.2)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {projectInitProgress.status === 'running' && <RefreshCw size={11} className="spin" color="#58a6ff" />}
                  {projectInitProgress.status === 'completed' && <Check size={12} color="#00ff9d" />}
                  {projectInitProgress.status === 'error' && <AlertTriangle size={12} color="#ff7b72" />}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#f0f6fc', flexShrink: 0 }}>
                  {projectInitProgress.status === 'completed' ? 'WORKSPACE INITIALIZED' : (projectInitProgress.status === 'error' ? 'INITIALIZATION HALTED' : 'INITIALIZING WORKSPACE')}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '0 5px', borderRadius: '8px', background: 'rgba(88,166,255,0.15)', color: '#58a6ff', flexShrink: 0 }}>
                  {projectInitProgress.percent}%
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color: projectInitProgress.status === 'error' ? '#ff7b72' : '#8b949e',
                    marginLeft: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0
                  }}
                  title={projectInitProgress.error || projectInitProgress.stage}
                >
                  {cleanErrorMessage(projectInitProgress.stage)}
                </span>
                {onDismissInitProgress && (
                  <button
                    type="button"
                    onClick={onDismissInitProgress}
                    title="Dismiss notification"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8b949e',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <Layers size={15} color="#00ff9d" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.6px', color: '#00ff9d', flexShrink: 0 }}>PAGINATION FLOW DAG</span>
                <span style={{ color: '#6e7681', fontSize: '10px', flexShrink: 0 }}>|</span>
                <span style={{ fontSize: '10px', color: '#8b949e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                  Page #{dagStatus.current_page || currentPage} · Ln {dagStatus.current_top_line || 1}-{dagStatus.current_bottom_line || 49} of {dagStatus.target_total_lines || targetTotalLines || 'EOF'} lines · Target Next Ln {Math.max(1, (dagStatus.current_bottom_line || 49) + 1)}
                </span>
              </div>
            )}
          </div>

          {/* Right Action Controls Cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
            {projectInitProgress && projectInitProgress.status === 'error' && onRetryInit && (
              <button
                type="button"
                onClick={onRetryInit}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(56, 139, 253, 0.25)',
                  border: '1px solid #388bfd', color: '#58a6ff', padding: '2px 8px', borderRadius: '4px',
                  fontSize: '9.5px', fontWeight: 800, cursor: 'pointer', height: '22px'
                }}
              >
                <RefreshCw size={10} /> <span>Retry Init</span>
              </button>
            )}

            <span style={{
              fontSize: '8.5px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
              background: isCaptureGroupRunning ? 'rgba(255, 107, 37, 0.25)' : (isInitGroupRunning ? 'rgba(88, 166, 255, 0.25)' : 'rgba(0, 255, 157, 0.15)'),
              color: isCaptureGroupRunning ? '#ffa657' : (isInitGroupRunning ? '#58a6ff' : '#00ff9d')
            }}>
              {isCaptureGroupRunning ? 'LOOP ACTIVE' : (isInitGroupRunning ? 'INITIALIZING' : 'READY')}
            </span>

            {/* Filter buttons */}
            <div style={{ display: 'inline-flex', background: '#161b22', padding: '2px', borderRadius: '5px', border: '1px solid #30363d', gap: '2px' }}>
              {(['all', 'initialize', 'capture_entire_markdown'] as const).map(dag => (
                <button
                  key={dag}
                  type="button"
                  onClick={() => handleDagSelect(dag)}
                  style={{
                    padding: '2px 7px', fontSize: '9px', fontWeight: effectiveSelectedDag === dag ? 800 : 600,
                    background: effectiveSelectedDag === dag ? '#388bfd' : 'transparent',
                    color: effectiveSelectedDag === dag ? '#fff' : '#8b949e',
                    border: 'none', borderRadius: '3px', cursor: 'pointer'
                  }}
                >
                  {dag === 'all' ? 'All' : (dag === 'initialize' ? 'DAG 1' : 'DAG 2')}
                </button>
              ))}
            </div>

            {/* Continuous Capture Loop Toggle */}
            <button
              type="button"
              onClick={handleToggleLoop}
              disabled={isInitGroupRunning}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px',
                borderRadius: '5px', border: `1.5px solid ${isLoopRunning ? '#f85149' : '#00ff9d'}`,
                background: isLoopRunning ? 'rgba(248, 81, 73, 0.25)' : 'rgba(0, 255, 157, 0.18)',
                color: isLoopRunning ? '#ff7b72' : '#00ff9d',
                fontSize: '9.5px', fontWeight: 900, cursor: isInitGroupRunning ? 'not-allowed' : 'pointer',
                letterSpacing: '0.4px', height: '24px'
              }}
              title={isLoopRunning ? 'Stop continuous capture loop' : 'Start continuous loop (Nodes 3→8 Repeating until 100% captured)'}
            >
              {isLoopRunning ? <Square size={10} fill="#ff7b72" /> : <Play size={10} fill="#00ff9d" />}
              <span>{isLoopRunning ? 'STOP LOOP' : 'RUN CAPTURE LOOP'}</span>
            </button>

            {/* Window Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
              <button
                type="button"
                className="win-btn"
                onClick={onToggleMinimize}
                title="Minimize DAG Window"
                style={{ width: '22px', height: '22px' }}
              >
                <Minus size={11} />
              </button>
              <button
                type="button"
                className="win-btn"
                onClick={() => setIsMaximized(m => !m)}
                title={isMaximized ? 'Restore DAG' : 'Maximize DAG'}
                style={{ width: '22px', height: '22px' }}
              >
                {isMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
              {onClose && (
                <button
                  type="button"
                  className="win-btn win-btn-close"
                  onClick={onClose}
                  title="Close DAG Window"
                  style={{ width: '22px', height: '22px' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action feedback bar */}
        {nodeFeedback && (
          <div style={{
            fontSize: '9.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
            background: nodeFeedback.isError ? 'rgba(248,81,73,0.18)' : 'rgba(0,255,157,0.15)',
            border: `1px solid ${nodeFeedback.isError ? '#f85149' : '#00ff9d'}`,
            color: nodeFeedback.isError ? '#ff7b72' : '#00ff9d',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span>{nodeFeedback.message}</span>
            <button
              type="button"
              onClick={() => setNodeFeedback(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      {/* DAG GROUPS & NODES CANVAS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', position: 'relative' }}>
        {/* GROUP 1: INITIALIZE */}
        {(effectiveSelectedDag === 'all' || effectiveSelectedDag === 'initialize') && (
          <div
            style={{
              flex: '0 0 auto',
              width: '280px',
              background: isInitGroupRunning
                ? 'linear-gradient(180deg, rgba(88, 166, 255, 0.12) 0%, rgba(13, 17, 23, 0.8) 100%)'
                : (effectiveSelectedDag === 'initialize' ? 'rgba(88, 166, 255, 0.06)' : 'rgba(15, 23, 42, 0.4)'),
              border: `1.5px solid ${isInitGroupError ? '#f85149' : (isInitGroupRunning ? '#58a6ff' : (isInitGroupCompleted ? '#238636' : '#30363d'))}`,
              borderRadius: '8px',
              padding: '4px 6px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              cursor: 'default',
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: isInitGroupError ? '#ff7b72' : (isInitGroupRunning ? '#58a6ff' : '#00ff9d') }}>
                  DAG 1: INIT
                </span>
                <span style={{
                  fontSize: '8px', padding: '0 4px', borderRadius: '3px',
                  background: isInitGroupError ? 'rgba(248,81,73,0.25)' : (isInitGroupCompleted ? 'rgba(0,255,157,0.15)' : 'rgba(88,166,255,0.15)'),
                  color: isInitGroupError ? '#ff7b72' : (isInitGroupCompleted ? '#00ff9d' : '#58a6ff'),
                  fontWeight: 800
                }}>
                  {isInitGroupError ? 'ISSUE' : (isInitGroupCompleted ? 'DONE' : (isInitGroupRunning ? 'ACTIVE' : 'IDLE'))}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRunGroup('initialize'); }}
                disabled={runningGroupId !== null || runningNodeId !== null}
                style={{
                  display: 'flex', alignItems: 'center', gap: '3px', padding: '1px 5px',
                  borderRadius: '3px', border: '1px solid rgba(88, 166, 255, 0.4)',
                  background: 'rgba(88, 166, 255, 0.15)', color: '#58a6ff',
                  fontSize: '8.5px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                {isInitGroupRunning ? <RefreshCw size={8} className="spin" /> : <Play size={8} />}
                <span>Run</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', width: '100%' }}>
              <DagNodeCard
                node={NODES_METADATA[0]}
                status={getNodeLiveStatus(NODES_METADATA[0].id)}
                isSelected={activeSelectedNodeId === NODES_METADATA[0].id}
                isPinned={pinnedHoverNodeId === NODES_METADATA[0].id}
                isPulsingSwirl={activeRunningId === NODES_METADATA[0].id}
                copiedNodeId={copiedNodeId}
                onSelect={() => handleSelectNode(NODES_METADATA[0].id)}
                onDoubleClick={() => setPinnedHoverNodeId(prev => prev === NODES_METADATA[0].id ? null : NODES_METADATA[0].id)}
                onMouseEnter={() => setHoveredNodeId(NODES_METADATA[0].id)}
                onMouseLeave={() => setHoveredNodeId(prev => prev === NODES_METADATA[0].id ? null : prev)}
                onCopyForAi={() => handleCopyNodeDetailsForAi(NODES_METADATA[0].id)}
                onOpenPromptModal={() => handleOpenPromptModal(NODES_METADATA[0].id)}
              />
              <MicroConnectingArrow
                fromNode={NODES_METADATA[0]}
                toNode={NODES_METADATA[1]}
                width={16}
                isActive={activeRunningId === NODES_METADATA[0].id || activeRunningId === NODES_METADATA[1].id || isInitGroupRunning}
                isHeat={isInitGroupRunning}
              />
              <DagNodeCard
                node={NODES_METADATA[1]}
                status={getNodeLiveStatus(NODES_METADATA[1].id)}
                isSelected={activeSelectedNodeId === NODES_METADATA[1].id}
                isPinned={pinnedHoverNodeId === NODES_METADATA[1].id}
                isPulsingSwirl={activeRunningId === NODES_METADATA[1].id}
                copiedNodeId={copiedNodeId}
                onSelect={() => handleSelectNode(NODES_METADATA[1].id)}
                onDoubleClick={() => setPinnedHoverNodeId(prev => prev === NODES_METADATA[1].id ? null : NODES_METADATA[1].id)}
                onMouseEnter={() => setHoveredNodeId(NODES_METADATA[1].id)}
                onMouseLeave={() => setHoveredNodeId(prev => prev === NODES_METADATA[1].id ? null : prev)}
                onCopyForAi={() => handleCopyNodeDetailsForAi(NODES_METADATA[1].id)}
                onOpenPromptModal={() => handleOpenPromptModal(NODES_METADATA[1].id)}
              />
            </div>
          </div>
        )}

        {/* Transition arrow from Group 1 to Group 2 */}
        {effectiveSelectedDag === 'all' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Play size={10} color="#00ff9d" fill="#00ff9d" />
          </div>
        )}

        {/* GROUP 2: CAPTURE ENTIRE MARKDOWN */}
        {(effectiveSelectedDag === 'all' || effectiveSelectedDag === 'capture_entire_markdown') && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              background: isCaptureGroupRunning
                ? 'linear-gradient(180deg, rgba(255, 107, 37, 0.12) 0%, rgba(13, 17, 23, 0.8) 100%)'
                : (effectiveSelectedDag === 'capture_entire_markdown' ? 'rgba(0, 255, 157, 0.05)' : 'rgba(15, 23, 42, 0.4)'),
              border: `1.5px solid ${isCaptureGroupRunning ? '#ff6b25' : '#30363d'}`,
              borderRadius: '8px',
              padding: '4px 6px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              cursor: 'default',
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: isCaptureGroupRunning ? '#ffa657' : '#00ff9d' }}>
                  DAG 2: CAPTURE ENTIRE MARKDOWN
                </span>
                <span style={{
                  fontSize: '8px', padding: '0 4px', borderRadius: '3px',
                  background: isCaptureGroupRunning ? 'rgba(255, 107, 37, 0.25)' : 'rgba(0, 255, 157, 0.12)',
                  color: isCaptureGroupRunning ? '#ffa657' : '#00ff9d',
                  fontWeight: 800
                }}>
                  {isCaptureGroupRunning ? '♨️ THERMAL CAPTURING' : 'READY'}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRunGroup('capture_entire_markdown'); }}
                disabled={runningGroupId !== null || runningNodeId !== null}
                style={{
                  display: 'flex', alignItems: 'center', gap: '3px', padding: '1px 5px',
                  borderRadius: '3px', border: '1px solid rgba(0, 255, 157, 0.4)',
                  background: 'rgba(0, 255, 157, 0.15)', color: '#00ff9d',
                  fontSize: '8.5px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                {isCaptureGroupRunning ? <RefreshCw size={8} className="spin" /> : <Play size={8} />}
                <span>1 Cycle</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', width: '100%' }}>
              {[2, 3, 4, 5, 6, 7].map((metaIdx, arrIdx) => {
                const nodeMeta = NODES_METADATA[metaIdx];
                const nextMeta = arrIdx < 5 ? NODES_METADATA[metaIdx + 1] : null;
                return (
                  <React.Fragment key={nodeMeta.id}>
                    <DagNodeCard
                      node={nodeMeta}
                      status={getNodeLiveStatus(nodeMeta.id)}
                      isSelected={activeSelectedNodeId === nodeMeta.id}
                      isPinned={pinnedHoverNodeId === nodeMeta.id}
                      isPulsingSwirl={activeRunningId === nodeMeta.id}
                      copiedNodeId={copiedNodeId}
                      onSelect={() => handleSelectNode(nodeMeta.id)}
                      onDoubleClick={() => setPinnedHoverNodeId(prev => prev === nodeMeta.id ? null : nodeMeta.id)}
                      onMouseEnter={() => setHoveredNodeId(nodeMeta.id)}
                      onMouseLeave={() => setHoveredNodeId(prev => prev === nodeMeta.id ? null : prev)}
                      onCopyForAi={() => handleCopyNodeDetailsForAi(nodeMeta.id)}
                      onOpenPromptModal={() => handleOpenPromptModal(nodeMeta.id)}
                    />
                    {nextMeta && (
                      <MicroConnectingArrow
                        fromNode={nodeMeta}
                        toNode={nextMeta}
                        width={14}
                        isActive={isCaptureGroupRunning || activeRunningId === nodeMeta.id || activeRunningId === nextMeta.id}
                        isHeat={isCaptureGroupRunning}
                      />
                    )}
                  </React.Fragment>
                );
              })}
              <LoopbackArrow isCaptureRunning={Boolean(isCaptureGroupRunning)} isPrevented={Boolean(triggerDecision?.prevented)} />
            </div>

            <LoopbackReturnTrack isCaptureRunning={Boolean(isCaptureGroupRunning)} isPrevented={Boolean(triggerDecision?.prevented)} />
          </div>
        )}
      </div>

      {/* DYNAMIC HOVER / PINNED POPOVER */}
      {!isAnyModalOpen && activeHoverNode && (
        <DagNodePopover
          node={activeHoverNode}
          liveStatus={getNodeLiveStatus(activeHoverNode.id)}
          isPinned={pinnedHoverNodeId === activeHoverNode.id}
          activeRunningId={activeRunningId}
          copiedNodeId={copiedNodeId}
          nodeEvents={eventsLog.filter(e => !e.dag || e.message.toLowerCase().includes(activeHoverNode.shortName.toLowerCase()))}
          onClose={() => { setPinnedHoverNodeId(null); setHoveredNodeId(null); }}
          onRunNode={handleRunNode}
          onAbortNode={handleAbortNode}
          onCopyForAi={handleCopyNodeDetailsForAi}
          onOpenPromptModal={handleOpenPromptModal}
          onOpenInspector={(id) => { handleSelectNode(id); setPinnedHoverNodeId(null); setHoveredNodeId(null); setIsInspectorModalOpen(true); }}
          onOpenConfig={(id) => {
            setPinnedHoverNodeId(null); setHoveredNodeId(null);
            if (id === 'frame_acquire') setIsNode3ConfigOpen(true);
            else if (id === 'frame_ocr') setIsNode4ConfigOpen(true);
            else if (id === 'verification_trigger') setIsConfigModalOpen(true);
          }}
        />
      )}

      {/* AUTO-OPENING DIAGNOSTIC HOVER BOX FOR VERIFICATION TRIGGER BLOCKED */}
      {!isAnyModalOpen && triggerDecision.prevented && !dismissedNode7Diagnostic && (
        <DagBlockedDiagnosticBox
          triggerDecision={triggerDecision}
          isFixingQualifier={isFixingQualifier}
          isEvaluating={isEvaluating}
          activeRunningId={activeRunningId}
          onDismiss={() => setDismissedNode7Diagnostic(true)}
          onAutoFixKeyboard={handleAutoFixKeyboardAndUnblock}
          onBypassKeyboard={handleBypassKeyboardQualifier}
          onReevaluate={handleEvaluateNode5}
          onRunNode={handleRunNode}
          onAbortNode={handleAbortNode}
          onOpenConfig={() => setIsConfigModalOpen(true)}
        />
      )}

      {/* MODAL 0: FULL NODE INSPECTOR */}
      {isInspectorModalOpen && (
        <DagInspectorModal
          isOpen={isInspectorModalOpen}
          onClose={() => setIsInspectorModalOpen(false)}
          selectedNodeMeta={selectedNodeMeta}
          liveStatus={getNodeLiveStatus(selectedNodeMeta.id)}
          activeRunningId={activeRunningId}
          copiedNodeId={copiedNodeId}
          onRunNode={handleRunNode}
          onAbortNode={handleAbortNode}
          onCopyNodeForAi={handleCopyNodeDetailsForAi}
          onOpenPromptModal={handleOpenPromptModal}
          onOpenTextModal={() => setIsTextModalOpen(true)}
          node3bExtractedText={node3b.extracted_text}
          diagnosis={promptDiagnosis}
          nodeTelemetryEvents={eventsLog.filter(e => !e.dag || e.message.toLowerCase().includes(selectedNodeMeta.shortName.toLowerCase()))}
          isNode1Calibrated={isNode1Calibrated}
          node1TotalLines={isNode1Calibrated ? (node1.total_lines || 0) : 0}
          isNode1Error={isNode1Error}
          apiBase={apiBase}
          onRefresh={onRefresh}
        />
      )}

      {/* MODAL 1: Node 3 Screen Capture Config */}
      <Node3CaptureConfigModal
        isOpen={isNode3ConfigOpen}
        onClose={() => setIsNode3ConfigOpen(false)}
        config={node3Config}
        onChangeConfig={setNode3Config}
        onSave={handleSaveNode3}
        isSaving={isSavingConfig}
      />

      {/* MODAL 2: Node 4 OCR Extraction Config */}
      <Node4OcrConfigModal
        isOpen={isNode4ConfigOpen}
        onClose={() => setIsNode4ConfigOpen(false)}
        config={node4Config}
        onChangeConfig={setNode4Config}
        onSave={handleSaveNode4}
        isSaving={isSavingConfig}
      />

      {/* MODAL 3: Node 6 Trigger Verification & Qualifiers Config */}
      <Node6QualifierConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={node5Config}
        onChangeConfig={setNode5Config}
        triggerDecision={triggerDecision}
        onToggleQualifier={(qId) => setNode5Config(prev => prev.qualifiers[qId] ? ({ ...prev, qualifiers: { ...prev.qualifiers, [qId]: { ...prev.qualifiers[qId], enabled: !prev.qualifiers[qId].enabled } } }) : prev)}
        onEvaluate={handleEvaluateNode5}
        isEvaluating={isEvaluating}
        onSave={handleSaveNode5}
        isSaving={isSavingConfig}
        feedback={configFeedback}
      />

      {/* MODAL 4: Node 3b Full Extracted Text Modal */}
      <Node3bExtractedTextModal
        isOpen={isTextModalOpen}
        onClose={() => setIsTextModalOpen(false)}
        extractedText={node3b.extracted_text || ''}
        linesCount={node3b.lines_count || 0}
        charCount={node3b.char_count || 0}
        modelUsed={node3b.model_used || 'MiniCPM-V'}
      />

      {/* MODAL 5: AI Resolution Prompt & Performance Diagnostics Modal */}
      {isPromptModalOpen && (
        <AiPerformancePromptModal
          isOpen={isPromptModalOpen}
          onClose={() => setIsPromptModalOpen(false)}
          nodeMeta={NODES_METADATA.find(n => n.id === promptModalNodeId) || NODES_METADATA[0]}
          diagnosis={promptDiagnosis}
        />
      )}
    </div>
  );
};
