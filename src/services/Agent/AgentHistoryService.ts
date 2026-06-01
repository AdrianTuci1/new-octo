import type { StoreApi } from 'zustand/vanilla';
import type { AgentState } from '../../stores/AgentStore';
import type { HistoryEntry, ShellHistoryEntry } from '../../types/history';
import type { TerminalCommandBlock } from '../../types/terminal';
import type { ChatMessage } from '../../types/chat';
import type { MemoryStoreState } from '../../stores/memoryStore';

/**
 * Aggregates command + prompt history from multiple sources:
 * - Current chat messages
 * - Saved prompt entries
 * - Memory store conversation records
 * - Terminal blocks (current + agent)
 * - External command history
 */
export class AgentHistoryService {
  constructor(
    private readonly store: StoreApi<AgentState>,
    private readonly memoryStore: StoreApi<MemoryStoreState>,
  ) {}

  // ── Read ─────────────────────────────────────────────────────────

  get historyTab(): 'all' | 'commands' | 'prompts' {
    return this.store.getState().historyTab;
  }

  get historyEntries(): HistoryEntry[] {
    return this.store.getState().historyEntries;
  }

  get selectedHistoryIndex(): number {
    return this.store.getState().selectedHistoryIndex;
  }

  // ── Write ────────────────────────────────────────────────────────

  setHistoryTab(tab: 'all' | 'commands' | 'prompts'): void {
    this.store.getState().setHistoryTab(tab);
  }

  setSelectedHistoryIndex(index: number): void {
    this.store.getState().setSelectedHistoryIndex(index);
  }

  // ── History aggregation ──────────────────────────────────────────

  /**
   * Rebuild the full history entry list from all sources.
   * Called whenever messages/terminal blocks/memory records change.
   */
  rebuildHistory(params: {
    messages: ChatMessage[];
    queryWithoutActivator: string;
    conversationTerminalBlocks: TerminalCommandBlock[];
    externalCommandHistory: ShellHistoryEntry[];
  }): void {
    const { messages, queryWithoutActivator, conversationTerminalBlocks, externalCommandHistory } = params;
    const normalizedQuery = queryWithoutActivator.trim().toLowerCase();

    const promptEntries = this.buildPromptEntries(messages, normalizedQuery);
    const commandEntries = this.buildCommandEntries(
      conversationTerminalBlocks,
      externalCommandHistory,
      normalizedQuery,
    );

    const state = this.store.getState();
    const allEntries = state.historyTab === 'commands'
      ? commandEntries
      : state.historyTab === 'prompts'
        ? promptEntries
        : [...commandEntries, ...promptEntries].sort(
            (a, b) => b.createdAt.localeCompare(a.createdAt),
          );

    this.store.getState().setHistoryEntries(allEntries);
  }

