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
        background: isSelected ? 'rgba(22, 27, 34, 0.98)' : 'rgba(13, 17, 23, 0.92)',
        backdropFilter: 'blur(8px)',
        borderRadius: '7px',
        border: `1.5px solid ${isWiringTargetCandidate ? '#00ff9d' : (isPinned ? '#58a6ff' : (isSelected ? node.accentColor : (status.isDone ? '#238636' : (status.isError ? '#f85149' : '#30363d'))))}`,
        boxShadow: isPinned
          ? `0 0 16px rgba(88, 166, 255, 0.6), 0 4px 12px rgba(0,0,0,0.7)`
          : (isSelected
            ? `0 0 14px ${node.accentColor}55, 0 4px 12px rgba(0,0,0,0.6)`
            : (status.isRunning ? '0 0 12px rgba(255, 107, 37, 0.5)' : '0 2px 8px rgba(0,0,0,0.4)')),
        padding: '4px 8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'grab',
        position: 'relative',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        boxSizing: 'border-box',
        userSelect: 'none',
        ...style
      }}
      title={`Node ${node.step}: ${node.fullName}\n• Evaluator: ${status.evaluator || 'Standard Gutter'}\n${status.healingStep ? `• Healing Action: ${status.healingStep}\n` : ''}${status.telemetryInsight ? `• Insight: ${status.telemetryInsight}\n` : ''}• Drag card to reposition on 2D canvas\n• Drag wire from right port to connect\n• Click Gear (CFG) for observation actions & parameters`}
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
        title={`Input Port Socket: Drop wire here to direct execution flow into Node ${node.step}`}
        style={{
          position: 'absolute',
          left: '-7px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '13px',
          height: '13px',
          borderRadius: '50%',
          background: isWiringTargetCandidate ? '#00ff9d' : '#161b22',
          border: `2px solid ${isWiringTargetCandidate ? '#00ff9d' : node.accentColor}`,
          boxShadow: isWiringTargetCandidate ? '0 0 10px #00ff9d' : '0 0 4px rgba(0,0,0,0.8)',
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
        title={`Output Port Socket: Drag interactive Bezier wire to another node's Input Socket`}
        style={{
          position: 'absolute',
          right: '-7px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '13px',
          height: '13px',
          borderRadius: '50%',
          background: isWiringSource ? '#58a6ff' : '#161b22',
          border: `2px solid ${isWiringSource ? '#58a6ff' : node.accentColor}`,
          boxShadow: isWiringSource ? '0 0 10px #58a6ff' : '0 0 4px rgba(0,0,0,0.8)',
          cursor: 'crosshair',
          zIndex: 10,
          transition: 'all 0.15s ease'
        }}
      />

      {/* Top: Step badge + Short name + Action count + Status indicator */}
      <div
        className="dag-node-header"
        onPointerDown={onPointerDownHeader}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '3px', cursor: 'grab' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
          <span style={{
            fontSize: '8px', fontWeight: 800, padding: '0px 3px', borderRadius: '3px',
            background: `${node.accentColor}25`, color: node.accentColor, border: `1px solid ${node.accentColor}55`
          }}>
            {node.step}
          </span>
          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#f0f6fc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.shortName}
          </span>
          {attachedActionsCount > 0 && (
            <span
              style={{
                fontSize: '7px',
                fontWeight: 800,
                padding: '0px 3px',
                borderRadius: '3px',
                background: 'rgba(255, 166, 87, 0.22)',
                color: '#ffa657',
                border: '1px solid rgba(255, 166, 87, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '1px'
              }}
              title={`${attachedActionsCount} Observation/Workaround Actions Attached`}
            >
              ⚡{attachedActionsCount}
            </span>
          )}
        </div>
        {status.isRunning ? (
          <RefreshCw size={9} className="spin" color={isPulsingSwirl ? '#ff6b25' : node.accentColor} />
        ) : (
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.color, boxShadow: `0 0 5px ${status.color}`, flexShrink: 0 }} />
        )}
      </div>

      {/* Middle: Metric badge with healing indicator */}
      <div style={{ fontSize: '8.5px', fontWeight: 700, color: status.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '3px' }}>
        {status.healingStep && (status.isRunning || status.isError) && <RefreshCw size={7.5} className="spin" style={{ flexShrink: 0 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.metricLabel || status.statusLabel}</span>
      </div>

      {/* Bottom: Timing & Action Buttons (Config, AI, Prompt) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '7.5px', color: isPulsingSwirl ? '#ffa657' : '#8b949e', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '2px' }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55%' }}>
          {isPulsingSwirl
            ? (status.startedAt ? `${status.startedAt} (active)` : 'Active...')
            : (status.durationMs ? `${(status.durationMs / 1000).toFixed(1)}s` : (status.startedAt || 'Idle'))}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {/* Config (Gear) Button */}
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
                gap: '2px',
                padding: '0px 3px',
                borderRadius: '3px',
                border: '1px solid rgba(88, 166, 255, 0.4)',
                background: 'rgba(88, 166, 255, 0.15)',
                color: '#58a6ff',
                fontSize: '7px',
                fontWeight: 800,
                cursor: 'pointer',
                lineHeight: '11px',
                height: '13px'
              }}
              title="Configure Node & Observation Actions"
            >
              <Settings size={7} />
              <span>CFG</span>
            </button>
          )}

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

          {/* AI Prompt Button */}
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
