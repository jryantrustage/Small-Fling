import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers, RefreshCw, Check, X, Play, AlertTriangle,
  Maximize2, Minimize2, Square, Minus, Activity, Lock, Sliders,
  ShieldAlert, Unlock, Info, RotateCcw
} from 'lucide-react';
import { cleanErrorMessage } from './utils/logParser';
import type { ProjectData } from './types';
import type {
  DagStatusData, Node5ConfigState, TriggerDecisionState, PerformanceDiagnosis
} from './types/dag';
import { NODES_METADATA } from './types/dag';
import {
  copyToClipboard, calculateNodeLiveStatus, formatNodeDiagnosticsMarkdown, discernNodePerformance
} from './utils/dagDiagnostics';
import { DagSvgAssets } from './components/dag/DagSvgAssets';
import {
  MicroConnectingArrow, LoopbackArrow,
  InteractiveDagConnector, InteractiveLoopbackConnector
} from './components/dag/DagArrows';
import { DagNodeCard } from './components/dag/DagNodeCard';
import { DagNodePopover, DagBlockedDiagnosticBox } from './components/dag/DagNodePopover';
import { DagInspectorModal } from './components/dag/DagInspectorModal';
import { AiPerformancePromptModal } from './components/dag/AiPerformancePromptModal';
import { Dag2PerformanceReportModal } from './components/dag/Dag2PerformanceReportModal';
import {
  Node3CaptureConfigModal,
  Node4OcrConfigModal,
  Node6QualifierConfigModal,
  Node3bExtractedTextModal
} from './components/dag/DagConfigModals';

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
  selectedDag?: 'all' | 'initialize' | 'capture_entire_markdown' | 'position_navigation' | 'verify_assemble';
  onSelectDag?: (dag: 'all' | 'initialize' | 'capture_entire_markdown' | 'position_navigation' | 'verify_assemble') => void;
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
  apiBase, activeProjectId, activeProject, onOpenSettings, activeDeviceSerial, currentTopLine = 0, currentBottomLine = 0,
  targetTotalLines = 0, currentPage = 1, isOrchestrating: _isOrchestrating = false, onRefresh,
  selectedDag = 'all', onSelectDag, selectedNodeId, onSelectNodeId,
  projectInitProgress, onDismissInitProgress, onRetryInit, eventsLog = [],
  onClose, isMinimized = false, onToggleMinimize
}) => {
  // Navigation & selection state
  const [isMaximized, setIsMaximized] = useState(false);
  const [internalSelectedDag, setInternalSelectedDag] = useState<'all' | 'initialize' | 'capture_entire_markdown' | 'position_navigation' | 'verify_assemble'>(selectedDag);
  const effectiveSelectedDag = onSelectDag ? selectedDag : internalSelectedDag;
  const handleDagSelect = (dag: 'all' | 'initialize' | 'capture_entire_markdown' | 'position_navigation' | 'verify_assemble') => {
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
  const [isDag2ReportModalOpen, setIsDag2ReportModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isFixingQualifier, setIsFixingQualifier] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);
  const [nodeFeedback, setNodeFeedback] = useState<{
    id: string;
    message: string;
    isError?: boolean;
    isLockViolation?: boolean;
    mismatchDetails?: any;
  } | null>(null);
  const [showMismatchDetails, setShowMismatchDetails] = useState<boolean>(false);
  const [isSyncingDevice, setIsSyncingDevice] = useState<boolean>(false);
  const [isUnlockingDevice, setIsUnlockingDevice] = useState<boolean>(false);
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
      pin_code_requested: { name: 'PIN Code Authentication Qualifier', description: 'Detects if Intune/device PIN authentication is requested and resolves with stored PIN', enabled: true, severity: 'blocking' },
      matrix_app_overlay: { name: 'Matrix App Capture Check', description: 'Is the mobile app matrix capture appearing over teams markdown?', enabled: true, severity: 'blocking' },
      ocr_degraded: { name: 'OCR Quality Degradation Check', description: 'Has previous ocr capture degraded?', enabled: true, severity: 'blocking' },
      keyboard_open: { name: 'Virtual Keyboard Check', description: 'Is software keyboard active or covering content?', enabled: true, severity: 'warning' },
      edit_mode: { name: 'Edit Mode Qualifier', description: 'Ensure editor is in single-pane edit mode', enabled: true, severity: 'blocking' },
      light_mode: { name: 'Theme Qualifier', description: 'Ensure editor is in dark mode', enabled: true, severity: 'blocking' },
      view_mode: { name: 'Legacy View Qualifier', description: 'Ensure document in single edit pane with gutter lines visible', enabled: false, severity: 'warning' }
    }
  });

  const [triggerDecision, setTriggerDecision] = useState<TriggerDecisionState>({ allowed: true, prevented: false, reasons: [] });

  const isAnyModalOpen = isInspectorModalOpen || isPromptModalOpen || isConfigModalOpen || isTextModalOpen || isNode3ConfigOpen || isNode4ConfigOpen || isDag2ReportModalOpen;

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
            current_top_line: d.current_top_line !== undefined ? d.current_top_line : currentTopLine,
            current_bottom_line: d.current_bottom_line !== undefined ? d.current_bottom_line : currentBottomLine,
            current_page: d.current_page !== undefined ? d.current_page : currentPage
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
  const positionGroup = dagStatus.dag?.groups?.position_navigation || {};
  const verifyGroup = dagStatus.dag?.groups?.verify_assemble || {};

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

  const isCaptureGroupRunning = Boolean(
    runningGroupId === 'capture_entire_markdown' ||
    captureGroup.status === 'active' ||
    (isLoopRunning && (activeRunningId === null || ['frame_acquire', 'local_ai_ocr'].includes(activeRunningId))) ||
    (activeRunningId !== null && ['frame_acquire', 'local_ai_ocr'].includes(activeRunningId))
  );

  const isPositionGroupRunning = Boolean(
    runningGroupId === 'position_navigation' ||
    positionGroup.status === 'active' ||
    (activeRunningId !== null && ['frame_ocr', 'arrow_down'].includes(activeRunningId))
  );

  const isVerifyGroupRunning = Boolean(
    runningGroupId === 'verify_assemble' ||
    verifyGroup.status === 'active' ||
    (activeRunningId !== null && ['verification_trigger', 'document_assemble'].includes(activeRunningId))
  );

  // Connectors & Direct Flow State
  const isEdgeConnected = useCallback((fromNode: string, toNode?: string) => {
    const edges = dagStatus.dag?.edges;
    if (edges && edges.length > 0) {
      const match = edges.find(e => e.from === fromNode && (!toNode || e.to === toNode));
      if (match) return match.enabled !== false;
    }
    if (fromNode === 'local_ai_ocr') return Boolean(dagStatus.dag?.semaphore_group2_to_3 ?? true);
    if (fromNode === 'arrow_down') return Boolean(dagStatus.dag?.semaphore_group3_to_4 ?? true);
    return true;
  }, [dagStatus.dag?.edges, dagStatus.dag?.semaphore_group2_to_3, dagStatus.dag?.semaphore_group3_to_4]);

  const getEdgeTarget = useCallback((fromNode: string, defaultTarget: string) => {
    const edges = dagStatus.dag?.edges;
    if (edges && edges.length > 0) {
      const match = edges.find(e => e.from === fromNode);
      if (match && match.to) return match.to;
    }
    return defaultTarget;
  }, [dagStatus.dag?.edges]);

  const isConnector1Open = isEdgeConnected('local_ai_ocr', 'frame_ocr');
  const isConnector2Open = isEdgeConnected('arrow_down', 'verification_trigger');
  const isLoopbackConnected = isEdgeConnected('document_assemble', 'frame_acquire');

  const [isTogglingConnector, setIsTogglingConnector] = useState<string | null>(null);

  const handleToggleConnector = async (fromNode: string, toNode?: string, edgeId?: string) => {
    const key = `${fromNode}->${toNode || ''}`;
    setIsTogglingConnector(key);
    try {
      const res = await fetch(`${apiBase}/api/dag/connectors/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edge_id: edgeId, from_node: fromNode, to_node: toNode })
      });
      const { data } = await parseApiResponse(res);
      const isEnabled = data.edge ? data.edge.enabled !== false : true;
      setNodeFeedback({
        id: `connector_${fromNode}`,
        message: data.message || `Connector (${fromNode} ➔ ${toNode || 'target'}) set to ${isEnabled ? 'CONNECTED ⚡' : 'DISCONNECTED ✂️'}`,
        isError: !isEnabled
      });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: `connector_${fromNode}`, message: `Connector error: ${err.message}`, isError: true });
    } finally {
      setIsTogglingConnector(null);
    }
  };

  const handleDirectFlow = async (fromNode: string, toNode: string) => {
    try {
      const res = await fetch(`${apiBase}/api/dag/connectors/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_node: fromNode, to_node: toNode, enabled: true })
      });
      const { data } = await parseApiResponse(res);
      setNodeFeedback({
        id: `flow_${fromNode}`,
        message: data.message || `Flow directed: ${fromNode} ➔ ${toNode} ✔`,
        isError: false
      });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: `flow_${fromNode}`, message: `Failed to direct flow: ${err.message}`, isError: true });
    }
  };

  const handleResetDefaultFlow = async () => {
    try {
      const res = await fetch(`${apiBase}/api/dag/connectors/reset`, { method: 'POST' });
      const { data } = await parseApiResponse(res);
      setNodeFeedback({
        id: 'reset_flow',
        message: data.message || 'All node connectors reset to standard pipeline flow ✔',
        isError: false
      });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: 'reset_flow', message: `Reset error: ${err.message}`, isError: true });
    }
  };


  // Single-purpose status resolver
  const getNodeLiveStatus = useCallback((id: string) => {
    return calculateNodeLiveStatus(id, dagStatus, activeRunningId, targetTotalLines);
  }, [dagStatus, activeRunningId, targetTotalLines]);

  const selectedNodeMeta = NODES_METADATA.find(n => n.id === activeSelectedNodeId) || NODES_METADATA[0];

  // Helper to safely parse JSON or plain text errors from API responses
  const parseApiResponse = async (res: Response) => {
    let data: any = {};
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text || `HTTP ${res.status} ${res.statusText}` };
    }
    return { ok: res.ok, status: res.status, data, text };
  };

  // Actions
  const handleSyncDevice = async () => {
    const targetPid = activeProjectId || activeProject?.id;
    if (!targetPid) return;
    setIsSyncingDevice(true);
    try {
      const res = await fetch(`${apiBase}/api/projects/${targetPid}/sync-device`, { method: 'POST' });
      const { data } = await parseApiResponse(res);
      setNodeFeedback({
        id: 'sync_device',
        message: data?.message || 'Project hardware specifications successfully synchronized to connected device! ✔',
        isError: false
      });
      setShowMismatchDetails(false);
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({
        id: 'sync_device',
        message: `Failed to synchronize hardware: ${err.message}`,
        isError: true
      });
    } finally {
      setIsSyncingDevice(false);
    }
  };

  const handleUnlockDevice = async () => {
    const targetPid = activeProjectId || activeProject?.id;
    if (!targetPid) return;
    setIsUnlockingDevice(true);
    try {
      const res = await fetch(`${apiBase}/api/projects/${targetPid}/lock-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lock_device: false })
      });
      const { data } = await parseApiResponse(res);
      setNodeFeedback({
        id: 'unlock_device',
        message: data?.message || 'Project unlocked. DAG execution will now adapt dynamically to any connected hardware! ✔',
        isError: false
      });
      setShowMismatchDetails(false);
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({
        id: 'unlock_device',
        message: `Failed to unlock project: ${err.message}`,
        isError: true
      });
    } finally {
      setIsUnlockingDevice(false);
    }
  };

  const handleRunNode = async (nodeId: string) => {
    setRunningNodeId(nodeId);
    setNodeFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/${nodeId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: activeDeviceSerial })
      });
      const { ok, status, data, text } = await parseApiResponse(res);
      if (!ok) {
        const errorMsg = data?.detail?.message || data?.detail || data?.message || data?.error || (typeof text === 'string' && text ? text : `Failed to run ${nodeId} (HTTP ${status})`);
        const isLock = Boolean(data?.locked || errorMsg.includes('Device Lock'));
        setNodeFeedback({
          id: nodeId,
          message: errorMsg,
          isError: true,
          isLockViolation: isLock,
          mismatchDetails: data?.mismatch_details
        });
        return;
      }
      const isErr = data.status === 'warning' || data.status === 'error';
      const isLock = Boolean(data?.locked || (data?.message && data.message.includes('Device Lock')));
      setNodeFeedback({
        id: nodeId,
        message: data.message || `Node ${nodeId} ran successfully ✔`,
        isError: isErr,
        isLockViolation: isLock,
        mismatchDetails: data?.mismatch_details
      });
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
      const { data } = await parseApiResponse(res);
      setRunningNodeId(null);
      setNodeFeedback({ id: nodeId || 'abort', message: data?.message || 'Operation aborted ⏹' });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: nodeId || 'abort', message: `Abort error: ${err.message}`, isError: true });
    }
  };

  const handleRunGroup = async (groupId: string, extraPayload?: Record<string, any>) => {
    setRunningGroupId(groupId);
    setNodeFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/groups/${groupId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: activeDeviceSerial, project_id: activeProjectId, ...(extraPayload || {}) })
      });
      const { ok, status, data, text } = await parseApiResponse(res);
      if (!ok) {
        const errorMsg = data?.detail?.message || data?.detail || data?.message || data?.error || (typeof text === 'string' && text ? text : `Failed to run DAG group ${groupId} (HTTP ${status})`);
        const isLock = Boolean(data?.locked || errorMsg.includes('Device Lock'));
        setNodeFeedback({
          id: groupId,
          message: errorMsg,
          isError: true,
          isLockViolation: isLock,
          mismatchDetails: data?.mismatch_details
        });
        return;
      }
      const isErr = data.status === 'error' || data.status === 'warning';
      const msg = isErr
        ? (data.message || data.error || data.detail || 'Execution failed')
        : (data.status === 'success' ? `DAG Group executed successfully ✔` : (data.error || data.message || 'Execution completed'));
      const isLock = Boolean(data?.locked || msg.includes('Device Lock'));
      setNodeFeedback({
        id: groupId,
        message: msg,
        isError: isErr,
        isLockViolation: isLock,
        mismatchDetails: data?.mismatch_details
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
        const res = await fetch(`${apiBase}/api/dag/loop/stop`, { method: 'POST' });
        const { data } = await parseApiResponse(res);
        setIsLoopRunning(false);
        setNodeFeedback({ id: 'loop', message: data?.message || 'Continuous capture loop stopped' });
      } else {
        const res = await fetch(`${apiBase}/api/dag/loop/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial: activeDeviceSerial })
        });
        const { ok, status, data, text } = await parseApiResponse(res);
        if (!ok) {
          const errorMsg = data?.detail?.message || data?.detail || data?.message || text || `Failed to start loop (HTTP ${status})`;
          throw new Error(errorMsg);
        }
        setIsLoopRunning(true);
        setNodeFeedback({ id: 'loop', message: data?.message || 'Continuous capture loop started ✔' });
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
                  Page #{dagStatus.current_page ?? currentPage ?? 1} · Ln {dagStatus.current_top_line ?? currentTopLine ?? 0}-{dagStatus.current_bottom_line ?? currentBottomLine ?? 0} of {dagStatus.target_total_lines || targetTotalLines || 'EOF'} lines · Target Next Ln {Math.max(1, (dagStatus.current_bottom_line ?? currentBottomLine ?? 0) + 1)}
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

            {/* Device Characteristic & Lock Badge */}
            <button
              type="button"
              onClick={() => onOpenSettings?.('device')}
              title={activeProject?.lock_device
                ? `Locked to ${activeProject.device_name || activeProject.device_model || 'Hardware'} (${activeProject.target_dpi || 220} DPI) • Click to configure`
                : `Hardware Dynamic (${activeProject?.target_dpi || 220} DPI) • Click to configure in Settings`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 7px',
                borderRadius: '4px',
                background: activeProject?.lock_device ? 'rgba(210, 153, 34, 0.18)' : 'rgba(56, 139, 253, 0.12)',
                border: `1px solid ${activeProject?.lock_device ? 'rgba(210, 153, 34, 0.45)' : 'rgba(56, 139, 253, 0.3)'}`,
                color: activeProject?.lock_device ? '#e3b341' : '#58a6ff',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
                height: '22px'
              }}
            >
              {activeProject?.lock_device ? <Lock size={10} /> : <Sliders size={10} />}
              <span>{activeProject?.lock_device ? (activeProject.device_name || (activeProject.device_model ? activeProject.device_model.toUpperCase() : 'LOCKED')) : 'DYNAMIC'}</span>
              <span style={{ opacity: 0.75 }}>{activeProject?.target_dpi ? `${activeProject.target_dpi}DPI` : ''}</span>
            </button>

            {/* Filter buttons */}
            <div style={{ display: 'inline-flex', background: '#161b22', padding: '2px', borderRadius: '5px', border: '1px solid #30363d', gap: '2px' }}>
              {(['all', 'initialize', 'capture_entire_markdown', 'position_navigation', 'verify_assemble'] as const).map(dag => (
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
                  {dag === 'all' ? 'All' : (dag === 'initialize' ? 'DAG 1' : (dag === 'capture_entire_markdown' ? 'DAG 2' : (dag === 'position_navigation' ? 'DAG 3' : 'DAG 4')))}
                </button>
              ))}
            </div>

            {/* Direct Flow Connectors Bar */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => handleToggleConnector('local_ai_ocr', 'frame_ocr', 'local_ai_ocr->frame_ocr')}
                disabled={Boolean(isTogglingConnector)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 7px',
                  borderRadius: '5px', border: `1.5px solid ${isConnector1Open ? '#3fb950' : '#f85149'}`,
                  background: isConnector1Open ? 'rgba(63, 185, 80, 0.16)' : 'rgba(248, 81, 73, 0.22)',
                  color: isConnector1Open ? '#3fb950' : '#ff7b72',
                  fontSize: '9px', fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.3px', height: '24px'
                }}
                title={isConnector1Open ? 'Connector (DAG 2➔3): CONNECTED. Click to sever/pause flow.' : 'Connector (DAG 2➔3): SEVERED. Click to connect & enable flow.'}
              >
                <span>{isConnector1Open ? '⚡' : '✂️'}</span>
                <span>{isConnector1Open ? 'C1 (2➔3): LINKED' : 'C1 (2➔3): SEVERED'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleConnector('arrow_down', 'verification_trigger', 'arrow_down->verification_trigger')}
                disabled={Boolean(isTogglingConnector)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 7px',
                  borderRadius: '5px', border: `1.5px solid ${isConnector2Open ? '#3fb950' : '#f85149'}`,
                  background: isConnector2Open ? 'rgba(63, 185, 80, 0.16)' : 'rgba(248, 81, 73, 0.22)',
                  color: isConnector2Open ? '#3fb950' : '#ff7b72',
                  fontSize: '9px', fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.3px', height: '24px'
                }}
                title={isConnector2Open ? 'Connector (DAG 3➔4): CONNECTED. Click to sever/pause flow.' : 'Connector (DAG 3➔4): SEVERED. Click to connect & enable flow.'}
              >
                <span>{isConnector2Open ? '⚡' : '✂️'}</span>
                <span>{isConnector2Open ? 'C2 (3➔4): LINKED' : 'C2 (3➔4): SEVERED'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleConnector('document_assemble', 'frame_acquire', 'document_assemble->frame_acquire')}
                disabled={Boolean(isTogglingConnector)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 7px',
                  borderRadius: '5px', border: `1.5px solid ${isLoopbackConnected ? '#3fb950' : '#f85149'}`,
                  background: isLoopbackConnected ? 'rgba(63, 185, 80, 0.16)' : 'rgba(248, 81, 73, 0.22)',
                  color: isLoopbackConnected ? '#3fb950' : '#ff7b72',
                  fontSize: '9px', fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '0.3px', height: '24px'
                }}
                title={isLoopbackConnected ? 'Loopback (8➔3): CONNECTED. Click to halt after 1 cycle.' : 'Loopback (8➔3): SEVERED. Click to repeat loop.'}
              >
                <span>{isLoopbackConnected ? '🔄' : '⏸️'}</span>
                <span>{isLoopbackConnected ? 'LOOP: ON' : 'LOOP: OFF'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaultFlow}
                style={{
                  display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 6px',
                  borderRadius: '5px', border: '1px solid rgba(88, 166, 255, 0.3)',
                  background: 'rgba(88, 166, 255, 0.12)', color: '#58a6ff',
                  fontSize: '8.5px', fontWeight: 700, cursor: 'pointer', height: '24px'
                }}
                title="Reset all node connectors back to standard sequential pipeline (1➔2➔3➔4➔5➔6➔7➔8➔3)"
              >
                <RotateCcw size={10} />
                <span>Reset Flow</span>
              </button>
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
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '9.5px',
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: '6px',
            background: nodeFeedback.isError
              ? (nodeFeedback.isLockViolation ? 'rgba(218, 54, 51, 0.18)' : 'rgba(248,81,73,0.18)')
              : 'rgba(0,255,157,0.15)',
            border: `1px solid ${nodeFeedback.isError ? (nodeFeedback.isLockViolation ? '#f85149' : '#f85149') : '#00ff9d'}`,
            color: nodeFeedback.isError ? '#ff7b72' : '#00ff9d',
            transition: 'all 0.2s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                {nodeFeedback.isLockViolation && <ShieldAlert size={13} color="#f85149" style={{ flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: showMismatchDetails ? 'normal' : 'nowrap' }}>
                  {nodeFeedback.message}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {nodeFeedback.isLockViolation && (
                  <>
                    <button
                      type="button"
                      onClick={handleSyncDevice}
                      disabled={isSyncingDevice}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 7px',
                        background: 'rgba(56, 139, 253, 0.25)', border: '1px solid #388bfd',
                        borderRadius: '4px', color: '#58a6ff', fontSize: '9px', fontWeight: 800,
                        cursor: 'pointer'
                      }}
                      title="Sync project settings to current connected hardware (updates serial, display ID, DPI)"
                    >
                      {isSyncingDevice ? <RefreshCw size={9} className="spin" /> : <RefreshCw size={9} />}
                      <span>Sync to Current Device</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUnlockDevice}
                      disabled={isUnlockingDevice}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 7px',
                        background: 'rgba(210, 153, 34, 0.2)', border: '1px solid #d29922',
                        borderRadius: '4px', color: '#e3b341', fontSize: '9px', fontWeight: 800,
                        cursor: 'pointer'
                      }}
                      title="Unlock project to allow dynamic execution across any connected device"
                    >
                      {isUnlockingDevice ? <RefreshCw size={9} className="spin" /> : <Unlock size={9} />}
                      <span>Unlock (Dynamic)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMismatchDetails(prev => !prev)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px',
                        background: 'rgba(139, 148, 158, 0.15)', border: '1px solid #30363d',
                        borderRadius: '4px', color: '#c9d1d9', fontSize: '9px', fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <Info size={9} />
                      <span>{showMismatchDetails ? 'Hide Details ▲' : 'Mismatch Details ▼'}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { setNodeFeedback(null); setShowMismatchDetails(false); }}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                  title="Dismiss notification"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* Collapsible Mismatch Breakdown Matrix */}
            {nodeFeedback.isLockViolation && showMismatchDetails && (
              <div style={{
                marginTop: '4px',
                padding: '6px 8px',
                borderRadius: '5px',
                background: 'rgba(13, 17, 23, 0.95)',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
              }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#f85149', letterSpacing: '0.4px' }}>
                  HARDWARE & CONNECTION COMPARISON MATRIX
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '4px', fontSize: '8.5px', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: '#8b949e', fontWeight: 700 }}>SPECIFICATION</span>
                  <span style={{ color: '#58a6ff', fontWeight: 700 }}>PROJECT LOCKED</span>
                  <span style={{ color: '#00ff9d', fontWeight: 700 }}>ATTACHED HARDWARE</span>

                  <span style={{ color: '#8b949e' }}>Device Model:</span>
                  <span>{nodeFeedback.mismatchDetails?.project_specs?.model || activeProject?.device_name || activeProject?.device_model || 'Pixel 8 Pro'}</span>
                  <span style={{ color: '#00ff9d' }}>{nodeFeedback.mismatchDetails?.current_hardware_specs?.model || 'Pixel 8 Pro'}</span>

                  <span style={{ color: '#8b949e' }}>Connection / Serial:</span>
                  <span style={{ wordBreak: 'break-all' }}>{nodeFeedback.mismatchDetails?.project_specs?.serial || activeProject?.device_serial || 'Unknown'}</span>
                  <span style={{ wordBreak: 'break-all', color: '#00ff9d' }}>{nodeFeedback.mismatchDetails?.current_hardware_specs?.serial || activeDeviceSerial || 'Current Socket'}</span>

                  <span style={{ color: '#8b949e' }}>Display Resolution:</span>
                  <span>{nodeFeedback.mismatchDetails?.project_specs?.resolution || `${activeProject?.display_width || 1920}x${activeProject?.display_height || 1080}`}</span>
                  <span>{nodeFeedback.mismatchDetails?.current_hardware_specs?.resolution || '1920x1080'}</span>

                  <span style={{ color: '#8b949e' }}>Target / Active DPI:</span>
                  <span>{nodeFeedback.mismatchDetails?.project_specs?.target_dpi || activeProject?.target_dpi || 220} DPI</span>
                  <span>{nodeFeedback.mismatchDetails?.current_hardware_specs?.active_dpi || 220} DPI</span>

                  <span style={{ color: '#8b949e' }}>Display ID:</span>
                  <span>Display #{nodeFeedback.mismatchDetails?.project_specs?.display_id ?? activeProject?.display_id ?? 0}</span>
                  <span>Display #{nodeFeedback.mismatchDetails?.current_hardware_specs?.display_id ?? 3}</span>

                  <span style={{ color: '#8b949e' }}>Lines Per Page:</span>
                  <span>{nodeFeedback.mismatchDetails?.project_specs?.lines_per_page || activeProject?.lines_per_page || 49} LPP</span>
                  <span>{nodeFeedback.mismatchDetails?.current_hardware_specs?.lines_per_page || 49} LPP</span>
                </div>

                <div style={{ marginTop: '4px', borderTop: '1px solid #21262d', paddingTop: '4px', fontSize: '8px', color: '#8b949e' }}>
                  <div style={{ fontWeight: 700, color: '#e3b341', marginBottom: '2px' }}>Why did this occur?</div>
                  <div>• <strong>Socket Reconnect:</strong> Wireless ADB assigns a new ephemeral port or mDNS TLS endpoint on reconnection.</div>
                  <div>• <strong>Display Mode:</strong> External monitors assign Display ID (e.g. 3) vs phone screen (Display 0, 480 DPI).</div>
                  <div>• <strong>Resolution:</strong> Click <strong>Sync to Current Device</strong> above to instantly adopt active specs without deleting the project.</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DAG GROUPS & NODES CANVAS */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '6px',
        width: '100%',
        position: 'relative',
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '3px 2px 6px 2px',
        boxSizing: 'border-box'
      }}>
        {/* GROUP 1: INITIALIZE */}
        {(effectiveSelectedDag === 'all' || effectiveSelectedDag === 'initialize') && (
          <div
            style={{
              flex: effectiveSelectedDag === 'initialize' ? 1 : '0 0 272px',
              width: effectiveSelectedDag === 'initialize' ? 'auto' : '272px',
              minWidth: '260px',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
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

        {/* INTERACTIVE CONNECTOR: DAG GROUP 1 (reset_home) TO DAG GROUP 2 (frame_acquire) */}
        {effectiveSelectedDag === 'all' && (
          <InteractiveDagConnector
            fromNodeId="reset_home"
            toNodeId={getEdgeTarget("reset_home", "frame_acquire")}
            fromLabel="DAG 1"
            toLabel="DAG 2"
            isConnected={isEdgeConnected("reset_home", "frame_acquire")}
            isActive={isInitGroupRunning || isCaptureGroupRunning}
            accentColor="#58a6ff"
            isToggling={isTogglingConnector === 'reset_home->frame_acquire'}
            onToggle={() => handleToggleConnector("reset_home", "frame_acquire", "reset_home->frame_acquire")}
            onChangeTarget={(targetId) => handleDirectFlow("reset_home", targetId)}
            allNodes={NODES_METADATA}
          />
        )}

        {/* GROUP 2: SCREEN CAPTURE & AI OCR (Nodes 3, 4) */}
        {(effectiveSelectedDag === 'all' || effectiveSelectedDag === 'capture_entire_markdown') && (
          <div
            style={{
              flex: effectiveSelectedDag === 'capture_entire_markdown' ? 1 : '0 0 272px',
              width: effectiveSelectedDag === 'capture_entire_markdown' ? 'auto' : '272px',
              minWidth: '260px',
              background: isCaptureGroupRunning
                ? 'linear-gradient(180deg, rgba(0, 255, 157, 0.12) 0%, rgba(13, 17, 23, 0.8) 100%)'
                : (effectiveSelectedDag === 'capture_entire_markdown' ? 'rgba(0, 255, 157, 0.05)' : 'rgba(15, 23, 42, 0.4)'),
              border: `1.5px solid ${isCaptureGroupRunning ? '#00ff9d' : '#30363d'}`,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#00ff9d' }}>
                  DAG 2: CAPTURE & AI OCR
                </span>
                <span style={{
                  fontSize: '8px', padding: '0 4px', borderRadius: '3px',
                  background: isCaptureGroupRunning ? 'rgba(0, 255, 157, 0.25)' : 'rgba(0, 255, 157, 0.12)',
                  color: '#00ff9d',
                  fontWeight: 800
                }}>
                  {isCaptureGroupRunning ? 'RUNNING' : 'READY'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsDag2ReportModalOpen(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '3px', padding: '1px 6px',
                    borderRadius: '3px', border: '1px solid rgba(88, 166, 255, 0.45)',
                    background: 'rgba(88, 166, 255, 0.16)',
                    color: '#58a6ff',
                    fontSize: '8.5px', fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 0 6px rgba(88, 166, 255, 0.12)'
                  }}
                  title="View millisecond loop timing, bottleneck analytics, and AI prompt for Gemini"
                >
                  <Activity size={8} />
                  <span>Report</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRunGroup('capture_entire_markdown', { single_cycle: true }); }}
                  disabled={runningGroupId !== null || runningNodeId !== null || isLoopRunning}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '3px', padding: '1px 5px',
                    borderRadius: '3px', border: '1px solid rgba(0, 255, 157, 0.3)',
                    background: 'rgba(0, 255, 157, 0.08)', color: '#00ff9d',
                    fontSize: '8.5px', fontWeight: 700, cursor: 'pointer'
                  }}
                  title="Run 1 single capture cycle (Nodes 3→4)"
                >
                  {isCaptureGroupRunning ? <RefreshCw size={8} className="spin" /> : <Play size={8} />}
                  <span>1 Cycle</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', width: '100%' }}>
              <DagNodeCard
                node={NODES_METADATA[2]}
                status={getNodeLiveStatus(NODES_METADATA[2].id)}
                isSelected={activeSelectedNodeId === NODES_METADATA[2].id}
                isPinned={pinnedHoverNodeId === NODES_METADATA[2].id}
                isPulsingSwirl={activeRunningId === NODES_METADATA[2].id}
                copiedNodeId={copiedNodeId}
                onSelect={() => handleSelectNode(NODES_METADATA[2].id)}
                onDoubleClick={() => setPinnedHoverNodeId(prev => prev === NODES_METADATA[2].id ? null : NODES_METADATA[2].id)}
                onMouseEnter={() => setHoveredNodeId(NODES_METADATA[2].id)}
                onMouseLeave={() => setHoveredNodeId(prev => prev === NODES_METADATA[2].id ? null : prev)}
                onCopyForAi={() => handleCopyNodeDetailsForAi(NODES_METADATA[2].id)}
                onOpenPromptModal={() => handleOpenPromptModal(NODES_METADATA[2].id)}
              />
              <MicroConnectingArrow
                fromNode={NODES_METADATA[2]}
                toNode={NODES_METADATA[3]}
                width={16}
                isActive={isCaptureGroupRunning || activeRunningId === NODES_METADATA[2].id || activeRunningId === NODES_METADATA[3].id}
                isHeat={isCaptureGroupRunning}
              />
              <DagNodeCard
                node={NODES_METADATA[3]}
                status={getNodeLiveStatus(NODES_METADATA[3].id)}
                isSelected={activeSelectedNodeId === NODES_METADATA[3].id}
                isPinned={pinnedHoverNodeId === NODES_METADATA[3].id}
                isPulsingSwirl={activeRunningId === NODES_METADATA[3].id}
                copiedNodeId={copiedNodeId}
                onSelect={() => handleSelectNode(NODES_METADATA[3].id)}
                onDoubleClick={() => setPinnedHoverNodeId(prev => prev === NODES_METADATA[3].id ? null : NODES_METADATA[3].id)}
                onMouseEnter={() => setHoveredNodeId(NODES_METADATA[3].id)}
                onMouseLeave={() => setHoveredNodeId(prev => prev === NODES_METADATA[3].id ? null : prev)}
                onCopyForAi={() => handleCopyNodeDetailsForAi(NODES_METADATA[3].id)}
                onOpenPromptModal={() => handleOpenPromptModal(NODES_METADATA[3].id)}
              />
            </div>
          </div>
        )}

        {/* INTERACTIVE CONNECTOR: DAG GROUP 2 (local_ai_ocr) TO DAG GROUP 3 (frame_ocr) */}
        {effectiveSelectedDag === 'all' && (
          <InteractiveDagConnector
            fromNodeId="local_ai_ocr"
            toNodeId={getEdgeTarget("local_ai_ocr", "frame_ocr")}
            fromLabel="DAG 2"
            toLabel="DAG 3"
            isConnected={isConnector1Open}
            isActive={isCaptureGroupRunning || isPositionGroupRunning}
            accentColor="#00ff9d"
            isToggling={isTogglingConnector === 'local_ai_ocr->frame_ocr'}
            onToggle={() => handleToggleConnector("local_ai_ocr", "frame_ocr", "local_ai_ocr->frame_ocr")}
            onChangeTarget={(targetId) => handleDirectFlow("local_ai_ocr", targetId)}
            allNodes={NODES_METADATA}
          />
        )}

        {/* GROUP 3: LINE POSITIONING (Nodes 5, 6) */}
        {(effectiveSelectedDag === 'all' || effectiveSelectedDag === 'position_navigation') && (
          <div
            style={{
              flex: effectiveSelectedDag === 'position_navigation' ? 1 : '0 0 272px',
              width: effectiveSelectedDag === 'position_navigation' ? 'auto' : '272px',
              minWidth: '260px',
              background: isPositionGroupRunning
                ? 'linear-gradient(180deg, rgba(255, 166, 87, 0.15) 0%, rgba(13, 17, 23, 0.8) 100%)'
                : (effectiveSelectedDag === 'position_navigation' ? 'rgba(255, 166, 87, 0.05)' : 'rgba(15, 23, 42, 0.4)'),
              border: `1.5px solid ${isPositionGroupRunning ? '#ffa657' : (!isConnector1Open ? 'rgba(248, 81, 73, 0.6)' : '#30363d')}`,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#ffa657' }}>
                  DAG 3: LINE POSITIONING
                </span>
                <span style={{
                  fontSize: '8px', padding: '0 4px', borderRadius: '3px',
                  background: isPositionGroupRunning ? 'rgba(255, 166, 87, 0.25)' : (!isConnector1Open ? 'rgba(248, 81, 73, 0.2)' : 'rgba(255, 166, 87, 0.12)'),
                  color: isPositionGroupRunning ? '#ffa657' : (!isConnector1Open ? '#ff7b72' : '#ffa657'),
                  fontWeight: 800
                }}>
                  {isPositionGroupRunning ? 'POSITIONING' : (!isConnector1Open ? '✂️ SEVERED' : 'READY')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRunGroup('position_navigation'); }}
                  disabled={runningGroupId !== null || runningNodeId !== null}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '3px', padding: '1px 6px',
                    borderRadius: '3px', border: '1px solid rgba(255, 166, 87, 0.45)',
                    background: 'rgba(255, 166, 87, 0.14)', color: '#ffa657',
                    fontSize: '8.5px', fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 0 6px rgba(255, 166, 87, 0.15)'
                  }}
                  title="Run DAG 3 (Nodes 5→6) in complete isolation to diagnose line positioning and overshoot"
                >
                  <Play size={8} fill="#ffa657" />
                  <span>Run DAG 3</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', width: '100%' }}>
              <DagNodeCard
                node={NODES_METADATA[4]}
                status={getNodeLiveStatus(NODES_METADATA[4].id)}
                isSelected={activeSelectedNodeId === NODES_METADATA[4].id}
                isPinned={pinnedHoverNodeId === NODES_METADATA[4].id}
                isPulsingSwirl={activeRunningId === NODES_METADATA[4].id}
                copiedNodeId={copiedNodeId}
                onSelect={() => handleSelectNode(NODES_METADATA[4].id)}
                onDoubleClick={() => setPinnedHoverNodeId(prev => prev === NODES_METADATA[4].id ? null : NODES_METADATA[4].id)}
                onMouseEnter={() => setHoveredNodeId(NODES_METADATA[4].id)}
                onMouseLeave={() => setHoveredNodeId(prev => prev === NODES_METADATA[4].id ? null : prev)}
                onCopyForAi={() => handleCopyNodeDetailsForAi(NODES_METADATA[4].id)}
                onOpenPromptModal={() => handleOpenPromptModal(NODES_METADATA[4].id)}
              />
              <MicroConnectingArrow
                fromNode={NODES_METADATA[4]}
                toNode={NODES_METADATA[5]}
                width={16}
                isActive={isPositionGroupRunning || activeRunningId === NODES_METADATA[4].id || activeRunningId === NODES_METADATA[5].id}
                isHeat={isPositionGroupRunning}
              />
              <DagNodeCard
                node={NODES_METADATA[5]}
                status={getNodeLiveStatus(NODES_METADATA[5].id)}
                isSelected={activeSelectedNodeId === NODES_METADATA[5].id}
                isPinned={pinnedHoverNodeId === NODES_METADATA[5].id}
                isPulsingSwirl={activeRunningId === NODES_METADATA[5].id}
                copiedNodeId={copiedNodeId}
                onSelect={() => handleSelectNode(NODES_METADATA[5].id)}
                onDoubleClick={() => setPinnedHoverNodeId(prev => prev === NODES_METADATA[5].id ? null : NODES_METADATA[5].id)}
                onMouseEnter={() => setHoveredNodeId(NODES_METADATA[5].id)}
                onMouseLeave={() => setHoveredNodeId(prev => prev === NODES_METADATA[5].id ? null : prev)}
                onCopyForAi={() => handleCopyNodeDetailsForAi(NODES_METADATA[5].id)}
                onOpenPromptModal={() => handleOpenPromptModal(NODES_METADATA[5].id)}
              />
            </div>
          </div>
        )}

        {/* INTERACTIVE CONNECTOR: DAG GROUP 3 (arrow_down) TO DAG GROUP 4 (verification_trigger) */}
        {effectiveSelectedDag === 'all' && (
          <InteractiveDagConnector
            fromNodeId="arrow_down"
            toNodeId={getEdgeTarget("arrow_down", "verification_trigger")}
            fromLabel="DAG 3"
            toLabel="DAG 4"
            isConnected={isConnector2Open}
            isActive={isPositionGroupRunning || isVerifyGroupRunning}
            accentColor="#ffa657"
            isToggling={isTogglingConnector === 'arrow_down->verification_trigger'}
            onToggle={() => handleToggleConnector("arrow_down", "verification_trigger", "arrow_down->verification_trigger")}
            onChangeTarget={(targetId) => handleDirectFlow("arrow_down", targetId)}
            allNodes={NODES_METADATA}
          />
        )}

        {/* GROUP 4: VERIFY & ASSEMBLE (Nodes 7, 8) */}
        {(effectiveSelectedDag === 'all' || effectiveSelectedDag === 'verify_assemble') && (
          <div
            style={{
              flex: effectiveSelectedDag === 'verify_assemble' ? 1 : '0 0 282px',
              width: effectiveSelectedDag === 'verify_assemble' ? 'auto' : '282px',
              minWidth: '260px',
              background: isVerifyGroupRunning
                ? 'linear-gradient(180deg, rgba(188, 140, 255, 0.16) 0%, rgba(13, 17, 23, 0.8) 100%)'
                : (effectiveSelectedDag === 'verify_assemble' ? 'rgba(188, 140, 255, 0.06)' : 'rgba(15, 23, 42, 0.4)'),
              border: `1.5px solid ${isVerifyGroupRunning ? '#bc8cff' : (!isConnector2Open ? 'rgba(248, 81, 73, 0.6)' : '#30363d')}`,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#bc8cff' }}>
                  DAG 4: VERIFY & ASSEMBLE
                </span>
                <span style={{
                  fontSize: '8px', padding: '0 4px', borderRadius: '3px',
                  background: isVerifyGroupRunning ? 'rgba(188, 140, 255, 0.25)' : (!isConnector2Open ? 'rgba(248, 81, 73, 0.2)' : 'rgba(188, 140, 255, 0.14)'),
                  color: isVerifyGroupRunning ? '#bc8cff' : (!isConnector2Open ? '#ff7b72' : '#bc8cff'),
                  fontWeight: 800
                }}>
                  {isVerifyGroupRunning ? 'ACTIVE' : (!isConnector2Open ? '✂️ SEVERED' : 'READY')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRunGroup('verify_assemble'); }}
                  disabled={runningGroupId !== null || runningNodeId !== null}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '3px', padding: '1px 6px',
                    borderRadius: '3px', border: '1px solid rgba(188, 140, 255, 0.45)',
                    background: 'rgba(188, 140, 255, 0.14)', color: '#bc8cff',
                    fontSize: '8.5px', fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 0 6px rgba(188, 140, 255, 0.15)'
                  }}
                  title="Run DAG 4 (Nodes 7→8) in isolation to verify qualifiers and assemble markdown"
                >
                  <Play size={8} fill="#bc8cff" />
                  <span>Run DAG 4</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', width: '100%' }}>
              <DagNodeCard
                node={NODES_METADATA[6]}
                status={getNodeLiveStatus(NODES_METADATA[6].id)}
                isSelected={activeSelectedNodeId === NODES_METADATA[6].id}
                isPinned={pinnedHoverNodeId === NODES_METADATA[6].id}
                isPulsingSwirl={activeRunningId === NODES_METADATA[6].id}
                copiedNodeId={copiedNodeId}
                onSelect={() => handleSelectNode(NODES_METADATA[6].id)}
                onDoubleClick={() => setPinnedHoverNodeId(prev => prev === NODES_METADATA[6].id ? null : NODES_METADATA[6].id)}
                onMouseEnter={() => setHoveredNodeId(NODES_METADATA[6].id)}
                onMouseLeave={() => setHoveredNodeId(prev => prev === NODES_METADATA[6].id ? null : prev)}
                onCopyForAi={() => handleCopyNodeDetailsForAi(NODES_METADATA[6].id)}
                onOpenPromptModal={() => handleOpenPromptModal(NODES_METADATA[6].id)}
              />
              <MicroConnectingArrow
                fromNode={NODES_METADATA[6]}
                toNode={NODES_METADATA[7]}
                width={16}
                isActive={isVerifyGroupRunning || activeRunningId === NODES_METADATA[6].id || activeRunningId === NODES_METADATA[7].id}
                isHeat={isVerifyGroupRunning}
              />
              <DagNodeCard
                node={NODES_METADATA[7]}
                status={getNodeLiveStatus(NODES_METADATA[7].id)}
                isSelected={activeSelectedNodeId === NODES_METADATA[7].id}
                isPinned={pinnedHoverNodeId === NODES_METADATA[7].id}
                isPulsingSwirl={activeRunningId === NODES_METADATA[7].id}
                copiedNodeId={copiedNodeId}
                onSelect={() => handleSelectNode(NODES_METADATA[7].id)}
                onDoubleClick={() => setPinnedHoverNodeId(prev => prev === NODES_METADATA[7].id ? null : NODES_METADATA[7].id)}
                onMouseEnter={() => setHoveredNodeId(NODES_METADATA[7].id)}
                onMouseLeave={() => setHoveredNodeId(prev => prev === NODES_METADATA[7].id ? null : prev)}
                onCopyForAi={() => handleCopyNodeDetailsForAi(NODES_METADATA[7].id)}
                onOpenPromptModal={() => handleOpenPromptModal(NODES_METADATA[7].id)}
              />
              <LoopbackArrow isCaptureRunning={Boolean(isCaptureGroupRunning || isVerifyGroupRunning)} isPrevented={Boolean(triggerDecision?.prevented)} />
            </div>
            <InteractiveLoopbackConnector
              isConnected={isLoopbackConnected}
              isCaptureRunning={Boolean(isCaptureGroupRunning || isVerifyGroupRunning)}
              isPrevented={Boolean(triggerDecision?.prevented)}
              onToggle={() => handleToggleConnector("document_assemble", "frame_acquire", "document_assemble->frame_acquire")}
            />
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

      {/* MODAL 6: DAG 2 Loop Millisecond Performance Report & Gemini 3.8 Optimization Engine */}
      <Dag2PerformanceReportModal
        isOpen={isDag2ReportModalOpen}
        onClose={() => setIsDag2ReportModalOpen(false)}
      />
    </div>
  );
};
