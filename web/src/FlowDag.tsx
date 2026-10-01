import React, { useState, useEffect } from 'react';
import {
  Activity, RefreshCw, Layers, Lock, Settings, ShieldCheck, ShieldAlert,
  ToggleLeft, ToggleRight, Check, X, Play, AlertTriangle,
  FileText, Move, Clock, Minus, Maximize2, Minimize2, Zap, Square, Copy,
  ExternalLink, Download, Sparkles
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

export interface PerformanceDiagnosis {
  nodeId: string;
  title: string;
  category: 'HEALTHY' | 'AUTO_HEALING_CHURN' | 'OCR_BOTTLENECK' | 'ADB_SCREENSHOT_OVERHEAD' | 'PRECHECK_BLOCKING' | 'VIEWPORT_SCROLL_LAG' | 'UNRESOLVED_ERROR';
  severity: 'healthy' | 'warning' | 'critical';
  summary: string;
  evidence: string[];
  remediations: string[];
  metrics: {
    duration_ms: number;
    precheck_ms: number;
    action_ms: number;
    healing_ms: number;
    ocr_latency_ms: number;
    capture_rtt_ms: number;
    precheck_pct: number;
    action_pct: number;
    healing_pct: number;
  };
  markdown_prompt: string;
  promptDataUri: string;
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
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  // Performance Diagnostics & AI Resolution Prompt State
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptModalNodeId, setPromptModalNodeId] = useState<string>('init_end');
  const [promptActiveTab, setPromptActiveTab] = useState<'formatted' | 'raw'>('formatted');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [serverDiagnosisCache, setServerDiagnosisCache] = useState<Record<string, PerformanceDiagnosis>>({});

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
      keyboard_open: { name: 'Virtual Keyboard Check', description: 'Is software keyboard active or covering content?', enabled: true, severity: 'warning' },
      edit_mode: { name: 'Edit Mode Qualifier', description: 'Ensure editor is in single-pane edit mode (avoid split screen duplicated text)', enabled: true, severity: 'blocking' },
      light_mode: { name: 'Theme Qualifier', description: 'Ensure editor is in dark mode', enabled: true, severity: 'blocking' },
      view_mode: { name: 'Legacy View Qualifier', description: 'Ensure document in single edit pane with gutter lines visible', enabled: false, severity: 'warning' }
    }
  });

  const [triggerDecision, setTriggerDecision] = useState<TriggerDecisionState>({ allowed: true, prevented: false, reasons: [] });
  const [pinnedHoverNodeId, setPinnedHoverNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [dismissedNode7Diagnostic, setDismissedNode7Diagnostic] = useState(false);
  const [isFixingQualifier, setIsFixingQualifier] = useState(false);

  const handleAutoFixKeyboardAndUnblock = async () => {
    setIsFixingQualifier(true);
    try {
      await fetch(`${apiBase}/api/device/autofix-viewport`, { method: 'POST' });
      await fetch(`${apiBase}/api/classifiers/fix/keyboard_open`, { method: 'POST' });
      const res = await fetch(`${apiBase}/api/dag/nodes/verification_trigger/evaluate`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        if (d.trigger_decision) setTriggerDecision(d.trigger_decision);
      }
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
      const updatedQualifiers = {
        ...node5Config.qualifiers,
        keyboard_open: { ...node5Config.qualifiers.keyboard_open, enabled: false }
      };
      const res = await fetch(`${apiBase}/api/dag/nodes/verification_trigger/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualifiers: updatedQualifiers })
      });
      if (res.ok) {
        const d = await res.json();
        setNode5Config(prev => ({ ...prev, qualifiers: updatedQualifiers }));
        if (d.trigger_decision) setTriggerDecision(d.trigger_decision);
        setNodeFeedback({ id: 'verification_trigger', message: 'Bypassed Virtual Keyboard qualifier ✔' });
      }
    } catch {
      setNodeFeedback({ id: 'verification_trigger', message: 'Failed to bypass qualifier', isError: true });
    } finally {
      setIsFixingQualifier(false);
    }
  };

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

  const currentActiveNode = dagStatus.dag?.current_active_node || dagStatus.active_node || null;
  const activeNodeObj = currentActiveNode ? dagStatus.dag?.nodes?.[currentActiveNode] : null;
  const isCurrentNodeReallyActive = Boolean(
    activeNodeObj && (activeNodeObj.status === 'active' || activeNodeObj.is_active === true)
  );
  const activeRunningId = runningNodeId || (isCurrentNodeReallyActive ? currentActiveNode : null);

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

  const handleAbortNode = async (nodeId?: string) => {
    try {
      const url = nodeId ? `${apiBase}/api/dag/nodes/${nodeId}/abort` : `${apiBase}/api/dag/nodes/abort`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      setRunningNodeId(null);
      setNodeFeedback({ id: nodeId || 'abort', message: data.message || 'Operation aborted ⏹' });
      const statusRes = await fetch(`${apiBase}/api/dag/status`);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setDagStatus(prev => ({ ...prev, ...d }));
      }
      onRefresh?.();
      setTimeout(() => setNodeFeedback(null), 4000);
    } catch (err: any) {
      setNodeFeedback({ id: nodeId || 'abort', message: `Abort error: ${err.message}`, isError: true });
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

  // Accurate node metrics & statuses (Strict Single-Node Concurrency)
  const isNode1Running = activeRunningId === 'init_end';
  const isNode1Error = node1.status === 'error' || Boolean(node1.error);
  const isNode1Calibrated = !isNode1Error && node1.status === 'completed' && (node1.total_lines || 0) > 0;
  const node1TotalLines = isNode1Calibrated ? (node1.total_lines || 0) : 0;

  const isNode2Running = activeRunningId === 'reset_home';
  const isNode2Verified = node2.status === 'completed' && Boolean(node2.verified);
  const isNode2Error = node2.status === 'error' || (node2.status === 'completed' && !node2.verified);

  const isInitGroupRunning = runningGroupId === 'initialize' || initGroup.status === 'active' || isNode1Running || isNode2Running || (projectInitProgress?.active && projectInitProgress.status === 'running');
  const isInitGroupCompleted = !isInitGroupRunning && (initGroup.status === 'completed' || (isNode1Calibrated && isNode2Verified) || projectInitProgress?.status === 'completed');
  const isInitGroupError = !isInitGroupRunning && (initGroup.status === 'error' || isNode1Error || projectInitProgress?.status === 'error');

  const isNode3Running = activeRunningId === 'frame_acquire';
  const isNode3Error = node3.status === 'error' || Boolean(node3.error);
  const isNode3Done = !isNode3Error && node3.status === 'completed';

  const isNode4Running = activeRunningId === 'frame_ocr';
  const isNode4Error = node4.status === 'error' || Boolean(node4.error);
  const isNode4Done = !isNode4Error && node4.status === 'completed';

  const isNode3bRunning = activeRunningId === 'local_ai_ocr';
  const isNode3bError = node3b.status === 'error' || Boolean(node3b.error);
  const isNode3bDone = !isNode3bError && (node3b.status === 'completed' || Boolean(node3b.extracted_text) || isNode4Done);

  const isNode5Running = activeRunningId === 'arrow_down';
  const isNode5Done = node5.status === 'completed';

  const isNode6Running = activeRunningId === 'verification_trigger';

  const isNode8Running = activeRunningId === 'document_assemble';
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
    const isThisActive = activeRunningId === id;
    const healingStep = nodeData.healing_step || null;
    const evaluator = nodeData.evaluator || null;
    const telemetryInsight = nodeData.telemetry_insight || null;
    const timings = nodeData.timings || null;
    const dagContext = nodeData.dag_context || null;
    const traceInsights = Array.isArray(nodeData.trace_insights) ? nodeData.trace_insights : null;
    const nodeError = nodeData.error || null;

    const attachMeta = <T extends Record<string, any>>(obj: T) => ({
      ...obj,
      timings,
      dagContext,
      traceInsights,
      nodeError,
      isError: obj.isError || Boolean(nodeData.status === 'error' || nodeData.error)
    });

    const getRawStatus = () => {
      if (nodeData.status === 'aborted') {
        return {
          isRunning: false,
          isActive: false,
          isError: true,
          isAborted: true,
          isDone: false,
          statusLabel: 'ABORTED',
          metricLabel: nodeData.error ? 'Aborted ⏹' : 'Aborted',
          evaluator: evaluator || 'Abort Evaluator',
          healingStep: null,
          telemetryInsight: 'Execution aborted by user',
          color: '#e3b341',
          startedAt,
          finishedAt,
          durationMs
        };
      }

      switch (id) {
      case 'init_end': {
        const isRunning = isThisActive;
        let metricLabel = 'Auto Detect';
        if (isNode1Calibrated && node1TotalLines > 0) {
          metricLabel = `${node1TotalLines.toLocaleString()} Lines`;
        } else if (healingStep) {
          metricLabel = healingStep;
        } else if (isNode1Error) {
          metricLabel = evaluator || 'Refreshing Capture';
        } else if (isRunning) {
          metricLabel = healingStep || 'Refreshing Capture';
        }

        const statusLabel = isRunning
          ? (healingStep ? 'HEALING' : 'CALIBRATING')
          : (isNode1Calibrated ? 'CALIBRATED' : (isNode1Error ? (healingStep ? 'HEALING' : 'EVALUATED') : 'NOT RUN'));

        return {
          isRunning,
          isActive: isRunning,
          isError: isNode1Error && !healingStep,
          isDone: isNode1Calibrated,
          statusLabel,
          metricLabel,
          evaluator: evaluator || 'EOF Gutter Evaluator',
          healingStep: healingStep || (isNode1Error ? 'Refreshing page capture' : null),
          telemetryInsight: telemetryInsight || (isNode1Calibrated ? `EOF calibrated: ${node1TotalLines.toLocaleString()} lines` : (isNode1Error ? 'Refreshing page capture & retrying EOF jump' : 'Determining total lines via Ctrl+End')),
          color: isNode1Error ? (healingStep ? '#ffa657' : '#ff7b72') : (isNode1Calibrated ? '#00ff9d' : '#58a6ff'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'reset_home': {
        const isRunning = isThisActive;
        let metricLabel = 'Line 1 Check';
        if (isNode2Verified) {
          metricLabel = 'Ln 1 Verified';
        } else if (healingStep) {
          metricLabel = healingStep;
        } else if (isNode2Error) {
          metricLabel = evaluator || 'Refreshing Capture';
        } else if (isRunning) {
          metricLabel = healingStep || 'Verifying Ln 1';
        }

        const statusLabel = isRunning
          ? (healingStep ? 'HEALING' : 'VERIFYING')
          : (isNode2Verified ? 'VERIFIED' : (isNode2Error ? (healingStep ? 'HEALING' : 'EVALUATED') : 'READY'));

        return {
          isRunning,
          isActive: isRunning,
          isError: isNode2Error && !healingStep,
          isDone: isNode2Verified,
          statusLabel,
          metricLabel,
          evaluator: evaluator || 'Line 1 Gutter Evaluator',
          healingStep: healingStep || (isNode2Error ? 'Refreshing page capture' : null),
          telemetryInsight: telemetryInsight || (isNode2Verified ? 'Line 1 verified at top gutter' : (isNode2Error ? 'Top line unverified • refreshing capture' : 'Verifying line 1 position after Ctrl+Home')),
          color: isNode2Error ? (healingStep ? '#ffa657' : '#ff7b72') : (isNode2Verified ? '#00ff9d' : '#a371f7'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'frame_acquire': {
        const isRunning = isThisActive;
        let metricLabel = isNode3Done
          ? (node3.duration_ms ? `Page ${node3.page || currentPage} (${node3.duration_ms}ms)` : `Page ${node3.page || currentPage}`)
          : (healingStep || (isRunning ? 'Refreshing Capture' : 'Frame Grab'));
        if (isNode3Error) {
          metricLabel = healingStep || evaluator || 'Capture Retry';
        }

        return {
          isRunning,
          isActive: isRunning,
          isError: isNode3Error && !healingStep,
          isDone: isNode3Done,
          statusLabel: isRunning ? (healingStep ? 'HEALING' : 'CAPTURING') : (isNode3Error ? 'FAILED' : (isNode3Done ? 'CAPTURED' : 'READY')),
          metricLabel,
          evaluator: evaluator || 'Display Frame Evaluator',
          healingStep: healingStep || (isNode3Error ? 'Refreshing page capture' : null),
          telemetryInsight: telemetryInsight || (isNode3Done ? `Page ${node3.page || currentPage} frame acquired` : 'Capturing external display frame'),
          color: isNode3Error ? (healingStep ? '#ffa657' : '#ff7b72') : (isNode3Done ? '#00ff9d' : '#00ff9d'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'local_ai_ocr': {
        const isRunning = isThisActive;
        let metricLabel = node3b.lines_count ? `${node3b.lines_count} lines` : (healingStep || (isRunning ? 'Vision Extract' : 'MiniCPM-V'));
        if (isNode3bError) metricLabel = healingStep || evaluator || 'Vision Retry';

        return {
          isRunning,
          isActive: isRunning,
          isError: isNode3bError && !healingStep,
          isDone: isNode3bDone,
          statusLabel: isRunning ? 'EXTRACTING' : (isNode3bError ? 'FAILED' : (isNode3bDone ? 'PARSED' : 'READY')),
          metricLabel,
          evaluator: evaluator || 'Vision Model Evaluator',
          healingStep,
          telemetryInsight: telemetryInsight || (isNode3bDone ? `Extracted ${node3b.lines_count} lines verbatim` : 'Multimodal code extraction via MiniCPM-V'),
          color: isNode3bError ? (healingStep ? '#ffa657' : '#ff7b72') : (isNode3bDone ? '#00ff9d' : '#388bfd'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'frame_ocr': {
        const isRunning = isThisActive;
        let metricLabel = node4.bottom_line ? `Ln ${node4.top_line || 1}→${node4.bottom_line}` : (healingStep || (isRunning ? 'Gutter OCR' : 'Gutter OCR'));
        if (isNode4Error) metricLabel = healingStep || evaluator || 'OCR Retry';

        return {
          isRunning,
          isActive: isRunning,
          isError: isNode4Error && !healingStep,
          isDone: isNode4Done,
          statusLabel: isRunning ? 'READING' : (isNode4Error ? 'FAILED' : (isNode4Done ? 'PARSED' : 'READY')),
          metricLabel,
          evaluator: evaluator || 'RapidOCR Gutter Evaluator',
          healingStep,
          telemetryInsight: telemetryInsight || (isNode4Done ? `Gutter bounds: Ln ${node4.top_line || 1}→${node4.bottom_line}` : 'Extracting line numbers from gutter column'),
          color: isNode4Error ? (healingStep ? '#ffa657' : '#ff7b72') : (isNode4Done ? '#00ff9d' : '#8957e5'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'arrow_down': {
        const isRunning = isThisActive;
        const metricLabel = healingStep || `Target Ln ${nextTargetTop}`;
        return {
          isRunning,
          isActive: isRunning,
          isError: false,
          isDone: isNode5Done,
          statusLabel: isRunning ? (healingStep ? 'PACING' : 'STEPPING') : (isNode5Done ? 'STEPPED' : 'READY'),
          metricLabel,
          evaluator: evaluator || 'Pacing & Alignment Evaluator',
          healingStep,
          telemetryInsight: telemetryInsight || `Viewport stepped down to target Line ${nextTargetTop}`,
          color: '#ffa657',
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'verification_trigger': {
        const isRunning = isThisActive;
        const metricLabel = isRunning ? (healingStep || 'Evaluating...') : (isTriggerFired ? '100% Captured' : (triggerDecision.prevented ? (healingStep || 'Blocked ⛔') : `Ln ${nextTargetTop}`));
        return {
          isRunning,
          isActive: isRunning,
          isError: triggerDecision.prevented && !healingStep,
          isDone: isTriggerFired,
          statusLabel: isRunning ? 'VERIFYING' : (isTriggerFired ? 'FIRED' : (triggerDecision.prevented ? 'PREVENTED' : 'PENDING')),
          metricLabel,
          evaluator: evaluator || 'Completion Qualifier Evaluator',
          healingStep: healingStep || (triggerDecision.prevented ? 'Auto-fix keyboard & unblock' : null),
          telemetryInsight: telemetryInsight || (isTriggerFired ? 'All document lines captured & verified' : (triggerDecision.prevented ? (triggerDecision.reasons?.[0] || 'Loop qualifiers prevented transition') : `Target line ${nextTargetTop} ready`)),
          color: isRunning ? '#ffa657' : (isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? (healingStep ? '#ffa657' : '#ff7b72') : '#58a6ff')),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      case 'document_assemble': {
        const isRunning = isThisActive;
        const isComplete = Boolean(node8.is_complete);
        const metricLabel = isComplete ? '100% Verified' : (node8.total_captured_lines ? `${node8.total_captured_lines} lines` : (healingStep || 'Reconstruct'));
        return {
          isRunning,
          isActive: isRunning,
          isError: Boolean(node8.error) && !healingStep,
          isDone: isNode8Done,
          statusLabel: isRunning ? 'ASSEMBLING' : (isComplete ? 'COMPLETE' : (isNode8Done ? 'ASSEMBLED' : 'READY')),
          metricLabel,
          evaluator: evaluator || 'Document Integrity Evaluator',
          healingStep,
          telemetryInsight: telemetryInsight || (isComplete ? 'Complete markdown file assembled & saved' : `${node8.total_captured_lines || 0} lines stitched`),
          color: isComplete ? '#00ff9d' : (isNode8Done ? '#388bfd' : '#8b949e'),
          startedAt,
          finishedAt,
          durationMs
        };
      }
      default:
        return {
          isRunning: false, isActive: false, isError: false, isDone: false,
          statusLabel: 'IDLE', metricLabel: '', evaluator: null, healingStep: null, telemetryInsight: null, color: '#8b949e',
          startedAt: null, finishedAt: null, durationMs: null
        };
      }
    };

    return attachMeta(getRawStatus());
  };

  // Copy comprehensive node diagnostics and trace information in Markdown format for AI
  const copyNodeDetailsForAi = async (nodeId: string) => {
    const nodeMeta = NODES_METADATA.find(n => n.id === nodeId) || NODES_METADATA[0];
    const nodeData = dagStatus.dag?.nodes?.[nodeId] || {};
    const liveStatus = getNodeLiveStatus(nodeId);
    const timings = liveStatus.timings || nodeData.timings;
    const dagContext = liveStatus.dagContext || nodeData.dag_context;
    const traceInsights = liveStatus.traceInsights || nodeData.trace_insights;
    const troubleshootingSteps = nodeData.troubleshooting_steps || (dagStatus.dag?.nodes?.[nodeId]?.troubleshooting_steps);
    const nodeError = liveStatus.nodeError || nodeData.error;
    const nodeEvents = eventsLog.filter(ev => filterNodeTelemetry(nodeId, ev));

    const statusStr = liveStatus.isAborted
      ? '⏹ ABORTED'
      : (liveStatus.isError
        ? '⛔ ERROR'
        : (liveStatus.isDone
          ? '✔ COMPLETED'
          : (liveStatus.isRunning ? '⚡ ACTIVE / RUNNING' : 'IDLE')));

    const lines: string[] = [];
    lines.push(`### 🧩 DAG Node Trace & Diagnostics: Node ${nodeMeta.step} — ${nodeMeta.fullName}`);
    lines.push('');
    lines.push(`- **Node ID:** \`${nodeMeta.id}\``);
    lines.push(`- **Short Name:** ${nodeMeta.shortName}`);
    lines.push(`- **Group:** ${nodeMeta.group === 'initialize' ? 'Initialize (DAG 1)' : 'Capture Entire Markdown (DAG 2)'}`);
    lines.push(`- **Status:** ${statusStr}`);
    lines.push(`- **Current Metric:** ${liveStatus.metricLabel || 'N/A'}`);
    lines.push(`- **Evaluator:** ${liveStatus.evaluator || 'N/A'}`);
    lines.push(`- **Healing Action:** ${liveStatus.healingStep || 'None (Optimal)'}`);
    lines.push(`- **Telemetry Insight:** ${liveStatus.telemetryInsight || 'N/A'}`);
    lines.push(`- **Description:** ${nodeMeta.desc}`);
    lines.push('');

    lines.push('#### ⏱ Execution Timings');
    lines.push(`- **Started At:** ${liveStatus.startedAt || 'N/A'}`);
    lines.push(`- **Finished At:** ${liveStatus.finishedAt || 'N/A'}`);
    lines.push(`- **Elapsed Duration:** ${liveStatus.durationMs !== null ? `${(liveStatus.durationMs / 1000).toFixed(2)}s (${liveStatus.durationMs}ms)` : (liveStatus.isActive ? 'Active...' : 'N/A')}`);
    if (timings) {
      lines.push('- **Detailed Timings Breakdown:**');
      lines.push(`  - Total Duration: ${timings.duration_ms ?? 'N/A'}ms`);
      lines.push(`  - Precheck Phase: ${timings.precheck_ms ?? 'N/A'}ms`);
      lines.push(`  - Node Action: ${timings.action_ms ?? 'N/A'}ms`);
      lines.push(`  - Auto-Healing: ${timings.healing_ms ?? 'N/A'}ms`);
    }
    lines.push('');

    if (nodeError) {
      lines.push('#### ❌ Error Details');
      lines.push(`> **Message:** ${nodeError}`);
      lines.push('');
    }

    if (traceInsights && traceInsights.length > 0) {
      lines.push('#### 🔍 Key Trace Insights & Remediation Commands');
      traceInsights.forEach((insight: string) => {
        if (insight.startsWith('adb') || insight.startsWith('input') || insight.startsWith('cmd') || insight.startsWith('settings')) {
          lines.push(`- **Command:**\n  \`\`\`bash\n  ${insight}\n  \`\`\``);
        } else {
          lines.push(`- ${insight}`);
        }
      });
      lines.push('');
    }

    if (troubleshootingSteps && troubleshootingSteps.length > 0) {
      lines.push('#### 🛠 Recommended Troubleshooting Steps');
      troubleshootingSteps.forEach((step: any, idx: number) => {
        lines.push(`${idx + 1}. **${step.title || 'Step ' + (step.step || idx + 1)}**: ${step.description || ''}${step.action_label ? ` *(Action: \`${step.action_label}\`)*` : ''}`);
      });
      lines.push('');
    }

    if (dagContext) {
      lines.push('#### 🌐 DAG Context & Environmental State');
      lines.push('```json');
      lines.push(JSON.stringify(dagContext, null, 2));
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

    if (nodeId === 'init_end') {
      lines.push(`- **Calibrated Total Lines:** ${node1TotalLines > 0 ? node1TotalLines : 'Not Calibrated'}`);
      lines.push(`- **Status State:** ${isNode1Calibrated ? 'Calibrated' : (isNode1Error ? 'Error' : 'Not Run')}`);
    } else if (nodeId === 'reset_home') {
      lines.push(`- **Line 1 Verified:** ${isNode2Verified ? 'Yes' : 'No'}`);
    } else if (nodeId === 'local_ai_ocr') {
      lines.push(`- **OCR Worker Active:** ${dagStatus.ocr_worker_active ? 'Yes' : 'No'}`);
      lines.push(`- **OCR Latency:** ${dagStatus.ocr_latency_ms}ms`);
      if (node3b.extracted_text) {
        lines.push(`- **Extracted Text Preview (${node3b.extracted_text.length} chars):**\n\`\`\`markdown\n${node3b.extracted_text.slice(0, 300)}...\n\`\`\``);
      }
    } else if (nodeId === 'line_qualifier') {
      const activeIssues = Object.values(node5Config.qualifiers || {}).filter(q => q.issue_detected);
      lines.push(`- **Active Qualifier Issues:** ${activeIssues.length > 0 ? activeIssues.map(q => `${q.name} (${q.severity})`).join(', ') : 'None detected'}`);
    } else if (nodeId === 'verification_trigger') {
      lines.push(`- **Verification Trigger Fired:** ${dagStatus.verification_trigger_fired ? 'Yes' : 'No'}`);
      lines.push(`- **Trigger Allowed:** ${dagStatus.trigger_decision?.allowed ? 'Yes' : 'No'}`);
      lines.push(`- **Prevented Reasons:** ${dagStatus.trigger_decision?.reasons?.join(', ') || 'None'}`);
    } else if (nodeId === 'viewport_actuator') {
      lines.push(`- **Arrow Step Count:** ${dagStatus.arrow_step_count}`);
    }

    lines.push('');
    lines.push(`#### 📜 Filtered Telemetry Events (${nodeEvents.length} recorded)`);
    if (nodeEvents.length === 0) {
      lines.push('_No specific events logged for this node yet._');
    } else {
      nodeEvents.slice(-8).forEach(ev => {
        lines.push(`- \`[${ev.timestamp}]\` **[${ev.category}]** ${ev.message}`);
      });
    }

    const markdownText = lines.join('\n');
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdownText);
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = markdownText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      } catch {}
    }

    setCopiedNodeId(nodeId);
    setTimeout(() => {
      setCopiedNodeId(prev => prev === nodeId ? null : prev);
    }, 2500);
  };

  // Discern root cause of performance degradation and generate AI resolution prompt
  const discernNodePerformance = (nodeId: string): PerformanceDiagnosis => {
    if (serverDiagnosisCache[nodeId]) {
      return serverDiagnosisCache[nodeId];
    }

    const nodeMeta = NODES_METADATA.find(n => n.id === nodeId) || NODES_METADATA[0];
    const nodeData = dagStatus.dag?.nodes?.[nodeId] || {};
    const liveStatus = getNodeLiveStatus(nodeId);
    const timings = liveStatus.timings || nodeData.timings || {};
    const nodeError = liveStatus.nodeError || nodeData.error;
    const isError = liveStatus.isError || Boolean(nodeError);

    const duration_ms = timings.duration_ms ?? liveStatus.durationMs ?? nodeData.duration_ms ?? 0;
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
      summary = `Node encountered a blocking failure: ${nodeError || 'Execution failed'}`;
      evidence.push(`Node error state: ${nodeError || 'Unknown error'}`);
      if (liveStatus.traceInsights) {
        liveStatus.traceInsights.forEach((t: string) => evidence.push(t));
      }
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
      if (liveStatus.healingStep) {
        evidence.push(`Last Healing Action: ${liveStatus.healingStep}`);
      }
      if (!dagStatus.is_keyboard_guarded || isKeyboardOpen) {
        evidence.push('Soft keyboard (IME) was active or required dismissal.');
      }
      remediations.push('Enforce persistent soft keyboard suppression (settings put secure show_ime_with_hard_keyboard 0).');
      remediations.push('Prevent activity re-creation: avoid unconditional am start when window is already focused.');
      remediations.push('Check dumpsys input_method to ensure InputMethodManager window does not retain active focus.');
    } else if (((nodeId === 'local_ai_ocr' || nodeId === 'frame_ocr') && (action_ms > 2500 || ocr_latency_ms > 1500)) || ocr_latency_ms > 2500) {
      category = 'OCR_BOTTLENECK';
      severity = (ocr_latency_ms > 3500 || action_ms > 4000) ? 'critical' : 'warning';
      title = 'OCR / Multimodal Vision Inference Latency Spike';
      summary = `OCR inference took ${ocr_latency_ms || action_ms}ms per frame, creating an upstream throughput bottleneck.`;
      evidence.push(`OCR inference latency measured at ${ocr_latency_ms || action_ms}ms (nominal baseline: < 350ms).`);
      evidence.push(`Worker status: ${dagStatus.ocr_worker_active ? 'Active' : 'Idle'}`);
      remediations.push('Crop inference region strictly to numeric line gutter (x: 0-250px) rather than scanning full frame.');
      remediations.push('Verify Ollama model concurrency and check CPU/GPU offload thread count.');
      remediations.push('Use lightweight ONNX RapidOCR for gutter lines and reserve Vision LLM for verbatim text.');
    } else if ((nodeId === 'frame_acquire' && (action_ms > 800 || capture_rtt_ms > 350)) || capture_rtt_ms > 500) {
      category = 'ADB_SCREENSHOT_OVERHEAD';
      severity = 'warning';
      title = 'ADB Transport & Screencap RTT Latency';
      summary = `ADB screenshot capture took ${capture_rtt_ms || action_ms}ms per frame (nominal: < 80ms over USB, < 150ms over Wi-Fi).`;
      evidence.push(`Screencap round-trip time: ${capture_rtt_ms || action_ms}ms.`);
      remediations.push('Cache SurfaceFlinger display IDs to eliminate sequential dumpsys SurfaceFlinger queries.');
      remediations.push('Ensure ADB over USB (5000000 baud) or switch Wi-Fi to 5GHz low-latency band.');
      remediations.push('Enable hot frame memory cache reuse when viewport has not moved.');
    } else if (precheck_ms > 3000 || (total > 2000 && precheck_pct > 40)) {
      category = 'PRECHECK_BLOCKING';
      severity = 'warning';
      title = 'Sequential Environment Precheck Blocking';
      summary = `Prechecks required ${precheck_ms}ms (${precheck_pct}% of total execution) before node action began.`;
      evidence.push(`Precheck phase duration: ${precheck_ms}ms.`);
      remediations.push('Run independent environment classifiers concurrently via asyncio.gather().');
      remediations.push('Skip environment healing (skip_env_heal=True) after first successful cycle.');
    } else if (nodeId === 'arrow_down' && duration_ms > 2000) {
      category = 'VIEWPORT_SCROLL_LAG';
      severity = 'warning';
      title = 'Viewport Scroll & Animation Settle Latency';
      summary = `Pacer dwell and viewport settling took ${duration_ms}ms.`;
      evidence.push(`Arrow step count: ${dagStatus.arrow_step_count}`);
      remediations.push('Tune settle delay: lower default settle delay from 300ms to 150ms.');
      remediations.push('Detect scroll velocity stop via 2-frame optical difference rather than fixed timers.');
    }

    if (evidence.length === 0) {
      evidence.push(`Total node runtime: ${duration_ms || total}ms.`);
      evidence.push(`Precheck: ${precheck_ms}ms (${precheck_pct}%), Action: ${action_ms}ms (${action_pct}%), Healing: ${healing_ms}ms (${healing_pct}%).`);
      evidence.push(`OCR latency: ${ocr_latency_ms}ms, Screen grab latency: ${capture_rtt_ms}ms.`);
    }

    if (remediations.length === 0) {
      remediations.push('Maintain existing calibration parameters and continue monitoring loop timings.');
    }

    const evidenceList = evidence.map(e => `- ${e}`).join('\n');
    const remediationList = remediations.map((r, i) => `${i + 1}. ${r}`).join('\n');

    const prompt = `# 🛠️ System Performance Degradation Resolution Prompt

## Objective
Analyze the root cause of latency and performance degradation in the Small-Fling pagination & markdown extraction DAG pipeline, and implement code/configuration optimizations to resolve the bottleneck.

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
| Phase | Duration | Percentage of Node Time | Target Baseline | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Total Duration** | ${duration_ms || total}ms | 100% | < 1,500ms | ${(duration_ms || total) > 1500 ? '⚠️ Degraded' : '✔ Normal'} |
| **Environment Precheck** | ${precheck_ms}ms | ${precheck_pct}% | < 200ms | ${precheck_ms > 800 ? '⚠️ High' : '✔ Normal'} |
| **Primary Node Action** | ${action_ms}ms | ${action_pct}% | < 800ms | ${action_ms > 1200 ? '⚠️ High' : '✔ Normal'} |
| **Auto-Healing Recovery** | ${healing_ms}ms | ${healing_pct}% | 0ms | ${healing_ms > 2000 ? '⛔ Excessive' : (healing_ms > 0 ? '⚠️ Present' : '✔ None')} |
| **OCR Vision Latency** | ${ocr_latency_ms}ms | — | < 350ms | ${ocr_latency_ms > 1000 ? '⚠️ Sluggish' : '✔ Normal'} |
| **ADB Screencap RTT** | ${capture_rtt_ms}ms | — | < 120ms | ${capture_rtt_ms > 300 ? '⚠️ High RTT' : '✔ Normal'} |

---

## 🔍 Root Cause Analysis & Diagnostic Evidence
${evidenceList}

### Environmental & Device Context
- **Active Device Serial:** \`${activeDeviceSerial || 'Connected ADB Device'}\`
- **Target Display ID:** \`${(liveStatus.dagContext?.display_id ?? 'External Desktop')}\`
- **Active Density / DPI:** \`${(liveStatus.dagContext?.active_dpi ?? 120)} DPI\`
- **Keyboard Suppressed / Guarded:** \`${dagStatus.is_keyboard_guarded}\`
- **Current Top Line:** \`Ln ${dagStatus.current_top_line}\`
- **Current Bottom Line:** \`Ln ${dagStatus.current_bottom_line}\`
- **Target Total Lines:** \`${effectiveTotal}\`

---

## 💻 Relevant Source Files & Code Architecture
- **Pipeline Orchestration & Timing:** [\`server/routers/orchestration.py\`](file:///c:/Projects/Small-Fling/server/routers/orchestration.py)
- **ADB & Display Subsystem:** [\`server/services/adb_service.py\`](file:///c:/Projects/Small-Fling/server/services/adb_service.py)
- **Classifiers & Viewport Healing:** [\`server/classifiers/editor_classifiers.py\`](file:///c:/Projects/Small-Fling/server/classifiers/editor_classifiers.py)
- **Local OCR & Vision Inference:** [\`server/services/ocr_service.py\`](file:///c:/Projects/Small-Fling/server/services/ocr_service.py)
- **Frontend DAG State & Diagnostics:** [\`web/src/FlowDag.tsx\`](file:///c:/Projects/Small-Fling/web/src/FlowDag.tsx)

---

## 🎯 Recommended Action Plan for AI
Please examine the evidence above and apply the following targeted remediations:
${remediationList}

### Expected Outcome
After applying the fixes, verify that:
1. Node \`${nodeMeta.id}\` execution time drops below 1,500ms.
2. Auto-healing churn is eliminated during steady-state loops.
3. OCR inference and screencap round-trips meet target baselines.
`;

    const promptDataUri = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(prompt.trim());

    return {
      nodeId,
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
      promptDataUri
    };
  };

  const openPromptModal = async (nodeId: string) => {
    setPromptModalNodeId(nodeId);
    setIsPromptModalOpen(true);
    setPromptActiveTab('formatted');
    setCopiedPrompt(false);

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

  const copyPromptToClipboard = async (promptText: string) => {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(promptText);
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = promptText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      } catch {}
    }
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const downloadPromptFile = (nodeId: string, promptText: string) => {
    try {
      const blob = new Blob([promptText], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-performance-resolution-prompt-${nodeId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
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
    return activeRunningId === id;
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
    const isPinned = pinnedHoverNodeId === node.id;
    const status = getNodeLiveStatus(node.id);
    const isPulsingSwirl = activeRunningId === node.id;

    return (
      <div
        key={node.id}
        className={`dag-mini-node-compact ${isSelected ? 'selected' : ''} ${isPinned ? 'pinned-active' : ''} ${isPulsingSwirl ? 'heat-lamp-active running-swirl' : ''}`}
        onClick={() => handleSelectNode(node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setPinnedHoverNodeId(prev => prev === node.id ? null : node.id);
        }}
        onMouseEnter={() => setHoveredNodeId(node.id)}
        onMouseLeave={() => setHoveredNodeId(prev => prev === node.id ? null : prev)}
        style={{
          flex: 1,
          minWidth: '80px',
          maxWidth: '175px',
          height: '56px',
          background: isSelected ? 'rgba(22, 27, 34, 0.98)' : 'rgba(13, 17, 23, 0.9)',
          borderRadius: '6px',
          border: `1.5px solid ${isPinned ? '#58a6ff' : (isSelected ? node.accentColor : (status.isDone ? '#238636' : (status.isError ? '#f85149' : '#30363d')))}`,
          boxShadow: isPinned
            ? `0 0 14px rgba(88, 166, 255, 0.6), 0 2px 8px rgba(0,0,0,0.7)`
            : (isSelected
              ? `0 0 12px ${node.accentColor}55, 0 2px 8px rgba(0,0,0,0.6)`
              : (status.isRunning ? '0 0 10px rgba(255, 107, 37, 0.5)' : 'none')),
          padding: '3px 6px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box'
        }}
        title={`Node ${node.step}: ${node.fullName}\n• Evaluator: ${status.evaluator || 'Standard Gutter'}\n${status.healingStep ? `• Healing Action: ${status.healingStep}\n` : ''}${status.telemetryInsight ? `• Insight: ${status.telemetryInsight}\n` : ''}• Double-click to reveal dynamic details popover\n• Single-click to select`}
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

        {/* Middle: Metric badge with healing indicator */}
        <div style={{ fontSize: '8.5px', fontWeight: 700, color: status.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '3px' }}>
          {status.healingStep && (status.isRunning || status.isError) && <RefreshCw size={7.5} className="spin" style={{ flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.metricLabel || status.statusLabel}</span>
        </div>

        {/* Bottom: Timing & Quick Copy for AI */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '7.5px', color: isPulsingSwirl ? '#ffa657' : '#8b949e', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1px' }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
            {isPulsingSwirl
              ? (status.startedAt ? `${status.startedAt} (active)` : 'Active...')
              : (status.durationMs ? `${(status.durationMs / 1000).toFixed(1)}s` : (status.startedAt || 'Idle'))}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                copyNodeDetailsForAi(node.id);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '0px 3px',
                borderRadius: '3px',
                border: copiedNodeId === node.id ? '1px solid #00ff9d' : '1px solid rgba(88, 166, 255, 0.4)',
                background: copiedNodeId === node.id ? 'rgba(0, 255, 157, 0.2)' : 'rgba(88, 166, 255, 0.15)',
                color: copiedNodeId === node.id ? '#00ff9d' : '#58a6ff',
                fontSize: '7px',
                fontWeight: 800,
                cursor: 'pointer',
                lineHeight: '11px',
                height: '13px'
              }}
              title="Copy details for AI in Markdown format"
            >
              {copiedNodeId === node.id ? <Check size={7} /> : <Copy size={7} />}
              <span>{copiedNodeId === node.id ? 'COPIED' : 'AI'}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPromptModal(node.id);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '0px 3px',
                borderRadius: '3px',
                border: '1px solid rgba(255, 166, 87, 0.4)',
                background: 'rgba(255, 166, 87, 0.15)',
                color: '#ffa657',
                fontSize: '7px',
                fontWeight: 800,
                cursor: 'pointer',
                lineHeight: '11px',
                height: '13px'
              }}
              title="View Markdown Resolution Prompt for AI"
            >
              <Sparkles size={7} />
              <span>PROMPT</span>
            </button>
            {isSelected && <span style={{ color: node.accentColor, fontSize: '7px', fontWeight: 800 }}>SEL</span>}
            {isPinned && <span style={{ color: '#58a6ff', fontSize: '7px', fontWeight: 800 }}>OPEN</span>}
          </div>
        </div>
      </div>
    );
  };

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', width: '100%' }}>
            {renderMicroNode(NODES_METADATA[2])}
            {renderMicroArrow(NODES_METADATA[2], NODES_METADATA[3], 14)}
            {renderMicroNode(NODES_METADATA[3])}
            {renderMicroArrow(NODES_METADATA[3], NODES_METADATA[4], 14)}
            {renderMicroNode(NODES_METADATA[4])}
            {renderMicroArrow(NODES_METADATA[4], NODES_METADATA[5], 14)}
            {renderMicroNode(NODES_METADATA[5])}
            {renderMicroArrow(NODES_METADATA[5], NODES_METADATA[6], 14)}
            {renderMicroNode(NODES_METADATA[6])}
            {renderMicroArrow(NODES_METADATA[6], NODES_METADATA[7], 14)}
            {renderMicroNode(NODES_METADATA[7])}
            {/* Arrow at end of Node 8 exiting into loopback line */}
            <div style={{ width: '20px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }} title="Loopback exit from Assemble Doc">
              <svg width="20" height="56" viewBox="0 0 20 56" style={{ overflow: 'visible' }}>
                <path
                  d="M 1 28 C 12 28, 15 38, 15 54"
                  fill="none"
                  stroke={triggerDecision.prevented ? '#f85149' : (isCaptureGroupRunning ? '#00ff9d' : '#00ff9d88')}
                  strokeWidth="2.2"
                  strokeDasharray={isCaptureGroupRunning ? '5 2' : 'none'}
                  className={isCaptureGroupRunning ? 'dag-wire-active' : ''}
                  markerEnd={triggerDecision.prevented ? 'url(#dag-arrowhead-heat)' : 'url(#dag-arrowhead-green)'}
                />
              </svg>
            </div>
          </div>

          {/* Tucked Loopback Curve underneath Group 2 Nodes (Node 8 -> Node 3) WITHOUT text */}
          <div style={{ width: '100%', height: '15px', position: 'relative', marginTop: '2px', display: 'flex', alignItems: 'center' }}>
            <svg width="100%" height="15" viewBox="0 0 1000 15" preserveAspectRatio="none" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
              <path
                d="M 988 1 C 988 13, 30 13, 30 1"
                fill="none"
                stroke={triggerDecision.prevented ? '#f85149' : (isCaptureGroupRunning ? '#00ff9d' : '#00ff9d77')}
                strokeWidth={isCaptureGroupRunning ? 2.2 : 1.6}
                strokeDasharray={isCaptureGroupRunning ? '6 3' : '4 3'}
                className={isCaptureGroupRunning ? 'dag-wire-active' : ''}
                markerEnd={triggerDecision.prevented ? 'url(#dag-arrowhead-heat)' : 'url(#dag-arrowhead-green)'}
              />
              {isCaptureGroupRunning && (
                <circle r="3" fill="#00ff9d" filter="url(#dag-wire-glow)">
                  <animateMotion path="M 988 1 C 988 13, 30 13, 30 1" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
            </svg>
          </div>
        </div>

      </div>

      {/* DYNAMIC HOVER / POPOVER REVEALED ON DOUBLE CLICKING ANY DAG NODE */}
      {(() => {
        const activeHoverNode = pinnedHoverNodeId
          ? NODES_METADATA.find(n => n.id === pinnedHoverNodeId)
          : (hoveredNodeId ? NODES_METADATA.find(n => n.id === hoveredNodeId) : null);
        if (!activeHoverNode) return null;

        const liveStatus = getNodeLiveStatus(activeHoverNode.id);
        const nodeEvents = (eventsLog || []).filter((e: any) => !e.node_id || e.node_id === activeHoverNode.id || e.node_id === activeHoverNode.step || (e.message && e.message.toLowerCase().includes(activeHoverNode.shortName.toLowerCase())));

        return (
          <div
            className="dag-dynamic-node-popover"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '460px',
              maxWidth: '96vw',
              background: 'linear-gradient(180deg, #131923 0%, #0d1117 100%)',
              border: `1.5px solid ${activeHoverNode.accentColor}`,
              borderRadius: '10px',
              boxShadow: `0 16px 40px rgba(0, 0, 0, 0.9), 0 0 24px ${activeHoverNode.accentColor}33`,
              padding: '10px 14px',
              zIndex: 1100,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '9.5px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px',
                  background: `${activeHoverNode.accentColor}25`, color: activeHoverNode.accentColor,
                  border: `1px solid ${activeHoverNode.accentColor}55`
                }}>
                  NODE {activeHoverNode.step}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#f0f6fc' }}>
                  {activeHoverNode.fullName}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '8.5px', color: '#8b949e' }}>
                  {pinnedHoverNodeId === activeHoverNode.id ? '📌 Pinned (Double-click node to unpin)' : 'Hover preview'}
                </span>
                <button
                  type="button"
                  onClick={() => { setPinnedHoverNodeId(null); setHoveredNodeId(null); }}
                  style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px', display: 'flex' }}
                  title="Close hover details"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Description */}
            <div style={{ fontSize: '10.5px', color: '#8b949e', lineHeight: 1.35 }}>
              {activeHoverNode.desc}
            </div>

            {/* Live Timing & Status Pill */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.35)', padding: '5px 8px', borderRadius: '6px', fontSize: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={12} color={liveStatus.isActive ? '#ff6b25' : '#8b949e'} />
                <span style={{ color: liveStatus.isActive ? '#ffa657' : '#f0f6fc', fontWeight: 700 }}>
                  {liveStatus.durationMs !== null ? `${(liveStatus.durationMs / 1000).toFixed(2)}s (${liveStatus.durationMs}ms)` : (liveStatus.isActive ? 'Active Execution...' : (liveStatus.startedAt || 'Idle'))}
                </span>
                <span style={{ color: '#484f58' }}>•</span>
                <span style={{ color: liveStatus.color, fontWeight: 700 }}>{liveStatus.metricLabel || liveStatus.statusLabel}</span>
              </div>
              <span style={{
                fontSize: '8.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '3px',
                background: liveStatus.isActive ? 'rgba(255, 107, 37, 0.25)' : (liveStatus.isDone ? 'rgba(0, 255, 157, 0.15)' : (liveStatus.isError ? 'rgba(248, 81, 73, 0.2)' : '#161b22')),
                color: liveStatus.isActive ? '#ffa657' : (liveStatus.isDone ? '#00ff9d' : (liveStatus.isError ? '#ff7b72' : '#8b949e')),
                border: `1px solid ${liveStatus.isActive ? '#ff6b2588' : 'transparent'}`
              }}>
                {liveStatus.isActive ? '♨️ HEAT LAMP ACTIVE' : (liveStatus.isDone ? 'COMPLETED ✔' : (liveStatus.isError ? 'BLOCKED ⛔' : 'READY'))}
              </span>
            </div>

            {/* Detailed Timing Breakdown if available */}
            {liveStatus.timings && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', fontSize: '8.5px', background: 'rgba(0,0,0,0.3)', padding: '5px 7px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div><span style={{ color: '#8b949e', fontSize: '7.5px' }}>TOTAL</span><div style={{ color: '#58a6ff', fontWeight: 800 }}>{liveStatus.timings.duration_ms}ms</div></div>
                <div><span style={{ color: '#8b949e', fontSize: '7.5px' }}>PRECHECK</span><div style={{ color: '#a371f7', fontWeight: 800 }}>{liveStatus.timings.precheck_ms}ms</div></div>
                <div><span style={{ color: '#8b949e', fontSize: '7.5px' }}>ACTION</span><div style={{ color: '#00ff9d', fontWeight: 800 }}>{liveStatus.timings.action_ms}ms</div></div>
                <div><span style={{ color: '#8b949e', fontSize: '7.5px' }}>HEALING</span><div style={{ color: liveStatus.timings.healing_ms > 0 ? '#ffa657' : '#8b949e', fontWeight: 800 }}>{liveStatus.timings.healing_ms}ms</div></div>
              </div>
            )}

            {/* Unresolved Pipeline Issue - Trace Insights & Remediation */}
            {(liveStatus.traceInsights || liveStatus.dagContext) && (
              <div style={{ background: 'rgba(248, 81, 73, 0.12)', border: '1px solid #f8514988', borderRadius: '6px', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '9px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff7b72', fontWeight: 800 }}>
                    <AlertTriangle size={11} color="#ff7b72" />
                    <span>UNRESOLVED TRACE INSIGHTS</span>
                  </div>
                  {liveStatus.dagContext && (
                    <span style={{ color: '#8b949e', fontSize: '8px' }}>Disp: {liveStatus.dagContext.display_id ?? 'default'}</span>
                  )}
                </div>
                {liveStatus.traceInsights?.slice(0, 3).map((insight: string, idx: number) => (
                  <div key={idx} style={{ color: insight.startsWith('adb') ? '#58a6ff' : '#f0f6fc', fontFamily: 'var(--font-mono, monospace)', fontSize: '8.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    • {insight}
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {activeRunningId === activeHoverNode.id ? (
                  <button
                    type="button"
                    onClick={() => handleAbortNode(activeHoverNode.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                      borderRadius: '5px', border: '1px solid #f85149',
                      background: 'rgba(248, 81, 73, 0.2)', color: '#ff7b72',
                      fontSize: '10px', fontWeight: 800, cursor: 'pointer'
                    }}
                    title="Abort this node's running operation"
                  >
                    <Square size={11} fill="#ff7b72" />
                    <span>Abort Node {activeHoverNode.step}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRunNode(activeHoverNode.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                      borderRadius: '5px', border: `1px solid ${activeHoverNode.accentColor}`,
                      background: `${activeHoverNode.accentColor}25`, color: activeHoverNode.accentColor,
                      fontSize: '10px', fontWeight: 800, cursor: 'pointer'
                    }}
                    title={activeRunningId ? `Run Node ${activeHoverNode.step} (aborts running Node ${activeRunningId})` : `Run Node ${activeHoverNode.step}`}
                  >
                    <Play size={11} />
                    <span>{activeRunningId ? `Run Node ${activeHoverNode.step} (Preempt)` : `Run Node ${activeHoverNode.step}`}</span>
                  </button>
                )}
                {activeHoverNode.hasConfig && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeHoverNode.id === 'frame_acquire') setIsNode3ConfigOpen(true);
                      else if (activeHoverNode.id === 'frame_ocr') setIsNode4ConfigOpen(true);
                      else if (activeHoverNode.id === 'verification_trigger') setIsConfigModalOpen(true);
                    }}
                    style={{ background: '#21262d', border: '1px solid #30363d', color: '#58a6ff', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700 }}
                  >
                    <Settings size={11} />
                    <span>Settings</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyNodeDetailsForAi(activeHoverNode.id)}
                  style={{
                    background: copiedNodeId === activeHoverNode.id ? 'rgba(0, 255, 157, 0.2)' : 'rgba(88, 166, 255, 0.15)',
                    border: `1px solid ${copiedNodeId === activeHoverNode.id ? '#00ff9d' : '#58a6ff66'}`,
                    color: copiedNodeId === activeHoverNode.id ? '#00ff9d' : '#58a6ff',
                    padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', fontWeight: 800
                  }}
                  title="Copy details for AI in Markdown format"
                >
                  {copiedNodeId === activeHoverNode.id ? <Check size={11} color="#00ff9d" /> : <Copy size={11} />}
                  <span>{copiedNodeId === activeHoverNode.id ? 'Copied Details!' : 'Copy details for AI'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openPromptModal(activeHoverNode.id)}
                  style={{
                    background: 'rgba(255, 166, 87, 0.15)',
                    border: '1px solid rgba(255, 166, 87, 0.4)',
                    color: '#ffa657',
                    padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', fontWeight: 800
                  }}
                  title="View and copy AI resolution prompt in Markdown"
                >
                  <Sparkles size={11} color="#ffa657" />
                  <span>AI Prompt ↗</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => { handleSelectNode(activeHoverNode.id); setIsInspectorModalOpen(true); }}
                style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700 }}
              >
                <Activity size={11} />
                <span>Full Inspector</span>
              </button>
            </div>

            {/* Telemetry Events Ticker */}
            <div style={{
              background: '#090d14', border: '1px solid #21262d', borderRadius: '6px',
              padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden'
            }}>
              <Activity size={10} color={activeHoverNode.accentColor} style={{ flexShrink: 0 }} />
              {nodeEvents.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#6e7681', flexShrink: 0 }}>{nodeEvents[nodeEvents.length - 1].timestamp}</span>
                  <span style={{ fontSize: '8px', fontWeight: 800, padding: '0 4px', borderRadius: '2px', background: 'rgba(0, 255, 157, 0.15)', color: '#00ff9d', flexShrink: 0 }}>
                    {nodeEvents[nodeEvents.length - 1].category}
                  </span>
                  <span style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nodeEvents[nodeEvents.length - 1].message}
                  </span>
                </div>
              ) : (
                <span style={{ color: '#6e7681', fontStyle: 'italic' }}>No telemetry recorded for Node {activeHoverNode.step} yet.</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* AUTO-OPENING DIAGNOSTIC HOVER BOX FOR DAG 7 (VERIFICATION TRIGGER BLOCKED) */}
      {triggerDecision.prevented && !dismissedNode7Diagnostic && (
        <div
          className="dag-blocked-diagnostic-box"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: '12px',
            width: '420px',
            maxWidth: '94vw',
            background: 'linear-gradient(180deg, #261214 0%, #170b0c 100%)',
            border: '1.5px solid #f85149',
            borderRadius: '10px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.9), 0 0 24px rgba(248, 81, 73, 0.35)',
            padding: '12px 14px',
            zIndex: 1050,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <ShieldAlert size={16} color="#ff7b72" />
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#ff7b72', letterSpacing: '0.4px' }}>
                DAG 7: TRIGGER PREVENTED (BLOCKED)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDismissedNode7Diagnostic(true)}
              style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px', display: 'flex' }}
              title="Dismiss diagnostic box"
            >
              <X size={14} />
            </button>
          </div>

          {/* Diagnostic Details */}
          <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(248, 81, 73, 0.3)', borderRadius: '6px', padding: '6px 8px', fontSize: '10px' }}>
            <div style={{ fontWeight: 700, color: '#f85149', marginBottom: '2px' }}>Blocking Qualifier Issue:</div>
            {triggerDecision.reasons && triggerDecision.reasons.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '16px', color: '#f0f6fc', lineHeight: 1.4 }}>
                {triggerDecision.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : (
              <div style={{ color: '#f0f6fc' }}>Virtual Keyboard or Gutter check prevented next cycle transition.</div>
            )}
          </div>

          {/* Solutions Section */}
          <div>
            <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#ffa657', marginBottom: '4px', letterSpacing: '0.3px' }}>
              SOLUTIONS TO OVERCOME THIS ISSUE:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <button
                type="button"
                onClick={handleAutoFixKeyboardAndUnblock}
                disabled={isFixingQualifier}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(35, 134, 54, 0.25)', border: '1px solid #2ea043',
                  color: '#00ff9d', padding: '5px 8px', borderRadius: '5px',
                  fontSize: '10px', fontWeight: 700, cursor: isFixingQualifier ? 'wait' : 'pointer'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Zap size={11} /> 1. Dismiss Keyboard & Auto-Fix Viewport
                </span>
                <span style={{ fontSize: '8px', color: '#8b949e' }}>Recommended</span>
              </button>

              <button
                type="button"
                onClick={handleBypassKeyboardQualifier}
                disabled={isFixingQualifier}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(88, 166, 255, 0.15)', border: '1px solid #388bfd',
                  color: '#58a6ff', padding: '5px 8px', borderRadius: '5px',
                  fontSize: '10px', fontWeight: 700, cursor: isFixingQualifier ? 'wait' : 'pointer'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Check size={11} /> 2. Bypass Virtual Keyboard Qualifier
                </span>
                <span style={{ fontSize: '8px', color: '#8b949e' }}>Allow Loop</span>
              </button>

              <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
                <button
                  type="button"
                  onClick={handleEvaluateNode5}
                  disabled={isEvaluating}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    background: '#21262d', border: '1px solid #30363d', color: '#e6edf3',
                    padding: '4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={10} className={isEvaluating ? 'spin' : ''} />
                  <span>Re-Test Qualifiers</span>
                </button>
                {activeRunningId === 'verification_trigger' ? (
                  <button
                    type="button"
                    onClick={() => handleAbortNode('verification_trigger')}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                      background: 'rgba(248, 81, 73, 0.2)', border: '1px solid #f85149', color: '#ff7b72',
                      padding: '4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                    }}
                    title="Abort Node 7 operation"
                  >
                    <Square size={10} fill="#ff7b72" />
                    <span>Abort Node 7</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRunNode('verification_trigger')}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                      background: '#21262d', border: '1px solid #30363d', color: '#ffa657',
                      padding: '4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                    }}
                    title={activeRunningId ? `Run Node 7 (aborts running Node ${activeRunningId})` : 'Force Trigger'}
                  >
                    <Play size={10} />
                    <span>{activeRunningId ? 'Run Node 7 (Preempt)' : 'Force Trigger'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#21262d', border: '1px solid #30363d', color: '#8b949e',
                    padding: '4px 6px', borderRadius: '4px', fontSize: '9.5px', cursor: 'pointer'
                  }}
                  title="Open full qualifier configuration modal"
                >
                  <Settings size={10} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              {activeRunningId === selectedNodeMeta.id ? (
                <button
                  type="button"
                  onClick={() => handleAbortNode(selectedNodeMeta.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '6px', padding: '7px 12px', borderRadius: '6px',
                    border: '1px solid #f85149',
                    background: 'rgba(248, 81, 73, 0.2)',
                    color: '#ff7b72',
                    fontSize: '11px', fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                  title="Abort this node's execution"
                >
                  <Square size={12} fill="#ff7b72" />
                  <span>Abort Node {selectedNodeMeta.step}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRunNode(selectedNodeMeta.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '6px', padding: '7px 12px', borderRadius: '6px',
                    border: `1px solid ${selectedNodeMeta.accentColor}66`,
                    background: `${selectedNodeMeta.accentColor}18`,
                    color: selectedNodeMeta.accentColor,
                    fontSize: '11px', fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                  title={activeRunningId ? `Run Node ${selectedNodeMeta.step} (aborts currently running Node ${activeRunningId})` : `Run Node ${selectedNodeMeta.step}`}
                >
                  <Play size={12} />
                  <span>{activeRunningId ? `Run Node ${selectedNodeMeta.step} (Preempt)` : `Run Node ${selectedNodeMeta.step}`}</span>
                </button>
              )}

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

              <button
                type="button"
                onClick={() => copyNodeDetailsForAi(selectedNodeMeta.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 11px',
                  borderRadius: '6px',
                  border: `1px solid ${copiedNodeId === selectedNodeMeta.id ? '#00ff9d' : '#58a6ff66'}`,
                  background: copiedNodeId === selectedNodeMeta.id ? 'rgba(0, 255, 157, 0.2)' : 'rgba(88, 166, 255, 0.15)',
                  color: copiedNodeId === selectedNodeMeta.id ? '#00ff9d' : '#58a6ff',
                  fontSize: '11px', fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
                title="Copy complete trace, timing, errors, and context in Markdown format for AI"
              >
                {copiedNodeId === selectedNodeMeta.id ? <Check size={12} color="#00ff9d" /> : <Copy size={12} />}
                <span>{copiedNodeId === selectedNodeMeta.id ? 'Copied Details for AI!' : 'Copy details for AI'}</span>
              </button>

              <button
                type="button"
                onClick={() => openPromptModal(selectedNodeMeta.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 11px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 166, 87, 0.5)',
                  background: 'rgba(255, 166, 87, 0.15)',
                  color: '#ffa657',
                  fontSize: '11px', fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
                title="View interactive Markdown Resolution Prompt for AI"
              >
                <Sparkles size={12} color="#ffa657" />
                <span>View AI Prompt ↗</span>
              </button>
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

                  {/* General Evaluator & Healing Telemetry Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10.5px' }}>
                    <div style={{ background: '#161b22', padding: '6px 8px', borderRadius: '5px', border: '1px solid #30363d' }}>
                      <div style={{ fontSize: '8.5px', color: '#8b949e', fontWeight: 700 }}>GENERAL EVALUATOR</div>
                      <div style={{ fontWeight: 800, color: '#58a6ff', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {liveStatus.evaluator || 'Standard Gutter Evaluator'}
                      </div>
                    </div>
                    <div style={{ background: '#161b22', padding: '6px 8px', borderRadius: '5px', border: '1px solid #30363d' }}>
                      <div style={{ fontSize: '8.5px', color: '#8b949e', fontWeight: 700 }}>HEALING ACTION</div>
                      <div style={{ fontWeight: 800, color: liveStatus.healingStep ? '#ffa657' : '#00ff9d', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {liveStatus.healingStep ? <><RefreshCw size={9} className="spin" /> {liveStatus.healingStep}</> : '✔ Optimal / Ready'}
                      </div>
                    </div>
                  </div>
                  {/* Detailed Timings Breakdown */}
                  {liveStatus.timings && (
                    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '8.5px', color: '#58a6ff', fontWeight: 800, letterSpacing: '0.4px' }}>DETAILED EVENT TIMINGS BREAKDOWN</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '9.5px' }}>
                        <div>
                          <div style={{ color: '#8b949e', fontSize: '8px' }}>TOTAL</div>
                          <div style={{ fontWeight: 800, color: '#58a6ff' }}>{liveStatus.timings.duration_ms}ms</div>
                        </div>
                        <div>
                          <div style={{ color: '#8b949e', fontSize: '8px' }}>PRECHECK</div>
                          <div style={{ fontWeight: 800, color: '#a371f7' }}>{liveStatus.timings.precheck_ms}ms</div>
                        </div>
                        <div>
                          <div style={{ color: '#8b949e', fontSize: '8px' }}>NODE ACTION</div>
                          <div style={{ fontWeight: 800, color: '#00ff9d' }}>{liveStatus.timings.action_ms}ms</div>
                        </div>
                        <div>
                          <div style={{ color: '#8b949e', fontSize: '8px' }}>AUTO-HEALING</div>
                          <div style={{ fontWeight: 800, color: liveStatus.timings.healing_ms > 0 ? '#ffa657' : '#8b949e' }}>{liveStatus.timings.healing_ms}ms</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Real-time Root Cause & Performance Diagnostics */}
                  {(() => {
                    const diag = discernNodePerformance(selectedNodeMeta.id);
                    const severityColor = diag.severity === 'critical' ? '#f85149' : (diag.severity === 'warning' ? '#ffa657' : '#00ff9d');
                    const severityBg = diag.severity === 'critical' ? 'rgba(248, 81, 73, 0.15)' : (diag.severity === 'warning' ? 'rgba(255, 166, 87, 0.15)' : 'rgba(0, 255, 157, 0.12)');
                    const severityBorder = diag.severity === 'critical' ? '#f85149' : (diag.severity === 'warning' ? '#ffa65788' : '#00ff9d44');

                    return (
                      <div style={{
                        background: '#0d1117',
                        border: `1.5px solid ${severityBorder}`,
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        {/* Card Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: 800, color: severityColor, letterSpacing: '0.4px' }}>
                            <Sparkles size={12} color={severityColor} />
                            <span>ROOT CAUSE & PERFORMANCE DIAGNOSTICS</span>
                          </div>
                          <span style={{
                            fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px',
                            background: severityBg, color: severityColor, border: `1px solid ${severityBorder}`
                          }}>
                            {diag.category.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {/* Summary Callout */}
                        <div style={{
                          background: '#161b22',
                          borderLeft: `3px solid ${severityColor}`,
                          borderRadius: '4px',
                          padding: '6px 10px',
                          fontSize: '10px',
                          color: '#c9d1d9',
                          lineHeight: 1.4
                        }}>
                          <div style={{ fontWeight: 800, color: severityColor, marginBottom: '2px' }}>{diag.title}</div>
                          <div>{diag.summary}</div>
                        </div>

                        {/* Latency & Phase Breakdown Progress Bar */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#8b949e', fontWeight: 700 }}>
                            <span>LATENCY PHASE DISTRIBUTION</span>
                            <span>Total: {diag.metrics.duration_ms}ms</span>
                          </div>
                          <div style={{
                            display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden',
                            background: '#21262d', border: '1px solid #30363d'
                          }}>
                            <div style={{ width: `${diag.metrics.precheck_pct}%`, background: '#a371f7' }} title={`Precheck: ${diag.metrics.precheck_ms}ms (${diag.metrics.precheck_pct}%)`} />
                            <div style={{ width: `${diag.metrics.action_pct}%`, background: '#00ff9d' }} title={`Action: ${diag.metrics.action_ms}ms (${diag.metrics.action_pct}%)`} />
                            <div style={{ width: `${diag.metrics.healing_pct}%`, background: diag.metrics.healing_ms > 2000 ? '#f85149' : '#ffa657' }} title={`Auto-Healing: ${diag.metrics.healing_ms}ms (${diag.metrics.healing_pct}%)`} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#6e7681', marginTop: '1px' }}>
                            <span style={{ color: '#a371f7' }}>● Precheck ({diag.metrics.precheck_ms}ms)</span>
                            <span style={{ color: '#00ff9d' }}>● Action ({diag.metrics.action_ms}ms)</span>
                            <span style={{ color: diag.metrics.healing_ms > 0 ? '#ffa657' : '#6e7681' }}>● Healing ({diag.metrics.healing_ms}ms)</span>
                            <span style={{ color: '#58a6ff' }}>OCR: {diag.metrics.ocr_latency_ms}ms</span>
                          </div>
                        </div>

                        {/* Evidence Checklist */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9px' }}>
                          <div style={{ color: '#8b949e', fontWeight: 700, fontSize: '8.5px' }}>DIAGNOSTIC EVIDENCE:</div>
                          {diag.evidence.slice(0, 3).map((ev, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', color: '#f0f6fc' }}>
                              <span style={{ color: severityColor, flexShrink: 0 }}>•</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev}</span>
                            </div>
                          ))}
                        </div>

                        {/* Actions & Links Toolbar */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid #21262d' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => openPromptModal(selectedNodeMeta.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                background: 'rgba(255, 166, 87, 0.2)',
                                border: '1px solid #ffa657',
                                borderRadius: '5px',
                                padding: '4px 9px',
                                color: '#ffa657',
                                fontSize: '9.5px', fontWeight: 800,
                                cursor: 'pointer'
                              }}
                              title="Open interactive AI resolution prompt modal"
                            >
                              <Sparkles size={11} color="#ffa657" />
                              <span>View AI Resolution Prompt ↗</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => copyPromptToClipboard(diag.markdown_prompt)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                background: copiedPrompt ? 'rgba(0, 255, 157, 0.2)' : '#161b22',
                                border: `1px solid ${copiedPrompt ? '#00ff9d' : '#30363d'}`,
                                borderRadius: '5px',
                                padding: '4px 8px',
                                color: copiedPrompt ? '#00ff9d' : '#c9d1d9',
                                fontSize: '9.5px', fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              title="Copy Markdown Prompt for AI"
                            >
                              {copiedPrompt ? <Check size={11} color="#00ff9d" /> : <Copy size={11} />}
                              <span>{copiedPrompt ? 'Copied Prompt!' : 'Copy Prompt'}</span>
                            </button>
                          </div>

                          {/* Direct Markdown View Prompt Link */}
                          <a
                            href={diag.promptDataUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={`ai-performance-resolution-prompt-${selectedNodeMeta.id}.md`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              color: '#58a6ff', fontSize: '9px', fontWeight: 700,
                              textDecoration: 'none', padding: '3px 6px', borderRadius: '4px',
                              background: 'rgba(88, 166, 255, 0.1)', border: '1px solid rgba(88, 166, 255, 0.3)'
                            }}
                            title="Direct link to view raw markdown prompt or save file"
                          >
                            <ExternalLink size={10} />
                            <span>Markdown View Prompt ↗</span>
                          </a>
                        </div>
                      </div>
                    );
                  })()}

                  {/* UNRESOLVED PIPELINE ISSUE - TRACE & DIAGNOSTICS CARD */}
                  {(liveStatus.traceInsights || liveStatus.dagContext) && (
                    <div style={{
                      background: 'rgba(248, 81, 73, 0.12)',
                      border: '1.5px solid #f85149',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff7b72', fontWeight: 800, fontSize: '10.5px' }}>
                          <AlertTriangle size={14} color="#ff7b72" />
                          <span>UNRESOLVED PIPELINE ISSUE — TRACE & DIAGNOSTICS</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => copyNodeDetailsForAi(selectedNodeMeta.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              background: copiedNodeId === selectedNodeMeta.id ? 'rgba(0, 255, 157, 0.2)' : 'rgba(248, 81, 73, 0.25)',
                              border: `1px solid ${copiedNodeId === selectedNodeMeta.id ? '#00ff9d' : '#f85149'}`,
                              borderRadius: '4px',
                              padding: '2px 7px',
                              color: copiedNodeId === selectedNodeMeta.id ? '#00ff9d' : '#f0f6fc',
                              fontSize: '9px', fontWeight: 800, cursor: 'pointer'
                            }}
                            title="Copy unresolved issue trace and diagnostics in Markdown for AI"
                          >
                            {copiedNodeId === selectedNodeMeta.id ? <Check size={10} color="#00ff9d" /> : <Copy size={10} />}
                            <span>{copiedNodeId === selectedNodeMeta.id ? 'Copied Details!' : 'Copy details for AI'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openPromptModal(selectedNodeMeta.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px',
                              background: 'rgba(255, 166, 87, 0.25)',
                              border: '1px solid #ffa657',
                              borderRadius: '4px',
                              padding: '2px 7px',
                              color: '#ffa657',
                              fontSize: '9px', fontWeight: 800, cursor: 'pointer'
                            }}
                            title="View AI Resolution Prompt in Markdown"
                          >
                            <Sparkles size={10} color="#ffa657" />
                            <span>AI Prompt ↗</span>
                          </button>
                          {liveStatus.dagContext && (
                            <span style={{ fontSize: '8.5px', color: '#8b949e', background: '#0d1117', padding: '2px 6px', borderRadius: '4px', border: '1px solid #30363d' }}>
                              Display: {liveStatus.dagContext.display_id ?? 'default'} • Serial: {liveStatus.dagContext.serial || 'active'}
                            </span>
                          )}
                        </div>
                      </div>

                      {liveStatus.traceInsights && liveStatus.traceInsights.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '9px', color: '#8b949e', fontWeight: 700 }}>KEY TRACE INSIGHTS & REMEDIATION COMMANDS:</span>
                          {liveStatus.traceInsights.map((insight: string, idx: number) => {
                            const isCmd = insight.startsWith('adb');
                            return (
                              <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#0d1117',
                                border: '1px solid #30363d',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '9.5px',
                                fontFamily: 'var(--font-mono, monospace)'
                              }}>
                                <span style={{ color: isCmd ? '#58a6ff' : '#f0f6fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>
                                  {insight}
                                </span>
                                {isCmd && (
                                  <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(insight)}
                                    style={{
                                      background: '#21262d', border: '1px solid #30363d', color: '#8b949e',
                                      borderRadius: '3px', padding: '1px 6px', fontSize: '8.5px', cursor: 'pointer', fontWeight: 700
                                    }}
                                    title="Copy command to clipboard"
                                  >
                                    Copy
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {liveStatus.dagContext && (
                        <details style={{ fontSize: '9px', color: '#8b949e' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#58a6ff' }}>View Complete DAG Context Detail</summary>
                          <pre style={{
                            background: '#0d1117',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            marginTop: '4px',
                            overflowX: 'auto',
                            maxHeight: '140px',
                            color: '#c9d1d9',
                            border: '1px solid #30363d',
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono, monospace)'
                          }}>
                            {JSON.stringify(liveStatus.dagContext, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
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

      {/* MODAL 5: AI Resolution Prompt & Performance Diagnostics Modal */}
      {isPromptModalOpen && (() => {
        const diag = discernNodePerformance(promptModalNodeId);
        const nodeMeta = NODES_METADATA.find(n => n.id === promptModalNodeId) || NODES_METADATA[0];
        const severityColor = diag.severity === 'critical' ? '#f85149' : (diag.severity === 'warning' ? '#ffa657' : '#00ff9d');

        return (
          <Modal
            isOpen={isPromptModalOpen}
            onClose={() => setIsPromptModalOpen(false)}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#ffa657" />
                <span>AI Prompt: System Performance Resolution (Node {nodeMeta.step} — {nodeMeta.fullName})</span>
              </div>
            }
            subtitle="Take this markdown prompt and feed it directly into an AI (Claude, ChatGPT, Gemini, Copilot) to resolve performance degradation"
            maxWidth="850px"
            cancelText="Close"
            confirmText={copiedPrompt ? "Copied Prompt!" : "Copy Prompt for AI"}
            confirmIcon={copiedPrompt ? Check : Copy}
            onConfirm={() => copyPromptToClipboard(diag.markdown_prompt)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Toolbar & Tabs */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #30363d', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setPromptActiveTab('formatted')}
                    style={{
                      background: promptActiveTab === 'formatted' ? 'rgba(88, 166, 255, 0.2)' : 'transparent',
                      border: `1px solid ${promptActiveTab === 'formatted' ? '#58a6ff' : 'transparent'}`,
                      color: promptActiveTab === 'formatted' ? '#58a6ff' : '#8b949e',
                      padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    Formatted View
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptActiveTab('raw')}
                    style={{
                      background: promptActiveTab === 'raw' ? 'rgba(88, 166, 255, 0.2)' : 'transparent',
                      border: `1px solid ${promptActiveTab === 'raw' ? '#58a6ff' : 'transparent'}`,
                      color: promptActiveTab === 'raw' ? '#58a6ff' : '#8b949e',
                      padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    Raw Markdown
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '9.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px',
                    background: `${severityColor}22`, color: severityColor, border: `1px solid ${severityColor}55`
                  }}>
                    {diag.category.replace(/_/g, ' ')} • {diag.severity.toUpperCase()}
                  </span>

                  <button
                    type="button"
                    onClick={() => downloadPromptFile(promptModalNodeId, diag.markdown_prompt)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9',
                      padding: '4px 8px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer'
                    }}
                    title="Download .md prompt file"
                  >
                    <Download size={12} />
                    <span>Download .md</span>
                  </button>

                  <a
                    href={diag.promptDataUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={`ai-performance-resolution-prompt-${promptModalNodeId}.md`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: 'rgba(88, 166, 255, 0.15)', border: '1px solid #58a6ff66',
                      color: '#58a6ff', padding: '4px 8px', borderRadius: '5px',
                      fontSize: '10.5px', fontWeight: 700, textDecoration: 'none'
                    }}
                    title="Open or download raw markdown prompt link"
                  >
                    <ExternalLink size={12} />
                    <span>Markdown Link ↗</span>
                  </a>
                </div>
              </div>

              {/* Tab 1: Formatted View */}
              {promptActiveTab === 'formatted' ? (
                <div style={{
                  maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px',
                  background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', padding: '14px', fontSize: '11px', color: '#e6edf3'
                }}>
                  {/* Executive Summary */}
                  <div style={{ background: '#161b22', borderLeft: `3px solid ${severityColor}`, padding: '8px 12px', borderRadius: '4px' }}>
                    <div style={{ fontWeight: 800, fontSize: '12px', color: severityColor }}>{diag.title}</div>
                    <div style={{ marginTop: '4px', color: '#c9d1d9' }}>{diag.summary}</div>
                  </div>

                  {/* Timing Table */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontWeight: 800, color: '#58a6ff', fontSize: '11px' }}>⏱️ Latency & Phase Breakdown</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', background: '#161b22', borderRadius: '6px', overflow: 'hidden' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px' }}>Phase</th>
                          <th style={{ padding: '6px 8px' }}>Duration</th>
                          <th style={{ padding: '6px 8px' }}>Percentage</th>
                          <th style={{ padding: '6px 8px' }}>Baseline</th>
                          <th style={{ padding: '6px 8px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700 }}>Total Duration</td>
                          <td style={{ padding: '6px 8px', color: '#58a6ff' }}>{diag.metrics.duration_ms}ms</td>
                          <td style={{ padding: '6px 8px' }}>100%</td>
                          <td style={{ padding: '6px 8px', color: '#8b949e' }}>&lt; 1,500ms</td>
                          <td style={{ padding: '6px 8px', color: diag.metrics.duration_ms > 1500 ? '#ffa657' : '#00ff9d' }}>{diag.metrics.duration_ms > 1500 ? '⚠️ Degraded' : '✔ Normal'}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '6px 8px' }}>Environment Precheck</td>
                          <td style={{ padding: '6px 8px', color: '#a371f7' }}>{diag.metrics.precheck_ms}ms</td>
                          <td style={{ padding: '6px 8px' }}>{diag.metrics.precheck_pct}%</td>
                          <td style={{ padding: '6px 8px', color: '#8b949e' }}>&lt; 200ms</td>
                          <td style={{ padding: '6px 8px', color: diag.metrics.precheck_ms > 800 ? '#ffa657' : '#00ff9d' }}>{diag.metrics.precheck_ms > 800 ? '⚠️ High' : '✔ Normal'}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '6px 8px' }}>Primary Node Action</td>
                          <td style={{ padding: '6px 8px', color: '#00ff9d' }}>{diag.metrics.action_ms}ms</td>
                          <td style={{ padding: '6px 8px' }}>{diag.metrics.action_pct}%</td>
                          <td style={{ padding: '6px 8px', color: '#8b949e' }}>&lt; 800ms</td>
                          <td style={{ padding: '6px 8px', color: diag.metrics.action_ms > 1200 ? '#ffa657' : '#00ff9d' }}>{diag.metrics.action_ms > 1200 ? '⚠️ High' : '✔ Normal'}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '6px 8px' }}>Auto-Healing Recovery</td>
                          <td style={{ padding: '6px 8px', color: diag.metrics.healing_ms > 0 ? '#ffa657' : '#8b949e' }}>{diag.metrics.healing_ms}ms</td>
                          <td style={{ padding: '6px 8px' }}>{diag.metrics.healing_pct}%</td>
                          <td style={{ padding: '6px 8px', color: '#8b949e' }}>0ms</td>
                          <td style={{ padding: '6px 8px', color: diag.metrics.healing_ms > 2000 ? '#f85149' : (diag.metrics.healing_ms > 0 ? '#ffa657' : '#00ff9d') }}>{diag.metrics.healing_ms > 2000 ? '⛔ Excessive' : (diag.metrics.healing_ms > 0 ? '⚠️ Present' : '✔ None')}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '6px 8px' }}>OCR Inference Latency</td>
                          <td style={{ padding: '6px 8px', color: '#ffa657' }}>{diag.metrics.ocr_latency_ms}ms</td>
                          <td style={{ padding: '6px 8px' }}>—</td>
                          <td style={{ padding: '6px 8px', color: '#8b949e' }}>&lt; 350ms</td>
                          <td style={{ padding: '6px 8px', color: diag.metrics.ocr_latency_ms > 1000 ? '#ffa657' : '#00ff9d' }}>{diag.metrics.ocr_latency_ms > 1000 ? '⚠️ Sluggish' : '✔ Normal'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Diagnostic Evidence */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontWeight: 800, color: '#58a6ff', fontSize: '11px' }}>🔍 Root Cause Diagnostic Evidence</div>
                    <div style={{ background: '#161b22', padding: '8px 12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {diag.evidence.map((ev, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                          <span style={{ color: severityColor }}>•</span>
                          <span>{ev}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Remediation Plan */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontWeight: 800, color: '#00ff9d', fontSize: '11px' }}>🎯 Recommended Action Plan for AI</div>
                    <div style={{ background: '#161b22', padding: '8px 12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {diag.remediations.map((rem, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                          <span style={{ color: '#00ff9d', fontWeight: 800 }}>{i + 1}.</span>
                          <span>{rem}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Relevant Source Files */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontWeight: 800, color: '#8b949e', fontSize: '10px' }}>📁 Relevant Source Code Files</div>
                    <div style={{ background: '#161b22', padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', color: '#58a6ff' }}>
                      <div>• server/routers/orchestration.py</div>
                      <div>• server/services/adb_service.py</div>
                      <div>• server/classifiers/editor_classifiers.py</div>
                      <div>• server/services/ocr_service.py</div>
                      <div>• web/src/FlowDag.tsx</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Tab 2: Raw Markdown View */
                <pre style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  padding: '12px',
                  maxHeight: '420px',
                  overflowY: 'auto',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '11px',
                  color: '#7ee787',
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  userSelect: 'text'
                }}>
                  {diag.markdown_prompt}
                </pre>
              )}
            </div>
          </Modal>
        );
      })()}

    </div>
  );
};
