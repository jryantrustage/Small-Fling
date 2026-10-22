import React, { useState, useEffect, useRef, useCallback } from 'react';
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
}

interface ConnectorPath {
  lineNumber: number;
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
  onRefresh
}) => {
  // Window display modes: 'fullscreen' (100vw x 100vh), 'standard' (wide floating), 'reduced' (compact floating)
  const [modalMode, setModalMode] = useState<'fullscreen' | 'standard' | 'reduced'>('fullscreen');

  const [selectedImageId, setSelectedImageId] = useState<string>(initialImageId);
  const [availableImages, setAvailableImages] = useState<AvailableOcrImage[]>([]);
  const [inspectData, setInspectData] = useState<OcrInspectionData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRescanningAll, setIsRescanningAll] = useState<boolean>(false);
  const [isRescanningSelected, setIsRescanningSelected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rescanSuccessMessage, setRescanSuccessMessage] = useState<string | null>(null);

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
        }
      }
    } catch (e) {
      console.warn('[Dag4OcrFullInspectorModal] Failed to fetch available images:', e);
    }
  }, [apiBase]);

  // Fetch inspection data for selected image
  const fetchInspectData = useCallback(async (imgId: string, forceRescan: boolean = false) => {
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
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: OcrInspectionData = await res.json();
      setInspectData(data);
      if (data.available_images && data.available_images.length > 0) {
        setAvailableImages(data.available_images);
      }
      if (forceRescan && onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to inspect image OCR text and bounding boxes');
    } finally {
      setIsLoading(false);
      setIsRescanningAll(false);
    }
  }, [apiBase, onRefresh]);

  // Initial load
  useEffect(() => {
    if (isOpen) {
      fetchAvailableImages();
      fetchInspectData(selectedImageId);
    }
  }, [isOpen, selectedImageId, fetchAvailableImages, fetchInspectData]);

  // When initialImageId prop changes, update selection
  useEffect(() => {
    if (initialImageId) {
      setSelectedImageId(initialImageId);
    }
  }, [initialImageId]);

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

        const x1 = aRect.right - containerRect.left;
        const y1 = aRect.top + aRect.height / 2 - containerRect.top;
        const x2 = rRect.left - containerRect.left;
        const y2 = rRect.top + rRect.height / 2 - containerRect.top;

        if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
          const dx = Math.max(35, Math.abs(x2 - x1) * 0.45);
          const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
          paths.push({
            lineNumber: ln,
            d,
            x1,
            y1,
            x2,
            y2,
            isHovered,
            isSelected,
            isFlagged
          });
        }
      }
    });

    setConnectorPaths(paths);
  }, [isOpen, inspectData, hoveredLineNumber, selectedLineNumber, showAllConnectors, selectedLinesToOverwrite]);

  // Attach ResizeObserver and scroll listeners to recompute connectors smoothly
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(updateConnectors, 60);

    const handleScrollOrResize = () => {
      requestAnimationFrame(updateConnectors);
    };

    window.addEventListener('resize', handleScrollOrResize);
    const textPanel = textPanelRef.current;
    const imgVp = imageViewportRef.current;

    if (textPanel) textPanel.addEventListener('scroll', handleScrollOrResize, { passive: true });
    if (imgVp) imgVp.addEventListener('scroll', handleScrollOrResize, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleScrollOrResize);
      if (textPanel) textPanel.removeEventListener('scroll', handleScrollOrResize);
      if (imgVp) imgVp.removeEventListener('scroll', handleScrollOrResize);
    };
  }, [isOpen, updateConnectors, zoom, pan, inspectData]);

  // Image pan handling
  const handleMouseDownImage = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
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

  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    requestAnimationFrame(updateConnectors);
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

  const imgNaturalWidth = inspectData?.image_width || 1920;
  const imgNaturalHeight = inspectData?.image_height || 1080;
  const activeModel = inspectData?.model_used || nodeModelUsed;
  const activeCount = inspectData?.lines_count ?? nodeLinesCount;

  // Window container styles depending on mode
  const modalContainerStyle: React.CSSProperties = modalMode === 'fullscreen' ? {
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
      {/* High z-index backdrop overlay */}
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
                <span>DAG 4: LOCAL AI OCR FULL INSPECTOR</span>
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
              title="Completely close OCR Full Inspector (Esc)"
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
          {/* Left: Image selector & Full Rescan */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '11px', fontWeight: 800, color: '#58a6ff', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ImageIcon size={13} color="#58a6ff" />
              <span>IMAGE:</span>
            </label>
            <select
              value={selectedImageId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedImageId(nextId);
                fetchInspectData(nextId);
              }}
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#e6edf3',
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: '6px',
                outline: 'none',
                cursor: 'pointer',
                maxWidth: '260px'
              }}
            >
              {availableImages.map(img => (
                <option key={img.id} value={img.id}>
                  {img.label} {img.size ? `(${(img.size / 1024).toFixed(0)} KB)` : ''}
                </option>
              ))}
            </select>

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

            {/* Zoom Controls */}
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', padding: '1px' }}>
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '3px 6px' }}
                title="Zoom Out Image"
              >
                <ZoomOut size={12} />
              </button>
              <span style={{ fontSize: '10px', color: '#58a6ff', fontWeight: 800, padding: '0 4px', minWidth: '32px', textAlign: 'center' }}>
                {(zoom * 100).toFixed(0)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(3.0, Number((z + 0.15).toFixed(2))))}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '3px 6px' }}
                title="Zoom In Image"
              >
                <ZoomIn size={12} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '3px 6px', borderLeft: '1px solid #30363d' }}
                title="Reset View (1:1 / Fit)"
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
            gridTemplateColumns: modalMode === 'reduced' ? 'minmax(340px, 1fr) minmax(320px, 1fr)' : 'minmax(460px, 1.15fr) minmax(380px, 1fr)',
            flex: 1,
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
            style={{
              position: 'relative',
              overflow: 'auto',
              background: '#05070a radial-gradient(circle, rgba(56, 189, 248, 0.05) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              borderRight: '1px solid #30363d',
              cursor: isPanning ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
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
                <button
                  type="button"
                  onClick={() => fetchInspectData(selectedImageId)}
                  style={{ marginTop: '8px', padding: '4px 10px', background: '#21262d', border: '1px solid #30363d', color: '#e6edf3', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Retry Inspection
                </button>
              </div>
            ) : (
              <div
                style={{
                  position: 'relative',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'top left',
                  transition: isPanning ? 'none' : 'transform 0.1s ease',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
                  borderRadius: '6px',
                  display: 'inline-block'
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
                    maxWidth: '100%',
                    width: `${imgNaturalWidth}px`,
                    height: `${imgNaturalHeight}px`,
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
                          width={gBox.width}
                          height={gBox.height}
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
                              ? 'rgba(255, 166, 87, 0.45)'
                              : (isHovered ? 'rgba(56, 189, 248, 0.35)' : 'rgba(9, 13, 19, 0.72)'),
                            border: `1px solid ${isFlagged ? '#ffa657' : (isHovered ? '#38bdf8' : 'rgba(48, 54, 61, 0.85)')}`,
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

                {/* Right Anchor Nodes for Connector Lines (HTML Div Elements tracked in DOM) */}
                {inspectData?.lines.map(line => {
                  const ln = line.line_number;
                  const box = line.bbox || inspectData.bounding_boxes?.line_boxes?.[ln];
                  if (!box) return null;

                  return (
                    <div
                      key={`box_anchor_${ln}`}
                      ref={(el) => {
                        if (el) boxAnchorRefs.current.set(ln, el);
                        else boxAnchorRefs.current.delete(ln);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${box.x + box.width}px`,
                        top: `${box.y + box.height / 2}px`,
                        width: '1px',
                        height: '1px',
                        pointerEvents: 'none'
                      }}
                    />
                  );
                })}
              </div>
            )}
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
                  {/* Bezier connecting curve */}
                  <path
                    d={conn.d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={conn.isHovered || conn.isSelected || conn.isFlagged ? undefined : '3 3'}
                    filter={filterId}
                  />

                  {/* Start dot on Image Bounding Box */}
                  <circle
                    cx={conn.x1}
                    cy={conn.y1}
                    r={conn.isFlagged || conn.isHovered || conn.isSelected ? 4 : 2}
                    fill={strokeColor}
                  />

                  {/* End dot on Acquired Text Row */}
                  <circle
                    cx={conn.x2}
                    cy={conn.y2}
                    r={conn.isFlagged || conn.isHovered || conn.isSelected ? 4 : 2}
                    fill={strokeColor}
                  />
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
                  No matching OCR lines found for &quot;{searchFilter}&quot;
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
