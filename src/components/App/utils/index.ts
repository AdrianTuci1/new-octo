import { initialWorkspaceChromeTabs, defaultWorkspaceChromeTabId } from '../chrome';
import {
  settingsDefaultSectionId,
  settingsDefaultExpandedGroupIds
} from '../settings/settingsData';
import type {
  WorkspaceChromeTab,
  WorkspaceConversation,
  WorkspacePaneDirection,
  WorkspacePaneLayout,
  WorkspacePaneNode
} from '../chrome';
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

export function createEmptyTerminalSession(
  workingDirectory: string | null = null
): TerminalSessionState {
  return {
    activeConversationId: null,
    composerSurface: 'terminal',
    workingDirectory,
    terminalSessionId: null,
    agentTerminalSessionId: null,
    pendingApproval: null,
    terminalBlockMetaById: {},
    agentTerminalBlockMetaById: {},
    syntheticBlocks: []
  };
}

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

export function createDefaultPaneLayout(tabId: string): WorkspacePaneLayout {
  return {
    activePaneId: tabId,
    root: {
      type: 'leaf',
      paneId: tabId
    }
  };
}

function isLeaf(node: WorkspacePaneNode): node is Extract<WorkspacePaneNode, { type: 'leaf' }> {
  return node.type === 'leaf';
}

export function collectPaneIds(node: WorkspacePaneNode): string[] {
  if (isLeaf(node)) {
    return [node.paneId];
  }

  return node.children.flatMap((child) => collectPaneIds(child));
}

export function collectPaneIdsFromLayout(layout: WorkspacePaneLayout | null | undefined): string[] {
  if (!layout) {
    return [];
  }

  return collectPaneIds(layout.root);
}

export function buildTerminalSessionState(tabs: WorkspaceChromeTab[]) {
  return Object.fromEntries(
    tabs
      .filter((tab) => tab.kind === 'terminal')
      .map((tab) => [tab.id, createEmptyTerminalSession()])
  ) as Record<string, TerminalSessionState>;
}

export function mergeTerminalSessions(
  tabs: WorkspaceChromeTab[],
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout>,
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
  const paneIds = tabs
    .filter((tab) => tab.kind === 'terminal')
    .flatMap((tab) => collectPaneIdsFromLayout(paneLayoutsByTabId[tab.id] ?? createDefaultPaneLayout(tab.id)));

  return Object.fromEntries(
    paneIds.map((paneId) => [
      paneId,
      {
        activeConversationId: current[paneId]?.activeConversationId ?? seededConversations[paneId] ?? null,
        composerSurface: current[paneId]?.composerSurface
          ?? ((current[paneId]?.activeConversationId ?? seededConversations[paneId] ?? null) ? 'agent' : 'terminal'),
        workingDirectory: current[paneId]?.workingDirectory ?? defaultWorkingDirectory,
        terminalSessionId: current[paneId]?.terminalSessionId ?? null,
        agentTerminalSessionId: current[paneId]?.agentTerminalSessionId ?? null,
        pendingApproval: current[paneId]?.pendingApproval ?? null,
        terminalBlockMetaById: current[paneId]?.terminalBlockMetaById ?? {},
        agentTerminalBlockMetaById: current[paneId]?.agentTerminalBlockMetaById ?? {},
        syntheticBlocks: current[paneId]?.syntheticBlocks ?? []
      } satisfies TerminalSessionState
    ])
  ) as Record<string, TerminalSessionState>;
}

function normalizePaneNode(node: WorkspacePaneNode | null | undefined): WorkspacePaneNode | null {
  if (!node) {
    return null;
  }

  if (node.type === 'leaf') {
    return typeof node.paneId === 'string' && node.paneId.length > 0
      ? { type: 'leaf', paneId: node.paneId }
      : null;
  }

  const normalizedChildren = node.children
    .map((child) => normalizePaneNode(child))
    .filter((child): child is WorkspacePaneNode => Boolean(child));

  if (normalizedChildren.length === 0) {
    return null;
  }

  if (normalizedChildren.length === 1) {
    return normalizedChildren[0];
  }

  return {
    type: 'split',
    direction: node.direction === 'vertical' ? 'vertical' : 'horizontal',
    children: normalizedChildren.flatMap((child) => {
      if (child.type === 'split' && child.direction === (node.direction === 'vertical' ? 'vertical' : 'horizontal')) {
        return child.children;
      }

      return [child];
    })
  };
}

function normalizePaneLayout(
  tabId: string,
  layout: WorkspacePaneLayout | null | undefined
): WorkspacePaneLayout {
  const normalizedRoot = normalizePaneNode(layout?.root) ?? createDefaultPaneLayout(tabId).root;
  const paneIds = collectPaneIds(normalizedRoot);
  const activePaneId = layout?.activePaneId && paneIds.includes(layout.activePaneId)
    ? layout.activePaneId
    : paneIds[0] ?? tabId;

  return {
    activePaneId,
    root: normalizedRoot
  };
}

