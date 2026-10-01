import React, { useState } from 'react';
import {
  Settings, ShieldCheck, ShieldAlert, ToggleLeft, ToggleRight, Check, X, RefreshCw, FileText
} from 'lucide-react';
import { Modal } from '../../ConfirmModal';
import type { Node5ConfigState, TriggerDecisionState } from '../../types/dag';
import { copyToClipboard } from '../../utils/dagDiagnostics';

export interface Node3CaptureConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: { settle_delay_ms: number; guard_keyboard: boolean; mode: string };
  onChangeConfig: React.Dispatch<React.SetStateAction<{ settle_delay_ms: number; guard_keyboard: boolean; mode: string }>>;
  onSave: () => void;
  isSaving: boolean;
}

export const Node3CaptureConfigModal: React.FC<Node3CaptureConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  onSave,
  isSaving
}) => {
  if (!isOpen) return null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={18} color="#00ff9d" /><span>DAG Node 3: Screen Capture Configuration</span></div>}
      subtitle="Configure external display screen capture timing and keyboard guards"
      confirmText={isSaving ? 'Saving...' : 'Save Configuration'}
      cancelText="Close"
      onConfirm={onSave}
      disabled={isSaving}
      maxWidth="540px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#e6edf3' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e' }}>SETTLE DELAY BEFORE CAPTURE (MS)</label>
          <input
            type="number"
            value={config.settle_delay_ms}
            onChange={(e) => onChangeConfig(p => ({ ...p, settle_delay_ms: parseInt(e.target.value) || 0 }))}
            style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', color: '#f0f6fc', fontSize: '12px', fontFamily: 'inherit' }}
          />
          <span style={{ fontSize: '10px', color: '#8b949e' }}>Dwell time allowed for the editor UI to settle before grabbing display pixels.</span>
        </div>
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Guard Keyboard Closed</div>
            <div style={{ fontSize: '10px', color: '#8b949e' }}>Silently checks and suppresses on-screen soft keyboard before capture.</div>
          </div>
          <button
            type="button"
            onClick={() => onChangeConfig(p => ({ ...p, guard_keyboard: !p.guard_keyboard }))}
            style={{ background: config.guard_keyboard ? '#238636' : '#21262d', color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
          >
            {config.guard_keyboard ? 'ACTIVE' : 'OFF'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export interface Node4OcrConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: { engine: string; ocr_worker_timeout_s: number; min_confidence: number };
  onChangeConfig: React.Dispatch<React.SetStateAction<{ engine: string; ocr_worker_timeout_s: number; min_confidence: number }>>;
  onSave: () => void;
  isSaving: boolean;
}

export const Node4OcrConfigModal: React.FC<Node4OcrConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  onSave,
  isSaving
}) => {
  if (!isOpen) return null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={18} color="#a371f7" /><span>DAG Node 4: OCR Extraction Configuration</span></div>}
      subtitle="Configure OCR worker parameters and confidence thresholds"
      confirmText={isSaving ? 'Saving...' : 'Save Configuration'}
      cancelText="Close"
      onConfirm={onSave}
      disabled={isSaving}
      maxWidth="540px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#e6edf3' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e' }}>OCR ENGINE</label>
          <select
            value={config.engine}
            onChange={(e) => onChangeConfig(p => ({ ...p, engine: e.target.value }))}
            style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', color: '#f0f6fc', fontSize: '12px', fontFamily: 'inherit' }}
          >
            <option value="local:rapidocr">Local RapidOCR (Fast, Gutter Optimized)</option>
            <option value="cloud:gemini">Cloud Gemini Vision</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e' }}>WORKER TIMEOUT (SECONDS)</label>
          <input
            type="number"
            value={config.ocr_worker_timeout_s}
            onChange={(e) => onChangeConfig(p => ({ ...p, ocr_worker_timeout_s: parseInt(e.target.value) || 15 }))}
            style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', color: '#f0f6fc', fontSize: '12px', fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#8b949e' }}>MINIMUM CONFIDENCE THRESHOLD</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={config.min_confidence}
            onChange={(e) => onChangeConfig(p => ({ ...p, min_confidence: parseFloat(e.target.value) || 0.8 }))}
            style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', color: '#f0f6fc', fontSize: '12px', fontFamily: 'inherit' }}
          />
        </div>
      </div>
    </Modal>
  );
};

export interface Node6QualifierConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Node5ConfigState;
  onChangeConfig: React.Dispatch<React.SetStateAction<Node5ConfigState>>;
  triggerDecision: TriggerDecisionState;
  onToggleQualifier: (qId: string) => void;
  onEvaluate: () => void;
  isEvaluating: boolean;
  onSave: () => void;
  isSaving: boolean;
  feedback: string | null;
}

