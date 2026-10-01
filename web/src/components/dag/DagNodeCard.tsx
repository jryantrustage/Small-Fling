import React from 'react';
import { RefreshCw, Check, Copy, Sparkles } from 'lucide-react';
import type { NodeMeta, NodeLiveStatus } from '../../types/dag';

export interface DagNodeCardProps {
  node: NodeMeta;
  status: NodeLiveStatus;
  isSelected: boolean;
  isPinned: boolean;
  isPulsingSwirl: boolean;
  copiedNodeId: string | null;
  onSelect: () => void;
  onDoubleClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onCopyForAi: () => void;
  onOpenPromptModal: () => void;
}

export const DagNodeCard: React.FC<DagNodeCardProps> = ({
  node,
  status,
  isSelected,
  isPinned,
  isPulsingSwirl,
  copiedNodeId,
  onSelect,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  onCopyForAi,
  onOpenPromptModal
}) => {
  const isCopied = copiedNodeId === node.id;

  return (
    <div
      key={node.id}
      className={`dag-mini-node-compact ${isSelected ? 'selected' : ''} ${isPinned ? 'pinned-active' : ''} ${isPulsingSwirl ? 'heat-lamp-active running-swirl' : ''}`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        flex: 1,
        minWidth: '80px',
        maxWidth: '175px',
        height: '56px',
        background: isSelected ? 'rgba(22, 27, 34, 0.98)' : 'rgba(13, 17, 23, 0.9)',
        borderRadius: '6px',
        border: `1.5px solid ${isPinned ? '#58a6ff' : (isSelected ? node.accentColor : (status.isDone ? '#238636' : (status.isError ? '#f85149' : '#30363d')))}`,
        boxShadow: isPinned
          ? `0 0 14px rgba(88, 166, 255, 0.6), 0 2px 8px rgba(0,0,0,0.7)`
          : (isSelected
            ? `0 0 12px ${node.accentColor}55, 0 2px 8px rgba(0,0,0,0.6)`
            : (status.isRunning ? '0 0 10px rgba(255, 107, 37, 0.5)' : 'none')),
        padding: '3px 6px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.15s ease',
        boxSizing: 'border-box'
      }}
      title={`Node ${node.step}: ${node.fullName}\n• Evaluator: ${status.evaluator || 'Standard Gutter'}\n${status.healingStep ? `• Healing Action: ${status.healingStep}\n` : ''}${status.telemetryInsight ? `• Insight: ${status.telemetryInsight}\n` : ''}• Double-click to reveal dynamic details popover\n• Single-click to select`}
    >
      {/* Top: Step badge + Short name + Status indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '3px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden' }}>
          <span style={{
            fontSize: '8px', fontWeight: 800, padding: '0px 3px', borderRadius: '3px',
            background: `${node.accentColor}25`, color: node.accentColor, border: `1px solid ${node.accentColor}55`
          }}>
            {node.step}
          </span>
          <span style={{ fontSize: '9px', fontWeight: 800, color: '#f0f6fc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.shortName}
          </span>
        </div>
        {status.isRunning ? (
          <RefreshCw size={9} className="spin" color={isPulsingSwirl ? '#ff6b25' : node.accentColor} />
        ) : (
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: status.color, boxShadow: `0 0 5px ${status.color}`, flexShrink: 0 }} />
        )}
      </div>

      {/* Middle: Metric badge with healing indicator */}
      <div style={{ fontSize: '8.5px', fontWeight: 700, color: status.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '3px' }}>
        {status.healingStep && (status.isRunning || status.isError) && <RefreshCw size={7.5} className="spin" style={{ flexShrink: 0 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.metricLabel || status.statusLabel}</span>
      </div>

      {/* Bottom: Timing & Quick Copy for AI */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '7.5px', color: isPulsingSwirl ? '#ffa657' : '#8b949e', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1px' }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
          {isPulsingSwirl
            ? (status.startedAt ? `${status.startedAt} (active)` : 'Active...')
            : (status.durationMs ? `${(status.durationMs / 1000).toFixed(1)}s` : (status.startedAt || 'Idle'))}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyForAi();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              padding: '0px 3px',
              borderRadius: '3px',
              border: isCopied ? '1px solid #00ff9d' : '1px solid rgba(88, 166, 255, 0.4)',
              background: isCopied ? 'rgba(0, 255, 157, 0.2)' : 'rgba(88, 166, 255, 0.15)',
              color: isCopied ? '#00ff9d' : '#58a6ff',
              fontSize: '7px',
              fontWeight: 800,
              cursor: 'pointer',
              lineHeight: '11px',
              height: '13px'
            }}
            title="Copy details for AI in Markdown format"
          >
            {isCopied ? <Check size={7} /> : <Copy size={7} />}
            <span>{isCopied ? 'COPIED' : 'AI'}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPromptModal();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              padding: '0px 3px',
              borderRadius: '3px',
              border: '1px solid rgba(255, 166, 87, 0.4)',
              background: 'rgba(255, 166, 87, 0.15)',
              color: '#ffa657',
              fontSize: '7px',
              fontWeight: 800,
              cursor: 'pointer',
              lineHeight: '11px',
              height: '13px'
            }}
            title="View Markdown Resolution Prompt for AI"
          >
            <Sparkles size={7} />
            <span>PROMPT</span>
          </button>
          {isSelected && <span style={{ color: node.accentColor, fontSize: '7px', fontWeight: 800 }}>SEL</span>}
          {isPinned && <span style={{ color: '#58a6ff', fontSize: '7px', fontWeight: 800 }}>OPEN</span>}
        </div>
      </div>
    </div>
  );
};
