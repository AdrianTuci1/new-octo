import type { FileChangeApproval } from '../../../types/terminal';
import type { FileDiff } from '../../../types/diff';
import type { ToolCallHandler } from './types';

function normalizeFileDiff(raw: any): FileDiff | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  if (typeof raw.filePath === 'string' && raw.diffType && typeof raw.diffType === 'object') {
    return raw as FileDiff;
  }

  const filePath = typeof raw.filePath === 'string'
    ? raw.filePath
    : typeof raw.new_path === 'string'
      ? raw.new_path
      : typeof raw.path === 'string'
        ? raw.path
        : '';
  if (!filePath.trim()) {
    return null;
  }

  const content = typeof raw.content === 'string'
    ? raw.content
    : typeof raw.insertion === 'string'
      ? raw.insertion
      : typeof raw.text === 'string'
        ? raw.text
        : '';

  const replacementLineRange = raw.replacement_line_range
    && typeof raw.replacement_line_range.start === 'number'
    && typeof raw.replacement_line_range.end === 'number'
    ? {
        start: raw.replacement_line_range.start,
        end: raw.replacement_line_range.end
      }
    : { start: 1, end: 1 };

  return {
    filePath,
    diffType: {
      kind: 'create',
      delta: {
        replacement_line_range: replacementLineRange,
        insertion: content
      }
    }
  };
}

function normalizeFileChangeApproval(args: any): Omit<FileChangeApproval, 'toolCallId'> | undefined {
  const rawDiffs: unknown[] = Array.isArray(args?.fileDiffs)
    ? args.fileDiffs
    : Array.isArray(args?.diffs)
      ? args.diffs
      : [];

  const fileDiffs = rawDiffs
    .map((rawDiff: unknown) => normalizeFileDiff(rawDiff))
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

      registration.onFileChangeApproval?.({
        ...approval,
        toolCallId: toolCall.id
      });
    });
  }
};
