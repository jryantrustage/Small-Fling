import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings, RefreshCw, Sliders,
  ArrowUp, ArrowDown, Play, Wrench, AlertTriangle, CheckCircle2,
  Zap, Sparkles, ShieldCheck, Plus, X, Moon, Edit3, Keyboard,
  FolderGit2
} from 'lucide-react';
import { Modal } from '../../ConfirmModal';

export interface ObservationActionItem {
  action_id: string;
  label: string;
  description: string;
  hook_phase: string;
  is_compounding: boolean;
  priority: number;
}

export interface UniversalNodeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  nodeTitle?: string;
  apiBase: string;
  activeSerial?: string | null;
  nodeConfig: Record<string, any>;
  initialAttachedActions?: string[];
  onSave: (config: Record<string, any>, attachedActions: string[]) => Promise<void>;
}

// Canonical backend action IDs and aliases
const ACTION_ID_ALIASES: Record<string, string> = {
  'view_mode_detected_switch_to_edit': 'view_mode_to_edit_mode',
  'light_mode_detected_switch_to_dark': 'light_mode_to_dark_mode',
  'keyboard_detected_close_keyboard': 'keyboard_detected_close',
  'line_number_top_not_detected_detect_top': 'top_line_missing_detect',
  'line_number_bottom_not_detected_detect_bottom': 'bottom_line_missing_detect',
  'view_mode_to_edit': 'view_mode_to_edit_mode',
  'light_mode_to_dark': 'light_mode_to_dark_mode',
  'close_keyboard': 'keyboard_detected_close',
};

function normalizeActionId(id: string): string {
  return ACTION_ID_ALIASES[id] || id;
}

const STANDARD_RECOMMENDED_ACTIONS = [
  'keyboard_detected_close',
  'view_mode_to_edit_mode',
  'light_mode_to_dark_mode',
  'top_line_missing_detect',
  'bottom_line_missing_detect'
];

interface ActionUiMeta {
  title: string;
  category: string;
  badgeColor: string;
  explanation: string;
  icon: 'keyboard' | 'edit' | 'moon' | 'top' | 'bottom' | 'onedrive';
  recommended: boolean;
}

const ACTION_UI_META: Record<string, ActionUiMeta> = {
  keyboard_detected_close: {
    title: 'Virtual Keyboard Guard',
    category: 'Screen & Viewport',
    badgeColor: '#388bfd',
    explanation: 'Detects active soft keyboard via dumpsys input_method and dismisses it so line numbers and viewport are never obscured.',
    icon: 'keyboard',
    recommended: true,
  },
  view_mode_to_edit_mode: {
    title: 'Edit Mode Enforcer',
    category: 'Screen & Viewport',
    badgeColor: '#58a6ff',
    explanation: 'Detects read-only viewer mode or split panes and taps the pencil icon in MarkdownToolbar to enforce single-pane edit mode.',
    icon: 'edit',
    recommended: true,
  },
  light_mode_to_dark_mode: {
    title: 'Dark Theme Enforcer',
    category: 'Screen & Viewport',
    badgeColor: '#a371f7',
    explanation: 'Detects light canvas luminance (>= 55.0) and switches editor theme to dark mode for optimal OCR contrast and line extraction.',
    icon: 'moon',
    recommended: true,
  },
  top_line_missing_detect: {
    title: 'Top Line Gutter Detector',
    category: 'Gutter OCR & Heuristics',
    badgeColor: '#3fb950',
    explanation: 'Inspects top line gutter ROI; recovers missing top numbers via median pitch extrapolation and fallback OCR.',
    icon: 'top',
    recommended: true,
  },
  bottom_line_missing_detect: {
    title: 'Bottom Line Gutter Validator',
    category: 'Gutter OCR & Heuristics',
    badgeColor: '#3fb950',
    explanation: 'Validates bottom line visibility in the current viewport and applies calibrated line capacity and sub-line scroll adjustments.',
    icon: 'bottom',
    recommended: true,
  },
  markdown_not_open_navigate_onedrive: {
    title: 'OneDrive Document Recovery (Compounding)',
    category: 'Autonomous Navigation',
    badgeColor: '#ffa657',
    explanation: '5-step autonomous recovery: launches Teams on external display, navigates OneDrive folders, and opens the target Markdown file.',
    icon: 'onedrive',
    recommended: false,
  }
};

