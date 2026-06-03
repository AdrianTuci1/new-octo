import type {
  ChatMessage,
  CloudAgentLaunchRequest,
  ExecutionPlanArtifact,
  PlanExecutionUpdate,
  WebSearchRequest,
  WorkspaceExplorationRequest,
  WorkspaceFileReadRequest
} from '../../types/chat';
import type { CommandApproval, FileChangeApproval, TerminalCommandBlock } from '../../types/terminal';
import type { MemoryConversationRecord } from '../../types/memory';

export type UseChatOptions = {
  onCommandApproval?: (approval: CommandApproval) => void;
  onFileChangeApproval?: (approval: FileChangeApproval) => void;
  onWebSearch?: (request: WebSearchRequest) => void;
  onWorkspaceExploration?: (request: WorkspaceExplorationRequest) => void;
  onWorkspaceFileRead?: (request: WorkspaceFileReadRequest) => void;
  onCloudAgentLaunch?: (request: CloudAgentLaunchRequest) => Promise<unknown> | unknown;
  onNewChat?: () => void;
  onConversationCreated?: (conversationId: string) => void;
  onRequireModelSetup?: () => void;
  cwd?: string | null;
  surface?: 'agent' | 'terminal';
  modelId?: string | null;
  terminalModelId?: string | null;
  requiresModelSetup?: boolean;
  conversationId?: string | null;
  terminalBlocks?: TerminalCommandBlock[];
  onCloseTray?: () => void;
  active?: boolean;
  onConversationLoaded?: (conversation: MemoryConversationRecord) => void;
};

export type AssistantMessageRegistration = {
  owner: symbol;
  append: (text: string) => boolean;
  update: (updater: (message: ChatMessage) => ChatMessage) => boolean;
  upsertReasoning: (payload: { text: string; isComplete?: boolean }) => void;
  finalizeReasoning?: () => void;
  showPlan: (plan: ExecutionPlanArtifact, toolCallId: string) => void;
  applyPlanExecution: (update: PlanExecutionUpdate, toolCallId: string) => void;
  onCommandApproval?: (approval: CommandApproval) => void;
  onFileChangeApproval?: (approval: FileChangeApproval) => void;
  onWebSearch?: (request: WebSearchRequest) => void;
  onWorkspaceExploration?: (request: WorkspaceExplorationRequest) => void;
  onWorkspaceFileRead?: (request: WorkspaceFileReadRequest) => void;
  onCloudAgentLaunch?: (request: CloudAgentLaunchRequest) => Promise<unknown> | unknown;
};
