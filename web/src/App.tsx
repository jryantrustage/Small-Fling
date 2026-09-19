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
  AlertCircle,
  FolderKanban,
  Plus,
  Trash2,
  Ban,
  ChevronLeft,
  ChevronRight,
  MoveVertical,
  Menu,
  Play,
  Pause,
  Square,
  Camera,
  Clock,
  Repeat,
  Flag,
  ChevronsRight,
  Sparkles
} from 'lucide-react';

const getApiBase = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (!envUrl || envUrl === 'http://127.0.0.1:8000' || envUrl === 'http://localhost:8000') {
    if (typeof window !== 'undefined' && window.location.port === '5173') {
      return '';
    }
  }
  return envUrl || '';
};

const API_BASE = getApiBase();
const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 1200;
const DEFAULT_TARGET_LINES = Number(import.meta.env.VITE_DEFAULT_TARGET_LINES) || 0;

interface ProjectData {
  id: string;
  name: string;
  description: string;
  target_total_lines: number;
  status: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  frame_count?: number;
  line_count?: number;
  min_line?: number | null;
  max_line?: number | null;
}

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
  custom_offset_y?: number;
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

interface BoundingBoxItem {
  x: number;
  y: number;
  width: number;
  height: number;
  line_number?: number;
  text_snippet?: string;
}

interface FrameBoundingBoxes {
  first_line?: BoundingBoxItem;
  last_line?: BoundingBoxItem;
  wrapped_lines?: BoundingBoxItem[];
}

