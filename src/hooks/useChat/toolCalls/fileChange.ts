import type { FileChangeApproval } from '../../../types/terminal';
import type { ToolCallHandler } from './types';

function normalizeFileChangeApproval(args: any): FileChangeApproval | undefined {
  const fileDiffs = Array.isArray(args?.fileDiffs)
    ? args.fileDiffs
    : Array.isArray(args?.diffs)
      ? args.diffs
      : [];

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

      registration.onFileChangeApproval?.(approval);
    });
  }
};
