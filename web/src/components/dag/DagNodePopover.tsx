import React from 'react';
import {
  Activity, Clock, AlertTriangle, Play, Square, Settings, Check, Copy, Sparkles, X, ShieldAlert, Zap, RefreshCw
} from 'lucide-react';
import type { NodeMeta, NodeLiveStatus, TriggerDecisionState } from '../../types/dag';

export interface DagNodePopoverProps {
  node: NodeMeta;
  liveStatus: NodeLiveStatus;
  isPinned: boolean;
  activeRunningId: string | null;
  copiedNodeId: string | null;
  nodeEvents: Array<{ timestamp: string; category: string; message: string }>;
  onClose: () => void;
  onRunNode: (id: string) => void;
  onAbortNode: (id: string) => void;
  onCopyForAi: (id: string) => void;
  onOpenPromptModal: (id: string) => void;
  onOpenInspector: (id: string) => void;
  onOpenConfig: (id: string) => void;
}

export const DagNodePopover: React.FC<DagNodePopoverProps> = ({
  node,
  liveStatus,
  isPinned,
  activeRunningId,
  copiedNodeId,
  nodeEvents,
  onClose,
  onRunNode,
  onAbortNode,
  onCopyForAi,
  onOpenPromptModal,
  onOpenInspector,
  onOpenConfig,
}) => {
  return (
    <div
      className="dag-dynamic-node-popover"
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '460px',
        maxWidth: '96vw',
        background: 'linear-gradient(180deg, #131923 0%, #0d1117 100%)',
        border: `1.5px solid ${node.accentColor}`,
        borderRadius: '10px',
        boxShadow: `0 16px 40px rgba(0, 0, 0, 0.9), 0 0 24px ${node.accentColor}33`,
        padding: '10px 14px',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '9.5px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px',
            background: `${node.accentColor}25`, color: node.accentColor,
            border: `1px solid ${node.accentColor}55`
          }}>
            NODE {node.step}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#f0f6fc' }}>
            {node.fullName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '8.5px', color: '#8b949e' }}>
            {isPinned ? '📌 Pinned (Double-click node to unpin)' : 'Hover preview'}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px', display: 'flex' }}
            title="Close hover details"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Description */}
      <div style={{ fontSize: '10.5px', color: '#8b949e', lineHeight: 1.35 }}>
        {node.desc}
      </div>

      {/* Live Timing & Status Pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.35)', padding: '5px 8px', borderRadius: '6px', fontSize: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={12} color={liveStatus.isActive ? '#ff6b25' : '#8b949e'} />
          <span style={{ color: liveStatus.isActive ? '#ffa657' : '#f0f6fc', fontWeight: 700 }}>
            {liveStatus.durationMs !== null ? `${(liveStatus.durationMs / 1000).toFixed(2)}s (${liveStatus.durationMs}ms)` : (liveStatus.isActive ? 'Active Execution...' : (liveStatus.startedAt || 'Idle'))}
          </span>
          <span style={{ color: '#484f58' }}>•</span>
          <span style={{ color: liveStatus.color, fontWeight: 700 }}>{liveStatus.metricLabel || liveStatus.statusLabel}</span>
        </div>
        <span style={{
          fontSize: '8.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '3px',
          background: liveStatus.isActive ? 'rgba(255, 107, 37, 0.25)' : (liveStatus.isDone ? 'rgba(0, 255, 157, 0.15)' : (liveStatus.isError ? 'rgba(248, 81, 73, 0.2)' : '#161b22')),
          color: liveStatus.isActive ? '#ffa657' : (liveStatus.isDone ? '#00ff9d' : (liveStatus.isError ? '#ff7b72' : '#8b949e')),
          border: `1px solid ${liveStatus.isActive ? '#ff6b2588' : 'transparent'}`
        }}>
          {liveStatus.isActive ? '♨️ HEAT LAMP ACTIVE' : (liveStatus.isDone ? 'COMPLETED ✔' : (liveStatus.isError ? 'BLOCKED ⛔' : 'READY'))}
        </span>
      </div>

      {/* Detailed Timing Breakdown if available */}
      {liveStatus.timings && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', fontSize: '8.5px', background: 'rgba(0,0,0,0.3)', padding: '5px 7px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div><span style={{ color: '#8b949e', fontSize: '7.5px' }}>TOTAL</span><div style={{ color: '#58a6ff', fontWeight: 800 }}>{liveStatus.timings.duration_ms}ms</div></div>
          <div><span style={{ color: '#8b949e', fontSize: '7.5px' }}>PRECHECK</span><div style={{ color: '#a371f7', fontWeight: 800 }}>{liveStatus.timings.precheck_ms}ms</div></div>
          <div><span style={{ color: '#8b949e', fontSize: '7.5px' }}>ACTION</span><div style={{ color: '#00ff9d', fontWeight: 800 }}>{liveStatus.timings.action_ms}ms</div></div>
          <div><span style={{ color: '#8b949e', fontSize: '7.5px' }}>HEALING</span><div style={{ color: liveStatus.timings.healing_ms > 0 ? '#ffa657' : '#8b949e', fontWeight: 800 }}>{liveStatus.timings.healing_ms}ms</div></div>
        </div>
      )}

      {/* Unresolved Pipeline Issue - Trace Insights */}
      {(liveStatus.traceInsights || liveStatus.dagContext) && (
        <div style={{ background: 'rgba(248, 81, 73, 0.12)', border: '1px solid #f8514988', borderRadius: '6px', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '9px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff7b72', fontWeight: 800 }}>
              <AlertTriangle size={11} color="#ff7b72" />
              <span>UNRESOLVED TRACE INSIGHTS</span>
            </div>
            {liveStatus.dagContext && (
              <span style={{ color: '#8b949e', fontSize: '8px' }}>Disp: {liveStatus.dagContext.display_id ?? 'default'}</span>
            )}
          </div>
          {liveStatus.traceInsights?.slice(0, 3).map((insight, idx) => (
            <div key={idx} style={{ color: insight.startsWith('adb') ? '#58a6ff' : '#f0f6fc', fontFamily: 'var(--font-mono, monospace)', fontSize: '8.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              • {insight}
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {activeRunningId === node.id ? (
            <button
              type="button"
              onClick={() => onAbortNode(node.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                borderRadius: '5px', border: '1px solid #f85149',
                background: 'rgba(248, 81, 73, 0.2)', color: '#ff7b72',
                fontSize: '10px', fontWeight: 800, cursor: 'pointer'
              }}
              title="Abort this node's running operation"
            >
              <Square size={11} fill="#ff7b72" />
              <span>Abort Node {node.step}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRunNode(node.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                borderRadius: '5px', border: `1px solid ${node.accentColor}`,
                background: `${node.accentColor}25`, color: node.accentColor,
                fontSize: '10px', fontWeight: 800, cursor: 'pointer'
              }}
              title={activeRunningId ? `Run Node ${node.step} (aborts running Node ${activeRunningId})` : `Run Node ${node.step}`}
            >
              <Play size={11} />
              <span>{activeRunningId ? `Run Node ${node.step} (Preempt)` : `Run Node ${node.step}`}</span>
            </button>
          )}
          {node.hasConfig && (
            <button
              type="button"
              onClick={() => onOpenConfig(node.id)}
              style={{ background: '#21262d', border: '1px solid #30363d', color: '#58a6ff', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700 }}
            >
              <Settings size={11} />
              <span>Settings</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onCopyForAi(node.id)}
            style={{
              background: copiedNodeId === node.id ? 'rgba(0, 255, 157, 0.2)' : 'rgba(88, 166, 255, 0.15)',
              border: `1px solid ${copiedNodeId === node.id ? '#00ff9d' : '#58a6ff66'}`,
              color: copiedNodeId === node.id ? '#00ff9d' : '#58a6ff',
              padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 800
            }}
            title="Copy details for AI in Markdown format"
          >
            {copiedNodeId === node.id ? <Check size={11} color="#00ff9d" /> : <Copy size={11} />}
            <span>{copiedNodeId === node.id ? 'Copied Details!' : 'Copy details for AI'}</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenPromptModal(node.id)}
            style={{
              background: 'rgba(255, 166, 87, 0.15)',
              border: '1px solid rgba(255, 166, 87, 0.4)',
              color: '#ffa657',
              padding: '4px 8px', borderRadius: '5px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 800
            }}
            title="View and copy AI resolution prompt in Markdown"
          >
            <Sparkles size={11} color="#ffa657" />
            <span>AI Prompt ↗</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => onOpenInspector(node.id)}
          style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700 }}
        >
          <Activity size={11} />
          <span>Full Inspector</span>
        </button>
      </div>

      {/* Telemetry Events Ticker */}
      <div style={{
        background: '#090d14', border: '1px solid #21262d', borderRadius: '6px',
        padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden'
      }}>
        <Activity size={10} color={node.accentColor} style={{ flexShrink: 0 }} />
        {nodeEvents.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#6e7681', flexShrink: 0 }}>{nodeEvents[nodeEvents.length - 1].timestamp}</span>
            <span style={{ fontSize: '8px', fontWeight: 800, padding: '0 4px', borderRadius: '2px', background: 'rgba(0, 255, 157, 0.15)', color: '#00ff9d', flexShrink: 0 }}>
              {nodeEvents[nodeEvents.length - 1].category}
            </span>
            <span style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nodeEvents[nodeEvents.length - 1].message}
            </span>
          </div>
        ) : (
          <span style={{ color: '#6e7681', fontStyle: 'italic' }}>No telemetry recorded for Node {node.step} yet.</span>
        )}
      </div>
    </div>
  );
};

