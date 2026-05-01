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
  messages?: AgentInputMessage[];
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
