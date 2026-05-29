import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, Window } from '@tauri-apps/api/window';
import { useEffect, type MutableRefObject } from 'react';
import type { WorkspaceChromeTab, WorkspaceConversation, WorkspacePaneLayout } from '../../chrome';
import type { TerminalSessionState } from '../../utils';
import * as Utils from '../../utils';
import { OPEN_CLOUD_PROFILE_DRAWER_EVENT, type OpenCloudProfileDrawerPayload } from './helpers';
import type { AppWindowStoreApi } from './store';
import type { ComparableSnapshot } from './types';

type UseAppWindowEffectsParams = {
  store: AppWindowStoreApi;
  memoryStatus: string;
  memoryWorkspace: any;
  pathContextHomeDir: string | null | undefined;
  defaultWorkingDirectory: string | null;
  tabs: WorkspaceChromeTab[];
  selectedTabId: string;
  launcherTabId: string | null;
  paneLayoutsByTabId: Record<string, WorkspacePaneLayout>;
  terminalSessions: Record<string, TerminalSessionState>;
  activeSectionId: string;
  expandedGroupIds: string[];
  isSidebarOpen: boolean;
  isAgentsActive: boolean;
  nextTerminalIndex: number;
  workspaceConversations: WorkspaceConversation[];
  openConversationIdSet: Set<string>;
  dedupedOrderedConversationIds: string[];
  memoryConversationsById: Map<string, { messageCount?: number }>;
  saveWorkspace: (snapshot: any) => Promise<unknown> | unknown;
  onOpenSettingsSection: (sectionId?: string) => void;
  onSelectConversation: (conversationId: string) => void;
  setIsCloudProfileDrawerOpen: (open: boolean) => void;
  setSelectedCloudProfileIdForEdit: (id: string | null) => void;
  didRestoreWorkspaceRef: MutableRefObject<boolean>;
  isClosingWorkspaceRef: MutableRefObject<boolean>;
  latestLocalWorkspaceComparableRef: MutableRefObject<ComparableSnapshot | null>;
  lastSavedWorkspaceSignatureRef: MutableRefObject<string | null>;
};

export function useAppWindowEffects(params: UseAppWindowEffectsParams) {
  useOpenConversationBaselineSync(params);
  useComparableSnapshotRefSync(params);
  usePathContextSync(params);
  useSpotlightVisibilitySync(params);
  useWorkspaceRestoreSync(params);
  usePaneLayoutNormalizationSync(params);
  useWorkspaceAutosaveSync(params);
  useCloudProfileDrawerListener(params);
  useSelectConversationListener(params);
}

function useOpenConversationBaselineSync({
  dedupedOrderedConversationIds,
  memoryConversationsById,
  store
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    const openConversationIdSet = new Set(dedupedOrderedConversationIds);

    store.getState().setOpenPastConversationBaselineById((current) => {
      let changed = false;
      let next = current;

      Object.entries(current).forEach(([conversationId, baselineMessageCount]) => {
        const summary = memoryConversationsById.get(conversationId);
        const currentMessageCount = summary?.messageCount ?? baselineMessageCount;
        const shouldRemove = !openConversationIdSet.has(conversationId) || currentMessageCount > baselineMessageCount;

        if (!shouldRemove) {
          return;
        }

        if (!changed) {
          next = { ...current };
          changed = true;
        }

        delete next[conversationId];
      });

      return changed ? next : current;
    });
  }, [dedupedOrderedConversationIds, memoryConversationsById, store]);
}

function useComparableSnapshotRefSync({
  activeSectionId,
  expandedGroupIds,
  isAgentsActive,
  isSidebarOpen,
  launcherTabId,
  latestLocalWorkspaceComparableRef,
  nextTerminalIndex,
  paneLayoutsByTabId,
  selectedTabId,
  tabs,
  terminalSessions
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    latestLocalWorkspaceComparableRef.current = Utils.buildWorkspaceComparableSnapshot(
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
    );
  }, [
    activeSectionId,
    expandedGroupIds,
    isAgentsActive,
    isSidebarOpen,
    launcherTabId,
    latestLocalWorkspaceComparableRef,
    nextTerminalIndex,
    paneLayoutsByTabId,
    selectedTabId,
    tabs,
    terminalSessions
  ]);
}

function usePathContextSync({
  store
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    void invoke('terminal_get_path_context')
      .then((context: any) => {
        store.getState().setPathContext(context);
        store.getState().setTerminalSessions((current) => Object.fromEntries(
          Object.entries(current).map(([paneId, session]) => [
            paneId,
            {
              ...session,
              workingDirectory: session.workingDirectory ?? context.homeDir ?? context.currentDir
            } satisfies TerminalSessionState
          ])
        ));
      })
      .catch((error) => {
        console.warn('[AppWindow] failed to load path context', error);
      });
  }, [store]);
}