export interface DagBlockedDiagnosticBoxProps {
  triggerDecision: TriggerDecisionState;
  isFixingQualifier: boolean;
  isEvaluating: boolean;
  activeRunningId: string | null;
  onDismiss: () => void;
  onAutoFixKeyboard: () => void;
  onBypassKeyboard: () => void;
  onReevaluate: () => void;
  onRunNode: (id: string) => void;
  onAbortNode: (id: string) => void;
  onOpenConfig: () => void;
}

export const DagBlockedDiagnosticBox: React.FC<DagBlockedDiagnosticBoxProps> = ({
  triggerDecision,
  isFixingQualifier,
  isEvaluating,
  activeRunningId,
  onDismiss,
  onAutoFixKeyboard,
  onBypassKeyboard,
  onReevaluate,
  onRunNode,
  onAbortNode,
  onOpenConfig
}) => {
  return (
    <div
      className="dag-blocked-diagnostic-box"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: '12px',
        width: '420px',
        maxWidth: '94vw',
        background: 'linear-gradient(180deg, #261214 0%, #170b0c 100%)',
        border: '1.5px solid #f85149',
        borderRadius: '10px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.9), 0 0 24px rgba(248, 81, 73, 0.35)',
        padding: '12px 14px',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <ShieldAlert size={16} color="#ff7b72" />
          <span style={{ fontSize: '11px', fontWeight: 900, color: '#ff7b72', letterSpacing: '0.4px' }}>
            DAG 7: TRIGGER PREVENTED (BLOCKED)
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '2px', display: 'flex' }}
          title="Dismiss diagnostic box"
        >
          <X size={14} />
        </button>
      </div>

      {/* Diagnostic Details */}
      <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(248, 81, 73, 0.3)', borderRadius: '6px', padding: '6px 8px', fontSize: '10px' }}>
        <div style={{ fontWeight: 700, color: '#f85149', marginBottom: '2px' }}>Blocking Qualifier Issue:</div>
        {triggerDecision.reasons && triggerDecision.reasons.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: '16px', color: '#f0f6fc', lineHeight: 1.4 }}>
            {triggerDecision.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        ) : (
          <div style={{ color: '#f0f6fc' }}>Virtual Keyboard or Gutter check prevented next cycle transition.</div>
        )}
      </div>

      {/* Solutions Section */}
      <div>
        <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#ffa657', marginBottom: '4px', letterSpacing: '0.3px' }}>
          SOLUTIONS TO OVERCOME THIS ISSUE:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <button
            type="button"
            onClick={onAutoFixKeyboard}
            disabled={isFixingQualifier}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(35, 134, 54, 0.25)', border: '1px solid #2ea043',
              color: '#00ff9d', padding: '5px 8px', borderRadius: '5px',
              fontSize: '10px', fontWeight: 700, cursor: isFixingQualifier ? 'wait' : 'pointer'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Zap size={11} /> 1. Dismiss Keyboard & Auto-Fix Viewport
            </span>
            <span style={{ fontSize: '8px', color: '#8b949e' }}>Recommended</span>
          </button>

          <button
            type="button"
            onClick={onBypassKeyboard}
            disabled={isFixingQualifier}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(88, 166, 255, 0.15)', border: '1px solid #388bfd',
              color: '#58a6ff', padding: '5px 8px', borderRadius: '5px',
              fontSize: '10px', fontWeight: 700, cursor: isFixingQualifier ? 'wait' : 'pointer'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Check size={11} /> 2. Bypass Virtual Keyboard Qualifier
            </span>
            <span style={{ fontSize: '8px', color: '#8b949e' }}>Allow Loop</span>
          </button>

          <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
            <button
              type="button"
              onClick={onReevaluate}
              disabled={isEvaluating}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                background: '#21262d', border: '1px solid #30363d', color: '#e6edf3',
                padding: '4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              <RefreshCw size={10} className={isEvaluating ? 'spin' : ''} />
              <span>Re-Test Qualifiers</span>
            </button>
            {activeRunningId === 'verification_trigger' ? (
              <button
                type="button"
                onClick={() => onAbortNode('verification_trigger')}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  background: 'rgba(248, 81, 73, 0.2)', border: '1px solid #f85149', color: '#ff7b72',
                  padding: '4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                }}
                title="Abort Node 7 operation"
              >
                <Square size={10} fill="#ff7b72" />
                <span>Abort Node 7</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRunNode('verification_trigger')}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  background: '#21262d', border: '1px solid #30363d', color: '#ffa657',
                  padding: '4px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 700, cursor: 'pointer'
                }}
                title={activeRunningId ? `Run Node 7 (aborts running Node ${activeRunningId})` : 'Force Trigger'}
              >
                <Play size={10} />
                <span>{activeRunningId ? 'Run Node 7 (Preempt)' : 'Force Trigger'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenConfig}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#21262d', border: '1px solid #30363d', color: '#8b949e',
                padding: '4px 6px', borderRadius: '4px', fontSize: '9.5px', cursor: 'pointer'
              }}
              title="Open full qualifier configuration modal"
            >
              <Settings size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
