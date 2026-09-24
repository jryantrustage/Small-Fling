import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, ChevronDown, ChevronUp, Radio, Coins,
  Terminal, Copy, Check, AlertTriangle, Eye
} from 'lucide-react';

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  category: 'PACER' | 'FRAME' | 'OCR' | 'WS' | 'SYSTEM' | 'ERROR';
  message: string;
  data?: any;
}

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
}

export const TelemetryToaster: React.FC<TelemetryToasterProps> = ({
  telemetry,
  tokenStats,
  documentSummary,
  wsConnected,
  latencyMs,
  pipelineMode,
  deviceModel,
  eventsLog,
  onClearEvents,
  onExpandedChange,
  isAlignmentDismissed = false,
  isAligned = true,
  onReturnAlignmentOverlay
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mc_telemetry_expanded') === 'true';
    } catch {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'pacer' | 'tokens' | 'events'>('overview');
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    try {
      localStorage.setItem('mc_telemetry_expanded', String(next));
    } catch {}
    if (onExpandedChange) onExpandedChange(next);
  };

  useEffect(() => {
    if (onExpandedChange) onExpandedChange(isExpanded);
  }, [isExpanded, onExpandedChange]);

  const handleCopySnapshot = () => {
    const snapshot = {
      timestamp: new Date().toISOString(),
      telemetry,
      tokenStats,
      documentSummary,
      latencyMs,
      wsConnected,
      pipelineMode,
      deviceModel,
      recentEvents: eventsLog.slice(-10)
    };
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Scroll to bottom of events log when new events arrive
  useEffect(() => {
    if (isExpanded && activeTab === 'events' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [eventsLog, isExpanded, activeTab]);

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const targetLines = telemetry.target_total_lines || 100;
  const currentBottom = telemetry.current_bottom_line || documentSummary.max_line || 0;
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentBottom / targetLines) * 100)));
  const totalTokens = tokenStats.total_tokens + (tokenStats.mobile_tokens?.total_tokens || 0);

  // Time since last heartbeat
  const getHeartbeatAge = () => {
    if (!telemetry.last_heartbeat) return 'None';
    try {
      const diffMs = now - new Date(telemetry.last_heartbeat).getTime();
      if (diffMs < 0) return 'Just now';
      const sec = Math.floor(diffMs / 1000);
      if (sec < 60) return `${sec}s ago`;
      return `${Math.floor(sec / 60)}m ago`;
    } catch {
      return 'Unknown';
    }
  };

  const getPhaseBadgeColor = (phase?: string) => {
    switch (phase?.toUpperCase()) {
      case 'PACING':
      case 'RUNNING':
        return { bg: 'rgba(0, 255, 157, 0.15)', text: 'var(--color-primary)', border: 'rgba(0, 255, 157, 0.35)' };
      case 'STANDBY':
      case 'IDLE':
        return { bg: 'rgba(88, 166, 255, 0.15)', text: '#58a6ff', border: 'rgba(88, 166, 255, 0.3)' };
      case 'PAUSED':
        return { bg: 'rgba(227, 179, 65, 0.15)', text: '#e3b341', border: 'rgba(227, 179, 65, 0.3)' };
      case 'COMPLETED':
        return { bg: 'rgba(188, 140, 255, 0.15)', text: '#bc8cff', border: 'rgba(188, 140, 255, 0.3)' };
      default:
        return { bg: 'rgba(139, 148, 158, 0.15)', text: '#8b949e', border: 'rgba(139, 148, 158, 0.3)' };
    }
  };

  const phaseStyle = getPhaseBadgeColor(telemetry.phase || 'STANDBY');

  return (
    <div
      className={`telemetry-toaster-wrapper ${isExpanded ? 'expanded' : 'collapsed'}`}
      data-testid="telemetry-toaster"
    >
      {/* Collapsed Strip */}
      {!isExpanded ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          {isAlignmentDismissed && !isAligned && onReturnAlignmentOverlay && (
            <button
              type="button"
              className="telemetry-toaster-alert-pill"
              onClick={(e) => {
                e.stopPropagation();
                onReturnAlignmentOverlay();
              }}
              title="Markdown is not aligned and alert overlay is dismissed. Click to return overlay."
            >
              <AlertTriangle size={13} color="#fca5a5" />
              <span>NOT ALIGNED (Show Overlay ↗)</span>
            </button>
          )}
          <button
            className="telemetry-toaster-pill"
            onClick={toggleExpanded}
            title="Click to expand full Telemetry Monitor"
            aria-label="Expand Telemetry Monitor"
          >
            <div className="pill-pulse-wrapper">
              <span className={`pill-pulse-dot ${wsConnected ? 'live' : 'offline'}`} />
            </div>
            <span className="pill-title">TELEMETRY</span>
            <span className="pill-divider">|</span>
            <span className="pill-stat" style={{ color: phaseStyle.text }}>
              {telemetry.phase || 'IDLE'}
            </span>
            <span className="pill-divider">|</span>
            <span className="pill-stat" title="API RTT Latency">
              ⚡ {latencyMs > 0 ? `${latencyMs}ms` : '<10ms'}
            </span>
            <span className="pill-divider">|</span>
            <span className="pill-stat" title="Total Tokens">
              🪙 {totalTokens.toLocaleString()}
            </span>
            <ChevronUp size={14} className="pill-expand-icon" />
          </button>
        </div>
      ) : (
        /* Expanded Card */
        <div className="telemetry-toaster-card">
          {/* Header */}
          <div className="toaster-header">
            <div className="toaster-header-title-area">
              <div className="pill-pulse-wrapper">
                <span className={`pill-pulse-dot ${wsConnected ? 'live' : 'offline'}`} />
              </div>
              <span className="toaster-title">TELEMETRY MONITOR</span>
              <span
                className="toaster-phase-badge"
                style={{
                  background: phaseStyle.bg,
                  color: phaseStyle.text,
                  borderColor: phaseStyle.border
                }}
              >
                {telemetry.phase || 'STANDBY'}
              </span>
            </div>

            <div className="toaster-header-actions">
              <span className="toaster-latency-pill" title="Network round-trip latency">
                {latencyMs > 0 ? `${latencyMs}ms RTT` : 'synced'}
              </span>
              <button
                className="toaster-btn-icon"
                onClick={handleCopySnapshot}
                title="Copy Telemetry Snapshot JSON"
              >
                {copied ? <Check size={13} color="var(--color-primary)" /> : <Copy size={13} />}
              </button>
              <button
                className="toaster-btn-icon"
                onClick={toggleExpanded}
                title="Collapse Telemetry Toaster"
                aria-label="Collapse Toaster"
              >
                <ChevronDown size={15} />
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="toaster-tabs">
            <button
              className={`toaster-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <Activity size={12} />
              <span>Overview</span>
            </button>
            <button
              className={`toaster-tab ${activeTab === 'pacer' ? 'active' : ''}`}
              onClick={() => setActiveTab('pacer')}
            >
              <Radio size={12} />
              <span>Pacer & Device</span>
            </button>
            <button
              className={`toaster-tab ${activeTab === 'tokens' ? 'active' : ''}`}
              onClick={() => setActiveTab('tokens')}
            >
              <Coins size={12} />
              <span>Tokens & Cost</span>
            </button>
            <button
              className={`toaster-tab ${activeTab === 'events' ? 'active' : ''}`}
              onClick={() => setActiveTab('events')}
            >
              <Terminal size={12} />
              <span>Log ({eventsLog.length})</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="toaster-body">
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="toaster-tab-content">
                {/* Progress Bar */}
                <div className="telemetry-section-card">
                  <div className="section-card-header">
                    <span>DOCUMENT CAPTURE PROGRESS</span>
                    <span className="progress-percent">{progressPercent}%</span>
                  </div>
                  <div className="telemetry-progress-bar-bg">
                    <div
                      className="telemetry-progress-bar-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="telemetry-progress-sub">
                    <span>Line {currentBottom} of {targetLines} target lines</span>
                    <span>{documentSummary.total_frames} frames captured</span>
                  </div>
                </div>

                {/* Metric Tiles Grid */}
                <div className="telemetry-tiles-grid">
                  <div className="telemetry-tile">
                    <span className="tile-label">STATUS</span>
                    <span className="tile-value" style={{ color: phaseStyle.text, fontSize: '11px' }}>
                      {telemetry.status_message || 'Matrix Capture Studio ready'}
                    </span>
                  </div>

                  <div className="telemetry-tile">
                    <span className="tile-label">VERIFIED LINES</span>
                    <span className="tile-value text-primary">
                      {documentSummary.total_lines}
                      {documentSummary.issue_count > 0 && (
                        <span className="tile-sub text-warning" style={{ marginLeft: '4px' }}>
                          ({documentSummary.issue_count} issues)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="telemetry-tile">
                    <span className="tile-label">ESTIMATED SPEND</span>
                    <span className="tile-value text-cyan">
                      ${tokenStats.estimated_cost_usd.toFixed(4)}
                    </span>
                  </div>

                  <div className="telemetry-tile">
                    <span className="tile-label">NETWORK & WS</span>
                    <span className="tile-value">
                      {wsConnected ? (
                        <span style={{ color: 'var(--color-primary)' }}>● WS Online</span>
                      ) : (
                        <span style={{ color: 'var(--color-danger)' }}>○ WS Disconnected</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PACER & DEVICE */}
            {activeTab === 'pacer' && (
              <div className="toaster-tab-content">
                <div className="telemetry-pacer-grid">
                  <div className="pacer-detail-row">
                    <span className="lbl">Target Device:</span>
                    <span className="val highlight">{deviceModel === 'pixel_8' ? 'Google Pixel 8 (31L)' : 'Google Pixel 10 (36L)'}</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Active Step:</span>
                    <span className="val font-mono">{telemetry.orchestration?.active_step || (telemetry.is_pacing ? 'PACING' : 'IDLE')}</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Current Page:</span>
                    <span className="val">Page #{telemetry.current_page || 1}</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Top Gutter Line:</span>
                    <span className="val">Ln {telemetry.current_top_line || documentSummary.min_line || 0}</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Bottom Gutter Line:</span>
                    <span className="val">Ln {telemetry.current_bottom_line || documentSummary.max_line || 0}</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Dwell Countdown:</span>
                    <span className="val">{telemetry.dwell_countdown_ms ? `${telemetry.dwell_countdown_ms}ms` : '0ms'}</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Pacer Auto-Tune Factor:</span>
                    <span className="val font-mono">{telemetry.pacer_calibration?.auto_tune_factor?.toFixed(2) || '1.00'}x</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Line Pitch (px):</span>
                    <span className="val font-mono">{telemetry.pacer_calibration?.line_pitch_px || 44}px</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Bottom-to-Top Error:</span>
                    <span className="val font-mono">{telemetry.pacer_calibration?.bottom_to_top_error || 0}px</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Wrapped Lines Detected:</span>
                    <span className="val font-mono">{telemetry.pacer_calibration?.wrapped_lines_detected || 0}</span>
                  </div>
                  <div className="pacer-detail-row">
                    <span className="lbl">Last Heartbeat:</span>
                    <span className="val font-mono">{getHeartbeatAge()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TOKENS & COST */}
            {activeTab === 'tokens' && (
              <div className="toaster-tab-content">
                <div className="telemetry-cost-banner">
                  <div className="cost-banner-left">
                    <span className="cost-label">Total Estimated Cost</span>
                    <span className="cost-amount">${tokenStats.estimated_cost_usd.toFixed(4)} USD</span>
                  </div>
                  <span className="cost-engine-tag">
                    {pipelineMode === 'cloud' ? 'Gemini 2.5 Flash' : 'Local MiniCPM-V 2.6'}
                  </span>
                </div>

                <div className="telemetry-tokens-breakdown">
                  <div className="token-row">
                    <span className="token-type">Total Combined Tokens</span>
                    <span className="token-count font-bold text-primary">{totalTokens.toLocaleString()}</span>
                  </div>
                  <div className="token-row sub">
                    <span>↳ Cloud Server Prompt</span>
                    <span className="font-mono">{tokenStats.total_prompt_tokens.toLocaleString()}</span>
                  </div>
                  <div className="token-row sub">
                    <span>↳ Cloud Server Candidates</span>
                    <span className="font-mono">{tokenStats.total_candidates_tokens.toLocaleString()}</span>
                  </div>
                  <div className="token-row sub">
                    <span>↳ Mobile On-Device Tokens</span>
                    <span className="font-mono">{(tokenStats.mobile_tokens?.total_tokens || 0).toLocaleString()}</span>
                  </div>
                  <div className="token-row">
                    <span className="token-type">Total Pipeline API Calls</span>
                    <span className="token-count font-bold text-cyan">{tokenStats.total_api_calls}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: LIVE EVENTS LOG */}
            {activeTab === 'events' && (
              <div className="toaster-tab-content events-tab">
                <div className="events-toolbar">
                  <span className="events-count">{eventsLog.length} recorded events</span>
                  {onClearEvents && (
                    <button className="events-clear-btn" onClick={onClearEvents}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="events-log-container">
                  {eventsLog.length === 0 ? (
                    <div className="events-empty">No telemetry events recorded yet.</div>
                  ) : (
                    eventsLog.map((ev) => {
                      const isAlignmentEv =
                        ev.message.toLowerCase().includes('not aligned') ||
                        ev.message.toLowerCase().includes('alignment');
                      return (
                        <div
                          key={ev.id}
                          className="event-log-entry"
                          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <span className="event-time">{ev.timestamp}</span>
                          <span className={`event-cat-tag ${ev.category.toLowerCase()}`}>
                            {ev.category}
                          </span>
                          <span className="event-msg" style={{ flex: 1 }}>{ev.message}</span>
                          {isAlignmentEv && onReturnAlignmentOverlay && (
                            <button
                              type="button"
                              className="toaster-event-return-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReturnAlignmentOverlay();
                              }}
                              title="Click to return and highlight Alignment Alert Overlay"
                            >
                              <Eye size={11} />
                              <span>Show Overlay</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
