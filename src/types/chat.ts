import type { FileDiff } from './diff';
import type { FileDiffPreviewStatus } from '../lib/fileDiffs';
import type { ModelProviderId } from '../lib/modelProviders';
export type { FileDiffPreviewStatus } from '../lib/fileDiffs';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  title: string;
  body: string;
  createdAt?: string;
  conversationId?: string;
  runId?: string;
  isStreaming?: boolean;
  isError?: boolean;
  status?: AgentRunStatus;
  usage?: AgentUsage;
  toolCallId?: string;
  toolCalls?: any[];
  fileDiffs?: FileDiff[];
  fileChangeStatus?: FileDiffPreviewStatus;
  messageKind?: 'default' | 'reasoning';
  thinkingDurationSeconds?: number;
  hasNativeThinking?: boolean;
  parentMessageId?: string;
  toolKind?: 'command' | 'web-search' | 'plan' | 'file-change' | 'workspace-exploration' | 'file-read';
  webSearchStatus?: 'searching' | 'success' | 'error';
  webSearchQuery?: string;
  webSearchResults?: WebSearchResult[];
  workspaceExploration?: WorkspaceExplorationArtifact;
  workspaceFileRead?: WorkspaceFileReadArtifact;
  executionPlan?: ExecutionPlanArtifact;
  followUpSuggestion?: {
    label: string;
    value: string;
    description?: string;
    confidence?: number;
  };
  subAgents?: SubAgentCall[];
};

export type SubAgentCall = {
  id: string;
  name: string;
  task: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  avatarUrl?: string;
  result?: string;
};

export type ExecutionPlanStep = {
  id: string;
  label: string;
  status: 'pending' | 'inProgress' | 'completed' | 'failed';
};

export type ExecutionPlanWorkstream = {
  id: string;
  title: string;
  status: 'pending' | 'inProgress' | 'completed' | 'failed';
  stepIds: string[];
};

export type ExecutionPlanArtifact = {
  id: string;
  title: string;
  summary?: string;
  version?: string;
  steps: ExecutionPlanStep[];
  workstreams?: ExecutionPlanWorkstream[];
};

