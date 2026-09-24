import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle, Eye, RefreshCw, Monitor, Loader2, Wrench, Zap,
  X, Minus, Maximize2, GripHorizontal, ArrowDownToLine, ArrowUpToLine,
  Undo2
} from 'lucide-react';
import type { AlignmentData } from '../types';

interface AlignmentAlertBannerProps {
  alignmentData: AlignmentData;
  isCheckingAlignment: boolean;
  onTriggerCheck: () => void;
  onOpenModal: () => void;
  onOpenLiveScreen: () => void;
  onFixClassifier?: (classifierId: string) => void;
  onFixAllClassifiers?: () => void;
  fixingClassifierId?: string | null;
  isFixingAll?: boolean;
  // Banner dismiss and minimize
  isDismissed?: boolean;
  onDismissBanner?: () => void;
  isMinimized?: boolean;
  onToggleMinimizeBanner?: () => void;
  // Individual check dismissal (false positives)
  dismissedItems?: string[];
  onDismissItem?: (itemId: string, dismissed: boolean) => void;
}

export const AlignmentAlertBanner: React.FC<AlignmentAlertBannerProps> = ({
  alignmentData,
  isCheckingAlignment,
  onTriggerCheck,
  onOpenModal,
  onOpenLiveScreen,
  onFixClassifier,
  onFixAllClassifiers,
  fixingClassifierId,
  isFixingAll,
  isDismissed = false,
  onDismissBanner,
  isMinimized = false,
  onToggleMinimizeBanner,
  dismissedItems = [],
  onDismissItem,
}) => {
  // Dock mode: 'top' | 'bottom' | 'float'
  const [dockPosition, setDockPosition] = useState<'top' | 'bottom' | 'float'>('top');
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 20, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  const bannerRef = useRef<HTMLDivElement>(null);

  // Dragging logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(10, Math.min(window.innerWidth - 300, dragStartRef.current.startX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    if (dockPosition !== 'float') {
      const rect = bannerRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition({ x: rect.left, y: rect.top });
      }
      setDockPosition('float');
    }
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: position.x,
      startY: position.y,
    };
  };

  if (alignmentData.is_aligned || isDismissed) return null;

  const rawClassifierIssues = alignmentData.classifier_issues || alignmentData.classifiers?.issues || [];
  // Filter out classifier issues that were dismissed
  const classifierIssues = rawClassifierIssues.filter(
    (issue) => !dismissedItems.includes(issue.classifier_id) && !dismissedItems.includes(`classifier_${issue.classifier_id}`)
  );

  // Count active failures (excluding dismissed ones)
  const boxes = alignmentData.boxes || {};
  const activeFails = Object.entries(boxes).filter(([key, b]) => {
    const isPassed = b.passed !== false || b.dismissed || dismissedItems.includes(key);
    return !isPassed;
  });
  const dismissedCount = Object.keys(boxes).filter((key) => dismissedItems.includes(key)).length;

  const stylePosition: React.CSSProperties =
    dockPosition === 'float'
      ? {
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: 'calc(100vw - 40px)',
          maxWidth: '1200px',
          zIndex: 120,
          borderRadius: '10px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.85), 0 0 16px rgba(239, 68, 68, 0.4)',
        }
      : dockPosition === 'bottom'
      ? {
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 120,
          borderTop: '2px solid #ef4444',
          borderBottom: 'none',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.6)',
        }
      : {};

  // Minimized rendering
  if (isMinimized) {
    return (
      <div
        ref={bannerRef}
        className={`alignment-alert-banner minimized ${dockPosition}`}
        style={stylePosition}
      >
        <div
          className="alignment-drag-handle"
          onMouseDown={startDrag}
          title="Drag to move minimized alert bar"
        >
          <GripHorizontal size={14} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <AlertTriangle size={15} color="#ff7b72" />
          <span style={{ fontWeight: 800, fontSize: '12px', color: '#fca5a5' }}>
            ⚠️ NOT ALIGNED ({activeFails.length} failed
            {dismissedCount > 0 ? `, ${dismissedCount} ignored` : ''})
          </span>
          <span style={{ fontSize: '11px', color: '#fecaca', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alignmentData.reason || 'Verification area mismatch'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="btn-banner-icon"
            onClick={onToggleMinimizeBanner}
            title="Expand Alignment Alert Banner"
          >
            <Maximize2 size={13} />
            <span style={{ fontSize: '11px' }}>Expand</span>
          </button>
          <button
            type="button"
            className="btn-banner-icon danger"
            onClick={onDismissBanner}
            title="Dismiss Alert Overlay"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={bannerRef}
      className={`alignment-alert-banner ${dockPosition}`}
      style={stylePosition}
    >
      {/* Draggable Grip Handle */}
      <div
        className="alignment-drag-handle"
        onMouseDown={startDrag}
        title="Click and drag to move overlay anywhere on screen"
      >
        <GripHorizontal size={16} />
      </div>

      <div className="alignment-alert-content" style={{ flex: 1 }}>
        <div className="alignment-alert-icon">
          <AlertTriangle size={22} color="#ff7b72" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="alignment-alert-title">
              ⚠️ TEAMS MARKDOWN NOT ALIGNED
            </span>
            <span style={{ fontSize: '11px', color: '#fca5a5' }}>
              {alignmentData.reason || 'Verification failed on one or more critical areas.'}
            </span>
            {dismissedCount > 0 && (
              <span
                style={{
                  fontSize: '10px',
                  background: 'rgba(255, 255, 255, 0.12)',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  color: '#e2e8f0',
                }}
              >
                {dismissedCount} false positive{dismissedCount > 1 ? 's' : ''} ignored
              </span>
            )}
          </div>

          {/* 6 Interactive Verification Area Badges with Individual Dismissal */}
          <div className="alignment-checks-grid">
            {alignmentData.boxes &&
              Object.entries(alignmentData.boxes).map(([key, b]) => {
                const isItemDismissed = b.dismissed || dismissedItems.includes(key);
                const isPassed = b.passed !== false || isItemDismissed;

                return (
                  <div
                    key={key}
                    className={`alignment-check-badge ${
                      isItemDismissed ? 'dismissed' : isPassed ? 'passed' : 'failed'
                    }`}
                    onClick={onOpenModal}
                    title={`Click for full diagnostics:\n${b.name}: ${
                      isItemDismissed ? 'IGNORED (FALSE POSITIVE)' : isPassed ? 'PASSED' : 'FAILED'
                    }\nDetected: ${b.detected_value || b.text || 'None'}\nCriteria: ${b.expected || ''}\n${
                      b.details || ''
                    }`}
                  >
                    <span style={{ color: isItemDismissed ? '#94a3b8' : b.hex || (isPassed ? '#22c55e' : '#ef4444') }}>●</span>
                    <span style={{ fontWeight: 600 }}>
                      {b.name.replace(' / Header', '').replace(' Number', '')}
                    </span>
                    <span className={`alignment-check-status-pill ${isItemDismissed ? 'dismissed' : ''}`}>
                      {isItemDismissed ? 'IGNORED' : isPassed ? 'PASS' : 'FAIL'}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        opacity: 0.85,
                        maxWidth: '120px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.detected_value || b.text || (isPassed ? 'OK' : 'Missing')}
                    </span>

                    {/* Individual Dismiss / Restore Button */}
                    {!isItemDismissed && !isPassed ? (
                      <button
                        type="button"
                        className="badge-dismiss-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismissItem?.(key, true);
                        }}
                        title={`Ignore "${b.name}" as false positive`}
                      >
                        <X size={10} />
                        <span>Dismiss</span>
                      </button>
                    ) : isItemDismissed ? (
                      <button
                        type="button"
                        className="badge-restore-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismissItem?.(key, false);
                        }}
                        title={`Restore verification for "${b.name}"`}
                      >
                        <Undo2 size={10} />
                        <span>Restore</span>
                      </button>
                    ) : null}
                  </div>
                );
              })}
          </div>

          {/* Actionable Classifier Remediation Buttons with Individual Dismissal */}
          {classifierIssues && classifierIssues.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#fef08a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Wrench size={12} />
                <span>Fix Issues:</span>
              </span>
              {classifierIssues.map((issue) => (
                <div key={issue.classifier_id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: '#2563eb',
                      borderColor: '#3b82f6',
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0,
                    }}
                    onClick={() => onFixClassifier?.(issue.classifier_id)}
                    disabled={fixingClassifierId === issue.classifier_id}
                    title={`Remediate: ${issue.issue_name}`}
                  >
                    {fixingClassifierId === issue.classifier_id ? (
                      <Loader2 size={11} className="spin" />
                    ) : (
                      <Zap size={11} />
                    )}
                    <span>Fix: {issue.fix_name}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      padding: '3px 6px',
                      fontSize: '10px',
                      height: '24px',
                      background: 'rgba(37, 99, 235, 0.7)',
                      borderColor: '#3b82f6',
                      borderLeft: 'none',
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                    }}
                    onClick={() => onDismissItem?.(issue.classifier_id, true)}
                    title={`Dismiss ${issue.issue_name} as false positive`}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              {classifierIssues.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    borderColor: '#eab308',
                    color: '#fef08a',
                  }}
                  onClick={onFixAllClassifiers}
                  disabled={isFixingAll}
                  title="Run all automated fixes in sequence"
                >
                  {isFixingAll ? <Loader2 size={11} className="spin" /> : <Wrench size={11} />}
                  <span>Auto-Fix All ({classifierIssues.length})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Banner Actions & Controls */}
      <div className="alignment-alert-actions">
        <button
          className="btn-alignment-stream"
          onClick={onOpenModal}
          title="Open full AI Verification Diagnostics & Breakdown"
          style={{ background: 'rgba(239, 68, 68, 0.25)', borderColor: '#ef4444' }}
        >
          <Eye size={12} />
          <span>Inspect Failure Details</span>
        </button>

        <button
          className="btn-alignment-recheck"
          onClick={onTriggerCheck}
          disabled={isCheckingAlignment}
          title="Re-run AI Bounding Box & Alignment Check"
        >
          {isCheckingAlignment ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
          <span>Retry AI Verification</span>
        </button>

        <button
          className="btn-alignment-stream"
          onClick={onOpenLiveScreen}
          title="Open Realtime Screen Stream Drawer to verify view"
        >
          <Monitor size={12} />
          <span>Open Live Screen</span>
        </button>

        {/* Dock position toggle button */}
        <button
          type="button"
          className="btn-banner-icon"
          onClick={() => setDockPosition((prev) => (prev === 'top' ? 'bottom' : 'top'))}
          title={dockPosition === 'top' ? 'Dock banner to bottom of screen' : 'Dock banner to top'}
        >
          {dockPosition === 'top' ? <ArrowDownToLine size={13} /> : <ArrowUpToLine size={13} />}
        </button>

        {/* Minimize banner button */}
        <button
          type="button"
          className="btn-banner-icon"
          onClick={onToggleMinimizeBanner}
          title="Minimize overlay banner to compact strip"
        >
          <Minus size={13} />
        </button>

        {/* Dismiss banner button */}
        <button
          type="button"
          className="btn-banner-icon danger"
          onClick={onDismissBanner}
          title="Dismiss Alert Overlay (Can be restored from telemetry toaster event or NOT ALIGNED header pill)"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