export default function App() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectData | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [projectToAbort, setProjectToAbort] = useState<ProjectData | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectTargetLines, setNewProjectTargetLines] = useState(0);

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

  const [orchestrationState, setOrchestrationState] = useState<{
    status: string;
    last_command: string;
    timestamp: number;
    source?: string;
    invoked_by?: string;
    active_step?: string;
    step_label?: string;
    top_line?: number;
    bottom_line?: number;
    next_target_top?: number;
    page?: number;
  }>({
    status: 'IDLE',
    last_command: '',
    timestamp: 0,
    source: 'system',
    invoked_by: 'System ⚙️',
    active_step: 'START_READY',
    step_label: 'Line 1 Start Position Set (Ready to Begin)',
    top_line: 1,
    bottom_line: 49,
    next_target_top: 50,
    page: 1
  });

  const formatDeviceName = (source?: string) => {
    const s = (source || '').toLowerCase();
    if (s.includes('web')) return 'Web Studio 💻';
    if (s.includes('mobile')) return 'Mobile App 📱';
    if (s.includes('hud')) return 'Floating HUD 🪟';
    if (s.includes('pacer')) return 'Auto-Pacer ⚡';
    if (s.includes('api')) return 'Backend API ⚙️';
    return 'System ⚙️';
  };

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

  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const [frameBoundingBoxes, setFrameBoundingBoxes] = useState<Record<string, FrameBoundingBoxes>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [backendConnected, setBackendConnected] = useState(true);
  const [inspectorMode, setInspectorMode] = useState<'single' | 'spliced'>('single');

  const lineListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevFramesCountRef = useRef(0);

  // Strictly sorted frames in ascending order by line number (Ln 1 -> 10 on top, etc.)
  const sortedFrames = [...frames].sort((a, b) => {
    if (a.top_line !== b.top_line) {
      return a.top_line - b.top_line;
    }
    return a.page_index - b.page_index;
  });

  // Fetch all projects, document data, telemetry, frames, tokens, and orchestration
  const fetchData = async () => {
    try {
      const [projRes, docRes, framesRes, queueRes, cfgRes, telemetryRes, orchRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects`),
        fetch(`${API_BASE}/api/document`),
        fetch(`${API_BASE}/api/frames`),
        fetch(`${API_BASE}/api/recapture-queue`),
        fetch(`${API_BASE}/api/config`),
        fetch(`${API_BASE}/api/telemetry`),
        fetch(`${API_BASE}/api/orchestrate`)
      ]);

      if (projRes.ok) {
        const pList: ProjectData[] = await projRes.json();
        setProjects(pList);
        const active = pList.find(p => p.is_active === 1) || pList[0] || null;
        setActiveProject(active);
      }

      if (docRes.ok) {
        setBackendConnected(true);
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
            // Default to earliest or latest frame
            setSelectedFrameId(framesJson[0].frame_id);
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

      if (orchRes.ok) {
        const oJson = await orchRes.json();
        if (oJson.orchestration) {
          setOrchestrationState(oJson.orchestration);
        } else {
          setOrchestrationState(oJson);
        }
        if (oJson.telemetry) {
          setTelemetry(oJson.telemetry);
        }
      }
    } catch {
      setBackendConnected(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [selectedFrameId]);

  const handleSwitchProject = async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/activate`, {
        method: 'POST'
      });
      if (res.ok) {
        // Automatically collapse sidebar after selection
        setIsSidebarOpen(false);
        setSelectedFrameId(null);
        fetchData();
      }
    } catch (e) {
      console.error('Failed to switch project', e);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDesc.trim(),
          target_total_lines: newProjectTargetLines
        })
      });
      if (res.ok) {
        setNewProjectName('');
        setNewProjectDesc('');
        setNewProjectTargetLines(0);
        setShowNewProjectModal(false);
        setIsSidebarOpen(false);
        setSelectedFrameId(null);
        fetchData();
      }
    } catch (e) {
      console.error('Failed to create project', e);
    }
  };

  const handleAbortProject = async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/abort`, {
        method: 'POST'
      });
      if (res.ok) {
        setShowAbortModal(false);
        setProjectToAbort(null);
        setSelectedFrameId(null);
        fetchData();
      }
    } catch (e) {
      console.error('Failed to abort project', e);
    }
  };

  const handleClearProjectData = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to clear all frames and OCR lines for this project?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/clear`, {
        method: 'POST'
      });
      if (res.ok) {
        setSelectedFrameId(null);
        fetchData();
      }
    } catch (e) {
      console.error('Failed to clear project data', e);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this project and its images?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error('Failed to delete project', e);
    }
  };

  const handleUpdateFramePosition = async (frameId: string, delta: number) => {
    const targetFrame = frames.find(f => f.frame_id === frameId);
    if (!targetFrame) return;
    const newOffset = (targetFrame.custom_offset_y || 0) + delta;
    try {
      await fetch(`${API_BASE}/api/frames/${frameId}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_offset_y: newOffset })
      });
      setFrames(prev => prev.map(f => f.frame_id === frameId ? { ...f, custom_offset_y: newOffset } : f));
    } catch (e) {
      console.error('Failed to update frame offset', e);
    }
  };

  // Connect to FastAPI server via WebSocket for real-time frame streaming and OCR push
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectWs = () => {
      try {
        const wsUrl = API_BASE 
          ? API_BASE.replace(/^http/, 'ws') + '/ws'
          : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setWsConnected(true);
          setBackendConnected(true);
          console.log('[WebSocket] Connected to MatrixCapture server.');
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'new_frame' && msg.frame) {
              const newF: FrameData = msg.frame;
              setFrames(prev => {
                const existingIdx = prev.findIndex(f => f.frame_id === newF.frame_id);
                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = newF;
                  return updated;
                }
                return [...prev, newF];
              });
              // Automatically select and push image into the web UI inspector
              setSelectedFrameId(newF.frame_id);
            } else if (msg.type === 'ocr_completed') {
              if (msg.bounding_boxes) {
                setFrameBoundingBoxes(prev => ({
                  ...prev,
                  [msg.frame_id]: msg.bounding_boxes
                }));
              }
              // Immediately refresh document lines so right-hand panel populates
              fetch(`${API_BASE}/api/document`)
                .then(res => res.json())
                .then(data => setDocumentData(data))
                .catch(err => console.error(err));
            } else if (msg.type === 'orchestration_event') {
              if (msg.orchestration) {
                setOrchestrationState(msg.orchestration);
              } else if (msg.status) {
                setOrchestrationState({
                  status: msg.status,
                  last_command: msg.command || '',
                  timestamp: msg.timestamp || Date.now(),
                  source: msg.source || 'system',
                  invoked_by: formatDeviceName(msg.source),
                  active_step: msg.active_step,
                  step_label: msg.step_label
                });
              }
              if (msg.telemetry) {
                setTelemetry(prev => ({
                  ...prev,
                  current_page: msg.telemetry.current_page ?? msg.telemetry.page ?? prev.current_page,
                  current_top_line: msg.telemetry.current_top_line ?? msg.telemetry.top_line ?? prev.current_top_line,
                  current_bottom_line: msg.telemetry.current_bottom_line ?? msg.telemetry.bottom_line ?? prev.current_bottom_line,
                  dwell_countdown_ms: msg.telemetry.dwell_countdown_ms ?? prev.dwell_countdown_ms,
                  phase: msg.telemetry.phase ?? prev.phase,
                  status_message: msg.telemetry.status_message ?? prev.status_message
                }));
              }
            }
          } catch (e) {
            console.error('[WebSocket] Message parse error:', e);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (err) {
        console.error('[WebSocket] Connection failed:', err);
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  // Send selected frame to local AI model (Ollama minicpm-v) for OCR Scan
  const handleScanFrameOcr = async () => {
    if (!activeFrame) return;
    setIsScanningOcr(true);
    setScanStatusMsg('Scanning with Ollama (minicpm-v)...');
    try {
      const res = await fetch(`${API_BASE}/api/frames/${activeFrame.frame_id}/scan`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.bounding_boxes) {
          setFrameBoundingBoxes(prev => ({
            ...prev,
            [activeFrame.frame_id]: data.bounding_boxes
          }));
        }
        // Refresh document lines to populate the right panel
        const docRes = await fetch(`${API_BASE}/api/document`);
        if (docRes.ok) {
          const docJson = await docRes.json();
          setDocumentData(docJson);
        }
        setScanStatusMsg(`Lines ${data.top_line} → ${data.bottom_line} transcribed`);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setScanStatusMsg(`Scan failed: ${errJson.detail || 'Server error'}`);
      }
    } catch (err: any) {
      setScanStatusMsg(`Error: ${err.message || 'Network error'}`);
    } finally {
      setIsScanningOcr(false);
    }
  };

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

  // Send synchronized orchestration command (BEGIN, PAUSE, RESUME, END, RESTART)
  const handleOrchestrationCommand = async (command: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/orchestrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, source: 'web' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.orchestration) {
          setOrchestrationState(data.orchestration);
        } else {
          setOrchestrationState(data);
        }
        if (data.telemetry) {
          setTelemetry(data.telemetry);
        }
      }
    } catch (err) {
      console.error('Failed to send orchestration command:', err);
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
          <button 
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarOpen(prev => !prev)}
            title={isSidebarOpen ? "Collapse Projects Sidebar" : "Open Projects Sidebar"}
          >
            <Menu size={15} />
          </button>
          <div className="brand-logo">
            <Scan size={18} />
          </div>
          <span className="brand-title">
            MATRIX CAPTURE <span className="brand-badge">STUDIO 2.5</span>
          </span>
          {activeProject && (
            <div 
              className="active-project-pill" 
              onClick={() => setIsSidebarOpen(true)}
              title="Current active project (click to switch)"
            >
              <FolderKanban size={13} color="#00ff9d" />
              <span className="project-name">{activeProject.name}</span>
            </div>
          )}
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
          <div className="metric-pill" style={{ borderColor: wsConnected ? '#00ff9d44' : '#ff7b7244' }}>
            <span className="label">SOCKET:</span>
            <span className="value" style={{ color: wsConnected ? '#00ff9d' : '#ff7b72' }}>
              {wsConnected ? 'LIVE' : 'OFFLINE'}
            </span>
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

          {activeProject && (
            <button 
              className="btn btn-outline"
              onClick={() => {
                setProjectToAbort(activeProject);
                setShowAbortModal(true);
              }}
              title="Abort current project and clear active state"
              style={{ borderColor: 'rgba(255, 123, 114, 0.4)', color: '#ff7b72' }}
            >
              <Ban size={14} />
              <span>Abort Project</span>
            </button>
          )}

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
            href={`${API_BASE}/api/spliced-document-image`} 
            className="btn btn-outline"
            target="_blank" 
            rel="noreferrer"
            download="spliced_document.png"
            title="Download full continuous stitched document PNG spliced from all frames"
            style={{ borderColor: 'rgba(0, 255, 157, 0.4)', color: '#00ff9d' }}
          >
            <Download size={14} />
            <span>Export Spliced PNG</span>
          </a>

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

      {/* 3-Way Unified Orchestration Bar (Web UI, Mobile, HUD Sync) */}
      <div className="orchestration-bar">
        <div className="orchestration-status-cluster">
          <div className="orchestration-label-group">
            <span className="orch-subtitle">SYNCHRONIZED ORCHESTRATION</span>
            <div className="orch-status-row">
              <span className={`orch-status-pill status-${(orchestrationState.status || 'idle').toLowerCase()}`}>
                <span className="orch-status-dot" />
                {orchestrationState.status || 'IDLE'}
              </span>
              <span className="orch-source-tag">
                {orchestrationState.invoked_by ? `Invoked by: ${orchestrationState.invoked_by}` : `Invoked by: ${formatDeviceName(orchestrationState.source)}`}
              </span>
            </div>
          </div>

          <div className="orch-telemetry-badge">
            <Layers size={14} color="#58a6ff" />
            <span className="orch-telemetry-page">PAGE {telemetry.current_page || 1}</span>
            <span className="orch-telemetry-lines">
              Ln {telemetry.current_top_line || 1} → {telemetry.current_bottom_line || 49}
            </span>
            {telemetry.dwell_countdown_ms > 0 && (
              <span className="orch-dwell-tag">{telemetry.dwell_countdown_ms}ms dwell</span>
            )}
          </div>
        </div>

        <div className="orchestration-actions">
          {orchestrationState.status === 'RUNNING' ? (
            <>
              <button
                className="btn btn-orch btn-pause"
                onClick={() => handleOrchestrationCommand('PAUSE')}
                title="Pause orchestration across Web, Mobile and HUD"
              >
                <Pause size={15} />
                <span>PAUSE</span>
              </button>
              <button
                className="btn btn-orch btn-end"
                onClick={() => handleOrchestrationCommand('END')}
                title="End orchestration session"
              >
                <Square size={15} />
                <span>END</span>
              </button>
              <button
                className="btn btn-orch btn-restart"
                onClick={() => handleOrchestrationCommand('RESTART')}
                title="Restart pagination and capture from beginning (Line 1)"
              >
                <RotateCcw size={14} />
                <span>Restart from Beginning</span>
              </button>
            </>
          ) : orchestrationState.status === 'PAUSED' ? (
            <>
              <button
                className="btn btn-orch btn-resume"
                onClick={() => handleOrchestrationCommand('RESUME')}
                title="Resume orchestration across Web, Mobile and HUD"
              >
                <Play size={15} />
                <span>RESUME</span>
              </button>
              <button
                className="btn btn-orch btn-end"
                onClick={() => handleOrchestrationCommand('END')}
                title="End orchestration session"
              >
                <Square size={15} />
                <span>END</span>
              </button>
              <button
                className="btn btn-orch btn-restart"
                onClick={() => handleOrchestrationCommand('RESTART')}
                title="Restart pagination and capture from beginning (Line 1)"
              >
                <RotateCcw size={14} />
                <span>Restart from Beginning</span>
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-orch btn-begin"
                onClick={() => handleOrchestrationCommand('BEGIN')}
                title="Begin synchronized capture orchestration across Web UI, Mobile and HUD"
              >
                <Play size={16} />
                <span>BEGIN</span>
              </button>
              {(telemetry.current_top_line > 1 || frames.length > 0) && (
                <button
                  className="btn btn-orch btn-restart"
                  onClick={() => handleOrchestrationCommand('RESTART')}
                  title="Restart pagination from beginning (Line 1)"
                >
                  <RotateCcw size={14} />
                  <span>Restart from Beginning</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Interactive Animated Orchestration Pipeline DAG */}
      <div className="orch-dag-panel">
        <div className="orch-dag-header">
          <div className="orch-dag-title">
            <Sparkles size={14} color="#00ff9d" />
            <span className="dag-title-text">ORCHESTRATION PIPELINE DAG</span>
            <span className="dag-status-pill">
              Active: <strong>{orchestrationState.step_label || 'Line 1 Ready to Begin'}</strong>
            </span>
          </div>
          <div className="orch-dag-attribution">
            <span className="dag-device-tag">
              {orchestrationState.invoked_by ? `Invoked by: ${orchestrationState.invoked_by}` : `Invoked by: ${formatDeviceName(orchestrationState.source)}`}
            </span>
          </div>
        </div>

        <div className="orch-dag-flow">
          {/* Stage 1: Line 1 Start Position */}
          <div className={`dag-node ${(!orchestrationState.active_step || orchestrationState.active_step === 'START_READY') ? 'active pulse' : 'completed'}`}>
            <div className="dag-node-header">
              <span className="dag-node-num">01</span>
              <Flag size={14} className="dag-icon" />
            </div>
            <div className="dag-node-title">Start Position</div>
            <div className="dag-node-sub">Gutter Line 1 Initialized</div>
            <div className="dag-node-pill">Ln 1 Set & Ready</div>
          </div>

          <div className={`dag-connector ${orchestrationState.status === 'RUNNING' && orchestrationState.active_step === 'SCREEN_CAPTURE' ? 'streaming' : ''}`}>
            <div className="dag-beam" />
            <ChevronsRight size={14} />
          </div>

          {/* Stage 2: Display 1 Capture */}
          <div className={`dag-node ${orchestrationState.active_step === 'SCREEN_CAPTURE' ? 'active pulse' : (['OCR_BOUNDS', 'PRECISION_SCROLL', 'DWELL_FREEZE', 'LOOP_EVAL'].includes(orchestrationState.active_step || '') ? 'completed' : '')}`}>
            <div className="dag-node-header">
              <span className="dag-node-num">02</span>
              <Camera size={14} className="dag-icon" />
            </div>
            <div className="dag-node-title">Display 1 Capture</div>
            <div className="dag-node-sub">Desktop Mode (HDMI TO USB)</div>
            <div className="dag-node-pill">1920x1080 Frame</div>
          </div>

          <div className={`dag-connector ${orchestrationState.status === 'RUNNING' && orchestrationState.active_step === 'OCR_BOUNDS' ? 'streaming' : ''}`}>
            <div className="dag-beam" />
            <ChevronsRight size={14} />
          </div>

          {/* Stage 3: OCR Bounds */}
          <div className={`dag-node ${orchestrationState.active_step === 'OCR_BOUNDS' ? 'active pulse' : (['PRECISION_SCROLL', 'DWELL_FREEZE', 'LOOP_EVAL'].includes(orchestrationState.active_step || '') ? 'completed' : '')}`}>
            <div className="dag-node-header">
              <span className="dag-node-num">03</span>
              <Scan size={14} className="dag-icon" />
            </div>
            <div className="dag-node-title">OCR Bounds</div>
            <div className="dag-node-sub">Detect First & Last Line</div>
            <div className="dag-node-pill">
              Ln {telemetry.current_top_line || 1} → {telemetry.current_bottom_line || 49}
            </div>
          </div>

          <div className={`dag-connector ${orchestrationState.status === 'RUNNING' && orchestrationState.active_step === 'PRECISION_SCROLL' ? 'streaming' : ''}`}>
            <div className="dag-beam" />
            <ChevronsRight size={14} />
          </div>

          {/* Stage 4: Precision Scroll */}
          <div className={`dag-node ${orchestrationState.active_step === 'PRECISION_SCROLL' ? 'active pulse' : (['DWELL_FREEZE', 'LOOP_EVAL'].includes(orchestrationState.active_step || '') ? 'completed' : '')}`}>
            <div className="dag-node-header">
              <span className="dag-node-num">04</span>
              <MoveVertical size={14} className="dag-icon" />
            </div>
            <div className="dag-node-title">Precision Scroll</div>
            <div className="dag-node-sub">Align Prior Bottom + 1</div>
            <div className="dag-node-pill highlight">
              Target Top: Ln {(telemetry.current_bottom_line && telemetry.current_bottom_line > 0) ? telemetry.current_bottom_line + 1 : 50}
            </div>
          </div>

          <div className={`dag-connector ${orchestrationState.status === 'RUNNING' && orchestrationState.active_step === 'DWELL_FREEZE' ? 'streaming' : ''}`}>
            <div className="dag-beam" />
            <ChevronsRight size={14} />
          </div>

          {/* Stage 5: Dwell Freeze */}
          <div className={`dag-node ${orchestrationState.active_step === 'DWELL_FREEZE' ? 'active pulse' : (orchestrationState.active_step === 'LOOP_EVAL' ? 'completed' : '')}`}>
            <div className="dag-node-header">
              <span className="dag-node-num">05</span>
              <Clock size={14} className="dag-icon" />
            </div>
            <div className="dag-node-title">1.5s Dwell Freeze</div>
            <div className="dag-node-sub">Anti-Blur Frame Settling</div>
            <div className="dag-node-pill">
              {telemetry.dwell_countdown_ms > 0 ? `${telemetry.dwell_countdown_ms}ms` : '1,500ms Freeze'}
            </div>
          </div>

          <div className={`dag-connector ${orchestrationState.status === 'RUNNING' && orchestrationState.active_step === 'LOOP_EVAL' ? 'streaming' : ''}`}>
            <div className="dag-beam" />
            <ChevronsRight size={14} />
          </div>

          {/* Stage 6: Loop or EOF */}
          <div className={`dag-node ${orchestrationState.active_step === 'LOOP_EVAL' || orchestrationState.status === 'COMPLETED' ? 'active pulse' : ''}`}>
            <div className="dag-node-header">
              <span className="dag-node-num">06</span>
              <Repeat size={14} className="dag-icon" />
            </div>
            <div className="dag-node-title">EOF or Loop</div>
            <div className="dag-node-sub">Page Top Changed?</div>
            <div className="dag-node-pill">
              {orchestrationState.status === 'COMPLETED' ? 'Document Complete' : 'Cycle to Next Page'}
            </div>
          </div>
        </div>

        {/* Animated Loopback Rail */}
        <div className="dag-loopback-rail">
          <div className="loopback-badge">
            <Repeat size={12} className={orchestrationState.status === 'RUNNING' ? 'spinning' : ''} />
            <span>Automated Pacing Cycle: Loops back to Display 1 Capture until page top stops advancing (EOF)</span>
          </div>
          <div className={`loopback-track ${orchestrationState.status === 'RUNNING' ? 'track-animated' : ''}`} />
        </div>
      </div>

      {!backendConnected && (
        <div style={{
          backgroundColor: '#ff7b7218',
          borderBottom: '1px solid #ff7b7233',
          color: '#ff7b72',
          padding: '6px 16px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'center',
          fontWeight: 500
        }}>
          <AlertCircle size={14} />
          <span>FastAPI backend unreachable. Retrying connection to port 8000... Ensure server is running with 'python main.py'.</span>
        </div>
      )}

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
        {/* Leftmost Collapsible Projects Sidebar */}
        <aside className={`projects-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
          {isSidebarOpen ? (
            <div className="projects-sidebar-content">
              <div className="sidebar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FolderKanban size={16} color="#00ff9d" />
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#e6edf3' }}>Projects</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button 
                    className="btn btn-sm btn-outline"
                    onClick={() => setShowNewProjectModal(true)}
                    title="Create New Project"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                  >
                    <Plus size={12} /> New
                  </button>
                  <button 
                    className="sidebar-toggle-btn"
                    onClick={() => setIsSidebarOpen(false)}
                    title="Collapse Sidebar"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
              </div>

              <div className="projects-list">
                {projects.map(p => (
                  <div 
                    key={p.id}
                    className={`project-card ${p.id === activeProject?.id ? 'active' : ''} ${p.status === 'aborted' ? 'aborted' : ''}`}
                    onClick={() => handleSwitchProject(p.id)}
                    title={`Switch to ${p.name}`}
                  >
                    <div className="project-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`project-status-dot ${p.id === activeProject?.id ? 'active' : ''}`} />
                        <span className="project-title">{p.name}</span>
                      </div>
                      {p.id === activeProject?.id ? (
                        <span className="active-badge">ACTIVE</span>
                      ) : p.status === 'aborted' ? (
                        <span style={{ fontSize: '9px', color: '#ff7b72', border: '1px solid rgba(255,123,114,0.3)', padding: '1px 4px', borderRadius: '3px' }}>ABORTED</span>
                      ) : null}
                    </div>

                    {p.description && (
                      <p className="project-desc">{p.description}</p>
                    )}

                    <div className="project-stats">
                      <span>Status: {p.status}</span>
                      {p.target_total_lines > 0 && <span>• Target: {p.target_total_lines} ln</span>}
                    </div>

                    <div className="project-actions" onClick={e => e.stopPropagation()}>
                      <button 
                        className="btn-text-muted"
                        onClick={() => handleClearProjectData(p.id)}
                        title="Clear captured frames & OCR lines for this project"
                      >
                        Clear Data
                      </button>
                      {p.status !== 'aborted' && (
                        <button 
                          className="btn-text-danger"
                          onClick={() => {
                            setProjectToAbort(p);
                            setShowAbortModal(true);
                          }}
                          title="Abort this project"
                        >
                          <Ban size={11} /> Abort
                        </button>
                      )}
                      {projects.length > 1 && (
                        <button 
                          className="btn-text-danger"
                          onClick={() => handleDeleteProject(p.id)}
                          title="Delete this project permanently"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="sidebar-footer">
                <div className="db-indicator">
                  <span className="db-dot" />
                  <span>SQLite3: matrix_capture.db</span>
                </div>
              </div>
            </div>
          ) : (
            <div 
              className="projects-sidebar-rail" 
              onClick={() => setIsSidebarOpen(true)}
              title="Expand Projects Sidebar"
            >
              <button 
                className="rail-add-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNewProjectModal(true);
                }}
                title="Create New Project"
              >
                <Plus size={14} />
              </button>
              <FolderKanban size={16} color="#00ff9d" />
              <span className="rail-project-label">{activeProject ? activeProject.name : 'Projects'}</span>
              <ChevronRight size={14} color="#8b949e" style={{ marginTop: 'auto' }} />
            </div>
          )}
        </aside>

        {/* Column 1: Captured Frame Feed with drag-and-drop - Sequentially Sorted */}
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
            {sortedFrames.length === 0 ? (
              <div className="drop-zone-placeholder" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud size={28} color="#00ff9d" />
                <span style={{ fontWeight: 600, color: '#e6edf3' }}>Drop 1080p Screenshots Here</span>
                <span style={{ fontSize: '11px', color: '#8b949e' }}>or click to upload frames manually</span>
                <span style={{ fontSize: '10px', color: '#58a6ff', marginTop: '6px' }}>Settled Pixel 10 frames stream here automatically</span>
              </div>
            ) : (
              sortedFrames.map((f, idx) => {
                const prevFrame = idx > 0 ? sortedFrames[idx - 1] : null;
                const hasGap = prevFrame && prevFrame.bottom_line > 0 && f.top_line > prevFrame.bottom_line + 1;

                return (
                  <div key={f.frame_id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {hasGap && (
                      <div className="gap-alert-tag">
                        <AlertCircle size={11} />
                        <span>Gap: missing Ln {prevFrame.bottom_line + 1} → {f.top_line - 1}</span>
                      </div>
                    )}
                    <div
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

                        {/* Custom Offset Micro-nudge for Concatenation */}
                        <div className="frame-position-controls" onClick={e => e.stopPropagation()} title="Micro-nudge vertical alignment offset (px)">
                          <MoveVertical size={10} color="#8b949e" />
                          <button 
                            className="nudge-btn" 
                            onClick={() => handleUpdateFramePosition(f.frame_id, -1)}
                            title="Nudge Up (-1px)"
                          >▲</button>
                          <span className="nudge-val">{f.custom_offset_y || 0}px</span>
                          <button 
                            className="nudge-btn" 
                            onClick={() => handleUpdateFramePosition(f.frame_id, 1)}
                            title="Nudge Down (+1px)"
                          >▼</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Column 2: Synchronized 1080p Screenshot Viewer with Gutter Overlays */}
        <main className="frame-inspector-panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '3px', background: '#0d1117', padding: '2px', borderRadius: '6px', border: '1px solid #30363d' }}>
                <button
                  className={`btn btn-sm ${inspectorMode === 'single' ? 'btn-primary' : ''}`}
                  onClick={() => setInspectorMode('single')}
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                >
                  Single Frame
                </button>
                <button
                  className={`btn btn-sm ${inspectorMode === 'spliced' ? 'btn-primary' : ''}`}
                  onClick={() => setInspectorMode('spliced')}
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                >
                  Spliced Document ({frames.length})
                </button>
              </div>

              <span>
                {inspectorMode === 'spliced'
                  ? `Spliced Stream: ${frames.length} Frames Spliced (${documentData.total_lines} Total Lines)`
                  : activeFrame 
                    ? `1080p Frame: Lines ${activeFrame.top_line} → ${activeFrame.bottom_line} (Pg ${activeFrame.page_index})` 
                    : '1080p Desktop Frame Inspector'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {inspectorMode === 'single' && activeFrame && (
                <button 
                  className="btn-scan-ocr"
                  onClick={handleScanFrameOcr}
                  disabled={isScanningOcr}
                  title="Send image to local AI model (minicpm-v) for gutter scan & text OCR"
                >
                  <Scan size={13} className={isScanningOcr ? 'spinning' : ''} />
                  <span>{isScanningOcr ? 'Scanning with Ollama...' : 'Send Image for OCR Scan'}</span>
                </button>
              )}
              {scanStatusMsg && (
                <span className="scan-status-pill">{scanStatusMsg}</span>
              )}
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
            {inspectorMode === 'spliced' ? (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={14} color="#00ff9d" />
                    <span style={{ fontSize: '11px', color: '#00ff9d', fontFamily: 'monospace', fontWeight: 700 }}>
                      CONTINUOUS SPLICED CANVAS · {frames.length} FRAMES CONCATENATED
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>
                    Auto-spliced by first & last gutter lines
                  </span>
                </div>
                <div 
                  className={`source-image-wrapper ${zoomMode}`}
                  style={zoomMode === 'custom' ? { transform: `scale(${imageZoom})`, transformOrigin: 'top left' } : undefined}
                >
                  <img 
                    src={`${API_BASE}/api/spliced-document-image?t=${frames.length}_${frames[frames.length - 1]?.created_at || ''}`} 
                    alt="Spliced Continuous Document"
                    style={{ width: zoomMode === 'fit' ? '100%' : 'auto', display: 'block' }}
                  />
                </div>
              </div>
            ) : (
              <>
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
                      {/* Bounding Box Overlays */}
                      {activeFrame && frameBoundingBoxes[activeFrame.frame_id] && (
                        <svg 
                          className="bbox-svg-overlay"
                          viewBox="0 0 1920 1080"
                          preserveAspectRatio="none"
                        >
                          {frameBoundingBoxes[activeFrame.frame_id].first_line && (
                            <rect
                              x={frameBoundingBoxes[activeFrame.frame_id].first_line!.x}
                              y={frameBoundingBoxes[activeFrame.frame_id].first_line!.y}
                              width={frameBoundingBoxes[activeFrame.frame_id].first_line!.width}
                              height={frameBoundingBoxes[activeFrame.frame_id].first_line!.height}
                              className="bbox-rect-green"
                            />
                          )}
                          {frameBoundingBoxes[activeFrame.frame_id].last_line && (
                            <rect
                              x={frameBoundingBoxes[activeFrame.frame_id].last_line!.x}
                              y={frameBoundingBoxes[activeFrame.frame_id].last_line!.y}
                              width={frameBoundingBoxes[activeFrame.frame_id].last_line!.width}
                              height={frameBoundingBoxes[activeFrame.frame_id].last_line!.height}
                              className="bbox-rect-red"
                            />
                          )}
                          {frameBoundingBoxes[activeFrame.frame_id].wrapped_lines?.map((wb, idx) => (
                            <rect
                              key={idx}
                              x={wb.x}
                              y={wb.y}
                              width={wb.width}
                              height={wb.height}
                              className="bbox-rect-yellow"
                            />
                          ))}
                        </svg>
                      )}
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
              </>
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

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="modal-overlay" onClick={() => setShowNewProjectModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderKanban size={16} color="#00ff9d" />
                <span>Create New Project</span>
              </div>
              <button 
                onClick={() => setShowNewProjectModal(false)} 
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-form-group">
                <label>PROJECT NAME *</label>
                <input 
                  type="text"
                  placeholder="e.g. Small-Fling Core Service"
                  className="modal-input"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="modal-form-group">
                <label>DESCRIPTION (OPTIONAL)</label>
                <input 
                  type="text"
                  placeholder="e.g. Desktop screen capture scan of parser module"
                  className="modal-input"
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                />
              </div>

              <div className="modal-form-group">
                <label>TARGET TOTAL LINES</label>
                <input 
                  type="number"
                  placeholder="0 (unspecified)"
                  className="modal-input"
                  value={newProjectTargetLines || ''}
                  onChange={e => setNewProjectTargetLines(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowNewProjectModal(false)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
              >
                <Plus size={14} /> Create & Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abort Project Confirmation Modal */}
      {showAbortModal && projectToAbort && (
        <div className="modal-overlay" onClick={() => setShowAbortModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ borderColor: 'rgba(255, 123, 114, 0.5)' }}>
            <div className="modal-header" style={{ borderBottomColor: 'rgba(255, 123, 114, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ff7b72' }}>
                <Ban size={16} />
                <span>Abort Project & Clear Data</span>
              </div>
              <button 
                onClick={() => setShowAbortModal(false)} 
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: '#e6edf3', lineHeight: 1.5, marginBottom: '10px' }}>
                Are you sure you want to abort project <strong style={{ color: '#ff7b72' }}>{projectToAbort.name}</strong>?
              </p>
              <p style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>
                This will mark the project status as <strong style={{ color: '#ff7b72' }}>ABORTED</strong>, reset active pacing orchestration, and delete all captured screenshot frames and OCR transcribed lines for this project from SQLite.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowAbortModal(false)}>Cancel</button>
              <button 
                className="btn btn-outline" 
                style={{ borderColor: '#ff7b72', color: '#ff7b72', background: 'rgba(255, 123, 114, 0.15)' }}
                onClick={() => handleAbortProject(projectToAbort.id)}
              >
                <Ban size={14} /> Confirm Abort & Wipe Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
