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

export interface InteractiveDagConnectorProps {
  id?: string;
  fromNodeId: string;
  toNodeId: string;
  fromLabel?: string;
  toLabel?: string;
  isConnected: boolean;
  isActive?: boolean;
  isPaused?: boolean;
  isToggling?: boolean;
  accentColor?: string;
  onToggle: () => void;
  onChangeTarget?: (newTargetNodeId: string) => void;
  allNodes?: NodeMeta[];
  title?: string;
}

export const InteractiveDagConnector: React.FC<InteractiveDagConnectorProps> = ({
  fromNodeId,
  toNodeId,
  fromLabel = 'FROM',
  toLabel = 'TO',
  isConnected,
  isActive = false,
  isToggling = false,
  accentColor = '#00ff9d',
  onToggle,
  onChangeTarget,
  allNodes,
  title
}) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 2px',
        flexShrink: 0,
        zIndex: 10,
        position: 'relative'
      }}
    >
      {/* Connector Header Tag */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          marginBottom: '2px',
          fontSize: '7.5px',
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 800,
          color: isConnected ? accentColor : '#ff7b72',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          background: 'rgba(15, 23, 42, 0.65)',
          padding: '1px 5px',
          borderRadius: '3px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <span>{fromLabel}</span>
        <span style={{ color: isConnected ? accentColor : '#f85149' }}>➔</span>
        <span>{toLabel}</span>
      </div>

      {/* Main Interactive Connector Button / Socket */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <button
          type="button"
          onClick={onToggle}
          disabled={isToggling}
          title={title || (isConnected ? `Connector [${fromNodeId} ➔ ${toNodeId}] is CONNECTED. Click to DISCONNECT/GATE.` : `Connector [${fromNodeId} ➔ ${toNodeId}] is DISCONNECTED. Click to CONNECT & DIRECT FLOW.`)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            padding: '3px 6px',
            borderRadius: '6px',
            background: isConnected
              ? (isActive ? 'rgba(0, 255, 157, 0.25)' : 'rgba(35, 134, 54, 0.2)')
              : 'rgba(218, 54, 51, 0.25)',
            border: `1.5px solid ${isConnected ? (isActive ? accentColor : '#3fb950') : '#f85149'}`,
            color: isConnected ? (isActive ? accentColor : '#3fb950') : '#ff7b72',
            cursor: 'pointer',
            boxShadow: isConnected
              ? (isActive ? `0 0 10px ${accentColor}66` : '0 0 8px rgba(63, 185, 80, 0.35)')
              : '0 0 10px rgba(248, 81, 73, 0.55)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            minWidth: '58px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '9px' }}>{isConnected ? '⚡' : '✂️'}</span>
            <span style={{ fontSize: '8.5px', fontWeight: 900, letterSpacing: '0.4px' }}>
              {isConnected ? 'LINKED' : 'SEVERED'}
            </span>
          </div>
          <span style={{ fontSize: '7px', fontWeight: 800, color: isConnected ? '#8b949e' : '#ff7b72', letterSpacing: '0.2px' }}>
            {isConnected ? (isActive ? 'FLOWING' : 'READY') : 'PAUSED'}
          </span>
        </button>

        {/* Re-route flow destination dropdown trigger if allNodes provided */}
        {onChangeTarget && allNodes && allNodes.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(v => !v)}
              title="Direct Flow: Choose target node for this connector"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '24px',
                padding: 0,
                borderRadius: '4px',
                background: isMenuOpen ? 'rgba(88, 166, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#c9d1d9',
                cursor: 'pointer',
                fontSize: '8px'
              }}
            >
              ▾
            </button>

            {isMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                  zIndex: 100,
                  width: '160px',
                  padding: '4px 0',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '9px'
                }}
              >
                <div style={{ padding: '3px 8px', fontSize: '8px', color: '#8b949e', fontWeight: 800, borderBottom: '1px solid #21262d' }}>
                  DIRECT FLOW TO:
                </div>
                {allNodes.filter(n => n.id !== fromNodeId).map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      onChangeTarget(n.id);
                      setIsMenuOpen(false);
                    }}
                    style={{
                      padding: '4px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      color: n.id === toNodeId ? '#00ff9d' : '#c9d1d9',
                      background: n.id === toNodeId ? 'rgba(0, 255, 157, 0.12)' : 'transparent',
                      fontWeight: n.id === toNodeId ? 800 : 500
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(88, 166, 255, 0.15)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = n.id === toNodeId ? 'rgba(0, 255, 157, 0.12)' : 'transparent')}
                  >
                    <span style={{ color: n.accentColor || '#58a6ff' }}>•</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.shortName}
                    </span>
                    {n.id === toNodeId && <span style={{ fontSize: '8px', color: '#00ff9d' }}>✔</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Directional Flow Arrow Underneath */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
        <svg width="24" height="8" viewBox="0 0 24 8" style={{ overflow: 'visible' }}>
          <path
            d="M 2 4 L 18 4"
            fill="none"
            stroke={isConnected ? (isActive ? accentColor : '#3fb950') : '#f85149'}
            strokeWidth={isConnected ? 2 : 1.5}
            strokeDasharray={isConnected ? (isActive ? '4 2' : 'none') : '3 2'}
            className={isActive && isConnected ? 'dag-wire-active' : ''}
          />
          <polygon
            points="18,1 23,4 18,7"
            fill={isConnected ? (isActive ? accentColor : '#3fb950') : '#f85149'}
          />
        </svg>
      </div>
    </div>
  );
};

