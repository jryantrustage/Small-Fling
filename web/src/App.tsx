import { useState, useEffect, useRef } from 'react';
import {
  Scan, Settings, ZoomIn, ZoomOut, Search, Check, X,
  Coins, Layers, RotateCw, AlertCircle, FolderKanban, Plus, Trash2, Ban,
  ChevronLeft, ChevronRight, MoveVertical, Camera, Cloud, Zap, Smartphone
} from 'lucide-react';

const env = import.meta.env;
const API_BASE = (() => {
  const u = env.VITE_API_BASE_URL;
  if (!u || u === 'http://127.0.0.1:8000' || u === 'http://localhost:8000') {
    if (typeof window !== 'undefined' && window.location.port === '5173') return '';
  }
  return u || '';
})();
const POLL_INTERVAL_MS = Number(env.VITE_POLL_INTERVAL_MS) || 1200;

const api = async (p: string, o?: RequestInit) => fetch(`${API_BASE}${p}`, o);
const apiJson = async <T,>(p: string, o?: RequestInit): Promise<T> => (await api(p, o)).json();

interface ProjectData {
  id: string; name: string; description: string; target_total_lines: number;
  status: string; is_active: number; created_at: string; updated_at: string;
  frame_count?: number; line_count?: number; min_line?: number | null; max_line?: number | null;
}
interface LineData {
  line_number: number; gutter_number?: number; text: string; is_blank: boolean;
  is_wrapped?: boolean; wrapped_line_count?: number; status: string;
  frame_id: string; sources?: string[]; confidence?: number; notes: string; updated_at: string;
}
interface FrameData {
  frame_id: string; filename: string; top_line: number; bottom_line: number; page_index: number;
  file_size: number; status: string; created_at: string; extracted_line_count: number;
  custom_offset_y?: number; model_used?: string;
  token_usage?: { prompt_tokens: number; candidates_tokens: number; total_tokens: number };
}
interface RecaptureItem { line_number: number; reason: string; requested_at: string; }
interface TokenStats {
  total_prompt_tokens: number; total_candidates_tokens: number; total_tokens: number;
  total_api_calls: number; estimated_cost_usd: number;
  mobile_tokens?: { prompt_tokens: number; candidates_tokens: number; total_tokens: number };
}
interface BoundingBoxItem { x: number; y: number; width: number; height: number; line_number?: number; text_snippet?: string; }
interface FrameBoundingBoxes { first_line?: BoundingBoxItem; last_line?: BoundingBoxItem; wrapped_lines?: BoundingBoxItem[]; }

const Modal = ({ title, onClose, onConfirm, confirmText = 'Save', confirmIcon: Icon = Check, danger = false, disabled = false, children }: any) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-card" onClick={e => e.stopPropagation()} style={danger ? { borderColor: 'rgba(255, 123, 114, 0.5)' } : undefined}>
      <div className="modal-header" style={danger ? { borderBottomColor: 'rgba(255, 123, 114, 0.2)', color: '#ff7b72' } : undefined}>
        <span>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        {onConfirm && (
          <button className={`btn ${danger ? 'btn-outline' : 'btn-primary'}`} style={danger ? { borderColor: '#ff7b72', color: '#ff7b72', background: 'rgba(255, 123, 114, 0.15)' } : undefined} onClick={onConfirm} disabled={disabled}>
            {Icon && <Icon size={14} />} {confirmText}
          </button>
        )}
      </div>
    </div>
  </div>
);

