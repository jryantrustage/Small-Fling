import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FolderTree, FileCode, Search, CheckCircle2, AlertTriangle, XCircle,
  Save, RotateCw, Eye, Play, Sparkles, Terminal, ExternalLink, Layers
} from 'lucide-react';

export interface AnalyzerSandboxWorkspaceProps {
  apiBase: string;
  projectId?: string;
  onDocumentUpdated?: () => void;
}

interface VfsFileEntry {
  index?: number;
  path: string;
  normalized_path: string;
  ext: string;
  size?: number;
  expected_size?: number;
  actual_size?: number;
  size_delta?: number;
  size_matches?: boolean;
  expected_lines: number;
  actual_lines: number;
  line_count_delta?: number;
  lines_matches?: boolean;
  line_count_matches?: boolean;
  expected_chars?: number;
  actual_chars?: number;
  chars_delta?: number;
  chars_matches?: boolean;
  has_start_marker?: boolean;
  has_end_marker?: boolean;
  markers_paired?: boolean;
  all_metrics_match?: boolean;
  distinct_verification?: {
    size?: { expected: number; actual: number; delta: number; matches: boolean };
    lines?: { expected: number; actual: number; delta: number; matches: boolean };
    chars?: { expected: number; actual: number; delta: number; matches: boolean };
    markers?: {
      start_md_line: number;
      end_md_line: number;
      has_start_marker: boolean;
      has_end_marker: boolean;
      paired: boolean;
    };
    all_match?: boolean;
    mismatch_reasons?: string[];
  };
  mismatch_reasons?: string[];
  content: string;
  tag_start_md_line?: number;
  start_md_line: number;
  end_md_line: number;
  source_frame_ids: string[];
  tag_status: string;
}

interface CompilerDiagnostic {
  file: string;
  line: number;
  column: number;
  code: number;
  category: string;
  message: string;
  global_md_line: number;
  frame_id?: string;
  snippet?: string;
}

interface LineLoupeData {
  status: string;
  global_md_line: number;
  frame_id: string;
  ink_pixels: number;
  blank_locked: boolean;
  current_ocr_text: string;
  rapidocr_text: string;
  vlm_re_transcription: string;
  re_transcribed_text: string;
  symbol_repair_candidates: string[];
  cropped_data_url: string;
}

