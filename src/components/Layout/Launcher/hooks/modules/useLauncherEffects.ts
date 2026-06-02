/**
 * Module: useLauncherEffects
 */
import { useEffect, useRef } from 'react';
import { buildConversationLinkTitle } from '../helpers';
import type { LauncherProps } from '../types';
import { shouldAutoApprovePendingApproval } from './approvalAutoApprove';

const REMOTE_CLI_INSTALL_COMMAND = [
  'octomus_dir="$HOME/.octomus/bin"',
  'octomus_url="${OCTOMUS_CLI_URL:-https://get.octomus.dev/linux/octomus-cli}"',
  'octomus_bin="$octomus_dir/octomus-cli"',
  'if [ ! -x "$octomus_bin" ]; then mkdir -p "$octomus_dir"; tmp="$octomus_bin.tmp.$$"; if command -v curl >/dev/null 2>&1; then curl -fsSL "$octomus_url" -o "$tmp" && chmod 0755 "$tmp" && mv "$tmp" "$octomus_bin" || rm -f "$tmp"; elif command -v wget >/dev/null 2>&1; then wget -qO "$tmp" "$octomus_url" && chmod 0755 "$tmp" && mv "$tmp" "$octomus_bin" || rm -f "$tmp"; else echo "Octomus CLI install skipped: curl or wget is required" >&2; fi; fi',
  'export PATH="$octomus_dir:$PATH"',
  'octomus-cli --version'
].join('; ');

export type LauncherEffectsParams = {
  store: any;
  props: LauncherProps;
  runtime: any;
  history: any;
  ui: any;
  tray: any;
  refs: any;
  actions: any;
  handlers: any;
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
  handlers: any;
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
  remoteCliPromptedKeysRef: React.MutableRefObject<Set<string>>;
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
    handlers,
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
  const remoteCliPromptedKeysRef = useRef<Set<string>>(new Set());

  const context: LauncherEffectContext = {
    store,
    props,
    runtime,
    history,
    ui,
    tray,
    refs,
    actions,
    handlers,
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
    lastReportedWorkingDirectoryRef,
    remoteCliPromptedKeysRef
  };

  useHistorySelectionSync(context);
  useVisibleModelSelectionSync(context);
  useInitialComposerSurfaceSync(context);
  usePendingAutoSubmit(context);
  useRemoteCliInstallPrompt(context);
  usePendingApprovalAutoAccept(context);
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
    // Only react to parent-driven changes, not internal store mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialComposerSurface]);
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

function useRemoteCliInstallPrompt({
  remoteCliPromptedKeysRef,
  runtime
}: LauncherEffectContext) {
  useEffect(() => {
    const remoteSession = runtime.activeRemoteSession;
    if (!remoteSession || runtime.resolvedPendingApproval) {
      return;
    }

    const targetKey = remoteSession.profileId
      || [remoteSession.username, remoteSession.host].filter(Boolean).join('@')
      || 'custom-vm';
    const promptKey = `remote-cli-install:${targetKey}`;
    const storageKey = `octomus.remoteCliInstallPrompt.${targetKey}`;

    if (remoteCliPromptedKeysRef.current.has(promptKey)) {
      return;
    }

    try {
      if (window.localStorage.getItem(storageKey) === '1') {
        remoteCliPromptedKeysRef.current.add(promptKey);
        return;
      }
    } catch {
      // localStorage can be unavailable in restricted webviews; session-level de-dupe still applies.
    }

    remoteCliPromptedKeysRef.current.add(promptKey);
    const targetLabel = remoteSession.username
      ? remoteSession.host ? `${remoteSession.username}@${remoteSession.host}` : remoteSession.username
      : remoteSession.host ?? 'this VPS';

    runtime.setResolvedPendingApproval({
      kind: 'remote-cli-install',
      command: REMOTE_CLI_INSTALL_COMMAND,
      username: remoteSession.username,
      host: remoteSession.host,
      provider: remoteSession.provider,
      dismissStorageKey: storageKey,
      reason: `Choose your Octomus experience for ${targetLabel}:`
    });
  }, [
    remoteCliPromptedKeysRef,
    runtime.activeRemoteSession,
    runtime.resolvedPendingApproval,
    runtime.setResolvedPendingApproval
  ]);
}

function usePendingApprovalAutoAccept({
  handlers,
  runtime,
  store
}: LauncherEffectContext) {
  const lastAutoApprovedKeyRef = useRef<string | null>(null);
  const clearAutoApproveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const approval = runtime.resolvedPendingApproval;
    const activeProfile = runtime.activeAgentProfile;
    const shouldAutoApprove = shouldAutoApprovePendingApproval({
      approval,
      activeProfile,
      autoApproveAgentLoop: store.autoApproveAgentLoop
    });

    if (!approval) {
      lastAutoApprovedKeyRef.current = null;
      return;
    }

    const approvalKey = approval.kind === 'file-change'
      ? `file:${approval.toolCallId ?? ''}:${approval.fileDiffs.map((diff: any) => diff.filePath).join('|')}`
      : approval.kind === 'topic-change'
        ? `topic:${approval.reason ?? ''}`
        : approval.kind === 'remote-cli-install'
          ? `remote-cli-install:${approval.username ?? ''}:${approval.host ?? ''}`
          : `command:${approval.toolCallId ?? ''}:${approval.command}`;

    if (!shouldAutoApprove) {
      lastAutoApprovedKeyRef.current = null;
      return;
    }

    if (lastAutoApprovedKeyRef.current === approvalKey) {
      return;
    }

    lastAutoApprovedKeyRef.current = approvalKey;
    window.requestAnimationFrame(() => {
      void handlers.handlePendingApprovalAccept(approval);
    });
  }, [
    handlers.handlePendingApprovalAccept,
    runtime.activeAgentProfile,
    runtime.resolvedPendingApproval,
    store.autoApproveAgentLoop
  ]);

  useEffect(() => {
    if (!store.autoApproveAgentLoop) {
      if (clearAutoApproveTimeoutRef.current !== null) {
        window.clearTimeout(clearAutoApproveTimeoutRef.current);
        clearAutoApproveTimeoutRef.current = null;
      }
      return;
    }

    const hasStreamingAssistant = runtime.chat.messages.some((message: any) => (
      message.role === 'assistant' && message.isStreaming
    ));
    const hasNonTerminalAssistant = runtime.chat.messages.some((message: any) => (
      message.role === 'assistant'
      && ['queued', 'running'].includes(message.status ?? '')
    ));
    if (runtime.resolvedPendingApproval || hasStreamingAssistant || hasNonTerminalAssistant) {
      if (clearAutoApproveTimeoutRef.current !== null) {
        window.clearTimeout(clearAutoApproveTimeoutRef.current);
        clearAutoApproveTimeoutRef.current = null;
      }
      return;
    }

    if (clearAutoApproveTimeoutRef.current !== null) {
      return;
    }

    clearAutoApproveTimeoutRef.current = window.setTimeout(() => {
      clearAutoApproveTimeoutRef.current = null;
      store.setAutoApproveAgentLoop(false);
    }, 1500);

    return () => {
      if (clearAutoApproveTimeoutRef.current !== null) {
        window.clearTimeout(clearAutoApproveTimeoutRef.current);
        clearAutoApproveTimeoutRef.current = null;
      }
    };
  }, [
    runtime.chat.messages,
    runtime.resolvedPendingApproval,
    store.autoApproveAgentLoop,
    store.setAutoApproveAgentLoop
  ]);
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
