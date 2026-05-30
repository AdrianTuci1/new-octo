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

  const rawMode = typeof args?.mode === 'string'
    ? args.mode.trim().toLowerCase()
    : typeof args?.action === 'string'
      ? args.action.trim().toLowerCase()
      : '';

  const mode = rawMode === 'list'
    ? 'list'
    : rawMode === 'symbols'
      ? 'symbols'
      : rawMode === 'definition'
        ? 'definition'
        : rawMode === 'references'
          ? 'references'
          : rawMode === 'diagnostics'
            ? 'diagnostics'
            : rawMode === 'search'
              ? 'search'
              : (!query && path ? 'list' : 'search');

  const symbol = typeof args?.symbol === 'string'
    ? args.symbol.trim()
    : typeof args?.identifier === 'string'
      ? args.identifier.trim()
      : '';

  const filePath = typeof args?.filePath === 'string'
    ? args.filePath.trim()
    : typeof args?.file === 'string'
      ? args.file.trim()
      : '';

  if (!query && !path && !symbol && !filePath) {
    return undefined;
  }

  const rawMaxResults = typeof args?.maxResults === 'number'
    ? args.maxResults
    : typeof args?.maxResults === 'string'
      ? Number.parseInt(args.maxResults.trim(), 10)
      : undefined;
  const rawLine = typeof args?.line === 'number'
    ? args.line
    : typeof args?.line === 'string'
      ? Number.parseInt(args.line.trim(), 10)
      : undefined;
  const rawColumn = typeof args?.column === 'number'
    ? args.column
    : typeof args?.column === 'string'
      ? Number.parseInt(args.column.trim(), 10)
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
    symbol: symbol || undefined,
    filePath: filePath || undefined,
    line: typeof rawLine === 'number' && Number.isFinite(rawLine) ? Math.max(0, Math.floor(rawLine)) : undefined,
    column: typeof rawColumn === 'number' && Number.isFinite(rawColumn) ? Math.max(0, Math.floor(rawColumn)) : undefined,
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
