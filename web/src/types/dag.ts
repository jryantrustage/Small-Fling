export interface DagNodeState {
  id: string;
  name: string;
  subhead: string;
  status: 'idle' | 'active' | 'completed' | 'error' | 'prevented';
  metric?: string;
  details?: string;
}

export interface QualifierConfigItem {
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
  issue_detected?: boolean;
  details?: string;
}

export interface Node5ConfigState {
  prevent_trigger_on_issue: boolean;
  qualifiers: Record<string, QualifierConfigItem>;
}

export interface TriggerDecisionState {
  allowed: boolean;
  prevented: boolean;
  reasons: string[];
  evaluated_at?: string | null;
  qualifier_statuses?: Record<string, any>;
}

export interface PerformanceDiagnosis {
  nodeId: string;
  title: string;
  category: 'HEALTHY' | 'AUTO_HEALING_CHURN' | 'OCR_BOTTLENECK' | 'ADB_SCREENSHOT_OVERHEAD' | 'PRECHECK_BLOCKING' | 'VIEWPORT_SCROLL_LAG' | 'UNRESOLVED_ERROR';
  severity: 'healthy' | 'warning' | 'critical';
  summary: string;
  evidence: string[];
  remediations: string[];
  metrics: {
    duration_ms: number;
    precheck_ms: number;
    action_ms: number;
    healing_ms: number;
    ocr_latency_ms: number;
    capture_rtt_ms: number;
    precheck_pct: number;
    action_pct: number;
    healing_pct: number;
  };
  markdown_prompt: string;
  promptDataUri: string;
}

export type DagGroup =
  | 'initialize'
  | 'capture_entire_markdown'
  | 'position_navigation'
  | 'verify_assemble'
  | 'post_capture_analyzer';

export type DagPhase = 'phase1_init' | 'phase2_capture' | 'phase3_analyzer';

export interface NodeMeta {
  id: string;
  step: string;
  shortName: string;
  fullName: string;
  subhead: string;
  desc: string;
  group: DagGroup;
  accentColor: string;
  hasConfig?: boolean;
}

export interface NodeLiveStatus {
  isRunning: boolean;
  isActive: boolean;
  isError: boolean;
  isAborted?: boolean;
  isDone: boolean;
  statusLabel: string;
  metricLabel: string;
  evaluator: string | null;
  healingStep: string | null;
  telemetryInsight: string | null;
  color: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  timings?: Record<string, any> | null;
  dagContext?: Record<string, any> | null;
  traceInsights?: string[] | null;
  nodeError?: string | null;
}

export interface DagEdge {
  id?: string;
  from: string;
  to: string;
  enabled?: boolean;
  label?: string;
  is_loopback?: boolean;
  has_semaphore?: boolean;
  condition?: string;
}

export interface LoopDiagnosisData {
  status?: string;
  project_id?: string | null;
  project_name?: string | null;
  loop_running: boolean;
  headless_status: string;
  orchestration_status: string;
  frontier_line: number;
  next_expected_top_line: number;
  target_total_lines: number;
  completion_percent: number;
  is_complete: boolean;
  total_frames: number;
  captured_frames_count?: number;
  regressed_frames_count: number;
  manual_attention_required: boolean;
  can_resume: boolean;
  halt_reason: string;
  failed_node_id?: string | null;
  recommended_action: string;
}

export interface DagStatusData {
  dag?: {
    current_active_node?: string;
    current_active_group?: string;
    groups?: Record<string, any>;
    nodes?: Record<string, any>;
    edges?: DagEdge[];
    semaphore_group2_to_3?: boolean;
    semaphore_group3_to_4?: boolean;
    semaphore_status?: 'open' | 'blocked';
    semaphore_group2_to_3_status?: 'open' | 'blocked';
    semaphore_group3_to_4_status?: 'open' | 'blocked';
    bypass_live_ocr?: boolean;
    headless_mode?: boolean;
  };
  active_node: string;
  loop_running?: boolean;
  loop_diagnosis?: LoopDiagnosisData;
  target_total_lines: number;
  current_top_line: number;
  current_bottom_line: number;
  current_page: number;
  is_keyboard_guarded: boolean;
  desktop_keyboard_prohibited?: boolean;
  desktop_mode_enabled?: boolean;
  bypass_live_ocr?: boolean;
  headless_mode?: boolean;
  arrow_step_count: number;
  verification_trigger_fired: boolean;
  ocr_worker_active: boolean;
  ocr_latency_ms: number;
  node_5_config?: Node5ConfigState;
  trigger_decision?: TriggerDecisionState;
}