function useSpotlightVisibilitySync({
  store
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    let cancelled = false;
    let intervalId = 0;

    const syncSpotlightVisibility = async () => {
      const spotlightWindow = await Window.getByLabel('main').catch(() => null);
      const visible = await spotlightWindow?.isVisible().catch(() => false) ?? false;
      if (!cancelled) {
        store.getState().setIsSpotlightVisible(visible);
      }
    };

    void syncSpotlightVisibility();
    intervalId = window.setInterval(() => {
      void syncSpotlightVisibility();
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [store]);
}

function useWorkspaceRestoreSync({
  didRestoreWorkspaceRef,
  lastSavedWorkspaceSignatureRef,
  latestLocalWorkspaceComparableRef,
  memoryStatus,
  memoryWorkspace,
  pathContextHomeDir,
  store
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    if (memoryStatus !== 'ready' || !memoryWorkspace) {
      return;
    }

    const nextComparable = Utils.buildComparableFromWorkspace(memoryWorkspace, pathContextHomeDir ?? null);
    const currentComparable = latestLocalWorkspaceComparableRef.current;
    const nextSignature = JSON.stringify(nextComparable);

    if (didRestoreWorkspaceRef.current && currentComparable && JSON.stringify(currentComparable) === nextSignature) {
      return;
    }

    didRestoreWorkspaceRef.current = true;
    lastSavedWorkspaceSignatureRef.current = nextSignature;
    const state = store.getState();
    state.setTabs(nextComparable.tabs);
    state.setSelectedTabId(nextComparable.selectedTabId);
    state.setLauncherTabId(nextComparable.launcherTabId);
    state.setPaneLayoutsByTabId(nextComparable.paneLayoutsByTabId);
    state.setActiveSectionId(nextComparable.activeSectionId);
    state.setExpandedGroupIds(nextComparable.expandedGroupIds);
    state.setIsSidebarOpen(nextComparable.isSidebarOpen);
    state.setIsAgentsActive(nextComparable.isAgentsActive);
    state.setNextTerminalIndex(nextComparable.nextTerminalIndex);
    state.setTerminalSessions(nextComparable.terminalSessions);
    state.setPaneSessionBindingsByPaneId(
      Utils.buildPaneSessionBindings(nextComparable.tabs, nextComparable.paneLayoutsByTabId)
    );
  }, [
    didRestoreWorkspaceRef,
    lastSavedWorkspaceSignatureRef,
    latestLocalWorkspaceComparableRef,
    memoryStatus,
    memoryWorkspace,
    pathContextHomeDir,
    store
  ]);
}

function usePaneLayoutNormalizationSync({
  defaultWorkingDirectory,
  paneLayoutsByTabId,
  store,
  tabs
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    const normalizedPaneLayouts = Utils.normalizePaneLayoutsByTabId(tabs, paneLayoutsByTabId);
    const normalizedPaneIds = new Set(
      Object.values(normalizedPaneLayouts).flatMap((layout) => Utils.collectPaneIdsFromLayout(layout))
    );

    if (JSON.stringify(normalizedPaneLayouts) !== JSON.stringify(paneLayoutsByTabId)) {
      store.getState().setPaneLayoutsByTabId(normalizedPaneLayouts);
      return;
    }

    store.getState().setTerminalSessions((current) => {
      const nextSessions = Object.fromEntries(
        Object.entries(current).filter(([paneId]) => normalizedPaneIds.has(paneId))
      ) as Record<string, TerminalSessionState>;

      let changed = Object.keys(nextSessions).length !== Object.keys(current).length;

      normalizedPaneIds.forEach((paneId) => {
        if (nextSessions[paneId]) {
          return;
        }

        nextSessions[paneId] = Utils.createEmptyTerminalSession(defaultWorkingDirectory);
        changed = true;
      });

      return changed ? nextSessions : current;
    });

    store.getState().setPaneSessionBindingsByPaneId((current) => {
      const nextBindings = Object.fromEntries(
        Array.from(normalizedPaneIds).map((paneId) => [paneId, current[paneId] ?? paneId])
      ) as Utils.WorkspacePaneSessionBindings;

      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(nextBindings);
      if (currentKeys.length === nextKeys.length && nextKeys.every((key) => current[key] === nextBindings[key])) {
        return current;
      }

      return nextBindings;
    });
  }, [defaultWorkingDirectory, paneLayoutsByTabId, store, tabs]);
}

