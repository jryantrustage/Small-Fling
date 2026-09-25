import React, { useState, useRef, useEffect } from 'react';
import { Smartphone, ChevronDown, Check, Loader2, Monitor, RefreshCw, Maximize2, Minimize2, X, Eye, EyeOff, Info, Shield } from 'lucide-react';
import type { DeviceInfoData, AlignmentData } from '../types';
import { LiveMetaInfoPopover } from './LiveMetaInfoPopover';
import { useAgoTimer } from '../hooks/useAgoTimer';
import { renderBoundingBoxesOverlay } from './BoundingBoxesOverlay';

interface Props {
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

export const LiveMonitorDrawer: React.FC<Props> = ({
  isOpen, onClose, deviceInfo, deviceModel, alignmentData, liveMode, onSwitchLiveMode,
  monitorSize, onSetPresetSize, showBoundingBoxes, onToggleBoundingBoxes, isDrawerMaximized,
  onToggleMaximize, drawerWidth, drawerHeight, isResizingDrawer, onResizeMouseDown,
  onSelectSerial, onSelectDevice, onConnectAdbIp, isConnectingIp, connectStatusMsg,
  onPairAdb, isPairing = false, pairStatusMsg = '', apiBase, streamKey, onRefreshStream,
  onOpenAlignmentModal, onOpenDeviceConfig,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [tab, setTab] = useState<'connect' | 'pair'>('connect');
  const [ipInput, setIpInput] = useState(() => {
    try { return localStorage.getItem('mc_last_adb_target') || ''; } catch { return ''; }
  });
  const [pairIp, setPairIp] = useState('');
  const [pairCode, setPairCode] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  const { secondsAgo: agoSec } = useAgoTimer(streamKey);

  useEffect(() => {
    const onOut = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    if (showMenu) document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [showMenu]);

  if (!isOpen) return null;

  return (
    <div className={`live-monitor-drawer ${isDrawerMaximized ? 'maximized' : ''} ${isResizingDrawer ? 'resizing' : ''}`} style={{ width: isDrawerMaximized ? undefined : `${drawerWidth}px`, height: isDrawerMaximized ? undefined : `${drawerHeight}px` }}>
      <div className="live-monitor-resize-handle" onMouseDown={(e) => onResizeMouseDown(e, 'corner')} title="Resize corner" />
      <div className="live-monitor-resize-top" onMouseDown={(e) => onResizeMouseDown(e, 'top')} title="Resize height" />
      <div className="live-monitor-resize-left" onMouseDown={(e) => onResizeMouseDown(e, 'left')} title="Resize width" />

      <div className="live-monitor-header">
        <div className="live-monitor-controls-scroll">
          <div className="drawer-device-selector-wrapper" ref={menuRef}>
            <button type="button" className="drawer-device-btn" onClick={() => setShowMenu(p => !p)} title="Switch connected target device">
              <div className={`device-status-dot ${deviceInfo?.connected ? 'online' : 'offline'}`} />
              <Smartphone size={12} color="var(--color-primary)" />
              <span>{deviceInfo?.active_model?.toUpperCase() || (deviceModel === 'pixel_8' ? 'PIXEL 8' : 'PIXEL 10')}</span>
              <ChevronDown size={11} style={{ transform: showMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
            </button>

            {showMenu && (
              <div className="drawer-device-dropdown">
                <div className="dropdown-section-title">SWITCH TARGET DEVICE</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {deviceInfo?.devices?.length ? deviceInfo.devices.map((dev) => {
                    const active = deviceInfo.active_serial === dev.serial || (!deviceInfo.active_serial && dev.model.toLowerCase().includes('pixel_8'));
                    return (
                      <div key={dev.serial} className={`device-list-item ${active ? 'active' : ''}`} onClick={() => { onSelectSerial(dev.serial); setShowMenu(false); }} style={{ padding: '6px 8px' }}>
                        <div className="device-item-left">
                          <Smartphone size={13} color={active ? '#00ff9d' : '#8b949e'} />
                          <div><div className="device-item-title" style={{ fontSize: '11px', color: active ? '#00ff9d' : 'var(--text-main)' }}>{dev.displayName || dev.model.replace(/_/g, ' ') || 'Android Device'}</div><div className="device-item-sub" style={{ fontSize: '9px' }}>{dev.serial}</div></div>
                        </div>
                        {active && <Check size={12} color="#00ff9d" />}
                      </div>
                    );
                  }) : <div style={{ padding: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>No ADB devices connected</div>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                  <div className="dropdown-section-title" style={{ padding: 0 }}>WIRELESS ADB</div>
                  <div className="adb-mode-tabs">
                    <button type="button" className={`adb-tab-btn ${tab === 'connect' ? 'active' : ''}`} onClick={() => setTab('connect')}>Connect</button>
                    <button type="button" className={`adb-tab-btn pair-tab ${tab === 'pair' ? 'active' : ''}`} onClick={() => setTab('pair')}>Pair New</button>
                  </div>
                </div>

                {tab === 'connect' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="connect-ip-row">
                      <input type="text" className="connect-ip-input" placeholder="192.168.86.xx:5555" value={ipInput} onChange={(e) => setIpInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onConnectAdbIp(ipInput); }} />
                      <button type="button" className="btn btn-primary" style={{ padding: '2px 8px', height: '24px', fontSize: '10px' }} onClick={() => onConnectAdbIp(ipInput)} disabled={isConnectingIp || !ipInput.trim()}>
                        {isConnectingIp ? <Loader2 size={10} className="spin" /> : 'Connect'}
                      </button>
                    </div>
                    {connectStatusMsg && <div style={{ fontSize: '10px', color: connectStatusMsg.includes('✔') ? '#00ff9d' : '#ff7b72', marginTop: '2px' }}>{connectStatusMsg}</div>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="connect-ip-row"><input type="text" className="connect-ip-input" placeholder="Pair IP:Port" value={pairIp} onChange={(e) => setPairIp(e.target.value)} /></div>
                    <div className="connect-ip-row">
                      <input type="text" className="connect-ip-input" placeholder="6-digit Code" value={pairCode} onChange={(e) => setPairCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && onPairAdb) onPairAdb(pairIp, pairCode); }} />
                      <button type="button" className="btn btn-primary" style={{ padding: '2px 8px', height: '24px', fontSize: '10px', background: '#a371f7', borderColor: '#8957e5' }} onClick={() => onPairAdb?.(pairIp, pairCode)} disabled={isPairing || !pairIp.trim() || !pairCode.trim()}>
                        {isPairing ? <Loader2 size={10} className="spin" /> : 'Pair'}
                      </button>
                    </div>
                    {pairStatusMsg && <div style={{ fontSize: '10px', color: pairStatusMsg.includes('✔') ? '#00ff9d' : '#ff7b72', marginTop: '2px' }}>{pairStatusMsg}</div>}
                  </div>
                )}

                <div className="dropdown-section-title" style={{ marginTop: '6px' }}>PROFILE CALIBRATION</div>
                <div className="profile-pills-row">
                  <button type="button" className={`profile-pill-btn ${deviceModel === 'pixel_8' ? 'active pixel-8' : ''}`} onClick={() => { onSelectDevice('pixel_8'); setShowMenu(false); }}><Smartphone size={10} /><span>PIXEL 8 (31L)</span></button>
                  <button type="button" className={`profile-pill-btn ${deviceModel === 'pixel_10' ? 'active pixel-10' : ''}`} onClick={() => { onSelectDevice('pixel_10'); setShowMenu(false); }}><Smartphone size={10} /><span>PIXEL 10 (47L)</span></button>
                </div>
              </div>
            )}
          </div>

          <div className="live-monitor-tabs">
            <button className={`live-tab-btn ${liveMode === 'desktop' ? 'active' : ''}`} onClick={() => onSwitchLiveMode('desktop')}><Monitor size={11} /><span>DESKTOP</span></button>
            <button className={`live-tab-btn ${liveMode === 'phone' ? 'active' : ''}`} onClick={() => onSwitchLiveMode('phone')}><Smartphone size={11} /><span>PHONE</span></button>
          </div>

          <div className="live-size-pill-group">
            {(['sm', 'md', 'lg'] as const).map(s => (
              <button key={s} type="button" className={`live-size-btn ${monitorSize === s && !isDrawerMaximized ? 'active' : ''}`} onClick={() => onSetPresetSize(s)}>{s.toUpperCase()}</button>
            ))}
          </div>

          {liveMode === 'desktop' && (
            <button type="button" className={`live-ai-boxes-btn ${showBoundingBoxes ? 'active' : ''}`} onClick={onToggleBoundingBoxes} title="Toggle AI Bounding Boxes">
              {showBoundingBoxes ? <Eye size={11} /> : <EyeOff size={11} />}<span>AI BOXES</span>
            </button>
          )}

          <div className="live-refreshed-badge"><span className="dot" /><span>{agoSec <= 1 ? 'LIVE' : `${agoSec}s ago`}</span></div>

          <button type="button" className={`live-info-btn ${showInfo ? 'active' : ''}`} onClick={() => setShowInfo(p => !p)} title="Inspect Live Metadata"><Info size={11} /><span>INFO</span></button>
          {onOpenDeviceConfig && (
            <button type="button" className="live-info-btn" onClick={onOpenDeviceConfig} title="External Desktop Kiosk Lockdown"><Shield size={11} color="#00ff9d" /><span>KIOSK</span></button>
          )}
        </div>

        <div className="live-monitor-window-actions">
          <button type="button" className="btn-live-action" onClick={onRefreshStream} title="Refresh Stream"><RefreshCw size={13} /></button>
          <button type="button" className="btn-live-action" onClick={onToggleMaximize} title={isDrawerMaximized ? 'Restore' : 'Maximize'}>{isDrawerMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
          <button type="button" className="btn-live-action btn-live-close" onClick={onClose} title="Close Live View"><X size={15} /></button>
        </div>
      </div>

      {liveMode === 'desktop' && (
        <div className="alignment-diagnostics-strip">
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.4px', cursor: 'pointer' }} onClick={onOpenAlignmentModal}>AI AREAS:</span>
          {alignmentData.boxes && Object.entries(alignmentData.boxes).map(([key, b]) => {
            const isPassed = b.passed !== false;
            const label = key === 'first_line' ? `Ln ${b.line_number || alignmentData.first_line_number || '?'} (Top)` : key === 'last_line' ? `Ln ${b.line_number || alignmentData.last_line_number || '?'} (Bottom)` : key === 'file_name' ? b.text || 'Filename' : key === 'teams_logo' ? b.text || 'Teams Logo' : key === 'edit_mode' ? 'Edit Mode (✏️)' : key === 'dark_mode' ? 'Dark Mode (🌙)' : b.name;
            return (
              <div key={key} className={`alignment-chip ${isPassed ? 'passed' : 'failed'}`} onClick={onOpenAlignmentModal} style={{ cursor: 'pointer' }}>
                <span style={{ color: b.hex || (isPassed ? '#22c55e' : '#ef4444') }}>●</span><span>{label}</span>
                {!isPassed && <span style={{ fontSize: '9px', fontWeight: 800, color: '#ff7b72', marginLeft: '2px' }}>[FAIL]</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className={`live-screen-viewport ${liveMode === 'phone' ? 'phone-mode' : ''}`}>
        <img key={`stream-${liveMode}-${streamKey}`} className="live-screen-img" src={`${apiBase}/api/device/stream?mode=${liveMode}&t=${streamKey}`} alt={`Live ${liveMode} mode screen`} onError={(e) => { (e.target as HTMLImageElement).src = `${apiBase}/api/device/screen?mode=${liveMode}&t=${Date.now()}`; }} />
        {showBoundingBoxes && liveMode === 'desktop' && renderBoundingBoxesOverlay(alignmentData)}
        <div className="live-screen-overlay-badge"><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ff4d4d', animation: 'pulse-dot 1.5s infinite' }} /><span>LIVE • {liveMode.toUpperCase()}</span></div>
        <div className="live-screen-overlay-info">{isDrawerMaximized ? 'MAXIMIZED' : `${drawerWidth}×${drawerHeight}`} • {deviceInfo?.active_serial || 'ADB'}</div>
      </div>

      {showInfo && (
        <LiveMetaInfoPopover isOpen={showInfo} onClose={() => setShowInfo(false)} apiBase={apiBase} streamKey={streamKey} onRefresh={onRefreshStream} alignmentData={alignmentData} liveMode={liveMode} />
      )}
    </div>
  );
};
