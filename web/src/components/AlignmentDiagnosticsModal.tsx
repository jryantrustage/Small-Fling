import React from 'react';
import { AlertTriangle, Monitor, RefreshCw, Loader2, Wrench, Zap } from 'lucide-react';
import { Modal } from '../ConfirmModal';
import type { AlignmentData } from '../types';

interface AlignmentDiagnosticsModalProps {
  isOpen: boolean;
  alignmentData: AlignmentData;
  isCheckingAlignment: boolean;
  onClose: () => void;
  onTriggerCheck: () => void;
  onInspectLiveScreen: () => void;
  onFixClassifier?: (classifierId: string) => void;
  onFixAllClassifiers?: () => void;
  fixingClassifierId?: string | null;
  isFixingAll?: boolean;
}

export const AlignmentDiagnosticsModal: React.FC<AlignmentDiagnosticsModalProps> = ({
  isOpen,
  alignmentData,
  isCheckingAlignment,
  onClose,
  onTriggerCheck,
  onInspectLiveScreen,
  onFixClassifier,
  onFixAllClassifiers,
  fixingClassifierId,
  isFixingAll,
}) => {
  if (!isOpen) return null;
  const classifierIssues = alignmentData.classifier_issues || alignmentData.classifiers?.issues || [];

  return (
    <Modal
      title="AI Alignment & Verification Diagnostics"
      onClose={onClose}
      width="740px"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: alignmentData.is_aligned
            ? 'rgba(34, 197, 94, 0.12)'
            : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${
            alignmentData.is_aligned
              ? 'rgba(34, 197, 94, 0.3)'
              : 'rgba(239, 68, 68, 0.4)'
          }`,
          borderRadius: '8px',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ color: alignmentData.is_aligned ? '#22c55e' : '#ef4444' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: '13px',
                color: alignmentData.is_aligned ? '#4ade80' : '#fca5a5',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {alignmentData.is_aligned
                ? '✔ All 6 Verification Areas Passed'
                : '⚠️ Teams Markdown Not Aligned'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {alignmentData.reason ||
                'All critical bounding boxes and state indicators successfully detected.'}
            </div>
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: '6px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={onTriggerCheck}
          disabled={isCheckingAlignment}
        >
          {isCheckingAlignment ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
          <span>Re-Verify Now</span>
        </button>
      </div>

      {/* General Purpose Classifiers & Remediation Actions */}
      {classifierIssues && classifierIssues.length > 0 && (
        <div style={{ marginBottom: '16px', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '12px', color: '#fef08a' }}>
              <Wrench size={14} />
              <span>DETECTED SETUP ISSUES & AUTOMATED FIXES ({classifierIssues.length})</span>
            </div>
            {classifierIssues.length > 1 && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '4px 10px', fontSize: '11px', height: '26px', borderColor: '#eab308', color: '#fef08a' }}
                onClick={onFixAllClassifiers}
                disabled={isFixingAll}
              >
                {isFixingAll ? <Loader2 size={11} className="spin" /> : <Zap size={11} />}
                <span>Auto-Fix All</span>
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {classifierIssues.map(issue => (
              <div
                key={issue.classifier_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '12px', color: '#fca5a5' }}>
                    ⚠️ {issue.issue_name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                    {issue.details || `Remediation action: ${issue.fix_name}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#2563eb',
                    borderColor: '#3b82f6',
                  }}
                  onClick={() => onFixClassifier?.(issue.classifier_id)}
                  disabled={fixingClassifierId === issue.classifier_id}
                >
                  {fixingClassifierId === issue.classifier_id ? (
                    <Loader2 size={11} className="spin" />
                  ) : (
                    <Zap size={11} />
                  )}
                  <span>Fix: {issue.fix_name}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Verification Areas Breakdown (6 Areas):
      </div>

      <div className="alignment-modal-grid">
        {alignmentData.boxes &&
          Object.entries(alignmentData.boxes).map(([key, b]) => {
            const isPassed = b.passed !== false;
            return (
              <div key={key} className={`alignment-modal-card ${isPassed ? 'passed' : 'failed'}`}>
                <div className="alignment-card-header">
                  <div className="alignment-card-title">
                    <span style={{ color: b.hex || (isPassed ? '#22c55e' : '#ef4444') }}>●</span>
                    <span>{b.name}</span>
                  </div>
                  <span
                    className="alignment-check-status-pill"
                    style={{
                      background: isPassed ? 'rgba(34, 197, 94, 0.25)' : '#ef4444',
                      color: isPassed ? '#4ade80' : '#ffffff',
                    }}
                  >
                    {isPassed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>

                <div className="alignment-card-field">
                  <span className="alignment-card-field-label">Detected:</span>
                  <span className={`alignment-card-field-val ${isPassed ? 'success' : 'error'}`}>
                    {b.detected_value || b.text || 'None detected'}
                  </span>
                </div>

                <div className="alignment-card-field">
                  <span className="alignment-card-field-label">Criteria:</span>
                  <span className="alignment-card-field-val">
                    {b.expected || 'Detection required'}
                  </span>
                </div>

                {b.details && (
                  <div className="alignment-card-field">
                    <span className="alignment-card-field-label">Diagnostics:</span>
                    <span
                      className="alignment-card-field-val"
                      style={{ color: isPassed ? 'var(--text-muted)' : '#ffb3ba' }}
                    >
                      {b.details}
                    </span>
                  </div>
                )}

                {b.box_px && (
                  <div className="alignment-card-field">
                    <span className="alignment-card-field-label">Bounding Box:</span>
                    <span className="alignment-card-field-val" style={{ color: 'var(--text-muted)' }}>
                      [{b.box_px.join(', ')}]
                    </span>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onInspectLiveScreen}
        >
          <Monitor size={13} />
          <span>Inspect Live Screen</span>
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  );
};
