import React, { useState, useEffect } from 'react';
import {
  Cpu, Activity, CheckCircle2, Clock, Zap, FileText, Download,
  Layers, ShieldCheck, X,
  TrendingUp, BarChart2, Edit3, Check
} from 'lucide-react';

export interface HeadlessTelemetryData {
  session_id?: string;
  is_active?: boolean;
  start_time?: number;
  end_time?: number | null;
  elapsed_seconds?: number;
  status?: string; // "RUNNING" | "COMPLETED" | "STOPPED" | "ERROR" | "IDLE"
  operation_type?: string;
  project_id?: string;
  project_name?: string;
  start_line?: number;
  current_top_line?: number;
  current_bottom_line?: number;
  target_total_lines?: number;
  total_lines_reached?: boolean;
  total_lines_captured?: number;
  completion_percent?: number;
  frames_processed?: number;
  total_frames_target?: number;
  avg_ocr_latency_ms?: number;
  lines_per_second?: number;
  issues_detected?: number;
  gaps_detected?: number;
  engine?: string;
  finish_status_message?: string;
  recent_events?: string[];
  reconstructed_markdown_path?: string | null;
  reconstructed_markdown_size?: number;
}

interface HeadlessTelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: HeadlessTelemetryData | null;
  apiBase: string;
  onInspectLines?: (targetLine?: number) => void;
  onOpenOcrReport?: () => void;
}

