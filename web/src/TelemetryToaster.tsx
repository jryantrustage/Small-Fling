import React, { useState, useEffect, useRef } from 'react';
import { Activity, ChevronDown, ChevronUp, Radio, Coins, Terminal, Copy, Check, AlertTriangle, Play, Camera, ArrowDownCircle } from 'lucide-react';
import { StructuredLogEntry } from './components/StructuredLogEntry';

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  category: 'PACER' | 'FRAME' | 'OCR' | 'WS' | 'SYSTEM' | 'ERROR';
  message: string;
  data?: any;
  dag?: 'initialize' | 'capture_entire_markdown' | 'system' | 'all';
  device?: string;
  nodeId?: string;
  level?: 'info' | 'warning' | 'error' | 'success';
  traceInsights?: string[];
  troubleshootingSteps?: Array<{ step: number; title: string; description: string; action?: string; action_label?: string }>;
  markdownPrompt?: string;
  statusCode?: number | string;
}

export interface CaptureTelemetry {
  status?: 'idle' | 'capturing' | 'completed' | 'error';
  last_latency_ms?: number;
  last_capture_time?: string | null;
  display_id?: string | null;
  display_name?: string | null;
  resolution?: string | null;
  frame_bytes?: number;
  cache_hit?: boolean;
  settle_delay_ms?: number;
  total_captures?: number;
  page?: number;
  active_dpi?: number;
  dpi_factor?: number;
  error?: string | null;
}

const isEventForDag = (ev: TelemetryEvent, targetDag: 'all' | 'initialize' | 'capture_entire_markdown'): boolean => {
  if (targetDag === 'all') return true;
  if (ev.dag) {
    if (ev.dag === 'all') return true;
    return ev.dag === targetDag;
  }
  const msg = (ev.message || '').toLowerCase();
  const cat = (ev.category || '').toUpperCase();
  if (targetDag === 'initialize') {
    return msg.includes('init') || msg.includes('calibrat') || msg.includes('ctrl+end') ||
           msg.includes('ctrl+home') || msg.includes('gutter bounds') || msg.includes('line 1') ||
           msg.includes('node 1') || msg.includes('node 2') || msg.includes('workspace');
  }
  if (targetDag === 'capture_entire_markdown') {
    return cat === 'FRAME' || cat === 'PACER' || msg.includes('frame') ||
           msg.includes('capture') || msg.includes('ocr') || msg.includes('pacing') ||
           msg.includes('node 3') || msg.includes('node 4') || msg.includes('node 5') ||
           msg.includes('node 6') || msg.includes('step') || msg.includes('arrow');
  }
  return true;
};

