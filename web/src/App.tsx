import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scan, Settings, Search, Check, X,
  Coins, Layers, RotateCw, AlertCircle, FolderKanban, Plus, Trash2,
  ChevronLeft, ChevronRight, MoveVertical, Camera, Cloud, Zap, Smartphone, Key, Cpu, Compass, ArrowRight, Loader2
} from 'lucide-react';
import { TelemetryToaster, type TelemetryData, type TelemetryEvent } from './TelemetryToaster';
import { FlowDag } from './FlowDag';

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

const Modal = ({ title, onClose, onConfirm, confirmText = 'Save', confirmIcon: Icon = Check, danger = false, disabled = false, width, children }: any) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-card" onClick={e => e.stopPropagation()} style={{ ...(danger ? { borderColor: 'rgba(255, 123, 114, 0.5)' } : {}), ...(width ? { width, maxWidth: '95vw' } : {}) }}>
      <div className="modal-header" style={danger ? { borderBottomColor: 'rgba(255, 123, 114, 0.2)', color: '#ff7b72' } : undefined}>
        <span>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-footer">
        <button className="btn btn-outline" onClick={onClose}>{onConfirm ? 'Cancel' : 'Close'}</button>
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
  const [newProject, setNewProject] = useState({ name: '', desc: '', target: 0 });

  const [documentData, setDocumentData] = useState<{ total_lines: number; issue_count: number; min_line: number; max_line: number; lines: LineData[] }>({
    total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: []
  });
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [recaptureQueue, setRecaptureQueue] = useState<RecaptureItem[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats>({ total_prompt_tokens: 0, total_candidates_tokens: 0, total_tokens: 0, total_api_calls: 0, estimated_cost_usd: 0 });

  // Telemetry & Network Monitoring
  const [telemetry, setTelemetry] = useState<TelemetryData>({});
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [eventsLog, setEventsLog] = useState<TelemetryEvent[]>([]);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState<boolean>(false);
  const [showDag, setShowDag] = useState<boolean>(true);
  const [showGotoModal, setShowGotoModal] = useState<boolean>(false);
  const [gotoTargetLine, setGotoTargetLine] = useState<number | string>('');
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [navStatus, setNavStatus] = useState<string>('');

  // Global Shortcut: Control + G
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        setShowGotoModal(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Horizontal Panel Resizing
  const [framesPanelWidth, setFramesPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mc_frames_panel_width');
      return saved ? Math.max(180, Math.min(650, Number(saved))) : 280;
    } catch {
      return 280;
    }
  });
  const [isDraggingFrames, setIsDraggingFrames] = useState(false);

  const [inspectorPercent, setInspectorPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mc_inspector_percent');
      return saved ? Math.max(20, Math.min(80, Number(saved))) : 48;
    } catch {
      return 48;
    }
  });
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<LineData | null>(null);
  const [editingLine, setEditingLine] = useState<LineData | null>(null);
  const [editText, setEditText] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'pipeline' | 'secrets'>('pipeline');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'issues'>('all');
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

  const addTelemetryEvent = useCallback((category: TelemetryEvent['category'], message: string, data?: any) => {
    const ev: TelemetryEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      category,
      message,
      data
    };
    setEventsLog(prev => [...prev.slice(-99), ev]);
  }, []);

  // Persist resizer panel widths
  useEffect(() => {
    try {
      localStorage.setItem('mc_frames_panel_width', String(framesPanelWidth));
    } catch {}
  }, [framesPanelWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('mc_inspector_percent', String(inspectorPercent));
    } catch {}
  }, [inspectorPercent]);

  // Maintain Screen Wake Lock so device doesn't sleep while app is in progress
  useEffect(() => {
    let sentinel: any = null;
    let isMounted = true;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && isMounted) {
        try {
          sentinel = await (navigator as any).wakeLock.request('screen');
        } catch {
          // Graceful fallback if permission denied or battery saver active
        }
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinel) {
        sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isDraggingFrames || isDraggingSplit) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, [isDraggingFrames, isDraggingSplit]);

  const handleFramesResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingFrames(true);
    const startX = e.clientX;
    const startWidth = framesPanelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(180, Math.min(650, startWidth + delta));
      setFramesPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDraggingFrames(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleSplitResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
    const inspectorPanel = document.querySelector('.frame-inspector-panel') as HTMLElement;
    const linesPanel = document.querySelector('.line-inspector-panel') as HTMLElement;
    if (!inspectorPanel || !linesPanel) return;

    const availableWidth = inspectorPanel.offsetWidth + linesPanel.offsetWidth;
    const inspectorLeft = inspectorPanel.getBoundingClientRect().left;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.clientX;
      const currentInspectorWidth = currentX - inspectorLeft;
      const pct = Math.max(20, Math.min(80, (currentInspectorWidth / availableWidth) * 100));
      setInspectorPercent(Math.round(pct));
    };

    const onMouseUp = () => {
      setIsDraggingSplit(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    selectedFrameIdRef.current = selectedFrameId;
  }, [selectedFrameId]);

  const handleSelectDevice = async (dev: 'pixel_10' | 'pixel_8') => {
    setDeviceModel(dev);
    addTelemetryEvent('SYSTEM', `Target device set to ${dev === 'pixel_8' ? 'Google Pixel 8 (31 lines)' : 'Google Pixel 10 (36 lines)'}`);
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
    const t0 = performance.now();
    try {
      const [projRes, docRes, framesRes, queueRes, cfgRes, modeRes, telRes] = await Promise.all([
        api('/api/projects'), api('/api/document'), api('/api/frames'),
        api('/api/recapture-queue'), api('/api/config'), api('/api/pipeline/mode'),
        api('/api/telemetry')
      ]);
      const rtt = Math.round(performance.now() - t0);
      setLatencyMs(rtt);
      if (telRes && telRes.ok) {
        const telJson = await telRes.json();
        if (telJson.telemetry) setTelemetry(telJson.telemetry);
        if (telJson.token_stats) setTokenStats(telJson.token_stats);
      }
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
      const data = await res.json();
      const p = data.project || data;
      setActiveProject(p);
      setProjects(prev => prev.map(proj => ({ ...proj, is_active: proj.id === id ? 1 : 0 })));
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
      addTelemetryEvent('SYSTEM', `Project created: ${created.name} (${created.target_total_lines || 0} lines calibrated via Ctrl+End / Ctrl+Home ✔)`);
      await fetchData();
    }
  };

  const handleGotoLine = async () => {
    const lineNum = typeof gotoTargetLine === 'number' ? gotoTargetLine : parseInt(String(gotoTargetLine).trim(), 10);
    if (!lineNum || isNaN(lineNum) || lineNum <= 0) return;
    setIsNavigating(true);
    setNavStatus(`Navigating with Arrow Down keys to Line ${lineNum}...`);
    try {
      const res = await api('/api/navigation/goto-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_line: lineNum })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.reached) {
          setNavStatus(`Reached Line ${data.current_top_line} (Target: ${data.target_line}) ✔`);
          addTelemetryEvent('SYSTEM', `Go To Line: Reached top line ${data.current_top_line}`);
        } else {
          setNavStatus(`Stopped at Line ${data.current_top_line} (Target: ${data.target_line}) ⚠️`);
          addTelemetryEvent('SYSTEM', `Go To Line: Stopped at line ${data.current_top_line} (Target: ${data.target_line})`);
        }
        await fetchData();
      } else {
        setNavStatus(`Navigation error: ${data.detail || 'Failed'}`);
      }
    } catch (err: any) {
      setNavStatus(`Error: ${err.message}`);
    } finally {
      setIsNavigating(false);
    }
  };

  const handleSendControlEnd = async () => {
    setNavStatus('Sending HID control + end to display mode window...');
    try {
      const res = await api('/api/navigation/control-end', { method: 'POST' });
      const data = await res.json();
      setNavStatus(`Dispatched control+end! Document end line: ${data.last_line || 'unknown'}`);
      addTelemetryEvent('SYSTEM', 'Dispatched HID control + end to focused window');
      await fetchData();
    } catch (e: any) {
      setNavStatus(`Error: ${e.message}`);
    }
  };

  const handleSendControlHome = async () => {
    setNavStatus('Sending HID control + home to display mode window...');
    try {
      const res = await api('/api/navigation/control-home', { method: 'POST' });
      const data = await res.json();
      setNavStatus(`Dispatched control+home! Top line anchored at Line ${data.current_top_line || 1}`);
      addTelemetryEvent('SYSTEM', 'Dispatched HID control + home to focused window');
      await fetchData();
    } catch (e: any) {
      setNavStatus(`Error: ${e.message}`);
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
      ws.onopen = () => {
        setWsConnected(true);
        setBackendConnected(true);
        addTelemetryEvent('WS', 'Connected to real-time telemetry stream');
      };
      ws.onclose = () => {
        setWsConnected(false);
        addTelemetryEvent('WS', 'WebSocket disconnected, reconnecting...');
        timer = setTimeout(connectWs, 3000);
      };
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
            addTelemetryEvent('FRAME', `New frame received: ${nf.frame_id.slice(0, 8)} (Pg ${nf.page_index}, ${nf.extracted_line_count || 0} ln)`);
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
            addTelemetryEvent('FRAME', `Frame ${msg.frame_id?.slice(0, 8)} deleted`);
            apiJson<{ total_lines: number; issue_count: number; min_line: number; max_line: number; lines: LineData[]; token_stats?: TokenStats }>('/api/document')
              .then(doc => { setDocumentData(doc); if (doc.token_stats) setTokenStats(doc.token_stats); });
          } else if (msg.type === 'document_updated') {
            setDocumentData(msg.data);
            if (msg.data.token_stats) setTokenStats(msg.data.token_stats);
            addTelemetryEvent('SYSTEM', `Document synced: ${msg.data.total_lines || 0} total lines`);
          } else if (msg.type === 'device_selected') {
            if (msg.data?.device_id || msg.data?.device_model) {
              const d = (msg.data.device_id || msg.data.device_model || '').toLowerCase();
              if (d.includes('pixel 8') || d.includes('pixel_8')) setDeviceModel('pixel_8');
              else if (d.includes('pixel 10') || d.includes('pixel_10')) setDeviceModel('pixel_10');
              addTelemetryEvent('SYSTEM', `Device sync: ${d}`);
            }
          } else if (msg.type === 'telemetry_updated') {
            if (msg.data) {
              setTelemetry(prev => ({ ...prev, ...msg.data }));
              if (msg.data?.device_id || msg.data?.device_model) {
                const d = (msg.data.device_id || msg.data.device_model || '').toLowerCase();
                if (d.includes('pixel 8') || d.includes('pixel_8')) setDeviceModel('pixel_8');
                else if (d.includes('pixel 10') || d.includes('pixel_10')) setDeviceModel('pixel_10');
              }
              addTelemetryEvent('SYSTEM', `Telemetry sync: ${msg.data.phase || msg.data.status_message || 'updated'}`);
            }
          } else if (msg.type === 'orchestration_event') {
            if (msg.telemetry) {
              setTelemetry(msg.telemetry);
              if (msg.telemetry.phase) {
                addTelemetryEvent('PACER', `Pacer ${msg.telemetry.phase}: ${msg.telemetry.status_message || ''}`);
              }
            }
          } else if (msg.type === 'frame_processed' && msg.data?.frame_id) {
            setFrames(prev => prev.filter(f => f && f.frame_id).map(f => f.frame_id === msg.data.frame_id ? { ...f, ...msg.data } : f));
            addTelemetryEvent('OCR', `Frame ${msg.data.frame_id.slice(0, 8)} OCR processed (${msg.data.extracted_line_count || 0} ln)`);
          } else if (msg.type === 'frame_error' && msg.data?.frame_id) {
            setFrames(prev => prev.filter(f => f && f.frame_id).map(f => f.frame_id === msg.data.frame_id ? { ...f, status: `error: ${msg.data.error}` } : f));
            addTelemetryEvent('ERROR', `Frame ${msg.data.frame_id.slice(0, 8)} failed: ${msg.data.error}`);
          } else if (msg.type === 'frame_bounding_boxes' && msg.data?.frame_id) {
            setFrameBoundingBoxes(prev => ({ ...prev, [msg.data.frame_id]: msg.data.boxes }));
          } else if (msg.type === 'pipeline_mode_changed') {
            if (msg.data?.pipeline_mode) {
              setPipelineMode(msg.data.pipeline_mode);
              addTelemetryEvent('SYSTEM', `Pipeline mode: ${msg.data.pipeline_mode}`);
            }
          } else if (msg.type === 'navigation_progress') {
            setNavStatus(`Navigating to Line ${msg.target_line}... (Current: Ln ${msg.current_top_line})`);
          } else if (msg.type === 'navigation_completed') {
            if (msg.reached) {
              setNavStatus(`Reached Line ${msg.current_top_line} (Target: ${msg.target_line}) ✔`);
            } else {
              setNavStatus(`Stopped at Line ${msg.current_top_line} (Target: ${msg.target_line}) ⚠️`);
            }
          }
        } catch {}
      };
    };
    connectWs();
    return () => { if (ws) ws.close(); clearTimeout(timer); };
  }, [addTelemetryEvent]);

  const handleTogglePipelineMode = async (mode: 'cloud' | 'local') => {
    setIsSwitchingPipeline(true);
    addTelemetryEvent('SYSTEM', `Switching pipeline mode to ${mode}`);
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
    if (!activeProject) {
      setShowNewProjectModal(true);
      return;
    }
    try {
      await api('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'CAPTURE_DESKTOP', source: 'web_studio' })
      });
    } catch (e) {
      console.error('Failed to trigger repeatedly capture page 1:', e);
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
        </div>

        <div className="header-actions">
          <button className="gear-btn" onClick={() => setShowConfigModal(true)} title="Studio Settings & Secrets" aria-label="Settings">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Action Bar */}
      <div className="orchestration-bar">
        <div className="orchestration-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn btn-orch btn-capture-desktop" onClick={handleCaptureDesktop} title="repeatedly capture page 1">
            <Camera size={14} />
            <span>repeatedly capture page 1</span>
          </button>
          <button
            className={`btn btn-sm ${showDag ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowDag(!showDag)}
            style={{ height: '36px', borderRadius: '8px', padding: '0 12px' }}
            title="Toggle Pagination Flow DAG"
          >
            <Layers size={14} />
            <span>{showDag ? 'Hide Flow DAG' : 'Show Flow DAG'}</span>
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setShowGotoModal(true)}
            style={{ height: '36px', borderRadius: '8px', padding: '0 12px' }}
            title="Go To Line (Ctrl+G)"
          >
            <Compass size={14} />
            <span>Go To Line (Ctrl+G)</span>
          </button>
        </div>
      </div>

      {/* Flow DAG Visualization */}
      {showDag && (
        <div style={{ padding: '0 20px 12px 20px' }}>
          <FlowDag
            apiBase={API_BASE}
            activeProjectId={activeProject?.id}
            currentTopLine={telemetry.current_top_line || documentData.min_line || 1}
            currentBottomLine={telemetry.current_bottom_line || documentData.max_line || 49}
            targetTotalLines={activeProject?.target_total_lines || telemetry.target_total_lines || 0}
            currentPage={telemetry.current_page || frames.length || 1}
            isOrchestrating={telemetry.is_pacing}
            onRefresh={fetchData}
          />
        </div>
      )}

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
                    <div key={p.id} className={`project-card ${p.id === activeProject?.id ? 'active' : ''}`} onClick={() => handleSwitchProject(p.id)}>
                      <div className="project-card-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                          <span className={`project-status-dot ${p.id === activeProject?.id ? 'active' : ''}`} />
                          <span className="project-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        </div>
                        <button
                          className="btn-text-danger"
                          onClick={e => { e.stopPropagation(); handleDeleteProject(p.id); }}
                          title="Delete project"
                          style={{ padding: '2px 4px', opacity: 0.8 }}
                        >
                          <Trash2 size={12} />
                        </button>
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

        {activeProject ? (
          <>
            {/* Column 1: Captured Frame Feed */}
            <aside className="frames-feed-panel" style={{ width: `${framesPanelWidth}px`, flexShrink: 0 }}>
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

        {/* Horizontal Resizer: Captured Frames Sidebar */}
        <div
          className={`panel-resizer ${isDraggingFrames ? 'dragging' : ''}`}
          onMouseDown={handleFramesResizerMouseDown}
          onDoubleClick={() => setFramesPanelWidth(280)}
          title="Drag to horizontally resize Captured Frames feed (Double-click to reset to 280px)"
          role="separator"
          aria-orientation="vertical"
        >
          <div className="panel-resizer-line" />
        </div>

        {/* Column 2: Frame Inspector */}
        <main className="frame-inspector-panel" style={{ flex: `${inspectorPercent} 1 0`, minWidth: '220px' }}>
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
            </div>
          </div>

          <div className="inspector-view-container">
            {inspectorMode === 'spliced' ? (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
                <div style={{ display: 'center', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Layers size={14} color="#00ff9d" /><span style={{ fontSize: '11px', color: '#00ff9d', fontFamily: 'monospace', fontWeight: 700 }}>CONTINUOUS SPLICED CANVAS · {frames.length} FRAMES</span></div>
                  <span style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>Auto-spliced by first & last gutter lines</span>
                </div>
                <div className="source-image-wrapper fit">
                  <img src={`${API_BASE}/api/spliced-document-image?t=${frames.length}_${frames[frames.length - 1]?.created_at || ''}`} alt="Spliced Continuous Document" style={{ width: '100%', display: 'block' }} />
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
                    <div className="source-image-wrapper fit">
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

        {/* Horizontal Resizer: Image View vs Verified Lines */}
        <div
          className={`panel-resizer ${isDraggingSplit ? 'dragging' : ''}`}
          onMouseDown={handleSplitResizerMouseDown}
          onDoubleClick={() => setInspectorPercent(48)}
          title="Drag to horizontally resize Image View vs Verified Lines split (Double-click to reset to 48/52)"
          role="separator"
          aria-orientation="vertical"
        >
          <div className="panel-resizer-line" />
        </div>

        {/* Column 3: Table */}
        <section className="line-inspector-panel" style={{ flex: `${100 - inspectorPercent} 1 0`, minWidth: '240px' }}>
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

          <div className="lines-table-container" ref={lineListRef} style={{ paddingBottom: isTelemetryExpanded ? '340px' : '40px' }}>
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
      </>
    ) : null}
  </div>

      {/* Modals */}
      {editingLine && (
        <Modal title={`Edit Line #${editingLine.line_number} (Gutter: #${editingLine.gutter_number || editingLine.line_number})`} onClose={() => setEditingLine(null)} onConfirm={handleSaveLineEdit} confirmText="Save Line">
          <label style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>LINE TEXT (VERBATIM):</label>
          <textarea rows={4} style={{ width: '100%', background: '#0a0d12', border: '1px solid #30363d', borderRadius: '6px', padding: '10px', color: '#fff', fontFamily: 'monospace', fontSize: '12px' }} value={editText} onChange={e => setEditText(e.target.value)} />
        </Modal>
      )}

      {showConfigModal && (
        <Modal
          title="Studio Settings"
          width="520px"
          onClose={() => setShowConfigModal(false)}
          onConfirm={settingsTab === 'secrets' ? handleSaveApiKey : undefined}
          confirmText="Save Key"
        >
          {/* Settings Tabs */}
          <div className="modal-tabs">
            <button
              className={`modal-tab ${settingsTab === 'pipeline' ? 'active' : ''}`}
              onClick={() => setSettingsTab('pipeline')}
              type="button"
            >
              <Cpu size={14} />
              <span>Pipeline Engine</span>
            </button>
            <button
              className={`modal-tab ${settingsTab === 'secrets' ? 'active' : ''}`}
              onClick={() => setSettingsTab('secrets')}
              type="button"
            >
              <Key size={14} />
              <span>Secrets</span>
            </button>
          </div>

          {/* Pipeline Tab Content */}
          {settingsTab === 'pipeline' && (
            <div className="settings-tab-content">
              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px' }}>
                  ACTIVE OCR PIPELINE
                </span>
              </div>

              <div className="pipeline-choices">
                {/* Cloud Pipeline Choice */}
                <div
                  className={`pipeline-choice-card ${pipelineMode === 'cloud' ? 'active cloud-active' : ''}`}
                  onClick={() => !isSwitchingPipeline && handleTogglePipelineMode('cloud')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="pipeline-choice-icon" style={{ color: '#58a6ff' }}>
                    <Cloud size={18} />
                  </div>
                  <div className="pipeline-choice-info">
                    <div className="pipeline-choice-title">
                      <span>Cloud Pipeline (Gemini 2.5 Flash)</span>
                      {pipelineMode === 'cloud' && <span className="badge-active-pill" style={{ background: 'rgba(88, 166, 255, 0.15)', color: '#58a6ff', borderColor: 'rgba(88, 166, 255, 0.3)' }}>ACTIVE</span>}
                    </div>
                    <p className="pipeline-choice-desc">
                      Fast, high-fidelity cloud vision model. Processes full-resolution settled frames with zero local GPU load.
                    </p>
                  </div>
                </div>

                {/* Local Pipeline Choice */}
                <div
                  className={`pipeline-choice-card ${pipelineMode === 'local' ? 'active' : ''}`}
                  onClick={() => !isSwitchingPipeline && handleTogglePipelineMode('local')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="pipeline-choice-icon" style={{ color: 'var(--color-primary)' }}>
                    <Zap size={18} />
                  </div>
                  <div className="pipeline-choice-info">
                    <div className="pipeline-choice-title">
                      <span>Local Pipeline (MiniCPM-V 2.6)</span>
                      {pipelineMode === 'local' && <span className="badge-active-pill">ACTIVE</span>}
                    </div>
                    <p className="pipeline-choice-desc">
                      100% offline vision-language model execution via local engine. Zero network calls and private inference.
                    </p>
                  </div>
                </div>
              </div>

              {/* Token & Telemetry Usage Box */}
              <div className="token-metrics-box">
                <div className="token-metrics-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Coins size={13} color="var(--color-primary)" />
                    <span>TOKEN & TELEMETRY USAGE</span>
                  </div>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                    ${tokenStats.estimated_cost_usd.toFixed(4)} USD
                  </span>
                </div>

                <div className="token-metrics-grid">
                  <div className="token-metric-item">
                    <span className="lbl">Total Tokens</span>
                    <span className="val">{totalCombinedTokens.toLocaleString()}</span>
                  </div>
                  <div className="token-metric-item">
                    <span className="lbl">API Calls</span>
                    <span className="val">{tokenStats.total_api_calls}</span>
                  </div>
                  <div className="token-metric-item">
                    <span className="lbl">Prompt Tokens</span>
                    <span className="val">{tokenStats.total_prompt_tokens.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Secrets Tab Content */}
          {settingsTab === 'secrets' && (
            <div className="settings-tab-content">
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 600 }}>
                    GEMINI API KEY
                  </label>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: apiKeyConfigured ? 'rgba(0, 255, 157, 0.12)' : 'rgba(255, 123, 114, 0.12)',
                      color: apiKeyConfigured ? 'var(--color-primary)' : '#ff7b72',
                      border: `1px solid ${apiKeyConfigured ? 'rgba(0, 255, 157, 0.25)' : 'rgba(255, 123, 114, 0.25)'}`
                    }}
                  >
                    {apiKeyConfigured ? '● CONFIGURED & ACTIVE' : '○ NOT CONFIGURED'}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '6px 0 12px' }}>
                  Enter your Google Gemini API key to enable Cloud OCR line detection and document transcription.
                </p>
                <input
                  type="password"
                  placeholder={apiKeyConfigured ? '••••••••••••••••••••••••••••••••' : 'AIzaSy...'}
                  className="modal-input"
                  style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          )}
        </Modal>
      )}

      {showNewProjectModal && (
        <Modal title="Create New Project" onClose={() => setShowNewProjectModal(false)} onConfirm={handleCreateProject} confirmText="Create & Activate" confirmIcon={Plus} disabled={!newProject.name.trim()}>
          <div className="modal-form-group">
            <label>PROJECT NAME *</label>
            <input
              type="text"
              placeholder="e.g. Small-Fling Core"
              className="modal-input"
              value={newProject.name}
              onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && newProject.name.trim()) handleCreateProject(); }}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {showGotoModal && (
        <Modal
          title="Go To Line (Ctrl+G)"
          onClose={() => {
            setShowGotoModal(false);
            setNavStatus('');
          }}
          width="480px"
        >
          <div className="modal-form-group">
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              TARGET LINE NUMBER (FIRST LINE OF LEFT SIDE GUTTER) *
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min="1"
                placeholder="e.g. 8761"
                className="modal-input"
                style={{ flex: 1, height: '38px', fontSize: '14px', fontFamily: 'var(--font-mono)' }}
                value={gotoTargetLine}
                onChange={e => setGotoTargetLine(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleGotoLine();
                  }
                }}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={handleGotoLine}
                disabled={isNavigating || !gotoTargetLine}
                style={{ height: '38px', padding: '0 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isNavigating ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
                <span>Go</span>
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
              Clicking <strong>Go</strong> will press the down arrow keys until the line number at the top of the left side gutter matches this number.
            </p>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              HARDWARE NAVIGATION (FOCUSED WINDOW OF DISPLAY MODE APP)
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: 1, height: '36px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                onClick={handleSendControlHome}
                disabled={isNavigating}
              >
                control+home
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: 1, height: '36px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                onClick={handleSendControlEnd}
                disabled={isNavigating}
              >
                control+end
              </button>
            </div>
          </div>

          {navStatus && (
            <div
              style={{
                marginTop: '16px',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '12px',
                color: navStatus.includes('Error') || navStatus.includes('error') ? '#ff7b72' : 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isNavigating && <Loader2 size={13} className="spin" />}
              <span>{navStatus}</span>
            </div>
          )}
        </Modal>
      )}

      {/* Real-time Telemetry Monitor Toaster */}
      <TelemetryToaster
        telemetry={telemetry}
        tokenStats={tokenStats}
        documentSummary={{
          total_lines: documentData.total_lines,
          min_line: documentData.min_line,
          max_line: documentData.max_line,
          total_frames: frames.length,
          issue_count: documentData.issue_count,
          verified_overlap_lines: documentData.lines.filter(l => l.status === 'verified_overlap').length
        }}
        wsConnected={wsConnected}
        backendConnected={backendConnected}
        latencyMs={latencyMs}
        pipelineMode={pipelineMode}
        deviceModel={deviceModel}
        eventsLog={eventsLog}
        onClearEvents={() => setEventsLog([])}
        onExpandedChange={setIsTelemetryExpanded}
      />
    </div>
  );
}


