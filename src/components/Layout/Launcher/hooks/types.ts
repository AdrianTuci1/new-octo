
import type { CommandApproval, TerminalBlockSharedMeta, TerminalSessionTarget } from '../../../../types';

export type LauncherVariant = 'panel' | 'workspace';

export type LauncherProps = {
  variant?: LauncherVariant;
  initialComposerSurface?: 'agent' | 'terminal';
  startupCommands?: string[];
  initialWorkingDirectory?: string | null;
  initialTerminalSessionId?: string | null;
  initialAgentTerminalSessionId?: string | null;
  terminalTarget?: TerminalSessionTarget | null;
  agentTerminalTarget?: TerminalSessionTarget | null;
  persistWorkingDirectory?: boolean;
  persistTerminalSession?: boolean;
  chatMode?: 'auto' | 'always-open';
  conversationId?: string | null;
  active?: boolean;
  onSelectConversation?: (conversationId: string) => void;
  onConversationChange?: (conversationId: string | null) => void;
  onComposerSurfaceChange?: (composerSurface: 'agent' | 'terminal') => void;
  onNewConversation?: (options?: { seedPrompt?: string }) => string | null | void;
  onExitAgentToTerminal?: () => void;
  onPendingApprovalChange?: (approval: CommandApproval | null) => void;
  onTerminalBlockMetaChange?: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => void;
  onSyntheticBlocksChange?: (syntheticBlocks: import('../../../../types').TerminalCommandBlock[]) => void;
  onTerminalSessionChange?: (sessionId: string | null) => void;
  onAgentTerminalBlockMetaChange?: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => void;
  onAgentTerminalSessionChange?: (sessionId: string | null) => void;
  onStartupCommandsConsumed?: () => void;
  onWorkingDirectoryChange?: (path: string | null) => void;
  pendingApproval?: CommandApproval | null;
  resetOnMount?: boolean;
  sharedTerminalBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
  sharedSyntheticBlocks?: import('../../../../types').TerminalCommandBlock[];
  sharedAgentTerminalBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
  title?: string;
};
