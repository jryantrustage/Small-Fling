import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, Check, Copy, RotateCw, Eye, EyeOff, ZoomIn, ZoomOut,
  Maximize2, Search, Link2, AlertCircle, Image as ImageIcon
} from 'lucide-react';
import { Modal } from '../../ConfirmModal';
import { copyToClipboard } from '../../utils/dagDiagnostics';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  line_number?: number;
  interpolated?: boolean;
}

export interface OcrLineItem {
  line_number: number;
  gutter_number?: number;
  text: string;
  bbox?: BoundingBox;
  is_blank?: boolean;
  is_wrapped?: boolean;
  wrapped_line_count?: number;
  confidence?: number;
  status?: string;
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
  const [selectedImageId, setSelectedImageId] = useState<string>(initialImageId);
  const [availableImages, setAvailableImages] = useState<AvailableOcrImage[]>([]);
  const [inspectData, setInspectData] = useState<OcrInspectionData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Inspector interactive states
  const [hoveredLineNumber, setHoveredLineNumber] = useState<number | null>(null);
  const [selectedLineNumber, setSelectedLineNumber] = useState<number | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
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
      setIsRescanning(true);
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
      setIsRescanning(false);
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

      // Only calculate if we show all connectors OR this line is hovered/selected
      if (!showAllConnectors && !isHovered && !isSelected) {
        return;
      }

      const anchorEl = boxAnchorRefs.current.get(ln);
      const rowEl = lineRowRefs.current.get(ln);

