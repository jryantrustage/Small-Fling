import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Keyboard, Filter, ChevronRight, ChevronDown, ArrowDown, AlertTriangle, Timer } from 'lucide-react';
import type { TelemetryEvent } from '../TelemetryToaster';
import type { FrameData } from '../types';

type DagFilter = 'all' | 'initialize' | 'capture_entire_markdown' | 'system';
type CatKey = 'KEY' | 'FRAME' | 'OCR' | 'PACER' | 'SYSTEM' | 'ERROR' | 'WS';

const CATS: CatKey[] = ['KEY', 'FRAME', 'OCR', 'PACER', 'SYSTEM', 'ERROR', 'WS'];
const DAG_OPTIONS: Array<{ id: DagFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'initialize', label: 'DAG 1' },
  { id: 'capture_entire_markdown', label: 'DAG 2' },
  { id: 'system', label: 'System' },
];

const catOf = (ev: TelemetryEvent): CatKey => (ev.data?.key_event ? 'KEY' : (ev.category as CatKey));

const catColor: Record<CatKey, string> = {
  KEY: '#d2a8ff', FRAME: '#00ff9d', OCR: '#58a6ff', PACER: '#e3b341', SYSTEM: '#8b949e', ERROR: '#ff7b72', WS: '#79c0ff',
};

interface Props {
  frame: FrameData;
  eventsLog: TelemetryEvent[];
  onClose: () => void;
}

/** Events that occurred between the previous captured frame and this one (log order). */
const getFrameTraceWindow = (frameId: string, eventsLog: TelemetryEvent[]): TelemetryEvent[] => {
  let idx = -1;
  for (let i = eventsLog.length - 1; i >= 0; i--) {
    const e = eventsLog[i];
    if (e.category === 'FRAME' && e.data?.frame_id === frameId) { idx = i; break; }
  }
  if (idx < 0) return [];
  let prev = -1;
  for (let i = idx - 1; i >= 0; i--) {
    const e = eventsLog[i];
    if (e.category === 'FRAME' && e.data?.frame_id && e.data.frame_id !== frameId) { prev = i; break; }
  }
  return eventsLog.slice(prev + 1, idx + 1);
};

