import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, ChevronsUp, ChevronsDown, List, LayoutGrid, CornerDownLeft } from 'lucide-react';
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

// Cap virtual scroll container height well below Chromium's ~16.7M px layout limit
const MAX_VIRTUAL_SCROLL_HEIGHT_PX = 12_000_000;
const COMPACT_ROW_HEIGHT = 54;

// Persist scroll position & density mode across sidebar minimize/close/re-open cycles
let persistedFrameStripScrollTop = 0;
let persistedFrameStripCompact = false;
let persistedLastScrolledFrameId: string | null = null;

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
  overscan = 10,
  onSelectFrame,
  onDoubleClickFrame,
  onToggleSelectFrame,
  onReprocessFrame,
  onUpdateFramePosition,
  onOpenTrace,
  onDeleteFrame,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState<number>(() => persistedFrameStripScrollTop);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [isFastScrolling, setIsFastScrolling] = useState(false);
  const [isThumbDragging, setIsThumbDragging] = useState(false);
  const [isCompactMode, setIsCompactMode] = useState<boolean>(() => persistedFrameStripCompact);
  const [jumpInput, setJumpInput] = useState('');

  const scrollHideTimerRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const lastScrollTopRef = useRef<number>(persistedFrameStripScrollTop);
  const didRestoreMountScrollRef = useRef<boolean>(false);

  const totalCount = frames.length;
  const activeRowHeight = isCompactMode ? COMPACT_ROW_HEIGHT : rowHeight;

  const hasPage1InSet = useMemo(() => frames.some((sf) => sf.page_index === 1), [frames]);

  // Compute virtual height & scaling factor so even 50,000+ frames map 0..100% across a single scrollbar drag
  const rawTotalHeight = totalCount * activeRowHeight;
  const totalVirtualHeight = Math.max(
    viewportHeight,
    Math.min(MAX_VIRTUAL_SCROLL_HEIGHT_PX, rawTotalHeight)
  );
  const maxRawScroll = Math.max(1, rawTotalHeight - viewportHeight);
  const maxVirtualScroll = Math.max(1, totalVirtualHeight - viewportHeight);
  const scrollScale = rawTotalHeight > MAX_VIRTUAL_SCROLL_HEIGHT_PX ? maxRawScroll / maxVirtualScroll : 1;

  // Logical (unscaled) scroll offset in row coordinates
  const logicalScrollTop = scrollTop * scrollScale;

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
      }, 220);
    };
    window.addEventListener('mouseup', handleWindowUp);
    return () => window.removeEventListener('mouseup', handleWindowUp);
  }, [isThumbDragging]);

  const scrollToFrameIndex = useCallback(
    (targetIdx: number, markFast = false) => {
      const el = containerRef.current;
      if (!el || totalCount === 0) return;
      const clampedIdx = Math.max(0, Math.min(totalCount - 1, targetIdx));
      const targetLogicalTop = clampedIdx * activeRowHeight;
      const targetPhysicalTop = scrollScale > 1 ? targetLogicalTop / scrollScale : targetLogicalTop;
      if (markFast) {
        setIsFastScrolling(true);
        if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
        scrollHideTimerRef.current = window.setTimeout(() => {
          setIsFastScrolling(false);
        }, 260);
      }
      el.scrollTop = targetPhysicalTop;
      setScrollTop(targetPhysicalTop);
      persistedFrameStripScrollTop = targetPhysicalTop;
    },
    [totalCount, activeRowHeight, scrollScale]
  );

  // Selected frame lookup for persistent restoration & header badge
  const selectedFrameInfo = useMemo(() => {
    if (!selectedFrameId || totalCount === 0) return null;
    const idx = frames.findIndex((f) => f.frame_id === selectedFrameId);
    if (idx < 0) return null;
    const f = frames[idx];
    const isVeryFirst = idx === 0;
    const pageNum =
      isVeryFirst && (!f?.page_index || f.page_index > 1) && !hasPage1InSet
        ? 1
        : f?.page_index || idx + 1;
    return {
      index: idx,
      frame: f,
      pageNum,
    };
  }, [selectedFrameId, frames, totalCount, hasPage1InSet]);

  // Restore scroll position & ensure the selected frame is visible when the Captured Frames sidebar is opened or selection changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el || totalCount === 0) return;

    const currentVpHeight = el.clientHeight > 0 ? el.clientHeight : viewportHeight;

    // 1. On initial mount (when Captured Frames sidebar is opened), restore saved scrollTop or center the selected frame
    if (!didRestoreMountScrollRef.current) {
      didRestoreMountScrollRef.current = true;
      if (selectedFrameInfo) {
        const selLogicalTop = selectedFrameInfo.index * activeRowHeight;
        const savedLogicalTop = persistedFrameStripScrollTop * scrollScale;
        const isSelectedInSavedView =
          persistedFrameStripScrollTop > 0 &&
          selLogicalTop >= savedLogicalTop - activeRowHeight * 0.5 &&
          selLogicalTop + activeRowHeight <= savedLogicalTop + currentVpHeight + activeRowHeight * 0.5;

        if (isSelectedInSavedView) {
          el.scrollTop = persistedFrameStripScrollTop;
          setScrollTop(persistedFrameStripScrollTop);
        } else {
          const centeredLogicalTop = Math.max(
            0,
            selLogicalTop - Math.max(0, (currentVpHeight - activeRowHeight) * 0.35)
          );
          const targetPhysicalTop = scrollScale > 1 ? centeredLogicalTop / scrollScale : centeredLogicalTop;
          el.scrollTop = targetPhysicalTop;
          setScrollTop(targetPhysicalTop);
          persistedFrameStripScrollTop = targetPhysicalTop;
        }
        persistedLastScrolledFrameId = selectedFrameId;
        return;
      }

      if (persistedFrameStripScrollTop > 0) {
        el.scrollTop = persistedFrameStripScrollTop;
        setScrollTop(persistedFrameStripScrollTop);
      }
      return;
    }

    // 2. When selectedFrameId changes while the sidebar is open, keep it in view if outside current viewport
    if (selectedFrameInfo && selectedFrameId !== persistedLastScrolledFrameId && !isThumbDragging) {
      persistedLastScrolledFrameId = selectedFrameId;
      const selLogicalTop = selectedFrameInfo.index * activeRowHeight;
      const currentLogicalTop = el.scrollTop * scrollScale;
      const isVisibleNow =
        selLogicalTop >= currentLogicalTop &&
        selLogicalTop + activeRowHeight <= currentLogicalTop + currentVpHeight;

      if (!isVisibleNow) {
        const centeredLogicalTop = Math.max(
          0,
          selLogicalTop - Math.max(0, (currentVpHeight - activeRowHeight) * 0.35)
        );
        const targetPhysicalTop = scrollScale > 1 ? centeredLogicalTop / scrollScale : centeredLogicalTop;
        el.scrollTop = targetPhysicalTop;
        setScrollTop(targetPhysicalTop);
        persistedFrameStripScrollTop = targetPhysicalTop;
      }
    }
  }, [
    totalCount,
    selectedFrameId,
    selectedFrameInfo,
    activeRowHeight,
    scrollScale,
    viewportHeight,
    isThumbDragging,
  ]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const nextTop = e.currentTarget.scrollTop;
      const now = performance.now();
      const dt = Math.max(1, now - lastScrollTimeRef.current);
      const dy = Math.abs(nextTop - lastScrollTopRef.current);
      const velocityPxPerMs = dy / dt;

      lastScrollTimeRef.current = now;
      lastScrollTopRef.current = nextTop;

      setScrollTop(nextTop);
      persistedFrameStripScrollTop = nextTop;

      // Mark as fast scrolling when velocity > 1.8px/ms or thumb is being dragged
      if (velocityPxPerMs > 1.8 || isThumbDragging) {
        setIsFastScrolling(true);
      }
      if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
      scrollHideTimerRef.current = window.setTimeout(() => {
        if (!isThumbDragging) {
          setIsFastScrolling(false);
        }
      }, 220);
    },
    [isThumbDragging]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Detect click on the 14px vertical scrollbar track/thumb along the right edge
    if (e.clientX >= rect.right - 20) {
      setIsThumbDragging(true);
      setIsFastScrolling(true);
    }
  }, []);

  // Shift+Wheel or Alt+Wheel accelerates scrolling by 12x for rapid traversal of 10,000+ pages
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.shiftKey || e.altKey) {
        const el = containerRef.current;
        if (!el) return;
        e.preventDefault();
        const multiplier = e.altKey && e.shiftKey ? 30 : 12;
        const nextTop = Math.max(
          0,
          Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + e.deltaY * multiplier)
        );
        el.scrollTop = nextTop;
        setScrollTop(nextTop);
        setIsFastScrolling(true);
        if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
        scrollHideTimerRef.current = window.setTimeout(() => {
          setIsFastScrolling(false);
        }, 250);
      }
    },
    []
  );

  // Windowed virtual scroller indices
  const effectiveOverscan = isFastScrolling || isThumbDragging ? 4 : overscan;
  const startIndex = Math.max(0, Math.floor(logicalScrollTop / activeRowHeight) - effectiveOverscan);
  const endIndex = Math.min(
    totalCount - 1,
    Math.ceil((logicalScrollTop + viewportHeight) / activeRowHeight) + effectiveOverscan
  );

  // Offset applied so items in visibleSlice always align with the physical scroll position
  const sliceAnchorOffsetPx = scrollTop - logicalScrollTop;

  const visibleSlice = useMemo(() => {
    if (totalCount === 0 || endIndex < startIndex) return [];
    const items: Array<{ frame: FrameItem; index: number }> = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const f = frames[i];
      if (f) items.push({ frame: f, index: i });
    }
    return items;
  }, [frames, totalCount, startIndex, endIndex]);

  // Compute current indicator frame & line for floating badge and scrubber bar
  const indicatorInfo = useMemo(() => {
    if (totalCount === 0) {
      return { focusIdx: 0, pageNum: 1, lineNum: 1, totalLinesCount: totalLines || 0, ratio: 0 };
    }
    const ratio = Math.max(0, Math.min(1, scrollTop / maxVirtualScroll));
    const focusIdx = Math.min(
      totalCount - 1,
      Math.max(0, Math.floor((logicalScrollTop + viewportHeight * 0.25) / activeRowHeight))
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
      focusIdx,
      pageNum,
      lineNum,
      totalLinesCount: effectiveTotalLines,
      ratio,
    };
  }, [
    frames,
    totalCount,
    activeRowHeight,
    scrollTop,
    logicalScrollTop,
    maxVirtualScroll,
    viewportHeight,
    totalLines,
    hasPage1InSet,
  ]);

  // Handle direct Page# or Line# (e.g. "100" or "L5000") jump
  const handleJumpSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const raw = jumpInput.trim();
      if (!raw || totalCount === 0) return;

      const isLineQuery = /^l(n|ine)?\s*\d+/i.test(raw);
      const numericVal = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      if (isNaN(numericVal) || numericVal <= 0) return;

      let targetIdx = -1;
      if (isLineQuery) {
        // Find frame covering this line number
        targetIdx = frames.findIndex(
          (f) => f.top_line <= numericVal && f.bottom_line >= numericVal
        );
        if (targetIdx === -1) {
          targetIdx = frames.findIndex((f) => f.top_line >= numericVal);
        }
      } else {
        // Try matching by page_index first
        targetIdx = frames.findIndex((f) => f.page_index === numericVal);
        if (targetIdx === -1) {
          if (numericVal <= totalCount) {
            targetIdx = numericVal - 1;
          } else {
            // Fallback: user typed a line number larger than page count
            targetIdx = frames.findIndex(
              (f) => f.top_line <= numericVal && f.bottom_line >= numericVal
            );
          }
        }
      }

      if (targetIdx < 0) targetIdx = totalCount - 1;
      scrollToFrameIndex(targetIdx, false);
      const targetFrame = frames[targetIdx];
      if (targetFrame) {
        onSelectFrame(targetFrame);
      }
      setJumpInput('');
    },
    [jumpInput, totalCount, frames, scrollToFrameIndex, onSelectFrame]
  );

  // Toggle between Thumbnail mode (206px) and Compact mode (54px) while keeping the same focused frame in view
  const handleToggleCompactMode = useCallback(() => {
    const currentIdx = selectedFrameInfo ? selectedFrameInfo.index : indicatorInfo.focusIdx;
    const nextCompact = !isCompactMode;
    setIsCompactMode(nextCompact);
    persistedFrameStripCompact = nextCompact;
    window.requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      const nextRowH = nextCompact ? COMPACT_ROW_HEIGHT : rowHeight;
      const nextRawTotal = totalCount * nextRowH;
      const nextVirtTotal = Math.max(viewportHeight, Math.min(MAX_VIRTUAL_SCROLL_HEIGHT_PX, nextRawTotal));
      const nextScale =
        nextRawTotal > MAX_VIRTUAL_SCROLL_HEIGHT_PX
          ? Math.max(1, nextRawTotal - viewportHeight) / Math.max(1, nextVirtTotal - viewportHeight)
          : 1;
      const nextTop = (currentIdx * nextRowH) / nextScale;
      el.scrollTop = nextTop;
      setScrollTop(nextTop);
      persistedFrameStripScrollTop = nextTop;
    });
  }, [selectedFrameInfo, indicatorInfo.focusIdx, isCompactMode, rowHeight, totalCount, viewportHeight]);

  const badgeTopPx = Math.max(
    64,
    Math.min(viewportHeight - 44, Math.round(indicatorInfo.ratio * (viewportHeight - 96)) + 64)
  );

  return (
    <div
      className="virtualized-strip-wrapper"
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Fast Page Scrubber, Step Controls, Direct Jump & Compact Density Bar */}
      {totalCount > 0 && (
        <div className="frame-strip-scrubber-bar" data-testid="frame-strip-scrubber-bar">
          <div className="frame-strip-scrubber-row">
            <button
              type="button"
              className="scrubber-step-btn"
              title="Jump to Page 1 (Top)"
              onClick={() => scrollToFrameIndex(0, false)}
            >
              <ChevronsUp size={11} />
              <span>1</span>
            </button>
            <button
              type="button"
              className="scrubber-step-btn"
              title="Back 100 Pages"
              onClick={() => scrollToFrameIndex(indicatorInfo.focusIdx - 100, true)}
            >
              -100
            </button>
            <input
              type="range"
              className="frame-strip-range-slider"
              min={0}
              max={Math.max(0, totalCount - 1)}
              value={indicatorInfo.focusIdx}
              title={`Scrub Pages 1 .. ${totalCount} (Current: Page ${indicatorInfo.pageNum}, Line ${indicatorInfo.lineNum})`}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                if (!isNaN(idx)) {
                  scrollToFrameIndex(idx, true);
                }
              }}
            />
            <button
              type="button"
              className="scrubber-step-btn"
              title="Forward 100 Pages"
              onClick={() => scrollToFrameIndex(indicatorInfo.focusIdx + 100, true)}
            >
              +100
            </button>
            <button
              type="button"
              className="scrubber-step-btn"
              title={`Jump to Last Page (${totalCount})`}
              onClick={() => scrollToFrameIndex(totalCount - 1, false)}
            >
              <span>{totalCount}</span>
              <ChevronsDown size={11} />
            </button>
          </div>

          <div className="frame-strip-jump-row">
            <span
              className="scrubber-position-readout"
              title="Hold Shift+Wheel or Alt+Wheel for 12x turbo scroll"
            >
              Pg <strong>{indicatorInfo.pageNum}</strong>/{totalCount} • Ln{' '}
              <strong>{indicatorInfo.lineNum}</strong>
            </span>

            <form className="scrubber-jump-form" onSubmit={handleJumpSubmit}>
              <input
                type="text"
                className="scrubber-jump-input"
                placeholder="Pg# or L#"
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                title="Enter a Page number (e.g. 100) or Line number (e.g. L5000) and press Enter"
                data-testid="frame-strip-jump-input"
              />
              <button
                type="submit"
                className="scrubber-jump-go-btn"
                title="Jump to Page or Line"
              >
                <CornerDownLeft size={10} />
              </button>
            </form>

            <button
              type="button"
              className={`scrubber-density-btn ${isCompactMode ? 'active' : ''}`}
              onClick={handleToggleCompactMode}
              title={
                isCompactMode
                  ? 'Switch to Thumbnail Cards (206px)'
                  : 'Switch to Compact List Mode (54px — 3.8x faster scrolling)'
              }
              data-testid="frame-strip-density-toggle"
            >
              {isCompactMode ? <LayoutGrid size={11} /> : <List size={11} />}
              <span>{isCompactMode ? 'Thumb' : 'Compact'}</span>
            </button>
          </div>

          {selectedFrameInfo && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                marginTop: '3px',
                padding: '3px 7px',
                borderRadius: '5px',
                background: 'rgba(0, 255, 157, 0.12)',
                border: '1px solid rgba(0, 255, 157, 0.4)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono, monospace)',
                color: '#00ff9d',
                cursor: 'pointer',
              }}
              onClick={() => {
                const el = containerRef.current;
                const vpH = el && el.clientHeight > 0 ? el.clientHeight : viewportHeight;
                const centeredIdx = Math.max(
                  0,
                  selectedFrameInfo.index - Math.floor(vpH / activeRowHeight / 3)
                );
                scrollToFrameIndex(centeredIdx, false);
              }}
              title="Click to center the currently selected frame in the Captured Frames list"
              data-testid="selected-frame-status-pill"
            >
              <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ✓ Selected: Pg {selectedFrameInfo.pageNum}/{totalCount} • Ln {selectedFrameInfo.frame.top_line}→{selectedFrameInfo.frame.bottom_line}
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: 'rgba(0, 255, 157, 0.2)',
                  color: '#f0f6fc',
                  flexShrink: 0,
                }}
              >
                Center ⌖
              </span>
            </div>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        className="frames-list virtualized-frame-strip pane-scrollable-with-buffer"
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
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
              minHeight: `${totalVirtualHeight}px`,
              flexShrink: 0,
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

              const itemTopPx = Math.round(idx * activeRowHeight + sliceAnchorOffsetPx);

              return (
                <div
                  key={f.frame_id}
                  className="virtualized-frame-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${activeRowHeight}px`,
                    transform: `translateY(${itemTopPx}px)`,
                    paddingBottom: isCompactMode ? '4px' : '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    gap: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  {!isCompactMode && hasGap && prevFrame && (
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
                    isFastScrolling={isFastScrolling || isThumbDragging}
                    compact={isCompactMode}
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
            Page {indicatorInfo.pageNum} / {totalCount} • Line {indicatorInfo.lineNum} /{' '}
            {indicatorInfo.totalLinesCount}
          </span>
        </div>
      )}
    </div>
  );
};

export default VirtualizedFrameStrip;
