import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scan, Settings, Search, Check, Coins, Layers, RotateCw, RefreshCw, AlertCircle, FolderKanban, Plus, Trash2,
  ChevronLeft, ChevronRight, MoveVertical, Camera, Cloud, Zap, Smartphone, Key, Cpu, Compass,
  Monitor, ChevronDown, Info, Eye, EyeOff, Shield
} from 'lucide-react';
import { TelemetryToaster, type TelemetryData, type TelemetryEvent } from './TelemetryToaster';
import { FlowDag } from './FlowDag';
import { useConfirm, Modal } from './ConfirmModal';
import type {
  ProjectData, LineData, FrameData, RecaptureItem, TokenStats, FrameBoundingBoxes, AlignmentData, DeviceInfoData,
} from './types';
import { AlignmentAlertBanner } from './components/AlignmentAlertBanner';
import { AlignmentDiagnosticsModal } from './components/AlignmentDiagnosticsModal';
import { DeviceStudioDrawer } from './components/DeviceStudioDrawer';
import { GotoLineModal } from './components/GotoLineModal';
import { renderBoundingBoxesOverlay } from './components/BoundingBoxesOverlay';
import { useAgoTimer } from './hooks/useAgoTimer';

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
const apiJson = async <T,>(p: string, o?: RequestInit): Promise<T | null> => {
  try {
    const res = await api(p, o);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

function startDrag(onMove: (e: MouseEvent) => void, onUp?: () => void) {
  const handleMove = (e: MouseEvent) => onMove(e);
  const handleUp = () => {
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleUp);
    onUp?.();
  };
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleUp);
}

