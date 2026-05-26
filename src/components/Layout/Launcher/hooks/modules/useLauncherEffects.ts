/**
 * Module: useLauncherEffects
 */
import { useEffect, useRef } from 'react';
import { buildConversationLinkTitle } from '../helpers';
import type { LauncherProps } from '../types';

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

type LauncherEffectContext = {
  store: any;
  props: LauncherProps;
  runtime: any;
  history: any;
  ui: any;
  tray: any;
  refs: any;
  actions: any;
  clearTerminalSurface: () => void;
  initialComposerSurface: 'agent' | 'terminal';
  resetOnMount: boolean;
  persistTerminalSession: boolean;
  initialTerminalSessionId: string | null;
  initialAgentTerminalSessionId: string | null;
  pendingApproval: LauncherProps['pendingApproval'];
  terminalAutoDetectSetting: boolean | undefined;
  didResetOnMountRef: React.MutableRefObject<boolean>;
  didPromptModelSetupRef: React.MutableRefObject<boolean>;
  suppressComposerSurfaceReportRef: React.MutableRefObject<boolean>;
  lastReportedComposerSurfaceRef: React.MutableRefObject<'agent' | 'terminal' | null>;
  lastReportedWorkingDirectoryRef: React.MutableRefObject<string | null>;
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
    clearTerminalSurface
  } = params;
  const {
    initialComposerSurface = 'terminal',
    resetOnMount = false,
    persistTerminalSession = false,
    initialTerminalSessionId = null,
    initialAgentTerminalSessionId = null,
    pendingApproval
  } = props;
  const terminalAutoDetectSetting = runtime.memoryStore.settings?.values.terminalAutoDetectEnabled;

  const didResetOnMountRef = useRef(false);
  const didPromptModelSetupRef = useRef(false);
  const suppressComposerSurfaceReportRef = useRef(false);
  const lastReportedComposerSurfaceRef = useRef<'agent' | 'terminal' | null>(null);
  const lastReportedWorkingDirectoryRef = useRef<string | null>(null);

  const context: LauncherEffectContext = {
    store,
    props,
    runtime,
    history,
    ui,
    tray,
    refs,
    actions,
    clearTerminalSurface,
    initialComposerSurface,
    resetOnMount,
    persistTerminalSession,
    initialTerminalSessionId,
    initialAgentTerminalSessionId,
    pendingApproval,
    terminalAutoDetectSetting,
    didResetOnMountRef,
    didPromptModelSetupRef,
    suppressComposerSurfaceReportRef,
    lastReportedComposerSurfaceRef,
    lastReportedWorkingDirectoryRef
  };

  useHistorySelectionSync(context);
  useVisibleModelSelectionSync(context);
  useInitialComposerSurfaceSync(context);
  usePendingAutoSubmit(context);
  useTerminalAutoDetectSettingSync(context);
  useComposerSurfaceReporter(context);
  useWorkingDirectoryReporter(context);
  useLauncherMountReset(context);
  useModelSetupOnboarding(context);
  useConversationAnchorSync(context);

  return {
    suppressComposerSurfaceReportRef
  };
}

function useHistorySelectionSync({
  history,
  store
}: LauncherEffectContext) {
  useEffect(() => {
    const maxIndex = Math.max(0, history.historyEntries.length - 1);
    if (store.selectedHistoryIndex > maxIndex) {
      store.setSelectedHistoryIndex(maxIndex);
    }
  }, [history.historyEntries.length, store.selectedHistoryIndex, store.setSelectedHistoryIndex]);
}

function useVisibleModelSelectionSync({
  runtime,
  store,
  ui
}: LauncherEffectContext) {
  useEffect(() => {
    const nextIndex = ui.visibleModels.findIndex((model: any) => model.id === runtime.modelSelection.selectedModelId);
    const targetIndex = nextIndex >= 0 ? nextIndex : 0;
    if (store.selectedModelIndex !== targetIndex) {
      store.setSelectedModelIndex(targetIndex);
    }
  }, [runtime.modelSelection.selectedModelId, store.selectedModelIndex, store.setSelectedModelIndex, ui.visibleModels]);
}

function useInitialComposerSurfaceSync({
  initialComposerSurface,
  store,
  suppressComposerSurfaceReportRef
}: LauncherEffectContext) {
  useEffect(() => {
    if (store.composerSurface === initialComposerSurface) {
      return;
    }

    suppressComposerSurfaceReportRef.current = true;
    store.setComposerSurface(initialComposerSurface);
  }, [initialComposerSurface, store.composerSurface, store.setComposerSurface, suppressComposerSurfaceReportRef]);
}

function usePendingAutoSubmit({
  refs,
  runtime,
  store
}: LauncherEffectContext) {
  useEffect(() => {
    const pendingPrompt = refs.pendingAutoSubmitPromptRef.current;
    if (!pendingPrompt || store.composerSurface !== 'agent' || runtime.chat.query.trim() !== pendingPrompt) {
      return;
    }

    refs.pendingAutoSubmitPromptRef.current = null;
    window.requestAnimationFrame(() => {
      void runtime.chat.submitQuery();
    });
  }, [refs.pendingAutoSubmitPromptRef, runtime.chat.query, runtime.chat.submitQuery, store.composerSurface]);
}