export default function App() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectData | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [projectToAbort, setProjectToAbort] = useState<ProjectData | null>(null);
  const [newProject, setNewProject] = useState({ name: '', desc: '', target: 0 });

  const [documentData, setDocumentData] = useState<{ total_lines: number; issue_count: number; min_line: number; max_line: number; lines: LineData[] }>({
    total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: []
  });
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [recaptureQueue, setRecaptureQueue] = useState<RecaptureItem[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats>({ total_prompt_tokens: 0, total_candidates_tokens: 0, total_tokens: 0, total_api_calls: 0, estimated_cost_usd: 0 });

  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<LineData | null>(null);
  const [editingLine, setEditingLine] = useState<LineData | null>(null);
  const [editText, setEditText] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'issues'>('all');
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');
  const [imageZoom, setImageZoom] = useState(1);
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const [frameBoundingBoxes, setFrameBoundingBoxes] = useState<Record<string, FrameBoundingBoxes>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [backendConnected, setBackendConnected] = useState(true);
  const [inspectorMode, setInspectorMode] = useState<'single' | 'spliced'>('single');
  const [reprocessingFrameId, setReprocessingFrameId] = useState<string | null>(null);
  const [pipelineMode, setPipelineMode] = useState<'cloud' | 'local'>('cloud');
  const [deviceModel, setDeviceModel] = useState<'pixel_10' | 'pixel_8'>('pixel_10');
  const [isSwitchingPipeline, setIsSwitchingPipeline] = useState(false);
  const [deletingFrameId, setDeletingFrameId] = useState<string | null>(null);

  const lineListRef = useRef<HTMLDivElement>(null);
  const prevFramesCountRef = useRef(0);
  const selectedFrameIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedFrameIdRef.current = selectedFrameId;
  }, [selectedFrameId]);

  const handleSelectDevice = async (dev: 'pixel_10' | 'pixel_8') => {
    setDeviceModel(dev);
    try {
      await api('/api/device/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_model: dev })
      });
    } catch (e) {
      console.error('Failed to select device', e);
    }
  };

  const sortedFrames = [...frames].filter(f => f && f.frame_id).sort((a, b) => a.top_line !== b.top_line ? a.top_line - b.top_line : a.page_index - b.page_index);

  const fetchData = async () => {
    try {
      const [projRes, docRes, framesRes, queueRes, cfgRes, modeRes] = await Promise.all([
        api('/api/projects'), api('/api/document'), api('/api/frames'),
        api('/api/recapture-queue'), api('/api/config'), api('/api/pipeline/mode')
      ]);
      if (modeRes && modeRes.ok) {
        const m = await modeRes.json();
        if (m.pipeline_mode) setPipelineMode(m.pipeline_mode);
      }
      if (projRes.ok) {
        const pList: ProjectData[] = await projRes.json();
        setProjects(pList);
        setActiveProject(pList.find(p => p.is_active === 1) || pList[0] || null);
      }
      if (docRes.ok) {
        setBackendConnected(true);
        const docJson = await docRes.json();
        setDocumentData(docJson);
        if (docJson.token_stats) setTokenStats(docJson.token_stats);
      }
      if (framesRes.ok) {
        const framesJson: FrameData[] = await framesRes.json();
        const validFrames = Array.isArray(framesJson) ? framesJson.filter(f => f && f.frame_id) : [];
        setFrames(validFrames);
        if (validFrames.length > 0 && (validFrames.length > prevFramesCountRef.current || !selectedFrameId || !validFrames.some(f => f.frame_id === selectedFrameId))) {
          setSelectedFrameId(validFrames[validFrames.length - 1].frame_id);
        }
        prevFramesCountRef.current = validFrames.length;
      }
      if (queueRes.ok) setRecaptureQueue(await queueRes.json());
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setApiKeyConfigured(!!cfg.gemini_api_key_configured);
        if (cfg.gemini_api_key && !apiKeyInput) setApiKeyInput(cfg.gemini_api_key);
      }
    } catch {
      setBackendConnected(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [selectedFrameId]);

  const handleSwitchProject = async (id: string) => {
    const res = await api(`/api/projects/${id}/activate`, { method: 'POST' });
    if (res.ok) {
      const p = await res.json();
      setActiveProject(p);
      setSelectedFrameId(null);
      setSelectedLine(null);
      prevFramesCountRef.current = 0;
      await fetchData();
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) return;
    const res = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProject.name.trim(), description: newProject.desc.trim(), target_total_lines: newProject.target })
    });
    if (res.ok) {
      const created = await res.json();
      setShowNewProjectModal(false);
      setNewProject({ name: '', desc: '', target: 0 });
      setActiveProject(created);
      await fetchData();
    }
  };

  const handleAbortProject = async (id: string) => {
    const res = await api(`/api/projects/${id}/abort`, { method: 'POST' });
    if (res.ok) {
      setShowAbortModal(false);
      setProjectToAbort(null);
      setSelectedFrameId(null);
      setSelectedLine(null);
      await fetchData();
    }
  };

  const handleClearProjectData = async (id: string) => {
    if (!window.confirm('Clear all frames and OCR lines for this project?')) return;
    const res = await api(`/api/projects/${id}/clear`, { method: 'POST' });
    if (res.ok) {
      setSelectedFrameId(null);
      setSelectedLine(null);
      prevFramesCountRef.current = 0;
      await fetchData();
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('Permanently delete this project?')) return;
    const res = await api(`/api/projects/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchData();
  };

  const handleDeleteFrame = async (id: string, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (!id || deletingFrameId) return;
    setDeletingFrameId(id);
    try {
      const res = await api(`/api/frames/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFrames(prev => {
          const remaining = prev.filter(f => f.frame_id !== id);
          if (selectedFrameId === id) {
            setSelectedFrameId(remaining.length > 0 ? remaining[remaining.length - 1].frame_id : null);
          }
          return remaining;
        });
        prevFramesCountRef.current = Math.max(0, prevFramesCountRef.current - 1);
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to delete frame:', err);
    } finally {
      setDeletingFrameId(null);
    }
  };

  const handleUpdateFramePosition = async (id: string, delta: number) => {
    const target = frames.find(f => f.frame_id === id);
    if (!target) return;
    const newOffset = (target.custom_offset_y || 0) + delta;
    setFrames(prev => prev.map(f => f.frame_id === id ? { ...f, custom_offset_y: newOffset } : f));
    await api(`/api/frames/${id}/position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_offset_y: newOffset })
    });
  };

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: any = null;
    const connectWs = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const base = API_BASE.startsWith('http') ? API_BASE.replace(/^http/, 'ws') : `${proto}//${host}`;
      ws = new WebSocket(`${base}/ws`);
      ws.onopen = () => { setWsConnected(true); setBackendConnected(true); };
      ws.onclose = () => { setWsConnected(false); timer = setTimeout(connectWs, 3000); };
      ws.onerror = () => ws?.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'new_frame' && msg.data?.frame_id) {
            const nf: FrameData = msg.data;
            setFrames(prev => {
              const clean = prev.filter(f => f && f.frame_id);
              const i = clean.findIndex(f => f.frame_id === nf.frame_id);
              return i >= 0 ? clean.map((f, idx) => idx === i ? nf : f) : [...clean, nf];
            });
            setSelectedFrameId(nf.frame_id);
            apiJson<{ total_lines: number; issue_count: number; min_line: number; max_line: number; lines: LineData[]; token_stats?: TokenStats }>('/api/document')
              .then(doc => { setDocumentData(doc); if (doc.token_stats) setTokenStats(doc.token_stats); });
          } else if (msg.type === 'frame_deleted') {
            setFrames(prev => {
              const remaining = prev.filter(f => f && f.frame_id && f.frame_id !== msg.frame_id);
              if (selectedFrameIdRef.current === msg.frame_id) {
                setSelectedFrameId(remaining.length > 0 ? remaining[remaining.length - 1].frame_id : null);
              }
              return remaining;
            });
            apiJson<{ total_lines: number; issue_count: number; min_line: number; max_line: number; lines: LineData[]; token_stats?: TokenStats }>('/api/document')
              .then(doc => { setDocumentData(doc); if (doc.token_stats) setTokenStats(doc.token_stats); });
          } else if (msg.type === 'document_updated') {
            setDocumentData(msg.data);
            if (msg.data.token_stats) setTokenStats(msg.data.token_stats);
          } else if (msg.type === 'device_selected' || msg.type === 'telemetry_updated') {
            if (msg.data?.device_id || msg.data?.device_model) {
              const d = (msg.data.device_id || msg.data.device_model || '').toLowerCase();
              if (d.includes('pixel 8') || d.includes('pixel_8')) setDeviceModel('pixel_8');
              else if (d.includes('pixel 10') || d.includes('pixel_10')) setDeviceModel('pixel_10');
            }
          } else if (msg.type === 'frame_processed' && msg.data?.frame_id) {
            setFrames(prev => prev.filter(f => f && f.frame_id).map(f => f.frame_id === msg.data.frame_id ? { ...f, ...msg.data } : f));
          } else if (msg.type === 'frame_error' && msg.data?.frame_id) {
            setFrames(prev => prev.filter(f => f && f.frame_id).map(f => f.frame_id === msg.data.frame_id ? { ...f, status: `error: ${msg.data.error}` } : f));
          } else if (msg.type === 'frame_bounding_boxes' && msg.data?.frame_id) {
            setFrameBoundingBoxes(prev => ({ ...prev, [msg.data.frame_id]: msg.data.boxes }));
          } else if (msg.type === 'pipeline_mode_changed') {
            if (msg.data?.pipeline_mode) {
              setPipelineMode(msg.data.pipeline_mode);
            }
          }
        } catch {}
      };
    };
    connectWs();
    return () => { if (ws) ws.close(); clearTimeout(timer); };
  }, []);

  const handleTogglePipelineMode = async (mode: 'cloud' | 'local') => {
    setIsSwitchingPipeline(true);
    try {
      const res = await api('/api/pipeline/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
        const d = await res.json();
        setPipelineMode(d.pipeline_mode);
      }
    } catch (e) {
      console.error('Failed to toggle pipeline mode:', e);
    } finally {
      setIsSwitchingPipeline(false);
    }
  };

  const handleScanFrameOcr = async () => {
    if (!activeFrame) return;
    setIsScanningOcr(true);
    setScanStatusMsg('Scanning with local model (minicpm-v)...');
    try {
      const res = await api(`/api/frames/${activeFrame.frame_id}/scan`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setScanStatusMsg(`Scan OK: ${d.extracted_line_count} lines found`);
        const doc = await apiJson<any>('/api/document');
        setDocumentData(doc);
        if (doc.token_stats) setTokenStats(doc.token_stats);
      } else {
        const err = await res.json().catch(() => ({}));
        setScanStatusMsg(`Scan error: ${err.detail || 'Failed'}`);
      }
    } catch (e: any) {
      setScanStatusMsg(`Scan failed: ${e.message}`);
    } finally {
      setIsScanningOcr(false);
    }
  };

  const handleCaptureDesktop = async () => {
    try {
      await api('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'CAPTURE_DESKTOP', source: 'web_studio' })
      });
    } catch (e) {
      console.error('Failed to capture desktop:', e);
    }
  };

  const handleSaveLineEdit = async () => {
    if (!editingLine) return;
    const res = await api(`/api/lines/${editingLine.line_number}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: editText })
    });
    if (res.ok) {
      setEditingLine(null);
      await fetchData();
    }
  };

  const handleSaveApiKey = async () => {
    const res = await api('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini_api_key: apiKeyInput.trim() })
    });
    if (res.ok) {
      setApiKeyConfigured(true);
      setShowConfigModal(false);
    }
  };

  const handleReprocessFrame = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setReprocessingFrameId(id);
    try {
      await api(`/api/frames/${id}/reprocess`, { method: 'POST' });
      await fetchData();
    } finally {
      setReprocessingFrameId(null);
    }
  };

  const handleReprocessAllFailed = async () => {
    await api('/api/reprocess-failed', { method: 'POST' });
    await fetchData();
  };

  const filteredLines = documentData.lines.filter(item => {
    if (filterMode === 'issues' && !['flagged', 'missing', 'overlap_conflict', 'recapturing'].includes(item.status)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return item.text.toLowerCase().includes(q) || String(item.line_number).includes(q) || String(item.gutter_number || '').includes(q);
  });

  const activeFrame = frames.find(f => f.frame_id === selectedFrameId);
  const totalCombinedTokens = tokenStats.total_tokens + (tokenStats.mobile_tokens?.total_tokens || 0);
  const devDisplayName = deviceModel === 'pixel_8' ? 'Pixel 8' : 'Pixel 10';

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-section">
          <span className="brand-title">MATRIX CAPTURE</span>
          {activeProject && (
            <div className="active-project-pill" onClick={() => setIsSidebarOpen(true)} title="Active project (Click to manage)">
              <FolderKanban size={13} color="#00ff9d" />
              <span className="project-name">{activeProject.name}</span>
            </div>
          )}
        </div>

        {/* Realtime Metrics & Controls */}
        <div className="header-metrics">
          {/* Runtime Capture Pipeline Toggle */}
          <div className="pipeline-mode-pill" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '2px 3px', gap: '3px' }}>
            <button
              onClick={() => handleTogglePipelineMode('cloud')}
              disabled={isSwitchingPipeline}
              title="Cloud Mode: Gemini 2.5 Flash Vision Multimodal"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 9px', borderRadius: '16px', border: 'none',
                cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                background: pipelineMode === 'cloud' ? 'linear-gradient(135deg, #1f6feb, #388bfd)' : 'transparent',
                color: pipelineMode === 'cloud' ? '#ffffff' : '#8b949e',
                transition: 'all 0.15s ease'
              }}
            >
              <Cloud size={13} />
              <span>CLOUD</span>
            </button>
            <button
              onClick={() => handleTogglePipelineMode('local')}
              disabled={isSwitchingPipeline}
              title={`Local Mode: ${devDisplayName} ML Kit Gutter OCR + Laptop Ollama Vision`}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 9px', borderRadius: '16px', border: 'none',
                cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                background: pipelineMode === 'local' ? 'linear-gradient(135deg, #238636, #2ea043)' : 'transparent',
                color: pipelineMode === 'local' ? '#ffffff' : '#8b949e',
                transition: 'all 0.15s ease'
              }}
            >
              <Zap size={13} color={pipelineMode === 'local' ? '#ffdf5d' : '#8b949e'} />
              <span>LOCAL</span>
            </button>
          </div>

          {/* Target Device Switcher (Pixel 10 / Pixel 8) */}
          <div className="device-mode-pill" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '2px 3px', gap: '3px' }}>
            <button
              onClick={() => handleSelectDevice('pixel_8')}
              title="Google Pixel 8 (31 lines/page)"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 9px', borderRadius: '16px', border: 'none',
                cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                background: deviceModel === 'pixel_8' ? 'linear-gradient(135deg, #8957e5, #a371f7)' : 'transparent',
                color: deviceModel === 'pixel_8' ? '#ffffff' : '#8b949e',
                transition: 'all 0.15s ease'
              }}
            >
              <Smartphone size={12} />
              <span>PIXEL 8 (31L)</span>
            </button>
            <button
              onClick={() => handleSelectDevice('pixel_10')}
              title="Google Pixel 10 (49 lines/page)"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 9px', borderRadius: '16px', border: 'none',
                cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)',
                background: deviceModel === 'pixel_10' ? 'linear-gradient(135deg, #1f6feb, #388bfd)' : 'transparent',
                color: deviceModel === 'pixel_10' ? '#ffffff' : '#8b949e',
                transition: 'all 0.15s ease'
              }}
            >
              <Smartphone size={12} />
              <span>PIXEL 10 (49L)</span>
            </button>
          </div>

          <div className="metric-pill" style={{ borderColor: wsConnected ? '#00ff9d44' : '#ff7b7244' }}>
            <span className="label">SOCKET:</span>
            <span className="value" style={{ color: wsConnected ? '#00ff9d' : '#ff7b72' }}>{wsConnected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          {recaptureQueue.length > 0 && (
            <div className="metric-pill" style={{ borderColor: '#bc8cff44' }}>
              <span className="label">RECAPTURE:</span><span className="value" style={{ color: '#bc8cff' }}>{recaptureQueue.length}</span>
            </div>
          )}
          <div className="metric-pill token-pill" title={`Prompt: ${tokenStats.total_prompt_tokens.toLocaleString()} | Completion: ${tokenStats.total_candidates_tokens.toLocaleString()}`}>
            <Coins size={13} color="#00ff9d" />
            <span className="label">TOKENS:</span><span className="value">{totalCombinedTokens.toLocaleString()}</span>
            <span className="cost-tag">${tokenStats.estimated_cost_usd.toFixed(4)}</span>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn btn-outline" onClick={() => setShowConfigModal(true)}>
            <Settings size={14} />
            <span>{apiKeyConfigured ? 'Gemini API Key ✔' : 'Configure API Key'}</span>
          </button>
        </div>
      </header>

      {/* Action Bar */}
      <div className="orchestration-bar">
        <div className="orchestration-actions">
          <button className="btn btn-orch btn-capture-desktop" onClick={handleCaptureDesktop} title="Capture Desktop Screen">
            <Camera size={14} />
            <span>capture desktop mode</span>
          </button>
        </div>
      </div>

      {!backendConnected && (
        <div style={{ backgroundColor: '#ff7b7218', borderBottom: '1px solid #ff7b7233', color: '#ff7b72', padding: '6px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', fontWeight: 500 }}>
          <AlertCircle size={14} /><span>FastAPI backend unreachable. Retrying connection to port 8000... Ensure server is running with 'python main.py'.</span>
        </div>
      )}

      {/* 3-Column Studio Workspace */}
      <div className="studio-body">
        {/* Projects Sidebar */}
        <aside className={`projects-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
          {isSidebarOpen ? (
            <div className="projects-sidebar-content">
              <div className="sidebar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FolderKanban size={16} color="#00ff9d" /><span style={{ fontWeight: 600, fontSize: '13px', color: '#e6edf3' }}>Projects</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => setShowNewProjectModal(true)} style={{ padding: '3px 8px', fontSize: '11px' }}><Plus size={12} /> New</button>
                  <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(false)}><ChevronLeft size={14} /></button>
                </div>
              </div>

              <div className="projects-list">
                {projects.map(p => (
                  <div key={p.id} className={`project-card ${p.id === activeProject?.id ? 'active' : ''} ${p.status === 'aborted' ? 'aborted' : ''}`} onClick={() => handleSwitchProject(p.id)}>
                    <div className="project-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`project-status-dot ${p.id === activeProject?.id ? 'active' : ''}`} />
                        <span className="project-title">{p.name}</span>
                      </div>
                      {p.id === activeProject?.id ? <span className="active-badge">ACTIVE</span> : p.status === 'aborted' ? <span style={{ fontSize: '9px', color: '#ff7b72', border: '1px solid rgba(255,123,114,0.3)', padding: '1px 4px', borderRadius: '3px' }}>ABORTED</span> : null}
                    </div>
                    {p.description && <p className="project-desc">{p.description}</p>}
                    <div className="project-stats"><span>Status: {p.status}</span>{p.target_total_lines > 0 && <span>• Target: {p.target_total_lines} ln</span>}</div>
                    <div className="project-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn-text-muted" onClick={() => handleClearProjectData(p.id)}>Clear Data</button>
                      {p.status !== 'aborted' && <button className="btn-text-danger" onClick={() => { setProjectToAbort(p); setShowAbortModal(true); }}><Ban size={11} /> Abort</button>}
                      {projects.length > 1 && <button className="btn-text-danger" onClick={() => handleDeleteProject(p.id)}><Trash2 size={11} /></button>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="sidebar-footer"><div className="db-indicator"><span className="db-dot" /><span>SQLite3: matrix_capture.db</span></div></div>
            </div>
          ) : (
            <div className="projects-sidebar-rail" onClick={() => setIsSidebarOpen(true)}>
              <button className="rail-add-btn" onClick={(e) => { e.stopPropagation(); setShowNewProjectModal(true); }}><Plus size={14} /></button>
              <FolderKanban size={16} color="#00ff9d" /><span className="rail-project-label">{activeProject ? activeProject.name : 'Projects'}</span>
              <ChevronRight size={14} color="#8b949e" style={{ marginTop: 'auto' }} />
            </div>
          )}
        </aside>

        {/* Column 1: Captured Frame Feed */}
        <aside className="frames-feed-panel">
          <div className="panel-header">
            <span>Captured Frames ({frames.length})</span>
            {frames.some(f => f.status.startsWith('error')) && (
              <button className="btn btn-sm btn-outline btn-warning-outline" onClick={handleReprocessAllFailed}><RotateCw size={11} /> Retry Failed</button>
            )}
          </div>

          <div className="frames-list">
            {sortedFrames.length === 0 ? (
              <div className="drop-zone-placeholder" style={{ cursor: 'default' }}>
                <span style={{ fontWeight: 600, color: '#e6edf3' }}>Captured Frames</span>
                <span style={{ fontSize: '11px', color: '#8b949e' }}>Settled {devDisplayName} frames appear here automatically</span>
              </div>
            ) : (
              sortedFrames.map((f, idx) => {
                const prevFrame = idx > 0 ? sortedFrames[idx - 1] : null;
                const hasGap = prevFrame && prevFrame.bottom_line > 0 && f.top_line > prevFrame.bottom_line + 1;
                return (
                  <div key={f.frame_id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {hasGap && (
                      <div className="gap-alert-tag"><AlertCircle size={11} /><span>Gap: missing Ln {prevFrame.bottom_line + 1} → {f.top_line - 1}</span></div>
                    )}
                    <div className={`frame-card ${selectedFrameId === f.frame_id ? 'active' : ''} ${f.status.startsWith('error') ? 'frame-error' : ''}`} onClick={() => setSelectedFrameId(f.frame_id)}>
                      <div className="frame-card-preview">
                        <img src={`${API_BASE}/api/frames/${f.frame_id}/image?t=${encodeURIComponent(f.created_at || '')}`} alt={f.frame_id} />
                        <span className="frame-badge">Pg {f.page_index}</span>
                        {f.token_usage && f.token_usage.total_tokens > 0 && <span className="frame-token-badge"><Coins size={9} /> {f.token_usage.total_tokens}</span>}
                        <button
                          className="frame-card-delete-overlay"
                          onClick={(e) => handleDeleteFrame(f.frame_id, e)}
                          disabled={deletingFrameId === f.frame_id}
                          title="Delete frame image"
                          aria-label="Delete frame image"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="frame-card-info">
                        <span className="frame-lines-badge">Ln {f.top_line} → {f.bottom_line}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`frame-status-dot ${f.status === 'processed' ? 'processed' : (f.status === 'queued' ? 'queued' : 'error')}`} />
                          <span className="frame-status-text" title={f.status}>{f.extracted_line_count > 0 ? `${f.extracted_line_count} ln` : (f.status.startsWith('error') ? 'Error' : f.status)}</span>
                          {(f.status.startsWith('error') || (f.status !== 'queued' && f.extracted_line_count === 0)) && (
                            <button className="frame-retry-btn" onClick={(e) => handleReprocessFrame(f.frame_id, e)} disabled={reprocessingFrameId === f.frame_id || f.status === 'queued'}>
                              <RotateCw size={11} className={reprocessingFrameId === f.frame_id ? 'spinning' : ''} />
                            </button>
                          )}
                        </div>
                        <div className="frame-position-controls" onClick={e => e.stopPropagation()} title="Micro-nudge offset (px)">
                          <MoveVertical size={10} color="#8b949e" />
                          <button className="nudge-btn" onClick={() => handleUpdateFramePosition(f.frame_id, -1)}>▲</button>
                          <span className="nudge-val">{f.custom_offset_y || 0}px</span>
                          <button className="nudge-btn" onClick={() => handleUpdateFramePosition(f.frame_id, 1)}>▼</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Column 2: Frame Inspector */}
        <main className="frame-inspector-panel">
          <div className="panel-header">
            <div style={{ display: 'flex', gap: '3px', background: '#0d1117', padding: '2px', borderRadius: '6px', border: '1px solid #30363d' }}>
              <button className={`btn btn-sm ${inspectorMode === 'single' ? 'btn-primary' : ''}`} onClick={() => setInspectorMode('single')} style={{ fontSize: '11px', padding: '3px 8px' }}>Single Frame</button>
              <button className={`btn btn-sm ${inspectorMode === 'spliced' ? 'btn-primary' : ''}`} onClick={() => setInspectorMode('spliced')} style={{ fontSize: '11px', padding: '3px 8px' }}>Spliced Document ({frames.length})</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {inspectorMode === 'single' && activeFrame && (
                <button className="btn-scan-ocr" onClick={handleScanFrameOcr} disabled={isScanningOcr}>
                  <Scan size={13} className={isScanningOcr ? 'spinning' : ''} /><span>{isScanningOcr ? 'Scanning...' : 'Send Image for OCR'}</span>
                </button>
              )}
              {scanStatusMsg && <span className="scan-status-pill">{scanStatusMsg}</span>}
              <button className={`btn btn-sm ${zoomMode === 'fit' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setZoomMode('fit'); setImageZoom(1); }}>Fit</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setZoomMode('custom'); setImageZoom(p => Math.max(0.4, Number((p - 0.2).toFixed(1)))); }}><ZoomOut size={12} /></button>
              <button className="btn btn-outline btn-sm" onClick={() => { setZoomMode('custom'); setImageZoom(p => Math.min(3.0, Number((p + 0.2).toFixed(1)))); }}><ZoomIn size={12} /></button>
            </div>
          </div>

          <div className="inspector-view-container">
            {inspectorMode === 'spliced' ? (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Layers size={14} color="#00ff9d" /><span style={{ fontSize: '11px', color: '#00ff9d', fontFamily: 'monospace', fontWeight: 700 }}>CONTINUOUS SPLICED CANVAS · {frames.length} FRAMES</span></div>
                  <span style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>Auto-spliced by first & last gutter lines</span>
                </div>
                <div className={`source-image-wrapper ${zoomMode}`} style={zoomMode === 'custom' ? { transform: `scale(${imageZoom})`, transformOrigin: 'top left' } : undefined}>
                  <img src={`${API_BASE}/api/spliced-document-image?t=${frames.length}_${frames[frames.length - 1]?.created_at || ''}`} alt="Spliced Continuous Document" style={{ width: zoomMode === 'fit' ? '100%' : 'auto', display: 'block' }} />
                </div>
              </div>
            ) : (
              <>
                {activeFrame && activeFrame.status.startsWith('error') && (
                  <div className="frame-error-banner">
                    <AlertCircle size={18} color="#f85149" />
                    <div className="frame-error-content"><div className="frame-error-title">OCR Transcription Error</div><div className="frame-error-detail">{activeFrame.status}</div></div>
                    <button className="btn btn-sm btn-primary frame-error-retry-btn" onClick={() => handleReprocessFrame(activeFrame.frame_id)} disabled={reprocessingFrameId === activeFrame.frame_id}>
                      <RotateCw size={13} className={reprocessingFrameId === activeFrame.frame_id ? 'spinning' : ''} /><span>{reprocessingFrameId === activeFrame.frame_id ? 'Retrying...' : 'Retry OCR'}</span>
                    </button>
                  </div>
                )}
                {activeFrame ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                    <div className="gutter-line-callout top">
                      <span className="gutter-callout-icon">▲</span><span className="gutter-callout-label">START LINE NUMBER (TOP GUTTER):</span>
                      <span className="gutter-callout-value">{activeFrame.top_line > 0 ? `Line #${activeFrame.top_line}` : 'Detecting...'}</span>
                    </div>
                    <div className={`source-image-wrapper ${zoomMode}`} style={zoomMode === 'custom' ? { transform: `scale(${imageZoom})`, transformOrigin: 'top left' } : undefined}>
                      <img src={`${API_BASE}/api/frames/${activeFrame.frame_id}/image?t=${encodeURIComponent(activeFrame.created_at || '')}`} alt={activeFrame.frame_id} />
                      {frameBoundingBoxes[activeFrame.frame_id] && (
                        <svg className="bbox-svg-overlay" viewBox="0 0 1920 1080" preserveAspectRatio="none">
                          {frameBoundingBoxes[activeFrame.frame_id].first_line && (
                            <rect x={frameBoundingBoxes[activeFrame.frame_id].first_line!.x} y={frameBoundingBoxes[activeFrame.frame_id].first_line!.y} width={frameBoundingBoxes[activeFrame.frame_id].first_line!.width} height={frameBoundingBoxes[activeFrame.frame_id].first_line!.height} className="bbox-rect-green" />
                          )}
                          {frameBoundingBoxes[activeFrame.frame_id].last_line && (
                            <rect x={frameBoundingBoxes[activeFrame.frame_id].last_line!.x} y={frameBoundingBoxes[activeFrame.frame_id].last_line!.y} width={frameBoundingBoxes[activeFrame.frame_id].last_line!.width} height={frameBoundingBoxes[activeFrame.frame_id].last_line!.height} className="bbox-rect-red" />
                          )}
                          {frameBoundingBoxes[activeFrame.frame_id].wrapped_lines?.map((wb, idx) => (
                            <rect key={idx} x={wb.x} y={wb.y} width={wb.width} height={wb.height} className="bbox-rect-yellow" />
                          ))}
                        </svg>
                      )}
                    </div>
                    <div className="gutter-line-callout bottom">
                      <span className="gutter-callout-icon">▼</span><span className="gutter-callout-label">END LINE NUMBER (BOTTOM GUTTER):</span>
                      <span className="gutter-callout-value">{activeFrame.bottom_line > 0 ? `Line #${activeFrame.bottom_line}` : 'Detecting...'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="empty-inspector-state"><Scan size={36} color="#30363d" /><p>Select a frame from the feed or capture a screen on mobile to inspect line alignment.</p></div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Column 3: Table */}
        <section className="line-inspector-panel">
          <div className="panel-header">
            <span>Verified Lines ({filteredLines.length})</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className={`btn btn-sm ${filterMode === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterMode('all')}>All ({documentData.total_lines})</button>
              <button className={`btn btn-sm ${filterMode === 'issues' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterMode('issues')}>Issues ({documentData.issue_count})</button>
            </div>
          </div>

          <div className="filter-bar">
            <Search size={14} color="#8b949e" />
            <input type="text" className="search-input" placeholder="Search lines by text or line number..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>

          <div className="lines-table-container" ref={lineListRef}>
            {filteredLines.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#6e7681' }}>
                <p>No lines transcribed yet.</p>
                <p style={{ fontSize: '11px', marginTop: '6px', color: '#8b949e' }}>Capture desktop or mobile screen to transcribe lines.</p>
              </div>
            ) : (
              <table className="clean-lines-table">
                <thead><tr><th className="th-line-num">Line #</th><th className="th-line-text">text</th></tr></thead>
                <tbody>
                  {filteredLines.map(line => (
                    <tr key={line.line_number} className={`table-line-row ${line.status} ${selectedLine?.line_number === line.line_number ? 'selected' : ''}`} onClick={() => { setSelectedLine(line); if (line.frame_id && line.frame_id !== 'manual') setSelectedFrameId(line.frame_id); }}>
                      <td className="td-line-num">{line.gutter_number || line.line_number}{line.is_wrapped && <span className="wrap-tag"> ↵</span>}</td>
                      <td className="td-line-text"><pre className="table-code-text">{line.text || <span className="blank-line-tag">(blank line)</span>}</pre></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Modals */}
      {editingLine && (
        <Modal title={`Edit Line #${editingLine.line_number} (Gutter: #${editingLine.gutter_number || editingLine.line_number})`} onClose={() => setEditingLine(null)} onConfirm={handleSaveLineEdit} confirmText="Save Line">
          <label style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>LINE TEXT (VERBATIM):</label>
          <textarea rows={4} style={{ width: '100%', background: '#0a0d12', border: '1px solid #30363d', borderRadius: '6px', padding: '10px', color: '#fff', fontFamily: 'monospace', fontSize: '12px' }} value={editText} onChange={e => setEditText(e.target.value)} />
        </Modal>
      )}

      {showConfigModal && (
        <Modal title="Gemini Cloud OCR Configuration" onClose={() => setShowConfigModal(false)} onConfirm={handleSaveApiKey} confirmText="Save Key">
          <p style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>Enter your Gemini API key to enable instant structured OCR on settled 1080p desktop frames.</p>
          <input type="password" placeholder="AIzaSy..." className="search-input" style={{ width: '100%', padding: '8px 12px' }} value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} />
        </Modal>
      )}

      {showNewProjectModal && (
        <Modal title="Create New Project" onClose={() => setShowNewProjectModal(false)} onConfirm={handleCreateProject} confirmText="Create & Activate" confirmIcon={Plus} disabled={!newProject.name.trim()}>
          <div className="modal-form-group"><label>PROJECT NAME *</label><input type="text" placeholder="e.g. Small-Fling Core" className="modal-input" value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
          <div className="modal-form-group"><label>DESCRIPTION (OPTIONAL)</label><input type="text" placeholder="Desktop screen capture scan" className="modal-input" value={newProject.desc} onChange={e => setNewProject(p => ({ ...p, desc: e.target.value }))} /></div>
          <div className="modal-form-group"><label>TARGET TOTAL LINES</label><input type="number" placeholder="0 (unspecified)" className="modal-input" value={newProject.target || ''} onChange={e => setNewProject(p => ({ ...p, target: Number(e.target.value) || 0 }))} /></div>
        </Modal>
      )}

      {showAbortModal && projectToAbort && (
        <Modal title="Abort Project & Clear Data" onClose={() => setShowAbortModal(false)} onConfirm={() => handleAbortProject(projectToAbort.id)} confirmText="Confirm Abort & Wipe Data" confirmIcon={Ban} danger={true}>
          <p style={{ fontSize: '13px', color: '#e6edf3', lineHeight: 1.5, marginBottom: '10px' }}>Are you sure you want to abort project <strong style={{ color: '#ff7b72' }}>{projectToAbort.name}</strong>?</p>
          <p style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>This will mark the project status as <strong style={{ color: '#ff7b72' }}>ABORTED</strong> and delete all captured screenshot frames and OCR transcribed lines from SQLite.</p>
        </Modal>
      )}
    </div>
  );
}
