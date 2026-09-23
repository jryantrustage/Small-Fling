import React, { useState, useEffect } from 'react';
import {
  Activity, RefreshCw, Layers, Lock, Cpu, Settings, ShieldCheck,
  ShieldAlert, Sliders, ToggleLeft, ToggleRight, Check, X
} from 'lucide-react';
import { Modal } from './ConfirmModal';

export interface DagNodeState {
  id: string;
  name: string;
  subhead: string;
  status: 'idle' | 'active' | 'completed' | 'error' | 'prevented';
  metric?: string;
  details?: string;
}

export interface DagStatusData {
  active_node: string;
  target_total_lines: number;
  current_top_line: number;
  current_bottom_line: number;
  current_page: number;
  is_keyboard_guarded: boolean;
  arrow_step_count: number;
  verification_trigger_fired: boolean;
  ocr_worker_active: boolean;
  ocr_latency_ms: number;
  node_5_config?: Node5ConfigState;
  trigger_decision?: TriggerDecisionState;
}

export interface QualifierConfigItem {
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
  issue_detected?: boolean;
  details?: string;
}

export interface Node5ConfigState {
  prevent_trigger_on_issue: boolean;
  qualifiers: Record<string, QualifierConfigItem>;
}

export interface TriggerDecisionState {
  allowed: boolean;
  prevented: boolean;
  reasons: string[];
  evaluated_at?: string | null;
  qualifier_statuses?: Record<string, any>;
}

interface FlowDagProps {
  apiBase: string;
  activeProjectId?: string | null;
  currentTopLine?: number;
  currentBottomLine?: number;
  targetTotalLines?: number;
  currentPage?: number;
  isOrchestrating?: boolean;
  onRefresh?: () => void;
}

