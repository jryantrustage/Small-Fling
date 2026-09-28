import React, { useState, useEffect } from 'react';
import {
  Activity, RefreshCw, Layers, Lock, Cpu, Settings, ShieldCheck, ShieldAlert,
  Sliders, ToggleLeft, ToggleRight, Check, X, Play, AlertTriangle,
  FileText, Move
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
    step: '3b',
    shortName: 'MiniCPM-V OCR',
    fullName: '3b. LOCAL AI OCR',
    subhead: 'MiniCPM-V Vision',
    desc: 'Extracts verbatim markdown & code lines using local MiniCPM-V multimodal vision model in Ollama.',
    group: 'capture_entire_markdown',
    accentColor: '#388bfd'
  },
  {
    id: 'frame_ocr',
    step: '4',
    shortName: 'OCR Extraction',
    fullName: '4. OCR EXTRACTION',
    subhead: 'Gutter & Line Reader',
    desc: 'Extracts gutter lines and text from captured frame.',
    group: 'capture_entire_markdown',
    accentColor: '#8957e5',
    hasConfig: true
  },
  {
    id: 'arrow_down',
    step: '5',
    shortName: 'Navigation',
    fullName: '5. NAVIGATION',
    subhead: 'Down Arrow (Next Top)',
    desc: 'Positions line next target top (prev bottom + 1) onto top gutter.',
    group: 'capture_entire_markdown',
    accentColor: '#ffa657'
  },
  {
    id: 'verification_trigger',
    step: '6',
    shortName: 'Verify Trigger',
    fullName: '6. VERIFY TRIGGER',
    subhead: 'Target Line Gutter Verification',
    desc: 'Verifies line is on top gutter and evaluates qualifiers before loopback flow.',
    group: 'capture_entire_markdown',
    accentColor: '#58a6ff',
    hasConfig: true
  }
];

const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  init_end: { x: 30, y: 70 },
  reset_home: { x: 195, y: 70 },
  frame_acquire: { x: 395, y: 70 },
  local_ai_ocr: { x: 560, y: 70 },
  frame_ocr: { x: 725, y: 70 },
  arrow_down: { x: 890, y: 70 },
  verification_trigger: { x: 1055, y: 70 },
};

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
      return msg.includes('local_ai') || msg.includes('rapidocr') || msg.includes('onnx') ||
             msg.includes('ai ocr') || msg.includes('node 3b') || msg.includes('verbatim');
    case 'frame_ocr':
      return msg.includes('frame_ocr') || msg.includes('gutter') || msg.includes('line reader') ||
             msg.includes('node 4') || (cat === 'OCR' && !msg.includes('local_ai'));
    case 'arrow_down':
      return msg.includes('arrow_down') || msg.includes('down arrow') || msg.includes('arrow') ||
             msg.includes('step') || msg.includes('pacer') || msg.includes('node 5') || cat === 'PACER';
    case 'verification_trigger':
      return msg.includes('verification_trigger') || msg.includes('qualifier') || msg.includes('trigger') ||
             msg.includes('loopback') || msg.includes('decision') || msg.includes('node 6');
    default:
      return true;
  }
};

