import React from 'react';
import { RefreshCw, Check, Copy, Sparkles, Settings } from 'lucide-react';
import type { NodeMeta, NodeLiveStatus } from '../../types/dag';

export interface DagNodeCardProps {
  node: NodeMeta;
  status: NodeLiveStatus;
  isSelected: boolean;
  isPinned: boolean;
  isPulsingSwirl: boolean;
  copiedNodeId: string | null;
  attachedActionsCount?: number;
  onSelect: () => void;
  onDoubleClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onCopyForAi: () => void;
  onOpenPromptModal: () => void;
  onOpenConfig?: () => void;
  onStartWiring?: (e: React.MouseEvent, fromNodeId: string) => void;
  onCompleteWiring?: (toNodeId: string) => void;
  isWiringSource?: boolean;
  isWiringTargetCandidate?: boolean;
  style?: React.CSSProperties;
  onMouseDownCard?: (e: React.MouseEvent) => void;
  onPointerDownCard?: (e: React.PointerEvent) => void;
  onPointerDownHeader?: (e: React.PointerEvent) => void;
}

export const DagNodeCard: React.FC<DagNodeCardProps> = ({
  node,
  status,
  isSelected,
  isPinned,
  isPulsingSwirl,
  copiedNodeId,
  attachedActionsCount = 0,
  onSelect,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  onCopyForAi,
  onOpenPromptModal,
  onOpenConfig,
  onStartWiring,
  onCompleteWiring,
  isWiringSource = false,
  isWiringTargetCandidate = false,
  style = {},
  onMouseDownCard,
  onPointerDownCard,
  onPointerDownHeader,
}) => {
  const isCopied = copiedNodeId === node.id;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (onPointerDownCard) {
      onPointerDownCard(e);
    } else if (onMouseDownCard) {
      onMouseDownCard(e as any);
    }
  };

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
      onMouseDown={onMouseDownCard}
      onPointerDown={handlePointerDown}
      style={{
        width: '185px',
        height: '62px',
        background: isSelected ? '#161b22' : 'rgba(13, 17, 23, 0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: '8px',
        border: `1px solid ${
          isWiringTargetCandidate
            ? '#00ff9d'
            : isPinned
            ? '#388bfd'
            : isSelected
            ? node.accentColor
            : status.isRunning
            ? '#ff6b25'
            : status.isError
            ? '#f85149'
            : 'rgba(255, 255, 255, 0.08)'
        }`,
        boxShadow: isPinned
          ? `0 0 16px rgba(56, 139, 253, 0.4), 0 4px 12px rgba(0,0,0,0.6)`
          : isSelected
          ? `0 0 14px ${node.accentColor}33, 0 4px 12px rgba(0,0,0,0.5)`
          : status.isRunning
          ? '0 0 12px rgba(255, 107, 37, 0.35)'
          : '0 2px 8px rgba(0, 0, 0, 0.35)',
        padding: '5px 8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'grab',
        position: 'relative',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
        boxSizing: 'border-box',
        userSelect: 'none',
        ...style
      }}
      title={`Node ${node.step}: ${node.fullName}\n• Evaluator: ${status.evaluator || 'Standard Gutter'}\n${status.healingStep ? `• Healing Action: ${status.healingStep}\n` : ''}${status.telemetryInsight ? `• Insight: ${status.telemetryInsight}\n` : ''}• Drag card to reposition\n• Connect wire via right port\n• Gear icon for configs & actions`}
    >
      {/* Interactive Input Port Socket (Left edge) */}
      <div
        className={`dag-port-socket dag-input-socket ${isWiringTargetCandidate ? 'candidate-pulse' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (onCompleteWiring) onCompleteWiring(node.id);
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
          if (onCompleteWiring) onCompleteWiring(node.id);
        }}
        title={`Input Socket: Connect wire into Node ${node.step}`}
        style={{
          position: 'absolute',
          left: '-5px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isWiringTargetCandidate ? '#00ff9d' : '#0d1117',
          border: `1.5px solid ${isWiringTargetCandidate ? '#00ff9d' : (isSelected ? node.accentColor : '#30363d')}`,
          boxShadow: isWiringTargetCandidate ? '0 0 8px #00ff9d' : 'none',
          cursor: 'pointer',
          zIndex: 10,
          transition: 'all 0.15s ease'
        }}
      />

      {/* Interactive Output Port Socket (Right edge) */}
      <div
        className={`dag-port-socket dag-output-socket ${isWiringSource ? 'source-active' : ''}`}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (onStartWiring) onStartWiring(e, node.id);
        }}
        title={`Output Socket: Drag wire to another node`}
        style={{
          position: 'absolute',
          right: '-5px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isWiringSource ? '#388bfd' : '#0d1117',
          border: `1.5px solid ${isWiringSource ? '#388bfd' : (isSelected ? node.accentColor : '#30363d')}`,
          boxShadow: isWiringSource ? '0 0 8px #388bfd' : 'none',
          cursor: 'crosshair',
          zIndex: 10,
          transition: 'all 0.15s ease'
        }}
      />

      {/* Top Header: Step badge + Node short name + Actions count + Status dot */}
      <div
        className="dag-node-header"
        onPointerDown={onPointerDownHeader}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '4px',
          cursor: 'grab'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, overflow: 'hidden' }}>
          <span
            style={{
              fontSize: '8px',
              fontWeight: 700,
              padding: '1px 4px',
              borderRadius: '3px',
              background: 'rgba(255, 255, 255, 0.05)',
              color: node.accentColor,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontFamily: 'monospace',
              lineHeight: 1
            }}
          >
            {node.step}
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#f0f6fc',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.01em'
            }}
          >
            {node.shortName}
          </span>
          {attachedActionsCount > 0 && (
            <span
              style={{
                fontSize: '8px',
                fontWeight: 700,
                color: '#e3b341',
                display: 'flex',
                alignItems: 'center',
                gap: '1px',
                lineHeight: 1
              }}
              title={`${attachedActionsCount} Observation & Workaround Actions Attached`}
            >
              ⚡{attachedActionsCount}
            </span>
          )}
        </div>

        {status.isRunning ? (
          <RefreshCw size={10} className="spin" color={isPulsingSwirl ? '#ff6b25' : node.accentColor} style={{ flexShrink: 0 }} />
        ) : (
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: status.color,
              boxShadow: status.isRunning ? `0 0 6px ${status.color}` : 'none',
              flexShrink: 0
            }}
          />
        )}
      </div>

      {/* Middle: Subtle status/metric summary */}
      <div
        style={{
          fontSize: '9px',
          fontWeight: 500,
          color: status.isError ? '#f85149' : (status.isRunning ? '#ffa657' : '#8b949e'),
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          padding: '0 1px'
        }}
      >
        {status.healingStep && (status.isRunning || status.isError) && (
          <RefreshCw size={8} className="spin" style={{ flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {status.metricLabel || status.statusLabel}
        </span>
      </div>

      {/* Bottom: Timing & Minimalist Icon Action Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '8.5px',
          color: '#6e7681',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          paddingTop: '3px'
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%', fontFamily: 'monospace' }}>
          {isPulsingSwirl
            ? (status.startedAt ? `${status.startedAt} (active)` : 'Active...')
            : (status.durationMs ? `${(status.durationMs / 1000).toFixed(1)}s` : (status.startedAt || 'Idle'))}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {/* Config (Gear) Icon Button */}
          {onOpenConfig && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenConfig();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '15px',
                height: '15px',
                borderRadius: '3px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.03)',
                color: '#8b949e',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#58a6ff';
                e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.4)';
                e.currentTarget.style.background = 'rgba(88, 166, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              }}
              title="Configure Node & Observation Actions"
            >
              <Settings size={9} />
            </button>
          )}

          {/* AI Prompt Sparkles Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPromptModal();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '15px',
              height: '15px',
              borderRadius: '3px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#8b949e',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffa657';
              e.currentTarget.style.borderColor = 'rgba(255, 166, 87, 0.4)';
              e.currentTarget.style.background = 'rgba(255, 166, 87, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#8b949e';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
            }}
            title="View Markdown Resolution Prompt for AI"
          >
            <Sparkles size={9} />
          </button>

          {/* AI Copy Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopyForAi();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '15px',
              height: '15px',
              borderRadius: '3px',
              border: isCopied ? '1px solid #00ff9d' : '1px solid rgba(255, 255, 255, 0.08)',
              background: isCopied ? 'rgba(0, 255, 157, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              color: isCopied ? '#00ff9d' : '#8b949e',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (!isCopied) {
                e.currentTarget.style.color = '#f0f6fc';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isCopied) {
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              }
            }}
            title="Copy details for AI in Markdown format"
          >
            {isCopied ? <Check size={9} /> : <Copy size={9} />}
          </button>
        </div>
      </div>
    </div>
  );
};
