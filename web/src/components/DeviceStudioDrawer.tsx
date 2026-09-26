import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Monitor, Shield, ShieldAlert, ShieldCheck, Lock, Unlock, AlertTriangle,
  RefreshCw, Check, Loader2, X, Laptop, Smartphone, Eye, EyeOff, Sliders,
  Key, Cpu, Zap, Activity, Clock, Layers, Keyboard, CheckCircle2, Copy, Trash2,
  Maximize2, Minimize2
} from 'lucide-react';
import type {
  ConnectedDisplay, KioskTelemetry, DeviceInfoData, AlignmentData,
  TokenStats, LiveViewMeta, ProcessAttributeItem
} from '../types';
import type { TelemetryData, TelemetryEvent } from '../TelemetryToaster';
import { useAgoTimer } from '../hooks/useAgoTimer';
import { renderBoundingBoxesOverlay } from './BoundingBoxesOverlay';

export interface DeviceStudioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  initialTab?: 'kiosk' | 'device' | 'processes' | 'telemetry';
  deviceInfo: DeviceInfoData | null;
  deviceModel: 'pixel_8' | 'pixel_10';
  onSelectDevice: (model: 'pixel_8' | 'pixel_10') => void;
  onSelectSerial?: (serial: string) => void;
  onConnectAdbIp: (ip?: string, model?: 'pixel_8' | 'pixel_10') => Promise<void> | void;
  isConnectingIp: boolean;
  connectStatusMsg: string;
  onPairAdb?: (target: string, code: string, model?: 'pixel_8' | 'pixel_10') => Promise<void> | void;
  isPairing?: boolean;
  pairStatusMsg?: string;
  pixel8Ip: string;
  setPixel8Ip: (ip: string) => void;
  pixel10Ip: string;
  setPixel10Ip: (ip: string) => void;
  alignmentData: AlignmentData;
  onTriggerAlignmentCheck: () => void;
  onOpenAlignmentModal: () => void;
  liveMode: 'desktop' | 'phone';
  onSwitchLiveMode: (mode: 'desktop' | 'phone') => void;
  streamKey: number;
  onRefreshStream: () => void;
  showBoundingBoxes: boolean;
  onToggleBoundingBoxes: () => void;
  onCloseKeyboard: () => Promise<void> | void;
  isClosingKeyboard: boolean;
  telemetry: TelemetryData;
  tokenStats: TokenStats;
  documentSummary: {
    total_lines: number;
    min_line: number;
    max_line: number;
    total_frames: number;
    issue_count: number;
    verified_overlap_lines: number;
  };
  wsConnected: boolean;
  latencyMs: number;
  eventsLog: TelemetryEvent[];
  onClearEvents: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', message: string) => void;
  projectInitProgress?: {
    active: boolean;
    percent: number;
    stage: string;
    status: 'running' | 'completed' | 'error';
    totalLines?: number;
    error?: string;
    projectName?: string;
  } | null;
  onDismissInitProgress?: () => void;
}