function AppContent() {
  const { confirm, alert: showAlert } = useConfirm();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectData | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', desc: '', target: 0 });
  const [projectInitProgress, setProjectInitProgress] = useState<{
    active: boolean;
    percent: number;
    stage: string;
    status: 'running' | 'completed' | 'error';
    totalLines?: number;
    error?: string;
    projectName?: string;
  } | null>(null);
  const [documentData, setDocumentData] = useState<{ total_lines: number; issue_count: number; min_line: number; max_line: number; lines: LineData[] }>({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [recaptureQueue, setRecaptureQueue] = useState<RecaptureItem[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats>({ total_prompt_tokens: 0, total_candidates_tokens: 0, total_tokens: 0, total_api_calls: 0, estimated_cost_usd: 0 });
  const [telemetry, setTelemetry] = useState<TelemetryData>({});
  const [latencyMs, setLatencyMs] = useState(0);
  const [eventsLog, setEventsLog] = useState<TelemetryEvent[]>([]);
  const [streamKey, setStreamKey] = useState(0);
  const { secondsAgo: inspectorAgoSec } = useAgoTimer(streamKey);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState(false);
  const [showDag, setShowDag] = useState(true);
  const [showGotoModal, setShowGotoModal] = useState(false);
  const [gotoTargetLine, setGotoTargetLine] = useState<number | string>('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [navStatus, setNavStatus] = useState('');
  const [alignmentData, setAlignmentData] = useState<AlignmentData>({ is_aligned: false, status: 'checking', reason: 'Connecting to device stream...', file_name: '', boxes: {}, classifiers: { issues: [], has_issues: false, issue_count: 0 }, first_line_number: 0, last_line_number: 0 });
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [isCheckingAlignment, setIsCheckingAlignment] = useState(false);
  const [showAlignmentModal, setShowAlignmentModal] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => localStorage.getItem('mc_banner_dismissed') === 'true');
  const [isBannerMinimized, setIsBannerMinimized] = useState(() => localStorage.getItem('mc_banner_minimized') === 'true');
  const [dismissedItems, setDismissedItems] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mc_dismissed_alignment_items') || '[]'); } catch { return []; }
  });
  const [fixingClassifierId, setFixingClassifierId] = useState<string | null>(null);
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [framesPanelWidth, setFramesPanelWidth] = useState(() => {
    try { return Number(localStorage.getItem('mc_frames_panel_width')) || 280; } catch { return 280; }
  });
  const [isDraggingFrames, setIsDraggingFrames] = useState(false);
  const [inspectorPercent, setInspectorPercent] = useState(() => {
    try { return Number(localStorage.getItem('mc_inspector_split_percent')) || 48; } catch { return 48; }
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
  const [liveMode, setLiveMode] = useState<'desktop' | 'phone'>('desktop');
  const [inspectorMode, setInspectorMode] = useState<'live' | 'single' | 'spliced'>('live');
  const [showInspectorMetaPopover, setShowInspectorMetaPopover] = useState(false);
  const [reprocessingFrameId, setReprocessingFrameId] = useState<string | null>(null);
  const [pipelineMode, setPipelineMode] = useState<'cloud' | 'local'>('cloud');
  const [deviceModel, setDeviceModel] = useState<'pixel_10' | 'pixel_8'>(() => {
    try { return (localStorage.getItem('mc_target_device_model') as any) || 'pixel_8'; } catch { return 'pixel_8'; }
  });
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfoData | null>(null);
  const [showStudioDrawer, setShowStudioDrawer] = useState(false);
  const [studioInitialTab, setStudioInitialTab] = useState<'kiosk' | 'device' | 'processes' | 'telemetry'>('kiosk');
  const [pixel8Ip, setPixel8Ip] = useState(() => localStorage.getItem('mc_pixel_8_address') || '192.168.86.87:37547');
  const [pixel10Ip, setPixel10Ip] = useState(() => localStorage.getItem('mc_pixel_10_address') || '192.168.86.81:44587');
  const [isConnectingIp, setIsConnectingIp] = useState(false);
  const [connectStatusMsg, setConnectStatusMsg] = useState('');
  const [pairCodeInput, setPairCodeInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [pairStatusMsg, setPairStatusMsg] = useState('');
  const [isSwitchingPipeline, setIsSwitchingPipeline] = useState(false);
  const [deletingFrameId, setDeletingFrameId] = useState<string | null>(null);
  const [isClosingKeyboard, setIsClosingKeyboard] = useState(false);

  const selectedFrameIdRef = useRef<string | null>(null);
  useEffect(() => { selectedFrameIdRef.current = selectedFrameId; }, [selectedFrameId]);
  useEffect(() => {
    if (deviceInfo?.pixel_8_address) {
      setPixel8Ip(deviceInfo.pixel_8_address);
      localStorage.setItem('mc_pixel_8_address', deviceInfo.pixel_8_address);
    }
    if (deviceInfo?.pixel_10_address) {
      setPixel10Ip(deviceInfo.pixel_10_address);
      localStorage.setItem('mc_pixel_10_address', deviceInfo.pixel_10_address);
    }
  }, [deviceInfo]);
  const deviceDropdownRef = useRef<HTMLDivElement>(null);
  const isDocVisibleRef = useRef(true);
  const lineListRef = useRef<HTMLDivElement>(null);

  const addTelemetryEvent = useCallback((category: TelemetryEvent['category'], message: string, data?: any) => {
    setEventsLog(prev => [...prev.slice(-99), { id: `${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), category, message, data }]);
  }, []);

  const handleDismissItem = async (itemId: string, dismissed: boolean) => {
    setDismissedItems(prev => {
      const next = dismissed ? Array.from(new Set([...prev, itemId])) : prev.filter(x => x !== itemId);
      try { localStorage.setItem('mc_dismissed_alignment_items', JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      await api('/api/device/alignment/dismiss-item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, dismissed }) });
    } catch {}
  };

  const handleTriggerAlignmentCheck = async () => {
    setIsCheckingAlignment(true);
    try {
      const res = await api('/api/device/alignment/check', { method: 'POST' });
      if (res.ok) setAlignmentData(await res.json());
    } finally { setIsCheckingAlignment(false); }
  };

  const applyClassifierResult = (resData: any, label: string) => {
    if (resData.alignment) setAlignmentData(resData.alignment);
    setStreamKey(Date.now());
    const count = resData.fixes_applied?.length ?? 1;
    addTelemetryEvent('SYSTEM', `Fixed ${count} ${label} issue(s) ✔`);
  };

  const handleFixClassifier = async (id: string) => {
    setFixingClassifierId(id);
    try {
      const res = await api(`/api/classifiers/${id}/fix`, { method: 'POST' });
      if (res.ok) applyClassifierResult(await res.json(), id);
    } finally { setFixingClassifierId(null); }
  };

  const handleFixAllClassifiers = async () => {
    setIsFixingAll(true);
    try {
      const res = await api('/api/classifiers/fix-all', { method: 'POST' });
      if (res.ok) applyClassifierResult(await res.json(), 'batch');
    } finally { setIsFixingAll(false); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); setShowGotoModal(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onVis = () => { isDocVisibleRef.current = !document.hidden; if (!document.hidden) setStreamKey(Date.now()); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const handleFramesResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingFrames(true);
    const startX = e.clientX, startW = framesPanelWidth;
    startDrag(
      m => { const w = Math.max(180, Math.min(600, startW + (m.clientX - startX))); setFramesPanelWidth(w); },
      () => { setIsDraggingFrames(false); try { localStorage.setItem('mc_frames_panel_width', String(framesPanelWidth)); } catch {} }
    );
  };

  const handleSplitResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
    const startX = e.clientX, startPct = inspectorPercent;
    startDrag(
      m => { const p = Math.max(20, Math.min(80, startPct + ((m.clientX - startX) / (window.innerWidth - framesPanelWidth - 60)) * 100)); setInspectorPercent(p); },
      () => { setIsDraggingSplit(false); try { localStorage.setItem('mc_inspector_split_percent', String(inspectorPercent)); } catch {} }
    );
  };

  const handleSelectSerial = async (serial: string) => {
    try {
      const res = await api('/api/device/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial }) });
      if (res.ok) {
        const d = await res.json();
        setDeviceInfo(d.device_info);
        if (d.device_info?.active_model) {
          const m = d.device_info.active_model.toLowerCase();
          setDeviceModel(m.includes('pixel_8') ? 'pixel_8' : 'pixel_10');
        }
      }
    } catch {}
  };

  const handleCloseKeyboard = async () => {
    setIsClosingKeyboard(true);
    try {
      const res = await api('/api/device/keyboard/close', { method: 'POST' });
      if (res.ok) addTelemetryEvent('SYSTEM', 'IME virtual keyboard dismissed via ADB');
    } finally { setIsClosingKeyboard(false); }
  };

  const handleSelectDevice = async (dev: 'pixel_10' | 'pixel_8') => {
    setDeviceModel(dev);
    try {
      localStorage.setItem('mc_target_device_model', dev);
      const matchedDevice = deviceInfo?.devices?.find(d =>
        dev === 'pixel_8'
          ? (d.displayName === 'Pixel 8' || d.model.toLowerCase().includes('pixel_8') || (pixel8Ip && d.serial === pixel8Ip))
          : (d.displayName === 'Pixel 10' || d.model.toLowerCase().includes('pixel_10') || (pixel10Ip && d.serial === pixel10Ip))
      );
      const targetSerial = (dev === 'pixel_8' ? pixel8Ip : pixel10Ip) || matchedDevice?.serial;
      await api('/api/device/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_model: dev, serial: targetSerial || undefined })
      });
      const info = await apiJson<DeviceInfoData>('/api/device/info');
      if (info) setDeviceInfo(info);
    } catch {}
  };

  const handleConnectAdbIp = async (ipTarget?: string, model?: 'pixel_8' | 'pixel_10') => {
    const targetModel = model || deviceModel;
    const target = (ipTarget || (targetModel === 'pixel_8' ? pixel8Ip : pixel10Ip)).trim();
    if (!target) return;
    setIsConnectingIp(true);
    const devLabel = targetModel === 'pixel_8' ? 'Pixel 8' : 'Pixel 10';
    setConnectStatusMsg(`Connecting ${devLabel} (${target})...`);
    try {
      localStorage.setItem('mc_last_adb_target', target);
      if (targetModel === 'pixel_8') {
        setPixel8Ip(target);
        localStorage.setItem('mc_pixel_8_address', target);
      } else {
        setPixel10Ip(target);
        localStorage.setItem('mc_pixel_10_address', target);
      }

      const res = await api('/api/device/connect-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: target, device_model: targetModel })
      });
      const d = await res.json();
      if (res.ok) {
        setConnectStatusMsg(`Connected to ${devLabel} (${target}) ✔`);
        const info = await apiJson<DeviceInfoData>('/api/device/info');
        if (info) setDeviceInfo(info);
      } else { setConnectStatusMsg(`Error: ${d.detail || d.output || 'Failed'}`); }
    } catch (e: any) { setConnectStatusMsg(`Connect failed: ${e.message}`); }
    finally { setIsConnectingIp(false); }
  };

  const handlePairAdb = async (ipToPair?: string, codeToPair?: string, model?: 'pixel_8' | 'pixel_10') => {
    const targetModel = model || deviceModel;
    const target = (ipToPair || (targetModel === 'pixel_8' ? pixel8Ip : pixel10Ip)).trim();
    const code = (codeToPair || pairCodeInput).trim();
    if (!target || !code) return;
    setIsPairing(true);
    const devLabel = targetModel === 'pixel_8' ? 'Pixel 8' : 'Pixel 10';
    setPairStatusMsg(`Pairing ${devLabel} (${target})...`);
    try {
      const res = await api('/api/device/pair-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: target, code, device_model: targetModel })
      });
      const d = await res.json();
      if (res.ok) {
        setPairCodeInput('');
        setPairStatusMsg(`Paired ${devLabel} ✔`);
        const host = target.split(':')[0];
        handleConnectAdbIp(`${host}:5555`, targetModel);
      } else { setPairStatusMsg(`Pairing failed: ${d.detail || d.output || 'Unknown error'}`); }
    } catch (e: any) { setPairStatusMsg(`Error: ${e.message}`); }
    finally { setIsPairing(false); }
  };

  const fetchData = useCallback(async () => {
    if (!isDocVisibleRef.current) return;
    const t0 = performance.now();
    try {
      const [projRes, docRes, framesRes, queueRes, cfgRes, modeRes, telRes, devRes, alignRes] = await Promise.all([
        api('/api/projects'), api('/api/document'), api('/api/frames'), api('/api/recapture-queue'),
        api('/api/config'), api('/api/pipeline/mode'), api('/api/telemetry'), api('/api/device/info'), api('/api/device/alignment')
      ]);
      setLatencyMs(Math.round(performance.now() - t0));
      setBackendConnected(true);
      if (projRes.ok) {
        try {
          const pList = await projRes.json();
          if (Array.isArray(pList)) {
            setProjects(pList);
            const act = pList.find((p: any) => p.is_active) || pList[0] || null;
            setActiveProject(act);
          }
        } catch {}
      }
      if (docRes.ok) {
        try {
          const d = await docRes.json();
          if (d && Array.isArray(d.lines)) {
            setDocumentData(d);
            if (d.token_stats) setTokenStats(d.token_stats);
          }
        } catch {}
      }
      if (framesRes.ok) {
        try {
          const fList: FrameData[] = await framesRes.json();
          if (Array.isArray(fList)) {
            setFrames(fList);
            setSelectedFrameId(curr => (curr && fList.some(f => f.frame_id === curr)) ? curr : (fList[fList.length - 1]?.frame_id ?? null));
          }
        } catch {}
      }
      if (queueRes.ok) { try { setRecaptureQueue(await queueRes.json()); } catch {} }
      if (cfgRes.ok) { try { const c = await cfgRes.json(); setApiKeyConfigured(c.gemini_api_key_configured); } catch {} }
      if (modeRes.ok) { try { const m = await modeRes.json(); setPipelineMode(m.pipeline_mode); } catch {} }
      if (telRes.ok) { try { setTelemetry(await telRes.json()); } catch {} }
      if (devRes.ok) { try { setDeviceInfo(await devRes.json()); } catch {} }
      if (alignRes.ok) { try { setAlignmentData(await alignRes.json()); } catch {} }
    } catch { setBackendConnected(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Telemetry-directed polling while project initialization is running
  useEffect(() => {
    if (!projectInitProgress?.active || projectInitProgress.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const d = await apiJson<any>('/api/dag/status');
        const p = d?.dag?.groups?.initialize?.progress;
        if (p) {
          setProjectInitProgress(curr => {
            if (!curr || curr.status === 'completed') return curr;
            return {
              ...curr,
              percent: Math.max(curr.percent, p.percent || curr.percent),
              stage: p.stage || curr.stage,
              status: p.status || curr.status,
              totalLines: p.total_lines ?? curr.totalLines,
              error: p.error
            };
          });
          if (p.status === 'completed' || p.percent === 100) {
            fetchData();
          }
        }
      } catch {}
    }, 800);
    return () => clearInterval(t);
  }, [projectInitProgress?.active, projectInitProgress?.status, fetchData]);

  const handleSwitchProject = async (id: string) => {
    await api(`/api/projects/${id}/activate`, { method: 'POST' });
    await fetchData();
  };

  const handleCreateProject = async () => {
    const projName = newProject.name.trim();
    if (!projName) return;

    setProjectInitProgress({
      active: true,
      percent: 10,
      stage: 'Creating project and launching DAG Group: Initialize...',
      status: 'running',
      projectName: projName
    });
    setShowNewProjectModal(false);

    try {
      const res = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projName, description: newProject.desc, target_total_lines: newProject.target })
      });
      if (res.ok) {
        setNewProject({ name: '', desc: '', target: 0 });
        await fetchData();
      } else {
        const errData = await res.json().catch(() => ({ detail: 'Failed to create project' }));
        setProjectInitProgress(prev => prev ? ({ ...prev, status: 'error', error: errData.detail || 'Failed to create project', stage: 'Project creation failed' }) : null);
      }
    } catch (e: any) {
      setProjectInitProgress(prev => prev ? ({ ...prev, status: 'error', error: e.message, stage: 'Network error creating project' }) : null);
    }
  };

  const handleGotoLine = async () => {
    const lineNum = Number(gotoTargetLine);
    if (!lineNum || lineNum <= 0) return;
    setIsNavigating(true);
    setNavStatus(`Navigating to Line #${lineNum}...`);
    try {
      const res = await api('/api/device/goto-line', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_line: lineNum }) });
      const d = await res.json();
      if (res.ok) {
        setNavStatus(d.reached ? `Reached Line #${d.current_top_line} ✔` : `Stopped at Line #${d.current_top_line} ⚠️`);
        setStreamKey(Date.now());
      } else { setNavStatus(`Error: ${d.detail || 'Navigation failed'}`); }
    } catch (e: any) { setNavStatus(`Navigation failed: ${e.message}`); }
    finally { setIsNavigating(false); }
  };

  const handleSendControlKey = async (keyName: string) => {
    setIsNavigating(true);
    setNavStatus(`Sending Ctrl+${keyName}...`);
    try {
      const res = await api(`/api/device/key/${keyName}`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        setNavStatus(`Dispatched Ctrl+${keyName}. Current Top: Ln ${d.top_line || 'unknown'} ✔`);
        setStreamKey(Date.now());
      } else { setNavStatus(`Error: ${d.detail}`); }
    } catch (e: any) { setNavStatus(`Error: ${e.message}`); }
    finally { setIsNavigating(false); }
  };

  const handleDeleteProject = async (id: string) => {
    const ok = await confirm({ title: 'Delete Project', message: 'Delete this project and all its transcribed frames?', variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    const res = await api(`/api/projects/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchData();
  };

  const handleDeleteFrame = async (id: string, e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    const ok = await confirm({ title: 'Delete Frame', message: 'Delete this frame from the document? Line bounds will re-index.', variant: 'danger', confirmText: 'Delete Frame' });
    if (!ok) return;
    setDeletingFrameId(id);
    try {
      const res = await api(`/api/frames/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFrames(prev => prev.filter(f => f.frame_id !== id));
        if (selectedFrameId === id) setSelectedFrameId(null);
        await fetchData();
      }
    } finally { setDeletingFrameId(null); }
  };

  const handleReprocessFrame = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setReprocessingFrameId(id);
    try {
      await api(`/api/frames/${id}/reprocess`, { method: 'POST' });
      await fetchData();
    } finally { setReprocessingFrameId(null); }
  };

  const handleReprocessAllFailed = async () => {
    const failed = frames.filter(f => f.status.startsWith('error'));
    for (const f of failed) await handleReprocessFrame(f.frame_id);
  };

  const handleUpdateFramePosition = async (id: string, delta: number) => {
    const target = frames.find(f => f.frame_id === id);
    if (!target) return;
    const newOffset = (target.custom_offset_y || 0) + delta;
    setFrames(prev => prev.map(f => f.frame_id === id ? { ...f, custom_offset_y: newOffset } : f));
    await api(`/api/frames/${id}/position`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_offset_y: newOffset }) });
  };

  // WebSocket handling
  useEffect(() => {
    let ws: WebSocket | null = null, timer: any = null;
    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const base = API_BASE.startsWith('http') ? API_BASE.replace(/^http/, 'ws') : `${proto}//${window.location.host}`;
      ws = new WebSocket(`${base}/ws`);
      ws.onopen = () => { setWsConnected(true); setBackendConnected(true); addTelemetryEvent('WS', 'Connected to telemetry stream'); };
      ws.onclose = () => { setWsConnected(false); timer = setTimeout(connect, 3000); };
      ws.onerror = () => ws?.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const newF = msg.data?.frame_id ? msg.data : (msg.frame?.frame_id ? msg.frame : null);
          if (msg.type === 'new_frame' && newF) {
            setFrames(p => [...p.filter(f => f.frame_id !== newF.frame_id), newF]);
            setSelectedFrameId(newF.frame_id);
            addTelemetryEvent('FRAME', `New frame: ${newF.frame_id.slice(0, 8)}`);
            apiJson<any>('/api/document').then(d => { setDocumentData(d); if (d.token_stats) setTokenStats(d.token_stats); });
          } else if (msg.type === 'frame_deleted') {
            setFrames(p => p.filter(f => f.frame_id !== msg.frame_id));
            addTelemetryEvent('FRAME', `Frame ${msg.frame_id?.slice(0, 8)} deleted`);
          } else if (msg.type === 'document_updated') {
            const docObj = msg.data || msg.document;
            if (docObj) {
              setDocumentData(docObj);
              if (docObj.token_stats) setTokenStats(docObj.token_stats);
            }
          } else if (msg.type === 'device_selected') {
            apiJson<DeviceInfoData>('/api/device/info').then(info => { if (info) setDeviceInfo(info); });
          } else if (msg.type === 'telemetry_updated' && msg.data) {
            setTelemetry(p => ({ ...p, ...msg.data }));
          } else if (msg.type === 'orchestration_event' && msg.telemetry) {
            setTelemetry(msg.telemetry);
          } else if (msg.type === 'frame_processed' && msg.data?.frame_id) {
            setFrames(p => p.map(f => f.frame_id === msg.data.frame_id ? { ...f, ...msg.data } : f));
          } else if (msg.type === 'frame_bounding_boxes' && msg.data?.frame_id) {
            setFrameBoundingBoxes(p => ({ ...p, [msg.data.frame_id]: msg.data.boxes }));
          } else if (msg.type === 'project_init_progress') {
            setProjectInitProgress(prev => ({
              active: true,
              percent: msg.percent ?? prev?.percent ?? 50,
              stage: msg.stage || prev?.stage || 'Initializing project...',
              status: msg.status || (msg.percent === 100 ? 'completed' : 'running'),
              totalLines: msg.total_lines ?? prev?.totalLines,
              error: msg.error,
              projectName: prev?.projectName
            }));
            if (msg.status === 'completed' || msg.percent === 100) {
              fetchData();
            }
          } else if (msg.type === 'alignment_status') {
            const d = msg.alignment || msg.data;
            if (d) setAlignmentData(d);
          }
        } catch {}
      };
    };
    connect();
    return () => { ws?.close(); clearTimeout(timer); };
  }, [addTelemetryEvent, fetchData]);

  const handleTogglePipelineMode = async (mode: 'cloud' | 'local') => {
    setIsSwitchingPipeline(true);
    try {
      const res = await api('/api/pipeline/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      if (res.ok) setPipelineMode((await res.json()).pipeline_mode);
    } finally { setIsSwitchingPipeline(false); }
  };

  const handleScanFrameOcr = async () => {
    if (!activeFrame) return;
    setIsScanningOcr(true);
    setScanStatusMsg('Scanning with local model...');
    try {
      const res = await api(`/api/frames/${activeFrame.frame_id}/scan`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setScanStatusMsg(`Scan OK: ${d.extracted_line_count} lines`);
        const doc = await apiJson<any>('/api/document');
        setDocumentData(doc);
        if (doc.token_stats) setTokenStats(doc.token_stats);
      } else { setScanStatusMsg('Scan error'); }
    } catch { setScanStatusMsg('Scan failed'); }
    finally { setIsScanningOcr(false); }
  };

  const handleSaveLineEdit = async () => {
    if (!editingLine) return;
    const res = await api(`/api/lines/${editingLine.line_number}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: editText }) });
    if (res.ok) { setEditingLine(null); await fetchData(); }
  };

  const handleSaveApiKey = async () => {
    const res = await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gemini_api_key: apiKeyInput.trim() }) });
    if (res.ok) { setApiKeyConfigured(true); setShowConfigModal(false); }
    else { await showAlert({ title: 'Invalid API Key', message: 'The provided key could not be verified.', variant: 'danger' }); }
  };

  const sortedFrames = [...frames].sort((a, b) => a.top_line - b.top_line || a.page_index - b.page_index);
  const activeFrame = frames.find(f => f.frame_id === selectedFrameId) || frames[0] || null;
  const filteredLines = (documentData?.lines || []).filter(l => {
    if (filterMode === 'issues' && l.status !== 'issue' && l.status !== 'gap' && l.status !== 'unaligned') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (l.text || '').toLowerCase().includes(q) || String(l.line_number).includes(q) || String(l.gutter_number || '').includes(q);
    }
    return true;
  });

  const isP8Available = Boolean(
    deviceInfo?.pixel_8_available ??
    deviceInfo?.devices?.some(d => d.displayName === 'Pixel 8' || d.model.toLowerCase().includes('pixel_8') || (pixel8Ip && d.serial === pixel8Ip))
  );

  const isP10Available = Boolean(
    deviceInfo?.pixel_10_available ??
    deviceInfo?.devices?.some(d => d.displayName === 'Pixel 10' || d.model.toLowerCase().includes('pixel_10') || (pixel10Ip && d.serial === pixel10Ip))
  );

  const isCurrentDeviceConnected = Boolean(
    deviceInfo?.connected && (deviceModel === 'pixel_8' ? isP8Available : isP10Available)
  );

  const devDisplayName = deviceModel === 'pixel_8' ? 'PIXEL 8' : 'PIXEL 10';
  const devLines = deviceModel === 'pixel_8' ? 31 : 47;

  return (
    <div className="studio-root" data-testid="matrix-capture-studio">
      <header className="studio-header">
        <div className="header-left">
          <div className="brand-group">
            <span className="brand-dot" />
            <h1 className="brand-title">Matrix Capture</h1>
            <span className="brand-tag">v2.5 Studio</span>
          </div>
          <div className="project-badge" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <FolderKanban size={13} color="#00ff9d" />
            <span className="project-badge-name">{activeProject ? activeProject.name : 'Select Project'}</span>
            <ChevronDown size={11} />
          </div>
        </div>

        <div className="header-center">
          <div className="device-selector-wrapper" ref={deviceDropdownRef}>
            <button
              className={`device-selector-btn ${showStudioDrawer && studioInitialTab === 'device' ? 'open' : ''} ${!isCurrentDeviceConnected ? 'unavailable' : ''}`}
              onClick={() => {
                setStudioInitialTab('device');
                setShowStudioDrawer(true);
              }}
              title="Select connected Android device & configure wireless ADB in Studio"
            >
              <div className={`device-status-dot ${isCurrentDeviceConnected ? 'online' : 'offline'}`} />
              <Smartphone size={13} color={isCurrentDeviceConnected ? 'var(--color-primary)' : '#ef4444'} />
              <span style={{ fontWeight: 700 }}>{devDisplayName}</span>
              <span className="device-spec">({devLines}L)</span>
            </button>
          </div>

          <button
            onClick={() => {
              setStudioInitialTab('kiosk');
              setShowStudioDrawer(true);
              setLiveMode('desktop');
              setStreamKey(Date.now());
            }}
            className="kiosk-nav-btn"
            style={{ borderColor: showStudioDrawer ? '#1f6feb' : undefined }}
            title="Open Unified Device & Kiosk Studio (Live Viewport & Lockdown)"
          >
            <Monitor size={12} /><span>STUDIO VIEW</span>
            {showStudioDrawer && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ff9d' }} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setStudioInitialTab('kiosk');
              setShowStudioDrawer(true);
            }}
            className={`kiosk-nav-btn ${showStudioDrawer && studioInitialTab === 'kiosk' ? 'active' : ''}`}
            title="External Desktop Isolation & Kiosk Lockdown"
          >
            <Shield size={12} /><span>KIOSK LOCK</span>
          </button>

          {isCurrentDeviceConnected ? (
            <div className={`alignment-header-pill ${alignmentData.is_aligned ? 'aligned' : 'unaligned'}`} onClick={() => alignmentData.is_aligned ? handleTriggerAlignmentCheck() : setIsBannerDismissed(p => !p)}>
              <div className={`dot ${alignmentData.is_aligned ? 'pulse-green' : ''}`} style={{ width: '7px', height: '7px', borderRadius: '50%', background: alignmentData.is_aligned ? '#22c55e' : '#ef4444' }} />
              <span style={{ fontWeight: 700 }}>{alignmentData.is_aligned ? 'TEAMS ALIGNED' : 'NOT ALIGNED'}</span>
              {alignmentData.first_line_number && alignmentData.last_line_number && <span style={{ fontSize: '10px', opacity: 0.85 }}>(Ln {alignmentData.first_line_number}-{alignmentData.last_line_number})</span>}
            </div>
          ) : (
            <div className="alignment-header-pill unaligned" onClick={() => setIsBannerDismissed(p => !p)} title="Device not connected - click to toggle alert banner">
              <div className="dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ fontWeight: 700 }}>NO DEVICE CONNECTED</span>
            </div>
          )}

          <div className="metric-pill" style={{ borderColor: wsConnected ? '#00ff9d44' : '#ff7b7244' }}>
            <span className="label">SOCKET:</span><span className="value" style={{ color: wsConnected ? '#00ff9d' : '#ff7b72' }}>{wsConnected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          {recaptureQueue.length > 0 && <div className="metric-pill" style={{ borderColor: '#bc8cff44' }}><span className="label">RECAPTURE:</span><span className="value" style={{ color: '#bc8cff' }}>{recaptureQueue.length}</span></div>}
        </div>

        <div className="header-actions">
          <button className="gear-btn" onClick={() => setShowConfigModal(true)} title="Settings" aria-label="Settings"><Settings size={16} /></button>
        </div>
      </header>

      <AlignmentAlertBanner
        alignmentData={alignmentData}
        deviceInfo={deviceInfo}
        deviceModel={deviceModel}
        isCheckingAlignment={isCheckingAlignment}
        onTriggerCheck={handleTriggerAlignmentCheck}
        onOpenModal={() => setShowAlignmentModal(true)}
        onOpenLiveScreen={() => { setStudioInitialTab('kiosk'); setShowStudioDrawer(true); setLiveMode('desktop'); setStreamKey(Date.now()); }}
        onOpenDeviceDrawer={() => { setStudioInitialTab('device'); setShowStudioDrawer(true); }}
        onConnectDevice={(ip, model) => handleConnectAdbIp(ip, model)}
        isConnectingDevice={isConnectingIp}
        onFixClassifier={handleFixClassifier}
        onFixAllClassifiers={handleFixAllClassifiers}
        fixingClassifierId={fixingClassifierId}
        isFixingAll={isFixingAll}
        isDismissed={isBannerDismissed}
        onDismissBanner={() => { setIsBannerDismissed(true); localStorage.setItem('mc_banner_dismissed', 'true'); }}
        isMinimized={isBannerMinimized}
        onToggleMinimizeBanner={() => setIsBannerMinimized(p => !p)}
        dismissedItems={dismissedItems}
        onDismissItem={handleDismissItem}
      />

      <div className="orchestration-bar">
        <div className="orchestration-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn btn-orch btn-capture-desktop" onClick={() => { setInspectorMode('live'); setLiveMode('desktop'); setStreamKey(Date.now()); }} title="Switch to Live Desktop & Refresh Capture Stream"><Camera size={14} /><span>Live Desktop Stream</span></button>
          <button className={`btn btn-sm ${showDag ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowDag(!showDag)} style={{ height: '36px', borderRadius: '8px', padding: '0 12px' }}><Layers size={14} /><span>{showDag ? 'Hide Flow DAG' : 'Show Flow DAG'}</span></button>
          <button className="btn btn-sm btn-outline" onClick={() => setShowGotoModal(true)} style={{ height: '36px', borderRadius: '8px', padding: '0 12px' }}><Compass size={14} /><span>Go To Line (Ctrl+G)</span></button>
        </div>
      </div>

      {showDag && (
        <div style={{ padding: '0 20px 12px 20px' }}>
          <FlowDag apiBase={API_BASE} activeProjectId={activeProject?.id} activeDeviceSerial={deviceInfo?.active_serial} currentTopLine={telemetry.current_top_line || documentData.min_line || 1} currentBottomLine={telemetry.current_bottom_line || documentData.max_line || 49} targetTotalLines={activeProject?.target_total_lines || telemetry.target_total_lines || 0} currentPage={telemetry.current_page || frames.length || 1} isOrchestrating={telemetry.is_pacing} onRefresh={fetchData} />
        </div>
      )}

      {!backendConnected && (
        <div style={{ backgroundColor: '#ff7b7218', borderBottom: '1px solid #ff7b7233', color: '#ff7b72', padding: '6px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', fontWeight: 500 }}>
          <AlertCircle size={14} /><span>FastAPI backend unreachable. Retrying connection to port 8000...</span>
        </div>
      )}

      <div className="studio-body">
        <aside className={`projects-sidebar ${isSidebarOpen ? 'open' : 'collapsed'}`}>
          {isSidebarOpen ? (
            <div className="projects-sidebar-content">
              <div className="sidebar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FolderKanban size={16} color="#00ff9d" /><span style={{ fontWeight: 600, fontSize: '13px', color: '#e6edf3' }}>Projects</span></div>
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
                      <button className="btn-text-danger" onClick={e => { e.stopPropagation(); handleDeleteProject(p.id); }} title="Delete project" style={{ padding: '2px 4px', opacity: 0.8 }}><Trash2 size={12} /></button>
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

        {activeProject && (
          <>
            <aside className="frames-feed-panel" style={{ width: `${framesPanelWidth}px`, flexShrink: 0 }}>
              <div className="panel-header">
                <span>Captured Frames ({frames.length})</span>
                {frames.some(f => f.status.startsWith('error')) && <button className="btn btn-sm btn-outline btn-warning-outline" onClick={handleReprocessAllFailed}><RotateCw size={11} /> Retry Failed</button>}
              </div>

              <div className="frames-list">
                {sortedFrames.length === 0 ? (
                  <div className="drop-zone-placeholder" style={{ cursor: 'default' }}>
                    <span style={{ fontWeight: 600, color: '#e6edf3' }}>Captured Frames</span>
                    <span style={{ fontSize: '11px', color: '#8b949e' }}>Settled {devDisplayName} frames appear here automatically</span>
                  </div>
                ) : sortedFrames.map((f, idx) => {
                  const prevFrame = idx > 0 ? sortedFrames[idx - 1] : null;
                  const hasGap = prevFrame && prevFrame.bottom_line > 0 && f.top_line > prevFrame.bottom_line + 1;
                  return (
                    <div key={f.frame_id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {hasGap && <div className="gap-alert-tag"><AlertCircle size={11} /><span>Gap: missing Ln {prevFrame.bottom_line + 1} → {f.top_line - 1}</span></div>}
                      <div className={`frame-card ${selectedFrameId === f.frame_id ? 'active' : ''} ${f.status.startsWith('error') ? 'frame-error' : ''}`} onClick={() => setSelectedFrameId(f.frame_id)}>
                        <div className="frame-card-preview">
                          <img src={`${API_BASE}/api/frames/${f.frame_id}/image?t=${encodeURIComponent(f.created_at || '')}`} alt={f.frame_id} />
                          <span className="frame-badge">Pg {f.page_index}</span>
                          {f.token_usage && f.token_usage.total_tokens > 0 && <span className="frame-token-badge"><Coins size={9} /> {f.token_usage.total_tokens}</span>}
                          <button className="frame-card-delete-overlay" onClick={(e) => handleDeleteFrame(f.frame_id, e)} disabled={deletingFrameId === f.frame_id} title="Delete frame"><Trash2 size={12} /></button>
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
                          <div className="frame-position-controls" onClick={e => e.stopPropagation()} title="Nudge offset (px)">
                            <MoveVertical size={10} color="#8b949e" />
                            <button className="nudge-btn" onClick={() => handleUpdateFramePosition(f.frame_id, -1)}>▲</button>
                            <span className="nudge-val">{f.custom_offset_y || 0}px</span>
                            <button className="nudge-btn" onClick={() => handleUpdateFramePosition(f.frame_id, 1)}>▼</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            <div className={`panel-resizer ${isDraggingFrames ? 'dragging' : ''}`} onMouseDown={handleFramesResizer} onDoubleClick={() => setFramesPanelWidth(280)} role="separator">
              <div className="panel-resizer-line" />
            </div>

            <main className="frame-inspector-panel" style={{ flex: `${inspectorPercent} 1 0`, minWidth: '220px' }}>
              <div className="panel-header">
                <div style={{ display: 'flex', gap: '3px', background: '#0d1117', padding: '2px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <button className={`btn btn-sm ${inspectorMode === 'live' ? 'btn-primary' : ''}`} onClick={() => { setInspectorMode('live'); setLiveMode('desktop'); setStreamKey(Date.now()); }} style={{ fontSize: '11px', padding: '3px 8px' }}><Monitor size={11} style={{ marginRight: '4px' }} /><span>Live Desktop</span></button>
                  <button className={`btn btn-sm ${inspectorMode === 'single' ? 'btn-primary' : ''}`} onClick={() => setInspectorMode('single')} style={{ fontSize: '11px', padding: '3px 8px' }}>Single Frame</button>
                  <button className={`btn btn-sm ${inspectorMode === 'spliced' ? 'btn-primary' : ''}`} onClick={() => setInspectorMode('spliced')} style={{ fontSize: '11px', padding: '3px 8px' }}>Spliced ({frames.length})</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {inspectorMode === 'live' && (
                    <>
                      <div className="live-refreshed-badge"><span className="dot" /><span>{inspectorAgoSec <= 1 ? 'LIVE' : `${inspectorAgoSec}s ago`}</span></div>
                      <button type="button" className={`live-info-btn ${showInspectorMetaPopover ? 'active' : ''}`} onClick={() => setShowInspectorMetaPopover(p => !p)}><Info size={11} /><span>INFO</span></button>
                      <button className="btn btn-sm btn-outline" onClick={() => setStreamKey(Date.now())} style={{ padding: '2px 8px', fontSize: '10px' }}><RefreshCw size={11} /></button>
                    </>
                  )}
                  {inspectorMode === 'single' && activeFrame && (
                    <button className="btn-scan-ocr" onClick={handleScanFrameOcr} disabled={isScanningOcr}><Scan size={13} className={isScanningOcr ? 'spinning' : ''} /><span>{isScanningOcr ? 'Scanning...' : 'OCR Scan'}</span></button>
                  )}
                  {scanStatusMsg && <span className="scan-status-pill">{scanStatusMsg}</span>}
                </div>
              </div>

              <div className="inspector-view-container">
                {inspectorMode === 'live' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Monitor size={14} color="#00ff9d" />
                        <span style={{ fontSize: '11px', color: '#00ff9d', fontFamily: 'monospace', fontWeight: 700 }}>LIVE DESKTOP · MARKDOWN VIEW</span>
                      </div>
                      <button type="button" className={`live-ai-boxes-btn ${showBoundingBoxes ? 'active' : ''}`} onClick={() => setShowBoundingBoxes(p => !p)} style={{ padding: '2px 8px', height: '22px', fontSize: '10px' }}>
                        {showBoundingBoxes ? <Eye size={10} /> : <EyeOff size={10} />}<span>AI BOXES</span>
                      </button>
                    </div>
                    <div className="gutter-line-callout top"><span className="gutter-callout-icon">▲</span><span className="gutter-callout-label">TOP GUTTER:</span><span className="gutter-callout-value">{alignmentData.first_line_number || telemetry.current_top_line ? `Line #${alignmentData.first_line_number || telemetry.current_top_line}` : 'Detecting...'}</span></div>
                    <div className="source-image-wrapper fit" style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img key={`main-desktop-stream-${streamKey}`} src={`${API_BASE}/api/device/stream?mode=desktop&t=${streamKey}`} alt="Live Desktop" style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 240px)', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).src = `${API_BASE}/api/device/screen?mode=desktop&t=${Date.now()}`; }} />
                      {showBoundingBoxes && renderBoundingBoxesOverlay(alignmentData)}
                    </div>
                    <div className="gutter-line-callout bottom"><span className="gutter-callout-icon">▼</span><span className="gutter-callout-label">BOTTOM GUTTER:</span><span className="gutter-callout-value">{alignmentData.last_line_number || telemetry.current_bottom_line ? `Line #${alignmentData.last_line_number || telemetry.current_bottom_line}` : 'Detecting...'}</span></div>
                  </div>
                ) : inspectorMode === 'spliced' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Layers size={14} color="#00ff9d" /><span style={{ fontSize: '11px', color: '#00ff9d', fontFamily: 'monospace', fontWeight: 700 }}>SPLICED CANVAS · {frames.length} FRAMES</span></div>
                    </div>
                    <div className="source-image-wrapper fit"><img src={`${API_BASE}/api/spliced-document-image?t=${frames.length}_${frames[frames.length - 1]?.created_at || ''}`} alt="Spliced" style={{ width: '100%', display: 'block' }} /></div>
                  </div>
                ) : activeFrame ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                    <div className="gutter-line-callout top"><span className="gutter-callout-icon">▲</span><span className="gutter-callout-label">TOP GUTTER:</span><span className="gutter-callout-value">{activeFrame.top_line > 0 ? `Line #${activeFrame.top_line}` : 'Detecting...'}</span></div>
                    <div className="source-image-wrapper fit">
                      <img src={`${API_BASE}/api/frames/${activeFrame.frame_id}/image?t=${encodeURIComponent(activeFrame.created_at || '')}`} alt={activeFrame.frame_id} />
                      {frameBoundingBoxes[activeFrame.frame_id] && (
                        <svg className="bbox-svg-overlay" viewBox="0 0 1920 1080" preserveAspectRatio="none">
                          {frameBoundingBoxes[activeFrame.frame_id].first_line && <rect x={frameBoundingBoxes[activeFrame.frame_id].first_line!.x} y={frameBoundingBoxes[activeFrame.frame_id].first_line!.y} width={frameBoundingBoxes[activeFrame.frame_id].first_line!.width} height={frameBoundingBoxes[activeFrame.frame_id].first_line!.height} className="bbox-rect-green" />}
                          {frameBoundingBoxes[activeFrame.frame_id].last_line && <rect x={frameBoundingBoxes[activeFrame.frame_id].last_line!.x} y={frameBoundingBoxes[activeFrame.frame_id].last_line!.y} width={frameBoundingBoxes[activeFrame.frame_id].last_line!.width} height={frameBoundingBoxes[activeFrame.frame_id].last_line!.height} className="bbox-rect-red" />}
                          {frameBoundingBoxes[activeFrame.frame_id].wrapped_lines?.map((wb, i) => <rect key={i} x={wb.x} y={wb.y} width={wb.width} height={wb.height} className="bbox-rect-yellow" />)}
                        </svg>
                      )}
                    </div>
                    <div className="gutter-line-callout bottom"><span className="gutter-callout-icon">▼</span><span className="gutter-callout-label">BOTTOM GUTTER:</span><span className="gutter-callout-value">{activeFrame.bottom_line > 0 ? `Line #${activeFrame.bottom_line}` : 'Detecting...'}</span></div>
                  </div>
                ) : (
                  <div className="empty-inspector-state"><Scan size={36} color="#30363d" /><p>No frame selected.</p><button className="btn btn-sm btn-primary" onClick={() => { setInspectorMode('live'); setLiveMode('desktop'); setStreamKey(Date.now()); }}><Monitor size={12} /><span>Switch to Live Desktop</span></button></div>
                )}
              </div>
            </main>

            <div className={`panel-resizer ${isDraggingSplit ? 'dragging' : ''}`} onMouseDown={handleSplitResizer} onDoubleClick={() => setInspectorPercent(48)} role="separator"><div className="panel-resizer-line" /></div>

            <section className="line-inspector-panel" style={{ flex: `${100 - inspectorPercent} 1 0`, minWidth: '240px' }}>
              <div className="panel-header">
                <span>Verified Lines ({filteredLines.length})</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className={`btn btn-sm ${filterMode === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterMode('all')}>All ({documentData.total_lines})</button>
                  <button className={`btn btn-sm ${filterMode === 'issues' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterMode('issues')}>Issues ({documentData.issue_count})</button>
                </div>
              </div>
              <div className="filter-bar"><Search size={14} color="#8b949e" /><input type="text" className="search-input" placeholder="Search lines..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
              <div className="lines-table-container" ref={lineListRef} style={{ paddingBottom: isTelemetryExpanded ? '340px' : '40px' }}>
                {filteredLines.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: '#6e7681' }}><p>No lines transcribed yet.</p></div> : (
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
        )}
      </div>

      {editingLine && (
        <Modal title={`Edit Line #${editingLine.line_number}`} onClose={() => setEditingLine(null)} onConfirm={handleSaveLineEdit} confirmText="Save Line">
          <label style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>LINE TEXT (VERBATIM):</label>
          <textarea rows={4} style={{ width: '100%', background: '#0a0d12', border: '1px solid #30363d', borderRadius: '6px', padding: '10px', color: '#fff', fontFamily: 'monospace', fontSize: '12px' }} value={editText} onChange={e => setEditText(e.target.value)} />
        </Modal>
      )}

      {showConfigModal && (
        <Modal title="Studio Settings" width="520px" onClose={() => setShowConfigModal(false)} onConfirm={settingsTab === 'secrets' ? handleSaveApiKey : undefined} confirmText="Save Key">
          <div className="modal-tabs">
            <button className={`modal-tab ${settingsTab === 'pipeline' ? 'active' : ''}`} onClick={() => setSettingsTab('pipeline')} type="button"><Cpu size={14} /><span>Pipeline Engine</span></button>
            <button className={`modal-tab ${settingsTab === 'secrets' ? 'active' : ''}`} onClick={() => setSettingsTab('secrets')} type="button"><Key size={14} /><span>Secrets</span></button>
          </div>
          {settingsTab === 'pipeline' ? (
            <div className="settings-tab-content">
              <div className="pipeline-choices">
                <div className={`pipeline-choice-card ${pipelineMode === 'cloud' ? 'active cloud-active' : ''}`} onClick={() => !isSwitchingPipeline && handleTogglePipelineMode('cloud')} role="button" tabIndex={0}>
                  <div className="pipeline-choice-icon" style={{ color: '#58a6ff' }}><Cloud size={18} /></div>
                  <div className="pipeline-choice-info">
                    <div className="pipeline-choice-title"><span>Cloud Pipeline (Gemini 2.5 Flash)</span>{pipelineMode === 'cloud' && <span className="badge-active-pill" style={{ background: 'rgba(88, 166, 255, 0.15)', color: '#58a6ff', borderColor: 'rgba(88, 166, 255, 0.3)' }}>ACTIVE</span>}</div>
                    <p className="pipeline-choice-desc">Fast, high-fidelity cloud vision model. Processes settled frames with zero local GPU load.</p>
                  </div>
                </div>
                <div className={`pipeline-choice-card ${pipelineMode === 'local' ? 'active' : ''}`} onClick={() => !isSwitchingPipeline && handleTogglePipelineMode('local')} role="button" tabIndex={0}>
                  <div className="pipeline-choice-icon" style={{ color: 'var(--color-primary)' }}><Zap size={18} /></div>
                  <div className="pipeline-choice-info">
                    <div className="pipeline-choice-title"><span>Local Pipeline (MiniCPM-V 2.6)</span>{pipelineMode === 'local' && <span className="badge-active-pill">ACTIVE</span>}</div>
                    <p className="pipeline-choice-desc">100% offline vision-language model execution via local engine. Zero network calls.</p>
                  </div>
                </div>
              </div>
              <div className="token-metrics-box">
                <div className="token-metrics-header"><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Coins size={13} color="var(--color-primary)" /><span>TOKEN USAGE</span></div><span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>${tokenStats.estimated_cost_usd.toFixed(4)} USD</span></div>
                <div className="token-metrics-grid">
                  <div className="token-metric-item"><span className="lbl">Total Tokens</span><span className="val">{(tokenStats.total_tokens + (tokenStats.mobile_tokens?.total_tokens || 0)).toLocaleString()}</span></div>
                  <div className="token-metric-item"><span className="lbl">API Calls</span><span className="val">{tokenStats.total_api_calls}</span></div>
                  <div className="token-metric-item"><span className="lbl">Prompt Tokens</span><span className="val">{tokenStats.total_prompt_tokens.toLocaleString()}</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="settings-tab-content">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 600 }}>GEMINI API KEY</label>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: apiKeyConfigured ? 'rgba(0, 255, 157, 0.12)' : 'rgba(255, 123, 114, 0.12)', color: apiKeyConfigured ? 'var(--color-primary)' : '#ff7b72' }}>{apiKeyConfigured ? '● ACTIVE' : '○ NOT CONFIGURED'}</span>
              </div>
              <input type="password" placeholder={apiKeyConfigured ? '••••••••••••••••' : 'AIzaSy...'} className="modal-input" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px' }} value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} autoFocus />
            </div>
          )}
        </Modal>
      )}

      {showNewProjectModal && (
        <Modal title="Create New Project" onClose={() => setShowNewProjectModal(false)} onConfirm={handleCreateProject} confirmText="Create & Activate" confirmIcon={Plus} disabled={!newProject.name.trim()}>
          <div className="modal-form-group">
            <label>PROJECT NAME *</label>
            <input type="text" placeholder="e.g. Small-Fling Core" className="modal-input" value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && newProject.name.trim()) { e.preventDefault(); handleCreateProject(); } }} autoFocus />
          </div>
        </Modal>
      )}

      {projectInitProgress && projectInitProgress.active && (
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={16} color={projectInitProgress.status === 'error' ? '#ff7b72' : '#00ff9d'} />
              <span>INITIALIZING PROJECT WORKSPACE</span>
            </div>
          }
          onClose={() => setProjectInitProgress(null)}
          maxWidth="560px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#e6edf3', fontFamily: 'var(--font-mono, monospace)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#f0f6fc' }}>
                  {projectInitProgress.projectName ? `Project: "${projectInitProgress.projectName}"` : 'New Markdown Workspace'}
                </div>
                <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '3px' }}>
                  Auto-executing DAG Group 1 (Ctrl+End total lines calibration & Line 1 verification)
                </div>
              </div>
              <span style={{ fontSize: '18px', fontWeight: 900, color: projectInitProgress.status === 'completed' ? '#00ff9d' : (projectInitProgress.status === 'error' ? '#ff7b72' : '#58a6ff') }}>
                {projectInitProgress.percent}%
              </span>
            </div>

            {/* Glowing progress bar */}
            <div style={{ width: '100%', height: '10px', background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${projectInitProgress.percent}%`,
                  background: projectInitProgress.status === 'completed' ? 'linear-gradient(90deg, #238636, #00ff9d)' : (projectInitProgress.status === 'error' ? '#f85149' : 'linear-gradient(90deg, #1f6feb, #a371f7, #00ff9d)'),
                  boxShadow: projectInitProgress.status === 'completed' ? '0 0 10px rgba(0, 255, 157, 0.4)' : '0 0 8px rgba(88, 166, 255, 0.3)',
                  transition: 'width 0.4s ease-out'
                }}
              />
            </div>

            {/* Stage description & indicator */}
            <div style={{ background: '#161b22', border: `1px solid ${projectInitProgress.status === 'error' ? '#f8514966' : '#30363d'}`, borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {projectInitProgress.status === 'running' && <RefreshCw size={16} className="spin" color="#58a6ff" />}
              {projectInitProgress.status === 'completed' && <Check size={18} color="#00ff9d" />}
              {projectInitProgress.status === 'error' && <AlertCircle size={18} color="#ff7b72" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: projectInitProgress.status === 'error' ? '#ff7b72' : (projectInitProgress.status === 'completed' ? '#00ff9d' : '#f0f6fc') }}>
                  {projectInitProgress.stage}
                </div>
                {projectInitProgress.status === 'completed' && projectInitProgress.totalLines !== undefined && projectInitProgress.totalLines > 0 && (
                  <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                    Document EOF confirmed: {projectInitProgress.totalLines.toLocaleString()} total lines detected
                  </div>
                )}
                {projectInitProgress.error && (
                  <div style={{ fontSize: '11px', color: '#ff7b72', marginTop: '4px' }}>
                    {projectInitProgress.error}
                  </div>
                )}
              </div>
            </div>

            {/* Step list progression */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: '#8b949e' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: projectInitProgress.percent >= 10 ? '#00ff9d' : '#8b949e' }}>
                <span>{projectInitProgress.percent >= 10 ? '✔' : '○'}</span>
                <span>1. Database entry & active workspace configured</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: projectInitProgress.percent >= 25 ? '#00ff9d' : '#8b949e' }}>
                <span>{projectInitProgress.percent >= 25 ? '✔' : '○'}</span>
                <span>2. External display verified & editor cursor focused</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: projectInitProgress.percent >= 65 ? '#00ff9d' : '#8b949e' }}>
                <span>{projectInitProgress.percent >= 65 ? '✔' : '○'}</span>
                <span>3. Dispatched HID Ctrl+End & calibrated total lines</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: projectInitProgress.percent >= 100 ? '#00ff9d' : '#8b949e' }}>
                <span>{projectInitProgress.percent >= 100 ? '✔' : '○'}</span>
                <span>4. Dispatched HID Ctrl+Home & verified Line 1 in gutter</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid #21262d' }}>
              {projectInitProgress.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => setProjectInitProgress(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', background: '#238636', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <Check size={14} />
                  <span>Start Capturing Markdown</span>
                </button>
              )}
              {projectInitProgress.status === 'error' && (
                <>
                  <button
                    type="button"
                    onClick={() => setProjectInitProgress(null)}
                    style={{ padding: '6px 12px', background: '#21262d', color: '#8b949e', border: '1px solid #30363d', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Dismiss & View DAG
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setProjectInitProgress(curr => curr ? ({ ...curr, percent: 15, stage: 'Retrying DAG Group: Initialize...', status: 'running', error: undefined }) : null);
                      try {
                        await api('/api/dag/groups/initialize/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: activeProject?.id }) });
                      } catch {}
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <RefreshCw size={13} />
                    <span>Retry Initialize</span>
                  </button>
                </>
              )}
              {projectInitProgress.status === 'running' && (
                <div style={{ fontSize: '10.5px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Communicating with Android HID and OCR engine...</span>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      <GotoLineModal
        isOpen={showGotoModal} onClose={() => { setShowGotoModal(false); setNavStatus(''); }}
        deviceInfo={deviceInfo} deviceModel={deviceModel} alignmentData={alignmentData} showBoundingBoxes={showBoundingBoxes}
        onToggleBoundingBoxes={() => setShowBoundingBoxes(p => !p)} onSelectSerial={handleSelectSerial} onSelectDevice={handleSelectDevice}
        onConnectAdbIp={handleConnectAdbIp} isConnectingIp={isConnectingIp} connectStatusMsg={connectStatusMsg}
        onCloseKeyboard={handleCloseKeyboard} isClosingKeyboard={isClosingKeyboard} gotoTargetLine={gotoTargetLine}
        setGotoTargetLine={setGotoTargetLine} onGotoLine={handleGotoLine} isNavigating={isNavigating} navStatus={navStatus}
        onSendControlHome={() => handleSendControlKey('home')} onSendControlEnd={() => handleSendControlKey('end')}
        apiBase={API_BASE} streamKey={streamKey}
      />

      <DeviceStudioDrawer
        isOpen={showStudioDrawer}
        onClose={() => setShowStudioDrawer(false)}
        apiBase={API_BASE}
        initialTab={studioInitialTab}
        deviceInfo={deviceInfo}
        deviceModel={deviceModel}
        onSelectDevice={handleSelectDevice}
        onSelectSerial={handleSelectSerial}
        onConnectAdbIp={handleConnectAdbIp}
        isConnectingIp={isConnectingIp}
        connectStatusMsg={connectStatusMsg}
        onPairAdb={handlePairAdb}
        isPairing={isPairing}
        pairStatusMsg={pairStatusMsg}
        pixel8Ip={pixel8Ip}
        setPixel8Ip={setPixel8Ip}
        pixel10Ip={pixel10Ip}
        setPixel10Ip={setPixel10Ip}
        alignmentData={alignmentData}
        onTriggerAlignmentCheck={handleTriggerAlignmentCheck}
        onOpenAlignmentModal={() => setShowAlignmentModal(true)}
        liveMode={liveMode}
        onSwitchLiveMode={m => { setLiveMode(m); setStreamKey(Date.now()); }}
        streamKey={streamKey}
        onRefreshStream={() => setStreamKey(Date.now())}
        showBoundingBoxes={showBoundingBoxes}
        onToggleBoundingBoxes={() => setShowBoundingBoxes(p => !p)}
        onCloseKeyboard={handleCloseKeyboard}
        isClosingKeyboard={isClosingKeyboard}
        telemetry={telemetry}
        tokenStats={tokenStats}
        documentSummary={{
          total_lines: documentData?.total_lines || 0,
          min_line: documentData?.min_line || 0,
          max_line: documentData?.max_line || 0,
          total_frames: frames.length,
          issue_count: documentData?.issue_count || 0,
          verified_overlap_lines: (documentData?.lines || []).filter(l => l.status === 'verified_overlap').length
        }}
        wsConnected={wsConnected}
        latencyMs={latencyMs}
        eventsLog={eventsLog}
        onClearEvents={() => setEventsLog([])}
        onShowToast={(type, msg) => addTelemetryEvent(type.toUpperCase() as any, msg)}
        projectInitProgress={projectInitProgress}
        onDismissInitProgress={() => setProjectInitProgress(null)}
      />

      <AlignmentDiagnosticsModal
        isOpen={showAlignmentModal} alignmentData={alignmentData} isCheckingAlignment={isCheckingAlignment}
        onClose={() => setShowAlignmentModal(false)} onTriggerCheck={handleTriggerAlignmentCheck}
        onInspectLiveScreen={() => { setShowAlignmentModal(false); setStudioInitialTab('kiosk'); setShowStudioDrawer(true); setLiveMode('desktop'); setStreamKey(Date.now()); }}
        onFixClassifier={handleFixClassifier} onFixAllClassifiers={handleFixAllClassifiers} fixingClassifierId={fixingClassifierId}
        isFixingAll={isFixingAll} dismissedItems={dismissedItems} onDismissItem={handleDismissItem}
      />

      <TelemetryToaster
        telemetry={telemetry} tokenStats={tokenStats}
        documentSummary={{ total_lines: documentData?.total_lines || 0, min_line: documentData?.min_line || 0, max_line: documentData?.max_line || 0, total_frames: frames.length, issue_count: documentData?.issue_count || 0, verified_overlap_lines: (documentData?.lines || []).filter(l => l.status === 'verified_overlap').length }}
        wsConnected={wsConnected} backendConnected={backendConnected} latencyMs={latencyMs} pipelineMode={pipelineMode}
        deviceModel={deviceModel} eventsLog={eventsLog} onClearEvents={() => setEventsLog([])} onExpandedChange={setIsTelemetryExpanded}
        isAlignmentDismissed={isBannerDismissed} isAligned={alignmentData.is_aligned}
        onReturnAlignmentOverlay={() => { setIsBannerDismissed(false); setIsBannerMinimized(false); localStorage.setItem('mc_banner_dismissed', 'false'); localStorage.setItem('mc_banner_minimized', 'false'); addTelemetryEvent('SYSTEM', 'Alignment Alert Overlay returned'); }}
        onOpenStudio={() => { setStudioInitialTab('telemetry'); setShowStudioDrawer(true); }}
      />
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
