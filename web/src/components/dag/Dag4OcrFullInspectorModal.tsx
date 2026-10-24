import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FileText, Check, Copy, RotateCw, Eye, EyeOff, ZoomIn, ZoomOut,
  Maximize2, Minimize2, Search, Link2, AlertCircle, Image as ImageIcon,
  X, CheckSquare, Square, Zap
} from 'lucide-react';
import { copyToClipboard } from '../../utils/dagDiagnostics';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  line_number?: number;
  interpolated?: boolean;
  confidence?: number;
}

export interface OcrLineItem {
  line_number: number;
  gutter_number?: number;
  text: string;
  bbox?: BoundingBox;
  gutter_bbox?: BoundingBox;
  is_blank?: boolean;
  is_wrapped?: boolean;
  wrapped_line_count?: number;
  confidence?: number;
  status?: string;
  overwritten?: boolean;
  rescanned_at?: string;
}

export interface AvailableOcrImage {
  id: string;
  name: string;
  label: string;
  category?: string;
  size?: number;
  created_at?: string;
  url: string;
  top_line?: number;
  bottom_line?: number;
  lines_count?: number;
  model_used?: string;
  is_latest?: boolean;
}

export interface OcrInspectionData {
  status: string;
  image_id: string;
  image_name: string;
  image_url: string;
  image_width: number;
  image_height: number;
  top_line: number;
  bottom_line: number;
  lines_count: number;
  model_used: string;
  extracted_text: string;
  lines: OcrLineItem[];
  bounding_boxes: {
    first_line?: BoundingBox;
    last_line?: BoundingBox;
    wrapped_lines?: BoundingBox[];
    line_boxes?: Record<number | string, BoundingBox>;
    gutter_boxes?: Record<number | string, BoundingBox>;
  };
  available_images?: AvailableOcrImage[];
}

export interface Dag4OcrFullInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase?: string;
  initialImageId?: string;
  nodeExtractedText?: string;
  nodeModelUsed?: string;
  nodeLinesCount?: number;
  onRefresh?: () => void;
  inline?: boolean;
  // External panel status & toggles for aspect ratio adaptation
  hasFramesPanel?: boolean;
  isFramesMinimized?: boolean;
  onToggleFramesPanel?: () => void;
  hasLinesPanel?: boolean;
  isLinesPanelMinimized?: boolean;
  onToggleLinesPanel?: () => void;
  hasStudioPanel?: boolean;
  isStudioPanelOpen?: boolean;
  onToggleStudioPanel?: () => void;
  onFocusInspector?: () => void;
}

export type OcrModalMode = 'inline' | 'fullscreen' | 'standard' | 'reduced';

interface ConnectorPath {
  lineNumber: number;
  d: string;
  ribbonD?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  gutterBox: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  rowBox: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  isHovered: boolean;
  isSelected: boolean;
  isFlagged: boolean;
}