export const Node6QualifierConfigModal: React.FC<Node6QualifierConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  triggerDecision,
  onToggleQualifier,
  onEvaluate,
  isEvaluating,
  onSave,
  isSaving,
  feedback
}) => {
  if (!isOpen) return null;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={18} color="#58a6ff" /><span>DAG Node 6: Trigger Verification & Qualifiers</span></div>}
      subtitle="Configure deterministic general-purpose qualifiers for trigger decision"
      confirmText={isSaving ? 'Saving...' : 'Save Configuration'}
      cancelText="Close"
      onConfirm={onSave}
      disabled={isSaving}
      maxWidth="720px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#e6edf3' }}>
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={16} color="#00ff9d" /><span>Enforce Qualifier-Based Trigger Prevention</span></div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '3px' }}>When active, enabled qualifiers detecting issues halt the DAG trigger at Node 6.</div>
          </div>
          <button
            type="button"
            onClick={() => onChangeConfig(p => ({ ...p, prevent_trigger_on_issue: !p.prevent_trigger_on_issue }))}
            style={{ background: config.prevent_trigger_on_issue ? '#238636' : '#21262d', color: '#fff', border: `1px solid ${config.prevent_trigger_on_issue ? '#2ea043' : '#30363d'}`, borderRadius: '20px', padding: '4px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {config.prevent_trigger_on_issue ? <><ToggleRight size={16} /><span>ENFORCED</span></> : <><ToggleLeft size={16} /><span>BYPASSED</span></>}
          </button>
        </div>

        <div style={{ background: triggerDecision.prevented ? '#2d1416' : '#102319', border: `1px solid ${triggerDecision.prevented ? '#f85149' : '#238636'}`, borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {triggerDecision.prevented ? <ShieldAlert size={18} color="#ff7b72" /> : <ShieldCheck size={18} color="#00ff9d" />}
              <span style={{ fontSize: '12px', fontWeight: 800, color: triggerDecision.prevented ? '#ff7b72' : '#00ff9d' }}>{triggerDecision.prevented ? 'DAG TRIGGER PREVENTED' : 'DAG TRIGGER ALLOWED'}</span>
            </div>
            <button type="button" onClick={onEvaluate} disabled={isEvaluating} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#21262d', color: '#58a6ff', border: '1px solid #30363d', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: isEvaluating ? 'wait' : 'pointer' }}>
              <RefreshCw size={11} className={isEvaluating ? 'spin' : ''} /><span>{isEvaluating ? 'Testing...' : 'Test Qualifiers Now'}</span>
            </button>
          </div>
          {triggerDecision.prevented ? (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#f0f6fc' }}>
              <div style={{ fontWeight: 600, color: '#ff7b72', marginBottom: '4px' }}>Blocking issues:</div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#e6edf3', lineHeight: 1.5 }}>{triggerDecision.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          ) : <div style={{ marginTop: '6px', fontSize: '11px', color: '#8b949e' }}>All enabled quality qualifiers are satisfied. Next page gutter verification will trigger loopback cleanly.</div>}
        </div>

        {feedback && <div style={{ padding: '8px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', fontSize: '11px', color: '#58a6ff', fontWeight: 600 }}>{feedback}</div>}

        <div>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#8b949e', marginBottom: '8px' }}>DETERMINISTIC OCR QUALITY QUALIFIERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(config.qualifiers).map(([qId, qItem]) => {
              const statusInfo = triggerDecision.qualifier_statuses?.[qId];
              const hasIssue = statusInfo?.issue_detected ?? false;
              return (
                <div key={qId} style={{ background: '#161b22', border: `1px solid ${hasIssue && qItem.enabled ? '#f8514988' : '#30363d'}`, borderRadius: '6px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>{qItem.name}</span>
                      <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: qItem.severity === 'blocking' ? '#f8514922' : '#d2992222', color: qItem.severity === 'blocking' ? '#ff7b72' : '#e3b341', fontWeight: 700 }}>{qItem.severity.toUpperCase()}</span>
                      {qItem.enabled ? (hasIssue ? <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#f85149', color: '#fff', fontWeight: 700 }}>ISSUE DETECTED</span> : <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#23863633', color: '#00ff9d', fontWeight: 700 }}>SATISFIED</span>) : <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#21262d', color: '#8b949e', fontWeight: 600 }}>DISABLED</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>{qItem.description}</div>
                    {statusInfo?.details && <div style={{ fontSize: '10px', color: hasIssue ? '#ff7b72' : '#7ee787', marginTop: '3px' }}>Live: {statusInfo.details}</div>}
                  </div>
                  <button type="button" onClick={() => onToggleQualifier(qId)} style={{ background: qItem.enabled ? '#1f6feb22' : '#21262d', color: qItem.enabled ? '#58a6ff' : '#8b949e', border: `1px solid ${qItem.enabled ? '#1f6feb66' : '#30363d'}`, borderRadius: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', minWidth: '90px', justifyContent: 'center' }}>
                    {qItem.enabled ? <><Check size={12} color="#58a6ff" /><span>Enabled</span></> : <><X size={12} color="#8b949e" /><span>Disabled</span></>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export interface Node3bExtractedTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractedText: string;
  linesCount: number;
  charCount: number;
  modelUsed: string;
}

export const Node3bExtractedTextModal: React.FC<Node3bExtractedTextModalProps> = ({
  isOpen,
  onClose,
  extractedText,
  linesCount,
  charCount,
  modelUsed
}) => {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const handleCopy = async () => {
    if (extractedText) {
      const ok = await copyToClipboard(extractedText);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="#58a6ff" />
          <span>DAG Node 3b: Local AI OCR Extracted Text</span>
        </div>
      }
      subtitle={`Extracted ${linesCount || 0} lines verbatim using ${modelUsed || 'MiniCPM-V (Ollama)'}`}
      confirmText={copied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}
      cancelText="Close"
      onConfirm={handleCopy}
      maxWidth="700px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#8b949e' }}>
          <span>{linesCount || 0} lines detected • {charCount || 0} characters</span>
          {copied && <span style={{ color: '#00ff9d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> Copied to clipboard!</span>}
        </div>
        <pre style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '12px',
          maxHeight: '400px',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '11px',
          color: '#e6edf3',
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
          margin: 0,
          userSelect: 'text'
        }}>
          {extractedText || 'No text extracted yet'}
        </pre>
      </div>
    </Modal>
  );
};
