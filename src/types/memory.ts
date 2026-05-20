import type { ChatMessage } from './chat';
import type { CommandApproval, TerminalBlockSharedMeta, TerminalCommandBlock, TerminalSessionTarget } from './terminal';
import type {
  WorkspaceChromeTab,
  WorkspaceConversation,
  WorkspacePaneDirection,
  WorkspacePaneLayout
} from '../components/App/chrome';

export type MemorySyncState = {
  status: 'local' | 'dirty' | 'synced' | 'pending' | 'error' | string;
  serverToken?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
};

export type MemoryMeta = {
  schemaVersion: number;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  syncEndpoint?: string | null;
};

export type MemorySettingsValues = {
  selectedModelId?: string;
  lastWorkingDirectory?: string | null;
  terminalAutoDetectEnabled?: boolean;
  webSearchEnabled?: boolean;
  thinkingDisplayMode?: 'show-and-collapse' | 'always-show' | 'never-show';
  syncEndpoint?: string | null;
  telemetryEnabled?: boolean;
  [key: string]: unknown;
};

export type MemorySettingsRecord = {
  schemaVersion: number;
  values: MemorySettingsValues;
  updatedAt: string;
  lastSyncedAt?: string | null;
  syncToken?: string | null;
};

export type MemoryWorkspaceSnapshot = {
  id: string;
  schemaVersion: number;
  tabs: WorkspaceChromeTab[];
  selectedTabId?: string | null;
  launcherTabId?: string | null;
  paneLayoutsByTabId?: Record<string, WorkspacePaneLayout>;
  paneTabIds?: string[];
  paneDirection?: WorkspacePaneDirection | null;
  conversations: WorkspaceConversation[];
  terminalSessions?: Record<string, {
    activeConversationId: string | null;
    composerSurface?: 'agent' | 'terminal';
    workingDirectory?: string | null;
    terminalSessionId?: string | null;
    agentTerminalSessionId?: string | null;
    terminalTarget?: TerminalSessionTarget | null;
    agentTerminalTarget?: TerminalSessionTarget | null;
    pendingApproval?: CommandApproval | null;
    terminalBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
    agentTerminalBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
    syntheticBlocks?: TerminalCommandBlock[];
  }>;
  activeSectionId?: string | null;
  expandedGroupIds: string[];
  isSidebarOpen: boolean;
  isAgentsActive: boolean;
  nextTerminalIndex: number;
  nextConversationIndex: number;
  updatedAt: string;
};

export type MemoryConversationSummary = {
  id: string;
  title: string;
  status: string;
  modelId?: string | null;
  cwd?: string | null;
  messageCount: number;
  branchLabel?: string | null;
  timeLabel: string;
  createdAt: string;
  updatedAt: string;
  serverConversationToken?: string | null;
  syncState: MemorySyncState;
};

export type MemoryTaskRecord = {
  id: string;
  parentTaskId?: string | null;
  kind: string;
  title: string;
  status: string;
  exchangeIds: string[];
  childTaskIds: string[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type MemoryExchangeRecord = {
  id: string;
  taskId: string;
  parentExchangeId?: string | null;
  inputMessageIds: string[];
  outputMessageIds: string[];
  toolCallIds: string[];
  status: string;
  startedAt: string;
  finishedAt?: string | null;
};

export type MemoryArtifactRecord = {
  id: string;
  kind: string;
  title: string;
  data: Record<string, unknown>;
  createdAt?: string | null;
};

export type MemoryConversationRecord = {
  id: string;
  schemaVersion: number;
  title: string;
  status: string;
  modelId?: string | null;
  cwd?: string | null;
  createdAt: string;
  updatedAt: string;
  serverConversationToken?: string | null;
  syncState: MemorySyncState;
  rootTaskId: string;
  tasks: MemoryTaskRecord[];
  exchanges: MemoryExchangeRecord[];
  artifacts: MemoryArtifactRecord[];
  messages: ChatMessage[];
  terminalBlocks: TerminalCommandBlock[];
};

export type MemoryCloudObjectSummary = {
  uid: string;
  kind: string;
  location: string;
  title: string;
  updatedAt: string;
  syncState: MemorySyncState;
};

export type MemoryCloudObjectRecord = {
  uid: string;
  kind: string;
  location: string;
  title: string;
  metadata: Record<string, unknown>;
  body: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
  syncState: MemorySyncState;
};

export type MemoryCloudObjectIndex = {
  objectsByUid: Record<string, MemoryCloudObjectSummary>;
  sortedOrdersByLocation: Record<string, string[]>;
};

export type MemoryCloudObjectIndexResponse = {
  index: MemoryCloudObjectIndex;
  orderedUids: string[];
};

export type MemorySyncStatus = {
  mode: 'localOnly' | 'pending' | 'retrying' | 'synced' | string;
  endpointConfigured: boolean;
  pendingCount: number;
  failedCount: number;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  storagePath: string;
};

export type OctomusMemoryBootstrap = {
  rootPath: string;
  schemaVersion: number;
  meta: MemoryMeta;
  workspace?: MemoryWorkspaceSnapshot | null;
  settings: MemorySettingsRecord;
  conversations: MemoryConversationSummary[];
  cloudIndex: MemoryCloudObjectIndex;
  syncStatus: MemorySyncStatus;
};

export type MemoryConversationPutRequest = {
  conversationId: string;
  title?: string | null;
  modelId?: string | null;
  cwd?: string | null;
  status?: string | null;
  messages: ChatMessage[];
  terminalBlocks?: TerminalCommandBlock[];
  artifacts?: MemoryArtifactRecord[];
  serverConversationToken?: string | null;
};

export type MemoryConversationDeleteRequest = {
  conversationId: string;
};

export type MemoryWorkspacePutRequest = {
  snapshot: MemoryWorkspaceSnapshot;
};

export type MemoryCloudObjectPutRequest = {
  object: MemoryCloudObjectRecord;
  enqueueSync?: boolean;
};
