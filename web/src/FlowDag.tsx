import React, { useState, useEffect } from 'react';
import {
  Activity, RefreshCw, Layers, Lock, Settings, ShieldCheck, ShieldAlert,
  ToggleLeft, ToggleRight, Check, X, Play, AlertTriangle,
  FileText, Move, Clock, Minus, Maximize2, Minimize2
} from 'lucide-react';
import { Modal } from './ConfirmModal';

export interface DagNodeState {
  id: string;
  name: string;
  subhead: string;
  status: 'idle' | 'active' | 'completed' | 'error' | 'prevented';
  metric?: string;
  details?: string;
}

export interface DagStatusData {
  dag?: {
    current_active_node?: string;
    current_active_group?: string;
    groups?: Record<string, any>;
    nodes?: Record<string, any>;
    edges?: Array<{ from: string; to: string; is_loopback?: boolean }>;
  };
  active_node: string;
  target_total_lines: number;
  current_top_line: number;
  current_bottom_line: number;
  current_page: number;
  is_keyboard_guarded: boolean;
  arrow_step_count: number;
  verification_trigger_fired: boolean;
  ocr_worker_active: boolean;
  ocr_latency_ms: number;
  node_5_config?: Node5ConfigState;
  trigger_decision?: TriggerDecisionState;
}

export interface QualifierConfigItem {
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
  issue_detected?: boolean;
  details?: string;
}

export interface Node5ConfigState {
  prevent_trigger_on_issue: boolean;
  qualifiers: Record<string, QualifierConfigItem>;
}

export interface TriggerDecisionState {
  allowed: boolean;
  prevented: boolean;
  reasons: string[];
  evaluated_at?: string | null;
  qualifier_statuses?: Record<string, any>;
}

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

export interface NodeMeta {
  id: string;
  step: string;
  shortName: string;
  fullName: string;
  subhead: string;
  desc: string;
  group: 'initialize' | 'capture_entire_markdown';
  accentColor: string;
  hasConfig?: boolean;
}

const NODES_METADATA: NodeMeta[] = [
  {
    id: 'init_end',
    step: '1',
    shortName: 'Determine Lines',
    fullName: '1. DETERMINE TOTAL LINES',
    subhead: 'HID Ctrl + End & Last Line OCR',
    desc: 'Sends HID Ctrl+End keys, verifies gutter at EOF, then displays total lines by OCR of last line.',
    group: 'initialize',
    accentColor: '#58a6ff'
  },
  {
    id: 'reset_home',
    step: '2',
    shortName: 'Return to Line 1',
    fullName: '2. RETURN TO LINE 1',
    subhead: 'HID Ctrl + Home & Verify Line 1',
    desc: 'Sends HID Ctrl+Home to return to line 1, then verifies line 1 is on top in gutter.',
    group: 'initialize',
    accentColor: '#a371f7'
  },
  {
    id: 'frame_acquire',
    step: '3',
    shortName: 'Screen Capture',
    fullName: '3. SCREEN CAPTURE',
    subhead: 'Grab Screen Frame',
    desc: 'Captures external display screenshot and saves image.',
    group: 'capture_entire_markdown',
    accentColor: '#00ff9d',
    hasConfig: true
  },
  {
    id: 'local_ai_ocr',
    step: '4',
    shortName: 'MiniCPM-V',
    fullName: '4. LOCAL AI OCR',
    subhead: 'MiniCPM-V Vision',
    desc: 'Extracts verbatim markdown & code lines using local MiniCPM-V multimodal vision model in Ollama.',
    group: 'capture_entire_markdown',
    accentColor: '#388bfd'
  },
  {
    id: 'frame_ocr',
    step: '5',
    shortName: 'Gutter OCR',
    fullName: '5. GUTTER OCR',
    subhead: 'Lines & Bounds Reader',
    desc: 'Extracts gutter lines and text bounds from captured frame.',
    group: 'capture_entire_markdown',
    accentColor: '#8957e5',
    hasConfig: true
  },
  {
    id: 'arrow_down',
    step: '6',
    shortName: 'Scroll Down',
    fullName: '6. DOWN NAVIGATION',
    subhead: 'Next Top Position',
    desc: 'Positions next target top line (prev bottom + 1) onto top gutter.',
    group: 'capture_entire_markdown',
    accentColor: '#ffa657'
  },
  {
    id: 'verification_trigger',
    step: '7',
    shortName: 'Verify Trigger',
    fullName: '7. VERIFY TRIGGER',
    subhead: 'Target Gutter & Qualifiers',
    desc: 'Verifies line is on top gutter and evaluates qualifiers before loopback flow.',
    group: 'capture_entire_markdown',
    accentColor: '#58a6ff',
    hasConfig: true
  },
  {
    id: 'document_assemble',
    step: '8',
    shortName: 'Assemble Doc',
    fullName: '8. ASSEMBLE MARKDOWN',
    subhead: 'Reconstruct Master Document',
    desc: 'Assembles verified code blocks into continuous markdown and evaluates EOF loopback completion.',
    group: 'capture_entire_markdown',
    accentColor: '#00ff9d',
    hasConfig: true
  }
];

export interface PositionPct {
  leftPct: number;
  topPx: number;
}

const filterNodeTelemetry = (nodeId: string, ev: { message?: string; category?: string }) => {
  const msg = (ev.message || '').toLowerCase();
  const cat = (ev.category || '').toUpperCase();
  switch (nodeId) {
    case 'init_end':
      return msg.includes('init') || msg.includes('calibrat') || msg.includes('ctrl+end') ||
             msg.includes('end') || msg.includes('eof') || msg.includes('node 1') || msg.includes('total_lines');
    case 'reset_home':
      return msg.includes('home') || msg.includes('ctrl+home') || msg.includes('node 2') ||
             msg.includes('line 1') || msg.includes('reset_home');
    case 'frame_acquire':
      return msg.includes('frame_acquire') || msg.includes('capture') || msg.includes('screenshot') ||
             msg.includes('grab') || msg.includes('node 3') || cat === 'FRAME';
    case 'local_ai_ocr':
      return msg.includes('local_ai') || msg.includes('minicpm') || msg.includes('rapidocr') || msg.includes('onnx') ||
             msg.includes('ai ocr') || msg.includes('node 4') || msg.includes('node 3b') || msg.includes('verbatim');
    case 'frame_ocr':
      return msg.includes('frame_ocr') || msg.includes('gutter') || msg.includes('line reader') ||
             msg.includes('node 5') || msg.includes('node 4') || (cat === 'OCR' && !msg.includes('local_ai'));
    case 'arrow_down':
      return msg.includes('arrow_down') || msg.includes('down arrow') || msg.includes('arrow') ||
             msg.includes('step') || msg.includes('pacer') || msg.includes('node 6') || msg.includes('node 5') || cat === 'PACER';
    case 'verification_trigger':
      return msg.includes('verification_trigger') || msg.includes('qualifier') || msg.includes('trigger') ||
             msg.includes('loopback') || msg.includes('decision') || msg.includes('node 7') || msg.includes('node 6');
    case 'document_assemble':
      return msg.includes('assemble') || msg.includes('markdown') || msg.includes('reconstruct') ||
             msg.includes('node 8') || msg.includes('complete');
    default:
      return true;
  }
};

