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

export type DagGroup = 'initialize' | 'capture_entire_markdown' | 'position_navigation' | 'verify_assemble';

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
  };
  active_node: string;
  target_total_lines: number;
  current_top_line: number;
  current_bottom_line: number;
  current_page: number;
  is_keyboard_guarded: boolean;
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
    accentColor: '#58a6ff'
  },
  {
    id: 'reset_home',
    step: '2',
    shortName: 'Return to Line 1',
    fullName: '2. RETURN TO LINE 1',
    subhead: 'HID Ctrl + Home & Verify Line 1',
    desc: 'Sends HID Ctrl+Home to return to line 1, then verifies line 1 is on top in gutter.',
    group: 'initialize',
    accentColor: '#a371f7'
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
    accentColor: '#388bfd'
  },
  {
    id: 'frame_ocr',
    step: '5',
    shortName: 'Gutter OCR',
    fullName: '5. GUTTER OCR & BOUNDS',
    subhead: 'Lines & Bounds Reader',
    desc: 'Extracts gutter line numbers, top/bottom bounds, and verifies target top position for next page.',
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
    accentColor: '#ffa657'
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
  ai_optimization_prompt: string;
}