function useWorkspaceAutosaveSync({
  memoryStatus,
  didRestoreWorkspaceRef,
  isClosingWorkspaceRef,
  latestLocalWorkspaceComparableRef,
  lastSavedWorkspaceSignatureRef,
  saveWorkspace,
  tabs,
  selectedTabId,
  launcherTabId,
  paneLayoutsByTabId,
  workspaceConversations,
  openConversationIdSet,
  terminalSessions,
  activeSectionId,
  expandedGroupIds,
  isSidebarOpen,
  isAgentsActive,
  nextTerminalIndex
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    if (memoryStatus !== 'ready' || !didRestoreWorkspaceRef.current || isClosingWorkspaceRef.current) {
      return;
    }

    const comparable = latestLocalWorkspaceComparableRef.current;
    if (!comparable) {
      return;
    }

    const comparableSignature = JSON.stringify(comparable);
    if (lastSavedWorkspaceSignatureRef.current === comparableSignature) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastSavedWorkspaceSignatureRef.current = comparableSignature;
      void saveWorkspace({
        id: 'workspace-main',
        schemaVersion: 1,
        tabs,
        selectedTabId,
        launcherTabId,
        paneLayoutsByTabId,
        conversations: workspaceConversations.filter((conversation) => openConversationIdSet.has(conversation.id)),
        terminalSessions,
        activeSectionId,
        expandedGroupIds,
        isSidebarOpen,
        isAgentsActive,
        nextTerminalIndex,
        nextConversationIndex: 1,
        updatedAt: new Date().toISOString()
      });
    }, 75);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeSectionId,
    didRestoreWorkspaceRef,
    expandedGroupIds,
    isAgentsActive,
    isClosingWorkspaceRef,
    isSidebarOpen,
    lastSavedWorkspaceSignatureRef,
    latestLocalWorkspaceComparableRef,
    launcherTabId,
    memoryStatus,
    nextTerminalIndex,
    openConversationIdSet,
    paneLayoutsByTabId,
    saveWorkspace,
    selectedTabId,
    tabs,
    terminalSessions,
    workspaceConversations
  ]);
}

function useCloudProfileDrawerListener({
  onOpenSettingsSection,
  setIsCloudProfileDrawerOpen,
  setSelectedCloudProfileIdForEdit
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    let cancelled = false;
    let unlistenPromise: Promise<(() => void) | void> | null = null;

    const applyCloudProfileDrawerRequest = (payload: OpenCloudProfileDrawerPayload | null | undefined) => {
      if (!payload?.profileId) {
        return;
      }

      onOpenSettingsSection(payload.sectionId || 'cloud-platform/cloud');
      setSelectedCloudProfileIdForEdit(payload.profileId);
      setIsCloudProfileDrawerOpen(true);
    };

    const setupListener = async () => {
      const currentWindow = getCurrentWindow();
      if (currentWindow.label !== 'settings') {
        return;
      }

      const pendingPayload = await invoke<OpenCloudProfileDrawerPayload | null>('consume_pending_cloud_profile_drawer_request');
      if (!cancelled) {
        applyCloudProfileDrawerRequest(pendingPayload);
      }

      unlistenPromise = listen<OpenCloudProfileDrawerPayload>(OPEN_CLOUD_PROFILE_DRAWER_EVENT, (event) => {
        if (!cancelled) {
          applyCloudProfileDrawerRequest(event.payload);
        }
      });
    };

    void setupListener().catch((error) => {
      console.warn('[AppWindow] failed to subscribe to cloud profile drawer event', error);
    });

    return () => {
      cancelled = true;
      void unlistenPromise?.then((unlisten) => unlisten?.());
    };
  }, [onOpenSettingsSection, setIsCloudProfileDrawerOpen, setSelectedCloudProfileIdForEdit]);
}

function useSelectConversationListener({
  onSelectConversation
}: UseAppWindowEffectsParams) {
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    let cancelled = false;
    let unlistenPromise: Promise<(() => void) | void> | null = null;

    const setupListener = async () => {
      unlistenPromise = listen<{ conversationId: string }>('octomus:select-conversation', (event) => {
        if (!cancelled && event.payload?.conversationId) {
          onSelectConversation(event.payload.conversationId);
        }
      });
    };

    void setupListener().catch((error) => {
      console.warn('[AppWindow] failed to subscribe to select conversation event', error);
    });

    return () => {
      cancelled = true;
      void unlistenPromise?.then((unlisten) => unlisten?.());
    };
  }, [onSelectConversation]);
}