export interface InteractiveLoopbackConnectorProps {
  isConnected: boolean;
  isCaptureRunning: boolean;
  isPrevented: boolean;
  onToggle: () => void;
}

export const InteractiveLoopbackConnector: React.FC<InteractiveLoopbackConnectorProps> = ({
  isConnected,
  isCaptureRunning,
  isPrevented,
  onToggle
}) => (
  <div style={{ width: '100%', position: 'relative', marginTop: '3px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    {/* Center Interactive Loopback Pill */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, marginBottom: '-8px' }}>
      <button
        type="button"
        onClick={onToggle}
        title={isConnected ? 'Loopback track CONNECTED (Repeats back into Node 3). Click to disconnect.' : 'Loopback track DISCONNECTED (Halt cycle after Node 8). Click to connect.'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '12px',
          background: isConnected
            ? (isCaptureRunning ? 'rgba(0, 255, 157, 0.2)' : 'rgba(35, 134, 54, 0.18)')
            : 'rgba(218, 54, 51, 0.22)',
          border: `1px solid ${isConnected ? (isCaptureRunning ? '#00ff9d' : '#3fb950') : '#f85149'}`,
          color: isConnected ? (isCaptureRunning ? '#00ff9d' : '#3fb950') : '#ff7b72',
          fontSize: '7.5px',
          fontWeight: 800,
          fontFamily: 'var(--font-mono, monospace)',
          cursor: 'pointer',
          boxShadow: isConnected ? '0 0 8px rgba(0, 255, 157, 0.2)' : '0 0 8px rgba(248, 81, 73, 0.4)',
          transition: 'all 0.2s ease'
        }}
      >
        <span>{isConnected ? '⚡' : '✂️'}</span>
        <span>{isConnected ? 'LOOPBACK TRACK: CONNECTED' : 'LOOPBACK TRACK: DISCONNECTED'}</span>
      </button>
    </div>

    {/* SVG Return Arc */}
    <div style={{ width: '100%', height: '14px', position: 'relative' }}>
      <svg width="100%" height="14" viewBox="0 0 1000 14" preserveAspectRatio="none" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
        <path
          d="M 988 1 C 988 12, 30 12, 30 1"
          fill="none"
          stroke={!isConnected ? '#f85149' : (isPrevented ? '#f85149' : (isCaptureRunning ? '#00ff9d' : '#00ff9d77'))}
          strokeWidth={isCaptureRunning && isConnected ? 2.2 : 1.6}
          strokeDasharray={!isConnected ? '4 3' : (isCaptureRunning ? '6 3' : '4 3')}
          className={isCaptureRunning && isConnected ? 'dag-wire-active' : ''}
          markerEnd={!isConnected ? 'url(#dag-arrowhead-heat)' : (isPrevented ? 'url(#dag-arrowhead-heat)' : 'url(#dag-arrowhead-green)')}
        />
      </svg>
    </div>
  </div>
);
