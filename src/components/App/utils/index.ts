import { initialWorkspaceChromeTabs, defaultWorkspaceChromeTabId } from '../chrome';
import { settingsDefaultSectionId, settingsDefaultExpandedGroupIds } from '../settings/settingsData';
import type { WorkspaceChromeTab, WorkspaceConversation } from '../chrome';
import type { MemoryConversationSummary, MemoryWorkspaceSnapshot } from '../../../types';
import type { CommandApproval, TerminalBlockSharedMeta, TerminalCommandBlock } from '../../../types';

export type TerminalSessionState = {
  activeConversationId: string | null;
  composerSurface: 'agent' | 'terminal';
  workingDirectory: string | null;
  terminalSessionId: string | null;
  agentTerminalSessionId: string | null;
  pendingApproval: CommandApproval | null;
  terminalBlockMetaById: Record<string, TerminalBlockSharedMeta>;
  agentTerminalBlockMetaById: Record<string, TerminalBlockSharedMeta>;
  syntheticBlocks: TerminalCommandBlock[];
};

export type SavedWorkspaceTabConfig = {
  id: string;
  name: string;
  createdAt: string;
  tab: WorkspaceChromeTab;
  terminalSession: TerminalSessionState | null;
};

export function buildTerminalTab(index: number, label: string): WorkspaceChromeTab {
  const suffix = String(index).padStart(2, '0');
  return {
    id: `terminal-${suffix}`,
    label,
    kind: 'terminal'
  };
}

export function buildConversationFromSummary(summary: MemoryConversationSummary): WorkspaceConversation {
  const cwdSegments = summary.cwd?.split('/').filter(Boolean) ?? [];

  return {
    id: summary.id,
    title: summary.title || 'New agent conversation',
    branchLabel: summary.branchLabel ?? cwdSegments[cwdSegments.length - 1] ?? '~',
    timeLabel: summary.timeLabel || 'recently'
  };
}

export function createConversationId() {
  return `conv_${Date.now()}`;
}

export function inferNextTabIndex(tabs: WorkspaceChromeTab[], prefix: 'terminal' | 'conversation') {
  const indexes = tabs
    .map((tab) => {
      const match = tab.id.match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Number(match[1]) : 0;
    })
    .filter((index) => Number.isFinite(index));

  return Math.max(1, ...indexes.map((index) => index + 1));
}

export function normalizeWorkspaceTab(tab: WorkspaceChromeTab): WorkspaceChromeTab {
  if (tab.kind !== 'conversation') {
    return tab;
  }

  return {
    ...tab,
    kind: 'terminal'
  };
}

export function buildTerminalSessionState(tabs: WorkspaceChromeTab[]) {
  return Object.fromEntries(
    tabs
      .filter((tab) => tab.kind === 'terminal')
      .map((tab) => [tab.id, {
        activeConversationId: null,
        composerSurface: 'terminal',
        workingDirectory: null,
        terminalSessionId: null,
        agentTerminalSessionId: null,
        pendingApproval: null,
        terminalBlockMetaById: {},
        agentTerminalBlockMetaById: {},
        syntheticBlocks: []
      } satisfies TerminalSessionState])
  ) as Record<string, TerminalSessionState>;
}

export function mergeTerminalSessions(
  tabs: WorkspaceChromeTab[],
  current: Record<string, {
    activeConversationId: string | null;
    composerSurface?: 'agent' | 'terminal';
    workingDirectory?: string | null;
    terminalSessionId?: string | null;
    agentTerminalSessionId?: string | null;
    pendingApproval?: CommandApproval | null;
    terminalBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
    agentTerminalBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
    syntheticBlocks?: TerminalCommandBlock[];
  }>,
  defaultWorkingDirectory: string | null,
  seededConversations: Record<string, string | null> = {}
) {
  return Object.fromEntries(
    tabs
      .filter((tab) => tab.kind === 'terminal')
      .map((tab) => [
        tab.id,
        {
          activeConversationId: current[tab.id]?.activeConversationId ?? seededConversations[tab.id] ?? null,
          composerSurface: current[tab.id]?.composerSurface
            ?? ((current[tab.id]?.activeConversationId ?? seededConversations[tab.id] ?? null) ? 'agent' : 'terminal'),
          workingDirectory: current[tab.id]?.workingDirectory ?? defaultWorkingDirectory,
          terminalSessionId: current[tab.id]?.terminalSessionId ?? null,
          agentTerminalSessionId: current[tab.id]?.agentTerminalSessionId ?? null,
          pendingApproval: current[tab.id]?.pendingApproval ?? null,
          terminalBlockMetaById: current[tab.id]?.terminalBlockMetaById ?? {},
          agentTerminalBlockMetaById: current[tab.id]?.agentTerminalBlockMetaById ?? {},
          syntheticBlocks: current[tab.id]?.syntheticBlocks ?? []
        } satisfies TerminalSessionState
      ])
  ) as Record<string, TerminalSessionState>;
}

export function buildWorkspaceComparableSnapshot(
  tabs: WorkspaceChromeTab[],
  selectedTabId: string,
  launcherTabId: string | null,
  terminalSessions: Record<string, TerminalSessionState>,
  activeSectionId: string,
  expandedGroupIds: string[],
  isSidebarOpen: boolean,
  isAgentsActive: boolean,
  nextTerminalIndex: number
) {
  return {
    tabs,
    selectedTabId,
    launcherTabId,
    terminalSessions,
    activeSectionId,
    expandedGroupIds,
    isSidebarOpen,
    isAgentsActive,
    nextTerminalIndex
  };
}

export function buildComparableFromWorkspace(
  workspace: MemoryWorkspaceSnapshot,
  fallbackHomeDir: string | null
) {
  const restoredTabs = (
    workspace.tabs.length > 0 ? workspace.tabs : initialWorkspaceChromeTabs
  ).map(normalizeWorkspaceTab);

  return buildWorkspaceComparableSnapshot(
    restoredTabs,
    workspace.selectedTabId && restoredTabs.some((tab) => tab.id === workspace.selectedTabId)
      ? workspace.selectedTabId
      : restoredTabs[0]?.id ?? defaultWorkspaceChromeTabId,
    workspace.launcherTabId ?? restoredTabs.find((tab) => tab.kind === 'terminal')?.id ?? null,
    mergeTerminalSessions(
      restoredTabs,
      workspace.terminalSessions ?? {},
      fallbackHomeDir,
      Object.fromEntries(
        workspace.tabs
          .filter((tab) => tab.kind === 'conversation')
          .map((tab) => [tab.id, tab.id])
      )
    ),
    workspace.activeSectionId ?? settingsDefaultSectionId,
    workspace.expandedGroupIds.length > 0 ? workspace.expandedGroupIds : settingsDefaultExpandedGroupIds,
    workspace.isSidebarOpen,
    workspace.isAgentsActive,
    Math.max(workspace.nextTerminalIndex || 1, inferNextTabIndex(restoredTabs, 'terminal'))
  );
}

export const EMPTY_META: Record<string, TerminalBlockSharedMeta> = {};
export const EMPTY_SYNTHETIC_BLOCKS: TerminalCommandBlock[] = [];

