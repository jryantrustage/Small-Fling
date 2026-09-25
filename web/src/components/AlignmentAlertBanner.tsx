import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, Eye, RefreshCw, Monitor, Loader2, Wrench, Zap, X, Minus, Maximize2, GripHorizontal, ArrowDownToLine, ArrowUpToLine, Undo2, Smartphone } from 'lucide-react';
import type { AlignmentData, DeviceInfoData } from '../types';

interface Props {
  alignmentData: AlignmentData;
  deviceInfo?: DeviceInfoData | null;
  deviceModel?: 'pixel_8' | 'pixel_10';
  isCheckingAlignment: boolean;
  onTriggerCheck: () => void;
  onOpenModal: () => void;
  onOpenLiveScreen: () => void;
  onOpenDeviceDrawer?: () => void;
  onConnectDevice?: (targetIp?: string, model?: 'pixel_8' | 'pixel_10') => void;
  isConnectingDevice?: boolean;
  onFixClassifier?: (classifierId: string) => void;
  onFixAllClassifiers?: () => void;
  fixingClassifierId?: string | null;
  isFixingAll?: boolean;
  isDismissed?: boolean;
  onDismissBanner?: () => void;
  isMinimized?: boolean;
  onToggleMinimizeBanner?: () => void;
  dismissedItems?: string[];
  onDismissItem?: (itemId: string, dismissed: boolean) => void;
}

