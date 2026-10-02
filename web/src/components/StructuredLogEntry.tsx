import React, { useState } from 'react';
import { Terminal, Copy, Check, Code, Eye, Smartphone, Sparkles, ArrowRight } from 'lucide-react';
import type { TelemetryEvent } from '../types';
import { tryParseLogPayload } from '../utils/logParser';
import { copyToClipboard } from '../utils/dagDiagnostics';

interface StructuredLogEntryProps {
  ev: TelemetryEvent;
  onReturnAlignmentOverlay?: () => void;
  onOpenPromptModal?: (nodeId: string) => void;
  deviceModel?: string;
  compact?: boolean;
}

export const StructuredLogEntry: React.FC<StructuredLogEntryProps> = ({
  ev,
  onReturnAlignmentOverlay,
  onOpenPromptModal,
  deviceModel,
  compact = false
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const isAlignmentEv = ev.message.toLowerCase().includes('not aligned') || ev.message.toLowerCase().includes('alignment');
  const parsed = tryParseLogPayload(ev.message) || (ev.data && (ev.data.node_id || ev.data.display_id || ev.data.trace_insights) ? {
    message: ev.message,
    statusCode: ev.statusCode || (ev.category === 'ERROR' ? 500 : undefined),
    nodeId: ev.nodeId || ev.data?.node_id || (ev.dag === 'initialize' ? 'init_end' : undefined),
    dagContext: ev.data,
    traceInsights: ev.traceInsights || ev.data?.trace_insights,
    troubleshootingSteps: ev.troubleshootingSteps || ev.data?.troubleshooting_steps,
    rawPayload: ev.data
  } : null);

  const resolveDevice = (): string | null => {
    if (ev.device) return ev.device;
    const hay = `${ev.message} ${JSON.stringify(ev.data || '')}`.toLowerCase();
    if (hay.includes('63100') || hay.includes('mustang') || hay.includes('pixel 10') || hay.includes('pixel_10')) {
      return 'Pixel 10';
    }
    if (hay.includes('39101') || hay.includes('husky') || hay.includes('pixel 8') || hay.includes('pixel_8')) {
      return 'Pixel 8';
    }
    if (deviceModel) {
      return deviceModel.toLowerCase().includes('10') ? 'Pixel 10' : 'Pixel 8';
    }
    return null;
  };

  const detectedDevice = resolveDevice();
  const nodeId = parsed?.nodeId || ev.nodeId || (ev.dag === 'initialize' ? 'init_end' : undefined);

  const handleCopyRaw = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ev.message);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const handleCopyPrompt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetNode = nodeId || 'init_end';
    try {
      const res = await fetch(`/api/dag/nodes/${targetNode}/root-cause`);
      if (res.ok) {
        const data = await res.json();
        if (data.markdown_prompt) {
          const ok = await copyToClipboard(data.markdown_prompt);
          if (ok) {
            setCopiedPrompt(true);
            setTimeout(() => setCopiedPrompt(false), 2200);
            return;
          }
        }
      }
    } catch {}

    // Fallback prompt generation
    const insights = parsed?.traceInsights || ev.traceInsights || [];
    const fallbackPrompt = `# 🛠️ System Performance Degradation Resolution Prompt\n\n` +
      `## Objective\nAnalyze the root cause of latency and failure in DAG 1 for node \`${targetNode}\` on ${detectedDevice || 'Device'}.\n\n` +
      `## 📌 Executive Summary\n- **Target Node:** ${targetNode}\n- **Device:** ${detectedDevice || 'ADB Device'}\n- **Error:** ${parsed?.message || ev.message}\n\n` +
      `## 🔍 Diagnostic Evidence & Trace Insights\n` +
      insights.map((i: any) => `- ${i}`).join('\n') + `\n\n` +
      `## 🎯 Recommended Action Plan\n1. Ensure external display cursor focus\n2. Verify software keyboard is suppressed\n3. Dispatch hardware Ctrl+End/Ctrl+Home keycombination directly`;
    await copyToClipboard(fallbackPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2200);
  };

  // 1. Regular single-line entry (logically differentiated in verbose logs)
  if (!parsed && !ev.traceInsights) {
    const isErrorCat = ev.category === 'ERROR' || ev.level === 'error';
    const isSuccess = ev.level === 'success';

    return (
      <div
        className={`event-log-entry cat-${(ev.category || 'system').toLowerCase()} ${isErrorCat ? 'entry-error' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 8px',
          borderRadius: '4px',
          background: isErrorCat ? 'rgba(248, 81, 73, 0.12)' : (isSuccess ? 'rgba(0, 255, 157, 0.08)' : 'transparent'),
          borderLeft: isErrorCat ? '2px solid #f85149' : (isSuccess ? '2px solid #00ff9d' : '2px solid transparent')
        }}
      >
        <span className="event-time" style={{ color: '#8b949e', fontSize: '9px' }}>{ev.timestamp}</span>

        {/* Device Context Badge */}
        {detectedDevice && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            fontSize: '8.5px',
            fontWeight: 800,
            padding: '1px 5px',
            borderRadius: '3px',
            background: detectedDevice.includes('10') ? 'rgba(163, 113, 247, 0.2)' : 'rgba(88, 166, 255, 0.2)',
            color: detectedDevice.includes('10') ? '#d2a8ff' : '#58a6ff',
            border: `1px solid ${detectedDevice.includes('10') ? 'rgba(163, 113, 247, 0.4)' : 'rgba(88, 166, 255, 0.4)'}`,
            flexShrink: 0
          }}>
            <Smartphone size={8} />
            <span>{detectedDevice}</span>
          </span>
        )}

        {/* DAG Process Flow Badge */}
        {ev.dag && ev.dag !== 'all' && (
          <span style={{
            fontSize: '8.5px',
            fontWeight: 800,
            padding: '1px 5px',
            borderRadius: '3px',
            background: ev.dag === 'initialize' ? 'rgba(88, 166, 255, 0.15)' : 'rgba(0, 255, 157, 0.15)',
            color: ev.dag === 'initialize' ? '#58a6ff' : '#00ff9d',
            border: `1px solid ${ev.dag === 'initialize' ? 'rgba(88, 166, 255, 0.3)' : 'rgba(0, 255, 157, 0.3)'}`,
            flexShrink: 0
          }}>
            {ev.dag === 'initialize' ? 'DAG 1' : 'DAG 2'}
          </span>
        )}

        {/* Category Tag */}
        <span className={`event-cat-tag ${(ev.category || 'system').toLowerCase()}`}>{ev.category || 'SYS'}</span>

        <span className="event-msg" style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', color: isErrorCat ? '#ff7b72' : '#c9d1d9' }}>
          {ev.message}
        </span>

        {/* If this entry mentions DAG 1 or an error, provide quick trace inspection button */}
        {onOpenPromptModal && (ev.dag === 'initialize' || ev.message.toLowerCase().includes('dag 1') || isErrorCat) && (
          <button
            type="button"
            className="structured-btn"
            onClick={(e) => { e.stopPropagation(); onOpenPromptModal(nodeId || 'init_end'); }}
            style={{
              padding: '1px 5px',
              fontSize: '8px',
              color: '#ffa657',
              borderColor: 'rgba(255, 166, 87, 0.4)',
              background: 'rgba(255, 166, 87, 0.15)',
              flexShrink: 0
            }}
            title="Inspect DAG 1 Trace & Resolution Prompt"
          >
            <Sparkles size={8} />
            <span>Trace</span>
          </button>
        )}

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

  // 2. Structured Card (Error / Diagnostic / Trace Insights)
  return (
    <div
      className="event-log-structured-card"
      onClick={() => onOpenPromptModal && nodeId && onOpenPromptModal(nodeId)}
      style={{ cursor: onOpenPromptModal && nodeId ? 'pointer' : 'default' }}
      title={onOpenPromptModal && nodeId ? 'Click to open Trace Inspector & System Performance Resolution Prompt' : undefined}
    >
      <div className="structured-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
          <span className="event-time">{ev.timestamp}</span>

          {/* Device Context Badge */}
          {detectedDevice && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '8.5px',
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: '3px',
              background: detectedDevice.includes('10') ? 'rgba(163, 113, 247, 0.25)' : 'rgba(88, 166, 255, 0.25)',
              color: detectedDevice.includes('10') ? '#d2a8ff' : '#58a6ff',
              border: `1px solid ${detectedDevice.includes('10') ? 'rgba(163, 113, 247, 0.5)' : 'rgba(88, 166, 255, 0.5)'}`,
              flexShrink: 0
            }}>
              <Smartphone size={9} />
              <span>{detectedDevice}</span>
            </span>
          )}

          {/* DAG Process Flow Badge */}
          {ev.dag && (
            <span style={{
              fontSize: '8.5px',
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: '3px',
              background: ev.dag === 'initialize' ? 'rgba(88, 166, 255, 0.2)' : 'rgba(0, 255, 157, 0.2)',
              color: ev.dag === 'initialize' ? '#58a6ff' : '#00ff9d',
              border: `1px solid ${ev.dag === 'initialize' ? 'rgba(88, 166, 255, 0.45)' : 'rgba(0, 255, 157, 0.45)'}`,
              flexShrink: 0
            }}>
              {ev.dag === 'initialize' ? 'DAG 1' : 'DAG 2'}
            </span>
          )}

          {parsed?.statusCode && (
            <span className="status-code-badge error">
              {parsed.statusCode}
            </span>
          )}

          {nodeId && (
            <span className="node-badge">
              NODE: {nodeId}
            </span>
          )}

          <span className="structured-card-title" title={parsed?.message || ev.message}>
            {(() => {
              const fullMsg = parsed?.message || ev.message || 'Diagnostic Payload';
              if (detectedDevice && !fullMsg.toLowerCase().startsWith(detectedDevice.toLowerCase())) {
                return `${detectedDevice}: ${fullMsg}`;
              }
              return fullMsg;
            })()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {/* Interactive Trace Inspector / AI Prompt Modal Trigger */}
          {onOpenPromptModal && nodeId && (
            <button
              type="button"
              className="structured-btn"
              onClick={() => onOpenPromptModal(nodeId)}
              style={{
                background: 'rgba(255, 166, 87, 0.2)',
                borderColor: 'rgba(255, 166, 87, 0.5)',
                color: '#ffa657'
              }}
              title="Open Trace Inspector & AI Resolution Prompt"
            >
              <Sparkles size={10} color="#ffa657" />
              <span>Trace Insights</span>
            </button>
          )}

          {/* 1-Click Copy Markdown Prompt Button */}
          <button
            type="button"
            className="structured-btn"
            onClick={handleCopyPrompt}
            title="Copy System Performance Degradation Resolution Prompt in Markdown format"
          >
            {copiedPrompt ? <Check size={10} color="#00ff9d" /> : <Copy size={10} />}
            <span>{copiedPrompt ? 'Prompt Copied!' : 'Copy Prompt'}</span>
          </button>

          <button
            type="button"
            className="structured-btn"
            onClick={handleCopyRaw}
            title="Copy error message payload"
          >
            {copiedRaw ? <Check size={10} color="#00ff9d" /> : <Copy size={10} />}
            <span>{copiedRaw ? 'Copied' : 'Raw'}</span>
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
      {parsed?.dagContext && (
        <div className="structured-context-bar">
          {parsed.dagContext.display_id !== undefined && <span>Disp #{parsed.dagContext.display_id}</span>}
          {parsed.dagContext.serial && <span>Device: {String(parsed.dagContext.serial).split(':')[0]}</span>}
          {parsed.dagContext.top_line_detected !== undefined && parsed.dagContext.bottom_line_detected !== undefined && (
            <span>Gutter: Ln {parsed.dagContext.top_line_detected}→{parsed.dagContext.bottom_line_detected}</span>
          )}
          {parsed.dagContext.active_dpi && <span>{parsed.dagContext.active_dpi} DPI ({parsed.dagContext.dpi_factor || 1}x)</span>}
        </div>
      )}

      {/* Trace Insights Box */}
      {parsed?.traceInsights && parsed.traceInsights.length > 0 && (
        <div className="structured-insights-box">
          <div className="insights-title">
            <Terminal size={10} color="#58a6ff" />
            <span>Trace Insights:</span>
          </div>
          <ul className="insights-list">
            {parsed.traceInsights.map((insight: any, idx: number) => (
              <li key={idx}><code>{insight}</code></li>
            ))}
          </ul>

          {/* Interactive banner directing user to full resolution prompt */}
          {onOpenPromptModal && nodeId && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onOpenPromptModal(nodeId);
              }}
              style={{
                marginTop: '6px',
                padding: '4px 8px',
                borderRadius: '4px',
                background: 'rgba(255, 166, 87, 0.12)',
                border: '1px solid rgba(255, 166, 87, 0.35)',
                color: '#ffa657',
                fontSize: '8.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
              title="Open full interactive resolution prompt and diagnostics"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Sparkles size={10} />
                <span>Click here to open System Performance Degradation Resolution Prompt for AI</span>
              </div>
              <ArrowRight size={10} />
            </div>
          )}
        </div>
      )}

      {/* Troubleshooting Recommendations */}
      {parsed?.troubleshootingSteps && parsed.troubleshootingSteps.length > 0 && !compact && (
        <div className="structured-steps-box">
          <div className="steps-title">Troubleshooting Recommendations:</div>
          <div className="steps-grid">
            {parsed.troubleshootingSteps.map((st: any) => (
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
          {typeof parsed?.rawPayload === 'string'
            ? parsed.rawPayload
            : JSON.stringify(parsed?.rawPayload, null, 2)}
        </pre>
      )}
    </div>
  );
};
