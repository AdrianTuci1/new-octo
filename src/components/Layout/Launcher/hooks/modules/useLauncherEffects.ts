
/**
 * Module: useLauncherEffects
 */
import { useEffect, useRef } from 'react';
import { buildConversationLinkTitle } from '../helpers';
import type { LauncherProps } from '../types';

function isCommandSearchQuery(value: string) {
  const trimmed = value.trimStart();
  return trimmed.startsWith('/') && !trimmed.includes(' ');
}

export type LauncherEffectsParams = {
  store: any;
  props: LauncherProps;
  runtime: any;
  history: any;
  ui: any;
  tray: any;
  refs: any;
  actions: any;
  clearTerminalSurface: () => void;
};

export function useLauncherEffects(params: LauncherEffectsParams) {
  const {
    store,
    props,
    runtime,
    history,
    ui,
    tray,
    refs,
    actions,
    clearTerminalSurface,
  } = params;

  const {
    initialComposerSurface = 'terminal',
    resetOnMount = false,
    persistTerminalSession = false,
    initialTerminalSessionId = null,
    initialAgentTerminalSessionId = null,
    pendingApproval,
  } = props;

  // Destructure from domains
  const { 
    chat, 
    workingDirectory, 
    activeSurfaceWorkingDirectory,
    agentTerminal, 
    modelSelection, 
    resolvedConversationId, 
    setResolvedPendingApproval,
    memoryStore,
    terminal: runtimeTerminal
  } = runtime;

  const terminalAutoDetectSetting = memoryStore.settings?.values.terminalAutoDetectEnabled;

  const didResetOnMountRef = useRef(false);
  const didPromptModelSetupRef = useRef(false);
  const suppressComposerSurfaceReportRef = useRef(false);
  const lastReportedComposerSurfaceRef = useRef<'agent' | 'terminal' | null>(null);
  const lastReportedWorkingDirectoryRef = useRef<string | null>(null);

  // 1. History Sync
  useEffect(() => {
    const maxIndex = Math.max(0, history.historyEntries.length - 1);
    if (store.selectedHistoryIndex > maxIndex) {
      store.setSelectedHistoryIndex(maxIndex);
    }
  }, [history.historyEntries.length, store.selectedHistoryIndex, store.setSelectedHistoryIndex]);

  // 2. Model Selection Sync
  useEffect(() => {
    const nextIndex = ui.visibleModels.findIndex((model: any) => model.id === modelSelection.selectedModelId);
    const targetIndex = nextIndex >= 0 ? nextIndex : 0;
    if (store.selectedModelIndex !== targetIndex) {
      store.setSelectedModelIndex(targetIndex);
    }
  }, [modelSelection.selectedModelId, ui.visibleModels, store.selectedModelIndex, store.setSelectedModelIndex]);

  // 3. Initial Surface Sync
  useEffect(() => {
    if (store.composerSurface === initialComposerSurface) return;
    suppressComposerSurfaceReportRef.current = true;
    store.setComposerSurface(initialComposerSurface);
  }, [initialComposerSurface]);

  // 4. Auto-Submit Logic
  useEffect(() => {
    const pendingPrompt = refs.pendingAutoSubmitPromptRef.current;
    if (!pendingPrompt || store.composerSurface !== 'agent' || chat.query.trim() !== pendingPrompt) return;
    refs.pendingAutoSubmitPromptRef.current = null;
    window.requestAnimationFrame(() => {
      void chat.submitQuery();
    });
  }, [chat.query, store.composerSurface, chat.submitQuery, refs.pendingAutoSubmitPromptRef]);

  // 5. Memory Settings Sync
  useEffect(() => {
    if (typeof terminalAutoDetectSetting === 'boolean' && store.terminalAutoDetectEnabled !== terminalAutoDetectSetting) {
      store.setTerminalAutoDetectEnabled(terminalAutoDetectSetting);
    }
  }, [terminalAutoDetectSetting, store.terminalAutoDetectEnabled, store.setTerminalAutoDetectEnabled]);

  // 6. Command Tray Sync
  useEffect(() => {
    const shouldShowCommandTray = isCommandSearchQuery(chat.query);

    if (shouldShowCommandTray) {
      if (!tray.isTrayOpen || tray.activeTrayMode !== 'commands') {
        tray.toggleTray('commands');
      }
      return;
    }

    if (tray.isTrayOpen && tray.activeTrayMode === 'commands') {
      tray.closeTray();
    }
  }, [chat.query, tray.activeTrayMode, tray.closeTray, tray.isTrayOpen, tray.toggleTray]);

  // 7. Report Surface Change
  useEffect(() => {
    if (suppressComposerSurfaceReportRef.current) {
      suppressComposerSurfaceReportRef.current = false;
      lastReportedComposerSurfaceRef.current = store.composerSurface;
      return;
    }
    if (lastReportedComposerSurfaceRef.current === store.composerSurface) return;
    lastReportedComposerSurfaceRef.current = store.composerSurface;
    props.onComposerSurfaceChange?.(store.composerSurface);
  }, [props.onComposerSurfaceChange, store.composerSurface]);

  // 8. Report Working Directory Change
  useEffect(() => {
    const reportedWorkingDirectory = activeSurfaceWorkingDirectory ?? workingDirectory.currentPath;
    if (lastReportedWorkingDirectoryRef.current === reportedWorkingDirectory) return;
    lastReportedWorkingDirectoryRef.current = reportedWorkingDirectory;
    props.onWorkingDirectoryChange?.(reportedWorkingDirectory);
  }, [activeSurfaceWorkingDirectory, props.onWorkingDirectoryChange, workingDirectory.currentPath]);

  // 9. Reset On Mount
  useEffect(() => {
    if (!resetOnMount || didResetOnMountRef.current) return;
    didResetOnMountRef.current = true;
    const shouldClearRuntimeSessions = !persistTerminalSession && !initialTerminalSessionId && !initialAgentTerminalSessionId;
    if (!resolvedConversationId) chat.clearMessages();
    chat.setQuery('');
    tray.closeTray();
    if (shouldClearRuntimeSessions) {
      clearTerminalSurface();
      agentTerminal.clearBlocks();
    }
    suppressComposerSurfaceReportRef.current = true;
    store.setComposerSurface(initialComposerSurface);
    const hasControlledPendingApproval = pendingApproval !== undefined;
    if (!hasControlledPendingApproval) setResolvedPendingApproval(null);
    store.setModeLock(null);
    store.setAutodetectedShellLatch(false);
    store.setAllowSingleCharacterCommandPrediction(false);
    store.setTerminalAutoDetectEnabled(true);
    store.setHistoryTab('all');
    store.setSelectedHistoryIndex(0);
    store.setModelTab('all');
    store.setSelectedModelIndex(0);
  }, [resetOnMount]);

  // 10. Model Setup Onboarding
  useEffect(() => {
    if (store.composerSurface !== 'agent' || !runtime.modelSelection.requiresModelSetup || didPromptModelSetupRef.current) {
      return;
    }

    didPromptModelSetupRef.current = true;
    tray.closeTray();
    actions.openModelDrawer();
  }, [actions, runtime.modelSelection.requiresModelSetup, tray]);

  // 11. Anchor Sync
  useEffect(() => {
    const anchor = refs.pendingConversationAnchorRef.current;
    if (!anchor || resolvedConversationId !== anchor.conversationId || chat.messages.length === 0) return;
    refs.seededConversationAnchorTimesRef.current[anchor.conversationId] = anchor.startedAt;
    runtimeTerminal.upsertSyntheticBlock({
      id: `conversation-link-${anchor.conversationId}`, 
      command: '', 
      output: '', 
      startedAt: anchor.startedAt, 
      finishedAt: anchor.startedAt, 
      status: 'finished', 
      presentation: 'conversation-link', 
      conversationId: anchor.conversationId,
      conversationTitle: buildConversationLinkTitle(anchor.conversationId, chat.messages, memoryStore.conversations)
    });
    refs.pendingConversationAnchorRef.current = null;
  }, [memoryStore.conversations, chat.messages, resolvedConversationId, runtimeTerminal.upsertSyntheticBlock, refs.pendingConversationAnchorRef, refs.seededConversationAnchorTimesRef]);

  return {
    suppressComposerSurfaceReportRef,
  };
}