export const AlignmentAlertBanner: React.FC<Props> = ({
  alignmentData, deviceInfo, deviceModel = 'pixel_10', isCheckingAlignment, onTriggerCheck, onOpenModal, onOpenLiveScreen,
  onOpenDeviceDrawer, onConnectDevice, isConnectingDevice = false,
  onFixClassifier, onFixAllClassifiers, fixingClassifierId, isFixingAll,
  isDismissed = false, onDismissBanner, isMinimized = false, onToggleMinimizeBanner,
  dismissedItems = [], onDismissItem,
}) => {
  const [dock, setDock] = useState<'top' | 'bottom' | 'float'>('top');
  const [pos, setPos] = useState({ x: 20, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - 300, dragRef.current.startX + (e.clientX - dragRef.current.mouseX))),
        y: Math.max(10, Math.min(window.innerHeight - 80, dragRef.current.startY + (e.clientY - dragRef.current.mouseY))),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    if (dock !== 'float') {
      const rect = bannerRef.current?.getBoundingClientRect();
      if (rect) setPos({ x: rect.left, y: rect.top });
      setDock('float');
    }
    setIsDragging(true);
    dragRef.current = { mouseX: e.clientX, mouseY: e.clientY, startX: pos.x, startY: pos.y };
  };

  if (isDismissed) return null;

  // Device connectivity supersedes Teams Markdown alignment readiness
  const isDeviceConnected = deviceInfo !== undefined && deviceInfo !== null
    ? deviceInfo.connected
    : (alignmentData.device_connected !== false && alignmentData.reason !== 'No active Android device connected via ADB');

  // If device is connected and Teams Markdown is aligned, no banner needed
  if (isDeviceConnected && alignmentData.is_aligned) return null;

  const stylePos: React.CSSProperties = dock === 'float'
    ? { position: 'fixed', left: `${pos.x}px`, top: `${pos.y}px`, width: 'calc(100vw - 40px)', maxWidth: '1200px', zIndex: 120, borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.85), 0 0 16px rgba(239, 68, 68, 0.4)' }
    : dock === 'bottom'
    ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 120, borderTop: '2px solid #ef4444', borderBottom: 'none', boxShadow: '0 -8px 24px rgba(0,0,0,0.6)' }
    : {};

  const activeDevName = deviceModel === 'pixel_8' ? 'Pixel 8' : 'Pixel 10';
  const knownIp = (deviceModel === 'pixel_8' ? deviceInfo?.pixel_8_address : deviceInfo?.pixel_10_address) ||
    deviceInfo?.cached_addresses?.last || '';

  // Case 1: Device is NOT connected -> Device connectivity banner takes precedence
  if (!isDeviceConnected) {
    if (isMinimized) {
      return (
        <div ref={bannerRef} className={`alignment-alert-banner minimized ${dock}`} style={stylePos}>
          <div className="alignment-drag-handle" onMouseDown={startDrag} title="Drag to move alert bar"><GripHorizontal size={14} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <AlertTriangle size={15} color="#ff7b72" />
            <span style={{ fontWeight: 800, fontSize: '12px', color: '#fca5a5' }}>
              ⚠️ NO DEVICE CONNECTED ({activeDevName} Offline)
            </span>
            <span style={{ fontSize: '11px', color: '#fecaca', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Device connectivity required before Teams Markdown alignment check
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button type="button" className="btn-banner-icon" onClick={onToggleMinimizeBanner} title="Expand"><Maximize2 size={13} /><span style={{ fontSize: '11px' }}>Expand</span></button>
            <button type="button" className="btn-banner-icon danger" onClick={onDismissBanner} title="Dismiss"><X size={14} /></button>
          </div>
        </div>
      );
    }

    return (
      <div ref={bannerRef} className={`alignment-alert-banner ${dock}`} style={stylePos}>
        <div className="alignment-drag-handle" onMouseDown={startDrag} title="Click and drag overlay"><GripHorizontal size={16} /></div>
        <div className="alignment-alert-content" style={{ flex: 1 }}>
          <div className="alignment-alert-icon"><AlertTriangle size={22} color="#ff7b72" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="alignment-alert-title">⚠️ NO ANDROID DEVICE CONNECTED</span>
              <span style={{ fontSize: '11px', color: '#fca5a5' }}>
                Device connection supersedes alignment check. Connect {activeDevName} via ADB or Wi-Fi to capture screens and verify Teams Markdown alignment.
              </span>
            </div>
            {knownIp && (
              <div style={{ fontSize: '11px', color: '#e2e8f0', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                Target: <strong style={{ color: '#fff' }}>{activeDevName}</strong> &bull; Known Address: <strong style={{ color: '#58a6ff' }}>{knownIp}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="alignment-alert-actions">
          {knownIp && (
            <button className="btn-alignment-recheck" style={{ background: '#238636', borderColor: '#2ea043', color: '#fff' }} onClick={() => onConnectDevice?.(knownIp, deviceModel)} disabled={isConnectingDevice}>
              {isConnectingDevice ? <Loader2 size={12} className="spin" /> : <Zap size={12} />}
              <span>Connect {activeDevName}</span>
            </button>
          )}
          <button className="btn-alignment-stream" onClick={onOpenDeviceDrawer} style={{ background: 'rgba(239, 68, 68, 0.25)', borderColor: '#ef4444' }}>
            <Smartphone size={12} /><span>Select / Pair Device</span>
          </button>
          <button className="btn-alignment-recheck" onClick={onTriggerCheck} disabled={isCheckingAlignment}>
            {isCheckingAlignment ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}<span>Retry ADB Scan</span>
          </button>
          <button type="button" className="btn-banner-icon" onClick={() => setDock(d => d === 'top' ? 'bottom' : 'top')}>{dock === 'top' ? <ArrowDownToLine size={13} /> : <ArrowUpToLine size={13} />}</button>
          <button type="button" className="btn-banner-icon" onClick={onToggleMinimizeBanner}><Minus size={13} /></button>
          <button type="button" className="btn-banner-icon danger" onClick={onDismissBanner}><X size={14} /></button>
        </div>
      </div>
    );
  }

  // Case 2: Device IS connected, but Teams Markdown is NOT aligned
  const rawIssues = alignmentData.classifier_issues || alignmentData.classifiers?.issues || [];
  const classifierIssues = rawIssues.filter(i => !dismissedItems.includes(i.classifier_id) && !dismissedItems.includes(`classifier_${i.classifier_id}`));
  const boxes = alignmentData.boxes || {};
  const activeFails = Object.entries(boxes).filter(([k, b]) => !b.passed && !b.dismissed && !dismissedItems.includes(k));
  const dismissedCount = Object.keys(boxes).filter(k => dismissedItems.includes(k)).length;

  if (isMinimized) {
    return (
      <div ref={bannerRef} className={`alignment-alert-banner minimized ${dock}`} style={stylePos}>
        <div className="alignment-drag-handle" onMouseDown={startDrag} title="Drag to move alert bar"><GripHorizontal size={14} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <AlertTriangle size={15} color="#ff7b72" />
          <span style={{ fontWeight: 800, fontSize: '12px', color: '#fca5a5' }}>
            ⚠️ NOT ALIGNED ({activeFails.length} failed{dismissedCount > 0 ? `, ${dismissedCount} ignored` : ''})
          </span>
          <span style={{ fontSize: '11px', color: '#fecaca', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alignmentData.reason || 'Verification area mismatch'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button type="button" className="btn-banner-icon" onClick={onToggleMinimizeBanner} title="Expand"><Maximize2 size={13} /><span style={{ fontSize: '11px' }}>Expand</span></button>
          <button type="button" className="btn-banner-icon danger" onClick={onDismissBanner} title="Dismiss"><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div ref={bannerRef} className={`alignment-alert-banner ${dock}`} style={stylePos}>
      <div className="alignment-drag-handle" onMouseDown={startDrag} title="Click and drag overlay"><GripHorizontal size={16} /></div>
      <div className="alignment-alert-content" style={{ flex: 1 }}>
        <div className="alignment-alert-icon"><AlertTriangle size={22} color="#ff7b72" /></div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="alignment-alert-title">⚠️ TEAMS MARKDOWN NOT ALIGNED</span>
            <span style={{ fontSize: '11px', color: '#fca5a5' }}>{alignmentData.reason || 'Verification failed on one or more critical areas.'}</span>
            {dismissedCount > 0 && (
              <span style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.12)', padding: '1px 6px', borderRadius: '10px', color: '#e2e8f0' }}>
                {dismissedCount} false positive{dismissedCount > 1 ? 's' : ''} ignored
              </span>
            )}
          </div>

          <div className="alignment-checks-grid">
            {Object.entries(boxes).map(([key, b]) => {
              const isIgnored = b.dismissed || dismissedItems.includes(key);
              const isPassed = b.passed !== false || isIgnored;
              return (
                <div key={key} className={`alignment-check-badge ${isIgnored ? 'dismissed' : isPassed ? 'passed' : 'failed'}`} onClick={onOpenModal}>
                  <span style={{ color: isIgnored ? '#94a3b8' : b.hex || (isPassed ? '#22c55e' : '#ef4444') }}>●</span>
                  <span style={{ fontWeight: 600 }}>{b.name.replace(' / Header', '').replace(' Number', '')}</span>
                  <span className={`alignment-check-status-pill ${isIgnored ? 'dismissed' : ''}`}>{isIgnored ? 'IGNORED' : isPassed ? 'PASS' : 'FAIL'}</span>
                  <span style={{ fontSize: '10px', opacity: 0.85, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.detected_value || b.text || (isPassed ? 'OK' : 'Missing')}
                  </span>
                  {!isIgnored && !isPassed ? (
                    <button type="button" className="badge-dismiss-action-btn" onClick={(e) => { e.stopPropagation(); onDismissItem?.(key, true); }} title={`Ignore "${b.name}"`}>
                      <X size={10} /><span>Dismiss</span>
                    </button>
                  ) : isIgnored ? (
                    <button type="button" className="badge-restore-action-btn" onClick={(e) => { e.stopPropagation(); onDismissItem?.(key, false); }} title={`Restore "${b.name}"`}>
                      <Undo2 size={10} /><span>Restore</span>
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {classifierIssues.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#fef08a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Wrench size={12} /><span>Fix Issues:</span>
              </span>
              {classifierIssues.map((issue) => (
                <div key={issue.classifier_id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <button type="button" className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '11px', height: '24px', display: 'flex', alignItems: 'center', gap: '5px', background: '#2563eb', borderColor: '#3b82f6', borderTopRightRadius: 0, borderBottomRightRadius: 0 }} onClick={() => onFixClassifier?.(issue.classifier_id)} disabled={fixingClassifierId === issue.classifier_id}>
                    {fixingClassifierId === issue.classifier_id ? <Loader2 size={11} className="spin" /> : <Zap size={11} />}
                    <span>Fix: {issue.fix_name}</span>
                  </button>
                  <button type="button" className="btn btn-primary" style={{ padding: '3px 6px', fontSize: '10px', height: '24px', background: 'rgba(37, 99, 235, 0.7)', borderColor: '#3b82f6', borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }} onClick={() => onDismissItem?.(issue.classifier_id, true)} title={`Dismiss ${issue.issue_name}`}>
                    <X size={11} />
                  </button>
                </div>
              ))}
              {classifierIssues.length > 1 && (
                <button type="button" className="btn btn-outline" style={{ padding: '3px 10px', fontSize: '11px', height: '24px', display: 'flex', alignItems: 'center', gap: '5px', borderColor: '#eab308', color: '#fef08a' }} onClick={onFixAllClassifiers} disabled={isFixingAll}>
                  {isFixingAll ? <Loader2 size={11} className="spin" /> : <Wrench size={11} />}
                  <span>Auto-Fix All ({classifierIssues.length})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="alignment-alert-actions">
        <button className="btn-alignment-stream" onClick={onOpenModal} style={{ background: 'rgba(239, 68, 68, 0.25)', borderColor: '#ef4444' }}><Eye size={12} /><span>Inspect Details</span></button>
        <button className="btn-alignment-recheck" onClick={onTriggerCheck} disabled={isCheckingAlignment}>{isCheckingAlignment ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}<span>Retry AI Check</span></button>
        <button className="btn-alignment-stream" onClick={onOpenLiveScreen}><Monitor size={12} /><span>Live Screen</span></button>
        <button type="button" className="btn-banner-icon" onClick={() => setDock(d => d === 'top' ? 'bottom' : 'top')}>{dock === 'top' ? <ArrowDownToLine size={13} /> : <ArrowUpToLine size={13} />}</button>
        <button type="button" className="btn-banner-icon" onClick={onToggleMinimizeBanner}><Minus size={13} /></button>
        <button type="button" className="btn-banner-icon danger" onClick={onDismissBanner}><X size={14} /></button>
      </div>
    </div>
  );
};
