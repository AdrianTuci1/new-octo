
/**
 * Module: useLauncherInterface
 * 
 * Dictionary:
 * - terminal: Aggregated data for the terminal surface rendering.
 * - ui: Comprehensive flags and CSS classes for the component layout.
 * - actions: Unified command set for the UI (handlers + shortcuts + runtime actions).
 * - Assembler: This module takes the outputs of all other sub-hooks and shapes them into the standard Launcher interface.
 */
import { getShellToggleShortcutTokens } from '../../../../../lib';
import type { LauncherProps } from '../types';

export function useLauncherInterface(params: {
  props: LauncherProps;
  store: any;
  runtime: any;
  tray: any;
  composer: any;
  ui: any;
  history: any;
  handlers: any;
  shortcuts: any;
  shellRef: any;
  dockRef: any;
  clearTerminalSurface: any;
  launchAgentComposer: any;
  openAppWindow: any;
}) {
  const { props, store, runtime, tray, composer, ui, history, handlers, shortcuts, shellRef, dockRef, clearTerminalSurface, launchAgentComposer, openAppWindow } = params;

  return {
    store,
    chat: runtime.chat,
    tray,
    history,
    terminal: {
      agentTerminal: runtime.agentTerminal,
      terminal: runtime.terminal,
      activeTimelineBlocks: store.composerSurface === 'agent' ? runtime.agentTerminal.blocks : runtime.terminal.blocks,
      activeTimelineError: store.composerSurface === 'agent' ? runtime.agentTerminal.error : runtime.terminal.error,
      shellRef,
      shellSource: composer.shellSource,
      terminalComposerAction: composer.terminalComposerAction,
      shellShortcutTokens: getShellToggleShortcutTokens(),
      clearTerminalSurface,
    },
    ui: {
      ...ui,
      variant: props.variant,
      chatMode: props.chatMode,
      resolvedConversationId: runtime.resolvedConversationId,
      resolvedPendingApproval: runtime.resolvedPendingApproval,
      isTerminalCommandsTrayOpen: store.composerSurface === 'terminal' && tray.isTrayOpen && tray.activeTrayMode === 'commands',
      isTerminalSurface: store.composerSurface === 'terminal',
      workingDirectory: runtime.workingDirectory,
      gitContext: runtime.gitContext,
      runtimeContext: runtime.runtimeContext,
      dockRef,
      modelSelection: runtime.modelSelection,
      activeShellPrediction: composer.activeShellPrediction,
      recommendedAction: composer.recommendedAction,
      activeMessages: store.composerSurface === 'agent' ? runtime.chat.messages : [],
      composerMode: composer.composerMode,
    },
    actions: {
      ...handlers,
      ...shortcuts,
      openAppWindow,
      requestCommandApproval: runtime.requestCommandApproval,
      setResolvedPendingApproval: runtime.setResolvedPendingApproval,
      saveSettings: runtime.memoryStore.saveSettings,
      launchAgentComposer,
    },
  };
}