export const NODES_METADATA: NodeMeta[] = [
  {
    id: 'init_end',
    step: '1',
    shortName: 'Determine Lines',
    fullName: '1. DETERMINE TOTAL LINES',
    subhead: 'HID Ctrl + End & Last Line OCR',
    desc: 'Sends HID Ctrl+End keys, verifies gutter at EOF, then displays total lines by OCR of last line.',
    group: 'initialize',
    accentColor: '#58a6ff',
    hasConfig: true
  },
  {
    id: 'reset_home',
    step: '2',
    shortName: 'Return to Line 1',
    fullName: '2. RETURN TO LINE 1',
    subhead: 'HID Ctrl + Home & Verify Line 1',
    desc: 'Sends HID Ctrl+Home to return to line 1, then verifies line 1 is on top in gutter.',
    group: 'initialize',
    accentColor: '#a371f7',
    hasConfig: true
  },
  {
    id: 'frame_acquire',
    step: '3',
    shortName: 'Screen Capture',
    fullName: '3. SCREEN CAPTURE',
    subhead: 'Grab Screen Frame',
    desc: 'Captures external display screenshot and saves image.',
    group: 'capture_entire_markdown',
    accentColor: '#00ff9d',
    hasConfig: true
  },
  {
    id: 'local_ai_ocr',
    step: '4',
    shortName: 'MiniCPM-V',
    fullName: '4. LOCAL AI OCR',
    subhead: 'MiniCPM-V Vision',
    desc: 'Extracts verbatim markdown & code lines using local MiniCPM-V multimodal vision model in Ollama.',
    group: 'capture_entire_markdown',
    accentColor: '#388bfd',
    hasConfig: true
  },
  {
    id: 'frame_ocr',
    step: '5',
    shortName: 'Line Pos Verify',
    fullName: '5. GUTTER & LINE POSITION VERIFY',
    subhead: '1:1 Row Position Verifier',
    desc: 'Extracts gutter line numbers, verifies every OCR line maps 1:1 to its physical image row slice, and auto-repairs any shifted rows.',
    group: 'position_navigation',
    accentColor: '#8957e5',
    hasConfig: true
  },
  {
    id: 'arrow_down',
    step: '6',
    shortName: 'Scroll Down',
    fullName: '6. VIEWPORT NAVIGATION',
    subhead: 'Position Target Top',
    desc: 'Positions next target top line (prev bottom + 1) onto top gutter using calculated DownArrow presses.',
    group: 'position_navigation',
    accentColor: '#ffa657',
    hasConfig: true
  },
  {
    id: 'verification_trigger',
    step: '7',
    shortName: 'Verify Trigger',
    fullName: '7. VERIFY & TRIGGER',
    subhead: 'Settle Timing & Qualifiers',
    desc: 'Verifies top line is settled and evaluates qualifiers before advancing the capture loop.',
    group: 'verify_assemble',
    accentColor: '#58a6ff',
    hasConfig: true
  },
  {
    id: 'document_assemble',
    step: '8',
    shortName: 'Assemble Doc',
    fullName: '8. ASSEMBLE MARKDOWN',
    subhead: 'Reconstruct Master Document',
    desc: 'Assembles verified code blocks into continuous markdown and evaluates EOF loopback completion.',
    group: 'verify_assemble',
    accentColor: '#bc8cff',
    hasConfig: true
  },
  {
    id: 'batch_frames_ocr',
    step: '9',
    shortName: 'Batch Rescan',
    fullName: '9. SEQUENTIAL BATCH OCR',
    subhead: 'Sequential All-Frames Rescan',
    desc: 'Runs full OCR rescan on each captured frame sequentially top-to-bottom, aligning duplicated line numbers and assembling markdown.',
    group: 'verify_assemble',
    accentColor: '#00ff9d',
    hasConfig: true
  },
  {
    id: 'markdown_tag_parser',
    step: '10',
    shortName: 'Parse File Tags',
    fullName: '10. PARSE FILE TAGS & VFS TREE',
    subhead: 'CODESCAN Tag & Boundary Repair',
    desc: 'Parses reconstructed markdown file blocks, repairs OCR-corrupted CODESCAN tags from source frames, and builds the VFS tree.',
    group: 'post_capture_analyzer',
    accentColor: '#38bdf8',
    hasConfig: true
  },
  {
    id: 'ast_compiler_validator',
    step: '11',
    shortName: 'TS AST Compile',
    fullName: '11. AST & TYPESCRIPT COMPILER CHECK',
    subhead: 'In-Memory memfs AST & Auto-Heal',
    desc: 'Validates all VFS files with TypeScript Compiler API in memfs and auto-heals syntax errors by re-OCRing source frame crops.',
    group: 'post_capture_analyzer',
    accentColor: '#f59e0b',
    hasConfig: true
  },
  {
    id: 'sandbox_ide',
    step: '12',
    shortName: 'Sandbox & Monaco',
    fullName: '12. SANDBOX & MONACO VFS READY',
    subhead: 'Materialize Sandbox & Live IDE',
    desc: 'Materializes VFS files to disk, links shared node_modules, and publishes workspace diagnostics and line-to-frame source maps.',
    group: 'post_capture_analyzer',
    accentColor: '#10b981',
    hasConfig: true
  }
];

export interface Dag2NodeExecutionRecord {
  node_id: string;
  name: string;
  status: string;
  started_at_ms: number;
  finished_at_ms: number;
  duration_ms: number;
  details?: Record<string, any>;
}

