import type { ChatMessage, ExecutionPlanArtifact, PlanExecutionUpdate, WebSearchRequest } from '../../types/chat';
import type { CommandApproval, FileChangeApproval, TerminalCommandBlock } from '../../types/terminal';

export type UseChatOptions = {
  onCommandApproval?: (approval: CommandApproval) => void;
  onFileChangeApproval?: (approval: FileChangeApproval) => void;
  onWebSearch?: (request: WebSearchRequest) => void;
  onNewChat?: () => void;
  onConversationCreated?: (conversationId: string) => void;
  onRequireModelSetup?: () => void;
  cwd?: string | null;
  modelId?: string | null;
  requiresModelSetup?: boolean;
  conversationId?: string | null;
  terminalBlocks?: TerminalCommandBlock[];
  onCloseTray?: () => void;
  active?: boolean;
};

export type AssistantMessageRegistration = {
  owner: symbol;
  append: (text: string) => boolean;
  update: (updater: (message: ChatMessage) => ChatMessage) => boolean;
  upsertReasoning: (payload: { text: string; isComplete?: boolean }) => void;
  showPlan: (plan: ExecutionPlanArtifact, toolCallId: string) => void;
  applyPlanExecution: (update: PlanExecutionUpdate, toolCallId: string) => void;
  onCommandApproval?: (approval: CommandApproval) => void;
  onFileChangeApproval?: (approval: FileChangeApproval) => void;
  onWebSearch?: (request: WebSearchRequest) => void;
};
