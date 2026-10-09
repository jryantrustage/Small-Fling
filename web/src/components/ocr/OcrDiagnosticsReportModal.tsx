import React, { useState, useEffect, useCallback } from 'react';
import {
  FileCheck, Copy, Check, Download, AlertCircle, CheckCircle2,
  RefreshCw, Code, Eye, FileText, XCircle
} from 'lucide-react';
import { Modal } from '../../ConfirmModal';

export interface OcrDiagnosticsReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentData: any;
  frames: any[];
}

export const OcrDiagnosticsReportModal: React.FC<OcrDiagnosticsReportModalProps> = ({
  isOpen,
  onClose,
  documentData,
  frames
}) => {
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'markdown' | 'verbatim'>('visual');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/document/verified-lines-report');
      if (res.ok) {
        const text = await res.text();
        setReportMarkdown(text);
      }
    } catch (e) {
      console.error('Failed to fetch verified lines report:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, fetchReport]);

  const docLines = documentData?.lines || [];
  const totalMasterLines = docLines.length;
  const verifiedLines = docLines.filter((l: any) => l.status === 'verified' || l.status === 'ok');
  const gapLines = docLines.filter((l: any) => l.status === 'gap' || l.status === 'missing');
  const issueLines = docLines.filter((l: any) => l.status === 'issue' || l.status === 'unaligned' || l.status === 'flagged');
  const totalChars = docLines.reduce((acc: number, l: any) => acc + (l.text ? l.text.length : 0), 0);
  const completenessPct = totalMasterLines > 0 ? Math.round((verifiedLines.length / totalMasterLines) * 100) : 0;

  const sortedFrames = [...frames].sort((a, b) => (a.page_index || 0) - (b.page_index || 0));

  // Build per-page extraction analysis
  const pageStats = sortedFrames.map((f, idx) => {
    const pNum = f.page_index || idx + 1;
    const top = f.top_line || 0;
    const bot = f.bottom_line || 0;
    const expectedSpan = bot >= top && top > 0 ? bot - top + 1 : 0;
    const linesOnPage = docLines.filter((l: any) => l.line_number >= top && l.line_number <= bot && (l.status === 'verified' || l.status === 'ok'));
    const extractedCount = linesOnPage.length;
    const pagePct = expectedSpan > 0 ? Math.round((extractedCount / expectedSpan) * 100) : 0;

    return {
      page: pNum,
      top,
      bot,
      expectedSpan,
      extractedCount,
      completeness: pagePct,
      modelUsed: f.model_used || 'MiniCPM-V (Ollama)',
      status: pagePct >= 95 ? 'verified' : (pagePct > 0 ? 'degraded' : 'failed')
    };
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
    a.download = `ocr_verified_lines_report_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
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
          <FileCheck size={18} color="#58a6ff" />
          <span>OCR Verified Lines & Extraction Diagnostics Report</span>
        </div>
      }
      subtitle="Line-by-line OCR transcription accuracy, character fidelity, and detailed line failure diagnostics"
      maxWidth="880px"
      cancelText="Close"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#e6edf3', fontSize: '13px' }}>
        
        {/* Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>OCR Completeness</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: completenessPct >= 90 ? '#39d353' : (completenessPct > 50 ? '#ffa657' : '#ff7b72'), marginTop: '4px' }}>
              {completenessPct}%
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Verified Lines</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#00ff9d', marginTop: '4px' }}>
              {verifiedLines.length} / {totalMasterLines}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Failed / Missing Lines</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: gapLines.length === 0 ? '#39d353' : '#ff7b72', marginTop: '4px' }}>
              {gapLines.length + issueLines.length}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Extracted Characters</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#a371f7', marginTop: '4px' }}>
              {totalChars.toLocaleString()}
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
              <span>Page Breakdown</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'verbatim' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setViewMode('verbatim')}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Code size={12} />
              <span>Verbatim Code Sample</span>
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
              <span>{copied ? 'Copied' : 'Copy OCR Markdown'}</span>
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

        {/* Failed / Missing Lines Detail Diagnostic Section */}
        {gapLines.length > 0 && (
          <div style={{ background: 'rgba(255, 123, 114, 0.1)', border: '1px solid #ff7b7266', borderRadius: '6px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ff7b72', fontWeight: 600 }}>
              <AlertCircle size={15} />
              <span>OCR Line Detail Failures: {gapLines.length} Missing / Unpopulated Line(s)</span>
            </div>
            <p style={{ margin: '6px 0 8px 0', color: '#8b949e', fontSize: '11px' }}>
              The following lines exist within the document span but have not been transcribed by OCR:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
              {gapLines.slice(0, 50).map((l: any) => (
                <span
                  key={l.line_number}
                  style={{
                    background: 'rgba(255, 123, 114, 0.2)',
                    border: '1px solid #ff7b7244',
                    color: '#ff7b72',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: 'monospace'
                  }}
                >
                  Ln #{l.line_number}
                </span>
              ))}
              {gapLines.length > 50 && (
                <span style={{ color: '#8b949e', fontSize: '11px', alignSelf: 'center' }}>
                  +{gapLines.length - 50} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tab 1: Per-Page Breakdown Table */}
        {viewMode === 'visual' && (
          <div style={{ overflowX: 'auto', border: '1px solid #30363d', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid #30363d', color: '#8b949e' }}>
                  <th style={{ padding: '8px 12px' }}>Page</th>
                  <th style={{ padding: '8px 12px' }}>Expected Range</th>
                  <th style={{ padding: '8px 12px' }}>Expected Lines</th>
                  <th style={{ padding: '8px 12px' }}>Extracted Count</th>
                  <th style={{ padding: '8px 12px' }}>Completeness</th>
                  <th style={{ padding: '8px 12px' }}>Vision Model</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageStats.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#8b949e' }}>
                      No per-page OCR diagnostics available yet.
                    </td>
                  </tr>
                ) : (
                  pageStats.map((row) => (
                    <tr key={row.page} style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#58a6ff' }}>
                        Page {row.page}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#00ff9d' }}>
                        Ln {row.top} → {row.bot}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {row.expectedSpan} lines
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                        {row.extractedCount} lines
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '60px', height: '6px', background: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(100, row.completeness)}%`,
                                height: '100%',
                                background: row.completeness >= 90 ? '#39d353' : (row.completeness > 50 ? '#ffa657' : '#ff7b72')
                              }}
                            />
                          </div>
                          <span>{row.completeness}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#8b949e', fontSize: '11px' }}>
                        {row.modelUsed}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {row.completeness >= 90 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#39d353', background: 'rgba(57, 211, 83, 0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                            <CheckCircle2 size={11} /> 100% OK
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ff7b72', background: 'rgba(255, 123, 114, 0.15)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                            <XCircle size={11} /> Degraded ({row.completeness}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Verbatim Code Sampling */}
        {viewMode === 'verbatim' && (
          <div style={{ position: 'relative' }}>
            <div style={{ marginBottom: '8px', fontSize: '12px', color: '#8b949e' }}>
              Showing live transcribed text directly from master document lines:
            </div>
            <pre style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '14px',
              fontSize: '12px',
              lineHeight: '1.6',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              color: '#c9d1d9',
              maxHeight: '380px',
              overflowY: 'auto',
              margin: 0
            }}>
              {verifiedLines.length === 0 ? 'No verified lines extracted yet.' : (
                verifiedLines.slice(0, 60).map((l: any) => (
                  <div key={l.line_number} style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ color: '#8b949e', width: '36px', textAlign: 'right', userSelect: 'none' }}>
                      {l.line_number}
                    </span>
                    <span style={{ color: l.text ? '#e6edf3' : '#484f58' }}>
                      {l.text || '(empty line)'}
                    </span>
                  </div>
                ))
              )}
            </pre>
          </div>
        )}

        {/* Tab 3: Raw Markdown View */}
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
              {reportMarkdown || 'Loading OCR diagnostics report...'}
            </pre>
          </div>
        )}

      </div>
    </Modal>
  );
};
