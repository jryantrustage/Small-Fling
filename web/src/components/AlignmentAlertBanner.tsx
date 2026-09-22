import React from 'react';
import { AlertTriangle, Eye, RefreshCw, Monitor, Loader2, Wrench, Zap } from 'lucide-react';
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
}) => {
  if (alignmentData.is_aligned) return null;
  const classifierIssues = alignmentData.classifier_issues || alignmentData.classifiers?.issues || [];

  return (
    <div className="alignment-alert-banner">
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
          </div>

          {/* 6 Interactive Verification Area Badges */}
          <div className="alignment-checks-grid">
            {alignmentData.boxes &&
              Object.entries(alignmentData.boxes).map(([key, b]) => {
                const isPassed = b.passed !== false;
                return (
                  <div
                    key={key}
                    className={`alignment-check-badge ${isPassed ? 'passed' : 'failed'}`}
                    onClick={onOpenModal}
                    title={`Click for full diagnostics:\n${b.name}: ${isPassed ? 'PASSED' : 'FAILED'}\nDetected: ${b.detected_value || b.text || 'None'}\nCriteria: ${b.expected || ''}\n${b.details || ''}`}
                  >
                    <span style={{ color: b.hex || (isPassed ? '#22c55e' : '#ef4444') }}>●</span>
                    <span style={{ fontWeight: 600 }}>
                      {b.name.replace(' / Header', '').replace(' Number', '')}
                    </span>
                    <span className="alignment-check-status-pill">
                      {isPassed ? 'PASS' : 'FAIL'}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        opacity: 0.85,
                        maxWidth: '140px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.detected_value || b.text || (isPassed ? 'OK' : 'Missing')}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Actionable Classifier Remediation Buttons */}
          {classifierIssues && classifierIssues.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#fef08a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Wrench size={12} />
                <span>Fix Issues:</span>
              </span>
              {classifierIssues.map(issue => (
                <button
                  key={issue.classifier_id}
                  type="button"
                  className="btn btn-primary"
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#2563eb',
                    borderColor: '#3b82f6',
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
      </div>
    </div>
  );
};