  /** Load missing conversations from memory store */
  loadMissingConversations(): void {
    const memoryState = this.memoryStore.getState();
    if (memoryState.status !== 'ready') return;

    const loadedRecords = memoryState.conversationRecords ?? {};
    const missingConversations = (memoryState.conversations ?? [])
      .filter((c: any) => !loadedRecords[c.id])
      .slice(0, 50);

    for (const conversation of missingConversations) {
      void memoryState.loadConversation(conversation.id);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  private buildPromptEntries(messages: ChatMessage[], normalizedQuery: string): HistoryEntry[] {
    const state = this.store.getState();
    const memoryState = this.memoryStore.getState();

    const currentPromptEntries = messages
      .filter((message) => {
        if (message.role !== 'user' || message.body.trim().length === 0) return false;
        if (normalizedQuery.length === 0) return true;
        return message.body.toLowerCase().includes(normalizedQuery);
      })
      .map((message) => ({
        id: message.id,
        label: message.body,
        detail: `current · ${this.formatDetail(message.createdAt ?? new Date().toISOString())}`,
        kind: 'prompt' as const,
        createdAt: message.createdAt ?? new Date().toISOString(),
      }));

    const persistedPromptEntries = state.savedPromptEntries.filter((entry) =>
      normalizedQuery.length === 0 || entry.label.toLowerCase().includes(normalizedQuery),
    );

    const conversationPromptEntries = Object.values(memoryState.conversationRecords ?? {})
      .flatMap((conversation: any) => {
        const title = conversation.title?.trim() || 'conversation';
        const updatedAt = conversation.updatedAt ?? new Date().toISOString();

        return (conversation.messages ?? [])
          .filter((msg: any) => msg.role === 'user' && msg.body.trim().length > 0)
          .filter((msg: any) =>
            normalizedQuery.length === 0 || msg.body.toLowerCase().includes(normalizedQuery),
          )
          .map((msg: any) => ({
            id: `conversation-${conversation.id}-${msg.id}`,
            label: msg.body,
            detail: `${title} · ${this.formatDetail(msg.createdAt ?? updatedAt)}`,
            kind: 'prompt' as const,
            createdAt: msg.createdAt ?? updatedAt,
          }));
      });

    return this.dedupeEntries(
      [...currentPromptEntries, ...conversationPromptEntries, ...persistedPromptEntries]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      60,
    );
  }

  private buildCommandEntries(
    conversationBlocks: TerminalCommandBlock[],
    externalHistory: ShellHistoryEntry[],
    normalizedQuery: string,
  ): HistoryEntry[] {
    const currentTerminalEntries = conversationBlocks
      .filter((block) => block.command.trim().length > 0)
      .map((block) => ({
        id: `octomus-${block.id}`,
        label: block.command,
        detail: `octomus · ${this.formatDetail(block.startedAt)}`,
        kind: 'command' as const,
        createdAt: block.startedAt,
      }));

    const shellEntries = externalHistory.map((entry, index) => ({
      id: `${entry.source}-${entry.executedAt}-${index}`,
      label: entry.value,
      detail: `${entry.source} · ${this.formatDetail(entry.executedAt)}`,
      kind: 'command' as const,
      createdAt: entry.executedAt,
    }));

    const filtered = [...currentTerminalEntries, ...shellEntries].filter((entry) =>
      this.commandMatchesQuery(entry.label, normalizedQuery),
    );

    return this.rankCommandEntries(filtered, normalizedQuery).slice(0, 60);
  }

  private commandMatchesQuery(label: string, normalizedQuery: string): boolean {
    if (normalizedQuery.length === 0) return true;
    const normalized = label.toLowerCase();
    if (normalized.startsWith(normalizedQuery)) return true;
    const root = normalizedQuery.split(/\s+/)[0]?.trim();
    return Boolean(root) && normalized.startsWith(`${root} `);
  }

  private rankCommandEntries(entries: HistoryEntry[], normalizedQuery: string): HistoryEntry[] {
    const aggregates = new Map<string, { entry: HistoryEntry; count: number }>();

    for (const entry of entries) {
      const key = `${entry.kind}:${entry.label.trim().toLowerCase()}`;
      const agg = aggregates.get(key);
      if (!agg) {
        aggregates.set(key, { entry, count: 1 });
      } else {
        agg.count += 1;
        if (entry.createdAt.localeCompare(agg.entry.createdAt) > 0) {
          agg.entry = entry;
        }
      }
    }

    return Array.from(aggregates.values())
      .sort((a, b) => {
        const freq = b.count - a.count;
        if (freq !== 0) return freq;
        const recency = b.entry.createdAt.localeCompare(a.entry.createdAt);
        if (recency !== 0) return recency;
        if (normalizedQuery.length > 0) return b.entry.label.length - a.entry.label.length;
        return a.entry.label.localeCompare(b.entry.label);
      })
      .map((agg) => agg.entry);
  }

  private dedupeEntries(entries: HistoryEntry[], maxCount: number): HistoryEntry[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const normalized = entry.label.trim().toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }).slice(0, maxCount);
  }

  private formatDetail(isoStamp: string): string {
    try {
      const date = new Date(isoStamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return 'now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return isoStamp;
    }
  }
}
