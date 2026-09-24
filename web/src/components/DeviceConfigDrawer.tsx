import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Shield, ShieldAlert, ShieldCheck, Lock, Unlock, AlertTriangle, RefreshCw, Check, Loader2, X, Laptop, Smartphone, Eye, Sliders, Key, Cpu, Zap } from 'lucide-react';
import type { ConnectedDisplay, KioskTelemetry } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  activeSerial?: string | null;
  onShowToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const DeviceConfigDrawer: React.FC<Props> = ({ isOpen, onClose, apiBase, activeSerial, onShowToast }) => {
  const [loading, setLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<KioskTelemetry | null>(null);
  const [displays, setDisplays] = useState<ConnectedDisplay[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<number>(13);
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

  const fetchKioskStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/device/kiosk/status${activeSerial ? `?serial=${encodeURIComponent(activeSerial)}` : ''}`);
      if (res.ok) {
        const d: KioskTelemetry = await res.json();
        setTelemetry(d);
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
    } finally { setLoading(false); }
  }, [apiBase, activeSerial]);

  useEffect(() => { if (isOpen) fetchKioskStatus(); }, [isOpen, fetchKioskStatus]);

  const handleExecuteLock = async () => {
    setIsLocking(true);
    setShowConfirmLockModal(false);
    const start = performance.now();
    try {
      const res = await fetch(`${apiBase}/api/device/kiosk/lock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_id: selectedDisplayId, package_id: targetPackage, mode: kioskMode, restrictions: { suppress_hotkeys: suppressHotkeys, disable_status_bar: disableStatusBar, prevent_sleep: preventSleep }, serial: activeSerial || null })
      });
      const elapsed = Math.round(performance.now() - start);
      setLastActionLatencyMs(elapsed);
      if (res.ok) {
        const d = await res.json();
        if (d.kiosk_state) setTelemetry(d.kiosk_state);
        onShowToast?.('success', `Kiosk lock engaged on Display #${selectedDisplayId} in ${elapsed}ms ✔`);
      } else {
        const err = await res.json();
        onShowToast?.('error', `Failed to engage lock: ${err.detail || 'Unknown error'}`);
      }
    } catch (e: any) { onShowToast?.('error', `Error executing kiosk lock: ${e.message}`); }
    finally { setIsLocking(false); fetchKioskStatus(); }
  };

  const handleExecuteRelease = async () => {
    setIsReleasing(true);
    setShowEmergencyModal(false);
    const start = performance.now();
    try {
      const res = await fetch(`${apiBase}/api/device/kiosk/release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_pin: adminPin || 'admin', serial: activeSerial || null })
      });
      const elapsed = Math.round(performance.now() - start);
      setLastActionLatencyMs(elapsed);
      if (res.ok) {
        const d = await res.json();
        if (d.kiosk_state) setTelemetry(d.kiosk_state);
        setAdminPin('');
        onShowToast?.('success', `Kiosk lock safely released in ${elapsed}ms ✔`);
      } else {
        const err = await res.json();
        onShowToast?.('error', `Release error: ${err.detail}`);
      }
    } catch (e: any) { onShowToast?.('error', `Error releasing lock: ${e.message}`); }
    finally { setIsReleasing(false); fetchKioskStatus(); }
  };

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
    } catch (e: any) { setProvisionMessage(`Provisioning failed: ${e.message}`); }
    finally { setIsProvisioning(false); fetchKioskStatus(); }
  };

  if (!isOpen) return null;

  const isLocked = telemetry?.lock_status === 'PINNED' || telemetry?.lock_status === 'LOCKED_TASK_EXTERNAL';
  const badge = telemetry?.lock_status === 'LOCKED_TASK_EXTERNAL' ? { label: 'COSU DEVICE OWNER LOCK', color: '#00ff9d', bg: 'rgba(0, 255, 157, 0.15)' }
    : telemetry?.lock_status === 'PINNED' ? { label: 'PINNED LOCK TASK (ACTIVE)', color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)' }
    : { label: 'STANDARD FREEFORM (UNLOCKED)', color: '#8b949e', bg: 'rgba(139, 148, 158, 0.1)' };

  return (
    <>
      <div className="device-config-drawer-overlay" onClick={onClose} />
      <div className="device-config-drawer">
        <div className="device-config-header">
          <div className="device-config-header-title">
            <div className="device-config-icon-badge"><Shield size={16} color="#00ff9d" /></div>
            <div><h3>EXTERNAL KIOSK MANAGER</h3><p>Desktop Display Isolation & Lockdown Control</p></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" className="device-config-refresh-btn" onClick={fetchKioskStatus} disabled={loading} title="Refresh Kiosk Status">
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
            </button>
            <button type="button" className="device-config-close-btn" onClick={onClose} title="Close Drawer"><X size={16} /></button>
          </div>
        </div>

        <div className="device-config-body">
          <div className="kiosk-status-card" style={{ borderColor: isLocked ? '#00ff9d' : '#30363d' }}>
            <div className="kiosk-status-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="kiosk-lock-indicator" style={{ background: badge.bg, color: badge.color }}>{isLocked ? <Lock size={16} /> : <Unlock size={16} />}</div>
                <div>
                  <div className="kiosk-status-pill" style={{ background: badge.bg, color: badge.color }}><span className="dot" style={{ background: badge.color }} />{badge.label}</div>
                  <div className="kiosk-status-meta">Target Display: <strong>#{selectedDisplayId}</strong> • App: <strong>{telemetry?.locked_package || targetPackage}</strong></div>
                </div>
              </div>
              {lastActionLatencyMs !== null && (
                <div className="kiosk-latency-badge" title="RPC roundtrip latency"><Zap size={11} color="#e3b341" /><span>{lastActionLatencyMs}ms</span></div>
              )}
            </div>
          </div>

          <div className="kiosk-section-card">
            <div className="kiosk-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Monitor size={15} color="#58a6ff" /><h4>CONNECTED DISPLAYS ({displays.length})</h4></div>
              <span className="kiosk-section-tag">MULTI-DISPLAY PIPELINE</span>
            </div>
            <div className="kiosk-displays-list">
              {displays.length > 0 ? displays.map((disp) => {
                const isSelected = selectedDisplayId === disp.displayId;
                return (
                  <div key={disp.displayId} className={`kiosk-display-item ${isSelected ? 'selected' : ''} ${disp.isExternal ? 'external' : 'internal'}`} onClick={() => setSelectedDisplayId(disp.displayId)}>
                    <div className="kiosk-disp-icon">{disp.isExternal ? <Monitor size={18} /> : <Smartphone size={18} />}</div>
                    <div className="kiosk-disp-info">
                      <div className="kiosk-disp-title"><span className="kiosk-disp-name">{disp.name}</span><span className="kiosk-disp-badge">Display #{disp.displayId}</span>{disp.isExternal && <span className="kiosk-disp-tag-ext">EXTERNAL DESKTOP</span>}</div>
                      <div className="kiosk-disp-specs">{disp.width} × {disp.height} @ {disp.refreshRate}Hz • {disp.category}</div>
                    </div>
                    <div className="kiosk-disp-select-radio">{isSelected && <Check size={14} color="#00ff9d" />}</div>
                  </div>
                );
              }) : <div className="kiosk-empty-state"><Loader2 size={16} className="spin" /><span>Scanning connected monitors...</span></div>}
            </div>
          </div>

          <div className="kiosk-section-card">
            <div className="kiosk-section-header"><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sliders size={15} color="#bc8cff" /><h4>KIOSK MODE SELECTOR</h4></div></div>
            <div className="kiosk-mode-grid">
              {[
                ['freeform', Laptop, 'Standard Freeform', 'Standard windowed desktop environment with resizable windows and full taskbar.'],
                ['mirrored', Eye, 'Fullscreen Mirrored', 'Mirrors the phone screen to external monitor in fullscreen mode.'],
                ['kiosk', ShieldCheck, 'Exclusive Kiosk', 'Locks target app onto external display. Intercepts Alt+Tab, Meta, and boundary clicks.'],
              ].map(([m, Icon, title, desc]) => (
                <button key={m as string} type="button" className={`kiosk-mode-tile ${kioskMode === m ? 'active' : ''}`} onClick={() => setKioskMode(m as any)}>
                  <div className="mode-tile-header"><Icon size={15} /><span>{title as string}</span></div>
                  <p>{desc as string}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="kiosk-section-card">
            <div className="kiosk-section-header"><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Cpu size={15} color="#58a6ff" /><h4>TARGET APPLICATION PACKAGE</h4></div></div>
            <div className="kiosk-package-input-group">
              <input type="text" className="kiosk-text-input" placeholder="e.g. com.microsoft.teams" value={targetPackage} onChange={(e) => setTargetPackage(e.target.value)} />
              <div className="kiosk-package-pills">
                {['com.microsoft.teams', 'com.matrixcapture.app'].map(pkg => (
                  <button key={pkg} type="button" className={`kiosk-pkg-pill ${targetPackage === pkg ? 'active' : ''}`} onClick={() => setTargetPackage(pkg)}>
                    {pkg === 'com.microsoft.teams' ? 'Microsoft Teams' : 'MatrixCapture Kiosk'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="kiosk-section-card">
            <div className="kiosk-section-header"><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Key size={15} color="#f0883e" /><h4>PERIPHERAL RESTRICTIONS</h4></div></div>
            <div className="kiosk-restrictions-list">
              {[
                [suppressHotkeys, setSuppressHotkeys, 'Suppress Global OS Hotkeys', 'Swallow Alt+Tab, Meta / Super, Esc, and App Switch keys'],
                [disableStatusBar, setDisableStatusBar, 'Disable Status Bar & Taskbar', 'Hide Android desktop taskbar and system navigation bars'],
                [preventSleep, setPreventSleep, 'Prevent Sleep While Docked', 'Enforce FLAG_KEEP_SCREEN_ON during DisplayPort docking'],
              ].map(([val, setVal, title, desc]: any) => (
                <label key={title} className="kiosk-checkbox-label">
                  <input type="checkbox" checked={val} onChange={(e) => setVal(e.target.checked)} />
                  <div className="kiosk-checkbox-text"><span className="kiosk-cb-title">{title}</span><span className="kiosk-cb-desc">{desc}</span></div>
                </label>
              ))}
            </div>
          </div>

          <div className="kiosk-section-card">
            <div className="kiosk-section-header"><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldAlert size={15} color="#e3b341" /><h4>SECURITY CONTEXT & DPC</h4></div></div>
            <div className="kiosk-security-details">
              <div className="kiosk-sec-row"><span>Active Device Admin:</span><span className={telemetry?.active_admin_active ? 'sec-status-good' : 'sec-status-warn'}>{telemetry?.active_admin_active ? 'ENABLED (KioskAdminReceiver)' : 'NOT CONFIGURED'}</span></div>
              <div className="kiosk-sec-row"><span>Device Owner (COSU):</span><span className={telemetry?.device_owner_active ? 'sec-status-good' : 'sec-status-info'}>{telemetry?.device_owner_active ? 'ENABLED (Zero-Leakage DPC)' : 'Standard Pinned Lock Task Mode'}</span></div>
              {!telemetry?.active_admin_active && (
                <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '8px', fontSize: '11px', height: '30px' }} onClick={handleProvisionAdmin} disabled={isProvisioning}>
                  {isProvisioning ? <Loader2 size={12} className="spin" /> : 'Provision Active Admin via ADB'}
                </button>
              )}
              {provisionMessage && <div className="kiosk-provision-msg">{provisionMessage}</div>}
            </div>
          </div>

          <div className="kiosk-cta-container">
            {!isLocked ? (
              <button type="button" className="btn btn-primary kiosk-primary-btn" onClick={() => setShowConfirmLockModal(true)} disabled={isLocking}>
                {isLocking ? <Loader2 size={14} className="spin" /> : <Lock size={14} />}<span>LOCK TO EXTERNAL DISPLAY #{selectedDisplayId}</span>
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <button type="button" className="btn btn-primary" style={{ flex: 1, height: '40px', background: '#238636', borderColor: '#2ea043' }} onClick={() => setShowConfirmLockModal(true)} disabled={isLocking}>
                  <RefreshCw size={13} /><span>RE-SYNC LOCK</span>
                </button>
                <button type="button" className="btn btn-danger kiosk-emergency-btn" onClick={() => setShowEmergencyModal(true)} disabled={isReleasing}>
                  {isReleasing ? <Loader2 size={14} className="spin" /> : <Unlock size={14} />}<span>RELEASE LOCK</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
                {isLocking ? <Loader2 size={13} className="spin" /> : <Lock size={13} />}<span>Confirm & Lock Display</span>
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
                <input type="password" className="kiosk-text-input" placeholder="Enter PIN (Default: admin)" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleExecuteRelease(); }} />
              </div>
            </div>
            <div className="kiosk-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowEmergencyModal(false)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={handleExecuteRelease} disabled={isReleasing}>
                {isReleasing ? <Loader2 size={13} className="spin" /> : <Unlock size={13} />}<span>Authorize & Release Lock</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
