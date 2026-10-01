export interface ParsedErrorData {
  message?: string;
  statusCode?: number | string;
  nodeId?: string;
  dagContext?: Record<string, any>;
  traceInsights?: string[];
  troubleshootingSteps?: Array<{ step: number; title: string; description: string; action?: string; action_label?: string }>;
  rawPayload?: any;
}

export function tryParseLogPayload(rawStr: string): ParsedErrorData | null {
  if (!rawStr || typeof rawStr !== 'string') return null;

  const firstBrace = rawStr.indexOf('{');
  if (firstBrace === -1) return null;

  const prefix = rawStr.slice(0, firstBrace);
  const jsonCandidate = rawStr.slice(firstBrace).trim();

  // Extract status code from prefix (e.g. "Initialization failed: 500: ...")
  const statusMatch = prefix.match(/\b([45]\d{2})\b/);
  const statusCode = statusMatch ? statusMatch[1] : undefined;

  let parsed: any = null;

  // 1. Try JSON.parse directly
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    // 2. Try converting Python dict string to JSON
    try {
      const sanitized = jsonCandidate
        .replace(/\bNone\b/g, 'null')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/'((?:\\'|[^'])*)'/g, (_: string, val: string) => JSON.stringify(val.replace(/\\'/g, "'")));
      parsed = JSON.parse(sanitized);
    } catch {
      // 3. Fallback extraction using regex
    }
  }

  // Unwrap nested stringified messages if any (e.g. DAG Node 'init_end' failed: 500: {...})
  let current = parsed;
  let nestedStatus = statusCode;
  while (current && typeof current === 'object') {
    if (typeof current.message === 'string') {
      const innerBrace = current.message.indexOf('{');
      if (innerBrace !== -1) {
        const innerStatus = current.message.slice(0, innerBrace).match(/\b([45]\d{2})\b/);
        if (innerStatus) nestedStatus = innerStatus[1];
        const innerCandidate = current.message.slice(innerBrace).trim();
        try {
          const innerSanitized = innerCandidate
            .replace(/\bNone\b/g, 'null')
            .replace(/\bTrue\b/g, 'true')
            .replace(/\bFalse\b/g, 'false')
            .replace(/'((?:\\'|[^'])*)'/g, (_: string, val: string) => JSON.stringify(val.replace(/\\'/g, "'")));
          const innerParsed = JSON.parse(innerSanitized);
          current = { ...current, ...innerParsed };
        } catch {
          break;
        }
      } else {
        break;
      }
    } else {
      break;
    }
  }

  if (current && typeof current === 'object' && (current.message || current.trace_insights || current.dag_context || current.troubleshooting_steps)) {
    return {
      message: typeof current.message === 'string' ? current.message : JSON.stringify(current.message),
      statusCode: nestedStatus || statusCode || current.status_code,
      nodeId: current.dag_context?.node_id || current.node_id,
      dagContext: current.dag_context,
      traceInsights: Array.isArray(current.trace_insights) ? current.trace_insights : undefined,
      troubleshootingSteps: Array.isArray(current.troubleshooting_steps) ? current.troubleshooting_steps : undefined,
      rawPayload: current
    };
  }

  return null;
}

export function cleanErrorMessage(rawStr: string): string {
  if (!rawStr) return '';
  const parsed = tryParseLogPayload(rawStr);
  if (parsed?.message) {
    return parsed.message;
  }
  // Fallback regex matching
  const match = rawStr.match(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/);
  if (match) {
    const nested = match[1].match(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/);
    return nested ? nested[1] : match[1];
  }
  if (rawStr.includes('500:')) {
    const after = rawStr.split('500:').pop()?.trim() || rawStr;
    return after.replace(/^['"{}\s]+|['"{}\s]+$/g, '');
  }
  return rawStr;
}