export function normalizePaneLayoutsByTabId(
  tabs: WorkspaceChromeTab[],
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout> | null | undefined
) {
  const terminalTabs = tabs.filter((tab) => tab.kind === 'terminal');

  return Object.fromEntries(
    terminalTabs.map((tab) => [
      tab.id,
      normalizePaneLayout(tab.id, paneLayoutsByTabId?.[tab.id] ?? createDefaultPaneLayout(tab.id))
    ])
  ) as Record<string, WorkspacePaneLayout>;
}

type SplitPaneInNodeResult = {
  inserted: boolean;
  node: WorkspacePaneNode;
};

function splitPaneInNode(
  node: WorkspacePaneNode,
  activePaneId: string,
  direction: WorkspacePaneDirection,
  nextPaneId: string
): SplitPaneInNodeResult {
  if (node.type === 'leaf') {
    if (node.paneId !== activePaneId) {
      return { inserted: false, node };
    }

    return {
      inserted: true,
      node: direction === 'horizontal'
        ? {
            type: 'split',
            direction: 'horizontal',
            children: [node, { type: 'leaf', paneId: nextPaneId }]
          }
        : {
            type: 'split',
            direction: 'vertical',
            children: [{ type: 'leaf', paneId: nextPaneId }, node]
          }
    };
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const result = splitPaneInNode(node.children[index], activePaneId, direction, nextPaneId);
    if (!result.inserted) {
      continue;
    }

    const nextChildren = [...node.children];

    if (result.node.type === 'split' && result.node.direction === node.direction) {
      nextChildren.splice(index, 1, ...result.node.children);
    } else {
      nextChildren[index] = result.node;
    }

    return {
      inserted: true,
      node: normalizePaneNode({
        type: 'split',
        direction: node.direction,
        children: nextChildren
      }) ?? node
    };
  }

  return { inserted: false, node };
}

export function splitPaneLayout(
  layout: WorkspacePaneLayout,
  activePaneId: string,
  direction: WorkspacePaneDirection,
  nextPaneId: string
): WorkspacePaneLayout {
  const splitResult = splitPaneInNode(layout.root, activePaneId, direction, nextPaneId);
  const root = splitResult.inserted ? splitResult.node : layout.root;

  return normalizePaneLayout(activePaneId, {
    activePaneId: nextPaneId,
    root
  });
}

type RemovePaneResult = {
  removed: boolean;
  node: WorkspacePaneNode | null;
};

function removePaneFromNode(node: WorkspacePaneNode, paneId: string): RemovePaneResult {
  if (node.type === 'leaf') {
    if (node.paneId !== paneId) {
      return { removed: false, node };
    }

    return { removed: true, node: null };
  }

  let removed = false;
  const nextChildren = node.children.flatMap((child) => {
    const result = removePaneFromNode(child, paneId);
    removed = removed || result.removed;
    return result.node ? [result.node] : [];
  });

  if (!removed) {
    return { removed: false, node };
  }

  if (nextChildren.length === 0) {
    return { removed: true, node: null };
  }

  if (nextChildren.length === 1) {
    return { removed: true, node: nextChildren[0] };
  }

  return {
    removed: true,
    node: {
      type: 'split',
      direction: node.direction,
      children: nextChildren
    }
  };
}

export function removePaneFromLayout(
  layout: WorkspacePaneLayout,
  paneId: string
): WorkspacePaneLayout | null {
  const result = removePaneFromNode(layout.root, paneId);
  if (!result.removed || !result.node) {
    return layout;
  }

  const nextPaneIds = collectPaneIds(result.node);
  if (nextPaneIds.length === 0) {
    return null;
  }

  return normalizePaneLayout(nextPaneIds[0], {
    activePaneId: layout.activePaneId === paneId ? nextPaneIds[0] : layout.activePaneId,
    root: result.node
  });
}

export function buildPaneId(tabId: string, existingPaneIds: Iterable<string>) {
  const prefix = `${tabId}-pane-`;
  const indexes = Array.from(existingPaneIds)
    .map((paneId) => {
      const match = paneId.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? Number(match[1]) : 0;
    })
    .filter((index) => Number.isFinite(index));

  const nextIndex = Math.max(1, ...indexes.map((index) => index + 1));
  return `${prefix}${String(nextIndex).padStart(2, '0')}`;
}

export function findTabIdForPane(
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout>,
  paneId: string
) {
  return Object.entries(paneLayoutsByTabId).find(([, layout]) => (
    collectPaneIdsFromLayout(layout).includes(paneId)
  ))?.[0] ?? null;
}

export function buildWorkspaceComparableSnapshot(
  tabs: WorkspaceChromeTab[],
  selectedTabId: string,
  launcherTabId: string | null,
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout>,
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
    paneLayoutsByTabId,
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
  const paneLayoutsByTabId = normalizePaneLayoutsByTabId(restoredTabs, workspace.paneLayoutsByTabId);

  return buildWorkspaceComparableSnapshot(
    restoredTabs,
    workspace.selectedTabId && restoredTabs.some((tab) => tab.id === workspace.selectedTabId)
      ? workspace.selectedTabId
      : restoredTabs[0]?.id ?? defaultWorkspaceChromeTabId,
    workspace.launcherTabId ?? restoredTabs.find((tab) => tab.kind === 'terminal')?.id ?? null,
    paneLayoutsByTabId,
    mergeTerminalSessions(
      restoredTabs,
      paneLayoutsByTabId,
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
