import React, { useState, useEffect } from 'react';
import {
  Activity, RefreshCw, Layers, Lock, Cpu
} from 'lucide-react';

export interface DagNodeState {
  id: string;
  name: string;
  subhead: string;
  status: 'idle' | 'active' | 'completed' | 'error';
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

  // Fetch DAG status from server
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
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: '8px', minWidth: '820px' }}>
          
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
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>1. INITIAL CALIBRATE</span>
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
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#58a6ff' }}>Ctrl + End Key</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Flings to bottom of markdown. Capture sent to server OCR to detect total lines.
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
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>2. RESET TOP</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#30363d', color: '#8b949e', fontWeight: 700 }}>
                {effectiveTop === 1 ? 'VERIFIED LN 1' : 'ARMED'}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#a371f7' }}>Ctrl + Home Key</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Returns page to Line 1. Capture sent to server OCR to verify first line is Line 1.
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#a371f7', fontWeight: 700 }}>
              Verified: Line 1 at Top
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
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>3. ACQUISITION</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#00ff9d22', color: '#00ff9d', fontWeight: 700 }}>
                {isOrchestrating ? 'ACQUIRING' : 'READY'}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#00ff9d' }}>Screen Capture & OCR</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Keyboard closed verified. Frame offloaded to dedicated server OCR worker process.
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
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#30363d', color: '#ffa657', fontWeight: 700 }}>
                KEYCODES
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#ffa657' }}>Arrow Down Key (N)</div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Positions bottom line + 1 to top line. Injects N keystrokes with keyboard closed.
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#ffa657', fontWeight: 700 }}>
              Next Target Top: Ln {effectiveBottom + 1}
            </div>
          </div>

          {/* Connection arrow 4 -> 5 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="#ff7b72" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Node 5: Terminal Verification Trigger */}
          <div style={{
            flex: 1.2,
            background: isTriggerFired ? '#11291f' : '#161b22',
            border: `1.5px solid ${isTriggerFired ? '#00ff9d' : '#f85149'}`,
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: isTriggerFired ? '0 0 14px rgba(0, 255, 157, 0.3)' : 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 700 }}>5. VERIFICATION TRIGGER</span>
              <span style={{
                fontSize: '9px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: isTriggerFired ? '#00ff9d' : '#ff7b7222',
                color: isTriggerFired ? '#000' : '#ff7b72',
                fontWeight: 800
              }}>
                {isTriggerFired ? 'TRIGGER FIRED ✔' : 'MONITORING'}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: isTriggerFired ? '#00ff9d' : '#ff7b72' }}>
              Last Line Moved To Top
            </div>
            <div style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.4 }}>
              Condition: Top Line &gt;= Total Lines ({effectiveTop} / {effectiveTotal || '?'})
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '6px', borderTop: '1px solid #21262d', fontSize: '11px', color: isTriggerFired ? '#00ff9d' : '#8b949e', fontWeight: 700 }}>
              {isTriggerFired ? '100% Captured - Complete!' : 'Else: Loopback to Step 3'}
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
              stroke="#58a6ff"
              strokeWidth="2"
              strokeDasharray="4 3"
              markerEnd="url(#loop-arrow)"
            />
            <text x="66%" y="26" fill="#58a6ff" fontSize="10" fontFamily="var(--font-mono, monospace)" textAnchor="middle">
              ↺ While Ln &lt; Total: Loop Next Page by Arrow Down Keys
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
          <strong style={{ color: isTriggerFired ? '#00ff9d' : '#ffa657' }}>
            {isTriggerFired ? `✔ All ${effectiveTotal} lines captured!` : `Capturing page ${currentPage} (Ln ${effectiveTop} of ${effectiveTotal || '?'})`}
          </strong>
          {calibrationMsg && <span style={{ color: '#58a6ff', marginLeft: '8px' }}>{calibrationMsg}</span>}
        </div>

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
  );
};
