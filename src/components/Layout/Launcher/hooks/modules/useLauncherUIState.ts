
import { useMemo } from 'react';
import { buildConversationBranchLabel } from '../../utils';
import type { LauncherProps } from '../types';

export function useLauncherUIState({
  store, tray, props, runtime
}: {
  store: any;
  tray: any;
  props: LauncherProps;
  runtime: any;
}) {
  const { 
    modelSelection, 
    memoryStore, 
    chat, 
    agentTerminal, 
    terminal, 
    activeTimelineError,
    resolvedPendingApproval
  } = runtime;

  const chatMode = props.chatMode || 'auto';
  const memoryConversations = memoryStore.conversations;
  const isTerminalSurface = store.composerSurface === 'terminal';
  const activeMessages = isTerminalSurface ? [] : chat.messages;
  const activeTimelineBlocks = isTerminalSurface ? terminal.blocks : agentTerminal.blocks;

  const visibleModels = useMemo(() => {
    if (store.modelTab !== 'saved') {
      return modelSelection.models;
    }

    const savedModels = modelSelection.models.filter((model: any) => model.id === modelSelection.selectedModelId);
    return savedModels.length > 0 ? savedModels : modelSelection.models;
  }, [modelSelection.models, modelSelection.selectedModelId, store.modelTab]);

  const visibleTrayConversations = useMemo(() => {
    const normalizedQuery = store.conversationSearchQuery.trim().toLowerCase();
    const filteredConversations = normalizedQuery.length === 0
      ? memoryConversations
      : memoryConversations.filter((conversation: any) => (
        conversation.title.toLowerCase().includes(normalizedQuery)
        || buildConversationBranchLabel(conversation).toLowerCase().includes(normalizedQuery)
      ));

    return filteredConversations.map((conversation: any) => ({
      id: conversation.id,
      title: conversation.title,
      branchLabel: buildConversationBranchLabel(conversation),
      timeLabel: conversation.timeLabel
    }));
  }, [store.conversationSearchQuery, memoryConversations]);

  const isTraySuppressed = Boolean(resolvedPendingApproval);
  const hasChatContent = activeMessages.length > 0 || activeTimelineBlocks.length > 0 || Boolean(activeTimelineError) || isTraySuppressed;
  const isChatOpen = chatMode === 'always-open' ? true : hasChatContent;
  const isChatVisible = chatMode === 'always-open' ? true : hasChatContent && (!tray.isTrayOpen || isTraySuppressed);
  const isExpanded = chatMode === 'always-open' ? true : (tray.isTrayOpen && !isTraySuppressed) || hasChatContent;

  const launcherRootClassName = props.variant === 'workspace' ? 'launcher-workspace-root' : 'prototype-root';
  const launcherShellClassName = [
    'launcher-shell',
    props.variant === 'workspace' ? 'workspace-shell' : 'panel-shell',
    isChatVisible ? 'chat-active' : '',
    tray.isTrayOpen && !isTraySuppressed ? 'tray-active' : '',
    isExpanded ? 'expanded' : 'collapsed'
  ].filter(Boolean).join(' ');

  return useMemo(() => ({
    visibleModels,
    visibleTrayConversations,
    isChatOpen,
    isExpanded,
    launcherRootClassName,
    launcherShellClassName
  }), [
    visibleModels,
    visibleTrayConversations,
    isChatOpen,
    isExpanded,
    launcherRootClassName,
    launcherShellClassName
  ]);
}
