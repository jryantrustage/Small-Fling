import React, { useState, useEffect, useRef } from 'react';
import { Coins, ArrowDown, RotateCw, MoveVertical, ListTree, Trash2, Image as ImageIcon } from 'lucide-react';

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
  onClick: () => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onToggleSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReprocess: (e: React.MouseEvent) => void;
  onUpdatePosition: (delta: number) => void;
  onOpenTrace: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export const LazyFrameCard: React.FC<LazyFrameCardProps> = ({
  frame,
  isSelected,
  isActive,
  displayPageNum,
  apiBase,
  reprocessingFrameId,
  deletingFrameId,
  onClick,
  onDoubleClick,
  onToggleSelect,
  onReprocess,
  onUpdatePosition,
  onOpenTrace,
  onDelete,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [imgError, setImgError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          } else {
            // Unload image when scrolled far out of view to keep memory minimal
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
  }, []);

  const thumbUrl = imgError
    ? `${apiBase}/api/frames/${frame.frame_id}/image?t=${encodeURIComponent(frame.created_at || '')}`
    : `${apiBase}/api/frames/${frame.frame_id}/thumbnail`;

  return (
    <div
      ref={cardRef}
      id={`frame-card-${frame.frame_id}`}
      className={`frame-card ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ cursor: 'pointer' }}
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

        {isVisible ? (
          <img
            key={`thumb_${frame.frame_id}`}
            src={thumbUrl}
            alt={frame.frame_id}
            loading="lazy"
            decoding="async"
            onError={() => {
              if (!imgError) setImgError(true);
            }}
          />
        ) : (
          <div className="frame-card-placeholder">
            <div className="placeholder-shimmer">
              <ImageIcon size={14} color="#30363d" />
            </div>
            <span style={{ fontSize: '9px', color: '#484f58', fontFamily: 'monospace' }}>
              Pg {displayPageNum}
            </span>
          </div>
        )}

        <span className="frame-badge">Pg {displayPageNum}</span>
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
};
