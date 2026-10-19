import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, RefreshCw, Sliders,
  ArrowUp, ArrowDown, Play, Wrench, AlertTriangle, CheckCircle2,
  Zap, Sparkles
} from 'lucide-react';
import { Modal } from '../../ConfirmModal';

export interface ObservationActionItem {
  action_id: string;
  label: string;
  description: string;
  hook_phase: string;
  is_compounding: boolean;
  priority: number;
}

export interface UniversalNodeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  nodeTitle?: string;
  apiBase: string;
  activeSerial?: string | null;
  nodeConfig: Record<string, any>;
  initialAttachedActions?: string[];
  onSave: (config: Record<string, any>, attachedActions: string[]) => Promise<void>;
}

const DEFAULT_OBSERVATION_PLUGINS: ObservationActionItem[] = [
  {
    action_id: 'view_mode_detected_switch_to_edit',
    label: 'view mode detected, switching to edit mode',
    description: 'Detects if Markdown viewer is in read-only view mode and taps Edit Mode button.',
    hook_phase: 'pre',
    is_compounding: false,
    priority: 1
  },
  {
    action_id: 'light_mode_detected_switch_to_dark',
    label: 'light mode detected, switching to dark mode',
    description: 'Detects if editor is rendered in light theme and switches to dark mode for optimal OCR contrast.',
    hook_phase: 'pre',
    is_compounding: false,
    priority: 2
  },
  {
    action_id: 'keyboard_detected_close_keyboard',
    label: 'keyboard detected, closing keyboard',
    description: 'Detects if soft virtual keyboard is visible or obscuring viewport and dismisses it.',
    hook_phase: 'pre',
    is_compounding: false,
    priority: 3
  },
  {
    action_id: 'line_number_top_not_detected_detect_top',
    label: 'line number at top not detected, detecting line number at top',
    description: 'Inspects top line gutter region and applies fallback OCR or nudge heuristics to detect the top line.',
    hook_phase: 'post',
    is_compounding: false,
    priority: 4
  },
  {
    action_id: 'line_number_bottom_not_detected_detect_bottom',
    label: 'line number at bottom not detected',
    description: 'Validates visibility of bottom line in current viewport and performs sub-line scroll adjustments.',
    hook_phase: 'post',
    is_compounding: false,
    priority: 5
  },
  {
    action_id: 'markdown_not_open_navigate_onedrive',
    label: 'markdown editor not open, selecting one drive and navigating to folder to open the target file',
    description: 'Compounding 5-step recovery: launches Teams on external display, navigates OneDrive folders, and opens target Markdown file.',
    hook_phase: 'pre',
    is_compounding: true,
    priority: 6
  }
];

