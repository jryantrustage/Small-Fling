import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Scan, Settings, Search, Coins, Layers, RotateCw, RefreshCw, AlertCircle, FolderKanban, Plus, Trash2,
  Camera, Cloud, Zap, Smartphone, Key, Cpu,
  Monitor, ChevronDown, Info, Eye, EyeOff, Sliders, Maximize2, Activity,
  Check, FileText, X,
  Lock, ShieldCheck, ShieldAlert, ToggleLeft, ToggleRight, AlertTriangle,
  Upload, Download
} from 'lucide-react';
import { TelemetryToaster, type TelemetryData, type TelemetryEvent } from './TelemetryToaster';
import { FlowDag } from './FlowDag';
import { useConfirm, Modal } from './ConfirmModal';
import type {
  ProjectData, LineData, FrameData, RecaptureItem, TokenStats, FrameBoundingBoxes, AlignmentData, DeviceInfoData,
  DeviceProfile, DeviceHardwareSpecs, DesktopVerificationInfo, MultipartBundleState
} from './types';
import { AlignmentDiagnosticsModal } from './components/AlignmentDiagnosticsModal';
import { DeviceStudioDrawer } from './components/DeviceStudioDrawer';
import { FrameTracePanel } from './components/FrameTracePanel';
import { GotoLineModal } from './components/GotoLineModal';
import { LiveMetaInfoPopover } from './components/LiveMetaInfoPopover';
import { LiveResponsiveViewport } from './components/LiveResponsiveViewport';
import { useAgoTimer } from './hooks/useAgoTimer';
import { AiPerformancePromptModal } from './components/dag/AiPerformancePromptModal';
import { CapturedFramesReportModal } from './components/frames/CapturedFramesReportModal';
import { OcrDiagnosticsReportModal } from './components/ocr/OcrDiagnosticsReportModal';
import { NODES_METADATA, type PerformanceDiagnosis } from './types/dag';
import { discernNodePerformance } from './utils/dagDiagnostics';
import { Dag4OcrFullInspectorModal } from './components/dag/Dag4OcrFullInspectorModal';
import { VirtualizedFrameStrip } from './components/VirtualizedFrameStrip';
import { VirtualizedLineViewer } from './components/VirtualizedLineViewer';
import { HeadlessTelemetryModal, type HeadlessTelemetryData } from './components/HeadlessTelemetryModal';
import { WindowControls } from './components/common/WindowControls';
import { OcrLineInspectorWorkspace } from './components/ocr/OcrLineInspectorWorkspace';
import { AnalyzerSandboxWorkspace } from './components/analyzer/AnalyzerSandboxWorkspace';

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
  const [_isSidebarOpen, _setIsSidebarOpen] = useState(false);
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
  // Lazy-loaded verified lines state
  const [lazyFromLine, setLazyFromLine] = useState<number>(1);
  const [lazyToLine, setLazyToLine] = useState<number>(60);
  const [lazyFromInput, setLazyFromInput] = useState<string>('1');
  const [lazyToInput, setLazyToInput] = useState<string>('60');
  const [lazyWindowSize, setLazyWindowSize] = useState<number>(50);
  const [followCurrentProcess, setFollowCurrentProcess] = useState<boolean>(true);
  const [isLoadingLazyLines, setIsLoadingLazyLines] = useState<boolean>(false);
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [_recaptureQueue, setRecaptureQueue] = useState<RecaptureItem[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats>({ total_prompt_tokens: 0, total_candidates_tokens: 0, total_tokens: 0, total_api_calls: 0, estimated_cost_usd: 0 });
  const [telemetry, setTelemetry] = useState<TelemetryData>({});
  const [latencyMs, setLatencyMs] = useState(0);
  const [eventsLog, setEventsLog] = useState<TelemetryEvent[]>([]);
  const [traceFrameId, setTraceFrameId] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const { secondsAgo: inspectorAgoSec } = useAgoTimer(streamKey);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<'capture_dag' | 'ocr_inspector' | 'analyzer_sandbox'>('capture_dag');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const [_showDag, setShowDag] = useState(true);
  const [selectedDag, setSelectedDag] = useState<'all' | 'initialize' | 'capture_entire_markdown' | 'position_navigation' | 'verify_assemble' | 'post_capture_analyzer'>('all');
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
  const [_isBannerMinimized, setIsBannerMinimized] = useState(() => localStorage.getItem('mc_banner_minimized') === 'true');
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
  const [isFramesReportOpen, setIsFramesReportOpen] = useState(false);
  const [isOcrReportOpen, setIsOcrReportOpen] = useState(false);
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
  const [scrollPaddingLinesInput, setScrollPaddingLinesInput] = useState<number>(4);
  const [arrowCountInitInput, setArrowCountInitInput] = useState<number>(56);
  const [arrowCountStepInput, setArrowCountStepInput] = useState<number>(28);
  const [hidDispatchMethod, setHidDispatchMethod] = useState<string>('accelerated_batch');
  const [lockDeviceInput, setLockDeviceInput] = useState<boolean>(false);
  const [hidCtrlKey, setHidCtrlKey] = useState<number>(113);
  const [hidHomeKey, setHidHomeKey] = useState<number>(122);
  const [hidEndKey, setHidEndKey] = useState<number>(123);
  const [hidDownKey, setHidDownKey] = useState<number>(20);
  const [hidRepeatDelay, setHidRepeatDelay] = useState<number>(15);
  const [hidActionSettle, setHidActionSettle] = useState<number>(50);

  const updateLinesAndPadding = (lpp: number, pad: number) => {
    setLinesPerPageInput(lpp);
    setScrollPaddingLinesInput(pad);
    const step = Math.max(1, lpp + pad);
    const init = step * 2;
    setStepSizeInput(step);
    setArrowCountStepInput(step);
    setArrowCountInitInput(init);
  };
  const [deviceConfigFeedback, setDeviceConfigFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isApplyingCharacteristics, setIsApplyingCharacteristics] = useState(false);
  const [isSavingDeviceProfile, setIsSavingDeviceProfile] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [autoEnterPin, setAutoEnterPin] = useState(false);
  const [devicePinInput, setDevicePinInput] = useState('2992');
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
  const [liveMode, setLiveMode] = useState<'desktop' | 'phone'>(() => {
    try {
      return (localStorage.getItem('mc_live_mode') as 'desktop' | 'phone') || 'desktop';
    } catch {
      return 'desktop';
    }
  });

  const handleSwitchLiveMode = (mode: 'desktop' | 'phone') => {
    setLiveMode(mode);
    try {
      localStorage.setItem('mc_live_mode', mode);
    } catch {}
    setStreamKey(Date.now());
  };
  const [inspectorMode, setInspectorMode] = useState<'live' | 'single' | 'ocr_inspect'>('live');
  const [ocrInspectImageId, setOcrInspectImageId] = useState<string>('dag_node3_capture_temp');

  const handleOpenInlineOcrInspector = (imageId?: string) => {
    if (imageId) {
      setOcrInspectImageId(imageId);
      if (imageId !== 'dag_node3_capture_temp') {
        setSelectedFrameId(imageId);
      }
    } else if (selectedFrameId) {
      setOcrInspectImageId(selectedFrameId);
    }
    setInspectorMode('ocr_inspect');
    setInspectorMaximized(false);
    // Auto-close Android device drawer and minimize lines panel so OCR inspector coordinates overlay has full width
    setShowStudioDrawer(false);
    setLinesMinimized(true);
    setDagMinimized(true);
  };

  const handleCloseInlineOcrInspector = () => {
    if (ocrInspectImageId && ocrInspectImageId !== 'dag_node3_capture_temp') {
      setSelectedFrameId(ocrInspectImageId);
    }
    setInspectorMode(selectedFrameId || (ocrInspectImageId && ocrInspectImageId !== 'dag_node3_capture_temp') ? 'single' : 'live');
    setInspectorMaximized(false);
    setFramesMinimized(false);
  };

  const handleOcrInspectorRefresh = useCallback(() => {
    apiJson<any>('/api/document').then(d => { if (d) setDocumentData(d); });
    apiJson<any>('/api/frames').then(d => { if (d?.frames) setFrames(d.frames); });
  }, []);
  const [isExportingMarkdown, setIsExportingMarkdown] = useState(false);
  const [isExportingProject, setIsExportingProject] = useState(false);
  const [isImportingProject, setIsImportingProject] = useState(false);
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const sidebarImportInputRef = useRef<HTMLInputElement>(null);
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
  const [desktopKeyboardProhibited, setDesktopKeyboardProhibited] = useState<boolean>(true);
  const [desktopModeEnabled, setDesktopModeEnabled] = useState<boolean>(true);
  const [_isTogglingDesktopMode, setIsTogglingDesktopMode] = useState<boolean>(false);
  const [_isTogglingKeyboardProhibit, setIsTogglingKeyboardProhibit] = useState<boolean>(false);
  const [desktopVerification, setDesktopVerification] = useState<DesktopVerificationInfo | null>(null);
  const [showDesktopDiag, setShowDesktopDiag] = useState<boolean>(false);
  const desktopDiagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (desktopDiagRef.current && !desktopDiagRef.current.contains(event.target as Node)) {
        setShowDesktopDiag(false);
      }
    }
    if (showDesktopDiag) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDesktopDiag]);

  // Window & Panel Management States
  const [dagMinimized, setDagMinimized] = useState(false);
  const [studioMinimized, setStudioMinimized] = useState(false);
  const [framesMinimized, setFramesMinimized] = useState(false);
  const [framesMaximized, setFramesMaximized] = useState(false);
  const [linesMinimized, setLinesMinimized] = useState(false);
  const [linesMaximized, setLinesMaximized] = useState(false);
  const [inspectorMinimized, setInspectorMinimized] = useState(false);
  const [inspectorMaximized, setInspectorMaximized] = useState(false);
  const [studioPanelWidth, setStudioPanelWidth] = useState(() => {
    try { return Number(localStorage.getItem('mc_studio_panel_width')) || 460; } catch { return 460; }
  });
  const [isDraggingStudio, setIsDraggingStudio] = useState(false);
  const [studioMaximized, setStudioMaximized] = useState(false);
  const [telemetryActiveTab, setTelemetryActiveTab] = useState<'overview' | 'pacer' | 'tokens' | 'events'>('events');
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const layoutMenuRef = useRef<HTMLDivElement>(null);

  // Unified Window Navigation Handlers
  const handleTogglePhone = useCallback(() => {
    setInspectorMaximized(false);
    setFramesMaximized(false);
    setLinesMaximized(false);
    if (inspectorMinimized) {
      setInspectorMinimized(false);
      setInspectorMode('live');
      setLiveMode('desktop');
      setStreamKey(Date.now());
    } else if (inspectorMode !== 'live') {
      setInspectorMode('live');
      setLiveMode('desktop');
      setStreamKey(Date.now());
    } else {
      setInspectorMode('single');
    }
  }, [inspectorMinimized, inspectorMode]);

  const handleToggleStudio = useCallback((tab?: 'kiosk' | 'device' | 'processes' | 'telemetry') => {
    setInspectorMaximized(false);
    setFramesMaximized(false);
    setLinesMaximized(false);
    if (!showStudioDrawer) {
      if (tab) setStudioInitialTab(tab);
      setShowStudioDrawer(true);
      setStudioMinimized(false);
      try { localStorage.setItem('mc_show_studio_drawer', 'true'); } catch {}
    } else if (studioMinimized) {
      if (tab) setStudioInitialTab(tab);
      setStudioMinimized(false);
    } else {
      // Already open & un-minimized
      if (tab && studioInitialTab !== tab) {
        setStudioInitialTab(tab);
      } else {
        setShowStudioDrawer(false);
        try { localStorage.setItem('mc_show_studio_drawer', 'false'); } catch {}
      }
    }
  }, [showStudioDrawer, studioMinimized, studioInitialTab]);

  const handleToggleFrames = useCallback(() => {
    setInspectorMaximized(false);
    setLinesMaximized(false);
    if (framesMaximized) {
      setFramesMaximized(false);
    } else if (framesMinimized) {
      setFramesMinimized(false);
    } else {
      setFramesMinimized(true);
    }
  }, [framesMaximized, framesMinimized]);

  const handleToggleLines = useCallback(() => {
    setInspectorMaximized(false);
    setFramesMaximized(false);
    if (linesMaximized) {
      setLinesMaximized(false);
    } else if (linesMinimized) {
      setLinesMinimized(false);
    } else {
      setLinesMinimized(true);
    }
  }, [linesMaximized, linesMinimized]);

  // Group Edit / Selection States
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(new Set());
  const [isBatchDeletingFrames, setIsBatchDeletingFrames] = useState(false);
  const [selectedLineNumbers, setSelectedLineNumbers] = useState<Set<number>>(new Set());
  const [isBatchDeletingLines, setIsBatchDeletingLines] = useState(false);
  const deletedProjectIdsRef = useRef<Set<string>>(new Set());
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  // Auto-Fix & Calibrate States
  const [_isAutoFixingViewport, setIsAutoFixingViewport] = useState(false);
  const [sequentialRescanStatus, setSequentialRescanStatus] = useState<{
    is_running: boolean;
    current_index: number;
    total_frames: number;
    current_frame_id?: string;
    current_top_line?: number;
    current_bottom_line?: number;
    total_verified_lines?: number;
    status_message?: string;
  }>({
    is_running: false,
    current_index: 0,
    total_frames: 0
  });

  const handleStartSequentialRescanAllFrames = async () => {
    if (sequentialRescanStatus.is_running) return;
    try {
      const res = await fetch(`${API_BASE}/api/ocr/rescan-all-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frame_ids: selectedFrameIds.size > 0 ? Array.from(selectedFrameIds) : undefined,
          clear_existing: false
        })
      });
      if (res.ok) {
        setSequentialRescanStatus(p => ({ ...p, is_running: true }));
      }
    } catch (e) {
      console.error('Failed to start sequential frame rescan', e);
    }
  };

  const handleCancelSequentialRescan = async () => {
    try {
      await fetch(`${API_BASE}/api/ocr/cancel-rescan-all-frames`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  const [headlessMode, setHeadlessMode] = useState<boolean>(false);
  const [forceWebUiInHeadless, setForceWebUiInHeadless] = useState<boolean>(false);
  const [isHeadlessTelemetryOpen, setIsHeadlessTelemetryOpen] = useState<boolean>(false);
  const [headlessTelemetry, setHeadlessTelemetry] = useState<HeadlessTelemetryData | null>(null);
  const [isCaptureLoopRunning, setIsCaptureLoopRunning] = useState<boolean>(false);

  // Multi-Part Markdown & Screen Preparation State
  const [multipartState, setMultipartState] = useState<MultipartBundleState>({
    auto_chain_enabled: true,
    is_multipart: false,
    base_prefix: '',
    current_part: null,
    total_parts: null,
    next_part_number: null,
    next_file_name: null,
    available_parts: [],
    exported_parts: [],
    transition_status: 'idle',
    last_transition_message: '',
    bundle_completed: false
  });
  const [isPreparingScreen, setIsPreparingScreen] = useState<boolean>(false);
  const [isTransitioningNextPart, setIsTransitioningNextPart] = useState<boolean>(false);
  const [startupProjectName, setStartupProjectName] = useState<string>('');
  const [startupNameTouched, setStartupNameTouched] = useState<boolean>(false);

  // Auto-fill startup project name when alignment detects a filename on the live mobile screen
  useEffect(() => {
    if (!activeProject && !startupNameTouched && alignmentData?.file_name) {
      setStartupProjectName(alignmentData.file_name);
    }
  }, [activeProject, startupNameTouched, alignmentData?.file_name]);

  const handleToggleHeadlessMode = async () => {
    try {
      const nextVal = !headlessMode;
      const res = await fetch(`${API_BASE}/api/dag/config/headless-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless_mode: nextVal })
      });
      if (res.ok) {
        const d = await res.json();
        if (d && typeof d.headless_mode === 'boolean') {
          setHeadlessMode(d.headless_mode);
          if (d.headless_mode) {
            setForceWebUiInHeadless(false);
          }
        }
      }
    } catch (e) {
      console.error('Failed to toggle headless mode', e);
    }
  };

  const handlePrepareMarkdownEditor = async () => {
    setIsPreparingScreen(true);
    try {
      const activeSer = deviceInfo?.active_serial || deviceInfo?.target_serial;
      const res = await api('/api/device/prepare-markdown-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: activeSer })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.alignment) setAlignmentData(d.alignment);
        if (d.multipart_state) setMultipartState(d.multipart_state);
        if (d.detected_file_name && !startupNameTouched) {
          setStartupProjectName(d.detected_file_name);
        }
        setStreamKey(Date.now());
      }
    } catch (e) {
      console.error('Failed to prepare markdown editor', e);
    } finally {
      setIsPreparingScreen(false);
    }
  };

  const handleToggleAutoChainMultipart = async (enabled: boolean) => {
    try {
      const res = await api('/api/dag/multipart/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_chain_enabled: enabled })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.multipart_state) setMultipartState(d.multipart_state);
      }
    } catch (e) {
      console.error('Failed to update multipart config', e);
    }
  };

  const handleTransitionNextPart = async (autoStartLoop: boolean = true) => {
    setIsTransitioningNextPart(true);
    try {
      const activeSer = deviceInfo?.active_serial || deviceInfo?.target_serial;
      const res = await api('/api/dag/multipart/transition-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: activeSer, auto_start_loop: autoStartLoop })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.multipart_state) setMultipartState(d.multipart_state);
        if (d.project) setActiveProject(d.project);
        setStreamKey(Date.now());
      }
    } catch (e) {
      console.error('Failed to transition to next markdown part', e);
    } finally {
      setIsTransitioningNextPart(false);
    }
  };

  const handleStartStopCaptureLoop = async (start: boolean) => {
    try {
      const activeSer = deviceInfo?.active_serial || deviceInfo?.target_serial;
      if (start) {
        const maxFrameBot = frames.reduce((m, f) => Math.max(m, f.bottom_line || 0), 0);
        const lastBot = Math.max(telemetry?.current_bottom_line || 0, documentData.max_line || 0, maxFrameBot);
        const res = await api('/api/dag/loop/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial: activeSer,
            headless_mode: headlessMode,
            resume_from_line: lastBot > 0 ? lastBot + 1 : undefined,
          })
        });
        if (res.ok) setIsCaptureLoopRunning(true);
      } else {
        const res = await api('/api/dag/loop/stop', { method: 'POST' });
        if (res.ok) setIsCaptureLoopRunning(false);
      }
    } catch (e) {
      console.error('Failed to toggle capture loop', e);
    }
  };

  useEffect(() => {
    apiJson<any>('/api/dag/config/headless-mode').then(d => {
      if (d && typeof d.headless_mode === 'boolean') {
        setHeadlessMode(d.headless_mode);
      }
    }).catch(() => {});

    apiJson<any>('/api/dag/headless/telemetry').then(d => {
      if (d && d.telemetry) {
        setHeadlessTelemetry(d.telemetry);
      }
    }).catch(() => {});

    apiJson<any>('/api/dag/multipart/status').then(d => {
      if (d && d.multipart_state) {
        setMultipartState(d.multipart_state);
      }
    }).catch(() => {});

    apiJson<any>('/api/dag/status').then(d => {
      if (d && typeof d.capture_loop_running === 'boolean') {
        setIsCaptureLoopRunning(d.capture_loop_running);
      }
    }).catch(() => {});
  }, []);

  const fetchLazyLines = useCallback(async (from?: number, to?: number, follow?: boolean) => {
    try {
      setIsLoadingLazyLines(true);
      const params = new URLSearchParams();
      if (follow) {
        params.set('follow_current', 'true');
      } else {
        if (from !== undefined && from > 0) params.set('from_line', String(from));
        if (to !== undefined && to > 0) params.set('to_line', String(to));
      }
      params.set('limit', String(lazyWindowSize));

      const res = await api(`/api/document/lines?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        if (d && Array.isArray(d.lines)) {
          setDocumentData(prev => ({
            ...prev,
            total_lines: d.total_lines ?? prev.total_lines,
            min_line: d.min_line ?? prev.min_line,
            max_line: d.max_line ?? prev.max_line,
            lines: d.lines
          }));
          if (d.from_line) {
            setLazyFromLine(d.from_line);
            setLazyFromInput(String(d.from_line));
            if (!follow && scrollToLineRef.current) {
              scrollToLineRef.current(d.from_line);
            }
          }
          if (d.to_line) {
            setLazyToLine(d.to_line);
            setLazyToInput(String(d.to_line));
          }
        }
      }
    } catch (e) {
      console.error('[App] fetchLazyLines error:', e);
    } finally {
      setIsLoadingLazyLines(false);
    }
  }, [lazyWindowSize]);

  const currentProcessTopLine = sequentialRescanStatus.is_running
    ? (sequentialRescanStatus.current_top_line || 0)
    : (telemetry?.current_top_line || 0);

  useEffect(() => {
    if (followCurrentProcess && currentProcessTopLine > 0) {
      const handler = setTimeout(() => {
        fetchLazyLines(undefined, undefined, true);
      }, 250);
      return () => clearTimeout(handler);
    }
  }, [followCurrentProcess, currentProcessTopLine, fetchLazyLines]);

  useEffect(() => {
    fetchLazyLines(undefined, undefined, true);
  }, [fetchLazyLines, activeProject?.id]);


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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node)) {
        setShowLayoutMenu(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
    };
    if (showLayoutMenu || showProjectDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLayoutMenu, showProjectDropdown]);

  const isDocVisibleRef = useRef(true);
  const isFetchingRef = useRef(false);
  const activeProjectRef = useRef(activeProject);
  useEffect(() => { activeProjectRef.current = activeProject; }, [activeProject]);
  const deviceInfoRef = useRef(deviceInfo);
  useEffect(() => { deviceInfoRef.current = deviceInfo; }, [deviceInfo]);
  const deviceModelRef = useRef(deviceModel);
  useEffect(() => { deviceModelRef.current = deviceModel; }, [deviceModel]);
  const scrollToLineRef = useRef<((lineNumber: number) => void) | null>(null);
  const [armedSplitter, setArmedSplitter] = useState<'frames' | 'split' | 'studio' | null>(null);
  const splitterHoverTimerRef = useRef<number | null>(null);

  const handleSplitterMouseEnter = useCallback((which: 'frames' | 'split' | 'studio') => {
    if (splitterHoverTimerRef.current) window.clearTimeout(splitterHoverTimerRef.current);
    splitterHoverTimerRef.current = window.setTimeout(() => {
      setArmedSplitter(which);
    }, 80);
  }, []);

  const handleSplitterMouseLeave = useCallback(() => {
    if (splitterHoverTimerRef.current) {
      window.clearTimeout(splitterHoverTimerRef.current);
      splitterHoverTimerRef.current = null;
    }
    setArmedSplitter(null);
  }, []);

  const addTelemetryEvent = useCallback((category: TelemetryEvent['category'], message: string, data?: any, dag?: 'initialize' | 'capture_entire_markdown' | 'position_navigation' | 'verify_assemble' | 'system' | 'all') => {
    let inferredDag = dag;
    if (!inferredDag) {
      const msg = message.toLowerCase();
      if (msg.includes('init') || msg.includes('calibrat') || msg.includes('ctrl+end') || msg.includes('ctrl+home') || msg.includes('workspace')) {
        inferredDag = 'initialize';
      } else if (msg.includes('node 5') || msg.includes('node 6') || msg.includes('position') || msg.includes('gutter ocr') || msg.includes('arrow_down') || (msg.includes('semaphore') && !msg.includes('3 and dag 4'))) {
        inferredDag = 'position_navigation';
      } else if (msg.includes('node 7') || msg.includes('node 8') || msg.includes('verification') || msg.includes('assemble') || msg.includes('qualifier') || msg.includes('semaphore between dag 3 and dag 4')) {
        inferredDag = 'verify_assemble';
      } else if (category === 'FRAME' || category === 'PACER' || msg.includes('frame') || msg.includes('capture') || msg.includes('ocr') || msg.includes('local_ai')) {
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

  const handleToggleProhibitKeyboard = async (prohibit?: boolean) => {
    const nextVal = prohibit !== undefined ? prohibit : !desktopKeyboardProhibited;
    setIsTogglingKeyboardProhibit(true);
    try {
      const res = await api('/api/device/kiosk/keyboard-prohibit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prohibit: nextVal, serial: deviceInfo?.active_serial })
      });
      if (res.ok) {
        const data = await res.json();
        const effectiveVal = typeof data.desktop_keyboard_prohibited === 'boolean' ? data.desktop_keyboard_prohibited : nextVal;
        setDesktopKeyboardProhibited(effectiveVal);
        addTelemetryEvent(
          'SYSTEM',
          effectiveVal
            ? 'Desktop soft keyboard PROHIBITED at OS level (will never appear when clicking nodes)'
            : 'Desktop soft keyboard ALLOWED'
        );
      }
    } catch (err: any) {
      addTelemetryEvent('ERROR', `Failed to toggle keyboard prohibition: ${err.message}`);
    } finally {
      setIsTogglingKeyboardProhibit(false);
    }
  };

  const handleVerifyDesktopMode = async () => {
    try {
      const res = await api('/api/device/kiosk/desktop-mode/verify');
      if (res.ok) {
        const data = await res.json();
        setDesktopVerification(data);
        if (typeof data.desktop_mode_enabled === 'boolean') {
          setDesktopModeEnabled(data.desktop_mode_enabled);
        }
        addTelemetryEvent('SYSTEM', `Desktop Verification: ${data.message || 'Hardware checked'}`);
      }
    } catch (e: any) {
      addTelemetryEvent('ERROR', `Desktop verification error: ${e.message}`);
    }
  };

  const handleToggleDesktopMode = async (enable: boolean) => {
    setIsTogglingDesktopMode(true);
    try {
      const res = await api('/api/device/kiosk/desktop-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable, enabled: enable, serial: deviceInfo?.active_serial })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const effectiveVal = typeof data.desktop_mode_enabled === 'boolean' ? data.desktop_mode_enabled : enable;
        setDesktopModeEnabled(effectiveVal);
        setDesktopVerification(data);
        if (effectiveVal) {
          if (data.hardware_connected) {
            setLiveMode('desktop');
            addTelemetryEvent('SYSTEM', `Desktop Mode ENABLED & CONNECTED: Display #${data.external_display_id || 11} (${data.resolution || 'DP Alt Mode'}). Mouse routed to monitor.`);
          } else {
            addTelemetryEvent('SYSTEM', 'Desktop Mode ARMED on Pixel 8: Developer options verified. Ready to plug in USB-C DP Alt Mode cable!');
          }
        } else {
          setLiveMode('phone');
          addTelemetryEvent('SYSTEM', 'Phone Screen Mode ENABLED: Mouse routed to phone (Display 0), kiosk unlocked, keyboard enabled for authentication.');
        }
        setStreamKey(Date.now());
        await fetchData();
      } else {
        addTelemetryEvent('ERROR', `Failed to toggle desktop mode: ${data.detail || res.statusText || 'Server error'}`);
      }
    } catch (err: any) {
      addTelemetryEvent('ERROR', `Failed to toggle desktop mode: ${err.message}`);
    } finally {
      setIsTogglingDesktopMode(false);
    }
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

  const isFetchingDeviceRef = useRef(false);
  const fetchData = useCallback(async () => {
    if (!isDocVisibleRef.current || isFetchingRef.current) return;
    isFetchingRef.current = true;
    const t0 = performance.now();
    try {
      const [projRes, docRes, framesRes, queueRes, cfgRes, modeRes, telRes] = await Promise.all([
        api('/api/projects'), api('/api/document?summary_only=true'), api('/api/frames'), api('/api/recapture-queue'),
        api('/api/config'), api('/api/pipeline/mode'), api('/api/telemetry')
      ]);
      setLatencyMs(Math.round(performance.now() - t0));
      const isConnected = projRes.ok || docRes.ok || framesRes.ok || cfgRes.ok || telRes.ok;
      setBackendConnected(isConnected);
      if (projRes.ok) {
        try {
          const pList = await projRes.json();
          if (Array.isArray(pList)) {
            const filtered = pList.filter((p: any) => p && !deletedProjectIdsRef.current.has(p.id));
            setProjects(filtered);
            const act = filtered.find((p: any) => p.is_active) || filtered[0] || null;
            setActiveProject(act);
            if (!act) {
              setFrames([]);
              setDocumentData({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });
            }
          }
        } catch {}
      }
      if (docRes.ok) {
        try {
          const d = await docRes.json();
          if (d) {
            setDocumentData(prev => ({
              ...prev,
              total_lines: d.total_lines ?? prev.total_lines,
              issue_count: d.issue_count ?? prev.issue_count,
              min_line: d.min_line ?? prev.min_line,
              max_line: d.max_line ?? prev.max_line,
              lines: d.lines && d.lines.length > 0 ? d.lines : prev.lines
            }));
            if (d.token_stats) setTokenStats(d.token_stats);
          }
        } catch {}
      }
      if (framesRes.ok) {
        try {
          const fList: FrameData[] = await framesRes.json();
          if (Array.isArray(fList)) {
            setFrames(prev => {
              if (
                prev.length === fList.length &&
                prev.length > 0 &&
                prev[0].frame_id === fList[0].frame_id &&
                prev[prev.length - 1].frame_id === fList[fList.length - 1].frame_id &&
                prev[prev.length - 1].bottom_line === fList[fList.length - 1].bottom_line &&
                prev[prev.length - 1].status === fList[fList.length - 1].status &&
                prev.every((pf, idx) => {
                  const nf = fList[idx];
                  return (
                    pf.frame_id === nf.frame_id &&
                    pf.status === nf.status &&
                    pf.top_line === nf.top_line &&
                    pf.bottom_line === nf.bottom_line &&
                    pf.extracted_line_count === nf.extracted_line_count &&
                    pf.custom_offset_y === nf.custom_offset_y
                  );
                })
              ) {
                return prev;
              }
              return fList;
            });
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
    } catch { setBackendConnected(false); }
    finally { isFetchingRef.current = false; }

    if (!isFetchingDeviceRef.current) {
      isFetchingDeviceRef.current = true;
      Promise.all([
        api('/api/device/info'),
        api('/api/device/alignment'),
        api('/api/device/desktop-mode')
      ]).then(async ([devRes, alignRes, deskRes]) => {
        if (devRes.ok) { try { setDeviceInfo(await devRes.json()); } catch {} }
        if (alignRes.ok) { try { setAlignmentData(await alignRes.json()); } catch {} }
        if (deskRes.ok) {
          try {
            const d = await deskRes.json();
            if (typeof d.desktop_mode_enabled === 'boolean') setDesktopModeEnabled(d.desktop_mode_enabled);
            if (typeof d.desktop_keyboard_prohibited === 'boolean') setDesktopKeyboardProhibited(d.desktop_keyboard_prohibited);
            setDesktopVerification(d);
          } catch {}
        }
      }).catch(() => {}).finally(() => {
        isFetchingDeviceRef.current = false;
      });
    }
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
    setInspectorMode('live');
    setOcrInspectImageId('');
    await api(`/api/projects/${id}/activate`, { method: 'POST' });
    await fetchData();
  };

  const isCreatingProjectRef = useRef(false);
  const handleCreateProject = async (overrideName?: string, autoStartLoop?: boolean) => {
    if (isCreatingProjectRef.current) return;
    const projName = (typeof overrideName === 'string' ? overrideName : newProject.name).trim();
    if (!projName) return;
    isCreatingProjectRef.current = true;

    setInspectorMode('live');
    setOcrInspectImageId('');
    setShowDag(true);
    setSelectedDag('all');
    setProjectInitProgress(null);
    addTelemetryEvent('SYSTEM', `Created project "${projName}" (Ready to run loop)`, null, 'initialize');
    setShowNewProjectModal(false);

    try {
      const selectedProf = deviceProfiles.find(p => p.id === newProject.deviceProfileId);
      const payload: any = {
        name: projName,
        description: newProject.desc || (alignmentData?.file_name ? `File: ${alignmentData.file_name}` : ''),
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
        payload.scroll_padding_lines = selectedProf.scroll_padding_lines ?? 4;
        payload.arrow_count_init = selectedProf.arrow_count_init ?? ((selectedProf.lines_per_page + (selectedProf.scroll_padding_lines ?? 4)) * 2);
        payload.arrow_count_step = selectedProf.arrow_count_step ?? (selectedProf.lines_per_page + (selectedProf.scroll_padding_lines ?? 4));
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
        if (autoStartLoop) {
          await handleStartStopCaptureLoop(true);
        }
      } else {
        const errData = await res.json().catch(() => ({ detail: 'Failed to create project' }));
        setProjectInitProgress(prev => prev ? ({ ...prev, status: 'error', error: errData.detail || 'Failed to create project', stage: 'Project creation failed' }) : null);
      }
    } catch (e: any) {
      setProjectInitProgress(prev => prev ? ({ ...prev, status: 'error', error: e.message, stage: 'Network error creating project' }) : null);
    } finally {
      isCreatingProjectRef.current = false;
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
      if (activeProject.scroll_padding_lines !== undefined && activeProject.scroll_padding_lines !== null) {
        setScrollPaddingLinesInput(activeProject.scroll_padding_lines);
      }
      if (activeProject.arrow_count_init !== undefined && activeProject.arrow_count_init !== null) {
        setArrowCountInitInput(activeProject.arrow_count_init);
      }
      if (activeProject.arrow_count_step !== undefined && activeProject.arrow_count_step !== null) {
        setArrowCountStepInput(activeProject.arrow_count_step);
      }
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
        if (hc.dispatch_method) setHidDispatchMethod(hc.dispatch_method);
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
          if (sp.scroll_padding_lines !== undefined) setScrollPaddingLinesInput(sp.scroll_padding_lines);
          if (sp.arrow_count_init !== undefined) setArrowCountInitInput(sp.arrow_count_init);
          if (sp.arrow_count_step !== undefined) setArrowCountStepInput(sp.arrow_count_step);
          setSettleDelayInput(sp.settle_delay_ms || 50);
          if (sp.hid_config) {
            setHidCtrlKey(sp.hid_config.ctrl_key || 113);
            setHidHomeKey(sp.hid_config.home_key || 122);
            setHidEndKey(sp.hid_config.end_key || 123);
            setHidDownKey(sp.hid_config.down_key || 20);
            setHidRepeatDelay(sp.hid_config.repeat_delay_ms || 15);
            setHidActionSettle(sp.hid_config.action_settle_ms || 50);
            if (sp.hid_config.dispatch_method) setHidDispatchMethod(sp.hid_config.dispatch_method);
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
          scroll_padding_lines: Number(scrollPaddingLinesInput),
          arrow_count_init: Number(arrowCountInitInput),
          arrow_count_step: Number(arrowCountStepInput),
          settle_delay_ms: Number(settleDelayInput),
          hid_config: {
            ctrl_key: Number(hidCtrlKey),
            home_key: Number(hidHomeKey),
            end_key: Number(hidEndKey),
            down_key: Number(hidDownKey),
            repeat_delay_ms: Number(hidRepeatDelay),
            action_settle_ms: Number(hidActionSettle),
            scroll_padding_lines: Number(scrollPaddingLinesInput),
            arrow_count_init: Number(arrowCountInitInput),
            arrow_count_step: Number(arrowCountStepInput),
            dispatch_method: hidDispatchMethod
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
          scroll_padding_lines: Number(scrollPaddingLinesInput),
          arrow_count_init: Number(arrowCountInitInput),
          arrow_count_step: Number(arrowCountStepInput),
          settle_delay_ms: Number(settleDelayInput),
          lock_device: Boolean(lockDeviceInput),
          hid_config: {
            ctrl_key: Number(hidCtrlKey),
            home_key: Number(hidHomeKey),
            end_key: Number(hidEndKey),
            down_key: Number(hidDownKey),
            repeat_delay_ms: Number(hidRepeatDelay),
            action_settle_ms: Number(hidActionSettle),
            scroll_padding_lines: Number(scrollPaddingLinesInput),
            arrow_count_init: Number(arrowCountInitInput),
            arrow_count_step: Number(arrowCountStepInput),
            dispatch_method: hidDispatchMethod
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
      if (p.scroll_padding_lines !== undefined) setScrollPaddingLinesInput(p.scroll_padding_lines);
      if (p.arrow_count_init !== undefined) setArrowCountInitInput(p.arrow_count_init);
      if (p.arrow_count_step !== undefined) setArrowCountStepInput(p.arrow_count_step);
      if (p.settle_delay_ms) setSettleDelayInput(p.settle_delay_ms);
      if (p.hid_config) {
        if (p.hid_config.ctrl_key) setHidCtrlKey(p.hid_config.ctrl_key);
        if (p.hid_config.home_key) setHidHomeKey(p.hid_config.home_key);
        if (p.hid_config.end_key) setHidEndKey(p.hid_config.end_key);
        if (p.hid_config.down_key) setHidDownKey(p.hid_config.down_key);
        if (p.hid_config.repeat_delay_ms) setHidRepeatDelay(p.hid_config.repeat_delay_ms);
        if (p.hid_config.action_settle_ms) setHidActionSettle(p.hid_config.action_settle_ms);
        if (p.hid_config.dispatch_method) setHidDispatchMethod(p.hid_config.dispatch_method);
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
          scroll_padding_lines: Number(scrollPaddingLinesInput),
          arrow_count_init: Number(arrowCountInitInput),
          arrow_count_step: Number(arrowCountStepInput),
          settle_delay_ms: Number(settleDelayInput),
          hid_config: {
            ctrl_key: Number(hidCtrlKey),
            home_key: Number(hidHomeKey),
            end_key: Number(hidEndKey),
            down_key: Number(hidDownKey),
            repeat_delay_ms: Number(hidRepeatDelay),
            action_settle_ms: Number(hidActionSettle),
            scroll_padding_lines: Number(scrollPaddingLinesInput),
            arrow_count_init: Number(arrowCountInitInput),
            arrow_count_step: Number(arrowCountStepInput),
            dispatch_method: hidDispatchMethod
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

    const wasActiveBeforeDelete = activeProjectRef.current?.id === id;
    deletedProjectIdsRef.current.add(id);
    setDeletingProjectId(id);
    setProjects(prev => {
      const remaining = prev.filter(p => p.id !== id);
      if (wasActiveBeforeDelete) {
        const nextActive = remaining.find(p => p.is_active) || remaining[0] || null;
        setActiveProject(nextActive);
      }
      return remaining;
    });
    if (wasActiveBeforeDelete) {
      setFrames([]);
      setSelectedFrameId(null);
      setSelectedFrameIds(new Set());
      setSelectedLineNumbers(new Set());
      setDocumentData({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });
      setInspectorMode('live');
      setOcrInspectImageId('');
    }

    try {
      console.log(`[App] Sending DELETE /api/projects/${id}`);
      const res = await api(`/api/projects/${id}`, { method: 'DELETE' });
      console.log(`[App] DELETE /api/projects/${id} response status:`, res.status, res.ok);
      if (res.ok || res.status === 404) {
        const delData = await res.json().catch(() => null);
        if (Array.isArray(delData?.projects)) {
          const filtered = delData.projects.filter((p: any) => p && !deletedProjectIdsRef.current.has(p.id));
          setProjects(filtered);
          const nextAct = (delData.active_project && !deletedProjectIdsRef.current.has(delData.active_project.id))
            ? delData.active_project
            : (filtered.find((p: any) => p.is_active) || filtered[0] || null);
          setActiveProject(nextAct);
          if (!nextAct) {
            setFrames([]);
            setSelectedFrameId(null);
            setSelectedFrameIds(new Set());
            setSelectedLineNumbers(new Set());
            setDocumentData({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });
            setInspectorMode('live');
            setOcrInspectImageId('');
          }
        }
        addTelemetryEvent('SYSTEM', `Deleted project "${projName}" (${id})`);
      } else {
        deletedProjectIdsRef.current.delete(id);
        await fetchData();
        const err = await res.json().catch(() => ({ detail: 'Failed to delete project' }));
        console.error('[App] DELETE failed:', err);
        await showAlert({ title: 'Delete Failed', message: err.detail || 'Failed to delete project.', variant: 'danger' });
      }
    } catch (e: any) {
      deletedProjectIdsRef.current.delete(id);
      await fetchData();
      console.error('[App] DELETE exception:', e);
      await showAlert({ title: 'Delete Error', message: e.message || 'Network error deleting project.', variant: 'danger' });
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleExportMarkdown = async (projectIdOrEvent?: string | React.MouseEvent, projectName?: string) => {
    const targetPid = typeof projectIdOrEvent === 'string' && projectIdOrEvent.trim() ? projectIdOrEvent.trim() : activeProject?.id;
    const targetName = projectName || (targetPid ? projects.find(p => p.id === targetPid)?.name : undefined) || activeProject?.name || 'document';
    setIsExportingMarkdown(true);
    try {
      const endpoint = targetPid
        ? `${API_BASE}/api/projects/${encodeURIComponent(targetPid)}/export-markdown`
        : `${API_BASE}/api/document/export-markdown`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to export markdown file');
      }
      const headerCount = Number(res.headers.get('x-markdown-download-count'));
      if (targetPid) {
        setProjects(prev => prev.map(p => {
          if (p.id !== targetPid) return p;
          const nextCount = Number.isFinite(headerCount) && headerCount > 0 ? headerCount : ((p.markdown_download_count ?? 0) + 1);
          return { ...p, markdown_download_count: nextCount };
        }));
        setActiveProject(prev => {
          if (!prev || prev.id !== targetPid) return prev;
          const nextCount = Number.isFinite(headerCount) && headerCount > 0 ? headerCount : ((prev.markdown_download_count ?? 0) + 1);
          return { ...prev, markdown_download_count: nextCount };
        });
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `${targetName}.md`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addTelemetryEvent('SYSTEM', `Verified lines saved as markdown: ${filename} ✔`, undefined, 'system');
    } catch (e: any) {
      console.error('[App] handleExportMarkdown error:', e);
      await showAlert({ title: 'Export Failed', message: e.message || 'Could not export markdown file.', variant: 'danger' });
    } finally {
      setIsExportingMarkdown(false);
    }
  };

  const handleExportProject = async (projectId: string, projectName?: string) => {
    setIsExportingProject(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/export`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to export project archive');
      }
      const headerCount = Number(res.headers.get('x-project-download-count'));
      setProjects(prev => prev.map(p => {
        if (p.id !== projectId) return p;
        const nextCount = Number.isFinite(headerCount) && headerCount > 0 ? headerCount : ((p.project_download_count ?? 0) + 1);
        return { ...p, project_download_count: nextCount };
      }));
      setActiveProject(prev => {
        if (!prev || prev.id !== projectId) return prev;
        const nextCount = Number.isFinite(headerCount) && headerCount > 0 ? headerCount : ((prev.project_download_count ?? 0) + 1);
        return { ...prev, project_download_count: nextCount };
      });
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `${projectName || projectId}.zip`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addTelemetryEvent('SYSTEM', `Project archive exported: ${filename} ✔`, undefined, 'system');
    } catch (e: any) {
      console.error('[App] handleExportProject error:', e);
      await showAlert({ title: 'Export Failed', message: e.message || 'Could not export project archive.', variant: 'danger' });
    } finally {
      setIsExportingProject(false);
    }
  };

  const handleImportProject = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      await showAlert({ title: 'Invalid File', message: 'Please select a .zip project archive.', variant: 'warning' });
      return;
    }
    setIsImportingProject(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/projects/import`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        addTelemetryEvent('SYSTEM', `Project imported successfully: ${data.project?.name} (${data.frames_imported} frames, ${data.lines_imported} lines) ✔`, undefined, 'system');
        await fetchData();
      } else {
        await showAlert({ title: 'Import Failed', message: data.detail || 'Failed to import project archive.', variant: 'danger' });
      }
    } catch (e: any) {
      console.error('[App] handleImportProject error:', e);
      await showAlert({ title: 'Import Error', message: e.message || 'Network error importing project.', variant: 'danger' });
    } finally {
      setIsImportingProject(false);
      if (projectImportInputRef.current) projectImportInputRef.current.value = '';
      if (sidebarImportInputRef.current) sidebarImportInputRef.current.value = '';
    }
  };

  const handleDeleteFrame = async (id: string, e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    const ok = await confirm({ title: 'Delete Frame', message: 'Delete this frame from the document? Invalid lines will be replaced and frontier will recover.', variant: 'danger', confirmText: 'Delete & Recover' });
    if (!ok) return;
    setDeletingFrameId(id);
    try {
      const idx = sortedFrames.findIndex(f => f.frame_id === id);
      const fallbackFrame = idx > 0 ? sortedFrames[idx - 1] : (sortedFrames.length > 1 ? sortedFrames[1] : null);
      const res = await api(`/api/frames/${id}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        const data = await res.json().catch(() => null);
        setFrames(prev => prev.filter(f => f.frame_id !== id));
        if (selectedFrameId === id) {
          setSelectedFrameId(fallbackFrame?.frame_id || null);
        }
        if (ocrInspectImageId === id) {
          setOcrInspectImageId(fallbackFrame?.frame_id || '');
        }
        if (data?.recovery?.frontier_bottom_line !== undefined) {
          setTelemetry(p => ({ ...p, current_bottom_line: data.recovery.frontier_bottom_line }));
        }
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
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const base = API_BASE.startsWith('http') ? API_BASE.replace(/^http/, 'ws') : `${proto}//${window.location.host}`;
      ws = new WebSocket(`${base}/ws`);
      ws.onopen = () => {
        if (isDisposed) { ws?.close(); return; }
        setWsConnected(true);
        setBackendConnected(true);
        addTelemetryEvent('WS', 'Connected to telemetry stream');
      };
      ws.onclose = () => {
        if (isDisposed) return;
        setWsConnected(false);
        timer = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        if (isDisposed) return;
        ws?.close();
      };
      ws.onmessage = (e) => {
        if (isDisposed) return;
        try {
          const msg = JSON.parse(e.data);
          const newF = msg.data?.frame_id ? msg.data : (msg.frame?.frame_id ? msg.frame : null);
          if (msg.type === 'new_frame' && newF) {
            setFrames(p => [...p.filter(f => f.frame_id !== newF.frame_id), newF]);
            setSelectedFrameId(curr => (curr ? curr : newF.frame_id));
            if (msg.alignment) {
              setAlignmentData(msg.alignment);
            } else if (newF.top_line > 0 || newF.bottom_line > 0) {
              setAlignmentData(prev => ({
                ...prev,
                first_line_number: newF.top_line > 0 ? newF.top_line : prev.first_line_number,
                last_line_number: newF.bottom_line > 0 ? newF.bottom_line : prev.last_line_number,
              }));
            }
            if (msg.telemetry) {
              setTelemetry(p => ({ ...p, ...msg.telemetry }));
            } else if (newF.top_line > 0 || newF.bottom_line > 0) {
              setTelemetry(p => ({
                ...p,
                current_top_line: newF.top_line > 0 ? newF.top_line : p.current_top_line,
                current_bottom_line: newF.bottom_line > 0 ? newF.bottom_line : p.current_bottom_line,
              }));
            }
            addTelemetryEvent('FRAME', `New frame: ${newF.frame_id.slice(0, 8)}`, { frame_id: newF.frame_id, top_line: newF.top_line, bottom_line: newF.bottom_line, page_index: newF.page_index }, 'capture_entire_markdown');
            apiJson<any>('/api/document').then(d => { setDocumentData(d); if (d.token_stats) setTokenStats(d.token_stats); });
          } else if (msg.type === 'frame_deleted') {
            if (Array.isArray(msg.frames)) {
              setFrames(msg.frames);
            } else if (msg.frame_id) {
              setFrames(p => p.filter(f => f.frame_id !== msg.frame_id));
            }
            if (msg.recovery?.frontier_bottom_line !== undefined) {
              setTelemetry(p => ({ ...p, current_bottom_line: msg.recovery.frontier_bottom_line }));
            }
            addTelemetryEvent('FRAME', msg.recovery?.message || `Frame ${msg.frame_id?.slice(0, 8)} deleted`);
          } else if (msg.type === 'frames_purged') {
            setFrames([]);
            setSelectedFrameId(null);
            setSelectedFrameIds(new Set());
          } else if (msg.type === 'project_deleted') {
            if (msg.project_id) {
              deletedProjectIdsRef.current.add(msg.project_id);
            }
            if (msg.projects) {
              setProjects(msg.projects.filter((item: any) => item && !deletedProjectIdsRef.current.has(item.id)));
            } else {
              setProjects(p => p.filter(item => item.id !== msg.project_id));
            }
            if (activeProjectRef.current?.id === msg.project_id || !msg.active_project) {
              setActiveProject(msg.active_project || null);
              setInspectorMode('live');
              setOcrInspectImageId('');
              if (!msg.active_project) {
                setFrames([]);
                setSelectedFrameId(null);
                setSelectedFrameIds(new Set());
                setSelectedLineNumbers(new Set());
                setDocumentData({ total_lines: 0, issue_count: 0, min_line: 0, max_line: 0, lines: [] });
              }
            }
          } else if (msg.type === 'project_switched' || msg.type === 'project_updated') {
            if (msg.type === 'project_updated' && msg.project?.id) {
              setProjects(prev => prev.map(p => p.id === msg.project.id ? { ...p, ...msg.project } : p));
              if (activeProjectRef.current?.id === msg.project.id || msg.project.is_active) {
                setActiveProject(msg.project);
              }
            } else {
              const isDifferentProject = msg.type === 'project_switched' || (msg.project?.id && msg.project.id !== activeProjectRef.current?.id);
              setActiveProject(msg.project || null);
              if (isDifferentProject) {
                setInspectorMode('live');
                setOcrInspectImageId('');
              }
              fetchData();
            }
          } else if (msg.type === 'document_updated') {
            const docObj = msg.data || msg.document;
            if (docObj) {
              setDocumentData(prev => ({
                ...prev,
                total_lines: docObj.total_lines ?? prev.total_lines,
                issue_count: docObj.issue_count ?? prev.issue_count,
                min_line: docObj.min_line ?? prev.min_line,
                max_line: docObj.max_line ?? prev.max_line,
                lines: docObj.lines && docObj.lines.length > 0 ? docObj.lines : prev.lines
              }));
              if (docObj.token_stats) setTokenStats(docObj.token_stats);
              if (followCurrentProcess) {
                fetchLazyLines(undefined, undefined, true);
              }
            }
          } else if (msg.type === 'rescan_all_frames_progress') {
            setSequentialRescanStatus({
              is_running: true,
              current_index: msg.current_index || 0,
              total_frames: msg.total_frames || 0,
              current_frame_id: msg.current_frame_id,
              current_top_line: msg.current_top_line,
              current_bottom_line: msg.current_bottom_line,
              total_verified_lines: msg.total_verified_lines,
              status_message: msg.status_message
            });
            window.dispatchEvent(new CustomEvent('rescan_all_frames_update', { detail: msg }));
          } else if (msg.type === 'rescan_all_frames_complete') {
            setSequentialRescanStatus(p => ({ ...p, is_running: false }));
            window.dispatchEvent(new CustomEvent('rescan_all_frames_update', { detail: msg }));
            fetchData();
          } else if (msg.type === 'headless_telemetry_started' || msg.type === 'headless_telemetry_progress') {
            if (msg.telemetry) {
              setHeadlessTelemetry(msg.telemetry);
            }
          } else if (msg.type === 'headless_telemetry_complete') {
            if (msg.telemetry) {
              setHeadlessTelemetry(msg.telemetry);
            }
            setIsHeadlessTelemetryOpen(true);
            fetchData();
          } else if (msg.type === 'headless_mode_updated') {
            if (typeof msg.headless_mode === 'boolean') {
              setHeadlessMode(msg.headless_mode);
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
          } else if ((msg.type === 'telemetry_updated' || msg.type === 'telemetry') && (msg.data || msg.telemetry)) {
            const tData = msg.telemetry || msg.data;
            setTelemetry(p => ({ ...p, ...tData }));
            if (typeof tData.desktop_keyboard_prohibited === 'boolean') {
              setDesktopKeyboardProhibited(tData.desktop_keyboard_prohibited);
            }
            if (typeof tData.desktop_mode_enabled === 'boolean') {
              setDesktopModeEnabled(tData.desktop_mode_enabled);
            }
          } else if (msg.type === 'keyboard_prohibit_changed') {
            if (typeof msg.desktop_keyboard_prohibited === 'boolean') {
              setDesktopKeyboardProhibited(msg.desktop_keyboard_prohibited);
            }
          } else if (msg.type === 'desktop_mode_changed') {
            if (typeof msg.desktop_mode_enabled === 'boolean') {
              setDesktopModeEnabled(msg.desktop_mode_enabled);
              // Only fallback to phone if external desktop hardware is strictly disconnected
              if (msg.hardware_connected === false) {
                setLiveMode('phone');
              }
            }
            setDesktopVerification(msg);
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
            const ev = msg.event;
            setEventsLog(prev => {
              const eventId = ev.id || `${Date.now()}-${Math.random()}`;
              if (prev.some(e => e.id === eventId)) {
                return prev;
              }
              return [...prev.slice(-499), { ...ev, id: eventId, ts: Date.now() }];
            });
          } else if (msg.type === 'key_event_telemetry' && msg.event) {
            const k = msg.event;
            const codes: number[] = Array.isArray(k.keycodes) ? k.keycodes : [];
            const downs = codes.filter((c: number) => c === 20).length;
            const caller = k.caller_node || 'system';
            const isHid = String(k.key_name || '').startsWith('CTRL_');
            const keyDag = caller === 'arrow_down' ? 'position_navigation' : (isHid ? 'initialize' : 'system');
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
            if (msg.dag && typeof msg.dag.headless_mode === 'boolean') {
              setHeadlessMode(msg.dag.headless_mode);
            }
            if (msg.telemetry) {
              setTelemetry(p => ({ ...p, ...msg.telemetry }));
            }
            if (msg.alignment) {
              setAlignmentData(msg.alignment);
            }
            const dagNodeId = msg.node_id || msg.dag?.current_active_node || 'init_end';
            const devName = deviceInfoRef.current?.active_model || (deviceModelRef.current === 'pixel_10' ? 'Pixel 10 Pro XL' : 'Pixel 8 Pro');
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
            if (msg.telemetry) setTelemetry(p => ({ ...p, ...msg.telemetry }));
            if (msg.multipart_state) setMultipartState(msg.multipart_state);
          } else if (msg.type === 'capture_loop_status') {
            if (typeof msg.running === 'boolean') {
              setIsCaptureLoopRunning(msg.running);
            }
            if (msg.telemetry) {
              setTelemetry(p => ({ ...p, ...msg.telemetry }));
            }
          } else if (msg.type === 'multipart_transition_status' || msg.type === 'multipart_transition_completed' || msg.type === 'multipart_bundle_completed' || msg.type === 'markdown_part_exported') {
            if (msg.multipart_state) {
              setMultipartState(msg.multipart_state);
            }
            if (msg.project) {
              setActiveProject(msg.project);
            }
            if (msg.type === 'multipart_transition_completed' || msg.type === 'multipart_bundle_completed') {
              setStreamKey(Date.now());
              fetchData();
            }
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
    return () => {
      isDisposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
      }
    };
  }, [addTelemetryEvent, fetchData]);

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

  const sortedFrames = useMemo(
    () =>
      [...frames].sort(
        (a, b) =>
          (a.page_index || 0) - (b.page_index || 0) ||
          (a.created_at || '').localeCompare(b.created_at || '') ||
          (a.top_line || 0) - (b.top_line || 0)
      ),
    [frames]
  );
  const effectiveSelectedFrameId = useMemo(
    () =>
      (inspectorMode === 'ocr_inspect' &&
      ocrInspectImageId &&
      ocrInspectImageId !== 'dag_node3_capture_temp' &&
      frames.some((f) => f.frame_id === ocrInspectImageId)
        ? ocrInspectImageId
        : selectedFrameId) ||
      (ocrInspectImageId &&
      ocrInspectImageId !== 'dag_node3_capture_temp' &&
      frames.some((f) => f.frame_id === ocrInspectImageId)
        ? ocrInspectImageId
        : null),
    [inspectorMode, ocrInspectImageId, selectedFrameId, frames]
  );

  const activeFrame = useMemo(
    () => (effectiveSelectedFrameId ? frames.find(f => f.frame_id === effectiveSelectedFrameId) : null) || sortedFrames[0] || null,
    [frames, effectiveSelectedFrameId, sortedFrames]
  );

  const activeFramePageNum = useMemo(() => {
    if (!activeFrame || sortedFrames.length === 0) return 1;
    const idx = sortedFrames.findIndex(f => f.frame_id === activeFrame.frame_id);
    const hasPg1 = sortedFrames.some(f => f.page_index === 1);
    if (idx === 0 && (!activeFrame.page_index || activeFrame.page_index > 1) && !hasPg1) return 1;
    return activeFrame.page_index || (idx >= 0 ? idx + 1 : 1);
  }, [activeFrame, sortedFrames]);

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

  const globalCurrentLine = sortedFrames.length > 0
    ? Math.max(lastCaptured?.bottom_line || 0, documentData.max_line || 0)
    : Math.max(telemetry.current_bottom_line || 0, documentData.max_line || 0, lastCapturedLine || 0);
  const globalTargetLines = activeProject?.target_total_lines || telemetry.target_total_lines || headlessTelemetry?.target_total_lines || 0;
  const globalPercent = globalTargetLines > 0 ? Math.min(100, Math.round((globalCurrentLine / globalTargetLines) * 100)) : 0;

  return (
    <div className="studio-root" data-testid="matrix-capture-studio">
      {/* Unified Top Navigation Bar (Single 48px Row) */}
      <header className="unified-top-navbar">
        {/* Left: App Brand + Project Selector Dropdown + Device Target Pill */}
        <div className="navbar-left">
          <div className="brand-group" style={{ display: 'flex', alignItems: 'center', gap: '7px', marginRight: '4px' }}>
            <span className="brand-dot" />
            <h1 className="brand-title" style={{ fontSize: '13.5px', fontWeight: 800, margin: 0, whiteSpace: 'nowrap' }}>Small-Fling</h1>
          </div>

          {/* Project Selector Dropdown */}
          <div ref={projectDropdownRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <button
              type="button"
              className="project-badge"
              onClick={() => setShowProjectDropdown(p => !p)}
              title={activeProject?.description ? `File: ${activeProject.description}` : (activeProject?.name || 'Select Project')}
              style={{ height: '30px', padding: '0 10px', gap: '6px' }}
            >
              <FolderKanban size={13} color="#00ff9d" />
              <span className="project-badge-name" style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeProject ? activeProject.name : 'Select Project'}
              </span>
              {(multipartState.is_multipart || alignmentData.is_multipart || (alignmentData.file_name || '').toLowerCase().includes('part')) && (
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: multipartState.auto_chain_enabled ? 'rgba(0, 255, 157, 0.16)' : 'rgba(139, 148, 158, 0.2)',
                  color: multipartState.auto_chain_enabled ? '#00ff9d' : '#8b949e',
                  border: `1px solid ${multipartState.auto_chain_enabled ? 'rgba(0, 255, 157, 0.4)' : '#30363d'}`
                }}>
                  Part {multipartState.current_part || alignmentData.part_number || 1}
                  {(multipartState.total_parts || alignmentData.total_parts) ? `..${multipartState.total_parts || alignmentData.total_parts}` : '..N'}
                </span>
              )}
              <ChevronDown size={11} />
            </button>

            <input
              type="file"
              ref={projectImportInputRef}
              accept=".zip"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImportProject(file);
              }}
            />

            {showProjectDropdown && (
              <div className="project-dropdown-popover">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid #21262d' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#8b949e', letterSpacing: '0.5px' }}>PROJECTS ({projects.length})</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      className="btn btn-xs btn-primary"
                      onClick={() => { setShowProjectDropdown(false); setShowNewProjectModal(true); }}
                      style={{ padding: '2px 7px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      <Plus size={11} />
                      <span>New</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs btn-outline"
                      onClick={() => projectImportInputRef.current?.click()}
                      disabled={isImportingProject}
                      style={{ padding: '2px 7px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px', color: '#38bdf8', borderColor: '#38bdf855' }}
                    >
                      <Upload size={11} />
                      <span>{isImportingProject ? '...' : 'Import'}</span>
                    </button>
                    {activeProject && (
                      <>
                        <button
                          type="button"
                          className="btn-download-action variant-markdown"
                          onClick={() => handleExportMarkdown(activeProject.id, activeProject.name)}
                          disabled={isExportingMarkdown}
                          title={`Download Markdown (.md) • Downloaded ${activeProject.markdown_download_count ?? 0} time(s)`}
                        >
                          <Download size={11} />
                          <span>MD</span>
                          <span className="download-counter-badge">{activeProject.markdown_download_count ?? 0}</span>
                        </button>
                        <button
                          type="button"
                          className="btn-download-action variant-project"
                          onClick={() => handleExportProject(activeProject.id, activeProject.name)}
                          disabled={isExportingProject}
                          title={`Export Project Archive (.zip) • Downloaded ${activeProject.project_download_count ?? 0} time(s)`}
                        >
                          <Download size={11} />
                          <span>Export</span>
                          <span className="download-counter-badge">{activeProject.project_download_count ?? 0}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Multi-Part Auto-Chain Row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 8px', background: '#161b22', borderRadius: '6px', border: '1px solid #21262d', fontSize: '10.5px'
                }}>
                  <span style={{ color: '#c9d1d9', fontWeight: 600 }}>
                    📂 Multi-Part Bundle ({multipartState.current_part || alignmentData.part_number || 1}..{multipartState.total_parts || alignmentData.total_parts || 'N'})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleAutoChainMultipart(!multipartState.auto_chain_enabled)}
                    style={{
                      padding: '2px 7px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 800, cursor: 'pointer',
                      border: `1px solid ${multipartState.auto_chain_enabled ? '#00ff9d66' : '#30363d'}`,
                      background: multipartState.auto_chain_enabled ? 'rgba(0, 255, 157, 0.14)' : '#0d1117',
                      color: multipartState.auto_chain_enabled ? '#00ff9d' : '#8b949e'
                    }}
                  >
                    Auto-Chain: {multipartState.auto_chain_enabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Project List */}
                <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {projects.map(p => (
                    <div
                      key={p.id}
                      onClick={() => { handleSwitchProject(p.id); setShowProjectDropdown(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                        background: p.id === activeProject?.id ? 'rgba(56, 139, 253, 0.15)' : '#161b22',
                        border: `1px solid ${p.id === activeProject?.id ? '#58a6ff66' : '#21262d'}`,
                        gap: '8px'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#f0f6fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '9.5px', color: '#8b949e' }}>
                          {p.frame_count ?? 0} frames • {p.line_count ?? 0} lines
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn-download-action variant-markdown"
                          onClick={e => { e.stopPropagation(); handleExportMarkdown(p.id, p.name); }}
                          disabled={isExportingMarkdown}
                          title={`Download Markdown (.md) • Downloaded ${p.markdown_download_count ?? 0} time(s)`}
                        >
                          <Download size={11} />
                          <span>MD</span>
                          <span className="download-counter-badge" data-testid="project-md-download-count">{p.markdown_download_count ?? 0}</span>
                        </button>
                        <button
                          type="button"
                          className="btn-download-action variant-project"
                          onClick={e => { e.stopPropagation(); handleExportProject(p.id, p.name); }}
                          disabled={isExportingProject}
                          title={`Export Project Archive (.zip) • Downloaded ${p.project_download_count ?? 0} time(s)`}
                        >
                          <Download size={11} />
                          <span>ZIP</span>
                          <span className="download-counter-badge" data-testid="project-zip-download-count">{p.project_download_count ?? 0}</span>
                        </button>
                        <button
                          type="button"
                          className="btn-text-danger"
                          onClick={e => { e.stopPropagation(); handleDeleteProject(p.id, p.name); }}
                          disabled={deletingProjectId === p.id}
                          title="Delete project"
                          style={{ padding: '4px 5px' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Device Target Pill (Pixel 8 / Pixel 10 with lock icon) */}
          <div ref={deviceDropdownRef} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              type="button"
              className="device-target-pill"
              onClick={() => handleToggleStudio('device')}
              title="Toggle Device & ADB Hardware Drawer (Click lock icon in Device Settings to lock/unlock hardware profile)"
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: isCurrentDeviceConnected ? '#00ff9d' : '#ef4444',
                  boxShadow: isCurrentDeviceConnected ? '0 0 6px #00ff9d' : 'none'
                }}
              />
              <Smartphone size={12} color={isCurrentDeviceConnected ? '#00ff9d' : '#ef4444'} />
              <span>{deviceModel === 'pixel_8' ? 'Pixel 8' : 'Pixel 10'}</span>
              <span style={{ color: '#8b949e', fontSize: '10px' }}>({devLines}L)</span>
              <Lock size={11} color={lockDeviceInput ? '#e3b341' : '#8b949e'} />
            </button>
          </div>
        </div>

        {/* Center: 3 Primary Workspace Mode Pills */}
        <div className="navbar-center" role="tablist" aria-label="Workspace Modes">
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'capture_dag'}
            className={`workspace-mode-pill ${workspaceMode === 'capture_dag' ? 'active' : ''}`}
            onClick={() => setWorkspaceMode('capture_dag')}
          >
            <span>⚡ 1. Capture &amp; DAG Flow</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'ocr_inspector'}
            className={`workspace-mode-pill ${workspaceMode === 'ocr_inspector' ? 'active' : ''}`}
            onClick={() => setWorkspaceMode('ocr_inspector')}
          >
            <span>🔍 2. OCR Line Inspector</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'analyzer_sandbox'}
            className={`workspace-mode-pill ${workspaceMode === 'analyzer_sandbox' ? 'active' : ''}`}
            onClick={() => setWorkspaceMode('analyzer_sandbox')}
          >
            <span>🛠️ 3. Analyzer &amp; Sandbox IDE</span>
          </button>
        </div>

        {/* Right: Execution Mode Toggle + Global Progress Pill + Primary CTA */}
        <div className="navbar-right">
          <div className="exec-mode-toggle" title="Switch between Headless Speed and Live Monitor">
            <button
              type="button"
              className={`exec-mode-btn headless ${headlessMode ? 'active' : ''}`}
              onClick={() => { if (!headlessMode) handleToggleHeadlessMode(); }}
            >
              <span>⚡ Headless Speed</span>
            </button>
            <button
              type="button"
              className={`exec-mode-btn live ${!headlessMode ? 'active' : ''}`}
              onClick={() => { if (headlessMode) handleToggleHeadlessMode(); }}
            >
              <span>👁️ Live Monitor</span>
            </button>
          </div>

          <div
            className="global-progress-pill"
            onClick={() => setIsTelemetryExpanded(p => !p)}
            style={{ cursor: 'pointer' }}
            title="Click to toggle telemetry & event drawer"
          >
            <span style={{ color: '#00ff9d' }}>Ln {globalCurrentLine}</span>
            <span style={{ color: '#8b949e' }}>/</span>
            <span>{globalTargetLines || '—'}</span>
            <span style={{ color: '#8b949e' }}>•</span>
            <span style={{ color: '#58a6ff' }}>{globalPercent}%</span>
          </div>

          <button
            type="button"
            className={`primary-cta-pipeline-btn ${isCaptureLoopRunning ? 'stop' : 'run'}`}
            title={
              isCaptureLoopRunning
                ? 'Stop continuous capture loop'
                : globalCurrentLine > 0
                  ? `Auto-Resume capture loop at Line ${(globalCurrentLine + 1).toLocaleString()} (last line ${globalCurrentLine.toLocaleString()} + 1 on top)`
                  : 'Start capture pipeline from Line 1'
            }
            onClick={() => {
              if (!activeProject && !isCaptureLoopRunning) {
                handleCreateProject(startupProjectName || alignmentData.file_name || 'Markdown_Capture_Part1.md', true);
              } else {
                handleStartStopCaptureLoop(!isCaptureLoopRunning);
              }
            }}
          >
            <span>
              {isCaptureLoopRunning
                ? '⏹ Stop'
                : globalCurrentLine > 0 && (globalTargetLines <= 0 || globalCurrentLine < globalTargetLines)
                  ? `▶ Resume (Ln ${globalCurrentLine + 1})`
                  : '▶ Run Pipeline'}
            </span>
          </button>

          <button
            type="button"
            className="gear-btn"
            onClick={() => setShowConfigModal(true)}
            title="Settings"
            aria-label="Settings"
            style={{ width: '30px', height: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Settings size={15} />
          </button>
        </div>
      </header>

      {/* Interactive DAG Pipeline Ribbon (Unified Nodes 1–12) */}
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
        isOrchestrating={Boolean(telemetry.phase?.startsWith('DAG_') || projectInitProgress?.status === 'running' || isCaptureLoopRunning)}
        onRefresh={fetchData}
        selectedDag={selectedDag}
        onSelectDag={setSelectedDag}
        selectedNodeId={selectedNodeId}
        onSelectNodeId={(nid) => {
          setSelectedNodeId(nid);
          if (nid === 'sandbox_ide') {
            setWorkspaceMode('analyzer_sandbox');
          }
        }}
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
        desktopKeyboardProhibited={desktopKeyboardProhibited}
        onToggleProhibitKeyboard={handleToggleProhibitKeyboard}
        desktopModeEnabled={desktopModeEnabled}
        onToggleDesktopMode={handleToggleDesktopMode}
        desktopVerification={desktopVerification}
        onOpenHeadlessTelemetry={() => setIsHeadlessTelemetryOpen(true)}
      />

      {!backendConnected && (
        <div style={{ backgroundColor: '#ff7b7218', borderBottom: '1px solid #ff7b7233', color: '#ff7b72', padding: '6px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', fontWeight: 500 }}>
          <AlertCircle size={14} /><span>FastAPI backend unreachable. Retrying connection to port 8000...</span>
        </div>
      )}

      <div className="studio-body">
        {workspaceMode === 'ocr_inspector' ? (
          <OcrLineInspectorWorkspace
            apiBase={API_BASE}
            projectId={activeProject?.id}
            frames={sortedFrames}
            totalLines={documentData.total_lines || documentData.max_line || 0}
            selectedFrameId={selectedFrameId}
            selectedFrameIds={selectedFrameIds}
            reprocessingFrameId={reprocessingFrameId}
            deletingFrameId={deletingFrameId}
            onSelectFrame={(fid) => setSelectedFrameId(fid)}
            onToggleSelectFrame={(fid, e) => handleToggleSelectFrame(fid, e)}
            onReprocessFrame={(fid, e) => handleReprocessFrame(fid, e)}
            onUpdateFramePosition={(fid, delta) => handleUpdateFramePosition(fid, delta)}
            onOpenTrace={(fid, e) => {
              e.stopPropagation();
              setSelectedFrameId(fid);
              setTraceFrameId(fid);
            }}
            onDeleteFrame={(fid, e) => handleDeleteFrame(fid, e)}
            onDocumentUpdated={fetchData}
          />
        ) : workspaceMode === 'analyzer_sandbox' ? (
          <AnalyzerSandboxWorkspace
            apiBase={API_BASE}
            projectId={activeProject?.id}
            onDocumentUpdated={fetchData}
          />
        ) : headlessMode && !forceWebUiInHeadless ? (
          <main
            className="frame-inspector-panel headless-console-workspace"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              background: 'radial-gradient(ellipse at 50% 0%, rgba(88, 28, 135, 0.22) 0%, #090d16 70%)',
              padding: '24px 32px',
              gap: '20px'
            }}
          >
            {/* Top Headless Command & Quality Switcher Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(168, 85, 247, 0.45)',
              borderRadius: '10px',
              padding: '16px 20px',
              boxShadow: '0 8px 28px rgba(0,0,0,0.45)'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.5)',
                    color: '#e9d5ff', padding: '3px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: 800
                  }}>
                    <Cpu size={13} color="#c084fc" />
                    <span>⚡ HEADLESS MULTI-BUNDLE ACCELERATION ACTIVE</span>
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f0f6fc' }}>
                    {activeProject ? `Active Project: ${activeProject.name}` : (alignmentData.file_name ? `Detected File: ${alignmentData.file_name}` : 'Ready to Initialize Project')}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Browser live video stream, SVG canvas, and DOM line tables are suspended so 100% of local CPU/GPU accelerates image capture, OCR, and multi-part markdown assembly.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {!activeProject ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleCreateProject(startupProjectName || alignmentData.file_name || 'Markdown_Capture_Part1.md', true)}
                    style={{ background: '#059669', borderColor: '#10b981', padding: '8px 14px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Zap size={14} />
                    <span>Create Project &amp; Start Headless Loop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleStartStopCaptureLoop(!isCaptureLoopRunning)}
                    style={{
                      background: isCaptureLoopRunning ? '#dc2626' : '#059669',
                      borderColor: isCaptureLoopRunning ? '#ef4444' : '#10b981',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Zap size={14} />
                    <span>{isCaptureLoopRunning ? '⏹ Stop Capture Loop' : '▶ Start Continuous Loop'}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setForceWebUiInHeadless(true)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.16)',
                    borderColor: '#38bdf8',
                    color: '#38bdf8',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Eye size={14} />
                  <span>🖥️ Switch to Full Web UI View (Inspect Quality)</span>
                </button>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleToggleHeadlessMode}
                  style={{ padding: '8px 12px', fontSize: '12px', color: '#cbd5e1' }}
                >
                  Turn Off Headless
                </button>
              </div>
            </div>

            {/* Live Progress & Multi-Part Bundle Status Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Document Line Progress</span>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#00ff9d', fontFamily: 'monospace' }}>
                  Ln {telemetry.current_bottom_line || documentData.max_line || 0} / {activeProject?.target_total_lines || telemetry.target_total_lines || headlessTelemetry?.target_total_lines || 'Calibrating'}
                </div>
                <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, Math.round(((telemetry.current_bottom_line || documentData.max_line || 0) / Math.max(1, activeProject?.target_total_lines || telemetry.target_total_lines || 1)) * 100))}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #10b981, #38bdf8)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <span style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                  Page #{telemetry.current_page || frames.length || 1} • {documentData.total_lines} Verified Lines • {frames.length} Frames
                </span>
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Multi-Part Markdown Bundle (`*part*.md`)</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#38bdf8' }}>
                  {multipartState.is_multipart || alignmentData.is_multipart
                    ? `Part ${multipartState.current_part || alignmentData.part_number || 1}${multipartState.total_parts || alignmentData.total_parts ? ` of ${multipartState.total_parts || alignmentData.total_parts}` : ''} (${alignmentData.file_name || activeProject?.name || ''})`
                    : (alignmentData.file_name || activeProject?.name || 'Single Markdown Document')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={() => handleToggleAutoChainMultipart(!multipartState.auto_chain_enabled)}
                    style={{
                      borderColor: multipartState.auto_chain_enabled ? '#00ff9d' : '#475569',
                      color: multipartState.auto_chain_enabled ? '#00ff9d' : '#94a3b8',
                      fontSize: '11px',
                      padding: '4px 8px'
                    }}
                  >
                    Auto-Chain Next Part: {multipartState.auto_chain_enabled ? 'ON ✔' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={() => handleTransitionNextPart(true)}
                    disabled={isTransitioningNextPart}
                    style={{ borderColor: '#38bdf8', color: '#38bdf8', fontSize: '11px', padding: '4px 8px' }}
                    title="Click Back Arrow (<-), select next part in Teams folder, maximize window (□), enable Edit + Dark mode, create project & continue"
                  >
                    {isTransitioningNextPart ? 'Opening Next Part...' : '⏭ Exit (←) & Open Next Part Now'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={handlePrepareMarkdownEditor}
                    disabled={isPreparingScreen}
                    style={{ borderColor: '#c084fc', color: '#c084fc', fontSize: '11px', padding: '4px 8px' }}
                  >
                    {isPreparingScreen ? 'Preparing...' : '□ Maximize + Edit + Dark'}
                  </button>
                </div>
                {multipartState.last_transition_message && (
                  <span style={{ fontSize: '11px', color: '#a7f3d0' }}>{multipartState.last_transition_message}</span>
                )}
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Live Engine Status</span>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', lineHeight: 1.4 }}>
                  {telemetry.status_message || headlessTelemetry?.finish_status_message || 'Ready'}
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span>Speed: <strong style={{ color: '#e2e8f0' }}>{headlessTelemetry?.lines_per_second || 0} lines/s</strong></span>
                  <span>Avg OCR: <strong style={{ color: '#e2e8f0' }}>{headlessTelemetry?.avg_ocr_latency_ms || telemetry.capture_telemetry?.last_latency_ms || 0}ms</strong></span>
                </div>
              </div>
            </div>

            {/* Exported Markdown Parts List */}
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>
                  Exported Markdown Files ({multipartState.exported_parts?.length || 0})
                </span>
                {activeProject && (
                  <button
                    type="button"
                    className="btn-download-action variant-markdown"
                    onClick={() => handleExportMarkdown(activeProject.id, activeProject.name)}
                    disabled={isExportingMarkdown}
                    style={{ fontSize: '11px', padding: '4px 10px', gap: '6px' }}
                    title={`Export verified lines as Markdown (.md) • Downloaded ${activeProject.markdown_download_count ?? 0} time(s)`}
                  >
                    <Download size={12} />
                    <span>Export Current Markdown (.md)</span>
                    <span className="download-counter-badge">{activeProject.markdown_download_count ?? 0}</span>
                  </button>
                )}
              </div>
              {multipartState.exported_parts && multipartState.exported_parts.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {multipartState.exported_parts.map((exp, idx) => (
                    <a
                      key={idx}
                      href={`${API_BASE}/api/dag/multipart/exports/${encodeURIComponent(exp.file_name)}`}
                      download={exp.file_name}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        color: '#10b981',
                        fontSize: '12px',
                        fontWeight: 600,
                        textDecoration: 'none'
                      }}
                    >
                      <Download size={13} />
                      <span>{exp.file_name}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>({exp.line_count} lines)</span>
                      <span className="download-counter-badge" title="Times downloaded">{exp.download_count ?? 0}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Completed markdown parts are automatically exported to `storage/exports/` as each part reaches its last line.
                </span>
              )}
            </div>
          </main>
        ) : activeProject ? (
          <>
            {framesMinimized || inspectorMaximized || linesMaximized ? (
              <aside
                className="window-minimized-rail"
                onClick={() => { setFramesMinimized(false); setInspectorMaximized(false); setLinesMaximized(false); setFramesMaximized(false); }}
                title={`Click to restore Captured Frames panel${activeFrame ? ` (Selected: Pg ${activeFramePageNum} • Ln ${activeFrame.top_line}→${activeFrame.bottom_line})` : ` (${frames.length} frames)`}`}
              >
                <Camera size={15} color="#00ff9d" />
                {frames.length > 0 && (
                  <span style={{
                    fontSize: '9px', fontWeight: 800, color: '#00ff9d',
                    background: 'rgba(0, 255, 157, 0.15)', border: '1px solid rgba(0, 255, 157, 0.3)',
                    borderRadius: '10px', padding: '2px 4px', lineHeight: 1
                  }}>
                    {activeFrame ? `Pg ${activeFramePageNum}` : frames.length}
                  </span>
                )}
                <span className="window-minimized-label">
                  {activeFrame ? `CAPTURED FRAMES (Pg ${activeFramePageNum}/${frames.length} • Ln ${activeFrame.top_line})` : 'CAPTURED FRAMES'}
                </span>
                <Maximize2 size={12} style={{ marginTop: 'auto' }} />
              </aside>
            ) : (
              <>
                <aside className="frames-feed-panel" style={{ width: framesMaximized ? '100%' : `${framesPanelWidth}px`, flex: framesMaximized ? '1 1 100%' : 'none', flexShrink: framesMaximized ? 1 : 0 }}>
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
                    <WindowControls
                      windowName="Captured Frames Feed"
                      onMinimize={() => { setFramesMinimized(true); setFramesMaximized(false); }}
                      onMaximize={() => {
                        setFramesMaximized(m => {
                          const next = !m;
                          if (next) { setInspectorMaximized(false); setLinesMaximized(false); setInspectorMinimized(false); }
                          return next;
                        });
                      }}
                      isMaximized={framesMaximized}
                      onClose={() => { setFramesMinimized(true); setFramesMaximized(false); }}
                    />
                  </div>

                  <div className="panel-sub-bar">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={handleStartSequentialRescanAllFrames}
                      disabled={sequentialRescanStatus.is_running}
                      title="Sequentially rescan every captured frame from top to bottom with RapidOCR to align line numbers and reconstruct the master document"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px', fontSize: '10.5px',
                        color: '#00ff9d', borderColor: '#00ff9d55',
                        background: sequentialRescanStatus.is_running ? 'rgba(0, 255, 157, 0.15)' : undefined
                      }}
                    >
                      <Layers size={11} color="#00ff9d" className={sequentialRescanStatus.is_running ? 'spin' : ''} />
                      <span>
                        {sequentialRescanStatus.is_running
                          ? `Rescanning ${sequentialRescanStatus.current_index}/${sequentialRescanStatus.total_frames}...`
                          : (selectedFrameIds.size > 0 ? `Rescan (${selectedFrameIds.size})` : 'Rescan All Frames')}
                      </span>
                    </button>
                    {/* Headless Loop Mode Toggle Button */}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={handleToggleHeadlessMode}
                      title={headlessMode
                        ? "Headless Mode ACTIVE: Live image loading is bypassed & Node 4 uses RapidOCR Inspector Rescan engine. Click to switch to visual mode."
                        : "Visual Mode ACTIVE: Click to enable ultra-fast Headless Loop Mode (RapidOCR Inspector engine without image loading)."}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px', fontSize: '10.5px',
                        color: headlessMode ? '#c084fc' : '#94a3b8',
                        borderColor: headlessMode ? 'rgba(167, 139, 250, 0.6)' : 'rgba(255, 255, 255, 0.15)',
                        background: headlessMode ? 'rgba(167, 139, 250, 0.15)' : undefined
                      }}
                    >
                      <Cpu size={11} color={headlessMode ? '#c084fc' : '#94a3b8'} />
                      <span>{headlessMode ? 'Headless: ON' : 'Headless: OFF'}</span>
                    </button>
                    {/* Headless Telemetry Progress & Summary Modal Button */}
                    {(headlessMode || headlessTelemetry?.status === 'RUNNING' || headlessTelemetry?.total_lines_reached) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => setIsHeadlessTelemetryOpen(true)}
                        title="Open Headless Telemetry & Document Coverage Summary Modal"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '3px 8px', fontSize: '10.5px',
                          color: headlessTelemetry?.total_lines_reached ? '#00ff9d' : '#c084fc',
                          borderColor: headlessTelemetry?.total_lines_reached ? 'rgba(0, 255, 157, 0.4)' : 'rgba(192, 132, 252, 0.4)',
                          background: headlessTelemetry?.total_lines_reached ? 'rgba(0, 255, 157, 0.12)' : 'rgba(192, 132, 252, 0.12)'
                        }}
                      >
                        <Activity size={11} color={headlessTelemetry?.total_lines_reached ? '#00ff9d' : '#c084fc'} />
                        <span>
                          {headlessTelemetry?.total_lines_reached
                            ? 'Summary (100% ✔)'
                            : `Telemetry ${headlessTelemetry?.completion_percent ? `(${headlessTelemetry.completion_percent}%)` : ''}`}
                        </span>
                      </button>
                    )}
                    {sequentialRescanStatus.is_running && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={handleCancelSequentialRescan}
                        title="Cancel sequential rescan"
                        style={{ padding: '3px 6px', fontSize: '10px', color: '#f85149', borderColor: '#f8514955' }}
                      >
                        <X size={10} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setIsFramesReportOpen(true)}
                      title="Open Captured Frames & Viewport Coverage Report Modal"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '10.5px', color: '#00ff9d', borderColor: '#00ff9d55' }}
                    >
                      <Camera size={11} color="#00ff9d" />
                      <span>Report</span>
                    </button>
                    {frames.some(f => f.status.startsWith('error')) && (
                      <button className="btn btn-sm btn-outline btn-warning-outline" onClick={handleReprocessAllFailed}>
                        <RotateCw size={11} /> Retry Failed
                      </button>
                    )}
                  </div>

                  {sequentialRescanStatus.is_running && (
                    <div style={{
                      padding: '6px 10px',
                      background: 'rgba(0, 255, 157, 0.08)',
                      borderBottom: '1px solid rgba(0, 255, 157, 0.2)',
                      fontSize: '10.5px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#00ff9d', fontWeight: 600, marginBottom: '4px' }}>
                        <span>Frame {sequentialRescanStatus.current_index} of {sequentialRescanStatus.total_frames}</span>
                        <span>{Math.round((sequentialRescanStatus.current_index / Math.max(1, sequentialRescanStatus.total_frames)) * 100)}%</span>
                      </div>
                      <div style={{ width: '100%', height: '4px', background: '#21262d', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.round((sequentialRescanStatus.current_index / Math.max(1, sequentialRescanStatus.total_frames)) * 100)}%`,
                          height: '100%',
                          background: '#00ff9d',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <div style={{ color: '#8b949e', fontSize: '9.5px', marginTop: '3px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {sequentialRescanStatus.status_message}
                      </div>
                    </div>
                  )}

                  <VirtualizedFrameStrip
                    frames={sortedFrames}
                    totalLines={documentData.total_lines || documentData.max_line || 0}
                    selectedFrameId={effectiveSelectedFrameId || activeFrame?.frame_id || null}
                    selectedFrameIds={selectedFrameIds}
                    apiBase={API_BASE}
                    devDisplayName={devDisplayName}
                    reprocessingFrameId={reprocessingFrameId}
                    deletingFrameId={deletingFrameId}
                    onSelectFrame={(f) => {
                      setSelectedFrameId(f.frame_id);
                      setOcrInspectImageId(f.frame_id);
                      if (inspectorMode === 'live') {
                        setInspectorMode('single');
                      }
                      setInspectorMaximized(false);
                      setFramesMinimized(false);
                    }}
                    onDoubleClickFrame={(f, e) => {
                      e.stopPropagation();
                      handleOpenInlineOcrInspector(f.frame_id);
                    }}
                    onToggleSelectFrame={(fid, e) => handleToggleSelectFrame(fid, e)}
                    onReprocessFrame={(fid, e) => handleReprocessFrame(fid, e)}
                    onUpdateFramePosition={(fid, delta) => handleUpdateFramePosition(fid, delta)}
                    onOpenTrace={(fid, e) => {
                      e.stopPropagation();
                      setSelectedFrameId(fid);
                      setTraceFrameId(fid);
                    }}
                    onDeleteFrame={(fid, e) => {
                      e.stopPropagation();
                      handleDeleteFrame(fid, e);
                    }}
                  />
                </aside>

                {!framesMaximized && !linesMaximized && !inspectorMinimized && (
                  <div
                    className={`panel-resizer ${isDraggingFrames ? 'dragging' : ''} ${armedSplitter === 'frames' ? 'hover-armed' : ''}`}
                    onMouseEnter={() => handleSplitterMouseEnter('frames')}
                    onMouseLeave={handleSplitterMouseLeave}
                    onMouseDown={handleFramesResizer}
                    onDoubleClick={() => setFramesPanelWidth(280)}
                    role="separator"
                  >
                    <div className="panel-resizer-line" />
                    <div className="panel-resizer-pill" onMouseDown={handleFramesResizer} />
                  </div>
                )}
              </>
            )}

            {inspectorMinimized || framesMaximized || linesMaximized ? (
              <aside
                className="window-minimized-rail"
                onClick={() => { setInspectorMinimized(false); setFramesMaximized(false); setLinesMaximized(false); }}
                title="Click to restore Live Viewport / Inspector"
              >
                <Monitor size={15} color="#00ff9d" />
                <span className="window-minimized-label">LIVE VIEWPORT</span>
                <Maximize2 size={12} style={{ marginTop: 'auto' }} />
              </aside>
            ) : (
              <main className="frame-inspector-panel" style={{ flex: inspectorMaximized ? '1 1 100%' : `${inspectorPercent} 1 0`, minWidth: '220px' }}>
              <div className="panel-header">
                <div style={{ display: 'flex', gap: '3px', background: '#0d1117', padding: '2px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <button className={`btn btn-sm ${inspectorMode === 'live' ? 'btn-primary' : ''}`} onClick={() => { setInspectorMode('live'); setLiveMode('desktop'); setStreamKey(Date.now()); }} style={{ fontSize: '11px', padding: '3px 8px' }}><Monitor size={11} style={{ marginRight: '4px' }} /><span>Live Desktop</span></button>
                  <button
                    className={`btn btn-sm ${inspectorMode === 'single' ? 'btn-primary' : ''}`}
                    onClick={() => {
                      if (ocrInspectImageId && ocrInspectImageId !== 'dag_node3_capture_temp') {
                        setSelectedFrameId(ocrInspectImageId);
                      }
                      setInspectorMode('single');
                    }}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    Single Frame{activeFrame ? ` (Pg ${activeFramePageNum})` : ''}
                  </button>
                  <button
                    className={`btn btn-sm ${inspectorMode === 'ocr_inspect' ? 'btn-primary' : ''}`}
                    onClick={() => handleOpenInlineOcrInspector(effectiveSelectedFrameId || (sortedFrames.length > 0 ? sortedFrames[sortedFrames.length - 1].frame_id : 'dag_node3_capture_temp'))}
                    style={{ fontSize: '11px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Open OCR Full Inspector inline (Double-click any captured frame to inspect directly)"
                  >
                    <FileText size={11} />
                    <span>OCR Inspector{activeFrame ? ` (Pg ${activeFramePageNum})` : ''}</span>
                  </button>
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
                  <WindowControls
                    windowName="Live Viewport & Inspector"
                    onMinimize={() => { setInspectorMinimized(true); setInspectorMaximized(false); }}
                    isMinimized={inspectorMinimized}
                    onMaximize={() => {
                      setInspectorMaximized(m => {
                        const next = !m;
                        if (next) { setFramesMaximized(false); setLinesMaximized(false); setInspectorMinimized(false); }
                        return next;
                      });
                    }}
                    isMaximized={inspectorMaximized}
                    onClose={handleTogglePhone}
                  />
                </div>
              </div>

              <div
                className={`inspector-view-container ${inspectorMode === 'live' ? 'live-mode' : ''} ${inspectorMode === 'ocr_inspect' ? 'ocr-inspect-mode' : ''}`}
                style={inspectorMode === 'ocr_inspect' ? { padding: 0, alignItems: 'stretch', justifyContent: 'stretch' } : undefined}
              >
                {inspectorMode === 'live' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#161b22', borderBottom: '1px solid #30363d', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {liveMode === 'desktop' ? <Monitor size={14} color="#00ff9d" /> : <Smartphone size={14} color="#58a6ff" />}
                        <span style={{ fontSize: '11px', color: liveMode === 'desktop' ? '#00ff9d' : '#58a6ff', fontFamily: 'monospace', fontWeight: 700 }}>
                          LIVE {liveMode.toUpperCase()} · {liveMode === 'desktop' ? 'MARKDOWN VIEW' : 'MIRROR VIEW'}
                        </span>

                        {/* Stream Display Mode Switcher Pill */}
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            background: '#0d1117',
                            border: '1px solid #30363d',
                            borderRadius: '4px',
                            padding: '1px',
                            marginLeft: '4px',
                          }}
                        >
                          <button
                            type="button"
                            className={`btn btn-xs ${liveMode === 'desktop' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => handleSwitchLiveMode('desktop')}
                            title="Switch to External Desktop Mode Display (16:9 1080p landscape)"
                            style={{
                              padding: '2px 8px',
                              height: '22px',
                              fontSize: '10px',
                              fontWeight: liveMode === 'desktop' ? 700 : 500,
                              background: liveMode === 'desktop' ? '#2563eb' : 'transparent',
                              color: liveMode === 'desktop' ? '#fff' : '#8b949e',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <Monitor size={11} />
                            DESKTOP
                          </button>
                          <button
                            type="button"
                            className={`btn btn-xs ${liveMode === 'phone' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => handleSwitchLiveMode('phone')}
                            title="Switch to Phone Display (9:20 portrait mirror)"
                            style={{
                              padding: '2px 8px',
                              height: '22px',
                              fontSize: '10px',
                              fontWeight: liveMode === 'phone' ? 700 : 500,
                              background: liveMode === 'phone' ? '#2563eb' : 'transparent',
                              color: liveMode === 'phone' ? '#fff' : '#8b949e',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <Smartphone size={11} />
                            PHONE
                          </button>
                        </div>
                      </div>

                      {/* Yellow Arrow 1 Target: Actuator Progress */}
                      <div className="actuator-progress-bar">
                        <Activity size={12} color="#00ff9d" />
                        <span>Actuator Progress:</span>
                        <strong style={{ color: '#ffa657' }}>
                          Capturing page {telemetry.current_page || frames.length || 1} (Target Top: Ln {telemetry.current_bottom_line ? telemetry.current_bottom_line + 1 : (documentData.max_line ? documentData.max_line + 1 : 50)} of {activeProject?.target_total_lines || telemetry.target_total_lines || 9953})
                        </strong>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                        onSwitchLiveMode={handleSwitchLiveMode}
                        alignmentData={alignmentData}
                        showBoundingBoxes={showBoundingBoxes}
                        deviceInfo={deviceInfo}
                        metaResolution={alignmentData?.resolution}
                        headlessMode={headlessMode}
                        onToggleHeadlessMode={handleToggleHeadlessMode}
                        onRefreshStream={() => setStreamKey(Date.now())}
                        topCallout={
                          <div className="gutter-line-callout top">
                            <span className="gutter-callout-icon">▲</span>
                            <span className="gutter-callout-label">TOP GUTTER:</span>
                            <span className="gutter-callout-value">
                              {(() => {
                                const topLn = alignmentData.first_line_number || telemetry.current_top_line || (sortedFrames.length > 0 ? sortedFrames[sortedFrames.length - 1]?.top_line : 0);
                                return topLn ? `Line #${topLn}` : 'Detecting...';
                              })()}
                            </span>
                          </div>
                        }
                        bottomCallout={
                          <div className="gutter-line-callout bottom">
                            <span className="gutter-callout-icon">▼</span>
                            <span className="gutter-callout-label">BOTTOM GUTTER:</span>
                            <span className="gutter-callout-value">
                              {(() => {
                                const botLn = alignmentData.last_line_number || telemetry.current_bottom_line || (sortedFrames.length > 0 ? sortedFrames[sortedFrames.length - 1]?.bottom_line : 0);
                                return botLn ? `Line #${botLn}` : 'Detecting...';
                              })()}
                            </span>
                          </div>
                        }
                      />
                    </div>
                  </div>
                ) : inspectorMode === 'ocr_inspect' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                    <Dag4OcrFullInspectorModal
                      key={`ocr_inspect_${activeProject?.id || 'none'}_${ocrInspectImageId}`}
                      isOpen={true}
                      inline={true}
                      onClose={handleCloseInlineOcrInspector}
                      apiBase={API_BASE}
                      initialImageId={ocrInspectImageId}
                      nodeExtractedText=""
                      nodeModelUsed="MiniCPM-V (Ollama)"
                      nodeLinesCount={0}
                      onRefresh={handleOcrInspectorRefresh}
                      hasFramesPanel={!!activeProject}
                      isFramesMinimized={framesMinimized || inspectorMaximized || linesMaximized}
                      onToggleFramesPanel={handleToggleFrames}
                      hasLinesPanel={!!activeProject}
                      isLinesPanelMinimized={linesMinimized || inspectorMaximized || framesMaximized}
                      onToggleLinesPanel={handleToggleLines}
                      hasStudioPanel={true}
                      isStudioPanelOpen={showStudioDrawer && !studioMinimized}
                      onToggleStudioPanel={() => handleToggleStudio()}
                      selectedPageNum={activeFramePageNum}
                      totalPagesCount={sortedFrames.length}
                      onFocusInspector={() => {
                        setFramesMinimized(true);
                        setLinesMinimized(true);
                        setFramesMaximized(false);
                        setLinesMaximized(false);
                        setInspectorMinimized(false);
                        setInspectorMaximized(true);
                      }}
                    />
                  </div>
                ) : activeFrame ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                    <div className="gutter-line-callout top" style={{ justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="gutter-callout-icon">▲</span>
                        <span className="gutter-callout-label">TOP GUTTER:</span>
                        <span className="gutter-callout-value">{activeFrame.top_line > 0 ? `Line #${activeFrame.top_line}` : 'Detecting...'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
                        <span style={{ background: 'rgba(0, 255, 157, 0.16)', border: '1px solid #00ff9d', color: '#00ff9d', borderRadius: '4px', padding: '1px 7px', fontWeight: 800 }}>
                          ✓ SELECTED: Pg {activeFramePageNum} / {sortedFrames.length} (Ln {activeFrame.top_line} → {activeFrame.bottom_line})
                        </span>
                        <span style={{ color: '#8b949e' }}>{activeFrame.filename || `${activeFrame.frame_id}.png`}</span>
                      </div>
                    </div>
                    <div
                      className="source-image-wrapper fit"
                      onDoubleClick={() => handleOpenInlineOcrInspector(activeFrame.frame_id)}
                      style={{ cursor: 'pointer' }}
                      title="Double-click frame to open OCR Full Inspector inline"
                    >
                      <img
                        key={`frame_img_${activeFrame.frame_id}`}
                        src={`${API_BASE}/api/frames/${activeFrame.frame_id}/image?t=${encodeURIComponent(activeFrame.created_at || '')}`}
                        alt={activeFrame.frame_id}
                      />
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
          )}

          {!inspectorMaximized && !framesMaximized && !linesMaximized && !inspectorMinimized && !linesMinimized && (
            <div
              className={`panel-resizer ${isDraggingSplit ? 'dragging' : ''} ${armedSplitter === 'split' ? 'hover-armed' : ''}`}
              onMouseEnter={() => handleSplitterMouseEnter('split')}
              onMouseLeave={handleSplitterMouseLeave}
              onMouseDown={handleSplitResizer}
              onDoubleClick={() => setInspectorPercent(48)}
              role="separator"
            >
              <div className="panel-resizer-line" />
              <div className="panel-resizer-pill" onMouseDown={handleSplitResizer} />
            </div>
          )}

          {linesMinimized || inspectorMaximized || framesMaximized ? (
            <aside
              className="window-minimized-rail"
              onClick={() => { setLinesMinimized(false); setInspectorMaximized(false); setFramesMaximized(false); setLinesMaximized(false); }}
              title="Click to restore Verified Lines panel"
            >
              <Search size={14} color="#00ff9d" />
              <span className="minimized-rail-label">VERIFIED LINES ({filteredLines.length})</span>
              <Maximize2 size={12} style={{ marginTop: 'auto' }} />
            </aside>
          ) : (
            <section className="line-inspector-panel" style={{ flex: linesMaximized ? '1 1 100%' : `${100 - inspectorPercent} 1 0`, minWidth: '240px' }}>
              <div className="panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={filteredLines.length > 0 && selectedLineNumbers.size === filteredLines.length}
                    onChange={handleToggleSelectAllLines}
                    title="Select or deselect all lines in current window"
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Verified Lines ({filteredLines.length} / {documentData.total_lines})</span>
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
                <WindowControls
                  windowName="Verified Lines Panel"
                  onMinimize={() => { setLinesMinimized(true); setLinesMaximized(false); }}
                  onMaximize={() => {
                    setLinesMaximized(m => {
                      const next = !m;
                      if (next) { setInspectorMaximized(false); setFramesMaximized(false); setInspectorMinimized(false); }
                      return next;
                    });
                  }}
                  isMaximized={linesMaximized}
                  onClose={() => { setLinesMinimized(true); setLinesMaximized(false); }}
                />
              </div>

              <div className="panel-sub-bar">
                <button className={`btn btn-sm ${filterMode === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterMode('all')} style={{ padding: '2px 8px', fontSize: '10.5px' }}>All ({documentData.total_lines})</button>
                <button className={`btn btn-sm ${filterMode === 'issues' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterMode('issues')} style={{ padding: '2px 8px', fontSize: '10.5px' }}>Issues ({documentData.issue_count})</button>
                <button
                  type="button"
                  className="btn-download-action variant-markdown"
                  onClick={() => handleExportMarkdown()}
                  disabled={isExportingMarkdown || documentData.total_lines === 0}
                  title={`Save entire contents of verified lines as Markdown (.md) file • Downloaded ${activeProject?.markdown_download_count ?? 0} time(s)`}
                  style={{ padding: '2px 8px', fontSize: '10.5px' }}
                >
                  <Download size={11} color="#00ff9d" />
                  <span>{isExportingMarkdown ? 'Saving...' : 'Save MD'}</span>
                  <span className="download-counter-badge">{activeProject?.markdown_download_count ?? 0}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => setIsOcrReportOpen(true)}
                  title="Open OCR Verified Lines & Precision Diagnostics Report Modal"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', fontSize: '10.5px', color: '#58a6ff', borderColor: '#58a6ff55' }}
                >
                  <FileText size={11} color="#58a6ff" />
                  <span>OCR Report</span>
                </button>
              </div>

                    {/* Lazy Loaded Lines Window Bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(15, 23, 42, 0.75)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '4px 10px',
                      fontSize: '11px',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}>
                      {/* Left: Window Range Jump & Inputs */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#8b949e', fontWeight: 600, fontSize: '10px' }}>WINDOW:</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#c9d1d9' }}>
                          <span style={{ fontSize: '10px', color: '#8b949e' }}>From</span>
                          <input
                            type="number"
                            value={lazyFromInput}
                            onChange={e => setLazyFromInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const f = parseInt(lazyFromInput);
                                const t = parseInt(lazyToInput);
                                if (!isNaN(f)) {
                                  setFollowCurrentProcess(false);
                                  fetchLazyLines(f, !isNaN(t) ? t : f + lazyWindowSize - 1, false);
                                }
                              }
                            }}
                            style={{
                              width: '58px', height: '20px', padding: '1px 4px',
                              background: '#0d1117', border: '1px solid #30363d',
                              borderRadius: '3px', color: '#58a6ff', fontSize: '11px',
                              fontFamily: 'monospace', fontWeight: 600
                            }}
                            title="Start line number to lazy load from local DB"
                          />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#c9d1d9' }}>
                          <span style={{ fontSize: '10px', color: '#8b949e' }}>To</span>
                          <input
                            type="number"
                            value={lazyToInput}
                            onChange={e => setLazyToInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const f = parseInt(lazyFromInput);
                                const t = parseInt(lazyToInput);
                                if (!isNaN(t)) {
                                  setFollowCurrentProcess(false);
                                  fetchLazyLines(!isNaN(f) ? f : Math.max(1, t - lazyWindowSize + 1), t, false);
                                }
                              }
                            }}
                            style={{
                              width: '58px', height: '20px', padding: '1px 4px',
                              background: '#0d1117', border: '1px solid #30363d',
                              borderRadius: '3px', color: '#3fb950', fontSize: '11px',
                              fontFamily: 'monospace', fontWeight: 600
                            }}
                            title="End line number to lazy load from local DB"
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            const f = parseInt(lazyFromInput);
                            const t = parseInt(lazyToInput);
                            setFollowCurrentProcess(false);
                            fetchLazyLines(!isNaN(f) ? f : 1, !isNaN(t) ? t : 50, false);
                          }}
                          style={{ height: '20px', padding: '0 6px', fontSize: '10px', color: '#58a6ff', borderColor: '#58a6ff44' }}
                          title="Load lines from local database"
                        >
                          Go
                        </button>
                        <select
                          value={lazyWindowSize}
                          onChange={e => {
                            const newSz = parseInt(e.target.value) || 50;
                            setLazyWindowSize(newSz);
                            fetchLazyLines(lazyFromLine, lazyFromLine + newSz - 1, false);
                          }}
                          style={{
                            height: '20px', padding: '0 4px', fontSize: '10px',
                            background: '#0d1117', border: '1px solid #30363d',
                            borderRadius: '3px', color: '#8b949e', cursor: 'pointer'
                          }}
                          title="Number of lines per lazy window"
                        >
                          <option value="25">25 lines</option>
                          <option value="50">50 lines</option>
                          <option value="100">100 lines</option>
                        </select>
                      </div>

                      {/* Center: Navigation Pagers */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            setFollowCurrentProcess(false);
                            const nextFrom = Math.max(1, lazyFromLine - lazyWindowSize);
                            const nextTo = Math.max(lazyWindowSize, lazyToLine - lazyWindowSize);
                            fetchLazyLines(nextFrom, nextTo, false);
                          }}
                          disabled={lazyFromLine <= (documentData.min_line || 1)}
                          style={{ height: '20px', padding: '0 6px', fontSize: '10px' }}
                          title="Previous page slice from local DB"
                        >
                          ◀ Prev {lazyWindowSize}
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            setFollowCurrentProcess(false);
                            const nextFrom = lazyFromLine + lazyWindowSize;
                            const nextTo = lazyToLine + lazyWindowSize;
                            fetchLazyLines(nextFrom, nextTo, false);
                          }}
                          disabled={lazyToLine >= (documentData.max_line || 1)}
                          style={{ height: '20px', padding: '0 6px', fontSize: '10px' }}
                          title="Next page slice from local DB"
                        >
                          Next {lazyWindowSize} ▶
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={() => {
                            setFollowCurrentProcess(false);
                            const minL = documentData.min_line || 1;
                            fetchLazyLines(minL, minL + lazyWindowSize - 1, false);
                          }}
                          style={{ height: '20px', padding: '0 5px', fontSize: '10px', color: '#8b949e' }}
                          title="Jump to first line in project"
                        >
                          Top
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={() => {
                            setFollowCurrentProcess(false);
                            const maxL = documentData.max_line || 1;
                            fetchLazyLines(Math.max(1, maxL - lazyWindowSize + 1), maxL, false);
                          }}
                          style={{ height: '20px', padding: '0 5px', fontSize: '10px', color: '#8b949e' }}
                          title="Jump to latest line in project"
                        >
                          End
                        </button>
                      </div>

                      {/* Right: Follow Current Capture & Loading Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className={`btn btn-xs ${followCurrentProcess ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => {
                            const nextFollow = !followCurrentProcess;
                            setFollowCurrentProcess(nextFollow);
                            if (nextFollow) fetchLazyLines(undefined, undefined, true);
                          }}
                          style={{
                            height: '20px', padding: '0 7px', fontSize: '10px', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '4px',
                            background: followCurrentProcess ? 'rgba(0, 255, 157, 0.18)' : undefined,
                            borderColor: followCurrentProcess ? '#00ff9d88' : undefined,
                            color: followCurrentProcess ? '#00ff9d' : '#8b949e'
                          }}
                          title={followCurrentProcess
                            ? "Auto-following active capture position (showing current frame's lines from local DB). Click to detach."
                            : "Manual window viewing. Click to auto-follow active capture / rescan position."}
                        >
                          <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: followCurrentProcess ? '#00ff9d' : '#8b949e',
                            boxShadow: followCurrentProcess ? '0 0 6px #00ff9d' : 'none'
                          }} />
                          <span>{followCurrentProcess ? 'FOLLOWING PROCESS' : 'FOLLOW PROCESS'}</span>
                        </button>
                        {isLoadingLazyLines && (
                          <RefreshCw size={10} color="#58a6ff" className="spin" />
                        )}
                        <span style={{ fontSize: '10px', color: '#8b949e', fontFamily: 'monospace' }}>
                          Ln {lazyFromLine}–{lazyToLine} of {documentData.total_lines}
                        </span>
                      </div>
                    </div>
                    <div className="filter-bar"><Search size={14} color="#8b949e" /><input type="text" className="search-input" placeholder="Search lines..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
                    <VirtualizedLineViewer
                      apiBase={API_BASE}
                      projectId={activeProject?.id}
                      totalLines={documentData.total_lines}
                      minLine={documentData.min_line || 1}
                      maxLine={documentData.max_line || documentData.total_lines}
                      initialLines={documentData.lines}
                      frames={sortedFrames}
                      selectedLine={selectedLine}
                      selectedLineNumbers={selectedLineNumbers}
                      filterMode={filterMode}
                      searchQuery={searchQuery}
                      followCurrentProcess={followCurrentProcess}
                      currentProcessTopLine={currentProcessTopLine}
                      isTelemetryExpanded={isTelemetryExpanded}
                      scrollToLineRef={scrollToLineRef}
                      onSelectLine={(line) => {
                        setSelectedLine(line);
                        if (line.frame_id && line.frame_id !== 'manual') {
                          setSelectedFrameId(line.frame_id);
                        }
                      }}
                      onToggleSelectLine={(ln, e) => handleToggleSelectLine(ln, e)}
                      onToggleSelectAllLines={handleToggleSelectAllLines}
                      onVisibleRangeChange={(fromLn, toLn, loading) => {
                        setLazyFromLine(fromLn);
                        setLazyToLine(toLn);
                        setIsLoadingLazyLines(loading);
                      }}
                    />
                  </section>
                )}
          </>
        ) : (
          <main
            className="frame-inspector-panel startup-live-mobile-workspace"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: '#090d16'
            }}
          >
            {/* Startup Control & Initialization Bar (Before Project Creation) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '10px 16px',
              background: 'linear-gradient(180deg, #161b22 0%, #0d1117 100%)',
              borderBottom: '1px solid #30363d',
              flexShrink: 0
            }}>
              {/* Left: Live Mobile Screen Status & Detected File Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: isCurrentDeviceConnected ? '#00ff9d' : '#ef4444',
                    boxShadow: isCurrentDeviceConnected ? '0 0 8px #00ff9d' : 'none'
                  }} />
                  <strong style={{ fontSize: '12.5px', color: '#f0f6fc' }}>
                    LIVE {devDisplayName} PREVIEW
                  </strong>
                </div>

                {/* Desktop / Phone Mode Switcher */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', background: '#0d1117',
                  border: '1px solid #30363d', borderRadius: '4px', padding: '1px'
                }}>
                  <button
                    type="button"
                    onClick={() => handleSwitchLiveMode('desktop')}
                    style={{
                      padding: '2px 8px', height: '22px', fontSize: '10px',
                      fontWeight: liveMode === 'desktop' ? 700 : 500,
                      background: liveMode === 'desktop' ? '#2563eb' : 'transparent',
                      color: liveMode === 'desktop' ? '#fff' : '#8b949e',
                      display: 'flex', alignItems: 'center', gap: '4px', border: 'none', cursor: 'pointer'
                    }}
                  >
                    <Monitor size={11} />
                    <span>DESKTOP (1080p)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchLiveMode('phone')}
                    style={{
                      padding: '2px 8px', height: '22px', fontSize: '10px',
                      fontWeight: liveMode === 'phone' ? 700 : 500,
                      background: liveMode === 'phone' ? '#2563eb' : 'transparent',
                      color: liveMode === 'phone' ? '#fff' : '#8b949e',
                      display: 'flex', alignItems: 'center', gap: '4px', border: 'none', cursor: 'pointer'
                    }}
                  >
                    <Smartphone size={11} />
                    <span>PHONE MIRROR</span>
                  </button>
                </div>

                {/* Detected Markdown File & Multi-Part Status */}
                {alignmentData.file_name ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '6px', padding: '3px 9px', fontSize: '11.5px', color: '#38bdf8', fontFamily: 'monospace'
                  }}>
                    <FileText size={12} />
                    <strong>{alignmentData.file_name}</strong>
                    {(alignmentData.is_multipart || multipartState.is_multipart || alignmentData.file_name.toLowerCase().includes('part')) && (
                      <span style={{
                        background: 'rgba(16, 185, 129, 0.2)', color: '#00ff9d',
                        padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800
                      }}>
                        PART {alignmentData.part_number || multipartState.current_part || 1}
                        {(alignmentData.total_parts || multipartState.total_parts) ? ` OF ${alignmentData.total_parts || multipartState.total_parts}` : ''}
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: '11.5px', color: '#8b949e' }}>
                    Verify mobile screen state below before initializing project
                  </span>
                )}
              </div>

              {/* Right: Screen Preparation (Maximize + Edit + Dark) & 1-Click Project Creation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={handlePrepareMarkdownEditor}
                  disabled={isPreparingScreen}
                  title="Maximizes floating markdown editor window (□), switches to Edit Mode (pencil) and Dark Mode (moon)"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', fontSize: '11px', fontWeight: 700,
                    borderColor: '#c084fc', color: '#e9d5ff', background: 'rgba(168, 85, 247, 0.14)'
                  }}
                >
                  <Maximize2 size={12} color="#c084fc" />
                  <span>{isPreparingScreen ? 'Preparing Screen...' : '□ Maximize + Edit + Dark Mode'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => handleTransitionNextPart(false)}
                  disabled={isTransitioningNextPart}
                  title="Clicks top-left Back Arrow (<-) to return to Teams folder list, opens the next part in sequence, and maximizes editor in Edit + Dark Mode"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', fontSize: '11px', fontWeight: 700,
                    borderColor: '#38bdf8', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)'
                  }}
                >
                  <span>{isTransitioningNextPart ? 'Opening Next Part...' : '← Exit & Open Next Part'}</span>
                </button>

                {/* Inline Project Name & 1-Click Create / Create & Start Loop */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', padding: '3px 6px' }}>
                  <input
                    type="text"
                    value={startupProjectName}
                    onChange={e => { setStartupProjectName(e.target.value); setStartupNameTouched(true); }}
                    placeholder={alignmentData.file_name || 'Project Name (e.g. part1.md)...'}
                    style={{
                      width: '220px', background: 'transparent', border: 'none', color: '#f0f6fc',
                      fontSize: '11.5px', fontFamily: 'monospace', outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => handleCreateProject(startupProjectName || alignmentData.file_name || 'Markdown_Capture_Part1.md', false)}
                    style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#58a6ff', borderColor: '#58a6ff66' }}
                  >
                    <Plus size={12} />
                    <span>Create Project</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => handleCreateProject(startupProjectName || alignmentData.file_name || 'Markdown_Capture_Part1.md', true)}
                    style={{
                      padding: '4px 12px', fontSize: '11px', fontWeight: 700,
                      background: '#059669', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '5px'
                    }}
                    title="Creates project for current markdown file and immediately starts continuous capture loop (with automatic multi-part progression)"
                  >
                    <Zap size={12} />
                    <span>Create &amp; Run Loop</span>
                  </button>
                </div>

                <button
                  type="button"
                  className={`live-ai-boxes-btn ${showBoundingBoxes ? 'active' : ''}`}
                  onClick={() => setShowBoundingBoxes(p => !p)}
                  style={{ padding: '4px 8px', height: '26px', fontSize: '10.5px' }}
                  title="Toggle Content Framing Overlays on Live Mobile View"
                >
                  {showBoundingBoxes ? <Eye size={11} /> : <EyeOff size={11} />}
                  <span>FRAMING</span>
                </button>
              </div>
            </div>

            {/* Existing Projects Quick Bar (if any projects exist in DB) */}
            {projects.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                padding: '6px 16px', background: '#0d1117', borderBottom: '1px solid #21262d', fontSize: '11px'
              }}>
                <span style={{ color: '#8b949e', fontWeight: 600 }}>Existing Projects:</span>
                {projects.map(p => (
                  <div key={p.id} style={{ display: 'inline-flex', alignItems: 'center', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden', gap: '2px', paddingRight: '2px' }}>
                    <button
                      type="button"
                      onClick={() => handleSwitchProject(p.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px',
                        padding: '3px 9px', border: 'none', background: 'transparent', color: '#e6edf3', cursor: 'pointer'
                      }}
                    >
                      <FolderKanban size={11} color="#00ff9d" />
                      <span>{p.name}</span>
                      <span style={{ color: '#8b949e' }}>({p.frame_count ?? 0}f)</span>
                    </button>
                    <button
                      type="button"
                      className="btn-download-action variant-markdown"
                      onClick={e => { e.stopPropagation(); handleExportMarkdown(p.id, p.name); }}
                      title={`Download Markdown (.md) • Downloaded ${p.markdown_download_count ?? 0} time(s)`}
                      style={{ padding: '2px 5px', fontSize: '9.5px' }}
                    >
                      <Download size={10} />
                      <span>MD</span>
                      <span className="download-counter-badge">{p.markdown_download_count ?? 0}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-download-action variant-project"
                      onClick={e => { e.stopPropagation(); handleExportProject(p.id, p.name); }}
                      title={`Download Project Archive (.zip) • Downloaded ${p.project_download_count ?? 0} time(s)`}
                      style={{ padding: '2px 5px', fontSize: '9.5px' }}
                    >
                      <Download size={10} />
                      <span>ZIP</span>
                      <span className="download-counter-badge">{p.project_download_count ?? 0}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-text-danger"
                      onClick={e => { e.stopPropagation(); handleDeleteProject(p.id, p.name); }}
                      disabled={deletingProjectId === p.id}
                      style={{ padding: '3px 6px', borderLeft: '1px solid #30363d', background: 'transparent' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Main Live View of Connected Mobile Device */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <LiveResponsiveViewport
                streamUrl={`${API_BASE}/api/device/stream?mode=${liveMode}&serial=${encodeURIComponent(deviceInfo?.active_serial || '')}&t=${streamKey}`}
                fallbackUrl={`${API_BASE}/api/device/screen?mode=${liveMode}&serial=${encodeURIComponent(deviceInfo?.active_serial || '')}&t=${streamKey}`}
                liveMode={liveMode}
                onSwitchLiveMode={handleSwitchLiveMode}
                alignmentData={alignmentData}
                showBoundingBoxes={showBoundingBoxes}
                deviceInfo={deviceInfo}
                metaResolution={alignmentData?.resolution}
                headlessMode={false}
                onToggleHeadlessMode={handleToggleHeadlessMode}
                onRefreshStream={() => setStreamKey(Date.now())}
                topCallout={
                  <div className="gutter-line-callout top">
                    <span className="gutter-callout-icon">▲</span>
                    <span className="gutter-callout-label">TOP GUTTER:</span>
                    <span className="gutter-callout-value">
                      {alignmentData.first_line_number ? `Line #${alignmentData.first_line_number}` : 'Detecting...'}
                    </span>
                    {alignmentData.file_name && (
                      <span style={{ marginLeft: '12px', color: '#38bdf8', fontWeight: 700 }}>
                        📄 {alignmentData.file_name}
                      </span>
                    )}
                  </div>
                }
                bottomCallout={
                  <div className="gutter-line-callout bottom">
                    <span className="gutter-callout-icon">▼</span>
                    <span className="gutter-callout-label">BOTTOM GUTTER:</span>
                    <span className="gutter-callout-value">
                      {alignmentData.last_line_number ? `Line #${alignmentData.last_line_number}` : 'Detecting...'}
                    </span>
                  </div>
                }
              />
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
                  className={`panel-resizer ${isDraggingStudio ? 'dragging' : ''} ${armedSplitter === 'studio' ? 'hover-armed' : ''}`}
                  onMouseEnter={() => handleSplitterMouseEnter('studio')}
                  onMouseLeave={handleSplitterMouseLeave}
                  onMouseDown={handleStudioResizer}
                  title="Drag to resize Device Studio window"
                >
                  <div className="panel-resizer-line" />
                  <div className="panel-resizer-pill" onMouseDown={handleStudioResizer} />
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
                  desktopModeEnabled={desktopModeEnabled}
                  onToggleDesktopMode={handleToggleDesktopMode}
                  desktopKeyboardProhibited={desktopKeyboardProhibited}
                  onToggleProhibitKeyboard={handleToggleProhibitKeyboard}
                  desktopVerification={desktopVerification}
                  onVerifyDesktopMode={handleVerifyDesktopMode}
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

                {/* Dynamic Calibration Formula Banner */}
                <div style={{
                  background: 'rgba(88, 166, 255, 0.08)',
                  border: '1px solid rgba(88, 166, 255, 0.25)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#58a6ff', fontWeight: 700 }}>
                    <span>📐 VIEWPORT SCROLL &amp; ARROW DOWN CALIBRATION</span>
                    <span style={{ color: '#00ff9d' }}>Page 1 → 2: {arrowCountInitInput} keys | Page N: {arrowCountStepInput} keys</span>
                  </div>
                  <div style={{ color: '#8b949e', fontSize: '10px', lineHeight: 1.45 }}>
                    <strong>Formula:</strong> Frame 1 (Ln 1..{linesPerPageInput}): ({linesPerPageInput} visible + {scrollPaddingLinesInput} pad) + ({linesPerPageInput} scroll + {scrollPaddingLinesInput} pad) = <span style={{ color: '#00ff9d', fontWeight: 700 }}>{arrowCountInitInput} down arrows</span> → Frame 2 displays Ln {linesPerPageInput + 1}..{linesPerPageInput * 2 + 1}. Subsequent frames: {linesPerPageInput} + {scrollPaddingLinesInput} = <span style={{ color: '#58a6ff', fontWeight: 700 }}>{arrowCountStepInput} down arrows</span>.
                  </div>
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
                          const lpp = Math.max(10, Math.floor(vh / 16.0));
                          updateLinesAndPadding(lpp, scrollPaddingLinesInput);
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
                          const lpp = Math.max(10, Math.floor(vh / 16.0));
                          updateLinesAndPadding(lpp, scrollPaddingLinesInput);
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
                      onChange={e => updateLinesAndPadding(Number(e.target.value), scrollPaddingLinesInput)}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Scroll Padding</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={scrollPaddingLinesInput}
                      onChange={e => updateLinesAndPadding(linesPerPageInput, Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Init Arrows (Ln 1)</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={arrowCountInitInput}
                      onChange={e => setArrowCountInitInput(Number(e.target.value))}
                    />
                  </div>

                  <div className="device-spec-card">
                    <span className="device-spec-label">Step Arrows</span>
                    <input
                      type="number"
                      className="device-spec-input"
                      value={arrowCountStepInput}
                      onChange={e => setArrowCountStepInput(Number(e.target.value))}
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

                  <div className="device-spec-card">
                    <span className="device-spec-label">Dispatch Method</span>
                    <select
                      className="device-spec-input"
                      style={{ height: '28px', padding: '0 4px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                      value={hidDispatchMethod}
                      onChange={e => setHidDispatchMethod(e.target.value)}
                    >
                      <option value="accelerated_batch">⚡ Accelerated Batch</option>
                      <option value="single">Sequential Single</option>
                      <option value="piped">Piped Shell</option>
                    </select>
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
        <Modal
          title="Create New Project"
          onClose={() => setShowNewProjectModal(false)}
          onConfirm={() => handleCreateProject()}
          confirmText="Create & Activate"
          confirmIcon={Plus}
          disabled={!newProject.name.trim()}
        >
          <form
            onSubmit={e => {
              e.preventDefault();
              const val = (newProject.name || '').trim();
              if (val) {
                const confirmBtn = (document.getElementById('modal-confirm-btn') || document.querySelector('.modal-btn-confirm')) as HTMLButtonElement | null;
                if (confirmBtn) {
                  confirmBtn.classList.add('is-pressed');
                  setTimeout(() => {
                    confirmBtn.classList.remove('is-pressed');
                    handleCreateProject(val);
                  }, 120);
                } else {
                  handleCreateProject(val);
                }
              }
            }}
          >
            <div className="modal-form-group" style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700 }}>PROJECT NAME *</label>
              <input
                type="text"
                placeholder="e.g. Small-Fling Core"
                className="modal-input"
                value={newProject.name}
                onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = (e.currentTarget.value || newProject.name || '').trim();
                    if (val) {
                      if (newProject.name !== val) {
                        setNewProject(p => ({ ...p, name: val }));
                      }
                      const confirmBtn = (document.getElementById('modal-confirm-btn') || document.querySelector('.modal-btn-confirm')) as HTMLButtonElement | null;
                      if (confirmBtn) {
                        confirmBtn.classList.add('is-pressed');
                        setTimeout(() => {
                          confirmBtn.classList.remove('is-pressed');
                          handleCreateProject(val);
                        }, 120);
                      } else {
                        handleCreateProject(val);
                      }
                    }
                  }
                }}
                autoFocus
              />
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
          </form>
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
        deviceModel={deviceModel} eventsLog={eventsLog} onClearEvents={() => setEventsLog([])}
        isExpanded={isTelemetryExpanded} onExpandedChange={setIsTelemetryExpanded}
        activeTab={telemetryActiveTab} onActiveTabChange={setTelemetryActiveTab}
        isAlignmentDismissed={isBannerDismissed} isAligned={alignmentData.is_aligned}
        onReturnAlignmentOverlay={() => { setIsBannerDismissed(false); setIsBannerMinimized(false); localStorage.setItem('mc_banner_dismissed', 'false'); localStorage.setItem('mc_banner_minimized', 'false'); addTelemetryEvent('SYSTEM', 'Alignment Alert Overlay returned'); }}
        onOpenStudio={() => handleToggleStudio('telemetry')}
        selectedDag={selectedDag as any}
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

      <CapturedFramesReportModal
        isOpen={isFramesReportOpen}
        onClose={() => setIsFramesReportOpen(false)}
        frames={frames}
        totalVerifiedLines={documentData.total_lines}
      />

      <OcrDiagnosticsReportModal
        isOpen={isOcrReportOpen}
        onClose={() => setIsOcrReportOpen(false)}
        documentData={documentData}
        frames={frames}
      />

      <HeadlessTelemetryModal
        isOpen={isHeadlessTelemetryOpen}
        onClose={() => setIsHeadlessTelemetryOpen(false)}
        telemetry={headlessTelemetry}
        apiBase={API_BASE}
        onInspectLines={() => {
          setInspectorMode('ocr_inspect');
        }}
        onOpenOcrReport={() => {
          setIsOcrReportOpen(true);
        }}
      />
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
