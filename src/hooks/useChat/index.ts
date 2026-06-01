import { useMemo, useRef } from 'react';
import type { UseChatOptions } from './types';
import { useChatState, useChatActions, useChatEffects } from './modules';

export * from './types';
export * from './helpers';
export * from './parsers';

export function useChat(options: UseChatOptions = {}) {
  const state = useChatState();
  const onCommandApprovalRef = useRef(options.onCommandApproval);
  const onFileChangeApprovalRef = useRef(options.onFileChangeApproval);
  const onWebSearchRef = useRef(options.onWebSearch);
  const onWorkspaceExplorationRef = useRef(options.onWorkspaceExploration);
  const onWorkspaceFileReadRef = useRef(options.onWorkspaceFileRead);
  const onCloudAgentLaunchRef = useRef(options.onCloudAgentLaunch);
  
  const actions = useChatActions({
    options,
    state,
    onCommandApprovalRef,
    onFileChangeApprovalRef,
    onWebSearchRef,
    onWorkspaceExplorationRef,
    onWorkspaceFileReadRef,
    onCloudAgentLaunchRef
  });

  useChatEffects({
    options,
    state,
    actions,
    onCommandApprovalRef,
    onFileChangeApprovalRef,
    onWebSearchRef,
    onWorkspaceExplorationRef,
    onWorkspaceFileReadRef,
    onCloudAgentLaunchRef
  });

  return useMemo(() => ({
    query: state.query,
    setQuery: state.setQuery,
    messages: state.messages,
    attachments: state.attachments,
    addAttachments: state.addAttachments,
    removeAttachment: state.removeAttachment,
    clearAttachments: state.clearAttachments,
    submitQuery: actions.submitQuery,
    submitToolResult: actions.submitToolResult,
    attachFiles: actions.attachFiles,
    clearMessages: state.clearMessages,
    saveCurrentConversation: actions.saveCurrentConversation,
    activeRunId: state.activeRunId,
    setActiveRunId: state.setActiveRunId
  }), [
    actions.attachFiles,
    actions.saveCurrentConversation,
    actions.submitQuery,
    actions.submitToolResult,
    state.addAttachments,
    state.attachments,
    state.clearAttachments,
    state.clearMessages,
    state.messages,
    state.query,
    state.removeAttachment,
    state.activeRunId,
    state.setActiveRunId
  ]);
}
