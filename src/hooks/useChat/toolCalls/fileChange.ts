import type { FileChangeApproval } from '../../../types/terminal';
import type { DiffDelta, DiffType, FileDiff } from '../../../types/diff';
import type { ToolCallHandler } from './types';

function normalizeFileDiff(raw: any, serializedArgs = ''): FileDiff | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const fallbackPath = extractFallbackFilePath(raw, serializedArgs);

  if (typeof raw.filePath === 'string' && raw.diffType && typeof raw.diffType === 'object') {
    const insertion = cleanInsertionContent(raw.diffType?.delta?.insertion ?? '', raw.filePath || fallbackPath);
    return {
      ...raw,
      filePath: raw.filePath,
      diffType: normalizeDiffType(raw.diffType, insertion, normalizeReplacementLineRange(raw.diffType?.replacement_line_range))
    } as FileDiff;
  }

  const filePath = typeof raw.filePath === 'string'
    ? raw.filePath
    : typeof raw.new_path === 'string'
      ? raw.new_path
      : typeof raw.path === 'string'
        ? raw.path
        : typeof raw.diffType?.filePath === 'string'
          ? raw.diffType.filePath
          : typeof raw.diffType?.path === 'string'
            ? raw.diffType.path
            : fallbackPath;
  if (!filePath.trim()) {
    return null;
  }

  const rawContent = typeof raw.content === 'string'
    ? raw.content
    : typeof raw.insertion === 'string'
      ? raw.insertion
      : typeof raw.text === 'string'
        ? raw.text
        : typeof raw.diffType?.delta?.insertion === 'string'
          ? raw.diffType.delta.insertion
          : typeof raw.diffType?.insertion === 'string'
            ? raw.diffType.insertion
        : '';
  const content = cleanInsertionContent(rawContent, filePath);

  const replacementLineRange = normalizeReplacementLineRange(raw.replacement_line_range ?? raw.diffType?.replacement_line_range);

  const diffType = raw.diffType && typeof raw.diffType === 'object'
    ? normalizeDiffType(raw.diffType, content, replacementLineRange)
    : {
        kind: 'create' as const,
        delta: {
          replacement_line_range: replacementLineRange,
          insertion: content
        }
      };

  return { filePath, diffType };
}

