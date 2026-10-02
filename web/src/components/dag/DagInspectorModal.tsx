import React, { useState } from 'react';
import {
  Play, Square, FileText, Check, Copy, Sparkles, Clock, RefreshCw, AlertTriangle, ExternalLink
} from 'lucide-react';
import { Modal } from '../../ConfirmModal';
import type { NodeMeta, NodeLiveStatus, PerformanceDiagnosis } from '../../types/dag';
import { copyToClipboard } from '../../utils/dagDiagnostics';

export interface DagInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNodeMeta: NodeMeta;
  liveStatus: NodeLiveStatus;
  activeRunningId: string | null;
  copiedNodeId: string | null;
  onRunNode: (id: string) => void;
  onAbortNode: (id: string) => void;
  onCopyNodeForAi: (id: string) => void;
  onOpenPromptModal: (id: string) => void;
  onOpenTextModal?: () => void;
  node3bExtractedText?: string | null;
  diagnosis: PerformanceDiagnosis;
  nodeTelemetryEvents: Array<{ id: string; timestamp: string; category: string; message: string }>;
  isNode1Calibrated: boolean;
  node1TotalLines: number;
  isNode1Error: boolean;
  apiBase: string;
  onRefresh?: () => void;
}

export const DagInspectorModal: React.FC<DagInspectorModalProps> = ({
  isOpen,
  onClose,
  selectedNodeMeta,
  liveStatus,
  activeRunningId,
  copiedNodeId,
  onRunNode,
  onAbortNode,
  onCopyNodeForAi,
  onOpenPromptModal,
  onOpenTextModal,
  node3bExtractedText,
  diagnosis,
  nodeTelemetryEvents,
  node1TotalLines,
  isNode1Error,
  apiBase,
  onRefresh
}) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isHidingKeyboard, setIsHidingKeyboard] = useState(false);

  if (!isOpen) return null;

  const severityColor = diagnosis.severity === 'critical' ? '#f85149' : (diagnosis.severity === 'warning' ? '#ffa657' : '#00ff9d');
  const severityBg = diagnosis.severity === 'critical' ? 'rgba(248, 81, 73, 0.15)' : (diagnosis.severity === 'warning' ? 'rgba(255, 166, 87, 0.15)' : 'rgba(0, 255, 157, 0.12)');
  const severityBorder = diagnosis.severity === 'critical' ? '#f85149' : (diagnosis.severity === 'warning' ? '#ffa65788' : '#00ff9d44');

  const handleCopyPrompt = async () => {
    const ok = await copyToClipboard(diagnosis.markdown_prompt);
    if (ok) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
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
      onConfirm={onClose}
      maxWidth="720px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {activeRunningId === selectedNodeMeta.id ? (
            <button
              type="button"
              onClick={() => onAbortNode(selectedNodeMeta.id)}
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
              onClick={() => onRunNode(selectedNodeMeta.id)}
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

          {selectedNodeMeta.id === 'local_ai_ocr' && node3bExtractedText && onOpenTextModal && (
            <button
              type="button"
              onClick={onOpenTextModal}
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
            onClick={() => onCopyNodeForAi(selectedNodeMeta.id)}
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
            onClick={() => onOpenPromptModal(selectedNodeMeta.id)}
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

        {/* Real-time Execution Timings & Node State */}
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

          {/* Evaluator & Healing Cards */}
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
          <div style={{
            background: '#0d1117',
            border: `1.5px solid ${severityBorder}`,
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', fontWeight: 800, color: severityColor, letterSpacing: '0.4px' }}>
                <Sparkles size={12} color={severityColor} />
                <span>ROOT CAUSE & PERFORMANCE DIAGNOSTICS</span>
              </div>
              <span style={{
                fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px',
                background: severityBg, color: severityColor, border: `1px solid ${severityBorder}`
              }}>
                {diagnosis.category.replace(/_/g, ' ')}
              </span>
            </div>

            <div style={{
              background: '#161b22',
              borderLeft: `3px solid ${severityColor}`,
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '10px',
              color: '#c9d1d9',
              lineHeight: 1.4
            }}>
              <div style={{ fontWeight: 800, color: severityColor, marginBottom: '2px' }}>{diagnosis.title}</div>
              <div>{diagnosis.summary}</div>
            </div>

            {/* Latency & Phase Breakdown Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', color: '#8b949e', fontWeight: 700 }}>
                <span>LATENCY PHASE DISTRIBUTION</span>
                <span>Total: {diagnosis.metrics.duration_ms}ms</span>
              </div>
              <div style={{
                display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden',
                background: '#21262d', border: '1px solid #30363d'
              }}>
                <div style={{ width: `${diagnosis.metrics.precheck_pct}%`, background: '#a371f7' }} title={`Precheck: ${diagnosis.metrics.precheck_ms}ms (${diagnosis.metrics.precheck_pct}%)`} />
                <div style={{ width: `${diagnosis.metrics.action_pct}%`, background: '#00ff9d' }} title={`Action: ${diagnosis.metrics.action_ms}ms (${diagnosis.metrics.action_pct}%)`} />
                <div style={{ width: `${diagnosis.metrics.healing_pct}%`, background: diagnosis.metrics.healing_ms > 2000 ? '#f85149' : '#ffa657' }} title={`Auto-Healing: ${diagnosis.metrics.healing_ms}ms (${diagnosis.metrics.healing_pct}%)`} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#6e7681', marginTop: '1px' }}>
                <span style={{ color: '#a371f7' }}>● Precheck ({diagnosis.metrics.precheck_ms}ms)</span>
                <span style={{ color: '#00ff9d' }}>● Action ({diagnosis.metrics.action_ms}ms)</span>
                <span style={{ color: diagnosis.metrics.healing_ms > 0 ? '#ffa657' : '#6e7681' }}>● Healing ({diagnosis.metrics.healing_ms}ms)</span>
                <span style={{ color: '#58a6ff' }}>OCR: {diagnosis.metrics.ocr_latency_ms}ms</span>
              </div>
            </div>

            {/* Evidence Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9px' }}>
              <div style={{ color: '#8b949e', fontWeight: 700, fontSize: '8.5px' }}>DIAGNOSTIC EVIDENCE:</div>
              {diagnosis.evidence.slice(0, 3).map((ev, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', color: '#f0f6fc' }}>
                  <span style={{ color: severityColor, flexShrink: 0 }}>•</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev}</span>
                </div>
              ))}
            </div>

            {/* Actions Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid #21262d' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => onOpenPromptModal(selectedNodeMeta.id)}
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
                  onClick={handleCopyPrompt}
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

              <a
                href={diagnosis.promptDataUri}
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

          {/* Trace & Diagnostics Card for Issues */}
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
                    onClick={() => onCopyNodeForAi(selectedNodeMeta.id)}
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
                    onClick={() => onOpenPromptModal(selectedNodeMeta.id)}
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
                  {liveStatus.traceInsights.map((insight, idx) => {
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
                            onClick={() => copyToClipboard(insight)}
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

        {/* Node 1 Diagnostic Details */}
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

        {/* Process Tracing Telemetry */}
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
  );
};
