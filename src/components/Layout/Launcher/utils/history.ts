import type { HistoryEntry, MemoryConversationSummary } from '../../../../types';

/**
 * Creates a new conversation ID using the current timestamp.
 */
export function createConversationId() {
  return `conv_${Date.now()}`;
}

/**
 * Formats a timestamp into a human-readable time string.
 */
export function formatHistoryDetail(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Checks if a query is a single token shell command candidate.
 */
export function isSingleTokenShellCandidate(query: string) {
  const trimmed = query.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed) && /^[A-Za-z0-9._-]+$/.test(trimmed);
}

/**
 * Builds a branch label for the conversation based on the current working directory.
 */
export function buildConversationBranchLabel(summary: MemoryConversationSummary) {
  if (summary.branchLabel?.trim()) {
    return summary.branchLabel.trim();
  }

  const segments = summary.cwd?.split('/').filter(Boolean) ?? [];
  return segments[segments.length - 1] ?? '~';
}

/**
 * Deduplicates history entries, keeping the most recent ones.
 */
export function dedupeHistoryEntries(entries: HistoryEntry[], limit = 60) {
  const seen = new Set<string>();
  const deduped: HistoryEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.kind}:${entry.label.trim().toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

/**
 * Builds the initial prompt for the agent based on the last terminal command.
 */
export function buildTerminalAgentPrompt(command?: string) {
  const trimmed = command?.trim();
  if (trimmed && trimmed !== '/agent') {
    return `Review this terminal command and suggest the safest next step:\n\n\`${trimmed}\``;
  }

  return '';
}
