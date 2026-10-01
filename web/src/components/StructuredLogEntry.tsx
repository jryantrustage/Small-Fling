import React, { useState } from 'react';
import { Terminal, Copy, Check, Code, Eye } from 'lucide-react';
import type { TelemetryEvent } from '../types';
import { tryParseLogPayload } from '../utils/logParser';

interface StructuredLogEntryProps {
  ev: TelemetryEvent;
  onReturnAlignmentOverlay?: () => void;
  compact?: boolean;
}

export const StructuredLogEntry: React.FC<StructuredLogEntryProps> = ({ ev, onReturnAlignmentOverlay, compact = false }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const isAlignmentEv = ev.message.toLowerCase().includes('not aligned') || ev.message.toLowerCase().includes('alignment');
  const parsed = tryParseLogPayload(ev.message);

  const handleCopyRaw = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ev.message);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  if (!parsed) {
    return (
      <div className={`event-log-entry cat-${(ev.category || 'system').toLowerCase()}`}>
        <span className="event-time">{ev.timestamp}</span>
        <span className={`event-cat-tag ${(ev.category || 'system').toLowerCase()}`}>{ev.category || 'SYS'}</span>
        {ev.dag && ev.dag !== 'all' && (
          <span style={{
            fontSize: '8.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px',
            background: ev.dag === 'initialize' ? 'rgba(88, 166, 255, 0.15)' : 'rgba(0, 255, 157, 0.15)',
            color: ev.dag === 'initialize' ? '#58a6ff' : '#00ff9d', flexShrink: 0
          }}>
            {ev.dag === 'initialize' ? 'DAG 1' : 'DAG 2'}
          </span>
        )}
        <span className="event-msg">{ev.message}</span>
        {isAlignmentEv && onReturnAlignmentOverlay && (
          <button
            type="button"
            className="toaster-event-return-btn"
            onClick={(e) => { e.stopPropagation(); onReturnAlignmentOverlay(); }}
            title="Return Alignment Alert Overlay"
          >
            <Eye size={11} /><span>Overlay</span>
          </button>
        )}
      </div>
    );
  }

  // Structured Error / Diagnostic Template Card
  return (
    <div className="event-log-structured-card">
      <div className="structured-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          <span className="event-time">{ev.timestamp}</span>
          {parsed.statusCode && (
            <span className="status-code-badge error">
              {parsed.statusCode}
            </span>
          )}
          {parsed.nodeId && (
            <span className="node-badge">
              NODE: {parsed.nodeId}
            </span>
          )}
          <span className="structured-card-title" title={parsed.message}>
            {parsed.message || 'Diagnostic Payload'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <button
            type="button"
            className="structured-btn"
            onClick={handleCopyRaw}
            title="Copy error message payload"
          >
            {copiedRaw ? <Check size={10} color="#00ff9d" /> : <Copy size={10} />}
            <span>{copiedRaw ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            className="structured-btn"
            onClick={() => setShowRaw(!showRaw)}
            title="Toggle raw JSON/Python payload block"
          >
            <Code size={10} />
            <span>{showRaw ? 'Hide' : 'JSON'}</span>
          </button>
        </div>
      </div>

      {/* DAG Context Badges */}
      {parsed.dagContext && (
        <div className="structured-context-bar">
          {parsed.dagContext.display_id !== undefined && <span>Disp #{parsed.dagContext.display_id}</span>}
          {parsed.dagContext.serial && <span>Device: {String(parsed.dagContext.serial).split(':')[0]}</span>}
          {parsed.dagContext.top_line_detected !== undefined && parsed.dagContext.bottom_line_detected !== undefined && (
            <span>Gutter: Ln {parsed.dagContext.top_line_detected}→{parsed.dagContext.bottom_line_detected}</span>
          )}
          {parsed.dagContext.active_dpi && <span>{parsed.dagContext.active_dpi} DPI ({parsed.dagContext.dpi_factor || 1}x)</span>}
        </div>
      )}

      {/* Trace Insights */}
      {parsed.traceInsights && parsed.traceInsights.length > 0 && (
        <div className="structured-insights-box">
          <div className="insights-title"><Terminal size={10} color="#58a6ff" /> Trace Insights:</div>
          <ul className="insights-list">
            {parsed.traceInsights.map((insight, idx) => (
              <li key={idx}><code>{insight}</code></li>
            ))}
          </ul>
        </div>
      )}

      {/* Troubleshooting Steps */}
      {parsed.troubleshootingSteps && parsed.troubleshootingSteps.length > 0 && !compact && (
        <div className="structured-steps-box">
          <div className="steps-title">Troubleshooting Recommendations:</div>
          <div className="steps-grid">
            {parsed.troubleshootingSteps.map(st => (
              <div key={st.step} className="step-card">
                <span className="step-num">{st.step}</span>
                <div className="step-text">
                  <strong>{st.title}</strong>
                  <p>{st.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable Raw Payload View */}
      {showRaw && (
        <pre className="structured-raw-block">
          {typeof parsed.rawPayload === 'string'
            ? parsed.rawPayload
            : JSON.stringify(parsed.rawPayload, null, 2)}
        </pre>
      )}
    </div>
  );
};
