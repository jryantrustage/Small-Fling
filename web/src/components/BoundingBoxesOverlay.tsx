import type { AlignmentData } from '../types';

export const renderBoundingBoxesOverlay = (data: AlignmentData) => {
  if (!data?.boxes) return null;
  const boxes = data.boxes;
  return (
    <svg className="live-bounding-box-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
      {Object.entries(boxes).map(([key, b]) => {
        if (!b?.box_norm) return null;
        const [nx, ny, nw, nh] = b.box_norm;
        const x = nx * 1000;
        const y = ny * 1000;
        const w = nw * 1000;
        const h = nh * 1000;
        const isPassed = b.passed !== false;
        const strokeColor = isPassed ? (b.hex || '#22c55e') : '#ef4444';
        const labelText = !isPassed
          ? `❌ FAIL: ${b.name || key}`
          : (key === 'first_line' ? `✔ Ln ${b.line_number || data.first_line_number || '?'}` :
             key === 'last_line' ? `✔ Ln ${b.line_number || data.last_line_number || '?'}` :
             key === 'file_name' ? `✔ ${b.text || 'Markdown'}` :
             key === 'teams_logo' ? `✔ ${b.text || 'Teams'}` :
             key === 'edit_mode' ? '✔ ✏️ Edit Mode' :
             key === 'dark_mode' ? '✔ 🌙 Dark Mode' : `✔ ${b.name}`);

        const labelY = y > 30 ? y - 6 : y + h + 15;
        const textWidth = Math.min(280, Math.max(60, labelText.length * 8 + 12));
        return (
          <g key={key}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={isPassed ? `${strokeColor}1a` : 'rgba(239, 68, 68, 0.15)'}
              stroke={strokeColor}
              strokeWidth={isPassed ? "2.5" : "3"}
              strokeDasharray={isPassed ? 'none' : '6,3'}
            />
            <rect
              x={x}
              y={labelY - 14}
              width={textWidth}
              height={18}
              fill={isPassed ? '#0d1117ee' : '#3b1212ee'}
              rx="4"
              stroke={strokeColor}
              strokeWidth="1"
            />
            <text
              x={x + 6}
              y={labelY}
              fill={isPassed ? '#ffffff' : '#ffb3ba'}
              fontSize="11"
              fontWeight="700"
              fontFamily="var(--font-mono, monospace)"
            >
              {labelText}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
