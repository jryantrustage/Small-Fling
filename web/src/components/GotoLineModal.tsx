import React, { useState, useRef, useEffect } from 'react';
import {
  Smartphone, ChevronDown, Check, Loader2, Monitor, Keyboard,
  ArrowRight, Expand, Shrink, Eye, EyeOff
} from 'lucide-react';
import { Modal } from '../ConfirmModal';
import type { DeviceInfoData, AlignmentData } from '../types';
import { renderBoundingBoxesOverlay } from './BoundingBoxesOverlay';

interface GotoLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceInfo: DeviceInfoData | null;
  deviceModel: 'pixel_8' | 'pixel_10';
  alignmentData: AlignmentData;
  showBoundingBoxes: boolean;
  onToggleBoundingBoxes: () => void;
  onSelectSerial: (serial: string) => void;
  onSelectDevice: (model: 'pixel_8' | 'pixel_10') => void;
  onConnectAdbIp: (ip: string) => Promise<void>;
  isConnectingIp: boolean;
  connectStatusMsg: string;
  onCloseKeyboard: () => void;
  isClosingKeyboard: boolean;
  gotoTargetLine: number | string;
  setGotoTargetLine: (val: number | string) => void;
  onGotoLine: () => void;
  isNavigating: boolean;
  navStatus: string;
  onSendControlHome: () => void;
  onSendControlEnd: () => void;
  apiBase: string;
  streamKey: number;
}

