import React from 'react';

export const DagSvgAssets: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
    <defs>
      <linearGradient id="dag-flow-emerald" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#388bfd" />
        <stop offset="100%" stopColor="#00ff9d" />
      </linearGradient>
      <linearGradient id="dag-flow-blue" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#388bfd" />
        <stop offset="100%" stopColor="#58a6ff" />
      </linearGradient>
      <linearGradient id="dag-flow-purple" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00ff9d" />
        <stop offset="100%" stopColor="#a371f7" />
      </linearGradient>
      <linearGradient id="dag-flow-amber" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#8957e5" />
        <stop offset="100%" stopColor="#ffa657" />
      </linearGradient>
      <linearGradient id="dag-flow-heat" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#ff9100" />
        <stop offset="100%" stopColor="#ff3d00" />
      </linearGradient>
      <filter id="dag-wire-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <marker id="dag-arrowhead-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="1 1, 5.5 3, 1 5" fill="#00ff9d" />
      </marker>
      <marker id="dag-arrowhead-blue" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="1 1, 5.5 3, 1 5" fill="#58a6ff" />
      </marker>
      <marker id="dag-arrowhead-purple" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="1 1, 5.5 3, 1 5" fill="#a371f7" />
      </marker>
      <marker id="dag-arrowhead-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="1 1, 5.5 3, 1 5" fill="#ffa657" />
      </marker>
      <marker id="dag-arrowhead-heat" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <polygon points="1 1, 5.5 3, 1 5" fill="#ff6b25" />
      </marker>
    </defs>
  </svg>
);
