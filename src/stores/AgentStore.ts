import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { ChatMessage, ChatAttachment } from '../types/chat';
import type {
  TerminalCommandBlock,
  TerminalSessionInfo,
  TerminalCompletionState,
  TerminalBlockSharedMeta,
  CommandApproval,
} from '../types/terminal';
import type { HistoryEntry, HistoryTab } from '../types/history';
import type { ComposerMode } from '../types/ui';

// ── Updater utilities ──────────────────────────────────────────────

type Updater<T> = T | ((current: T) => T);

function resolve<T>(current: T, next: Updater<T>): T {
  return typeof next === 'function' ? (next as (v: T) => T)(current) : next;
}

// ── Model types ────────────────────────────────────────────────────

export interface AgentModelEntry {
  id: string;
  apiId: string | null;
  label: string;
  providerLabel: string;
  supportsAttachments: boolean;
}
export interface AgentModelSelection {
  selectedModelId: string | null;
  selectedModelApiId: string | null;
  selectedModelLabel: string;
  selectedModelSupportsAttachments: boolean;
  isConfigured: boolean;
  requiresModelSetup: boolean;
  models: AgentModelEntry[];
}

// ── Working directory ──────────────────────────────────────────────

export interface DirectoryListing {
  path: string;
  items: string[];
  parentPath?: string | null;
}

export interface AgentWorkingDirectory {
  currentPath: string | null;
  homeDir: string | null;
  isPickerOpen: boolean;
  browserPath: string | null;
  searchQuery: string;
  listing: DirectoryListing | null;
  buttonLabel: string;
}

// ── Git context ────────────────────────────────────────────────────

export interface AgentGitContext {
  currentBranch: string | null;
  isBranchMenuOpen: boolean;
  gitContext: { currentBranch?: string | null } | null;
}

// ── Agent Store State ──────────────────────────────────────────────

export interface AgentState {
  // Composer
  composerSurface: 'agent' | 'terminal';
  modeLock: ComposerMode | null;
  autodetectedShellLatch: boolean;
  allowSingleCharacterCommandPrediction: boolean;
  terminalAutoDetectEnabled: boolean;

  // Tray
  isTrayOpen: boolean;
  activeTrayMode: 'history' | 'models' | 'help' | 'commands' | 'conversations';

  // Chat
  query: string;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  activeConversationId: string | null;
  activeRunId: string | null;
  conversationSearchQuery: string;

  // Terminal
  terminalBlocks: TerminalCommandBlock[];
  agentTerminalBlocks: TerminalCommandBlock[];
  terminalExpandedBlockIds: string[];
  agentTerminalExpandedBlockIds: string[];
  terminalSelectedBlockId: string | null;
  agentTerminalSelectedBlockId: string | null;
  terminalError: string | null;
  agentTerminalError: string | null;
  terminalSessionCwd: string | null;
  agentTerminalSessionCwd: string | null;
  terminalSessionInfo: TerminalSessionInfo | null;
  agentTerminalSessionInfo: TerminalSessionInfo | null;
  terminalCompletionState: TerminalCompletionState | null;
  agentTerminalCompletionState: TerminalCompletionState | null;
  terminalSessionId: string | null;
  agentTerminalSessionId: string | null;

  // History
  historyTab: HistoryTab;
  selectedHistoryIndex: number;
  selectedCommandIndex: number;
  historyEntries: HistoryEntry[];
  savedPromptEntries: HistoryEntry[];

  // Models
  modelTab: 'all' | 'saved';
  selectedModelIndex: number;
  modelSelection: AgentModelSelection;

  // Runtime
  workingDirectory: AgentWorkingDirectory;
  gitContext: AgentGitContext;
  shellCommands: string[];
  commandHistory: HistoryEntry[];
  runtimeContext: { nodeVersion?: string | null };
  activeSurfaceWorkingDirectory: string | null;

  // Approval
  localPendingApproval: CommandApproval | null;
  autoApproveAgentLoop: boolean;

