import type { CommandApproval, TerminalBlockSharedMeta, TerminalCommandBlock } from '../../../types/terminal';
import type { AppWindowStoreApi } from '../appWindow/store';
import type { TerminalSessionState } from '../utils';
import * as Utils from '../utils';
import { ConversationService } from './ConversationService';
import { TerminalSessionService } from './TerminalSessionService';

type StartCloudAgentTab = (options?: {
  prompt?: string | null;
  cwd?: string | null;
  repo?: string | null;
  baseBranch?: string | null;
  workBranch?: string | null;
  profileId?: string | null;
  syncStrategy?: 'git' | 'patch' | 'none' | null;
  commitMessage?: string | null;
  artifactPath?: string | null;
}) => Promise<unknown> | unknown;

type LauncherPanePropsFactoryParams = {
  store: AppWindowStoreApi;
  activePaneId: string | null;
  defaultWorkingDirectory: string | null;
  displayTabLabelsById: Map<string, string>;
  paneStartupCommandsByPaneId: Record<string, string[]>;
  selectedTabId: string;
  startCloudAgentTab: StartCloudAgentTab;
  getLauncherSessionForPane: (paneId: string | null) => TerminalSessionState | null;
  terminalSessionService: TerminalSessionService;
  conversationService: ConversationService;
};

export class LauncherPanePropsFactory {
  constructor(private readonly params: LauncherPanePropsFactoryParams) {}

  build(tabId: string, paneId: string) {
    const session = this.params.getLauncherSessionForPane(paneId);

    return {
      active: tabId === this.params.selectedTabId && paneId === this.params.activePaneId,
      chatMode: 'always-open' as const,
      conversationId: session?.activeConversationId ?? null,
      initialComposerSurface: session?.composerSurface ?? ((session?.activeConversationId ?? null) ? 'agent' as const : 'terminal' as const),
      initialTerminalSessionId: session?.terminalSessionId ?? null,
      initialAgentTerminalSessionId: session?.agentTerminalSessionId ?? null,
      startupCommands: this.params.paneStartupCommandsByPaneId[paneId] ?? [],
      terminalTarget: session?.terminalTarget ?? null,
      agentTerminalTarget: session?.agentTerminalTarget ?? null,
      initialWorkingDirectory: session?.workingDirectory ?? this.params.defaultWorkingDirectory,
      onStartupCommandsConsumed: () => {
        this.params.store.getState().setPaneStartupCommandsByPaneId((current) => {
          if (!(paneId in current)) {
            return current;
          }

          const next = { ...current };
          delete next[paneId];
          return next;
        });
      },
      onComposerSurfaceChange: (composerSurface: 'agent' | 'terminal') => this.params.terminalSessionService.updateComposerSurface(paneId, composerSurface),
      onConversationChange: (conversationId: string | null) => this.params.terminalSessionService.updateConversationId(paneId, conversationId),
      onNewConversation: () => this.params.conversationService.newConversation(),
      onPendingApprovalChange: (approval: CommandApproval | null) => this.params.terminalSessionService.updatePendingApproval(paneId, approval),
      onSelectConversation: (conversationId: string) => this.params.conversationService.selectConversation(conversationId),
      onSyntheticBlocksChange: (syntheticBlocks: TerminalCommandBlock[]) => this.params.terminalSessionService.updateSyntheticBlocks(paneId, syntheticBlocks),
      onTerminalBlockMetaChange: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => this.params.terminalSessionService.updateTerminalMeta(paneId, terminalBlockMetaById),
      onTerminalBlocksChange: (terminalBlocks: TerminalCommandBlock[]) => this.params.terminalSessionService.updateTerminalBlocks(paneId, terminalBlocks),
      onTerminalSessionChange: (sessionId: string | null) => this.params.terminalSessionService.updateSessionId(paneId, sessionId),
      onAgentTerminalBlockMetaChange: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => this.params.terminalSessionService.updateAgentTerminalMeta(paneId, terminalBlockMetaById),
      onAgentTerminalBlocksChange: (terminalBlocks: TerminalCommandBlock[]) => this.params.terminalSessionService.updateAgentTerminalBlocks(paneId, terminalBlocks),
      onAgentTerminalSessionChange: (sessionId: string | null) => this.params.terminalSessionService.updateAgentSessionId(paneId, sessionId),
      onCloudAgentLaunch: this.params.startCloudAgentTab,
      onWorkingDirectoryChange: (path: string | null) => this.params.terminalSessionService.updateWorkingDirectory(paneId, path),
      pendingApproval: session?.pendingApproval ?? null,
      persistWorkingDirectory: false,
      persistTerminalSession: true,
      resetOnMount: true,
      sharedTerminalBlockMetaById: session?.terminalBlockMetaById ?? Utils.EMPTY_META,
      sharedTerminalBlocks: session?.terminalBlocks ?? Utils.EMPTY_SYNTHETIC_BLOCKS,
      sharedSyntheticBlocks: session?.syntheticBlocks ?? Utils.EMPTY_SYNTHETIC_BLOCKS,
      sharedAgentTerminalBlockMetaById: session?.agentTerminalBlockMetaById ?? Utils.EMPTY_META,
      sharedAgentTerminalBlocks: session?.agentTerminalBlocks ?? Utils.EMPTY_SYNTHETIC_BLOCKS,
      title: this.params.displayTabLabelsById.get(tabId),
      variant: 'workspace' as const
    };
  }

  getLauncherIdentityKey(paneId: string): string {
    // The launcher is designed to react to prop changes for session and conversation state.
    // Remounting on every conversation/session transition drops in-flight chat hydration
    // and can make terminal+AI panes appear empty when switching tabs.
    return `pane-${paneId}`;
  }
}
