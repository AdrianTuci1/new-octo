import type { ChatMessage } from '../../types/chat';
import { FOLLOW_UP_START, FOLLOW_UP_END } from './helpers';

export function visibleChatMessageBody(value: string) {
  return extractFollowUpSuggestion(value).visibleBody;
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
    label: value,
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

export function extractFollowUpSuggestion(raw: string) {
  const startIndex = raw.indexOf(FOLLOW_UP_START);
  if (startIndex < 0) {
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