export const Dag4OcrFullInspectorModal: React.FC<Dag4OcrFullInspectorModalProps> = ({
  isOpen,
  onClose,
  apiBase = '',
  initialImageId = 'dag_node3_capture_temp',
  nodeExtractedText = '',
  nodeModelUsed = 'MiniCPM-V (Ollama)',
  nodeLinesCount = 0,
  onRefresh,
  inline = false,
  hasFramesPanel,
  isFramesMinimized,
  onToggleFramesPanel,
  hasLinesPanel,
  isLinesPanelMinimized,
  onToggleLinesPanel,
  hasStudioPanel,
  isStudioPanelOpen,
  onToggleStudioPanel,
  onFocusInspector
}) => {
  // Window display modes: 'fullscreen' (100vw x 100vh), 'standard' (wide floating), 'reduced' (compact floating), 'inline' (docked in container)
  const [modalMode, setModalMode] = useState<OcrModalMode>(inline ? 'inline' : 'fullscreen');

  // Keep modalMode synced if inline prop changes
  useEffect(() => {
    if (inline) {
      setModalMode('inline');
    }
  }, [inline]);

  const [selectedImageId, setSelectedImageId] = useState<string>(initialImageId || '');
  const [_availableImages, setAvailableImages] = useState<AvailableOcrImage[]>([]);
  const [inspectData, setInspectData] = useState<OcrInspectionData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRescanningAll, setIsRescanningAll] = useState<boolean>(false);
  const [isRescanningSelected, setIsRescanningSelected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rescanSuccessMessage, setRescanSuccessMessage] = useState<string | null>(null);

  // Keep a stable ref to onRefresh to avoid re-triggering fetch effects on parent renders
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // Track in-flight request to avoid re-entrant concurrent fetches
  const fetchingIdRef = useRef<string | null>(null);

  // Inspector interactive states
  const [hoveredLineNumber, setHoveredLineNumber] = useState<number | null>(null);
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(null);
  const [selectedLinesToOverwrite, setSelectedLinesToOverwrite] = useState<Set<number>>(new Set());

  // View toggles
  const [showContentBoxes, setShowContentBoxes] = useState<boolean>(true);
  const [showGutterBoxes, setShowGutterBoxes] = useState<boolean>(true);
  const [showAllConnectors, setShowAllConnectors] = useState<boolean>(true);
  const [showGutterBadges, setShowGutterBadges] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [copiedLine, setCopiedLine] = useState<number | null>(null);

  // Pan & Zoom state for image viewport
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Refs for element measuring and connector calculations
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const textPanelRef = useRef<HTMLDivElement>(null);
  const lineRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const boxAnchorRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Track viewport size to adapt dynamically to panel resizing, aspect ratios, and full screen toggling
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [fitMode, setFitMode] = useState<'contain' | 'width'>('contain');

  const imgNaturalWidth = inspectData?.image_width || 1920;
  const imgNaturalHeight = inspectData?.image_height || 1080;

  // Compute fitScale so the entire image fits within the viewport while preserving its exact aspect ratio
  const fitScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height || !imgNaturalWidth || !imgNaturalHeight) {
      return 1.0;
    }
    const pad = 24; // 12px padding on each side
    const availW = Math.max(100, viewportSize.width - pad);
    const availH = Math.max(100, viewportSize.height - pad);
    const scaleW = availW / imgNaturalWidth;
    const scaleH = availH / imgNaturalHeight;

    if (fitMode === 'width') {
      return scaleW;
    }
    return Math.min(scaleW, scaleH);
  }, [viewportSize, imgNaturalWidth, imgNaturalHeight, fitMode]);

  const effectiveScale = fitScale * zoom;

  // Split ratio between Left Image pane and Right Code Text panel (percentage of width)
  const [splitPercent, setSplitPercent] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('mc_ocr_split_percent')) || 52;
    } catch {
      return 52;
    }
  });
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<boolean>(false);

  // Dynamic connector paths
  const [connectorPaths, setConnectorPaths] = useState<ConnectorPath[]>([]);

  // Fetch available images
  const fetchAvailableImages = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/ocr/images`);
      if (res.ok) {
        const data = await res.json();
        if (data.images && Array.isArray(data.images)) {
          setAvailableImages(data.images);
          return data.images as AvailableOcrImage[];
        }
      }
    } catch (e) {
      console.warn('[Dag4OcrFullInspectorModal] Failed to fetch available images:', e);
    }
    return [];
  }, [apiBase]);

  // Fetch inspection data for selected image
  const fetchInspectData = useCallback(async (imgId: string, forceRescan: boolean = false) => {
    if (!imgId || imgId === 'none') {
      setInspectData(null);
      setConnectorPaths([]);
      setIsLoading(false);
      return;
    }

    if (fetchingIdRef.current === imgId && !forceRescan) {
      return; // Already in-flight for this image
    }

    fetchingIdRef.current = imgId;
    if (forceRescan) {
      setIsRescanningAll(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const url = `${apiBase}/api/ocr/inspect?image_id=${encodeURIComponent(imgId)}${forceRescan ? '&rescan=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('No capture frame found on disk. Run DAG or capture a new frame to inspect.');
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: OcrInspectionData = await res.json();
      setInspectData(data);
      if (data.available_images && data.available_images.length > 0) {
        setAvailableImages(data.available_images);
      }
      if (forceRescan && onRefreshRef.current) {
        onRefreshRef.current();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to inspect image OCR text and bounding boxes');
      setInspectData(null);
      setConnectorPaths([]);
      setSelectedLinesToOverwrite(new Set());
    } finally {
      setIsLoading(false);
      setIsRescanningAll(false);
      fetchingIdRef.current = null;
    }
  }, [apiBase]);

  // Initial load: fetch available images and sync selection
  useEffect(() => {
    if (!isOpen) return;

    fetchAvailableImages().then((imgs) => {
      if (imgs && imgs.length > 0) {
        setSelectedImageId(prev => {
          if (prev && imgs.some(i => i.id === prev)) return prev;
          if (initialImageId && imgs.some(i => i.id === initialImageId)) return initialImageId;
          return imgs[0].id;
        });
      } else {
        setSelectedImageId('');
        setInspectData(null);
        setConnectorPaths([]);
      }
    });
  }, [isOpen, fetchAvailableImages, initialImageId]);

  // When selectedImageId changes, fetch inspect data
  useEffect(() => {
    if (!isOpen) return;
    if (selectedImageId) {
      fetchInspectData(selectedImageId);
    } else {
      setInspectData(null);
      setConnectorPaths([]);
      setIsLoading(false);
    }
  }, [isOpen, selectedImageId, fetchInspectData]);

  // When initialImageId prop changes externally, update selectedImageId
  useEffect(() => {
    if (initialImageId && initialImageId !== selectedImageId) {
      setSelectedImageId(initialImageId);
    }
  }, [initialImageId, selectedImageId]);

  // Global ESC key listener to completely close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Toggle selection for overwriting a specific line number
  const toggleLineOverwrite = useCallback((ln: number) => {
    setSelectedLinesToOverwrite(prev => {
      const next = new Set(prev);
      if (next.has(ln)) {
        next.delete(ln);
      } else {
        next.add(ln);
      }
      return next;
    });
  }, []);

  const selectAllLinesToOverwrite = useCallback(() => {
    if (!inspectData?.lines) return;
    const all = new Set(inspectData.lines.map(l => l.line_number));
    setSelectedLinesToOverwrite(all);
  }, [inspectData]);

  const clearAllSelectedLines = useCallback(() => {
    setSelectedLinesToOverwrite(new Set());
  }, []);

  // Action: Rescan OCR the selected line numbers and overwrite result text
  const handleRescanSelectedLines = async () => {
    if (selectedLinesToOverwrite.size === 0 || isRescanningSelected) return;
    setIsRescanningSelected(true);
    setRescanSuccessMessage(null);
    setError(null);

    const lnsArray = Array.from(selectedLinesToOverwrite).sort((a, b) => a - b);

    try {
      const res = await fetch(`${apiBase}/api/ocr/rescan-lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: selectedImageId,
          line_numbers: lnsArray,
          lines: inspectData?.lines,
          bounding_boxes: inspectData?.bounding_boxes
        })
      });

      if (!res.ok) {
        throw new Error(`Rescan failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.status === 'success') {
        if (data.lines) {
          setInspectData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              lines: data.lines,
              extracted_text: data.extracted_text || prev.extracted_text,
              bounding_boxes: data.bounding_boxes || prev.bounding_boxes
            };
          });
        }
        setRescanSuccessMessage(`✓ Rescanned & overwritten ${lnsArray.length} line(s): #${lnsArray.join(', #')}`);
        setTimeout(() => setRescanSuccessMessage(null), 4500);
        if (onRefresh) {
          onRefresh();
        }
      } else {
        throw new Error(data.message || 'Rescan failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to rescan selected line numbers');
    } finally {
      setIsRescanningSelected(false);
    }
  };

  // Recompute connectors whenever scroll, pan, zoom, lines, or hover changes
  const updateConnectors = useCallback(() => {
    if (!isOpen || !modalBodyRef.current || !inspectData?.lines) {
      setConnectorPaths([]);
      return;
    }

    const containerRect = modalBodyRef.current.getBoundingClientRect();
    const vpRect = imageViewportRef.current?.getBoundingClientRect();
    const tpRect = textPanelRef.current?.getBoundingClientRect();
    const paths: ConnectorPath[] = [];

    const effectiveHovered = hoveredLineNumber !== null ? hoveredLineNumber : selectedLineNumber;

    inspectData.lines.forEach(line => {
      const ln = line.line_number;
      const isHovered = ln === effectiveHovered;
      const isSelected = ln === selectedLineNumber;
      const isFlagged = selectedLinesToOverwrite.has(ln);

      // Only calculate if we show all connectors OR this line is hovered/selected/flagged
      if (!showAllConnectors && !isHovered && !isSelected && !isFlagged) {
        return;
      }

      const anchorEl = boxAnchorRefs.current.get(ln);
      const rowEl = lineRowRefs.current.get(ln);

      if (anchorEl && rowEl) {
        const aRect = anchorEl.getBoundingClientRect();
        const rRect = rowEl.getBoundingClientRect();

        // Check vertical visibility if not highlighted to avoid drawing off-screen stray lines
        const anchorVisible = !vpRect || (aRect.bottom >= vpRect.top && aRect.top <= vpRect.bottom);
        const rowVisible = !tpRect || (rRect.bottom >= tpRect.top && rRect.top <= tpRect.bottom);

        if (!isHovered && !isSelected && !isFlagged) {
          if (!anchorVisible || !rowVisible) {
            return;
          }
        }

        // Bounding area coordinates relative to modal body container
        const gLeft = aRect.left - containerRect.left;
        const gTop = aRect.top - containerRect.top;
        const gRight = aRect.right - containerRect.left;
        const gBottom = aRect.bottom - containerRect.top;
        const gWidth = aRect.width;
        const gHeight = aRect.height;
        const gMidY = gTop + gHeight / 2;

        const rLeft = rRect.left - containerRect.left;
        const rTop = rRect.top - containerRect.top;
        const rRight = rRect.right - containerRect.left;
        const rBottom = rRect.bottom - containerRect.top;
        const rHeight = rRect.height;
        const rMidY = rTop + rHeight / 2;

        let x1 = gRight;
        let y1 = gMidY;
        let x2 = rLeft;
        let y2 = rMidY;

        // If active line (hovered/selected/flagged) is scrolled out of view, clamp Y to viewport edge so connector stays visible
        if (vpRect && (isHovered || isSelected || isFlagged)) {
          const minY1 = vpRect.top - containerRect.top + 8;
          const maxY1 = vpRect.bottom - containerRect.top - 8;
          y1 = Math.max(minY1, Math.min(maxY1, y1));
        }
        if (tpRect && (isHovered || isSelected || isFlagged)) {
          const minY2 = tpRect.top - containerRect.top + 8;
          const maxY2 = tpRect.bottom - containerRect.top - 8;
          y2 = Math.max(minY2, Math.min(maxY2, y2));
        }

        // Boundary constraint: x1 must not cross into the text panel
        if (vpRect) {
          const maxLeftPaneX = vpRect.right - containerRect.left;
          if (x1 > maxLeftPaneX) {
            x1 = maxLeftPaneX;
          }
        }

        if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
          if (x1 >= x2) {
            x1 = x2 - 15;
          }
          const dx = Math.max(25, (x2 - x1) * 0.45);
          const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

          // Translucent ribbon band polygon connecting full height of gutter bounding box to text row
          let ribbonD: string | undefined;
          if (isHovered || isSelected || isFlagged) {
            const topY1 = Math.max(gTop, (vpRect?.top ?? containerRect.top) - containerRect.top);
            const botY1 = Math.min(gBottom, (vpRect?.bottom ?? containerRect.bottom) - containerRect.top);
            const topY2 = Math.max(rTop, (tpRect?.top ?? containerRect.top) - containerRect.top);
            const botY2 = Math.min(rBottom, (tpRect?.bottom ?? containerRect.bottom) - containerRect.top);

            ribbonD = `M ${x1} ${topY1} C ${x1 + dx} ${topY1}, ${x2 - dx} ${topY2}, ${x2} ${topY2} L ${x2} ${botY2} C ${x2 - dx} ${botY2}, ${x1 + dx} ${botY1}, ${x1} ${botY1} Z`;
          }

          paths.push({
            lineNumber: ln,
            d,
            ribbonD,
            x1,
            y1,
            x2,
            y2,
            gutterBox: {
              left: gLeft,
              top: gTop,
              right: gRight,
              bottom: gBottom,
              width: gWidth,
              height: gHeight
            },
            rowBox: {
              left: rLeft,
              top: rTop,
              right: rRight,
              bottom: rBottom,
              width: rRect.width,
              height: rHeight
            },
            isHovered,
            isSelected,
            isFlagged
          });
        }
      }
    });

    setConnectorPaths(paths);
  }, [isOpen, inspectData, hoveredLineNumber, selectedLineNumber, showAllConnectors, selectedLinesToOverwrite]);

  // Measure viewport size and attach active ResizeObserver + scroll listeners
  useEffect(() => {
    if (!isOpen) return;

    const vpEl = imageViewportRef.current;
    const bodyEl = modalBodyRef.current;
    const textEl = textPanelRef.current;

    const updateMeasurements = () => {
      if (vpEl) {
        const rect = vpEl.getBoundingClientRect();
        setViewportSize(prev => {
          if (Math.abs(prev.width - rect.width) > 1 || Math.abs(prev.height - rect.height) > 1) {
            return { width: rect.width, height: rect.height };
          }
          return prev;
        });
      }
      updateConnectors();
    };

    // Initial measurement
    updateMeasurements();

    // ResizeObserver detects all panel changes (scan file panel, determined lines panel, phone panel, full screen)
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateMeasurements);
    });

    if (bodyEl) resizeObserver.observe(bodyEl);
    if (vpEl) resizeObserver.observe(vpEl);
    if (textEl) resizeObserver.observe(textEl);

    const handleScrollOrResize = () => {
      requestAnimationFrame(updateConnectors);
    };

    window.addEventListener('resize', handleScrollOrResize);
    if (textEl) textEl.addEventListener('scroll', handleScrollOrResize, { passive: true });
    if (vpEl) vpEl.addEventListener('scroll', handleScrollOrResize, { passive: true });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleScrollOrResize);
      if (textEl) textEl.removeEventListener('scroll', handleScrollOrResize);
      if (vpEl) vpEl.removeEventListener('scroll', handleScrollOrResize);
    };
  }, [isOpen, updateConnectors, modalMode]);

  // Sync connector positions whenever effective scale or pan changes
  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(updateConnectors);
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen, effectiveScale, pan, updateConnectors]);

  // Image pan handling
  const handleMouseDownImage = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('input')) {
      return;
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMoveImage = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
    requestAnimationFrame(updateConnectors);
  };

  const handleMouseUpImage = () => {
    setIsPanning(false);
  };

  const handleWheelImage = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setZoom(z => Math.max(0.3, Math.min(3.5, Number((z + delta).toFixed(2)))));
    }
  };

  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    requestAnimationFrame(updateConnectors);
  };

  // Draggable split resizer between left image pane and right OCR text panel
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplitter(true);
    const startX = e.clientX;
    const bodyEl = modalBodyRef.current;
    if (!bodyEl) return;
    const initialRect = bodyEl.getBoundingClientRect();
    const initialSplit = splitPercent;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidthPct = ((initialRect.width * (initialSplit / 100) + deltaX) / initialRect.width) * 100;
      const clamped = Math.max(20, Math.min(80, Math.round(newWidthPct)));
      setSplitPercent(clamped);
      try {
        localStorage.setItem('mc_ocr_split_percent', String(clamped));
      } catch {
        // ignore
      }
      requestAnimationFrame(updateConnectors);
    };

    const onMouseUp = () => {
      setIsDraggingSplitter(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      requestAnimationFrame(updateConnectors);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Auto-scroll row in text panel when bounding box clicked
  const handleBoxClick = (ln: number) => {
    setSelectedLineNumber(ln);
    const rowEl = lineRowRefs.current.get(ln);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Auto-scroll image to box when text line clicked
  const handleRowClick = (ln: number) => {
    setSelectedLineNumber(ln);
    const anchorEl = boxAnchorRefs.current.get(ln);
    if (anchorEl) {
      anchorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleCopyAll = async () => {
    const textToCopy = inspectData?.extracted_text || nodeExtractedText;
    if (textToCopy) {
      const ok = await copyToClipboard(textToCopy);
      if (ok) {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      }
    }
  };

  const handleCopySingleLine = async (e: React.MouseEvent, line: OcrLineItem) => {
    e.stopPropagation();
    const ok = await copyToClipboard(line.text);
    if (ok) {
      setCopiedLine(line.line_number);
      setTimeout(() => setCopiedLine(null), 1800);
    }
  };

  if (!isOpen) return null;

  const rawLines = inspectData?.lines || [];
  const filteredLines = rawLines.filter(l => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      String(l.line_number).includes(q) ||
      (l.text || '').toLowerCase().includes(q)
    );
  });

  const activeModel = inspectData?.model_used || nodeModelUsed;
  const activeCount = inspectData?.lines_count ?? nodeLinesCount;

  // Window container styles depending on mode
  const modalContainerStyle: React.CSSProperties = modalMode === 'inline' ? {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 0,
    flex: 1,
    margin: 0,
    borderRadius: 0,
    border: 'none',
    boxShadow: 'none',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    background: '#090d13',
    overflow: 'hidden'
  } : modalMode === 'fullscreen' ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    maxWidth: '100vw',
    maxHeight: '100vh',
    margin: 0,
    borderRadius: 0,
    border: 'none',
    boxShadow: 'none',
    zIndex: 3000,
    display: 'flex',
    flexDirection: 'column',
    background: '#090d13',
    overflow: 'hidden'
  } : modalMode === 'reduced' ? {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '920px',
    maxWidth: '96vw',
    height: '620px',
    maxHeight: '86vh',
    borderRadius: '12px',
    border: '1px solid rgba(56, 189, 248, 0.45)',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    zIndex: 3000,
    display: 'flex',
    flexDirection: 'column',
    background: '#090d13',
    overflow: 'hidden',
    animation: 'modalCardPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
  } : {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '96vw',
    maxWidth: '1720px',
    height: '88vh',
    maxHeight: '940px',
    borderRadius: '12px',
    border: '1px solid rgba(56, 189, 248, 0.45)',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    zIndex: 3000,
    display: 'flex',
    flexDirection: 'column',
    background: '#090d13',
    overflow: 'hidden',
    animation: 'modalCardPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
  };

  return (
    <>
      {/* High z-index backdrop overlay (omitted in inline mode) */}
      {modalMode !== 'inline' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 7, 12, 0.88)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 2999,
            animation: 'modalOverlayFadeIn 0.16s ease-out'
          }}
          onClick={(e) => {
            if (modalMode !== 'fullscreen' && e.target === e.currentTarget) {
              onClose();
            }
          }}
        />
      )}

      {/* Main Window Card */}
      <div style={modalContainerStyle} role="dialog" aria-modal="true">
        {/* Glow bar indicator */}
        <div style={{
          height: '2px',
          width: '100%',
          flexShrink: 0,
          background: 'linear-gradient(90deg, transparent, #38bdf8 25%, #00ff9d 75%, transparent)'
        }} />

        {/* MODAL HEADER: Title, Model Badge, Metrics, Window Controls */}
        <div style={{
          padding: '10px 16px',
          background: 'rgba(13, 17, 23, 0.95)',
          borderBottom: '1px solid rgba(48, 54, 61, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          zIndex: 25
        }}>
          {/* Left: Title & Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              background: 'linear-gradient(135deg, #38bdf8 0%, #00ff9d 100%)',
              borderRadius: '7px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.35)'
            }}>
              <FileText size={18} color="#090d13" />
            </div>
            <div>
              <div style={{
                fontSize: '14.5px',
                fontWeight: 900,
                color: '#f0f6fc',
                letterSpacing: '0.4px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap'
              }}>
                <span>{inline && modalMode === 'inline' ? 'OCR FULL INSPECTOR' : 'DAG 4: LOCAL AI OCR FULL INSPECTOR'}</span>
                <span style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                  color: '#38bdf8',
                  padding: '1px 8px',
                  borderRadius: '12px',
                  fontSize: '10.5px',
                  fontWeight: 700
                }}>
                  {activeModel}
                </span>
                <span style={{
                  background: modalMode === 'fullscreen' ? 'rgba(0, 255, 157, 0.15)' : 'rgba(139, 148, 158, 0.15)',
                  border: `1px solid ${modalMode === 'fullscreen' ? '#00ff9d55' : '#30363d'}`,
                  color: modalMode === 'fullscreen' ? '#00ff9d' : '#8b949e',
                  padding: '1px 7px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase'
                }}>
                  {modalMode} MODE
                </span>
                <span style={{
                  background: 'rgba(0, 255, 157, 0.12)',
                  border: '1px solid rgba(0, 255, 157, 0.35)',
                  color: '#00ff9d',
                  padding: '1px 7px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 800
                }}>
                  {activeCount} LINES MAPPED
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '1px' }}>
                Source Gutter Bounding Boxes • Selective Line Rescan Overwrite • Interactive Live Connectors
              </div>
            </div>
          </div>

          {/* Right: Window Controls [ Reduced | Fullscreen | Close ] */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {inline ? (
              <button
                type="button"
                onClick={() => setModalMode(m => m === 'fullscreen' ? 'inline' : 'fullscreen')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  background: modalMode === 'fullscreen' ? 'rgba(0, 255, 157, 0.2)' : '#161b22',
                  border: `1px solid ${modalMode === 'fullscreen' ? '#00ff9d' : '#30363d'}`,
                  color: modalMode === 'fullscreen' ? '#00ff9d' : '#c9d1d9',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title={modalMode === 'fullscreen' ? "Dock inspector inline into center panel" : "Expand to Full Screen View (100% viewport)"}
              >
                {modalMode === 'fullscreen' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                <span>{modalMode === 'fullscreen' ? 'Dock Inline' : 'Fullscreen'}</span>
              </button>
            ) : (
              <>
                {/* Reduced Window Size Toggle */}
                <button
                  type="button"
                  onClick={() => setModalMode(m => m === 'reduced' ? 'standard' : 'reduced')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    background: modalMode === 'reduced' ? 'rgba(56, 189, 248, 0.25)' : '#161b22',
                    border: `1px solid ${modalMode === 'reduced' ? '#38bdf8' : '#30363d'}`,
                    color: modalMode === 'reduced' ? '#38bdf8' : '#c9d1d9',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title={modalMode === 'reduced' ? "Restore to standard window size" : "Reduce window size to compact floating view"}
                >
                  <Minimize2 size={13} />
                  <span>{modalMode === 'reduced' ? 'Standard Size' : 'Reduced Size'}</span>
                </button>

                {/* Fullscreen Toggle */}
                <button
                  type="button"
                  onClick={() => setModalMode(m => m === 'fullscreen' ? 'standard' : 'fullscreen')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    background: modalMode === 'fullscreen' ? 'rgba(0, 255, 157, 0.2)' : '#161b22',
                    border: `1px solid ${modalMode === 'fullscreen' ? '#00ff9d' : '#30363d'}`,
                    color: modalMode === 'fullscreen' ? '#00ff9d' : '#c9d1d9',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title={modalMode === 'fullscreen' ? "Restore to standard window size" : "Expand to Full Screen Mode (100% viewport)"}
                >
                  <Maximize2 size={13} />
                  <span>{modalMode === 'fullscreen' ? 'Restore Window' : 'Fullscreen'}</span>
                </button>
              </>
            )}

            {/* Completely Closed (X) */}
            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                background: '#21262d',
                border: '1px solid #30363d',
                color: '#8b949e',
                cursor: 'pointer',
                marginLeft: '4px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#da3633';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.borderColor = '#f85149';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#21262d';
                e.currentTarget.style.color = '#8b949e';
                e.currentTarget.style.borderColor = '#30363d';
              }}
              title="Close OCR Inspector (Esc)"
              aria-label="Close modal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* TOP TOOLBAR: Image Selection, Selective Rescan Button, View Toggles & Zoom */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '8px 14px',
          background: '#0d1117',
          borderBottom: '1px solid #30363d',
          zIndex: 20
        }}>
          {/* Left: Active Image Title Badge & Full Rescan */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#161b22',
                border: '1px solid #30363d',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#e6edf3'
              }}
              title="Currently inspected image (Click any frame in the Captured Frames pane on the left to inspect that frame)"
            >
              <ImageIcon size={13} color="#58a6ff" />
              <span style={{ color: '#58a6ff', fontWeight: 800 }}>IMAGE:</span>
              <span style={{ color: '#f0f6fc', fontWeight: 700 }}>
                {inspectData?.image_name || selectedImageId}
              </span>
              {inspectData?.top_line && inspectData?.bottom_line ? (
                <span
                  style={{
                    color: '#00ff9d',
                    fontSize: '10px',
                    background: 'rgba(0, 255, 157, 0.12)',
                    border: '1px solid rgba(0, 255, 157, 0.25)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontWeight: 700
                  }}
                >
                  Ln {inspectData.top_line} → {inspectData.bottom_line}
                </span>
              ) : null}
              {inspectData?.image_width && inspectData?.image_height ? (
                <span style={{ color: '#8b949e', fontSize: '10px' }}>
                  {inspectData.image_width}×{inspectData.image_height}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => fetchInspectData(selectedImageId, true)}
              disabled={isRescanningAll}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px',
                background: isRescanningAll ? 'rgba(56, 189, 248, 0.2)' : '#21262d',
                border: '1px solid #38bdf888', borderRadius: '5px',
                color: '#38bdf8', fontSize: '11px', fontWeight: 700, cursor: isRescanningAll ? 'wait' : 'pointer'
              }}
              title="Force complete fresh OCR scan on this entire image"
            >
              <RotateCw size={11} className={isRescanningAll ? 'spin' : ''} />
              <span>{isRescanningAll ? 'Scanning...' : 'Rescan All'}</span>
            </button>
          </div>

          {/* Center: SELECTIVE OCR RESCAN BUTTON (Enabled when 1+ line checkboxes selected) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleRescanSelectedLines}
              disabled={selectedLinesToOverwrite.size === 0 || isRescanningSelected}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 13px',
                background: selectedLinesToOverwrite.size > 0
                  ? 'linear-gradient(135deg, rgba(255, 166, 87, 0.3) 0%, rgba(248, 81, 73, 0.3) 100%)'
                  : '#161b22',
                border: `1px solid ${selectedLinesToOverwrite.size > 0 ? '#ffa657' : '#30363d'}`,
                color: selectedLinesToOverwrite.size > 0 ? '#ffffff' : '#6e7681',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: selectedLinesToOverwrite.size > 0 && !isRescanningSelected ? 'pointer' : 'not-allowed',
                boxShadow: selectedLinesToOverwrite.size > 0
                  ? '0 0 14px rgba(255, 166, 87, 0.4), 0 2px 4px rgba(0,0,0,0.5)'
                  : 'none',
                transition: 'all 0.15s ease'
              }}
              title={selectedLinesToOverwrite.size > 0
                ? `Rescan OCR for selected lines: #${Array.from(selectedLinesToOverwrite).join(', #')} and overwrite result text`
                : "Select line checkboxes in the image gutter or text list to enable selective OCR rescan"}
            >
              <Zap size={13} color={selectedLinesToOverwrite.size > 0 ? '#ffa657' : '#6e7681'} className={isRescanningSelected ? 'spin' : ''} />
              <span>
                {isRescanningSelected
                  ? `Rescanning ${selectedLinesToOverwrite.size} line(s)...`
                  : `Rescan OCR Selected Line Numbers (${selectedLinesToOverwrite.size})`}
              </span>
            </button>

            {selectedLinesToOverwrite.size > 0 && (
              <button
                type="button"
                onClick={clearAllSelectedLines}
                style={{
                  background: 'none', border: '1px solid #30363d', color: '#8b949e',
                  fontSize: '10.5px', padding: '4px 7px', borderRadius: '4px', cursor: 'pointer'
                }}
                title="Clear selected line numbers"
              >
                Clear
              </button>
            )}

            {rescanSuccessMessage && (
              <span style={{ fontSize: '11px', color: '#00ff9d', fontWeight: 800, animation: 'fadeIn 0.2s ease' }}>
                {rescanSuccessMessage}
              </span>
            )}
          </div>

          {/* Right: View Toggles & Zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {/* Gutter Bounding Boxes Toggle */}
            <button
              type="button"
              onClick={() => setShowGutterBoxes(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
                background: showGutterBoxes ? 'rgba(255, 166, 87, 0.2)' : '#161b22',
                border: `1px solid ${showGutterBoxes ? '#ffa657' : '#30363d'}`,
                color: showGutterBoxes ? '#ffa657' : '#8b949e',
                borderRadius: '5px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer'
              }}
              title="Toggle bounding boxes and checkboxes for individual line numbers in the gutter"
            >
              {showGutterBoxes ? <CheckSquare size={12} /> : <Square size={12} />}
              <span>Gutter Boxes</span>
            </button>

            {/* Content Bounding Boxes Toggle */}
            <button
              type="button"
              onClick={() => setShowContentBoxes(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
                background: showContentBoxes ? 'rgba(56, 189, 248, 0.2)' : '#161b22',
                border: `1px solid ${showContentBoxes ? '#38bdf8' : '#30363d'}`,
                color: showContentBoxes ? '#38bdf8' : '#8b949e',
                borderRadius: '5px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer'
              }}
              title="Toggle text line bounding boxes on source image"
            >
              {showContentBoxes ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>Text Boxes</span>
            </button>

            {/* Gutter Badges Toggle */}
            <button
              type="button"
              onClick={() => setShowGutterBadges(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
                background: showGutterBadges ? 'rgba(56, 189, 248, 0.2)' : '#161b22',
                border: `1px solid ${showGutterBadges ? '#38bdf8' : '#30363d'}`,
                color: showGutterBadges ? '#38bdf8' : '#8b949e',
                borderRadius: '5px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer'
              }}
              title="Toggle line number badges next to bounding boxes on the source image"
            >
              <span>{showGutterBadges ? 'Badges: ON' : 'Badges: OFF'}</span>
            </button>

            {/* Connectors Toggle */}
            <button
              type="button"
              onClick={() => setShowAllConnectors(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
                background: showAllConnectors ? 'rgba(0, 255, 157, 0.2)' : '#161b22',
                border: `1px solid ${showAllConnectors ? '#00ff9d' : '#30363d'}`,
                color: showAllConnectors ? '#00ff9d' : '#8b949e',
                borderRadius: '5px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer'
              }}
              title={showAllConnectors ? "All line connectors active. Click to only show hovered/selected." : "Showing connectors for hovered line only. Click to show all."}
            >
              <Link2 size={12} />
              <span>{showAllConnectors ? 'Connectors: All' : 'Connectors: Focus'}</span>
            </button>

            {/* Split Presets */}
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', padding: '1px' }}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#8b949e', padding: '0 5px', textTransform: 'uppercase' }}>Split</span>
              <button
                type="button"
                onClick={() => { setSplitPercent(50); try { localStorage.setItem('mc_ocr_split_percent', '50'); } catch {} requestAnimationFrame(updateConnectors); }}
                style={{
                  background: splitPercent === 50 ? 'rgba(56, 189, 248, 0.25)' : 'none',
                  border: 'none',
                  color: splitPercent === 50 ? '#38bdf8' : '#8b949e',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  transition: 'all 0.15s ease'
                }}
                title="50% Image / 50% Text split"
              >
                50/50
              </button>
              <button
                type="button"
                onClick={() => { setSplitPercent(65); try { localStorage.setItem('mc_ocr_split_percent', '65'); } catch {} requestAnimationFrame(updateConnectors); }}
                style={{
                  background: splitPercent === 65 ? 'rgba(56, 189, 248, 0.25)' : 'none',
                  border: 'none',
                  color: splitPercent === 65 ? '#38bdf8' : '#8b949e',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  transition: 'all 0.15s ease'
                }}
                title="Image Focus: 65% Image / 35% Text"
              >
                Img 65%
              </button>
              <button
                type="button"
                onClick={() => { setSplitPercent(35); try { localStorage.setItem('mc_ocr_split_percent', '35'); } catch {} requestAnimationFrame(updateConnectors); }}
                style={{
                  background: splitPercent === 35 ? 'rgba(56, 189, 248, 0.25)' : 'none',
                  border: 'none',
                  color: splitPercent === 35 ? '#38bdf8' : '#8b949e',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  transition: 'all 0.15s ease'
                }}
                title="Text Focus: 35% Image / 65% Text"
              >
                Txt 65%
              </button>
            </div>

            {/* Quick External Panel Adaptation Toggles (Frames, Lines, Phone, Focus) */}
            {(onToggleFramesPanel || onToggleLinesPanel || onToggleStudioPanel || onFocusInspector) && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', padding: '2px 4px' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#8b949e', padding: '0 3px', textTransform: 'uppercase' }}>Panels:</span>
                {hasFramesPanel !== false && onToggleFramesPanel && (
                  <button
                    type="button"
                    onClick={onToggleFramesPanel}
                    style={{
                      background: !isFramesMinimized ? 'rgba(0, 255, 157, 0.18)' : '#21262d',
                      border: `1px solid ${!isFramesMinimized ? 'rgba(0, 255, 157, 0.4)' : '#30363d'}`,
                      color: !isFramesMinimized ? '#00ff9d' : '#8b949e',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '3px'
                    }}
                    title={!isFramesMinimized ? "Minimize Captured Frames sidebar" : "Restore Captured Frames sidebar"}
                  >
                    Frames
                  </button>
                )}
                {hasLinesPanel !== false && onToggleLinesPanel && (
                  <button
                    type="button"
                    onClick={onToggleLinesPanel}
                    style={{
                      background: !isLinesPanelMinimized ? 'rgba(0, 255, 157, 0.18)' : '#21262d',
                      border: `1px solid ${!isLinesPanelMinimized ? 'rgba(0, 255, 157, 0.4)' : '#30363d'}`,
                      color: !isLinesPanelMinimized ? '#00ff9d' : '#8b949e',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '3px'
                    }}
                    title={!isLinesPanelMinimized ? "Minimize Determined Lines panel" : "Restore Determined Lines panel"}
                  >
                    Lines
                  </button>
                )}
                {hasStudioPanel !== false && onToggleStudioPanel && (
                  <button
                    type="button"
                    onClick={onToggleStudioPanel}
                    style={{
                      background: isStudioPanelOpen ? 'rgba(56, 189, 248, 0.2)' : '#21262d',
                      border: `1px solid ${isStudioPanelOpen ? 'rgba(56, 189, 248, 0.4)' : '#30363d'}`,
                      color: isStudioPanelOpen ? '#38bdf8' : '#8b949e',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '3px'
                    }}
                    title={isStudioPanelOpen ? "Close Phone Studio drawer" : "Open Phone Studio drawer"}
                  >
                    Phone
                  </button>
                )}
                {onFocusInspector && (
                  <button
                    type="button"
                    onClick={onFocusInspector}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.5)',
                      color: '#38bdf8',
                      fontSize: '10px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '3px'
                    }}
                    title="Maximize OCR Inspector aspect ratio by auto-collapsing outer sidebars"
                  >
                    Focus View
                  </button>
                )}
              </div>
            )}

            {/* View Mode Toggle: Fit Page / Fit Width */}
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', padding: '1px' }}>
              <button
                type="button"
                onClick={() => { setFitMode('contain'); setZoom(1.0); }}
                style={{
                  background: fitMode === 'contain' && zoom === 1.0 ? 'rgba(56, 189, 248, 0.25)' : 'none',
                  border: 'none',
                  color: fitMode === 'contain' && zoom === 1.0 ? '#38bdf8' : '#8b949e',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '3px 7px',
                  borderRadius: '3px',
                  transition: 'all 0.15s ease'
                }}
                title="Fit entire image in view (no scrolling)"
              >
                Fit Page
              </button>
              <button
                type="button"
                onClick={() => { setFitMode('width'); setZoom(1.0); }}
                style={{
                  background: fitMode === 'width' && zoom === 1.0 ? 'rgba(56, 189, 248, 0.25)' : 'none',
                  border: 'none',
                  color: fitMode === 'width' && zoom === 1.0 ? '#38bdf8' : '#8b949e',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '3px 7px',
                  borderRadius: '3px',
                  transition: 'all 0.15s ease'
                }}
                title="Fit width of pane (readable code, scroll vertically)"
              >
                Fit Width
              </button>
            </div>

            {/* Zoom Controls */}
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', padding: '1px' }}>
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.3, Number((z - 0.15).toFixed(2))))}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '3px 6px' }}
                title="Zoom Out Image (Ctrl+Scroll also supported)"
              >
                <ZoomOut size={12} />
              </button>
              <span style={{ fontSize: '10px', color: '#58a6ff', fontWeight: 800, padding: '0 4px', minWidth: '36px', textAlign: 'center' }}>
                {zoom === 1.0 ? (fitMode === 'contain' ? 'Fit' : 'Width') : `${(zoom * 100).toFixed(0)}%`}
              </span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(3.5, Number((z + 0.15).toFixed(2))))}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '3px 6px' }}
                title="Zoom In Image (Ctrl+Scroll also supported)"
              >
                <ZoomIn size={12} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '3px 6px', borderLeft: '1px solid #30363d' }}
                title="Reset View to Fit Container Aspect Ratio"
              >
                <Maximize2 size={11} />
              </button>
            </div>

            {/* Copy All Text */}
            <button
              type="button"
              onClick={handleCopyAll}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px',
                background: copiedAll ? 'rgba(0, 255, 157, 0.2)' : '#21262d',
                border: `1px solid ${copiedAll ? '#00ff9d' : '#30363d'}`,
                color: copiedAll ? '#00ff9d' : '#e6edf3',
                borderRadius: '5px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer'
              }}
              title="Copy complete verbatim extracted text"
            >
              {copiedAll ? <Check size={11} color="#00ff9d" /> : <Copy size={11} />}
              <span>{copiedAll ? 'Copied All!' : 'Copy Text'}</span>
            </button>
          </div>
        </div>

        {/* MAIN SPLIT WORKSPACE: Left Image Pane & Right Verbatim Code Pane */}
        <div
          ref={modalBodyRef}
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `${splitPercent}% 6px calc(${100 - splitPercent}% - 6px)`,
            flex: 1,
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            background: '#090d13'
          }}
        >
          {/* LEFT PANE: Interactive Source Image with Gutter Bounding Boxes & Layer Checkboxes */}
          <div
            ref={imageViewportRef}
            onMouseDown={handleMouseDownImage}
            onMouseMove={handleMouseMoveImage}
            onMouseUp={handleMouseUpImage}
            onMouseLeave={handleMouseUpImage}
            onWheel={handleWheelImage}
            style={{
              position: 'relative',
              overflow: 'auto',
              background: '#05070a radial-gradient(circle, rgba(56, 189, 248, 0.05) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              borderRight: '1px solid #30363d',
              cursor: isPanning ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'flex-start',
              padding: '16px'
            }}
          >
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: '#58a6ff' }}>
                <RotateCw size={24} className="spin" />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Loading Source Image & Gutter Line Coordinates...</span>
              </div>
            ) : error ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px', color: '#f85149', padding: '20px', textAlign: 'center' }}>
                <AlertCircle size={24} />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Inspection Error</span>
                <span style={{ fontSize: '11px', color: '#8b949e', maxWidth: '340px' }}>{error}</span>
                {selectedImageId && (
                  <button
                    type="button"
                    onClick={() => fetchInspectData(selectedImageId)}
                    style={{ marginTop: '8px', padding: '4px 10px', background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Retry Inspection
                  </button>
                )}
              </div>
            ) : (!inspectData || !selectedImageId) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: '#8b949e', padding: '30px', textAlign: 'center' }}>
                <ImageIcon size={32} color="#30363d" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#c9d1d9' }}>No Active Project Frames Available</span>
                <span style={{ fontSize: '11px', maxWidth: '360px', lineHeight: 1.45, color: '#8b949e' }}>
                  This project does not have any captured frames yet. Run the DAG pipeline or double-click a frame in the sidebar to inspect OCR text and bounding boxes.
                </span>
              </div>
            ) : (
              <div
                style={{
                  position: 'relative',
                  width: `${Math.round(imgNaturalWidth * effectiveScale)}px`,
                  height: `${Math.round(imgNaturalHeight * effectiveScale)}px`,
                  flexShrink: 0,
                  margin: '0 auto',
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                  transition: isPanning ? 'none' : 'transform 0.1s ease, width 0.15s ease, height 0.15s ease',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
                  borderRadius: '6px',
                  userSelect: 'none'
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${imgNaturalWidth}px`,
                    height: `${imgNaturalHeight}px`,
                    transform: `scale(${effectiveScale})`,
                    transformOrigin: 'top left'
                  }}
                >
                  {/* Source Image */}
                  <img
                    ref={imageElementRef}
                    src={inspectData?.image_url || `${apiBase}/api/frames/${selectedImageId}/image`}
                    alt="Source OCR Frame"
                    draggable={false}
                    onLoad={() => requestAnimationFrame(updateConnectors)}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: '100%',
                      borderRadius: '6px',
                      pointerEvents: 'none'
                    }}
                  />

                {/* Overlaid SVG Bounding Boxes Layer (Gutter Boxes & Content Boxes) */}
                <svg
                  viewBox={`0 0 ${imgNaturalWidth} ${imgNaturalHeight}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                  }}
                >
                  <defs>
                    <filter id="neonGlowCyan" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00ff9d" floodOpacity="0.8" />
                    </filter>
                    <filter id="neonGlowBlue" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.6" />
                    </filter>
                    <filter id="neonGlowAmber" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#ffa657" floodOpacity="0.85" />
                    </filter>
                  </defs>

                  {/* 1. Gutter Line Number Bounding Boxes */}
                  {showGutterBoxes && inspectData?.lines.map(line => {
                    const ln = line.line_number;
                    const gBox = line.gutter_bbox || inspectData.bounding_boxes?.gutter_boxes?.[ln];
                    if (!gBox) return null;

                    const isFlagged = selectedLinesToOverwrite.has(ln);
                    const isHovered = ln === (hoveredLineNumber ?? selectedLineNumber);
                    const isSelected = ln === selectedLineNumber;

                    const strokeColor = isFlagged
                      ? '#ffa657'
                      : (isSelected ? '#00ff9d' : (isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.45)'));
                    const fillColor = isFlagged
                      ? 'rgba(255, 166, 87, 0.24)'
                      : (isSelected ? 'rgba(0, 255, 157, 0.22)' : (isHovered ? 'rgba(56, 189, 248, 0.16)' : 'rgba(13, 17, 23, 0.45)'));

                    const pillWidth = Math.max(gBox.width, 36);
                    const pillHeight = Math.max(gBox.height, 22);

                    return (
                      <g
                        key={`svg_gutter_box_${ln}`}
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredLineNumber(ln)}
                        onMouseLeave={() => setHoveredLineNumber(null)}
                        onClick={() => toggleLineOverwrite(ln)}
                      >
                        <rect
                          x={gBox.x}
                          y={gBox.y}
                          width={pillWidth}
                          height={pillHeight}
                          rx={3}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isFlagged ? 2.2 : (isHovered || isSelected ? 2.0 : 1.2)}
                          strokeDasharray={gBox.interpolated ? '3 2' : undefined}
                          filter={isFlagged ? 'url(#neonGlowAmber)' : (isHovered || isSelected ? 'url(#neonGlowCyan)' : undefined)}
                        />
                      </g>
                    );
                  })}

                  {/* 2. Text Content Bounding Boxes */}
                  {showContentBoxes && inspectData?.lines.map(line => {
                    const ln = line.line_number;
                    const box = line.bbox || inspectData.bounding_boxes?.line_boxes?.[ln];
                    if (!box) return null;

                    const isFlagged = selectedLinesToOverwrite.has(ln);
                    const isHovered = ln === (hoveredLineNumber ?? selectedLineNumber);
                    const isSelected = ln === selectedLineNumber;

                    const strokeColor = isFlagged
                      ? 'rgba(255, 166, 87, 0.85)'
                      : (isSelected ? '#00ff9d' : (isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.6)'));
                    const fillColor = isFlagged
                      ? 'rgba(255, 166, 87, 0.14)'
                      : (isSelected ? 'rgba(0, 255, 157, 0.22)' : (isHovered ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.05)'));

                    return (
                      <g
                        key={`svg_content_box_${ln}`}
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredLineNumber(ln)}
                        onMouseLeave={() => setHoveredLineNumber(null)}
                        onClick={() => handleBoxClick(ln)}
                      >
                        <rect
                          x={box.x}
                          y={box.y}
                          width={box.width}
                          height={box.height}
                          rx={3}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isHovered || isSelected ? 2.5 : 1.2}
                          strokeDasharray={box.interpolated ? '4 3' : undefined}
                          filter={isHovered || isSelected ? 'url(#neonGlowCyan)' : undefined}
                        />

                        {/* Optional Badges on Source Image */}
                        {showGutterBadges && (
                          <g transform={`translate(${Math.max(4, box.x - 28)}, ${box.y + box.height / 2})`}>
                            <rect
                              x={-18}
                              y={-9}
                              width={24}
                              height={18}
                              rx={3}
                              fill={isFlagged ? '#ffa657' : (isHovered || isSelected ? '#00ff9d' : '#161b22')}
                              stroke={isFlagged ? '#ffa657' : (isHovered || isSelected ? '#00ff9d' : '#38bdf8')}
                              strokeWidth={1}
                            />
                            <text
                              x={-6}
                              y={3}
                              fill={isFlagged || isHovered || isSelected ? '#0d1117' : '#e6edf3'}
                              fontSize={10}
                              fontWeight={900}
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              {ln}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* 3. INTERACTIVE LAYER CHECKBOXES OVER INDIVIDUAL LINE NUMBERS IN THE GUTTER */}
                {showGutterBoxes && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: `${imgNaturalWidth}px`,
                      height: `${imgNaturalHeight}px`,
                      pointerEvents: 'none'
                    }}
                  >
                    {inspectData?.lines.map(line => {
                      const ln = line.line_number;
                      const gBox = line.gutter_bbox || inspectData.bounding_boxes?.gutter_boxes?.[ln];
                      if (!gBox) return null;

                      const isFlagged = selectedLinesToOverwrite.has(ln);
                      const isHovered = ln === (hoveredLineNumber ?? selectedLineNumber);

                      const pillWidth = Math.max(gBox.width, 36);
                      const pillHeight = Math.max(gBox.height, 22);

                      return (
                        <div
                          key={`gutter_chk_overlay_${ln}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLineOverwrite(ln);
                          }}
                          onMouseEnter={() => setHoveredLineNumber(ln)}
                          onMouseLeave={() => setHoveredLineNumber(null)}
                          style={{
                            position: 'absolute',
                            left: `${gBox.x}px`,
                            top: `${gBox.y}px`,
                            width: `${pillWidth}px`,
                            height: `${pillHeight}px`,
                            pointerEvents: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '3px',
                            background: isFlagged
                              ? 'rgba(255, 166, 87, 0.38)'
                              : (isHovered ? 'rgba(56, 189, 248, 0.28)' : 'rgba(9, 13, 19, 0.22)'),
                            border: `1px solid ${isFlagged ? '#ffa657' : (isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.35)')}`,
                            backdropFilter: 'blur(2px)',
                            WebkitBackdropFilter: 'blur(2px)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            boxShadow: isFlagged
                              ? '0 0 10px rgba(255, 166, 87, 0.7)'
                              : (isHovered ? '0 0 8px rgba(56, 189, 248, 0.4)' : 'none'),
                            transition: 'all 0.12s ease',
                            userSelect: 'none',
                            padding: '0 2px'
                          }}
                          title={`Line ${ln}: Click to ${isFlagged ? 'unflag' : 'flag for selective OCR rescan and overwrite'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isFlagged}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleLineOverwrite(ln);
                            }}
                            style={{
                              cursor: 'pointer',
                              accentColor: '#ffa657',
                              width: '12px',
                              height: '12px',
                              margin: 0
                            }}
                          />
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '10px',
                              fontWeight: 900,
                              color: isFlagged ? '#ffffff' : (isHovered ? '#38bdf8' : '#e6edf3')
                            }}
                          >
                            {ln}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                  {/* Gutter Bounding Area Nodes for Connector Lines (Illustrates the 2D bounding area around the line number gutter) */}
                  {inspectData?.lines.map(line => {
                    const ln = line.line_number;
                    const gBox = line.gutter_bbox || inspectData.bounding_boxes?.gutter_boxes?.[ln];
                    const cBox = line.bbox || inspectData.bounding_boxes?.line_boxes?.[ln];

                    const pillWidth = gBox ? Math.max(gBox.width, 36) : 36;
                    const pillHeight = gBox ? Math.max(gBox.height, 22) : 22;
                    const anchorX = gBox ? gBox.x : (cBox ? Math.max(0, cBox.x - pillWidth - 10) : 10);
                    const anchorY = gBox ? gBox.y : (cBox ? cBox.y : 40);

                    return (
                      <div
                        key={`gutter_anchor_${ln}`}
                        ref={(el) => {
                          if (el) boxAnchorRefs.current.set(ln, el);
                          else boxAnchorRefs.current.delete(ln);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${anchorX}px`,
                          top: `${anchorY}px`,
                          width: `${pillWidth}px`,
                          height: `${pillHeight}px`,
                          pointerEvents: 'none'
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* DRAGGABLE VERTICAL COLUMN SPLITTER */}
          <div
            onMouseDown={handleSplitterMouseDown}
            style={{
              width: '6px',
              height: '100%',
              cursor: 'col-resize',
              background: isDraggingSplitter
                ? '#38bdf8'
                : 'linear-gradient(180deg, #161b22 0%, #21262d 50%, #161b22 100%)',
              borderLeft: '1px solid #30363d',
              borderRight: '1px solid #30363d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 16,
              userSelect: 'none',
              transition: isDraggingSplitter ? 'none' : 'background 0.15s ease'
            }}
            title="Drag to adjust Image vs OCR text pane width (Double-click to reset 50/50)"
            onDoubleClick={() => {
              setSplitPercent(50);
              try { localStorage.setItem('mc_ocr_split_percent', '50'); } catch {}
              requestAnimationFrame(updateConnectors);
            }}
          >
            <div style={{
              width: '2px',
              height: '24px',
              borderRadius: '2px',
              background: isDraggingSplitter ? '#ffffff' : '#8b949e',
              opacity: 0.8
            }} />
          </div>

          {/* DYNAMIC CONNECTOR SVG LAYER (Overlay between Left Image & Right Text Panel) */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 15
            }}
          >
            <defs>
              <filter id="connectorGlowCyan" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#00ff9d" floodOpacity="0.9" />
              </filter>
              <filter id="connectorGlowAmber" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#ffa657" floodOpacity="0.9" />
              </filter>
            </defs>

            {connectorPaths.map(conn => {
              const strokeColor = conn.isFlagged
                ? '#ffa657'
                : (conn.isSelected ? '#00ff9d' : (conn.isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.22)'));
              const strokeWidth = conn.isFlagged || conn.isSelected || conn.isHovered ? 2.5 : 1.0;
              const filterId = conn.isFlagged ? 'url(#connectorGlowAmber)' : (conn.isHovered || conn.isSelected ? 'url(#connectorGlowCyan)' : undefined);

              return (
                <g key={`conn_${conn.lineNumber}`}>
                  {/* Translucent ribbon connecting full gutter bounding area to code row */}
                  {conn.ribbonD && (
                    <path
                      d={conn.ribbonD}
                      fill={conn.isFlagged ? 'rgba(255, 166, 87, 0.12)' : (conn.isSelected ? 'rgba(0, 255, 157, 0.14)' : 'rgba(56, 189, 248, 0.14)')}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* Illustrate Bounding Area around the Line Number Gutter */}
                  {(conn.isHovered || conn.isSelected || conn.isFlagged) && conn.gutterBox.width > 0 && (
                    <>
                      <rect
                        x={conn.gutterBox.left}
                        y={conn.gutterBox.top}
                        width={conn.gutterBox.width}
                        height={conn.gutterBox.height}
                        rx="4"
                        fill={conn.isFlagged ? 'rgba(255, 166, 87, 0.12)' : (conn.isSelected ? 'rgba(0, 255, 157, 0.12)' : 'rgba(56, 189, 248, 0.1)')}
                        stroke={strokeColor}
                        strokeWidth={1.5}
                        filter={filterId}
                      />
                      {/* Right-bracket accent on the gutter bounding area exit boundary */}
                      <path
                        d={`M ${conn.gutterBox.right - 4} ${conn.gutterBox.top} L ${conn.gutterBox.right} ${conn.gutterBox.top} L ${conn.gutterBox.right} ${conn.gutterBox.bottom} L ${conn.gutterBox.right - 4} ${conn.gutterBox.bottom}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={2}
                      />
                    </>
                  )}

                  {/* Connecting spine bezier curve from gutter box right edge to text row left edge */}
                  <path
                    d={conn.d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={conn.isHovered || conn.isSelected || conn.isFlagged ? undefined : '3 3'}
                    filter={filterId}
                  />

                  {/* Anchor dot on right edge of gutter bounding area */}
                  <circle
                    cx={conn.x1}
                    cy={conn.y1}
                    r={conn.isFlagged || conn.isHovered || conn.isSelected ? 4 : 2}
                    fill={strokeColor}
                  />

                  {/* Anchor dot on left edge of OCR transcribed text row */}
                  <circle
                    cx={conn.x2}
                    cy={conn.y2}
                    r={conn.isFlagged || conn.isHovered || conn.isSelected ? 4 : 2}
                    fill={strokeColor}
                  />

                  {/* Left accent bracket on text row entry boundary for highlighted rows */}
                  {(conn.isHovered || conn.isSelected || conn.isFlagged) && conn.rowBox.height > 0 && (
                    <path
                      d={`M ${conn.rowBox.left + 4} ${conn.rowBox.top} L ${conn.rowBox.left} ${conn.rowBox.top} L ${conn.rowBox.left} ${conn.rowBox.bottom} L ${conn.rowBox.left + 4} ${conn.rowBox.bottom}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={2}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* RIGHT PANE: Acquired OCR Result Text with Line Mappings & Checkboxes */}
          <div
            ref={textPanelRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: '#0d1117',
              overflowY: 'auto',
              borderLeft: '1px solid #30363d'
            }}
          >
            {/* Search Filter Header & Quick Selection Toolbar */}
            <div style={{
              position: 'sticky',
              top: 0,
              background: '#161b22',
              padding: '8px 12px',
              borderBottom: '1px solid #30363d',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px', flex: 1,
                  background: '#0d1117', border: '1px solid #30363d', borderRadius: '5px', padding: '3px 8px'
                }}>
                  <Search size={12} color="#8b949e" />
                  <input
                    type="text"
                    placeholder="Search verbatim lines or numbers..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    style={{
                      background: 'none', border: 'none', color: '#e6edf3',
                      fontSize: '11px', outline: 'none', width: '100%', fontFamily: 'inherit'
                    }}
                  />
                </div>
                <span style={{ fontSize: '10.5px', color: '#8b949e', whiteSpace: 'nowrap' }}>
                  {filteredLines.length} of {rawLines.length} lines
                </span>
              </div>

              {/* Quick line selection bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: '#8b949e' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={selectAllLinesToOverwrite}
                    style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                  >
                    Select All Lines
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={clearAllSelectedLines}
                    style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 0 }}
                  >
                    Deselect All
                  </button>
                </div>
                {selectedLinesToOverwrite.size > 0 && (
                  <span style={{ color: '#ffa657', fontWeight: 800 }}>
                    ⚡ {selectedLinesToOverwrite.size} line(s) flagged to overwrite
                  </span>
                )}
              </div>
            </div>

            {/* Verbatim Code Lines List */}
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {filteredLines.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#8b949e', fontSize: '12px' }}>
                  {searchFilter ? `No matching OCR lines found for "${searchFilter}"` : 'No OCR lines mapped for this image yet.'}
                </div>
              ) : (
                filteredLines.map(line => {
                  const ln = line.line_number;
                  const isFlagged = selectedLinesToOverwrite.has(ln);
                  const isHovered = ln === (hoveredLineNumber ?? selectedLineNumber);
                  const isSelected = ln === selectedLineNumber;

                  return (
                    <div
                      key={`text_row_${ln}`}
                      ref={(el) => {
                        if (el) lineRowRefs.current.set(ln, el);
                        else lineRowRefs.current.delete(ln);
                      }}
                      onMouseEnter={() => setHoveredLineNumber(ln)}
                      onMouseLeave={() => setHoveredLineNumber(null)}
                      onClick={() => handleRowClick(ln)}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '7px',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        background: isFlagged
                          ? 'rgba(255, 166, 87, 0.18)'
                          : (isSelected
                            ? 'rgba(0, 255, 157, 0.16)'
                            : (isHovered ? 'rgba(56, 189, 248, 0.14)' : 'transparent')),
                        border: `1px solid ${isFlagged ? '#ffa657' : (isSelected ? '#00ff9d88' : (isHovered ? '#38bdf866' : 'transparent'))}`,
                        cursor: 'pointer',
                        transition: 'background 0.12s ease, border 0.12s ease'
                      }}
                    >
                      {/* Left Target Connector Dot */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '-2px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          background: isFlagged ? '#ffa657' : (isSelected ? '#00ff9d' : (isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.4)'))
                        }}
                      />

                      {/* Checkbox to flag line for overwrite */}
                      <input
                        type="checkbox"
                        checked={isFlagged}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleLineOverwrite(ln);
                        }}
                        style={{
                          cursor: 'pointer',
                          accentColor: '#ffa657',
                          width: '13px',
                          height: '13px',
                          marginTop: '2px'
                        }}
                        title={`Flag Line ${ln} to be overwritten by selective OCR rescan`}
                      />

                      {/* Line Number Pill */}
                      <span
                        style={{
                          minWidth: '28px',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          fontWeight: 800,
                          color: isFlagged ? '#ffa657' : (isSelected ? '#00ff9d' : (isHovered ? '#38bdf8' : '#58a6ff')),
                          userSelect: 'none'
                        }}
                      >
                        {ln}
                      </span>

                      {/* Verbatim Text Line */}
                      <div
                        style={{
                          flex: 1,
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: '11.5px',
                          lineHeight: 1.45,
                          color: line.is_blank ? '#484f58' : (isSelected || isFlagged ? '#ffffff' : '#e6edf3'),
                          fontStyle: line.is_blank ? 'italic' : 'normal',
                          wordBreak: 'break-all',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {line.text || '(empty line)'}
                      </div>

                      {/* Badges: FLAGGED FOR OVERWRITE / Rescanned / Wrap / Copy */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: isHovered || isSelected || isFlagged ? 1 : 0.6 }}>
                        {isFlagged && (
                          <span
                            style={{
                              fontSize: '9px', fontWeight: 800, padding: '1px 5px',
                              background: 'rgba(255, 166, 87, 0.25)', border: '1px solid #ffa657',
                              color: '#ffa657', borderRadius: '3px', whiteSpace: 'nowrap'
                            }}
                            title="Flagged to be overwritten on selective OCR rescan"
                          >
                            ⚡ FLAGGED
                          </span>
                        )}

                        {line.overwritten && (
                          <span
                            style={{
                              fontSize: '9px', fontWeight: 800, padding: '1px 5px',
                              background: 'rgba(0, 255, 157, 0.2)', border: '1px solid #00ff9d88',
                              color: '#00ff9d', borderRadius: '3px', whiteSpace: 'nowrap'
                            }}
                            title={`Line was successfully rescanned and overwritten${line.rescanned_at ? ` at ${line.rescanned_at}` : ''}`}
                          >
                            Rescanned ✓
                          </span>
                        )}

                        {line.is_wrapped && (
                          <span
                            style={{
                              fontSize: '9px', fontWeight: 800, padding: '1px 4px',
                              background: 'rgba(255, 166, 87, 0.2)', border: '1px solid #ffa65788',
                              color: '#ffa657', borderRadius: '3px'
                            }}
                            title="Line is wrapped across multiple visual rows"
                          >
                            wrap
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleCopySingleLine(e, line)}
                          style={{
                            background: 'none', border: 'none', padding: '2px 4px',
                            color: copiedLine === ln ? '#00ff9d' : '#8b949e',
                            cursor: 'pointer'
                          }}
                          title="Copy line text"
                        >
                          {copiedLine === ln ? <Check size={11} color="#00ff9d" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM STATUS FOOTER */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: '#0d1117',
          borderTop: '1px solid #21262d',
          fontSize: '11px',
          color: '#8b949e',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff9d', display: 'inline-block' }} />
              <span>Gutter Line Boxes & Live Connectors Synced</span>
            </span>
            <span>•</span>
            <span>Check gutter or text box to flag for selective rescan</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {selectedLinesToOverwrite.size > 0 && (
              <button
                type="button"
                onClick={handleRescanSelectedLines}
                disabled={isRescanningSelected}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 12px',
                  background: 'linear-gradient(135deg, rgba(255, 166, 87, 0.25) 0%, rgba(248, 81, 73, 0.25) 100%)',
                  border: '1px solid #ffa657', color: '#ffa657', borderRadius: '6px',
                  fontSize: '11px', fontWeight: 800, cursor: isRescanningSelected ? 'wait' : 'pointer'
                }}
              >
                <Zap size={12} className={isRescanningSelected ? 'spin' : ''} />
                <span>Rescan OCR Selected Line Numbers ({selectedLinesToOverwrite.size})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '4px 14px', background: '#21262d', border: '1px solid #30363d',
                color: '#e6edf3', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
