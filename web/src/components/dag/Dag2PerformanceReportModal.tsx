import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Sparkles, Clock, Zap, Download, Copy, Check,
  RefreshCw, Trash2, ChevronRight, ChevronDown, TrendingUp, TrendingDown,
  AlertCircle, BarChart2, Cpu, FileCheck, CheckCircle2, XCircle, Sliders, Eye, Maximize2
} from 'lucide-react';
import { Modal } from '../../ConfirmModal';
import type { Dag2PerformanceReport, Dag2NodeExecutionRecord } from '../../types/dag';
import { copyToClipboard } from '../../utils/dagDiagnostics';

export interface Dag2PerformanceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Dag2PerformanceReportModal: React.FC<Dag2PerformanceReportModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'trace' | 'accuracy' | 'gemini_prompt'>('overview');
  const [report, setReport] = useState<Dag2PerformanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditingAccuracy, setAuditingAccuracy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [expandedLoops, setExpandedLoops] = useState<Record<number, boolean>>({ 1: true });
  const [promptViewMode, setPromptViewMode] = useState<'formatted' | 'raw'>('formatted');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dag/report/dag2');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: Dag2PerformanceReport = await res.json();
      setReport(data);
      // Auto-expand latest loop
      if (data.loops && data.loops.length > 0) {
        const lastIdx = data.loops[data.loops.length - 1].loop_index;
        setExpandedLoops(prev => ({ ...prev, [lastIdx]: true }));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch DAG 2 performance report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, fetchReport]);

  const handleClear = async () => {
    if (!window.confirm('Reset all recorded DAG 2 loop timing history and start fresh?')) return;
    try {
      await fetch('/api/dag/report/dag2/clear', { method: 'POST' });
      await fetchReport();
    } catch (err: any) {
      setError(err?.message || 'Failed to clear loop history');
    }
  };

  const handleAuditAccuracy = async () => {
    setAuditingAccuracy(true);
    try {
      const res = await fetch('/api/dag/report/dag2/audit-accuracy', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      await fetchReport();
    } catch (err: any) {
      setError(err?.message || 'Failed to trigger Gemini 3.8 accuracy audit');
    } finally {
      setAuditingAccuracy(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!report?.ai_optimization_prompt) return;
    const ok = await copyToClipboard(report.ai_optimization_prompt);
    if (ok) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    }
  };

  const handleDownloadPrompt = () => {
    if (!report?.ai_optimization_prompt) return;
    const blob = new Blob([report.ai_optimization_prompt], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dag2-gemini38-optimization-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleLoopExpand = (idx: number) => {
    setExpandedLoops(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const formatEpochTime = (ms: number) => {
    if (!ms) return '—';
    const d = new Date(ms);
    return `${d.toLocaleTimeString()}.${String(ms % 1000).padStart(3, '0')}`;
  };

  const getNodeColor = (nodeId: string) => {
    switch (nodeId) {
      case 'frame_acquire': return '#00ff9d';
      case 'local_ai_ocr': return '#ffa657';
      case 'frame_ocr': return '#58a6ff';
      case 'arrow_down': return '#f85149';
      case 'verification_trigger': return '#a371f7';
      case 'document_assemble': return '#39d353';
      default: return '#8b949e';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="#00ff9d" />
          <span>DAG 2 Loop Performance Tracking & Gemini 3.8 Optimization Engine</span>
        </div>
      }
      subtitle="Millisecond start/stop execution telemetry across each loop & node with automated bottleneck analysis and prompt export for Gemini 3.8"
      width="min(1060px, 95vw)"
      maxWidth="1060px"
      cancelText="Close"
      confirmText={copiedPrompt ? 'Copied Prompt for Gemini 3.8!' : 'Copy Prompt for Gemini 3.8'}
      confirmIcon={copiedPrompt ? Check : Sparkles}
      onConfirm={handleCopyPrompt}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '74vh', overflowY: 'auto', paddingRight: '4px' }}>
        
        {/* Navigation & Controls Bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid #30363d', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: activeTab === 'overview' ? 'rgba(0, 255, 157, 0.18)' : '#161b22',
                border: `1px solid ${activeTab === 'overview' ? '#00ff9d' : '#30363d'}`,
                color: activeTab === 'overview' ? '#00ff9d' : '#8b949e',
                padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <BarChart2 size={13} />
              <span>Overview & Bottlenecks</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('trace')}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: activeTab === 'trace' ? 'rgba(88, 166, 255, 0.18)' : '#161b22',
                border: `1px solid ${activeTab === 'trace' ? '#58a6ff' : '#30363d'}`,
                color: activeTab === 'trace' ? '#58a6ff' : '#8b949e',
                padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Clock size={13} />
              <span>Millisecond Trace Matrix ({report?.loops?.length || 0} Loops)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('accuracy')}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: activeTab === 'accuracy' ? 'rgba(163, 113, 247, 0.22)' : '#161b22',
                border: `1px solid ${activeTab === 'accuracy' ? '#a371f7' : '#30363d'}`,
                color: activeTab === 'accuracy' ? '#a371f7' : '#8b949e',
                padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <FileCheck size={13} color="#a371f7" />
              <span>Accuracy & Line Audit (Gemini 3.8)</span>
              {report?.accuracy_audit && (
                <span style={{
                  fontSize: '9.5px', padding: '1px 5px', borderRadius: '8px',
                  background: report.accuracy_audit.overall_accuracy_percent >= 90 ? 'rgba(57, 211, 83, 0.2)' : 'rgba(255, 166, 87, 0.2)',
                  color: report.accuracy_audit.overall_accuracy_percent >= 90 ? '#39d353' : '#ffa657',
                  fontWeight: 800, marginLeft: '2px'
                }}>
                  {report.accuracy_audit.overall_accuracy_percent}%
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gemini_prompt')}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: activeTab === 'gemini_prompt' ? 'rgba(255, 166, 87, 0.22)' : '#161b22',
                border: `1px solid ${activeTab === 'gemini_prompt' ? '#ffa657' : '#30363d'}`,
                color: activeTab === 'gemini_prompt' ? '#ffa657' : '#8b949e',
                padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Sparkles size={13} color="#ffa657" />
              <span>Gemini 3.8 AI Prompt Exporter</span>
            </button>
          </div>

          {/* Quick Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9',
                padding: '4px 8px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 600, cursor: 'pointer'
              }}
              title="Refresh performance telemetry"
            >
              <RefreshCw size={11} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPrompt}
              disabled={!report?.ai_optimization_prompt}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9',
                padding: '4px 8px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 600, cursor: 'pointer'
              }}
              title="Download markdown prompt for Gemini 3.8"
            >
              <Download size={11} />
              <span>Export .md</span>
            </button>
            <button
              type="button"
              onClick={handleClear}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'rgba(248, 81, 73, 0.1)', border: '1px solid rgba(248, 81, 73, 0.3)', color: '#ff7b72',
                padding: '4px 8px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 600, cursor: 'pointer'
              }}
              title="Clear all recorded loop tracking"
            >
              <Trash2 size={11} />
              <span>Clear History</span>
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(248, 81, 73, 0.15)', border: '1px solid #f85149',
            borderRadius: '6px', padding: '10px 14px', color: '#ff7b72', fontSize: '12px',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: OVERVIEW & BOTTLENECKS */}
        {activeTab === 'overview' && report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Top KPIs Summary Bar */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px'
            }}>
              {/* Total Time */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95), rgba(22, 27, 34, 0.95))',
                border: '1px solid rgba(0, 255, 157, 0.3)', borderRadius: '8px', padding: '12px 14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}>
                <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Total DAG 2 Loop Runtime
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#00ff9d', marginTop: '4px', fontFamily: 'monospace' }}>
                  {report.summary.total_elapsed_formatted}
                </div>
                <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '2px' }}>
                  Across {report.summary.total_loops} full cycles ({report.summary.total_elapsed_ms.toLocaleString()} ms)
                </div>
              </div>

              {/* Avg Loop Time */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95), rgba(22, 27, 34, 0.95))',
                border: '1px solid rgba(88, 166, 255, 0.3)', borderRadius: '8px', padding: '12px 14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}>
                <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Average Loop Duration
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#58a6ff', marginTop: '4px', fontFamily: 'monospace' }}>
                  {report.summary.average_loop_formatted}
                </div>
                <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '2px' }}>
                  Target: &lt; 3s per page
                </div>
              </div>

              {/* Trend */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95), rgba(22, 27, 34, 0.95))',
                border: `1px solid ${report.summary.trend.includes('IMPROVING') ? 'rgba(0, 255, 157, 0.4)' : (report.summary.trend.includes('DEGRADING') ? 'rgba(248, 81, 73, 0.4)' : 'rgba(139, 148, 158, 0.3)')}`,
                borderRadius: '8px', padding: '12px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}>
                <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Progression Trend
                </div>
                <div style={{
                  fontSize: '13px', fontWeight: 800, marginTop: '6px',
                  color: report.summary.trend.includes('IMPROVING') ? '#00ff9d' : (report.summary.trend.includes('DEGRADING') ? '#ff7b72' : '#ffa657'),
                  display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                  {report.summary.trend.includes('IMPROVING') ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                  <span>{report.summary.trend}</span>
                </div>
                <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '4px' }}>
                  Min: {report.summary.min_loop_formatted} • Max: {report.summary.max_loop_formatted}
                </div>
              </div>

              {/* Hardware Context */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95), rgba(22, 27, 34, 0.95))',
                border: '1px solid rgba(163, 113, 247, 0.3)', borderRadius: '8px', padding: '12px 14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}>
                <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Runtime Target
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#d2a8ff', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Cpu size={14} />
                  <span>Intel Ultra 9 288V (32GB)</span>
                </div>
                <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '4px' }}>
                  MiniCPM-V Ollama Local Pipeline
                </div>
              </div>
            </div>

            {/* Loop Time Composition Bar */}
            <div style={{
              background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#e6edf3' }}>
                  📊 Node Latency Share (% of Total Loop Time)
                </span>
                <span style={{ fontSize: '10px', color: '#8b949e' }}>
                  Hover over blocks for exact milliseconds
                </span>
              </div>

              {/* Progress stack */}
              <div style={{
                display: 'flex', height: '22px', borderRadius: '4px', overflow: 'hidden',
                background: '#0d1117', border: '1px solid #30363d'
              }}>
                {report.node_statistics.map(stat => (
                  <div
                    key={stat.node_id}
                    title={`${stat.name}: ${stat.total_formatted} (${stat.percentage_of_total}% avg ${stat.avg_formatted})`}
                    style={{
                      width: `${Math.max(2, stat.percentage_of_total)}%`,
                      backgroundColor: getNodeColor(stat.node_id),
                      opacity: 0.85,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '9px', fontWeight: 800, color: '#0d1117',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      padding: '0 3px', borderRight: '1px solid #0d1117'
                    }}
                  >
                    {stat.percentage_of_total > 8 ? `${stat.node_id} (${stat.percentage_of_total}%)` : ''}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
                {report.node_statistics.map(stat => (
                  <div key={stat.node_id} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: getNodeColor(stat.node_id) }} />
                    <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{stat.name}:</span>
                    <span style={{ color: '#8b949e', fontFamily: 'monospace' }}>{stat.avg_formatted} ({stat.percentage_of_total}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Critical Bottlenecks Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} color="#ffa657" />
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#ffa657', textTransform: 'uppercase' }}>
                  Root Cause Bottlenecks Identified
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {report.bottlenecks.map(b => (
                  <div
                    key={b.node_id}
                    style={{
                      background: '#161b22',
                      borderLeft: `4px solid ${b.rank === 1 ? '#f85149' : (b.rank === 2 ? '#ffa657' : '#58a6ff')}`,
                      borderTop: '1px solid #30363d', borderRight: '1px solid #30363d', borderBottom: '1px solid #30363d',
                      borderRadius: '6px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          background: b.rank === 1 ? '#f85149' : (b.rank === 2 ? '#ffa657' : '#58a6ff'),
                          color: '#0d1117', fontSize: '9px', fontWeight: 900, padding: '1px 6px', borderRadius: '3px'
                        }}>
                          #{b.rank} BOTTLENECK
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#f0f6fc' }}>
                          {b.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#ff7b72', fontWeight: 800, fontFamily: 'monospace' }}>
                          {b.time_spent} total ({b.percentage}% of DAG 2)
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', color: '#c9d1d9', lineHeight: 1.5, background: '#0d1117', padding: '8px 10px', borderRadius: '4px', border: '1px solid #21262d' }}>
                      <strong style={{ color: '#ffa657' }}>Root Cause: </strong>
                      {b.root_cause}
                    </div>

                    <div style={{ fontSize: '11px', color: '#00ff9d', lineHeight: 1.5, background: 'rgba(0, 255, 157, 0.05)', padding: '8px 10px', borderRadius: '4px', border: '1px solid rgba(0, 255, 157, 0.15)' }}>
                      <strong>Remediation Strategy: </strong>
                      <span style={{ color: '#c9d1d9' }}>{b.remediation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MILLISECOND TRACE MATRIX */}
        {activeTab === 'trace' && report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>
                Every single loop and node start/finish recorded in exact epoch milliseconds.
              </div>
              <button
                type="button"
                onClick={() => {
                  const allOpen = Object.keys(expandedLoops).length === (report.loops?.length || 0);
                  const next: Record<number, boolean> = {};
                  if (!allOpen) {
                    report.loops.forEach(l => { next[l.loop_index] = true; });
                  }
                  setExpandedLoops(next);
                }}
                style={{
                  background: 'transparent', border: '1px solid #30363d', color: '#58a6ff',
                  fontSize: '10px', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer'
                }}
              >
                {Object.keys(expandedLoops).length === (report.loops?.length || 0) ? 'Collapse All' : 'Expand All Loops'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {report.loops.map(loop => {
                const isExpanded = !!expandedLoops[loop.loop_index];
                return (
                  <div
                    key={loop.loop_id}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                    }}
                  >
                    {/* Loop Header Row */}
                    <div
                      onClick={() => toggleLoopExpand(loop.loop_index)}
                      style={{
                        padding: '10px 12px', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', cursor: 'pointer', background: isExpanded ? '#1c2128' : '#161b22',
                        borderBottom: isExpanded ? '1px solid #30363d' : 'none',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isExpanded ? <ChevronDown size={14} color="#8b949e" /> : <ChevronRight size={14} color="#8b949e" />}
                        <span style={{
                          fontWeight: 800, fontSize: '12px', color: '#f0f6fc',
                          fontFamily: 'monospace'
                        }}>
                          Loop #{loop.loop_index}
                        </span>
                        <span style={{
                          fontSize: '9px', fontWeight: 800, padding: '1px 6px', borderRadius: '3px',
                          background: loop.status === 'success' ? 'rgba(0, 255, 157, 0.15)' : 'rgba(248, 81, 73, 0.15)',
                          color: loop.status === 'success' ? '#00ff9d' : '#ff7b72',
                          border: `1px solid ${loop.status === 'success' ? '#00ff9d55' : '#ff7b7255'}`
                        }}>
                          {loop.status.toUpperCase()}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', fontFamily: 'monospace' }}>
                        <span style={{ color: '#8b949e' }}>
                          Start: <strong style={{ color: '#c9d1d9' }}>{formatEpochTime(loop.started_at_ms)}</strong> ({loop.started_at_ms} ms)
                        </span>
                        <span style={{ color: '#8b949e' }}>
                          Stop: <strong style={{ color: '#c9d1d9' }}>{formatEpochTime(loop.finished_at_ms)}</strong> ({loop.finished_at_ms} ms)
                        </span>
                        <span style={{
                          color: '#00ff9d', fontWeight: 800, background: 'rgba(0, 255, 157, 0.1)',
                          padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0, 255, 157, 0.2)'
                        }}>
                          Duration: {loop.duration_formatted} ({loop.duration_ms} ms)
                        </span>
                      </div>
                    </div>

                    {/* Nodes Table Inside Loop */}
                    {isExpanded && (
                      <div style={{ padding: '8px 12px', background: '#0d1117' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                              <th style={{ padding: '6px 8px' }}>Node</th>
                              <th style={{ padding: '6px 8px' }}>Started (ms)</th>
                              <th style={{ padding: '6px 8px' }}>Stopped (ms)</th>
                              <th style={{ padding: '6px 8px' }}>Duration</th>
                              <th style={{ padding: '6px 8px' }}>Granular Telemetry & Context</th>
                            </tr>
                          </thead>
                          <tbody>
                            {loop.nodes.map((node: Dag2NodeExecutionRecord) => {
                              const pct = Math.round((node.duration_ms / Math.max(1, loop.duration_ms)) * 100);
                              return (
                                <tr key={node.node_id} style={{ borderBottom: '1px solid #21262d' }}>
                                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: getNodeColor(node.node_id) }} />
                                      <span style={{ color: '#f0f6fc' }}>{node.name}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#8b949e' }}>
                                    {formatEpochTime(node.started_at_ms)}
                                    <div style={{ fontSize: '9px', color: '#6e7681' }}>{node.started_at_ms}</div>
                                  </td>
                                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#8b949e' }}>
                                    {formatEpochTime(node.finished_at_ms)}
                                    <div style={{ fontSize: '9px', color: '#6e7681' }}>{node.finished_at_ms}</div>
                                  </td>
                                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                                    <div style={{ color: node.duration_ms > 4000 ? '#ff7b72' : (node.duration_ms > 1000 ? '#ffa657' : '#00ff9d'), fontWeight: 700 }}>
                                      {node.duration_ms} ms
                                    </div>
                                    <div style={{ fontSize: '9px', color: '#8b949e' }}>
                                      {pct}% of loop
                                    </div>
                                  </td>
                                  <td style={{ padding: '6px 8px', color: '#c9d1d9' }}>
                                    {node.details ? (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {Object.entries(node.details).map(([k, v]) => (
                                          <span
                                            key={k}
                                            style={{
                                              background: '#161b22', border: '1px solid #30363d',
                                              padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontFamily: 'monospace'
                                            }}
                                          >
                                            <span style={{ color: '#8b949e' }}>{k}: </span>
                                            <strong style={{ color: k.includes('line') || k.includes('arrow') ? '#00ff9d' : '#e6edf3' }}>
                                              {String(v)}
                                            </strong>
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span style={{ color: '#6e7681' }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: ACCURACY & LINE AUDIT (GEMINI 3.8) */}
        {activeTab === 'accuracy' && report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Header & Quick Action */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
              padding: '10px 14px', flexWrap: 'wrap', gap: '10px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={16} color="#a371f7" />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#f0f6fc' }}>
                    Gemini 3.8 Ground-Truth Character Fidelity & Line-per-Line Examination
                  </span>
                  <span style={{
                    fontSize: '9.5px', background: 'rgba(163, 113, 247, 0.15)', color: '#a371f7',
                    padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(163, 113, 247, 0.3)',
                    fontWeight: 700
                  }}>
                    {report.accuracy_audit?.model_auditor || 'gemini-3.8-flash'}
                  </span>
                </div>
                <div style={{ fontSize: '10.5px', color: '#8b949e', marginTop: '3px' }}>
                  Periodically samples lines with rich syntax (<code style={{ color: '#ffa657' }}>| \ / [] {'{}'} () +-=&quot;&apos;</code>) and performs line-by-line diffs against Gemini 3.8 to diagnose DPI, resolution, and image processing needs.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleAuditAccuracy}
                  disabled={auditingAccuracy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: auditingAccuracy ? '#21262d' : 'rgba(163, 113, 247, 0.2)',
                    border: `1px solid ${auditingAccuracy ? '#30363d' : '#a371f7'}`,
                    color: auditingAccuracy ? '#8b949e' : '#a371f7',
                    padding: '6px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                    cursor: auditingAccuracy ? 'wait' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Run on-demand Gemini 3.8 line audit on captured frames"
                >
                  <RefreshCw size={12} className={auditingAccuracy ? 'spin' : ''} />
                  <span>{auditingAccuracy ? 'Auditing with Gemini 3.8...' : 'Re-run Gemini 3.8 Line Audit'}</span>
                </button>
              </div>
            </div>

            {/* Metrics Counters Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                  Overall Character Fidelity
                </div>
                <div style={{
                  fontSize: '20px', fontWeight: 900, marginTop: '4px',
                  color: (report.accuracy_audit?.overall_accuracy_percent ?? 0) >= 90 ? '#39d353'
                    : (report.accuracy_audit?.overall_accuracy_percent ?? 0) >= 70 ? '#ffa657' : '#ff7b72'
                }}>
                  {report.accuracy_audit?.overall_accuracy_percent ?? 0}%
                </div>
                <div style={{ fontSize: '9.5px', color: '#6e7681', marginTop: '2px' }}>
                  Exact character-level sequence match
                </div>
              </div>

              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                  Character Error Rate (CER)
                </div>
                <div style={{
                  fontSize: '20px', fontWeight: 900, marginTop: '4px',
                  color: (report.accuracy_audit?.character_error_rate_pct ?? 0) <= 10 ? '#39d353' : '#ff7b72'
                }}>
                  {report.accuracy_audit?.character_error_rate_pct ?? 0}%
                </div>
                <div style={{ fontSize: '9.5px', color: '#6e7681', marginTop: '2px' }}>
                  Substitutions, omissions & insertions
                </div>
              </div>

              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                  Audited Code Lines
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '4px', color: '#58a6ff' }}>
                  {report.accuracy_audit?.audited_lines_count ?? 0}
                </div>
                <div style={{ fontSize: '9.5px', color: '#6e7681', marginTop: '2px' }}>
                  Extracted lines evaluated
                </div>
              </div>

              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                  Perfect Matches
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '4px', color: '#00ff9d' }}>
                  {report.accuracy_audit?.perfect_matches_count ?? 0}
                  <span style={{ fontSize: '11px', color: '#8b949e', fontWeight: 600, marginLeft: '4px' }}>
                    / {report.accuracy_audit?.audited_lines_count ?? 0}
                  </span>
                </div>
                <div style={{ fontSize: '9.5px', color: '#6e7681', marginTop: '2px' }}>
                  100% verbatim agreement
                </div>
              </div>
            </div>

            {/* Diagnostic Advice & Hardware Adjustment Grid */}
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <Sliders size={14} color="#58a6ff" />
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#f0f6fc' }}>
                  System Adjustment Directives (DPI, Resolution & Image Preprocessing)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {/* DPI & Resolution */}
                <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '5px', padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#58a6ff', fontWeight: 800, fontSize: '11px' }}>
                    <Maximize2 size={12} />
                    <span>Device DPI & Resolution</span>
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#c9d1d9', marginTop: '6px', lineHeight: 1.4 }}>
                    {report.accuracy_audit?.system_recommendations?.device_dpi ||
                     report.accuracy_audit?.system_recommendations?.display_resolution ||
                     'Maintain native 1080p unscaled resolution. Use adb shell wm density 400 to prevent character stroke blurring.'}
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#8b949e', marginTop: '6px', borderTop: '1px dashed #21262d', paddingTop: '4px' }}>
                    💡 Higher density prevents pixel collapse on thin symbols (<code style={{ color: '#ffa657' }}>|</code>, <code style={{ color: '#ffa657' }}>\</code>, <code style={{ color: '#ffa657' }}>/</code>).
                  </div>
                </div>

                {/* OCR Image Preprocessing */}
                <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '5px', padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#00ff9d', fontWeight: 800, fontSize: '11px' }}>
                    <Eye size={12} />
                    <span>OCR Image Preprocessing</span>
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#c9d1d9', marginTop: '6px', lineHeight: 1.4 }}>
                    {report.accuracy_audit?.system_recommendations?.ocr_image_preprocessing ||
                     'Crop the text viewport region directly to exclude toolbar and system status bar, reducing distraction for vision models.'}
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#8b949e', marginTop: '6px', borderTop: '1px dashed #21262d', paddingTop: '4px' }}>
                    💡 Contrast stretch and unsharp masking deepen dark editor background contrast.
                  </div>
                </div>

                {/* Model Tuning & Temperature */}
                <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '5px', padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#ffa657', fontWeight: 800, fontSize: '11px' }}>
                    <Cpu size={12} />
                    <span>Model Tuning & Temperature</span>
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#c9d1d9', marginTop: '6px', lineHeight: 1.4 }}>
                    {report.accuracy_audit?.system_recommendations?.model_temperature_and_prompt ||
                     'Set temperature to 0.0 with repetition_penalty >= 1.15 to suppress degenerate repetition patterns on ASCII characters.'}
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#8b949e', marginTop: '6px', borderTop: '1px dashed #21262d', paddingTop: '4px' }}>
                    💡 Enforces verbatim OCR transcription and stops markdown header hallucination.
                  </div>
                </div>
              </div>
            </div>

            {/* Line-per-Line Examination Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#f0f6fc' }}>
                  Line-per-Line Character Examination ({report.accuracy_audit?.sampled_lines?.length || 0} Lines Audited)
                </span>
                <span style={{ fontSize: '10px', color: '#8b949e' }}>
                  Audited via Gemini 3.8 ground-truth inspection
                </span>
              </div>

              {(!report.accuracy_audit?.sampled_lines || report.accuracy_audit.sampled_lines.length === 0) ? (
                <div style={{
                  background: '#161b22', border: '1px dashed #30363d', borderRadius: '6px',
                  padding: '24px', textAlign: 'center', color: '#8b949e', fontSize: '11px'
                }}>
                  No lines audited yet. Click &quot;Re-run Gemini 3.8 Line Audit&quot; above to inspect captured frames against Gemini 3.8.
                </div>
              ) : (
                report.accuracy_audit.sampled_lines.map((line, idx) => {
                  const isPerfect = line.status === 'perfect_match' || line.accuracy_percent === 100;
                  const isMinor = line.status === 'minor_discrepancy' || (line.accuracy_percent >= 70 && line.accuracy_percent < 100);
                  const statusColor = isPerfect ? '#39d353' : isMinor ? '#ffa657' : '#ff7b72';
                  const statusBg = isPerfect ? 'rgba(57, 211, 83, 0.15)' : isMinor ? 'rgba(255, 166, 87, 0.15)' : 'rgba(248, 81, 73, 0.15)';

                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#161b22', border: `1px solid ${isPerfect ? '#21262d' : statusColor}`,
                        borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px'
                      }}
                    >
                      {/* Line Title Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            background: '#21262d', color: '#58a6ff', fontWeight: 800, fontSize: '11px',
                            padding: '2px 8px', borderRadius: '4px', border: '1px solid #30363d'
                          }}>
                            Line {line.line_number}
                          </span>
                          <span style={{
                            background: statusBg, color: statusColor, fontWeight: 700, fontSize: '10px',
                            padding: '2px 8px', borderRadius: '4px', border: `1px solid ${statusColor}44`,
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}>
                            {isPerfect ? <CheckCircle2 size={11} /> : isMinor ? <AlertCircle size={11} /> : <XCircle size={11} />}
                            <span>{isPerfect ? '100% Match' : `${line.accuracy_percent}% Fidelity`}</span>
                          </span>
                        </div>

                        <span style={{ fontSize: '10.5px', color: '#8b949e', fontStyle: 'italic' }}>
                          {line.character_diff_summary || (isPerfect ? 'Exact character match' : 'Discrepancy detected')}
                        </span>
                      </div>

                      {/* Side-by-side or Stacked Comparison View */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        {/* OCR Text */}
                        <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '4px', padding: '8px' }}>
                          <div style={{ fontSize: '9.5px', color: '#ffa657', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>
                            OCR Extracted (Local MiniCPM-V) [{line.ocr_text?.length || 0} chars]
                          </div>
                          <div style={{
                            fontFamily: 'monospace', fontSize: '11px', color: '#f0f6fc',
                            background: '#161b22', padding: '6px 8px', borderRadius: '3px',
                            border: '1px solid #30363d', wordBreak: 'break-all', whiteSpace: 'pre-wrap'
                          }}>
                            {line.ocr_text || <span style={{ color: '#6e7681' }}>(Empty)</span>}
                          </div>
                        </div>

                        {/* Gemini Reference Text */}
                        <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '4px', padding: '8px' }}>
                          <div style={{ fontSize: '9.5px', color: '#a371f7', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>
                            Gemini 3.8 Ground-Truth Reference [{line.gemini_reference_text?.length || 0} chars]
                          </div>
                          <div style={{
                            fontFamily: 'monospace', fontSize: '11px', color: '#f0f6fc',
                            background: '#161b22', padding: '6px 8px', borderRadius: '3px',
                            border: '1px solid #30363d', wordBreak: 'break-all', whiteSpace: 'pre-wrap'
                          }}>
                            {line.gemini_reference_text || (
                              <span style={{ color: '#ff7b72', fontStyle: 'italic' }}>
                                (Not present in captured viewport / Hallucinated line)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Discrepancy Chips */}
                      {line.discrepancies && line.discrepancies.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '2px' }}>
                          {line.discrepancies.map((d, dIdx) => (
                            <span
                              key={dIdx}
                              style={{
                                fontSize: '10px', background: 'rgba(248, 81, 73, 0.1)',
                                border: '1px solid rgba(248, 81, 73, 0.25)', color: '#ff7b72',
                                padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace'
                              }}
                            >
                              {d.type.toUpperCase()}: expected &quot;{d.expected_char || 'NONE'}&quot; vs ocr &quot;{d.ocr_char || 'NONE'}&quot; ({d.description})
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Line-level Diagnostics */}
                      {line.diagnostics && (
                        <div style={{
                          background: '#0d1117', border: '1px solid #21262d', borderRadius: '4px',
                          padding: '6px 10px', fontSize: '10px', color: '#8b949e',
                          display: 'flex', flexDirection: 'column', gap: '2px'
                        }}>
                          {line.diagnostics.image_processing && (
                            <div>
                              <strong style={{ color: '#00ff9d' }}>Image Processing: </strong>
                              <span>{line.diagnostics.image_processing}</span>
                            </div>
                          )}
                          {line.diagnostics.dpi_resolution && (
                            <div>
                              <strong style={{ color: '#58a6ff' }}>DPI / Resolution: </strong>
                              <span>{line.diagnostics.dpi_resolution}</span>
                            </div>
                          )}
                          {line.diagnostics.model_tuning && (
                            <div>
                              <strong style={{ color: '#ffa657' }}>Model Tuning: </strong>
                              <span>{line.diagnostics.model_tuning}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 4: GEMINI 3.8 AI PROMPT EXPORTER */}
        {activeTab === 'gemini_prompt' && report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Action Bar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 12px',
              flexWrap: 'wrap', gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="#ffa657" />
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#f0f6fc' }}>
                  AI Optimization Prompt for Gemini 3.8
                </span>
                <span style={{ fontSize: '9.5px', background: 'rgba(255, 166, 87, 0.15)', color: '#ffa657', padding: '1px 6px', borderRadius: '3px', border: '1px solid rgba(255, 166, 87, 0.3)' }}>
                  Iterative DAG 2 Speedup
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', background: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setPromptViewMode('formatted')}
                    style={{
                      padding: '3px 8px', fontSize: '10px', fontWeight: 700,
                      background: promptViewMode === 'formatted' ? '#21262d' : 'transparent',
                      color: promptViewMode === 'formatted' ? '#58a6ff' : '#8b949e',
                      border: 'none', cursor: 'pointer'
                    }}
                  >
                    Structured View
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptViewMode('raw')}
                    style={{
                      padding: '3px 8px', fontSize: '10px', fontWeight: 700,
                      background: promptViewMode === 'raw' ? '#21262d' : 'transparent',
                      color: promptViewMode === 'raw' ? '#58a6ff' : '#8b949e',
                      border: 'none', cursor: 'pointer'
                    }}
                  >
                    Raw Markdown
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: copiedPrompt ? '#238636' : 'rgba(0, 255, 157, 0.2)',
                    border: `1px solid ${copiedPrompt ? '#2ea043' : '#00ff9d'}`,
                    color: copiedPrompt ? '#ffffff' : '#00ff9d',
                    padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {copiedPrompt ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedPrompt ? 'Copied to Clipboard!' : 'Copy Prompt for Gemini 3.8'}</span>
                </button>
              </div>
            </div>

            {/* Prompt Content Display */}
            {promptViewMode === 'raw' ? (
              <textarea
                readOnly
                value={report.ai_optimization_prompt}
                style={{
                  width: '100%', height: '420px', background: '#0d1117', border: '1px solid #30363d',
                  borderRadius: '6px', color: '#c9d1d9', fontFamily: 'monospace', fontSize: '11px',
                  padding: '12px', resize: 'vertical', outline: 'none', lineHeight: 1.5
                }}
              />
            ) : (
              <div style={{
                maxHeight: '430px', overflowY: 'auto', background: '#0d1117',
                border: '1px solid #30363d', borderRadius: '6px', padding: '14px',
                fontSize: '11px', color: '#e6edf3', display: 'flex', flexDirection: 'column', gap: '12px'
              }}>
                <div style={{ background: 'rgba(255, 166, 87, 0.1)', borderLeft: '3px solid #ffa657', padding: '8px 12px', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 800, color: '#ffa657', fontSize: '12px' }}>
                    🤖 Mission for Gemini 3.8: Accelerate DAG 2 Stepping & OCR Loop
                  </div>
                  <div style={{ color: '#c9d1d9', marginTop: '4px', lineHeight: 1.4 }}>
                    This prompt presents Gemini 3.8 with millisecond start/stop telemetry for each loop, isolates the primary bottleneck (sequential HID arrow down presses advancing from bottom line to top line + 1), and commands code generation to reduce total DAG 2 loop runtime expressed in minutes and seconds.
                  </div>
                </div>

                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontWeight: 800, color: '#58a6ff', marginBottom: '6px' }}>
                    1. Telemetry Summary Header Included in Prompt
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '10.5px', fontFamily: 'monospace' }}>
                    <div style={{ background: '#0d1117', padding: '6px 8px', borderRadius: '4px' }}>
                      <span style={{ color: '#8b949e' }}>Total Loops: </span>
                      <strong style={{ color: '#f0f6fc' }}>{report.summary.total_loops}</strong>
                    </div>
                    <div style={{ background: '#0d1117', padding: '6px 8px', borderRadius: '4px' }}>
                      <span style={{ color: '#8b949e' }}>Total Time: </span>
                      <strong style={{ color: '#00ff9d' }}>{report.summary.total_elapsed_formatted}</strong>
                    </div>
                    <div style={{ background: '#0d1117', padding: '6px 8px', borderRadius: '4px' }}>
                      <span style={{ color: '#8b949e' }}>Average / Page: </span>
                      <strong style={{ color: '#58a6ff' }}>{report.summary.average_loop_formatted}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontWeight: 800, color: '#f85149', marginBottom: '6px' }}>
                    2. Primary Bottleneck Formulated for AI Refactoring
                  </div>
                  <div style={{ fontSize: '11px', color: '#c9d1d9', lineHeight: 1.5 }}>
                    Node 6 (<strong style={{ color: '#ff7b72' }}>Arrow Down Viewport Pacer</strong>) consumes ~{report.node_statistics.find(n => n.node_id === 'arrow_down')?.percentage_of_total || 47}% of total loop time by sending individual arrow down keystrokes (40-50 presses @ 25ms dwell + 300ms settle = ~5.1s per page).
                  </div>
                  <div style={{ marginTop: '8px', color: '#00ff9d', fontSize: '10.5px' }}>
                    <strong>Prompt Directives for Gemini 3.8:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      <li>Replace individual sequential keystrokes with PageDown keycode 93 or concatenated ADB commands.</li>
                      <li>Parallelize or pipeline Node 4 local OCR (MiniCPM-V) with navigation.</li>
                      <li>Crop OCR ROI specifically to line gutter / code boundaries.</li>
                      <li>Generate complete drop-in replacement code for <code style={{ color: '#58a6ff' }}>server/routers/orchestration.py</code> and <code style={{ color: '#58a6ff' }}>server/services/screen_nav.py</code>.</li>
                    </ul>
                  </div>
                </div>

                <pre style={{
                  background: '#0d1117', padding: '10px', borderRadius: '4px',
                  border: '1px solid #21262d', color: '#8b949e', fontSize: '9.5px',
                  overflowX: 'auto', maxHeight: '180px'
                }}>
                  {report.ai_optimization_prompt}
                </pre>
              </div>
            )}
          </div>
        )}

      </div>
    </Modal>
  );
};
export default Dag2PerformanceReportModal;
