import type { FileDiff } from './diff';

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
  messageKind?: 'default' | 'reasoning';
  thinkingDurationSeconds?: number;
  hasNativeThinking?: boolean;
  parentMessageId?: string;
  toolKind?: 'command' | 'web-search' | 'plan' | 'file-change';
  webSearchStatus?: 'searching' | 'success' | 'error';
  webSearchQuery?: string;
  webSearchResults?: WebSearchResult[];
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
  baseUrl?: string | null;
  modelId?: string | null;
};

export type AgentProviderStatus = {
  provider: string;
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
  source: string;
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
  providerLabel: string;
  modelId: string;
  baseUrl: string;
  friendlyName?: string;
  hasApiKey?: boolean;
}