export interface Dag2LoopExecutionRecord {
  loop_index: number;
  loop_id: string;
  status: string;
  started_at_ms: number;
  finished_at_ms: number;
  duration_ms: number;
  duration_formatted: string;
  nodes: Dag2NodeExecutionRecord[];
}

export interface Dag2Bottleneck {
  rank: number;
  node_id: string;
  name: string;
  time_spent: string;
  percentage: number;
  root_cause: string;
  remediation: string;
}

export interface Dag2NodeStatistic {
  node_id: string;
  name: string;
  total_ms: number;
  total_formatted: string;
  avg_ms: number;
  avg_formatted: string;
  percentage_of_total: number;
}

export interface Dag2LineDiscrepancy {
  type: string;
  expected_char: string;
  ocr_char: string;
  description: string;
}

export interface Dag2LineDiagnostics {
  image_processing?: string;
  dpi_resolution?: string;
  model_tuning?: string;
}

export interface Dag2SampledLineAudit {
  line_number: number;
  ocr_text: string;
  gemini_reference_text: string;
  accuracy_percent: number;
  status: 'perfect_match' | 'minor_discrepancy' | 'mismatch';
  character_diff_summary: string;
  discrepancies?: Dag2LineDiscrepancy[];
  diagnostics?: Dag2LineDiagnostics;
}

export interface Dag2SystemRecommendations {
  device_dpi?: string;
  display_resolution?: string;
  ocr_image_preprocessing?: string;
  model_temperature_and_prompt?: string;
}

export interface Dag2AccuracyAudit {
  status: string;
  audited_at?: string;
  model_auditor?: string;
  overall_accuracy_percent: number;
  character_error_rate_pct: number;
  audited_lines_count: number;
  perfect_matches_count: number;
  sampled_lines: Dag2SampledLineAudit[];
  system_recommendations?: Dag2SystemRecommendations;
}

export interface DiagnosticsStopRestartEvent {
  id: string;
  timestamp_iso: string;
  timestamp_ms: number;
  event_type: string;
  loop_index: number;
  page_index: number;
  top_line: number;
  bottom_line: number;
  target_top_line: number;
  node_id?: string | null;
  reason: string;
  recovery_action?: string | null;
  downtime_ms?: number;
  downtime_formatted?: string | null;
}

export interface DiagnosticsLoopRunRecord {
  loop_index: number;
  loop_id: string;
  page_index: number;
  frame_id?: string | null;
  top_line: number;
  bottom_line: number;
  target_next_top: number;
  extracted_lines: number;
  started_at_iso: string;
  started_at_ms: number;
  finished_at_iso: string;
  finished_at_ms: number;
  duration_ms: number;
  duration_formatted: string;
  status: string;
  failed_node?: string | null;
  error_reason?: string | null;
  recovery_applied?: string | null;
  arrows_pressed?: number;
  node_timings?: Record<string, number>;
}

export interface ProjectDiagnosticsTrace {
  project_id?: string | null;
  project_name?: string | null;
  target_total_lines: number;
  project_started_at_iso?: string | null;
  project_started_at_ms?: number | null;
  first_line_acquired_at_iso?: string | null;
  first_line_acquired_at_ms?: number | null;
  first_frame_id?: string | null;
  last_line_acquired_at_iso?: string | null;
  last_line_acquired_at_ms?: number | null;
  last_frame_id?: string | null;
  highest_line_acquired: number;
  completed_at_iso?: string | null;
  completed_at_ms?: number | null;
  is_completed: boolean;
  current_status: string;
  last_stop_at_iso?: string | null;
  last_stop_at_ms?: number | null;
  last_stop_reason?: string | null;
  total_captured_frames?: number;
  total_assembled_lines?: number;
  completion_percent?: number;
  loop_running?: boolean;
  summary_metrics?: {
    total_loop_runs: number;
    successful_runs: number;
    failed_runs: number;
    auto_recovered_runs: number;
    total_stops: number;
    total_manual_restarts: number;
    total_auto_recoveries: number;
    total_elapsed_ms: number;
    total_elapsed_formatted: string;
    total_active_ms: number;
    total_active_formatted: string;
    total_downtime_ms: number;
    total_downtime_formatted: string;
    avg_loop_duration_ms: number;
    avg_loop_duration_formatted: string;
  };
  stop_and_restart_log: DiagnosticsStopRestartEvent[];
  loop_runs: DiagnosticsLoopRunRecord[];
  lifecycle_events: DiagnosticsStopRestartEvent[];
}

export interface Dag2PerformanceReport {
  status: string;
  generated_at?: string;
  summary: {
    total_loops: number;
    total_elapsed_ms: number;
    total_elapsed_formatted: string;
    average_loop_ms: number;
    average_loop_formatted: string;
    min_loop_ms: number;
    min_loop_formatted: string;
    max_loop_ms: number;
    max_loop_formatted: string;
    trend: string;
  };
  loops: Dag2LoopExecutionRecord[];
  node_statistics: Dag2NodeStatistic[];
  bottlenecks: Dag2Bottleneck[];
  accuracy_audit?: Dag2AccuracyAudit;
  diagnostics_trace?: ProjectDiagnosticsTrace;
  ai_optimization_prompt: string;
}