const DEFAULT_OBSERVATION_PLUGINS: ObservationActionItem[] = [
  {
    action_id: 'keyboard_detected_close',
    label: 'keyboard detected, closing keyboard',
    description: 'Detects if soft virtual keyboard is visible or obscuring viewport and dismisses it.',
    hook_phase: 'pre',
    is_compounding: false,
    priority: 10
  },
  {
    action_id: 'view_mode_to_edit_mode',
    label: 'view mode detected, switching to edit mode',
    description: 'Detects if Markdown viewer is in read-only view mode and taps Edit Mode pencil button.',
    hook_phase: 'pre',
    is_compounding: false,
    priority: 20
  },
  {
    action_id: 'light_mode_to_dark_mode',
    label: 'light mode detected, switching to dark mode',
    description: 'Detects if editor is rendered in light theme and switches to dark mode for optimal OCR contrast.',
    hook_phase: 'pre',
    is_compounding: false,
    priority: 25
  },
  {
    action_id: 'top_line_missing_detect',
    label: 'line number at top not detected, detecting line number at top',
    description: 'Inspects top line gutter region and applies fallback OCR or nudge heuristics to detect the top line.',
    hook_phase: 'error',
    is_compounding: false,
    priority: 30
  },
  {
    action_id: 'bottom_line_missing_detect',
    label: 'line number at bottom not detected',
    description: 'Validates visibility of bottom line in current viewport and performs sub-line scroll adjustments.',
    hook_phase: 'error',
    is_compounding: false,
    priority: 35
  },
  {
    action_id: 'markdown_not_open_navigate_onedrive',
    label: 'markdown editor not open, selecting one drive and navigating to folder to open the target file',
    description: 'Compounding 5-step recovery: launches Teams on external display, navigates OneDrive folders, and opens target Markdown file.',
    hook_phase: 'pre',
    is_compounding: true,
    priority: 5
  }
];

// In-memory catalog cache across modal opens
let cachedCatalog: ObservationActionItem[] | null = null;

