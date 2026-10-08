import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scan, Settings, Search, Coins, Layers, RotateCw, RefreshCw, AlertCircle, FolderKanban, Plus, Trash2,
  ChevronLeft, ChevronRight, MoveVertical, Camera, Cloud, Zap, Smartphone, Key, Cpu,
  Monitor, ChevronDown, Info, Eye, EyeOff, Sliders, Minus, Maximize2, Minimize2, Activity,
  ZoomIn, ZoomOut, Copy, Check, ListTree,
  Lock, ShieldCheck, ShieldAlert, ToggleLeft, ToggleRight, AlertTriangle
} from 'lucide-react';
import { TelemetryToaster, type TelemetryData, type TelemetryEvent } from './TelemetryToaster';
import { FlowDag } from './FlowDag';
import { useConfirm, Modal } from './ConfirmModal';
import type {
  ProjectData, LineData, FrameData, RecaptureItem, TokenStats, FrameBoundingBoxes, AlignmentData, DeviceInfoData,
  DeviceProfile, DeviceHardwareSpecs
} from './types';
import { AlignmentAlertBanner } from './components/AlignmentAlertBanner';
import { AlignmentDiagnosticsModal } from './components/AlignmentDiagnosticsModal';
import { DeviceStudioDrawer } from './components/DeviceStudioDrawer';
import { FrameTracePanel } from './components/FrameTracePanel';
import { GotoLineModal } from './components/GotoLineModal';
import { LiveMetaInfoPopover } from './components/LiveMetaInfoPopover';
import { LiveResponsiveViewport } from './components/LiveResponsiveViewport';
import { useAgoTimer } from './hooks/useAgoTimer';
import { AiPerformancePromptModal } from './components/dag/AiPerformancePromptModal';
import { NODES_METADATA, type PerformanceDiagnosis } from './types/dag';
import { discernNodePerformance } from './utils/dagDiagnostics';

