import React, { useState, useRef, useEffect } from 'react';
import {
  Smartphone, ChevronDown, Check, Loader2, Monitor, RefreshCw,
  Maximize2, Minimize2, X, Eye, EyeOff, Info, Shield
} from 'lucide-react';
import type { DeviceInfoData, AlignmentData } from '../types';
import { LiveMetaInfoPopover } from './LiveMetaInfoPopover';

interface LiveMonitorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  deviceInfo: DeviceInfoData | null;
  deviceModel: 'pixel_8' | 'pixel_10' | string;
  alignmentData: AlignmentData;
  liveMode: 'desktop' | 'phone';
  onSwitchLiveMode: (mode: 'desktop' | 'phone') => void;
  monitorSize: 'sm' | 'md' | 'lg' | 'custom';
  onSetPresetSize: (size: 'sm' | 'md' | 'lg') => void;
  showBoundingBoxes: boolean;
  onToggleBoundingBoxes: () => void;
  isDrawerMaximized: boolean;
  onToggleMaximize: () => void;
  drawerWidth: number;
  drawerHeight: number;
  isResizingDrawer: boolean;
  onResizeMouseDown: (e: React.MouseEvent, direction: 'corner' | 'top' | 'left') => void;
  onSelectSerial: (serial: string) => void;
  onSelectDevice: (model: 'pixel_8' | 'pixel_10') => void;
  onConnectAdbIp: (ip?: string) => Promise<void> | void;
  isConnectingIp: boolean;
  connectStatusMsg: string;
  onPairAdb?: (target: string, code: string) => Promise<void> | void;
  isPairing?: boolean;
  pairStatusMsg?: string;
  apiBase: string;
  streamKey: number;
  onRefreshStream: () => void;
  onOpenAlignmentModal: () => void;
  onOpenDeviceConfig?: () => void;
}
import { renderBoundingBoxesOverlay } from './BoundingBoxesOverlay';