export const DeviceStudioDrawer: React.FC<DeviceStudioDrawerProps> = ({
  isOpen,
  onClose,
  apiBase,
  initialTab = 'kiosk',
  deviceInfo,
  deviceModel,
  onSelectDevice,
  onSelectSerial,
  onConnectAdbIp,
  isConnectingIp,
  connectStatusMsg,
  onPairAdb,
  isPairing = false,
  pairStatusMsg = '',
  pixel8Ip,
  setPixel8Ip,
  pixel10Ip,
  setPixel10Ip,
  alignmentData,
  onTriggerAlignmentCheck,
  onOpenAlignmentModal,
  liveMode,
  onSwitchLiveMode,
  streamKey,
  onRefreshStream,
  showBoundingBoxes,
  onToggleBoundingBoxes,
  onCloseKeyboard,
  isClosingKeyboard,
  telemetry,
  tokenStats,
  documentSummary,
  wsConnected,
  latencyMs,
  eventsLog,
  onClearEvents,
  onShowToast,
  projectInitProgress,
  onDismissInitProgress,
}) => {
  // Tabs
  const [activeTab, setActiveTab] = useState<'kiosk' | 'device' | 'processes' | 'telemetry'>(initialTab);
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Window state
  const [isMaximized, setIsMaximized] = useState(false);
  const [viewportSize, setViewportSize] = useState<'sm' | 'md' | 'lg' | 'fit'>('fit');

  // Kiosk state
  const [kioskLoading, setKioskLoading] = useState(false);
  const [kioskTelemetry, setKioskTelemetry] = useState<KioskTelemetry | null>(null);
  const [displays, setDisplays] = useState<ConnectedDisplay[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<number>(4);
  const [targetPackage, setTargetPackage] = useState('com.microsoft.teams');
  const [kioskMode, setKioskMode] = useState<'freeform' | 'mirrored' | 'kiosk'>('kiosk');
  const [suppressHotkeys, setSuppressHotkeys] = useState(true);
  const [disableStatusBar, setDisableStatusBar] = useState(true);
  const [preventSleep, setPreventSleep] = useState(true);
  const [showConfirmLockModal, setShowConfirmLockModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [isLocking, setIsLocking] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null);
  const [lastActionLatencyMs, setLastActionLatencyMs] = useState<number | null>(null);
  const [isRefreshingViewport, setIsRefreshingViewport] = useState(false);

  // Device & ADB Configuration State
  const [activeConfigureDevice, setActiveConfigureDevice] = useState<'pixel_8' | 'pixel_10' | null>(null);
  const [deviceConfigTab, setDeviceConfigTab] = useState<'connect' | 'pair'>('connect');
  const [connectIpInput, setConnectIpInput] = useState('');
  const [pairIpInput, setPairIpInput] = useState('');
  const [pairCodeInput, setPairCodeInput] = useState('');

  // Live Metadata & Process Telemetry
  const [meta, setMeta] = useState<LiveViewMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const { secondsAgo: streamSecondsAgo, resetTimer: resetStreamTimer } = useAgoTimer(streamKey);

  // Telemetry log snapshot copy feedback
  const [copiedSnapshot, setCopiedSnapshot] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const activeSerial = deviceInfo?.active_serial;

  // Fetch Kiosk Status
  const fetchKioskStatus = useCallback(async () => {
    try {
      setKioskLoading(true);
      const res = await fetch(`${apiBase}/api/device/kiosk/status${activeSerial ? `?serial=${encodeURIComponent(activeSerial)}` : ''}`);
      if (res.ok) {
        const d: KioskTelemetry = await res.json();
        setKioskTelemetry(d);
        if (d.displays?.length) {
          setDisplays(d.displays);
          const ext = d.displays.find(x => x.isExternal);
          setSelectedDisplayId(ext ? ext.displayId : d.displays[0].displayId);
        }
        if (d.kiosk_mode) setKioskMode(d.kiosk_mode);
        if (d.locked_package) setTargetPackage(d.locked_package);
        if (d.peripheral_restrictions) {
          setSuppressHotkeys(d.peripheral_restrictions.suppress_hotkeys ?? true);
          setDisableStatusBar(d.peripheral_restrictions.disable_status_bar ?? true);
          setPreventSleep(d.peripheral_restrictions.prevent_sleep ?? true);
        }
      }
    } catch (e) {
      console.error('Failed to fetch kiosk status:', e);
    } finally {
      setKioskLoading(false);
    }
  }, [apiBase, activeSerial]);

  // Fetch Live Meta & Processes
  const fetchLiveMeta = useCallback(async () => {
    try {
      setMetaLoading(true);
      const res = await fetch(`${apiBase}/api/device/live-meta?mode=${liveMode}&t=${Date.now()}`);
      if (res.ok) {
        setMeta(await res.json());
        resetStreamTimer();
      }
    } catch (e) {
      console.error('Failed to fetch live meta:', e);
    } finally {
      setMetaLoading(false);
    }
  }, [apiBase, liveMode, resetStreamTimer]);

  useEffect(() => {
    if (isOpen) {
      fetchKioskStatus();
      fetchLiveMeta();
    }
  }, [isOpen, streamKey, fetchKioskStatus, fetchLiveMeta]);

  // Auto-scroll log if telemetry tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'telemetry') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [eventsLog, isOpen, activeTab]);

  // Execute Lock
  const handleExecuteLock = async () => {
    setIsLocking(true);
    setShowConfirmLockModal(false);
    const start = performance.now();
    try {
      const res = await fetch(`${apiBase}/api/device/kiosk/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_id: selectedDisplayId,
          package_id: targetPackage,
          mode: kioskMode,
          restrictions: {
            suppress_hotkeys: suppressHotkeys,
            disable_status_bar: disableStatusBar,
            prevent_sleep: preventSleep,
          },
          serial: activeSerial || null,
        }),
      });
      const elapsed = Math.round(performance.now() - start);
      setLastActionLatencyMs(elapsed);
      if (res.ok) {
        const d = await res.json();
        if (d.kiosk_state) setKioskTelemetry(d.kiosk_state);
        onShowToast?.('success', `Kiosk lock engaged on Display #${selectedDisplayId} in ${elapsed}ms ✔`);
        onRefreshStream();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed to engage lock' }));
        onShowToast?.('error', `Failed to engage lock: ${err.detail || 'Unknown error'}`);
      }
    } catch (e: any) {
      onShowToast?.('error', `Error executing kiosk lock: ${e.message}`);
    } finally {
      setIsLocking(false);
      fetchKioskStatus();
    }
  };

  // Execute Release
  const handleExecuteRelease = async () => {
    setIsReleasing(true);
    setShowEmergencyModal(false);
    const start = performance.now();
    try {
      const res = await fetch(`${apiBase}/api/device/kiosk/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_pin: adminPin || 'admin',
          serial: activeSerial || null,
        }),
      });
      const elapsed = Math.round(performance.now() - start);
      setLastActionLatencyMs(elapsed);
      if (res.ok) {
        const d = await res.json();
        if (d.kiosk_state) setKioskTelemetry(d.kiosk_state);
        setAdminPin('');
        onShowToast?.('success', `Kiosk lock safely released in ${elapsed}ms ✔`);
        onRefreshStream();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Failed to release lock' }));
        onShowToast?.('error', `Release error: ${err.detail}`);
      }
    } catch (e: any) {
      onShowToast?.('error', `Error releasing lock: ${e.message}`);
    } finally {
      setIsReleasing(false);
      fetchKioskStatus();
    }
  };

  // Provision Admin
  const handleProvisionAdmin = async () => {
    setIsProvisioning(true);
    setProvisionMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/device/kiosk/provision-admin`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setProvisionMessage(d.admin_output || 'Active Admin configured successfully');
        onShowToast?.('success', 'Kiosk Admin provisioning verified');
      }
    } catch (e: any) {
      setProvisionMessage(`Provisioning failed: ${e.message}`);
    } finally {
      setIsProvisioning(false);
      fetchKioskStatus();
    }
  };

  // Auto-Refresh Viewport
  const handleAutoRefreshViewport = async () => {
    setIsRefreshingViewport(true);
    try {
      const res = await fetch(`${apiBase}/api/device/kiosk/auto-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_id: selectedDisplayId, serial: activeSerial || null }),
      });
      if (res.ok) {
        onShowToast?.('success', `Display #${selectedDisplayId} viewport auto-refreshed successfully ✔`);
        onRefreshStream();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Auto-refresh error' }));
        onShowToast?.('error', `Failed to refresh viewport: ${err.detail || 'Unknown error'}`);
      }
    } catch (e: any) {
      onShowToast?.('error', `Error refreshing display viewport: ${e.message}`);
    } finally {
      setIsRefreshingViewport(false);
      fetchKioskStatus();
    }
  };

  const handleCopySnapshot = () => {
    navigator.clipboard.writeText(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          kioskTelemetry,
          telemetry,
          tokenStats,
          documentSummary,
          latencyMs,
          wsConnected,
          deviceModel,
          recentEvents: eventsLog.slice(-15),
        },
        null,
        2
      )
    );
    setCopiedSnapshot(true);
    setTimeout(() => setCopiedSnapshot(false), 2000);
  };

  if (!isOpen) return null;

  // Determine availability
  const isP8Available = Boolean(
    deviceInfo?.pixel_8_available ??
    deviceInfo?.devices?.some(d => d.displayName === 'Pixel 8' || d.model.toLowerCase().includes('pixel_8') || (pixel8Ip && d.serial === pixel8Ip))
  );
  const isP10Available = Boolean(
    deviceInfo?.pixel_10_available ??
    deviceInfo?.devices?.some(d => d.displayName === 'Pixel 10' || d.model.toLowerCase().includes('pixel_10') || (pixel10Ip && d.serial === pixel10Ip))
  );

  const isLocked = kioskTelemetry?.lock_status === 'PINNED' || kioskTelemetry?.lock_status === 'LOCKED_TASK_EXTERNAL';
  const lockBadge = kioskTelemetry?.lock_status === 'LOCKED_TASK_EXTERNAL'
    ? { label: 'COSU DEVICE OWNER LOCK', color: '#00ff9d', bg: 'rgba(0, 255, 157, 0.15)' }
    : kioskTelemetry?.lock_status === 'PINNED'
    ? { label: 'PINNED LOCK TASK (ACTIVE)', color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)' }
    : { label: 'STANDARD FREEFORM (UNLOCKED)', color: '#8b949e', bg: 'rgba(139, 148, 158, 0.1)' };

  // Gutter stats from meta or fallback to alignmentData
  const gutterStats = meta?.gutter_stats || {
    first_line_number: alignmentData?.first_line_number || 0,
    last_line_number: alignmentData?.last_line_number || 0,
    visible_lines: (alignmentData?.last_line_number && alignmentData?.first_line_number) ? (alignmentData.last_line_number - alignmentData.first_line_number + 1) : 0,
    alignment_status: alignmentData?.status || 'pending',
    is_aligned: alignmentData?.is_aligned || false,
    file_name: alignmentData?.file_name || 'Matrix_main_26-09-17-8-19am.md',
    dark_mode: alignmentData?.boxes?.dark_mode?.passed ?? true,
    edit_mode: alignmentData?.boxes?.edit_mode?.passed ?? true,
  };

  const procs: ProcessAttributeItem[] = meta?.processes?.running_processes || [];
  const focusedApp = meta?.processes?.focused_app || meta?.processes?.focused_window || '';

  // Telemetry Progress
  const targetLines = telemetry.target_total_lines || 0;
  const currentBottom = telemetry.current_bottom_line || documentSummary.max_line || 0;
  const captureProgressPercent = targetLines > 0 ? Math.min(100, Math.max(0, Math.round((currentBottom / targetLines) * 100))) : 0;
  const totalTokens = tokenStats.total_tokens + (tokenStats.mobile_tokens?.total_tokens || 0);

  return (
    <>
      <div className="device-studio-drawer-overlay" onClick={onClose} />
      <div className={`device-studio-drawer ${isMaximized ? 'maximized' : ''}`}>
        {/* Top Header */}
        <div className="device-studio-header">
          <div className="studio-header-title-group">
            <div className="studio-icon-badge">
              <Shield size={16} color="#00ff9d" />
            </div>
            <div>
              <div className="studio-title-row">
                <h3>DEVICE & KIOSK STUDIO</h3>
                <span className="studio-version-tag">HARDWARE & TELEMETRY</span>
              </div>
              <p>Desktop Isolation, Live Viewport, Gutter Alignment & Hardware Control</p>
            </div>
          </div>

          <div className="studio-header-center-bar">
            {/* Quick Device Indicator */}
            <button
              type="button"
              className={`studio-quick-pill ${deviceModel === 'pixel_8' ? (isP8Available ? 'online' : 'offline') : (isP10Available ? 'online' : 'offline')}`}
              onClick={() => setActiveTab('device')}
              title="Click to manage target device"
            >
              <Smartphone size={12} />
              <span>{deviceModel === 'pixel_8' ? 'PIXEL 8 (31L)' : 'PIXEL 10 (47L)'}</span>
              <span className="status-dot-mini" />
            </button>

            {/* Quick Live Mode Switcher */}
            <div className="studio-mode-pill-group">
              <button
                type="button"
                className={`studio-mode-btn ${liveMode === 'desktop' ? 'active' : ''}`}
                onClick={() => { onSwitchLiveMode('desktop'); onRefreshStream(); }}
              >
                <Monitor size={11} />
                <span>DESKTOP</span>
              </button>
              <button
                type="button"
                className={`studio-mode-btn ${liveMode === 'phone' ? 'active' : ''}`}
                onClick={() => { onSwitchLiveMode('phone'); onRefreshStream(); }}
              >
                <Smartphone size={11} />
                <span>PHONE</span>
              </button>
            </div>

            {/* Quick Kiosk Status Pill */}
            <button
              type="button"
              className="studio-quick-kiosk-pill"
              style={{ background: lockBadge.bg, color: lockBadge.color }}
              onClick={() => setActiveTab('kiosk')}
              title="Click to manage kiosk lock"
            >
              {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
              <span>{isLocked ? 'LOCKED TASK' : 'UNLOCKED'}</span>
            </button>

            {/* Auto-Fix Viewport Quick Action */}
            <button
              type="button"
              className="btn btn-sm btn-outline studio-quick-action-btn"
              onClick={handleAutoRefreshViewport}
              disabled={isRefreshingViewport}
              title="Fix shrunk WebView viewport on external desktop display"
            >
              <RefreshCw size={11} className={isRefreshingViewport ? 'spin' : ''} />
              <span>AUTO-FIX VIEWPORT</span>
            </button>
          </div>

          <div className="studio-header-window-actions">
            <div className="live-refreshed-badge">
              <span className="dot" />
              <span>{streamSecondsAgo <= 1 ? 'LIVE' : `${streamSecondsAgo}s ago`}</span>
            </div>
            <button
              type="button"
              className="studio-action-icon-btn"
              onClick={() => { onRefreshStream(); fetchKioskStatus(); fetchLiveMeta(); }}
              title="Refresh Stream & Telemetry"
              disabled={kioskLoading || metaLoading}
            >
              <RefreshCw size={13} className={kioskLoading || metaLoading ? 'spin' : ''} />
            </button>
            <button
              type="button"
              className="studio-action-icon-btn"
              onClick={() => setIsMaximized(p => !p)}
              title={isMaximized ? 'Restore Drawer' : 'Maximize Drawer'}
            >
              {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              type="button"
              className="studio-action-icon-btn studio-close-btn"
              onClick={onClose}
              title="Close Studio"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Main Body: Split View */}
        <div className="device-studio-split-body">
          {/* Left Column: Live Visual Viewport & Gutter Alignment */}
          <div className="device-studio-left-pane">
            <div className="studio-viewport-card">
              {/* Viewport Toolbar */}
              <div className="studio-viewport-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="studio-toolbar-label">
                    {liveMode === 'desktop' ? 'EXTERNAL DESKTOP VIEWPORT' : 'PHONE SCREEN MIRROR'}
                  </span>
                  <span className="studio-toolbar-sub">
                    Display #{selectedDisplayId} • {liveMode === 'desktop' ? '1920×1080 @ 60Hz' : 'Phone Mode'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {liveMode === 'desktop' && (
                    <button
                      type="button"
                      className={`live-ai-boxes-btn ${showBoundingBoxes ? 'active' : ''}`}
                      onClick={onToggleBoundingBoxes}
                      title="Toggle AI Bounding Boxes overlay"
                    >
                      {showBoundingBoxes ? <Eye size={11} /> : <EyeOff size={11} />}
                      <span>AI BOXES</span>
                    </button>
                  )}

                  <div className="live-size-pill-group">
                    {(['sm', 'md', 'lg', 'fit'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        className={`live-size-btn ${viewportSize === s ? 'active' : ''}`}
                        onClick={() => setViewportSize(s)}
                      >
                        {s.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Areas Diagnostic Strip */}
              {liveMode === 'desktop' && (
                <div className="alignment-diagnostics-strip">
                  <span
                    style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.4px', cursor: 'pointer' }}
                    onClick={onOpenAlignmentModal}
                  >
                    AI AREAS:
                  </span>
                  {alignmentData.boxes && Object.entries(alignmentData.boxes).map(([key, b]) => {
                    const isPassed = b.passed !== false;
                    const label = key === 'first_line'
                      ? `Ln ${b.line_number || alignmentData.first_line_number || '?'} (Top)`
                      : key === 'last_line'
                      ? `Ln ${b.line_number || alignmentData.last_line_number || '?'} (Bottom)`
                      : key === 'file_name'
                      ? b.text || 'Filename'
                      : key === 'teams_logo'
                      ? b.text || 'Teams Logo'
                      : key === 'edit_mode'
                      ? 'Edit Mode (✏️)'
                      : key === 'dark_mode'
                      ? 'Dark Mode (🌙)'
                      : b.name;
                    return (
                      <div
                        key={key}
                        className={`alignment-chip ${isPassed ? 'passed' : 'failed'}`}
                        onClick={onOpenAlignmentModal}
                        style={{ cursor: 'pointer' }}
                        title="Click to view detailed alignment diagnostics"
                      >
                        <span style={{ color: b.hex || (isPassed ? '#22c55e' : '#ef4444') }}>●</span>
                        <span>{label}</span>
                        {!isPassed && <span style={{ fontSize: '9px', fontWeight: 800, color: '#ff7b72', marginLeft: '2px' }}>[FAIL]</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Screen Feed Viewport */}
              <div className={`live-screen-viewport ${liveMode === 'phone' ? 'phone-mode' : ''} size-${viewportSize}`}>
                <img
                  key={`studio-stream-${liveMode}-${streamKey}`}
                  className="live-screen-img"
                  src={`${apiBase}/api/device/stream?mode=${liveMode}&t=${streamKey}`}
                  alt={`Live ${liveMode} mode screen`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `${apiBase}/api/device/screen?mode=${liveMode}&t=${Date.now()}`;
                  }}
                />
                {showBoundingBoxes && liveMode === 'desktop' && renderBoundingBoxesOverlay(alignmentData)}
                <div className="live-screen-overlay-badge">
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ff4d4d', animation: 'pulse-dot 1.5s infinite' }} />
                  <span>LIVE • {liveMode.toUpperCase()}</span>
                </div>
                <div className="live-screen-overlay-info">
                  {meta?.display?.resolution || '1920×1080'} • {deviceInfo?.active_serial || 'ADB'}
                </div>
              </div>

              {/* Real-Time Gutter Stats & Viewport Alignment Bar */}
              <div className="studio-gutter-stats-card">
                <div className="studio-gutter-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={13} color="#00ff9d" />
                    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', color: 'var(--text-main)' }}>
                      REAL-TIME GUTTER STATS & VIEWPORT ALIGNMENT
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{ padding: '2px 8px', fontSize: '10px', height: '22px' }}
                    onClick={onTriggerAlignmentCheck}
                  >
                    Verify Alignment
                  </button>
                </div>

                <div className="live-meta-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '8px 0' }}>
                  <div className="live-meta-stat-item gutter-top">
                    <span className="stat-label">START LINE (TOP GUTTER)</span>
                    <span className="stat-value gutter-green">▲ Line #{gutterStats.first_line_number || 'Detecting...'}</span>
                  </div>
                  <div className="live-meta-stat-item gutter-bottom">
                    <span className="stat-label">END LINE (BOTTOM GUTTER)</span>
                    <span className="stat-value gutter-red">▼ Line #{gutterStats.last_line_number || 'Detecting...'}</span>
                  </div>
                  <div className="live-meta-stat-item">
                    <span className="stat-label">VISIBLE VIEWPORT SPAN</span>
                    <span className="stat-value">{gutterStats.visible_lines > 0 ? `${gutterStats.visible_lines} lines in viewport` : 'Awaiting OCR'}</span>
                  </div>
                  <div className="live-meta-stat-item">
                    <span className="stat-label">ALIGNMENT VERDICT</span>
                    <span className={`stat-value status-badge-pill ${gutterStats.is_aligned ? 'aligned' : 'unaligned'}`}>
                      {gutterStats.is_aligned ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      {gutterStats.is_aligned ? 'TEAMS ALIGNED' : 'NOT ALIGNED'}
                    </span>
                  </div>
                </div>

                <div className="live-meta-stat-item full-width" style={{ marginTop: '4px' }}>
                  <span className="stat-label">MARKDOWN DOCUMENT TITLE</span>
                  <span className="stat-value mono-filename">📄 {gutterStats.file_name || 'Matrix_main_26-09-17-8-19am.md'}</span>
                </div>

                <div className="live-meta-pills-row" style={{ marginTop: '8px' }}>
                  <div className={`live-meta-pill ${gutterStats.dark_mode ? 'pill-passed' : 'pill-failed'}`}>
                    <span>🌙 Dark Mode Theme</span>
                    <span className="pill-dot">●</span>
                  </div>
                  <div className={`live-meta-pill ${gutterStats.edit_mode ? 'pill-passed' : 'pill-failed'}`}>
                    <span>✏️ Active Edit Mode</span>
                    <span className="pill-dot">●</span>
                  </div>
                  <div className={`live-meta-pill ${gutterStats.first_line_number > 0 ? 'pill-passed' : 'pill-pending'}`}>
                    <span>Green Box (Top Ln)</span>
                    <span className="pill-dot">●</span>
                  </div>
                  <div className={`live-meta-pill ${gutterStats.last_line_number > 0 ? 'pill-passed' : 'pill-pending'}`}>
                    <span>Red Box (Bottom Ln)</span>
                    <span className="pill-dot">●</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Tabs for Kiosk, Device, Processes & Telemetry */}
          <div className="device-studio-right-pane">
            {/* Tab Selector */}
            <div className="studio-tabs-bar">
              <button
                type="button"
                className={`studio-tab-nav-btn ${activeTab === 'kiosk' ? 'active' : ''}`}
                onClick={() => setActiveTab('kiosk')}
              >
                <Shield size={13} />
                <span>KIOSK LOCK</span>
              </button>
              <button
                type="button"
                className={`studio-tab-nav-btn ${activeTab === 'device' ? 'active' : ''}`}
                onClick={() => setActiveTab('device')}
              >
                <Smartphone size={13} />
                <span>TARGET DEVICE</span>
              </button>
              <button
                type="button"
                className={`studio-tab-nav-btn ${activeTab === 'processes' ? 'active' : ''}`}
                onClick={() => setActiveTab('processes')}
              >
                <Cpu size={13} />
                <span>PROCESSES</span>
              </button>
              <button
                type="button"
                className={`studio-tab-nav-btn ${activeTab === 'telemetry' ? 'active' : ''}`}
                onClick={() => setActiveTab('telemetry')}
              >
                <Activity size={13} />
                <span>TELEMETRY & LOGS</span>
              </button>
            </div>

            <div className="studio-tab-content-container">
              {/* TAB 1: KIOSK LOCKDOWN */}
              {activeTab === 'kiosk' && (
                <div className="studio-tab-pane">
                  {/* Status Banner */}
                  <div className="kiosk-status-card" style={{ borderColor: isLocked ? '#00ff9d' : '#30363d' }}>
                    <div className="kiosk-status-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="kiosk-lock-indicator" style={{ background: lockBadge.bg, color: lockBadge.color }}>
                          {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                        </div>
                        <div>
                          <div className="kiosk-status-pill" style={{ background: lockBadge.bg, color: lockBadge.color }}>
                            <span className="dot" style={{ background: lockBadge.color }} />
                            {lockBadge.label}
                          </div>
                          <div className="kiosk-status-meta">
                            Target Display: <strong>#{selectedDisplayId}</strong> • App: <strong>{kioskTelemetry?.locked_package || targetPackage}</strong>
                          </div>
                        </div>
                      </div>
                      {lastActionLatencyMs !== null && (
                        <div className="kiosk-latency-badge" title="RPC roundtrip latency">
                          <Zap size={11} color="#e3b341" />
                          <span>{lastActionLatencyMs}ms</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Connected Displays */}
                  <div className="kiosk-section-card">
                    <div className="kiosk-section-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Monitor size={15} color="#58a6ff" />
                        <h4>CONNECTED DISPLAYS ({displays.length})</h4>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          style={{
                            background: 'rgba(88, 166, 255, 0.15)',
                            color: '#58a6ff',
                            border: '1px solid rgba(88, 166, 255, 0.3)',
                            padding: '3px 8px',
                            fontSize: '11px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                          onClick={handleAutoRefreshViewport}
                          disabled={isRefreshingViewport}
                          title="Fix shrunk WebView viewport on external desktop display"
                        >
                          <RefreshCw size={11} className={isRefreshingViewport ? 'spin' : ''} />
                          <span>AUTO-FIX VIEWPORT</span>
                        </button>
                        <span className="kiosk-section-tag">MULTI-DISPLAY PIPELINE</span>
                      </div>
                    </div>
                    <div className="kiosk-displays-list">
                      {displays.length > 0 ? displays.map((disp) => {
                        const isSelected = selectedDisplayId === disp.displayId;
                        return (
                          <div
                            key={disp.displayId}
                            className={`kiosk-display-item ${isSelected ? 'selected' : ''} ${disp.isExternal ? 'external' : 'internal'}`}
                            onClick={() => setSelectedDisplayId(disp.displayId)}
                          >
                            <div className="kiosk-disp-icon">
                              {disp.isExternal ? <Monitor size={18} /> : <Smartphone size={18} />}
                            </div>
                            <div className="kiosk-disp-info">
                              <div className="kiosk-disp-title">
                                <span className="kiosk-disp-name">{disp.name}</span>
                                <span className="kiosk-disp-badge">Display #{disp.displayId}</span>
                                {disp.isExternal && <span className="kiosk-disp-tag-ext">EXTERNAL DESKTOP</span>}
                              </div>
                              <div className="kiosk-disp-specs">
                                {disp.width} × {disp.height} @ {disp.refreshRate}Hz • {disp.category}
                              </div>
                            </div>
                            <div className="kiosk-disp-select-radio">
                              {isSelected && <Check size={14} color="#00ff9d" />}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="kiosk-empty-state">
                          <Loader2 size={16} className="spin" />
                          <span>Scanning connected monitors...</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kiosk Mode Selector */}
                  <div className="kiosk-section-card">
                    <div className="kiosk-section-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sliders size={15} color="#bc8cff" />
                        <h4>KIOSK MODE SELECTOR</h4>
                      </div>
                    </div>
                    <div className="kiosk-mode-grid">
                      {[
                        ['freeform', Laptop, 'Standard Freeform', 'Standard windowed desktop environment with resizable windows and full taskbar.'],
                        ['mirrored', Eye, 'Fullscreen Mirrored', 'Mirrors the phone screen to external monitor in fullscreen mode.'],
                        ['kiosk', ShieldCheck, 'Exclusive Kiosk', 'Locks target app onto external display. Intercepts Alt+Tab, Meta, and boundary clicks.'],
                      ].map(([m, Icon, title, desc]) => (
                        <button
                          key={m as string}
                          type="button"
                          className={`kiosk-mode-tile ${kioskMode === m ? 'active' : ''}`}
                          onClick={() => setKioskMode(m as any)}
                        >
                          <div className="mode-tile-header">
                            <Icon size={15} />
                            <span>{title as string}</span>
                          </div>
                          <p>{desc as string}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Target Application Package */}
                  <div className="kiosk-section-card">
                    <div className="kiosk-section-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Cpu size={15} color="#58a6ff" />
                        <h4>TARGET APPLICATION PACKAGE</h4>
                      </div>
                    </div>
                    <div className="kiosk-package-input-group">
                      <input
                        type="text"
                        className="kiosk-text-input"
                        placeholder="e.g. com.microsoft.teams"
                        value={targetPackage}
                        onChange={(e) => setTargetPackage(e.target.value)}
                      />
                      <div className="kiosk-package-pills">
                        {['com.microsoft.teams', 'com.matrixcapture.app'].map(pkg => (
                          <button
                            key={pkg}
                            type="button"
                            className={`kiosk-pkg-pill ${targetPackage === pkg ? 'active' : ''}`}
                            onClick={() => setTargetPackage(pkg)}
                          >
                            {pkg === 'com.microsoft.teams' ? 'Microsoft Teams' : 'MatrixCapture Kiosk'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Peripheral Restrictions */}
                  <div className="kiosk-section-card">
                    <div className="kiosk-section-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Key size={15} color="#f0883e" />
                        <h4>PERIPHERAL RESTRICTIONS</h4>
                      </div>
                    </div>
                    <div className="kiosk-restrictions-list">
                      {[
                        [suppressHotkeys, setSuppressHotkeys, 'Suppress Global OS Hotkeys', 'Swallow Alt+Tab, Meta / Super, Esc, and App Switch keys'],
                        [disableStatusBar, setDisableStatusBar, 'Disable Status Bar & Taskbar', 'Hide Android desktop taskbar and system navigation bars'],
                        [preventSleep, setPreventSleep, 'Prevent Sleep While Docked', 'Enforce FLAG_KEEP_SCREEN_ON during DisplayPort docking'],
                      ].map(([val, setVal, title, desc]: any) => (
                        <label key={title} className="kiosk-checkbox-label">
                          <input type="checkbox" checked={val} onChange={(e) => setVal(e.target.checked)} />
                          <div className="kiosk-checkbox-text">
                            <span className="kiosk-cb-title">{title}</span>
                            <span className="kiosk-cb-desc">{desc}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Security Context & DPC */}
                  <div className="kiosk-section-card">
                    <div className="kiosk-section-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldAlert size={15} color="#e3b341" />
                        <h4>SECURITY CONTEXT & DPC</h4>
                      </div>
                    </div>
                    <div className="kiosk-security-details">
                      <div className="kiosk-sec-row">
                        <span>Active Device Admin:</span>
                        <span className={kioskTelemetry?.active_admin_active ? 'sec-status-good' : 'sec-status-warn'}>
                          {kioskTelemetry?.active_admin_active ? 'ENABLED (KioskAdminReceiver)' : 'NOT CONFIGURED'}
                        </span>
                      </div>
                      <div className="kiosk-sec-row">
                        <span>Device Owner (COSU):</span>
                        <span className={kioskTelemetry?.device_owner_active ? 'sec-status-good' : 'sec-status-info'}>
                          {kioskTelemetry?.device_owner_active ? 'ENABLED (Zero-Leakage DPC)' : 'Standard Pinned Lock Task Mode'}
                        </span>
                      </div>
                      {!kioskTelemetry?.active_admin_active && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ width: '100%', marginTop: '8px', fontSize: '11px', height: '30px' }}
                          onClick={handleProvisionAdmin}
                          disabled={isProvisioning}
                        >
                          {isProvisioning ? <Loader2 size={12} className="spin" /> : 'Provision Active Admin via ADB'}
                        </button>
                      )}
                      {provisionMessage && <div className="kiosk-provision-msg">{provisionMessage}</div>}
                    </div>
                  </div>

                  {/* Primary CTA */}
                  <div className="kiosk-cta-container">
                    {!isLocked ? (
                      <button
                        type="button"
                        className="btn btn-primary kiosk-primary-btn"
                        onClick={() => setShowConfirmLockModal(true)}
                        disabled={isLocking}
                      >
                        {isLocking ? <Loader2 size={14} className="spin" /> : <Lock size={14} />}
                        <span>LOCK TO EXTERNAL DISPLAY #{selectedDisplayId}</span>
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ flex: 1, height: '40px', background: '#238636', borderColor: '#2ea043' }}
                          onClick={() => setShowConfirmLockModal(true)}
                          disabled={isLocking}
                        >
                          <RefreshCw size={13} />
                          <span>RE-SYNC LOCK</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger kiosk-emergency-btn"
                          onClick={() => setShowEmergencyModal(true)}
                          disabled={isReleasing}
                        >
                          {isReleasing ? <Loader2 size={14} className="spin" /> : <Unlock size={14} />}
                          <span>RELEASE LOCK</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TARGET DEVICE & WIRELESS ADB */}
              {activeTab === 'device' && (
                <div className="studio-tab-pane">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                    <div className="dropdown-section-title" style={{ padding: 0 }}>TARGET DEVICE</div>
                    <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Click card to select & activate</span>
                  </div>

                  <div className="device-cards-grid">
                    {/* Pixel 8 Selection Card */}
                    <div
                      className={`device-card ${deviceModel === 'pixel_8' ? 'selected' : ''} ${isP8Available ? 'available' : 'unavailable'}`}
                      onClick={() => onSelectDevice('pixel_8')}
                    >
                      <div className="device-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Smartphone size={15} color={isP8Available ? '#22c55e' : '#ef4444'} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>PIXEL 8</span>
                              <span style={{ fontSize: '10px', opacity: 0.8 }}>(31L)</span>
                            </div>
                            <div style={{ fontSize: '10px', opacity: 0.85, fontFamily: 'var(--font-mono)' }}>
                              {pixel8Ip || 'No IP configured'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`device-status-badge ${isP8Available ? 'available' : 'unavailable'}`}>
                            <span className="status-dot-mini" />
                            {isP8Available ? 'ONLINE' : 'NOT AVAILABLE'}
                          </span>
                          <div
                            className={`device-select-checkbox ${deviceModel === 'pixel_8' ? 'checked' : ''}`}
                            title={deviceModel === 'pixel_8' ? 'Selected / Active Device' : 'Click to select Pixel 8'}
                          >
                            {deviceModel === 'pixel_8' && <Check size={12} strokeWidth={3} />}
                          </div>
                        </div>
                      </div>

                      <div className="device-card-actions" onClick={e => e.stopPropagation()}>
                        {!isP8Available && pixel8Ip && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ padding: '2px 8px', fontSize: '10px', background: '#238636', borderColor: '#2ea043', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => onConnectAdbIp(pixel8Ip, 'pixel_8')}
                            disabled={isConnectingIp}
                          >
                            {isConnectingIp ? <Loader2 size={10} className="spin" /> : <Zap size={10} />}
                            <span>Connect</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => {
                            setActiveConfigureDevice(p => p === 'pixel_8' ? null : 'pixel_8');
                            setConnectIpInput(pixel8Ip);
                            setPairIpInput(pixel8Ip);
                          }}
                        >
                          {activeConfigureDevice === 'pixel_8' ? 'Close' : 'Configure IP'}
                        </button>
                      </div>

                      {activeConfigureDevice === 'pixel_8' && (
                        <div className="device-configure-inline" onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>PIXEL 8 WIRELESS ADB</span>
                            <div className="adb-mode-tabs">
                              <button
                                type="button"
                                className={`adb-tab-btn ${deviceConfigTab === 'connect' ? 'active' : ''}`}
                                onClick={() => setDeviceConfigTab('connect')}
                              >
                                Connect
                              </button>
                              <button
                                type="button"
                                className={`adb-tab-btn pair-tab ${deviceConfigTab === 'pair' ? 'active' : ''}`}
                                onClick={() => setDeviceConfigTab('pair')}
                              >
                                Pair New
                              </button>
                            </div>
                          </div>

                          {deviceConfigTab === 'connect' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div className="connect-ip-row">
                                <input
                                  type="text"
                                  className="connect-ip-input"
                                  placeholder="192.168.86.87:37547"
                                  value={connectIpInput}
                                  onChange={e => { setConnectIpInput(e.target.value); setPixel8Ip(e.target.value); }}
                                  onKeyDown={e => e.key === 'Enter' && onConnectAdbIp(connectIpInput, 'pixel_8')}
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ padding: '2px 8px', height: '24px', fontSize: '10px' }}
                                  onClick={() => onConnectAdbIp(connectIpInput, 'pixel_8')}
                                  disabled={isConnectingIp || !connectIpInput.trim()}
                                >
                                  {isConnectingIp ? <Loader2 size={10} className="spin" /> : 'Connect'}
                                </button>
                              </div>
                              {connectStatusMsg && <div style={{ fontSize: '10px', color: connectStatusMsg.includes('✔') ? '#00ff9d' : '#ff7b72' }}>{connectStatusMsg}</div>}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div className="connect-ip-row">
                                <input
                                  type="text"
                                  className="connect-ip-input"
                                  placeholder="Pair IP:Port (e.g. 192.168.86.87:37547)"
                                  value={pairIpInput}
                                  onChange={e => setPairIpInput(e.target.value)}
                                />
                              </div>
                              <div className="connect-ip-row">
                                <input
                                  type="text"
                                  className="connect-ip-input"
                                  placeholder="6-digit Pairing Code"
                                  value={pairCodeInput}
                                  onChange={e => setPairCodeInput(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && onPairAdb?.(pairIpInput, pairCodeInput, 'pixel_8')}
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ padding: '2px 8px', height: '24px', fontSize: '10px', background: '#a371f7', borderColor: '#8957e5' }}
                                  onClick={() => onPairAdb?.(pairIpInput, pairCodeInput, 'pixel_8')}
                                  disabled={isPairing || !pairIpInput.trim() || !pairCodeInput.trim()}
                                >
                                  {isPairing ? <Loader2 size={10} className="spin" /> : 'Pair Device'}
                                </button>
                              </div>
                              {pairStatusMsg && <div style={{ fontSize: '10px', color: pairStatusMsg.includes('✔') ? '#00ff9d' : '#ff7b72' }}>{pairStatusMsg}</div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Pixel 10 Selection Card */}
                    <div
                      className={`device-card ${deviceModel === 'pixel_10' ? 'selected' : ''} ${isP10Available ? 'available' : 'unavailable'}`}
                      onClick={() => onSelectDevice('pixel_10')}
                    >
                      <div className="device-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Smartphone size={15} color={isP10Available ? '#22c55e' : '#ef4444'} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>PIXEL 10</span>
                              <span style={{ fontSize: '10px', opacity: 0.8 }}>(47L)</span>
                            </div>
                            <div style={{ fontSize: '10px', opacity: 0.85, fontFamily: 'var(--font-mono)' }}>
                              {pixel10Ip || 'No IP configured'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`device-status-badge ${isP10Available ? 'available' : 'unavailable'}`}>
                            <span className="status-dot-mini" />
                            {isP10Available ? 'ONLINE' : 'NOT AVAILABLE'}
                          </span>
                          <div
                            className={`device-select-checkbox ${deviceModel === 'pixel_10' ? 'checked' : ''}`}
                            title={deviceModel === 'pixel_10' ? 'Selected / Active Device' : 'Click to select Pixel 10'}
                          >
                            {deviceModel === 'pixel_10' && <Check size={12} strokeWidth={3} />}
                          </div>
                        </div>
                      </div>

                      <div className="device-card-actions" onClick={e => e.stopPropagation()}>
                        {!isP10Available && pixel10Ip && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ padding: '2px 8px', fontSize: '10px', background: '#238636', borderColor: '#2ea043', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => onConnectAdbIp(pixel10Ip, 'pixel_10')}
                            disabled={isConnectingIp}
                          >
                            {isConnectingIp ? <Loader2 size={10} className="spin" /> : <Zap size={10} />}
                            <span>Connect</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => {
                            setActiveConfigureDevice(p => p === 'pixel_10' ? null : 'pixel_10');
                            setConnectIpInput(pixel10Ip);
                            setPairIpInput(pixel10Ip);
                          }}
                        >
                          {activeConfigureDevice === 'pixel_10' ? 'Close' : 'Configure IP'}
                        </button>
                      </div>

                      {activeConfigureDevice === 'pixel_10' && (
                        <div className="device-configure-inline" onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>PIXEL 10 WIRELESS ADB</span>
                            <div className="adb-mode-tabs">
                              <button
                                type="button"
                                className={`adb-tab-btn ${deviceConfigTab === 'connect' ? 'active' : ''}`}
                                onClick={() => setDeviceConfigTab('connect')}
                              >
                                Connect
                              </button>
                              <button
                                type="button"
                                className={`adb-tab-btn pair-tab ${deviceConfigTab === 'pair' ? 'active' : ''}`}
                                onClick={() => setDeviceConfigTab('pair')}
                              >
                                Pair New
                              </button>
                            </div>
                          </div>

                          {deviceConfigTab === 'connect' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div className="connect-ip-row">
                                <input
                                  type="text"
                                  className="connect-ip-input"
                                  placeholder="192.168.86.81:44587"
                                  value={connectIpInput}
                                  onChange={e => { setConnectIpInput(e.target.value); setPixel10Ip(e.target.value); }}
                                  onKeyDown={e => e.key === 'Enter' && onConnectAdbIp(connectIpInput, 'pixel_10')}
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ padding: '2px 8px', height: '24px', fontSize: '10px' }}
                                  onClick={() => onConnectAdbIp(connectIpInput, 'pixel_10')}
                                  disabled={isConnectingIp || !connectIpInput.trim()}
                                >
                                  {isConnectingIp ? <Loader2 size={10} className="spin" /> : 'Connect'}
                                </button>
                              </div>
                              {connectStatusMsg && <div style={{ fontSize: '10px', color: connectStatusMsg.includes('✔') ? '#00ff9d' : '#ff7b72' }}>{connectStatusMsg}</div>}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div className="connect-ip-row">
                                <input
                                  type="text"
                                  className="connect-ip-input"
                                  placeholder="Pair IP:Port (e.g. 192.168.86.81:44587)"
                                  value={pairIpInput}
                                  onChange={e => setPairIpInput(e.target.value)}
                                />
                              </div>
                              <div className="connect-ip-row">
                                <input
                                  type="text"
                                  className="connect-ip-input"
                                  placeholder="6-digit Pairing Code"
                                  value={pairCodeInput}
                                  onChange={e => setPairCodeInput(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && onPairAdb?.(pairIpInput, pairCodeInput, 'pixel_10')}
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ padding: '2px 8px', height: '24px', fontSize: '10px', background: '#a371f7', borderColor: '#8957e5' }}
                                  onClick={() => onPairAdb?.(pairIpInput, pairCodeInput, 'pixel_10')}
                                  disabled={isPairing || !pairIpInput.trim() || !pairCodeInput.trim()}
                                >
                                  {isPairing ? <Loader2 size={10} className="spin" /> : 'Pair Device'}
                                </button>
                              </div>
                              {pairStatusMsg && <div style={{ fontSize: '10px', color: pairStatusMsg.includes('✔') ? '#00ff9d' : '#ff7b72' }}>{pairStatusMsg}</div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Connected ADB Devices Selector (if multiple) */}
                  {deviceInfo?.devices && deviceInfo.devices.length > 0 && (
                    <div className="kiosk-section-card" style={{ marginTop: '12px' }}>
                      <div className="kiosk-section-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Smartphone size={15} color="#58a6ff" />
                          <h4>DETECTED ADB HARDWARE ({deviceInfo.devices.length})</h4>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {deviceInfo.devices.map(dev => {
                          const active = deviceInfo.active_serial === dev.serial;
                          return (
                            <div
                              key={dev.serial}
                              className={`kiosk-display-item ${active ? 'selected' : ''}`}
                              onClick={() => onSelectSerial?.(dev.serial)}
                              style={{ padding: '8px 12px' }}
                            >
                              <Smartphone size={16} color={active ? '#00ff9d' : '#8b949e'} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: active ? '#00ff9d' : 'var(--text-main)' }}>
                                  {dev.displayName || dev.model.replace(/_/g, ' ')}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                  Serial: {dev.serial} • {dev.status}
                                </div>
                              </div>
                              {active && <Check size={14} color="#00ff9d" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Display Hardware Capabilities */}
                  <div className="dropdown-section-title" style={{ marginTop: '14px' }}>DISPLAY HARDWARE CAPABILITIES</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div className={`capability-card ${deviceInfo?.displays?.desktop ? 'ready' : 'na'}`} style={{ flex: 1 }}>
                      <Monitor size={14} />
                      <span>Desktop Mode: {deviceInfo?.displays?.desktop ? 'READY' : 'N/A'}</span>
                    </div>
                    <div className={`capability-card phone ${deviceInfo?.displays?.phone ? 'ready' : 'na'}`} style={{ flex: 1 }}>
                      <Smartphone size={14} />
                      <span>Phone Mode: {deviceInfo?.displays?.phone ? 'READY' : 'N/A'}</span>
                    </div>
                  </div>

                  {/* Input Method & Virtual Keyboard Suppression */}
                  <div className="dropdown-section-title" style={{ marginTop: '14px' }}>INPUT METHOD & IME</div>
                  <div className="ime-control-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Keyboard size={15} color="#00ff9d" />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>HID Active (IME Suppressed)</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Prevents software keyboard popup over desktop viewport</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ padding: '4px 10px', height: '26px', fontSize: '11px' }}
                      onClick={onCloseKeyboard}
                      disabled={isClosingKeyboard}
                      title="Force dismiss on-screen virtual keyboard"
                    >
                      {isClosingKeyboard ? <Loader2 size={11} className="spin" /> : 'Close IME'}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: PROCESS TELEMETRY & ATTRIBUTES */}
              {activeTab === 'processes' && (
                <div className="studio-tab-pane">
                  <div className="live-meta-section">
                    <div className="live-meta-section-header">
                      <Cpu size={13} color="#bc8cff" />
                      <span>ATTRIBUTES OF RUNNING PROCESSES</span>
                    </div>

                    {focusedApp && (
                      <div className="live-meta-focus-banner">
                        <Activity size={12} color="#00ff9d" />
                        <span className="focus-label">FOCUSED WINDOW:</span>
                        <span className="focus-app" title={focusedApp}>
                          {focusedApp.replace('mFocusedApp=ActivityRecord{', '').replace('}', '')}
                        </span>
                      </div>
                    )}

                    <div className="live-meta-procs-table-wrapper" style={{ maxHeight: '340px' }}>
                      <table className="live-meta-procs-table">
                        <thead>
                          <tr>
                            <th>Process / Service</th>
                            <th>PID</th>
                            <th>UID</th>
                            <th>RSS Memory</th>
                            <th>Activity / Component</th>
                            <th>Focus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {procs.length > 0 ? procs.map((p) => (
                            <tr key={p.name} className={p.is_focused ? 'focused-row' : ''}>
                              <td className="proc-name-cell">
                                <div className="proc-title">{p.label || p.name}</div>
                                <div className="proc-pkg">{p.name}</div>
                              </td>
                              <td className="proc-mono">{p.pid}</td>
                              <td className="proc-mono">{p.user}</td>
                              <td className="proc-mono">{p.rss_mb ? `${p.rss_mb} MB` : `${p.rss_kb || 0} KB`}</td>
                              <td className="proc-activity"><code>{p.activity || '—'}</code></td>
                              <td>
                                <span className={`proc-focus-badge ${p.is_focused ? 'focused' : 'background'}`}>
                                  {p.is_focused ? 'FOCUSED' : 'BACKGROUND'}
                                </span>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', color: '#8b949e', padding: '16px' }}>
                                No process attributes detected via ADB.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="live-meta-ime-strip" style={{ marginTop: '12px' }}>
                      <ShieldCheck size={13} color="#00ff9d" />
                      <span>HARD KEYBOARD SUPPRESSION:</span>
                      <span className="ime-badge active">ACTIVE (Soft Keyboard suppressed on desktop display)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: CAPTURE TELEMETRY & EVENT LOGS */}
              {activeTab === 'telemetry' && (
                <div className="studio-tab-pane">
                  {/* Active Project Initialization Progress Banner (from modal if active) */}
                  {projectInitProgress && projectInitProgress.active && (
                    <div className="kiosk-section-card" style={{ borderColor: projectInitProgress.status === 'error' ? '#ff7b72' : '#00ff9d', background: 'rgba(0, 255, 157, 0.04)' }}>
                      <div className="kiosk-section-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Cpu size={15} color={projectInitProgress.status === 'error' ? '#ff7b72' : '#00ff9d'} />
                          <h4>PROJECT INITIALIZATION PROGRESS</h4>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#00ff9d' }}>
                            {projectInitProgress.percent}%
                          </span>
                          {onDismissInitProgress && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={onDismissInitProgress}
                              title="Dismiss progress card"
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ width: '100%', height: '8px', background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', overflow: 'hidden', margin: '6px 0 10px 0' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${projectInitProgress.percent}%`,
                            background: projectInitProgress.status === 'completed' ? 'linear-gradient(90deg, #238636, #00ff9d)' : 'linear-gradient(90deg, #1f6feb, #a371f7, #00ff9d)',
                            transition: 'width 0.4s ease-out'
                          }}
                        />
                      </div>

                      <div style={{ fontSize: '11px', color: '#e6edf3', marginBottom: '8px' }}>
                        {projectInitProgress.stage}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px', color: '#8b949e' }}>
                        <div style={{ color: projectInitProgress.percent >= 10 ? '#00ff9d' : '#8b949e' }}>✔ 1. Database entry & active workspace configured</div>
                        <div style={{ color: projectInitProgress.percent >= 25 ? '#00ff9d' : '#8b949e' }}>✔ 2. External display verified & editor cursor focused</div>
                        <div style={{ color: projectInitProgress.percent >= 50 ? '#00ff9d' : '#8b949e' }}>{projectInitProgress.percent >= 50 ? '✔' : '○'} 3. Dispatched HID Ctrl+End & calibrated total lines</div>
                        <div style={{ color: projectInitProgress.percent >= 100 ? '#00ff9d' : '#8b949e' }}>{projectInitProgress.percent >= 100 ? '✔' : '○'} 4. Dispatched HID Ctrl+Home & verified Line 1 in gutter</div>
                      </div>
                    </div>
                  )}

                  {/* Document Progress Summary */}
                  <div className="kiosk-section-card">
                    <div className="kiosk-section-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={15} color="#58a6ff" />
                        <h4>DOCUMENT CAPTURE PROGRESS</h4>
                      </div>
                      <span className="kiosk-section-tag" style={{ color: '#00ff9d' }}>
                        {telemetry.phase || 'PACING'}
                      </span>
                    </div>

                    <div style={{ width: '100%', height: '8px', background: '#161b22', border: '1px solid #30363d', borderRadius: '4px', overflow: 'hidden', margin: '4px 0 10px 0' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${captureProgressPercent}%`,
                          background: 'linear-gradient(90deg, #1f6feb, #00ff9d)',
                          transition: 'width 0.3s ease-out'
                        }}
                      />
                    </div>

                    <div className="live-meta-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      <div className="live-meta-stat-item">
                        <span className="stat-label">LINES EXTRACTED</span>
                        <span className="stat-value">{documentSummary.total_lines} / {targetLines || 'EOF'}</span>
                      </div>
                      <div className="live-meta-stat-item">
                        <span className="stat-label">TOTAL FRAMES</span>
                        <span className="stat-value">{documentSummary.total_frames}</span>
                      </div>
                      <div className="live-meta-stat-item">
                        <span className="stat-label">ESTIMATED SPEND</span>
                        <span className="stat-value highlight-green">${(tokenStats.estimated_cost_usd || 0).toFixed(4)}</span>
                      </div>
                      <div className="live-meta-stat-item">
                        <span className="stat-label">NETWORK & WS</span>
                        <span className="stat-value" style={{ color: wsConnected ? '#00ff9d' : '#ff7b72' }}>
                          {wsConnected ? '● WS Online' : '○ WS Offline'} ({latencyMs}ms)
                        </span>
                      </div>
                      <div className="live-meta-stat-item">
                        <span className="stat-label">VERIFIED OVERLAPS</span>
                        <span className="stat-value">{documentSummary.verified_overlap_lines}</span>
                      </div>
                      <div className="live-meta-stat-item">
                        <span className="stat-label">TOTAL TOKENS</span>
                        <span className="stat-value">{totalTokens.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Live Event Log */}
                  <div className="kiosk-section-card" style={{ marginTop: '12px' }}>
                    <div className="kiosk-section-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={15} color="#e3b341" />
                        <h4>EVENT LOGS ({eventsLog.length})</h4>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={handleCopySnapshot}
                          title="Copy full telemetry JSON snapshot to clipboard"
                        >
                          <Copy size={10} />
                          <span>{copiedSnapshot ? 'Copied!' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={onClearEvents}
                          title="Clear events log"
                        >
                          <Trash2 size={10} />
                          <span>Clear</span>
                        </button>
                      </div>
                    </div>

                    <div className="studio-events-log-container">
                      {eventsLog.length > 0 ? eventsLog.slice(-35).map((evt) => (
                        <div key={evt.id} className="studio-event-row">
                          <span className="studio-event-time">{evt.timestamp}</span>
                          <span className={`studio-event-category cat-${evt.category.toLowerCase()}`}>{evt.category}</span>
                          <span className="studio-event-msg">{evt.message}</span>
                        </div>
                      )) : (
                        <div style={{ padding: '16px', color: '#8b949e', fontSize: '11px', textAlign: 'center' }}>
                          No recent telemetry events logged.
                        </div>
                      )}
                      <div ref={logEndRef} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation & Authorization Modals */}
      {showConfirmLockModal && (
        <div className="kiosk-modal-backdrop">
          <div className="kiosk-modal-content">
            <div className="kiosk-modal-header">
              <div className="kiosk-modal-icon-warn"><AlertTriangle size={20} color="#f0883e" /></div>
              <div><h4>ENGAGE SECURE EXTERNAL KIOSK</h4><p>Hardware Input & Boundary Lockdown Warning</p></div>
            </div>
            <div className="kiosk-modal-body">
              <p>Engaging Kiosk Mode will lock <strong>{targetPackage}</strong> onto external Display <strong>#{selectedDisplayId}</strong>:</p>
              <ul className="kiosk-modal-bullets">
                <li>Escape hotkeys (<code>Alt+Tab</code>, <code>Meta/Super</code>, <code>Esc</code>) will be intercepted.</li>
                <li>The desktop taskbar and window decorations will be hidden/restricted.</li>
                <li>DisplayPort Alt Mode unplug/replug events will automatically re-bind the sandbox.</li>
                <li>Lock mode can only be released via this Web UI Remote Control or Emergency PIN.</li>
              </ul>
            </div>
            <div className="kiosk-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowConfirmLockModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleExecuteLock} disabled={isLocking}>
                {isLocking ? <Loader2 size={13} className="spin" /> : <Lock size={13} />}
                <span>Confirm & Lock Display</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmergencyModal && (
        <div className="kiosk-modal-backdrop">
          <div className="kiosk-modal-content">
            <div className="kiosk-modal-header">
              <div className="kiosk-modal-icon-danger"><ShieldAlert size={20} color="#f85149" /></div>
              <div><h4>EMERGENCY LOCK RELEASE</h4><p>Admin Override to Restore Desktop Freeform Windowing</p></div>
            </div>
            <div className="kiosk-modal-body">
              <p>This will terminate Lock Task Mode on Display #{selectedDisplayId}, restore standard freeform desktop window controls, and re-enable global hotkeys.</p>
              <div style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Admin Authorization PIN / Confirmation:</label>
                <input
                  type="password"
                  className="kiosk-text-input"
                  placeholder="Enter PIN (Default: admin)"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleExecuteRelease(); }}
                  autoFocus
                />
              </div>
            </div>
            <div className="kiosk-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowEmergencyModal(false)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={handleExecuteRelease} disabled={isReleasing}>
                {isReleasing ? <Loader2 size={13} className="spin" /> : <Unlock size={13} />}
                <span>Authorize & Release Lock</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
