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

  const path = typeof args?.path === 'string'
    ? args.path.trim()
    : typeof args?.directory === 'string'
      ? args.directory.trim()
      : typeof args?.targetPath === 'string'
        ? args.targetPath.trim()
        : typeof args?.basePath === 'string'
          ? args.basePath.trim()
          : '';

  const mode = args?.mode === 'list' || args?.action === 'list'
    ? 'list'
    : args?.mode === 'search' || args?.action === 'search'
      ? 'search'
      : (!query && path ? 'list' : 'search');

  if (!query && !path) {
    return undefined;
  }

  const rawMaxResults = typeof args?.maxResults === 'number'
    ? args.maxResults
    : typeof args?.maxResults === 'string'
      ? Number.parseInt(args.maxResults.trim(), 10)
      : undefined;

  const maxResults = typeof rawMaxResults === 'number' && Number.isFinite(rawMaxResults)
    ? Math.max(1, Math.min(50, Math.floor(rawMaxResults)))
    : undefined;

  const includeFiles = typeof args?.includeFiles === 'boolean'
    ? args.includeFiles
    : typeof args?.files === 'boolean'
      ? args.files
      : true;

  const includeDirectories = typeof args?.includeDirectories === 'boolean'
    ? args.includeDirectories
    : typeof args?.directories === 'boolean'
      ? args.directories
      : mode === 'list';

  const recursive = typeof args?.recursive === 'boolean'
    ? args.recursive
    : mode === 'search';

  return {
    toolCallId: '',
    mode,
    query: query || undefined,
    path: path || undefined,
    maxResults,
    includeFiles,
    includeDirectories,
    recursive
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
