import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../../../../../stores';
import * as Utils from '../../utils';
import type { LauncherProps } from '../types';

/**
 * Module: useLauncherActions
 * 
 * Dictionary:
 * - clearTerminalSurface: Resets the terminal blocks and anchor states.
 * - launchAgentComposer: High-level action to transition to the agent surface with an optional seed prompt.
 * - openAppWindow: Command to bring up the main application window via Tauri.
 */
export function useLauncherActions({
  store, tray, props, runtime, refs
}: {
  store: any;
  tray: any;
  props: LauncherProps;
  runtime: any;
  refs: any;
}) {
  const setIsModelDrawerOpen = useUIStore((state) => state.setIsModelDrawerOpen);

  const clearTerminalSurface = useCallback(() => {
    refs.pendingConversationAnchorRef.current = null;
    refs.seededConversationAnchorTimesRef.current = {};
    runtime.terminal.clearBlocks();
  }, [runtime.terminal, refs]);

  const launchAgentComposer = useCallback((seedPrompt?: string, autoSubmit = false) => {
    const nextPrompt = seedPrompt?.trim() && seedPrompt.trim() !== '/agent' ? seedPrompt.trim() : '';
    const nextId = props.onNewConversation?.({ seedPrompt: nextPrompt }) || Utils.createConversationId();
    
    refs.pendingConversationAnchorRef.current = { conversationId: nextId, startedAt: new Date().toISOString() };
    refs.pendingAutoSubmitPromptRef.current = autoSubmit && nextPrompt ? nextPrompt : null;
    refs.suppressComposerShellAutodetectRef.current = nextPrompt || null;

    void runtime.chat.saveCurrentConversation?.();
    runtime.agentTerminal.replaceBlocks([]);
    store.setLocalConversationId(nextId);
    if (runtime.hasControlledConversation) props.onConversationChange?.(nextId);
    
    runtime.setResolvedPendingApproval(null);
    store.setModeLock(null);
    tray.closeTray();
    store.setComposerSurface('agent');
    runtime.chat.clearMessages();
    runtime.chat.setQuery(nextPrompt);
  }, [props, runtime, store, tray, refs]);

  const openAppWindow = useCallback(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    void invoke('show_app_window').catch(e => console.warn('[Launcher] fail', e));
  }, []);

  const openModelDrawer = useCallback(() => {
    setIsModelDrawerOpen(true);
  }, [setIsModelDrawerOpen]);

  const closeModelDrawer = useCallback(() => {
    setIsModelDrawerOpen(false);
  }, [setIsModelDrawerOpen]);

  return {
    clearTerminalSurface,
    launchAgentComposer,
    openAppWindow,
    openModelDrawer,
    closeModelDrawer
  };
}
