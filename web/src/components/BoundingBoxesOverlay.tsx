import React from 'react';
import type { AlignmentData } from '../types';

export interface BoundingBoxesOverlayProps {
  data?: AlignmentData | null;
  aspectRatio?: number;
  isPortrait?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const BoundingBoxesOverlay: React.FC<BoundingBoxesOverlayProps> = ({
  data,
  aspectRatio = 16 / 9,
  isPortrait = false,
  className = '',
  style = {},
}) => {
  if (!data?.boxes) return null;
  const boxes = data.boxes;

  // viewBox is standardized to 1000 x 1000 with preserveAspectRatio="none"
  // so normalized coordinates [nx, ny, nw, nh] in [0, 1] map precisely to [nx*1000, ny*1000, nw*1000, nh*1000]
  // on top of the matched stage element.
  const ar = aspectRatio > 0 ? aspectRatio : (isPortrait ? 9 / 16 : 16 / 9);
  const badgeScaleX = ar >= 1 ? 1 : Math.max(0.65, ar);
  const badgeScaleY = ar >= 1 ? Math.min(1.4, 1 / ar) : 1;

  return (
    <svg
      className={`live-bounding-box-svg ${className}`.trim()}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
        ...style,
      }}
    >
      {Object.entries(boxes).map(([key, b]) => {
        if (!b?.box_norm) return null;
        const [nx, ny, nw, nh] = b.box_norm;
        const x = Math.max(0, Math.min(995, nx * 1000));
        const y = Math.max(0, Math.min(995, ny * 1000));
        const w = Math.max(8, Math.min(1000 - x, nw * 1000));
        const h = Math.max(8, Math.min(1000 - y, nh * 1000));
        const isPassed = b.passed !== false;
        const strokeColor = isPassed ? (b.hex || '#22c55e') : '#ef4444';

        const labelText = !isPassed
          ? `❌ FAIL: ${b.name || key}`
          : (key === 'first_line' ? `✔ Ln ${b.line_number || data.first_line_number || '?'}` :
             key === 'last_line' ? `✔ Ln ${b.line_number || data.last_line_number || '?'}` :
             key === 'file_name' ? `✔ ${b.text || 'Markdown'}` :
             key === 'teams_logo' ? `✔ ${b.text || 'Teams'}` :
             key === 'edit_mode' ? '✔ ✏️ Edit Mode' :
             key === 'dark_mode' ? '✔ 🌙 Dark Mode' : `✔ ${b.name || key}`);

        // Badge placement calculation: avoid clipping off top or right edges
        const rawBadgeW = Math.min(320, Math.max(70, labelText.length * 8.5 + 16));
        const badgeW = rawBadgeW * badgeScaleX;
        const badgeH = Math.max(16, Math.min(26, 18 * badgeScaleY));

        let badgeX = x;
        if (badgeX + badgeW > 990) {
          badgeX = Math.max(4, 990 - badgeW);
        }

        let badgeY = y > badgeH + 6 ? y - badgeH - 3 : y + h + 4;
        if (badgeY + badgeH > 995) {
          badgeY = Math.max(4, y + 4);
        }

        const textY = badgeY + (badgeH * 0.72);

        return (
          <g key={key} className={`bbox-group bbox-${key}`}>
            {/* Target Area Bounding Box */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={isPassed ? `${strokeColor}18` : 'rgba(239, 68, 68, 0.18)'}
              stroke={strokeColor}
              strokeWidth={isPassed ? "2" : "2.5"}
              strokeDasharray={isPassed ? 'none' : '5,3'}
              vectorEffect="non-scaling-stroke"
            />

            {/* Label Background Pill */}
            <rect
              x={badgeX}
              y={badgeY}
              width={badgeW}
              height={badgeH}
              fill={isPassed ? '#0d1117f2' : '#3b1212f5'}
              rx="4"
              stroke={strokeColor}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* Label Text */}
            <text
              x={badgeX + 6}
              y={textY}
              fill={isPassed ? '#ffffff' : '#fca5a5'}
              fontSize="11"
              fontWeight="700"
              fontFamily="var(--font-mono, monospace)"
              letterSpacing="0.2px"
            >
              {labelText}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const renderBoundingBoxesOverlay = (
  data: AlignmentData,
  options?: { aspectRatio?: number; isPortrait?: boolean }
) => {
  return (
    <BoundingBoxesOverlay
      data={data}
      aspectRatio={options?.aspectRatio}
      isPortrait={options?.isPortrait}
    />
  );
};
