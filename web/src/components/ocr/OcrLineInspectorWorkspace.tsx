import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, RotateCw, Check, Edit3, Lock, AlertTriangle, Upload, Sparkles, Eye, EyeOff, ZoomIn, ZoomOut
} from 'lucide-react';
import type { FrameData, LineData } from '../../types';
import { VirtualizedFrameStrip } from '../VirtualizedFrameStrip';

export interface OcrLineInspectorWorkspaceProps {
  apiBase: string;
  projectId?: string;
  frames: FrameData[];
  totalLines: number;
  selectedFrameId: string | null;
  selectedFrameIds: Set<string>;
  reprocessingFrameId: string | null;
  deletingFrameId: string | null;
  onSelectFrame: (frameId: string) => void;
  onToggleSelectFrame: (frameId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onReprocessFrame: (frameId: string, e: React.MouseEvent) => void;
  onUpdateFramePosition: (frameId: string, delta: number) => void;
  onOpenTrace: (frameId: string, e: React.MouseEvent) => void;
  onDeleteFrame: (frameId: string, e: React.MouseEvent) => void;
  onDocumentUpdated?: () => void;
}

interface InspectLineItem {
  line_number: number;
  gutter_number?: number;
  text: string;
  confidence?: number;
  is_blank?: boolean;
  blank_locked?: boolean;
  is_wrapped?: boolean;
  wrapped_line_count?: number;
  status?: string;
  bbox?: { x: number; y: number; width: number; height: number } | number[];
  gutter_bbox?: { x: number; y: number; width: number; height: number } | number[];
}

interface GroundTruthMismatch {
  line_number: number;
  frame_id: string;
  ocr_text: string;
  ref_text: string;
  char_accuracy: number;
  failure_category: string;
}

interface GroundTruthScoreReport {
  status: string;
  exact_line_match_rate: number;
  cer: number;
  indentation_accuracy: number;
  syntax_token_accuracy: number;
  total_compared_lines: number;
  mismatched_lines_count: number;
  mismatches: GroundTruthMismatch[];
}

function normalizeBox(
  box: any,
  lineIdx: number,
  imgW: number,
  imgH: number
): { x: number; y: number; width: number; height: number } {
  if (!box) {
    const scaleY = imgH / 1080.0;
    const yCenter = (296.0 + lineIdx * 27.0) * scaleY;
    const halfH = 0.42 * 27.0 * scaleY;
    return {
      x: Math.round(94 * (imgW / 1920.0)),
      y: Math.round(yCenter - halfH),
      width: Math.round(imgW - 118 * (imgW / 1920.0)),
      height: Math.max(16, Math.round(halfH * 2)),
    };
  }
  if (Array.isArray(box) && box.length >= 4) {
    const [x1, y1, x2, y2] = box;
    return {
      x: Number(x1) || 0,
      y: Number(y1) || 0,
      width: Math.max(12, (Number(x2) || 0) - (Number(x1) || 0)),
      height: Math.max(14, (Number(y2) || 0) - (Number(y1) || 0)),
    };
  }
  return {
    x: Number(box.x ?? box.left ?? 94),
    y: Number(box.y ?? box.top ?? 280),
    width: Math.max(12, Number(box.width ?? box.w ?? imgW - 120)),
    height: Math.max(14, Number(box.height ?? box.h ?? 22)),
  };
}

export const OcrLineInspectorWorkspace: React.FC<OcrLineInspectorWorkspaceProps> = ({
  apiBase,
  projectId,
  frames,
  totalLines,
  selectedFrameId,
  selectedFrameIds,
  reprocessingFrameId,
  deletingFrameId,
  onSelectFrame,
  onToggleSelectFrame,
  onReprocessFrame,
  onUpdateFramePosition,
  onOpenTrace,
  onDeleteFrame,
  onDocumentUpdated,
}) => {
  const [stripWidth, setStripWidth] = useState<number>(255);
  const [leftSplitPct, setLeftSplitPct] = useState<number>(48);
  const [isDraggingStrip, setIsDraggingStrip] = useState(false);
  const [isDraggingMainSplit, setIsDraggingMainSplit] = useState(false);
  const [armedSplitter, setArmedSplitter] = useState<'strip' | 'main' | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const [inspectData, setInspectData] = useState<{
    image_id: string;
    image_url: string;
    image_width: number;
    image_height: number;
    top_line: number;
    bottom_line: number;
    model_used: string;
    lines: InspectLineItem[];
    bounding_boxes: any;
  } | null>(null);
  const [isLoadingInspect, setIsLoadingInspect] = useState(false);
  const [showYBandOverlay, setShowYBandOverlay] = useState(true);
  const [canvasZoom, setCanvasZoom] = useState<number>(1);
  const [activeLineNumber, setActiveLineNumber] = useState<number | null>(null);

  // Inline editing & 1-click row rescan states
  const [editingLineNum, setEditingLineNum] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [rescanningLineNums, setRescanningLineNums] = useState<Set<number>>(new Set());
  const [lineSliceCache, setLineSliceCache] = useState<Record<number, string>>({});

  // Search & filter in right-hand virtualized table
  const [searchQuery, setSearchQuery] = useState('');
  const [rowFilter, setRowFilter] = useState<'all' | 'mismatches' | 'blank_locked'>('all');
  const [viewScope, setViewScope] = useState<'frame' | 'document'>('frame');
  const [docWindowLines, setDocWindowLines] = useState<Map<number, InspectLineItem>>(new Map());

  // Ground-Truth Reference Markdown Score state
  const [gtScore, setGtScore] = useState<GroundTruthScoreReport | null>(null);
  const [_isScoringGt, setIsScoringGt] = useState(false);
  const [isAutoHealingGt, setIsAutoHealingGt] = useState(false);
  const refUploadInputRef = useRef<HTMLInputElement>(null);

  // Virtualized table scroll state (overscan = 15)
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [isFastScrolling, setIsFastScrolling] = useState(false);
  const [isThumbDragging, setIsThumbDragging] = useState(false);
  const scrollHideTimerRef = useRef<number | null>(null);
  const rowHeight = 42;
  const overscan = 15;

  const activeFrame = useMemo(() => {
    if (selectedFrameId) {
      const found = frames.find((f) => f.frame_id === selectedFrameId);
      if (found) return found;
    }
    return frames[0] || null;
  }, [frames, selectedFrameId]);

  // Load inspect data for selected frame
  const fetchFrameInspect = useCallback(
    async (frameId: string, forceRescan = false) => {
      if (!frameId) return;
      setIsLoadingInspect(true);
      try {
        const res = await fetch(
          `${apiBase}/api/ocr/inspect?image_id=${encodeURIComponent(frameId)}${forceRescan ? '&rescan=true' : ''}`
        );
        if (res.ok) {
          const data = await res.json();
          setInspectData({
            image_id: data.image_id || frameId,
            image_url: data.image_url || `/api/frames/${encodeURIComponent(frameId)}/image`,
            image_width: data.image_width || 1920,
            image_height: data.image_height || 1080,
            top_line: data.top_line || 1,
            bottom_line: data.bottom_line || 1,
            model_used: data.model_used || 'MiniCPM-V + RapidOCR',
            lines: Array.isArray(data.lines) ? data.lines : [],
            bounding_boxes: data.bounding_boxes || {},
          });
        }
      } catch {
        // Ignore transient network errors
      } finally {
        setIsLoadingInspect(false);
      }
    },
    [apiBase]
  );

  useEffect(() => {
    if (activeFrame?.frame_id) {
      fetchFrameInspect(activeFrame.frame_id, false);
    }
  }, [activeFrame?.frame_id, fetchFrameInspect]);

  // Load Ground-Truth Score if reference markdown exists for project
  const fetchGroundTruthScore = useCallback(async () => {
    if (!projectId) return;
    setIsScoringGt(true);
    try {
      const res = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/ground-truth-score`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.exact_line_match_rate === 'number') {
          setGtScore(data);
        }
      }
    } catch {
      // No reference markdown uploaded yet
    } finally {
      setIsScoringGt(false);
    }
  }, [apiBase, projectId]);

  useEffect(() => {
    if (projectId) {
      fetchGroundTruthScore();
    }
  }, [projectId, fetchGroundTruthScore]);

  const mismatchByLine = useMemo(() => {
    const map = new Map<number, GroundTruthMismatch>();
    if (gtScore?.mismatches) {
      for (const m of gtScore.mismatches) {
        map.set(m.line_number, m);
      }
    }
    return map;
  }, [gtScore]);

  // Measure right-hand table viewport
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientHeight > 0) setViewportHeight(el.clientHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build rows source (either current frame's lines with exact Y-bands, or full document lines)
  const sourceLines = useMemo<InspectLineItem[]>(() => {
    if (viewScope === 'frame') {
      const rawLines = inspectData?.lines || [];
      const gBoxes = inspectData?.bounding_boxes?.gutter_boxes || {};
      const cBoxes = inspectData?.bounding_boxes?.code_boxes || {};
      return rawLines.map((l) => {
        const ln = l.line_number;
        return {
          ...l,
          gutter_bbox: l.gutter_bbox || gBoxes[ln] || gBoxes[String(ln)],
          bbox: l.bbox || cBoxes[ln] || cBoxes[String(ln)],
        };
      });
    }
    // Full document scope: combine cached window lines
    return Array.from(docWindowLines.values()).sort((a, b) => a.line_number - b.line_number);
  }, [viewScope, inspectData, docWindowLines]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sourceLines.filter((item) => {
      if (rowFilter === 'mismatches' && !mismatchByLine.has(item.line_number)) return false;
      if (rowFilter === 'blank_locked' && !item.blank_locked && !item.is_blank) return false;
      if (q) {
        return (
          (item.text || '').toLowerCase().includes(q) ||
          String(item.line_number).includes(q)
        );
      }
      return true;
    });
  }, [sourceLines, rowFilter, searchQuery, mismatchByLine]);

  const totalCount = viewScope === 'document' && !searchQuery.trim() && rowFilter === 'all'
    ? Math.max(totalLines, filteredRows.length)
    : filteredRows.length;

  // Windowed virtual scroller indices (overscan = 15)
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    Math.max(0, totalCount - 1),
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );

  // On-demand fetch when in full-document scope
  useEffect(() => {
    if (viewScope !== 'document' || totalCount === 0) return;
    const fromLn = startIndex + 1;
    const toLn = endIndex + 1;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/document/lines?from_line=${fromLn}&to_line=${toLn}&limit=${Math.min(1000, toLn - fromLn + 1)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.lines)) {
            setDocWindowLines((prev) => {
              const next = new Map(prev);
              for (const l of data.lines as LineData[]) {
                next.set(l.line_number, {
                  line_number: l.line_number,
                  gutter_number: l.gutter_number,
                  text: l.text,
                  is_blank: l.is_blank,
                  is_wrapped: l.is_wrapped,
                  status: l.status,
                });
              }
              return next;
            });
          }
        }
      } catch {}
    }, 65);
    return () => window.clearTimeout(timer);
  }, [viewScope, startIndex, endIndex, totalCount, apiBase]);

  const visibleItems = useMemo(() => {
    if (totalCount === 0 || endIndex < startIndex) return [];
    const list: InspectLineItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      if (viewScope === 'document' && !searchQuery.trim() && rowFilter === 'all') {
        const ln = i + 1;
        const existing = docWindowLines.get(ln);
        list.push(
          existing || {
            line_number: ln,
            gutter_number: ln,
            text: '',
            status: 'loading',
          }
        );
      } else {
        const row = filteredRows[i];
        if (row) list.push(row);
      }
    }
    return list;
  }, [totalCount, startIndex, endIndex, viewScope, searchQuery, rowFilter, docWindowLines, filteredRows]);

  // 1-Click Row Rescan from original frame crop
  const handleRescanRow = async (lineNumber: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const pid = projectId || 'default';
    setRescanningLineNums((prev) => new Set(prev).add(lineNumber));
    try {
      const res = await fetch(
        `${apiBase}/api/analyzer/workspace/${encodeURIComponent(pid)}/verify-line-from-frame`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            global_md_line: lineNumber,
            run_vlm: false,
            apply_patch: true,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.cropped_data_url) {
          setLineSliceCache((prev) => ({ ...prev, [lineNumber]: data.cropped_data_url }));
        }
        const newText = data.re_transcribed_text ?? data.rapidocr_text ?? data.current_ocr_text ?? '';
        setInspectData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lines: prev.lines.map((l) =>
              l.line_number === lineNumber
                ? { ...l, text: newText, blank_locked: Boolean(data.blank_locked) }
                : l
            ),
          };
        });
        onDocumentUpdated?.();
      }
    } finally {
      setRescanningLineNums((prev) => {
        const next = new Set(prev);
        next.delete(lineNumber);
        return next;
      });
    }
  };

  // Save inline edit
  const handleSaveInlineEdit = async (lineNumber: number) => {
    try {
      const res = await fetch(`${apiBase}/api/lines/${lineNumber}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editingText, status: 'manually_edited' }),
      });
      if (res.ok) {
        setInspectData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lines: prev.lines.map((l) =>
              l.line_number === lineNumber ? { ...l, text: editingText, status: 'manually_edited' } : l
            ),
          };
        });
        setEditingLineNum(null);
        onDocumentUpdated?.();
      }
    } catch {}
  };

  // Upload Reference Markdown (.md)
  const handleUploadReferenceMd = async (file: File) => {
    if (!projectId) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(
        `${apiBase}/api/projects/${encodeURIComponent(projectId)}/reference-markdown`,
        {
          method: 'POST',
          body: formData,
        }
      );
      if (res.ok) {
        await fetchGroundTruthScore();
      }
    } catch {}
  };

  // Auto-Heal Mismatches against Reference Markdown
  const handleAutoHealMismatches = async () => {
    if (!projectId) return;
    setIsAutoHealingGt(true);
    try {
      const res = await fetch(
        `${apiBase}/api/projects/${encodeURIComponent(projectId)}/auto-heal-mismatches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      if (res.ok) {
        await fetchGroundTruthScore();
        if (activeFrame?.frame_id) {
          await fetchFrameInspect(activeFrame.frame_id, false);
        }
        onDocumentUpdated?.();
      }
    } finally {
      setIsAutoHealingGt(false);
    }
  };

  // Splitter drag handlers with 80ms hover arming
  const handleSplitterEnter = (which: 'strip' | 'main') => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setArmedSplitter(which), 80);
  };
  const handleSplitterLeave = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    setArmedSplitter(null);
  };

  const handleStripResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingStrip(true);
    const startX = e.clientX;
    const startW = stripWidth;
    const onMove = (m: MouseEvent) => {
      setStripWidth(Math.max(190, Math.min(380, startW + (m.clientX - startX))));
    };
    const onUp = () => {
      setIsDraggingStrip(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleMainSplitDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingMainSplit(true);
    const startX = e.clientX;
    const startPct = leftSplitPct;
    const availW = Math.max(400, window.innerWidth - stripWidth);
    const onMove = (m: MouseEvent) => {
      const deltaPct = ((m.clientX - startX) / availW) * 100;
      setLeftSplitPct(Math.max(25, Math.min(72, startPct + deltaPct)));
    };
    const onUp = () => {
      setIsDraggingMainSplit(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    setIsFastScrolling(true);
    if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
    scrollHideTimerRef.current = window.setTimeout(() => {
      if (!isThumbDragging) setIsFastScrolling(false);
    }, 600);
  };

  const imgW = inspectData?.image_width || 1920;
  const imgH = inspectData?.image_height || 1080;
  const frameImgUrl = activeFrame
    ? `${apiBase}/api/frames/${encodeURIComponent(activeFrame.frame_id)}/image`
    : '';

  const topSpacerH = Math.max(0, startIndex * rowHeight);
  const bottomSpacerH = Math.max(0, (totalCount - 1 - endIndex) * rowHeight);
  const focusIdx = Math.min(
    Math.max(0, totalCount - 1),
    Math.floor((scrollTop + viewportHeight * 0.35) / rowHeight)
  );
  const focusLineNum =
    visibleItems.find((_, idx) => startIndex + idx === focusIdx)?.line_number ||
    (inspectData?.top_line ?? 1) + focusIdx;
  const currentPageNum = activeFrame?.page_index || Math.max(1, Math.ceil(focusLineNum / 45));
  const scrollRatio = Math.max(0, Math.min(1, scrollTop / Math.max(1, totalCount * rowHeight - viewportHeight)));
  const badgeTopPx = Math.max(42, Math.min(viewportHeight - 44, Math.round(scrollRatio * (viewportHeight - 86)) + 42));

  return (
    <div className="ocr-inspector-workspace" data-testid="ocr-line-inspector-workspace">
      {/* Left 1: Virtualized JIT Thumbnail Filmstrip */}
      <aside className="ocr-filmstrip-pane" style={{ width: `${stripWidth}px`, flexShrink: 0 }}>
        <div className="panel-header">
          <span>Frames Filmstrip ({frames.length})</span>
        </div>
        <VirtualizedFrameStrip
          frames={frames}
          totalLines={totalLines}
          selectedFrameId={activeFrame?.frame_id || null}
          selectedFrameIds={selectedFrameIds}
          apiBase={apiBase}
          reprocessingFrameId={reprocessingFrameId}
          deletingFrameId={deletingFrameId}
          onSelectFrame={(f) => onSelectFrame(f.frame_id)}
          onDoubleClickFrame={(f) => onSelectFrame(f.frame_id)}
          onToggleSelectFrame={onToggleSelectFrame}
          onReprocessFrame={onReprocessFrame}
          onUpdateFramePosition={onUpdateFramePosition}
          onOpenTrace={onOpenTrace}
          onDeleteFrame={onDeleteFrame}
        />
      </aside>

      {/* Splitter 1 */}
      <div
        className={`panel-resizer ${isDraggingStrip ? 'dragging' : ''} ${armedSplitter === 'strip' ? 'hover-armed' : ''}`}
        onMouseEnter={() => handleSplitterEnter('strip')}
        onMouseLeave={handleSplitterLeave}
        onMouseDown={handleStripResizeDown}
        role="separator"
      >
        <div className="panel-resizer-line" />
        <div className="panel-resizer-pill" onMouseDown={handleStripResizeDown} />
      </div>

      {/* Left 2: Interactive Source Frame Canvas with Horizontal Y-Band Overlays */}
      <section
        className="ocr-canvas-pane"
        style={{ flex: `${leftSplitPct} 1 0`, minWidth: '280px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>
              Source Frame Canvas{' '}
              {activeFrame ? `• Pg ${activeFrame.page_index} (Ln ${activeFrame.top_line}–${activeFrame.bottom_line})` : ''}
            </span>
            {isLoadingInspect && <RotateCw size={11} className="spin" color="#58a6ff" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className={`btn btn-sm ${showYBandOverlay ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setShowYBandOverlay((v) => !v)}
              style={{ padding: '2px 8px', fontSize: '10.5px' }}
              title="Toggle Horizontal Y-Band Gutter & Row Overlays"
            >
              {showYBandOverlay ? <Eye size={11} /> : <EyeOff size={11} />}
              <span>Y-Bands</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setCanvasZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
              style={{ padding: '2px 6px' }}
              title="Zoom Out"
            >
              <ZoomOut size={11} />
            </button>
            <span style={{ fontSize: '10px', color: '#8b949e' }}>{Math.round(canvasZoom * 100)}%</span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setCanvasZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
              style={{ padding: '2px 6px' }}
              title="Zoom In"
            >
              <ZoomIn size={11} />
            </button>
            {activeFrame && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => fetchFrameInspect(activeFrame.frame_id, true)}
                disabled={isLoadingInspect}
                style={{ padding: '2px 8px', fontSize: '10.5px', color: '#00ff9d', borderColor: '#00ff9d55' }}
                title="Re-run deterministic gutter grid & pixel energy OCR on this frame"
              >
                <RotateCw size={11} className={isLoadingInspect ? 'spin' : ''} />
                <span>Rescan Frame</span>
              </button>
            )}
          </div>
        </div>

        <div className="inspector-view-container pane-scrollable-with-buffer">
          {!activeFrame ? (
            <div className="empty-inspector-state">
              <p>Select a captured frame from the filmstrip to inspect gutter Y-bands.</p>
            </div>
          ) : (
            <div
              className="source-image-wrapper"
              style={{
                position: 'relative',
                width: `${Math.round(100 * canvasZoom)}%`,
                maxWidth: canvasZoom === 1 ? '100%' : 'none',
              }}
            >
              <img
                src={frameImgUrl}
                alt={activeFrame.frame_id}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
              {showYBandOverlay && inspectData && (
                <svg
                  className="bbox-svg-overlay"
                  viewBox={`0 0 ${imgW} ${imgH}`}
                  preserveAspectRatio="none"
                  style={{ pointerEvents: 'auto' }}
                >
                  {sourceLines.map((line, idx) => {
                    const cbox = normalizeBox(line.bbox, idx, imgW, imgH);
                    const gbox = normalizeBox(
                      line.gutter_bbox || { x: 8, y: cbox.y, width: 78, height: cbox.height },
                      idx,
                      imgW,
                      imgH
                    );
                    const isSelected = activeLineNumber === line.line_number;
                    const hasMismatch = mismatchByLine.has(line.line_number);
                    const strokeColor = hasMismatch
                      ? '#f85149'
                      : isSelected
                      ? '#00ff9d'
                      : line.blank_locked
                      ? '#58a6ff'
                      : 'rgba(0, 255, 157, 0.38)';
                    const fillColor = hasMismatch
                      ? 'rgba(248, 81, 73, 0.16)'
                      : isSelected
                      ? 'rgba(0, 255, 157, 0.18)'
                      : line.blank_locked
                      ? 'rgba(88, 166, 255, 0.06)'
                      : 'rgba(0, 255, 157, 0.04)';

                    return (
                      <g
                        key={line.line_number}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setActiveLineNumber(line.line_number);
                          const rowIdx = filteredRows.findIndex((r) => r.line_number === line.line_number);
                          if (rowIdx >= 0 && tableContainerRef.current) {
                            tableContainerRef.current.scrollTop = Math.max(0, (rowIdx - 3) * rowHeight);
                          }
                        }}
                      >
                        {/* Horizontal 1px guide line at y_bottom(ln) */}
                        <line
                          x1={0}
                          y1={cbox.y + cbox.height}
                          x2={imgW}
                          y2={cbox.y + cbox.height}
                          stroke={isSelected ? '#00ff9d' : 'rgba(88, 166, 255, 0.28)'}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                        {/* Gutter number box */}
                        <rect
                          x={gbox.x}
                          y={cbox.y}
                          width={gbox.width}
                          height={cbox.height}
                          fill={isSelected ? 'rgba(0, 255, 157, 0.25)' : 'rgba(88, 166, 255, 0.12)'}
                          stroke={strokeColor}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                        {/* Code strip Y-band */}
                        <rect
                          x={cbox.x}
                          y={cbox.y}
                          width={cbox.width}
                          height={cbox.height}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                        {/* Synthetic [L{ln}] tag */}
                        <text
                          x={Math.max(4, gbox.x + 4)}
                          y={cbox.y + Math.min(16, cbox.height - 4)}
                          fill="#00ff9d"
                          fontSize="12"
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="bold"
                        >
                          L{line.line_number}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Splitter 2 */}
      <div
        className={`panel-resizer ${isDraggingMainSplit ? 'dragging' : ''} ${armedSplitter === 'main' ? 'hover-armed' : ''}`}
        onMouseEnter={() => handleSplitterEnter('main')}
        onMouseLeave={handleSplitterLeave}
        onMouseDown={handleMainSplitDown}
        role="separator"
      >
        <div className="panel-resizer-line" />
        <div className="panel-resizer-pill" onMouseDown={handleMainSplitDown} />
      </div>

      {/* Right Pane: Virtualized Line-by-Line Table (Gutter # | Image Crop Preview | Extracted Text | Reference Diff / Status) */}
      <section
        className="ocr-lines-table-pane"
        style={{ flex: `${100 - leftSplitPct} 1 0`, minWidth: '380px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Line-by-Line OCR &amp; Fidelity Table ({totalCount.toLocaleString()} lines)</span>
            <div style={{ display: 'inline-flex', background: '#0d1117', borderRadius: '4px', border: '1px solid #30363d', padding: '1px' }}>
              <button
                type="button"
                className={`btn btn-sm ${viewScope === 'frame' ? 'btn-primary' : ''}`}
                onClick={() => setViewScope('frame')}
                style={{ padding: '1px 7px', fontSize: '10px' }}
              >
                Active Frame ({inspectData?.lines?.length || 0})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewScope === 'document' ? 'btn-primary' : ''}`}
                onClick={() => setViewScope('document')}
                style={{ padding: '1px 7px', fontSize: '10px' }}
              >
                All Document ({totalLines})
              </button>
            </div>
          </div>

          {/* Reference Markdown Ingestion & Auto-Heal Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              ref={refUploadInputRef}
              type="file"
              accept=".md,.txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadReferenceMd(f);
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => refUploadInputRef.current?.click()}
              style={{ padding: '2px 8px', fontSize: '10px', color: '#58a6ff', borderColor: '#58a6ff55' }}
              title="Upload Ground-Truth Reference Markdown (.md) to score line & character fidelity"
            >
              <Upload size={11} />
              <span>Ref .md</span>
            </button>
            {gtScore && (
              <>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: gtScore.exact_line_match_rate >= 98 ? 'rgba(0,255,157,0.12)' : 'rgba(227,179,65,0.15)',
                    color: gtScore.exact_line_match_rate >= 98 ? '#00ff9d' : '#e3b341',
                    border: '1px solid rgba(0,255,157,0.3)',
                  }}
                  title={`Exact Match: ${gtScore.exact_line_match_rate}% • CER: ${(gtScore.cer * 100).toFixed(2)}% • Indent: ${gtScore.indentation_accuracy}%`}
                >
                  Match {gtScore.exact_line_match_rate.toFixed(1)}% • CER {(gtScore.cer * 100).toFixed(2)}%
                </span>
                {gtScore.mismatched_lines_count > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleAutoHealMismatches}
                    disabled={isAutoHealingGt}
                    style={{ padding: '2px 8px', fontSize: '10px' }}
                    title="Auto-crop and re-OCR all mismatched lines from their source PNG frames"
                  >
                    <Sparkles size={11} />
                    <span>{isAutoHealingGt ? 'Healing...' : `Heal (${gtScore.mismatched_lines_count})`}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Search & Filter Sub-Bar */}
        <div className="filter-bar" style={{ gap: '8px', padding: '6px 12px' }}>
          <Search size={13} color="#8b949e" />
          <input
            type="text"
            className="search-input"
            placeholder="Filter by line # or text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '4px 8px' }}
          />
          <button
            type="button"
            className={`btn btn-sm ${rowFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRowFilter('all')}
            style={{ padding: '2px 7px', fontSize: '10px' }}
          >
            All
          </button>
          <button
            type="button"
            className={`btn btn-sm ${rowFilter === 'blank_locked' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRowFilter('blank_locked')}
            style={{ padding: '2px 7px', fontSize: '10px' }}
          >
            Blank Locked
          </button>
          <button
            type="button"
            className={`btn btn-sm ${rowFilter === 'mismatches' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRowFilter('mismatches')}
            style={{ padding: '2px 7px', fontSize: '10px' }}
          >
            Mismatches ({gtScore?.mismatched_lines_count ?? 0})
          </button>
        </div>

        {/* Virtualized Table Container */}
        <div
          style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div
            ref={tableContainerRef}
            className="lines-table-container pane-scrollable-with-buffer"
            onScroll={handleTableScroll}
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (e.clientX >= rect.right - 18) {
                setIsThumbDragging(true);
                setIsFastScrolling(true);
                const onUp = () => {
                  setIsThumbDragging(false);
                  window.setTimeout(() => setIsFastScrolling(false), 450);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mouseup', onUp);
              }
            }}
          >
            <table className="clean-lines-table">
              <thead>
                <tr>
                  <th className="th-line-num" style={{ width: '68px' }}>Gutter #</th>
                  <th style={{ width: '165px' }}>Image Crop Preview</th>
                  <th className="th-line-text">Extracted Text</th>
                  <th style={{ width: '190px', textAlign: 'right' }}>Reference Diff / Actions</th>
                </tr>
              </thead>
              <tbody>
                {topSpacerH > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={4} style={{ height: `${topSpacerH}px`, padding: 0, border: 'none' }} />
                  </tr>
                )}
                {visibleItems.map((line, idx) => {
                  const ln = line.line_number;
                  const isSelected = activeLineNumber === ln;
                  const isEditing = editingLineNum === ln;
                  const isRescanning = rescanningLineNums.has(ln);
                  const mismatch = mismatchByLine.get(ln);
                  const cbox = normalizeBox(line.bbox, idx, imgW, imgH);
                  const cachedSliceUrl = lineSliceCache[ln];

                  // Calculate CSS sprite crop positioning from active frame image
                  const bgPosYPercent = Math.max(0, Math.min(100, (cbox.y / Math.max(1, imgH - cbox.height)) * 100));

                  return (
                    <tr
                      key={ln}
                      style={{ height: `${rowHeight}px` }}
                      className={`table-line-row ${isSelected ? 'selected' : ''} ${mismatch ? 'flagged' : ''}`}
                      onClick={() => setActiveLineNumber(ln)}
                    >
                      {/* Gutter # */}
                      <td className="td-line-num" style={{ fontWeight: 700, color: isSelected ? '#00ff9d' : '#8b949e' }}>
                        <span>{line.gutter_number || ln}</span>
                        {line.blank_locked && (
                          <span title="Blank-Locked by Pixel Energy Gate (ink_px < 10)" style={{ marginLeft: '4px', color: '#58a6ff' }}>
                            <Lock size={10} />
                          </span>
                        )}
                        {line.is_wrapped && <span className="wrap-tag"> ↵</span>}
                      </td>

                      {/* Image Crop Preview */}
                      <td style={{ padding: '3px 8px', verticalAlign: 'middle' }}>
                        {cachedSliceUrl ? (
                          <img
                            src={cachedSliceUrl}
                            alt={`L${ln} crop`}
                            style={{
                              width: '150px',
                              height: '24px',
                              objectFit: 'cover',
                              objectPosition: 'left center',
                              borderRadius: '3px',
                              border: '1px solid #30363d',
                              display: 'block',
                            }}
                          />
                        ) : frameImgUrl ? (
                          <div
                            title={`Frame Y-band [${cbox.y}..${cbox.y + cbox.height}px]`}
                            style={{
                              width: '150px',
                              height: '24px',
                              borderRadius: '3px',
                              border: '1px solid #21262d',
                              backgroundImage: `url("${frameImgUrl}")`,
                              backgroundSize: '420px auto',
                              backgroundPosition: `2% ${bgPosYPercent.toFixed(2)}%`,
                              backgroundRepeat: 'no-repeat',
                              backgroundColor: '#0d1117',
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: '10px', color: '#484f58' }}>—</span>
                        )}
                      </td>

                      {/* Extracted Text / Inline Edit */}
                      <td
                        className="td-line-text"
                        onDoubleClick={() => {
                          setEditingLineNum(ln);
                          setEditingText(line.text || '');
                        }}
                      >
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveInlineEdit(ln);
                                if (e.key === 'Escape') setEditingLineNum(null);
                              }}
                              autoFocus
                              style={{
                                flex: 1,
                                background: '#0d1117',
                                border: '1px solid #58a6ff',
                                borderRadius: '4px',
                                color: '#f0f6fc',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11.5px',
                                padding: '2px 6px',
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleSaveInlineEdit(ln)}
                              style={{ padding: '2px 6px' }}
                            >
                              <Check size={11} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <pre className="table-code-text" style={{ margin: 0 }}>
                              {line.text || (
                                <span className="blank-line-tag">
                                  {line.blank_locked ? '(blank-locked • 0 ink px)' : '(blank line)'}
                                </span>
                              )}
                            </pre>
                            {mismatch && (
                              <div style={{ fontSize: '10px', color: '#f85149', fontFamily: 'var(--font-mono)' }}>
                                Ref: <code>{mismatch.ref_text || '(empty)'}</code>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Reference Diff / 1-Click Actions */}
                      <td style={{ padding: '2px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          {mismatch ? (
                            <span
                              className="status-badge flagged"
                              title={`Failure: ${mismatch.failure_category} (${Math.round(mismatch.char_accuracy * 100)}% char match)`}
                            >
                              <AlertTriangle size={9} style={{ marginRight: '3px' }} />
                              {mismatch.failure_category}
                            </span>
                          ) : line.blank_locked ? (
                            <span className="status-badge overlap" title="Blank-line pixel energy gate locked">
                              LOCKED
                            </span>
                          ) : (
                            <span className="status-badge ok">✔ OK</span>
                          )}

                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingLineNum(ln);
                              setEditingText(line.text || '');
                            }}
                            style={{ padding: '2px 5px' }}
                            title="Inline edit line text"
                          >
                            <Edit3 size={10} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={(e) => handleRescanRow(ln, e)}
                            disabled={isRescanning}
                            style={{ padding: '2px 6px', color: '#00ff9d', borderColor: '#00ff9d44' }}
                            title="1-Click Re-Crop & Rescan this line from source PNG frame"
                          >
                            <RotateCw size={10} className={isRescanning ? 'spin' : ''} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {bottomSpacerH > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={4} style={{ height: `${bottomSpacerH}px`, padding: 0, border: 'none' }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Fast-Scroll Floating Indicator Badge */}
          {totalCount > 0 && (isFastScrolling || isThumbDragging) && (
            <div
              className={`fast-scroll-indicator-badge ${isThumbDragging ? 'thumb-dragging' : ''}`}
              style={{ top: `${badgeTopPx}px` }}
            >
              <span className="fast-scroll-badge-dot" />
              <span>
                Page {currentPageNum} • Line {focusLineNum} / {Math.max(totalLines, totalCount)}
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default OcrLineInspectorWorkspace;