  // Setters
  setComposerSurface: (next: Updater<'agent' | 'terminal'>) => void;
  setModeLock: (next: Updater<ComposerMode | null>) => void;
  setAutodetectedShellLatch: (next: Updater<boolean>) => void;
  setAllowSingleCharacterCommandPrediction: (next: Updater<boolean>) => void;
  setTerminalAutoDetectEnabled: (next: Updater<boolean>) => void;
  setIsTrayOpen: (next: Updater<boolean>) => void;
  setActiveTrayMode: (next: Updater<AgentState['activeTrayMode']>) => void;
  setQuery: (next: Updater<string>) => void;
  setMessages: (next: Updater<ChatMessage[]>) => void;
  setAttachments: (next: Updater<ChatAttachment[]>) => void;
  setActiveConversationId: (next: Updater<string | null>) => void;
  setActiveRunId: (next: Updater<string | null>) => void;
  setConversationSearchQuery: (next: Updater<string>) => void;
  setTerminalBlocks: (next: Updater<TerminalCommandBlock[]>) => void;
  setAgentTerminalBlocks: (next: Updater<TerminalCommandBlock[]>) => void;
  setTerminalExpandedBlockIds: (next: Updater<string[]>) => void;
  setAgentTerminalExpandedBlockIds: (next: Updater<string[]>) => void;
  setTerminalSelectedBlockId: (next: Updater<string | null>) => void;
  setAgentTerminalSelectedBlockId: (next: Updater<string | null>) => void;
  setTerminalError: (next: Updater<string | null>) => void;
  setAgentTerminalError: (next: Updater<string | null>) => void;
  setTerminalSessionCwd: (next: Updater<string | null>) => void;
  setAgentTerminalSessionCwd: (next: Updater<string | null>) => void;
  setTerminalSessionInfo: (next: Updater<TerminalSessionInfo | null>) => void;
  setAgentTerminalSessionInfo: (next: Updater<TerminalSessionInfo | null>) => void;
  setTerminalCompletionState: (next: Updater<TerminalCompletionState | null>) => void;
  setAgentTerminalCompletionState: (next: Updater<TerminalCompletionState | null>) => void;
  setTerminalSessionId: (next: Updater<string | null>) => void;
  setAgentTerminalSessionId: (next: Updater<string | null>) => void;
  setHistoryTab: (next: Updater<HistoryTab>) => void;
  setSelectedHistoryIndex: (next: Updater<number>) => void;
  setSelectedCommandIndex: (next: Updater<number>) => void;
  setHistoryEntries: (next: Updater<HistoryEntry[]>) => void;
  setSavedPromptEntries: (next: Updater<HistoryEntry[]>) => void;
  setModelTab: (next: Updater<'all' | 'saved'>) => void;
  setSelectedModelIndex: (next: Updater<number>) => void;
  setModelSelection: (next: Updater<AgentModelSelection>) => void;
  setWorkingDirectory: (next: Updater<AgentWorkingDirectory>) => void;
  setGitContext: (next: Updater<AgentGitContext>) => void;
  setShellCommands: (next: Updater<string[]>) => void;
  setCommandHistory: (next: Updater<HistoryEntry[]>) => void;
  setRuntimeContext: (next: Updater<{ nodeVersion?: string | null }>) => void;
  setActiveSurfaceWorkingDirectory: (next: Updater<string | null>) => void;
  setLocalPendingApproval: (next: Updater<CommandApproval | null>) => void;
  setAutoApproveAgentLoop: (next: Updater<boolean>) => void;
  resetAgentState: (composerSurface: 'agent' | 'terminal') => void;
}

export type AgentStoreApi = StoreApi<AgentState>;

// ── Initial state ──────────────────────────────────────────────────

type AgentDataState = Omit<AgentState,
  | 'setComposerSurface' | 'setModeLock' | 'setAutodetectedShellLatch'
  | 'setAllowSingleCharacterCommandPrediction' | 'setTerminalAutoDetectEnabled'
  | 'setIsTrayOpen' | 'setActiveTrayMode' | 'setQuery' | 'setMessages' | 'setAttachments'
  | 'setActiveConversationId' | 'setActiveRunId' | 'setConversationSearchQuery'
  | 'setTerminalBlocks' | 'setAgentTerminalBlocks' | 'setTerminalExpandedBlockIds'
  | 'setAgentTerminalExpandedBlockIds' | 'setTerminalSelectedBlockId' | 'setAgentTerminalSelectedBlockId'
  | 'setTerminalError' | 'setAgentTerminalError' | 'setTerminalSessionCwd' | 'setAgentTerminalSessionCwd'
  | 'setTerminalSessionInfo' | 'setAgentTerminalSessionInfo' | 'setTerminalCompletionState'
  | 'setAgentTerminalCompletionState' | 'setTerminalSessionId' | 'setAgentTerminalSessionId'
  | 'setHistoryTab' | 'setSelectedHistoryIndex' | 'setSelectedCommandIndex'
  | 'setHistoryEntries' | 'setSavedPromptEntries' | 'setModelTab' | 'setSelectedModelIndex'
  | 'setModelSelection' | 'setWorkingDirectory' | 'setGitContext' | 'setShellCommands'
  | 'setCommandHistory' | 'setRuntimeContext' | 'setActiveSurfaceWorkingDirectory'
  | 'setLocalPendingApproval' | 'setAutoApproveAgentLoop' | 'resetAgentState'
