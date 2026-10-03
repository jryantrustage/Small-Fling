import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize2, Minimize2, RefreshCw, ZoomIn, Copy, Check } from 'lucide-react';
import { BoundingBoxesOverlay } from './BoundingBoxesOverlay';
import type { AlignmentData, DeviceInfoData } from '../types';

export interface LiveResponsiveViewportProps {
  streamUrl: string;
  fallbackUrl?: string;
  liveMode?: 'desktop' | 'phone';
  alignmentData?: AlignmentData | null;
  showBoundingBoxes?: boolean;
  deviceInfo?: DeviceInfoData | null;
  metaResolution?: string | { width: number; height: number };
  defaultViewMode?: 'fit' | 'fill';
  showControls?: boolean;
  onRefreshStream?: () => void;
  className?: string;
  style?: React.CSSProperties;
  topCallout?: React.ReactNode;
  bottomCallout?: React.ReactNode;
  extraOverlay?: React.ReactNode;
}

export const LiveResponsiveViewport: React.FC<LiveResponsiveViewportProps> = ({
  streamUrl,
  fallbackUrl,
  liveMode = 'desktop',
  alignmentData,
  showBoundingBoxes = true,
  deviceInfo,
  metaResolution,
  defaultViewMode = 'fit',
  showControls = true,
  onRefreshStream,
  className = '',
  style = {},
  topCallout,
  bottomCallout,
  extraOverlay,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<'fit' | 'fill'>(defaultViewMode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  // ResizeObserver on the container to measure available viewport space responsively
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Listen for fullscreen change events (browser ESC key, etc.)
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Ensure DOM element resets to new stream URL when device/mode/streamKey updates
  useEffect(() => {
    if (imgRef.current && streamUrl) {
      imgRef.current.src = streamUrl;
    }
  }, [streamUrl]);

  // Image load handler to capture true stream aspect ratio and resolution
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  // Determine effective resolution and orientation
  const metaW = typeof metaResolution === 'object' ? metaResolution.width : (metaResolution ? parseInt(metaResolution.split('x')[0], 10) : 0);
  const metaH = typeof metaResolution === 'object' ? metaResolution.height : (metaResolution ? parseInt(metaResolution.split('x')[1], 10) : 0);

  const baseW = naturalSize.width || alignmentData?.resolution?.width || metaW || (liveMode === 'phone' ? 1080 : 1920);
  const baseH = naturalSize.height || alignmentData?.resolution?.height || metaH || (liveMode === 'phone' ? 2400 : 1080);
  const aspectRatio = baseW > 0 && baseH > 0 ? baseW / baseH : (liveMode === 'phone' ? 9 / 20 : 16 / 9);
  const isPortrait = baseH > baseW;
  const orientationLabel = isPortrait ? 'PORTRAIT' : 'LANDSCAPE';
  const resolutionDisplay = `${baseW}×${baseH}`;

  // Calculate pixel-perfect stage dimensions to eliminate letterbox disparity between image and SVG
  let stageW = '100%';
  let stageH = '100%';
  let stagePixelWidth = containerSize.width;
  let stagePixelHeight = containerSize.height;

  if (viewMode === 'fit' && containerSize.width > 0 && containerSize.height > 0) {
    const containerRatio = containerSize.width / containerSize.height;
    if (containerRatio > aspectRatio) {
      // Container is wider than aspect ratio: height-bound
      stagePixelHeight = containerSize.height;
      stagePixelWidth = Math.round(containerSize.height * aspectRatio);
    } else {
      // Container is taller than aspect ratio: width-bound
      stagePixelWidth = containerSize.width;
      stagePixelHeight = Math.round(containerSize.width / aspectRatio);
    }
    stageW = `${stagePixelWidth}px`;
    stageH = `${stagePixelHeight}px`;
  }

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
  }, []);

  const handleCopyImage = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      // Fetch uncompressed PNG frame from device screenshot endpoint
      const response = await fetch(`/api/device/screen?mode=${liveMode}&format=png`);
      if (!response.ok) {
        throw new Error(`Failed to capture image: HTTP ${response.status}`);
      }
      const blob = await response.blob();

      // Attempt modern asynchronous Clipboard API write
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        // Fallback: Trigger direct PNG download if clipboard image write isn't supported in current environment
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `screen_${liveMode}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      console.error('Copy live image failed:', err);
      // Fallback: try capturing canvas from imgRef if available
      try {
        if (imgRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = imgRef.current.naturalWidth || 1920;
          canvas.height = imgRef.current.naturalHeight || 1080;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(imgRef.current, 0, 0);
            canvas.toBlob(async (fallbackBlob) => {
              if (fallbackBlob && navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': fallbackBlob })]);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }
            }, 'image/png');
          }
        }
      } catch (canvasErr) {
        console.error('Canvas capture fallback failed:', canvasErr);
      }
    } finally {
      setCopying(false);
    }
  }, [copying, liveMode]);

  return (
    <div
      ref={containerRef}
      className={`live-responsive-viewport-container ${isFullscreen ? 'fullscreen' : ''} ${className}`.trim()}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#04070c',
        overflow: 'hidden',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Top Gutter Callout slot */}
      {topCallout && (
        <div className="live-viewport-callout-top" style={{ width: '100%', zIndex: 12, flexShrink: 0 }}>
          {topCallout}
        </div>
      )}

      {/* Main Responsive Stage */}
      <div
        className="live-viewport-stage"
        style={{
          position: 'relative',
          width: stageW,
          height: stageH,
          maxWidth: '100%',
          maxHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.85)',
          borderRadius: isFullscreen ? '0' : '4px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Live Video / Screen Stream Image */}
        <img
          ref={imgRef}
          className="live-viewport-stream-img"
          src={streamUrl}
          alt={`Live ${liveMode} display`}
          onLoad={handleImageLoad}
          onError={(e) => {
            if (fallbackUrl) {
              (e.target as HTMLImageElement).src = fallbackUrl;
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: viewMode === 'fill' ? 'cover' : 'contain',
            display: 'block',
            pointerEvents: 'none',
          }}
        />

        {/* Bounding Boxes SVG Overlay */}
        {showBoundingBoxes && liveMode === 'desktop' && alignmentData && (
          <BoundingBoxesOverlay
            data={alignmentData}
            aspectRatio={aspectRatio}
            isPortrait={isPortrait}
          />
        )}

        {/* Live Mode & Connection Status Badge */}
        <div
          className="live-screen-overlay-badge"
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(9, 12, 18, 0.82)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: '20px',
            padding: '3px 10px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            color: '#fff',
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 15,
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#00ff9d',
              boxShadow: '0 0 8px #00ff9d',
              animation: 'pulse-dot 1.5s infinite',
            }}
          />
          <span style={{ fontWeight: 800, letterSpacing: '0.4px' }}>
            LIVE • {liveMode.toUpperCase()}
          </span>
          <span style={{ color: '#8b949e', fontSize: '9px' }}>({orientationLabel})</span>
        </div>

        {/* Resolution & Device Hardware Info Badge */}
        <div
          className="live-screen-overlay-info"
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(9, 12, 18, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '6px',
            padding: '3px 8px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            color: '#c9d1d9',
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 15,
          }}
        >
          <span style={{ color: '#58a6ff', fontWeight: 700 }}>{resolutionDisplay}</span>
          <span>•</span>
          <span>{deviceInfo?.active_serial ? deviceInfo.active_serial.split(':')[0] : 'ADB'}</span>
        </div>

        {/* Viewport Micro-Controls (Floating Top Right) */}
        {showControls && (
          <div
            className="live-viewport-floating-controls"
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              zIndex: 20,
            }}
          >
            {/* View Mode Toggle: Fit to bounds vs Full Fill */}
            <button
              type="button"
              className="btn btn-xs btn-outline live-view-toggle-btn"
              onClick={() => setViewMode(v => (v === 'fit' ? 'fill' : 'fit'))}
              title={viewMode === 'fit' ? 'Switch to Full Fill View' : 'Switch to Aspect Fit View'}
              style={{
                height: '24px',
                padding: '2px 8px',
                fontSize: '10px',
                background: 'rgba(15, 23, 42, 0.85)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                color: viewMode === 'fill' ? '#00ff9d' : '#e6edf3',
                backdropFilter: 'blur(6px)',
              }}
            >
              <ZoomIn size={11} />
              <span>{viewMode.toUpperCase()}</span>
            </button>

            {/* Copy Live Screenshot to Clipboard */}
            <button
              type="button"
              className="btn btn-xs btn-outline live-copy-btn"
              onClick={handleCopyImage}
              disabled={copying}
              title={copied ? 'Copied to Clipboard!' : 'Copy Live Frame to Clipboard (PNG)'}
              style={{
                height: '24px',
                padding: '2px 8px',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: copied ? 'rgba(35, 134, 54, 0.85)' : 'rgba(15, 23, 42, 0.85)',
                borderColor: copied ? 'rgba(46, 160, 67, 0.6)' : 'rgba(255, 255, 255, 0.2)',
                color: copied ? '#ffffff' : '#e6edf3',
                backdropFilter: 'blur(6px)',
                cursor: copying ? 'wait' : 'pointer',
              }}
            >
              {copied ? <Check size={11} color="#3fb950" /> : <Copy size={11} />}
              <span>{copied ? 'COPIED' : copying ? 'COPYING...' : 'COPY FRAME'}</span>
            </button>

            {/* Native Fullscreen Button */}
            <button
              type="button"
              className="btn btn-xs btn-outline live-fullscreen-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Native Fullscreen'}
              style={{
                height: '24px',
                width: '24px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(15, 23, 42, 0.85)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                color: isFullscreen ? '#58a6ff' : '#e6edf3',
                backdropFilter: 'blur(6px)',
              }}
            >
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>

            {/* Stream Refresh */}
            {onRefreshStream && (
              <button
                type="button"
                className="btn btn-xs btn-outline live-refresh-btn"
                onClick={onRefreshStream}
                title="Refresh Live Stream"
                style={{
                  height: '24px',
                  width: '24px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(15, 23, 42, 0.85)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#e6edf3',
                  backdropFilter: 'blur(6px)',
                }}
              >
                <RefreshCw size={11} />
              </button>
            )}
          </div>
        )}

        {/* Custom Extra Overlay Slot */}
        {extraOverlay}
      </div>

      {/* Bottom Gutter Callout slot */}
      {bottomCallout && (
        <div className="live-viewport-callout-bottom" style={{ width: '100%', zIndex: 12, flexShrink: 0 }}>
          {bottomCallout}
        </div>
      )}
    </div>
  );
};

export default LiveResponsiveViewport;
