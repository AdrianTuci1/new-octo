import type {
  ChatMessage,
  ChatAttachment,
  WebSearchRequest,
  CloudAgentLaunchRequest,
  WorkspaceExplorationRequest,
  WorkspaceFileReadRequest,
} from '../../types/chat';
import type { CommandApproval, FileChangeApproval, TerminalCommandBlock } from '../../types/terminal';

export interface AgentChatApi {
  query: string;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  activeRunId: string | null;
  setQuery: (value: string) => void;
  submitQuery: (promptOverride?: string) => Promise<void>;
  submitToolResult: (
    toolCallId: string,
    result: string,
    kind?: 'command' | 'web-search' | 'file-change' | 'workspace-exploration' | 'file-read',
    label?: string,
    webSearchResults?: Array<{ title: string; url: string; snippet?: string }>,
    toolResultOptions?: Record<string, unknown>,
  ) => Promise<void>;
  attachFiles: (files: File[]) => Promise<void>;
  clearMessages: () => void;
  saveCurrentConversation: () => Promise<unknown>;
}

export type AgentChatOptions = {
  conversationId?: string | null;
  cwd?: string | null;
  surface?: 'agent' | 'terminal';
  modelId?: string | null;
  terminalModelId?: string | null;
  requiresModelSetup?: boolean;
  terminalBlocks?: TerminalCommandBlock[];
  onCommandApproval?: (approval: CommandApproval) => void;
  onFileChangeApproval?: (approval: FileChangeApproval) => void;
  onWebSearch?: (request: WebSearchRequest) => void;
  onWorkspaceExploration?: (request: WorkspaceExplorationRequest) => void;
  onWorkspaceFileRead?: (request: WorkspaceFileReadRequest) => void;
  onCloudAgentLaunch?: (request: CloudAgentLaunchRequest) => Promise<unknown> | unknown;
  onNewChat?: () => void;
  onConversationCreated?: (conversationId: string) => void;
  onRequireModelSetup?: () => void;
  onCloseTray?: () => void;
  active?: boolean;
};

/**
 * AgentChatService - wraps the useChat hook with a clean OOP API.
 * The actual streaming/token buffer/tool dispatch logic lives in the hook.
 *
 * IMPORTANT: This service must be instantiated inside a React component
 * and its API is populated via init(api).
 */
export class AgentChatService {
  private api: AgentChatApi | null = null;
  private options: AgentChatOptions;

  constructor(options: AgentChatOptions = {}) {
    this.options = options;
  }

  /** Call this from the component to wire the hook API into the service */
  init(api: AgentChatApi): void {
    this.api = api;
  }

  updateOptions(options: Partial<AgentChatOptions>): void {
    this.options = { ...this.options, ...options };
  }

  get query(): string {
    return this.api?.query ?? '';
  }

  get messages(): ChatMessage[] {
    return this.api?.messages ?? [];
  }

  get attachments(): ChatAttachment[] {
    return this.api?.attachments ?? [];
  }

  get activeRunId(): string | null {
    return this.api?.activeRunId ?? null;
  }

  setQuery(value: string): void {
    this.api?.setQuery(value);
  }

  clearMessages(): void {
    this.api?.clearMessages();
  }

  async submitQuery(promptOverride?: string): Promise<void> {
    await this.api?.submitQuery(promptOverride);
  }

  async submitToolResult(
    toolCallId: string,
    result: string,
    kind: 'command' | 'web-search' | 'file-change' | 'workspace-exploration' | 'file-read' = 'command',
    label?: string,
    webSearchResults?: Array<{ title: string; url: string; snippet?: string }>,
    toolResultOptions?: Record<string, unknown>,
  ): Promise<void> {
    await this.api?.submitToolResult(toolCallId, result, kind, label, webSearchResults, toolResultOptions);
  }

  async attachFiles(files: File[]): Promise<void> {
    await this.api?.attachFiles(files);
  }

  async saveCurrentConversation(): Promise<unknown> {
    return this.api?.saveCurrentConversation();
  }

  /** Build the useChat options for the hook */
  buildHookOptions(): {
    conversationId: string | null;
    cwd: string | null;
    surface: 'agent' | 'terminal';
    modelId: string | null;
    terminalModelId: string | null;
    requiresModelSetup: boolean;
    terminalBlocks: TerminalCommandBlock[];
    onCommandApproval?: (approval: CommandApproval) => void;
    onFileChangeApproval?: (approval: FileChangeApproval) => void;
    onWebSearch?: (request: WebSearchRequest) => void;
    onWorkspaceExploration?: (request: WorkspaceExplorationRequest) => void;
    onWorkspaceFileRead?: (request: WorkspaceFileReadRequest) => void;
    onCloudAgentLaunch?: (request: CloudAgentLaunchRequest) => Promise<unknown> | unknown;
    onNewChat?: () => void;
    onConversationCreated?: (conversationId: string) => void;
    onRequireModelSetup?: () => void;
    onCloseTray?: () => void;
    active: boolean;
  } {
    return {
      conversationId: this.options.conversationId ?? null,
      cwd: this.options.cwd ?? null,
      surface: this.options.surface ?? 'agent',
      modelId: this.options.modelId ?? null,
      terminalModelId: this.options.terminalModelId ?? null,
      requiresModelSetup: this.options.requiresModelSetup ?? false,
      terminalBlocks: this.options.terminalBlocks ?? [],
      onCommandApproval: this.options.onCommandApproval,
      onFileChangeApproval: this.options.onFileChangeApproval,
      onWebSearch: this.options.onWebSearch,
      onWorkspaceExploration: this.options.onWorkspaceExploration,
      onWorkspaceFileRead: this.options.onWorkspaceFileRead,
      onCloudAgentLaunch: this.options.onCloudAgentLaunch,
      onNewChat: this.options.onNewChat,
      onConversationCreated: this.options.onConversationCreated,
      onRequireModelSetup: this.options.onRequireModelSetup,
      onCloseTray: this.options.onCloseTray,
      active: this.options.active ?? true,
    };
  }
}
