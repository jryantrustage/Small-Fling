export interface ProjectData {
  id: string;
  name: string;
  description: string;
  target_total_lines: number;
  status: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  frame_count?: number;
  line_count?: number;
  min_line?: number | null;
  max_line?: number | null;
}

export interface LineData {
  line_number: number;
  gutter_number?: number;
  text: string;
  is_blank: boolean;
  is_wrapped?: boolean;
  wrapped_line_count?: number;
  status: string;
  frame_id: string;
  sources?: string[];
  confidence?: number;
  notes: string;
  updated_at: string;
}

export interface FrameData {
  frame_id: string;
  filename: string;
  top_line: number;
  bottom_line: number;
  page_index: number;
  file_size: number;
  status: string;
  created_at: string;
  extracted_line_count: number;
  custom_offset_y?: number;
  model_used?: string;
  token_usage?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
}

export interface RecaptureItem {
  line_number: number;
  reason: string;
  requested_at: string;
}

export interface TokenStats {
  total_prompt_tokens: number;
  total_candidates_tokens: number;
  total_tokens: number;
  total_api_calls: number;
  estimated_cost_usd: number;
  mobile_tokens?: {
    prompt_tokens: number;
    candidates_tokens: number;
    total_tokens: number;
  };
}

export interface BoundingBoxItem {
  x: number;
  y: number;
  width: number;
  height: number;
  line_number?: number;
  text_snippet?: string;
}

export interface FrameBoundingBoxes {
  first_line?: BoundingBoxItem;
  last_line?: BoundingBoxItem;
  wrapped_lines?: BoundingBoxItem[];
}

export interface AlignmentBox {
  name: string;
  color: string;
  hex: string;
  passed: boolean;
  dismissed?: boolean;
  status?: 'PASSED' | 'FAILED' | 'PASSED (DISMISSED)';
  detected_value?: string;
  expected?: string;
  details?: string;
  text?: string;
  line_number?: number;
  icon?: string;
  luminance?: number;
  box_px: [number, number, number, number];
  box_norm: [number, number, number, number];
}

export interface ClassifierIssue {
  classifier_id: string;
  issue_detected: boolean;
  issue_name: string;
  fix_name: string;
  severity: string;
  confidence: number;
  details?: string;
  dismissed?: boolean;
  target_coordinates?: [number, number];
  metadata?: Record<string, any>;
}

export interface ClassifierReport {
  has_issues: boolean;
  issue_count: number;
  issues: ClassifierIssue[];
  registered_classifiers?: Array<{
    id: string;
    issue_description: string;
    fix_description: string;
    severity: string;
  }>;
  auto_fix_enabled?: boolean;
}

export interface AlignmentData {
  status: string;
  is_aligned: boolean;
  reason?: string | null;
  missing?: string[];
  first_line_number?: number;
  last_line_number?: number;
  file_name?: string;
  boxes?: Record<string, AlignmentBox>;
  resolution?: { width: number; height: number };
  timestamp?: string | null;
  classifiers?: ClassifierReport;
  classifier_issues?: ClassifierIssue[];
  dismissed?: string[];
}

export interface DeviceItem {
  serial: string;
  status: string;
  model: string;
  displayName?: string;
  raw?: string;
}

export interface DeviceProfile {
  id: string;
  displayName: string;
  lines_per_page: number;
  arrow_count_init: number;
  arrow_count_step: number;
  step_size: number;
}

export interface DeviceInfoData {
  status: string;
  connected: boolean;
  active_serial: string | null;
  active_model: string;
  device_model: 'pixel_8' | 'pixel_10';
  profile: DeviceProfile;
  available_profiles: DeviceProfile[];
  target_serial: string | null;
  devices: DeviceItem[];
  displays: {
    desktop: boolean;
    phone: boolean;
  };
}

export interface DocumentSummary {
  total_lines: number;
  min_line: number;
  max_line: number;
  total_frames: number;
  issue_count: number;
  verified_overlap_lines: number;
}

export interface ProcessAttributeItem {
  name: string;
  label?: string;
  pid: string | number;
  ppid?: string | number;
  user: string;
  rss_kb?: number;
  rss_mb?: string | number;
  activity?: string;
  is_focused: boolean;
}

export interface LiveViewMeta {
  timestamp: string;
  live_mode: 'desktop' | 'phone';
  device: {
    serial: string | null;
    model: string;
    target_serial?: string | null;
    connected: boolean;
  };
  display: {
    name: string;
    display_id?: string;
    mode: string;
    resolution: string;
    fps?: number;
    rotation?: number;
    state?: string;
  };
  processes: {
    focused_app?: string;
    focused_window?: string;
    running_processes: ProcessAttributeItem[];
    keyboard_status?: {
      ime_visible: boolean;
      hard_keyboard_suppressed: boolean;
    };
  };
  gutter_stats: {
    first_line_number: number;
    last_line_number: number;
    visible_lines: number;
    alignment_status: string;
    is_aligned: boolean;
    file_name?: string;
    dark_mode?: boolean;
    edit_mode?: boolean;
    line_range?: string;
    boxes?: {
      first_line?: AlignmentBox;
      last_line?: AlignmentBox;
    };
  };
}