>;

function buildInitialState(composerSurface: 'agent' | 'terminal' = 'terminal'): AgentDataState {
  return {
    composerSurface,
    modeLock: null,
    autodetectedShellLatch: false,
    allowSingleCharacterCommandPrediction: false,
    terminalAutoDetectEnabled: true,
    isTrayOpen: false,
    activeTrayMode: 'history' as const,
    query: '',
    messages: [],
    attachments: [],
    activeConversationId: null,
    activeRunId: null,
    conversationSearchQuery: '',
    terminalBlocks: [],
    agentTerminalBlocks: [],
    terminalExpandedBlockIds: [],
    agentTerminalExpandedBlockIds: [],
    terminalSelectedBlockId: null,
    agentTerminalSelectedBlockId: null,
    terminalError: null,
    agentTerminalError: null,
    terminalSessionCwd: null,
    agentTerminalSessionCwd: null,
    terminalSessionInfo: null,
    agentTerminalSessionInfo: null,
    terminalCompletionState: null,
    agentTerminalCompletionState: null,
    terminalSessionId: null,
    agentTerminalSessionId: null,
    historyTab: 'all' as const,
    selectedHistoryIndex: 0,
    selectedCommandIndex: 0,
    historyEntries: [],
    savedPromptEntries: [],
    modelTab: 'all' as const,
    selectedModelIndex: 0,
    modelSelection: {
      selectedModelId: null,
      selectedModelApiId: null,
      selectedModelLabel: 'Auto',
      selectedModelSupportsAttachments: false,
      isConfigured: false,
      requiresModelSetup: true,
      models: [],
    },
    workingDirectory: {
      currentPath: null,
      homeDir: null,
      isPickerOpen: false,
      browserPath: null,
      searchQuery: '',
      listing: null,
      buttonLabel: '~',
    },
    gitContext: {
      currentBranch: null,
      isBranchMenuOpen: false,
      gitContext: null,
    },
    shellCommands: [],
    commandHistory: [],
    runtimeContext: {},
    activeSurfaceWorkingDirectory: null,
    localPendingApproval: null,
    autoApproveAgentLoop: false,
  };
}

// ── Store creation ─────────────────────────────────────────────────

