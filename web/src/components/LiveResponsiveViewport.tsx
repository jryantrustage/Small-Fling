import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Maximize2, Minimize2, RefreshCw, ZoomIn, Copy, Check, Monitor, Smartphone } from 'lucide-react';
import { BoundingBoxesOverlay } from './BoundingBoxesOverlay';
import type { AlignmentData, DeviceInfoData } from '../types';

export interface LiveResponsiveViewportProps {
  streamUrl: string;
  fallbackUrl?: string;
  liveMode?: 'desktop' | 'phone';
  onSwitchLiveMode?: (mode: 'desktop' | 'phone') => void;
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
  headlessMode?: boolean;
  onToggleHeadlessMode?: () => void;
}

export const LiveResponsiveViewport: React.FC<LiveResponsiveViewportProps> = ({
  streamUrl,
  fallbackUrl,
  liveMode = 'desktop',
  onSwitchLiveMode,
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
  headlessMode = false,
  onToggleHeadlessMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<'fit' | 'fill'>(defaultViewMode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [peekScreen, setPeekScreen] = useState(false);
  const [tapRipple, setTapRipple] = useState<{ x: number; y: number; label?: string } | null>(null);
  const [phoneDigitsBuffer, setPhoneDigitsBuffer] = useState<string>('');
  const [phoneKeypadStatus, setPhoneKeypadStatus] = useState<string>('Ready • Routes strictly to Phone Display #0');
  const [isSendingPhoneKey, setIsSendingPhoneKey] = useState<boolean>(false);
  const [phoneStreamBurstTick, setPhoneStreamBurstTick] = useState<number>(0);

  // Synchronize internal live mode with controlled prop or allow local toggle
  const [internalLiveMode, setInternalLiveMode] = useState<'desktop' | 'phone'>(liveMode);

  useEffect(() => {
    setInternalLiveMode(liveMode);
  }, [liveMode]);

  const effectiveLiveMode = onSwitchLiveMode ? liveMode : internalLiveMode;

  // Reset naturalSize when switching between desktop and phone so aspect ratio updates immediately
  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
  }, [effectiveLiveMode]);

  const handleSwitchMode = (targetMode: 'desktop' | 'phone') => {
    if (onSwitchLiveMode) {
      onSwitchLiveMode(targetMode);
    } else {
      setInternalLiveMode(targetMode);
    }
    if (onRefreshStream) {
      onRefreshStream();
    }
  };

  const resolveDirectBackendUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('/api/device/')) {
      const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
      const streamHost = host === 'localhost' ? '127.0.0.1' : 'localhost';
      return `http://${streamHost}:8000${url}`;
    }
    return url;
  };

  // Compute active stream and fallback URLs dynamically based on effective live mode
  const activeStreamUrl = useMemo(() => {
    if (!streamUrl) return '';
    let withMode = streamUrl.includes('mode=')
      ? streamUrl.replace(/mode=(desktop|phone)/, `mode=${effectiveLiveMode}`)
      : `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}mode=${effectiveLiveMode}`;
    if (effectiveLiveMode === 'phone' && !withMode.includes('fps=')) {
      withMode += '&fps=5.0';
    }
    return resolveDirectBackendUrl(withMode);
  }, [streamUrl, effectiveLiveMode]);

  const activeFallbackUrl = useMemo(() => {
    if (!fallbackUrl) return '';
    let withMode = fallbackUrl.includes('mode=')
      ? fallbackUrl.replace(/mode=(desktop|phone)/, `mode=${effectiveLiveMode}`)
      : `${fallbackUrl}${fallbackUrl.includes('?') ? '&' : '?'}mode=${effectiveLiveMode}`;
    if (phoneStreamBurstTick > 0) {
      withMode += `&burst=${phoneStreamBurstTick}`;
    }
    return resolveDirectBackendUrl(withMode);
  }, [fallbackUrl, effectiveLiveMode, phoneStreamBurstTick]);

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
    const img = imgRef.current;
    if (img && activeStreamUrl) {
      img.src = activeStreamUrl;
    }
    return () => {
      if (img) {
        img.src = '';
      }
    };
  }, [activeStreamUrl]);

  // Image load handler to capture true stream aspect ratio and resolution
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  // Determine effective resolution and orientation
  const isPhoneMode = effectiveLiveMode === 'phone';
  const metaW = typeof metaResolution === 'object' ? metaResolution.width : (metaResolution ? parseInt(metaResolution.split('x')[0], 10) : 0);
  const metaH = typeof metaResolution === 'object' ? metaResolution.height : (metaResolution ? parseInt(metaResolution.split('x')[1], 10) : 0);

  const baseW = naturalSize.width || (!isPhoneMode ? (alignmentData?.resolution?.width || metaW) : 0) || (isPhoneMode ? 1080 : 1920);
  const baseH = naturalSize.height || (!isPhoneMode ? (alignmentData?.resolution?.height || metaH) : 0) || (isPhoneMode ? 2404 : 1080);
  const aspectRatio = baseW > 0 && baseH > 0 ? baseW / baseH : (isPhoneMode ? 1080 / 2404 : 16 / 9);
  const isPortrait = baseH > baseW;
  const orientationLabel = isPortrait ? 'PORTRAIT' : 'LANDSCAPE';
  const resolutionDisplay = `${baseW}×${baseH}`;

  // Calculate pixel-perfect stage dimensions to eliminate letterbox disparity between image and SVG
  let stageW = '100%';
  let stageH = '100%';
  const topBarH = isFullscreen ? 0 : 32;
  const bottomBarH = (!isFullscreen && bottomCallout && showBoundingBoxes) ? 28 : 0;
  const calloutOffsetH = topBarH + bottomBarH;
  const keypadReserveW = isPhoneMode && containerSize.width > 460 ? 276 : 0;
  const availW = Math.max(120, containerSize.width - keypadReserveW);
  const availH = Math.max(80, containerSize.height - calloutOffsetH);
  let stagePixelWidth = availW;
  let stagePixelHeight = availH;

  if (viewMode === 'fit' && availW > 0 && availH > 0) {
    const containerRatio = availW / availH;
    if (containerRatio > aspectRatio) {
      // Container is wider than aspect ratio: height-bound
      stagePixelHeight = availH;
      stagePixelWidth = Math.round(availH * aspectRatio);
    } else {
      // Container is taller than aspect ratio: width-bound
      stagePixelWidth = availW;
      stagePixelHeight = Math.round(availW / aspectRatio);
    }
    stageW = `${stagePixelWidth}px`;
    stageH = `${stagePixelHeight}px`;
  }

  const triggerPhoneRealtimeRefresh = useCallback(() => {
    setPhoneStreamBurstTick(Date.now());
    if (imgRef.current && activeFallbackUrl) {
      const sep = activeFallbackUrl.includes('?') ? '&' : '?';
      imgRef.current.src = `${activeFallbackUrl}${sep}_rt=${Date.now()}`;
      setTimeout(() => {
        if (imgRef.current && activeStreamUrl) {
          const sSep = activeStreamUrl.includes('?') ? '&' : '?';
          imgRef.current.src = `${activeStreamUrl}${sSep}_rt=${Date.now()}`;
        }
      }, 260);
    }
  }, [activeFallbackUrl, activeStreamUrl]);

  const handleStageClick = useCallback(async (e: React.MouseEvent<HTMLImageElement>) => {
    const imgEl = e.currentTarget;
    const rect = imgEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const natW = imgEl.naturalWidth || baseW;
    const natH = imgEl.naturalHeight || baseH;
    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (viewMode === 'fit' && natW > 0 && natH > 0) {
      const imgRatio = natW / natH;
      const boxRatio = rect.width / rect.height;
      if (boxRatio > imgRatio) {
        renderH = rect.height;
        renderW = rect.height * imgRatio;
        offsetX = (rect.width - renderW) / 2;
      } else {
        renderW = rect.width;
        renderH = rect.width / imgRatio;
        offsetY = (rect.height - renderH) / 2;
      }
    }

    const relX = e.clientX - (rect.left + offsetX);
    const relY = e.clientY - (rect.top + offsetY);
    if (relX < -4 || relY < -4 || relX > renderW + 4 || relY > renderH + 4) return;

    const normX = Math.max(0, Math.min(1, relX / Math.max(1, renderW)));
    const normY = Math.max(0, Math.min(1, relY / Math.max(1, renderH)));
    const stagePctX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const stagePctY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const estX = Math.round(normX * (effectiveLiveMode === 'phone' ? 1080 : 1920));
    const estY = Math.round(normY * (effectiveLiveMode === 'phone' ? 2404 : 1080));
    setTapRipple({ x: stagePctX, y: stagePctY, label: `${estX},${estY}` });
    setTimeout(() => setTapRipple(null), 650);

    try {
      let res = await fetch(resolveDirectBackendUrl('/api/device/display-tap'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: effectiveLiveMode,
          norm_x: normX,
          norm_y: normY,
          serial: deviceInfo?.active_serial,
        }),
      });
      if (res.status === 404 && effectiveLiveMode === 'phone') {
        res = await fetch(resolveDirectBackendUrl('/api/device/phone-tap'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            norm_x: normX,
            norm_y: normY,
            serial: deviceInfo?.active_serial,
          }),
        });
      }
      const data = await res.json().catch(() => null);
      if (effectiveLiveMode === 'phone') {
        setPhoneKeypadStatus(`Tapped Phone #0 at (${data?.x ?? estX}, ${data?.y ?? estY}) ✔`);
        setTimeout(() => triggerPhoneRealtimeRefresh(), 180);
      } else if (onRefreshStream) {
        setTimeout(() => onRefreshStream(), 250);
      }
    } catch (err) {
      console.warn('Display tap dispatch failed:', err);
    }
  }, [effectiveLiveMode, baseW, baseH, viewMode, deviceInfo?.active_serial, onRefreshStream, triggerPhoneRealtimeRefresh]);

  const handleSendPhoneKeypad = useCallback(async (
    payload: { action?: string; key?: string; text?: string; submit_enter?: boolean; focus_pin_box?: boolean; tap_ok?: boolean },
    statusLabel: string
  ) => {
    setIsSendingPhoneKey(true);
    setPhoneKeypadStatus(statusLabel);
    const tapNormPhone = async (nx: number, ny: number) => {
      await fetch(resolveDirectBackendUrl('/api/device/phone-tap'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ norm_x: nx, norm_y: ny, serial: deviceInfo?.active_serial }),
      });
    };
    const keyCoords: Record<string, [number, number]> = {
      '1': [0.265, 0.665], '2': [0.500, 0.665], '3': [0.735, 0.665],
      '4': [0.265, 0.740], '5': [0.500, 0.740], '6': [0.735, 0.740],
      '7': [0.265, 0.810], '8': [0.500, 0.810], '9': [0.735, 0.810],
      'BACKSPACE': [0.265, 0.885], '0': [0.500, 0.885], 'ENTER': [0.735, 0.885],
    };
    try {
      const res = await fetch(resolveDirectBackendUrl('/api/device/phone-keypad'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          serial: deviceInfo?.active_serial,
        }),
      });
      if (res.status === 404) {
        if (payload.action === 'phone_unlock_1213') {
          await fetch(resolveDirectBackendUrl('/api/device/unlock-phone'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serial: deviceInfo?.active_serial, pin: '1213' }),
          });
          setPhoneKeypadStatus(`${statusLabel} ✔`);
        } else if (payload.action === 'teams_pin_2992') {
          await tapNormPhone(0.500, 0.396);
          for (const d of ['2', '9', '9', '2']) {
            const [kx, ky] = keyCoords[d];
            await tapNormPhone(kx, ky);
          }
          await tapNormPhone(0.735, 0.885);
          await tapNormPhone(0.500, 0.458);
          setPhoneKeypadStatus(`${statusLabel} ✔`);
        } else if (payload.key && keyCoords[payload.key.toUpperCase()]) {
          const [kx, ky] = keyCoords[payload.key.toUpperCase()];
          await tapNormPhone(kx, ky);
          if (payload.tap_ok) {
            await tapNormPhone(0.500, 0.458);
          }
          setPhoneKeypadStatus(`${statusLabel} ✔`);
        }
      } else {
        const data = await res.json().catch(() => null);
        if (res.ok && data?.status === 'ok') {
          setPhoneKeypadStatus(`${statusLabel} ✔`);
        } else {
          setPhoneKeypadStatus(`Error: ${data?.message || 'Failed to send to Phone #0'}`);
        }
      }
      setTimeout(() => triggerPhoneRealtimeRefresh(), 150);
    } catch (err: any) {
      setPhoneKeypadStatus(`Failed: ${err?.message || 'Network error'}`);
    } finally {
      setIsSendingPhoneKey(false);
    }
  }, [deviceInfo?.active_serial, triggerPhoneRealtimeRefresh]);

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
      const response = await fetch(`/api/device/screen?mode=${effectiveLiveMode}&format=png`);
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
        a.download = `screen_${effectiveLiveMode}_${Date.now()}.png`;
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
  }, [copying, effectiveLiveMode]);

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
      {/* Docked Top Header Strip (Never overlaps the live screen; hidden in Fullscreen for 100% clean screen) */}
      {!isFullscreen && (
        <div
          className="live-viewport-callout-top"
          style={{
            width: '100%',
            zIndex: 12,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0b0f17',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '2px 10px',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            {topCallout}
            <div
              className="live-screen-overlay-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '12px',
                padding: '1px 8px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '9.5px',
                color: '#e6edf3',
              }}
              title="Click anywhere on the Live Screen below to tap that exact coordinate on the active display"
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#00ff9d',
                  boxShadow: '0 0 6px #00ff9d',
                }}
              />
              <span style={{ fontWeight: 700 }}>
                LIVE • {effectiveLiveMode.toUpperCase()} ({orientationLabel})
              </span>
              <span style={{ color: '#58a6ff', fontWeight: 700 }}>{resolutionDisplay}</span>
              <span style={{ color: '#38bdf8' }}>• Click Screen to Tap</span>
            </div>
          </div>

          {showControls && (
            <div
              className="live-viewport-docked-controls"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {!onSwitchLiveMode && (
                <div
                  className="live-mode-toggle-group"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'rgba(15, 23, 42, 0.88)',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    padding: '1px',
                  }}
                >
                  <button
                    type="button"
                    className={`btn btn-xs ${effectiveLiveMode === 'desktop' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => handleSwitchMode('desktop')}
                    title="Switch to External Desktop Mode Display (16:9 1080p landscape)"
                    style={{
                      height: '20px',
                      padding: '1px 6px',
                      fontSize: '9.5px',
                      fontWeight: effectiveLiveMode === 'desktop' ? 700 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: '3px',
                      background: effectiveLiveMode === 'desktop' ? '#2563eb' : 'transparent',
                      color: effectiveLiveMode === 'desktop' ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Monitor size={10} />
                    <span>DESKTOP</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${effectiveLiveMode === 'phone' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => handleSwitchMode('phone')}
                    title="Switch to Phone Display (9:20 portrait mirror + Phone HID Keypad)"
                    style={{
                      height: '20px',
                      padding: '1px 6px',
                      fontSize: '9.5px',
                      fontWeight: effectiveLiveMode === 'phone' ? 700 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: '3px',
                      background: effectiveLiveMode === 'phone' ? '#2563eb' : 'transparent',
                      color: effectiveLiveMode === 'phone' ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Smartphone size={10} />
                    <span>PHONE</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                className="btn btn-xs btn-outline live-view-toggle-btn"
                onClick={() => setViewMode(v => (v === 'fit' ? 'fill' : 'fit'))}
                title={viewMode === 'fit' ? 'Switch to Full Fill View' : 'Switch to Aspect Fit View'}
                style={{
                  height: '22px',
                  padding: '1px 7px',
                  fontSize: '9.5px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  color: viewMode === 'fill' ? '#00ff9d' : '#e6edf3',
                }}
              >
                <ZoomIn size={10} />
                <span>{viewMode.toUpperCase()}</span>
              </button>

              <button
                type="button"
                className="btn btn-xs btn-outline live-copy-btn"
                onClick={handleCopyImage}
                disabled={copying}
                title={copied ? 'Copied to Clipboard!' : 'Copy Live Frame to Clipboard (PNG)'}
                style={{
                  height: '22px',
                  padding: '1px 7px',
                  fontSize: '9.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: copied ? 'rgba(35, 134, 54, 0.85)' : 'rgba(15, 23, 42, 0.85)',
                  borderColor: copied ? 'rgba(46, 160, 67, 0.6)' : 'rgba(255, 255, 255, 0.2)',
                  color: copied ? '#ffffff' : '#e6edf3',
                  cursor: copying ? 'wait' : 'pointer',
                }}
              >
                {copied ? <Check size={10} color="#3fb950" /> : <Copy size={10} />}
                <span>{copied ? 'COPIED' : copying ? 'COPYING...' : 'COPY FRAME'}</span>
              </button>

              <button
                type="button"
                className="btn btn-xs btn-outline live-fullscreen-btn"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Clean Fullscreen (Zero Overlays + Direct Touch)'}
                style={{
                  height: '22px',
                  width: '22px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(15, 23, 42, 0.85)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  color: isFullscreen ? '#58a6ff' : '#e6edf3',
                }}
              >
                {isFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>

              {onRefreshStream && (
                <button
                  type="button"
                  className="btn btn-xs btn-outline live-refresh-btn"
                  onClick={() => {
                    onRefreshStream();
                    if (effectiveLiveMode === 'phone') triggerPhoneRealtimeRefresh();
                  }}
                  title="Refresh Live Stream"
                  style={{
                    height: '22px',
                    width: '22px',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(15, 23, 42, 0.85)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#e6edf3',
                  }}
                >
                  <RefreshCw size={10} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Minimal Corner Exit Fullscreen Button when in Fullscreen */}
      {isFullscreen && (
        <div
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            zIndex: 30,
            display: 'flex',
            gap: '6px',
            opacity: 0.7,
          }}
        >
          <button
            type="button"
            onClick={() => handleSwitchMode(effectiveLiveMode === 'desktop' ? 'phone' : 'desktop')}
            style={{
              height: '24px',
              padding: '0 8px',
              fontSize: '10px',
              fontWeight: 700,
              background: 'rgba(9, 13, 22, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              borderRadius: '4px',
              color: '#58a6ff',
              cursor: 'pointer',
            }}
            title="Switch between Desktop and Phone display"
          >
            {effectiveLiveMode === 'desktop' ? '📱 Phone' : '🖥️ Desktop'}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            style={{
              height: '24px',
              padding: '0 8px',
              fontSize: '10px',
              fontWeight: 700,
              background: 'rgba(9, 13, 22, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              borderRadius: '4px',
              color: '#f0f6fc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Exit Fullscreen (Esc)"
          >
            <Minimize2 size={11} />
            <span>Exit Fullscreen</span>
          </button>
        </div>
      )}

      {/* Main Responsive Stage Row (Side-by-Side Phone Stream + Dedicated Phone HID Keypad when in Phone Mode) */}
      <div
        style={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isPhoneMode ? '14px' : '0px',
          padding: isPhoneMode ? '4px 10px' : '0px',
          overflow: 'hidden',
        }}
      >
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
            flexShrink: 0,
          }}
        >
          {/* Live Video / Screen Stream Image OR Headless HUD */}
          {headlessMode && !peekScreen ? (
            <div
              className="headless-mode-display-hud"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)',
                color: '#e2e8f0',
                padding: '24px',
                textAlign: 'center',
                position: 'relative',
                zIndex: 5,
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#c084fc',
                    boxShadow: '0 0 12px #c084fc',
                    animation: 'pulse 1.5s infinite'
                  }}
                />
                <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1px', color: '#c084fc' }}>
                  HEADLESS MODE ACTIVE
                </span>
              </div>

              <p style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '420px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                Display stream &amp; image decoding are bypassed to maximize loop throughput. Node 4 executes the high-speed RapidOCR Inspector Rescan engine.
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                maxWidth: '380px',
                width: '100%',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(167, 139, 250, 0.25)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '18px'
              }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>TOP GUTTER</div>
                  <div style={{ fontSize: '15px', color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>
                    {alignmentData?.first_line_number ? `Line #${alignmentData.first_line_number}` : '---'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>BOTTOM GUTTER</div>
                  <div style={{ fontSize: '15px', color: '#34d399', fontWeight: 700, fontFamily: 'monospace' }}>
                    {alignmentData?.last_line_number ? `Line #${alignmentData.last_line_number}` : '---'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>OCR ENGINE</div>
                  <div style={{ fontSize: '12px', color: '#c084fc', fontWeight: 700 }}>RapidOCR</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setPeekScreen(true)}
                  className="btn btn-xs btn-outline"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#f8fafc',
                    fontSize: '11px',
                    padding: '4px 12px',
                    cursor: 'pointer'
                  }}
                  title="Temporarily unmask and view live screen stream"
                >
                  Peek Screen 👁️
                </button>
                {onToggleHeadlessMode && (
                  <button
                    type="button"
                    onClick={onToggleHeadlessMode}
                    className="btn btn-xs"
                    style={{
                      background: 'rgba(167, 139, 250, 0.2)',
                      border: '1px solid rgba(167, 139, 250, 0.4)',
                      color: '#c084fc',
                      fontSize: '11px',
                      padding: '4px 12px',
                      cursor: 'pointer'
                    }}
                    title="Switch to full visual rendering mode"
                  >
                    Exit Headless
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <img
                ref={imgRef}
                className="live-viewport-stream-img"
                src={activeStreamUrl || streamUrl}
                alt={`Live ${effectiveLiveMode} display`}
                onLoad={handleImageLoad}
                onClick={handleStageClick}
                onError={(e) => {
                  if (activeFallbackUrl || fallbackUrl) {
                    (e.target as HTMLImageElement).src = (activeFallbackUrl || fallbackUrl)!;
                  }
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: viewMode === 'fill' ? 'cover' : 'contain',
                  display: 'block',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                }}
                title={`Click anywhere on ${effectiveLiveMode === 'phone' ? 'Phone Display #0' : 'Desktop Display'} to send an accurate touch tap`}
              />
              {tapRipple && (
                <span
                  style={{
                    position: 'absolute',
                    left: `${tapRipple.x}%`,
                    top: `${tapRipple.y}%`,
                    width: '28px',
                    height: '28px',
                    marginLeft: '-14px',
                    marginTop: '-14px',
                    borderRadius: '50%',
                    border: `2px solid ${effectiveLiveMode === 'phone' ? '#38bdf8' : '#00ff9d'}`,
                    background: effectiveLiveMode === 'phone' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(0, 255, 157, 0.30)',
                    pointerEvents: 'none',
                    zIndex: 26,
                  }}
                />
              )}
              {headlessMode && peekScreen && (
                <button
                  type="button"
                  onClick={() => setPeekScreen(false)}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '120px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid #c084fc',
                    color: '#c084fc',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    zIndex: 25
                  }}
                >
                  Re-mask Headless
                </button>
              )}
            </>
          )}

          {/* Bounding Boxes SVG Overlay */}
          {showBoundingBoxes && effectiveLiveMode === 'desktop' && alignmentData && (
            <BoundingBoxesOverlay
              data={alignmentData}
              aspectRatio={aspectRatio}
              isPortrait={isPortrait}
            />
          )}

          {/* Custom Extra Overlay Slot */}
          {extraOverlay}
        </div>

        {/* Dedicated Phone HID Numeric Keypad placed in the extra width beside the Portrait Phone Screen */}
        {isPhoneMode && (
          <div
            className="phone-hid-side-keypad"
            style={{
              width: '256px',
              maxHeight: '100%',
              overflowY: 'auto',
              background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.75)',
              flexShrink: 0,
            }}
          >
            {/* Header & Target Guarantee */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={13} color="#38bdf8" />
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#f0f6fc', fontFamily: 'monospace' }}>
                  PHONE HID KEYPAD
                </span>
              </div>
              <span style={{
                fontSize: '9px',
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: '4px',
                background: 'rgba(56, 189, 248, 0.18)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                fontFamily: 'monospace',
              }}>
                DISPLAY #0 ONLY
              </span>
            </div>

            {/* Live Digit Readout & Status */}
            <div style={{
              background: '#05080f',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '9.5px', color: '#64748b', fontFamily: 'monospace', fontWeight: 700 }}>
                  TYPED ON PHONE #0:
                </span>
                {phoneDigitsBuffer && (
                  <button
                    type="button"
                    onClick={() => setPhoneDigitsBuffer('')}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '9px', cursor: 'pointer', padding: 0 }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: 800,
                fontFamily: 'monospace',
                color: '#38bdf8',
                letterSpacing: '3px',
                minHeight: '22px',
              }}>
                {phoneDigitsBuffer || '••••'}
              </div>
              <div style={{ fontSize: '9.5px', color: '#94a3b8', lineHeight: 1.3 }}>
                {phoneKeypadStatus}
              </div>
            </div>

            {/* 1-Click PIN Presets (Strictly separated: 2992 for Teams PIN vs 1213 for Phone OS Unlock) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <button
                type="button"
                disabled={isSendingPhoneKey}
                onClick={() => {
                  setPhoneDigitsBuffer('2992');
                  handleSendPhoneKeypad(
                    { action: 'teams_pin_2992' },
                    'Sending Teams PIN (2992) + Enter to Phone #0...'
                  );
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  border: '1px solid rgba(251, 191, 36, 0.55)',
                  color: '#fbbf24',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                }}
                title="Focuses the Teams PIN box on Phone Display #0, enters 2992, and submits with Enter + OK"
              >
                🔑 Teams PIN (2992) + ↵ Enter
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                <button
                  type="button"
                  disabled={isSendingPhoneKey}
                  onClick={() => {
                    setPhoneDigitsBuffer('1213');
                    handleSendPhoneKeypad(
                      { action: 'phone_unlock_1213' },
                      'Unlocking Phone OS (1213) on #0...'
                    );
                  }}
                  style={{
                    padding: '5px 6px',
                    borderRadius: '5px',
                    background: 'rgba(14, 165, 233, 0.16)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    color: '#38bdf8',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                  title="Wakes Phone Display #0 and unlocks Android OS Lockscreen using 1213"
                >
                  🔓 OS Unlock (1213)
                </button>

                <button
                  type="button"
                  disabled={isSendingPhoneKey}
                  onClick={() => {
                    handleSendPhoneKeypad(
                      { action: 'key', focus_pin_box: true },
                      'Focused Teams PIN box on Phone #0'
                    );
                  }}
                  style={{
                    padding: '5px 6px',
                    borderRadius: '5px',
                    background: 'rgba(168, 85, 247, 0.16)',
                    border: '1px solid rgba(192, 132, 252, 0.45)',
                    color: '#e9d5ff',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                  title="Taps the Teams 'PIN' input field on Phone Display #0 (540, 1035) so digits go into Teams PIN"
                >
                  🎯 Focus PIN Box
                </button>
              </div>
            </div>

            {/* 3x4 Numeric Keypad + Backspace + Enter */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px',
            }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => {
                    setPhoneDigitsBuffer(prev => (prev + digit).slice(-8));
                    handleSendPhoneKeypad(
                      { action: 'key', key: digit },
                      `Sent digit '${digit}' to Phone Display #0`
                    );
                  }}
                  style={{
                    height: '36px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    border: '1px solid rgba(148, 163, 184, 0.28)',
                    color: '#f8fafc',
                    fontSize: '15px',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                  title={`Send digit ${digit} strictly to Phone Display #0`}
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setPhoneDigitsBuffer(prev => prev.slice(0, -1));
                  handleSendPhoneKeypad(
                    { action: 'key', key: 'BACKSPACE' },
                    'Sent Backspace (⌫) to Phone Display #0'
                  );
                }}
                style={{
                  height: '36px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(248, 113, 113, 0.4)',
                  color: '#fca5a5',
                  fontSize: '13px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
                title="Send Backspace (KEYCODE_DEL 67) to Phone Display #0"
              >
                ⌫ DEL
              </button>

              <button
                type="button"
                onClick={() => {
                  setPhoneDigitsBuffer(prev => (prev + '0').slice(-8));
                  handleSendPhoneKeypad(
                    { action: 'key', key: '0' },
                    "Sent digit '0' to Phone Display #0"
                  );
                }}
                style={{
                  height: '36px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  border: '1px solid rgba(148, 163, 184, 0.28)',
                  color: '#f8fafc',
                  fontSize: '15px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
                title="Send digit 0 strictly to Phone Display #0"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => {
                  handleSendPhoneKeypad(
                    { action: 'key', key: 'ENTER', tap_ok: true },
                    'Sent ENTER (↵) + OK to Phone Display #0'
                  );
                }}
                style={{
                  height: '36px',
                  borderRadius: '6px',
                  background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                  border: '1px solid #34d399',
                  color: '#022c22',
                  fontSize: '12px',
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.35)',
                }}
                title="Send ENTER (KEYCODE_ENTER 66) and tap OK on Phone Display #0"
              >
                ↵ ENTER
              </button>
            </div>

            {/* Bottom Utility Row: Esc & Re-open Active Markdown File */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '2px' }}>
              <button
                type="button"
                onClick={() => {
                  handleSendPhoneKeypad(
                    { action: 'key', key: 'ESCAPE' },
                    'Sent ESCAPE (111) to Phone Display #0'
                  );
                }}
                style={{
                  padding: '5px 6px',
                  borderRadius: '5px',
                  background: '#161b22',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
                title="Send ESCAPE (keyevent 111) to Phone Display #0 to switch biometric prompt to PIN"
              >
                ⎋ Esc Biometric
              </button>

              <button
                type="button"
                onClick={async () => {
                  setPhoneKeypadStatus('Navigating OneDrive -> Markdown on Desktop...');
                  try {
                    await fetch(resolveDirectBackendUrl('/api/device/navigate-onedrive-markdown'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ serial: deviceInfo?.active_serial, open_editor: true }),
                    });
                    setPhoneKeypadStatus('Re-opened active Markdown in Teams ✔');
                    if (onRefreshStream) onRefreshStream();
                  } catch {
                    setPhoneKeypadStatus('Failed to navigate Teams OneDrive');
                  }
                }}
                style={{
                  padding: '5px 6px',
                  borderRadius: '5px',
                  background: 'rgba(16, 185, 129, 0.14)',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  color: '#34d399',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
                title="Automatically navigates Teams -> OneDrive -> Markdowns -> ficus-platform -> Bundle Folder -> Active Part .md"
              >
                📂 Re-Open MD
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Gutter Callout slot (hidden when CONTENT FRAMING is off or in Fullscreen) */}
      {!isFullscreen && showBoundingBoxes && bottomCallout && (
        <div className="live-viewport-callout-bottom" style={{ width: '100%', zIndex: 12, flexShrink: 0 }}>
          {bottomCallout}
        </div>
      )}
    </div>
  );
};

export default LiveResponsiveViewport;