export const UniversalNodeConfigModal: React.FC<UniversalNodeConfigModalProps> = ({
  isOpen,
  onClose,
  nodeId,
  nodeTitle,
  apiBase,
  activeSerial,
  nodeConfig,
  initialAttachedActions = [],
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'params' | 'actions'>('params');
  const [localConfig, setLocalConfig] = useState<Record<string, any>>(nodeConfig || {});
  const [attachedActions, setAttachedActions] = useState<string[]>(initialAttachedActions || []);
  const [allActions, setAllActions] = useState<ObservationActionItem[]>(DEFAULT_OBSERVATION_PLUGINS);
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{
    detected: Array<{ action_id: string; label: string; reason?: string }>;
    clean: Array<{ action_id: string; label: string }>;
    recommended_actions?: string[];
  } | null>(null);
  const [remediatingId, setRemediatingId] = useState<string | null>(null);
  const [remediationMsg, setRemediationMsg] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setIsLoadingActions(true);
    try {
      // 1. Fetch from canonical /api/dag/observations/actions
      const res = await fetch(`${apiBase}/api/dag/observations/actions`);
      if (res.ok) {
        const data = await res.json();
        if (data.actions && data.actions.length > 0) {
          setAllActions(data.actions);
          return;
        }
      }
      // 2. Fallback to /api/dag/observation-actions
      const res2 = await fetch(`${apiBase}/api/dag/observation-actions`);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2.actions && data2.actions.length > 0) {
          setAllActions(data2.actions);
          return;
        }
      }
    } catch (err) {
      console.warn('[UniversalConfig] Using default observation actions catalog:', err);
    } finally {
      setIsLoadingActions(false);
    }
  }, [apiBase]);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      setLocalConfig({ ...nodeConfig });
      setAttachedActions([...initialAttachedActions]);
      setScanResults(null);
      setRemediationMsg(null);
      fetchCatalog();
    }
  }, [isOpen, nodeId, nodeConfig, initialAttachedActions, fetchCatalog]);

  const handleRunScan = async () => {
    setIsScanning(true);
    setRemediationMsg(null);
    try {
      // Call POST /api/dag/observations/discover
      let res = await fetch(`${apiBase}/api/dag/observations/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: activeSerial,
          node_id: nodeId
        })
      });

      if (!res.ok) {
        // Fallback to /api/dag/observation-actions/scan
        res = await fetch(`${apiBase}/api/dag/observation-actions/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial: activeSerial,
            node_id: nodeId
          })
        });
      }

      if (res.ok) {
        const data = await res.json();
        const detected = data.detected_issues || [];
        const clean = data.clean_actions || [];
        const recommended = data.recommended_actions || detected.map((d: any) => d.action_id);
        setScanResults({
          detected,
          clean,
          recommended_actions: recommended
        });
      }
    } catch (err) {
      console.error('[UniversalConfig] Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAutoAttachRecommended = () => {
    const recommendedIds = scanResults?.recommended_actions || scanResults?.detected.map(d => d.action_id) || [];
    if (recommendedIds.length === 0) return;
    setAttachedActions(prev => {
      const combined = [...prev];
      for (const id of recommendedIds) {
        if (!combined.includes(id)) {
          combined.push(id);
        }
      }
      return combined;
    });
    setRemediationMsg({
      id: 'auto_attach',
      success: true,
      msg: `Auto-attached ${recommendedIds.length} recommended workaround action(s) to ${nodeId}!`
    });
  };

  const handleTestRemediate = async (actionId: string) => {
    setRemediatingId(actionId);
    setRemediationMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/observation-actions/${actionId}/remediate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: activeSerial,
          node_id: nodeId
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setRemediationMsg({
          id: actionId,
          success: true,
          msg: data.result?.message || 'Workaround remediation succeeded!'
        });
        // Auto-re-run scan to update status
        setTimeout(() => handleRunScan(), 800);
      } else {
        setRemediationMsg({
          id: actionId,
          success: false,
          msg: data.result?.message || data.detail || 'Remediation failed'
        });
      }
    } catch (err: any) {
      setRemediationMsg({
        id: actionId,
        success: false,
        msg: err.message || 'Network error executing workaround'
      });
    } finally {
      setRemediatingId(null);
    }
  };

  const toggleAction = (actionId: string) => {
    setAttachedActions(prev => {
      if (prev.includes(actionId)) {
        return prev.filter(id => id !== actionId);
      } else {
        return [...prev, actionId];
      }
    });
  };

  const moveAction = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= attachedActions.length) return;
    const next = [...attachedActions];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setAttachedActions(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localConfig, attachedActions);
      onClose();
    } catch (err) {
      console.error('[UniversalConfig] Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} color="#58a6ff" />
          <span>Configure Node: {nodeTitle || nodeId}</span>
        </div>
      }
      subtitle={`Configure execution parameters and attached observation/workaround action plugins for ${nodeId}`}
      confirmText={isSaving ? 'Saving...' : 'Save Configuration & Actions'}
      cancelText="Cancel"
      onConfirm={handleSave}
      disabled={isSaving}
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#e6edf3' }}>
        {/* Tabs Bar */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #30363d',
          gap: '8px',
          paddingBottom: '2px'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('params')}
            style={{
              background: activeTab === 'params' ? '#21262d' : 'transparent',
              color: activeTab === 'params' ? '#58a6ff' : '#8b949e',
              border: 'none',
              borderBottom: activeTab === 'params' ? '2px solid #58a6ff' : '2px solid transparent',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sliders size={14} />
            <span>Node Parameters</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            style={{
              background: activeTab === 'actions' ? '#21262d' : 'transparent',
              color: activeTab === 'actions' ? '#58a6ff' : '#8b949e',
              border: 'none',
              borderBottom: activeTab === 'actions' ? '2px solid #58a6ff' : '2px solid transparent',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Zap size={14} color="#ffa657" />
            <span>Observation & Workarounds</span>
            <span style={{
              background: 'rgba(255, 166, 87, 0.2)',
              color: '#ffa657',
              borderRadius: '10px',
              padding: '1px 6px',
              fontSize: '10px'
            }}>
              {attachedActions.length}
            </span>
          </button>
        </div>

        {/* TAB 1: NODE PARAMETERS */}
        {activeTab === 'params' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Generic / Settle delay */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>SETTLE DELAY (MS)</label>
              <input
                type="number"
                value={localConfig.settle_delay_ms ?? 50}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, settle_delay_ms: parseInt(e.target.value) || 0 }))}
                style={{
                  background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                  padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                }}
              />
              <span style={{ fontSize: '10px', color: '#8b949e' }}>Dwell time allowed for hardware and UI rendering to settle.</span>
            </div>

            {/* Node 1 specifics */}
            {nodeId === 'init_end' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>MANUAL TOTAL LINES OVERRIDE (0 = AUTO)</label>
                <input
                  type="number"
                  value={localConfig.manual_total_lines ?? 0}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, manual_total_lines: parseInt(e.target.value) || 0 }))}
                  style={{
                    background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                    padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                  }}
                />
              </div>
            )}

            {/* Node 3 specifics */}
            {nodeId === 'frame_acquire' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Guard Soft Keyboard</div>
                  <div style={{ fontSize: '10px', color: '#8b949e' }}>Automatically suppresses soft keyboard before screen capture.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalConfig(prev => ({ ...prev, guard_keyboard: !prev.guard_keyboard }))}
                  style={{
                    background: localConfig.guard_keyboard ? '#238636' : '#21262d',
                    color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {localConfig.guard_keyboard ? 'ACTIVE' : 'OFF'}
                </button>
              </div>
            )}

            {/* Node 4 specifics */}
            {nodeId === 'local_ai_ocr' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>LOCAL AI MODEL TARGET</label>
                  <select
                    value={localConfig.model || 'MiniCPM-V (Ollama)'}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, model: e.target.value }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  >
                    <option value="MiniCPM-V (Ollama)">MiniCPM-V (Ollama verbatim)</option>
                    <option value="RapidOCR">RapidOCR (Fast fallback)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Background Worker Mode</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Dispatches AI transcription asynchronously so navigation proceeds immediately.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, background_worker: !prev.background_worker }))}
                    style={{
                      background: localConfig.background_worker ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.background_worker ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </>
            )}

            {/* Node 5 specifics */}
            {nodeId === 'frame_ocr' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>OCR ENGINE</label>
                  <select
                    value={localConfig.engine || 'RapidOCR'}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, engine: e.target.value }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  >
                    <option value="RapidOCR">RapidOCR (Local ONNX/OpenVINO)</option>
                    <option value="OpenCV">OpenCV Heuristic Gutter Solver</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Fast Non-Healing Loop</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Skips extensive gutter pitch heuristics when document has no wraps.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, fast_loop: !prev.fast_loop }))}
                    style={{
                      background: localConfig.fast_loop ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.fast_loop ? 'ON' : 'OFF'}
                  </button>
                </div>
              </>
            )}

            {/* Node 6 specifics */}
            {nodeId === 'arrow_down' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>SCROLL PADDING LINES</label>
                  <input
                    type="number"
                    value={localConfig.scroll_padding_lines ?? 4}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, scroll_padding_lines: parseInt(e.target.value) || 0 }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  />
                  <span style={{ fontSize: '10px', color: '#8b949e' }}>Margin lines required before scroll viewport begins advancing.</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>MAX ADJUSTMENT ATTEMPTS</label>
                  <input
                    type="number"
                    value={localConfig.max_adjust_attempts ?? 7}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, max_adjust_attempts: parseInt(e.target.value) || 0 }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: OBSERVATION & WORKAROUND ACTIONS */}
        {activeTab === 'actions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '440px', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Live Scan Header */}
            <div style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} color="#ffa657" />
                  <span>Dynamic Environmental Anomaly Discovery</span>
                </div>
                <div style={{ fontSize: '10px', color: '#8b949e' }}>
                  Inspects live device screen, toolbar, and IME state to diagnose unexpected issues.
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunScan}
                disabled={isScanning}
                style={{
                  background: isScanning ? '#21262d' : 'rgba(88, 166, 255, 0.15)',
                  color: isScanning ? '#8b949e' : '#58a6ff',
                  border: '1px solid rgba(88, 166, 255, 0.4)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: isScanning ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={12} className={isScanning ? 'spin' : ''} />
                <span>{isScanning ? 'Scanning Display...' : 'Dynamic Observation Scan'}</span>
              </button>
            </div>

            {/* Scan Results Banner */}
            {scanResults && (
              <div style={{
                background: scanResults.detected.length > 0 ? 'rgba(248, 81, 73, 0.1)' : 'rgba(35, 134, 54, 0.15)',
                border: `1px solid ${scanResults.detected.length > 0 ? '#f85149' : '#238636'}`,
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: scanResults.detected.length > 0 ? '#f85149' : '#3fb950' }}>
                    {scanResults.detected.length > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                    <span>
                      {scanResults.detected.length > 0
                        ? `Detected ${scanResults.detected.length} Environmental Anomaly(ies):`
                        : 'All Environment Invariants Clean (No Anomaly Detected)'}
                    </span>
                  </div>
                  {scanResults.detected.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoAttachRecommended}
                      style={{
                        background: 'rgba(0, 255, 157, 0.2)',
                        color: '#00ff9d',
                        border: '1px solid #00ff9d',
                        borderRadius: '5px',
                        padding: '4px 10px',
                        fontSize: '10px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Attach all detected and recommended workarounds to this DAG node"
                    >
                      <Zap size={11} />
                      <span>Auto-Attach Recommended Workarounds</span>
                    </button>
                  )}
                </div>
                {scanResults.detected.map(issue => (
                  <div
                    key={issue.action_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(22, 27, 34, 0.8)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      border: '1px solid rgba(248, 81, 73, 0.3)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#f0f6fc' }}>{issue.label}</div>
                      {issue.reason && <div style={{ fontSize: '10px', color: '#8b949e' }}>{issue.reason}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleTestRemediate(issue.action_id)}
                        disabled={remediatingId === issue.action_id}
                        style={{
                          background: '#238636',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {remediatingId === issue.action_id ? <RefreshCw size={10} className="spin" /> : <Wrench size={10} />}
                        <span>Remediate Now</span>
                      </button>
                      {!attachedActions.includes(issue.action_id) && (
                        <button
                          type="button"
                          onClick={() => toggleAction(issue.action_id)}
                          style={{
                            background: 'rgba(88, 166, 255, 0.2)',
                            color: '#58a6ff',
                            border: '1px solid rgba(88, 166, 255, 0.4)',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          + Attach
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Remediation message alert */}
            {remediationMsg && (
              <div style={{
                background: remediationMsg.success ? 'rgba(35, 134, 54, 0.15)' : 'rgba(248, 81, 73, 0.15)',
                border: `1px solid ${remediationMsg.success ? '#238636' : '#f85149'}`,
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                color: remediationMsg.success ? '#3fb950' : '#f85149'
              }}>
                {remediationMsg.msg}
              </div>
            )}

            {/* Registered Observation-Action Catalog */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Registered Observation-Action Catalog ({allActions.length})
              </div>

              {isLoadingActions && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b949e', fontSize: '11px', padding: '12px 0' }}>
                  <RefreshCw size={12} className="spin" />
                  <span>Loading action plugins...</span>
                </div>
              )}

              {allActions.map((action) => {
                const isAttached = attachedActions.includes(action.action_id);
                const attachedIdx = attachedActions.indexOf(action.action_id);
                const isOneDriveAction = action.action_id === 'markdown_not_open_navigate_onedrive' || action.label.toLowerCase().includes('one drive');

                return (
                  <div
                    key={action.action_id}
                    style={{
                      background: isAttached ? 'rgba(88, 166, 255, 0.08)' : '#161b22',
                      border: `1.5px solid ${isAttached ? '#58a6ff' : '#30363d'}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isAttached}
                          onChange={() => toggleAction(action.action_id)}
                          style={{ marginTop: '2px', cursor: 'pointer', accentColor: '#58a6ff' }}
                          id={`check-${action.action_id}`}
                        />
                        <label htmlFor={`check-${action.action_id}`} style={{ cursor: 'pointer', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: isAttached ? '#f0f6fc' : '#c9d1d9' }}>
                              "{action.label}"
                            </span>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: '#21262d',
                              color: '#8b949e',
                              textTransform: 'uppercase'
                            }}>
                              {action.hook_phase}
                            </span>
                            {action.is_compounding && (
                              <span style={{
                                fontSize: '9px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(255, 166, 87, 0.2)',
                                color: '#ffa657'
                              }}>
                                COMPOUNDING
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#8b949e', marginTop: '2px' }}>
                            {action.description}
                          </div>
                        </label>
                      </div>

                      {/* Order Controls & Test Button */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isAttached && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => moveAction(attachedIdx, 'up')}
                              disabled={attachedIdx === 0}
                              style={{
                                background: '#21262d', border: '1px solid #30363d', borderRadius: '3px',
                                color: attachedIdx === 0 ? '#484f58' : '#c9d1d9', padding: '1px 3px',
                                cursor: attachedIdx === 0 ? 'not-allowed' : 'pointer'
                              }}
                              title="Execute earlier"
                            >
                              <ArrowUp size={10} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveAction(attachedIdx, 'down')}
                              disabled={attachedIdx === attachedActions.length - 1}
                              style={{
                                background: '#21262d', border: '1px solid #30363d', borderRadius: '3px',
                                color: attachedIdx === attachedActions.length - 1 ? '#484f58' : '#c9d1d9', padding: '1px 3px',
                                cursor: attachedIdx === attachedActions.length - 1 ? 'not-allowed' : 'pointer'
                              }}
                              title="Execute later"
                            >
                              <ArrowDown size={10} />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleTestRemediate(action.action_id)}
                          disabled={remediatingId === action.action_id}
                          style={{
                            background: '#21262d',
                            border: '1px solid #30363d',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#c9d1d9',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Test-fire this workaround directly on the active device"
                        >
                          {remediatingId === action.action_id ? <RefreshCw size={10} className="spin" /> : <Play size={10} />}
                          <span>Test</span>
                        </button>
                      </div>
                    </div>

                    {/* Target OneDrive Folder & Markdown Filename parameters */}
                    {isOneDriveAction && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          marginTop: '4px',
                          padding: '8px 10px',
                          background: 'rgba(13, 17, 23, 0.85)',
                          border: '1px solid #30363d',
                          borderRadius: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#ffa657', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>OneDrive Target Parameters:</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#8b949e' }}>Target OneDrive Folder Path</label>
                            <input
                              type="text"
                              value={localConfig.target_folder_path ?? localConfig.folder_path ?? ''}
                              placeholder="e.g. Internal_Open_Source"
                              onChange={(e) => {
                                const val = e.target.value;
                                setLocalConfig(prev => ({ ...prev, target_folder_path: val, folder_path: val }));
                              }}
                              style={{
                                background: '#161b22',
                                border: '1px solid #30363d',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: '#f0f6fc'
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#8b949e' }}>Target Markdown Filename</label>
                            <input
                              type="text"
                              value={localConfig.target_filename ?? localConfig.filename ?? ''}
                              placeholder="e.g. Matrix_main_26-09-17-8-19am.md"
                              onChange={(e) => {
                                const val = e.target.value;
                                setLocalConfig(prev => ({ ...prev, target_filename: val, filename: val }));
                              }}
                              style={{
                                background: '#161b22',
                                border: '1px solid #30363d',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: '#f0f6fc'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