export function createAgentStore(): AgentStoreApi {
  return createStore<AgentState>((set) => ({
    ...buildInitialState(),
    setComposerSurface: (n) => set((s) => ({ composerSurface: resolve(s.composerSurface, n) })),
    setModeLock: (n) => set((s) => ({ modeLock: resolve(s.modeLock, n) })),
    setAutodetectedShellLatch: (n) => set((s) => ({ autodetectedShellLatch: resolve(s.autodetectedShellLatch, n) })),
    setAllowSingleCharacterCommandPrediction: (n) => set((s) => ({ allowSingleCharacterCommandPrediction: resolve(s.allowSingleCharacterCommandPrediction, n) })),
    setTerminalAutoDetectEnabled: (n) => set((s) => ({ terminalAutoDetectEnabled: resolve(s.terminalAutoDetectEnabled, n) })),
    setIsTrayOpen: (n) => set((s) => ({ isTrayOpen: resolve(s.isTrayOpen, n) })),
    setActiveTrayMode: (n) => set((s) => ({ activeTrayMode: resolve(s.activeTrayMode, n) })),
    setQuery: (n) => set((s) => ({ query: resolve(s.query, n) })),
    setMessages: (n) => set((s) => ({ messages: resolve(s.messages, n) })),
    setAttachments: (n) => set((s) => ({ attachments: resolve(s.attachments, n) })),
    setActiveConversationId: (n) => set((s) => ({ activeConversationId: resolve(s.activeConversationId, n) })),
    setActiveRunId: (n) => set((s) => ({ activeRunId: resolve(s.activeRunId, n) })),
    setConversationSearchQuery: (n) => set((s) => ({ conversationSearchQuery: resolve(s.conversationSearchQuery, n) })),
    setTerminalBlocks: (n) => set((s) => ({ terminalBlocks: resolve(s.terminalBlocks, n) })),
    setAgentTerminalBlocks: (n) => set((s) => ({ agentTerminalBlocks: resolve(s.agentTerminalBlocks, n) })),
    setTerminalExpandedBlockIds: (n) => set((s) => ({ terminalExpandedBlockIds: resolve(s.terminalExpandedBlockIds, n) })),
    setAgentTerminalExpandedBlockIds: (n) => set((s) => ({ agentTerminalExpandedBlockIds: resolve(s.agentTerminalExpandedBlockIds, n) })),
    setTerminalSelectedBlockId: (n) => set((s) => ({ terminalSelectedBlockId: resolve(s.terminalSelectedBlockId, n) })),
    setAgentTerminalSelectedBlockId: (n) => set((s) => ({ agentTerminalSelectedBlockId: resolve(s.agentTerminalSelectedBlockId, n) })),
    setTerminalError: (n) => set((s) => ({ terminalError: resolve(s.terminalError, n) })),
    setAgentTerminalError: (n) => set((s) => ({ agentTerminalError: resolve(s.agentTerminalError, n) })),
    setTerminalSessionCwd: (n) => set((s) => ({ terminalSessionCwd: resolve(s.terminalSessionCwd, n) })),
    setAgentTerminalSessionCwd: (n) => set((s) => ({ agentTerminalSessionCwd: resolve(s.agentTerminalSessionCwd, n) })),
    setTerminalSessionInfo: (n) => set((s) => ({ terminalSessionInfo: resolve(s.terminalSessionInfo, n) })),
    setAgentTerminalSessionInfo: (n) => set((s) => ({ agentTerminalSessionInfo: resolve(s.agentTerminalSessionInfo, n) })),
    setTerminalCompletionState: (n) => set((s) => ({ terminalCompletionState: resolve(s.terminalCompletionState, n) })),
    setAgentTerminalCompletionState: (n) => set((s) => ({ agentTerminalCompletionState: resolve(s.agentTerminalCompletionState, n) })),
    setTerminalSessionId: (n) => set((s) => ({ terminalSessionId: resolve(s.terminalSessionId, n) })),
    setAgentTerminalSessionId: (n) => set((s) => ({ agentTerminalSessionId: resolve(s.agentTerminalSessionId, n) })),
    setHistoryTab: (n) => set((s) => ({ historyTab: resolve(s.historyTab, n) })),
    setSelectedHistoryIndex: (n) => set((s) => ({ selectedHistoryIndex: resolve(s.selectedHistoryIndex, n) })),
    setSelectedCommandIndex: (n) => set((s) => ({ selectedCommandIndex: resolve(s.selectedCommandIndex, n) })),
    setHistoryEntries: (n) => set((s) => ({ historyEntries: resolve(s.historyEntries, n) })),
    setSavedPromptEntries: (n) => set((s) => ({ savedPromptEntries: resolve(s.savedPromptEntries, n) })),
    setModelTab: (n) => set((s) => ({ modelTab: resolve(s.modelTab, n) })),
    setSelectedModelIndex: (n) => set((s) => ({ selectedModelIndex: resolve(s.selectedModelIndex, n) })),
    setModelSelection: (n) => set((s) => ({ modelSelection: resolve(s.modelSelection, n) })),
    setWorkingDirectory: (n) => set((s) => ({ workingDirectory: resolve(s.workingDirectory, n) })),
    setGitContext: (n) => set((s) => ({ gitContext: resolve(s.gitContext, n) })),
    setShellCommands: (n) => set((s) => ({ shellCommands: resolve(s.shellCommands, n) })),
    setCommandHistory: (n) => set((s) => ({ commandHistory: resolve(s.commandHistory, n) })),
    setRuntimeContext: (n) => set((s) => ({ runtimeContext: resolve(s.runtimeContext, n) })),
    setActiveSurfaceWorkingDirectory: (n) => set((s) => ({ activeSurfaceWorkingDirectory: resolve(s.activeSurfaceWorkingDirectory, n) })),
    setLocalPendingApproval: (n) => set((s) => ({ localPendingApproval: resolve(s.localPendingApproval, n) })),
    setAutoApproveAgentLoop: (n) => set((s) => ({ autoApproveAgentLoop: resolve(s.autoApproveAgentLoop, n) })),
    resetAgentState: (surface) => set(buildInitialState(surface)),
  }));
}

// ── Singleton ──────────────────────────────────────────────────────

let agentStoreInstance: AgentStoreApi | null = null;

export function getAgentStore(): AgentStoreApi {
  if (!agentStoreInstance) agentStoreInstance = createAgentStore();
  return agentStoreInstance;
}

// ── React hook ─────────────────────────────────────────────────────

export function useAgentStore(): AgentState;
export function useAgentStore<T>(selector: (state: AgentState) => T): T;
export function useAgentStore<T>(selector?: (state: AgentState) => T): AgentState | T {
  const store = getAgentStore();
  if (selector) return useStore(store, selector);
  return useStore(store, (s) => s);
}