const isEventForNode = (ev: TelemetryEvent, nodeId: string): boolean => {
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

const NODE_LABELS: Record<string, { step: string; name: string }> = {
  init_end: { step: '1', name: 'Determine Lines' },
  reset_home: { step: '2', name: 'Reset Line 1' },
  frame_acquire: { step: '3', name: 'Capture Screen' },
  local_ai_ocr: { step: '3b', name: 'Local AI OCR' },
  frame_ocr: { step: '4', name: 'Gutter OCR' },
  arrow_down: { step: '5', name: 'Navigation Step' },
  verification_trigger: { step: '6', name: 'Verify Trigger' },
};

export interface TelemetryData {
  device_id?: string;
  is_pacing?: boolean;
  current_page?: number;
  current_top_line?: number;
  current_bottom_line?: number;
  target_total_lines?: number;
  dwell_countdown_ms?: number;
  phase?: string;
  status_message?: string;
  last_heartbeat?: string | null;
  capture_telemetry?: CaptureTelemetry;
  pacer_calibration?: {
    auto_tune_factor?: number;
    line_pitch_px?: number;
    bottom_to_top_error?: number;
    wrapped_lines_detected?: number;
  };
  orchestration?: {
    status?: string;
    active_step?: string;
    device_model?: string;
    lines_per_page?: number;
    top_line?: number;
    bottom_line?: number;
    next_target_top?: number;
  };
}

export interface TelemetryToasterProps {
  telemetry: TelemetryData;
  tokenStats: {
    total_prompt_tokens: number;
    total_candidates_tokens: number;
    total_tokens: number;
    total_api_calls: number;
    estimated_cost_usd: number;
    mobile_tokens?: { prompt_tokens: number; candidates_tokens: number; total_tokens: number };
  };
  documentSummary: {
    total_lines: number;
    min_line: number;
    max_line: number;
    total_frames: number;
    issue_count: number;
    verified_overlap_lines?: number;
  };
  wsConnected: boolean;
  backendConnected: boolean;
  latencyMs: number;
  pipelineMode: 'cloud' | 'local';
  deviceModel: string;
  eventsLog: TelemetryEvent[];
  onClearEvents?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  isAlignmentDismissed?: boolean;
  isAligned?: boolean;
  onReturnAlignmentOverlay?: () => void;
  onOpenStudio?: () => void;
  selectedDag?: 'all' | 'initialize' | 'capture_entire_markdown';
  onSelectDag?: (dag: 'all' | 'initialize' | 'capture_entire_markdown') => void;
  selectedNodeId?: string | null;
  onSelectNodeId?: (nodeId: string | null) => void;
  apiBase?: string;
  onRefresh?: () => void;
  onOpenPromptModal?: (nodeId: string) => void;
}

export const TelemetryToaster: React.FC<TelemetryToasterProps> = ({
  telemetry, tokenStats, documentSummary, wsConnected, latencyMs, pipelineMode, deviceModel,
  eventsLog, onClearEvents, onExpandedChange, isAlignmentDismissed = false, isAligned = true,
  onReturnAlignmentOverlay, onOpenStudio, selectedDag = 'all', onSelectDag,
  selectedNodeId, onSelectNodeId, apiBase, onRefresh, onOpenPromptModal
}) => {
  const [internalSelectedDag, setInternalSelectedDag] = useState<'all' | 'initialize' | 'capture_entire_markdown'>(selectedDag);
  const currentDag = onSelectDag ? selectedDag : internalSelectedDag;
  const [isNodeTracingActive, setIsNodeTracingActive] = useState<boolean>(Boolean(selectedNodeId));
  const [isGrabbingNode3, setIsGrabbingNode3] = useState(false);
  const [node3TriggerFeedback, setNode3TriggerFeedback] = useState<string | null>(null);

  const handleTriggerNode3 = async () => {
    setIsGrabbingNode3(true);
    setNode3TriggerFeedback('Capturing external display frame...');
    try {
      const res = await fetch(`${apiBase || ''}/api/dag/nodes/frame_acquire/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fast_loop: true })
      });
      const data = await res.json();
      if (res.ok) {
        setNode3TriggerFeedback(data.message || `Acquired in ${data.duration_ms}ms ✔`);
        onRefresh?.();
      } else {
        setNode3TriggerFeedback(`Error: ${data.message || data.detail || 'Capture failed'}`);
      }
    } catch (err: any) {
      setNode3TriggerFeedback(`Failed: ${err.message}`);
    } finally {
      setIsGrabbingNode3(false);
      setTimeout(() => setNode3TriggerFeedback(null), 4000);
    }
  };

  useEffect(() => {
    if (selectedDag) {
      setInternalSelectedDag(selectedDag);
      if (selectedDag !== 'all') {
        setIsNodeTracingActive(false);
      }
    }
  }, [selectedDag]);

  const handleSelectDag = (dag: 'all' | 'initialize' | 'capture_entire_markdown') => {
    setIsNodeTracingActive(false);
    if (onSelectDag) onSelectDag(dag);
    else setInternalSelectedDag(dag);
  };

  useEffect(() => {
    if (selectedNodeId) setIsNodeTracingActive(true);
  }, [selectedNodeId]);

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem('mc_telemetry_expanded') === 'true'; } catch { return false; }
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'pacer' | 'tokens' | 'events'>('overview');
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  const handleLogScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 45;
    setIsUserScrolledUp(!isNearBottom);
  };

  const scrollToLatest = () => {
    setIsUserScrolledUp(false);
    logContainerRef.current?.scrollTo({ top: logContainerRef.current.scrollHeight, behavior: 'smooth' });
  };

  const filteredEventsLog = (selectedNodeId && isNodeTracingActive)
    ? eventsLog.filter(ev => isEventForNode(ev, selectedNodeId))
    : eventsLog.filter(ev => isEventForDag(ev, currentDag));

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    try { localStorage.setItem('mc_telemetry_expanded', String(next)); } catch {}
    onExpandedChange?.(next);
  };

  useEffect(() => { onExpandedChange?.(isExpanded); }, [isExpanded, onExpandedChange]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  // Only auto-scroll down if user has not scrolled up to inspect earlier logs/errors
  useEffect(() => {
    if (isExpanded && activeTab === 'events' && !isUserScrolledUp) {
      logContainerRef.current?.scrollTo({ top: logContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [filteredEventsLog, isExpanded, activeTab, isUserScrolledUp]);

  const handleCopySnapshot = () => {
    navigator.clipboard.writeText(JSON.stringify({ timestamp: new Date().toISOString(), selectedDag: currentDag, selectedNodeId, telemetry, tokenStats, documentSummary, latencyMs, wsConnected, pipelineMode, deviceModel, recentEvents: filteredEventsLog.slice(-10) }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const targetLines = telemetry.target_total_lines || 0;
  const currentBottom = telemetry.current_bottom_line || documentSummary.max_line || 0;
  const progressPercent = targetLines > 0 ? Math.min(100, Math.max(0, Math.round((currentBottom / targetLines) * 100))) : 0;
  const totalTokens = tokenStats.total_tokens + (tokenStats.mobile_tokens?.total_tokens || 0);

  const getHeartbeatAge = () => {
    if (!telemetry.last_heartbeat) return 'None';
    try {
      const s = Math.floor((now - new Date(telemetry.last_heartbeat).getTime()) / 1000);
      return s < 0 ? 'Just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
    } catch { return 'Unknown'; }
  };

  const phaseColors: Record<string, { bg: string; text: string; border: string }> = {
    PACING: { bg: 'rgba(0, 255, 157, 0.15)', text: 'var(--color-primary)', border: 'rgba(0, 255, 157, 0.35)' },
    RUNNING: { bg: 'rgba(0, 255, 157, 0.15)', text: 'var(--color-primary)', border: 'rgba(0, 255, 157, 0.35)' },
    STANDBY: { bg: 'rgba(88, 166, 255, 0.15)', text: '#58a6ff', border: 'rgba(88, 166, 255, 0.3)' },
    IDLE: { bg: 'rgba(88, 166, 255, 0.15)', text: '#58a6ff', border: 'rgba(88, 166, 255, 0.3)' },
    PAUSED: { bg: 'rgba(227, 179, 65, 0.15)', text: '#e3b341', border: 'rgba(227, 179, 65, 0.3)' },
    COMPLETED: { bg: 'rgba(188, 140, 255, 0.15)', text: '#bc8cff', border: 'rgba(188, 140, 255, 0.3)' },
  };
  const phaseStyle = phaseColors[(telemetry.phase || 'STANDBY').toUpperCase()] || { bg: 'rgba(139, 148, 158, 0.15)', text: '#8b949e', border: 'rgba(139, 148, 158, 0.3)' };

  return (
    <div className={`telemetry-toaster-wrapper ${isExpanded ? 'expanded' : 'collapsed'}`} data-testid="telemetry-toaster">
      {!isExpanded ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          {isAlignmentDismissed && !isAligned && onReturnAlignmentOverlay && (
            <button type="button" className="telemetry-toaster-alert-pill" onClick={(e) => { e.stopPropagation(); onReturnAlignmentOverlay(); }}>
              <AlertTriangle size={13} color="#fca5a5" /><span>NOT ALIGNED (Show Overlay ↗)</span>
            </button>
          )}
          <button
            className="telemetry-toaster-pill"
            onClick={toggleExpanded}
            title="Open Telemetry Monitor Sidebar"
            aria-label="Toggle Telemetry Monitor Sidebar"
          >
            <div className="pill-pulse-wrapper"><span className={`pill-pulse-dot ${wsConnected ? 'live' : 'offline'}`} /></div>
            <span className="pill-title">TELEMETRY</span><span className="pill-divider">|</span>
            {selectedNodeId && isNodeTracingActive ? (
              <>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#58a6ff', background: 'rgba(88, 166, 255, 0.2)', border: '1px solid rgba(88, 166, 255, 0.4)', padding: '1px 6px', borderRadius: '4px' }}>
                  🎯 Tracing: Node {NODE_LABELS[selectedNodeId]?.step || selectedNodeId}
                </span>
                <span className="pill-divider">|</span>
              </>
            ) : currentDag !== 'all' ? (
              <>
                <span style={{ fontSize: '9px', fontWeight: 800, color: currentDag === 'initialize' ? '#58a6ff' : '#00ff9d', background: currentDag === 'initialize' ? 'rgba(88, 166, 255, 0.15)' : 'rgba(0, 255, 157, 0.15)', padding: '1px 5px', borderRadius: '4px' }}>
                  {currentDag === 'initialize' ? 'DAG 1' : 'DAG 2'}
                </span>
                <span className="pill-divider">|</span>
              </>
            ) : null}
            <span className="pill-stat" style={{ color: phaseStyle.text }}>{telemetry.phase || 'IDLE'}</span><span className="pill-divider">|</span>
            <span className="pill-stat">⚡ {latencyMs > 0 ? `${latencyMs}ms` : '<10ms'}</span><span className="pill-divider">|</span>
            <span className="pill-stat">🪙 {totalTokens.toLocaleString()}</span>
            <ChevronUp size={14} className="pill-expand-icon" />
          </button>
        </div>
      ) : (
        <div className="telemetry-toaster-card">
          <div className="toaster-header">
            <div className="toaster-header-title-area">
              <div className="pill-pulse-wrapper"><span className={`pill-pulse-dot ${wsConnected ? 'live' : 'offline'}`} /></div>
              <span className="toaster-title">TELEMETRY MONITOR</span>
              <span className="toaster-phase-badge" style={{ background: phaseStyle.bg, color: phaseStyle.text, borderColor: phaseStyle.border }}>{telemetry.phase || 'STANDBY'}</span>

              {/* DAG Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(0, 0, 0, 0.4)', padding: '2px 4px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.08)', marginLeft: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleSelectDag('all')}
                  style={{
                    background: (!isNodeTracingActive && currentDag === 'all') ? '#21262d' : 'transparent',
                    border: (!isNodeTracingActive && currentDag === 'all') ? '1px solid #30363d' : 'none',
                    color: (!isNodeTracingActive && currentDag === 'all') ? '#e6edf3' : '#8b949e',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Show all telemetry activity"
                >
                  ALL
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDag('initialize')}
                  style={{
                    background: (!isNodeTracingActive && currentDag === 'initialize') ? 'rgba(88, 166, 255, 0.25)' : 'transparent',
                    border: (!isNodeTracingActive && currentDag === 'initialize') ? '1px solid #58a6ff66' : 'none',
                    color: (!isNodeTracingActive && currentDag === 'initialize') ? '#58a6ff' : '#8b949e',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Filter to DAG Group 1 (Initialize) activity"
                >
                  DAG 1: INIT
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDag('capture_entire_markdown')}
                  style={{
                    background: (!isNodeTracingActive && currentDag === 'capture_entire_markdown') ? 'rgba(0, 255, 157, 0.25)' : 'transparent',
                    border: (!isNodeTracingActive && currentDag === 'capture_entire_markdown') ? '1px solid #00ff9d66' : 'none',
                    color: (!isNodeTracingActive && currentDag === 'capture_entire_markdown') ? '#00ff9d' : '#8b949e',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Filter to DAG Group 2 (Capture) activity"
                >
                  DAG 2: CAPTURE
                </button>
                {selectedNodeId && (
                  <button
                    type="button"
                    onClick={() => setIsNodeTracingActive(p => !p)}
                    style={{
                      background: isNodeTracingActive ? 'rgba(88, 166, 255, 0.25)' : 'transparent',
                      border: `1px solid ${isNodeTracingActive ? '#58a6ff' : 'rgba(88, 166, 255, 0.4)'}`,
                      color: isNodeTracingActive ? '#58a6ff' : '#8b949e',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title={`Process tracing for Node ${NODE_LABELS[selectedNodeId]?.step || selectedNodeId}`}
                  >
                    <span>🎯 NODE {NODE_LABELS[selectedNodeId]?.step || ''}: {NODE_LABELS[selectedNodeId]?.name || selectedNodeId}</span>
                    {isNodeTracingActive && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onSelectNodeId?.(null); setIsNodeTracingActive(false); }}
                        style={{ marginLeft: '2px', opacity: 0.8, cursor: 'pointer', fontWeight: 800 }}
                        title="Clear node tracing filter"
                      >
                        ×
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="toaster-header-actions">
              {onOpenStudio && (
                <button
                  type="button"
                  className="toaster-btn-icon"
                  onClick={() => { toggleExpanded(); onOpenStudio(); }}
                  title="Open in Full Studio Drawer"
                  style={{ color: '#00ff9d', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  <span>STUDIO ↗</span>
                </button>
              )}
              <span className="toaster-latency-pill">{latencyMs > 0 ? `${latencyMs}ms RTT` : 'synced'}</span>
              <button className="toaster-btn-icon" onClick={handleCopySnapshot} title="Copy Snapshot">{copied ? <Check size={13} color="var(--color-primary)" /> : <Copy size={13} />}</button>
              <button className="toaster-btn-icon" onClick={toggleExpanded} title="Collapse Toaster"><ChevronDown size={15} /></button>
            </div>
          </div>

          <div className="toaster-tabs">
            {(['overview', 'pacer', 'tokens', 'events'] as const).map(tab => {
              const icons = { overview: Activity, pacer: Radio, tokens: Coins, events: Terminal };
              const Icon = icons[tab];
              const isTracingNode3 = (selectedNodeId === 'frame_acquire' && isNodeTracingActive);
              const labels = {
                overview: isTracingNode3
                  ? 'Node 3 Telemetry'
                  : (currentDag === 'initialize' ? 'DAG 1 Overview' : (currentDag === 'capture_entire_markdown' ? 'DAG 2 Overview' : 'Overview')),
                pacer: 'Device',
                tokens: 'Tokens & Cost',
                events: filteredEventsLog.length > 0 ? `Log (${filteredEventsLog.length})` : 'Log'
              };
              return (
                <button key={tab} className={`toaster-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                  <Icon size={12} /><span>{labels[tab]}</span>
                </button>
              );
            })}
          </div>

          <div className="toaster-body">
            {activeTab === 'overview' && (
              <div className="toaster-tab-content">
                {(selectedNodeId === 'frame_acquire' && isNodeTracingActive) ? (
                  <div className="telemetry-section-card" style={{ borderColor: 'rgba(0, 255, 157, 0.45)', background: 'linear-gradient(180deg, rgba(0, 255, 157, 0.05) 0%, rgba(13, 17, 23, 0.95) 100%)' }}>
                    <div className="section-card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: (telemetry.capture_telemetry?.status === 'capturing' || isGrabbingNode3) ? '#ffa657' : '#00ff9d', boxShadow: `0 0 8px ${(telemetry.capture_telemetry?.status === 'capturing' || isGrabbingNode3) ? '#ffa657' : '#00ff9d'}` }} />
                        <span style={{ color: '#00ff9d', fontWeight: 800 }}>NODE 3: SCREEN CAPTURE TELEMETRY</span>
                      </div>
                      <span className="progress-percent" style={{
                        color: (telemetry.capture_telemetry?.status === 'capturing' || isGrabbingNode3) ? '#ffa657' : (telemetry.capture_telemetry?.status === 'error' ? '#ff7b72' : '#00ff9d'),
                        fontSize: '10px',
                        fontWeight: 800
                      }}>
                        {(telemetry.capture_telemetry?.status === 'capturing' || isGrabbingNode3) ? 'CAPTURING ⚡' : (telemetry.capture_telemetry?.last_latency_ms ? `ACQUIRED (${telemetry.capture_telemetry.last_latency_ms}ms)` : 'READY ✔')}
                      </span>
                    </div>

                    {/* Primary 4-grid metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '8px' }}>
                      <div style={{ background: '#0d1117', padding: '6px 8px', borderRadius: '6px', border: '1px solid #30363d' }}>
                        <div style={{ fontSize: '9px', color: '#8b949e', fontWeight: 700 }}>ACQUISITION RTT (LATENCY)</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '2px', color: (telemetry.capture_telemetry?.last_latency_ms || 0) < 150 ? '#00ff9d' : ((telemetry.capture_telemetry?.last_latency_ms || 0) < 1500 ? '#58a6ff' : '#ffa657') }}>
                          {telemetry.capture_telemetry?.last_latency_ms ? `${telemetry.capture_telemetry.last_latency_ms}ms` : 'Ready'}
                          {telemetry.capture_telemetry?.cache_hit && <span style={{ fontSize: '9px', color: '#00ff9d', marginLeft: '5px', fontWeight: 600 }}>⚡ Hot Cache</span>}
                        </div>
                      </div>
                      <div style={{ background: '#0d1117', padding: '6px 8px', borderRadius: '6px', border: '1px solid #30363d' }}>
                        <div style={{ fontSize: '9px', color: '#8b949e', fontWeight: 700 }}>FRAME PAYLOAD & RES</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#f0f6fc', marginTop: '2px' }}>
                          {telemetry.capture_telemetry?.frame_bytes ? `${(telemetry.capture_telemetry.frame_bytes / 1024).toFixed(1)} KB` : 'Pending'}
                          <span style={{ fontSize: '9.5px', color: '#8b949e', marginLeft: '4px' }}>({telemetry.capture_telemetry?.resolution || '1080p'})</span>
                        </div>
                      </div>
                      <div style={{ background: '#0d1117', padding: '6px 8px', borderRadius: '6px', border: '1px solid #30363d' }}>
                        <div style={{ fontSize: '9px', color: '#8b949e', fontWeight: 700 }}>TARGET DISPLAY PIPELINE</div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#a371f7', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={telemetry.capture_telemetry?.display_id || ''}>
                          {telemetry.capture_telemetry?.display_name || 'MB16AMTR'} <span style={{ color: '#6e7681', fontSize: '9.5px' }}>#{String(telemetry.capture_telemetry?.display_id || '').slice(-6)}</span>
                        </div>
                      </div>
                      <div style={{ background: '#0d1117', padding: '6px 8px', borderRadius: '6px', border: '1px solid #30363d' }}>
                        <div style={{ fontSize: '9px', color: '#8b949e', fontWeight: 700 }}>CAPTURE SETTLE & SYNC</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#388bfd', marginTop: '3px' }}>
                          {telemetry.capture_telemetry?.settle_delay_ms ?? 40}ms <span style={{ color: '#8b949e', fontSize: '9.5px' }}>(Fast Settle)</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Controls row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '9px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Frame #{telemetry.capture_telemetry?.page || telemetry.current_page || 1}</span>
                        <span>•</span>
                        <span>{telemetry.capture_telemetry?.total_captures || 0} grabs</span>
                        {node3TriggerFeedback && (
                          <span style={{ color: node3TriggerFeedback.startsWith('Error') || node3TriggerFeedback.startsWith('Failed') ? '#ff7b72' : '#00ff9d', fontWeight: 700, marginLeft: '4px' }}>
                            {node3TriggerFeedback}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleTriggerNode3}
                        disabled={isGrabbingNode3}
                        style={{
                          background: isGrabbingNode3 ? 'rgba(255, 107, 37, 0.25)' : 'rgba(0, 255, 157, 0.15)',
                          border: `1px solid ${isGrabbingNode3 ? '#ff6b25' : '#00ff9d'}`,
                          color: isGrabbingNode3 ? '#ffa657' : '#00ff9d',
                          padding: '3px 9px',
                          borderRadius: '4px',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          cursor: isGrabbingNode3 ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Execute high-speed screen capture on external display and stream telemetry"
                      >
                        <Play size={9} />
                        <span>{isGrabbingNode3 ? 'Capturing...' : '⚡ Test Capture (Node 3)'}</span>
                      </button>
                    </div>
                  </div>
                ) : currentDag === 'initialize' ? (
                  <div className="telemetry-section-card" style={{ borderColor: 'rgba(88, 166, 255, 0.4)' }}>
                    <div className="section-card-header">
                      <span style={{ color: '#58a6ff' }}>DAG 1 INITIALIZATION TELEMETRY</span>
                      <span className="progress-percent" style={{ color: '#58a6ff' }}>
                        {targetLines > 0 ? 'CALIBRATED ✔' : 'PENDING'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '8px' }}>
                      <div style={{ background: '#0d1117', padding: '8px', borderRadius: '6px', border: '1px solid #30363d' }}>
                        <div style={{ fontSize: '10px', color: '#8b949e' }}>EOF TOTAL LINES (CTRL+END)</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: targetLines > 0 ? '#00ff9d' : '#8b949e', marginTop: '2px' }}>
                          {targetLines > 0 ? `${targetLines.toLocaleString()} Lines` : 'Not Calibrated'}
                        </div>
                      </div>
                      <div style={{ background: '#0d1117', padding: '8px', borderRadius: '6px', border: '1px solid #30363d' }}>
                        <div style={{ fontSize: '10px', color: '#8b949e' }}>HOME POSITION (CTRL+HOME)</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#a371f7', marginTop: '2px' }}>
                          Top Gutter Ln {telemetry.current_top_line || documentSummary.min_line || 1}
                        </div>
                      </div>
                    </div>
                    <div className="telemetry-progress-sub" style={{ marginTop: '8px' }}>
                      <span>Sub-10s Deterministic Navigation Actuator Active</span>
                      <span>Filtered to DAG Group 1</span>
                    </div>
                  </div>
                ) : (
                  <div className="telemetry-section-card">
                    <div className="section-card-header"><span>DOCUMENT CAPTURE PROGRESS</span><span className="progress-percent">{targetLines > 0 ? `${progressPercent}%` : '—'}</span></div>
                    <div className="telemetry-progress-bar-bg"><div className="telemetry-progress-bar-fill" style={{ width: targetLines > 0 ? `${progressPercent}%` : '0%' }} /></div>
                    <div className="telemetry-progress-sub"><span>{targetLines > 0 ? `Line ${currentBottom} of ${targetLines} target lines` : 'Awaiting calibration (Ctrl+End)'}</span><span>{documentSummary.total_frames} frames captured</span></div>
                    
                    {/* Compact Node 3 telemetry sub-strip in DAG 2 Overview */}
                    <div style={{ marginTop: '8px', padding: '5px 8px', borderRadius: '5px', background: 'rgba(0, 255, 157, 0.06)', border: '1px solid rgba(0, 255, 157, 0.22)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Camera size={11} color="#00ff9d" />
                        <span style={{ fontWeight: 700, color: '#00ff9d' }}>Node 3 Screen Grab:</span>
                        <span style={{ color: (telemetry.capture_telemetry?.last_latency_ms || 0) < 150 ? '#00ff9d' : '#ffa657', fontWeight: 800 }}>
                          {telemetry.capture_telemetry?.last_latency_ms ? `${telemetry.capture_telemetry.last_latency_ms}ms` : 'Ready'}
                        </span>
                        {telemetry.capture_telemetry?.cache_hit && <span style={{ fontSize: '8.5px', color: '#00ff9d', background: 'rgba(0,255,157,0.15)', padding: '0 3px', borderRadius: '3px' }}>⚡ Cache</span>}
                        {telemetry.capture_telemetry?.frame_bytes ? <span style={{ color: '#8b949e' }}>• {(telemetry.capture_telemetry.frame_bytes / 1024).toFixed(0)} KB</span> : null}
                        <span style={{ color: '#8b949e' }}>• {telemetry.capture_telemetry?.display_name || 'MB16AMTR'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleTriggerNode3}
                        disabled={isGrabbingNode3}
                        style={{ background: 'transparent', border: 'none', color: '#00ff9d', fontWeight: 700, cursor: isGrabbingNode3 ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '3px', padding: '1px 4px' }}
                      >
                        <Play size={9} />
                        <span>{isGrabbingNode3 ? 'Grabbing...' : 'Grab'}</span>
                      </button>
                    </div>
                  </div>
                )}
                <div className="telemetry-tiles-grid">
                  <div className="telemetry-tile"><span className="tile-label">STATUS</span><span className="tile-value" style={{ color: phaseStyle.text, fontSize: '11px' }}>{telemetry.status_message || 'Matrix Capture Studio ready'}</span></div>
                  <div className="telemetry-tile"><span className="tile-label">VERIFIED LINES</span><span className="tile-value text-primary">{documentSummary.total_lines}{documentSummary.issue_count > 0 && <span className="tile-sub text-warning" style={{ marginLeft: '4px' }}>({documentSummary.issue_count} issues)</span>}</span></div>
                  <div className="telemetry-tile"><span className="tile-label">ESTIMATED SPEND</span><span className="tile-value text-cyan">${tokenStats.estimated_cost_usd.toFixed(4)}</span></div>
                  <div className="telemetry-tile"><span className="tile-label">NETWORK & WS</span><span className="tile-value">{wsConnected ? <span style={{ color: 'var(--color-primary)' }}>● WS Online</span> : <span style={{ color: 'var(--color-danger)' }}>○ WS Disconnected</span>}</span></div>
                </div>
              </div>
            )}

            {activeTab === 'pacer' && (
              <div className="toaster-tab-content">
                <div className="telemetry-pacer-grid">
                  {[
                    ['Target Device:', deviceModel === 'pixel_8' ? 'Google Pixel 8 (49L)' : 'Google Pixel 10 (49L)', 'val highlight'],
                    ['Active Step:', telemetry.orchestration?.active_step || telemetry.phase || 'IDLE', 'val font-mono'],
                    ['Current Page:', `Page #${telemetry.current_page || 1}`, 'val'],
                    ['Top Gutter Line:', `Ln ${telemetry.current_top_line || documentSummary.min_line || 0}`, 'val'],
                    ['Bottom Gutter Line:', `Ln ${telemetry.current_bottom_line || documentSummary.max_line || 0}`, 'val'],
                    ['Dwell Countdown:', `${telemetry.dwell_countdown_ms || 0}ms`, 'val'],
                    ['Pacer Auto-Tune Factor:', `${telemetry.pacer_calibration?.auto_tune_factor?.toFixed(2) || '1.00'}x`, 'val font-mono'],
                    ['Line Pitch (px):', `${telemetry.pacer_calibration?.line_pitch_px || 44}px`, 'val font-mono'],
                    ['Bottom-to-Top Error:', `${telemetry.pacer_calibration?.bottom_to_top_error || 0}px`, 'val font-mono'],
                    ['Wrapped Lines Detected:', String(telemetry.pacer_calibration?.wrapped_lines_detected || 0), 'val font-mono'],
                    ['Last Heartbeat:', getHeartbeatAge(), 'val font-mono'],
                  ].map(([lbl, val, cls]) => (
                    <div key={lbl} className="pacer-detail-row"><span className="lbl">{lbl}</span><span className={cls}>{val}</span></div>
                  ))}
                </div>

                {/* Dedicated Node 3 Capture Subsystem Diagnostics */}
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #30363d' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#00ff9d', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Camera size={11} color="#00ff9d" />
                    <span>NODE 3 SCREEN CAPTURE SUBSYSTEM</span>
                  </div>
                  <div className="telemetry-pacer-grid">
                    {[
                      ['Capture Engine:', 'Direct SurfaceFlinger / ADB screencap', 'val font-mono'],
                      ['Last Screen Grab RTT:', `${telemetry.capture_telemetry?.last_latency_ms || 0}ms`, 'val highlight font-mono'],
                      ['Target Display ID:', String(telemetry.capture_telemetry?.display_id || 'External Desktop'), 'val font-mono'],
                      ['Display Friendly Name:', telemetry.capture_telemetry?.display_name || 'MB16AMTR', 'val'],
                      ['Frame Payload Size:', telemetry.capture_telemetry?.frame_bytes ? `${(telemetry.capture_telemetry.frame_bytes / 1024).toFixed(1)} KB` : '0 KB', 'val font-mono'],
                      ['Frame Resolution:', telemetry.capture_telemetry?.resolution || '1920x1080', 'val font-mono'],
                      ['Hot Cache Reused:', telemetry.capture_telemetry?.cache_hit ? 'Yes (⚡ <60ms)' : 'No (Fresh HW Grab)', 'val font-mono'],
                      ['Total Node 3 Captures:', String(telemetry.capture_telemetry?.total_captures || 0), 'val font-mono'],
                    ].map(([lbl, val, cls]) => (
                      <div key={lbl} className="pacer-detail-row"><span className="lbl">{lbl}</span><span className={cls}>{val}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tokens' && (
              <div className="toaster-tab-content">
                <div className="telemetry-cost-banner">
                  <div className="cost-banner-left"><span className="cost-label">Total Estimated Cost</span><span className="cost-amount">${tokenStats.estimated_cost_usd.toFixed(4)} USD</span></div>
                  <span className="cost-engine-tag">{pipelineMode === 'cloud' ? 'Gemini 2.5 Flash' : 'Local MiniCPM-V 2.6'}</span>
                </div>
                <div className="telemetry-tokens-breakdown">
                  <div className="token-row"><span className="token-type">Total Combined Tokens</span><span className="token-count font-bold text-primary">{totalTokens.toLocaleString()}</span></div>
                  <div className="token-row sub"><span>↳ Cloud Server Prompt</span><span className="font-mono">{tokenStats.total_prompt_tokens.toLocaleString()}</span></div>
                  <div className="token-row sub"><span>↳ Cloud Server Candidates</span><span className="font-mono">{tokenStats.total_candidates_tokens.toLocaleString()}</span></div>
                  <div className="token-row sub"><span>↳ Mobile On-Device Tokens</span><span className="font-mono">{(tokenStats.mobile_tokens?.total_tokens || 0).toLocaleString()}</span></div>
                  <div className="token-row"><span className="token-type">Total Pipeline API Calls</span><span className="token-count font-bold text-cyan">{tokenStats.total_api_calls}</span></div>
                </div>
              </div>
            )}

            {activeTab === 'events' && (
              <div className="toaster-tab-content events-tab">
                <div className="events-toolbar">
                  <span className="events-count">
                    {filteredEventsLog.length} {currentDag !== 'all' ? `(${currentDag === 'initialize' ? 'DAG 1' : 'DAG 2'} filtered)` : 'recorded'} events
                  </span>
                  {onClearEvents && <button className="events-clear-btn" onClick={onClearEvents}>Clear</button>}
                </div>
                <div
                  className="events-log-container"
                  ref={logContainerRef}
                  onScroll={handleLogScroll}
                  style={{ position: 'relative' }}
                >
                  {filteredEventsLog.length === 0 ? (
                    <div className="events-empty">
                      {currentDag !== 'all' ? `No telemetry events for ${currentDag === 'initialize' ? 'DAG 1 (Initialize)' : 'DAG 2 (Capture)'} yet.` : 'No telemetry events recorded yet.'}
                    </div>
                  ) : filteredEventsLog.map((ev) => (
                    <StructuredLogEntry
                      key={ev.id}
                      ev={ev}
                      deviceModel={deviceModel}
                      onOpenPromptModal={onOpenPromptModal}
                      onReturnAlignmentOverlay={onReturnAlignmentOverlay}
                    />
                  ))}
                  <div ref={logEndRef} />

                  {isUserScrolledUp && (
                    <button
                      type="button"
                      className="events-scroll-latest-pill"
                      onClick={scrollToLatest}
                      title="Jump to latest telemetry events"
                    >
                      <ArrowDownCircle size={12} />
                      <span>Scroll to latest ({filteredEventsLog.length})</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

