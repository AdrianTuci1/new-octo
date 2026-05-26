import type { ToolCallHandler } from './types';
import type { WorkspaceExplorationRequest } from '../../../types/chat';

function normalizeWorkspaceExplorationRequest(args: any): WorkspaceExplorationRequest | undefined {
  const query = typeof args?.query === 'string'
    ? args.query.trim()
    : typeof args?.term === 'string'
      ? args.term.trim()
      : typeof args?.search === 'string'
        ? args.search.trim()
        : '';

  if (!query) {
    return undefined;
  }

  const rawMaxResults = typeof args?.maxResults === 'number'
    ? args.maxResults
    : typeof args?.maxResults === 'string'
      ? Number.parseInt(args.maxResults.trim(), 10)
      : undefined;

  const maxResults = typeof rawMaxResults === 'number' && Number.isFinite(rawMaxResults)
    ? Math.max(1, Math.min(20, Math.floor(rawMaxResults)))
    : undefined;

  return {
    toolCallId: '',
    query,
    maxResults
  };
}

export const workspaceExplorationToolCallHandler: ToolCallHandler = {
  names: ['explore_workspace', 'read_workspace', 'inspect_workspace'],
  handle: ({ registrations, toolCall }) => {
    const request = normalizeWorkspaceExplorationRequest(toolCall.args);
    if (!request) return;

    registrations.forEach((registration) => {
      registration.onWorkspaceExploration?.({
        ...request,
        toolCallId: toolCall.id
      });
    });
  }
};
