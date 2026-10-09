import React, { useState, useEffect, useCallback } from 'react';
import {
  Camera, Copy, Check, Download, AlertTriangle, CheckCircle2,
  RefreshCw, Eye, FileText
} from 'lucide-react';
import { Modal } from '../../ConfirmModal';

export interface CapturedFramesReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  frames: any[];
  totalVerifiedLines: number;
}

export const CapturedFramesReportModal: React.FC<CapturedFramesReportModalProps> = ({
  isOpen,
  onClose,
  frames,
  totalVerifiedLines
}) => {
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'markdown'>('visual');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/frames/page-report');
      if (res.ok) {
        const text = await res.text();
        setReportMarkdown(text);
      }
    } catch (e) {
      console.error('Failed to fetch page report:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, fetchReport]);

  const sortedFrames = [...frames].sort((a, b) => 
    (a.page_index || 0) - (b.page_index || 0) || 
    (a.created_at || '').localeCompare(b.created_at || '') || 
    (a.top_line || 0) - (b.top_line || 0)
  );

  // Compute gaps and overlaps
  const frameBreakdown: any[] = [];
  const detectedGaps: any[] = [];
  let prevBottom: number | null = null;
  let prevPage: number | null = null;

  sortedFrames.forEach((f, idx) => {
    const pNum = f.page_index || idx + 1;
    const top = f.top_line || 0;
    const bot = f.bottom_line || 0;
    const span = bot >= top && top > 0 ? bot - top + 1 : 0;
    const flags: string[] = [];

    if (prevBottom !== null) {
      if (top === prevBottom + 1) {
        flags.push('CONTINUOUS');
      } else if (top > prevBottom + 1) {
        const gStart = prevBottom + 1;
        const gEnd = top - 1;
        const count = gEnd - gStart + 1;
        flags.push(`GAP (${count} lines)`);
        detectedGaps.push({ prevPage, page: pNum, fromLine: gStart, toLine: gEnd, count });
      } else if (top <= prevBottom && top > 0) {
        const overlap = prevBottom - top + 1;
        flags.push(`OVERLAP (${overlap} lines)`);
      }
    } else {
      flags.push('START');
    }

    frameBreakdown.push({
      pageIndex: pNum,
      frameId: f.frame_id,
      topLine: top,
      bottomLine: bot,
      span,
      flags,
      status: f.status || 'processed',
      createdAt: f.created_at
    });

    prevBottom = bot;
    prevPage = pNum;
  });

  const handleCopy = async () => {
    if (!reportMarkdown) return;
    try {
      await navigator.clipboard.writeText(reportMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy report:', e);
    }
  };

  const handleDownload = () => {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `captured_frames_report_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Camera size={18} color="#00ff9d" />
          <span>Captured Frames & Viewport Coverage Report</span>
        </div>
      }
      subtitle="Physical screen capture analysis, sequential viewport line coverage, and frame-to-frame continuity diagnostics"
      maxWidth="860px"
      cancelText="Close"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#e6edf3', fontSize: '13px' }}>
        
        {/* Top Header Metrics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Frames</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#00ff9d', marginTop: '4px' }}>{sortedFrames.length}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Viewport Span</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#58a6ff', marginTop: '4px' }}>
              {sortedFrames.length > 0 ? `Ln ${sortedFrames[0].top_line} → ${sortedFrames[sortedFrames.length - 1].bottom_line}` : 'None'}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Verified Lines</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f0883e', marginTop: '4px' }}>{totalVerifiedLines}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frame Gaps</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: detectedGaps.length === 0 ? '#39d353' : '#ff7b72', marginTop: '4px' }}>
              {detectedGaps.length === 0 ? '0 (Continuous)' : `${detectedGaps.length} Gaps`}
            </div>
          </div>
        </div>

        {/* View Mode Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #30363d', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'visual' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setViewMode('visual')}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Eye size={12} />
              <span>Interactive Table</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'markdown' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setViewMode('markdown')}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <FileText size={12} />
              <span>Raw Markdown</span>
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={fetchReport}
              disabled={loading}
              title="Refresh report data"
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${copied ? 'btn-success' : 'btn-outline'}`}
              onClick={handleCopy}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              {copied ? <Check size={12} color="#00ff9d" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Download size={12} />
              <span>Download</span>
            </button>
          </div>
        </div>

        {/* Detected Gaps Warning Banner */}
        {detectedGaps.length > 0 && (
          <div style={{ background: 'rgba(255, 123, 114, 0.1)', border: '1px solid #ff7b7266', borderRadius: '6px', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ff7b72', fontWeight: 600 }}>
              <AlertTriangle size={15} />
              <span>Viewport Continuity Warning: {detectedGaps.length} Frame Gap(s) Detected</span>
            </div>
            <ul style={{ margin: '6px 0 0 20px', padding: 0, color: '#f0f6fc', fontSize: '12px' }}>
              {detectedGaps.map((g, idx) => (
                <li key={idx} style={{ marginTop: '2px' }}>
                  Between Page {g.prevPage} and Page {g.page}: Missing Ln {g.fromLine} → {g.toLine} ({g.count} lines missing from viewport capture)
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tab 1: Interactive Breakdown Table */}
        {viewMode === 'visual' && (
          <div style={{ overflowX: 'auto', border: '1px solid #30363d', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid #30363d', color: '#8b949e' }}>
                  <th style={{ padding: '8px 12px' }}>Page</th>
                  <th style={{ padding: '8px 12px' }}>Viewport Bounds</th>
                  <th style={{ padding: '8px 12px' }}>Lines Visible</th>
                  <th style={{ padding: '8px 12px' }}>Continuity Status</th>
                  <th style={{ padding: '8px 12px' }}>Capture Status</th>
                </tr>
              </thead>
              <tbody>
                {frameBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#8b949e' }}>
                      No captured frames available.
                    </td>
                  </tr>
                ) : (
                  frameBreakdown.map((row) => {
                    const isGap = row.flags.some((f: string) => f.startsWith('GAP'));
                    const isContinuous = row.flags.includes('CONTINUOUS') || row.flags.includes('START');
                    return (
                      <tr key={row.frameId} style={{ borderBottom: '1px solid #21262d', background: isGap ? 'rgba(255, 123, 114, 0.05)' : 'transparent' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#58a6ff' }}>
                          Page {row.pageIndex}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#00ff9d' }}>
                          Ln {row.topLine} → {row.bottomLine}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {row.span} lines
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {isContinuous ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#39d353', background: 'rgba(57, 211, 83, 0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                              <CheckCircle2 size={11} /> Continuous
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ff7b72', background: 'rgba(255, 123, 114, 0.15)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                              <AlertTriangle size={11} /> {row.flags.join(' ')}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textTransform: 'capitalize', color: row.status.startsWith('error') ? '#ff7b72' : '#8b949e' }}>
                          {row.status}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Raw Markdown View */}
        {viewMode === 'markdown' && (
          <div style={{ position: 'relative' }}>
            <pre style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '14px',
              fontSize: '12px',
              lineHeight: '1.5',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              color: '#c9d1d9',
              maxHeight: '400px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              margin: 0
            }}>
              {reportMarkdown || 'Loading captured frames report...'}
            </pre>
          </div>
        )}

      </div>
    </Modal>
  );
};