export const FlowDag: React.FC<FlowDagProps> = ({
  apiBase, activeProjectId, activeDeviceSerial, currentTopLine = 1, currentBottomLine = 49,
  targetTotalLines = 0, currentPage = 1, isOrchestrating = false, onRefresh,
  selectedDag = 'all', onSelectDag, selectedNodeId, onSelectNodeId,
  projectInitProgress, onDismissInitProgress, onRetryInit, eventsLog = []
}) => {
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

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(DEFAULT_POSITIONS);
  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);

  // Drag interaction
  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    handleSelectNode(nodeId);
    e.preventDefault();
    setDraggingNode({
      id: nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: positions[nodeId]?.x ?? DEFAULT_POSITIONS[nodeId].x,
      startNodeY: positions[nodeId]?.y ?? DEFAULT_POSITIONS[nodeId].y,
    });
  };

  useEffect(() => {
    if (!draggingNode) return;
    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - draggingNode.startMouseX;
      const dy = e.clientY - draggingNode.startMouseY;
      setPositions(prev => ({
        ...prev,
        [draggingNode.id]: {
          x: Math.max(10, Math.min(1250, draggingNode.startNodeX + dx)),
          y: Math.max(10, Math.min(220, draggingNode.startNodeY + dy))
        }
      }));
    };
    const onMouseUp = () => {
      setDraggingNode(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingNode]);

  const handleResetLayout = () => {
    setPositions(DEFAULT_POSITIONS);
  };

  const [dagStatus, setDagStatus] = useState<DagStatusData>({
    active_node: 'node_1_end', target_total_lines: targetTotalLines,
    current_top_line: currentTopLine, current_bottom_line: currentBottomLine,
    current_page: currentPage, is_keyboard_guarded: true, arrow_step_count: 48,
    verification_trigger_fired: false, ocr_worker_active: true, ocr_latency_ms: 45
  });

  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [runningGroupId, setRunningGroupId] = useState<string | null>(null);
  const [nodeFeedback, setNodeFeedback] = useState<{ id: string; message: string; isError?: boolean } | null>(null);
  const [isRunningCalibration, setIsRunningCalibration] = useState(false);
  const [calibrationMsg, setCalibrationMsg] = useState('');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);
  const [showNode1Troubleshooting, setShowNode1Troubleshooting] = useState(true);
  const [isFixingNode1Focus, setIsFixingNode1Focus] = useState(false);
  const [isHidingKeyboard, setIsHidingKeyboard] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isAutoFixingViewport, setIsAutoFixingViewport] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const handleAutoFixViewport = async () => {
    setIsAutoFixingViewport(true);
    try {
      const res = await fetch(`${apiBase}/api/device/autofix-viewport`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        setIsKeyboardOpen(Boolean(d.keyboard_visible));
        setNodeFeedback({ id: 'autofix', message: 'Viewport auto-fixed & keyboard closed successfully ✔' });
      } else {
        setNodeFeedback({ id: 'autofix', message: d.detail || 'Failed to auto-fix viewport', isError: true });
      }
    } catch (e: any) {
      setNodeFeedback({ id: 'autofix', message: `Error auto-fixing viewport: ${e.message}`, isError: true });
    } finally {
      setIsAutoFixingViewport(false);
    }
  };

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

  const parsedBottom = node4.bottom_line || effectiveBottom;
  const nextTargetTop = (parsedBottom && parsedBottom > 0)
    ? (parsedBottom + 1)
    : (node5.target_top_line || node6.target_top_line || 32);

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

  const handleTriggerCalibration = async () => {
    if (!activeProjectId) { setCalibrationMsg('No active project selected'); return; }
    setIsRunningCalibration(true);
    setCalibrationMsg('1. Dispatched Ctrl+End -> Server OCR detecting last line...');
    try {
      const endRes = await fetch(`${apiBase}/api/projects/${activeProjectId}/calibrate-end`, { method: 'POST' });
      const endData = await endRes.json();
      if (!endRes.ok) throw new Error(endData.detail || 'End calibration failed');
      const detected = endData.target_total_lines || endData.total_lines || 0;
      if (detected <= 0) {
        setCalibrationMsg('⚠️ Calibration warning: 0 lines detected at EOF. Ensure document is visible.');
        return;
      }
      setCalibrationMsg(`Last line: Ln ${detected}. Dispatched Ctrl+Home -> Verifying Line 1...`);
      const homeRes = await fetch(`${apiBase}/api/projects/${activeProjectId}/verify-home`, { method: 'POST' });
      const homeData = await homeRes.json();
      if (!homeRes.ok) throw new Error(homeData.detail || 'Home verification failed');
      setCalibrationMsg(`✔ Calibrated! Total: ${detected} Lines. Verified Line 1.`);
      onRefresh?.();
    } catch (err: any) { setCalibrationMsg(`Calibration error: ${err.message}`); }
    finally { setIsRunningCalibration(false); }
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

  const isCaptureGroupRunning = runningGroupId === 'capture_entire_markdown' || captureGroup.status === 'active' || isNode3Running || isNode3bRunning || isNode4Running || isNode5Running || isNode6Running || isOrchestrating;

  // Selected node item metadata
  const selectedNodeMeta = NODES_METADATA.find(n => n.id === activeSelectedNodeId) || NODES_METADATA[0];

  // Telemetry events filtered specifically for the selected node
  const nodeTelemetryEvents = eventsLog.filter(ev => filterNodeTelemetry(selectedNodeMeta.id, ev));

  // Determine node live status
  const getNodeLiveStatus = (id: string) => {
    switch (id) {
      case 'init_end':
        return {
          isRunning: isNode1Running,
          isError: isNode1Error,
          isDone: isNode1Calibrated,
          statusLabel: isNode1Running ? 'CALIBRATING' : (isNode1Calibrated ? 'CALIBRATED' : (isNode1Error ? 'FAILED' : 'NOT RUN')),
          metricLabel: isNode1Calibrated && node1TotalLines > 0 ? `${node1TotalLines} Lines` : (isNode1Error ? 'Page Stuck' : 'Auto Detect'),
          color: isNode1Error ? '#ff7b72' : (isNode1Calibrated ? '#00ff9d' : '#58a6ff')
        };
      case 'reset_home':
        return {
          isRunning: isNode2Running,
          isError: isNode2Error,
          isDone: isNode2Verified,
          statusLabel: isNode2Running ? 'VERIFYING' : (isNode2Verified ? 'VERIFIED' : (isNode2Error ? 'UNVERIFIED' : 'READY')),
          metricLabel: isNode2Verified ? 'Ln 1 at Top' : (isNode2Error ? 'Ln 1 Missing' : 'Line 1 Check'),
          color: isNode2Error ? '#ff7b72' : (isNode2Verified ? '#00ff9d' : '#a371f7')
        };
      case 'frame_acquire':
        return {
          isRunning: isNode3Running,
          isError: isNode3Error,
          isDone: isNode3Done,
          statusLabel: isNode3Running ? 'CAPTURING' : (isNode3Error ? 'FAILED' : (isNode3Done ? 'CAPTURED' : 'READY')),
          metricLabel: isNode3Done ? `Page ${node3.page || currentPage}` : 'Frame Grab',
          color: isNode3Error ? '#ff7b72' : (isNode3Done ? '#00ff9d' : '#00ff9d')
        };
      case 'local_ai_ocr':
        return {
          isRunning: isNode3bRunning,
          isError: isNode3bError,
          isDone: isNode3bDone,
          statusLabel: isNode3bRunning ? 'EXTRACTING' : (isNode3bError ? 'FAILED' : (isNode3bDone ? 'PARSED' : 'READY')),
          metricLabel: node3b.lines_count ? `${node3b.lines_count} lines` : 'MiniCPM-V',
          color: isNode3bError ? '#ff7b72' : (isNode3bDone ? '#00ff9d' : '#388bfd')
        };
      case 'frame_ocr':
        return {
          isRunning: isNode4Running,
          isError: isNode4Error,
          isDone: isNode4Done,
          statusLabel: isNode4Running ? 'READING' : (isNode4Error ? 'FAILED' : (isNode4Done ? 'PARSED' : 'READY')),
          metricLabel: node4.bottom_line ? `Ln ${node4.top_line || 1}→${node4.bottom_line}` : 'Gutter OCR',
          color: isNode4Error ? '#ff7b72' : (isNode4Done ? '#00ff9d' : '#8957e5')
        };
      case 'arrow_down':
        return {
          isRunning: isNode5Running,
          isError: false,
          isDone: isNode5Done,
          statusLabel: isNode5Running ? 'STEPPING' : (isNode5Done ? 'STEPPED' : 'READY'),
          metricLabel: `Target Ln ${nextTargetTop}`,
          color: '#ffa657'
        };
      case 'verification_trigger':
        return {
          isRunning: isNode6Running,
          isError: triggerDecision.prevented,
          isDone: isTriggerFired,
          statusLabel: isTriggerFired ? 'FIRED' : (triggerDecision.prevented ? 'PREVENTED' : 'PENDING'),
          metricLabel: isTriggerFired ? '100% Captured' : (triggerDecision.prevented ? 'Blocked ⛔' : `Ln ${nextTargetTop}`),
          color: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#ff7b72' : '#58a6ff')
        };
      default:
        return { isRunning: false, isError: false, isDone: false, statusLabel: 'IDLE', metricLabel: '', color: '#8b949e' };
    }
  };

  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '12px', padding: '14px', color: '#e6edf3', fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Top Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #21262d', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} color="#00ff9d" />
          <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '0.8px', color: '#00ff9d' }}>PAGINATION FLOW DAG</span>
          <span style={{ fontSize: '10px', background: '#161b22', border: '1px solid #30363d', padding: '2px 8px', borderRadius: '10px', color: '#8b949e' }}>
            Interactive Mini-Node Grid
          </span>
        </div>

        {/* DAG Selection Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>FILTER:</span>
          <button
            type="button"
            onClick={() => handleDagSelect('all')}
            style={{
              padding: '2px 8px', borderRadius: '5px',
              border: `1px solid ${effectiveSelectedDag === 'all' ? '#58a6ff' : '#30363d'}`,
              background: effectiveSelectedDag === 'all' ? 'rgba(88, 166, 255, 0.2)' : '#161b22',
              color: effectiveSelectedDag === 'all' ? '#58a6ff' : '#8b949e',
              fontSize: '10.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            All DAGs
          </button>
          <button
            type="button"
            onClick={() => handleDagSelect('initialize')}
            style={{
              padding: '2px 8px', borderRadius: '5px',
              border: `1px solid ${effectiveSelectedDag === 'initialize' ? '#58a6ff' : '#30363d'}`,
              background: effectiveSelectedDag === 'initialize' ? 'rgba(88, 166, 255, 0.2)' : '#161b22',
              color: effectiveSelectedDag === 'initialize' ? '#58a6ff' : '#8b949e',
              fontSize: '10.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            DAG 1: Initialize
          </button>
          <button
            type="button"
            onClick={() => handleDagSelect('capture_entire_markdown')}
            style={{
              padding: '2px 8px', borderRadius: '5px',
              border: `1px solid ${effectiveSelectedDag === 'capture_entire_markdown' ? '#00ff9d' : '#30363d'}`,
              background: effectiveSelectedDag === 'capture_entire_markdown' ? 'rgba(0, 255, 157, 0.2)' : '#161b22',
              color: effectiveSelectedDag === 'capture_entire_markdown' ? '#00ff9d' : '#8b949e',
              fontSize: '10.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            DAG 2: Capture
          </button>
        </div>

        {/* Toolbar action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
          <button
            type="button"
            onClick={handleResetLayout}
            title="Reset node positions to default neat arrangement"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px',
              background: '#21262d', border: '1px solid #30363d', borderRadius: '6px',
              color: '#8b949e', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer'
            }}
          >
            <Move size={11} />
            <span>Reset Grid</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Cpu size={13} color="#58a6ff" />
            <span style={{ color: '#8b949e' }}>OCR:</span>
            <span style={{ color: '#58a6ff', fontWeight: 700 }}>Fast Gutter</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Lock size={13} color={isKeyboardOpen ? '#f85149' : '#00ff9d'} />
            <span style={{ color: '#8b949e' }}>KEYBOARD:</span>
            <span style={{ color: isKeyboardOpen ? '#f85149' : '#00ff9d', fontWeight: 700 }}>
              {isKeyboardOpen ? 'OPEN' : 'CLOSED'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleAutoFixViewport}
            disabled={isAutoFixingViewport}
            title="Auto-Fix Viewport: close soft keyboard and reflow 1080p desktop layout"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '6px',
              background: isKeyboardOpen ? 'rgba(248, 81, 73, 0.2)' : 'rgba(56, 139, 253, 0.15)',
              border: `1px solid ${isKeyboardOpen ? '#f85149' : '#388bfd'}`,
              color: isKeyboardOpen ? '#ff7b72' : '#58a6ff',
              fontSize: '10.5px', fontWeight: 700, cursor: isAutoFixingViewport ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={11} className={isAutoFixingViewport ? 'spin' : ''} />
            <span>AUTO-FIX VIEWPORT</span>
          </button>
        </div>
      </div>

      {nodeFeedback && (
        <div style={{ margin: '0 0 12px 0', padding: '8px 12px', borderRadius: '6px', background: nodeFeedback.isError ? 'rgba(248, 81, 73, 0.15)' : 'rgba(0, 255, 157, 0.12)', border: `1px solid ${nodeFeedback.isError ? '#f8514966' : '#00ff9d55'}`, color: nodeFeedback.isError ? '#ff7b72' : '#00ff9d', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {nodeFeedback.isError ? <ShieldAlert size={14} /> : <Check size={14} />}
            <span style={{ fontWeight: 600 }}>{nodeFeedback.message}</span>
          </div>
          <button onClick={() => setNodeFeedback(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: '2px' }}><X size={12} /></button>
        </div>
      )}

      {/* INLINE INITIALIZATION PROGRESS CARD */}
      {projectInitProgress && projectInitProgress.active && (
        <div
          style={{
            margin: '0 0 14px 0',
            padding: '14px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(31, 111, 235, 0.15), rgba(13, 17, 23, 0.95))',
            border: `1.5px solid ${projectInitProgress.status === 'error' ? '#f85149' : (projectInitProgress.status === 'completed' ? '#00ff9d' : '#58a6ff')}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '6px',
                background: projectInitProgress.status === 'error' ? 'rgba(248, 81, 73, 0.2)' : (projectInitProgress.status === 'completed' ? 'rgba(0, 255, 157, 0.2)' : 'rgba(88, 166, 255, 0.2)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {projectInitProgress.status === 'running' && <RefreshCw size={14} className="spin" color="#58a6ff" />}
                {projectInitProgress.status === 'completed' && <Check size={15} color="#00ff9d" />}
                {projectInitProgress.status === 'error' && <AlertTriangle size={15} color="#ff7b72" />}
              </div>
              <div>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#f0f6fc' }}>
                  {projectInitProgress.status === 'completed' ? 'WORKSPACE INITIALIZED' : (projectInitProgress.status === 'error' ? 'INITIALIZATION HALTED' : 'INITIALIZING WORKSPACE')}
                </span>
                <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '10px', background: 'rgba(88, 166, 255, 0.15)', color: '#58a6ff' }}>
                  {projectInitProgress.percent}%
                </span>
                <div style={{ fontSize: '10.5px', color: '#8b949e', marginTop: '1px' }}>{projectInitProgress.stage}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {projectInitProgress.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => { onDismissInitProgress?.(); handleDagSelect('capture_entire_markdown'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', border: 'none', background: '#238636', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  <Check size={13} /><span>Start Capturing</span>
                </button>
              )}
              {projectInitProgress.status === 'error' && (
                <button
                  type="button"
                  onClick={() => onRetryInit?.()}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', border: 'none', background: '#1f6feb', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  <RefreshCw size={11} /><span>Retry Init</span>
                </button>
              )}
              <button type="button" onClick={() => onDismissInitProgress?.()} style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          </div>
          <div style={{ width: '100%', height: '6px', background: '#161b22', border: '1px solid #30363d', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${projectInitProgress.percent}%`, background: projectInitProgress.status === 'completed' ? '#00ff9d' : (projectInitProgress.status === 'error' ? '#f85149' : '#58a6ff'), transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* MAIN CONTAINER: CANVAS WITH GRID ON LEFT + INSPECTION SIDEBAR CARD ON RIGHT */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'stretch', minHeight: '330px' }}>
        
        {/* LEFT: GRID CANVAS */}
        <div className="dag-grid-canvas" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{ width: '1240px', height: '100%', minHeight: '305px', position: 'relative' }}>
            
            {/* Group 1 Background Region */}
            <div
              onClick={() => handleDagSelect('initialize')}
              style={{
                position: 'absolute',
                left: '16px', top: '16px', width: '345px', height: '255px',
                borderRadius: '10px',
                border: `1.5px dashed ${effectiveSelectedDag === 'initialize' ? '#58a6ff' : 'rgba(88, 166, 255, 0.25)'}`,
                background: effectiveSelectedDag === 'initialize' ? 'rgba(88, 166, 255, 0.06)' : 'rgba(15, 23, 42, 0.45)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                padding: '8px 10px',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#58a6ff', letterSpacing: '0.5px' }}>
                    DAG GROUP 1: INITIALIZE
                  </span>
                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: isInitGroupRunning ? 'rgba(163, 113, 247, 0.2)' : (isInitGroupCompleted ? 'rgba(0, 255, 157, 0.15)' : (isInitGroupError ? 'rgba(248, 81, 73, 0.15)' : '#30363d')), color: isInitGroupRunning ? '#a371f7' : (isInitGroupCompleted ? '#00ff9d' : (isInitGroupError ? '#ff7b72' : '#8b949e')), fontWeight: 800 }}>
                    {isInitGroupRunning ? 'INITIALIZING...' : (isInitGroupCompleted ? 'COMPLETED ✔' : (isInitGroupError ? 'ISSUE' : 'IDLE'))}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRunGroup('initialize'); }}
                  disabled={runningGroupId !== null || runningNodeId !== null}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 7px',
                    borderRadius: '4px', border: '1px solid rgba(88, 166, 255, 0.4)',
                    background: 'rgba(88, 166, 255, 0.15)', color: '#58a6ff',
                    fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {isInitGroupRunning ? <RefreshCw size={10} className="spin" /> : <Play size={10} />}
                  <span>{isInitGroupRunning ? 'Running...' : 'Run Group'}</span>
                </button>
              </div>
            </div>

            {/* Group 2 Background Region */}
            <div
              onClick={() => handleDagSelect('capture_entire_markdown')}
              style={{
                position: 'absolute',
                left: '375px', top: '16px', width: '845px', height: '255px',
                borderRadius: '10px',
                border: `1.5px dashed ${effectiveSelectedDag === 'capture_entire_markdown' ? '#00ff9d' : 'rgba(0, 255, 157, 0.25)'}`,
                background: effectiveSelectedDag === 'capture_entire_markdown' ? 'rgba(0, 255, 157, 0.05)' : 'rgba(15, 23, 42, 0.45)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                padding: '8px 10px',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#00ff9d', letterSpacing: '0.5px' }}>
                  DAG GROUP 2: CAPTURE ENTIRE MARKDOWN
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRunGroup('capture_entire_markdown'); }}
                  disabled={runningGroupId !== null || runningNodeId !== null}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 7px',
                    borderRadius: '4px', border: '1px solid rgba(0, 255, 157, 0.4)',
                    background: 'rgba(0, 255, 157, 0.15)', color: '#00ff9d',
                    fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {isCaptureGroupRunning ? <RefreshCw size={10} className="spin" /> : <Play size={10} />}
                  <span>{isCaptureGroupRunning ? 'Capturing...' : 'Run Cycle'}</span>
                </button>
              </div>
            </div>

            {/* DYNAMIC SVG CONNECTORS LAYER */}
            <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <marker id="dag-arrowhead-blue" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill="#58a6ff" />
                </marker>
                <marker id="dag-arrowhead-green" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill="#00ff9d" />
                </marker>
                <marker id="dag-arrowhead-loop" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill="#58a6ff" />
                </marker>
              </defs>

              {/* Sequential connecting bezier paths */}
              {NODES_METADATA.slice(0, -1).map((nodeA, idx) => {
                const nodeB = NODES_METADATA[idx + 1];
                const posA = positions[nodeA.id] || DEFAULT_POSITIONS[nodeA.id];
                const posB = positions[nodeB.id] || DEFAULT_POSITIONS[nodeB.id];
                const x1 = posA.x + 142;
                const y1 = posA.y + 37;
                const x2 = posB.x;
                const y2 = posB.y + 37;
                const dx = Math.abs(x2 - x1) * 0.5;
                const pathD = x2 >= x1
                  ? `M ${x1} ${y1} C ${x1 + Math.max(25, dx)} ${y1}, ${x2 - Math.max(25, dx)} ${y2}, ${x2} ${y2}`
                  : `M ${x1} ${y1} C ${x1 + 40} ${y1 + 40}, ${x2 - 40} ${y2 - 40}, ${x2} ${y2}`;
                
                const isConnectionActive = (runningNodeId === nodeA.id || runningNodeId === nodeB.id) ||
                  (nodeA.group === 'capture_entire_markdown' && isCaptureGroupRunning) ||
                  (nodeA.group === 'initialize' && isInitGroupRunning);
                const strokeColor = nodeB.group === 'initialize' ? '#58a6ff' : (idx === 1 ? '#00ff9d' : '#00ff9d');

                return (
                  <path
                    key={`${nodeA.id}->${nodeB.id}`}
                    d={pathD}
                    className={`dag-wire ${isConnectionActive ? 'dag-wire-active' : ''}`}
                    stroke={strokeColor}
                    strokeOpacity={isConnectionActive ? 1 : 0.65}
                    markerEnd={`url(#dag-arrowhead-${strokeColor === '#00ff9d' ? 'green' : 'blue'})`}
                  />
                );
              })}

              {/* Loopback Curve: Node 6 (verification_trigger) -> Node 3 (frame_acquire) */}
              {(() => {
                const node6Pos = positions['verification_trigger'] || DEFAULT_POSITIONS['verification_trigger'];
                const node3Pos = positions['frame_acquire'] || DEFAULT_POSITIONS['frame_acquire'];
                const startX = node6Pos.x + 71;
                const startY = node6Pos.y + 74;
                const endX = node3Pos.x + 71;
                const endY = node3Pos.y + 74;
                const loopPath = `M ${startX} ${startY} C ${startX} ${startY + 45}, ${endX} ${endY + 45}, ${endX} ${endY}`;
                return (
                  <g>
                    <path
                      d={loopPath}
                      fill="none"
                      stroke={triggerDecision.prevented ? '#f85149' : '#58a6ff'}
                      strokeWidth="2"
                      strokeDasharray="5 3"
                      className={isCaptureGroupRunning ? 'dag-wire-active' : ''}
                      markerEnd="url(#dag-arrowhead-loop)"
                    />
                    <text
                      x={(startX + endX) / 2}
                      y={Math.max(startY, endY) + 38}
                      fill={triggerDecision.prevented ? '#ff7b72' : '#58a6ff'}
                      fontSize="9.5"
                      fontFamily="var(--font-mono, monospace)"
                      textAnchor="middle"
                      fontWeight="700"
                    >
                      {triggerDecision.prevented ? '⛔ Blocked' : `↺ Loopback to Step 3 (Next Top: Ln ${nextTargetTop})`}
                    </text>
                  </g>
                );
              })()}
            </svg>

            {/* THE 7 MINIATURE DAG NODES */}
            {NODES_METADATA.map((node) => {
              const pos = positions[node.id] || DEFAULT_POSITIONS[node.id];
              const isSelected = activeSelectedNodeId === node.id;
              const isDraggingThis = draggingNode?.id === node.id;
              const status = getNodeLiveStatus(node.id);

              return (
                <div
                  key={node.id}
                  className={`dag-mini-node ${isSelected ? 'selected' : ''} ${isDraggingThis ? 'dragging' : ''}`}
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    borderColor: isSelected ? node.accentColor : (status.isDone ? '#238636' : (status.isError ? '#f85149' : '#30363d')),
                    boxShadow: isSelected
                      ? `0 0 16px ${node.accentColor}66, 0 4px 14px rgba(0,0,0,0.7)`
                      : (status.isRunning ? `0 0 12px ${node.accentColor}44` : '0 4px 12px rgba(0,0,0,0.45)')
                  }}
                  onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                  title={`Click to inspect details. Drag to reposition on grid.`}
                >
                  {/* Top Bar of Miniature Node */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span
                        className="dag-mini-node-badge"
                        style={{
                          background: `${node.accentColor}22`,
                          color: node.accentColor,
                          border: `1px solid ${node.accentColor}55`
                        }}
                      >
                        {node.step}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#f0f6fc', letterSpacing: '0.2px' }}>
                        {node.shortName}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {status.isRunning ? (
                        <RefreshCw size={11} className="spin" color={node.accentColor} />
                      ) : (
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: status.color,
                            boxShadow: `0 0 6px ${status.color}`
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Middle Subhead */}
                  <div style={{ fontSize: '9px', color: '#8b949e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {node.subhead}
                  </div>

                  {/* Bottom Line / Live Metric Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: status.color }}>
                      {status.metricLabel}
                    </span>

                    {isSelected ? (
                      <span style={{ fontSize: '8px', color: '#58a6ff', display: 'flex', alignItems: 'center', gap: '2px', opacity: 0.85 }}>
                        <Move size={8} /> Drag
                      </span>
                    ) : (
                      <span style={{ fontSize: '8.5px', color: '#6e7681' }}>
                        {status.statusLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

          </div>
        </div>

        {/* RIGHT: INSPECTION SIDEBAR CARD (SHOWS ALL INFORMATION DETAILS & NODE PROCESS TELEMETRY) */}
        <div className="dag-sidebar-card" style={{ display: 'flex', flexDirection: 'column' }}>
          
          {/* Sidebar Header */}
          <div style={{ padding: '12px 14px', background: '#1c2128', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  background: `${selectedNodeMeta.accentColor}25`,
                  color: selectedNodeMeta.accentColor,
                  border: `1px solid ${selectedNodeMeta.accentColor}55`,
                  padding: '2px 7px',
                  borderRadius: '6px'
                }}
              >
                NODE {selectedNodeMeta.step}
              </span>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#f0f6fc' }}>
                  {selectedNodeMeta.shortName}
                </div>
                <div style={{ fontSize: '9.5px', color: '#8b949e' }}>
                  {selectedNodeMeta.group === 'initialize' ? 'Group 1: Initialize' : 'Group 2: Capture'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {selectedNodeMeta.hasConfig && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedNodeMeta.id === 'frame_acquire') setIsNode3ConfigOpen(true);
                    if (selectedNodeMeta.id === 'frame_ocr') setIsNode4ConfigOpen(true);
                    if (selectedNodeMeta.id === 'verification_trigger') setIsConfigModalOpen(true);
                  }}
                  title="Configure Node Parameters"
                  style={{
                    background: '#21262d', border: '1px solid #30363d', color: '#58a6ff',
                    padding: '3px 6px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center'
                  }}
                >
                  <Settings size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Sidebar Body (Scrollable details card) */}
          <div style={{ padding: '12px 14px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {/* Quick Action Button for Selected Node */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleRunNode(selectedNodeMeta.id)}
                disabled={runningNodeId !== null}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${selectedNodeMeta.accentColor}66`,
                  background: `${selectedNodeMeta.accentColor}18`,
                  color: selectedNodeMeta.accentColor,
                  fontSize: '11px',
                  fontWeight: 800,
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

            {/* Description & Objective */}
            <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '6px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#8b949e', marginBottom: '2px' }}>OPERATION / PURPOSE</div>
              <div style={{ fontSize: '11px', color: '#c9d1d9', lineHeight: 1.4 }}>
                {selectedNodeMeta.desc}
              </div>
            </div>

            {/* Node-Specific Details & Diagnostic Information */}
            {selectedNodeMeta.id === 'init_end' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Calibrated Total Lines:</span>
                  <span style={{ fontWeight: 800, color: node1TotalLines > 0 ? '#00ff9d' : '#8b949e' }}>
                    {node1TotalLines > 0 ? `${node1TotalLines.toLocaleString()} Lines` : 'Not Calibrated'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>EOF Gutter Verification:</span>
                  <span style={{ fontWeight: 700, color: isNode1Calibrated ? '#00ff9d' : (isNode1Error ? '#ff7b72' : '#8b949e') }}>
                    {isNode1Calibrated ? 'Verified at EOF' : (isNode1Error ? 'Failed (Line 1)' : 'Pending')}
                  </span>
                </div>

                {isNode1Error && (
                  <div style={{ background: 'rgba(248, 81, 73, 0.08)', border: '1px solid rgba(248, 81, 73, 0.3)', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#f85149', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={12} /> Page did not move to EOF
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowNode1Troubleshooting(!showNode1Troubleshooting)}
                        style={{ background: 'transparent', border: 'none', color: '#58a6ff', fontSize: '9.5px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {showNode1Troubleshooting ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {showNode1Troubleshooting && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9.5px', color: '#c9d1d9' }}>
                        <div>1. <strong>Editor Focus:</strong> Tap in markdown document to focus blinking cursor.</div>
                        <div>2. <strong>Soft Keyboard:</strong> Suppress on-screen IME keyboard.</div>
                        <div>3. <strong>Desktop Mode:</strong> Verify Teams editor visible on external screen.</div>
                      </div>
                    )}

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
                        style={{ flex: 1, padding: '4px 6px', background: '#21262d', border: '1px solid #30363d', color: '#58a6ff', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer' }}
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
                        style={{ flex: 1, padding: '4px 6px', background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {isHidingKeyboard ? 'Closing...' : 'Hide Keyboard'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedNodeMeta.id === 'reset_home' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Top Gutter Verified:</span>
                  <span style={{ fontWeight: 800, color: isNode2Verified ? '#00ff9d' : (isNode2Error ? '#ff7b72' : '#8b949e') }}>
                    {isNode2Verified ? 'Verified: Line 1' : (isNode2Error ? 'Failed: Line 1 Missing' : 'Awaiting Test')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Detected First Line:</span>
                  <span style={{ fontWeight: 700, color: '#f0f6fc' }}>
                    {node2.first_line ? `Ln ${node2.first_line}` : 'Line 1'}
                  </span>
                </div>
              </div>
            )}

            {selectedNodeMeta.id === 'frame_acquire' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Current Page:</span>
                  <span style={{ fontWeight: 800, color: '#00ff9d' }}>Page #{node3.page || currentPage}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Settle Delay:</span>
                  <span style={{ fontWeight: 700, color: '#f0f6fc' }}>{node3Config.settle_delay_ms} ms</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Keyboard Guard:</span>
                  <span style={{ fontWeight: 700, color: node3Config.guard_keyboard ? '#00ff9d' : '#8b949e' }}>
                    {node3Config.guard_keyboard ? 'ACTIVE' : 'OFF'}
                  </span>
                </div>
              </div>
            )}

            {selectedNodeMeta.id === 'local_ai_ocr' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Model Engine:</span>
                  <span style={{ fontWeight: 800, color: '#00ff9d' }}>{node3b.model_used || 'MiniCPM-V (Ollama)'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Extracted Lines / Chars:</span>
                  <span style={{ fontWeight: 700, color: '#f0f6fc' }}>{node3b.lines_count || 0} lines • {node3b.char_count || 0} chars</span>
                </div>
                {node3b.extracted_text && (
                  <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '6px', padding: '6px 8px', maxHeight: '70px', overflowY: 'auto', fontSize: '9px', color: '#7ee787', whiteSpace: 'pre-wrap' }}>
                    {node3b.extracted_text}
                  </div>
                )}
              </div>
            )}

            {selectedNodeMeta.id === 'frame_ocr' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Gutter Bounds:</span>
                  <span style={{ fontWeight: 800, color: '#a371f7' }}>
                    Ln {node4.top_line || effectiveTop} → Ln {node4.bottom_line || effectiveBottom}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Detected Lines Count:</span>
                  <span style={{ fontWeight: 700, color: '#f0f6fc' }}>{node4.extracted_line_count || (effectiveBottom - effectiveTop + 1)} lines</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>OCR Engine:</span>
                  <span style={{ fontWeight: 700, color: '#58a6ff' }}>{node4Config.engine}</span>
                </div>
              </div>
            )}

            {selectedNodeMeta.id === 'arrow_down' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Next Target Top Line:</span>
                  <span style={{ fontWeight: 800, color: '#00ff9d' }}>Ln {nextTargetTop}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Arrow Down Key Steps:</span>
                  <span style={{ fontWeight: 700, color: '#ffa657' }}>
                    {node5.arrow_count || Math.max(1, nextTargetTop - (node4.top_line || effectiveTop || 1))} steps
                  </span>
                </div>
              </div>
            )}

            {selectedNodeMeta.id === 'verification_trigger' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Trigger Decision:</span>
                  <span style={{ fontWeight: 800, color: triggerDecision.prevented ? '#ff7b72' : '#00ff9d' }}>
                    {triggerDecision.prevented ? 'PREVENTED ⛔' : 'ALLOWED ✔'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#0d1117', borderRadius: '4px', border: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>Verification Gutter:</span>
                  <span style={{ fontWeight: 700, color: '#58a6ff' }}>Target Ln {nextTargetTop}</span>
                </div>
                {triggerDecision.prevented && triggerDecision.reasons?.length > 0 && (
                  <div style={{ background: 'rgba(248, 81, 73, 0.1)', border: '1px solid rgba(248, 81, 73, 0.3)', borderRadius: '4px', padding: '6px 8px', color: '#ff7b72', fontSize: '9.5px' }}>
                    <strong>Blocking Reason:</strong> {triggerDecision.reasons[0]}
                  </div>
                )}
              </div>
            )}

            {/* PROCESS TRACING TELEMETRY TOASTER (SPECIFIC FOR SELECTED NODE) */}
            <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #21262d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={12} color={selectedNodeMeta.accentColor} />
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#f0f6fc', letterSpacing: '0.4px' }}>
                    PROCESS TRACING TELEMETRY
                  </span>
                </div>
                <span style={{ fontSize: '9px', background: '#0d1117', border: '1px solid #21262d', padding: '1px 5px', borderRadius: '3px', color: selectedNodeMeta.accentColor, fontWeight: 700 }}>
                  {nodeTelemetryEvents.length} events
                </span>
              </div>

              {/* Live Toaster Stream for Selected Node */}
              <div className="dag-toaster-card-stream">
                {nodeTelemetryEvents.length === 0 ? (
                  <div style={{ color: '#6e7681', fontSize: '10px', padding: '8px', textAlign: 'center' }}>
                    No telemetry trace events for Node {selectedNodeMeta.step} yet.
                    <div style={{ marginTop: '3px', fontSize: '9px', color: '#8b949e' }}>
                      Press "Run Node {selectedNodeMeta.step}" above to record real-time execution.
                    </div>
                  </div>
                ) : (
                  nodeTelemetryEvents.slice(-6).map(ev => (
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
        </div>

      </div>

      {/* FOOTER BAR: OVERALL PROGRESS & CALIBRATION SHORTCUT */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #21262d', gap: '12px' }}>
        <div style={{ fontSize: '11px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={14} color="#00ff9d" />
          <span>Actuator Progress:</span>
          <strong style={{ color: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#ff7b72' : '#ffa657') }}>
            {isTriggerFired
              ? `✔ All ${effectiveTotal} lines captured!`
              : (triggerDecision.prevented
                  ? `⛔ Trigger Prevented (${triggerDecision.reasons.length} issue(s))`
                  : `Capturing page ${currentPage} (Target Top: Ln ${nextTargetTop} of ${effectiveTotal || '?'})`)}
          </strong>
          {calibrationMsg && <span style={{ color: '#58a6ff', marginLeft: '8px' }}>{calibrationMsg}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsConfigModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: '#21262d', color: '#58a6ff', border: '1px solid #30363d', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Sliders size={12} /><span>Configure Trigger (Node 6)</span>
          </button>
          <button
            onClick={handleTriggerCalibration}
            disabled={isRunningCalibration}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', background: isRunningCalibration ? '#21262d' : '#1f6feb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: isRunningCalibration ? 'wait' : 'pointer', fontFamily: 'inherit' }}
          >
            <RefreshCw size={11} className={isRunningCalibration ? 'spin' : ''} /><span>{isRunningCalibration ? 'Calibrating...' : 'Run Ctrl+End / Ctrl+Home Calibrate'}</span>
          </button>
        </div>
      </div>

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
