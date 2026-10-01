import React, { useState } from 'react';
import { Sparkles, Check, Copy, Download, ExternalLink } from 'lucide-react';
import { Modal } from '../../ConfirmModal';
import type { NodeMeta, PerformanceDiagnosis } from '../../types/dag';
import { copyToClipboard } from '../../utils/dagDiagnostics';

export interface AiPerformancePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeMeta: NodeMeta;
  diagnosis: PerformanceDiagnosis;
}

export const AiPerformancePromptModal: React.FC<AiPerformancePromptModalProps> = ({
  isOpen,
  onClose,
  nodeMeta,
  diagnosis
}) => {
  const [activeTab, setActiveTab] = useState<'formatted' | 'raw'>('formatted');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const severityColor = diagnosis.severity === 'critical' ? '#f85149' : (diagnosis.severity === 'warning' ? '#ffa657' : '#00ff9d');

  const handleCopy = async () => {
    const ok = await copyToClipboard(diagnosis.markdown_prompt);
    if (ok) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([diagnosis.markdown_prompt], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-performance-resolution-prompt-${nodeMeta.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} color="#ffa657" />
          <span>AI Prompt: System Performance Resolution (Node {nodeMeta.step} — {nodeMeta.fullName})</span>
        </div>
      }
      subtitle="Take this markdown prompt and feed it directly into an AI (Claude, ChatGPT, Gemini, Copilot) to resolve performance degradation"
      maxWidth="850px"
      cancelText="Close"
      confirmText={copiedPrompt ? 'Copied Prompt!' : 'Copy Prompt for AI'}
      confirmIcon={copiedPrompt ? Check : Copy}
      onConfirm={handleCopy}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Toolbar & Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #30363d', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('formatted')}
              style={{
                background: activeTab === 'formatted' ? 'rgba(88, 166, 255, 0.2)' : 'transparent',
                border: `1px solid ${activeTab === 'formatted' ? '#58a6ff' : 'transparent'}`,
                color: activeTab === 'formatted' ? '#58a6ff' : '#8b949e',
                padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Formatted View
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw')}
              style={{
                background: activeTab === 'raw' ? 'rgba(88, 166, 255, 0.2)' : 'transparent',
                border: `1px solid ${activeTab === 'raw' ? '#58a6ff' : 'transparent'}`,
                color: activeTab === 'raw' ? '#58a6ff' : '#8b949e',
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
              {diagnosis.category.replace(/_/g, ' ')} • {diagnosis.severity.toUpperCase()}
            </span>

            <button
              type="button"
              onClick={handleDownload}
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
              href={diagnosis.promptDataUri}
              target="_blank"
              rel="noopener noreferrer"
              download={`ai-performance-resolution-prompt-${nodeMeta.id}.md`}
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
        {activeTab === 'formatted' ? (
          <div style={{
            maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px',
            background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', padding: '14px', fontSize: '11px', color: '#e6edf3'
          }}>
            {/* Executive Summary */}
            <div style={{ background: '#161b22', borderLeft: `3px solid ${severityColor}`, padding: '8px 12px', borderRadius: '4px' }}>
              <div style={{ fontWeight: 800, fontSize: '12px', color: severityColor }}>{diagnosis.title}</div>
              <div style={{ marginTop: '4px', color: '#c9d1d9' }}>{diagnosis.summary}</div>
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
                    <td style={{ padding: '6px 8px', color: '#58a6ff' }}>{diagnosis.metrics.duration_ms}ms</td>
                    <td style={{ padding: '6px 8px' }}>100%</td>
                    <td style={{ padding: '6px 8px', color: '#8b949e' }}>&lt; 1,500ms</td>
                    <td style={{ padding: '6px 8px', color: diagnosis.metrics.duration_ms > 1500 ? '#ffa657' : '#00ff9d' }}>{diagnosis.metrics.duration_ms > 1500 ? '⚠️ Degraded' : '✔ Normal'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '6px 8px' }}>Environment Precheck</td>
                    <td style={{ padding: '6px 8px', color: '#a371f7' }}>{diagnosis.metrics.precheck_ms}ms</td>
                    <td style={{ padding: '6px 8px' }}>{diagnosis.metrics.precheck_pct}%</td>
                    <td style={{ padding: '6px 8px', color: '#8b949e' }}>&lt; 200ms</td>
                    <td style={{ padding: '6px 8px', color: diagnosis.metrics.precheck_ms > 800 ? '#ffa657' : '#00ff9d' }}>{diagnosis.metrics.precheck_ms > 800 ? '⚠️ High' : '✔ Normal'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>Primary Node Action</td>
                    <td style={{ padding: '6px 8px', color: '#00ff9d' }}>{diagnosis.metrics.action_ms}ms</td>
                    <td style={{ padding: '6px 8px' }}>{diagnosis.metrics.action_pct}%</td>
                    <td style={{ padding: '6px 8px', color: '#8b949e' }}>&lt; 800ms</td>
                    <td style={{ padding: '6px 8px', color: diagnosis.metrics.action_ms > 1200 ? '#ffa657' : '#00ff9d' }}>{diagnosis.metrics.action_ms > 1200 ? '⚠️ High' : '✔ Normal'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '6px 8px' }}>Auto-Healing Recovery</td>
                    <td style={{ padding: '6px 8px', color: diagnosis.metrics.healing_ms > 0 ? '#ffa657' : '#8b949e' }}>{diagnosis.metrics.healing_ms}ms</td>
                    <td style={{ padding: '6px 8px' }}>{diagnosis.metrics.healing_pct}%</td>
                    <td style={{ padding: '6px 8px', color: '#8b949e' }}>0ms</td>
                    <td style={{ padding: '6px 8px', color: diagnosis.metrics.healing_ms > 2000 ? '#f85149' : (diagnosis.metrics.healing_ms > 0 ? '#ffa657' : '#00ff9d') }}>{diagnosis.metrics.healing_ms > 2000 ? '⛔ Excessive' : (diagnosis.metrics.healing_ms > 0 ? '⚠️ Present' : '✔ None')}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px' }}>OCR Inference Latency</td>
                    <td style={{ padding: '6px 8px', color: '#ffa657' }}>{diagnosis.metrics.ocr_latency_ms}ms</td>
                    <td style={{ padding: '6px 8px' }}>—</td>
                    <td style={{ padding: '6px 8px', color: '#8b949e' }}>&lt; 350ms</td>
                    <td style={{ padding: '6px 8px', color: diagnosis.metrics.ocr_latency_ms > 1000 ? '#ffa657' : '#00ff9d' }}>{diagnosis.metrics.ocr_latency_ms > 1000 ? '⚠️ Sluggish' : '✔ Normal'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Diagnostic Evidence */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontWeight: 800, color: '#58a6ff', fontSize: '11px' }}>🔍 Root Cause Diagnostic Evidence</div>
              <div style={{ background: '#161b22', padding: '8px 12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {diagnosis.evidence.map((ev, i) => (
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
                {diagnosis.remediations.map((rem, i) => (
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
            {diagnosis.markdown_prompt}
          </pre>
        )}
      </div>
    </Modal>
  );
};
