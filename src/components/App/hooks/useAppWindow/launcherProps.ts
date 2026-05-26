import { useCallback } from 'react';
import type { CommandApproval, TerminalBlockSharedMeta, TerminalCommandBlock } from '../../../../types/terminal';
import * as Utils from '../../utils';

type UseAppWindowLauncherPropsParams = {
  activePaneId: string | null;
  defaultWorkingDirectory: string | null;
  displayTabLabelsById: Map<string, string>;
  paneStartupCommandsByPaneId: Record<string, string[]>;
  selectedTabId: string;
  startCloudAgentTab: (options?: {
    prompt?: string | null;
    cwd?: string | null;
    repo?: string | null;
    baseBranch?: string | null;
    workBranch?: string | null;
    profileId?: string | null;
  }) => Promise<unknown>;
  getLauncherSessionForPane: (paneId: string | null) => ReturnType<typeof Utils.createEmptyTerminalSession> | null;
  handleAgentTerminalBlockMetaChange: (paneId: string, terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => void;
  handleAgentTerminalBlocksChange: (paneId: string, terminalBlocks: TerminalCommandBlock[]) => void;
  handleAgentTerminalSessionChange: (paneId: string, sessionId: string | null) => void;
  handleSyntheticBlocksChange: (paneId: string, syntheticBlocks: TerminalCommandBlock[]) => void;
  handleTerminalBlockMetaChange: (paneId: string, terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => void;
  handleTerminalBlocksChange: (paneId: string, terminalBlocks: TerminalCommandBlock[]) => void;
  handleTerminalComposerSurfaceChange: (paneId: string, composerSurface: 'agent' | 'terminal') => void;
  handleTerminalConversationChange: (paneId: string, conversationId: string | null) => void;
  handleTerminalPendingApprovalChange: (paneId: string, approval: CommandApproval | null) => void;
  handleTerminalSessionChange: (paneId: string, sessionId: string | null) => void;
  handleTerminalWorkingDirectoryChange: (paneId: string, path: string | null) => void;
  onNewConversation: (_options?: { seedPrompt?: string }) => string;
  onSelectConversation: (conversationId: string) => void;
  setPaneStartupCommandsByPaneId: (updater: Record<string, string[]> | ((current: Record<string, string[]>) => Record<string, string[]>)) => void;
};

export function useAppWindowLauncherProps({
  activePaneId,
  defaultWorkingDirectory,
  displayTabLabelsById,
  paneStartupCommandsByPaneId,
  selectedTabId,
  startCloudAgentTab,
  getLauncherSessionForPane,
  handleAgentTerminalBlockMetaChange,
  handleAgentTerminalBlocksChange,
  handleAgentTerminalSessionChange,
  handleSyntheticBlocksChange,
  handleTerminalBlockMetaChange,
  handleTerminalBlocksChange,
  handleTerminalComposerSurfaceChange,
  handleTerminalConversationChange,
  handleTerminalPendingApprovalChange,
  handleTerminalSessionChange,
  handleTerminalWorkingDirectoryChange,
  onNewConversation,
  onSelectConversation,
  setPaneStartupCommandsByPaneId
}: UseAppWindowLauncherPropsParams) {
  return useCallback((tabId: string, paneId: string) => {
    const session = getLauncherSessionForPane(paneId);

    return {
      active: tabId === selectedTabId && paneId === activePaneId,
      chatMode: 'always-open' as const,
      conversationId: session?.activeConversationId ?? null,
      initialComposerSurface: session?.composerSurface ?? ((session?.activeConversationId ?? null) ? 'agent' as const : 'terminal' as const),
      initialTerminalSessionId: session?.terminalSessionId ?? null,
      initialAgentTerminalSessionId: session?.agentTerminalSessionId ?? null,
      startupCommands: paneStartupCommandsByPaneId[paneId] ?? [],
      terminalTarget: session?.terminalTarget ?? null,
      agentTerminalTarget: session?.agentTerminalTarget ?? null,
      initialWorkingDirectory: session?.workingDirectory ?? defaultWorkingDirectory,
      onStartupCommandsConsumed: () => {
        setPaneStartupCommandsByPaneId((current) => {
          if (!(paneId in current)) {
            return current;
          }

          const next = { ...current };
          delete next[paneId];
          return next;
        });
      },
      onComposerSurfaceChange: (composerSurface: 'agent' | 'terminal') => handleTerminalComposerSurfaceChange(paneId, composerSurface),
      onConversationChange: (conversationId: string | null) => handleTerminalConversationChange(paneId, conversationId),
      onNewConversation,
      onPendingApprovalChange: (approval: CommandApproval | null) => handleTerminalPendingApprovalChange(paneId, approval),
      onSelectConversation,
      onSyntheticBlocksChange: (syntheticBlocks: TerminalCommandBlock[]) => handleSyntheticBlocksChange(paneId, syntheticBlocks),
      onTerminalBlockMetaChange: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => handleTerminalBlockMetaChange(paneId, terminalBlockMetaById),
      onTerminalBlocksChange: (terminalBlocks: TerminalCommandBlock[]) => handleTerminalBlocksChange(paneId, terminalBlocks),
      onTerminalSessionChange: (sessionId: string | null) => handleTerminalSessionChange(paneId, sessionId),
      onAgentTerminalBlockMetaChange: (terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>) => handleAgentTerminalBlockMetaChange(paneId, terminalBlockMetaById),
      onAgentTerminalBlocksChange: (terminalBlocks: TerminalCommandBlock[]) => handleAgentTerminalBlocksChange(paneId, terminalBlocks),
      onAgentTerminalSessionChange: (sessionId: string | null) => handleAgentTerminalSessionChange(paneId, sessionId),
      onCloudAgentLaunch: startCloudAgentTab,
      onWorkingDirectoryChange: (path: string | null) => handleTerminalWorkingDirectoryChange(paneId, path),
      pendingApproval: session?.pendingApproval ?? null,
      persistWorkingDirectory: false,
      persistTerminalSession: true,
      resetOnMount: true,
      sharedTerminalBlockMetaById: session?.terminalBlockMetaById ?? Utils.EMPTY_META,
      sharedTerminalBlocks: session?.terminalBlocks ?? Utils.EMPTY_SYNTHETIC_BLOCKS,
      sharedSyntheticBlocks: session?.syntheticBlocks ?? Utils.EMPTY_SYNTHETIC_BLOCKS,
      sharedAgentTerminalBlockMetaById: session?.agentTerminalBlockMetaById ?? Utils.EMPTY_META,
      sharedAgentTerminalBlocks: session?.agentTerminalBlocks ?? Utils.EMPTY_SYNTHETIC_BLOCKS,
      title: displayTabLabelsById.get(tabId),
      variant: 'workspace' as const
    };
  }, [
    activePaneId,
    defaultWorkingDirectory,
    displayTabLabelsById,
    getLauncherSessionForPane,
    handleAgentTerminalBlockMetaChange,
    handleAgentTerminalBlocksChange,
    handleAgentTerminalSessionChange,
    handleSyntheticBlocksChange,
    handleTerminalBlockMetaChange,
    handleTerminalBlocksChange,
    handleTerminalComposerSurfaceChange,
    handleTerminalConversationChange,
    handleTerminalPendingApprovalChange,
    handleTerminalSessionChange,
    handleTerminalWorkingDirectoryChange,
    onNewConversation,
    onSelectConversation,
    paneStartupCommandsByPaneId,
    selectedTabId,
    setPaneStartupCommandsByPaneId,
    startCloudAgentTab
  ]);
}