function useTerminalAutoDetectSettingSync({
  store,
  terminalAutoDetectSetting
}: LauncherEffectContext) {
  useEffect(() => {
    if (typeof terminalAutoDetectSetting === 'boolean' && store.terminalAutoDetectEnabled !== terminalAutoDetectSetting) {
      store.setTerminalAutoDetectEnabled(terminalAutoDetectSetting);
    }
  }, [store.setTerminalAutoDetectEnabled, store.terminalAutoDetectEnabled, terminalAutoDetectSetting]);
}

function useComposerSurfaceReporter({
  props,
  store,
  suppressComposerSurfaceReportRef,
  lastReportedComposerSurfaceRef
}: LauncherEffectContext) {
  useEffect(() => {
    if (suppressComposerSurfaceReportRef.current) {
      suppressComposerSurfaceReportRef.current = false;
      lastReportedComposerSurfaceRef.current = store.composerSurface;
      return;
    }

    if (lastReportedComposerSurfaceRef.current === store.composerSurface) {
      return;
    }

    lastReportedComposerSurfaceRef.current = store.composerSurface;
    props.onComposerSurfaceChange?.(store.composerSurface);
  }, [lastReportedComposerSurfaceRef, props, store.composerSurface, suppressComposerSurfaceReportRef]);
}

function useWorkingDirectoryReporter({
  props,
  runtime,
  lastReportedWorkingDirectoryRef
}: LauncherEffectContext) {
  useEffect(() => {
    const reportedWorkingDirectory = runtime.activeSurfaceWorkingDirectory ?? runtime.workingDirectory.currentPath;
    if (lastReportedWorkingDirectoryRef.current === reportedWorkingDirectory) {
      return;
    }

    lastReportedWorkingDirectoryRef.current = reportedWorkingDirectory;
    props.onWorkingDirectoryChange?.(reportedWorkingDirectory);
  }, [
    lastReportedWorkingDirectoryRef,
    props,
    runtime.activeSurfaceWorkingDirectory,
    runtime.workingDirectory.currentPath
  ]);
}

function useLauncherMountReset({
  actions,
  clearTerminalSurface,
  didResetOnMountRef,
  initialAgentTerminalSessionId,
  initialComposerSurface,
  initialTerminalSessionId,
  pendingApproval,
  persistTerminalSession,
  resetOnMount,
  runtime,
  store,
  suppressComposerSurfaceReportRef,
  tray
}: LauncherEffectContext) {
  useEffect(() => {
    if (!resetOnMount || didResetOnMountRef.current) {
      return;
    }

    didResetOnMountRef.current = true;
    const shouldClearRuntimeSessions = !persistTerminalSession && !initialTerminalSessionId && !initialAgentTerminalSessionId;

    if (!runtime.resolvedConversationId) {
      runtime.chat.clearMessages();
    }

    runtime.chat.setQuery('');
    tray.closeTray();

    if (shouldClearRuntimeSessions) {
      clearTerminalSurface();
      runtime.agentTerminal.clearBlocks();
    }

    suppressComposerSurfaceReportRef.current = true;
    store.reset(initialComposerSurface);

    if (pendingApproval === undefined) {
      runtime.setResolvedPendingApproval(null);
    }
  }, [
    clearTerminalSurface,
    didResetOnMountRef,
    initialAgentTerminalSessionId,
    initialComposerSurface,
    initialTerminalSessionId,
    pendingApproval,
    persistTerminalSession,
    resetOnMount,
    runtime,
    store,
    suppressComposerSurfaceReportRef,
    tray,
    actions
  ]);
}

function useModelSetupOnboarding({
  actions,
  didPromptModelSetupRef,
  runtime,
  store,
  tray
}: LauncherEffectContext) {
  useEffect(() => {
    if (store.composerSurface !== 'agent' || !runtime.modelSelection.requiresModelSetup || didPromptModelSetupRef.current) {
      return;
    }

    didPromptModelSetupRef.current = true;
    tray.closeTray();
    actions.openModelDrawer();
  }, [actions, didPromptModelSetupRef, runtime.modelSelection.requiresModelSetup, store.composerSurface, tray]);
}

function useConversationAnchorSync({
  refs,
  runtime
}: LauncherEffectContext) {
  useEffect(() => {
    const anchor = refs.pendingConversationAnchorRef.current;
    if (!anchor || runtime.resolvedConversationId !== anchor.conversationId || runtime.chat.messages.length === 0) {
      return;
    }

    refs.seededConversationAnchorTimesRef.current[anchor.conversationId] = anchor.startedAt;
    runtime.terminal.upsertSyntheticBlock({
      id: `conversation-link-${anchor.conversationId}`,
      command: '',
      output: '',
      startedAt: anchor.startedAt,
      finishedAt: anchor.startedAt,
      status: 'finished',
      presentation: 'conversation-link',
      conversationId: anchor.conversationId,
      conversationTitle: buildConversationLinkTitle(
        anchor.conversationId,
        runtime.chat.messages,
        runtime.memoryStore.conversations
      )
    });
    refs.pendingConversationAnchorRef.current = null;
  }, [
    refs.pendingConversationAnchorRef,
    refs.seededConversationAnchorTimesRef,
    runtime.chat.messages,
    runtime.memoryStore.conversations,
    runtime.resolvedConversationId,
    runtime.terminal.upsertSyntheticBlock
  ]);
}
