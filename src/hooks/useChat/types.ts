import type { ChatMessage } from '../../types/chat';
import type { CommandApproval, FileChangeApproval, TerminalCommandBlock } from '../../types/terminal';

export type UseChatOptions = {
  onCommandApproval?: (approval: CommandApproval) => void;
  onFileChangeApproval?: (approval: FileChangeApproval) => void;
  onNewChat?: () => void;
  onConversationCreated?: (conversationId: string) => void;
  cwd?: string | null;
  modelId?: string | null;
  conversationId?: string | null;
  terminalBlocks?: TerminalCommandBlock[];
  onCloseTray?: () => void;
  active?: boolean;
};

export type AssistantMessageRegistration = {
  owner: symbol;
  append: (text: string) => boolean;
  update: (updater: (message: ChatMessage) => ChatMessage) => boolean;
  onCommandApproval?: (approval: CommandApproval) => void;
  onFileChangeApproval?: (approval: FileChangeApproval) => void;
};
