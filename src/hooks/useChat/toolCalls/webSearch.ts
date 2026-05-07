import type { ToolCallHandler } from './types';
import type { WebSearchRequest } from '../../../types/chat';

function normalizeWebSearchRequest(args: any): WebSearchRequest | undefined {
  const query = typeof args?.query === 'string'
    ? args.query.trim()
    : typeof args?.term === 'string'
      ? args.term.trim()
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
    ? Math.max(1, Math.min(10, Math.floor(rawMaxResults)))
    : undefined;

  return {
    toolCallId: '',
    query,
    maxResults
  };
}

export const webSearchToolCallHandler: ToolCallHandler = {
  names: ['lookup_web', 'search_web'],
  handle: ({ registrations, toolCall }) => {
    const request = normalizeWebSearchRequest(toolCall.args);
    if (!request) return;

    registrations.forEach((registration) => {
      registration.onWebSearch?.({
        ...request,
        toolCallId: toolCall.id
      });
    });
  }
};
