import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, Layers, Lock, Cpu, Settings, ShieldCheck, ShieldAlert, Sliders, ToggleLeft, ToggleRight, Check, X, Play } from 'lucide-react';
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
  dag?: {
    current_active_node?: string;
    nodes?: Record<string, any>;
    edges?: Array<{ from: string; to: string; is_loopback?: boolean }>;
  };
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

export interface FlowDagProps {
  apiBase: string;
  activeProjectId?: string | null;
  activeDeviceSerial?: string | null;
  currentTopLine?: number;
  currentBottomLine?: number;
  targetTotalLines?: number;
  currentPage?: number;
  isOrchestrating?: boolean;
  onRefresh?: () => void;
}

export const FlowDag: React.FC<FlowDagProps> = ({
  apiBase, activeProjectId, activeDeviceSerial, currentTopLine = 1, currentBottomLine = 49,
  targetTotalLines = 0, currentPage = 1, isOrchestrating = false, onRefresh
}) => {
  const [dagStatus, setDagStatus] = useState<DagStatusData>({
    active_node: 'node_1_end', target_total_lines: targetTotalLines,
    current_top_line: currentTopLine, current_bottom_line: currentBottomLine,
    current_page: currentPage, is_keyboard_guarded: true, arrow_step_count: 48,
    verification_trigger_fired: false, ocr_worker_active: true, ocr_latency_ms: 45
  });

  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [nodeFeedback, setNodeFeedback] = useState<{ id: string; message: string; isError?: boolean } | null>(null);
  const [isRunningCalibration, setIsRunningCalibration] = useState(false);
  const [calibrationMsg, setCalibrationMsg] = useState('');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  const [node5Config, setNode5Config] = useState<Node5ConfigState>({
    prevent_trigger_on_issue: true,
    qualifiers: {
      modal_overlay: { name: 'Modal Overlay Check', description: 'Is a modal appearing over the teams markdown?', enabled: true, severity: 'blocking' },
      matrix_app_overlay: { name: 'Matrix App Capture Check', description: 'Is the mobile app matrix capture appearing over teams markdown?', enabled: true, severity: 'blocking' },
      ocr_degraded: { name: 'OCR Quality Degradation Check', description: 'Has previous ocr capture degraded?', enabled: true, severity: 'blocking' },
      keyboard_open: { name: 'Virtual Keyboard Check', description: 'Is software keyboard active or covering content?', enabled: true, severity: 'blocking' },
      light_mode: { name: 'Theme Qualifier', description: 'Ensure editor is in dark mode', enabled: false, severity: 'warning' },
      view_mode: { name: 'Edit Mode Qualifier', description: 'Ensure document in edit mode with gutter lines visible', enabled: true, severity: 'blocking' }
    }
  });

  const [triggerDecision, setTriggerDecision] = useState<TriggerDecisionState>({ allowed: true, prevented: false, reasons: [] });

  useEffect(() => {
    const fetchDag = async () => {
      try {
        const res = await fetch(`${apiBase}/api/dag/status`);
        if (res.ok) {
          const d = await res.json();
          setDagStatus(prev => ({
            ...prev,
            ...d,
            target_total_lines: d.target_total_lines !== undefined ? d.target_total_lines : targetTotalLines,
            current_top_line: d.current_top_line || currentTopLine,
            current_bottom_line: d.current_bottom_line || currentBottomLine,
            current_page: d.current_page || currentPage
          }));
          if (d.node_5_config?.qualifiers) setNode5Config(prev => ({ ...prev, ...d.node_5_config, qualifiers: { ...prev.qualifiers, ...d.node_5_config.qualifiers } }));
          if (d.trigger_decision) setTriggerDecision(d.trigger_decision);
        }
      } catch {}
    };
    fetchDag();
    const t = setInterval(fetchDag, 1500);
    return () => clearInterval(t);
  }, [apiBase, targetTotalLines, currentTopLine, currentBottomLine, currentPage]);

  const effectiveTotal = dagStatus.target_total_lines || targetTotalLines;
  const effectiveTop = dagStatus.current_top_line || currentTopLine;
  const effectiveBottom = dagStatus.current_bottom_line || currentBottomLine;
  const isTriggerFired = dagStatus.verification_trigger_fired || (effectiveTotal > 0 && effectiveTop >= effectiveTotal);

  const node1 = dagStatus.dag?.nodes?.init_end || {};
  const node2 = dagStatus.dag?.nodes?.reset_home || {};
  const node3 = dagStatus.dag?.nodes?.frame_acquire || {};
  const node4 = dagStatus.dag?.nodes?.arrow_down || {};
  const node5 = dagStatus.dag?.nodes?.verification_trigger || {};

  const handleRunNode = async (nodeId: string) => {
    setRunningNodeId(nodeId);
    setNodeFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/${nodeId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: activeDeviceSerial })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || `Failed to run ${nodeId}`);
      setNodeFeedback({ id: nodeId, message: data.message || `Node ${nodeId} ran successfully ✔`, isError: data.status === 'warning' });
      const statusRes = await fetch(`${apiBase}/api/dag/status`);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setDagStatus(prev => ({ ...prev, ...d }));
        if (d.trigger_decision) setTriggerDecision(d.trigger_decision);
      }
      onRefresh?.();
      setTimeout(() => setNodeFeedback(null), 5000);
    } catch (err: any) {
      setNodeFeedback({ id: nodeId, message: `Node execution error: ${err.message}`, isError: true });
      setTimeout(() => setNodeFeedback(null), 6000);
    } finally {
      setRunningNodeId(null);
    }
  };

  const handleTriggerCalibration = async () => {
    if (!activeProjectId) { setCalibrationMsg('No active project selected'); return; }
    setIsRunningCalibration(true);
    setCalibrationMsg('1. Dispatched Ctrl+End -> Server OCR detecting last line...');
    try {
      const endRes = await fetch(`${apiBase}/api/projects/${activeProjectId}/calibrate-end`, { method: 'POST' });
      const endData = await endRes.json();
      if (!endRes.ok) throw new Error(endData.detail || 'End calibration failed');
      const detected = endData.target_total_lines || endData.total_lines || 0;
      if (detected <= 0) {
        setCalibrationMsg('⚠️ Calibration warning: 0 lines detected at EOF. Ensure document is visible.');
        return;
      }
      setCalibrationMsg(`Last line: Ln ${detected}. Dispatched Ctrl+Home -> Verifying Line 1...`);
      const homeRes = await fetch(`${apiBase}/api/projects/${activeProjectId}/verify-home`, { method: 'POST' });
      const homeData = await homeRes.json();
      if (!homeRes.ok) throw new Error(homeData.detail || 'Home verification failed');
      setCalibrationMsg(`✔ Calibrated! Total: ${detected} Lines. Verified Line 1.`);
      onRefresh?.();
    } catch (err: any) { setCalibrationMsg(`Calibration error: ${err.message}`); }
    finally { setIsRunningCalibration(false); }
  };

  const handleSaveNode5Config = async () => {
    setIsSavingConfig(true);
    setConfigFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/node_5/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node5Config)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save config');
      if (data.config) setNode5Config(prev => ({ ...prev, ...data.config, qualifiers: { ...prev.qualifiers, ...(data.config.qualifiers || {}) } }));
      if (data.trigger_decision) setTriggerDecision(data.trigger_decision);
      setConfigFeedback('✔ Configuration saved!');
      setTimeout(() => setConfigFeedback(null), 3000);
      setIsConfigModalOpen(false);
      onRefresh?.();
    } catch (err: any) { setConfigFeedback(`Failed to save: ${err.message}`); }
    finally { setIsSavingConfig(false); }
  };

  const handleEvaluateNode5 = async () => {
    setIsEvaluating(true);
    setConfigFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/nodes/node_5/evaluate`, { method: 'POST' });
      const data = await res.json();
      if (data.trigger_decision) {
        setTriggerDecision(data.trigger_decision);
        setConfigFeedback(data.trigger_decision.prevented ? `⛔ Prevented by ${data.trigger_decision.reasons.length} issue(s)` : '✔ All qualifiers satisfied!');
      }
    } catch (err: any) { setConfigFeedback(`Evaluation failed: ${err.message}`); }
    finally { setIsEvaluating(false); }
  };

  const handleToggleQualifier = (id: string) => {
    setNode5Config(prev => prev.qualifiers[id] ? ({ ...prev, qualifiers: { ...prev.qualifiers, [id]: { ...prev.qualifiers[id], enabled: !prev.qualifiers[id].enabled } } }) : prev);
  };

  const renderArrow = (color = '#58a6ff') => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12H19M19 12L13 6M19 12L13 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );

  const runBtnStyle = (color = '#58a6ff', disabled = false): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    padding: '5px 10px',
    borderRadius: '6px',
    border: `1px solid ${disabled ? '#30363d' : `${color}66`}`,
    background: disabled ? '#21262d' : `${color}18`,
    color: disabled ? '#8b949e' : color,
    fontSize: '10.5px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    width: '100%',
    marginTop: 'auto'
  });

  // Accurate node metrics & statuses
  const isNode1Running = runningNodeId === 'init_end' || node1.status === 'active';
  const isNode1Calibrated = node1.status === 'completed' && ((node1.total_lines || 0) > 0 || (effectiveTotal > 0 && dagStatus.active_node !== 'init_end'));
  const isNode1Error = node1.status === 'error';
  const node1TotalLines = node1.total_lines || (isNode1Calibrated ? effectiveTotal : 0);

  const isNode2Running = runningNodeId === 'reset_home' || node2.status === 'active';
  const isNode2Verified = node2.status === 'completed' && Boolean(node2.verified);
  const isNode2Error = node2.status === 'error' || (node2.status === 'completed' && !node2.verified);

  const isNode3Running = runningNodeId === 'frame_acquire' || node3.status === 'active' || isOrchestrating;
  const isNode3Done = node3.status === 'completed';

  const isNode4Running = runningNodeId === 'arrow_down' || node4.status === 'active';
  const isNode4Done = node4.status === 'completed';

  const isNode5Running = runningNodeId === 'verification_trigger' || isEvaluating || node5.status === 'active';

  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '12px', padding: '16px', color: '#e6edf3', fontFamily: 'var(--font-mono, monospace)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #21262d', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} color="#00ff9d" /><span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '0.8px', color: '#00ff9d' }}>PAGINATION FLOW DAG</span>
          <span style={{ fontSize: '10px', background: '#161b22', border: '1px solid #30363d', padding: '2px 8px', borderRadius: '10px', color: '#8b949e' }}>Deterministic Step Actuator</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Cpu size={13} color="#58a6ff" /><span style={{ color: '#8b949e' }}>OCR ENGINE:</span><span style={{ color: '#58a6ff', fontWeight: 700 }}>Separate Process ({dagStatus.ocr_latency_ms}ms)</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Lock size={13} color="#00ff9d" /><span style={{ color: '#8b949e' }}>KEYBOARD:</span><span style={{ color: '#00ff9d', fontWeight: 700 }}>ALWAYS CLOSED</span></div>
        </div>
      </div>

      {nodeFeedback && (
        <div style={{ margin: '0 0 12px 0', padding: '8px 12px', borderRadius: '6px', background: nodeFeedback.isError ? 'rgba(248, 81, 73, 0.15)' : 'rgba(0, 255, 157, 0.12)', border: `1px solid ${nodeFeedback.isError ? '#f8514966' : '#00ff9d55'}`, color: nodeFeedback.isError ? '#ff7b72' : '#00ff9d', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'toaster-appear 0.15s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {nodeFeedback.isError ? <ShieldAlert size={14} /> : <Check size={14} />}
            <span style={{ fontWeight: 600 }}>{nodeFeedback.message}</span>
          </div>
          <button onClick={() => setNodeFeedback(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: '2px' }}><X size={12} /></button>
        </div>
      )}

      <div style={{ position: 'relative', padding: '6px 4px 16px 4px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: '8px', minWidth: '850px' }}>
          {/* Node 1 */}
          <div style={{ flex: 1, background: '#161b22', border: `1px solid ${isNode1Calibrated ? '#238636' : (isNode1Error ? '#f8514966' : '#30363d')}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>1. DETERMINE TOTAL LINES</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: isNode1Running ? '#58a6ff22' : (isNode1Calibrated ? '#23863633' : (isNode1Error ? '#f8514922' : '#30363d')), color: isNode1Running ? '#58a6ff' : (isNode1Calibrated ? '#00ff9d' : (isNode1Error ? '#ff7b72' : '#8b949e')), fontWeight: 700 }}>
                {isNode1Running ? 'CALIBRATING...' : (isNode1Calibrated ? 'CALIBRATED' : (isNode1Error ? 'FAILED' : 'NOT RUN'))}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#58a6ff' }}>HID Ctrl + End & Last Line OCR</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>Sends HID Ctrl+End keys, verifies gutter at EOF, then displays total lines by OCR of last line.</div>
            <div style={{ paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: isNode1Calibrated ? '#00ff9d' : '#8b949e', fontWeight: 700 }}>
              {isNode1Calibrated && node1TotalLines > 0 ? `Total: ${node1TotalLines.toLocaleString()} Lines` : 'Target: Auto-detect (Ctrl+End)'}
            </div>
            <button type="button" onClick={() => handleRunNode('init_end')} disabled={runningNodeId !== null} title="Run Ctrl+End and detect EOF last line" style={runBtnStyle('#58a6ff', runningNodeId !== null)}>
              {isNode1Running ? <RefreshCw size={11} className="spin" /> : <Play size={11} />}
              <span>{isNode1Running ? 'Calibrating...' : 'Run Node 1'}</span>
            </button>
          </div>

          {renderArrow('#58a6ff')}

          {/* Node 2 */}
          <div style={{ flex: 1, background: '#161b22', border: `1px solid ${isNode2Verified ? '#238636' : (isNode2Error ? '#f8514966' : '#30363d')}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>2. RETURN TO LINE 1</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: isNode2Running ? '#a371f722' : (isNode2Verified ? '#23863633' : (isNode2Error ? '#f8514922' : '#30363d')), color: isNode2Running ? '#a371f7' : (isNode2Verified ? '#00ff9d' : (isNode2Error ? '#ff7b72' : '#8b949e')), fontWeight: 700 }}>
                {isNode2Running ? 'VERIFYING...' : (isNode2Verified ? 'VERIFIED LN 1' : (isNode2Error ? 'UNVERIFIED' : 'NOT RUN'))}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#a371f7' }}>HID Ctrl + Home & Verify Line 1</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>Sends HID Ctrl+Home to return to line 1, then verifies line 1 is on top in gutter.</div>
            <div style={{ paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: isNode2Verified ? '#00ff9d' : '#a371f7', fontWeight: 700 }}>
              {isNode2Verified ? 'Verified: Line 1 at Top Gutter' : (isNode2Error ? `Ln 1 not detected (${node2.first_line ? `Ln ${node2.first_line}` : 'none'})` : 'Awaiting Ctrl+Home test')}
            </div>
            <button type="button" onClick={() => handleRunNode('reset_home')} disabled={runningNodeId !== null} title="Run Ctrl+Home and verify line 1 in gutter" style={runBtnStyle('#a371f7', runningNodeId !== null)}>
              {isNode2Running ? <RefreshCw size={11} className="spin" /> : <Play size={11} />}
              <span>{isNode2Running ? 'Verifying...' : 'Run Node 2'}</span>
            </button>
          </div>

          {renderArrow('#00ff9d')}

          {/* Node 3 */}
          <div style={{ flex: 1.1, background: '#161b22', border: `1.5px solid ${isNode3Running ? '#00ff9d' : (isNode3Done ? '#238636' : '#388bfd')}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: isNode3Running ? '0 0 10px rgba(0, 255, 157, 0.15)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>3. SCREEN CAPTURE</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: isNode3Running ? '#00ff9d22' : '#30363d', color: isNode3Running ? '#00ff9d' : (isNode3Done ? '#00ff9d' : '#8b949e'), fontWeight: 700 }}>
                {isNode3Running ? 'ACQUIRING' : (isNode3Done ? 'ACQUIRED' : 'READY')}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#00ff9d' }}>Capture & Offload OCR Worker</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>Screen capture: offloads OCR processing to dedicated worker with keyboard guarded closed.</div>
            <div style={{ paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#e6edf3', fontWeight: 700 }}>
              {isNode3Done ? `Page ${node3.page || currentPage}: Ln ${node3.top_line || effectiveTop} → ${node3.bottom_line || effectiveBottom}` : 'Awaiting Screen Capture'}
            </div>
            <button type="button" onClick={() => handleRunNode('frame_acquire')} disabled={runningNodeId !== null} title="Capture external screen and offload to OCR worker" style={runBtnStyle('#00ff9d', runningNodeId !== null)}>
              {runningNodeId === 'frame_acquire' ? <RefreshCw size={11} className="spin" /> : <Play size={11} />}
              <span>{runningNodeId === 'frame_acquire' ? 'Capturing...' : 'Run Node 3'}</span>
            </button>
          </div>

          {renderArrow('#00ff9d')}

          {/* Node 4 */}
          <div style={{ flex: 1.1, background: '#161b22', border: `1px solid ${isNode4Done ? '#ffa65766' : '#30363d'}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>4. NAVIGATION</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: isNode4Running ? '#ffa65722' : '#30363d', color: '#ffa657', fontWeight: 700 }}>
                {isNode4Running ? 'STEPPING...' : (isNode4Done ? 'STEPPED' : 'PREV BOTTOM + 1')}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#ffa657' }}>Down Arrow (Next Top Ln)</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>Uses down arrow keys to position (prev bottom + 1) onto top gutter.</div>
            <div style={{ paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#ffa657', fontWeight: 700 }}>
              {isNode4Done && node4.new_top_line ? `Next Target Top: Ln ${node4.new_top_line}` : `Step: ${dagStatus.arrow_step_count || 47} Down Arrows`}
            </div>
            <button type="button" onClick={() => handleRunNode('arrow_down')} disabled={runningNodeId !== null} title="Step down arrow keys" style={runBtnStyle('#ffa657', runningNodeId !== null)}>
              {isNode4Running ? <RefreshCw size={11} className="spin" /> : <Play size={11} />}
              <span>{isNode4Running ? 'Stepping...' : 'Run Node 4'}</span>
            </button>
          </div>

          {renderArrow(triggerDecision.prevented ? '#f85149' : '#00ff9d')}

          {/* Node 5 */}
          <div style={{ flex: 1.3, background: isTriggerFired ? '#11291f' : (triggerDecision.prevented ? '#261314' : '#161b22'), border: `1.5px solid ${isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#f85149' : '#388bfd')}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: isTriggerFired ? '0 0 14px rgba(0, 255, 157, 0.3)' : (triggerDecision.prevented ? '0 0 12px rgba(248, 81, 73, 0.25)' : 'none') }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>5. VERIFY TRIGGER</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#f8514933' : '#388bfd22'), color: isTriggerFired ? '#000' : (triggerDecision.prevented ? '#ff7b72' : '#58a6ff'), fontWeight: 800 }}>
                  {isTriggerFired ? 'TRIGGER FIRED ✔' : (triggerDecision.prevented ? 'PREVENTED ⛔' : 'TRIGGER ARMED')}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setIsConfigModalOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: triggerDecision.prevented ? '#f8514922' : '#1f6feb22', color: triggerDecision.prevented ? '#ff7b72' : '#58a6ff', border: `1px solid ${triggerDecision.prevented ? '#f8514966' : '#1f6feb66'}`, borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}><Settings size={11} /><span>Config</span></button>
              </div>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#ff7b72' : '#58a6ff') }}>Verify Last Ln + 1 on Top</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>Verifies last line + 1 positioned to top, then triggers DAG flow ({effectiveTop} / {effectiveTotal || '?'}).</div>
            <div style={{ paddingTop: '6px', borderTop: '1px solid #21262d', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {triggerDecision.prevented ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#ff7b72', fontWeight: 700 }}><ShieldAlert size={12} /><span>Blocked: {triggerDecision.reasons[0] || 'Quality issue'}</span></div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#00ff9d', fontWeight: 700 }}><ShieldCheck size={12} /><span>OCR Qualifiers Clean</span></div>
              )}
              <div style={{ fontSize: '10px', color: isTriggerFired ? '#00ff9d' : '#8b949e', fontWeight: 600 }}>{isTriggerFired ? '100% Captured - Complete!' : 'Else: Loopback to Step 3'}</div>
            </div>
            <div style={{ display: 'flex', gap: '6px', width: '100%', marginTop: 'auto' }}>
              <button type="button" onClick={() => handleRunNode('verification_trigger')} disabled={runningNodeId !== null} title="Evaluate classifiers and verify trigger condition" style={{ ...runBtnStyle('#58a6ff', runningNodeId !== null), flex: 1, marginTop: 0 }}>
                {isNode5Running ? <RefreshCw size={11} className="spin" /> : <Play size={11} />}
                <span>{isNode5Running ? 'Evaluating...' : 'Run Node 5'}</span>
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '12px', padding: '0 8px' }}>
          <svg width="100%" height="28" style={{ overflow: 'visible' }}>
            <defs><marker id="loop-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><polygon points="6 1, 1 4, 6 7" fill="#58a6ff" /></marker></defs>
            <path d="M 88% 4 C 88% 22, 45% 22, 45% 4" fill="none" stroke={triggerDecision.prevented ? '#f85149' : '#58a6ff'} strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#loop-arrow)" />
            <text x="66%" y="26" fill={triggerDecision.prevented ? '#ff7b72' : '#58a6ff'} fontSize="10" textAnchor="middle">{triggerDecision.prevented ? '⛔ Trigger Prevented: OCR qualifiers blocked loopback' : '↺ While Ln < Total: Loop Next Page by Arrow Down Keys'}</text>
          </svg>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '12px', borderTop: '1px solid #21262d', gap: '12px' }}>
        <div style={{ fontSize: '11px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={14} color="#00ff9d" /><span>Verification Trigger:</span>
          <strong style={{ color: isTriggerFired ? '#00ff9d' : (triggerDecision.prevented ? '#ff7b72' : '#ffa657') }}>
            {isTriggerFired ? `✔ All ${effectiveTotal} lines captured!` : (triggerDecision.prevented ? `⛔ Trigger Prevented (${triggerDecision.reasons.length} issue(s))` : `Capturing page ${currentPage} (Ln ${effectiveTop} of ${effectiveTotal || '?'})`)}
          </strong>
          {calibrationMsg && <span style={{ color: '#58a6ff', marginLeft: '8px' }}>{calibrationMsg}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setIsConfigModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#21262d', color: '#58a6ff', border: '1px solid #30363d', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}><Sliders size={13} /><span>Configure Trigger (Node 5)</span></button>
          <button onClick={handleTriggerCalibration} disabled={isRunningCalibration} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: isRunningCalibration ? '#21262d' : '#1f6feb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: isRunningCalibration ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            <RefreshCw size={12} className={isRunningCalibration ? 'spin' : ''} /><span>{isRunningCalibration ? 'Calibrating...' : 'Run Ctrl+End / Ctrl+Home Calibrate'}</span>
          </button>
        </div>
      </div>

      {isConfigModalOpen && (
        <Modal isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={18} color="#58a6ff" /><span>DAG Node 5: Trigger Verification & Qualifiers</span></div>} subtitle="Configure deterministic general-purpose qualifiers for trigger decision" confirmText={isSavingConfig ? 'Saving...' : 'Save Configuration'} cancelText="Close" onConfirm={handleSaveNode5Config} disabled={isSavingConfig} maxWidth="720px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#e6edf3' }}>
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#f0f6fc', display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={16} color="#00ff9d" /><span>Enforce Qualifier-Based Trigger Prevention</span></div>
                <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '3px' }}>When active, enabled qualifiers detecting issues halt the DAG trigger at Node 5.</div>
              </div>
              <button type="button" onClick={() => setNode5Config(p => ({ ...p, prevent_trigger_on_issue: !p.prevent_trigger_on_issue }))} style={{ background: node5Config.prevent_trigger_on_issue ? '#238636' : '#21262d', color: '#fff', border: `1px solid ${node5Config.prevent_trigger_on_issue ? '#2ea043' : '#30363d'}`, borderRadius: '20px', padding: '4px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {node5Config.prevent_trigger_on_issue ? <><ToggleRight size={16} /><span>ENFORCED</span></> : <><ToggleLeft size={16} /><span>BYPASSED</span></>}
              </button>
            </div>

            <div style={{ background: triggerDecision.prevented ? '#2d1416' : '#102319', border: `1px solid ${triggerDecision.prevented ? '#f85149' : '#238636'}`, borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {triggerDecision.prevented ? <ShieldAlert size={18} color="#ff7b72" /> : <ShieldCheck size={18} color="#00ff9d" />}
                  <span style={{ fontSize: '12px', fontWeight: 800, color: triggerDecision.prevented ? '#ff7b72' : '#00ff9d' }}>{triggerDecision.prevented ? 'DAG TRIGGER PREVENTED' : 'DAG TRIGGER ALLOWED'}</span>
                </div>
                <button type="button" onClick={handleEvaluateNode5} disabled={isEvaluating} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#21262d', color: '#58a6ff', border: '1px solid #30363d', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: isEvaluating ? 'wait' : 'pointer' }}>
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

            {configFeedback && <div style={{ padding: '8px 12px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', fontSize: '11px', color: '#58a6ff', fontWeight: 600 }}>{configFeedback}</div>}

            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#8b949e', marginBottom: '8px' }}>DETERMINISTIC OCR QUALITY QUALIFIERS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(node5Config.qualifiers).map(([qId, qItem]) => {
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
                      <button type="button" onClick={() => handleToggleQualifier(qId)} style={{ background: qItem.enabled ? '#1f6feb22' : '#21262d', color: qItem.enabled ? '#58a6ff' : '#8b949e', border: `1px solid ${qItem.enabled ? '#1f6feb66' : '#30363d'}`, borderRadius: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', minWidth: '90px', justifyContent: 'center' }}>
                        {qItem.enabled ? <><Check size={12} color="#58a6ff" /><span>Enabled</span></> : <><X size={12} color="#8b949e" /><span>Disabled</span></>}
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