      if (anchorEl && rowEl) {
        const aRect = anchorEl.getBoundingClientRect();
        const rRect = rowEl.getBoundingClientRect();

        // Check if both elements are reasonably visible within viewport
        const x1 = aRect.right - containerRect.left;
        const y1 = aRect.top + aRect.height / 2 - containerRect.top;
        const x2 = rRect.left - containerRect.left;
        const y2 = rRect.top + rRect.height / 2 - containerRect.top;

        // Skip if anchor coordinates are NaN or way outside modal
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
            isSelected
          });
        }
      }
    });

    setConnectorPaths(paths);
  }, [isOpen, inspectData, hoveredLineNumber, selectedLineNumber, showAllConnectors]);

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

  // Auto-scroll row in text panel when bounding box hovered/clicked
  const handleBoxClick = (ln: number) => {
    setSelectedLineNumber(ln);
    const rowEl = lineRowRefs.current.get(ln);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Auto-scroll image to box when text line hovered/clicked
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #38bdf8 0%, #00ff9d 100%)',
            borderRadius: '6px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <FileText size={18} color="#0d1117" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#f0f6fc', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>DAG 4: LOCAL AI OCR FULL INSPECTOR</span>
              <span style={{
                background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf866',
                color: '#38bdf8', padding: '1px 7px', borderRadius: '12px', fontSize: '10px', fontWeight: 700
              }}>
                {activeModel}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '1px' }}>
              Source Image Bounding Boxes Mapped to Verbatim Acquired Text with Live Connectors
            </div>
          </div>
        </div>
      }
      width="96vw"
      maxWidth="1680px"
      bodyStyle={{ padding: 0, overflow: 'hidden', maxHeight: 'none', background: '#090d13' }}
      cancelText=""
    >
      <div
        ref={modalBodyRef}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          height: '84vh',
          maxHeight: '920px',
          background: '#090d13',
          border: 'none',
          overflow: 'hidden',
          userSelect: 'none'
        }}
      >
        {/* TOP TOOLBAR: Image Selection & Inspector Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '8px 12px',
          background: '#0d1117',
          borderBottom: '1px solid #30363d',
          zIndex: 20
        }}>
          {/* Left: Image selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 800, color: '#58a6ff', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ImageIcon size={13} color="#58a6ff" />
              <span>SOURCE IMAGE:</span>
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
                maxWidth: '280px'
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
              disabled={isRescanning}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
                background: isRescanning ? 'rgba(56, 189, 248, 0.2)' : '#21262d',
                border: '1px solid #38bdf888', borderRadius: '5px',
                color: '#38bdf8', fontSize: '11px', fontWeight: 700, cursor: isRescanning ? 'wait' : 'pointer'
              }}
              title="Force fresh OCR scan on this specific image"
            >
              <RotateCw size={11} className={isRescanning ? 'spin' : ''} />
              <span>{isRescanning ? 'Scanning...' : 'Rescan Image'}</span>
            </button>
          </div>

          {/* Center: Metrics & status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#8b949e' }}>
            <span style={{
              background: '#161b22', padding: '3px 8px', borderRadius: '4px',
              border: '1px solid #30363d', color: '#00ff9d', fontWeight: 800
            }}>
              {activeCount} lines mapped
            </span>
            <span style={{
              background: '#161b22', padding: '3px 8px', borderRadius: '4px',
              border: '1px solid #30363d', color: '#8b949e'
            }}>
              {imgNaturalWidth}×{imgNaturalHeight}px
            </span>
          </div>

          {/* Right: View Toggles & Zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setShowBoundingBoxes(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
                background: showBoundingBoxes ? 'rgba(56, 189, 248, 0.2)' : '#161b22',
                border: `1px solid ${showBoundingBoxes ? '#38bdf8' : '#30363d'}`,
                color: showBoundingBoxes ? '#38bdf8' : '#8b949e',
                borderRadius: '5px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer'
              }}
              title="Toggle Bounding Boxes on Source Image"
            >
              {showBoundingBoxes ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>Boxes</span>
            </button>

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

        {/* MAIN SPLIT WORKSPACE */}
        <div style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 1fr) minmax(360px, 1fr)',
          flex: 1,
          overflow: 'hidden',
          background: '#090d13'
        }}>
          {/* LEFT PANE: Interactive Source Image with Overlaid Bounding Boxes */}
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
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Loading Source Image & Line Coordinates...</span>
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

                {/* Overlaid SVG Bounding Boxes Layer */}
                {showBoundingBoxes && (
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
                    </defs>

                    {inspectData?.lines.map(line => {
                      const ln = line.line_number;
                      const box = line.bbox || inspectData.bounding_boxes?.line_boxes?.[ln];
                      if (!box) return null;

                      const isHovered = ln === (hoveredLineNumber ?? selectedLineNumber);
                      const isSelected = ln === selectedLineNumber;

                      const strokeColor = isSelected ? '#00ff9d' : (isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.65)');
                      const fillColor = isSelected ? 'rgba(0, 255, 157, 0.22)' : (isHovered ? 'rgba(56, 189, 248, 0.18)' : 'rgba(56, 189, 248, 0.06)');

                      return (
                        <g
                          key={`svg_box_${ln}`}
                          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredLineNumber(ln)}
                          onMouseLeave={() => setHoveredLineNumber(null)}
                          onClick={() => handleBoxClick(ln)}
                        >
                          {/* Box Rect */}
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

                          {/* Line Number Badge */}
                          {showGutterBadges && (
                            <g transform={`translate(${Math.max(4, box.x - 28)}, ${box.y + box.height / 2})`}>
                              <rect
                                x={-18}
                                y={-9}
                                width={24}
                                height={18}
                                rx={3}
                                fill={isHovered || isSelected ? '#00ff9d' : '#161b22'}
                                stroke={isHovered || isSelected ? '#00ff9d' : '#38bdf8'}
                                strokeWidth={1}
                              />
                              <text
                                x={-6}
                                y={3}
                                fill={isHovered || isSelected ? '#0d1117' : '#e6edf3'}
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
              <filter id="connectorGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#00ff9d" floodOpacity="0.9" />
              </filter>
            </defs>

            {connectorPaths.map(conn => {
              const strokeColor = conn.isSelected ? '#00ff9d' : (conn.isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.22)');
              const strokeWidth = conn.isSelected || conn.isHovered ? 2.5 : 1.0;

              return (
                <g key={`conn_${conn.lineNumber}`}>
                  {/* Bezier connecting curve */}
                  <path
                    d={conn.d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={conn.isHovered || conn.isSelected ? undefined : '3 3'}
                    filter={conn.isHovered || conn.isSelected ? 'url(#connectorGlow)' : undefined}
                  />

                  {/* Start dot on Image Bounding Box */}
                  <circle
                    cx={conn.x1}
                    cy={conn.y1}
                    r={conn.isHovered || conn.isSelected ? 4 : 2}
                    fill={strokeColor}
                  />

                  {/* End dot on Acquired Text Row */}
                  <circle
                    cx={conn.x2}
                    cy={conn.y2}
                    r={conn.isHovered || conn.isSelected ? 4 : 2}
                    fill={strokeColor}
                  />
                </g>
              );
            })}
          </svg>

          {/* RIGHT PANE: Acquired OCR Result Text with Line Mappings */}
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
            {/* Search Filter Header */}
            <div style={{
              position: 'sticky',
              top: 0,
              background: '#161b22',
              padding: '8px 12px',
              borderBottom: '1px solid #30363d',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              zIndex: 10
            }}>
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

            {/* Verbatim Code Lines List */}
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {filteredLines.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#8b949e', fontSize: '12px' }}>
                  No matching OCR lines found for &quot;{searchFilter}&quot;
                </div>
              ) : (
                filteredLines.map(line => {
                  const ln = line.line_number;
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
                        gap: '8px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: isSelected
                          ? 'rgba(0, 255, 157, 0.16)'
                          : (isHovered ? 'rgba(56, 189, 248, 0.14)' : 'transparent'),
                        border: `1px solid ${isSelected ? '#00ff9d88' : (isHovered ? '#38bdf866' : 'transparent')}`,
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
                          background: isSelected ? '#00ff9d' : (isHovered ? '#38bdf8' : 'rgba(56, 189, 248, 0.4)')
                        }}
                      />

                      {/* Line Number Pill */}
                      <span
                        style={{
                          minWidth: '28px',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          fontWeight: 800,
                          color: isSelected ? '#00ff9d' : (isHovered ? '#38bdf8' : '#58a6ff'),
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
                          color: line.is_blank ? '#484f58' : (isSelected ? '#ffffff' : '#e6edf3'),
                          fontStyle: line.is_blank ? 'italic' : 'normal',
                          wordBreak: 'break-all',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {line.text || '(empty line)'}
                      </div>

                      {/* Status / Confidence / Copy icons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: isHovered || isSelected ? 1 : 0.4 }}>
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
          padding: '6px 12px',
          background: '#0d1117',
          borderTop: '1px solid #21262d',
          fontSize: '11px',
          color: '#8b949e'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff9d', display: 'inline-block' }} />
              <span>Bounding Boxes Synced</span>
            </span>
            <span>•</span>
            <span>Hover or click any box or text row to inspect mapping</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {selectedLineNumber && (
              <span style={{ color: '#00ff9d', fontWeight: 700 }}>
                Selected: Line {selectedLineNumber}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '4px 12px', background: '#21262d', border: '1px solid #30363d',
                color: '#e6edf3', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