export const GotoLineModal: React.FC<GotoLineModalProps> = ({
  isOpen,
  onClose,
  deviceInfo,
  deviceModel,
  alignmentData,
  showBoundingBoxes,
  onToggleBoundingBoxes,
  onSelectSerial,
  onSelectDevice,
  onConnectAdbIp,
  isConnectingIp,
  connectStatusMsg,
  onCloseKeyboard,
  isClosingKeyboard,
  gotoTargetLine,
  setGotoTargetLine,
  onGotoLine,
  isNavigating,
  navStatus,
  onSendControlHome,
  onSendControlEnd,
  apiBase,
  streamKey,
}) => {
  const [showModalDeviceMenu, setShowModalDeviceMenu] = useState(false);
  const [gotoStreamExpanded, setGotoStreamExpanded] = useState(false);
  const [gotoLiveMode, setGotoLiveMode] = useState<'desktop' | 'phone'>('desktop');
  const [connectIpInput, setConnectIpInput] = useState('');
  const modalDeviceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        modalDeviceDropdownRef.current &&
        !modalDeviceDropdownRef.current.contains(e.target as Node)
      ) {
        setShowModalDeviceMenu(false);
      }
    };
    if (showModalDeviceMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showModalDeviceMenu]);

  if (!isOpen) return null;

  return (
    <Modal
      title="Go To Line (Ctrl+G)"
      onClose={onClose}
      width={gotoStreamExpanded ? '880px' : '620px'}
    >
      {/* Target Device Status & In-Modal Device Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          marginBottom: '12px',
        }}
      >
        <div className="drawer-device-selector-wrapper" ref={modalDeviceDropdownRef}>
          <button
            type="button"
            className="drawer-device-btn"
            onClick={() => setShowModalDeviceMenu((prev) => !prev)}
            title="Click to switch target device or connect by IP"
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            <div
              className={`device-status-dot ${
                deviceInfo?.connected ? 'online' : 'offline'
              }`}
            />
            <Smartphone size={13} color="var(--color-primary)" />
            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {deviceInfo?.active_model
                ? deviceInfo.active_model.toUpperCase()
                : deviceModel === 'pixel_8'
                ? 'PIXEL 8'
                : 'PIXEL 10'}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              ({deviceInfo?.profile?.lines_per_page || (deviceModel === 'pixel_8' ? 31 : 47)}L)
            </span>
            <ChevronDown
              size={12}
              style={{
                transform: showModalDeviceMenu ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          </button>

          {showModalDeviceMenu && (
            <div
              className="drawer-device-dropdown"
              style={{ minWidth: '280px', top: 'calc(100% + 4px)' }}
            >
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
                          setShowModalDeviceMenu(false);
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

              <div className="dropdown-section-title" style={{ marginTop: '6px' }}>
                CONNECT ADB BY IP
              </div>
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
                    setShowModalDeviceMenu(false);
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
                    setShowModalDeviceMenu(false);
                  }}
                >
                  <Smartphone size={10} />
                  <span>PIXEL 10 (47L)</span>
                </button>
              </div>

              <div className="dropdown-section-title" style={{ marginTop: '6px' }}>
                INPUT METHOD & IME
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(0, 255, 157, 0.05)',
                  border: '1px solid rgba(0, 255, 157, 0.25)',
                  color: '#00ff9d',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Keyboard size={12} />
                  <span style={{ fontSize: '10px' }}>HID Active (IME Suppressed)</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  style={{ padding: '2px 6px', height: '20px', fontSize: '9px' }}
                  onClick={onCloseKeyboard}
                  disabled={isClosingKeyboard}
                  title="Force dismiss on-screen virtual keyboard"
                >
                  {isClosingKeyboard ? (
                    <Loader2 size={10} className="spin" />
                  ) : (
                    'Close IME'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mode selection + Stream Size Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              display: 'flex',
              gap: '3px',
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '3px',
              borderRadius: '8px',
            }}
          >
            <button
              type="button"
              className={`live-tab-btn ${gotoLiveMode === 'desktop' ? 'active' : ''}`}
              onClick={() => setGotoLiveMode('desktop')}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              title="View External Display / Desktop Mode (Display 4)"
            >
              <Monitor size={11} />
              <span>DESKTOP</span>
            </button>
            <button
              type="button"
              className={`live-tab-btn ${gotoLiveMode === 'phone' ? 'active' : ''}`}
              onClick={() => setGotoLiveMode('phone')}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              title="View Phone Built-in Screen (Display 0)"
            >
              <Smartphone size={11} />
              <span>PHONE</span>
            </button>
          </div>

          {gotoLiveMode === 'desktop' && (
            <button
              type="button"
              className={`live-ai-boxes-btn ${showBoundingBoxes ? 'active' : ''}`}
              onClick={onToggleBoundingBoxes}
              title="Toggle AI Alignment Bounding Boxes"
              style={{ height: '24px', padding: '0 8px' }}
            >
              {showBoundingBoxes ? <Eye size={11} /> : <EyeOff size={11} />}
              <span>AI BOXES</span>
            </button>
          )}

          <button
            type="button"
            className={`live-tab-btn ${gotoStreamExpanded ? 'active' : ''}`}
            onClick={() => setGotoStreamExpanded((prev) => !prev)}
            style={{ fontSize: '11px', padding: '4px 9px' }}
            title={
              gotoStreamExpanded
                ? 'Compact Stream Viewport'
                : 'Expand Stream Viewport'
            }
          >
            {gotoStreamExpanded ? <Shrink size={12} /> : <Expand size={12} />}
            <span>{gotoStreamExpanded ? 'COMPACT' : 'EXPAND'}</span>
          </button>
        </div>
      </div>

      {/* Embedded Realtime Screen Stream */}
      <div
        className={`live-screen-viewport ${
          gotoLiveMode === 'phone' ? 'phone-mode' : ''
        }`}
        style={{
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '14px',
          minHeight: gotoStreamExpanded
            ? gotoLiveMode === 'phone'
              ? '540px'
              : '420px'
            : '230px',
          maxHeight: gotoStreamExpanded
            ? gotoLiveMode === 'phone'
              ? '660px'
              : '520px'
            : '320px',
          transition: 'all 0.2s ease',
        }}
      >
        <img
          key={`goto-stream-${gotoLiveMode}-${streamKey}`}
          className="live-screen-img"
          src={`${apiBase}/api/device/stream?mode=${gotoLiveMode}&t=${streamKey}`}
          alt={`Live ${gotoLiveMode} screen`}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `${apiBase}/api/device/screen?mode=${gotoLiveMode}&t=${Date.now()}`;
          }}
        />
        {showBoundingBoxes &&
          gotoLiveMode === 'desktop' &&
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
          <span>REALTIME • {gotoLiveMode.toUpperCase()} VIEW</span>
        </div>
        <div className="live-screen-overlay-info">
          {deviceInfo?.active_model || 'DEVICE'} ({deviceInfo?.active_serial || 'CONNECTED'})
        </div>
      </div>

      <div className="modal-form-group">
        <label
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            display: 'block',
            marginBottom: '6px',
          }}
        >
          TARGET LINE NUMBER (FIRST LINE OF LEFT SIDE GUTTER) *
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            min="1"
            placeholder="e.g. 8761"
            className="modal-input"
            style={{
              flex: 1,
              height: '38px',
              fontSize: '14px',
              fontFamily: 'var(--font-mono)',
            }}
            value={gotoTargetLine}
            onChange={(e) => setGotoTargetLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onGotoLine();
              }
            }}
            autoFocus
          />
          <button
            className="btn btn-primary"
            onClick={onGotoLine}
            disabled={isNavigating || !gotoTargetLine}
            style={{
              height: '38px',
              padding: '0 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isNavigating ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
            <span>Go</span>
          </button>
        </div>
        <p
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '6px',
            lineHeight: 1.4,
          }}
        >
          Clicking <strong>Go</strong> will send arrow down keypresses to{' '}
          <strong>{deviceInfo?.active_model || 'the device'}</strong> until the top gutter
          matches this line.
        </p>
      </div>

      <div
        style={{
          marginTop: '16px',
          paddingTop: '14px',
          borderTop: '1px solid var(--border-color)',
        }}
      >
        <label
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            display: 'block',
            marginBottom: '8px',
          }}
        >
          HARDWARE KEYBOARD SHORTCUTS (
          {deviceInfo?.active_model ? deviceInfo.active_model.toUpperCase() : 'DEVICE'})
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{
              flex: 1,
              height: '36px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
            }}
            onClick={onSendControlHome}
            disabled={isNavigating}
          >
            control+home
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{
              flex: 1,
              height: '36px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
            }}
            onClick={onSendControlEnd}
            disabled={isNavigating}
          >
            control+end
          </button>
        </div>
      </div>

      {navStatus && (
        <div
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontSize: '12px',
            color:
              navStatus.includes('Error') || navStatus.includes('error')
                ? '#ff7b72'
                : 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {isNavigating && <Loader2 size={13} className="spin" />}
          <span>{navStatus}</span>
        </div>
      )}
    </Modal>
  );
};
