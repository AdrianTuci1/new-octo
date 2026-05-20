import type { ChatMessage, ExecutionPlanArtifact, ExecutionPlanStep, ExecutionPlanWorkstream } from '../../types/chat';
import type { FileChangeApproval } from '../../types/terminal';
import { FOLLOW_UP_START, FOLLOW_UP_END } from './helpers';

export function stripThinkingBlocks(value: string) {
  if (!value.includes('<thinking>')) {
    return value;
  }

  const stripped = value
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, ' ')
    .replace(/<thinking>[\s\S]*$/gi, '');

  return stripped.replace(/[ \t]{2,}/g, ' ').trim();
}

export function stripHarnessProtocolArtifacts(value: string) {
  return value
    .replace(/<\|channel\>\s*thought(?!plan)\s*<\s*channel\|\s*>/gi, ' ')
    .replace(/<\|channel\>\s*thought(?!plan)\s*<\|channel\|>/gi, ' ')
    .replace(/<\|channel\>\s*(?:thought|analysis|reasoning)(?!plan)\b\s*/gi, ' ')
    .replace(/<\|channel\>\s*(?:final|assistant|answer)\b\s*/gi, ' ')
    .replace(/<\|(?:message|end|channel)\|>/gi, ' ')
    .replace(/<\s*channel\|\s*>/gi, ' ')
    .replace(/<tool_call\|>/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function visibleChatMessageBody(value: string) {
  const withoutFollowUp = extractFollowUpSuggestion(value).visibleBody;
  const withoutInlinePlan = extractInlinePlanArtifact(withoutFollowUp).visibleBody;
  const withoutInlineFileChange = extractInlineFileChangeApproval(withoutInlinePlan).visibleBody;
  return stripHarnessProtocolArtifacts(stripThinkingBlocks(withoutInlineFileChange));
}

export function followUpSuggestionFromMessageBody(value: string) {
  return extractFollowUpSuggestion(value).suggestion;
}

export function pendingFollowUpPrefixLength(value: string) {
  const maxLength = Math.min(value.length, FOLLOW_UP_START.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (FOLLOW_UP_START.startsWith(value.slice(value.length - length))) {
      return length;
    }
  }

  return 0;
}

export function normalizeToolFollowUpSuggestion(args: any): ChatMessage['followUpSuggestion'] | undefined {
  const rawValue = typeof args?.prompt === 'string'
    ? args.prompt
    : typeof args?.value === 'string'
      ? args.value
      : typeof args?.query === 'string'
        ? args.query
        : '';
  const value = rawValue.trim();
  if (!value) {
    return undefined;
  }

  const description = typeof args?.description === 'string' ? args.description.trim() : '';
  const confidence = typeof args?.confidence === 'number' && Number.isFinite(args.confidence)
    ? args.confidence
    : undefined;

  return {
    label: typeof args?.label === 'string' && args.label.trim()
      ? args.label.trim()
      : value,
    value,
    description: description || undefined,
    confidence
  };
}

export function parseToolFollowUpConfidence(args: any) {
  return typeof args?.confidence === 'number' && Number.isFinite(args.confidence)
    ? args.confidence
    : undefined;
}

export function stripFollowUpBoilerplate(value: string) {
  return value
    .replace(/\n?\s*\(\s*am adăugat o sugestie de continuare pentru tine\.\s*\)\s*$/i, '')
    .replace(/\n?\s*\(\s*i added a follow-up suggestion for you\.\s*\)\s*$/i, '')
    .replace(/\n?\s*[-_*]{3,}\s*$/i, '')
    .trimEnd();
}

export function extractRobustJsonFollowUpSuggestion(raw: string) {
  let startIndex = 0;
  let bestMatch: { startIndex: number, endIndex: number, parsed: any } | null = null;

  while ((startIndex = raw.indexOf('{', startIndex)) !== -1) {
    let openBraces = 0;
    let endIndex = -1;
    for (let i = startIndex; i < raw.length; i++) {
      if (raw[i] === '{') openBraces++;
      if (raw[i] === '}') {
        openBraces--;
        if (openBraces === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex !== -1) {
      const jsonStr = raw.slice(startIndex, endIndex + 1);
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === 'object' && (parsed.prompt || parsed.value || parsed.query)) {
          bestMatch = { startIndex, endIndex, parsed };
        }
      } catch {
        // ignore
      }
    }
    startIndex++;
  }

  if (bestMatch) {
    let beforeJson = raw.slice(0, bestMatch.startIndex);
    let afterJson = raw.slice(bestMatch.endIndex + 1);

    beforeJson = beforeJson.replace(/(?:```(?:json)?\s*)$/i, '');
    beforeJson = beforeJson.replace(/(?:suggest_follow_up:?\s*)$/i, '');
    beforeJson = beforeJson.replace(/(?:suggest-follow-up:?\s*)$/i, '');
    beforeJson = beforeJson.replace(/(?:\n\s*[-_*]{3,}\s*)$/, '');

    afterJson = afterJson.replace(/^(?:\s*```)/, '');

    let visibleBody = (beforeJson.trimEnd() + '\n\n' + afterJson.trim()).trimEnd();
    visibleBody = stripFollowUpBoilerplate(visibleBody);

    return {
      visibleBody,
      pendingPayload: '',
      suggestion: normalizeToolFollowUpSuggestion(bestMatch.parsed)
    };
  }

  const lastBraceIndex = raw.lastIndexOf('{');
  if (lastBraceIndex !== -1 && raw.indexOf('}', lastBraceIndex) === -1) {
    const potentialJson = raw.slice(lastBraceIndex);
    if (potentialJson.includes('"prompt"') || potentialJson.includes('"description"') || potentialJson.includes('"label"')) {
      let beforeJson = raw.slice(0, lastBraceIndex);
      beforeJson = beforeJson.replace(/(?:```(?:json)?\s*)$/i, '');
      beforeJson = beforeJson.replace(/(?:suggest_follow_up:?\s*)$/i, '');
      beforeJson = beforeJson.replace(/(?:suggest-follow-up:?\s*)$/i, '');
      beforeJson = beforeJson.replace(/(?:\n\s*[-_*]{3,}\s*)$/, '');

      return {
        visibleBody: stripFollowUpBoilerplate(beforeJson.trimEnd()),
        pendingPayload: potentialJson,
        suggestion: undefined
      };
    }
  }

  return null;
}

function findBalancedCallEnd(raw: string, openParenIndex: number) {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = openParenIndex; index < raw.length; index += 1) {
    const character = raw[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseLegacyFunctionArgs(payload: string) {
  const args: Record<string, string | number | boolean> = {};
  const argumentPattern = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([+-]?(?:\d+\.?\d*|\.\d+)|true|false))/gi;

  for (const match of payload.matchAll(argumentPattern)) {
    const key = match[1];
    const quotedValue = match[2] ?? match[3];
    const rawValue = match[4];

    if (quotedValue !== undefined) {
      args[key] = quotedValue.replace(/\\(["'\\])/g, '$1');
      continue;
    }

    if (rawValue?.toLowerCase() === 'true' || rawValue?.toLowerCase() === 'false') {
      args[key] = rawValue.toLowerCase() === 'true';
      continue;
    }

    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue)) {
      args[key] = numericValue;
    }
  }

  return args;
}

function pendingLegacyFollowUpPrefixLength(value: string) {
  const prefixes = ['<tool_call|>suggest_follow_up(', 'suggest_follow_up('];
  let bestLength = 0;

  for (const prefix of prefixes) {
    const maxLength = Math.min(value.length, prefix.length - 1);
    for (let length = maxLength; length > 0; length -= 1) {
      if (prefix.toLowerCase().startsWith(value.slice(value.length - length).toLowerCase())) {
        bestLength = Math.max(bestLength, length);
        break;
      }
    }
  }

  return bestLength;
}

function extractLegacyFunctionFollowUpSuggestion(raw: string) {
  const markerMatch = /(?:<tool_call\|>\s*)?suggest_follow_up\s*\(/i.exec(raw);
  if (!markerMatch) {
    const pendingLength = pendingLegacyFollowUpPrefixLength(raw);
    if (pendingLength === 0) {
      return null;
    }

    return {
      visibleBody: raw.slice(0, raw.length - pendingLength).trimEnd(),
      pendingPayload: raw.slice(raw.length - pendingLength),
      suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
    };
  }

  const startIndex = markerMatch.index;
  const openParenIndex = raw.indexOf('(', startIndex);
  const endIndex = findBalancedCallEnd(raw, openParenIndex);
  if (endIndex < 0) {
    return {
      visibleBody: stripFollowUpBoilerplate(raw.slice(0, startIndex).trimEnd()),
      pendingPayload: raw.slice(startIndex),
      suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
    };
  }

  const beforeCall = raw.slice(0, startIndex).replace(/<tool_call\|>\s*$/i, '').trimEnd();
  const afterCall = raw.slice(endIndex + 1).trimStart();
  const visibleBody = stripFollowUpBoilerplate(
    [beforeCall, afterCall].filter(Boolean).join('\n\n').trimEnd()
  );

  return {
    visibleBody,
    pendingPayload: '',
    suggestion: normalizeToolFollowUpSuggestion(parseLegacyFunctionArgs(raw.slice(openParenIndex + 1, endIndex)))
  };
}

function findPseudoToolObjectEnd(raw: string, braceIndex: number) {
  let depth = 0;
  let insidePseudoQuote = false;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = braceIndex; index < raw.length; index += 1) {
    if (raw.startsWith('<|"|>', index)) {
      insidePseudoQuote = !insidePseudoQuote;
      index += '<|"|>'.length - 1;
      continue;
    }

    const character = raw[index];

    if (insidePseudoQuote) {
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') {
      depth += 1;
      continue;
    }
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractPseudoStringValue(payload: string, key: string) {
  const keyIndex = payload.search(new RegExp(`${key}\\s*:`, 'i'));
  if (keyIndex < 0) return '';

  const afterKey = payload.slice(keyIndex).replace(new RegExp(`^${key}\\s*:`, 'i'), '').trimStart();
  if (afterKey.startsWith('<|"|>')) {
    const valueStart = '<|"|>'.length;
    const valueEnd = afterKey.indexOf('<|"|>', valueStart);
    return valueEnd >= 0 ? afterKey.slice(valueStart, valueEnd) : afterKey.slice(valueStart);
  }

  const quotedMatch = afterKey.match(/^"((?:\\.|[^"\\])*)"/) ?? afterKey.match(/^'((?:\\.|[^'\\])*)'/);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].replace(/\\(["'\\])/g, '$1');
  }

  const bareMatch = afterKey.match(/^([^,}\]]+)/);
  return bareMatch?.[1]?.trim() ?? '';
}

function extractPseudoNumberValue(payload: string, key: string) {
  const match = payload.match(new RegExp(`${key}\\s*:\\s*(\\d+)`, 'i'));
  return match?.[1] ? Number(match[1]) : undefined;
}

function normalizePseudoQuotedText(value: string) {
  return value
    .replace(/<\|"\|>/g, '"')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function extractInlineFileChangeApproval(raw: string) {
  const markerMatch = /(?:<tool_call\|>\s*)?propose_file_change\s*\{/i.exec(raw);
  if (!markerMatch) {
    return {
      visibleBody: raw,
      pendingPayload: '',
      approval: undefined as FileChangeApproval | undefined
    };
  }

  const startIndex = markerMatch.index;
  const braceIndex = raw.indexOf('{', startIndex);
  const objectEnd = findPseudoToolObjectEnd(raw, braceIndex);
  if (objectEnd < 0) {
    return {
      visibleBody: raw.slice(0, startIndex).trimEnd(),
      pendingPayload: raw.slice(startIndex),
      approval: undefined as FileChangeApproval | undefined
    };
  }

  const payload = raw.slice(braceIndex, objectEnd + 1);
  const filePath = normalizePseudoQuotedText(extractPseudoStringValue(payload, 'filePath'));
  const insertion = normalizePseudoQuotedText(extractPseudoStringValue(payload, 'insertion'));
  const summary = normalizePseudoQuotedText(extractPseudoStringValue(payload, 'summary'));
  const kind: 'create' | 'delete' = normalizePseudoQuotedText(extractPseudoStringValue(payload, 'kind')) === 'delete'
    ? 'delete'
    : 'create';
  const start = extractPseudoNumberValue(payload, 'start') ?? 1;
  const end = extractPseudoNumberValue(payload, 'end') ?? 1;
  const trailing = raw.slice(objectEnd + 1).trimStart();
  const visibleBody = [raw.slice(0, startIndex).trimEnd(), trailing].filter(Boolean).join('\n\n').trimEnd();

  return {
    visibleBody,
    pendingPayload: '',
    approval: filePath && (insertion || kind === 'delete')
      ? {
          kind: 'file-change' as const,
          summary: summary || undefined,
          fileDiffs: [{
            filePath,
            diffType: {
              kind,
              delta: {
                replacement_line_range: { start, end },
                insertion
              }
            }
          }]
        }
      : undefined
  };
}

export function extractFollowUpSuggestion(raw: string) {
  const startIndex = raw.indexOf(FOLLOW_UP_START);
  if (startIndex < 0) {
    const legacyFunctionCall = extractLegacyFunctionFollowUpSuggestion(raw);
    if (legacyFunctionCall) {
      return legacyFunctionCall;
    }

    const robustJson = extractRobustJsonFollowUpSuggestion(raw);
    if (robustJson) {
      return robustJson;
    }

    const pendingLength = pendingFollowUpPrefixLength(raw);
    if (pendingLength === 0) {
      return {
        visibleBody: raw,
        pendingPayload: '',
        suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
      };
    }

    return {
      visibleBody: raw.slice(0, raw.length - pendingLength),
      pendingPayload: raw.slice(raw.length - pendingLength),
      suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
    };
  }

  const endIndex = raw.indexOf(FOLLOW_UP_END, startIndex + FOLLOW_UP_START.length);
  if (endIndex < 0) {
    return {
      visibleBody: raw.slice(0, startIndex),
      pendingPayload: raw.slice(startIndex),
      suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
    };
  }

  const visibleBody = raw.slice(0, startIndex);
  const payload = raw
    .slice(startIndex + FOLLOW_UP_START.length, endIndex)
    .trim();
  const trailing = raw.slice(endIndex + FOLLOW_UP_END.length);

  let suggestion: ChatMessage['followUpSuggestion'] | undefined;
  try {
    const parsed = JSON.parse(payload) as {
      label?: string;
      value?: string;
      description?: string;
    };
    if (parsed.value?.trim()) {
      suggestion = normalizeToolFollowUpSuggestion(parsed);
    }
  } catch {
    suggestion = undefined;
  }

  return {
    visibleBody: stripFollowUpBoilerplate(`${visibleBody}${trailing}`.trimEnd()),
    pendingPayload: '',
    suggestion
  };
}

function normalizePlanStep(step: any, index: number): ExecutionPlanStep | null {
  const label = typeof step?.label === 'string'
    ? step.label.trim()
    : typeof step?.title === 'string'
      ? step.title.trim()
      : '';

  if (!label) {
    return null;
  }

  return {
    id: typeof step?.id === 'string' && step.id.trim().length > 0
      ? step.id.trim()
      : `step-${index + 1}`,
    label,
    status: step?.status === 'inProgress'
      ? 'inProgress'
      : step?.status === 'failed'
        ? 'failed'
        : step?.completed === true || step?.status === 'completed'
          ? 'completed'
          : 'pending'
  };
}

function normalizePlanWorkstream(workstream: any, index: number): ExecutionPlanWorkstream | null {
  const title = typeof workstream?.title === 'string'
    ? workstream.title.trim()
    : typeof workstream?.label === 'string'
      ? workstream.label.trim()
      : '';

  if (!title) {
    return null;
  }

  return {
    id: typeof workstream?.id === 'string' && workstream.id.trim().length > 0
      ? workstream.id.trim()
      : `workstream-${index + 1}`,
    title,
    status: workstream?.status === 'inProgress'
      ? 'inProgress'
      : workstream?.status === 'failed'
        ? 'failed'
        : workstream?.status === 'completed'
          ? 'completed'
          : 'pending',
    stepIds: Array.isArray(workstream?.stepIds)
      ? workstream.stepIds.filter((stepId: unknown): stepId is string => (
          typeof stepId === 'string' && stepId.trim().length > 0
        )).map((stepId: string) => stepId.trim())
      : []
  };
}

function normalizeInlinePlan(parsed: any): ExecutionPlanArtifact | undefined {
  const title = typeof parsed?.title === 'string' ? parsed.title.trim() : '';
  const steps = Array.isArray(parsed?.steps)
    ? parsed.steps.map(normalizePlanStep).filter(Boolean) as ExecutionPlanStep[]
    : [];
  const workstreams = Array.isArray(parsed?.workstreams)
    ? parsed.workstreams.map(normalizePlanWorkstream).filter(Boolean) as ExecutionPlanWorkstream[]
    : [];

  if (!title || steps.length === 0) {
    return undefined;
  }

  return {
    id: typeof parsed?.id === 'string' && parsed.id.trim().length > 0
      ? parsed.id.trim()
      : `plan-${Date.now()}`,
    title,
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : undefined,
    version: typeof parsed?.version === 'string' ? parsed.version.trim() : undefined,
    steps,
    workstreams
  };
}

function findInlinePlanMarker(raw: string) {
  const channelMarker = raw.indexOf('<|channel>thoughtplan');
  if (channelMarker >= 0) {
    return {
      startIndex: channelMarker,
      braceIndex: raw.indexOf('{', channelMarker),
      markerLength: '<|channel>thoughtplan'.length
    };
  }

  const plainMarker = raw.indexOf('thoughtplan{');
  if (plainMarker >= 0) {
    return {
      startIndex: plainMarker,
      braceIndex: raw.indexOf('{', plainMarker),
      markerLength: 'thoughtplan'.length
    };
  }

  const legacyToolMarker = raw.search(/(?:<tool_call\|>\s*)?propose_plan\s*\{/i);
  if (legacyToolMarker >= 0) {
    return {
      startIndex: legacyToolMarker,
      braceIndex: raw.indexOf('{', legacyToolMarker),
      markerLength: raw.indexOf('{', legacyToolMarker) - legacyToolMarker
    };
  }

  return null;
}

function findBalancedObjectEnd(raw: string, braceIndex: number) {
  let depth = 0;

  for (let index = braceIndex; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '{') {
      depth += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function pseudoPlanPayloadToJson(rawPayload: string) {
  return rawPayload
    .replace(/<\|"\|>/g, '"')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

export function extractInlinePlanArtifact(raw: string) {
  const marker = findInlinePlanMarker(raw);
  if (!marker || marker.braceIndex < 0) {
    return {
      visibleBody: raw,
      pendingPayload: '',
      plan: undefined as ExecutionPlanArtifact | undefined
    };
  }

  const objectEnd = findBalancedObjectEnd(raw, marker.braceIndex);
  if (objectEnd < 0) {
    return {
      visibleBody: raw.slice(0, marker.startIndex).trimEnd(),
      pendingPayload: raw.slice(marker.startIndex),
      plan: undefined as ExecutionPlanArtifact | undefined
    };
  }

  const rawPayload = raw.slice(marker.braceIndex, objectEnd + 1);
  let trailing = raw.slice(objectEnd + 1);
  trailing = trailing.replace(/^\s*<tool_call\|>\s*/i, '');

  let plan: ExecutionPlanArtifact | undefined;
  try {
    const parsed = JSON.parse(pseudoPlanPayloadToJson(rawPayload));
    plan = normalizeInlinePlan(parsed);
  } catch {
    plan = undefined;
  }

  const beforePlan = raw.slice(0, marker.startIndex).trimEnd();
  const afterPlan = trailing.trimStart();
  const visibleBody = [beforePlan, afterPlan].filter(Boolean).join('\n\n').trimEnd();

  return {
    visibleBody,
    pendingPayload: '',
    plan
  };
}