export const LiveMonitorDrawer: React.FC<LiveMonitorDrawerProps> = ({
  isOpen,
  onClose,
  deviceInfo,
  deviceModel,
  alignmentData,
  liveMode,
  onSwitchLiveMode,
  monitorSize,
  onSetPresetSize,
  showBoundingBoxes,
  onToggleBoundingBoxes,
  isDrawerMaximized,
  onToggleMaximize,
  drawerWidth,
  drawerHeight,
  isResizingDrawer,
  onResizeMouseDown,
  onSelectSerial,
  onSelectDevice,
  onConnectAdbIp,
  isConnectingIp,
  connectStatusMsg,
  onPairAdb,
  isPairing = false,
  pairStatusMsg = '',
  apiBase,
  streamKey,
  onRefreshStream,
  onOpenAlignmentModal,
  onOpenDeviceConfig,
}) => {
  const [showDrawerDeviceMenu, setShowDrawerDeviceMenu] = useState(false);
  const [connectTab, setConnectTab] = useState<'connect' | 'pair'>('connect');
  const [connectIpInput, setConnectIpInput] = useState(() => {
    try {
      return localStorage.getItem('mc_last_adb_target') || '';
    } catch {
      return '';
    }
  });
  const [pairIpInput, setPairIpInput] = useState('');
  const [pairCodeInput, setPairCodeInput] = useState('');
  const drawerDeviceDropdownRef = useRef<HTMLDivElement>(null);
  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [agoSec, setAgoSec] = useState(0);

  useEffect(() => {
    setLastRefreshedAt(new Date());
    setAgoSec(0);
  }, [streamKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      setAgoSec(Math.floor((Date.now() - lastRefreshedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastRefreshedAt]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        drawerDeviceDropdownRef.current &&
        !drawerDeviceDropdownRef.current.contains(e.target as Node)
      ) {
        setShowDrawerDeviceMenu(false);
      }
    };
    if (showDrawerDeviceMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showDrawerDeviceMenu]);

  if (!isOpen) return null;

  return (
    <div
      className={`live-monitor-drawer ${isDrawerMaximized ? 'maximized' : ''} ${
        isResizingDrawer ? 'resizing' : ''
      }`}
      style={{
        width: isDrawerMaximized ? undefined : `${drawerWidth}px`,
        height: isDrawerMaximized ? undefined : `${drawerHeight}px`,
      }}
    >
      {/* Interactive Multi-Direction Drag Handles */}
      <div
        className="live-monitor-resize-handle"
        onMouseDown={(e) => onResizeMouseDown(e, 'corner')}
        title="Drag corner to resize live stream view"
      />
      <div
        className="live-monitor-resize-top"
        onMouseDown={(e) => onResizeMouseDown(e, 'top')}
        title="Drag top edge to adjust height"
      />
      <div
        className="live-monitor-resize-left"
        onMouseDown={(e) => onResizeMouseDown(e, 'left')}
        title="Drag left edge to adjust width"
      />

      <div className="live-monitor-header">
        {/* In-drawer Device Selector */}
        <div className="drawer-device-selector-wrapper" ref={drawerDeviceDropdownRef}>
          <button
            type="button"
            className="drawer-device-btn"
            onClick={() => setShowDrawerDeviceMenu((prev) => !prev)}
            title="Switch connected target device"
          >
            <div
              className={`device-status-dot ${
                deviceInfo?.connected ? 'online' : 'offline'
              }`}
            />
            <Smartphone size={12} color="var(--color-primary)" />
            <span>
              {deviceInfo?.active_model
                ? deviceInfo.active_model.toUpperCase()
                : deviceModel === 'pixel_8'
                ? 'PIXEL 8'
                : 'PIXEL 10'}
            </span>
            <ChevronDown
              size={11}
              style={{
                transform: showDrawerDeviceMenu ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          </button>

          {showDrawerDeviceMenu && (
            <div className="drawer-device-dropdown">
              <div className="dropdown-section-title">SWITCH TARGET DEVICE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {deviceInfo?.devices && deviceInfo.devices.length > 0 ? (
                  deviceInfo.devices.map((dev) => {
                    const isActive =
                      deviceInfo.active_serial === dev.serial ||
                      (!deviceInfo.active_serial &&
                        dev.model.toLowerCase().includes('pixel_8'));
                    return (
                      <div
                        key={dev.serial}
                        className={`device-list-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          onSelectSerial(dev.serial);
                          setShowDrawerDeviceMenu(false);
                        }}
                        style={{ padding: '6px 8px' }}
                      >
                        <div className="device-item-left">
                          <Smartphone
                            size={13}
                            color={isActive ? '#00ff9d' : '#8b949e'}
                          />
                          <div>
                            <div
                              className="device-item-title"
                              style={{
                                fontSize: '11px',
                                color: isActive ? '#00ff9d' : 'var(--text-main)',
                              }}
                            >
                              {dev.displayName ||
                                dev.model.replace(/_/g, ' ') ||
                                'Android Device'}
                            </div>
                            <div className="device-item-sub" style={{ fontSize: '9px' }}>
                              {dev.serial}
                            </div>
                          </div>
                        </div>
                        {isActive && <Check size={12} color="#00ff9d" />}
                      </div>
                    );
                  })
                ) : (
                  <div
                    style={{
                      padding: '6px',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    No ADB devices connected
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                <div className="dropdown-section-title" style={{ padding: 0 }}>WIRELESS ADB</div>
                <div className="adb-mode-tabs">
                  <button
                    type="button"
                    className={`adb-tab-btn ${connectTab === 'connect' ? 'active' : ''}`}
                    onClick={() => setConnectTab('connect')}
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    className={`adb-tab-btn pair-tab ${connectTab === 'pair' ? 'active' : ''}`}
                    onClick={() => setConnectTab('pair')}
                  >
                    Pair New
                  </button>
                </div>
              </div>

              {connectTab === 'connect' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div className="connect-ip-row">
                    <input
                      type="text"
                      className="connect-ip-input"
                      placeholder="192.168.86.xx:5555"
                      value={connectIpInput}
                      onChange={(e) => setConnectIpInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onConnectAdbIp(connectIpInput);
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '2px 8px', height: '24px', fontSize: '10px' }}
                      onClick={() => onConnectAdbIp(connectIpInput)}
                      disabled={isConnectingIp || !connectIpInput.trim()}
                    >
                      {isConnectingIp ? (
                        <Loader2 size={10} className="spin" />
                      ) : (
                        'Connect'
                      )}
                    </button>
                  </div>
                  {connectStatusMsg && (
                    <div
                      style={{
                        fontSize: '10px',
                        color: connectStatusMsg.includes('✔') ? '#00ff9d' : '#ff7b72',
                        marginTop: '2px',
                      }}
                    >
                      {connectStatusMsg}
                    </div>
                  )}
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', lineHeight: '1.2', padding: '0 2px' }}>
                    💡 Tip: Pairing persists across toggles. Only update the port if previously paired.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div className="connect-ip-row">
                    <input
                      type="text"
                      className="connect-ip-input"
                      placeholder="Pair IP:Port (e.g. 192.168.86.81:37123)"
                      value={pairIpInput}
                      onChange={(e) => setPairIpInput(e.target.value)}
                    />
                  </div>
                  <div className="connect-ip-row">
                    <input
                      type="text"
                      className="connect-ip-input"
                      placeholder="6-digit Pairing Code"
                      value={pairCodeInput}
                      onChange={(e) => setPairCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && onPairAdb) onPairAdb(pairIpInput, pairCodeInput);
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '2px 8px', height: '24px', fontSize: '10px', background: '#a371f7', borderColor: '#8957e5' }}
                      onClick={() => onPairAdb && onPairAdb(pairIpInput, pairCodeInput)}
                      disabled={isPairing || !pairIpInput.trim() || !pairCodeInput.trim() || !onPairAdb}
                    >
                      {isPairing ? <Loader2 size={10} className="spin" /> : 'Pair Device'}
                    </button>
                  </div>
                  {pairStatusMsg && (
                    <div
                      style={{
                        fontSize: '10px',
                        color: pairStatusMsg.includes('✔') ? '#00ff9d' : '#ff7b72',
                        marginTop: '2px',
                      }}
                    >
                      {pairStatusMsg}
                    </div>
                  )}
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', lineHeight: '1.2', padding: '0 2px' }}>
                    From "Pair device with pairing code" on your phone.
                  </div>
                </div>
              )}

              <div className="dropdown-section-title" style={{ marginTop: '6px' }}>
                PROFILE CALIBRATION
              </div>
              <div className="profile-pills-row">
                <button
                  type="button"
                  className={`profile-pill-btn ${
                    deviceModel === 'pixel_8' ? 'active pixel-8' : ''
                  }`}
                  onClick={() => {
                    onSelectDevice('pixel_8');
                    setShowDrawerDeviceMenu(false);
                  }}
                >
                  <Smartphone size={10} />
                  <span>PIXEL 8 (31L)</span>
                </button>
                <button
                  type="button"
                  className={`profile-pill-btn ${
                    deviceModel === 'pixel_10' ? 'active pixel-10' : ''
                  }`}
                  onClick={() => {
                    onSelectDevice('pixel_10');
                    setShowDrawerDeviceMenu(false);
                  }}
                >
                  <Smartphone size={10} />
                  <span>PIXEL 10 (47L)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mode Tabs (Desktop vs Phone) */}
        <div className="live-monitor-tabs">
          <button
            className={`live-tab-btn ${liveMode === 'desktop' ? 'active' : ''}`}
            onClick={() => onSwitchLiveMode('desktop')}
            title="External Display / Desktop Mode (Display 4)"
          >
            <Monitor size={11} />
            <span>DESKTOP</span>
          </button>
          <button
            className={`live-tab-btn ${liveMode === 'phone' ? 'active' : ''}`}
            onClick={() => onSwitchLiveMode('phone')}
            title="Phone Screen (Display 0)"
          >
            <Smartphone size={11} />
            <span>PHONE</span>
          </button>
        </div>

        {/* Size Preset Buttons: S, M, L */}
        <div className="live-size-pill-group" title="Quick size presets">
          <button
            type="button"
            className={`live-size-btn ${
              monitorSize === 'sm' && !isDrawerMaximized ? 'active' : ''
            }`}
            onClick={() => onSetPresetSize('sm')}
          >
            S
          </button>
          <button
            type="button"
            className={`live-size-btn ${
              monitorSize === 'md' && !isDrawerMaximized ? 'active' : ''
            }`}
            onClick={() => onSetPresetSize('md')}
          >
            M
          </button>
          <button
            type="button"
            className={`live-size-btn ${
              monitorSize === 'lg' && !isDrawerMaximized ? 'active' : ''
            }`}
            onClick={() => onSetPresetSize('lg')}
          >
            L
          </button>
        </div>

        {/* AI Bounding Boxes Toggle Button */}
        {liveMode === 'desktop' && (
          <button
            type="button"
            className={`live-ai-boxes-btn ${showBoundingBoxes ? 'active' : ''}`}
            onClick={onToggleBoundingBoxes}
            title="Toggle AI Alignment Bounding Boxes (Teams, Filename, Icons, Lines)"
          >
            {showBoundingBoxes ? <Eye size={11} /> : <EyeOff size={11} />}
            <span>AI BOXES</span>
          </button>
        )}

        {/* Real-time Last Refreshed Meta info pill */}
        <div className="live-refreshed-badge" title={`Stream key: ${streamKey}`}>
          <span className="dot" />
          <span>{agoSec <= 1 ? 'LIVE' : `${agoSec}s ago`}</span>
        </div>

        {/* Info Icon Button for Process Attributes & Real-time Gutter Stats */}
        <button
          type="button"
          className={`live-info-btn ${showInfoPopover ? 'active' : ''}`}
          onClick={() => setShowInfoPopover(prev => !prev)}
          title="Inspect Live View Metadata, Process Attributes & Real-time Gutter Stats"
        >
          <Info size={11} />
          <span>INFO</span>
        </button>

        {/* Kiosk Mode & Device Config Drawer Button */}
        {onOpenDeviceConfig && (
          <button
            type="button"
            className="live-info-btn"
            onClick={onOpenDeviceConfig}
            title="Open Dedicated External Desktop Kiosk Lockdown & Display Routing Controls"
          >
            <Shield size={11} color="#00ff9d" />
            <span>KIOSK</span>
          </button>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={onRefreshStream}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
            title="Refresh Stream"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onToggleMaximize}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
            title={isDrawerMaximized ? 'Restore Size' : 'Maximize Stream View'}
          >
            {isDrawerMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
            title="Close Live Monitor"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Real-time Diagnostics Strip */}
      {liveMode === 'desktop' && (
        <div className="alignment-diagnostics-strip">
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontWeight: 700,
              letterSpacing: '0.4px',
              cursor: 'pointer',
            }}
            onClick={onOpenAlignmentModal}
            title="Click to inspect full AI verification diagnostics"
          >
            AI AREAS:
          </span>
          {alignmentData.boxes &&
            Object.entries(alignmentData.boxes).map(([key, b]) => {
              const isPassed = b.passed !== false;
              const label =
                key === 'first_line'
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
                  title={`${b.name}: ${isPassed ? 'PASSED' : 'FAILED'}\nDetected: ${
                    b.detected_value || b.text || 'None'
                  }\nCriteria: ${b.expected || ''}\n${b.details || ''}\nClick to inspect details`}
                  style={{ cursor: 'pointer' }}
                >
                  <span style={{ color: b.hex || (isPassed ? '#22c55e' : '#ef4444') }}>●</span>
                  <span>{label}</span>
                  {!isPassed && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        color: '#ff7b72',
                        marginLeft: '2px',
                      }}
                    >
                      [FAIL]
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <div
        className={`live-screen-viewport ${
          liveMode === 'phone' ? 'phone-mode' : ''
        }`}
      >
        <img
          key={`stream-${liveMode}-${streamKey}`}
          className="live-screen-img"
          src={`${apiBase}/api/device/stream?mode=${liveMode}&t=${streamKey}`}
          alt={`Live ${liveMode} mode screen`}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `${apiBase}/api/device/screen?mode=${liveMode}&t=${Date.now()}`;
          }}
        />
        {showBoundingBoxes &&
          liveMode === 'desktop' &&
          renderBoundingBoxesOverlay(alignmentData)}
        <div className="live-screen-overlay-badge">
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#ff4d4d',
              animation: 'pulse-dot 1.5s infinite',
            }}
          />
          <span>LIVE • {liveMode.toUpperCase()}</span>
        </div>
        <div className="live-screen-overlay-info">
          {isDrawerMaximized ? 'MAXIMIZED' : `${drawerWidth}×${drawerHeight}`} •{' '}
          {deviceInfo?.active_serial || 'ADB'}
        </div>
      </div>

      {/* Live Desktop Metadata & Process Attributes Popover Modal */}
      {showInfoPopover && (
        <LiveMetaInfoPopover
          isOpen={showInfoPopover}
          onClose={() => setShowInfoPopover(false)}
          apiBase={apiBase}
          streamKey={streamKey}
          onRefresh={onRefreshStream}
          alignmentData={alignmentData}
          liveMode={liveMode}
        />
      )}
    </div>
  );
};