export const FlowDag: React.FC<FlowDagProps> = ({
  apiBase, activeProjectId, activeDeviceSerial, currentTopLine = 1, currentBottomLine = 49,
  targetTotalLines = 0, currentPage = 1, isOrchestrating = false, onRefresh,
  selectedDag = 'all', onSelectDag, selectedNodeId, onSelectNodeId,
  projectInitProgress, onDismissInitProgress, onRetryInit, eventsLog = [],
  onClose, isMinimized = false, onToggleMinimize
}) => {
  const [isInspectorModalOpen, setIsInspectorModalOpen] = useState(false);
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

  const handleResetLayout = () => {
    handleSelectNode('init_end');
    handleDagSelect('all');
  };

  const [isLoopRunning, setIsLoopRunning] = useState<boolean>(false);
  const [dagStatus, setDagStatus] = useState<DagStatusData>({
    active_node: 'node_1_end', target_total_lines: targetTotalLines,
    current_top_line: currentTopLine, current_bottom_line: currentBottomLine,
    current_page: currentPage, is_keyboard_guarded: true, arrow_step_count: 48,
    verification_trigger_fired: false, ocr_worker_active: true, ocr_latency_ms: 45
  });

  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [runningGroupId, setRunningGroupId] = useState<string | null>(null);
  const [nodeFeedback, setNodeFeedback] = useState<{ id: string; message: string; isError?: boolean } | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);
  const [isFixingNode1Focus, setIsFixingNode1Focus] = useState(false);
  const [isHidingKeyboard, setIsHidingKeyboard] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const [node3Config, setNode3Config] = useState({
    settle_delay_ms: 300,
    guard_keyboard: true,
    mode: 'desktop'
  });

  const [isNode3ConfigOpen, setIsNode3ConfigOpen] = useState(false);

  const [node4Config, setNode4Config] = useState({
    engine: 'local:rapidocr',
    ocr_worker_timeout_s: 15,
    min_confidence: 0.8
  });

  const [isNode4ConfigOpen, setIsNode4ConfigOpen] = useState(false);

  const [node5Config, setNode5Config] = useState<Node5ConfigState>({
    prevent_trigger_on_issue: true,
    qualifiers: {
      modal_overlay: { name: 'Modal Overlay Check', description: 'Is a modal appearing over the teams markdown?', enabled: true, severity: 'blocking' },
      matrix_app_overlay: { name: 'Matrix App Capture Check', description: 'Is the mobile app matrix capture appearing over teams markdown?', enabled: true, severity: 'blocking' },
      ocr_degraded: { name: 'OCR Quality Degradation Check', description: 'Has previous ocr capture degraded?', enabled: true, severity: 'blocking' },
      keyboard_open: { name: 'Virtual Keyboard Check', description: 'Is software keyboard active or covering content?', enabled: true, severity: 'blocking' },
      light_mode: { name: 'Theme Qualifier', description: 'Ensure editor is in dark mode', enabled: false, severity: 'warning' },
      view_mode: { name: 'Edit Mode Qualifier', description: 'Ensure document in edit mode with gutter lines visible', enabled: true, severity: 'blocking' }
    }
  });

  const [triggerDecision, setTriggerDecision] = useState<TriggerDecisionState>({ allowed: true, prevented: false, reasons: [] });

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
          if (lRes.ok) {
            const ld = await lRes.json();
            setIsLoopRunning(Boolean(ld.running));
          }
        } catch {}
        try {
          const kRes = await fetch(`${apiBase}/api/device/keyboard-status`);
          if (kRes.ok) {
            const kd = await kRes.json();
            setIsKeyboardOpen(Boolean(kd.visible));
          }
        } catch {}
      } catch {}
    };
    fetchDag();
    const t = setInterval(fetchDag, 1500);
    return () => clearInterval(t);
  }, [apiBase, targetTotalLines, currentTopLine, currentBottomLine, currentPage]);

  const effectiveTotal = dagStatus.target_total_lines || targetTotalLines;
  const effectiveTop = dagStatus.current_top_line || currentTopLine;
  const effectiveBottom = dagStatus.current_bottom_line || currentBottomLine;
  const isTriggerFired = dagStatus.verification_trigger_fired || (effectiveTotal > 0 && effectiveTop >= effectiveTotal);

  const node1 = dagStatus.dag?.nodes?.init_end || {};
  const node2 = dagStatus.dag?.nodes?.reset_home || {};
  const node3 = dagStatus.dag?.nodes?.frame_acquire || {};
  const node3b = dagStatus.dag?.nodes?.local_ai_ocr || {};
  const node4 = dagStatus.dag?.nodes?.frame_ocr || {};
  const node5 = dagStatus.dag?.nodes?.arrow_down || {};
  const node6 = dagStatus.dag?.nodes?.verification_trigger || {};
  const node8 = dagStatus.dag?.nodes?.document_assemble || {};

  const currentActiveNode = dagStatus.dag?.current_active_node || dagStatus.active_node;

  const parsedBottom = node4.bottom_line || effectiveBottom;
  const nextTargetTop = (parsedBottom && parsedBottom > 0)
    ? (parsedBottom + 1)
    : (node5.target_top_line || node6.target_top_line || 32);

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
        setNodeFeedback({ id: 'loop', message: 'Continuous capture loop started (Nodes 3→8 looping until 100% captured)' });
      }
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: 'loop', message: `Loop control error: ${err.message}`, isError: true });
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || `Failed to run ${nodeId}`);
      setNodeFeedback({ id: nodeId, message: data.message || `Node ${nodeId} ran successfully ✔`, isError: data.status === 'warning' });
      const statusRes = await fetch(`${apiBase}/api/dag/status`);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setDagStatus(prev => ({ ...prev, ...d }));
        if (d.trigger_decision) setTriggerDecision(d.trigger_decision);
      }
      onRefresh?.();
      setTimeout(() => setNodeFeedback(null), 5000);
    } catch (err: any) {
      setNodeFeedback({ id: nodeId, message: `Node execution error: ${err.message}`, isError: true });
      setTimeout(() => setNodeFeedback(null), 6000);
    } finally {
      setRunningNodeId(null);
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
        message: data.status === 'success'
          ? `DAG Group '${groupId === 'initialize' ? 'Initialize' : 'Capture Entire Markdown'}' executed successfully ✔`
          : (data.error || `DAG Group execution note`),
        isError: data.status === 'error'
      });
      const statusRes = await fetch(`${apiBase}/api/dag/status`);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setDagStatus(prev => ({ ...prev, ...d }));
        if (d.trigger_decision) setTriggerDecision(d.trigger_decision);
      }
      onRefresh?.();
      setTimeout(() => setNodeFeedback(null), 5000);
    } catch (err: any) {
      setNodeFeedback({ id: groupId, message: `Group run error: ${err.message}`, isError: true });
      setTimeout(() => setNodeFeedback(null), 6000);
    } finally {
      setRunningGroupId(null);
    }
  };

  const handleSaveNode3Config = async () => {
    setIsSavingConfig(true);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/frame_acquire/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node3Config)
      });
      if (!res.ok) throw new Error('Failed to save Node 3 config');
      setNodeFeedback({ id: 'frame_acquire', message: '✔ Node 3 (Screen Capture) configuration saved!' });
      setIsNode3ConfigOpen(false);
      onRefresh?.();
    } catch (err: any) { setNodeFeedback({ id: 'frame_acquire', message: err.message, isError: true }); }
    finally { setIsSavingConfig(false); }
  };

  const handleSaveNode4Config = async () => {
    setIsSavingConfig(true);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/frame_ocr/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node4Config)
      });
      if (!res.ok) throw new Error('Failed to save Node 4 config');
      setNodeFeedback({ id: 'frame_ocr', message: '✔ Node 4 (OCR Extraction) configuration saved!' });
      setIsNode4ConfigOpen(false);
      onRefresh?.();
    } catch (err: any) { setNodeFeedback({ id: 'frame_ocr', message: err.message, isError: true }); }
    finally { setIsSavingConfig(false); }
  };

  const handleSaveNode5Config = async () => {
    setIsSavingConfig(true);
    setConfigFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/verification_trigger/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node5Config)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save config');
      if (data.config) setNode5Config(prev => ({ ...prev, ...data.config, qualifiers: { ...prev.qualifiers, ...(data.config.qualifiers || {}) } }));
      if (data.trigger_decision) setTriggerDecision(data.trigger_decision);
      setConfigFeedback('✔ Configuration saved!');
      setTimeout(() => setConfigFeedback(null), 3000);
      setIsConfigModalOpen(false);
      onRefresh?.();
    } catch (err: any) { setConfigFeedback(`Failed to save: ${err.message}`); }
    finally { setIsSavingConfig(false); }
  };

  const handleEvaluateNode5 = async () => {
    setIsEvaluating(true);
    setConfigFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/verification_trigger/evaluate`, { method: 'POST' });
      const data = await res.json();
      if (data.trigger_decision) {
        setTriggerDecision(data.trigger_decision);
        setConfigFeedback(data.trigger_decision.prevented ? `⛔ Prevented by ${data.trigger_decision.reasons.length} issue(s)` : '✔ All qualifiers satisfied!');
      }
    } catch (err: any) { setConfigFeedback(`Evaluation failed: ${err.message}`); }
    finally { setIsEvaluating(false); }
  };

  const handleToggleQualifier = (id: string) => {
    setNode5Config(prev => prev.qualifiers[id] ? ({ ...prev, qualifiers: { ...prev.qualifiers, [id]: { ...prev.qualifiers[id], enabled: !prev.qualifiers[id].enabled } } }) : prev);
  };

  // Group metrics & statuses
  const initGroup = dagStatus.dag?.groups?.initialize || {};
  const captureGroup = dagStatus.dag?.groups?.capture_entire_markdown || {};

  // Accurate node metrics & statuses
  const isNode1Running = runningNodeId === 'init_end' || node1.status === 'active';
  const isNode1Error = node1.status === 'error' || Boolean(node1.error);
  const isNode1Calibrated = !isNode1Error && node1.status === 'completed' && (node1.total_lines || 0) > 0;
  const node1TotalLines = isNode1Calibrated ? (node1.total_lines || 0) : 0;

  const isNode2Running = runningNodeId === 'reset_home' || node2.status === 'active';
  const isNode2Verified = node2.status === 'completed' && Boolean(node2.verified);
  const isNode2Error = node2.status === 'error' || (node2.status === 'completed' && !node2.verified);

  const isInitGroupRunning = runningGroupId === 'initialize' || initGroup.status === 'active' || isNode1Running || isNode2Running || (projectInitProgress?.active && projectInitProgress.status === 'running');
  const isInitGroupCompleted = !isInitGroupRunning && (initGroup.status === 'completed' || (isNode1Calibrated && isNode2Verified) || projectInitProgress?.status === 'completed');
  const isInitGroupError = !isInitGroupRunning && (initGroup.status === 'error' || isNode1Error || projectInitProgress?.status === 'error');

  const isNode3Running = runningNodeId === 'frame_acquire' || node3.status === 'active' || isOrchestrating;
  const isNode3Error = node3.status === 'error' || Boolean(node3.error);
  const isNode3Done = !isNode3Error && node3.status === 'completed';

  const isNode4Running = runningNodeId === 'frame_ocr' || node4.status === 'active';
  const isNode4Error = node4.status === 'error' || Boolean(node4.error);
  const isNode4Done = !isNode4Error && node4.status === 'completed';

  const isNode3bRunning = runningNodeId === 'local_ai_ocr' || node3b.status === 'active';
  const isNode3bError = node3b.status === 'error' || Boolean(node3b.error);
  const isNode3bDone = !isNode3bError && (node3b.status === 'completed' || Boolean(node3b.extracted_text) || isNode4Done);

  const isNode5Running = runningNodeId === 'arrow_down' || node5.status === 'active';
  const isNode5Done = node5.status === 'completed';

  const isNode6Running = runningNodeId === 'verification_trigger' || isEvaluating || node6.status === 'active';

  const isNode8Running = runningNodeId === 'document_assemble' || node8.status === 'active';
  const isNode8Done = node8.status === 'completed';

  const isCaptureGroupRunning = runningGroupId === 'capture_entire_markdown' || captureGroup.status === 'active' || isLoopRunning || isNode3Running || isNode3bRunning || isNode4Running || isNode5Running || isNode6Running || isNode8Running || isOrchestrating;

  // Selected node item metadata
  const selectedNodeMeta = NODES_METADATA.find(n => n.id === activeSelectedNodeId) || NODES_METADATA[0];

  // Telemetry events filtered specifically for the selected node
  const nodeTelemetryEvents = eventsLog.filter(ev => filterNodeTelemetry(selectedNodeMeta.id, ev));

  // Determine node live status with timing and active state
  const getNodeLiveStatus = (id: string) => {
    const nodeData = dagStatus.dag?.nodes?.[id] || {};
    const startedAt = nodeData.started_at || null;
    const finishedAt = nodeData.finished_at || null;
    const durationMs = typeof nodeData.duration_ms === 'number' ? nodeData.duration_ms : null;
    const isExplicitlyActive = Boolean(nodeData.is_active) || (currentActiveNode === id);

    switch (id) {
      case 'init_end': {
        const isRunning = isExplicitlyActive || isNode1Running;
        return {
          isRunning,
          isActive: isRunning,
          isError: isNode1Error,
          isDone: isNode1Calibrated,
          statusLabel: isRunning ? 'CALIBRATING' : (isNode1Calibrated ? 'CALIBRATED' : (isNode1Error ? 'FAILED' : 'NOT RUN')),
          metricLabel: isNode1Calibrated && node1TotalLines > 0 ? `${node1TotalLines.toLocaleString()} Lines` : (isNode1Error ? 'Page Stuck' : 'Auto Detect'),
          color: isNode1Error ? '#ff7b72' : (isNode1Calibrated ? '#00ff9d' : '#58a6ff'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'reset_home': {
        const isRunning = isExplicitlyActive || isNode2Running;
        return {
          isRunning,
          isActive: isRunning,
          isError: isNode2Error,
          isDone: isNode2Verified,
          statusLabel: isRunning ? 'VERIFYING' : (isNode2Verified ? 'VERIFIED' : (isNode2Error ? 'UNVERIFIED' : 'READY')),
          metricLabel: isNode2Verified ? 'Ln 1 at Top' : (isNode2Error ? 'Ln 1 Missing' : 'Line 1 Check'),
          color: isNode2Error ? '#ff7b72' : (isNode2Verified ? '#00ff9d' : '#a371f7'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'frame_acquire': {
        const isRunning = isExplicitlyActive || isNode3Running;
        return {
          isRunning,
          isActive: isRunning,
          isError: isNode3Error,
          isDone: isNode3Done,
          statusLabel: isRunning ? 'CAPTURING' : (isNode3Error ? 'FAILED' : (isNode3Done ? 'CAPTURED' : 'READY')),
          metricLabel: isNode3Done ? `Page ${node3.page || currentPage}` : 'Frame Grab',
          color: isNode3Error ? '#ff7b72' : (isNode3Done ? '#00ff9d' : '#00ff9d'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'local_ai_ocr': {
        const isRunning = isExplicitlyActive || isNode3bRunning;
        return {
          isRunning,
          isActive: isRunning,
          isError: isNode3bError,
          isDone: isNode3bDone,
          statusLabel: isRunning ? 'EXTRACTING' : (isNode3bError ? 'FAILED' : (isNode3bDone ? 'PARSED' : 'READY')),
          metricLabel: node3b.lines_count ? `${node3b.lines_count} lines` : 'MiniCPM-V',
          color: isNode3bError ? '#ff7b72' : (isNode3bDone ? '#00ff9d' : '#388bfd'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'frame_ocr': {
        const isRunning = isExplicitlyActive || isNode4Running;
        return {
          isRunning,
          isActive: isRunning,
          isError: isNode4Error,
          isDone: isNode4Done,
          statusLabel: isRunning ? 'READING' : (isNode4Error ? 'FAILED' : (isNode4Done ? 'PARSED' : 'READY')),
          metricLabel: node4.bottom_line ? `Ln ${node4.top_line || 1}→${node4.bottom_line}` : 'Gutter OCR',
          color: isNode4Error ? '#ff7b72' : (isNode4Done ? '#00ff9d' : '#8957e5'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'arrow_down': {
        const isRunning = isExplicitlyActive || isNode5Running;
        return {
          isRunning,
          isActive: isRunning,
          isError: false,
          isDone: isNode5Done,
          statusLabel: isRunning ? 'STEPPING' : (isNode5Done ? 'STEPPED' : 'READY'),
          metricLabel: `Target Ln ${nextTargetTop}`,
          color: '#ffa657',
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'verification_trigger': {
        const isRunning = isExplicitlyActive || isNode6Running;
        return {
          isRunning,
          isActive: isRunning,
          isError: triggerDecision.prevented,
          isDone: isTriggerFired,
          statusLabel: isTriggerFired ? 'FIRED' : (triggerDecision.prevented ? 'PREVENTED' : 'PENDING'),
          metricLabel: isTriggerFired ? '100% Captured' : (triggerDecision.prevented ? 'Blocked ⛔' : `Ln ${nextTargetTop}`),
          color: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#ff7b72' : '#58a6ff'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'document_assemble': {
        const isRunning = isExplicitlyActive || isNode8Running;
        const isComplete = Boolean(node8.is_complete);
        return {
          isRunning,
          isActive: isRunning,
          isError: Boolean(node8.error),
          isDone: isNode8Done,
          statusLabel: isRunning ? 'ASSEMBLING' : (isComplete ? 'COMPLETE' : (isNode8Done ? 'ASSEMBLED' : 'READY')),
          metricLabel: isComplete ? '100% Verified' : (node8.total_captured_lines ? `${node8.total_captured_lines} lines` : 'Reconstruct'),
          color: isComplete ? '#00ff9d' : (isNode8Done ? '#388bfd' : '#8b949e'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      default:
        return {
          isRunning: false, isActive: false, isError: false, isDone: false,
          statusLabel: 'IDLE', metricLabel: '', color: '#8b949e',
          startedAt: null, finishedAt: null, durationMs: null
        };
    }
  };

  if (isMinimized) {
    return (
      <div style={{ background: '#0d1117', border: '1.5px solid #00ff9d55', borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#e6edf3', fontFamily: 'var(--font-mono, monospace)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={15} color="#00ff9d" />
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

  // Dynamic progress calculations across 100% width
  const calcCapturePercent = () => {
    if (projectInitProgress && projectInitProgress.active) {
      return projectInitProgress.percent;
    }
    const tot = effectiveTotal || 9953;
    const cur = effectiveBottom || 0;
    return Math.min(100, Math.max(0, Math.round((cur / tot) * 100)));
  };
  const progressPercent = calcCapturePercent();

  const progressGradient = (projectInitProgress && projectInitProgress.active)
    ? (projectInitProgress.status === 'completed' ? 'linear-gradient(90deg, #238636, #00ff9d)' : (projectInitProgress.status === 'error' ? 'linear-gradient(90deg, #da3633, #f85149)' : 'linear-gradient(90deg, #1f6feb, #58a6ff)'))
    : (isLoopRunning || isCaptureGroupRunning
        ? 'linear-gradient(90deg, #ff9100, #ff3d00, #ff6b25)'
        : 'linear-gradient(90deg, #1f6feb, #388bfd, #00ff9d)');

  const progressGlow = (projectInitProgress && projectInitProgress.active)
    ? (projectInitProgress.status === 'completed' ? 'rgba(0, 255, 157, 0.4)' : (projectInitProgress.status === 'error' ? 'rgba(248, 81, 73, 0.4)' : 'rgba(88, 166, 255, 0.4)'))
    : (isLoopRunning || isCaptureGroupRunning ? 'rgba(255, 107, 37, 0.5)' : 'rgba(0, 255, 157, 0.35)');

  // Helper for arrow connection status
  const isNodeActive = (id: string) => {
    const status = getNodeLiveStatus(id);
    return status.isActive || status.isRunning || (currentActiveNode === id);
  };

  const isConnectionActive = (nodeAId: string, nodeBId: string) => {
    return isNodeActive(nodeAId) || isNodeActive(nodeBId) ||
      (NODES_METADATA.find(n => n.id === nodeAId)?.group === 'capture_entire_markdown' && (isCaptureGroupRunning || isLoopRunning)) ||
      (NODES_METADATA.find(n => n.id === nodeAId)?.group === 'initialize' && isInitGroupRunning);
  };

  const isHeatActive = (nodeAId: string, nodeBId: string) => {
    return isConnectionActive(nodeAId, nodeBId) && (isCaptureGroupRunning || isLoopRunning || isNodeActive(nodeAId) || isNodeActive(nodeBId));
  };

  // Micro Arrow Component connecting sequential nodes with neon flow & pulse
  const renderMicroArrow = (fromNode: NodeMeta, toNode: NodeMeta, width = 20) => {
    const active = isConnectionActive(fromNode.id, toNode.id);
    const heat = isHeatActive(fromNode.id, toNode.id);
    const isInit = toNode.group === 'initialize';
    const isAi = toNode.id === 'local_ai_ocr';
    const isAmber = toNode.id === 'arrow_down';

    let gradientId = 'dag-flow-emerald';
    let markerId = 'dag-arrowhead-green';
    let strokeFallback = '#00ff9d';

    if (heat) {
      gradientId = 'dag-flow-heat';
      markerId = 'dag-arrowhead-heat';
      strokeFallback = '#ff6b25';
    } else if (isInit) {
      gradientId = 'dag-flow-blue';
      markerId = 'dag-arrowhead-blue';
      strokeFallback = '#58a6ff';
    } else if (isAi) {
      gradientId = 'dag-flow-purple';
      markerId = 'dag-arrowhead-purple';
      strokeFallback = '#a371f7';
    } else if (isAmber) {
      gradientId = 'dag-flow-amber';
      markerId = 'dag-arrowhead-amber';
      strokeFallback = '#ffa657';
    }

    const y = 16;
    const startX = 2;
    const endX = width - 4;
    const pathD = `M ${startX} ${y} L ${endX} ${y}`;

    return (
      <div key={`arrow-${fromNode.id}->${toNode.id}`} style={{ width: `${width}px`, height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
        <svg width={width} height="32" style={{ overflow: 'visible' }}>
          {active && (
            <path
              d={pathD}
              fill="none"
              stroke={strokeFallback}
              strokeWidth="5"
              strokeOpacity="0.4"
              filter="url(#dag-wire-glow)"
            />
          )}
          <path
            d={pathD}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={active ? 2.4 : 1.8}
            strokeOpacity={active ? 1 : 0.75}
            strokeDasharray={active ? '5 3' : 'none'}
            className={active ? 'dag-wire-active' : ''}
            markerEnd={`url(#${markerId})`}
          />
          {active && (
            <circle r="2.5" fill="#ffffff" filter="url(#dag-wire-glow)">
              <animateMotion path={pathD} dur="0.8s" repeatCount="indefinite" />
            </circle>
          )}
        </svg>
      </div>
    );
  };

  // Micro Node Component
  const renderMicroNode = (node: NodeMeta) => {
    const isSelected = activeSelectedNodeId === node.id;
    const status = getNodeLiveStatus(node.id);
    const isPulsingSwirl = status.isActive || status.isRunning || (currentActiveNode === node.id);

    return (
      <div
        key={node.id}
        className={`dag-mini-node-compact ${isSelected ? 'selected' : ''} ${isPulsingSwirl ? 'heat-lamp-active running-swirl' : ''}`}
        onClick={() => handleSelectNode(node.id)}
        style={{
          flex: 1,
          minWidth: '82px',
          maxWidth: '106px',
          height: '56px',
          background: isSelected ? 'rgba(22, 27, 34, 0.98)' : 'rgba(13, 17, 23, 0.9)',
          borderRadius: '6px',
          border: `1.5px solid ${isSelected ? node.accentColor : (status.isDone ? '#238636' : (status.isError ? '#f85149' : '#30363d'))}`,
          boxShadow: isSelected
            ? `0 0 12px ${node.accentColor}55, 0 2px 8px rgba(0,0,0,0.6)`
            : (status.isRunning ? '0 0 10px rgba(255, 107, 37, 0.5)' : 'none'),
          padding: '3px 5px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box'
        }}
        title={`Node ${node.step}: ${node.fullName}\nClick to inspect in telemetry deck`}
      >
        {/* Top: Step badge + Short name + Status indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden' }}>
            <span style={{
              fontSize: '8px', fontWeight: 800, padding: '0px 3px', borderRadius: '3px',
              background: `${node.accentColor}25`, color: node.accentColor, border: `1px solid ${node.accentColor}55`
            }}>
              {node.step}
            </span>
            <span style={{ fontSize: '9px', fontWeight: 800, color: '#f0f6fc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {node.shortName}
            </span>
          </div>
          {status.isRunning ? (
            <RefreshCw size={9} className="spin" color={isPulsingSwirl ? '#ff6b25' : node.accentColor} />
          ) : (
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: status.color, boxShadow: `0 0 5px ${status.color}`, flexShrink: 0 }} />
          )}
        </div>

        {/* Middle: Metric badge */}
        <div style={{ fontSize: '8.5px', fontWeight: 700, color: status.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {status.metricLabel || status.statusLabel}
        </div>

        {/* Bottom: Timing */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '7.5px', color: isPulsingSwirl ? '#ffa657' : '#8b949e', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1px' }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isPulsingSwirl
              ? (status.startedAt ? `${status.startedAt} (active)` : 'Active...')
              : (status.durationMs ? `${(status.durationMs / 1000).toFixed(1)}s` : (status.startedAt || 'Idle'))}
          </span>
          {isSelected && <span style={{ color: node.accentColor, fontSize: '7px', fontWeight: 800 }}>SEL</span>}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: '#0a0e17',
      border: '1px solid #30363d',
      borderRadius: '10px',
      padding: '8px 12px',
      color: '#e6edf3',
      fontFamily: 'var(--font-mono, monospace)',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      ...(isMaximized ? { position: 'fixed', inset: '14px', zIndex: 1200, overflowY: 'auto', boxShadow: '0 12px 48px rgba(0,0,0,0.85)' } : {})
    }}>
      {/* GLOBAL SVG ASSETS: NEON GRADIENTS, GLOW FILTER & CHEVRON ARROWHEADS */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <linearGradient id="dag-flow-emerald" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#388bfd" />
            <stop offset="100%" stopColor="#00ff9d" />
          </linearGradient>
          <linearGradient id="dag-flow-blue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#388bfd" />
            <stop offset="100%" stopColor="#58a6ff" />
          </linearGradient>
          <linearGradient id="dag-flow-purple" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00ff9d" />
            <stop offset="100%" stopColor="#a371f7" />
          </linearGradient>
          <linearGradient id="dag-flow-amber" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8957e5" />
            <stop offset="100%" stopColor="#ffa657" />
          </linearGradient>
          <linearGradient id="dag-flow-heat" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff9100" />
            <stop offset="100%" stopColor="#ff3d00" />
          </linearGradient>
          <filter id="dag-wire-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <marker id="dag-arrowhead-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="1 1, 5.5 3, 1 5" fill="#00ff9d" />
          </marker>
          <marker id="dag-arrowhead-blue" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="1 1, 5.5 3, 1 5" fill="#58a6ff" />
          </marker>
          <marker id="dag-arrowhead-purple" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="1 1, 5.5 3, 1 5" fill="#a371f7" />
          </marker>
          <marker id="dag-arrowhead-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="1 1, 5.5 3, 1 5" fill="#ffa657" />
          </marker>
          <marker id="dag-arrowhead-heat" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="1 1, 5.5 3, 1 5" fill="#ff6b25" />
          </marker>
        </defs>
      </svg>

      {/* TOP HEADER: STATUS & REFINED CONTROLS INTEGRATED WITH PROGRESS AREA */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minHeight: '26px' }}>
          {/* Left: Info & Progress Stage */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            {projectInitProgress && projectInitProgress.active ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '4px',
                  background: projectInitProgress.status === 'error' ? 'rgba(248,81,73,0.2)' : (projectInitProgress.status === 'completed' ? 'rgba(0,255,157,0.2)' : 'rgba(88,166,255,0.2)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {projectInitProgress.status === 'running' && <RefreshCw size={11} className="spin" color="#58a6ff" />}
                  {projectInitProgress.status === 'completed' && <Check size={12} color="#00ff9d" />}
                  {projectInitProgress.status === 'error' && <AlertTriangle size={12} color="#ff7b72" />}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#f0f6fc' }}>
                  {projectInitProgress.status === 'completed' ? 'WORKSPACE INITIALIZED' : (projectInitProgress.status === 'error' ? 'INITIALIZATION HALTED' : 'INITIALIZING WORKSPACE')}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '0 5px', borderRadius: '8px', background: 'rgba(88,166,255,0.15)', color: '#58a6ff' }}>
                  {projectInitProgress.percent}%
                </span>
                <span style={{ fontSize: '10px', color: '#8b949e', marginLeft: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {projectInitProgress.stage}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Layers size={15} color="#00ff9d" />
                <span style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.6px', color: '#00ff9d' }}>PAGINATION FLOW DAG</span>
                <span style={{ fontSize: '9.5px', color: '#8b949e', borderLeft: '1px solid #30363d', paddingLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Page #{currentPage} · Ln {effectiveTop}–{effectiveBottom} of {effectiveTotal || 9953} lines · Target Next Ln {nextTargetTop}
                </span>
                <span style={{
                  fontSize: '8.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px',
                  background: isLoopRunning ? 'rgba(255,107,37,0.25)' : (isCaptureGroupRunning ? 'rgba(0,255,157,0.15)' : '#161b22'),
                  color: isLoopRunning ? '#ffa657' : (isCaptureGroupRunning ? '#00ff9d' : '#8b949e'),
                  border: `1px solid ${isLoopRunning ? '#ff6b2588' : 'transparent'}`
                }}>
                  {isLoopRunning ? '♨️ THERMAL LOOP ACTIVE' : (isCaptureGroupRunning ? 'CYCLE ACTIVE' : 'READY')}
                </span>
              </div>
            )}
          </div>

          {/* Right: Controls & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {projectInitProgress && projectInitProgress.active ? (
              <>
                {projectInitProgress.status === 'completed' && (
                  <button
                    type="button"
                    onClick={() => { onDismissInitProgress?.(); handleDagSelect('capture_entire_markdown'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '5px', border: 'none', background: '#238636', color: '#fff', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Check size={11} /><span>Start Capturing</span>
                  </button>
                )}
                {projectInitProgress.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => onRetryInit?.()}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '5px', border: 'none', background: '#1f6feb', color: '#fff', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <RefreshCw size={10} /><span>Retry Init</span>
                  </button>
                )}
                <button type="button" onClick={() => onDismissInitProgress?.()} style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px' }}><X size={12} /></button>
              </>
            ) : null}

            {/* Filter pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <button
                type="button"
                onClick={() => handleDagSelect('all')}
                style={{
                  padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${effectiveSelectedDag === 'all' ? '#58a6ff' : '#30363d'}`,
                  background: effectiveSelectedDag === 'all' ? 'rgba(88,166,255,0.2)' : '#161b22',
                  color: effectiveSelectedDag === 'all' ? '#58a6ff' : '#8b949e'
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => handleDagSelect('initialize')}
                style={{
                  padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${effectiveSelectedDag === 'initialize' ? '#58a6ff' : '#30363d'}`,
                  background: effectiveSelectedDag === 'initialize' ? 'rgba(88,166,255,0.2)' : '#161b22',
                  color: effectiveSelectedDag === 'initialize' ? '#58a6ff' : '#8b949e'
                }}
              >
                DAG 1
              </button>
              <button
                type="button"
                onClick={() => handleDagSelect('capture_entire_markdown')}
                style={{
                  padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${effectiveSelectedDag === 'capture_entire_markdown' ? '#00ff9d' : '#30363d'}`,
                  background: effectiveSelectedDag === 'capture_entire_markdown' ? 'rgba(0,255,157,0.2)' : '#161b22',
                  color: effectiveSelectedDag === 'capture_entire_markdown' ? '#00ff9d' : '#8b949e'
                }}
              >
                DAG 2
              </button>
            </div>

            {/* Capture Loop Button */}
            <button
              type="button"
              onClick={handleToggleLoop}
              title={isLoopRunning ? "Stop Continuous Capture Loop" : "Start Continuous Capture Loop (Nodes 3→8 Repeating until 100% captured)"}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '5px',
                background: isLoopRunning ? 'rgba(255, 107, 37, 0.25)' : 'rgba(0, 255, 157, 0.15)',
                border: `1px solid ${isLoopRunning ? '#ff6b25' : '#00ff9d'}`,
                color: isLoopRunning ? '#ffa657' : '#00ff9d',
                fontSize: '9.5px', fontWeight: 800, cursor: 'pointer'
              }}
            >
              {isLoopRunning ? <RefreshCw size={10} className="spin" color="#ff6b25" /> : <Play size={10} />}
              <span>{isLoopRunning ? 'STOP LOOP' : 'RUN CAPTURE LOOP'}</span>
            </button>

            {/* Reset Grid */}
            <button
              type="button"
              onClick={handleResetLayout}
              title="Reset node positions"
              style={{
                display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px',
                background: '#21262d', border: '1px solid #30363d', borderRadius: '5px',
                color: '#8b949e', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              <Move size={10} />
              <span>Reset Grid</span>
            </button>

            {/* Keyboard Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9.5px' }}>
              <Lock size={10} color={isKeyboardOpen ? '#f85149' : '#00ff9d'} />
              <span style={{ color: isKeyboardOpen ? '#f85149' : '#00ff9d', fontWeight: 700 }}>
                {isKeyboardOpen ? 'KB OPEN' : 'KB CLOSED'}
              </span>
            </div>

            {/* Window Controls */}
            <div className="window-controls" style={{ marginLeft: '2px' }}>
              <button type="button" className="win-btn" onClick={onToggleMinimize} title="Minimize DAG"><Minus size={11} /></button>
              <button type="button" className="win-btn" onClick={() => setIsMaximized(p => !p)} title={isMaximized ? "Restore DAG" : "Maximize DAG"}>
                {isMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
              {onClose && (
                <button type="button" className="win-btn win-btn-close" onClick={onClose} title="Close DAG"><X size={11} /></button>
              )}
            </div>
          </div>
        </div>

        {/* FULL-WIDTH PROGRESS CONTROL THROUGHOUT THE WIDTH */}
        <div style={{ width: '100%', height: '5px', background: '#161b22', border: '1px solid #30363d', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: progressGradient,
              boxShadow: `0 0 8px ${progressGlow}`,
              transition: 'width 0.3s ease',
              borderRadius: '2px'
            }}
          />
        </div>
      </div>

      {/* COMPACT FEEDBACK NOTIFICATION */}
      {nodeFeedback && (
        <div style={{ padding: '4px 10px', borderRadius: '5px', background: nodeFeedback.isError ? 'rgba(248, 81, 73, 0.15)' : 'rgba(0, 255, 157, 0.12)', border: `1px solid ${nodeFeedback.isError ? '#f8514966' : '#00ff9d55'}`, color: nodeFeedback.isError ? '#ff7b72' : '#00ff9d', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {nodeFeedback.isError ? <ShieldAlert size={12} /> : <Check size={12} />}
            <span style={{ fontWeight: 600 }}>{nodeFeedback.message}</span>
          </div>
          <button onClick={() => setNodeFeedback(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: '1px' }}><X size={11} /></button>
        </div>
      )}

      {/* MAIN INLINE DECK: MICRO DAG ON LEFT + TELEMETRY ON RIGHT */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', width: '100%', minHeight: '66px', overflowX: 'auto' }}>
        
        {/* GROUP 1: DAG 1 INITIALIZE */}
        <div
          onClick={() => handleDagSelect('initialize')}
          style={{
            width: '216px',
            flexShrink: 0,
            borderRadius: '8px',
            border: `1.5px dashed ${effectiveSelectedDag === 'initialize' ? '#58a6ff' : 'rgba(88, 166, 255, 0.25)'}`,
            background: effectiveSelectedDag === 'initialize' ? 'rgba(88, 166, 255, 0.08)' : 'rgba(15, 23, 42, 0.4)',
            padding: '4px 6px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#58a6ff' }}>DAG 1: INIT</span>
              <span style={{
                fontSize: '8px', padding: '0 4px', borderRadius: '3px',
                background: isInitGroupRunning ? 'rgba(163, 113, 247, 0.2)' : (isInitGroupCompleted ? 'rgba(0, 255, 157, 0.15)' : (isInitGroupError ? 'rgba(248, 81, 73, 0.15)' : '#30363d')),
                color: isInitGroupRunning ? '#a371f7' : (isInitGroupCompleted ? '#00ff9d' : (isInitGroupError ? '#ff7b72' : '#8b949e')),
                fontWeight: 800
              }}>
                {isInitGroupRunning ? 'RUNNING' : (isInitGroupCompleted ? 'DONE' : (isInitGroupError ? 'ISSUE' : 'IDLE'))}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {renderMicroNode(NODES_METADATA[0])}
            {renderMicroArrow(NODES_METADATA[0], NODES_METADATA[1], 18)}
            {renderMicroNode(NODES_METADATA[1])}
          </div>
        </div>

        {/* TRANSITION ARROW: CONNECTING DAG 1 TO DAG 2 */}
        {renderMicroArrow(NODES_METADATA[1], NODES_METADATA[2], 22)}

        {/* GROUP 2: DAG 2 CAPTURE ENTIRE MARKDOWN */}
        <div
          onClick={() => handleDagSelect('capture_entire_markdown')}
          style={{
            flex: 1,
            minWidth: 0,
            borderRadius: '8px',
            border: `1.5px dashed ${isCaptureGroupRunning ? '#ff6b25' : (effectiveSelectedDag === 'capture_entire_markdown' ? '#00ff9d' : 'rgba(0, 255, 157, 0.25)')}`,
            background: isCaptureGroupRunning
              ? 'radial-gradient(ellipse at 50% 20%, rgba(255, 107, 37, 0.15) 0%, rgba(15, 23, 42, 0.5) 85%)'
              : (effectiveSelectedDag === 'capture_entire_markdown' ? 'rgba(0, 255, 157, 0.05)' : 'rgba(15, 23, 42, 0.4)'),
            padding: '4px 6px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          {/* Group 2 Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: isCaptureGroupRunning ? '#ffa657' : '#00ff9d' }}>
                DAG 2: CAPTURE ENTIRE MARKDOWN
              </span>
              <span style={{
                fontSize: '8px', padding: '0 4px', borderRadius: '3px',
                background: isCaptureGroupRunning ? 'rgba(255, 107, 37, 0.25)' : 'rgba(0, 255, 157, 0.12)',
                color: isCaptureGroupRunning ? '#ffa657' : '#00ff9d',
                fontWeight: 800, border: `1px solid ${isCaptureGroupRunning ? '#ff6b2566' : 'transparent'}`
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

          {/* Group 2 Sequential Micro Nodes & Neon Connecting Arrows */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {renderMicroNode(NODES_METADATA[2])}
            {renderMicroArrow(NODES_METADATA[2], NODES_METADATA[3], 18)}
            {renderMicroNode(NODES_METADATA[3])}
            {renderMicroArrow(NODES_METADATA[3], NODES_METADATA[4], 18)}
            {renderMicroNode(NODES_METADATA[4])}
            {renderMicroArrow(NODES_METADATA[4], NODES_METADATA[5], 18)}
            {renderMicroNode(NODES_METADATA[5])}
            {renderMicroArrow(NODES_METADATA[5], NODES_METADATA[6], 18)}
            {renderMicroNode(NODES_METADATA[6])}
            {renderMicroArrow(NODES_METADATA[6], NODES_METADATA[7], 18)}
            {renderMicroNode(NODES_METADATA[7])}
          </div>

          {/* Tucked Loopback Curve underneath Group 2 Nodes (Node 8 -> Node 3) */}
          <div style={{ width: '100%', height: '17px', position: 'relative', marginTop: '2px', display: 'flex', alignItems: 'center' }}>
            <svg width="100%" height="17" viewBox="0 0 1000 17" preserveAspectRatio="none" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
              <path
                d="M 945 2 C 945 14, 55 14, 55 2"
                fill="none"
                stroke={triggerDecision.prevented ? '#f85149' : (isCaptureGroupRunning ? '#00ff9d' : '#00ff9d77')}
                strokeWidth={isCaptureGroupRunning ? 2 : 1.5}
                strokeDasharray={isCaptureGroupRunning ? '6 3' : '4 3'}
                className={isCaptureGroupRunning ? 'dag-wire-active' : ''}
                markerEnd={triggerDecision.prevented ? 'url(#dag-arrowhead-heat)' : 'url(#dag-arrowhead-green)'}
              />
              {isCaptureGroupRunning && (
                <circle r="2.8" fill="#00ff9d" filter="url(#dag-wire-glow)">
                  <animateMotion path="M 945 2 C 945 14, 55 14, 55 2" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', fontSize: '8.5px', fontWeight: 700,
              color: triggerDecision.prevented ? '#ff7b72' : '#00ff9d',
              textShadow: '0 1px 4px rgba(0,0,0,0.95)'
            }}>
              {triggerDecision.prevented ? '⛔ Trigger Prevented: Qualifier Issue' : `↺ Loopback to Step 3: Next Page Screen Capture (Target Ln ${nextTargetTop})`}
            </div>
          </div>
        </div>

        {/* INTEGRATED DAG TELEMETRY DECK ON RIGHT */}
        <div style={{
          width: '290px',
          flexShrink: 0,
          background: '#121822',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '5px 8px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '76px',
          boxSizing: 'border-box'
        }}>
          {/* Row 1: Selected Node Header & Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
              <span style={{
                fontSize: '9px', fontWeight: 800,
                background: `${selectedNodeMeta.accentColor}25`,
                color: selectedNodeMeta.accentColor,
                border: `1px solid ${selectedNodeMeta.accentColor}55`,
                padding: '1px 5px', borderRadius: '4px'
              }}>
                NODE {selectedNodeMeta.step}
              </span>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#f0f6fc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedNodeMeta.shortName}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {selectedNodeMeta.hasConfig && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedNodeMeta.id === 'frame_acquire') setIsNode3ConfigOpen(true);
                    else if (selectedNodeMeta.id === 'frame_ocr') setIsNode4ConfigOpen(true);
                    else if (selectedNodeMeta.id === 'verification_trigger') setIsConfigModalOpen(true);
                  }}
                  title="Configure node"
                  style={{ background: '#21262d', border: '1px solid #30363d', color: '#58a6ff', padding: '2px 5px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <Settings size={10} />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRunNode(selectedNodeMeta.id)}
                disabled={runningNodeId !== null}
                style={{
                  display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 7px',
                  borderRadius: '4px', border: `1px solid ${selectedNodeMeta.accentColor}66`,
                  background: `${selectedNodeMeta.accentColor}20`, color: selectedNodeMeta.accentColor,
                  fontSize: '9px', fontWeight: 800, cursor: runningNodeId !== null ? 'wait' : 'pointer'
                }}
              >
                {runningNodeId === selectedNodeMeta.id ? <RefreshCw size={9} className="spin" /> : <Play size={9} />}
                <span>{runningNodeId === selectedNodeMeta.id ? 'Running...' : `Run Node ${selectedNodeMeta.step}`}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsInspectorModalOpen(true)}
                title="Open Full Node Inspector & Troubleshooting"
                style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e', padding: '2px 5px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '9px', fontWeight: 700 }}
              >
                <Activity size={10} style={{ marginRight: '2px' }} />
                <span>Details</span>
              </button>
            </div>
          </div>

          {/* Row 2: Live Timing & Heat Lamp Badge */}
          {(() => {
            const liveStatus = getNodeLiveStatus(selectedNodeMeta.id);
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#8b949e' }}>
                  <Clock size={10} color={liveStatus.isActive ? '#ff6b25' : '#8b949e'} />
                  <span style={{ color: liveStatus.isActive ? '#ffa657' : '#f0f6fc', fontWeight: 700 }}>
                    {liveStatus.durationMs !== null ? `${(liveStatus.durationMs / 1000).toFixed(2)}s (${liveStatus.durationMs}ms)` : (liveStatus.isActive ? 'Measuring...' : (liveStatus.startedAt || '--:--:--'))}
                  </span>
                  <span style={{ color: '#484f58' }}>•</span>
                  <span style={{ color: liveStatus.color, fontWeight: 700 }}>{liveStatus.metricLabel || '--'}</span>
                </div>
                <span style={{
                  fontSize: '8px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px',
                  background: liveStatus.isActive ? 'rgba(255, 107, 37, 0.25)' : (liveStatus.isDone ? 'rgba(0, 255, 157, 0.15)' : '#161b22'),
                  color: liveStatus.isActive ? '#ffa657' : (liveStatus.isDone ? '#00ff9d' : '#8b949e'),
                  border: `1px solid ${liveStatus.isActive ? '#ff6b2588' : 'transparent'}`
                }}>
                  {liveStatus.isActive ? '♨️ HEAT LAMP ACTIVE' : (liveStatus.isDone ? 'COMPLETED ✔' : 'IDLE')}
                </span>
              </div>
            );
          })()}

          {/* Row 3: Live Process Telemetry Ticker (Latest Event) */}
          <div style={{
            background: '#0a0d13', border: '1px solid #21262d', borderRadius: '4px',
            padding: '2px 5px', fontSize: '8.5px', display: 'flex', alignItems: 'center', gap: '5px',
            overflow: 'hidden', whiteSpace: 'nowrap'
          }}>
            <Activity size={9} color={selectedNodeMeta.accentColor} style={{ flexShrink: 0 }} />
            {nodeTelemetryEvents.length > 0 ? (
              <>
                <span style={{ color: '#6e7681', flexShrink: 0 }}>{nodeTelemetryEvents[nodeTelemetryEvents.length - 1].timestamp}</span>
                <span style={{
                  fontSize: '7.5px', fontWeight: 800, padding: '0 3px', borderRadius: '2px',
                  background: 'rgba(0, 255, 157, 0.15)', color: '#00ff9d', flexShrink: 0
                }}>
                  {nodeTelemetryEvents[nodeTelemetryEvents.length - 1].category}
                </span>
                <span style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {nodeTelemetryEvents[nodeTelemetryEvents.length - 1].message}
                </span>
              </>
            ) : (
              <span style={{ color: '#6e7681', fontStyle: 'italic' }}>
                No telemetry for Node {selectedNodeMeta.step} yet — click "Run Node {selectedNodeMeta.step}" to trace.
              </span>
            )}
          </div>
        </div>

      </div>

      {/* MODAL 0: FULL NODE INSPECTOR & TELEMETRY DETAILS */}
      {isInspectorModalOpen && (
        <Modal
          isOpen={isInspectorModalOpen}
          onClose={() => setIsInspectorModalOpen(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 800,
                background: `${selectedNodeMeta.accentColor}25`,
                color: selectedNodeMeta.accentColor,
                border: `1px solid ${selectedNodeMeta.accentColor}55`,
                padding: '2px 7px', borderRadius: '6px'
              }}>
                NODE {selectedNodeMeta.step}
              </span>
              <span>{selectedNodeMeta.fullName}</span>
            </div>
          }
          subtitle={selectedNodeMeta.desc}
          confirmText="Done"
          cancelText="Close"
          onConfirm={() => setIsInspectorModalOpen(false)}
          maxWidth="720px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Quick Action Button for Selected Node */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleRunNode(selectedNodeMeta.id)}
                disabled={runningNodeId !== null}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '6px', padding: '7px 12px', borderRadius: '6px',
                  border: `1px solid ${selectedNodeMeta.accentColor}66`,
                  background: `${selectedNodeMeta.accentColor}18`,
                  color: selectedNodeMeta.accentColor,
                  fontSize: '11px', fontWeight: 800,
                  cursor: runningNodeId !== null ? 'wait' : 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                {runningNodeId === selectedNodeMeta.id ? <RefreshCw size={12} className="spin" /> : <Play size={12} />}
                <span>{runningNodeId === selectedNodeMeta.id ? `Running Step ${selectedNodeMeta.step}...` : `Run Node ${selectedNodeMeta.step}`}</span>
              </button>

              {selectedNodeMeta.id === 'local_ai_ocr' && node3b.extracted_text && (
                <button
                  type="button"
                  onClick={() => setIsTextModalOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 10px',
                    borderRadius: '6px', border: '1px solid #30363d', background: '#21262d',
                    color: '#58a6ff', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  <FileText size={12} />
                  <span>Full Text</span>
                </button>
              )}
            </div>

            {/* Real-time Execution Timings & Node Active State */}
            {(() => {
              const liveStatus = getNodeLiveStatus(selectedNodeMeta.id);
              return (
                <div style={{
                  background: liveStatus.isActive ? 'radial-gradient(ellipse at 50% 0%, rgba(255, 107, 37, 0.15) 0%, #0d1117 80%)' : '#0d1117',
                  border: `1.5px solid ${liveStatus.isActive ? '#ff6b25' : '#21262d'}`,
                  borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: liveStatus.isActive ? '#ffa657' : '#58a6ff', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock size={11} color={liveStatus.isActive ? '#ff6b25' : '#58a6ff'} />
                      <span>NODE EXECUTION TIMINGS & STATE</span>
                    </div>
                    <span style={{
                      fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px',
                      background: liveStatus.isActive ? 'rgba(255, 107, 37, 0.25)' : (liveStatus.isDone ? 'rgba(0, 255, 157, 0.15)' : '#161b22'),
                      color: liveStatus.isActive ? '#ffa657' : (liveStatus.isDone ? '#00ff9d' : '#8b949e'),
                      border: `1px solid ${liveStatus.isActive ? '#ff6b2588' : 'transparent'}`
                    }}>
                      {liveStatus.isActive ? '♨️ HEAT LAMP ACTIVE' : (liveStatus.isDone ? 'COMPLETED ✔' : 'IDLE')}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10.5px', marginTop: '2px' }}>
                    <div style={{ background: '#161b22', padding: '6px 8px', borderRadius: '5px', border: '1px solid #30363d' }}>
                      <div style={{ fontSize: '8.5px', color: '#8b949e', fontWeight: 700 }}>STARTED AT</div>
                      <div style={{ fontWeight: 800, color: liveStatus.startedAt ? '#f0f6fc' : '#6e7681', marginTop: '2px', fontFamily: 'var(--font-mono, monospace)' }}>
                        {liveStatus.startedAt || '--:--:--'}
                      </div>
                    </div>
                    <div style={{ background: '#161b22', padding: '6px 8px', borderRadius: '5px', border: '1px solid #30363d' }}>
                      <div style={{ fontSize: '8.5px', color: '#8b949e', fontWeight: 700 }}>FINISHED AT</div>
                      <div style={{ fontWeight: 800, color: liveStatus.isActive ? '#ffa657' : (liveStatus.finishedAt ? '#00ff9d' : '#6e7681'), marginTop: '2px', fontFamily: 'var(--font-mono, monospace)' }}>
                        {liveStatus.isActive ? '⚡ Running...' : (liveStatus.finishedAt || '--:--:--')}
                      </div>
                    </div>
                    <div style={{ background: '#161b22', padding: '6px 8px', borderRadius: '5px', border: '1px solid #30363d' }}>
                      <div style={{ fontSize: '8.5px', color: '#8b949e', fontWeight: 700 }}>ELAPSED DURATION</div>
                      <div style={{ fontWeight: 800, color: liveStatus.durationMs !== null ? '#58a6ff' : '#6e7681', marginTop: '2px' }}>
                        {liveStatus.durationMs !== null ? `${(liveStatus.durationMs / 1000).toFixed(2)}s (${liveStatus.durationMs}ms)` : (liveStatus.isActive ? 'Measuring...' : '--')}
                      </div>
                    </div>
                    <div style={{ background: '#161b22', padding: '6px 8px', borderRadius: '5px', border: '1px solid #30363d' }}>
                      <div style={{ fontSize: '8.5px', color: '#8b949e', fontWeight: 700 }}>CURRENT METRIC</div>
                      <div style={{ fontWeight: 800, color: liveStatus.color, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {liveStatus.metricLabel || '--'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Diagnostic Details */}
            {selectedNodeMeta.id === 'init_end' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Calibrated Total Lines:</span>
                  <span style={{ fontWeight: 800, color: node1TotalLines > 0 ? '#00ff9d' : '#8b949e' }}>
                    {node1TotalLines > 0 ? `${node1TotalLines.toLocaleString()} Lines` : 'Not Calibrated'}
                  </span>
                </div>
                {isNode1Error && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                    <button
                      type="button"
                      disabled={isFixingNode1Focus}
                      onClick={async () => {
                        setIsFixingNode1Focus(true);
                        try {
                          await fetch(`${apiBase}/api/classifiers/fix/editor_cursor_focused`, { method: 'POST' });
                          onRefresh?.();
                        } catch {}
                        finally { setIsFixingNode1Focus(false); }
                      }}
                      style={{ flex: 1, padding: '5px 8px', background: '#21262d', border: '1px solid #30363d', color: '#58a6ff', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {isFixingNode1Focus ? 'Focusing...' : 'Focus Editor'}
                    </button>
                    <button
                      type="button"
                      disabled={isHidingKeyboard}
                      onClick={async () => {
                        setIsHidingKeyboard(true);
                        try {
                          await fetch(`${apiBase}/api/device/close-keyboard`, { method: 'POST' });
                          onRefresh?.();
                        } catch {}
                        finally { setIsHidingKeyboard(false); }
                      }}
                      style={{ flex: 1, padding: '5px 8px', background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {isHidingKeyboard ? 'Closing...' : 'Hide Keyboard'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* PROCESS TRACING TELEMETRY */}
            <div style={{ borderTop: '1px solid #21262d', paddingTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#f0f6fc', letterSpacing: '0.4px' }}>
                  PROCESS TRACING TELEMETRY ({nodeTelemetryEvents.length} events)
                </span>
              </div>
              <div className="dag-toaster-card-stream" style={{ maxHeight: '160px' }}>
                {nodeTelemetryEvents.length === 0 ? (
                  <div style={{ color: '#6e7681', fontSize: '10px', padding: '8px', textAlign: 'center' }}>
                    No telemetry trace events for Node {selectedNodeMeta.step} yet.
                  </div>
                ) : (
                  nodeTelemetryEvents.slice(-12).map(ev => (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', lineHeight: 1.3 }}>
                      <span style={{ color: '#6e7681', fontSize: '9px', flexShrink: 0 }}>{ev.timestamp}</span>
                      <span style={{
                        fontSize: '8.5px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px',
                        background: ev.category === 'SYSTEM' ? 'rgba(88, 166, 255, 0.15)' : 'rgba(0, 255, 157, 0.15)',
                        color: ev.category === 'SYSTEM' ? '#58a6ff' : '#00ff9d',
                        flexShrink: 0
                      }}>
                        {ev.category}
                      </span>
                      <span style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 1: Node 3 Screen Capture Config */}
      {isNode3ConfigOpen && (
        <Modal
          isOpen={isNode3ConfigOpen}
          onClose={() => setIsNode3ConfigOpen(false)}
          title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={18} color="#00ff9d" /><span>DAG Node 3: Screen Capture Configuration</span></div>}
          subtitle="Configure external display screen capture timing and keyboard guards"
          confirmText={isSavingConfig ? 'Saving...' : 'Save Configuration'}
          cancelText="Close"
          onConfirm={handleSaveNode3Config}
          disabled={isSavingConfig}
          maxWidth="540px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#e6edf3' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e' }}>SETTLE DELAY BEFORE CAPTURE (MS)</label>
              <input type="number" value={node3Config.settle_delay_ms} onChange={(e) => setNode3Config(p => ({ ...p, settle_delay_ms: parseInt(e.target.value) || 0 }))} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', color: '#f0f6fc', fontSize: '12px', fontFamily: 'inherit' }} />
              <span style={{ fontSize: '10px', color: '#8b949e' }}>Dwell time allowed for the editor UI to settle before grabbing display pixels.</span>
            </div>
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Guard Keyboard Closed</div>
                <div style={{ fontSize: '10px', color: '#8b949e' }}>Silently checks and suppresses on-screen soft keyboard before capture.</div>
              </div>
              <button type="button" onClick={() => setNode3Config(p => ({ ...p, guard_keyboard: !p.guard_keyboard }))} style={{ background: node3Config.guard_keyboard ? '#238636' : '#21262d', color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                {node3Config.guard_keyboard ? 'ACTIVE' : 'OFF'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: Node 4 OCR Extraction Config */}
      {isNode4ConfigOpen && (
        <Modal
          isOpen={isNode4ConfigOpen}
          onClose={() => setIsNode4ConfigOpen(false)}
          title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={18} color="#a371f7" /><span>DAG Node 4: OCR Extraction Configuration</span></div>}
          subtitle="Configure OCR worker parameters and confidence thresholds"
          confirmText={isSavingConfig ? 'Saving...' : 'Save Configuration'}
          cancelText="Close"
          onConfirm={handleSaveNode4Config}
          disabled={isSavingConfig}
          maxWidth="540px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#e6edf3' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e' }}>OCR ENGINE</label>
              <select value={node4Config.engine} onChange={(e) => setNode4Config(p => ({ ...p, engine: e.target.value }))} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', color: '#f0f6fc', fontSize: '12px', fontFamily: 'inherit' }}>
                <option value="local:rapidocr">Local RapidOCR (Fast, Gutter Optimized)</option>
                <option value="cloud:gemini">Cloud Gemini Vision</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e' }}>WORKER TIMEOUT (SECONDS)</label>
              <input type="number" value={node4Config.ocr_worker_timeout_s} onChange={(e) => setNode4Config(p => ({ ...p, ocr_worker_timeout_s: parseInt(e.target.value) || 15 }))} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', color: '#f0f6fc', fontSize: '12px', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e' }}>MINIMUM CONFIDENCE THRESHOLD</label>
              <input type="number" step="0.05" min="0" max="1" value={node4Config.min_confidence} onChange={(e) => setNode4Config(p => ({ ...p, min_confidence: parseFloat(e.target.value) || 0.8 }))} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', color: '#f0f6fc', fontSize: '12px', fontFamily: 'inherit' }} />
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: Node 6 Trigger Verification & Qualifiers Config */}
      {isConfigModalOpen && (
        <Modal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={18} color="#58a6ff" /><span>DAG Node 6: Trigger Verification & Qualifiers</span></div>}
          subtitle="Configure deterministic general-purpose qualifiers for trigger decision"
          confirmText={isSavingConfig ? 'Saving...' : 'Save Configuration'}
          cancelText="Close"
          onConfirm={handleSaveNode5Config}
          disabled={isSavingConfig}
          maxWidth="720px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#e6edf3' }}>
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={16} color="#00ff9d" /><span>Enforce Qualifier-Based Trigger Prevention</span></div>
                <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '3px' }}>When active, enabled qualifiers detecting issues halt the DAG trigger at Node 6.</div>
              </div>
              <button type="button" onClick={() => setNode5Config(p => ({ ...p, prevent_trigger_on_issue: !p.prevent_trigger_on_issue }))} style={{ background: node5Config.prevent_trigger_on_issue ? '#238636' : '#21262d', color: '#fff', border: `1px solid ${node5Config.prevent_trigger_on_issue ? '#2ea043' : '#30363d'}`, borderRadius: '20px', padding: '4px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {node5Config.prevent_trigger_on_issue ? <><ToggleRight size={16} /><span>ENFORCED</span></> : <><ToggleLeft size={16} /><span>BYPASSED</span></>}
              </button>
            </div>

            <div style={{ background: triggerDecision.prevented ? '#2d1416' : '#102319', border: `1px solid ${triggerDecision.prevented ? '#f85149' : '#238636'}`, borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {triggerDecision.prevented ? <ShieldAlert size={18} color="#ff7b72" /> : <ShieldCheck size={18} color="#00ff9d" />}
                  <span style={{ fontSize: '12px', fontWeight: 800, color: triggerDecision.prevented ? '#ff7b72' : '#00ff9d' }}>{triggerDecision.prevented ? 'DAG TRIGGER PREVENTED' : 'DAG TRIGGER ALLOWED'}</span>
                </div>
                <button type="button" onClick={handleEvaluateNode5} disabled={isEvaluating} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#21262d', color: '#58a6ff', border: '1px solid #30363d', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: isEvaluating ? 'wait' : 'pointer' }}>
                  <RefreshCw size={11} className={isEvaluating ? 'spin' : ''} /><span>{isEvaluating ? 'Testing...' : 'Test Qualifiers Now'}</span>
                </button>
              </div>
              {triggerDecision.prevented ? (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#f0f6fc' }}>
                  <div style={{ fontWeight: 600, color: '#ff7b72', marginBottom: '4px' }}>Blocking issues:</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: '#e6edf3', lineHeight: 1.5 }}>{triggerDecision.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              ) : <div style={{ marginTop: '6px', fontSize: '11px', color: '#8b949e' }}>All enabled quality qualifiers are satisfied. Next page gutter verification will trigger loopback cleanly.</div>}
            </div>

            {configFeedback && <div style={{ padding: '8px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', fontSize: '11px', color: '#58a6ff', fontWeight: 600 }}>{configFeedback}</div>}

            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#8b949e', marginBottom: '8px' }}>DETERMINISTIC OCR QUALITY QUALIFIERS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(node5Config.qualifiers).map(([qId, qItem]) => {
                  const statusInfo = triggerDecision.qualifier_statuses?.[qId];
                  const hasIssue = statusInfo?.issue_detected ?? false;
                  return (
                    <div key={qId} style={{ background: '#161b22', border: `1px solid ${hasIssue && qItem.enabled ? '#f8514988' : '#30363d'}`, borderRadius: '6px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>{qItem.name}</span>
                          <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: qItem.severity === 'blocking' ? '#f8514922' : '#d2992222', color: qItem.severity === 'blocking' ? '#ff7b72' : '#e3b341', fontWeight: 700 }}>{qItem.severity.toUpperCase()}</span>
                          {qItem.enabled ? (hasIssue ? <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#f85149', color: '#fff', fontWeight: 700 }}>ISSUE DETECTED</span> : <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#23863633', color: '#00ff9d', fontWeight: 700 }}>SATISFIED</span>) : <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#21262d', color: '#8b949e', fontWeight: 600 }}>DISABLED</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>{qItem.description}</div>
                        {statusInfo?.details && <div style={{ fontSize: '10px', color: hasIssue ? '#ff7b72' : '#7ee787', marginTop: '3px' }}>Live: {statusInfo.details}</div>}
                      </div>
                      <button type="button" onClick={() => handleToggleQualifier(qId)} style={{ background: qItem.enabled ? '#1f6feb22' : '#21262d', color: qItem.enabled ? '#58a6ff' : '#8b949e', border: `1px solid ${qItem.enabled ? '#1f6feb66' : '#30363d'}`, borderRadius: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', minWidth: '90px', justifyContent: 'center' }}>
                        {qItem.enabled ? <><Check size={12} color="#58a6ff" /><span>Enabled</span></> : <><X size={12} color="#8b949e" /><span>Disabled</span></>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 4: Node 3b Full Extracted Text Modal */}
      {isTextModalOpen && (
        <Modal
          isOpen={isTextModalOpen}
          onClose={() => setIsTextModalOpen(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="#58a6ff" />
              <span>DAG Node 3b: Local AI OCR Extracted Text</span>
            </div>
          }
          subtitle={`Extracted ${node3b.lines_count || 0} lines verbatim using ${node3b.model_used || 'MiniCPM-V (Ollama)'}`}
          confirmText="Copy to Clipboard"
          cancelText="Close"
          onConfirm={() => {
            if (node3b.extracted_text) {
              navigator.clipboard?.writeText(node3b.extracted_text);
              setCopiedText(true);
              setTimeout(() => setCopiedText(false), 2500);
            }
          }}
          maxWidth="700px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#8b949e' }}>
              <span>{node3b.lines_count || 0} lines detected • {node3b.char_count || 0} characters</span>
              {copiedText && <span style={{ color: '#00ff9d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> Copied to clipboard!</span>}
            </div>
            <pre style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '8px',
              padding: '12px',
              maxHeight: '380px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '11px',
              color: '#7ee787',
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              margin: 0,
              userSelect: 'text'
            }}>
              {node3b.extracted_text || 'No text extracted yet'}
            </pre>
          </div>
        </Modal>
      )}

    </div>
  );
};