const env = import.meta.env;
const API_BASE = (() => {
  const u = env.VITE_API_BASE_URL;
  if (!u || u === 'http://127.0.0.1:8000' || u === 'http://localhost:8000') {
    return '';
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
  const [newProject, setNewProject] = useState({ name: '', desc: '', target: 0, deviceProfileId: 'auto', lockDevice: true });
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
  const [traceFrameId, setTraceFrameId] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const { secondsAgo: inspectorAgoSec } = useAgoTimer(streamKey);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState(false);
  const [showDag, setShowDag] = useState(true);
  const [selectedDag, setSelectedDag] = useState<'all' | 'initialize' | 'capture_entire_markdown'>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('init_end');
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
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptModalNodeId, setPromptModalNodeId] = useState<string>('init_end');
  const [serverDiagnosisCache, setServerDiagnosisCache] = useState<Record<string, PerformanceDiagnosis>>({});

  const handleOpenPromptModal = useCallback(async (nodeId: string) => {
    setPromptModalNodeId(nodeId);
    setIsPromptModalOpen(true);
    try {
      const res = await api(`/api/dag/nodes/${nodeId}/root-cause`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          const prompt = data.markdown_prompt || '';
          setServerDiagnosisCache(prev => ({
            ...prev,
            [nodeId]: {
              ...data,
              promptDataUri: 'data:text/markdown;charset=utf-8,' + encodeURIComponent(prompt)
            }
          }));
        }
      }
    } catch {}
  }, []);
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
  const [settingsTab, setSettingsTab] = useState<'pipeline' | 'secrets' | 'security' | 'device'>('pipeline');
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfile[]>([]);
  const [extractedSpecs, setExtractedSpecs] = useState<DeviceHardwareSpecs | null>(null);
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('custom');
  const [deviceModelInput, setDeviceModelInput] = useState('pixel_8');
  const [deviceNameInput, setDeviceNameInput] = useState('Pixel 8 Pro');
  const [targetDpiInput, setTargetDpiInput] = useState<number>(220);
  const [displayWidthInput, setDisplayWidthInput] = useState<number>(1920);
  const [displayHeightInput, setDisplayHeightInput] = useState<number>(1080);
  const [displayIdInput, setDisplayIdInput] = useState<number>(8);
  const [linesPerPageInput, setLinesPerPageInput] = useState<number>(49);
  const [stepSizeInput, setStepSizeInput] = useState<number>(48);
  const [settleDelayInput, setSettleDelayInput] = useState<number>(50);
  const [lockDeviceInput, setLockDeviceInput] = useState<boolean>(false);
  const [hidCtrlKey, setHidCtrlKey] = useState<number>(113);
  const [hidHomeKey, setHidHomeKey] = useState<number>(122);
  const [hidEndKey, setHidEndKey] = useState<number>(123);
  const [hidDownKey, setHidDownKey] = useState<number>(20);
  const [hidRepeatDelay, setHidRepeatDelay] = useState<number>(15);
  const [hidActionSettle, setHidActionSettle] = useState<number>(50);
  const [deviceConfigFeedback, setDeviceConfigFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isApplyingCharacteristics, setIsApplyingCharacteristics] = useState(false);
  const [isSavingDeviceProfile, setIsSavingDeviceProfile] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [autoEnterPin, setAutoEnterPin] = useState(false);
  const [devicePinInput, setDevicePinInput] = useState('1213');
  const [showPinPassword, setShowPinPassword] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [isCheckingPinPrompt, setIsCheckingPinPrompt] = useState(false);
  const [pinPromptStatus, setPinPromptStatus] = useState<{ active: boolean; details?: string; checkedAt?: number } | null>(null);
  const [isEnteringPinManually, setIsEnteringPinManually] = useState(false);
  const [manualPinFeedback, setManualPinFeedback] = useState<{ success: boolean; message: string; timestamp: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'issues'>('all');
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const [frameBoundingBoxes, setFrameBoundingBoxes] = useState<Record<string, FrameBoundingBoxes>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [backendConnected, setBackendConnected] = useState(true);
  const [liveMode, setLiveMode] = useState<'desktop' | 'phone'>('desktop');
  const [inspectorMode, setInspectorMode] = useState<'live' | 'single' | 'spliced'>('live');
  const [splicedScale, setSplicedScale] = useState<number>(100);
  const [splicedFitMode, setSplicedFitMode] = useState<'width' | 'fit'>('width');
  const [splicedRefreshKey, setSplicedRefreshKey] = useState<number>(() => Date.now());
  const [showInspectorMetaPopover, setShowInspectorMetaPopover] = useState(false);
  const [isInfoHovered, setIsInfoHovered] = useState(false);
  const [reprocessingFrameId, setReprocessingFrameId] = useState<string | null>(null);
  const [pipelineMode, setPipelineMode] = useState<'cloud' | 'local'>('local');
  const [deviceModel, setDeviceModel] = useState<'pixel_10' | 'pixel_8'>(() => {
    try { return (localStorage.getItem('mc_target_device_model') as any) || 'pixel_8'; } catch { return 'pixel_8'; }
  });
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfoData | null>(null);
  const [showStudioDrawer, setShowStudioDrawer] = useState(() => {
    try {
      const saved = localStorage.getItem('mc_show_studio_drawer');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [studioInitialTab, setStudioInitialTab] = useState<'kiosk' | 'device' | 'processes' | 'telemetry'>('kiosk');

  const handleOpenStudio = (tab?: 'kiosk' | 'device' | 'processes' | 'telemetry') => {
    if (tab) setStudioInitialTab(tab);
    setShowStudioDrawer(true);
    setStudioMinimized(false);
    try { localStorage.setItem('mc_show_studio_drawer', 'true'); } catch {}
  };

  const handleCloseStudio = () => {
    setShowStudioDrawer(false);
    try { localStorage.setItem('mc_show_studio_drawer', 'false'); } catch {}
  };
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

  // Window & Panel Management States
  const [dagMinimized, setDagMinimized] = useState(false);
  const [studioMinimized, setStudioMinimized] = useState(false);
  const [framesMinimized, setFramesMinimized] = useState(false);
  const [linesMinimized, setLinesMinimized] = useState(false);
  const [inspectorMaximized, setInspectorMaximized] = useState(false);
  const [studioPanelWidth, setStudioPanelWidth] = useState(() => {
    try { return Number(localStorage.getItem('mc_studio_panel_width')) || 460; } catch { return 460; }
  });
  const [isDraggingStudio, setIsDraggingStudio] = useState(false);
  const [studioMaximized, setStudioMaximized] = useState(false);

  // Group Edit / Selection States
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(new Set());
  const [isBatchDeletingFrames, setIsBatchDeletingFrames] = useState(false);
  const [selectedLineNumbers, setSelectedLineNumbers] = useState<Set<number>>(new Set());
  const [isBatchDeletingLines, setIsBatchDeletingLines] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Auto-Fix & Calibrate States
  const [isAutoFixingViewport, setIsAutoFixingViewport] = useState(false);
  const [isRunningCalibration, setIsRunningCalibration] = useState(false);

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
  const isFetchingRef = useRef(false);
  const activeProjectRef = useRef(activeProject);
  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  const lineListRef = useRef<HTMLDivElement>(null);

  const addTelemetryEvent = useCallback((category: TelemetryEvent['category'], message: string, data?: any, dag?: 'initialize' | 'capture_entire_markdown' | 'system' | 'all') => {
    let inferredDag = dag;
    if (!inferredDag) {
      const msg = message.toLowerCase();
      if (msg.includes('init') || msg.includes('calibrat') || msg.includes('ctrl+end') || msg.includes('ctrl+home') || msg.includes('workspace')) {
        inferredDag = 'initialize';
      } else if (category === 'FRAME' || category === 'PACER' || msg.includes('frame') || msg.includes('capture') || msg.includes('ocr')) {
        inferredDag = 'capture_entire_markdown';
      } else {
        inferredDag = 'system';
      }
    }
    setEventsLog(prev => [...prev.slice(-499), { id: `${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), ts: Date.now(), category, message, data, dag: inferredDag }]);
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
      m => { const p = Math.max(20, Math.min(80, startPct + ((m.clientX - startX) / (window.innerWidth - framesPanelWidth - (showStudioDrawer && !studioMinimized ? studioPanelWidth : 0) - 60)) * 100)); setInspectorPercent(p); },
      () => { setIsDraggingSplit(false); try { localStorage.setItem('mc_inspector_split_percent', String(inspectorPercent)); } catch {} }
    );
  };

  const handleStudioResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingStudio(true);
    const startX = e.clientX, startW = studioPanelWidth;
    startDrag(
      m => { const w = Math.max(320, Math.min(850, startW - (m.clientX - startX))); setStudioPanelWidth(w); },
      () => { setIsDraggingStudio(false); try { localStorage.setItem('mc_studio_panel_width', String(studioPanelWidth)); } catch {} }
    );
  };

  const handleSelectSerial = async (serial: string) => {
    try {
      const res = await api('/api/device/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serial }) });
      if (res.ok) {
        const d = await res.json();
        const info = d.device_info || d;
        setDeviceInfo(info);
        if (info?.active_model) {
          const m = info.active_model.toLowerCase();
          setDeviceModel(m.includes('pixel_8') ? 'pixel_8' : 'pixel_10');
        }
        setStreamKey(Date.now());
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
          ? (d.displayName === 'Pixel 8' || d.model.toLowerCase().includes('pixel_8') || d.raw?.toLowerCase().includes('husky') || (pixel8Ip && d.serial === pixel8Ip))
          : (d.displayName === 'Pixel 10' || d.model.toLowerCase().includes('pixel_10') || d.raw?.toLowerCase().includes('mustang') || (pixel10Ip && d.serial === pixel10Ip))
      );
      // Prioritize active connected matchedDevice serial over stale IP
      const targetSerial = matchedDevice?.serial || (dev === 'pixel_8' ? pixel8Ip : pixel10Ip);
      if (targetSerial && targetSerial.includes(':')) {
        if (dev === 'pixel_10') {
          setPixel10Ip(targetSerial);
          localStorage.setItem('mc_pixel_10_address', targetSerial);
        } else {
          setPixel8Ip(targetSerial);
          localStorage.setItem('mc_pixel_8_address', targetSerial);
        }
      }
      await api('/api/device/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_model: dev, serial: targetSerial || undefined })
      });
      const info = await apiJson<DeviceInfoData>('/api/device/info');
      if (info) setDeviceInfo(info);
      setStreamKey(Date.now());
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
    if (!isDocVisibleRef.current || isFetchingRef.current) return;
    isFetchingRef.current = true;
    const t0 = performance.now();
    try {
      const [projRes, docRes, framesRes, queueRes, cfgRes, modeRes, telRes, devRes, alignRes] = await Promise.all([
        api('/api/projects'), api('/api/document'), api('/api/frames'), api('/api/recapture-queue'),
        api('/api/config'), api('/api/pipeline/mode'), api('/api/telemetry'), api('/api/device/info'), api('/api/device/alignment')
      ]);
      setLatencyMs(Math.round(performance.now() - t0));
      const isConnected = projRes.ok || docRes.ok || framesRes.ok || cfgRes.ok || telRes.ok;
      setBackendConnected(isConnected);
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
      if (queueRes.ok) {
        try {
          const q = await queueRes.json();
          if (Array.isArray(q)) setRecaptureQueue(q);
        } catch {}
      }
      if (cfgRes.ok) {
        try {
          const c = await cfgRes.json();
          setApiKeyConfigured(Boolean(c.api_key_configured ?? c.gemini_api_key_configured));
          if (typeof c.auto_enter_pin === 'boolean') setAutoEnterPin(c.auto_enter_pin);
          if (c.device_pin) setDevicePinInput(c.device_pin);
        } catch {}
      }
      if (modeRes.ok) { try { const m = await modeRes.json(); setPipelineMode(m.pipeline_mode); } catch {} }
      if (telRes.ok) { try { setTelemetry(await telRes.json()); } catch {} }
      if (devRes.ok) { try { setDeviceInfo(await devRes.json()); } catch {} }
      if (alignRes.ok) { try { setAlignmentData(await alignRes.json()); } catch {} }
    } catch { setBackendConnected(false); }
    finally { isFetchingRef.current = false; }
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

    setShowDag(true);
    setSelectedDag('all');
    setProjectInitProgress({
      active: true,
      percent: 10,
      stage: 'Creating project and launching DAG Group: Initialize...',
      status: 'running',
      projectName: projName
    });
    addTelemetryEvent('SYSTEM', `Creating project "${projName}" and starting DAG 1 initialization`, null, 'initialize');
    setShowNewProjectModal(false);

    try {
      const selectedProf = deviceProfiles.find(p => p.id === newProject.deviceProfileId);
      const payload: any = {
        name: projName,
        description: newProject.desc,
        target_total_lines: newProject.target,
        lock_device: newProject.lockDevice
      };
      if (selectedProf && selectedProf.id !== 'auto') {
        payload.device_model = selectedProf.model_name || selectedProf.id;
        payload.device_name = selectedProf.display_name || selectedProf.name;
        payload.target_dpi = selectedProf.target_dpi;
        payload.display_width = selectedProf.display_width;
        payload.display_height = selectedProf.display_height;
        payload.display_id = selectedProf.display_id;
        payload.lines_per_page = selectedProf.lines_per_page;
        payload.step_size = selectedProf.step_size;
        payload.hid_config = selectedProf.hid_config;
      }
      const res = await api('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setNewProject({ name: '', desc: '', target: 0, deviceProfileId: 'auto', lockDevice: true });
        await fetchData();
      } else {
        const errData = await res.json().catch(() => ({ detail: 'Failed to create project' }));
        setProjectInitProgress(prev => prev ? ({ ...prev, status: 'error', error: errData.detail || 'Failed to create project', stage: 'Project creation failed' }) : null);
      }
    } catch (e: any) {
      setProjectInitProgress(prev => prev ? ({ ...prev, status: 'error', error: e.message, stage: 'Network error creating project' }) : null);
    }
  };

  const fetchDeviceProfiles = useCallback(async () => {
    try {
      const res = await api('/api/device/profiles');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDeviceProfiles(data);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchDeviceProfiles();
  }, [fetchDeviceProfiles]);

  useEffect(() => {
    if (activeProject) {
      if (activeProject.device_model) setDeviceModelInput(activeProject.device_model);
      if (activeProject.device_name) setDeviceNameInput(activeProject.device_name);
      if (activeProject.target_dpi) setTargetDpiInput(activeProject.target_dpi);
      if (activeProject.display_width) setDisplayWidthInput(activeProject.display_width);
      if (activeProject.display_height) setDisplayHeightInput(activeProject.display_height);
      if (activeProject.display_id !== undefined && activeProject.display_id !== null) setDisplayIdInput(activeProject.display_id);
      if (activeProject.lines_per_page) setLinesPerPageInput(activeProject.lines_per_page);
      if (activeProject.step_size) setStepSizeInput(activeProject.step_size);
      if (activeProject.settle_delay_ms) setSettleDelayInput(activeProject.settle_delay_ms);
      setLockDeviceInput(Boolean(activeProject.lock_device));
      if (activeProject.hid_config) {
        const hc = activeProject.hid_config;
        if (hc.ctrl_key) setHidCtrlKey(hc.ctrl_key);
        if (hc.home_key) setHidHomeKey(hc.home_key);
        if (hc.end_key) setHidEndKey(hc.end_key);
        if (hc.down_key) setHidDownKey(hc.down_key);
        if (hc.repeat_delay_ms) setHidRepeatDelay(hc.repeat_delay_ms);
        if (hc.action_settle_ms) setHidActionSettle(hc.action_settle_ms);
      }
    }
  }, [activeProject?.id]);

  const handleExtractDeviceHardwareSpecs = async () => {
    setIsLoadingSpecs(true);
    setDeviceConfigFeedback(null);
    try {
      const ser = deviceInfo?.active_serial || deviceInfo?.target_serial || '';
      const res = await api(`/api/device/extract-specs${ser ? `?serial=${encodeURIComponent(ser)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data.specs) {
          const sp: DeviceHardwareSpecs = data.specs;
          setExtractedSpecs(sp);
          setDeviceModelInput(sp.model || 'unknown');
          setDeviceNameInput(`${sp.manufacturer || 'Android'} ${sp.model || 'Device'}`.trim());
          setTargetDpiInput(sp.active_dpi || 220);
          setDisplayWidthInput(sp.display_width || 1920);
          setDisplayHeightInput(sp.display_height || 1080);
          setDisplayIdInput(sp.display_id ?? 8);
          setLinesPerPageInput(sp.lines_per_page || 49);
          setStepSizeInput(sp.step_size || 48);
          setSettleDelayInput(sp.settle_delay_ms || 50);
          if (sp.hid_config) {
            setHidCtrlKey(sp.hid_config.ctrl_key || 113);
            setHidHomeKey(sp.hid_config.home_key || 122);
            setHidEndKey(sp.hid_config.end_key || 123);
            setHidDownKey(sp.hid_config.down_key || 20);
            setHidRepeatDelay(sp.hid_config.repeat_delay_ms || 15);
            setHidActionSettle(sp.hid_config.action_settle_ms || 50);
          }
          setDeviceConfigFeedback({ success: true, message: `Hardware specs live-extracted from ${sp.model} (${sp.active_dpi} DPI, ${sp.display_width}x${sp.display_height})` });
        }
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed to extract specs' }));
        setDeviceConfigFeedback({ success: false, message: err.detail || 'Failed to extract hardware specs' });
      }
    } catch (e: any) {
      setDeviceConfigFeedback({ success: false, message: e.message || 'Error extracting hardware specs' });
    } finally {
      setIsLoadingSpecs(false);
    }
  };

  const handleApplyCharacteristicsToDevice = async () => {
    setIsApplyingCharacteristics(true);
    setDeviceConfigFeedback(null);
    try {
      const ser = deviceInfo?.active_serial || deviceInfo?.target_serial || '';
      const res = await api('/api/device/apply-characteristics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: ser,
          target_dpi: Number(targetDpiInput),
          display_id: Number(displayIdInput),
          width: Number(displayWidthInput),
          height: Number(displayHeightInput),
          device_model: deviceModelInput,
          lines_per_page: Number(linesPerPageInput),
          step_size: Number(stepSizeInput),
          settle_delay_ms: Number(settleDelayInput),
          hid_config: {
            ctrl_key: Number(hidCtrlKey),
            home_key: Number(hidHomeKey),
            end_key: Number(hidEndKey),
            down_key: Number(hidDownKey),
            repeat_delay_ms: Number(hidRepeatDelay),
            action_settle_ms: Number(hidActionSettle)
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setDeviceConfigFeedback({ success: true, message: `Characteristics applied: ${data.active_dpi} DPI, ${data.lines_per_page} LPP, factor ${data.dpi_factor}x ✔` });
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed to apply characteristics' }));
        setDeviceConfigFeedback({ success: false, message: err.detail || 'Failed to apply characteristics' });
      }
    } catch (e: any) {
      setDeviceConfigFeedback({ success: false, message: e.message || 'Error applying characteristics' });
    } finally {
      setIsApplyingCharacteristics(false);
    }
  };

  const handleSaveProjectDeviceSettings = async () => {
    if (!activeProject) {
      setDeviceConfigFeedback({ success: false, message: 'No active project selected' });
      return;
    }
    setDeviceConfigFeedback(null);
    try {
      const res = await api(`/api/projects/${activeProject.id}/device-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_model: deviceModelInput,
          device_name: deviceNameInput,
          device_serial: deviceInfo?.active_serial || '',
          target_dpi: Number(targetDpiInput),
          display_width: Number(displayWidthInput),
          display_height: Number(displayHeightInput),
          display_id: Number(displayIdInput),
          lines_per_page: Number(linesPerPageInput),
          step_size: Number(stepSizeInput),
          settle_delay_ms: Number(settleDelayInput),
          lock_device: Boolean(lockDeviceInput),
          hid_config: {
            ctrl_key: Number(hidCtrlKey),
            home_key: Number(hidHomeKey),
            end_key: Number(hidEndKey),
            down_key: Number(hidDownKey),
            repeat_delay_ms: Number(hidRepeatDelay),
            action_settle_ms: Number(hidActionSettle)
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.project) {
          setActiveProject(data.project);
        }
        setDeviceConfigFeedback({ success: true, message: `Project device settings saved (${lockDeviceInput ? '🔒 LOCKED to ' + (deviceNameInput || deviceModelInput) : '🔓 UNLOCKED / Dynamic'})` });
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed to save project device settings' }));
        setDeviceConfigFeedback({ success: false, message: err.detail || 'Failed to update settings' });
      }
    } catch (e: any) {
      setDeviceConfigFeedback({ success: false, message: e.message || 'Error saving settings' });
    }
  };

  const handleToggleProjectLock = async () => {
    if (!activeProject) return;
    const nextLocked = !lockDeviceInput;
    setLockDeviceInput(nextLocked);
    try {
      const res = await api(`/api/projects/${activeProject.id}/lock-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lock_device: nextLocked })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.project) {
          setActiveProject(data.project);
        }
        setDeviceConfigFeedback({
          success: true,
          message: nextLocked ? '🔒 Project locked to this device. DAG runs will enforce exact hardware match.' : '🔓 Project unlocked. DAG runs will dynamically adapt to any connected device.'
        });
        await fetchData();
      }
    } catch {}
  };

  const handleSelectProfilePreset = (profId: string) => {
    setSelectedProfileId(profId);
    if (profId === 'custom') return;
    const p = deviceProfiles.find(x => x.id === profId);
    if (p) {
      setDeviceModelInput(p.model_name || p.id);
      setDeviceNameInput(p.display_name || p.name || p.id);
      if (p.target_dpi) setTargetDpiInput(p.target_dpi);
      if (p.display_width) setDisplayWidthInput(p.display_width);
      if (p.display_height) setDisplayHeightInput(p.display_height);
      if (p.display_id !== undefined && p.display_id !== null) setDisplayIdInput(p.display_id);
      if (p.lines_per_page) setLinesPerPageInput(p.lines_per_page);
      if (p.step_size) setStepSizeInput(p.step_size);
      if (p.settle_delay_ms) setSettleDelayInput(p.settle_delay_ms);
      if (p.hid_config) {
        if (p.hid_config.ctrl_key) setHidCtrlKey(p.hid_config.ctrl_key);
        if (p.hid_config.home_key) setHidHomeKey(p.hid_config.home_key);
        if (p.hid_config.end_key) setHidEndKey(p.hid_config.end_key);
        if (p.hid_config.down_key) setHidDownKey(p.hid_config.down_key);
        if (p.hid_config.repeat_delay_ms) setHidRepeatDelay(p.hid_config.repeat_delay_ms);
        if (p.hid_config.action_settle_ms) setHidActionSettle(p.hid_config.action_settle_ms);
      }
    }
  };

  const handleSaveNewProfile = async () => {
    const profName = prompt('Enter a name for this device profile preset:', deviceNameInput || deviceModelInput);
    if (!profName) return;
    setIsSavingDeviceProfile(true);
    try {
      const profId = profName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const res = await api('/api/device/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profId,
          name: profName,
          display_name: profName,
          model_name: deviceModelInput,
          manufacturer: extractedSpecs?.manufacturer || 'Android',
          serial: deviceInfo?.active_serial || '',
          target_dpi: Number(targetDpiInput),
          display_width: Number(displayWidthInput),
          display_height: Number(displayHeightInput),
          display_id: Number(displayIdInput),
          lines_per_page: Number(linesPerPageInput),
          step_size: Number(stepSizeInput),
          settle_delay_ms: Number(settleDelayInput),
          hid_config: {
            ctrl_key: Number(hidCtrlKey),
            home_key: Number(hidHomeKey),
            end_key: Number(hidEndKey),
            down_key: Number(hidDownKey),
            repeat_delay_ms: Number(hidRepeatDelay),
            action_settle_ms: Number(hidActionSettle)
          }
        })
      });
      if (res.ok) {
        await fetchDeviceProfiles();
        setSelectedProfileId(profId);
        setDeviceConfigFeedback({ success: true, message: `Profile preset "${profName}" saved successfully!` });
      }
    } catch (e: any) {
      setDeviceConfigFeedback({ success: false, message: e.message || 'Failed to save profile' });
    } finally {
      setIsSavingDeviceProfile(false);
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

  const handleDeleteProject = async (id: string, name?: string) => {
    const projName = name || projects.find(p => p.id === id)?.name || id;
    console.log('[App] handleDeleteProject initiated for:', id, projName);
    const ok = await confirm({
      title: 'Delete Project',
      message: `Permanently delete project "${projName}" and all of its captured frames and ledger data?`,
      variant: 'danger',
      confirmText: 'Delete Project'
    });
    console.log('[App] confirm modal result:', ok);
    if (!ok) return;

    try {
      console.log(`[App] Sending DELETE /api/projects/${id}`);
      const res = await api(`/api/projects/${id}`, { method: 'DELETE' });
      console.log(`[App] DELETE /api/projects/${id} response status:`, res.status, res.ok);
      if (res.ok) {
        const delData = await res.json().catch(() => null);
        if (delData?.projects) {
          setProjects(delData.projects);
          setActiveProject(delData.active_project || null);
        } else {
          setProjects(prev => prev.filter(p => p.id !== id));
          if (activeProjectRef.current?.id === id) {
            setActiveProject(null);
          }
        }
        const wasActive = activeProjectRef.current?.id === id || delData?.deleted_project_id === activeProjectRef.current?.id || !delData?.active_project;
        if (wasActive) {
          setFrames([]);
          setSelectedFrameId(null);
          setSelectedFrameIds(new Set());
          setSelectedLineNumbers(new Set());
          setDocumentData({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });
        }
        addTelemetryEvent('SYSTEM', `Deleted project "${projName}" (${id})`);
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed to delete project' }));
        console.error('[App] DELETE failed:', err);
        await showAlert({ title: 'Delete Failed', message: err.detail || 'Failed to delete project.', variant: 'danger' });
      }
    } catch (e: any) {
      console.error('[App] DELETE exception:', e);
      await showAlert({ title: 'Delete Error', message: e.message || 'Network error deleting project.', variant: 'danger' });
    }
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
            addTelemetryEvent('FRAME', `New frame: ${newF.frame_id.slice(0, 8)}`, { frame_id: newF.frame_id, top_line: newF.top_line, bottom_line: newF.bottom_line, page_index: newF.page_index }, 'capture_entire_markdown');
            apiJson<any>('/api/document').then(d => { setDocumentData(d); if (d.token_stats) setTokenStats(d.token_stats); });
          } else if (msg.type === 'frame_deleted') {
            setFrames(p => p.filter(f => f.frame_id !== msg.frame_id));
            addTelemetryEvent('FRAME', `Frame ${msg.frame_id?.slice(0, 8)} deleted`);
          } else if (msg.type === 'frames_purged') {
            setFrames([]);
            setSelectedFrameId(null);
            setSelectedFrameIds(new Set());
          } else if (msg.type === 'project_deleted') {
            if (msg.projects) {
              setProjects(msg.projects);
            } else {
              setProjects(p => p.filter(item => item.id !== msg.project_id));
            }
            if (activeProjectRef.current?.id === msg.project_id || !msg.active_project) {
              setActiveProject(msg.active_project || null);
              if (!msg.active_project) {
                setFrames([]);
                setSelectedFrameId(null);
                setSelectedFrameIds(new Set());
                setSelectedLineNumbers(new Set());
                setDocumentData({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });
              }
            }
          } else if (msg.type === 'project_switched' || msg.type === 'project_updated') {
            setActiveProject(msg.project || null);
            fetchData();
          } else if (msg.type === 'document_updated') {
            const docObj = msg.data || msg.document;
            if (docObj) {
              setDocumentData(docObj);
              if (docObj.token_stats) setTokenStats(docObj.token_stats);
            }
          } else if (msg.type === 'device_selected') {
            const newInfo = msg.device_info || msg.data;
            if (newInfo?.active_serial) {
              setDeviceInfo(newInfo);
              if (newInfo.active_model) {
                const m = newInfo.active_model.toLowerCase();
                setDeviceModel(m.includes('pixel_8') ? 'pixel_8' : 'pixel_10');
              }
            } else {
              apiJson<DeviceInfoData>('/api/device/info').then(info => { if (info) setDeviceInfo(info); });
            }
            setStreamKey(Date.now());
          } else if (msg.type === 'telemetry_updated' && msg.data) {
            setTelemetry(p => ({ ...p, ...msg.data }));
          } else if (msg.type === 'orchestration_event' && msg.telemetry) {
            setTelemetry(msg.telemetry);
          } else if (msg.type === 'frame_processed' && msg.data?.frame_id) {
            setFrames(p => p.map(f => f.frame_id === msg.data.frame_id ? { ...f, ...msg.data } : f));
          } else if (msg.type === 'frame_bounding_boxes' && msg.data?.frame_id) {
            setFrameBoundingBoxes(p => ({ ...p, [msg.data.frame_id]: msg.data.boxes }));
          } else if (msg.type === 'project_init_progress') {
            setShowDag(true);
            setSelectedDag('all');
            setProjectInitProgress(prev => ({
              active: true,
              percent: msg.percent ?? prev?.percent ?? 50,
              stage: msg.stage || prev?.stage || 'Initializing project...',
              status: msg.status || (msg.percent === 100 ? 'completed' : 'running'),
              totalLines: msg.total_lines ?? prev?.totalLines,
              error: msg.error,
              projectName: prev?.projectName
            }));
            addTelemetryEvent('SYSTEM', `[DAG 1 Init] ${msg.stage || 'In progress'} (${msg.percent ?? 50}%)`, msg, 'initialize');
            if (msg.status === 'completed' || msg.percent === 100) {
              fetchData();
            }
          } else if (msg.type === 'dag_telemetry_event' && msg.event) {
            setEventsLog(prev => [...prev.slice(-499), { ...msg.event, ts: Date.now() }]);
          } else if (msg.type === 'key_event_telemetry' && msg.event) {
            const k = msg.event;
            const codes: number[] = Array.isArray(k.keycodes) ? k.keycodes : [];
            const downs = codes.filter((c: number) => c === 20).length;
            const caller = k.caller_node || 'system';
            const isHid = String(k.key_name || '').startsWith('CTRL_');
            const keyDag = caller === 'arrow_down' ? 'capture_entire_markdown' : (isHid ? 'initialize' : 'system');
            setEventsLog(prev => [...prev.slice(-499), {
              id: `ke-${k.id || Date.now()}-${Math.random()}`,
              timestamp: new Date().toLocaleTimeString(),
              ts: Date.now(),
              category: k.navigated_away ? 'ERROR' : 'PACER',
              message: `⌨ ${k.key_name} • ${codes.length} key(s)${downs ? ` (${downs}× ↓)` : ''} • ${k.duration_ms}ms • display #${k.display_id ?? '?'}${k.navigated_away ? ' • ⚠ navigated away' : ''}`,
              dag: keyDag,
              nodeId: caller === 'arrow_down' ? 'arrow_down' : undefined,
              level: k.navigated_away ? 'error' : 'info',
              data: { key_event: k }
            }]);
          } else if (msg.type === 'dag_updated') {
            const dagNodeId = msg.node_id || msg.dag?.current_active_node || 'init_end';
            const devName = deviceInfo?.active_model || (deviceModel === 'pixel_10' ? 'Pixel 10 Pro XL' : 'Pixel 8 Pro');
            if (msg.status === 'error' || msg.error) {
              const errText = typeof msg.error === 'string' ? msg.error : (msg.error?.message || 'Node execution failed');
              setEventsLog(prev => [
                ...prev.slice(-499),
                {
                  id: `${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  ts: Date.now(),
                  category: 'ERROR',
                  message: `${devName}: DAG 1 details of log trace • ${errText}`,
                  dag: 'initialize',
                  device: devName,
                  nodeId: dagNodeId,
                  level: 'error',
                  data: msg.dag_context || msg.dag?.nodes?.[dagNodeId]?.dag_context,
                  traceInsights: msg.trace_insights || msg.dag?.nodes?.[dagNodeId]?.trace_insights,
                  troubleshootingSteps: msg.troubleshooting_steps || msg.dag?.nodes?.[dagNodeId]?.troubleshooting_steps,
                  statusCode: 500
                }
              ]);
            } else if (msg.status === 'completed' && msg.total_lines) {
              setEventsLog(prev => [
                ...prev.slice(-499),
                {
                  id: `${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  ts: Date.now(),
                  category: 'OCR',
                  message: `${devName}: DAG 1 • Calibrated ${Number(msg.total_lines).toLocaleString()} total lines at EOF ✔`,
                  dag: 'initialize',
                  device: devName,
                  nodeId: msg.node_id || 'init_end',
                  level: 'success',
                  data: { total_lines: msg.total_lines }
                }
              ]);
            }
          } else if (msg.type === 'alignment_status') {
            const d = msg.alignment || msg.data;
            if (d) setAlignmentData(d);
          } else if (msg.type === 'config_updated') {
            if (typeof msg.auto_enter_pin === 'boolean') setAutoEnterPin(msg.auto_enter_pin);
            if (msg.device_pin) setDevicePinInput(msg.device_pin);
          } else if (msg.type === 'pin_entry_executed') {
            setManualPinFeedback({
              success: Boolean(msg.success),
              message: msg.message || (msg.success ? 'PIN submitted successfully' : 'PIN entry failed'),
              timestamp: Date.now()
            });
          }
        } catch {}
      };
    };
    connect();
    return () => { ws?.close(); clearTimeout(timer); };
  }, [addTelemetryEvent, fetchData, deviceInfo?.active_model, deviceModel]);

  const handleTogglePipelineMode = async (mode: 'cloud' | 'local') => {
    if (mode === 'cloud' && !apiKeyConfigured) {
      await showAlert({
        title: 'Gemini Cloud Key Required',
        message: 'A Cloud API key has not been configured. Please enter your Gemini API key under Secrets to activate Cloud Pipeline, or continue with Local Pipeline.',
        variant: 'warning'
      });
      setSettingsTab('secrets');
      return;
    }
    setIsSwitchingPipeline(true);
    try {
      const res = await api('/api/pipeline/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      if (res.ok) {
        setPipelineMode((await res.json()).pipeline_mode);
      } else {
        const err = await res.json().catch(() => ({}));
        await showAlert({ title: 'Pipeline Mode Error', message: err.detail || 'Failed to switch pipeline mode', variant: 'danger' });
      }
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
    if (res.ok) {
      setApiKeyConfigured(Boolean(apiKeyInput.trim()));
      setShowConfigModal(false);
      await fetchData();
    }
    else { await showAlert({ title: 'Invalid API Key', message: 'The provided key could not be verified.', variant: 'danger' }); }
  };

  const handleToggleAutoEnterPin = async (enabled: boolean) => {
    try {
      const res = await api('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_enter_pin: enabled })
      });
      if (res.ok) {
        setAutoEnterPin(enabled);
        addTelemetryEvent(
          'SYSTEM',
          enabled
            ? 'Auto Enter PIN ENABLED (Sensitive mode active)'
            : 'Auto Enter PIN DISABLED (Safe Mode: Corporate lockout prevention active)',
          undefined,
          'system'
        );
      } else {
        const err = await res.json().catch(() => ({}));
        await showAlert({ title: 'Config Error', message: err.detail || 'Failed to update PIN setting', variant: 'danger' });
      }
    } catch (e: any) {
      await showAlert({ title: 'Network Error', message: e.message, variant: 'danger' });
    }
  };

  const handleSaveDevicePin = async () => {
    setIsSavingPin(true);
    try {
      const pin = devicePinInput.trim();
      const res = await api('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_pin: pin })
      });
      if (res.ok) {
        addTelemetryEvent('SYSTEM', 'Device PIN updated in secure configuration ✔', undefined, 'system');
        setManualPinFeedback({
          success: true,
          message: 'PIN successfully saved to server config and .env',
          timestamp: Date.now()
        });
      } else {
        const err = await res.json().catch(() => ({}));
        await showAlert({ title: 'Save Failed', message: err.detail || 'Failed to save PIN', variant: 'danger' });
      }
    } catch (e: any) {
      await showAlert({ title: 'Error', message: e.message, variant: 'danger' });
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleCheckPinPromptStatus = async () => {
    setIsCheckingPinPrompt(true);
    try {
      const activeSer = deviceInfo?.active_serial || deviceInfo?.target_serial;
      const url = activeSer ? `/api/security/pin-status?serial=${encodeURIComponent(activeSer)}` : '/api/security/pin-status';
      const res = await api(url);
      if (res.ok) {
        const d = await res.json();
        setPinPromptStatus({
          active: Boolean(d.pin_prompt_active),
          details: d.details || (d.pin_prompt_active ? 'PIN authentication requested' : 'No PIN prompt active'),
          checkedAt: Date.now()
        });
      }
    } catch {
    } finally {
      setIsCheckingPinPrompt(false);
    }
  };

  const handleManualEnterPin = async () => {
    setIsEnteringPinManually(true);
    setManualPinFeedback(null);
    try {
      const activeSer = deviceInfo?.active_serial || deviceInfo?.target_serial;
      const res = await api('/api/security/enter-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: activeSer })
      });
      const d = await res.json();
      setManualPinFeedback({
        success: Boolean(d.success),
        message: d.message || (d.success ? 'PIN submitted successfully' : 'PIN entry failed'),
        timestamp: Date.now()
      });
      addTelemetryEvent(
        'SYSTEM',
        d.success ? `One-shot PIN entered: ${d.message}` : `PIN entry attempt: ${d.message}`,
        undefined,
        'system'
      );
      setTimeout(handleCheckPinPromptStatus, 1500);
    } catch (e: any) {
      setManualPinFeedback({
        success: false,
        message: `Failed to dispatch PIN: ${e.message}`,
        timestamp: Date.now()
      });
    } finally {
      setIsEnteringPinManually(false);
    }
  };

  const handleAutoFixViewport = async () => {
    setIsAutoFixingViewport(true);
    try {
      const res = await api('/api/device/autofix-viewport', { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        setStreamKey(Date.now());
        addTelemetryEvent('SYSTEM', 'Viewport auto-fixed & keyboard closed successfully ✔');
      } else {
        addTelemetryEvent('SYSTEM', d.detail || 'Failed to auto-fix viewport', undefined, 'system');
      }
    } catch (e: any) {
      addTelemetryEvent('SYSTEM', `Error auto-fixing viewport: ${e.message}`, undefined, 'system');
    } finally {
      setIsAutoFixingViewport(false);
    }
  };

  const handleTriggerCalibration = async () => {
    setIsRunningCalibration(true);
    try {
      const activeSer = deviceInfo?.active_serial || deviceInfo?.target_serial;
      const res = await api('/api/dag/groups/initialize/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: activeProject?.id, serial: activeSer })
      });
      let d: any = {};
      const text = await res.text();
      try {
        d = text ? JSON.parse(text) : {};
      } catch {
        d = { message: text || `HTTP ${res.status} ${res.statusText}` };
      }
      if (res.ok) {
        addTelemetryEvent('SYSTEM', 'Triggered Ctrl+End / Ctrl+Home Calibration sequence ✔');
        await fetchData();
      } else {
        const errorMsg = d?.detail?.message || d?.detail || d?.message || d?.error || text || 'Failed to trigger calibration';
        addTelemetryEvent('SYSTEM', errorMsg, undefined, 'system');
      }
    } catch (e: any) {
      addTelemetryEvent('SYSTEM', `Calibration error: ${e.message}`, undefined, 'system');
    } finally {
      setIsRunningCalibration(false);
    }
  };

  const handleToggleSelectFrame = (fid: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedFrameIds(prev => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };

  const handleToggleSelectAllFrames = () => {
    if (selectedFrameIds.size === frames.length) {
      setSelectedFrameIds(new Set());
    } else {
      setSelectedFrameIds(new Set(frames.map(f => f.frame_id)));
    }
  };

  const handleDeleteSelectedFrames = async () => {
    if (selectedFrameIds.size === 0) return;
    const count = selectedFrameIds.size;
    const ok = await confirm({
      title: 'Batch Delete Captured Frames',
      message: `Are you sure you want to permanently delete ${count} selected frame(s)? This will remove their OCR lines from the document.`
    });
    if (!ok) return;

    setIsBatchDeletingFrames(true);
    try {
      const res = await api('/api/frames/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame_ids: Array.from(selectedFrameIds) })
      });
      if (res.ok) {
        setSelectedFrameIds(new Set());
        if (selectedFrameId && selectedFrameIds.has(selectedFrameId)) {
          setSelectedFrameId(null);
        }
        await fetchData();
        addTelemetryEvent('FRAME', `Batch deleted ${count} captured frame(s) ✔`);
      } else {
        await showAlert({ title: 'Error', message: 'Failed to delete selected frames' });
      }
    } catch (err: any) {
      await showAlert({ title: 'Error', message: `Batch delete error: ${err.message}` });
    } finally {
      setIsBatchDeletingFrames(false);
    }
  };

  const handleToggleSelectLine = (ln: number, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedLineNumbers(prev => {
      const next = new Set(prev);
      if (next.has(ln)) next.delete(ln);
      else next.add(ln);
      return next;
    });
  };

  const handleToggleSelectAllLines = () => {
    const allLns = (documentData?.lines || []).map(l => l.line_number);
    if (selectedLineNumbers.size === allLns.length) {
      setSelectedLineNumbers(new Set());
    } else {
      setSelectedLineNumbers(new Set(allLns));
    }
  };

  const handleDeleteSelectedLines = async () => {
    if (selectedLineNumbers.size === 0) return;
    const count = selectedLineNumbers.size;
    const ok = await confirm({
      title: 'Batch Delete Verified Lines',
      message: `Are you sure you want to delete ${count} selected line(s) from the document?`
    });
    if (!ok) return;

    setIsBatchDeletingLines(true);
    try {
      const res = await api('/api/lines/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_numbers: Array.from(selectedLineNumbers) })
      });
      if (res.ok) {
        setSelectedLineNumbers(new Set());
        if (selectedLine && selectedLineNumbers.has(selectedLine.line_number)) {
          setSelectedLine(null);
        }
        await fetchData();
        addTelemetryEvent('SYSTEM', `Batch deleted ${count} line(s) ✔`);
      } else {
        await showAlert({ title: 'Error', message: 'Failed to delete selected lines' });
      }
    } catch (err: any) {
      await showAlert({ title: 'Error', message: `Batch delete error: ${err.message}` });
    } finally {
      setIsBatchDeletingLines(false);
    }
  };

  const sortedFrames = [...frames].sort((a, b) => (a.page_index || 0) - (b.page_index || 0) || (a.created_at || '').localeCompare(b.created_at || '') || (a.top_line || 0) - (b.top_line || 0));
  const activeFrame = frames.find(f => f.frame_id === selectedFrameId) || frames[0] || null;

  const handleCopyPageReport = useCallback(async () => {
    try {
      const res = await api('/api/frames/page-report');
      let reportText = '';
      if (res.ok) {
        reportText = await res.text();
      } else {
        const lines = [
          '# Matrix Capture - Page Line Numbers & Coverage Report',
          `Generated: ${new Date().toLocaleString()}`,
          `Total Captured Frames: ${sortedFrames.length}`,
          `Total Verified Lines: ${documentData.total_lines}`,
          '',
          '## Sequential Page Breakdown'
        ];
        const gaps: string[] = [];
        sortedFrames.forEach((f, idx) => {
          const prev = idx > 0 ? sortedFrames[idx - 1] : null;
          const flags: string[] = [];
          if (prev && prev.bottom_line > 0) {
            if (f.top_line === prev.top_line && f.bottom_line === prev.bottom_line) {
              flags.push('⚠️ DUPLICATE CAPTURE');
            } else if (f.top_line > prev.bottom_line + 1) {
              const gStart = prev.bottom_line + 1;
              const gEnd = f.top_line - 1;
              const gCount = gEnd - gStart + 1;
              flags.push(`⚠️ GAP: Missing Ln ${gStart} → ${gEnd} (${gCount} lines)`);
              gaps.push(`Gap between Pg ${prev.page_index} and Pg ${f.page_index}: Missing Ln ${gStart} → ${gEnd} (${gCount} lines)`);
            } else if (f.top_line <= prev.bottom_line && f.top_line > 0) {
              flags.push(`ℹ️ Overlap: Ln ${f.top_line} → ${prev.bottom_line} (${prev.bottom_line - f.top_line + 1} lines)`);
            }
          }
          const flagStr = flags.length > 0 ? ` [${flags.join(' | ')}]` : '';
          const span = f.bottom_line >= f.top_line && f.top_line > 0 ? f.bottom_line - f.top_line + 1 : 0;
          lines.push(`- Page ${f.page_index}: Ln ${f.top_line} → ${f.bottom_line} (${span} lines)${flagStr}`);
        });
        lines.push('', '## Gaps Summary');
        if (gaps.length === 0) {
          lines.push('✔ No gaps detected between consecutive captured pages.');
        } else {
          gaps.forEach((g, i) => lines.push(`${i + 1}. ${g}`));
        }
        reportText = lines.join('\n');
      }
      await navigator.clipboard.writeText(reportText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    } catch (e) {
      console.error('Failed to copy page report:', e);
    }
  }, [sortedFrames, documentData]);

  const filteredLines = (documentData?.lines || []).filter(l => {
    if (filterMode === 'issues' && l.status !== 'issue' && l.status !== 'gap' && l.status !== 'missing' && l.status !== 'unaligned' && l.status !== 'flagged') return false;
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
  const lastCaptured = sortedFrames[sortedFrames.length - 1];
  const lastCapturedLine = lastCaptured?.bottom_line || telemetry?.current_bottom_line || 0;
  const devLines = (() => {
    // 1. If actual line number at last line of page last captured exists, use it
    if (lastCapturedLine > 0) {
      return lastCapturedLine;
    }
    // 2. Dynamically calculate based on DPI change or profile
    if (telemetry?.capture_telemetry?.active_dpi) {
      const dpi = telemetry.capture_telemetry.active_dpi;
      return Math.max(20, Math.round(49 * (160 / dpi)));
    }
    if (deviceInfo?.profile?.lines_per_page) {
      return deviceInfo.profile.lines_per_page;
    }
    return deviceModel === 'pixel_8' ? 40 : 49;
  })();

  return (
    <div className="studio-root" data-testid="matrix-capture-studio">
      <header className="studio-header">
        <div className="header-left">
          <div className="brand-group">
            <span className="brand-dot" />
            <h1 className="brand-title">Matrix Capture</h1>
            <span className="brand-tag">v2.5 Studio</span>
          </div>
          <div className="project-badge" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title={activeProject?.description ? `File: ${activeProject.description}` : (activeProject?.name || 'Select Project')}>
            <FolderKanban size={13} color="#00ff9d" />
            <span className="project-badge-name">
              {activeProject ? (
                <>
                  {activeProject.name}
                  {activeProject.description && (
                    <span style={{ fontSize: '11px', color: '#8b949e', fontWeight: 400, marginLeft: '6px' }}>
                      ({activeProject.description})
                    </span>
                  )}
                </>
              ) : 'Select Project'}
            </span>
            <ChevronDown size={11} />
          </div>
          {activeProject && (
            <button
              type="button"
              className="btn-text-danger"
              onClick={e => { e.stopPropagation(); handleDeleteProject(activeProject.id, activeProject.name); }}
              title={`Delete active project "${activeProject.name}"`}
              aria-label={`Delete active project ${activeProject.name}`}
              style={{ padding: '4px 6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        <div className="header-center">
          <div className="device-selector-wrapper" ref={deviceDropdownRef}>
            <button
              className={`device-selector-btn ${showStudioDrawer && studioInitialTab === 'device' && !studioMinimized ? 'open' : ''} ${!isCurrentDeviceConnected ? 'unavailable' : ''}`}
              onClick={() => handleOpenStudio('device')}
              title="Select connected Android device & configure wireless ADB in Studio"
            >
              <div className={`device-status-dot ${isCurrentDeviceConnected ? 'online' : 'offline'}`} />
              <Smartphone size={13} color={isCurrentDeviceConnected ? 'var(--color-primary)' : '#ef4444'} />
              <span style={{ fontWeight: 700 }}>{devDisplayName}</span>
              <span className="device-spec">({devLines}L)</span>
            </button>
          </div>

          <div className="window-dock-bar">
            <button
              type="button"
              className={`window-dock-pill ${showDag ? 'active' : ''} ${dagMinimized ? 'minimized' : ''}`}
              onClick={() => {
                if (!showDag) { setShowDag(true); setDagMinimized(false); }
                else setDagMinimized(p => !p);
              }}
              title="Toggle / Minimize / Restore Flow DAG window"
            >
              <Layers size={11} />
              <span>DAG {showDag ? (dagMinimized ? '▲' : '●') : '○'}</span>
            </button>
            <button
              type="button"
              className={`window-dock-pill ${showStudioDrawer ? 'active' : ''} ${studioMinimized ? 'minimized' : ''}`}
              onClick={() => {
                if (!showStudioDrawer) handleOpenStudio();
                else setStudioMinimized(p => !p);
              }}
              title="Toggle / Minimize / Restore Device & Kiosk Studio workspace"
            >
              <Monitor size={11} />
              <span>Studio {showStudioDrawer ? (studioMinimized ? '▲' : '●') : '○'}</span>
            </button>
            <button
              type="button"
              className={`window-dock-pill ${showStudioDrawer && studioInitialTab === 'telemetry' && !studioMinimized ? 'active' : ''}`}
              onClick={() => handleOpenStudio('telemetry')}
              title="Open Live Telemetry & Structured Logs in Studio"
            >
              <Activity size={11} />
              <span>Telemetry</span>
            </button>
            <button
              type="button"
              className={`window-dock-pill ${showStudioDrawer && studioInitialTab === 'kiosk' && !studioMinimized ? 'active' : ''}`}
              onClick={() => {
                setLiveMode('desktop');
                setStreamKey(Date.now());
                handleOpenStudio('kiosk');
              }}
              title="Open Phone Live Screen Stream in Studio"
            >
              <Smartphone size={11} />
              <span>Phone Stream</span>
            </button>
            <button
              type="button"
              className={`window-dock-pill ${!framesMinimized ? 'active' : ''} ${framesMinimized ? 'minimized' : ''}`}
              onClick={() => setFramesMinimized(p => !p)}
              title="Toggle Captured Frames Panel"
            >
              <Camera size={11} />
              <span>Frames {!framesMinimized ? '●' : '▲'}</span>
            </button>
            <button
              type="button"
              className={`window-dock-pill ${!linesMinimized ? 'active' : ''} ${linesMinimized ? 'minimized' : ''}`}
              onClick={() => setLinesMinimized(p => !p)}
              title="Toggle Verified Lines Panel"
            >
              <Search size={11} />
              <span>Lines {!linesMinimized ? '●' : '▲'}</span>
            </button>
          </div>

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

      {showDag && (
        <div style={{ padding: '0 20px 6px 20px', position: 'relative', zIndex: 100 }}>
          <FlowDag
            apiBase={API_BASE}
            activeProjectId={activeProject?.id}
            activeProject={activeProject}
            onOpenSettings={(tab) => { if (tab) setSettingsTab(tab as any); setShowConfigModal(true); }}
            activeDeviceSerial={deviceInfo?.active_serial}
            currentTopLine={telemetry.current_top_line !== undefined ? telemetry.current_top_line : (documentData.min_line ?? 0)}
            currentBottomLine={telemetry.current_bottom_line !== undefined ? telemetry.current_bottom_line : (documentData.max_line ?? 0)}
            targetTotalLines={activeProject?.target_total_lines || telemetry.target_total_lines || 0}
            currentPage={telemetry.current_page || frames.length || 1}
            isOrchestrating={Boolean(telemetry.phase?.startsWith('DAG_') || projectInitProgress?.status === 'running')}
            onRefresh={fetchData}
            selectedDag={selectedDag}
            onSelectDag={setSelectedDag}
            selectedNodeId={selectedNodeId}
            onSelectNodeId={setSelectedNodeId}
            projectInitProgress={projectInitProgress}
            onDismissInitProgress={() => setProjectInitProgress(null)}
            onRetryInit={async () => {
              setProjectInitProgress(curr => curr ? ({ ...curr, percent: 15, stage: 'Retrying DAG Group: Initialize...', status: 'running', error: undefined }) : null);
              try {
                const activeSer = deviceInfo?.active_serial || deviceInfo?.target_serial;
                await api('/api/dag/groups/initialize/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: activeProject?.id, serial: activeSer }) });
              } catch {}
            }}
            eventsLog={eventsLog}
            onClose={() => setShowDag(false)}
            isMinimized={dagMinimized}
            onToggleMinimize={() => setDagMinimized(p => !p)}
          />
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
                        {p.id === activeProject?.id && <span className="active-badge">ACTIVE</span>}
                      </div>
                      <button
                        type="button"
                        className="btn-text-danger"
                        onClick={e => { e.stopPropagation(); handleDeleteProject(p.id, p.name); }}
                        title={`Delete project "${p.name}"`}
                        aria-label={`Delete project ${p.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {p.description && (
                      <div style={{ fontSize: '11px', color: '#58a6ff', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.description}>
                        File: {p.description}
                      </div>
                    )}
                    <div className="project-stats" style={{ marginTop: p.description ? '3px' : undefined }}>
                      <span>{p.frame_count ?? 0} frames</span>
                      <span>•</span>
                      <span>{p.line_count ?? 0} lines</span>
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
            {framesMinimized ? (
              <aside
                className="window-minimized-rail"
                onClick={() => setFramesMinimized(false)}
                title={`Click to restore Captured Frames panel (${frames.length} frames)`}
              >
                <Camera size={15} color="#00ff9d" />
                {frames.length > 0 && (
                  <span style={{
                    fontSize: '9px', fontWeight: 800, color: '#00ff9d',
                    background: 'rgba(0, 255, 157, 0.15)', border: '1px solid rgba(0, 255, 157, 0.3)',
                    borderRadius: '10px', padding: '2px 4px', lineHeight: 1
                  }}>
                    {frames.length}
                  </span>
                )}
                <Maximize2 size={12} style={{ marginTop: 'auto' }} />
              </aside>
            ) : !inspectorMaximized ? (
              <>
                <aside className="frames-feed-panel" style={{ width: `${framesPanelWidth}px`, flexShrink: 0 }}>
                  <div className="panel-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={sortedFrames.length > 0 && selectedFrameIds.size === sortedFrames.length}
                        onChange={handleToggleSelectAllFrames}
                        title="Select or deselect all frames"
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Captured Frames ({frames.length})</span>
                      {selectedFrameIds.size > 0 && (
                        <button
                          type="button"
                          className="btn btn-danger-group"
                          onClick={handleDeleteSelectedFrames}
                          disabled={isBatchDeletingFrames}
                          title="Delete selected frames"
                        >
                          <Trash2 size={10} />
                          <span>Delete ({selectedFrameIds.size})</span>
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${copyFeedback ? 'btn-success' : 'btn-outline'}`}
                        onClick={handleCopyPageReport}
                        title="Copy page line numbers & gap coverage report to clipboard"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '11px' }}
                      >
                        {copyFeedback ? <Check size={11} color="#00ff9d" /> : <Copy size={11} />}
                        <span>{copyFeedback ? 'Copied' : 'Report'}</span>
                      </button>
                      {frames.some(f => f.status.startsWith('error')) && (
                        <button className="btn btn-sm btn-outline btn-warning-outline" onClick={handleReprocessAllFailed}>
                          <RotateCw size={11} /> Retry Failed
                        </button>
                      )}
                      <div className="window-controls">
                        <button
                          type="button"
                          className="win-btn"
                          onClick={() => setFramesMinimized(true)}
                          title="Minimize frames panel"
                        >
                          <Minus size={11} />
                        </button>
                      </div>
                    </div>
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
                      const isSelected = selectedFrameIds.has(f.frame_id);
                      return (
                        <div key={f.frame_id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {hasGap && <div className="gap-alert-tag"><AlertCircle size={11} /><span>Gap: missing Ln {prevFrame.bottom_line + 1} → {f.top_line - 1}</span></div>}
                          <div className={`frame-card ${selectedFrameId === f.frame_id ? 'active' : ''} ${isSelected ? 'selected-for-edit' : ''} ${f.status.startsWith('error') ? 'frame-error' : ''}`} onClick={() => setSelectedFrameId(f.frame_id)}>
                            <div className="frame-card-preview">
                              <input
                                type="checkbox"
                                className="frame-card-checkbox"
                                checked={isSelected}
                                onChange={(e) => handleToggleSelectFrame(f.frame_id, e)}
                                onClick={(e) => e.stopPropagation()}
                                title="Select frame for group operations"
                              />
                              <img src={`${API_BASE}/api/frames/${f.frame_id}/image?t=${encodeURIComponent(f.created_at || '')}`} alt={f.frame_id} />
                              <span className="frame-badge">Pg {f.page_index}</span>
                              {f.token_usage && f.token_usage.total_tokens > 0 && <span className="frame-token-badge"><Coins size={9} /> {f.token_usage.total_tokens}</span>}
                              <button className="frame-card-delete-overlay" onClick={(e) => handleDeleteFrame(f.frame_id, e)} disabled={deletingFrameId === f.frame_id} title="Delete frame"><Trash2 size={12} /></button>
                              <button
                                type="button"
                                id={`frame-trace-btn-${f.frame_id.slice(0, 8)}`}
                                className="frame-card-delete-overlay"
                                style={{ left: '40px', borderColor: 'rgba(0, 255, 157, 0.45)', color: '#00ff9d' }}
                                onClick={(e) => { e.stopPropagation(); setSelectedFrameId(f.frame_id); setTraceFrameId(f.frame_id); }}
                                title="View detailed event trace (key presses, DAG events) for this capture"
                              ><ListTree size={12} /></button>
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
              </>
            ) : null}

            <main className="frame-inspector-panel" style={{ flex: inspectorMaximized ? '1 1 100%' : `${inspectorPercent} 1 0`, minWidth: '220px' }}>
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
                      <div
                        style={{ position: 'relative', display: 'inline-flex' }}
                        onMouseEnter={() => setIsInfoHovered(true)}
                        onMouseLeave={() => setIsInfoHovered(false)}
                      >
                        <button
                          type="button"
                          className={`live-info-btn ${showInspectorMetaPopover || isInfoHovered ? 'active' : ''}`}
                          onClick={() => setShowInspectorMetaPopover(p => !p)}
                          title="View live metadata details (Hover for quick attributes, Click for full details)"
                        >
                          <Info size={11} />
                          <span>INFO</span>
                        </button>

                        {/* Anchored dynamic hover box for INFO button */}
                        {isInfoHovered && !showInspectorMetaPopover && (
                          <div
                            className="live-info-dynamic-hover-box"
                            style={{
                              position: 'absolute',
                              top: 'calc(100% + 6px)',
                              right: 0,
                              width: '320px',
                              background: 'linear-gradient(180deg, #131923 0%, #0d1117 100%)',
                              border: '1.5px solid #58a6ff',
                              borderRadius: '8px',
                              boxShadow: '0 12px 32px rgba(0,0,0,0.85), 0 0 20px rgba(88, 166, 255, 0.3)',
                              padding: '10px 12px',
                              zIndex: 1200,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              fontFamily: 'var(--font-mono, monospace)',
                              pointerEvents: 'auto'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Info size={13} color="#58a6ff" />
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#f0f6fc' }}>LIVE DESKTOP METADATA</span>
                              </div>
                              <span style={{ fontSize: '9px', color: '#00ff9d', fontWeight: 700 }}>
                                {inspectorAgoSec <= 1 ? 'LIVE' : `${inspectorAgoSec}s ago`}
                              </span>
                            </div>

                            <div style={{ fontSize: '10px', color: '#8b949e', display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '5px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Display Mode:</span>
                                <strong style={{ color: '#fff' }}>Desktop 1080p @ 60Hz</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Top Gutter:</span>
                                <strong style={{ color: '#22c55e' }}>▲ Line #{alignmentData?.first_line_number || telemetry.current_top_line || 1}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Bottom Gutter:</span>
                                <strong style={{ color: '#ef4444' }}>▼ Line #{alignmentData?.last_line_number || telemetry.current_bottom_line || 50}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Alignment:</span>
                                <strong style={{ color: alignmentData?.is_aligned ? '#00ff9d' : '#ffa657' }}>
                                  {alignmentData?.is_aligned ? 'TEAMS ALIGNED ✔' : 'AUTO-ALIGNING...'}
                                </strong>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setShowInspectorMetaPopover(true); setIsInfoHovered(false); }}
                                style={{
                                  background: 'rgba(88, 166, 255, 0.15)', border: '1px solid #58a6ff', color: '#58a6ff',
                                  padding: '3px 8px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                                }}
                              >
                                Open Full Details
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleAutoFixViewport(); }}
                                style={{
                                  background: 'rgba(0, 255, 157, 0.12)', border: '1px solid #00ff9d', color: '#00ff9d',
                                  padding: '3px 8px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                                }}
                              >
                                Auto-Fix Viewport
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <button className="btn btn-sm btn-outline" onClick={() => setStreamKey(Date.now())} style={{ padding: '2px 8px', fontSize: '10px' }}><RefreshCw size={11} /></button>
                    </>
                  )}
                  {inspectorMode === 'single' && activeFrame && (
                    <button className="btn-scan-ocr" onClick={handleScanFrameOcr} disabled={isScanningOcr}><Scan size={13} className={isScanningOcr ? 'spinning' : ''} /><span>{isScanningOcr ? 'Scanning...' : 'OCR Scan'}</span></button>
                  )}
                  {scanStatusMsg && <span className="scan-status-pill">{scanStatusMsg}</span>}
                  <div className="window-controls">
                    <button
                      type="button"
                      className="win-btn"
                      onClick={() => setInspectorMaximized(p => !p)}
                      title={inspectorMaximized ? "Restore view layout" : "Maximize live desktop view"}
                    >
                      {inspectorMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="inspector-view-container">
                {inspectorMode === 'live' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#161b22', borderBottom: '1px solid #30363d', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Monitor size={14} color="#00ff9d" />
                        <span style={{ fontSize: '11px', color: '#00ff9d', fontFamily: 'monospace', fontWeight: 700 }}>LIVE DESKTOP · MARKDOWN VIEW</span>
                      </div>

                      {/* Yellow Arrow 1 Target: Actuator Progress */}
                      <div className="actuator-progress-bar">
                        <Activity size={12} color="#00ff9d" />
                        <span>Actuator Progress:</span>
                        <strong style={{ color: '#ffa657' }}>
                          Capturing page {telemetry.current_page || frames.length || 1} (Target Top: Ln {telemetry.current_bottom_line ? telemetry.current_bottom_line + 1 : (documentData.max_line ? documentData.max_line + 1 : 50)} of {activeProject?.target_total_lines || telemetry.target_total_lines || 9953})
                        </strong>
                      </div>

                      {/* Yellow Arrow 2 Target + Rename AI Boxes to Content Framing */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline btn-autofix"
                          onClick={handleAutoFixViewport}
                          disabled={isAutoFixingViewport}
                          title="Auto-fix desktop viewport layout & suppress software keyboard"
                        >
                          <Zap size={11} className={isAutoFixingViewport ? 'spin' : ''} />
                          <span>{isAutoFixingViewport ? 'Fixing...' : 'AUTO-FIX VIEWPORT'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            setShowDag(true);
                            setDagMinimized(false);
                            setSelectedDag('capture_entire_markdown');
                            setSelectedNodeId('verify_trigger');
                          }}
                          title="Configure Node 6 Verification Trigger & Qualifiers"
                          style={{ padding: '2px 8px', height: '24px', fontSize: '10px' }}
                        >
                          <Sliders size={11} />
                          <span>Configure Trigger (Node 6)</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={handleTriggerCalibration}
                          disabled={isRunningCalibration}
                          title="Run EOF / SOF calibration sequence"
                          style={{ padding: '2px 10px', height: '24px', fontSize: '10px' }}
                        >
                          <RefreshCw size={11} className={isRunningCalibration ? 'spin' : ''} />
                          <span>{isRunningCalibration ? 'Calibrating...' : 'Run Ctrl+End / Ctrl+Home Calibrate'}</span>
                        </button>
                        <button
                          type="button"
                          className={`live-ai-boxes-btn ${showBoundingBoxes ? 'active' : ''}`}
                          onClick={() => setShowBoundingBoxes(p => !p)}
                          style={{ padding: '2px 8px', height: '24px', fontSize: '10px' }}
                          title="Toggle Content Framing Overlays"
                        >
                          {showBoundingBoxes ? <Eye size={10} /> : <EyeOff size={10} />}
                          <span>CONTENT FRAMING</span>
                        </button>
                      </div>
                    </div>
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <LiveResponsiveViewport
                        streamUrl={`${API_BASE}/api/device/stream?mode=${liveMode}&serial=${encodeURIComponent(deviceInfo?.active_serial || '')}&t=${streamKey}`}
                        fallbackUrl={`${API_BASE}/api/device/screen?mode=${liveMode}&serial=${encodeURIComponent(deviceInfo?.active_serial || '')}&t=${streamKey}`}
                        liveMode={liveMode}
                        alignmentData={alignmentData}
                        showBoundingBoxes={showBoundingBoxes}
                        deviceInfo={deviceInfo}
                        metaResolution={alignmentData?.resolution}
                        onRefreshStream={() => setStreamKey(Date.now())}
                        topCallout={
                          <div className="gutter-line-callout top">
                            <span className="gutter-callout-icon">▲</span>
                            <span className="gutter-callout-label">TOP GUTTER:</span>
                            <span className="gutter-callout-value">
                              {alignmentData.first_line_number || telemetry.current_top_line ? `Line #${alignmentData.first_line_number || telemetry.current_top_line}` : 'Detecting...'}
                            </span>
                          </div>
                        }
                        bottomCallout={
                          <div className="gutter-line-callout bottom">
                            <span className="gutter-callout-icon">▼</span>
                            <span className="gutter-callout-label">BOTTOM GUTTER:</span>
                            <span className="gutter-callout-value">
                              {alignmentData.last_line_number || telemetry.current_bottom_line ? `Line #${alignmentData.last_line_number || telemetry.current_bottom_line}` : 'Detecting...'}
                            </span>
                          </div>
                        }
                      />
                    </div>
                  </div>
                ) : inspectorMode === 'spliced' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#161b22', borderBottom: '1px solid #30363d', zIndex: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={14} color="#00ff9d" />
                        <span style={{ fontSize: '11px', color: '#00ff9d', fontFamily: 'monospace', fontWeight: 700 }}>
                          SPLICED CANVAS · {frames.length} FRAMES
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* View Mode: Fit Width vs Fit Page */}
                        <div style={{ display: 'inline-flex', background: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', overflow: 'hidden' }}>
                          <button
                            type="button"
                            onClick={() => { setSplicedFitMode('width'); setSplicedScale(100); }}
                            className={`btn btn-xs ${splicedFitMode === 'width' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: 0, fontWeight: 600 }}
                            title="Scale to full container width preserving aspect ratio (Vertical scroll)"
                          >
                            FIT WIDTH
                          </button>
                          <button
                            type="button"
                            onClick={() => setSplicedFitMode('fit')}
                            className={`btn btn-xs ${splicedFitMode === 'fit' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: 0, fontWeight: 600 }}
                            title="Fit full document height into window"
                          >
                            FIT PAGE
                          </button>
                        </div>

                        {/* Zoom Out */}
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => setSplicedScale(prev => Math.max(50, prev - 15))}
                          disabled={splicedFitMode === 'fit'}
                          title="Zoom Out"
                          style={{ height: '22px', width: '24px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ZoomOut size={11} />
                        </button>

                        {/* Zoom Indicator / Reset to 100% */}
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => setSplicedScale(100)}
                          disabled={splicedFitMode === 'fit'}
                          title="Reset zoom to 100%"
                          style={{ height: '22px', fontSize: '10px', padding: '0 6px', fontFamily: 'monospace', minWidth: '42px', textAlign: 'center' }}
                        >
                          {splicedFitMode === 'fit' ? 'AUTO' : `${splicedScale}%`}
                        </button>

                        {/* Zoom In */}
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => setSplicedScale(prev => Math.min(250, prev + 15))}
                          disabled={splicedFitMode === 'fit'}
                          title="Zoom In"
                          style={{ height: '22px', width: '24px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ZoomIn size={11} />
                        </button>

                        {/* Refresh Spliced Document Image */}
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => setSplicedRefreshKey(Date.now())}
                          title="Refresh Spliced Document View"
                          style={{ height: '22px', width: '24px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <RefreshCw size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Scrollable container displaying full-width spliced image with natural aspect ratio */}
                    <div
                      className="spliced-canvas-scroll-container"
                      style={{
                        flex: 1,
                        width: '100%',
                        height: 'calc(100% - 35px)',
                        overflowY: 'auto',
                        overflowX: splicedScale > 100 ? 'auto' : 'hidden',
                        background: '#0d1117',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: splicedFitMode === 'fit' ? 'center' : 'flex-start',
                        padding: 0
                      }}
                    >
                      <img
                        src={`${API_BASE}/api/spliced-document-image?t=${splicedRefreshKey}_${frames.length}_${frames[frames.length - 1]?.created_at || ''}`}
                        alt="Spliced Document Canvas"
                        style={{
                          width: splicedFitMode === 'width' ? `${splicedScale}%` : 'auto',
                          maxWidth: splicedFitMode === 'fit' ? '100%' : 'none',
                          maxHeight: splicedFitMode === 'fit' ? 'calc(100vh - 180px)' : 'none',
                          height: 'auto',
                          display: 'block',
                          objectFit: 'contain',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                          transition: 'width 0.12s ease'
                        }}
                      />
                    </div>
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

            {!inspectorMaximized ? (
              <>
                <div className={`panel-resizer ${isDraggingSplit ? 'dragging' : ''}`} onMouseDown={handleSplitResizer} onDoubleClick={() => setInspectorPercent(48)} role="separator"><div className="panel-resizer-line" /></div>

                {linesMinimized ? (
                  <aside
                    className="window-minimized-rail"
                    onClick={() => setLinesMinimized(false)}
                    title="Click to restore Verified Lines panel"
                  >
                    <Search size={14} color="#00ff9d" />
                    <span className="minimized-rail-label">VERIFIED LINES ({filteredLines.length})</span>
                    <Maximize2 size={12} style={{ marginTop: 'auto' }} />
                  </aside>
                ) : (
                  <section className="line-inspector-panel" style={{ flex: `${100 - inspectorPercent} 1 0`, minWidth: '240px' }}>
                    <div className="panel-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={filteredLines.length > 0 && selectedLineNumbers.size === filteredLines.length}
                          onChange={handleToggleSelectAllLines}
                          title="Select or deselect all lines"
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Verified Lines ({filteredLines.length})</span>
                        {selectedLineNumbers.size > 0 && (
                          <button
                            type="button"
                            className="btn btn-danger-group"
                            onClick={handleDeleteSelectedLines}
                            disabled={isBatchDeletingLines}
                            title="Delete selected lines"
                          >
                            <Trash2 size={10} />
                            <span>Delete ({selectedLineNumbers.size})</span>
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button className={`btn btn-sm ${filterMode === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterMode('all')}>All ({documentData.total_lines})</button>
                        <button className={`btn btn-sm ${filterMode === 'issues' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterMode('issues')}>Issues ({documentData.issue_count})</button>
                        <button
                          type="button"
                          className={`btn btn-sm ${copyFeedback ? 'btn-success' : 'btn-outline'}`}
                          onClick={handleCopyPageReport}
                          title="Copy page line numbers & gap coverage report to clipboard"
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '11px' }}
                        >
                          {copyFeedback ? <Check size={11} color="#00ff9d" /> : <Copy size={11} />}
                          <span>{copyFeedback ? 'Copied' : 'Page Report'}</span>
                        </button>
                        <div className="window-controls">
                          <button
                            type="button"
                            className="win-btn"
                            onClick={() => setLinesMinimized(true)}
                            title="Minimize lines panel"
                          >
                            <Minus size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="filter-bar"><Search size={14} color="#8b949e" /><input type="text" className="search-input" placeholder="Search lines..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
                    <div className="lines-table-container" ref={lineListRef} style={{ paddingBottom: isTelemetryExpanded ? '340px' : '40px' }}>
                      {filteredLines.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: '#6e7681' }}><p>No lines transcribed yet.</p></div> : (
                        <table className="clean-lines-table">
                          <thead>
                            <tr>
                              <th className="th-select">
                                <input
                                  type="checkbox"
                                  checked={filteredLines.length > 0 && selectedLineNumbers.size === filteredLines.length}
                                  onChange={handleToggleSelectAllLines}
                                />
                              </th>
                              <th className="th-line-num">Line #</th>
                              <th className="th-line-text">text</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredLines.map(line => {
                              const isSelected = selectedLineNumbers.has(line.line_number);
                              const isGap = line.status === 'gap' || line.status === 'missing';
                              return (
                                <tr
                                  key={line.line_number}
                                  className={`table-line-row ${line.status} ${selectedLine?.line_number === line.line_number ? 'selected' : ''} ${isSelected ? 'selected-for-edit' : ''}`}
                                  onClick={() => { setSelectedLine(line); if (line.frame_id && line.frame_id !== 'manual') setSelectedFrameId(line.frame_id); }}
                                >
                                  <td className="td-select" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      className="line-select-checkbox"
                                      checked={isSelected}
                                      onChange={(e) => handleToggleSelectLine(line.line_number, e)}
                                    />
                                  </td>
                                  <td className="td-line-num">
                                    {isGap ? (
                                      <span style={{ color: '#f85149', fontWeight: 700 }}>{line.gutter_number || line.line_number}</span>
                                    ) : (
                                      <>{line.gutter_number || line.line_number}{line.is_wrapped && <span className="wrap-tag"> ↵</span>}</>
                                    )}
                                  </td>
                                  <td className="td-line-text">
                                    {isGap ? (
                                      <span className="gap-line-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f85149', fontStyle: 'italic', fontSize: '11px', fontWeight: 600 }}>
                                        <AlertCircle size={11} color="#f85149" />
                                        <span>[GAP: Line #{line.line_number} Missing — Not Captured in Paging]</span>
                                      </span>
                                    ) : (
                                      <pre className="table-code-text">{line.text || <span className="blank-line-tag">(blank line)</span>}</pre>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </section>
                )}
              </>
            ) : null}
          </>
        ) : (
          <main className="frame-inspector-panel standby-workspace-hub" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'radial-gradient(ellipse at 50% 20%, rgba(22, 27, 34, 0.95) 0%, #0d1117 80%)' }}>
            <div className="standby-hub-container" style={{ maxWidth: '880px', margin: 'auto', padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: '28px', width: '100%' }}>
              
              {/* Top Banner */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #30363d', paddingBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00ff9d', boxShadow: '0 0 10px #00ff9d' }} />
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#f0f6fc', margin: 0, letterSpacing: '-0.3px' }}>
                      Matrix Capture Studio
                    </h2>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', background: 'rgba(0, 255, 157, 0.12)', border: '1px solid rgba(0, 255, 157, 0.3)', color: '#00ff9d' }}>
                      Device &amp; Telemetry Active
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#8b949e', margin: 0, lineHeight: 1.5 }}>
                    Real-time phone inspection, external display streaming, and live pipeline telemetry are ready without needing a project.
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowNewProjectModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600 }}
                >
                  <Plus size={15} />
                  <span>Create Project</span>
                </button>
              </div>

              {/* Status Summary Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <Smartphone size={13} color={isCurrentDeviceConnected ? '#00ff9d' : '#ff7b72'} />
                    <span>Target Device</span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#e6edf3' }}>
                    {devDisplayName}
                  </div>
                  <div style={{ fontSize: '11px', color: isCurrentDeviceConnected ? '#00ff9d' : '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCurrentDeviceConnected ? '#00ff9d' : '#8b949e' }} />
                    {isCurrentDeviceConnected ? (deviceInfo?.active_serial || 'Connected') : 'Offline / Disconnected'}
                  </div>
                </div>

                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <Monitor size={13} color="#58a6ff" />
                    <span>Display Mode</span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#e6edf3' }}>
                    {liveMode === 'desktop' ? 'External Desktop (1080p)' : 'Phone Mirror'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8b949e' }}>
                    SurfaceFlinger stream active
                  </div>
                </div>

                <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <Activity size={13} color="#bc8cff" />
                    <span>Telemetry Stream</span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#e6edf3' }}>
                    {wsConnected ? 'WebSocket Live' : 'HTTP Polling'}
                  </div>
                  <div style={{ fontSize: '11px', color: wsConnected ? '#00ff9d' : '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{latencyMs}ms roundtrip</span>
                    <span>•</span>
                    <span>{eventsLog.length} events</span>
                  </div>
                </div>
              </div>

              {/* Quick Launch Cards into Studio Tabs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quick Launch Into Studio
                </span>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  
                  {/* Phone Screen Stream */}
                  <div
                    onClick={() => {
                      setLiveMode('desktop');
                      setStreamKey(Date.now());
                      handleOpenStudio('kiosk');
                    }}
                    style={{
                      background: 'linear-gradient(145deg, #161b22 0%, #0d1117 100%)',
                      border: '1px solid #30363d',
                      borderRadius: '10px',
                      padding: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                    className="hover-card-highlight"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(0, 255, 157, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Smartphone size={18} color="#00ff9d" />
                      </div>
                      <span style={{ fontSize: '11px', color: '#00ff9d', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        Open Stream →
                      </span>
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: '#f0f6fc' }}>
                        Phone &amp; Desktop Live Stream
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#8b949e', lineHeight: 1.4 }}>
                        View live HDMI external desktop, toggle phone mirror, and verify viewport rendering in real-time.
                      </p>
                    </div>
                  </div>

                  {/* Telemetry Studio */}
                  <div
                    onClick={() => handleOpenStudio('telemetry')}
                    style={{
                      background: 'linear-gradient(145deg, #161b22 0%, #0d1117 100%)',
                      border: '1px solid #30363d',
                      borderRadius: '10px',
                      padding: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                    className="hover-card-highlight"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(188, 140, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={18} color="#bc8cff" />
                      </div>
                      <span style={{ fontSize: '11px', color: '#bc8cff', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        Open Telemetry →
                      </span>
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: '#f0f6fc' }}>
                        Telemetry &amp; Structured Logs
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#8b949e', lineHeight: 1.4 }}>
                        Monitor OCR confidence metrics, pipeline latency breakdowns, and structured system events.
                      </p>
                    </div>
                  </div>

                  {/* Wireless ADB & Device Pairing */}
                  <div
                    onClick={() => handleOpenStudio('device')}
                    style={{
                      background: 'linear-gradient(145deg, #161b22 0%, #0d1117 100%)',
                      border: '1px solid #30363d',
                      borderRadius: '10px',
                      padding: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                    className="hover-card-highlight"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(88, 166, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sliders size={18} color="#58a6ff" />
                      </div>
                      <span style={{ fontSize: '11px', color: '#58a6ff', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        Device Config →
                      </span>
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: '#f0f6fc' }}>
                        Wireless ADB &amp; Density
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#8b949e', lineHeight: 1.4 }}>
                        Configure IP endpoints, pair Android 11+ Wi-Fi ports, calibrate display DPI, and test input events.
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Projects List if any exist */}
              {projects.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #21262d', paddingTop: '20px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e' }}>
                    Or select an existing document project:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {projects.map(p => (
                      <div key={p.id} style={{ display: 'inline-flex', alignItems: 'center', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleSwitchProject(p.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', border: 'none', background: 'transparent' }}
                        >
                          <FolderKanban size={13} color="#00ff9d" />
                          <span>{p.name}</span>
                          <span style={{ fontSize: '11px', color: '#8b949e', marginLeft: '4px' }}>({p.frame_count ?? 0} frames)</span>
                        </button>
                        <button
                          type="button"
                          className="btn-text-danger"
                          onClick={e => { e.stopPropagation(); handleDeleteProject(p.id, p.name); }}
                          title={`Delete project "${p.name}"`}
                          aria-label={`Delete project ${p.name}`}
                          style={{ padding: '6px 8px', borderLeft: '1px solid #30363d', borderRadius: 0, background: 'rgba(248, 81, 73, 0.08)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </main>
        )}

        {/* Device & Kiosk Studio Integrated Window */}
        {showStudioDrawer && (
          studioMinimized ? (
            <aside
              className="window-minimized-rail"
              onClick={() => setStudioMinimized(false)}
              title="Click to restore Device Studio panel"
              style={{ borderLeft: '1px solid var(--border-color)', borderRight: 'none' }}
            >
              <Smartphone size={14} color="#58a6ff" />
              <span className="minimized-rail-label">DEVICE STUDIO ({deviceModel === 'pixel_8' ? 'PIXEL 8' : 'PIXEL 10'})</span>
              <Maximize2 size={12} style={{ marginTop: 'auto' }} />
            </aside>
          ) : (
            <>
              {!studioMaximized && (
                <div
                  className={`panel-resizer ${isDraggingStudio ? 'dragging' : ''}`}
                  onMouseDown={handleStudioResizer}
                  title="Drag to resize Device Studio window"
                >
                  <div className="panel-resizer-line" />
                </div>
              )}
              <section
                className={`device-studio-panel ${studioMaximized ? 'maximized' : ''}`}
                style={!studioMaximized ? { width: `${studioPanelWidth}px`, flexShrink: 0 } : undefined}
              >
                <DeviceStudioDrawer
                  isOpen={showStudioDrawer}
                  onClose={handleCloseStudio}
                  isIntegrated={true}
                  isMinimized={studioMinimized}
                  onToggleMinimize={() => setStudioMinimized(p => !p)}
                  isMaximized={studioMaximized}
                  onToggleMaximize={() => setStudioMaximized(p => !p)}
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
                    total_frames: frames?.length || 0,
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
              </section>
            </>
          )
        )}
      </div>

      {editingLine && (
        <Modal title={`Edit Line #${editingLine.line_number}`} onClose={() => setEditingLine(null)} onConfirm={handleSaveLineEdit} confirmText="Save Line">
          <label style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>LINE TEXT (VERBATIM):</label>
          <textarea rows={4} style={{ width: '100%', background: '#0a0d12', border: '1px solid #30363d', borderRadius: '6px', padding: '10px', color: '#fff', fontFamily: 'monospace', fontSize: '12px' }} value={editText} onChange={e => setEditText(e.target.value)} />
        </Modal>
      )}

      {showConfigModal && (
        <Modal
          title="Studio Settings"
          width={settingsTab === 'device' ? "720px" : "560px"}
          onClose={() => setShowConfigModal(false)}
          onConfirm={settingsTab === 'secrets' ? handleSaveApiKey : undefined}
          confirmText={settingsTab === 'secrets' ? "Save Key" : undefined}
        >
          <div className="modal-tabs">
            <button className={`modal-tab ${settingsTab === 'pipeline' ? 'active' : ''}`} onClick={() => setSettingsTab('pipeline')} type="button"><Cpu size={14} /><span>Pipeline Engine</span></button>
            <button className={`modal-tab ${settingsTab === 'secrets' ? 'active' : ''}`} onClick={() => setSettingsTab('secrets')} type="button"><Key size={14} /><span>Secrets</span></button>
            <button className={`modal-tab ${settingsTab === 'security' ? 'active' : ''}`} onClick={() => { setSettingsTab('security'); handleCheckPinPromptStatus(); }} type="button"><Lock size={14} /><span>PIN &amp; Security</span></button>
            <button className={`modal-tab ${settingsTab === 'device' ? 'active' : ''}`} onClick={() => { setSettingsTab('device'); handleExtractDeviceHardwareSpecs(); }} type="button"><Smartphone size={14} /><span>Device &amp; HID</span></button>
          </div>
          {settingsTab === 'device' ? (
            <div className="settings-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Header Status Bar & Extract Button */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: deviceInfo?.connected ? '#00ff9d' : '#ff7b72',
                    boxShadow: deviceInfo?.connected ? '0 0 8px rgba(0,255,157,0.5)' : 'none',
                    flexShrink: 0
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{deviceInfo?.connected ? (deviceInfo.active_model || 'Android Device').toUpperCase() : 'NO DEVICE CONNECTED'}</span>
                      {deviceInfo?.active_serial && (
                        <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'var(--font-mono)' }}>({deviceInfo.active_serial})</span>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '1px' }}>
                      {extractedSpecs ? `Physical: ${extractedSpecs.physical_resolution} @ ${extractedSpecs.physical_dpi} DPI • Display ID: ${extractedSpecs.display_id}` : 'Extract live hardware specs directly over ADB with zero hardcoded values'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExtractDeviceHardwareSpecs}
                  disabled={isLoadingSpecs}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                    borderRadius: '6px', background: '#21262d', border: '1px solid #30363d',
                    color: '#58a6ff', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                    cursor: isLoadingSpecs ? 'wait' : 'pointer', whiteSpace: 'nowrap'
                  }}
                >
                  <RefreshCw size={12} className={isLoadingSpecs ? 'spin' : ''} />
                  <span>{isLoadingSpecs ? 'Extracting Specs...' : 'Extract Live Specs'}</span>
                </button>
              </div>

              {/* Preset Selector */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    PROFILE PRESET:
                  </label>
                  <select
                    className="modal-input"
                    style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '4px 8px' }}
                    value={selectedProfileId}
                    onChange={e => handleSelectProfilePreset(e.target.value)}
                  >
                    <option value="custom">⚙ Custom / Current Extraction</option>
                    {deviceProfiles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.display_name || p.name} ({p.target_dpi} DPI • {p.display_width}x{p.display_height})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleSaveNewProfile}
                  disabled={isSavingDeviceProfile}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                    borderRadius: '5px', background: '#21262d', border: '1px solid #30363d',
                    color: '#00ff9d', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap'
                  }}
                >
                  <Plus size={11} /> <span>Save as New Profile</span>
                </button>
              </div>

              {/* Display & Resolution Characteristics Card */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Monitor size={14} color="#58a6ff" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f0f6fc' }}>
                      DISPLAY &amp; RESOLUTION CHARACTERISTICS
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#8b949e' }}>
                    DPI Scale Factor: <strong style={{ color: '#58a6ff' }}>{(targetDpiInput / 160).toFixed(3)}x</strong>
                  </span>
                </div>

                <div className="device-settings-grid">
                  <div className="device-spec-card">
                    <span className="device-spec-label">Target DPI</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={targetDpiInput}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setTargetDpiInput(val);
                        if (val > 0 && displayHeightInput > 0) {
                          const vh = displayHeightInput / (val / 160.0);
                          setLinesPerPageInput(Math.max(10, Math.floor(vh / 16.0)));
                          setStepSizeInput(Math.max(9, Math.floor(vh / 16.0) - 1));
                        }
                      }}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Display Width</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={displayWidthInput}
                      onChange={e => setDisplayWidthInput(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Display Height</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={displayHeightInput}
                      onChange={e => {
                        const h = Number(e.target.value);
                        setDisplayHeightInput(h);
                        if (h > 0 && targetDpiInput > 0) {
                          const vh = h / (targetDpiInput / 160.0);
                          setLinesPerPageInput(Math.max(10, Math.floor(vh / 16.0)));
                          setStepSizeInput(Math.max(9, Math.floor(vh / 16.0) - 1));
                        }
                      }}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Display ID</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={displayIdInput}
                      onChange={e => setDisplayIdInput(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Lines / Page</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={linesPerPageInput}
                      onChange={e => setLinesPerPageInput(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Step Size</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={stepSizeInput}
                      onChange={e => setStepSizeInput(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Settle Delay (ms)</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={settleDelayInput}
                      onChange={e => setSettleDelayInput(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Device Model</span>
                    <input
                      type="text"
                      className="device-spec-input"
                      value={deviceModelInput}
                      onChange={e => setDeviceModelInput(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* HID Controller Card */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sliders size={14} color="#00ff9d" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f0f6fc' }}>
                      HID CONTROLLER &amp; KEYCODES
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#8b949e' }}>
                    Android Linux Input Keycodes
                  </span>
                </div>

                <div className="device-settings-grid">
                  <div className="device-spec-card">
                    <span className="device-spec-label">Ctrl Keycode</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={hidCtrlKey}
                      onChange={e => setHidCtrlKey(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Home Keycode</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={hidHomeKey}
                      onChange={e => setHidHomeKey(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">End Keycode</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={hidEndKey}
                      onChange={e => setHidEndKey(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Down Keycode</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={hidDownKey}
                      onChange={e => setHidDownKey(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Repeat Delay (ms)</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={hidRepeatDelay}
                      onChange={e => setHidRepeatDelay(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Action Settle (ms)</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={hidActionSettle}
                      onChange={e => setHidActionSettle(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Device Lock Card */}
              <div style={{
                background: lockDeviceInput ? 'rgba(210, 153, 34, 0.08)' : 'var(--bg-main)',
                border: `1px solid ${lockDeviceInput ? 'rgba(210, 153, 34, 0.35)' : 'var(--border-color)'}`,
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: lockDeviceInput ? '#e3b341' : '#f0f6fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Lock size={14} color={lockDeviceInput ? '#e3b341' : '#8b949e'} />
                    <span>Lock Active Project ({activeProject?.name || 'Selected'}) to this Device</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '3px', lineHeight: 1.45 }}>
                    {lockDeviceInput
                      ? `Project strictly locked to ${deviceNameInput || deviceModelInput} (${targetDpiInput} DPI). DAG runs will block execution if a different device model is connected to avoid mismatched page scaling.`
                      : 'Project is unlocked. DAG runs will dynamically extract characteristics and adapt settings to whichever device is plugged in.'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleProjectLock}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                    borderRadius: '6px', border: `1px solid ${lockDeviceInput ? '#d29922' : '#30363d'}`,
                    background: lockDeviceInput ? 'rgba(210, 153, 34, 0.25)' : '#21262d',
                    color: lockDeviceInput ? '#e3b341' : '#8b949e', fontSize: '11px',
                    fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                  }}
                >
                  {lockDeviceInput ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  <span>{lockDeviceInput ? 'LOCKED' : 'UNLOCKED'}</span>
                </button>
              </div>

              {/* Feedback toast */}
              {deviceConfigFeedback && (
                <div style={{
                  padding: '8px 12px', borderRadius: '6px',
                  background: deviceConfigFeedback.success ? 'rgba(0, 255, 157, 0.12)' : 'rgba(248, 81, 73, 0.15)',
                  border: `1px solid ${deviceConfigFeedback.success ? 'rgba(0, 255, 157, 0.3)' : 'rgba(248, 81, 73, 0.35)'}`,
                  fontSize: '11px', color: deviceConfigFeedback.success ? '#00ff9d' : '#ff7b72',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  {deviceConfigFeedback.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                  <span>{deviceConfigFeedback.message}</span>
                </div>
              )}

              {/* Bottom Actions Row */}
              <div className="device-action-btn-row">
                <button
                  type="button"
                  onClick={handleApplyCharacteristicsToDevice}
                  disabled={isApplyingCharacteristics}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                    borderRadius: '6px', background: 'rgba(56, 139, 253, 0.2)', border: '1px solid #388bfd',
                    color: '#58a6ff', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                    cursor: isApplyingCharacteristics ? 'wait' : 'pointer'
                  }}
                >
                  <Monitor size={13} />
                  <span>{isApplyingCharacteristics ? 'Applying to Device...' : 'Apply to Device Hardware'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveProjectDeviceSettings}
                  disabled={!activeProject}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                    borderRadius: '6px', background: 'var(--color-primary)', border: 'none',
                    color: '#000', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 800,
                    cursor: activeProject ? 'pointer' : 'not-allowed', opacity: activeProject ? 1 : 0.5,
                    boxShadow: '0 0 12px var(--color-primary-glow)'
                  }}
                >
                  <Check size={13} />
                  <span>Save to Active Project</span>
                </button>
              </div>
            </div>
          ) : settingsTab === 'pipeline' ? (
            <div className="settings-tab-content">
              <div className="pipeline-choices">
                <div
                  className={`pipeline-choice-card ${pipelineMode === 'cloud' ? 'active cloud-active' : ''}`}
                  onClick={() => !isSwitchingPipeline && handleTogglePipelineMode('cloud')}
                  role="button"
                  tabIndex={0}
                  style={!apiKeyConfigured ? { opacity: 0.75 } : undefined}
                >
                  <div className="pipeline-choice-icon" style={{ color: '#58a6ff' }}><Cloud size={18} /></div>
                  <div className="pipeline-choice-info">
                    <div className="pipeline-choice-title">
                      <span>Cloud Pipeline (Gemini 2.5 Flash)</span>
                      {pipelineMode === 'cloud' && (
                        <span className="badge-active-pill" style={{ background: 'rgba(88, 166, 255, 0.15)', color: '#58a6ff', borderColor: 'rgba(88, 166, 255, 0.3)' }}>ACTIVE</span>
                      )}
                      {!apiKeyConfigured && (
                        <span className="badge-active-pill" style={{ background: 'rgba(255, 123, 114, 0.15)', color: '#ff7b72', borderColor: 'rgba(255, 123, 114, 0.3)', marginLeft: '6px' }}>NO KEY</span>
                      )}
                    </div>
                    <p className="pipeline-choice-desc">
                      Fast, high-fidelity cloud vision model. Processes settled frames with zero local GPU load.{!apiKeyConfigured && ' (Requires API key in Secrets)'}
                    </p>
                  </div>
                </div>
                <div
                  className={`pipeline-choice-card ${pipelineMode === 'local' ? 'active' : ''}`}
                  onClick={() => !isSwitchingPipeline && handleTogglePipelineMode('local')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="pipeline-choice-icon" style={{ color: 'var(--color-primary)' }}><Zap size={18} /></div>
                  <div className="pipeline-choice-info">
                    <div className="pipeline-choice-title">
                      <span>Local Pipeline (MiniCPM-V 2.6)</span>
                      {pipelineMode === 'local' && <span className="badge-active-pill">ACTIVE</span>}
                      {!apiKeyConfigured && (
                        <span className="badge-active-pill" style={{ background: 'rgba(56, 139, 253, 0.15)', color: '#58a6ff', borderColor: 'rgba(56, 139, 253, 0.3)', marginLeft: '6px' }}>DEFAULT</span>
                      )}
                    </div>
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
          ) : settingsTab === 'secrets' ? (
            <div className="settings-tab-content">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 600 }}>GEMINI API KEY</label>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: apiKeyConfigured ? 'rgba(0, 255, 157, 0.12)' : 'rgba(255, 123, 114, 0.12)', color: apiKeyConfigured ? 'var(--color-primary)' : '#ff7b72' }}>{apiKeyConfigured ? '● ACTIVE' : '○ NOT CONFIGURED'}</span>
              </div>
              <input type="password" placeholder={apiKeyConfigured ? '••••••••••••••••' : 'AIzaSy...'} className="modal-input" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px' }} value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} autoFocus />
            </div>
          ) : (
            <div className="settings-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                background: autoEnterPin ? 'rgba(210, 153, 34, 0.1)' : 'rgba(35, 134, 54, 0.1)',
                border: `1px solid ${autoEnterPin ? 'rgba(210, 153, 34, 0.35)' : 'rgba(35, 134, 54, 0.35)'}`,
                borderRadius: '8px',
                padding: '12px 14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {autoEnterPin ? (
                      <ShieldAlert size={16} color="#d29922" />
                    ) : (
                      <ShieldCheck size={16} color="#00ff9d" />
                    )}
                    <span style={{ fontSize: '12px', fontWeight: 700, color: autoEnterPin ? '#e3b341' : '#00ff9d' }}>
                      {autoEnterPin ? 'AUTONOMOUS PIN ENTRY ACTIVE' : 'CORPORATE LOCKOUT PREVENTION ACTIVE (SAFE)'}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: autoEnterPin ? 'rgba(210, 153, 34, 0.2)' : 'rgba(0, 255, 157, 0.15)',
                    color: autoEnterPin ? '#e3b341' : '#00ff9d'
                  }}>
                    {autoEnterPin ? 'AUTO SUBMIT' : 'SAFE MODE'}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#c9d1d9', margin: 0, lineHeight: 1.45 }}>
                  {autoEnterPin
                    ? 'Autonomous PIN entry is enabled. The pipeline will automatically type and submit your configured PIN (1213) whenever Intune/MAM or device prompts appear.'
                    : 'To prevent Okta Authenticator 2FA resets and corporate account lockouts from failed attempts, Small-Fling will NOT enter the PIN automatically without your permission. You can observe the screen and trigger PIN entry manually below.'}
                </p>
              </div>

              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '3px' }}>
                    Auto Enter PIN
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Automatically enter device PIN ({devicePinInput || '1213'}) when Intune / MAM authentication is detected
                  </div>
                </div>
                <button
                  type="button"
                  id="toggle-auto-enter-pin-btn"
                  onClick={() => handleToggleAutoEnterPin(!autoEnterPin)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${autoEnterPin ? '#2ea043' : '#30363d'}`,
                    background: autoEnterPin ? '#238636' : '#21262d',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {autoEnterPin ? (
                    <>
                      <ToggleRight size={16} />
                      <span>ENABLED</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={16} />
                      <span>DISABLED (SAFE)</span>
                    </>
                  )}
                </button>
              </div>

              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 600 }}>
                    DEVICE PIN CODE (.ENV: DEVICE_PIN)
                  </label>
                  <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'var(--font-mono)' }}>
                    Stored in .env &amp; config.json
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      id="device-pin-input"
                      type={showPinPassword ? 'text' : 'password'}
                      placeholder="1213"
                      className="modal-input"
                      style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '13px', letterSpacing: '2px', paddingRight: '36px' }}
                      value={devicePinInput}
                      onChange={e => setDevicePinInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPinPassword(!showPinPassword)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#8b949e',
                        cursor: 'pointer',
                        display: 'flex',
                        padding: '2px'
                      }}
                      title={showPinPassword ? "Hide PIN" : "Show PIN"}
                    >
                      {showPinPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    id="save-device-pin-btn"
                    disabled={isSavingPin || !devicePinInput.trim()}
                    onClick={handleSaveDevicePin}
                    style={{
                      padding: '0 14px',
                      background: '#21262d',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      color: '#58a6ff',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: isSavingPin ? 'wait' : 'pointer'
                    }}
                  >
                    {isSavingPin ? 'Saving...' : 'Save PIN'}
                  </button>
                </div>
              </div>

              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Activity size={14} color="#58a6ff" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f0f6fc' }}>
                      DEVICE OBSERVER &amp; MANUAL CONTROL
                    </span>
                  </div>
                  <button
                    type="button"
                    id="check-pin-screen-btn"
                    onClick={handleCheckPinPromptStatus}
                    disabled={isCheckingPinPrompt}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'none',
                      border: 'none',
                      color: '#58a6ff',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      cursor: isCheckingPinPrompt ? 'wait' : 'pointer',
                      padding: '2px 4px'
                    }}
                  >
                    <RefreshCw size={11} className={isCheckingPinPrompt ? 'spin' : ''} />
                    <span>{isCheckingPinPrompt ? 'Checking...' : 'Check Screen'}</span>
                  </button>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: '#0a0d12',
                  borderRadius: '6px',
                  marginBottom: '10px',
                  border: '1px solid #21262d'
                }}>
                  <div style={{ fontSize: '11px', color: '#8b949e' }}>
                    PIN Prompt Detector:
                  </div>
                  <div>
                    {pinPromptStatus ? (
                      <span style={{
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: pinPromptStatus.active ? 'rgba(248, 81, 73, 0.2)' : 'rgba(35, 134, 54, 0.2)',
                        color: pinPromptStatus.active ? '#ff7b72' : '#00ff9d',
                        border: `1px solid ${pinPromptStatus.active ? '#f85149' : '#238636'}`
                      }}>
                        {pinPromptStatus.active ? '● PIN PROMPT DETECTED' : '○ NO PROMPT (READY)'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'var(--font-mono)' }}>
                        Ready to verify
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <p style={{ fontSize: '11px', color: '#8b949e', margin: 0, lineHeight: 1.4 }}>
                    Observe Display 4. When the PIN input box is visible, click to enter PIN {devicePinInput || '1213'} under your direct observation.
                  </p>
                  <button
                    type="button"
                    id="enter-pin-now-btn"
                    onClick={handleManualEnterPin}
                    disabled={isEnteringPinManually}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      background: isEnteringPinManually ? '#21262d' : '#1f6feb',
                      color: '#fff',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      border: 'none',
                      cursor: isEnteringPinManually ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 0 10px rgba(31, 111, 235, 0.3)'
                    }}
                  >
                    {isEnteringPinManually ? (
                      <>
                        <RefreshCw size={13} className="spin" />
                        <span>Entering...</span>
                      </>
                    ) : (
                      <>
                        <Lock size={13} />
                        <span>Enter PIN Now</span>
                      </>
                    )}
                  </button>
                </div>

                {manualPinFeedback && (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: manualPinFeedback.success ? 'rgba(35, 134, 54, 0.15)' : 'rgba(248, 81, 73, 0.15)',
                    border: `1px solid ${manualPinFeedback.success ? '#238636' : '#f85149'}`,
                    fontSize: '11px',
                    color: manualPinFeedback.success ? '#7ee787' : '#ff7b72',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {manualPinFeedback.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                    <span>{manualPinFeedback.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {showNewProjectModal && (
        <Modal title="Create New Project" onClose={() => setShowNewProjectModal(false)} onConfirm={handleCreateProject} confirmText="Create & Activate" confirmIcon={Plus} disabled={!newProject.name.trim()}>
          <div className="modal-form-group" style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700 }}>PROJECT NAME *</label>
            <input type="text" placeholder="e.g. Small-Fling Core" className="modal-input" value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && newProject.name.trim()) { e.preventDefault(); handleCreateProject(); } }} autoFocus />
          </div>

          <div className="modal-form-group" style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700 }}>TARGET DEVICE &amp; CHARACTERISTICS</label>
            <select
              className="modal-input"
              style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              value={newProject.deviceProfileId}
              onChange={e => setNewProject(p => ({ ...p, deviceProfileId: e.target.value }))}
            >
              <option value="auto">⚡ Auto-Detect Connected Hardware (Zero Hardcoding)</option>
              {deviceProfiles.map(prof => (
                <option key={prof.id} value={prof.id}>
                  📱 {prof.display_name || prof.name} ({prof.target_dpi} DPI • {prof.display_width}x{prof.display_height})
                </option>
              ))}
            </select>
          </div>

          <div style={{
            background: 'var(--bg-main)',
            border: `1px solid ${newProject.lockDevice ? 'rgba(210, 153, 34, 0.35)' : 'var(--border-color)'}`,
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: newProject.lockDevice ? '#e3b341' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={13} color={newProject.lockDevice ? '#e3b341' : '#8b949e'} />
                <span>Lock Project to Device Characteristics</span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                {newProject.lockDevice
                  ? 'DAG execution strictly verifies hardware matches this device profile. Switching devices safely halts runs.'
                  : 'Unlocked: DAG dynamically extracts DPI & resolution from whichever device is attached.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewProject(p => ({ ...p, lockDevice: !p.lockDevice }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '5px',
                border: `1px solid ${newProject.lockDevice ? '#d29922' : '#30363d'}`,
                background: newProject.lockDevice ? 'rgba(210, 153, 34, 0.25)' : '#21262d',
                color: newProject.lockDevice ? '#e3b341' : '#8b949e',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {newProject.lockDevice ? <Lock size={11} /> : <Sliders size={11} />}
              <span>{newProject.lockDevice ? 'LOCKED' : 'UNLOCKED'}</span>
            </button>
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

      <AlignmentDiagnosticsModal
        isOpen={showAlignmentModal} alignmentData={alignmentData} isCheckingAlignment={isCheckingAlignment}
        onClose={() => setShowAlignmentModal(false)} onTriggerCheck={handleTriggerAlignmentCheck}
        onInspectLiveScreen={() => { setShowAlignmentModal(false); setStudioInitialTab('kiosk'); setShowStudioDrawer(true); setLiveMode('desktop'); setStreamKey(Date.now()); }}
        onFixClassifier={handleFixClassifier} onFixAllClassifiers={handleFixAllClassifiers} fixingClassifierId={fixingClassifierId}
        isFixingAll={isFixingAll} dismissedItems={dismissedItems} onDismissItem={handleDismissItem}
      />

      <LiveMetaInfoPopover
        isOpen={showInspectorMetaPopover}
        onClose={() => setShowInspectorMetaPopover(false)}
        apiBase={API_BASE}
        streamKey={streamKey}
        onRefresh={() => setStreamKey(Date.now())}
        alignmentData={alignmentData}
        liveMode={liveMode}
      />

      {traceFrameId && (() => {
        const tf = frames.find(fr => fr.frame_id === traceFrameId);
        return tf ? <FrameTracePanel frame={tf} eventsLog={eventsLog} onClose={() => setTraceFrameId(null)} /> : null;
      })()}

      <TelemetryToaster
        telemetry={telemetry} tokenStats={tokenStats}
        documentSummary={{ total_lines: documentData?.total_lines || 0, min_line: documentData?.min_line || 0, max_line: documentData?.max_line || 0, total_frames: frames.length, issue_count: documentData?.issue_count || 0, verified_overlap_lines: (documentData?.lines || []).filter(l => l.status === 'verified_overlap').length }}
        wsConnected={wsConnected} backendConnected={backendConnected} latencyMs={latencyMs} pipelineMode={pipelineMode}
        deviceModel={deviceModel} eventsLog={eventsLog} onClearEvents={() => setEventsLog([])} onExpandedChange={setIsTelemetryExpanded}
        isAlignmentDismissed={isBannerDismissed} isAligned={alignmentData.is_aligned}
        onReturnAlignmentOverlay={() => { setIsBannerDismissed(false); setIsBannerMinimized(false); localStorage.setItem('mc_banner_dismissed', 'false'); localStorage.setItem('mc_banner_minimized', 'false'); addTelemetryEvent('SYSTEM', 'Alignment Alert Overlay returned'); }}
        onOpenStudio={() => { setStudioInitialTab('telemetry'); setShowStudioDrawer(true); setStudioMinimized(false); }}
        selectedDag={selectedDag}
        onSelectDag={setSelectedDag}
        selectedNodeId={selectedNodeId}
        onSelectNodeId={setSelectedNodeId}
        apiBase={API_BASE}
        onRefresh={fetchData}
        onOpenPromptModal={handleOpenPromptModal}
      />

      {isPromptModalOpen && (
        <AiPerformancePromptModal
          isOpen={isPromptModalOpen}
          onClose={() => setIsPromptModalOpen(false)}
          nodeMeta={NODES_METADATA.find(n => n.id === promptModalNodeId) || NODES_METADATA[0]}
          diagnosis={serverDiagnosisCache[promptModalNodeId] || discernNodePerformance(
            NODES_METADATA.find(n => n.id === promptModalNodeId) || NODES_METADATA[0],
            {
              isError: true,
              isDone: false,
              isRunning: false,
              isActive: false,
              statusLabel: 'ERROR',
              metricLabel: '',
              evaluator: '',
              healingStep: null,
              telemetryInsight: '',
              color: '#f85149',
              startedAt: null,
              finishedAt: null,
              durationMs: null,
              nodeError: 'Node encountered error'
            },
            {
              active_node: promptModalNodeId,
              target_total_lines: 0,
              current_top_line: 1,
              current_bottom_line: 59,
              current_page: 1,
              is_keyboard_guarded: true,
              arrow_step_count: 48,
              verification_trigger_fired: false,
              ocr_worker_active: true,
              ocr_latency_ms: 45
            },
            deviceInfo?.active_serial
          )}
        />
      )}
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
