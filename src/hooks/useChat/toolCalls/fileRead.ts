import type { WorkspaceFileReadRequest } from '../../../types/chat';
import type { ToolCallHandler } from './types';

function normalizeLine(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, parsed);
    }
  }

  return undefined;
}

function normalizeMaxChars(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(200, Math.min(24000, Math.floor(value)));
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(200, Math.min(24000, parsed));
    }
  }

  return undefined;
}

function normalizeWorkspaceFileReadRequest(args: any): WorkspaceFileReadRequest | undefined {
  const path = typeof args?.path === 'string'
    ? args.path.trim()
    : typeof args?.filePath === 'string'
      ? args.filePath.trim()
      : typeof args?.targetPath === 'string'
        ? args.targetPath.trim()
        : '';

  if (!path) {
    return undefined;
  }

  return {
    toolCallId: '',
    path,
    startLine: normalizeLine(args?.startLine ?? args?.lineStart),
    endLine: normalizeLine(args?.endLine ?? args?.lineEnd),
    maxChars: normalizeMaxChars(args?.maxChars)
  };
}

export const workspaceFileReadToolCallHandler: ToolCallHandler = {
  names: ['read_workspace_file', 'read_file', 'view_file'],
  handle: ({ registrations, toolCall }) => {
    const request = normalizeWorkspaceFileReadRequest(toolCall.args);
    if (!request) return;

    registrations.forEach((registration) => {
      registration.onWorkspaceFileRead?.({
        ...request,
        toolCallId: toolCall.id
      });
    });
  }
};
