import React from 'react';
import { Minus, Maximize2, Minimize2, X, Expand, Shrink } from 'lucide-react';

export interface WindowControlsProps {
  /** Optional human-readable name of the window for accessibility labels and tooltips */
  windowName?: string;

  /** Callback to minimize window (collapse to rail or bottom dock) */
  onMinimize?: () => void;
  isMinimized?: boolean;
  minimizeTitle?: string;

  /** Callback to toggle maximized / restored layout */
  onMaximize?: () => void;
  isMaximized?: boolean;
  maximizeTitle?: string;
  restoreTitle?: string;

  /** Callback to close / dismiss window */
  onClose?: () => void;
  closeTitle?: string;

  /** Optional callback to toggle between compact height/ribbon and standard size */
  onToggleCompact?: () => void;
  isCompact?: boolean;
  compactTitle?: string;
  expandTitle?: string;

  /** Optional custom action buttons rendered prior to standard window management controls */
  children?: React.ReactNode;

  /** Optional custom styling or classes */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Standardized Window Controls Component
 * Provides uniform Minimize, Maximize/Restore, and Close buttons across all application windows.
 */
export const WindowControls: React.FC<WindowControlsProps> = ({
  windowName = 'Window',
  onMinimize,
  isMinimized = false,
  minimizeTitle,
  onMaximize,
  isMaximized = false,
  maximizeTitle,
  restoreTitle,
  onClose,
  closeTitle,
  onToggleCompact,
  isCompact = false,
  compactTitle,
  expandTitle,
  children,
  className = '',
  style
}) => {
  return (
    <div
      className={`window-controls standard-window-controls ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        userSelect: 'none',
        ...style
      }}
    >
      {/* Optional leading custom actions (e.g. refresh, copy, settings) */}
      {children}

      {/* Optional Compact / Expand Height Preset Button */}
      {onToggleCompact && (
        <button
          type="button"
          className={`win-btn win-btn-compact ${isCompact ? 'active' : ''}`}
          onClick={onToggleCompact}
          title={isCompact ? (expandTitle || `Expand ${windowName} Area`) : (compactTitle || `Reduce ${windowName} Area (Compact)`)}
          aria-label={isCompact ? `Expand ${windowName}` : `Compact ${windowName}`}
          style={{ width: '22px', height: '22px' }}
        >
          {isCompact ? <Expand size={11} /> : <Shrink size={11} />}
        </button>
      )}

      {/* Standard Minimize Button */}
      {onMinimize && (
        <button
          type="button"
          className={`win-btn win-btn-minimize ${isMinimized ? 'active' : ''}`}
          onClick={onMinimize}
          title={minimizeTitle || `Minimize ${windowName}`}
          aria-label={`Minimize ${windowName}`}
          style={{ width: '22px', height: '22px' }}
        >
          <Minus size={11} />
        </button>
      )}

      {/* Standard Maximize / Restore Button */}
      {onMaximize && (
        <button
          type="button"
          className={`win-btn win-btn-maximize ${isMaximized ? 'active' : ''}`}
          onClick={onMaximize}
          title={isMaximized ? (restoreTitle || `Restore ${windowName} Size`) : (maximizeTitle || `Maximize ${windowName}`)}
          aria-label={isMaximized ? `Restore ${windowName}` : `Maximize ${windowName}`}
          style={{
            width: '22px',
            height: '22px',
            color: isMaximized ? '#00ff9d' : undefined,
            borderColor: isMaximized ? 'rgba(0, 255, 157, 0.45)' : undefined,
            background: isMaximized ? 'rgba(0, 255, 157, 0.12)' : undefined
          }}
        >
          {isMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
      )}

      {/* Standard Close Button */}
      {onClose && (
        <button
          type="button"
          className="win-btn win-btn-close"
          onClick={onClose}
          title={closeTitle || `Close ${windowName}`}
          aria-label={`Close ${windowName}`}
          style={{ width: '22px', height: '22px' }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
