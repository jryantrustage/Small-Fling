import { useState, useEffect, useRef } from 'react';
import { 
  Scan, 
  RefreshCw, 
  Download, 
  Settings, 
  Smartphone, 
  Edit3, 
  ZoomIn, 
  ZoomOut, 
  Search, 
  Check, 
  X 
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000';

interface LineData {
  line_number: number;
  text: string;
  is_blank: boolean;
  status: string; // 'ok' | 'flagged' | 'missing' | 'verified_overlap' | 'overlap_conflict' | 'manually_edited' | 'recapturing'
  frame_id: string;
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
}

interface RecaptureItem {
  line_number: number;
  reason: string;
  requested_at: string;
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
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<LineData | null>(null);
  const [editingLine, setEditingLine] = useState<LineData | null>(null);
  const [editText, setEditText] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'issues'>('all');
  const [imageZoom, setImageZoom] = useState(1);

  const lineListRef = useRef<HTMLDivElement>(null);

  // Poll backend every 1.5s
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [docRes, framesRes, queueRes, cfgRes] = await Promise.all([
          fetch(`${API_BASE}/api/document`),
          fetch(`${API_BASE}/api/frames`),
          fetch(`${API_BASE}/api/recapture-queue`),
          fetch(`${API_BASE}/api/config`)
        ]);

        if (docRes.ok) {
          const docJson = await docRes.json();
          setDocumentData(docJson);
        }

        if (framesRes.ok) {
          const framesJson: FrameData[] = await framesRes.json();
          setFrames(framesJson);
          if (framesJson.length > 0 && !selectedFrameId) {
            setSelectedFrameId(framesJson[framesJson.length - 1].frame_id);
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
      } catch (err) {
        console.error('Failed to connect to FastAPI backend:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, [selectedFrameId]);

  // Handle requesting recapture
  const handleRequestRecapture = async (lineNum: number) => {
    try {
      await fetch(`${API_BASE}/api/lines/${lineNum}/request-recapture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_number: lineNum, reason: 'Flagged for recapture by user' })
      });
    } catch (err) {
      console.error(err);
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

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">
            <Scan size={18} />
          </div>
          <span className="brand-title">
            MATRIX CAPTURE <span className="brand-badge">STUDIO</span>
          </span>
        </div>

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
          <div className="metric-pill">
            <span className="label">RECAPTURE QUEUE:</span>
            <span className="value" style={{ color: recaptureQueue.length > 0 ? '#bc8cff' : '#8b949e' }}>
              {recaptureQueue.length}
            </span>
          </div>
        </div>

        <div className="header-actions">
          <button 
            className="btn btn-outline" 
            onClick={() => setShowConfigModal(true)}
          >
            <Settings size={14} />
            <span>{apiKeyConfigured ? 'Gemini API Key ✔' : 'Configure API Key'}</span>
          </button>

          <a 
            href={`${API_BASE}/api/export-markdown`} 
            className="btn btn-primary"
            target="_blank" 
            rel="noreferrer"
            download
          >
            <Download size={14} />
            <span>Export Spliced MD</span>
          </a>
        </div>
      </header>

      {/* 3-Column Studio Workspace */}
      <div className="studio-body">
        {/* Column 1: Captured Frame Feed */}
        <aside className="frames-feed-panel">
          <div className="panel-header">
            <span>Captured Frames ({frames.length})</span>
            <RefreshCw size={12} style={{ opacity: 0.6 }} />
          </div>

          <div className="frames-list">
            {frames.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6e7681', fontSize: '11px', fontFamily: 'monospace' }}>
                Waiting for settled frames from Pixel 10 Desktop Mode...
              </div>
            ) : (
              frames.map(f => (
                <div
                  key={f.frame_id}
                  className={`frame-card ${selectedFrameId === f.frame_id ? 'active' : ''}`}
                  onClick={() => setSelectedFrameId(f.frame_id)}
                >
                  <div className="frame-card-preview">
                    <img src={`${API_BASE}/api/frames/${f.frame_id}/image`} alt={f.frame_id} />
                    <span className="frame-badge">Pg {f.page_index}</span>
                  </div>
                  <div className="frame-card-info">
                    <span className="frame-lines-badge">
                      Ln {f.top_line} → {f.bottom_line}
                    </span>
                    <span>
                      <span className={`frame-status-dot ${f.status === 'processed' ? 'processed' : (f.status === 'queued' ? 'queued' : 'error')}`} />
                      {f.extracted_line_count > 0 ? `${f.extracted_line_count} ln` : f.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Column 2: Synchronized 1080p Screenshot Viewer */}
        <main className="frame-inspector-panel">
          <div className="panel-header">
            <span>
              {activeFrame 
                ? `1080p Desktop Capture: Lines ${activeFrame.top_line} → ${activeFrame.bottom_line}` 
                : '1080p Desktop Frame Inspector'}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn btn-outline btn-sm"
                onClick={() => setImageZoom(prev => Math.max(0.6, prev - 0.2))}
              >
                <ZoomOut size={12} />
              </button>
              <button 
                className="btn btn-outline btn-sm"
                onClick={() => setImageZoom(1)}
              >
                100%
              </button>
              <button 
                className="btn btn-outline btn-sm"
                onClick={() => setImageZoom(prev => Math.min(2.5, prev + 0.2))}
              >
                <ZoomIn size={12} />
              </button>
            </div>
          </div>

          <div className="inspector-view-container">
            {activeFrame ? (
              <div 
                className="source-image-wrapper"
                style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center center' }}
              >
                <img 
                  src={`${API_BASE}/api/frames/${activeFrame.frame_id}/image`} 
                  alt={activeFrame.frame_id} 
                />
              </div>
            ) : (
              <div style={{ color: '#484f58', fontFamily: 'monospace', fontSize: '13px' }}>
                Select a captured frame from the feed to inspect the 1080p source image
              </div>
            )}
          </div>
        </main>

        {/* Column 3: Line-by-Line Code Inspector & Verification */}
        <section className="line-inspector-panel">
          <div className="panel-header">
            <span>Verified Markdown Lines ({filteredLines.length})</span>
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
                No lines transcribed yet. Upload settled frames from Pixel 10 to transcribe!
              </div>
            ) : (
              filteredLines.map(line => (
                <div 
                  key={line.line_number}
                  className={`line-row ${line.status} ${selectedLine?.line_number === line.line_number ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedLine(line);
                    if (line.frame_id && line.frame_id !== 'manual') {
                      setSelectedFrameId(line.frame_id);
                    }
                  }}
                >
                  <div className="gutter-cell">{line.line_number}</div>
                  <div className="text-cell">
                    {line.text || <span style={{ color: '#484f58', fontStyle: 'italic' }}>(blank line)</span>}
                  </div>
                  <div className="actions-cell">
                    <span className={`status-badge ${line.status}`}>
                      {line.status.replace('_', ' ')}
                    </span>
                    
                    <button 
                      className="btn btn-outline btn-sm"
                      title="Edit Line"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingLine(line);
                        setEditText(line.text);
                      }}
                    >
                      <Edit3 size={11} />
                    </button>

                    <button 
                      className="btn btn-outline btn-sm"
                      title="Seek & Recapture on Mobile"
                      style={{ color: '#bc8cff', borderColor: '#bc8cff33' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRequestRecapture(line.line_number);
                      }}
                    >
                      <Smartphone size={11} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Edit Line Modal */}
      {editingLine && (
        <div className="modal-overlay" onClick={() => setEditingLine(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>Edit Line #{editingLine.line_number}</span>
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