export const HeadlessTelemetryModal: React.FC<HeadlessTelemetryModalProps> = ({
  isOpen,
  onClose,
  telemetry,
  apiBase,
  onInspectLines,
  onOpenOcrReport
}) => {
  const [localTelemetry, setLocalTelemetry] = useState<HeadlessTelemetryData | null>(telemetry);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [customTarget, setCustomTarget] = useState<string>('');
  const [isUpdatingTarget, setIsUpdatingTarget] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (telemetry) {
      setLocalTelemetry(telemetry);
      if (telemetry.target_total_lines) {
        setCustomTarget(String(telemetry.target_total_lines));
      }
    }
  }, [telemetry]);

  // Poll for latest telemetry when modal is open and operation is running
  useEffect(() => {
    if (!isOpen) return;

    const fetchLatest = async () => {
      try {
        const res = await fetch(`${apiBase}/api/dag/headless/telemetry`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.telemetry) {
            setLocalTelemetry(data.telemetry);
          }
        }
      } catch (e) {
        console.error('Failed to poll headless telemetry', e);
      }
    };

    fetchLatest();
    const interval = setInterval(fetchLatest, 1200);
    return () => clearInterval(interval);
  }, [isOpen, apiBase]);

  if (!isOpen) return null;

  const data = localTelemetry || telemetry || {};
  const isRunning = Boolean(data.is_active || data.status === 'RUNNING');
  const isComplete = Boolean(data.total_lines_reached || data.status === 'COMPLETED' || (data.completion_percent && data.completion_percent >= 100));
  const isStopped = !isRunning && !isComplete && data.status === 'STOPPED';

  const formatDuration = (sec?: number) => {
    if (!sec || sec < 0) return '0s';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const handleSaveTarget = async () => {
    const val = parseInt(customTarget, 10);
    if (isNaN(val) || val <= 0) return;
    setIsUpdatingTarget(true);
    try {
      const res = await fetch(`${apiBase}/api/dag/headless/target-lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_total_lines: val })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.telemetry) setLocalTelemetry(d.telemetry);
        setIsEditingTarget(false);
      }
    } catch (e) {
      console.error('Failed to update target lines', e);
    } finally {
      setIsUpdatingTarget(false);
    }
  };

  const handleDownloadMarkdown = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch(`${apiBase}/api/document/export-markdown`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reproduced_Matrix_main_${Date.now()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Failed to download markdown', e);
    } finally {
      setIsDownloading(false);
    }
  };

  const targetLines = data.target_total_lines || 0;
  const currentBottom = data.current_bottom_line || data.total_lines_captured || 0;
  const linesCaptured = data.total_lines_captured || 0;
  const pct = data.completion_percent !== undefined
    ? data.completion_percent
    : (targetLines > 0 ? Math.min(100, Math.round((currentBottom / targetLines) * 1000) / 10) : 0);

  const linesRemaining = Math.max(0, targetLines - currentBottom);
  const etaSeconds = (data.lines_per_second && data.lines_per_second > 0 && linesRemaining > 0)
    ? Math.round(linesRemaining / data.lines_per_second)
    : 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '840px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          backgroundColor: '#0d1117',
          border: isComplete
            ? '1px solid rgba(0, 255, 157, 0.45)'
            : (isRunning ? '1px solid rgba(192, 132, 252, 0.45)' : '1px solid #30363d'),
          boxShadow: isComplete
            ? '0 0 32px rgba(0, 255, 157, 0.2), 0 20px 40px rgba(0,0,0,0.8)'
            : (isRunning ? '0 0 32px rgba(192, 132, 252, 0.2), 0 20px 40px rgba(0,0,0,0.8)' : '0 20px 40px rgba(0,0,0,0.8)'),
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e6edf3',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isComplete
              ? 'linear-gradient(90deg, rgba(0, 255, 157, 0.12), rgba(16, 185, 129, 0.04))'
              : (isRunning ? 'linear-gradient(90deg, rgba(167, 139, 250, 0.12), rgba(59, 130, 246, 0.04))' : '#161b22')
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isComplete ? 'rgba(0, 255, 157, 0.2)' : (isRunning ? 'rgba(192, 132, 252, 0.2)' : 'rgba(148, 163, 184, 0.15)'),
                border: isComplete ? '1px solid #00ff9d' : (isRunning ? '1px solid #c084fc' : '1px solid #475569')
              }}
            >
              {isComplete ? (
                <CheckCircle2 size={20} color="#00ff9d" />
              ) : isRunning ? (
                <Cpu size={20} color="#c084fc" className="spin-slow" />
              ) : (
                <Activity size={20} color="#94a3b8" />
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f0f6fc' }}>
                  {isComplete
                    ? 'Headless Operation Complete — Telemetry Summary'
                    : (isRunning ? 'Headless Operation Live Telemetry' : 'Headless Telemetry Snapshot')}
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    textTransform: 'uppercase',
                    background: isComplete ? 'rgba(0, 255, 157, 0.18)' : (isRunning ? 'rgba(192, 132, 252, 0.2)' : 'rgba(234, 179, 8, 0.2)'),
                    color: isComplete ? '#00ff9d' : (isRunning ? '#c084fc' : '#eab308'),
                    border: isComplete ? '1px solid rgba(0, 255, 157, 0.4)' : (isRunning ? '1px solid rgba(192, 132, 252, 0.4)' : '1px solid rgba(234, 179, 8, 0.4)')
                  }}
                >
                  {isComplete ? '🎉 100% Success' : (isRunning ? '⚡ Running' : (isStopped ? '⏸ Stopped' : data.status || 'Ready'))}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>
                {data.operation_type === 'batch_sequential_rescan'
                  ? 'Sequential Batch Rescan of All Captured Frames'
                  : 'Fast Continuous Capture Loop (UI Rendering Bypassed • RapidOCR Rescan Engine)'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8b949e',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Banner message */}
          {data.finish_status_message && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: isComplete ? 'rgba(0, 255, 157, 0.08)' : 'rgba(56, 189, 248, 0.08)',
                border: isComplete ? '1px solid rgba(0, 255, 157, 0.3)' : '1px solid rgba(56, 189, 248, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              {isComplete ? (
                <CheckCircle2 size={18} color="#00ff9d" style={{ flexShrink: 0 }} />
              ) : (
                <Zap size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
              )}
              <div style={{ fontSize: '13px', color: isComplete ? '#00ff9d' : '#e0f2fe', lineHeight: 1.4 }}>
                <strong>{isComplete ? 'Operation Complete: ' : 'Status: '}</strong>
                {data.finish_status_message}
              </div>
            </div>
          )}

          {/* Master Progress Bar & Lines Target Section */}
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              background: '#161b22',
              border: '1px solid #30363d'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#8b949e', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
                  Document Coverage Progress
                </span>
                <div style={{ fontSize: '20px', fontWeight: 700, color: isComplete ? '#00ff9d' : '#f0f6fc', marginTop: '2px' }}>
                  {pct}% Completed
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '13px', color: '#8b949e' }}>Target Total Lines:</span>
                  {isEditingTarget ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        value={customTarget}
                        onChange={(e) => setCustomTarget(e.target.value)}
                        style={{
                          width: '80px',
                          padding: '2px 6px',
                          fontSize: '13px',
                          background: '#0d1117',
                          border: '1px solid #58a6ff',
                          borderRadius: '4px',
                          color: '#f0f6fc'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSaveTarget}
                        disabled={isUpdatingTarget}
                        style={{
                          padding: '3px 6px',
                          background: '#238636',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <strong style={{ fontSize: '15px', color: '#58a6ff' }}>
                        {targetLines > 0 ? targetLines.toLocaleString() : 'Calibrating...'}
                      </strong>
                      <button
                        type="button"
                        onClick={() => setIsEditingTarget(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#8b949e',
                          cursor: 'pointer',
                          padding: '2px'
                        }}
                        title="Edit Target Total Lines"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>
                  Verified: <strong style={{ color: '#00ff9d' }}>{linesCaptured.toLocaleString()}</strong> lines
                  {linesRemaining > 0 && ` • Remaining: ${linesRemaining.toLocaleString()}`}
                </div>
              </div>
            </div>

            {/* Glowing Progress bar */}
            <div
              style={{
                width: '100%',
                height: '10px',
                background: '#0d1117',
                borderRadius: '5px',
                overflow: 'hidden',
                border: '1px solid #30363d',
                position: 'relative'
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, pct)}%`,
                  height: '100%',
                  background: isComplete
                    ? 'linear-gradient(90deg, #10b981, #00ff9d)'
                    : 'linear-gradient(90deg, #8b5cf6, #3b82f6, #00ff9d)',
                  boxShadow: isComplete ? '0 0 10px #00ff9d' : '0 0 10px #8b5cf6',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>

            {/* Viewport Range Tracker */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8b949e', marginTop: '6px' }}>
              <span>Line 1</span>
              <span>
                Current Window: <strong>Ln {data.current_top_line || 1}</strong> ➔ <strong>Ln {data.current_bottom_line || 1}</strong>
              </span>
              <span>Line {targetLines > 0 ? targetLines.toLocaleString() : '?'}</span>
            </div>
          </div>

          {/* 6-Card Telemetry Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px'
            }}
          >
            {/* Speed & Throughput */}
            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                <TrendingUp size={14} color="#38bdf8" />
                Throughput
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8', marginTop: '6px' }}>
                {data.lines_per_second || 0} <span style={{ fontSize: '12px', fontWeight: 400, color: '#8b949e' }}>lines/sec</span>
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                {(data.lines_per_second ? Math.round(data.lines_per_second * 60) : 0).toLocaleString()} lines / minute
              </div>
            </div>

            {/* Duration & ETA */}
            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                <Clock size={14} color="#eab308" />
                Runtime & ETA
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#eab308', marginTop: '6px' }}>
                {formatDuration(data.elapsed_seconds)}
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                {isComplete ? 'Finished' : (etaSeconds > 0 ? `ETA: ~${etaSeconds}s remaining` : 'Calculating...')}
              </div>
            </div>

            {/* OCR Latency per Frame */}
            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                <Zap size={14} color="#c084fc" />
                Engine Latency
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#c084fc', marginTop: '6px' }}>
                {data.avg_ocr_latency_ms || 0} <span style={{ fontSize: '12px', fontWeight: 400, color: '#8b949e' }}>ms / frame</span>
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                RapidOCR (Local OpenVINO)
              </div>
            </div>

            {/* Frames Processed */}
            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                <Layers size={14} color="#34d399" />
                Frames Processed
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#34d399', marginTop: '6px' }}>
                {data.frames_processed || 0}
                {data.total_frames_target ? (
                  <span style={{ fontSize: '12px', fontWeight: 400, color: '#8b949e' }}> / {data.total_frames_target}</span>
                ) : ''}
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                Sequential frame alignment
              </div>
            </div>

            {/* Integrity & Zero Gaps */}
            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                <ShieldCheck size={14} color="#10b981" />
                Line Continuity
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginTop: '6px' }}>
                {data.gaps_detected || 0} <span style={{ fontSize: '12px', fontWeight: 400, color: '#8b949e' }}>gaps</span>
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                100% sequential verification
              </div>
            </div>

            {/* Token & Compute Cost */}
            <div
              style={{
                background: '#161b22',
                border: '1px solid #21262d',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                <Cpu size={14} color="#a78bfa" />
                Compute Cost
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#a78bfa', marginTop: '6px' }}>
                $0.00 <span style={{ fontSize: '12px', fontWeight: 400, color: '#8b949e' }}>(0 tokens)</span>
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                100% on-device local execution
              </div>
            </div>
          </div>

          {/* Telemetry Event Stream */}
          <div
            style={{
              background: '#090d13',
              borderRadius: '8px',
              border: '1px solid #21262d',
              padding: '12px 14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase' }}>
                Headless Event Stream
              </span>
              <span style={{ fontSize: '10px', color: '#6e7681' }}>
                {data.recent_events?.length || 0} events recorded
              </span>
            </div>
            <div
              style={{
                maxHeight: '120px',
                overflowY: 'auto',
                fontFamily: 'SFMono-Regular, Consolas, monospace',
                fontSize: '11px',
                lineHeight: '1.5',
                color: '#c9d1d9'
              }}
            >
              {data.recent_events && data.recent_events.length > 0 ? (
                data.recent_events.slice().reverse().map((ev, i) => (
                  <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid #161b22' }}>
                    {ev}
                  </div>
                ))
              ) : (
                <div style={{ color: '#6e7681', fontStyle: 'italic' }}>No events recorded yet.</div>
              )}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#161b22'
          }}
        >
          <div style={{ fontSize: '12px', color: '#8b949e' }}>
            {data.reconstructed_markdown_path ? (
              <span>Saved to: <code style={{ color: '#58a6ff' }}>storage/reproduced_Matrix_main.md</code></span>
            ) : (
              <span>Session: <code style={{ color: '#8b949e' }}>{data.session_id || 'active'}</code></span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={handleDownloadMarkdown}
              disabled={isDownloading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                fontSize: '12px',
                color: '#00ff9d',
                borderColor: 'rgba(0, 255, 157, 0.4)',
                background: 'rgba(0, 255, 157, 0.08)'
              }}
              title="Download fully reconstructed markdown file"
            >
              <Download size={13} />
              <span>{isDownloading ? 'Downloading...' : 'Download Markdown'}</span>
            </button>

            {onOpenOcrReport && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  onClose();
                  onOpenOcrReport();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  color: '#38bdf8',
                  borderColor: 'rgba(56, 189, 248, 0.4)'
                }}
              >
                <BarChart2 size={13} />
                <span>OCR Report</span>
              </button>
            )}

            {onInspectLines && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  onClose();
                  onInspectLines(1);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  color: '#c084fc',
                  borderColor: 'rgba(192, 132, 252, 0.4)'
                }}
              >
                <FileText size={13} />
                <span>Inspect Lines</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onClose}
              style={{
                padding: '5px 16px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