export type PlanExecutionUpdate = {
  planId: string;
  stepId: string;
  action: 'started' | 'completed' | 'failed';
  summary?: string;
  workstreams?: ExecutionPlanWorkstream[];
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebSearchRequest = {
  toolCallId: string;
  query: string;
  maxResults?: number;
};

export type CloudAgentLaunchRequest = {
  toolCallId: string;
  prompt: string;
  provider?: 'custom-vm' | 'modal' | string | null;
  profileId?: string | null;
  cwd?: string | null;
  repo?: string | null;
  baseBranch?: string | null;
  workBranch?: string | null;
};

export type WorkspaceExplorationSearch = {
  mode: 'list' | 'search' | 'symbols' | 'definition' | 'references' | 'diagnostics';
  source: 'code-index' | 'filesystem' | 'lsp' | `lsp:${string}`;
  query: string;
  resultCount: number;
  path?: string;
};

export type WorkspaceExplorationFile = {
  path: string;
  source: 'code-index' | 'filesystem' | 'lsp' | `lsp:${string}`;
  snippet?: string;
};

export type WorkspaceExplorationDirectory = {
  path: string;
  source: 'filesystem';
};

export type WorkspaceExplorationEntry = {
  id: string;
  kind: 'search' | 'read' | 'directory' | 'note';
  text: string;
  detail?: string;
  path?: string;
  createdAt: string;
};

export type WorkspaceExplorationSegment = {
  id: string;
  createdAt: string;
  summary?: string;
  entries: WorkspaceExplorationEntry[];
  searches: WorkspaceExplorationSearch[];
  files: WorkspaceExplorationFile[];
  directories: WorkspaceExplorationDirectory[];
};

export type WorkspaceExplorationArtifact = {
  query?: string;
  mode?: 'list' | 'search' | 'symbols' | 'definition' | 'references' | 'diagnostics';
  path?: string;
  summary?: string;
  segments: WorkspaceExplorationSegment[];
  searches: WorkspaceExplorationSearch[];
  files: WorkspaceExplorationFile[];
  directories: WorkspaceExplorationDirectory[];
};

export type WorkspaceFileReadArtifact = {
  path: string;
  displayPath: string;
  content: string;
  startLine?: number;
  endLine?: number;
  truncated?: boolean;
};

export type WorkspaceExplorationRequest = {
  toolCallId: string;
  mode?: 'list' | 'search' | 'symbols' | 'definition' | 'references' | 'diagnostics';
  query?: string;
  path?: string;
  symbol?: string;
  filePath?: string;
  line?: number;
  column?: number;
  maxResults?: number;
  includeFiles?: boolean;
  includeDirectories?: boolean;
  recursive?: boolean;
};

export type WorkspaceExplorationResponse = {
  formatted: string;
  artifact: WorkspaceExplorationArtifact;
};

export type WorkspaceFileReadRequest = {
  toolCallId: string;
  path: string;
  startLine?: number;
  endLine?: number;
  maxChars?: number;
};

export type AgentReasoningEvent = {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  text: string;
  isComplete?: boolean;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
  source: string;
};

export type Conversation = {
  id: string;
  messages: ChatMessage[];
};

export type AgentRunStatus =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'waitingForTool'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type AgentUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AgentStartResponse = {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  status: AgentRunStatus;
};

export type AgentRunRequest = {
  runId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  prompt: string;
  surface?: 'agent' | 'terminal' | null;
  cwd?: string | null;
  modelId?: string | null;
  terminalModelId?: string | null;
  messages?: AgentInputMessage[];
  terminalBlocks?: import('./terminal').TerminalCommandBlock[];
};

export type AgentContinueRequest = {
  runId?: string | null;
  conversationId: string;
  assistantMessageId?: string | null;
  surface?: 'agent' | 'terminal' | null;
  cwd?: string | null;
  modelId?: string | null;
  terminalModelId?: string | null;
  messages?: AgentInputMessage[];
  terminalBlocks?: import('./terminal').TerminalCommandBlock[];
};

export type AgentInputMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: any[];
};

export type AgentProviderConfigRequest = {
  apiKey: string;
  providerId?: ModelProviderId | null;
  baseUrl?: string | null;
  modelId?: string | null;
};

export type AgentProviderStatus = {
  provider: string;
  providerId: ModelProviderId;
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
  source: string;
};

export type AgentSourceModel = {
  id: string;
  sourceKind: string;
  label: string;
  provider: string;
  providerId: ModelProviderId;
  modelId: string;
  note: string;
  supportsAttachments: boolean;
};

export type AgentModelSourceStatus = {
  kind: string;
  label: string;
  available: boolean;
  connected: boolean;
  binaryPath?: string | null;
  authSource?: string | null;
  message?: string | null;
  models: AgentSourceModel[];
};

export type ChatAttachmentKind = 'text' | 'image' | 'binary';

export type ChatAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType?: string | null;
  kind: ChatAttachmentKind;
  content?: string | null;
  truncated?: boolean;
};

export type AgentStatusEvent = {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  status: AgentRunStatus;
  message?: string | null;
};

export type AgentTokenEvent = {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  text: string;
};

export type AgentDoneEvent = {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  status: AgentRunStatus;
  usage: AgentUsage;
};

export type AgentErrorEvent = {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  error: string;
};

export type AgentToolCall = {
  id: string;
  name: string;
  args: any;
  extraContent?: any;
};

export type AgentToolCallEvent = {
  runId: string;
  conversationId: string;
  assistantMessageId: string;
  toolCall: AgentToolCall;
};

export type ThinkingDisplayMode = 'show-and-collapse' | 'always-show' | 'never-show';

export interface ConfiguredModel {
  id: string;
  providerId?: ModelProviderId;
  providerLabel: string;
  modelId: string;
  baseUrl: string;
  friendlyName?: string;
  hasApiKey?: boolean;
  supportsAttachments?: boolean;
}
