import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layers, RefreshCw, Check, X, Play, AlertTriangle,
  Maximize2, Minimize2, Square, Minus, Lock, Sliders,
  RotateCcw, LayoutGrid, ZoomIn, ZoomOut, Eye, Shrink, Expand, GripHorizontal,
  ShieldAlert, Unlock, Info, Shield, Keyboard, Monitor, Smartphone, FileText
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
import { DagNodeCard } from './components/dag/DagNodeCard';
import { DagNodePopover, DagBlockedDiagnosticBox } from './components/dag/DagNodePopover';
import { DagInspectorModal } from './components/dag/DagInspectorModal';
import { AiPerformancePromptModal } from './components/dag/AiPerformancePromptModal';
import { Dag2PerformanceReportModal } from './components/dag/Dag2PerformanceReportModal';
import {
  Dag4OcrFullInspectorModal,
  UniversalNodeConfigModal
} from './components/dag/DagConfigModals';

const DEFAULT_NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  init_end: { x: 50, y: 140 },
  reset_home: { x: 280, y: 140 },
  frame_acquire: { x: 520, y: 70 },
  local_ai_ocr: { x: 760, y: 70 },
  frame_ocr: { x: 520, y: 230 },
  arrow_down: { x: 760, y: 230 },
  verification_trigger: { x: 1000, y: 140 },
  document_assemble: { x: 1240, y: 140 }
};

const getStoredPositions = (): Record<string, { x: number; y: number }> => {
  try {
    const raw = localStorage.getItem('dag_node_positions');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_NODE_POSITIONS, ...parsed };
    }
  } catch {}
  return DEFAULT_NODE_POSITIONS;
};

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
  desktopKeyboardProhibited?: boolean;
  onToggleProhibitKeyboard?: (prohibit?: boolean) => void;
  desktopModeEnabled?: boolean;
  onToggleDesktopMode?: (enable: boolean) => void;
  desktopVerification?: any;
}