function extractFallbackFilePath(raw: any, serializedArgs: string) {
  const candidates = [
    typeof raw?.filePath === 'string' ? raw.filePath : '',
    typeof raw?.path === 'string' ? raw.path : '',
    typeof raw?.new_path === 'string' ? raw.new_path : '',
    typeof raw?.diffType?.filePath === 'string' ? raw.diffType.filePath : '',
    typeof raw?.diffType?.path === 'string' ? raw.diffType.path : ''
  ];

  const haystack = `${safeStringify(raw)}\n${serializedArgs}`
    .replace(/<\|\\"?\|\>/g, '"')
    .replace(/<\|"\|>/g, '"');
  const explicitFilePath = haystack.match(/filePath["'\\\s:,\]}]*([A-Za-z0-9_.~/-]+\.[A-Za-z0-9]{1,12})/i)?.[1];
  if (explicitFilePath) {
    candidates.push(explicitFilePath);
  }

  for (const match of haystack.matchAll(/(?:^|[\s"'`,:{\[])([A-Za-z0-9_.~/-]+\.[A-Za-z0-9]{1,12})(?=$|[\s"'`,:}\]])/g)) {
    candidates.push(match[1]);
  }

  return candidates
    .map((candidate) => sanitizeFilePath(candidate))
    .find((candidate) => candidate.length > 0) ?? '';
}

function cleanInsertionContent(value: string, filePath?: string) {
  let nextValue = value
    .replace(/<\|\\"?\|\>/g, '"')
    .replace(/<\|"\|>/g, '"');

  const leakedFilePathIndex = nextValue.search(/[,}\]\s]*filePath\s*:/i);
  if (leakedFilePathIndex > 0) {
    nextValue = nextValue.slice(0, leakedFilePathIndex);
  }

  if (filePath) {
    const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nextValue = nextValue.replace(new RegExp(`["',\\s]*${escapedPath}["',\\s]*$`), '');
  }

  return nextValue.trimEnd();
}

function sanitizeFilePath(value: string) {
  return value
    .replace(/<\|\\"?\|\>/g, '"')
    .replace(/<\|"\|>/g, '"')
    .replace(/^["'`,:\s]+|["'`,:\s]+$/g, '')
    .replace(/^filePath["'`,:\s]+/i, '')
    .trim();
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function normalizeReplacementLineRange(rawRange: any): DiffDelta['replacement_line_range'] {
  return rawRange
    && typeof rawRange.start === 'number'
    && typeof rawRange.end === 'number'
    ? {
        start: rawRange.start,
        end: rawRange.end
      }
    : { start: 1, end: 1 };
}

function normalizeDiffType(rawDiffType: any, fallbackInsertion = '', fallbackRange = { start: 1, end: 1 }): DiffType {
  const kind = rawDiffType?.kind === 'update' || rawDiffType?.kind === 'delete'
    ? rawDiffType.kind
    : 'create';

  if (kind === 'update') {
    let deltas: DiffDelta[];
    if (Array.isArray(rawDiffType?.deltas)) {
      deltas = rawDiffType.deltas
        .map((rawDelta: unknown) => normalizeDelta(rawDelta, fallbackRange))
        .filter((delta: DiffDelta | null): delta is DiffDelta => Boolean(delta));
    } else if (rawDiffType?.delta) {
      deltas = [normalizeDelta(rawDiffType.delta, fallbackRange)]
        .filter((delta: DiffDelta | null): delta is DiffDelta => Boolean(delta));
    } else {
      deltas = [{
        replacement_line_range: fallbackRange,
        insertion: fallbackInsertion
      }];
    }

    return {
      kind: 'update',
      deltas,
      rename: typeof rawDiffType?.rename === 'string' ? rawDiffType.rename : undefined
    };
  }

  return {
    kind,
    delta: normalizeDelta(rawDiffType?.delta, fallbackRange) ?? {
      replacement_line_range: fallbackRange,
      insertion: fallbackInsertion
    }
  };
}

function normalizeDelta(rawDelta: any, fallbackRange: DiffDelta['replacement_line_range'] = { start: 1, end: 1 }): DiffDelta | null {
  if (!rawDelta || typeof rawDelta !== 'object') {
    return null;
  }

  const range = rawDelta.replacement_line_range
    ? normalizeReplacementLineRange(rawDelta.replacement_line_range)
    : fallbackRange;

  return {
    replacement_line_range: range,
    insertion: typeof rawDelta.insertion === 'string' ? rawDelta.insertion : ''
  };
}

function normalizeFileChangeApproval(args: any): Omit<FileChangeApproval, 'toolCallId'> | undefined {
  const serializedArgs = safeStringify(args);
  const rawDiffs: unknown[] = Array.isArray(args?.fileDiffs)
    ? args.fileDiffs
    : Array.isArray(args?.diffs)
      ? args.diffs
      : [];

  const fileDiffs = rawDiffs
    .map((rawDiff: unknown) => normalizeFileDiff(rawDiff, serializedArgs))
    .filter((diff): diff is FileDiff => Boolean(diff));

  if (fileDiffs.length === 0) {
    return undefined;
  }

  const summary = typeof args?.summary === 'string'
    ? args.summary.trim()
    : typeof args?.reason === 'string'
      ? args.reason.trim()
      : '';

  return {
    kind: 'file-change',
    summary: summary || undefined,
    fileDiffs,
    refineLabel: typeof args?.refineLabel === 'string' ? args.refineLabel : undefined,
    editLabel: typeof args?.editLabel === 'string' ? args.editLabel : undefined,
    acceptLabel: typeof args?.acceptLabel === 'string' ? args.acceptLabel : undefined
  };
}

export const fileChangeToolCallHandler: ToolCallHandler = {
  names: ['propose_file_change', 'request_file_edits', 'propose_file_edits'],
  handle: ({ registrations, toolCall }) => {
    const approval = normalizeFileChangeApproval(toolCall.args);
    if (!approval) return;

    registrations.forEach((registration) => {
      registration.update((message) => ({
        ...message,
        body: message.body.trim().length > 0 ? message.body : approval.summary ?? message.body
      }));

      const nextApproval = {
        ...approval,
        toolCallId: toolCall.id
      };

      if (registration.onFileChangeApproval) {
        registration.onFileChangeApproval(nextApproval);
      } else {
        registration.onCommandApproval?.(nextApproval);
      }
    });
  }
};
