import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import type { LineData, FrameData } from '../types';

export interface VirtualizedLineViewerProps {
  apiBase: string;
  projectId?: string;
  totalLines: number;
  minLine: number;
  maxLine: number;
  initialLines: LineData[];
  frames?: FrameData[];
  selectedLine: LineData | null;
  selectedLineNumbers: Set<number>;
  filterMode: 'all' | 'issues';
  searchQuery: string;
  followCurrentProcess?: boolean;
  currentProcessTopLine?: number;
  isTelemetryExpanded?: boolean;
  rowHeight?: number;
  overscan?: number;
  onSelectLine: (line: LineData) => void;
  onToggleSelectLine: (lineNumber: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleSelectAllLines: () => void;
  onVisibleRangeChange?: (fromLine: number, toLine: number, isLoading: boolean) => void;
  onLinesLoaded?: (lines: LineData[], meta: { total_lines?: number; min_line?: number; max_line?: number }) => void;
  scrollToLineRef?: React.MutableRefObject<((lineNumber: number) => void) | null>;
}

const SLIDING_CACHE_MAX_LINES = 6000;
const FETCH_DEBOUNCE_MS = 65;
const PREFETCH_SPAN = 60;

export const VirtualizedLineViewer: React.FC<VirtualizedLineViewerProps> = ({
  apiBase,
  projectId,
  totalLines,
  minLine,
  maxLine,
  initialLines,
  frames = [],
  selectedLine,
  selectedLineNumbers,
  filterMode,
  searchQuery,
  followCurrentProcess = false,
  currentProcessTopLine = 0,
  isTelemetryExpanded = false,
  rowHeight = 28,
  overscan = 15,
  onSelectLine,
  onToggleSelectLine,
  onToggleSelectAllLines,
  onVisibleRangeChange,
  onLinesLoaded,
  scrollToLineRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [isLoadingWindow, setIsLoadingWindow] = useState(false);
  const [isFastScrolling, setIsFastScrolling] = useState(false);
  const [isThumbDragging, setIsThumbDragging] = useState(false);
  const [discoveredMaxLine, setDiscoveredMaxLine] = useState(0);
  const [discoveredTotalLines, setDiscoveredTotalLines] = useState(0);

  // Sliding-window line cache keyed by line_number
  const lineCacheRef = useRef<Map<number, LineData>>(new Map());
  const inFlightRangesRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<number | null>(null);
  const scrollHideTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Reset sliding-window cache when switching projects
  useEffect(() => {
    lineCacheRef.current.clear();
    inFlightRangesRef.current.clear();
    setDiscoveredMaxLine(0);
    setDiscoveredTotalLines(0);
    setScrollTop(0);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    setCacheVersion((v) => v + 1);
  }, [projectId]);

  // Seed cache whenever initialLines updates from parent state/WS
  useEffect(() => {
    if (!initialLines || initialLines.length === 0) return;
    const cache = lineCacheRef.current;
    let changed = false;
    for (const l of initialLines) {
      if (l && typeof l.line_number === 'number' && l.line_number > 0) {
        const prev = cache.get(l.line_number);
        if (!prev || prev.text !== l.text || prev.status !== l.status || prev.updated_at !== l.updated_at) {
          cache.set(l.line_number, l);
          changed = true;
        }
      }
    }
    if (changed) {
      setCacheVersion((v) => v + 1);
    }
  }, [initialLines]);

  // Measure viewport height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
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

  const effectiveMinLine = Math.max(1, minLine || 1);
  const effectiveMaxLine = Math.max(
    effectiveMinLine,
    maxLine || 0,
    totalLines || 0,
    discoveredMaxLine || 0,
    discoveredTotalLines || 0,
    initialLines.length > 0 ? Math.max(...initialLines.map((l) => l.line_number || 0)) : 0
  );
  const hasAnyLines =
    totalLines > 0 ||
    maxLine > 0 ||
    discoveredTotalLines > 0 ||
    initialLines.length > 0 ||
    lineCacheRef.current.size > 0;

  const isFilteredMode = filterMode === 'issues' || Boolean(searchQuery.trim());

  // Build filtered array when filter/search is active
  const filteredLinesList = useMemo(() => {
    if (!isFilteredMode) return [];
    const allCached = Array.from(lineCacheRef.current.values()).sort(
      (a, b) => a.line_number - b.line_number
    );
    const q = searchQuery.trim().toLowerCase();
    return allCached.filter((l) => {
      if (
        filterMode === 'issues' &&
        l.status !== 'issue' &&
        l.status !== 'gap' &&
        l.status !== 'missing' &&
        l.status !== 'unaligned' &&
        l.status !== 'flagged'
      ) {
        return false;
      }
      if (q) {
        return (
          (l.text || '').toLowerCase().includes(q) ||
          String(l.line_number).includes(q) ||
          String(l.gutter_number || '').includes(q)
        );
      }
      return true;
    });
  }, [isFilteredMode, filterMode, searchQuery, cacheVersion]);

  const totalCount = !hasAnyLines
    ? 0
    : isFilteredMode
    ? filteredLinesList.length
    : Math.max(0, effectiveMaxLine - effectiveMinLine + 1);

  // Windowed virtual scroller computation (overscan = 15)
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    Math.max(0, totalCount - 1),
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );

  const startLine = isFilteredMode
    ? filteredLinesList[startIndex]?.line_number || effectiveMinLine
    : effectiveMinLine + startIndex;
  const endLine = isFilteredMode
    ? filteredLinesList[endIndex]?.line_number || startLine
    : effectiveMinLine + endIndex;

  // Expose programmatic scrollToLine to parent controls (Go, Prev, Next, Top, End)
  const scrollToLine = useCallback(
    (targetLineNumber: number) => {
      const el = containerRef.current;
      if (!el) return;
      const clampedLine = Math.max(effectiveMinLine, Math.min(effectiveMaxLine || targetLineNumber, targetLineNumber));
      const targetIdx = Math.max(0, clampedLine - effectiveMinLine);
      const nextScrollTop = targetIdx * rowHeight;
      el.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    },
    [effectiveMinLine, effectiveMaxLine, rowHeight]
  );

  useEffect(() => {
    if (scrollToLineRef) {
      scrollToLineRef.current = scrollToLine;
    }
  }, [scrollToLineRef, scrollToLine]);

  // Auto-follow active capture/rescan position when followCurrentProcess is enabled
  useEffect(() => {
    if (followCurrentProcess && currentProcessTopLine > 0 && !isThumbDragging) {
      scrollToLine(Math.max(1, currentProcessTopLine - 4));
    }
  }, [followCurrentProcess, currentProcessTopLine, isThumbDragging, scrollToLine]);

  // Evict oldest entries if sliding-window cache exceeds max size
  const pruneSlidingCache = useCallback((centerLine: number) => {
    const cache = lineCacheRef.current;
    if (cache.size <= SLIDING_CACHE_MAX_LINES) return;
    const keys = Array.from(cache.keys());
    keys.sort((a, b) => Math.abs(b - centerLine) - Math.abs(a - centerLine));
    const toRemove = cache.size - SLIDING_CACHE_MAX_LINES;
    for (let i = 0; i < toRemove; i++) {
      cache.delete(keys[i]);
    }
  }, []);

  // Fetch a slice [fromLn..toLn] from GET /api/document/lines?from_line=${startLine}&to_line=${endLine}
  const fetchLineWindowSlice = useCallback(
    async (fromLn: number, toLn: number, isPrefetch = false) => {
      const f = Math.max(1, Math.floor(fromLn));
      const t = Math.max(f, Math.ceil(toLn));
      const rangeKey = `${f}-${t}`;
      if (inFlightRangesRef.current.has(rangeKey)) return;

      // Check if all lines in [f..t] are already present in cache
      const cache = lineCacheRef.current;
      let missingCount = 0;
      for (let ln = f; ln <= t; ln++) {
        if (!cache.has(ln)) {
          missingCount++;
          break;
        }
      }
      if (missingCount === 0) return;

      inFlightRangesRef.current.add(rangeKey);
      if (!isPrefetch) setIsLoadingWindow(true);

      try {
        const res = await fetch(
          `${apiBase}/api/document/lines?from_line=${f}&to_line=${t}&limit=${Math.min(1000, t - f + 1)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.lines)) {
            let added = false;
            for (const item of data.lines as LineData[]) {
              if (item && typeof item.line_number === 'number') {
                cache.set(item.line_number, item);
                added = true;
              }
            }
            if (typeof data.max_line === 'number' && data.max_line > 0) {
              setDiscoveredMaxLine((prev) => Math.max(prev, data.max_line));
            }
            if (typeof data.total_lines === 'number' && data.total_lines > 0) {
              setDiscoveredTotalLines((prev) => Math.max(prev, data.total_lines));
            }
            pruneSlidingCache(Math.round((f + t) / 2));
            if (added) {
              setCacheVersion((v) => v + 1);
            }
            if (!isPrefetch && onLinesLoaded) {
              onLinesLoaded(data.lines, {
                total_lines: data.total_lines,
                min_line: data.min_line,
                max_line: data.max_line,
              });
            }
          }
        }
      } catch {
        // Silent ignore on transient network error
      } finally {
        inFlightRangesRef.current.delete(rangeKey);
        if (!isPrefetch) setIsLoadingWindow(false);
      }
    },
    [apiBase, onLinesLoaded, pruneSlidingCache]
  );

  // Debounced on-demand window fetch + adjacent window prefetching
  useEffect(() => {
    if (!hasAnyLines || isFilteredMode || totalCount === 0) return;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      const f = Math.max(1, startLine);
      const t = Math.min(effectiveMaxLine, Math.max(f, endLine));
      await fetchLineWindowSlice(f, t, false);

      // Prefetch adjacent windows (previous window and next window)
      const prevStart = Math.max(1, f - PREFETCH_SPAN);
      const prevEnd = f - 1;
      if (prevEnd >= prevStart) {
        fetchLineWindowSlice(prevStart, prevEnd, true);
      }

      const nextStart = t + 1;
      const nextEnd = Math.min(effectiveMaxLine, t + PREFETCH_SPAN);
      if (nextEnd >= nextStart) {
        fetchLineWindowSlice(nextStart, nextEnd, true);
      }
    }, FETCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [hasAnyLines, isFilteredMode, totalCount, startLine, endLine, effectiveMaxLine, fetchLineWindowSlice]);

  // Notify parent of visible line range
  useEffect(() => {
    if (onVisibleRangeChange && totalCount > 0) {
      onVisibleRangeChange(startLine, endLine, isLoadingWindow);
    }
  }, [startLine, endLine, isLoadingWindow, totalCount, onVisibleRangeChange]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
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
    },
    [isThumbDragging]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.right - 18) {
      setIsThumbDragging(true);
      setIsFastScrolling(true);
    }
  }, []);

  // Build visible rows for [startIndex..endIndex]
  const visibleRows = useMemo(() => {
    if (totalCount === 0 || endIndex < startIndex) return [];
    const rows: Array<{ index: number; line: LineData; isPlaceholder: boolean }> = [];
    const cache = lineCacheRef.current;

    for (let idx = startIndex; idx <= endIndex; idx++) {
      if (isFilteredMode) {
        const item = filteredLinesList[idx];
        if (item) {
          rows.push({ index: idx, line: item, isPlaceholder: false });
        }
      } else {
        const ln = effectiveMinLine + idx;
        const cached = cache.get(ln);
        if (cached) {
          rows.push({ index: idx, line: cached, isPlaceholder: false });
        } else {
          rows.push({
            index: idx,
            line: {
              line_number: ln,
              gutter_number: ln,
              text: '',
              is_blank: false,
              status: 'loading',
              frame_id: '',
              confidence: 1,
              notes: '',
              updated_at: '',
            },
            isPlaceholder: true,
          });
        }
      }
    }
    return rows;
  }, [totalCount, startIndex, endIndex, isFilteredMode, filteredLinesList, effectiveMinLine, cacheVersion]);

  // Resolve Page X and Line Y for the fast-scroll floating indicator badge
  const scrollBadgeInfo = useMemo(() => {
    if (totalCount === 0) {
      return { pageNum: 1, lineNum: 1, total: effectiveMaxLine || 0, ratio: 0 };
    }
    const maxScroll = Math.max(1, totalCount * rowHeight - viewportHeight);
    const ratio = Math.max(0, Math.min(1, scrollTop / maxScroll));
    const focusIdx = Math.min(
      totalCount - 1,
      Math.max(0, Math.floor((scrollTop + viewportHeight * 0.35) / rowHeight))
    );
    const focusLine = isFilteredMode
      ? filteredLinesList[focusIdx]?.line_number || 1
      : effectiveMinLine + focusIdx;

    let pageNum = Math.max(1, Math.ceil(focusLine / 45));
    if (frames && frames.length > 0) {
      const matchingFrame = frames.find(
        (f) => f.top_line > 0 && f.bottom_line >= f.top_line && focusLine >= f.top_line && focusLine <= f.bottom_line
      );
      if (matchingFrame) {
        pageNum = matchingFrame.page_index || 1;
      } else {
        // Nearest frame by top_line
        let bestFrame = frames[0];
        let bestDist = Infinity;
        for (const f of frames) {
          if (f.top_line > 0) {
            const d = Math.abs(f.top_line - focusLine);
            if (d < bestDist) {
              bestDist = d;
              bestFrame = f;
            }
          }
        }
        if (bestFrame?.page_index) {
          pageNum = bestFrame.page_index;
        }
      }
    }

    return {
      pageNum,
      lineNum: focusLine,
      total: Math.max(effectiveMaxLine, totalLines, focusLine),
      ratio,
    };
  }, [
    totalCount,
    rowHeight,
    viewportHeight,
    scrollTop,
    isFilteredMode,
    filteredLinesList,
    effectiveMinLine,
    effectiveMaxLine,
    totalLines,
    frames,
  ]);

  const topSpacerHeight = Math.max(0, startIndex * rowHeight);
  const bottomSpacerHeight = Math.max(0, (totalCount - 1 - endIndex) * rowHeight);
  const badgeTopPx = Math.max(
    36,
    Math.min(viewportHeight - 44, Math.round(scrollBadgeInfo.ratio * (viewportHeight - 76)) + 36)
  );

  return (
    <div
      className="virtualized-lines-wrapper"
      style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div
        ref={containerRef}
        className="lines-table-container virtualized-line-viewer pane-scrollable-with-buffer"
        style={{ paddingBottom: isTelemetryExpanded ? '340px' : '40px' }}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        data-testid="virtualized-line-viewer"
      >
        {totalCount === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#6e7681' }}>
            <p>No lines transcribed yet.</p>
          </div>
        ) : (
          <table className="clean-lines-table">
            <thead>
              <tr>
                <th className="th-select">
                  <input
                    type="checkbox"
                    checked={totalCount > 0 && selectedLineNumbers.size > 0 && selectedLineNumbers.size >= visibleRows.length}
                    onChange={onToggleSelectAllLines}
                  />
                </th>
                <th className="th-line-num">Line #</th>
                <th className="th-line-text">text</th>
              </tr>
            </thead>
            <tbody>
              {topSpacerHeight > 0 && (
                <tr aria-hidden="true" className="virtual-spacer-row">
                  <td colSpan={3} style={{ height: `${topSpacerHeight}px`, padding: 0, border: 'none' }} />
                </tr>
              )}
              {visibleRows.map(({ line, isPlaceholder }) => {
                const isSelected = selectedLineNumbers.has(line.line_number);
                const isGap = line.status === 'gap' || line.status === 'missing';
                return (
                  <tr
                    key={line.line_number}
                    style={{ height: `${rowHeight}px` }}
                    className={`table-line-row ${line.status || ''} ${
                      selectedLine?.line_number === line.line_number ? 'selected' : ''
                    } ${isSelected ? 'selected-for-edit' : ''}`}
                    onClick={() => {
                      if (!isPlaceholder) onSelectLine(line);
                    }}
                  >
                    <td className="td-select" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="line-select-checkbox"
                        checked={isSelected}
                        onChange={(e) => onToggleSelectLine(line.line_number, e)}
                      />
                    </td>
                    <td className="td-line-num">
                      {isGap ? (
                        <span style={{ color: '#f85149', fontWeight: 700 }}>
                          {line.gutter_number || line.line_number}
                        </span>
                      ) : (
                        <>
                          {line.gutter_number || line.line_number}
                          {line.is_wrapped && <span className="wrap-tag"> ↵</span>}
                        </>
                      )}
                    </td>
                    <td className="td-line-text">
                      {isPlaceholder ? (
                        <span
                          className="virtual-line-skeleton"
                          style={{
                            display: 'inline-block',
                            width: `${120 + ((line.line_number * 37) % 180)}px`,
                            height: '11px',
                            borderRadius: '3px',
                            background: 'rgba(48, 54, 61, 0.35)',
                          }}
                        />
                      ) : isGap ? (
                        <span
                          className="gap-line-warning"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#f85149',
                            fontStyle: 'italic',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          <AlertCircle size={11} color="#f85149" />
                          <span>[GAP: Line #{line.line_number} Missing — Not Captured in Paging]</span>
                        </span>
                      ) : (
                        <pre className="table-code-text">
                          {line.text || <span className="blank-line-tag">(blank line)</span>}
                        </pre>
                      )}
                    </td>
                  </tr>
                );
              })}
              {bottomSpacerHeight > 0 && (
                <tr aria-hidden="true" className="virtual-spacer-row">
                  <td colSpan={3} style={{ height: `${bottomSpacerHeight}px`, padding: 0, border: 'none' }} />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Fast-scroll floating indicator badge */}
      {totalCount > 0 && (isFastScrolling || isThumbDragging) && (
        <div
          className={`fast-scroll-indicator-badge ${isThumbDragging ? 'thumb-dragging' : ''}`}
          style={{ top: `${badgeTopPx}px` }}
          data-testid="line-viewer-scroll-badge"
        >
          <span className="fast-scroll-badge-dot" />
          <span>
            Page {scrollBadgeInfo.pageNum} • Line {scrollBadgeInfo.lineNum} / {scrollBadgeInfo.total}
          </span>
        </div>
      )}
    </div>
  );
};

export default VirtualizedLineViewer;