export const FlowDag: React.FC<FlowDagProps> = ({
  apiBase, activeProjectId, activeProject, onOpenSettings, activeDeviceSerial, currentTopLine = 0, currentBottomLine = 0,
  targetTotalLines = 0, currentPage = 1, isOrchestrating: _isOrchestrating = false, onRefresh,
  selectedDag = 'all', onSelectDag, selectedNodeId, onSelectNodeId,
  projectInitProgress, onDismissInitProgress, onRetryInit, eventsLog = [],
  onClose, isMinimized = false, onToggleMinimize,
  desktopKeyboardProhibited = true, onToggleProhibitKeyboard,
  desktopModeEnabled = true, onToggleDesktopMode,
  desktopVerification
}) => {
  // Navigation & selection state
  const [isMaximized, setIsMaximized] = useState(false);

  // Canvas height sizing state (persisted in localStorage)
  const [canvasHeight, setCanvasHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('dag_canvas_height');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 110 && val <= 850) return val;
      }
    } catch {}
    return 320;
  });

  const [isResizingHeight, setIsResizingHeight] = useState<boolean>(false);
  const resizeStartYRef = useRef<number>(0);
  const resizeStartHeightRef = useRef<number>(320);

  const handleStartResizeHeight = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingHeight(true);
    resizeStartYRef.current = e.clientY;
    resizeStartHeightRef.current = canvasHeight;

    const handleMove = (moveEvent: MouseEvent | PointerEvent) => {
      const delta = moveEvent.clientY - resizeStartYRef.current;
      const nextH = Math.min(850, Math.max(110, Math.round(resizeStartHeightRef.current + delta)));
      setCanvasHeight(nextH);
      try {
        localStorage.setItem('dag_canvas_height', String(nextH));
      } catch {}
    };

    const handleUp = () => {
      setIsResizingHeight(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleSetHeightPreset = (targetH: number) => {
    setCanvasHeight(targetH);
    if (targetH <= 180) {
      setPan(p => ({ x: p.x, y: -90 }));
    } else if (canvasHeight <= 180) {
      setPan(p => ({ x: p.x, y: 0 }));
    }
    try {
      localStorage.setItem('dag_canvas_height', String(targetH));
    } catch {}
  };

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
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [isDag2ReportModalOpen, setIsDag2ReportModalOpen] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isFixingQualifier, setIsFixingQualifier] = useState(false);
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

  // 2D Pan/Zoom Interactive Canvas & Node Wiring State
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>(getStoredPositions);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState<{ id: string; startCardX: number; startCardY: number; startClientX: number; startClientY: number } | null>(null);
  const [wiringState, setWiringState] = useState<{ active: boolean; fromNodeId: string; mouseX: number; mouseY: number } | null>(null);
  const [universalConfigNodeId, setUniversalConfigNodeId] = useState<string | null>(null);

  const isAnyModalOpen = isInspectorModalOpen || isPromptModalOpen || isTextModalOpen || isDag2ReportModalOpen || Boolean(universalConfigNodeId);

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
  const node3b = dagStatus.dag?.nodes?.local_ai_ocr || {};

  const isNode1Running = activeRunningId === 'init_end';
  const isNode2Running = activeRunningId === 'reset_home';
  const isNode1Error = node1.status === 'error' || Boolean(node1.error);
  const isNode1Calibrated = !isNode1Error && node1.status === 'completed' && (node1.total_lines || 0) > 0;

  const isInitGroupRunning = Boolean(runningGroupId === 'initialize' || initGroup.status === 'active' || isNode1Running || isNode2Running || (projectInitProgress?.active && projectInitProgress.status === 'running'));

  const isCaptureGroupRunning = Boolean(
    runningGroupId === 'capture_entire_markdown' ||
    captureGroup.status === 'active' ||
    (isLoopRunning && (activeRunningId === null || ['frame_acquire', 'local_ai_ocr'].includes(activeRunningId))) ||
    (activeRunningId !== null && ['frame_acquire', 'local_ai_ocr'].includes(activeRunningId))
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

  // Sync node positions from server DAG state if available
  useEffect(() => {
    if (dagStatus.dag?.nodes) {
      setNodePositions(prev => {
        let hasUpdates = false;
        const updated = { ...prev };
        for (const [nodeId, nData] of Object.entries(dagStatus.dag?.nodes || {})) {
          if (nData && (nData as any).position && typeof (nData as any).position.x === 'number' && typeof (nData as any).position.y === 'number') {
            if (!draggingNode || draggingNode.id !== nodeId) {
              const serverX = (nData as any).position.x;
              const serverY = (nData as any).position.y;
              if (!updated[nodeId] || Math.abs(updated[nodeId].x - serverX) > 1 || Math.abs(updated[nodeId].y - serverY) > 1) {
                updated[nodeId] = { x: serverX, y: serverY };
                hasUpdates = true;
              }
            }
          }
        }
        return hasUpdates ? updated : prev;
      });
    }
  }, [dagStatus.dag?.nodes, draggingNode]);

  // Window listeners for mouse & pointer interactions (pan canvas, drag cards, draw wires)
  useEffect(() => {
    const handleMove = (e: MouseEvent | PointerEvent) => {
      if (isPanning) {
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      } else if (draggingNode) {
        const dx = (e.clientX - draggingNode.startClientX) / zoom;
        const dy = (e.clientY - draggingNode.startClientY) / zoom;
        const newX = Math.max(10, Math.round(draggingNode.startCardX + dx));
        const newY = Math.max(10, Math.round(draggingNode.startCardY + dy));
        setNodePositions(prev => ({
          ...prev,
          [draggingNode.id]: { x: newX, y: newY }
        }));
      } else if (wiringState?.active && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - pan.x) / zoom;
        const mouseY = (e.clientY - rect.top - pan.y) / zoom;
        setWiringState(prev => prev ? ({ ...prev, mouseX, mouseY }) : null);
      }
    };

    const handleUp = () => {
      if (isPanning) {
        setIsPanning(false);
      }
      if (draggingNode) {
        const finalPos = nodePositions[draggingNode.id];
        if (finalPos) {
          try {
            const current = { ...nodePositions, [draggingNode.id]: finalPos };
            localStorage.setItem('dag_node_positions', JSON.stringify(current));
          } catch {}
          fetch(`${apiBase}/api/dag/nodes/${draggingNode.id}/position`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPos)
          }).catch(() => {});
        }
        setDraggingNode(null);
      }
      if (wiringState) {
        setWiringState(null);
      }
    };

    if (isPanning || draggingNode || wiringState) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
    }
  }, [isPanning, panStart, draggingNode, wiringState, zoom, pan, nodePositions, apiBase]);

  // Canvas interaction handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.dag-mini-node-compact') || (e.target as HTMLElement).closest('.dag-port-socket')) {
      return;
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseDownCard = (e: React.MouseEvent | React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    const pos = nodePositions[nodeId] || DEFAULT_NODE_POSITIONS[nodeId] || { x: 0, y: 0 };
    setDraggingNode({
      id: nodeId,
      startCardX: pos.x,
      startCardY: pos.y,
      startClientX: e.clientX,
      startClientY: e.clientY
    });
    handleSelectNode(nodeId);
  };

  const handleStartWiring = (e: React.MouseEvent, fromNodeId: string) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;
    setWiringState({ active: true, fromNodeId, mouseX, mouseY });
  };

  const handleCompleteWiring = (toNodeId: string) => {
    if (wiringState && wiringState.fromNodeId && wiringState.fromNodeId !== toNodeId) {
      handleConnectEdge(wiringState.fromNodeId, toNodeId);
    }
    setWiringState(null);
  };

  const handleConnectEdge = async (from: string, to: string) => {
    const isLoopback = from === 'document_assemble' && to === 'frame_acquire';
    const condition = isLoopback ? 'ON_LOOP_CONTINUE' : 'ON_SUCCESS';
    try {
      // Connect A -> B via POST /api/dag/connectors/connect
      let res = await fetch(`${apiBase}/api/dag/connectors/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_node: from, to_node: to, from, to, condition, enabled: true })
      });
      if (!res.ok) {
        res = await fetch(`${apiBase}/api/dag/edges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from_node: from, to_node: to, from, to, condition, enabled: true })
        });
      }
      const { data } = await parseApiResponse(res);
      setNodeFeedback({
        id: `edge_${from}_${to}`,
        message: data.message || `Wired ${from} ➔ ${to} (${condition}) ✔`,
        isError: false
      });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: `edge_${from}`, message: `Failed to wire edge: ${err.message}`, isError: true });
    }
  };

  const handleDeleteEdge = async (edgeId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/dag/edges/${encodeURIComponent(edgeId)}`, {
        method: 'DELETE'
      });
      const { data } = await parseApiResponse(res);
      setNodeFeedback({
        id: `del_${edgeId}`,
        message: data.message || `Severed wire edge ${edgeId} ✂️`,
        isError: false
      });
      onRefresh?.();
    } catch (err: any) {
      setNodeFeedback({ id: `del_${edgeId}`, message: `Failed to delete edge: ${err.message}`, isError: true });
    }
  };

  const handleSnapCleanLayout = async () => {
    try {
      const res = await fetch(`${apiBase}/api/dag/layout/clean`, { method: 'POST' });
      const { data } = await parseApiResponse(res);
      if (data?.layout) {
        setNodePositions(data.layout);
        try {
          localStorage.setItem('dag_node_positions', JSON.stringify(data.layout));
        } catch {}
      }
      setPan({ x: 0, y: canvasHeight <= 180 ? -90 : 0 });
      setZoom(1.0);
      setNodeFeedback({
        id: 'clean_layout',
        message: 'DAG snapped to clean topological layout ✔',
        isError: false
      });
    } catch (err: any) {
      setNodeFeedback({ id: 'clean_layout', message: `Layout snap error: ${err.message}`, isError: true });
    }
  };

  const getDraggingWirePath = () => {
    if (!wiringState) return '';
    const fromPos = nodePositions[wiringState.fromNodeId] || DEFAULT_NODE_POSITIONS[wiringState.fromNodeId] || { x: 0, y: 0 };
    const p1 = { x: fromPos.x + 185, y: fromPos.y + 31 };
    const p2 = { x: wiringState.mouseX, y: wiringState.mouseY };
    const dx = Math.max(30, Math.abs(p2.x - p1.x) / 2);
    return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
  };

  const renderActiveEdges = () => {
    const rawEdges = (dagStatus.dag?.edges && dagStatus.dag.edges.length > 0)
      ? dagStatus.dag.edges
      : [
          { id: 'init_end->reset_home', from: 'init_end', to: 'reset_home', condition: 'ON_SUCCESS', enabled: true },
          { id: 'reset_home->frame_acquire', from: 'reset_home', to: 'frame_acquire', condition: 'ON_SUCCESS', enabled: true },
          { id: 'frame_acquire->local_ai_ocr', from: 'frame_acquire', to: 'local_ai_ocr', condition: 'ON_SUCCESS', enabled: true },
          { id: 'local_ai_ocr->frame_ocr', from: 'local_ai_ocr', to: 'frame_ocr', condition: 'ON_SUCCESS', enabled: true },
          { id: 'frame_ocr->arrow_down', from: 'frame_ocr', to: 'arrow_down', condition: 'ON_SUCCESS', enabled: true },
          { id: 'arrow_down->verification_trigger', from: 'arrow_down', to: 'verification_trigger', condition: 'ON_SUCCESS', enabled: true },
          { id: 'verification_trigger->document_assemble', from: 'verification_trigger', to: 'document_assemble', condition: 'ON_SUCCESS', enabled: true },
          { id: 'document_assemble->frame_acquire', from: 'document_assemble', to: 'frame_acquire', condition: 'ON_LOOP_CONTINUE', enabled: true },
        ];

    return rawEdges.map((edge) => {
      const fromPos = nodePositions[edge.from] || DEFAULT_NODE_POSITIONS[edge.from] || { x: 0, y: 0 };
      const toPos = nodePositions[edge.to] || DEFAULT_NODE_POSITIONS[edge.to] || { x: 0, y: 0 };
      const p1 = { x: fromPos.x + 185, y: fromPos.y + 31 };
      const p2 = { x: toPos.x, y: toPos.y + 31 };

      const isLoopback = p2.x < p1.x || (edge as any).condition === 'ON_LOOP_CONTINUE' || Boolean((edge as any).is_loopback);
      let pathData = '';
      let midX = (p1.x + p2.x) / 2;
      let midY = (p1.y + p2.y) / 2;

      if (isLoopback) {
        const loopDrop = Math.max(90, Math.abs(p2.y - p1.y) + 70);
        pathData = `M ${p1.x} ${p1.y} C ${p1.x + 80} ${p1.y + loopDrop}, ${p2.x - 80} ${p2.y + loopDrop}, ${p2.x} ${p2.y}`;
        midX = (p1.x + p2.x) / 2;
        midY = Math.max(p1.y, p2.y) + loopDrop * 0.72;
      } else {
        const dx = Math.max(40, (p2.x - p1.x) / 2);
        pathData = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
        midX = (p1.x + p2.x) / 2;
        midY = (p1.y + p2.y) / 2;
      }

      const isRunning = activeRunningId === edge.from || activeRunningId === edge.to;
      const isSevered = (edge as any).enabled === false;
      const edgeColor = isSevered
        ? '#484f58'
        : (isLoopback ? '#00ff9d' : ((edge as any).condition === 'ON_ERROR' ? '#f85149' : '#58a6ff'));

      const edgeIdStr = edge.id || `${edge.from}->${edge.to}`;

      return (
        <g key={edgeIdStr} className="dag-wire-group">
          {/* Broad invisible hitbox for effortless clicking anywhere along the wire */}
          <path
            d={pathData}
            fill="none"
            stroke="transparent"
            strokeWidth="18"
            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleConnector(edge.from, edge.to, edgeIdStr);
            }}
          >
            <title>{`Connection: ${edge.from} ➔ ${edge.to} [${isSevered ? 'DISCONNECTED' : 'ACTIVE'}]\nClick anywhere along this wire to toggle or sever connection`}</title>
          </path>
          {/* Outer glow stroke */}
          <path
            d={pathData}
            fill="none"
            stroke={edgeColor}
            strokeWidth="5"
            opacity={isRunning ? 0.45 : (isSevered ? 0.05 : 0.18)}
            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleConnector(edge.from, edge.to, edgeIdStr);
            }}
          />
          {/* Main wire stroke */}
          <path
            d={pathData}
            fill="none"
            stroke={edgeColor}
            strokeWidth={isSevered ? 1.5 : 2.2}
            strokeDasharray={isSevered ? '4, 4' : (isRunning ? '7, 4' : undefined)}
            className={isRunning ? 'flow-wire-animated' : undefined}
            markerEnd={isSevered ? undefined : (isLoopback ? 'url(#dag-arrow-head-loop)' : 'url(#dag-arrow-head)')}
            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleConnector(edge.from, edge.to, edgeIdStr);
            }}
          />
          {/* Sleek Minimalist Midpoint Tag */}
          <g transform={`translate(${midX}, ${midY})`} style={{ pointerEvents: 'auto' }}>
            <rect
              x="-22"
              y="-7"
              width="44"
              height="14"
              rx="4"
              fill="#0d1117"
              stroke={edgeColor}
              strokeWidth="1"
            />
            <text
              x="-6"
              y="3"
              fill={edgeColor}
              fontSize="7"
              fontWeight="700"
              fontFamily="monospace"
              textAnchor="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {isSevered ? 'CUT' : (isLoopback ? 'LOOP' : ((edge as any).condition === 'ON_ERROR' ? 'ERR' : 'NEXT'))}
            </text>
            <circle
              cx="13"
              cy="0"
              r="4.5"
              fill="rgba(248, 81, 73, 0.15)"
              stroke="#f85149"
              strokeWidth="0.8"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteEdge(edgeIdStr);
              }}
            />
            <text
              x="13"
              y="2.2"
              fill="#ff7b72"
              fontSize="6.5"
              fontWeight="900"
              textAnchor="middle"
              style={{ cursor: 'pointer', pointerEvents: 'none' }}
            >
              ×
            </text>
          </g>
        </g>
      );
    });
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
      padding: canvasHeight <= 180 ? '6px 10px' : '8px 12px',
      color: '#e6edf3',
      fontFamily: 'var(--font-mono, monospace)',
      display: 'flex',
      flexDirection: 'column',
      gap: canvasHeight <= 180 ? '4px' : '6px',
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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <button
                type="button"
                onClick={() => handleToggleConnector('local_ai_ocr', 'frame_ocr', 'local_ai_ocr->frame_ocr')}
                disabled={Boolean(isTogglingConnector)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px',
                  borderRadius: '4px', border: `1px solid ${isConnector1Open ? 'rgba(63, 185, 80, 0.4)' : 'rgba(248, 81, 73, 0.4)'}`,
                  background: isConnector1Open ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                  color: isConnector1Open ? '#3fb950' : '#ff7b72',
                  fontSize: '8.5px', fontWeight: 700, cursor: 'pointer', height: '22px'
                }}
                title={isConnector1Open ? 'Connector (DAG 2➔3): Connected. Click to toggle.' : 'Connector (DAG 2➔3): Severed. Click to toggle.'}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isConnector1Open ? '#3fb950' : '#f85149' }} />
                <span>C1 (2➔3)</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleConnector('arrow_down', 'verification_trigger', 'arrow_down->verification_trigger')}
                disabled={Boolean(isTogglingConnector)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px',
                  borderRadius: '4px', border: `1px solid ${isConnector2Open ? 'rgba(63, 185, 80, 0.4)' : 'rgba(248, 81, 73, 0.4)'}`,
                  background: isConnector2Open ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                  color: isConnector2Open ? '#3fb950' : '#ff7b72',
                  fontSize: '8.5px', fontWeight: 700, cursor: 'pointer', height: '22px'
                }}
                title={isConnector2Open ? 'Connector (DAG 3➔4): Connected. Click to toggle.' : 'Connector (DAG 3➔4): Severed. Click to toggle.'}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isConnector2Open ? '#3fb950' : '#f85149' }} />
                <span>C2 (3➔4)</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleConnector('document_assemble', 'frame_acquire', 'document_assemble->frame_acquire')}
                disabled={Boolean(isTogglingConnector)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 6px',
                  borderRadius: '4px', border: `1px solid ${isLoopbackConnected ? 'rgba(63, 185, 80, 0.4)' : 'rgba(248, 81, 73, 0.4)'}`,
                  background: isLoopbackConnected ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                  color: isLoopbackConnected ? '#3fb950' : '#ff7b72',
                  fontSize: '8.5px', fontWeight: 700, cursor: 'pointer', height: '22px'
                }}
                title={isLoopbackConnected ? 'Loopback (8➔3): Connected. Click to toggle.' : 'Loopback (8➔3): Severed. Click to toggle.'}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isLoopbackConnected ? '#3fb950' : '#f85149' }} />
                <span>Loop (8➔3)</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaultFlow}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px',
                  borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(255, 255, 255, 0.03)', color: '#8b949e',
                  fontSize: '8.5px', fontWeight: 600, cursor: 'pointer', height: '22px'
                }}
                title="Reset all node connectors back to standard sequential pipeline"
              >
                <RotateCcw size={9} />
                <span>Reset</span>
              </button>
            </div>

            {/* Continuous Capture Loop Toggle */}
            <button
              type="button"
              onClick={handleToggleLoop}
              disabled={isInitGroupRunning}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 9px',
                borderRadius: '4px', border: `1px solid ${isLoopRunning ? '#f85149' : '#00ff9d'}`,
                background: isLoopRunning ? 'rgba(248, 81, 73, 0.15)' : 'rgba(0, 255, 157, 0.12)',
                color: isLoopRunning ? '#ff7b72' : '#00ff9d',
                fontSize: '9px', fontWeight: 700, cursor: isInitGroupRunning ? 'not-allowed' : 'pointer',
                letterSpacing: '0.2px', height: '22px'
              }}
              title={isLoopRunning ? 'Stop continuous capture loop' : 'Start continuous loop (Nodes 3→8 Repeating until 100% captured)'}
            >
              {isLoopRunning ? <Square size={9} fill="#ff7b72" /> : <Play size={9} fill="#00ff9d" />}
              <span>{isLoopRunning ? 'Stop Loop' : 'Run Loop'}</span>
            </button>

            {/* Prohibit Desktop Keyboard Toggle Button */}
            {onToggleProhibitKeyboard && (
              <button
                type="button"
                onClick={() => onToggleProhibitKeyboard(!desktopKeyboardProhibited)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${desktopKeyboardProhibited ? 'rgba(63, 185, 80, 0.6)' : 'rgba(210, 153, 34, 0.6)'}`,
                  background: desktopKeyboardProhibited ? 'rgba(63, 185, 80, 0.18)' : 'rgba(210, 153, 34, 0.18)',
                  color: desktopKeyboardProhibited ? '#3fb950' : '#e3b341',
                  fontSize: '9px', fontWeight: 800, cursor: 'pointer', height: '22px'
                }}
                title={desktopKeyboardProhibited
                  ? 'Desktop Soft Keyboard is PROHIBITED (Disabled at OS level so clicking nodes will NEVER pop open the keyboard). Click to allow.'
                  : 'Desktop Soft Keyboard is ALLOWED. Click to completely prohibit soft keyboard on desktop screen.'}
              >
                <Keyboard size={10} />
                <span>{desktopKeyboardProhibited ? 'KEYBOARD: BLOCKED' : 'BLOCK KEYBOARD'}</span>
              </button>
            )}

            {/* Desktop Mode / Phone Screen (Mouse) Toggle Button */}
            {onToggleDesktopMode && (
              <button
                type="button"
                onClick={() => onToggleDesktopMode(!desktopModeEnabled)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${
                    desktopModeEnabled
                      ? (desktopVerification?.hardware_connected ? 'rgba(63, 185, 80, 0.6)' : 'rgba(56, 139, 253, 0.6)')
                      : 'rgba(163, 113, 247, 0.6)'
                  }`,
                  background: desktopModeEnabled
                    ? (desktopVerification?.hardware_connected ? 'rgba(63, 185, 80, 0.18)' : 'rgba(56, 139, 253, 0.18)')
                    : 'rgba(163, 113, 247, 0.18)',
                  color: desktopModeEnabled
                    ? (desktopVerification?.hardware_connected ? '#3fb950' : '#58a6ff')
                    : '#d2a8ff',
                  fontSize: '9px', fontWeight: 800, cursor: 'pointer', height: '22px'
                }}
                title={desktopModeEnabled
                  ? (desktopVerification?.hardware_connected
                      ? `Desktop Mode ON (Connected to Display #${desktopVerification.external_display_id || 11}). Click to route mouse to phone screen.`
                      : 'Desktop Mode ARMED on Pixel 8. Developer options verified. Ready to plug in USB-C DP Alt Mode cable. Click to route mouse to phone.')
                  : 'Phone Screen Mode ON (Mouse routed to phone display 0, kiosk unlocked, keyboard enabled). Click to return to Desktop Mode.'}
              >
                {desktopModeEnabled ? <Monitor size={10} /> : <Smartphone size={10} />}
                <span>
                  {desktopModeEnabled
                    ? (desktopVerification?.hardware_connected ? 'DESKTOP ON (CONNECTED)' : 'DESKTOP (READY TO PLUG IN)')
                    : 'PHONE SCREEN (MOUSE)'}
                </span>
              </button>
            )}

            {/* Direct DAG 4 OCR Full Inspector Launch Button */}
            <button
              type="button"
              onClick={() => setIsTextModalOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(56, 189, 248, 0.55)',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontSize: '9px', fontWeight: 800, cursor: 'pointer', height: '22px',
                boxShadow: '0 0 8px rgba(56, 189, 248, 0.25)'
              }}
              title="Open DAG 4 OCR Full Inspector (Source Image Bounding Boxes, Gutter Overwrite & Live Connectors)"
            >
              <FileText size={10} />
              <span>OCR INSPECTOR</span>
            </button>

            {/* Window Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
              <button
                type="button"
                className="win-btn"
                onClick={() => {
                  if (canvasHeight <= 180) {
                    handleSetHeightPreset(320);
                  } else {
                    handleSetHeightPreset(150);
                  }
                }}
                title={canvasHeight <= 180 ? 'Expand DAG Area (Standard 320px)' : 'Reduce DAG Area (Compact 150px)'}
                style={{
                  width: '22px', height: '22px',
                  color: canvasHeight <= 180 ? '#00ff9d' : '#8b949e',
                  background: canvasHeight <= 180 ? 'rgba(0, 255, 157, 0.15)' : 'transparent',
                  border: canvasHeight <= 180 ? '1px solid rgba(0, 255, 157, 0.4)' : undefined
                }}
              >
                {canvasHeight <= 180 ? <Expand size={11} /> : <Shrink size={11} />}
              </button>
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

      {/* 2D PAN/ZOOM INTERACTIVE WIREABLE DAG CANVAS */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '6px' }}>
        {/* Canvas Toolbar & Subgraph Quick Runners */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '5px 10px',
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '7px',
          fontSize: '10px'
        }}>
          {/* Left: Subgraph Quick Runners */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#6e7681', letterSpacing: '0.3px' }}>SUBGRAPHS:</span>
            <button
              type="button"
              onClick={() => handleRunGroup('initialize')}
              disabled={runningGroupId !== null || runningNodeId !== null}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px',
                borderRadius: '4px', border: '1px solid rgba(88, 166, 255, 0.3)',
                background: 'rgba(88, 166, 255, 0.08)', color: '#58a6ff',
                fontSize: '8.5px', fontWeight: 600, cursor: 'pointer'
              }}
              title="Run Init (Nodes 1→2) to determine EOF and reset to Line 1"
            >
              <Play size={7.5} fill="#58a6ff" />
              <span>Init</span>
            </button>
            <button
              type="button"
              onClick={() => handleRunGroup('capture_entire_markdown')}
              disabled={runningGroupId !== null || runningNodeId !== null}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px',
                borderRadius: '4px', border: '1px solid rgba(0, 255, 157, 0.3)',
                background: 'rgba(0, 255, 157, 0.08)', color: '#00ff9d',
                fontSize: '8.5px', fontWeight: 600, cursor: 'pointer'
              }}
              title="Run Capture (Nodes 3→4) to capture screen and transcribe markdown"
            >
              <Play size={7.5} fill="#00ff9d" />
              <span>Capture</span>
            </button>
            <button
              type="button"
              onClick={() => handleRunGroup('position_navigation')}
              disabled={runningGroupId !== null || runningNodeId !== null}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px',
                borderRadius: '4px', border: '1px solid rgba(255, 166, 87, 0.3)',
                background: 'rgba(255, 166, 87, 0.08)', color: '#ffa657',
                fontSize: '8.5px', fontWeight: 600, cursor: 'pointer'
              }}
              title="Run Navigate (Nodes 5→6) to OCR gutter and page down"
            >
              <Play size={7.5} fill="#ffa657" />
              <span>Navigate</span>
            </button>
            <button
              type="button"
              onClick={() => handleRunGroup('verify_assemble')}
              disabled={runningGroupId !== null || runningNodeId !== null}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px',
                borderRadius: '4px', border: '1px solid rgba(188, 140, 255, 0.3)',
                background: 'rgba(188, 140, 255, 0.08)', color: '#bc8cff',
                fontSize: '8.5px', fontWeight: 600, cursor: 'pointer'
              }}
              title="Run Assemble (Nodes 7→8) to verify continuity and assemble document"
            >
              <Play size={7.5} fill="#bc8cff" />
              <span>Assemble</span>
            </button>

            <div style={{ width: '1px', height: '14px', background: '#30363d', margin: '0 3px' }} />

            {/* Prohibit Desktop Keyboard Single Button */}
            {onToggleProhibitKeyboard && (
              <button
                type="button"
                onClick={() => onToggleProhibitKeyboard()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: desktopKeyboardProhibited ? '1px solid rgba(0, 255, 157, 0.45)' : '1px solid rgba(255, 166, 87, 0.4)',
                  background: desktopKeyboardProhibited ? 'rgba(0, 255, 157, 0.12)' : 'rgba(255, 166, 87, 0.08)',
                  color: desktopKeyboardProhibited ? '#00ff9d' : '#ffa657',
                  fontSize: '8.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title={desktopKeyboardProhibited ? "Desktop Keyboard Prohibited: Soft keyboard will never appear on desktop mode screen when running nodes (Click to allow keyboard)" : "Desktop Keyboard Allowed (Click to completely prohibit keyboard on desktop screen)"}
              >
                <Shield size={9} color={desktopKeyboardProhibited ? '#00ff9d' : '#ffa657'} />
                <span>{desktopKeyboardProhibited ? 'KEYBOARD: PROHIBITED' : 'KEYBOARD: ALLOWED'}</span>
              </button>
            )}

            {/* Toggle Desktop Mode / Phone Screen Mode */}
            {onToggleDesktopMode && (
              <button
                type="button"
                onClick={() => onToggleDesktopMode(!desktopModeEnabled)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: desktopModeEnabled
                    ? (desktopVerification?.hardware_connected ? '1px solid rgba(63, 185, 80, 0.6)' : '1px solid rgba(88, 166, 255, 0.4)')
                    : '1px solid rgba(255, 166, 87, 0.4)',
                  background: desktopModeEnabled
                    ? (desktopVerification?.hardware_connected ? 'rgba(63, 185, 80, 0.18)' : 'rgba(88, 166, 255, 0.12)')
                    : 'rgba(255, 166, 87, 0.12)',
                  color: desktopModeEnabled
                    ? (desktopVerification?.hardware_connected ? '#3fb950' : '#58a6ff')
                    : '#ffa657',
                  fontSize: '8.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title={desktopModeEnabled
                  ? (desktopVerification?.hardware_connected
                      ? `Desktop Mode ON (Connected to Display #${desktopVerification.external_display_id || 11}). Click to switch to Phone Screen.`
                      : 'Desktop Mode ARMED on Pixel 8. Developer options verified. Ready to plug in USB-C DP Alt Mode cable. Click to switch to Phone Screen.')
                  : "Phone Screen Active (Mouse on Phone Screen, Kiosk Removed, Keyboard Ready for Auth). Click to return to Desktop Mode"}
              >
                {desktopModeEnabled ? <Monitor size={9} /> : <Smartphone size={9} />}
                <span>
                  {desktopModeEnabled
                    ? (desktopVerification?.hardware_connected ? 'DESKTOP ON (CONNECTED)' : 'DESKTOP (READY TO PLUG IN)')
                    : 'PHONE SCREEN (MOUSE)'}
                </span>
              </button>
            )}
          </div>

          {/* Right: Layout Snap, Zoom & Pan Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={handleSnapCleanLayout}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px',
                borderRadius: '4px', border: '1px solid rgba(0, 255, 157, 0.4)',
                background: 'rgba(0, 255, 157, 0.12)', color: '#00ff9d',
                fontSize: '9px', fontWeight: 800, cursor: 'pointer'
              }}
              title="Auto-align all nodes topologically and horizontally on the 2D canvas"
            >
              <LayoutGrid size={11} />
              <span>Snap Clean Layout</span>
            </button>

            {/* Direct DAG 4 OCR Full Inspector Launcher */}
            <button
              type="button"
              onClick={() => setIsTextModalOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px',
                borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.45)',
                background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8',
                fontSize: '9px', fontWeight: 800, cursor: 'pointer'
              }}
              title="Open DAG 4 OCR Full Inspector: View source image, line bounding boxes, and verbatim acquired text with live connectors"
            >
              <Eye size={11} />
              <span>DAG 4 OCR Full Inspector ↗</span>
            </button>

            {/* DAG Area Size Presets */}
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', padding: '1px', gap: '1px' }}>
              <button
                type="button"
                onClick={() => handleSetHeightPreset(150)}
                style={{
                  background: canvasHeight <= 180 ? 'rgba(0, 255, 157, 0.2)' : 'none',
                  border: 'none',
                  color: canvasHeight <= 180 ? '#00ff9d' : '#8b949e',
                  fontWeight: canvasHeight <= 180 ? 800 : 500,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '9px',
                  borderRadius: '3px'
                }}
                title="Reduce DAG area to compact ribbon (150px) - ideal for viewing document and verification lines below"
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => handleSetHeightPreset(320)}
                style={{
                  background: (canvasHeight > 180 && canvasHeight <= 380) ? 'rgba(56, 189, 248, 0.2)' : 'none',
                  border: 'none',
                  color: (canvasHeight > 180 && canvasHeight <= 380) ? '#38bdf8' : '#8b949e',
                  fontWeight: (canvasHeight > 180 && canvasHeight <= 380) ? 800 : 500,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '9px',
                  borderRadius: '3px'
                }}
                title="Standard DAG area size (320px)"
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => handleSetHeightPreset(500)}
                style={{
                  background: canvasHeight > 380 ? 'rgba(88, 166, 255, 0.2)' : 'none',
                  border: 'none',
                  color: canvasHeight > 380 ? '#58a6ff' : '#8b949e',
                  fontWeight: canvasHeight > 380 ? 800 : 500,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '9px',
                  borderRadius: '3px'
                }}
                title="Tall DAG area size (500px)"
              >
                Tall
              </button>
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', padding: '1px' }}>
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px 5px' }}
                title="Zoom Out"
              >
                <ZoomOut size={11} />
              </button>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#c9d1d9', minWidth: '32px', textAlign: 'center' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(2.0, Number((z + 0.1).toFixed(1))))}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px 5px' }}
                title="Zoom In"
              >
                <ZoomIn size={11} />
              </button>
              <button
                type="button"
                onClick={() => { setZoom(1.0); setPan({ x: 0, y: 0 }); }}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px 5px', borderLeft: '1px solid #30363d' }}
                title="Reset Zoom & Pan (1:1)"
              >
                <RotateCcw size={10} />
              </button>
            </div>

            <span style={{ fontSize: '8.5px', color: '#6e7681', fontFamily: 'var(--font-mono)' }}>
              Pan: {Math.round(pan.x)}, {Math.round(pan.y)}
            </span>
          </div>
        </div>

        {/* Interactive 2D Canvas Container */}
        <div
          ref={canvasRef}
          className="dag-interactive-canvas-container"
          onMouseDown={handleCanvasMouseDown}
          style={{
            width: '100%',
            height: isMaximized ? 'calc(100vh - 240px)' : `${canvasHeight}px`,
            minHeight: isMaximized ? '400px' : '110px',
            background: 'radial-gradient(circle at 50% 50%, #161b22 0%, #0d1117 100%)',
            border: '1.5px solid #30363d',
            borderRadius: isMaximized ? '9px' : '9px 9px 0 0',
            borderBottom: isMaximized ? '1.5px solid #30363d' : 'none',
            position: 'relative',
            overflow: 'hidden',
            cursor: isPanning ? 'grabbing' : (wiringState ? 'crosshair' : 'default'),
            userSelect: 'none',
            boxShadow: 'inset 0 0 24px rgba(0,0,0,0.65)',
            transition: isResizingHeight ? 'none' : 'height 0.15s ease'
          }}
        >
          {/* SVG Grid Blueprint Pattern */}
          <svg
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 0
            }}
          >
            <defs>
              <pattern
                id="dag-canvas-grid"
                width={24 * zoom}
                height={24 * zoom}
                patternUnits="userSpaceOnUse"
                patternTransform={`translate(${pan.x % (24 * zoom)}, ${pan.y % (24 * zoom)})`}
              >
                <path d={`M ${24 * zoom} 0 L 0 0 0 ${24 * zoom}`} fill="none" stroke="rgba(48, 54, 61, 0.4)" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dag-canvas-grid)" />
          </svg>

          {/* Pan/Zoom Transformed Plane */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '3200px',
              height: '2000px',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              pointerEvents: 'none'
            }}
          >
            {/* SVG Layer for Bezier Wire Connections */}
            <svg
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                overflow: 'visible',
                pointerEvents: 'none',
                zIndex: 1
              }}
            >
              <defs>
                <marker id="dag-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#58a6ff" />
                </marker>
                <marker id="dag-arrow-head-loop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#00ff9d" />
                </marker>
              </defs>

              {/* Render All Active Wires */}
              {renderActiveEdges()}

              {/* Render Wire Currently Being Dragged */}
              {wiringState && wiringState.active && (
                <path
                  d={getDraggingWirePath()}
                  fill="none"
                  stroke="#58a6ff"
                  strokeWidth="2.5"
                  strokeDasharray="5, 4"
                  className="drawing-wire-active"
                />
              )}
            </svg>

            {/* DOM Layer for Draggable Node Cards */}
            <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 2, pointerEvents: 'auto' }}>
              {NODES_METADATA.map((node) => {
                const pos = nodePositions[node.id] || DEFAULT_NODE_POSITIONS[node.id] || { x: 50, y: 140 };
                const status = getNodeLiveStatus(node.id);
                const attachedActions = dagStatus.dag?.nodes?.[node.id]?.attached_actions || [];
                const isTargetCandidate = Boolean(wiringState?.active && wiringState.fromNodeId !== node.id);
                const isWiringSource = Boolean(wiringState?.active && wiringState.fromNodeId === node.id);
                const isDimmed = effectiveSelectedDag !== 'all' && node.group !== effectiveSelectedDag;

                return (
                  <div
                    key={node.id}
                    style={{
                      position: 'absolute',
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                      opacity: isDimmed ? 0.35 : 1.0,
                      transition: 'opacity 0.2s ease',
                      zIndex: activeSelectedNodeId === node.id ? 20 : (pinnedHoverNodeId === node.id ? 15 : 5)
                    }}
                  >
                    <DagNodeCard
                      node={node}
                      status={status}
                      isSelected={activeSelectedNodeId === node.id}
                      isPinned={pinnedHoverNodeId === node.id}
                      isPulsingSwirl={activeRunningId === node.id}
                      copiedNodeId={copiedNodeId}
                      attachedActionsCount={attachedActions.length}
                      onSelect={() => handleSelectNode(node.id)}
                      onDoubleClick={() => setPinnedHoverNodeId(prev => prev === node.id ? null : node.id)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(prev => prev === node.id ? null : prev)}
                      onCopyForAi={() => handleCopyNodeDetailsForAi(node.id)}
                      onOpenPromptModal={() => handleOpenPromptModal(node.id)}
                      onOpenConfig={() => setUniversalConfigNodeId(node.id)}
                      onStartWiring={(e) => handleStartWiring(e, node.id)}
                      onCompleteWiring={() => handleCompleteWiring(node.id)}
                      isWiringSource={isWiringSource}
                      isWiringTargetCandidate={isTargetCandidate}
                      onMouseDownCard={(e) => handleMouseDownCard(e, node.id)}
                      onPointerDownCard={(e) => handleMouseDownCard(e, node.id)}
                      onPointerDownHeader={(e) => handleMouseDownCard(e, node.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Draggable Vertical Resize Bar for DAG Area */}
        {!isMaximized && (
          <div
            onMouseDown={handleStartResizeHeight}
            onPointerDown={handleStartResizeHeight}
            onDoubleClick={() => handleSetHeightPreset(320)}
            title="Drag vertically to reduce or enlarge DAG area size • Double-click to reset (320px)"
            className={`dag-area-resizer ${isResizingHeight ? 'resizing' : ''}`}
            style={{
              width: '100%',
              height: '14px',
              cursor: 'ns-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: isResizingHeight ? 'rgba(0, 255, 157, 0.16)' : '#161b22',
              border: '1.5px solid #30363d',
              borderTop: '1px solid rgba(48, 54, 61, 0.8)',
              borderRadius: '0 0 9px 9px',
              userSelect: 'none',
              transition: 'background 0.15s ease, border-color 0.15s ease'
            }}
          >
            <GripHorizontal size={14} color={isResizingHeight ? '#00ff9d' : '#8b949e'} />
            <div
              style={{
                width: '36px',
                height: '3px',
                borderRadius: '2px',
                background: isResizingHeight ? '#00ff9d' : '#484f58',
                boxShadow: isResizingHeight ? '0 0 6px #00ff9d' : 'none',
                transition: 'background 0.15s ease, width 0.15s ease'
              }}
            />
            <span style={{
              fontSize: '8.5px',
              fontWeight: 700,
              color: isResizingHeight ? '#00ff9d' : '#8b949e',
              fontFamily: 'var(--font-mono)',
              opacity: isResizingHeight ? 1 : 0.75
            }}>
              {canvasHeight}px {isResizingHeight ? '(dragging)' : '↕'}
            </span>
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
            setUniversalConfigNodeId(id);
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
          onOpenConfig={() => setUniversalConfigNodeId('verification_trigger')}
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

      {/* MODAL 4: DAG 4 OCR Full Inspector Modal (Source Image + Bounding Boxes + Connectors + Verbatim Text) */}
      <Dag4OcrFullInspectorModal
        isOpen={isTextModalOpen}
        onClose={() => setIsTextModalOpen(false)}
        apiBase={apiBase}
        initialImageId={node3b.image_id || 'dag_node3_capture_temp'}
        nodeExtractedText={node3b.extracted_text || ''}
        nodeLinesCount={node3b.lines_count || 0}
        nodeModelUsed={node3b.model_used || 'MiniCPM-V (Ollama)'}
        onRefresh={onRefresh}
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

      {/* MODAL 7: Universal Modular Node Configurator & Decoupled Observation Actions */}
      {universalConfigNodeId && (
        <UniversalNodeConfigModal
          isOpen={Boolean(universalConfigNodeId)}
          onClose={() => setUniversalConfigNodeId(null)}
          nodeId={universalConfigNodeId}
          nodeTitle={NODES_METADATA.find(n => n.id === universalConfigNodeId)?.fullName}
          apiBase={apiBase}
          activeSerial={activeDeviceSerial}
          nodeConfig={dagStatus.dag?.nodes?.[universalConfigNodeId]?.config || {}}
          initialAttachedActions={dagStatus.dag?.nodes?.[universalConfigNodeId]?.attached_actions || []}
          onSave={async (config, attachedActions) => {
            try {
              // 1. Persist attached observation & workaround actions
              const resActions = await fetch(`${apiBase}/api/dag/nodes/${universalConfigNodeId}/actions`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attached_actions: attachedActions })
              });
              await parseApiResponse(resActions);

              // 2. Persist node parameters universally for any node
              if (config && Object.keys(config).length > 0) {
                const resConfig = await fetch(`${apiBase}/api/dag/nodes/${universalConfigNodeId}/config`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(config)
                });
                await parseApiResponse(resConfig);
              }

              setNodeFeedback({
                id: `config_${universalConfigNodeId}`,
                message: `Saved configuration & attached actions for Node ${universalConfigNodeId} ✔`,
                isError: false
              });
              setUniversalConfigNodeId(null);
              onRefresh?.();
            } catch (err: any) {
              setNodeFeedback({
                id: `config_${universalConfigNodeId}`,
                message: `Failed to save configuration: ${err.message}`,
                isError: true
              });
            }
          }}
        />
      )}
    </div>
  );
};
