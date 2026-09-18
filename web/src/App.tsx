import { useState, useEffect, useRef } from 'react';
import { 
  Scan, 
  Download, 
  Settings, 
  ZoomIn, 
  ZoomOut, 
  Search, 
  Check, 
  X,
  UploadCloud,
  Cpu,
  Coins,
  FileCode,
  Layers,
  RotateCw,
  RotateCcw,
  AlertCircle
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 1200;
const DEFAULT_TARGET_LINES = Number(import.meta.env.VITE_DEFAULT_TARGET_LINES) || 0;

interface LineData {
  line_number: number;
  gutter_number?: number;
  text: string;
  is_blank: boolean;
  is_wrapped?: boolean;
  wrapped_line_count?: number;
  status: string; // 'ok' | 'flagged' | 'missing' | 'verified_overlap' | 'overlap_conflict' | 'manually_edited' | 'recapturing'
  frame_id: string;
  sources?: string[];
  confidence?: number;
  notes: string;
  updated_at: string;
}

interface FrameData {
  frame_id: string;
  filename: string;
  top_line: number;
  bottom_line: number;
  page_index: number;
  file_size: number;
  status: string;
  created_at: string;
  extracted_line_count: number;
  model_used?: string;
  token_usage?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
}

interface RecaptureItem {
  line_number: number;
  reason: string;
  requested_at: string;
}

interface TokenStats {
  total_prompt_tokens: number;
  total_candidates_tokens: number;
  total_tokens: number;
  total_api_calls: number;
  estimated_cost_usd: number;
  mobile_tokens?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
}

interface TelemetryState {
  device_id: string;
  is_pacing: boolean;
  current_page: number;
  current_top_line: number;
  current_bottom_line: number;
  target_total_lines: number;
  dwell_countdown_ms: number;
  phase: string;
  status_message: string;
  last_heartbeat: string | null;
  pacer_calibration?: {
    auto_tune_factor: number;
    line_pitch_px: number;
    bottom_to_top_error: number;
    wrapped_lines_detected: number;
  };
}

export default function App() {
  const [documentData, setDocumentData] = useState<{
    total_lines: number;
    issue_count: number;
    min_line: number;
    max_line: number;
    lines: LineData[];
  }>({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });

  const [frames, setFrames] = useState<FrameData[]>([]);
  const [recaptureQueue, setRecaptureQueue] = useState<RecaptureItem[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats>({
    total_prompt_tokens: 0,
    total_candidates_tokens: 0,
    total_tokens: 0,
    total_api_calls: 0,
    estimated_cost_usd: 0.0
  });

  const [telemetry, setTelemetry] = useState<TelemetryState>({
    device_id: 'Standby',
    is_pacing: false,
    current_page: 0,
    current_top_line: 0,
    current_bottom_line: 0,
    target_total_lines: DEFAULT_TARGET_LINES,
    dwell_countdown_ms: 0,
    phase: 'IDLE',
    status_message: 'Matrix Capture Studio ready',
    last_heartbeat: null
  });

  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<LineData | null>(null);
  const [editingLine, setEditingLine] = useState<LineData | null>(null);
  const [editText, setEditText] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'issues'>('all');
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual' | 'custom'>('fit');
  const [imageZoom, setImageZoom] = useState(1);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const lineListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevFramesCountRef = useRef(0);

  // Poll backend every 1.2s for document, telemetry, frames, and tokens
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [docRes, framesRes, queueRes, cfgRes, telemetryRes] = await Promise.all([
          fetch(`${API_BASE}/api/document`),
          fetch(`${API_BASE}/api/frames`),
          fetch(`${API_BASE}/api/recapture-queue`),
          fetch(`${API_BASE}/api/config`),
          fetch(`${API_BASE}/api/telemetry`)
        ]);

        if (docRes.ok) {
          const docJson = await docRes.json();
          setDocumentData(docJson);
          if (docJson.token_stats) {
            setTokenStats(docJson.token_stats);
          }
        }

        if (framesRes.ok) {
          const framesJson: FrameData[] = await framesRes.json();
          setFrames(framesJson);
          if (framesJson.length > 0) {
            if (framesJson.length > prevFramesCountRef.current || !selectedFrameId || !framesJson.some(f => f.frame_id === selectedFrameId)) {
              setSelectedFrameId(framesJson[framesJson.length - 1].frame_id);
            }
            prevFramesCountRef.current = framesJson.length;
          }
        }

        if (queueRes.ok) {
          const qJson = await queueRes.json();
          setRecaptureQueue(qJson);
        }

        if (cfgRes.ok) {
          const cfgJson = await cfgRes.json();
          setApiKeyConfigured(cfgJson.api_key_configured);
        }

        if (telemetryRes.ok) {
          const tJson = await telemetryRes.json();
          if (tJson.telemetry) {
            setTelemetry(tJson.telemetry);
          }
          if (tJson.token_stats) {
            setTokenStats(tJson.token_stats);
          }
        }
      } catch (err) {
        console.error('Failed to connect to FastAPI backend:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [selectedFrameId]);

  // Handle direct file uploads (drag-and-drop or file picker)
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    setIsUploading(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('page_index', (frames.length + i + 1).toString());
        formData.append('top_line', '0');
        formData.append('bottom_line', '0');

        const res = await fetch(`${API_BASE}/api/upload-frame`, {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          const resJson = await res.json();
          if (resJson.frame_id) {
            setSelectedFrameId(resJson.frame_id);
          }
        }
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  // Handle session reset
  const handleResetSession = async () => {
    if (!window.confirm("Reset session? This will clear all captured frames, transcribed lines, and reset telemetry.")) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE}/api/reset-state`, { method: 'POST' });
      if (res.ok) {
        setSelectedFrameId(null);
        setFrames([]);
        setDocumentData({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });
        setRecaptureQueue([]);
        setTokenStats({
          total_prompt_tokens: 0,
          total_candidates_tokens: 0,
          total_tokens: 0,
          total_api_calls: 0,
          estimated_cost_usd: 0,
          mobile_tokens: { prompt_tokens: 0, candidates_tokens: 0, total_tokens: 0 }
        });
        setTelemetry(prev => ({
          ...prev,
          is_pacing: false,
          current_page: 0,
          current_top_line: 0,
          current_bottom_line: 0,
          dwell_countdown_ms: 0,
          phase: 'STANDBY',
          status_message: 'Session reset to clean state'
        }));
      }
    } catch (err) {
      console.error('Failed to reset session:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Handle manual line edit save
  const handleSaveLineEdit = async () => {
    if (!editingLine) return;
    try {
      await fetch(`${API_BASE}/api/lines/${editingLine.line_number}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText, status: 'manually_edited' })
      });
      setEditingLine(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Save API Key
  const handleSaveApiKey = async () => {
    try {
      await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKeyInput })
      });
      setApiKeyConfigured(true);
      setShowConfigModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Reprocess frame with Gemini OCR
  const [reprocessingFrameId, setReprocessingFrameId] = useState<string | null>(null);

  const handleReprocessFrame = async (frameId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReprocessingFrameId(frameId);
    try {
      await fetch(`${API_BASE}/api/frames/${frameId}/reprocess`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('Failed to reprocess frame:', err);
    } finally {
      setTimeout(() => setReprocessingFrameId(null), 800);
    }
  };

  const handleReprocessAllFailed = async () => {
    try {
      await fetch(`${API_BASE}/api/reprocess-failed`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('Failed to reprocess failed frames:', err);
    }
  };

  // Filter lines
  const filteredLines = documentData.lines.filter(item => {
    if (filterMode === 'issues') {
      const isIssue = ['flagged', 'missing', 'overlap_conflict', 'recapturing'].includes(item.status);
      if (!isIssue) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.line_number.toString().includes(q) ||
        item.text.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeFrame = frames.find(f => f.frame_id === selectedFrameId);
  const totalCombinedTokens = tokenStats.total_tokens + (tokenStats.mobile_tokens?.total_tokens || 0);

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">
            <Scan size={18} />
          </div>
          <span className="brand-title">
            MATRIX CAPTURE <span className="brand-badge">STUDIO 2.5</span>
          </span>
        </div>

        {/* Realtime Metrics & Token Utilization Pill */}
        <div className="header-metrics">
          <div className="metric-pill">
            <span className="label">FRAMES:</span>
            <span className="value">{frames.length}</span>
          </div>
          <div className="metric-pill">
            <span className="label">TOTAL LINES:</span>
            <span className="value">{documentData.total_lines}</span>
          </div>
          <div className={`metric-pill ${documentData.issue_count > 0 ? 'issues' : ''}`}>
            <span className="label">ISSUES:</span>
            <span className="value">{documentData.issue_count}</span>
          </div>
          {recaptureQueue.length > 0 && (
            <div className="metric-pill" style={{ borderColor: '#bc8cff44' }}>
              <span className="label">RECAPTURE:</span>
              <span className="value" style={{ color: '#bc8cff' }}>{recaptureQueue.length}</span>
            </div>
          )}

          {/* Gemini Token Utilization Badge */}
          <div className="metric-pill token-pill" title={`Prompt: ${tokenStats.total_prompt_tokens.toLocaleString()} | Completion: ${tokenStats.total_candidates_tokens.toLocaleString()}`}>
            <Coins size={13} color="#00ff9d" />
            <span className="label">TOKENS:</span>
            <span className="value">{totalCombinedTokens.toLocaleString()}</span>
            <span className="cost-tag">${tokenStats.estimated_cost_usd.toFixed(4)}</span>
          </div>
        </div>

        <div className="header-actions">
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            multiple 
            accept="image/*"
            onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
          />

          <button 
            className="btn btn-outline"
            onClick={() => fileInputRef.current?.click()}
            title="Upload screenshots directly into studio"
          >
            <UploadCloud size={14} />
            <span>Upload Frame</span>
          </button>

          <button 
            className="btn btn-outline" 
            onClick={() => setShowConfigModal(true)}
          >
            <Settings size={14} />
            <span>{apiKeyConfigured ? 'Gemini API Key ✔' : 'Configure API Key'}</span>
          </button>

          {/* Monaco / VFS Ready JSON Export */}
          <a 
            href={`${API_BASE}/api/export-json`} 
            className="btn btn-outline"
            target="_blank" 
            rel="noreferrer"
            download
            title="Export complete JSON preserving gutter line numbers and text for Virtual File System & Monaco"
          >
            <FileCode size={14} color="#58a6ff" />
            <span>Export VFS/Monaco JSON</span>
          </a>

          <button 
            className="btn btn-outline"
            onClick={handleResetSession}
            disabled={isResetting}
            title="Reset session, clear test frames and start fresh"
            style={{ borderColor: 'rgba(255, 123, 114, 0.4)', color: '#ff7b72' }}
          >
            <RotateCcw size={14} />
            <span>{isResetting ? 'Resetting...' : 'Reset Session'}</span>
          </button>

          <a 
            href={`${API_BASE}/api/export-markdown`} 
            className="btn btn-primary"
            target="_blank" 
            rel="noreferrer"
            download
          >
            <Download size={14} />
            <span>Export Code</span>
          </a>
        </div>
      </header>

      {/* Live Telemetry & Gutter Pacer Synchronization Banner */}
      <div className="telemetry-banner">
        <div className="telemetry-item">
          <span className={`pacer-status-dot ${telemetry.is_pacing ? 'active' : (telemetry.device_id !== 'idle' && telemetry.device_id !== 'Standby' && telemetry.phase !== 'STANDBY' ? 'connected' : 'idle')}`} />
          <span className="telemetry-label">PACER:</span>
          <span className="telemetry-val">
            {telemetry.is_pacing 
              ? telemetry.device_id 
              : (telemetry.device_id !== 'idle' && telemetry.device_id !== 'Standby' ? `${telemetry.device_id} (STANDBY)` : 'STANDBY')}
          </span>
          {telemetry.is_pacing && <span className="pacing-badge">AUTO-PACING</span>}
        </div>

        <div className="telemetry-item">
          <Layers size={13} color="#8b949e" />
          <span className="telemetry-label">PAGE:</span>
          <span className="telemetry-val">#{telemetry.current_page}</span>
          <span className="telemetry-sub">(Ln {telemetry.current_top_line} → {telemetry.current_bottom_line})</span>
        </div>

        {/* Auto-tuning Calibration Indicator */}
        <div className="telemetry-item" title="Adaptive closed-loop pacer calibration factor and alignment error">
          <Cpu size={13} color="#00ff9d" />
          <span className="telemetry-label">AUTO-TUNE:</span>
          <span className="telemetry-val" style={{ color: '#00ff9d' }}>
            {telemetry.pacer_calibration?.auto_tune_factor ? `${telemetry.pacer_calibration.auto_tune_factor.toFixed(2)}x` : '1.00x'}
          </span>
          <span className="telemetry-sub">
            (Err: {telemetry.pacer_calibration?.bottom_to_top_error ?? 0} ln | Pitch: {telemetry.pacer_calibration?.line_pitch_px?.toFixed(1) ?? 32}px)
          </span>
        </div>

        {/* Dwell Freeze Countdown Bar (Only displayed during active pacing) */}
        {telemetry.is_pacing && telemetry.dwell_countdown_ms > 0 && (
          <div className="dwell-progress-wrap">
            <span className="dwell-label">DWELL FREEZE: {telemetry.dwell_countdown_ms}ms</span>
            <div className="dwell-bar-bg">
              <div 
                className="dwell-bar-fill" 
                style={{ width: `${Math.min(100, (telemetry.dwell_countdown_ms / 1500) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="telemetry-status-msg">
          {telemetry.status_message}
        </div>
      </div>

      {/* 3-Column Studio Workspace */}
      <div 
        className={`studio-body ${isDraggingOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        {/* Column 1: Captured Frame Feed with drag-and-drop */}
        <aside className="frames-feed-panel">
          <div className="panel-header">
            <span>Captured Frames ({frames.length})</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {frames.some(f => f.status.startsWith('error')) && (
                <button 
                  className="btn btn-sm btn-outline btn-warning-outline" 
                  onClick={handleReprocessAllFailed}
                  title="Retry OCR on all failed frames"
                >
                  <RotateCw size={11} /> Retry Failed
                </button>
              )}
              <button 
                className="btn btn-sm btn-outline" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Add frames"
              >
                {isUploading ? 'Uploading...' : '+ Add Frame'}
              </button>
            </div>
          </div>

          <div className="frames-list">
            {frames.length === 0 ? (
              <div className="drop-zone-placeholder" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud size={28} color="#00ff9d" />
                <span style={{ fontWeight: 600, color: '#e6edf3' }}>Drop 1080p Screenshots Here</span>
                <span style={{ fontSize: '11px', color: '#8b949e' }}>or click to upload frames manually</span>
                <span style={{ fontSize: '10px', color: '#58a6ff', marginTop: '6px' }}>Settled Pixel 10 frames stream here automatically</span>
              </div>
            ) : (
              frames.map(f => (
                <div
                  key={f.frame_id}
                  className={`frame-card ${selectedFrameId === f.frame_id ? 'active' : ''} ${f.status.startsWith('error') ? 'frame-error' : ''}`}
                  onClick={() => setSelectedFrameId(f.frame_id)}
                >
                  <div className="frame-card-preview">
                    <img src={`${API_BASE}/api/frames/${f.frame_id}/image`} alt={f.frame_id} />
                    <span className="frame-badge">Pg {f.page_index}</span>
                    {f.token_usage && f.token_usage.total_tokens > 0 && (
                      <span className="frame-token-badge">
                        <Coins size={9} /> {f.token_usage.total_tokens}
                      </span>
                    )}
                  </div>
                  <div className="frame-card-info">
                    <span className="frame-lines-badge">
                      Ln {f.top_line} → {f.bottom_line}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`frame-status-dot ${f.status === 'processed' ? 'processed' : (f.status === 'queued' ? 'queued' : 'error')}`} />
                      <span className="frame-status-text" title={f.status}>
                        {f.extracted_line_count > 0 ? `${f.extracted_line_count} ln` : (f.status.startsWith('error') ? 'Error' : f.status)}
                      </span>
                      {(f.status.startsWith('error') || (f.status !== 'queued' && f.extracted_line_count === 0)) && (
                        <button
                          className="frame-retry-btn"
                          onClick={(e) => handleReprocessFrame(f.frame_id, e)}
                          title="Retry Gemini OCR"
                          disabled={reprocessingFrameId === f.frame_id || f.status === 'queued'}
                        >
                          <RotateCw size={11} className={reprocessingFrameId === f.frame_id ? 'spinning' : ''} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Column 2: Synchronized 1080p Screenshot Viewer with Gutter Overlays */}
        <main className="frame-inspector-panel">
          <div className="panel-header">
            <span>
              {activeFrame 
                ? `1080p Frame: Lines ${activeFrame.top_line} → ${activeFrame.bottom_line} (Pg ${activeFrame.page_index})` 
                : '1080p Desktop Frame Inspector'}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                className={`btn btn-sm ${zoomMode === 'fit' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setZoomMode('fit'); setImageZoom(1); }}
                title="Fit frame inside view"
              >
                Fit
              </button>
              <button 
                className={`btn btn-sm ${zoomMode === 'actual' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setZoomMode('actual'); setImageZoom(1); }}
                title="100% Actual 1080p Resolution (1:1)"
              >
                100% (1080p)
              </button>
              <button 
                className="btn btn-outline btn-sm"
                onClick={() => { setZoomMode('custom'); setImageZoom(prev => Math.max(0.4, Number((prev - 0.2).toFixed(1)))); }}
                title="Zoom Out"
              >
                <ZoomOut size={12} />
              </button>
              <button 
                className="btn btn-outline btn-sm"
                onClick={() => { setZoomMode('custom'); setImageZoom(prev => Math.min(3.0, Number((prev + 0.2).toFixed(1)))); }}
                title="Zoom In"
              >
                <ZoomIn size={12} />
              </button>
            </div>
          </div>

          <div className={`inspector-view-container ${zoomMode === 'actual' ? 'actual-mode' : ''}`}>
            {activeFrame && activeFrame.status.startsWith('error') && (
              <div className="frame-error-banner">
                <AlertCircle size={18} color="#f85149" />
                <div className="frame-error-content">
                  <div className="frame-error-title">OCR Transcription Error</div>
                  <div className="frame-error-detail">{activeFrame.status}</div>
                </div>
                <button
                  className="btn btn-sm btn-primary frame-error-retry-btn"
                  onClick={() => handleReprocessFrame(activeFrame.frame_id)}
                  disabled={reprocessingFrameId === activeFrame.frame_id}
                >
                  <RotateCw size={13} className={reprocessingFrameId === activeFrame.frame_id ? 'spinning' : ''} />
                  <span>{reprocessingFrameId === activeFrame.frame_id ? 'Retrying...' : 'Retry OCR'}</span>
                </button>
              </div>
            )}
            {activeFrame ? (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                {/* 1. START LINE NUMBER AT THE TOP */}
                <div className="gutter-line-callout top">
                  <span className="gutter-callout-icon">▲</span>
                  <span className="gutter-callout-label">START LINE NUMBER (TOP GUTTER):</span>
                  <span className="gutter-callout-value">
                    {activeFrame.top_line > 0 ? `Line #${activeFrame.top_line}` : 'Awaiting / Detecting...'}
                  </span>
                </div>

                <div 
                  className={`source-image-wrapper ${zoomMode}`}
                  style={zoomMode === 'custom' ? { transform: `scale(${imageZoom})`, transformOrigin: 'top left' } : undefined}
                >
                  <img 
                    src={`${API_BASE}/api/frames/${activeFrame.frame_id}/image`} 
                    alt={activeFrame.frame_id} 
                  />
                </div>

                {/* 2. END LINE NUMBER AT THE BOTTOM */}
                <div className="gutter-line-callout bottom">
                  <span className="gutter-callout-icon">▼</span>
                  <span className="gutter-callout-label">END LINE NUMBER (BOTTOM GUTTER):</span>
                  <span className="gutter-callout-value">
                    {activeFrame.bottom_line > 0 ? `Line #${activeFrame.bottom_line}` : 'Awaiting / Detecting...'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="empty-inspector-state">
                <Scan size={36} color="#30363d" />
                <p>Select a frame from the feed or capture a screen on mobile to inspect line alignment.</p>
              </div>
            )}
          </div>
        </main>

        {/* Column 3: Simple Table with Columns "Line #" and "text" */}
        <section className="line-inspector-panel">
          <div className="panel-header">
            <span>Verified Lines ({filteredLines.length})</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                className={`btn btn-sm ${filterMode === 'all' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilterMode('all')}
              >
                All ({documentData.total_lines})
              </button>
              <button 
                className={`btn btn-sm ${filterMode === 'issues' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilterMode('issues')}
              >
                Issues ({documentData.issue_count})
              </button>
            </div>
          </div>

          <div className="filter-bar">
            <Search size={14} color="#8b949e" />
            <input 
              type="text" 
              className="search-input"
              placeholder="Search lines by text or line number..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="lines-table-container" ref={lineListRef}>
            {filteredLines.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#6e7681' }}>
                <p>No lines transcribed yet.</p>
                <p style={{ fontSize: '11px', marginTop: '6px', color: '#8b949e' }}>
                  Tap "CAPTURE SCREEN & ANALYZE" on the mobile HUD to capture and transcribe lines!
                </p>
              </div>
            ) : (
              <table className="clean-lines-table">
                <thead>
                  <tr>
                    <th className="th-line-num">Line #</th>
                    <th className="th-line-text">text</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.map(line => (
                    <tr 
                      key={line.line_number}
                      className={`table-line-row ${line.status} ${selectedLine?.line_number === line.line_number ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedLine(line);
                        if (line.frame_id && line.frame_id !== 'manual') {
                          setSelectedFrameId(line.frame_id);
                        }
                      }}
                    >
                      <td className="td-line-num">
                        {line.gutter_number || line.line_number}
                        {line.is_wrapped && <span className="wrap-tag" title="Wrapped line"> ↵</span>}
                      </td>
                      <td className="td-line-text">
                        <pre className="table-code-text">{line.text || <span className="blank-line-tag">(blank line)</span>}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Edit Line Modal */}
      {editingLine && (
        <div className="modal-overlay" onClick={() => setEditingLine(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>Edit Line #{editingLine.line_number} (Gutter: #{editingLine.gutter_number || editingLine.line_number})</span>
              <button 
                onClick={() => setEditingLine(null)} 
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <label style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>
                LINE TEXT (VERBATIM):
              </label>
              <textarea 
                rows={4}
                style={{
                  width: '100%',
                  background: '#0a0d12',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  padding: '10px',
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
                value={editText}
                onChange={e => setEditText(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setEditingLine(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveLineEdit}>
                <Check size={14} /> Save Line
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini API Key Modal */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>Gemini Cloud OCR Configuration</span>
              <button 
                onClick={() => setShowConfigModal(false)} 
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>
                Enter your Gemini API key to enable instant structured OCR on settled 1080p desktop frames.
              </p>
              <input 
                type="password"
                placeholder="AIzaSy..."
                className="search-input"
                style={{ width: '100%', padding: '8px 12px' }}
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowConfigModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveApiKey}>Save Key</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
