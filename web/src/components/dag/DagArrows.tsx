import React from 'react';
import type { NodeMeta } from '../../types/dag';

export interface MicroConnectingArrowProps {
  fromNode: NodeMeta;
  toNode: NodeMeta;
  width?: number;
  isActive: boolean;
  isHeat: boolean;
}

export const MicroConnectingArrow: React.FC<MicroConnectingArrowProps> = ({
  fromNode,
  toNode,
  width = 20,
  isActive,
  isHeat,
}) => {
  const isInit = toNode.group === 'initialize';
  const isAi = toNode.id === 'local_ai_ocr';
  const isAmber = toNode.id === 'arrow_down';

  let gradientId = 'dag-flow-emerald';
  let markerId = 'dag-arrowhead-green';
  let strokeFallback = '#00ff9d';

  if (isHeat) {
    gradientId = 'dag-flow-heat';
    markerId = 'dag-arrowhead-heat';
    strokeFallback = '#ff6b25';
  } else if (isInit) {
    gradientId = 'dag-flow-blue';
    markerId = 'dag-arrowhead-blue';
    strokeFallback = '#58a6ff';
  } else if (isAi) {
    gradientId = 'dag-flow-purple';
    markerId = 'dag-arrowhead-purple';
    strokeFallback = '#a371f7';
  } else if (isAmber) {
    gradientId = 'dag-flow-amber';
    markerId = 'dag-arrowhead-amber';
    strokeFallback = '#ffa657';
  }

  const y = 16;
  const startX = 2;
  const endX = width - 4;
  const pathD = `M ${startX} ${y} L ${endX} ${y}`;

  return (
    <div
      key={`arrow-${fromNode.id}->${toNode.id}`}
      style={{
        width: `${width}px`,
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative'
      }}
    >
      <svg width={width} height="32" style={{ overflow: 'visible' }}>
        {isActive && (
          <path
            d={pathD}
            fill="none"
            stroke={strokeFallback}
            strokeWidth="5"
            strokeOpacity="0.4"
            filter="url(#dag-wire-glow)"
          />
        )}
        <path
          d={pathD}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={isActive ? 2.4 : 1.8}
          strokeOpacity={isActive ? 1 : 0.75}
          strokeDasharray={isActive ? '5 3' : 'none'}
          className={isActive ? 'dag-wire-active' : ''}
          markerEnd={`url(#${markerId})`}
        />
        {isActive && (
          <circle r="2.5" fill="#ffffff" filter="url(#dag-wire-glow)">
            <animateMotion path={pathD} dur="0.8s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
    </div>
  );
};

export interface LoopbackArrowProps {
  isCaptureRunning: boolean;
  isPrevented: boolean;
}

export const LoopbackArrow: React.FC<LoopbackArrowProps> = ({ isCaptureRunning, isPrevented }) => (
  <>
    {/* Exit line from Node 8 */}
    <div
      style={{ width: '20px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}
      title="Loopback exit from Assemble Doc"
    >
      <svg width="20" height="56" viewBox="0 0 20 56" style={{ overflow: 'visible' }}>
        <path
          d="M 1 28 C 12 28, 15 38, 15 54"
          fill="none"
          stroke={isPrevented ? '#f85149' : (isCaptureRunning ? '#00ff9d' : '#00ff9d88')}
          strokeWidth="2.2"
          strokeDasharray={isCaptureRunning ? '5 2' : 'none'}
          className={isCaptureRunning ? 'dag-wire-active' : ''}
          markerEnd={isPrevented ? 'url(#dag-arrowhead-heat)' : 'url(#dag-arrowhead-green)'}
        />
      </svg>
    </div>
  </>
);

export const LoopbackReturnTrack: React.FC<LoopbackArrowProps> = ({ isCaptureRunning, isPrevented }) => (
  <div style={{ width: '100%', height: '15px', position: 'relative', marginTop: '2px', display: 'flex', alignItems: 'center' }}>
    <svg width="100%" height="15" viewBox="0 0 1000 15" preserveAspectRatio="none" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
      <path
        d="M 988 1 C 988 13, 30 13, 30 1"
        fill="none"
        stroke={isPrevented ? '#f85149' : (isCaptureRunning ? '#00ff9d' : '#00ff9d77')}
        strokeWidth={isCaptureRunning ? 2.2 : 1.6}
        strokeDasharray={isCaptureRunning ? '6 3' : '4 3'}
        className={isCaptureRunning ? 'dag-wire-active' : ''}
        markerEnd={isPrevented ? 'url(#dag-arrowhead-heat)' : 'url(#dag-arrowhead-green)'}
      />
    </svg>
  </div>
);
