import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { LazyFrameCard, type FrameItem } from './frames/LazyFrameCard';

export interface VirtualizedFrameStripProps {
  frames: FrameItem[];
  totalLines?: number;
  selectedFrameId: string | null;
  selectedFrameIds: Set<string>;
  apiBase: string;
  devDisplayName?: string;
  reprocessingFrameId: string | null;
  deletingFrameId: string | null;
  rowHeight?: number;
  overscan?: number;
  onSelectFrame: (frame: FrameItem) => void;
  onDoubleClickFrame: (frame: FrameItem, e: React.MouseEvent) => void;
  onToggleSelectFrame: (frameId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onReprocessFrame: (frameId: string, e: React.MouseEvent) => void;
  onUpdateFramePosition: (frameId: string, delta: number) => void;
  onOpenTrace: (frameId: string, e: React.MouseEvent) => void;
  onDeleteFrame: (frameId: string, e: React.MouseEvent) => void;
}

export const VirtualizedFrameStrip: React.FC<VirtualizedFrameStripProps> = ({
  frames,
  totalLines = 0,
  selectedFrameId,
  selectedFrameIds,
  apiBase,
  devDisplayName = 'DEVICE',
  reprocessingFrameId,
  deletingFrameId,
  rowHeight = 206,
  overscan = 15,
  onSelectFrame,
  onDoubleClickFrame,
  onToggleSelectFrame,
  onReprocessFrame,
  onUpdateFramePosition,
  onOpenTrace,
  onDeleteFrame,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [isFastScrolling, setIsFastScrolling] = useState(false);
  const [isThumbDragging, setIsThumbDragging] = useState(false);
  const scrollHideTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const totalCount = frames.length;
  const hasPage1InSet = useMemo(() => frames.some((sf) => sf.page_index === 1), [frames]);

  // Measure viewport height with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Track mouse release after scrollbar thumb drag
  useEffect(() => {
    if (!isThumbDragging) return;
    const handleWindowUp = () => {
      setIsThumbDragging(false);
      if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
      scrollHideTimerRef.current = window.setTimeout(() => {
        setIsFastScrolling(false);
      }, 450);
    };
    window.addEventListener('mouseup', handleWindowUp);
    return () => window.removeEventListener('mouseup', handleWindowUp);
  }, [isThumbDragging]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const nextTop = e.currentTarget.scrollTop;
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      setScrollTop(nextTop);
    });
    setIsFastScrolling(true);
    if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
    scrollHideTimerRef.current = window.setTimeout(() => {
      if (!isThumbDragging) {
        setIsFastScrolling(false);
      }
    }, 650);
  }, [isThumbDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Detect click on the 14px vertical scrollbar track/thumb along the right edge
    if (e.clientX >= rect.right - 18) {
      setIsThumbDragging(true);
      setIsFastScrolling(true);
    }
  }, []);

  // Windowed virtual scroller indices (overscan = 15)
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    totalCount - 1,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );

  const visibleSlice = useMemo(() => {
    if (totalCount === 0 || endIndex < startIndex) return [];
    const items: Array<{ frame: FrameItem; index: number }> = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const f = frames[i];
      if (f) items.push({ frame: f, index: i });
    }
    return items;
  }, [frames, totalCount, startIndex, endIndex]);

  // Compute current indicator frame & line for floating badge
  const indicatorInfo = useMemo(() => {
    if (totalCount === 0) {
      return { pageNum: 1, lineNum: 1, totalLinesCount: totalLines || 0, ratio: 0 };
    }
    const maxScroll = Math.max(1, totalCount * rowHeight - viewportHeight);
    const ratio = Math.max(0, Math.min(1, scrollTop / maxScroll));
    const focusIdx = Math.min(
      totalCount - 1,
      Math.max(0, Math.floor((scrollTop + viewportHeight * 0.35) / rowHeight))
    );
    const currentFrame = frames[focusIdx] || frames[0];
    const isVeryFirst = focusIdx === 0;
    const pageNum =
      isVeryFirst && (!currentFrame?.page_index || currentFrame.page_index > 1) && !hasPage1InSet
        ? 1
        : currentFrame?.page_index || focusIdx + 1;
    const lineNum = currentFrame?.top_line || 1;
    const lastFrame = frames[totalCount - 1];
    const effectiveTotalLines = Math.max(
      totalLines || 0,
      lastFrame?.bottom_line || 0,
      lineNum
    );
    return {
      pageNum,
      lineNum,
      totalLinesCount: effectiveTotalLines,
      ratio,
    };
  }, [frames, totalCount, rowHeight, scrollTop, viewportHeight, totalLines, hasPage1InSet]);

  const totalVirtualHeight = Math.max(viewportHeight, totalCount * rowHeight);
  const badgeTopPx = Math.max(
    12,
    Math.min(viewportHeight - 44, Math.round(indicatorInfo.ratio * (viewportHeight - 56)) + 12)
  );

  return (
    <div
      className="virtualized-strip-wrapper"
      style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div
        ref={containerRef}
        className="frames-list virtualized-frame-strip pane-scrollable-with-buffer"
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        data-testid="virtualized-frame-strip"
      >
        {totalCount === 0 ? (
          <div className="drop-zone-placeholder" style={{ cursor: 'default' }}>
            <span style={{ fontWeight: 600, color: '#e6edf3' }}>Captured Frames</span>
            <span style={{ fontSize: '11px', color: '#8b949e' }}>
              Settled {devDisplayName} frames appear here automatically
            </span>
          </div>
        ) : (
          <div
            className="virtualized-frame-inner"
            style={{
              position: 'relative',
              width: '100%',
              height: `${totalVirtualHeight}px`,
            }}
          >
            {visibleSlice.map(({ frame: f, index: idx }) => {
              const prevFrame = idx > 0 ? frames[idx - 1] : null;
              const hasGap =
                prevFrame &&
                prevFrame.bottom_line > 0 &&
                f.top_line > prevFrame.bottom_line + 1;
              const isSelected = selectedFrameIds.has(f.frame_id);
              const isVeryFirstFrame = idx === 0;
              const displayPageNum =
                isVeryFirstFrame && (!f.page_index || f.page_index > 1) && !hasPage1InSet
                  ? 1
                  : f.page_index || idx + 1;

              return (
                <div
                  key={f.frame_id}
                  className="virtualized-frame-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${rowHeight}px`,
                    transform: `translateY(${idx * rowHeight}px)`,
                    paddingBottom: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    gap: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  {hasGap && prevFrame && (
                    <div className="gap-alert-tag" style={{ padding: '1px 6px', fontSize: '9.5px' }}>
                      <AlertCircle size={10} />
                      <span>
                        Gap: missing Ln {prevFrame.bottom_line + 1} → {f.top_line - 1}
                      </span>
                    </div>
                  )}
                  <LazyFrameCard
                    frame={f}
                    isSelected={isSelected}
                    isActive={selectedFrameId === f.frame_id}
                    displayPageNum={displayPageNum}
                    apiBase={apiBase}
                    reprocessingFrameId={reprocessingFrameId}
                    deletingFrameId={deletingFrameId}
                    defaultVisible={true}
                    onClick={() => onSelectFrame(f)}
                    onDoubleClick={(e) => onDoubleClickFrame(f, e)}
                    onToggleSelect={(e) => onToggleSelectFrame(f.frame_id, e)}
                    onReprocess={(e) => onReprocessFrame(f.frame_id, e)}
                    onUpdatePosition={(delta) => onUpdateFramePosition(f.frame_id, delta)}
                    onOpenTrace={(e) => onOpenTrace(f.frame_id, e)}
                    onDelete={(e) => onDeleteFrame(f.frame_id, e)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fast-scroll floating indicator badge */}
      {totalCount > 0 && (isFastScrolling || isThumbDragging) && (
        <div
          className={`fast-scroll-indicator-badge ${isThumbDragging ? 'thumb-dragging' : ''}`}
          style={{ top: `${badgeTopPx}px` }}
          data-testid="frame-strip-scroll-badge"
        >
          <span className="fast-scroll-badge-dot" />
          <span>
            Page {indicatorInfo.pageNum} • Line {indicatorInfo.lineNum} / {indicatorInfo.totalLinesCount}
          </span>
        </div>
      )}
    </div>
  );
};

export default VirtualizedFrameStrip;