export const UniversalNodeConfigModal: React.FC<UniversalNodeConfigModalProps> = ({
  isOpen,
  onClose,
  nodeId,
  nodeTitle,
  apiBase,
  activeSerial,
  nodeConfig,
  initialAttachedActions = [],
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'actions' | 'params'>('actions');
  const [localConfig, setLocalConfig] = useState<Record<string, any>>(nodeConfig || {});
  const [attachedActions, setAttachedActions] = useState<string[]>([]);
  const [allActions, setAllActions] = useState<ObservationActionItem[]>(cachedCatalog || DEFAULT_OBSERVATION_PLUGINS);
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{
    detected: Array<{ action_id: string; label: string; reason?: string }>;
    clean: Array<{ action_id: string; label: string }>;
    recommended_actions?: string[];
  } | null>(null);
  const [remediatingId, setRemediatingId] = useState<string | null>(null);
  const [remediationMsg, setRemediationMsg] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // References to prevent background WebSocket / timer polling from resetting user inputs
  const prevIsOpenRef = useRef(false);
  const prevNodeIdRef = useRef<string | null>(null);
  const nodeConfigRef = useRef(nodeConfig);
  const initialActionsRef = useRef(initialAttachedActions);

  useEffect(() => {
    nodeConfigRef.current = nodeConfig;
    initialActionsRef.current = initialAttachedActions;
  });

  const fetchCatalog = useCallback(async (force = false) => {
    if (cachedCatalog && !force) {
      setAllActions(cachedCatalog);
      return;
    }
    setIsLoadingActions(true);
    try {
      // 1. Fetch from canonical /api/dag/observations/actions
      const res = await fetch(`${apiBase}/api/dag/observations/actions`);
      if (res.ok) {
        const data = await res.json();
        if (data.actions && data.actions.length > 0) {
          cachedCatalog = data.actions;
          setAllActions(data.actions);
          return;
        }
      }
      // 2. Fallback to /api/dag/observation-actions
      const res2 = await fetch(`${apiBase}/api/dag/observation-actions`);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2.actions && data2.actions.length > 0) {
          cachedCatalog = data2.actions;
          setAllActions(data2.actions);
          return;
        }
      }
    } catch (err) {
      console.warn('[UniversalConfig] Using default observation actions catalog:', err);
      if (!cachedCatalog) {
        setAllActions(DEFAULT_OBSERVATION_PLUGINS);
      }
    } finally {
      setIsLoadingActions(false);
    }
  }, [apiBase]);

  // Sync state ONCE when modal transitions to open, or when nodeId changes.
  useEffect(() => {
    const isJustOpening = isOpen && !prevIsOpenRef.current;
    const isNodeChanged = isOpen && prevNodeIdRef.current !== nodeId;

    if (isJustOpening || isNodeChanged) {
      setLocalConfig({ ...(nodeConfigRef.current || {}) });
      const normalized = (initialActionsRef.current || []).map(normalizeActionId);
      setAttachedActions(normalized);
      setScanResults(null);
      setRemediationMsg(null);
      fetchCatalog(false);
    }

    prevIsOpenRef.current = isOpen;
    prevNodeIdRef.current = nodeId;
  }, [isOpen, nodeId, fetchCatalog]);

  const handleRunScan = async () => {
    setIsScanning(true);
    setRemediationMsg(null);
    try {
      let res = await fetch(`${apiBase}/api/dag/observations/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: activeSerial,
          node_id: nodeId
        })
      });

      if (!res.ok) {
        res = await fetch(`${apiBase}/api/dag/observation-actions/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial: activeSerial,
            node_id: nodeId
          })
        });
      }

      if (res.ok) {
        const data = await res.json();
        const detected = (data.detected_issues || data.detected || []).map((d: any) => ({
          action_id: normalizeActionId(d.action_id || d.id),
          label: d.label || d.config_label || d.action_id,
          reason: d.reason || d.message || d.diagnostic
        }));
        const clean = (data.clean_invariants || data.clean || []).map((c: any) => ({
          action_id: normalizeActionId(c.action_id || c.id),
          label: c.label || c.config_label || c.action_id
        }));
        const recommended = (data.recommended_actions || []).map(normalizeActionId);

        setScanResults({
          detected,
          clean,
          recommended_actions: recommended
        });
      }
    } catch (err: any) {
      console.error('[UniversalConfig] Scan error:', err);
      setRemediationMsg({
        id: 'scan_error',
        success: false,
        msg: `Failed to complete live screen scan: ${err.message}`
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleAutoAttachRecommended = () => {
    const recommendedIds = scanResults?.recommended_actions || scanResults?.detected.map(d => d.action_id) || [];
    if (recommendedIds.length === 0) return;
    setAttachedActions(prev => {
      const combined = [...prev];
      for (const rawId of recommendedIds) {
        const id = normalizeActionId(rawId);
        if (!combined.includes(id)) {
          combined.push(id);
        }
      }
      return combined;
    });
    setRemediationMsg({
      id: 'auto_attach',
      success: true,
      msg: `Auto-attached ${recommendedIds.length} recommended workaround action(s) to ${nodeId}!`
    });
  };

  const handleTestRemediate = async (actionId: string) => {
    const canonicalId = normalizeActionId(actionId);
    setRemediatingId(canonicalId);
    setRemediationMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/dag/observation-actions/${canonicalId}/remediate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: activeSerial,
          node_id: nodeId
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setRemediationMsg({
          id: canonicalId,
          success: true,
          msg: data.result?.message || 'Workaround remediation succeeded!'
        });
        setTimeout(() => handleRunScan(), 800);
      } else {
        setRemediationMsg({
          id: canonicalId,
          success: false,
          msg: data.result?.message || data.detail || 'Remediation failed'
        });
      }
    } catch (err: any) {
      setRemediationMsg({
        id: canonicalId,
        success: false,
        msg: err.message || 'Network error executing workaround'
      });
    } finally {
      setRemediatingId(null);
    }
  };

  const attachAction = (actionId: string) => {
    const canonicalId = normalizeActionId(actionId);
    setAttachedActions(prev => prev.includes(canonicalId) ? prev : [...prev, canonicalId]);
  };

  const detachAction = (actionId: string) => {
    const canonicalId = normalizeActionId(actionId);
    setAttachedActions(prev => prev.filter(id => id !== canonicalId));
  };


  const handleEnableStandard = () => {
    setAttachedActions([...STANDARD_RECOMMENDED_ACTIONS]);
    setRemediationMsg({
      id: 'enable_standard',
      success: true,
      msg: 'Attached 5 standard self-healing workarounds (Keyboard, Edit Mode, Dark Theme, Top Line, Bottom Line)!'
    });
  };

  const handleAttachAll = () => {
    const allIds = allActions.map(a => normalizeActionId(a.action_id));
    setAttachedActions(allIds);
    setRemediationMsg({
      id: 'attach_all',
      success: true,
      msg: `Attached all ${allIds.length} workaround plugins to this node!`
    });
  };

  const handleClearAll = () => {
    setAttachedActions([]);
    setRemediationMsg({
      id: 'clear_all',
      success: false,
      msg: 'Detached all workaround plugins from this node.'
    });
  };

  const moveAction = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= attachedActions.length) return;
    const next = [...attachedActions];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setAttachedActions(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localConfig, attachedActions);
      onClose();
    } catch (err) {
      console.error('[UniversalConfig] Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // Active attached vs available catalog
  const attachedItems: ObservationActionItem[] = attachedActions.map(id => {
    const found = allActions.find(a => normalizeActionId(a.action_id) === id);
    if (found) return found;
    const defaultFound = DEFAULT_OBSERVATION_PLUGINS.find(a => a.action_id === id);
    if (defaultFound) return defaultFound;
    return {
      action_id: id,
      label: id.replace(/_/g, ' '),
      description: 'Custom attached observation & workaround plugin',
      hook_phase: 'pre',
      is_compounding: false,
      priority: 99
    };
  });

  const unattachedItems: ObservationActionItem[] = allActions.filter(
    a => !attachedActions.includes(normalizeActionId(a.action_id))
  );

  const renderActionIcon = (actionId: string) => {
    const canonicalId = normalizeActionId(actionId);
    const meta = ACTION_UI_META[canonicalId];
    if (!meta) return <Wrench size={13} color="#58a6ff" />;
    switch (meta.icon) {
      case 'keyboard':
        return <Keyboard size={13} color="#388bfd" />;
      case 'edit':
        return <Edit3 size={13} color="#58a6ff" />;
      case 'moon':
        return <Moon size={13} color="#a371f7" />;
      case 'top':
        return <ArrowUp size={13} color="#3fb950" />;
      case 'bottom':
        return <ArrowDown size={13} color="#3fb950" />;
      case 'onedrive':
        return <FolderGit2 size={13} color="#ffa657" />;
      default:
        return <Wrench size={13} color="#58a6ff" />;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} color="#58a6ff" />
          <span>Configure Node: {nodeTitle || nodeId}</span>
        </div>
      }
      subtitle={`Configure autonomous observation/workaround action plugins and execution parameters for ${nodeId}`}
      confirmText={isSaving ? 'Saving...' : 'Save Configuration & Actions'}
      cancelText="Cancel"
      onConfirm={handleSave}
      disabled={isSaving}
      maxWidth="720px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#e6edf3' }}>
        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #30363d',
          gap: '8px',
          paddingBottom: '2px'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            style={{
              background: activeTab === 'actions' ? '#21262d' : 'transparent',
              color: activeTab === 'actions' ? '#ffa657' : '#8b949e',
              border: 'none',
              borderBottom: activeTab === 'actions' ? '2px solid #ffa657' : '2px solid transparent',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Zap size={14} color="#ffa657" />
            <span>Observation & Workarounds</span>
            <span style={{
              background: attachedActions.length > 0 ? 'rgba(255, 166, 87, 0.2)' : 'rgba(110, 118, 129, 0.2)',
              color: attachedActions.length > 0 ? '#ffa657' : '#8b949e',
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '10px',
              fontWeight: 800
            }}>
              {attachedActions.length} Active
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('params')}
            style={{
              background: activeTab === 'params' ? '#21262d' : 'transparent',
              color: activeTab === 'params' ? '#58a6ff' : '#8b949e',
              border: 'none',
              borderBottom: activeTab === 'params' ? '2px solid #58a6ff' : '2px solid transparent',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sliders size={14} />
            <span>Node Parameters</span>
          </button>
        </div>

        {/* TAB 1: OBSERVATION & WORKAROUND ACTIONS */}
        {activeTab === 'actions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '480px', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Informative Guidance Banner */}
            <div style={{
              background: 'linear-gradient(180deg, rgba(56, 139, 253, 0.08) 0%, rgba(13, 17, 23, 0.6) 100%)',
              border: '1px solid rgba(56, 139, 253, 0.25)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <ShieldCheck size={16} color="#58a6ff" />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#f0f6fc' }}>
                    Autonomous Self-Healing Workarounds
                  </span>
                </div>
                <div style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  color: attachedActions.length > 0 ? '#3fb950' : '#8b949e',
                  background: attachedActions.length > 0 ? 'rgba(63, 185, 80, 0.15)' : 'rgba(110, 118, 129, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: `1px solid ${attachedActions.length > 0 ? 'rgba(63, 185, 80, 0.4)' : '#30363d'}`
                }}>
                  {attachedActions.length} of {allActions.length} Workarounds Active
                </div>
              </div>
              <div style={{ fontSize: '10.5px', color: '#8b949e', lineHeight: 1.4 }}>
                Attached workarounds run automatically before or after this node. If a disruption occurs (virtual keyboard pops up, editor slips into view mode, light theme activates, or line numbers are obscured), the workaround instantly heals the environment so the DAG loop never halts.
              </div>

              {/* Quick Actions Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <button
                  type="button"
                  onClick={handleEnableStandard}
                  style={{
                    background: 'rgba(63, 185, 80, 0.2)',
                    color: '#3fb950',
                    border: '1px solid rgba(63, 185, 80, 0.5)',
                    borderRadius: '5px',
                    padding: '4px 10px',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  title="Enable the 5 standard self-healing guards (Keyboard, Edit Mode, Dark Theme, Top Line, Bottom Line)"
                >
                  <Zap size={11} />
                  <span>Enable Standard (5)</span>
                </button>

                <button
                  type="button"
                  onClick={handleAttachAll}
                  style={{
                    background: '#21262d',
                    color: '#c9d1d9',
                    border: '1px solid #30363d',
                    borderRadius: '5px',
                    padding: '4px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Attach all registered workaround plugins"
                >
                  Attach All ({allActions.length})
                </button>

                <button
                  type="button"
                  onClick={handleClearAll}
                  style={{
                    background: '#21262d',
                    color: '#8b949e',
                    border: '1px solid #30363d',
                    borderRadius: '5px',
                    padding: '4px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Detach all workarounds from this node"
                >
                  Clear All
                </button>

                <div style={{ marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={handleRunScan}
                    disabled={isScanning}
                    style={{
                      background: isScanning ? '#21262d' : 'rgba(88, 166, 255, 0.15)',
                      color: isScanning ? '#8b949e' : '#58a6ff',
                      border: '1px solid rgba(88, 166, 255, 0.4)',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      fontSize: '10px',
                      fontWeight: 800,
                      cursor: isScanning ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    title="Diagnose active device display for anomalies"
                  >
                    <Sparkles size={11} className={isScanning ? 'spin' : ''} />
                    <span>{isScanning ? 'Scanning Display...' : 'Diagnose Screen (Live Scan)'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scan Results Banner */}
            {scanResults && (
              <div style={{
                background: scanResults.detected.length > 0 ? 'rgba(248, 81, 73, 0.1)' : 'rgba(35, 134, 54, 0.15)',
                border: `1px solid ${scanResults.detected.length > 0 ? '#f85149' : '#238636'}`,
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 800, color: scanResults.detected.length > 0 ? '#f85149' : '#3fb950' }}>
                    {scanResults.detected.length > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                    <span>
                      {scanResults.detected.length > 0
                        ? `Live Scan Found ${scanResults.detected.length} Environmental Anomaly(ies):`
                        : 'Display Invariants Clean: No keyboard, dark mode active, edit mode confirmed, gutter OCR clean.'}
                    </span>
                  </div>
                  {scanResults.detected.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoAttachRecommended}
                      style={{
                        background: 'rgba(0, 255, 157, 0.2)',
                        color: '#00ff9d',
                        border: '1px solid #00ff9d',
                        borderRadius: '5px',
                        padding: '3px 8px',
                        fontSize: '9.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Attach all detected and recommended workarounds to this DAG node"
                    >
                      <Zap size={10} />
                      <span>Auto-Attach Workarounds</span>
                    </button>
                  )}
                </div>

                {scanResults.detected.map(issue => (
                  <div
                    key={issue.action_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(22, 27, 34, 0.9)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      border: '1px solid rgba(248, 81, 73, 0.3)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#f0f6fc' }}>{issue.label}</div>
                      {issue.reason && <div style={{ fontSize: '10px', color: '#8b949e' }}>{issue.reason}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleTestRemediate(issue.action_id)}
                        disabled={remediatingId === issue.action_id}
                        style={{
                          background: '#238636',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {remediatingId === issue.action_id ? <RefreshCw size={10} className="spin" /> : <Wrench size={10} />}
                        <span>Remediate Now</span>
                      </button>
                      {!attachedActions.includes(issue.action_id) && (
                        <button
                          type="button"
                          onClick={() => attachAction(issue.action_id)}
                          style={{
                            background: 'rgba(88, 166, 255, 0.2)',
                            color: '#58a6ff',
                            border: '1px solid rgba(88, 166, 255, 0.4)',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          + Attach
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Remediation message alert */}
            {remediationMsg && (
              <div style={{
                background: remediationMsg.success ? 'rgba(35, 134, 54, 0.15)' : 'rgba(248, 81, 73, 0.15)',
                border: `1px solid ${remediationMsg.success ? '#238636' : '#f85149'}`,
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '11px',
                color: remediationMsg.success ? '#3fb950' : '#f85149',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span>{remediationMsg.msg}</span>
                <button
                  type="button"
                  onClick={() => setRemediationMsg(null)}
                  style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 0 }}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* SECTION 1: ACTIVE ATTACHED WORKAROUNDS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#f0f6fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Active Attached Workarounds ({attachedItems.length})
                  </span>
                  <span style={{ fontSize: '10px', color: '#8b949e' }}>
                    (Runs in sequence before/after this node)
                  </span>
                </div>
                {isLoadingActions && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#58a6ff', fontSize: '10px' }}>
                    <RefreshCw size={10} className="spin" />
                    <span>Syncing catalog...</span>
                  </div>
                )}
              </div>

              {attachedItems.length === 0 ? (
                <div style={{
                  padding: '14px',
                  background: '#161b22',
                  border: '1px dashed #30363d',
                  borderRadius: '8px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: '#8b949e'
                }}>
                  No workarounds currently attached to this node. Click <strong>"Enable Standard (5)"</strong> above to guard against keyboards, theme resets, and unreadable lines.
                </div>
              ) : (
                attachedItems.map((action, index) => {
                  const canonicalId = normalizeActionId(action.action_id);
                  const meta = ACTION_UI_META[canonicalId];
                  const isOneDrive = canonicalId === 'markdown_not_open_navigate_onedrive';

                  return (
                    <div
                      key={action.action_id}
                      style={{
                        background: 'rgba(88, 166, 255, 0.05)',
                        border: '1.5px solid rgba(88, 166, 255, 0.45)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        {/* Left: Priority badge + Icon + Titles */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: 1, minWidth: 0 }}>
                          <span style={{
                            fontSize: '9.5px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#21262d',
                            color: '#58a6ff',
                            border: '1px solid #30363d',
                            fontFamily: 'monospace'
                          }}>
                            #{index + 1}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '5px', background: '#21262d' }}>
                            {renderActionIcon(canonicalId)}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#f0f6fc' }}>
                                {meta?.title || action.label}
                              </span>
                              <span style={{
                                fontSize: '8.5px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: action.hook_phase === 'error' ? 'rgba(163, 113, 247, 0.2)' : 'rgba(56, 139, 253, 0.15)',
                                color: action.hook_phase === 'error' ? '#a371f7' : '#58a6ff',
                                textTransform: 'uppercase'
                              }}>
                                {action.hook_phase === 'error' ? 'ON-ERROR' : 'PRE-EXECUTION'}
                              </span>
                              {action.is_compounding && (
                                <span style={{
                                  fontSize: '8.5px',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(255, 166, 87, 0.2)',
                                  color: '#ffa657'
                                }}>
                                  COMPOUNDING
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '10.5px', color: '#8b949e', lineHeight: 1.3 }}>
                              {meta?.explanation || action.description}
                            </span>
                          </div>
                        </div>

                        {/* Right: Order controls, Test button, and Detach */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => moveAction(index, 'up')}
                              disabled={index === 0}
                              style={{
                                background: '#21262d', border: '1px solid #30363d', borderRadius: '3px',
                                color: index === 0 ? '#484f58' : '#c9d1d9', padding: '1px 4px',
                                cursor: index === 0 ? 'not-allowed' : 'pointer'
                              }}
                              title="Run this workaround earlier"
                            >
                              <ArrowUp size={10} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveAction(index, 'down')}
                              disabled={index === attachedItems.length - 1}
                              style={{
                                background: '#21262d', border: '1px solid #30363d', borderRadius: '3px',
                                color: index === attachedItems.length - 1 ? '#484f58' : '#c9d1d9', padding: '1px 4px',
                                cursor: index === attachedItems.length - 1 ? 'not-allowed' : 'pointer'
                              }}
                              title="Run this workaround later"
                            >
                              <ArrowDown size={10} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleTestRemediate(action.action_id)}
                            disabled={remediatingId === canonicalId}
                            style={{
                              background: '#21262d',
                              border: '1px solid #30363d',
                              borderRadius: '5px',
                              padding: '5px 8px',
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#c9d1d9',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="Test-fire this workaround directly on the active device"
                          >
                            {remediatingId === canonicalId ? <RefreshCw size={10} className="spin" /> : <Play size={10} />}
                            <span>Test</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => detachAction(action.action_id)}
                            style={{
                              background: 'rgba(248, 81, 73, 0.1)',
                              border: '1px solid rgba(248, 81, 73, 0.3)',
                              borderRadius: '5px',
                              padding: '5px 8px',
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#ff7b72',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                            title="Detach workaround from this node"
                          >
                            <X size={11} />
                            <span>Detach</span>
                          </button>
                        </div>
                      </div>

                      {/* If OneDrive compounding action: show folder and filename */}
                      {isOneDrive && (
                        <div
                          style={{
                            marginTop: '2px',
                            padding: '8px 10px',
                            background: 'rgba(13, 17, 23, 0.85)',
                            border: '1px solid #30363d',
                            borderRadius: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ fontSize: '10px', fontWeight: 800, color: '#ffa657' }}>
                            OneDrive Navigation Parameters:
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <label style={{ fontSize: '9px', fontWeight: 700, color: '#8b949e' }}>Target OneDrive Folder</label>
                              <input
                                type="text"
                                value={localConfig.target_folder_path ?? localConfig.folder_path ?? ''}
                                placeholder="e.g. Internal_Open_Source"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setLocalConfig(prev => ({ ...prev, target_folder_path: val, folder_path: val }));
                                }}
                                style={{
                                  background: '#161b22',
                                  border: '1px solid #30363d',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  color: '#f0f6fc'
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <label style={{ fontSize: '9px', fontWeight: 700, color: '#8b949e' }}>Target Markdown Filename</label>
                              <input
                                type="text"
                                value={localConfig.target_filename ?? localConfig.filename ?? ''}
                                placeholder="e.g. Matrix_main_26-09-17-8-19am.md"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setLocalConfig(prev => ({ ...prev, target_filename: val, filename: val }));
                                }}
                                style={{
                                  background: '#161b22',
                                  border: '1px solid #30363d',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  color: '#f0f6fc'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* SECTION 2: AVAILABLE WORKAROUNDS (CATALOG) */}
            {unattachedItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Available Workaround Plugins ({unattachedItems.length})
                </div>

                {unattachedItems.map((action) => {
                  const canonicalId = normalizeActionId(action.action_id);
                  const meta = ACTION_UI_META[canonicalId];

                  return (
                    <div
                      key={action.action_id}
                      style={{
                        background: '#161b22',
                        border: '1px solid #30363d',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'border-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '5px', background: '#21262d' }}>
                          {renderActionIcon(canonicalId)}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#c9d1d9' }}>
                              {meta?.title || action.label}
                            </span>
                            {meta?.recommended && (
                              <span style={{
                                fontSize: '8px',
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(63, 185, 80, 0.15)',
                                color: '#3fb950',
                                textTransform: 'uppercase'
                              }}>
                                RECOMMENDED
                              </span>
                            )}
                            <span style={{
                              fontSize: '8.5px',
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: '3px',
                              background: '#21262d',
                              color: '#8b949e'
                            }}>
                              {action.hook_phase}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', color: '#8b949e', lineHeight: 1.3 }}>
                            {meta?.explanation || action.description}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleTestRemediate(action.action_id)}
                          disabled={remediatingId === canonicalId}
                          style={{
                            background: '#21262d',
                            border: '1px solid #30363d',
                            borderRadius: '4px',
                            padding: '4px 7px',
                            fontSize: '9.5px',
                            fontWeight: 700,
                            color: '#8b949e',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                          title="Test-fire this workaround on the active device before attaching"
                        >
                          {remediatingId === canonicalId ? <RefreshCw size={9} className="spin" /> : <Play size={9} />}
                          <span>Test</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => attachAction(action.action_id)}
                          style={{
                            background: 'rgba(88, 166, 255, 0.15)',
                            color: '#58a6ff',
                            border: '1px solid rgba(88, 166, 255, 0.4)',
                            borderRadius: '5px',
                            padding: '4px 9px',
                            fontSize: '10px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Plus size={11} />
                          <span>Attach to Node</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: NODE PARAMETERS */}
        {activeTab === 'params' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '440px', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Generic / Settle delay */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>SETTLE DELAY (MS)</label>
              <input
                type="number"
                value={localConfig.settle_delay_ms ?? (nodeId === 'init_end' ? 1200 : (nodeId === 'reset_home' ? 1000 : (nodeId === 'frame_acquire' ? 40 : (nodeId === 'arrow_down' ? 60 : 50))))}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, settle_delay_ms: parseInt(e.target.value) || 0 }))}
                style={{
                  background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                  padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                }}
              />
              <span style={{ fontSize: '10px', color: '#8b949e' }}>Dwell time allowed for hardware and UI rendering to settle before next execution.</span>
            </div>

            {/* Node 1 specifics */}
            {nodeId === 'init_end' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>MANUAL TOTAL LINES OVERRIDE (0 = AUTO)</label>
                <input
                  type="number"
                  value={localConfig.manual_total_lines ?? 0}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, manual_total_lines: parseInt(e.target.value) || 0 }))}
                  style={{
                    background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                    padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                  }}
                />
                <span style={{ fontSize: '10px', color: '#8b949e' }}>Override total line calibration if OCR auto-calibration is skipped.</span>
              </div>
            )}

            {/* Node 2 specifics */}
            {nodeId === 'reset_home' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>EXPECTED RESET TARGET LINE</label>
                <input
                  type="number"
                  value={localConfig.expected_line ?? 1}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, expected_line: parseInt(e.target.value) || 1 }))}
                  style={{
                    background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                    padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                  }}
                />
                <span style={{ fontSize: '10px', color: '#8b949e' }}>Target top line number expected when viewport navigation reset completes.</span>
              </div>
            )}

            {/* Node 3 specifics */}
            {nodeId === 'frame_acquire' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Guard Soft Keyboard</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Automatically suppresses soft keyboard before screen capture.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, guard_keyboard: !prev.guard_keyboard }))}
                    style={{
                      background: localConfig.guard_keyboard !== false ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.guard_keyboard !== false ? 'ACTIVE' : 'OFF'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Fast Acquisition Mode</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Optimizes screen stream buffers for low-latency capture cycles.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, fast_mode: !prev.fast_mode }))}
                    style={{
                      background: localConfig.fast_mode ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.fast_mode ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </>
            )}

            {/* Node 4 specifics */}
            {nodeId === 'local_ai_ocr' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>LOCAL AI MODEL TARGET</label>
                  <select
                    value={localConfig.model || 'MiniCPM-V (Ollama)'}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, model: e.target.value }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  >
                    <option value="MiniCPM-V (Ollama)">MiniCPM-V (Ollama verbatim)</option>
                    <option value="RapidOCR">RapidOCR (Fast fallback)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Background Worker Mode</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Dispatches AI transcription asynchronously so navigation proceeds immediately.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, background_worker: !prev.background_worker }))}
                    style={{
                      background: localConfig.background_worker ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.background_worker ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </>
            )}

            {/* Node 5 specifics */}
            {nodeId === 'frame_ocr' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>OCR ENGINE</label>
                  <select
                    value={localConfig.engine || 'RapidOCR'}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, engine: e.target.value }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  >
                    <option value="RapidOCR">RapidOCR (Local ONNX/OpenVINO)</option>
                    <option value="OpenCV">OpenCV Heuristic Gutter Solver</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Fast Non-Healing Loop</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Skips extensive gutter pitch heuristics when document has no wraps.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, fast_loop: !prev.fast_loop }))}
                    style={{
                      background: localConfig.fast_loop ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.fast_loop ? 'ON' : 'OFF'}
                  </button>
                </div>
              </>
            )}

            {/* Node 6 specifics */}
            {nodeId === 'arrow_down' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>SCROLL PADDING LINES</label>
                  <input
                    type="number"
                    value={localConfig.scroll_padding_lines ?? 4}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, scroll_padding_lines: parseInt(e.target.value) || 0 }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  />
                  <span style={{ fontSize: '10px', color: '#8b949e' }}>Margin lines required before scroll viewport begins advancing.</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>MAX ADJUSTMENT ATTEMPTS</label>
                  <input
                    type="number"
                    value={localConfig.max_adjust_attempts ?? 7}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, max_adjust_attempts: parseInt(e.target.value) || 0 }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  />
                  <span style={{ fontSize: '10px', color: '#8b949e' }}>Maximum corrective scroll steps attempted if gutter line is obscured.</span>
                </div>
              </>
            )}

            {/* Node 7 specifics */}
            {nodeId === 'verification_trigger' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Prevent Trigger on Qualifier Issue</div>
                  <div style={{ fontSize: '10px', color: '#8b949e' }}>Blocks next cycle transition if any blocking qualifier (e.g. keyboard open or view mode) fails.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalConfig(prev => ({ ...prev, prevent_trigger_on_issue: !prev.prevent_trigger_on_issue }))}
                  style={{
                    background: localConfig.prevent_trigger_on_issue !== false ? '#238636' : '#21262d',
                    color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {localConfig.prevent_trigger_on_issue !== false ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            )}

            {/* Node 8 specifics */}
            {nodeId === 'document_assemble' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Auto-Save Markdown</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Automatically writes compiled markdown document to workspace output.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, auto_save_markdown: !prev.auto_save_markdown }))}
                    style={{
                      background: localConfig.auto_save_markdown !== false ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.auto_save_markdown !== false ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e' }}>OUTPUT FILENAME (OPTIONAL)</label>
                  <input
                    type="text"
                    value={localConfig.output_filename || ''}
                    placeholder="e.g. document_assembled.md"
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, output_filename: e.target.value }))}
                    style={{
                      background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                      padding: '7px 10px', color: '#f0f6fc', fontSize: '12px'
                    }}
                  />
                  <span style={{ fontSize: '10px', color: '#8b949e' }}>Custom filename or path. Leave blank to use default timestamped name.</span>
                </div>
              </>
            )}

            {/* Node 9 specifics */}
            {nodeId === 'batch_frames_ocr' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Clear Existing Text Before Rescan</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Purges previous markdown buffer before starting batch pass.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, clear_existing: !prev.clear_existing }))}
                    style={{
                      background: localConfig.clear_existing ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.clear_existing ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f0f6fc' }}>Auto-Save Markdown Output</div>
                    <div style={{ fontSize: '10px', color: '#8b949e' }}>Exports final transcript once all captured frames are processed.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalConfig(prev => ({ ...prev, auto_save_markdown: !prev.auto_save_markdown }))}
                    style={{
                      background: localConfig.auto_save_markdown !== false ? '#238636' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {localConfig.auto_save_markdown !== false ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