export const FlowDag: React.FC<FlowDagProps> = ({
  apiBase,
  activeProjectId,
  currentTopLine = 1,
  currentBottomLine = 49,
  targetTotalLines = 0,
  currentPage = 1,
  isOrchestrating = false,
  onRefresh
}) => {
  const [dagStatus, setDagStatus] = useState<DagStatusData>({
    active_node: 'node_1_end',
    target_total_lines: targetTotalLines,
    current_top_line: currentTopLine,
    current_bottom_line: currentBottomLine,
    current_page: currentPage,
    is_keyboard_guarded: true,
    arrow_step_count: 48,
    verification_trigger_fired: false,
    ocr_worker_active: true,
    ocr_latency_ms: 45
  });

  const [isRunningCalibration, setIsRunningCalibration] = useState(false);
  const [calibrationMsg, setCalibrationMsg] = useState('');

  // Node 5 Config Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  const [node5Config, setNode5Config] = useState<Node5ConfigState>({
    prevent_trigger_on_issue: true,
    qualifiers: {
      modal_overlay: {
        name: 'Modal Overlay Check',
        description: 'Is a modal appearing over the teams markdown?',
        enabled: true,
        severity: 'blocking'
      },
      matrix_app_overlay: {
        name: 'Matrix App Capture Check',
        description: 'Is the mobile app matrix capture appearing over the teams markdown?',
        enabled: true,
        severity: 'blocking'
      },
      ocr_degraded: {
        name: 'OCR Quality Degradation Check',
        description: 'Has the result of the previous ocr capture degraded?',
        enabled: true,
        severity: 'blocking'
      },
      keyboard_open: {
        name: 'Virtual Keyboard Check',
        description: 'Is the software keyboard active or covering content?',
        enabled: true,
        severity: 'blocking'
      },
      light_mode: {
        name: 'Theme Qualifier',
        description: 'Ensure editor is in dark mode (prevent light theme wash out)',
        enabled: false,
        severity: 'warning'
      },
      view_mode: {
        name: 'Edit Mode Qualifier',
        description: 'Ensure document is in edit mode with gutter line numbers visible',
        enabled: true,
        severity: 'blocking'
      }
    }
  });

  const [triggerDecision, setTriggerDecision] = useState<TriggerDecisionState>({
    allowed: true,
    prevented: false,
    reasons: []
  });

  // Fetch DAG status and Node 5 qualifier configuration from server
  useEffect(() => {
    let timer: any = null;
    const fetchDag = async () => {
      try {
        const res = await fetch(`${apiBase}/api/dag/status`);
        if (res.ok) {
          const data = await res.json();
          setDagStatus(prev => ({
            ...prev,
            ...data,
            target_total_lines: data.target_total_lines || targetTotalLines,
            current_top_line: data.current_top_line || currentTopLine,
            current_bottom_line: data.current_bottom_line || currentBottomLine,
            current_page: data.current_page || currentPage
          }));

          if (data.node_5_config && data.node_5_config.qualifiers) {
            setNode5Config(prev => ({
              ...prev,
              ...data.node_5_config,
              qualifiers: {
                ...prev.qualifiers,
                ...data.node_5_config.qualifiers
              }
            }));
          }
          if (data.trigger_decision) {
            setTriggerDecision(data.trigger_decision);
          }
        }
      } catch {}
    };
    fetchDag();
    timer = setInterval(fetchDag, 1500);
    return () => clearInterval(timer);
  }, [apiBase, targetTotalLines, currentTopLine, currentBottomLine, currentPage]);

  const effectiveTotal = dagStatus.target_total_lines || targetTotalLines;
  const effectiveTop = dagStatus.current_top_line || currentTopLine;
  const effectiveBottom = dagStatus.current_bottom_line || currentBottomLine;
  const isTriggerFired = dagStatus.verification_trigger_fired || (effectiveTotal > 0 && effectiveTop >= effectiveTotal);

  // Calibration action (Ctrl+End -> Ctrl+Home)
  const handleTriggerCalibration = async () => {
    if (!activeProjectId) {
      setCalibrationMsg('No active project selected');
      return;
    }
    setIsRunningCalibration(true);
    setCalibrationMsg('1. Dispatched Ctrl+End -> Server OCR detecting last line...');
    try {
      const endRes = await fetch(`${apiBase}/api/projects/${activeProjectId}/calibrate-end`, { method: 'POST' });
      const endData = await endRes.json();
      if (!endRes.ok) throw new Error(endData.detail || 'End calibration failed');
      
      const detectedTotal = endData.target_total_lines || endData.total_lines || 0;
      setCalibrationMsg(`Last line detected: Ln ${detectedTotal}. Dispatched Ctrl+Home -> Verifying Line 1...`);
      const homeRes = await fetch(`${apiBase}/api/projects/${activeProjectId}/verify-home`, { method: 'POST' });
      const homeData = await homeRes.json();
      if (!homeRes.ok) throw new Error(homeData.detail || 'Home verification failed');

      setCalibrationMsg(`✔ Calibrated! Total Lines: ${detectedTotal}. Verified at Line 1.`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setCalibrationMsg(`Calibration error: ${err.message}`);
    } finally {
      setIsRunningCalibration(false);
    }
  };

  // Node 5 Config Save Action
  const handleSaveNode5Config = async () => {
    setIsSavingConfig(true);
    setConfigFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/node_5/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(node5Config)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save configuration');
      if (data.config) {
        setNode5Config(prev => ({
          ...prev,
          ...data.config,
          qualifiers: {
            ...prev.qualifiers,
            ...(data.config.qualifiers || {})
          }
        }));
      }
      if (data.trigger_decision) {
        setTriggerDecision(data.trigger_decision);
      }
      setConfigFeedback('✔ Configuration saved successfully!');
      setTimeout(() => setConfigFeedback(null), 3000);
      setIsConfigModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setConfigFeedback(`Failed to save: ${err.message}`);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Live evaluation of qualifiers
  const handleEvaluateNode5 = async () => {
    setIsEvaluating(true);
    setConfigFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/node_5/evaluate`, { method: 'POST' });
      const data = await res.json();
      if (data.trigger_decision) {
        setTriggerDecision(data.trigger_decision);
        setConfigFeedback(data.trigger_decision.prevented 
          ? `⛔ Live Evaluation: Trigger prevented by ${data.trigger_decision.reasons.length} issue(s)`
          : '✔ Live Evaluation: All enabled OCR qualifiers satisfied!');
      }
    } catch (err: any) {
      setConfigFeedback(`Evaluation failed: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Toggle qualifier enabled state
  const handleToggleQualifier = (id: string) => {
    setNode5Config(prev => {
      const current = prev.qualifiers[id];
      if (!current) return prev;
      return {
        ...prev,
        qualifiers: {
          ...prev.qualifiers,
          [id]: {
            ...current,
            enabled: !current.enabled
          }
        }
      };
    });
  };

  // Determine active node state
  const getNodeStatus = (nodeId: string): 'idle' | 'active' | 'completed' => {
    if (isTriggerFired) return 'completed';
    if (!isOrchestrating && !isRunningCalibration) {
      if (effectiveTotal > 0 && nodeId === 'node_1_end') return 'completed';
      if (effectiveTop === 1 && nodeId === 'node_2_home') return 'completed';
    }
    if (dagStatus.active_node === nodeId) return 'active';
    return 'idle';
  };

  // Render Configure button for DAG nodes
  const renderConfigButton = (nodeNumber: number, isActive: boolean) => {
    if (!isActive) {
      return (
        <button
          disabled
          title={`Configure Node ${nodeNumber} (Configuration requirements pending in subsequent prompt)`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            background: '#21262d44',
            color: '#6e7681',
            border: '1px solid #30363d66',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 600,
            cursor: 'not-allowed',
            opacity: 0.6,
            fontFamily: 'var(--font-mono, monospace)'
          }}
        >
          <Settings size={11} />
          <span>Config</span>
        </button>
      );
    }

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsConfigModalOpen(true);
        }}
        title="Configure deterministic general-purpose qualifiers for trigger decision"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          background: triggerDecision.prevented ? '#f8514922' : '#1f6feb22',
          color: triggerDecision.prevented ? '#ff7b72' : '#58a6ff',
          border: `1px solid ${triggerDecision.prevented ? '#f8514966' : '#1f6feb66'}`,
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono, monospace)',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = triggerDecision.prevented ? '#f8514944' : '#1f6feb44';
          e.currentTarget.style.borderColor = triggerDecision.prevented ? '#ff7b72' : '#58a6ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = triggerDecision.prevented ? '#f8514922' : '#1f6feb22';
          e.currentTarget.style.borderColor = triggerDecision.prevented ? '#f8514966' : '#1f6feb66';
        }}
      >
        <Settings size={11} />
        <span>Config</span>
      </button>
    );
  };

  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: '12px',
      padding: '16px',
      color: '#e6edf3',
      fontFamily: 'var(--font-mono, monospace)'
    }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #21262d', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} color="#00ff9d" />
          <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '0.8px', color: '#00ff9d' }}>PAGINATION FLOW DAG</span>
          <span style={{ fontSize: '10px', background: '#161b22', border: '1px solid #30363d', padding: '2px 8px', borderRadius: '10px', color: '#8b949e' }}>
            Large-Scale Markdown Pacer
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Cpu size={13} color="#58a6ff" />
            <span style={{ color: '#8b949e' }}>SERVER OCR:</span>
            <span style={{ color: '#58a6ff', fontWeight: 700 }}>Separate Process ({dagStatus.ocr_latency_ms}ms)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Lock size={13} color="#00ff9d" />
            <span style={{ color: '#8b949e' }}>KEYBOARD:</span>
            <span style={{ color: '#00ff9d', fontWeight: 700 }}>ALWAYS CLOSED</span>
          </div>
        </div>
      </div>

      {/* DAG Flow Visualizer */}
      <div style={{ position: 'relative', padding: '10px 4px 20px 4px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: '8px', minWidth: '850px' }}>
          
          {/* Node 1: Ctrl + End */}
          <div style={{
            flex: 1,
            background: '#161b22',
            border: `1px solid ${getNodeStatus('node_1_end') === 'active' ? '#00ff9d' : (effectiveTotal > 0 ? '#238636' : '#30363d')}`,
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>1. DETERMINE TOTAL LINES</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '9px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: effectiveTotal > 0 ? '#23863633' : '#30363d',
                  color: effectiveTotal > 0 ? '#00ff9d' : '#8b949e',
                  fontWeight: 700
                }}>
                  {effectiveTotal > 0 ? 'CALIBRATED' : 'READY'}
                </span>
                {renderConfigButton(1, false)}
              </div>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#58a6ff' }}>HID Ctrl + End & Last Line OCR</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Sends HID Ctrl+End keys, verifies gutter position at EOF, then displays total lines by OCR of last line of EOF.
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#00ff9d', fontWeight: 700 }}>
              {effectiveTotal > 0 ? `Total: ${effectiveTotal.toLocaleString()} Lines` : 'Target: Auto-detect'}
            </div>
          </div>

          {/* Connection arrow 1 -> 2 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 2: Ctrl + Home */}
          <div style={{
            flex: 1,
            background: '#161b22',
            border: `1px solid ${getNodeStatus('node_2_home') === 'active' ? '#00ff9d' : '#30363d'}`,
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>2. RETURN TO LINE 1</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#30363d', color: '#8b949e', fontWeight: 700 }}>
                  {effectiveTop === 1 ? 'VERIFIED LN 1' : 'ARMED'}
                </span>
                {renderConfigButton(2, false)}
              </div>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#a371f7' }}>HID Ctrl + Home & Verify Line 1</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Sends HID Ctrl+Home to return to line 1, then verifies line 1 is on the top position in the gutter.
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#a371f7', fontWeight: 700 }}>
              Verified: Line 1 at Top Gutter
            </div>
          </div>

          {/* Connection arrow 2 -> 3 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="#00ff9d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 3: Frame Acquisition */}
          <div style={{
            flex: 1.1,
            background: '#161b22',
            border: `1.5px solid ${isOrchestrating ? '#00ff9d' : '#388bfd'}`,
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: isOrchestrating ? '0 0 10px rgba(0, 255, 157, 0.15)' : 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>3. SCREEN CAPTURE & ACQUISITION</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#00ff9d22', color: '#00ff9d', fontWeight: 700 }}>
                  {isOrchestrating ? 'ACQUIRING' : 'READY'}
                </span>
                {renderConfigButton(3, false)}
              </div>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#00ff9d' }}>Capture & Offload OCR Worker</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Screen capture and acquisition: offloads OCR processing to dedicated worker process with keyboard guarded closed.
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#e6edf3', fontWeight: 700 }}>
              Page {currentPage}: Ln {effectiveTop} → {effectiveBottom}
            </div>
          </div>

          {/* Connection arrow 3 -> 4 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="#00ff9d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 4: Arrow Down Stepper */}
          <div style={{
            flex: 1.1,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>4. NAVIGATION</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#30363d', color: '#ffa657', fontWeight: 700 }}>
                  PREV BOTTOM + 1
                </span>
                {renderConfigButton(4, false)}
              </div>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#ffa657' }}>Down Arrow (Next Top Ln)</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Determines line number for first top gutter (prev bottom + 1) and uses down arrow keycodes intelligently to position it on top.
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#ffa657', fontWeight: 700 }}>
              Next Target Top: Ln {effectiveBottom + 1}
            </div>
          </div>

          {/* Connection arrow 4 -> 5 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke={triggerDecision.prevented ? '#f85149' : '#00ff9d'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 5: Terminal Verification Trigger */}
          <div style={{
            flex: 1.3,
            background: isTriggerFired ? '#11291f' : (triggerDecision.prevented ? '#261314' : '#161b22'),
            border: `1.5px solid ${isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#f85149' : '#388bfd')}`,
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: isTriggerFired ? '0 0 14px rgba(0, 255, 157, 0.3)' : (triggerDecision.prevented ? '0 0 12px rgba(248, 81, 73, 0.25)' : 'none')
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>5. VERIFY TRIGGER</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '9px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#f8514933' : '#388bfd22'),
                  color: isTriggerFired ? '#000' : (triggerDecision.prevented ? '#ff7b72' : '#58a6ff'),
                  fontWeight: 800
                }}>
                  {isTriggerFired ? 'TRIGGER FIRED ✔' : (triggerDecision.prevented ? 'PREVENTED ⛔' : 'TRIGGER ARMED')}
                </span>
                {renderConfigButton(5, true)}
              </div>
            </div>
            
            <div style={{ fontSize: '13px', fontWeight: 800, color: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#ff7b72' : '#58a6ff') }}>
              Verify Last Ln + 1 on Top
            </div>
            
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Verifies last line + 1 has been positioned to top, then triggers DAG flow ({effectiveTop} / {effectiveTotal || '?'}).
            </div>

            {/* Qualifier status badge */}
            <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {triggerDecision.prevented ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                  color: '#ff7b72',
                  fontWeight: 700
                }}>
                  <ShieldAlert size={12} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={triggerDecision.reasons[0]}>
                    Blocked: {triggerDecision.reasons[0] || 'Quality issue'}
                  </span>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                  color: '#00ff9d',
                  fontWeight: 700
                }}>
                  <ShieldCheck size={12} />
                  <span>OCR Qualifiers Clean</span>
                </div>
              )}
              <div style={{ fontSize: '10px', color: isTriggerFired ? '#00ff9d' : '#8b949e', fontWeight: 600 }}>
                {isTriggerFired ? '100% Captured - Complete!' : 'Else: Loopback to Step 3'}
              </div>
            </div>
          </div>

        </div>

        {/* Loopback SVG Edge from Node 5 back to Node 3 */}
        <div style={{ marginTop: '12px', padding: '0 8px' }}>
          <svg width="100%" height="28" style={{ overflow: 'visible' }}>
            <defs>
              <marker id="loop-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <polygon points="6 1, 1 4, 6 7" fill="#58a6ff" />
              </marker>
            </defs>
            <path
              d="M 88% 4 C 88% 22, 45% 22, 45% 4"
              fill="none"
              stroke={triggerDecision.prevented ? '#f85149' : '#58a6ff'}
              strokeWidth="2"
              strokeDasharray="4 3"
              markerEnd="url(#loop-arrow)"
            />
            <text x="66%" y="26" fill={triggerDecision.prevented ? '#ff7b72' : '#58a6ff'} fontSize="10" fontFamily="var(--font-mono, monospace)" textAnchor="middle">
              {triggerDecision.prevented
                ? '⛔ Trigger Prevented: OCR qualifiers blocked loopback'
                : '↺ While Ln < Total: Loop Next Page by Arrow Down Keys'}
            </text>
          </svg>
        </div>
      </div>

      {/* Interactive Calibration & Action Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '10px',
        paddingTop: '12px',
        borderTop: '1px solid #21262d',
        gap: '12px'
      }}>
        <div style={{ fontSize: '11px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={14} color="#00ff9d" />
          <span>Verification Trigger:</span>
          <strong style={{ color: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#ff7b72' : '#ffa657') }}>
            {isTriggerFired
              ? `✔ All ${effectiveTotal} lines captured!`
              : (triggerDecision.prevented
                  ? `⛔ Trigger Prevented (${triggerDecision.reasons.length} issue(s))`
                  : `Capturing page ${currentPage} (Ln ${effectiveTop} of ${effectiveTotal || '?'})`)}
          </strong>
          {calibrationMsg && <span style={{ color: '#58a6ff', marginLeft: '8px' }}>{calibrationMsg}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsConfigModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#21262d',
              color: '#58a6ff',
              border: '1px solid #30363d',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono, monospace)',
              transition: 'background 0.15s'
            }}
          >
            <Sliders size={13} />
            <span>Configure Trigger (Node 5)</span>
          </button>

          <button
            onClick={handleTriggerCalibration}
            disabled={isRunningCalibration}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: isRunningCalibration ? '#21262d' : '#1f6feb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: isRunningCalibration ? 'wait' : 'pointer',
              fontFamily: 'var(--font-mono, monospace)',
              transition: 'background 0.15s'
            }}
          >
            <RefreshCw size={12} className={isRunningCalibration ? 'spin' : ''} />
            <span>{isRunningCalibration ? 'Calibrating...' : 'Run Ctrl+End / Ctrl+Home Calibrate'}</span>
          </button>
        </div>
      </div>

      {/* Node 5 Configuration Modal */}
      {isConfigModalOpen && (
        <Modal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={18} color="#58a6ff" />
              <span>DAG Node 5: Trigger Verification & Qualifiers</span>
            </div>
          }
          subtitle="Configure deterministic general-purpose qualifiers to determine if DAG trigger should occur or be prevented"
          confirmText={isSavingConfig ? 'Saving...' : 'Save Configuration'}
          cancelText="Close"
          onConfirm={handleSaveNode5Config}
          disabled={isSavingConfig}
          maxWidth="720px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#e6edf3' }}>
            
            {/* Master Enforcement Switch */}
            <div style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} color="#00ff9d" />
                  <span>Enforce Qualifier-Based Trigger Prevention</span>
                </div>
                <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '3px', lineHeight: 1.4 }}>
                  When active, any enabled qualifier detecting an OCR-compromising issue halts the DAG trigger at Node 5 to guarantee clean line acquisition.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setNode5Config(prev => ({ ...prev, prevent_trigger_on_issue: !prev.prevent_trigger_on_issue }))}
                style={{
                  background: node5Config.prevent_trigger_on_issue ? '#238636' : '#21262d',
                  color: '#fff',
                  border: `1px solid ${node5Config.prevent_trigger_on_issue ? '#2ea043' : '#30363d'}`,
                  borderRadius: '20px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                {node5Config.prevent_trigger_on_issue ? (
                  <>
                    <ToggleRight size={16} />
                    <span>ENFORCED</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft size={16} />
                    <span>BYPASSED</span>
                  </>
                )}
              </button>
            </div>

            {/* Live Trigger Decision Preview */}
            <div style={{
              background: triggerDecision.prevented ? '#2d1416' : '#102319',
              border: `1px solid ${triggerDecision.prevented ? '#f85149' : '#238636'}`,
              borderRadius: '8px',
              padding: '12px 14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {triggerDecision.prevented ? (
                    <ShieldAlert size={18} color="#ff7b72" />
                  ) : (
                    <ShieldCheck size={18} color="#00ff9d" />
                  )}
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: triggerDecision.prevented ? '#ff7b72' : '#00ff9d'
                  }}>
                    {triggerDecision.prevented ? 'DAG TRIGGER PREVENTED' : 'DAG TRIGGER ALLOWED'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleEvaluateNode5}
                  disabled={isEvaluating}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    background: '#21262d',
                    color: '#58a6ff',
                    border: '1px solid #30363d',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: isEvaluating ? 'wait' : 'pointer'
                  }}
                >
                  <RefreshCw size={11} className={isEvaluating ? 'spin' : ''} />
                  <span>{isEvaluating ? 'Testing...' : 'Test Qualifiers Now'}</span>
                </button>
              </div>

              {triggerDecision.prevented ? (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#f0f6fc' }}>
                  <div style={{ fontWeight: 600, color: '#ff7b72', marginBottom: '4px' }}>
                    Blocking issues preventing trigger from Node 5:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: '#e6edf3', lineHeight: 1.5 }}>
                    {triggerDecision.reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#8b949e' }}>
                  All enabled quality qualifiers are satisfied. Next page gutter verification will trigger loopback cleanly.
                </div>
              )}
            </div>

            {configFeedback && (
              <div style={{
                padding: '8px 12px',
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#58a6ff',
                fontWeight: 600
              }}>
                {configFeedback}
              </div>
            )}

            {/* Deterministic Qualifiers List */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#8b949e', marginBottom: '8px', letterSpacing: '0.5px' }}>
                DETERMINISTIC OCR QUALITY QUALIFIERS
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(node5Config.qualifiers).map(([qId, qItem]) => {
                  const statusInfo = triggerDecision.qualifier_statuses?.[qId];
                  const hasIssue = statusInfo?.issue_detected ?? false;
                  const detailsText = statusInfo?.details;

                  return (
                    <div
                      key={qId}
                      style={{
                        background: '#161b22',
                        border: `1px solid ${hasIssue && qItem.enabled ? '#f8514988' : '#30363d'}`,
                        borderRadius: '6px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>
                            {qItem.name}
                          </span>
                          <span style={{
                            fontSize: '9px',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: qItem.severity === 'blocking' ? '#f8514922' : '#d2992222',
                            color: qItem.severity === 'blocking' ? '#ff7b72' : '#e3b341',
                            fontWeight: 700
                          }}>
                            {qItem.severity.toUpperCase()}
                          </span>
                          
                          {/* Live Status Tag */}
                          {qItem.enabled ? (
                            hasIssue ? (
                              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#f85149', color: '#fff', fontWeight: 700 }}>
                                ISSUE DETECTED
                              </span>
                            ) : (
                              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#23863633', color: '#00ff9d', fontWeight: 700 }}>
                                SATISFIED
                              </span>
                            )
                          ) : (
                            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#21262d', color: '#8b949e', fontWeight: 600 }}>
                              DISABLED
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                          {qItem.description}
                        </div>

                        {detailsText && (
                          <div style={{ fontSize: '10px', color: hasIssue ? '#ff7b72' : '#7ee787', marginTop: '3px' }}>
                            Live status: {detailsText}
                          </div>
                        )}
                      </div>

                      {/* Enable/Disable Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleQualifier(qId)}
                        style={{
                          background: qItem.enabled ? '#1f6feb22' : '#21262d',
                          color: qItem.enabled ? '#58a6ff' : '#8b949e',
                          border: `1px solid ${qItem.enabled ? '#1f6feb66' : '#30363d'}`,
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          minWidth: '90px',
                          justifyContent: 'center'
                        }}
                      >
                        {qItem.enabled ? (
                          <>
                            <Check size={12} color="#58a6ff" />
                            <span>Enabled</span>
                          </>
                        ) : (
                          <>
                            <X size={12} color="#8b949e" />
                            <span>Disabled</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </Modal>
      )}
    </div>
  );
};
