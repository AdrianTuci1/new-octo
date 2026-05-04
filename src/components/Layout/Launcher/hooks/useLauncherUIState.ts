/**
 * `useLauncherUIState` - Computes the UI flags and class names for the Launcher.
 * 
 * Responsibilities:
 * 1. Filter and compute `visibleModels` and `visibleTrayConversations`.
 * 2. Evaluate boolean flags (`isChatOpen`, `isExpanded`, etc.) to control component rendering.
 * 3. Generate dynamic CSS classes for the root and shell containers.
 */
import { useMemo } from 'react';
import { buildConversationBranchLabel } from '../utils';

export function useLauncherUIState({
  store, tray, props, modelSelection, memoryConversations,
  activeMessages, activeTimelineBlocks, activeTimelineError,
  chatMode
}: any) {
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
  const hasChatContent = activeMessages.length > 0 || activeTimelineBlocks.length > 0 || Boolean(activeTimelineError);
  const isChatOpen = chatMode === 'always-open' ? true : hasChatContent;
  const isChatVisible = chatMode === 'always-open' ? true : hasChatContent && !tray.isTrayOpen;
  const isExpanded = chatMode === 'always-open' ? true : tray.isTrayOpen || hasChatContent;
  const launcherRootClassName = props.variant === 'workspace' ? 'launcher-workspace-root' : 'prototype-root';
  const launcherShellClassName = [
    'launcher-shell',
    props.variant === 'workspace' ? 'workspace-shell' : 'panel-shell',
    isChatVisible ? 'chat-active' : '',
    tray.isTrayOpen ? 'tray-active' : '',
    isExpanded ? 'expanded' : 'collapsed'
  ].filter(Boolean).join(' ');
  return {
    visibleModels,
    visibleTrayConversations,
    isChatOpen,
    isExpanded,
    launcherRootClassName,
    launcherShellClassName
  };
}