export const AnalyzerSandboxWorkspace: React.FC<AnalyzerSandboxWorkspaceProps> = ({
  apiBase,
  projectId,
  onDocumentUpdated,
}) => {
  const effectivePid = projectId || 'default';
  const [vfsFiles, setVfsFiles] = useState<VfsFileEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<CompilerDiagnostic[]>([]);
  const [compilationSummary, setCompilationSummary] = useState<any>(null);
  const [tagParseReport, setTagParseReport] = useState<any>(null);
  const [lineToFrameMap, setLineToFrameMap] = useState<Record<string, any>>({});

  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [editorLines, setEditorLines] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [focusedFileLine, setFocusedFileLine] = useState<number>(1);
  const [fileSearchQuery, setFileSearchQuery] = useState('');

  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isRunningAnalyzerDag, setIsRunningAnalyzerDag] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);

  // Original Screen Capture Loupe state
  const [showLoupe, setShowLoupe] = useState(true);
  const [loupeData, setLoupeData] = useState<LineLoupeData | null>(null);
  const [isLoadingLoupe, setIsLoadingLoupe] = useState(false);

  // Right pane split / preview state
  const [previewKey, setPreviewKey] = useState(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const fetchWorkspace = useCallback(async () => {
    setIsLoadingWorkspace(true);
    try {
      const res = await fetch(`${apiBase}/api/analyzer/workspace/${encodeURIComponent(effectivePid)}`);
      if (res.ok) {
        const data = await res.json();
        const files: VfsFileEntry[] = Array.isArray(data.vfs_files) ? data.vfs_files : [];
        setVfsFiles(files);
        const diags: CompilerDiagnostic[] =
          data.diagnostics || data.compilation_summary?.diagnostics || [];
        setDiagnostics(Array.isArray(diags) ? diags : []);
        setCompilationSummary(data.compilation_summary || null);
        setTagParseReport(data.tag_parse_report || null);
        setLineToFrameMap(data.global_md_line_to_frame || data.line_to_frame_map || {});

        if (files.length > 0) {
          setSelectedFilePath((curr) => {
            const match = files.find((f) => f.normalized_path === curr || f.path === curr);
            const chosen = match || files[0];
            setEditorLines((chosen.content || '').split('\n'));
            setIsDirty(false);
            return chosen.normalized_path || chosen.path;
          });
        }
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [apiBase, effectivePid]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const activeFile = useMemo(() => {
    return (
      vfsFiles.find((f) => f.normalized_path === selectedFilePath || f.path === selectedFilePath) ||
      vfsFiles[0] ||
      null
    );
  }, [vfsFiles, selectedFilePath]);

  const handleSelectFile = (file: VfsFileEntry, targetLine = 1) => {
    setSelectedFilePath(file.normalized_path || file.path);
    setEditorLines((file.content || '').split('\n'));
    setIsDirty(false);
    setFocusedFileLine(targetLine);
    setTimeout(() => {
      const rowEl = document.getElementById(`monaco-line-${targetLine}`);
      rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 30);
  };

  // Fetch Original Screen Capture Loupe for currently focused line
  const fetchLoupeForLine = useCallback(
    async (globalMdLine: number, runVlm = false, applyPatch = false) => {
      if (!globalMdLine || globalMdLine <= 0) return;
      setIsLoadingLoupe(true);
      try {
        const res = await fetch(
          `${apiBase}/api/analyzer/workspace/${encodeURIComponent(effectivePid)}/verify-line-from-frame`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              global_md_line: globalMdLine,
              run_vlm: runVlm,
              apply_patch: applyPatch,
            }),
          }
        );
        if (res.ok) {
          const data: LineLoupeData = await res.json();
          setLoupeData(data);
          if (applyPatch && data.re_transcribed_text !== undefined && activeFile) {
            const relIdx = globalMdLine - activeFile.start_md_line;
            if (relIdx >= 0 && relIdx < editorLines.length) {
              const nextLines = [...editorLines];
              nextLines[relIdx] = data.re_transcribed_text;
              setEditorLines(nextLines);
              setIsDirty(true);
            }
            onDocumentUpdated?.();
          }
        }
      } catch {
        // Ignore if frame image isn't on disk
      } finally {
        setIsLoadingLoupe(false);
      }
    },
    [apiBase, effectivePid, activeFile, editorLines, onDocumentUpdated]
  );

  const currentGlobalMdLine = activeFile ? activeFile.start_md_line + focusedFileLine - 1 : 0;

  useEffect(() => {
    if (showLoupe && currentGlobalMdLine > 0) {
      const t = window.setTimeout(() => {
        fetchLoupeForLine(currentGlobalMdLine, false, false);
      }, 90);
      return () => window.clearTimeout(t);
    }
  }, [showLoupe, currentGlobalMdLine, fetchLoupeForLine]);

  // Run Phase III (Nodes 10 -> 11 -> 12)
  const handleRunAnalyzerPipeline = async () => {
    setIsRunningAnalyzerDag(true);
    try {
      const res = await fetch(`${apiBase}/api/dag/groups/post_capture_analyzer/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: effectivePid }),
      });
      if (res.ok) {
        await fetchWorkspace();
        setPreviewKey((k) => k + 1);
      }
    } finally {
      setIsRunningAnalyzerDag(false);
    }
  };

  // Save file edits back to Sandbox VFS + state.document_lines + incremental TS AST validation
  const handleSaveFile = async (overrideLines?: string[]) => {
    if (!activeFile) return;
    const linesToSave = overrideLines || editorLines;
    const newContent = linesToSave.join('\n');
    setIsSavingFile(true);
    try {
      const res = await fetch(
        `${apiBase}/api/analyzer/workspace/${encodeURIComponent(effectivePid)}/file`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: activeFile.normalized_path || activeFile.path,
            content: newContent,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.vfs_files)) setVfsFiles(data.vfs_files);
        if (Array.isArray(data.diagnostics)) setDiagnostics(data.diagnostics);
        if (data.compilation_summary) setCompilationSummary(data.compilation_summary);
        setIsDirty(false);
        setPreviewKey((k) => k + 1);
        onDocumentUpdated?.();
      }
    } finally {
      setIsSavingFile(false);
    }
  };

  // Per-file diagnostics lookup
  const diagnosticsByFile = useMemo(() => {
    const map = new Map<string, CompilerDiagnostic[]>();
    for (const d of diagnostics) {
      const key = (d.file || '').replace(/^\/+/, '');
      const list = map.get(key) || [];
      list.push(d);
      map.set(key, list);
    }
    return map;
  }, [diagnostics]);

  const activeFileDiagnosticsByLine = useMemo(() => {
    const map = new Map<number, CompilerDiagnostic[]>();
    if (!activeFile) return map;
    const key = (activeFile.normalized_path || activeFile.path).replace(/^\/+/, '');
    const list = diagnosticsByFile.get(key) || [];
    for (const d of list) {
      const ln = d.line || 1;
      const arr = map.get(ln) || [];
      arr.push(d);
      map.set(ln, arr);
    }
    return map;
  }, [activeFile, diagnosticsByFile]);

  const filteredVfsFiles = useMemo(() => {
    const q = fileSearchQuery.trim().toLowerCase();
    if (!q) return vfsFiles;
    return vfsFiles.filter((f) => (f.normalized_path || f.path).toLowerCase().includes(q));
  }, [vfsFiles, fileSearchQuery]);

  // Build live sandbox preview HTML srcDoc for the right-hand iframe
  const sandboxSrcDoc = useMemo(() => {
    const cssContent = vfsFiles
      .filter((f) => f.ext === 'css')
      .map((f) => f.content)
      .join('\n');
    const selectedCode = editorLines.join('\n');
    const fileLabel = activeFile ? activeFile.normalized_path || activeFile.path : 'No file selected';
    const errCount = diagnostics.length;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body {
    margin: 0;
    padding: 14px;
    background: #0d1117;
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
    font-size: 12px;
  }
  .sb-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 10px;
  }
  .sb-badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    background: ${errCount === 0 ? 'rgba(0,255,157,0.15)' : 'rgba(248,81,73,0.18)'};
    color: ${errCount === 0 ? '#00ff9d' : '#f85149'};
    border: 1px solid ${errCount === 0 ? 'rgba(0,255,157,0.4)' : 'rgba(248,81,73,0.4)'};
  }
  pre {
    margin: 8px 0 0;
    padding: 8px;
    background: #090d13;
    border: 1px solid #21262d;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 11px;
    color: #79c0ff;
  }
  ${cssContent}
</style>
</head>
<body>
  <div class="sb-card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <strong style="color:#58a6ff;">Sandbox VFS Runtime</strong>
      <span class="sb-badge">${errCount === 0 ? '✔ AST COMPILABLE' : `${errCount} TS DIAGNOSTIC(S)`}</span>
    </div>
    <div style="color:#8b949e;font-size:11px;">Active Module: <code style="color:#00ff9d;">${fileLabel}</code> (${editorLines.length} lines)</div>
    <div style="color:#8b949e;font-size:11px;margin-top:3px;">VFS Bundle: ${vfsFiles.length} file(s) mounted in memory &amp; disk</div>
    <pre>${selectedCode.slice(0, 600).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  </div>
</body>
</html>`;
  }, [vfsFiles, editorLines, activeFile, diagnostics.length, previewKey]);

  return (
    <div className="analyzer-sandbox-workspace" data-testid="analyzer-sandbox-workspace">
      {/* Left Pane (260px): VFS File Tree with Status Badges & Search Filter */}
      <aside className="analyzer-left-pane" style={{ width: '260px', flexShrink: 0 }}>
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FolderTree size={13} color="#38bdf8" />
            <span>VFS File Tree ({vfsFiles.length})</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleRunAnalyzerPipeline}
            disabled={isRunningAnalyzerDag}
            style={{ padding: '2px 8px', fontSize: '10px' }}
            title="Run DAG Nodes 10 → 11 → 12 (Parse Tags, TS AST Check, Sandbox IDE)"
          >
            <Play size={10} />
            <span>{isRunningAnalyzerDag ? 'Running...' : 'Parse & Check'}</span>
          </button>
        </div>

        <div className="filter-bar" style={{ padding: '6px 10px' }}>
          <Search size={12} color="#8b949e" />
          <input
            type="text"
            className="search-input"
            placeholder="Filter VFS files..."
            value={fileSearchQuery}
            onChange={(e) => setFileSearchQuery(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '11px' }}
          />
        </div>

        {tagParseReport && (
          <div
            style={{
              padding: '6px 10px',
              background: 'rgba(56, 189, 248, 0.06)',
              borderBottom: '1px solid #21262d',
              fontSize: '10px',
              color: '#8b949e',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span title="Tracked <!-- CODESCAN_FILE_START --> and <!-- CODESCAN_FILE_END --> markers">
                Markers:{' '}
                <strong style={{ color: '#58a6ff' }}>
                  {tagParseReport.markers_summary?.paired_markers_count ?? tagParseReport.total_files ?? 0}/
                  {tagParseReport.markers_summary?.total_start_markers ?? tagParseReport.total_files ?? 0}
                </strong>{' '}
                paired
              </span>
              <span>
                Healed: <strong style={{ color: '#00ff9d' }}>{tagParseReport.repaired_tags_count ?? 0}</strong>
              </span>
            </div>
            {tagParseReport.distinct_metrics_summary && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9.5px' }}>
                <span title="Distinct Size (UTF-8 bytes) matches against CODESCAN_FILE_START">
                  Size:{' '}
                  <strong style={{ color: '#00ff9d' }}>
                    {tagParseReport.distinct_metrics_summary.size_matched_count}/
                    {tagParseReport.distinct_metrics_summary.total_files}
                  </strong>
                </span>
                <span title="Distinct Line Count matches against CODESCAN_FILE_START">
                  Lines:{' '}
                  <strong style={{ color: '#00ff9d' }}>
                    {tagParseReport.distinct_metrics_summary.lines_matched_count}/
                    {tagParseReport.distinct_metrics_summary.total_files}
                  </strong>
                </span>
                <span title="Distinct Character Count matches against CODESCAN_FILE_START">
                  Chars:{' '}
                  <strong style={{ color: '#00ff9d' }}>
                    {tagParseReport.distinct_metrics_summary.chars_matched_count}/
                    {tagParseReport.distinct_metrics_summary.total_files}
                  </strong>
                </span>
              </div>
            )}
          </div>
        )}

        <div className="vfs-file-list pane-scrollable-with-buffer">
          {isLoadingWorkspace && vfsFiles.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: '#8b949e', fontSize: '11px' }}>
              Loading VFS workspace...
            </div>
          ) : filteredVfsFiles.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: '#8b949e', fontSize: '11.5px' }}>
              <p style={{ marginBottom: '8px' }}>No VFS files parsed yet.</p>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleRunAnalyzerPipeline}
                disabled={isRunningAnalyzerDag}
                style={{ margin: '0 auto' }}
              >
                <Sparkles size={11} />
                <span>Extract VFS from Markdown</span>
              </button>
            </div>
          ) : (
            filteredVfsFiles.map((file) => {
              const normPath = (file.normalized_path || file.path).replace(/^\/+/, '');
              const isSelected = normPath === selectedFilePath.replace(/^\/+/, '');
              const fileDiags = diagnosticsByFile.get(normPath) || [];
              const hasErrors = fileDiags.length > 0;
              const isTagHealed =
                file.tag_status && file.tag_status !== 'valid' && file.tag_status !== 'ok';

              return (
                <div
                  key={normPath}
                  className={`vfs-file-item ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectFile(file, 1)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                    <FileCode size={13} color={hasErrors ? '#f85149' : isSelected ? '#00ff9d' : '#58a6ff'} />
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontFamily: 'var(--font-mono)',
                        color: isSelected ? '#fff' : '#c9d1d9',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={normPath}
                    >
                      {normPath}
                    </span>
                  </div>

                  {/* Distinct Verification & Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {file.tag_status !== 'generated' && (file.expected_lines > 0 || (file.expected_size ?? 0) > 0) && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          padding: '1px 4px',
                          borderRadius: '4px',
                          background: file.all_metrics_match
                            ? 'rgba(0, 255, 157, 0.1)'
                            : 'rgba(227, 179, 65, 0.12)',
                          color: file.all_metrics_match ? '#00ff9d' : '#e3b341',
                          border: `1px solid ${file.all_metrics_match ? 'rgba(0,255,157,0.28)' : 'rgba(227,179,65,0.32)'}`,
                        }}
                        title={
                          `Distinct CODESCAN_FILE_START verification:\n` +
                          `• Size: ${file.actual_size ?? 0} / ${file.expected_size ?? file.size ?? 0}B (${file.size_matches ? '✔ Match' : `Δ ${file.size_delta ?? 0}B`})\n` +
                          `• Lines: ${file.actual_lines} / ${file.expected_lines} (${file.lines_matches ? '✔ Match' : `Δ ${file.line_count_delta ?? 0}`})\n` +
                          `• Chars: ${file.actual_chars ?? 0} / ${file.expected_chars ?? 0} (${file.chars_matches ? '✔ Match' : `Δ ${file.chars_delta ?? 0}`})\n` +
                          `• Markers: Ln ${file.tag_start_md_line ?? file.start_md_line} → Ln ${file.end_md_line} (${file.markers_paired !== false ? 'Paired ✔' : 'Unclosed ⚠️'})`
                        }
                      >
                        S{file.size_matches ? '✓' : '!'} L{file.lines_matches ? '✓' : '!'} C{file.chars_matches ? '✓' : '!'}
                      </span>
                    )}
                    {hasErrors ? (
                      <span className="vfs-status-badge error" title={`${fileDiags.length} TS Compiler Error(s)`}>
                        <XCircle size={10} />
                        <span>❌ {fileDiags.length}</span>
                      </span>
                    ) : isTagHealed ? (
                      <span className="vfs-status-badge healed" title={`Tag status: ${file.tag_status}`}>
                        <AlertTriangle size={10} />
                        <span>⚠️ {file.tag_status === 'metric_mismatch' ? 'Δ Metric' : 'Healed'}</span>
                      </span>
                    ) : (
                      <span className="vfs-status-badge valid" title="Valid VFS file & AST">
                        <CheckCircle2 size={10} />
                        <span>✔ Valid</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Center Pane (Flex 1): Monaco Code Editor + Original Screen Capture Loupe */}
      <main className="analyzer-center-pane">
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileCode size={13} color="#00ff9d" />
            <span style={{ color: '#f0f6fc', textTransform: 'none', fontSize: '12px' }}>
              {activeFile ? activeFile.normalized_path || activeFile.path : 'No file selected'}
            </span>
            {activeFile && (
              <span style={{ fontSize: '10.5px', color: '#8b949e', textTransform: 'none' }}>
                (MD Ln {activeFile.tag_start_md_line ?? activeFile.start_md_line}–{activeFile.end_md_line} • {editorLines.length} lines)
              </span>
            )}
            {activeFile && activeFile.tag_status !== 'generated' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: activeFile.markers_paired !== false ? 'rgba(56, 189, 248, 0.12)' : 'rgba(248, 81, 73, 0.15)',
                    color: activeFile.markers_paired !== false ? '#38bdf8' : '#f85149',
                    border: '1px solid rgba(56, 189, 248, 0.28)',
                  }}
                  title="Tracked <!-- CODESCAN_FILE_START --> and <!-- CODESCAN_FILE_END --> markdown line boundaries"
                >
                  Markers: START L{activeFile.tag_start_md_line ?? activeFile.start_md_line} →{' '}
                  {activeFile.markers_paired !== false ? `END L${activeFile.end_md_line} ✔` : 'UNCLOSED ⚠️'}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: activeFile.size_matches ? 'rgba(0, 255, 157, 0.1)' : 'rgba(227, 179, 65, 0.14)',
                    color: activeFile.size_matches ? '#00ff9d' : '#e3b341',
                    border: `1px solid ${activeFile.size_matches ? 'rgba(0,255,157,0.3)' : 'rgba(227,179,65,0.35)'}`,
                  }}
                  title="Distinct size verification against CODESCAN_FILE_START size attribute (UTF-8 bytes)"
                >
                  size: {(activeFile.actual_size ?? 0).toLocaleString()}/{(activeFile.expected_size ?? activeFile.size ?? 0).toLocaleString()}B{' '}
                  {activeFile.size_matches ? '✔' : `(${(activeFile.size_delta ?? 0) >= 0 ? '+' : ''}${activeFile.size_delta ?? 0}B)`}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: activeFile.lines_matches ? 'rgba(0, 255, 157, 0.1)' : 'rgba(227, 179, 65, 0.14)',
                    color: activeFile.lines_matches ? '#00ff9d' : '#e3b341',
                    border: `1px solid ${activeFile.lines_matches ? 'rgba(0,255,157,0.3)' : 'rgba(227,179,65,0.35)'}`,
                  }}
                  title="Distinct lines verification against CODESCAN_FILE_START lines attribute"
                >
                  lines: {activeFile.actual_lines.toLocaleString()}/{activeFile.expected_lines.toLocaleString()}{' '}
                  {activeFile.lines_matches ? '✔' : `(${(activeFile.line_count_delta ?? 0) >= 0 ? '+' : ''}${activeFile.line_count_delta ?? 0})`}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: activeFile.chars_matches ? 'rgba(0, 255, 157, 0.1)' : 'rgba(227, 179, 65, 0.14)',
                    color: activeFile.chars_matches ? '#00ff9d' : '#e3b341',
                    border: `1px solid ${activeFile.chars_matches ? 'rgba(0,255,157,0.3)' : 'rgba(227,179,65,0.35)'}`,
                  }}
                  title="Distinct chars verification against CODESCAN_FILE_START chars attribute"
                >
                  chars: {(activeFile.actual_chars ?? 0).toLocaleString()}/{(activeFile.expected_chars ?? 0).toLocaleString()}{' '}
                  {activeFile.chars_matches ? '✔' : `(${(activeFile.chars_delta ?? 0) >= 0 ? '+' : ''}${activeFile.chars_delta ?? 0})`}
                </span>
              </div>
            )}
            {isDirty && (
              <span style={{ fontSize: '10px', color: '#e3b341', fontWeight: 700 }}>● Modified</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className={`btn btn-sm ${showLoupe ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setShowLoupe((v) => !v)}
              style={{ padding: '2px 8px', fontSize: '10.5px' }}
              title="Toggle Original Screen Capture Loupe for currently focused Monaco line"
            >
              <Eye size={11} />
              <span>Capture Loupe</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => handleSaveFile()}
              disabled={!activeFile || isSavingFile}
              style={{ padding: '2px 10px', fontSize: '10.5px' }}
              title="Save edits to Sandbox VFS + state.document_lines and run incremental TypeScript AST check"
            >
              <Save size={11} />
              <span>{isSavingFile ? 'Validating...' : 'Save & Check AST'}</span>
            </button>
          </div>
        </div>

        {/* Toggleable Original Screen Capture Loupe */}
        {showLoupe && activeFile && (
          <div className="capture-loupe-bar" data-testid="original-capture-loupe">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="loupe-badge">
                  LOUPE • File Ln {focusedFileLine} ➔ Global MD Ln {currentGlobalMdLine}
                </span>
                {loupeData?.frame_id && (
                  <span style={{ fontSize: '10.5px', color: '#8b949e', fontFamily: 'var(--font-mono)' }}>
                    Frame: <strong style={{ color: '#58a6ff' }}>{loupeData.frame_id}</strong> • Ink: {loupeData.ink_pixels}px
                  </span>
                )}
                {isLoadingLoupe && <RotateCw size={11} className="spin" color="#58a6ff" />}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => fetchLoupeForLine(currentGlobalMdLine, true, false)}
                  disabled={isLoadingLoupe}
                  style={{ padding: '2px 8px', fontSize: '10px', color: '#58a6ff', borderColor: '#58a6ff44' }}
                >
                  <RotateCw size={10} />
                  <span>Re-OCR Crop</span>
                </button>
                {loupeData?.re_transcribed_text &&
                  loupeData.re_transcribed_text !== editorLines[focusedFileLine - 1] && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => fetchLoupeForLine(currentGlobalMdLine, false, true)}
                      style={{ padding: '2px 8px', fontSize: '10px' }}
                    >
                      <Sparkles size={10} />
                      <span>Apply Re-OCR Patch</span>
                    </button>
                  )}
              </div>
            </div>

            {loupeData?.cropped_data_url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                <img
                  src={loupeData.cropped_data_url}
                  alt={`Capture strip L${currentGlobalMdLine}`}
                  style={{
                    height: '32px',
                    maxWidth: '460px',
                    objectFit: 'contain',
                    borderRadius: '4px',
                    border: '1px solid #30363d',
                    background: '#010409',
                  }}
                />
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#c9d1d9', minWidth: 0 }}>
                  <div>
                    RapidOCR 2x: <code style={{ color: '#00ff9d' }}>{loupeData.rapidocr_text || '(blank)'}</code>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '10.5px', color: '#8b949e', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                Click any line in the editor below to inspect its original screenshot strip from{' '}
                <code>{lineToFrameMap[String(currentGlobalMdLine)]?.frame_id || 'captured frame'}</code>.
              </div>
            )}
          </div>
        )}

        {/* Monaco Virtual File Code Editor */}
        <div
          ref={editorContainerRef}
          className="monaco-vfs-editor pane-scrollable-with-buffer"
          data-testid="monaco-vfs-editor"
        >
          {!activeFile ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>
              Select a file from the VFS tree to inspect and edit in Monaco.
            </div>
          ) : (
            editorLines.map((lineText, idx) => {
              const fileLn = idx + 1;
              const globalLn = activeFile.start_md_line + idx;
              const isFocused = focusedFileLine === fileLn;
              const lineDiags = activeFileDiagnosticsByLine.get(fileLn) || [];
              const hasErr = lineDiags.length > 0;

              return (
                <div key={fileLn} id={`monaco-line-${fileLn}`} className="monaco-line-block">
                  <div
                    className={`monaco-line-row ${isFocused ? 'focused' : ''} ${hasErr ? 'has-error' : ''}`}
                    onClick={() => setFocusedFileLine(fileLn)}
                  >
                    <span className="monaco-gutter-file-ln" title={`File Line ${fileLn}`}>
                      {fileLn}
                    </span>
                    <span className="monaco-gutter-md-ln" title={`Global Markdown Line L${globalLn}`}>
                      L{globalLn}
                    </span>
                    <input
                      type="text"
                      className="monaco-line-input"
                      value={lineText}
                      onFocus={() => setFocusedFileLine(fileLn)}
                      onChange={(e) => {
                        const next = [...editorLines];
                        next[idx] = e.target.value;
                        setEditorLines(next);
                        setIsDirty(true);
                      }}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                          e.preventDefault();
                          handleSaveFile();
                        }
                      }}
                      spellCheck={false}
                    />
                  </div>
                  {hasErr &&
                    lineDiags.map((d, dIdx) => (
                      <div key={dIdx} className="monaco-inline-diagnostic">
                        <AlertTriangle size={11} color="#f85149" />
                        <span>
                          [TS{d.code}] Ln {d.line}:{d.column} — {d.message}
                        </span>
                      </div>
                    ))}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Right Pane (340px): Compiler Diagnostics List + Live Sandbox Preview Iframe */}
      <aside className="analyzer-right-pane" style={{ width: '340px', flexShrink: 0 }}>
        {/* Top Half: Compiler Diagnostics List */}
        <div className="analyzer-diagnostics-section">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Terminal size={13} color={diagnostics.length === 0 ? '#00ff9d' : '#f85149'} />
              <span>TS Compiler Diagnostics ({diagnostics.length})</span>
            </div>
            {compilationSummary && (
              <span style={{ fontSize: '10px', color: '#00ff9d' }}>
                {compilationSummary.compilable_files ?? 0}/{compilationSummary.total_files ?? vfsFiles.length} OK
              </span>
            )}
          </div>

          <div className="diagnostics-list pane-scrollable-with-buffer">
            {diagnostics.length === 0 ? (
              <div style={{ padding: '20px 14px', textAlign: 'center', color: '#00ff9d', fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}>
                ✔ Zero TypeScript syntactic or semantic diagnostics!
              </div>
            ) : (
              diagnostics.map((diag, idx) => (
                <div
                  key={`${diag.file}-${diag.line}-${diag.code}-${idx}`}
                  className="diagnostic-card-item"
                  onClick={() => {
                    const targetFile = vfsFiles.find(
                      (f) =>
                        f.normalized_path.replace(/^\/+/, '') === diag.file.replace(/^\/+/, '') ||
                        f.path.replace(/^\/+/, '') === diag.file.replace(/^\/+/, '')
                    );
                    if (targetFile) {
                      handleSelectFile(targetFile, diag.line || 1);
                    }
                    setShowLoupe(true);
                    if (diag.global_md_line) {
                      fetchLoupeForLine(diag.global_md_line, false, false);
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <span style={{ color: '#f85149', fontWeight: 700, fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                      TS{diag.code} • {diag.file}:{diag.line}:{diag.column}
                    </span>
                    <span style={{ fontSize: '10px', color: '#58a6ff', fontFamily: 'var(--font-mono)' }}>
                      MD L{diag.global_md_line}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#c9d1d9', lineHeight: 1.35 }}>{diag.message}</div>
                  {diag.snippet && (
                    <code
                      style={{
                        display: 'block',
                        marginTop: '4px',
                        padding: '2px 6px',
                        background: '#0d1117',
                        borderRadius: '3px',
                        fontSize: '10px',
                        color: '#8b949e',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {diag.snippet}
                    </code>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom Half: Live Sandbox / Storybook Component Preview Iframe */}
        <div className="analyzer-sandbox-preview-section">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={13} color="#10b981" />
              <span>Live Sandbox Preview</span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setPreviewKey((k) => k + 1)}
              style={{ padding: '1px 6px', fontSize: '10px' }}
              title="Refresh Sandbox Iframe"
            >
              <RotateCw size={10} />
              <ExternalLink size={10} />
            </button>
          </div>
          <div style={{ flex: 1, position: 'relative', background: '#0d1117', overflow: 'hidden' }}>
            <iframe
              key={previewKey}
              title="Sandbox Live Preview"
              srcDoc={sandboxSrcDoc}
              sandbox="allow-scripts"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              data-testid="sandbox-preview-iframe"
            />
          </div>
        </div>
      </aside>
    </div>
  );
};

export default AnalyzerSandboxWorkspace;
