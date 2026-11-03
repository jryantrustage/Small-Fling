import React, { useState, useEffect, useRef } from 'react';
import { Coins, ArrowDown, RotateCw, MoveVertical, ListTree, Trash2, Image as ImageIcon } from 'lucide-react';

const loadedThumbnailCache = new Set<string>();

export interface FrameItem {
  frame_id: string;
  project_id?: string;
  filename?: string;
  top_line: number;
  bottom_line: number;
  page_index: number;
  status: string;
  extracted_line_count: number;
  custom_offset_y?: number;
  token_usage?: { total_tokens?: number };
  bounding_boxes?: any;
  arrow_count?: number;
  created_at?: string;
}

export interface LazyFrameCardProps {
  frame: FrameItem;
  isSelected: boolean;
  isActive: boolean;
  displayPageNum: number;
  apiBase: string;
  reprocessingFrameId: string | null;
  deletingFrameId: string | null;
  defaultVisible?: boolean;
  isFastScrolling?: boolean;
  compact?: boolean;
  onClick: () => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onToggleSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReprocess: (e: React.MouseEvent) => void;
  onUpdatePosition: (delta: number) => void;
  onOpenTrace: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export const LazyFrameCard: React.FC<LazyFrameCardProps> = React.memo(({
  frame,
  isSelected,
  isActive,
  displayPageNum,
  apiBase,
  reprocessingFrameId,
  deletingFrameId,
  defaultVisible = false,
  isFastScrolling = false,
  compact = false,
  onClick,
  onDoubleClick,
  onToggleSelect,
  onReprocess,
  onUpdatePosition,
  onOpenTrace,
  onDelete,
}) => {
  // Always use JIT WebP thumbnail endpoint in list views; never transmit full-resolution PNGs
  const thumbUrl = `${apiBase}/api/frames/${encodeURIComponent(frame.frame_id)}/thumbnail?w=384&h=216&q=80&fmt=webp`;
  const isAlreadyCached = loadedThumbnailCache.has(thumbUrl);

  const [isVisible, setIsVisible] = useState<boolean>(() => isAlreadyCached || (defaultVisible && !isFastScrolling));
  const [imgError, setImgError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compact) return;
    if (loadedThumbnailCache.has(thumbUrl)) {
      setIsVisible(true);
      return;
    }
    if (defaultVisible) {
      if (!isFastScrolling) {
        setIsVisible(true);
        return;
      }
      // Defer image network request during high-velocity scrollbar scrubbing so intermediate frames don't flood HTTP pool
      const timer = window.setTimeout(() => {
        setIsVisible(true);
      }, 75);
      return () => window.clearTimeout(timer);
    }

    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          } else {
            setIsVisible(false);
          }
        });
      },
      {
        rootMargin: '500px 0px 500px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [defaultVisible, isFastScrolling, compact, thumbUrl]);

  if (compact) {
    return (
      <div
        ref={cardRef}
        id={`frame-card-${frame.frame_id}`}
        className={`frame-card frame-card-compact ${isActive ? 'active' : ''}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        style={{
          cursor: 'pointer',
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          height: '48px',
          minHeight: '48px',
        }}
        title="Click to select & view frame • Double-click to inspect in OCR Inspector"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '13px', height: '13px', accentColor: '#1f6feb', cursor: 'pointer', flexShrink: 0 }}
            title="Select frame"
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '4px',
              background: isActive ? 'rgba(0, 255, 157, 0.18)' : 'rgba(255, 255, 255, 0.06)',
              color: isActive ? '#00ff9d' : '#f0f6fc',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              flexShrink: 0,
            }}
          >
            Pg {displayPageNum}
          </span>
          <span
            className="frame-lines-badge"
            style={{ fontSize: '10.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            Ln {frame.top_line}→{frame.bottom_line}
          </span>
          <span
            className={`frame-status-dot ${
              frame.status === 'processed' ? 'processed' : frame.status === 'queued' ? 'queued' : 'error'
            }`}
            style={{ margin: 0, flexShrink: 0 }}
          />
          <span style={{ fontSize: '9.5px', color: '#8b949e', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            {frame.extracted_line_count > 0 ? `${frame.extracted_line_count}ln` : frame.status}
          </span>
        </div>

        <div className="frame-card-actions-group" style={{ marginTop: 0, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="frame-card-action-btn frame-card-trace-btn"
            onClick={onOpenTrace}
            title="View frame trace"
            style={{ width: '20px', height: '20px' }}
          >
            <ListTree size={11} />
          </button>
          <button
            type="button"
            className="frame-card-action-btn frame-card-delete-btn"
            onClick={onDelete}
            disabled={deletingFrameId === frame.frame_id}
            title="Delete frame"
            style={{ width: '20px', height: '20px' }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      id={`frame-card-${frame.frame_id}`}
      className={`frame-card ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        cursor: 'pointer',
        borderColor: isActive ? '#00ff9d' : undefined,
        borderWidth: isActive ? '2px' : undefined,
        boxShadow: isActive ? '0 0 14px rgba(0, 255, 157, 0.35)' : undefined,
        background: isActive ? 'rgba(0, 255, 157, 0.08)' : undefined,
      }}
      title="Click to select & view frame in active tab • Double-click to inspect in OCR Inspector"
    >
      <div className="frame-card-preview">
        <input
          type="checkbox"
          className="frame-card-checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          title="Select frame for group operations"
        />

        {isVisible && !imgError ? (
          <img
            key={`thumb_${frame.frame_id}`}
            src={thumbUrl}
            alt={frame.frame_id}
            width={384}
            height={216}
            loading="lazy"
            decoding="async"
            onLoad={() => {
              loadedThumbnailCache.add(thumbUrl);
            }}
            onError={() => {
              setImgError(true);
            }}
          />
        ) : (
          <div className="frame-card-placeholder">
            <div className="placeholder-shimmer">
              <ImageIcon size={14} color="#30363d" />
            </div>
            <span style={{ fontSize: '9px', color: '#484f58', fontFamily: 'monospace' }}>
              Pg {displayPageNum} • Ln {frame.top_line}→{frame.bottom_line}
            </span>
          </div>
        )}

        <span
          className="frame-badge"
          style={
            isActive
              ? {
                  background: '#00ff9d',
                  color: '#090d13',
                  fontWeight: 900,
                  border: '1px solid #00ff9d',
                  boxShadow: '0 0 10px rgba(0, 255, 157, 0.6)',
                }
              : undefined
          }
        >
          {isActive ? `✓ Pg ${displayPageNum} • SELECTED` : `Pg ${displayPageNum}`}
        </span>
        {frame.token_usage && frame.token_usage.total_tokens ? (
          <span className="frame-token-badge">
            <Coins size={9} /> {frame.token_usage.total_tokens}
          </span>
        ) : null}
      </div>

      <div className="frame-card-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span className="frame-lines-badge">
            Ln {frame.top_line} → {frame.bottom_line}
          </span>
          {displayPageNum > 1 && (
            <span
              className="frame-arrows-badge"
              style={{
                fontSize: '10px',
                color: '#00ff9d',
                background: 'rgba(0, 255, 157, 0.12)',
                border: '1px solid rgba(0, 255, 157, 0.25)',
                padding: '1px 5px',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                fontWeight: 600,
              }}
              title={`${frame.arrow_count ?? 0} down-arrow key presses to reach page`}
            >
              <ArrowDown size={10} color="#00ff9d" /> {frame.arrow_count ?? 0}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            className={`frame-status-dot ${
              frame.status === 'processed'
                ? 'processed'
                : frame.status === 'queued'
                ? 'queued'
                : 'error'
            }`}
          />
          <span className="frame-status-text" title={frame.status}>
            {frame.extracted_line_count > 0
              ? `${frame.extracted_line_count} ln`
              : frame.status.startsWith('error')
              ? 'Error'
              : frame.status}
          </span>
          {(frame.status.startsWith('error') ||
            (frame.status !== 'queued' && frame.extracted_line_count === 0)) && (
            <button
              className="frame-retry-btn"
              onClick={onReprocess}
              disabled={reprocessingFrameId === frame.frame_id || frame.status === 'queued'}
            >
              <RotateCw
                size={11}
                className={reprocessingFrameId === frame.frame_id ? 'spinning' : ''}
              />
            </button>
          )}
        </div>

        <div className="frame-card-actions-group" onClick={(e) => e.stopPropagation()}>
          <div className="frame-position-controls" style={{ margin: 0 }} title="Nudge offset (px)">
            <MoveVertical size={10} color="#8b949e" />
            <button className="nudge-btn" onClick={() => onUpdatePosition(-1)}>
              ▲
            </button>
            <span className="nudge-val">{frame.custom_offset_y || 0}px</span>
            <button className="nudge-btn" onClick={() => onUpdatePosition(1)}>
              ▼
            </button>
          </div>
          <button
            type="button"
            id={`frame-trace-btn-${frame.frame_id.slice(0, 8)}`}
            className="frame-card-action-btn frame-card-trace-btn"
            onClick={onOpenTrace}
            title="View detailed event trace (key presses, DAG events) for this capture"
          >
            <ListTree size={12} />
          </button>
          <button
            type="button"
            className="frame-card-action-btn frame-card-delete-btn"
            onClick={onDelete}
            disabled={deletingFrameId === frame.frame_id}
            title="Delete frame"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
});
LazyFrameCard.displayName = 'LazyFrameCard';