export const FrameTracePanel: React.FC<Props> = ({ frame, eventsLog, onClose }) => {
  const [dagFilter, setDagFilter] = useState<DagFilter>('all');
  const [cats, setCats] = useState<Set<CatKey>>(new Set(CATS));
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const windowEvents = useMemo(() => getFrameTraceWindow(frame.frame_id, eventsLog), [frame.frame_id, eventsLog]);

  const stats = useMemo(() => {
    let downs = 0, pageDowns = 0, keyDispatches = 0, keyMs = 0, navAway = 0, errors = 0;
    for (const ev of windowEvents) {
      const k = ev.data?.key_event;
      if (k) {
        keyDispatches++;
        keyMs += Number(k.duration_ms) || 0;
        const codes: number[] = Array.isArray(k.keycodes) ? k.keycodes : [];
        downs += codes.filter(c => c === 20).length;
        pageDowns += codes.filter(c => c === 93).length;
        if (k.navigated_away) navAway++;
      }
      if (ev.category === 'ERROR' || ev.level === 'error') errors++;
    }
    const first = windowEvents[0]?.ts, last = windowEvents[windowEvents.length - 1]?.ts;
    const spanMs = first && last ? last - first : 0;
    return { downs, pageDowns, keyDispatches, keyMs, navAway, errors, spanMs };
  }, [windowEvents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return windowEvents.filter(ev => {
      if (dagFilter !== 'all') {
        const d = ev.dag || 'system';
        if (d !== 'all' && d !== dagFilter) return false;
      }
      if (!cats.has(catOf(ev))) return false;
      if (q && !`${ev.message} ${JSON.stringify(ev.data || '')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [windowEvents, dagFilter, cats, query]);

  const toggleCat = (c: CatKey) => setCats(prev => {
    const n = new Set(prev);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });
  const toggleExpand = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const filterSummary = [
    `DAG: ${DAG_OPTIONS.find(o => o.id === dagFilter)?.label}`,
    cats.size === CATS.length ? 'Categories: all' : `Categories: ${CATS.filter(c => cats.has(c)).join(', ') || 'none'}`,
    query.trim() ? `Search: "${query.trim()}"` : null,
  ].filter(Boolean).join(' \u2022 ');

  const handleCopy = async () => {
    const lines = [
      `# Frame trace ${frame.frame_id.slice(0, 8)} (Pg ${frame.page_index}, Ln ${frame.top_line}\u2192${frame.bottom_line})`,
      `Filters: ${filterSummary}`,
      `Events: ${filtered.length}/${windowEvents.length} \u2022 Down-arrow presses before capture: ${stats.downs} \u2022 PageDown: ${stats.pageDowns}`,
      '',
      ...filtered.map(ev => {
        const k = ev.data?.key_event;
        const extra = k ? `\n    cmd: ${k.shell_command}\n    keycodes: [${(k.keycodes || []).join(', ')}]\n    pre: ${k.pre_activity || '-'}\n    post: ${k.post_activity || '-'}` : '';
        return `- ${ev.timestamp} [${ev.dag || 'system'}] [${catOf(ev)}] ${ev.message}${extra}`;
      }),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  const chip = (active: boolean, color = '#58a6ff'): React.CSSProperties => ({
    padding: '2px 9px', fontSize: '10px', fontWeight: 700, borderRadius: '10px', cursor: 'pointer',
    border: `1px solid ${active ? color : '#30363d'}`, background: active ? `${color}26` : 'transparent',
    color: active ? color : '#8b949e', transition: 'all .15s',
  });

  const statBox = (icon: React.ReactNode, label: string, value: string, accent = '#e6edf3') => (
    <div style={{ flex: '1 1 110px', background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', padding: '7px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: '#8b949e', fontWeight: 700 }}>{icon}<span>{label}</span></div>
      <div style={{ fontSize: '16px', fontWeight: 800, color: accent, marginTop: '2px' }}>{value}</div>
    </div>
  );

  return (
    <div
      id="frame-trace-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(1,4,9,0.72)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(860px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg,#131923,#0d1117)', border: '1.5px solid #00ff9d55', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,.85)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #21262d' }}>
          <Keyboard size={16} color="#00ff9d" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#f0f6fc' }}>Capture Trace &mdash; Frame {frame.frame_id.slice(0, 8)}</div>
            <div style={{ fontSize: '10px', color: '#8b949e' }}>Pg {frame.page_index} &bull; Ln {frame.top_line} &rarr; {frame.bottom_line} &bull; events since the previous captured frame</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={handleCopy} style={{ fontSize: '10px', padding: '2px 8px' }}>
            {copied ? <Check size={11} color="#00ff9d" /> : <Copy size={11} />}<span style={{ marginLeft: 4 }}>{copied ? 'Copied' : 'Copy trace'}</span>
          </button>
          <button type="button" className="win-btn" onClick={onClose} title="Close"><X size={12} /></button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 14px' }}>
          {statBox(<ArrowDown size={10} />, 'DOWN-ARROW PRESSES', String(stats.downs), '#00ff9d')}
          {statBox(<Keyboard size={10} />, 'KEY DISPATCHES', `${stats.keyDispatches}${stats.pageDowns ? ` (+${stats.pageDowns} PgDn)` : ''}`)}
          {statBox(<Timer size={10} />, 'KEY TIME', `${Math.round(stats.keyMs)}ms`)}
          {statBox(<Timer size={10} />, 'TRACE SPAN', `${(stats.spanMs / 1000).toFixed(1)}s`)}
          {statBox(<AlertTriangle size={10} />, 'ERRORS / NAV-AWAY', `${stats.errors} / ${stats.navAway}`, stats.errors + stats.navAway > 0 ? '#ff7b72' : '#e6edf3')}
        </div>

        <div style={{ padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Filter size={11} color="#8b949e" />
            {DAG_OPTIONS.map(o => (
              <button key={o.id} id={`trace-dag-${o.id}`} type="button" style={chip(dagFilter === o.id, '#00ff9d')} onClick={() => setDagFilter(o.id)}>{o.label}</button>
            ))}
            <span style={{ width: 1, height: 14, background: '#30363d', margin: '0 2px' }} />
            {CATS.map(c => (
              <button key={c} type="button" style={chip(cats.has(c), catColor[c])} onClick={() => toggleCat(c)}>{c}</button>
            ))}
            <input
              id="trace-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search trace..."
              style={{ marginLeft: 'auto', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', color: '#e6edf3', fontSize: '11px', padding: '3px 8px', width: '150px' }}
            />
          </div>
          <div id="trace-filter-summary" style={{ fontSize: '10px', color: '#8b949e' }}>
            Showing <strong style={{ color: '#e6edf3' }}>{filtered.length}</strong> of {windowEvents.length} events &bull; {filterSummary}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 14px', fontFamily: 'var(--font-mono, monospace)', fontSize: '11px' }}>
          {windowEvents.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#8b949e' }}>
              No trace recorded for this frame. Traces are collected live this session, so frames captured before the page was opened (or older than the last 500 events) have none.
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#8b949e' }}>No events match the current filters.</div>
          ) : filtered.map(ev => {
            const k = ev.data?.key_event;
            const cat = catOf(ev);
            const isOpen = expanded.has(ev.id);
            const hasDetail = !!ev.data;
            return (
              <div key={ev.id} style={{ borderLeft: `2px solid ${catColor[cat] || '#30363d'}`, margin: '3px 0', padding: '3px 8px', background: cat === 'ERROR' ? 'rgba(248,81,73,.1)' : 'rgba(255,255,255,.02)', borderRadius: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: hasDetail ? 'pointer' : 'default' }} onClick={() => hasDetail && toggleExpand(ev.id)}>
                  {hasDetail ? (isOpen ? <ChevronDown size={11} color="#8b949e" /> : <ChevronRight size={11} color="#8b949e" />) : <span style={{ width: 11 }} />}
                  <span style={{ color: '#8b949e', fontSize: '9px' }}>{ev.timestamp}</span>
                  <span style={{ fontSize: '8.5px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px', color: ev.dag === 'initialize' ? '#58a6ff' : (ev.dag === 'capture_entire_markdown' ? '#00ff9d' : '#8b949e'), border: '1px solid #30363d' }}>
                    {ev.dag === 'initialize' ? 'DAG 1' : ev.dag === 'capture_entire_markdown' ? 'DAG 2' : 'SYS'}
                  </span>
                  <span style={{ fontSize: '8.5px', fontWeight: 800, color: catColor[cat] }}>{cat}</span>
                  <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', color: cat === 'ERROR' ? '#ff7b72' : '#c9d1d9' }}>{ev.message}</span>
                </div>
                {isOpen && (
                  <pre style={{ margin: '6px 0 2px 17px', padding: '6px 8px', background: '#010409', border: '1px solid #21262d', borderRadius: '6px', color: '#8b949e', fontSize: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {k
                      ? `command:   ${k.shell_command}\nkeycodes:  [${(k.keycodes || []).join(', ')}]\nduration:  ${k.duration_ms}ms\ndisplay:   #${k.display_id ?? '?'}\ncaller:    ${k.caller_node || 'system'}\nloop:      ${k.loop_id ?? '-'}${k.loop_index !== undefined ? ` (#${k.loop_index})` : ''}\npre:       ${k.pre_activity || '-'}\npost:      ${k.post_activity || '-'}\ndetails:   ${JSON.stringify(k.details || {})}`
                      : JSON.stringify(ev.data, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
