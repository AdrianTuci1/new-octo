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
  
  const actions = useChatActions({
    options,
    state,
    onCommandApprovalRef,
    onFileChangeApprovalRef
  });

  useChatEffects({
    options,
    state,
    actions,
    onCommandApprovalRef,
    onFileChangeApprovalRef
  });

  return useMemo(() => ({
    query: state.query,
    setQuery: state.setQuery,
    messages: state.messages,
    submitQuery: actions.submitQuery,
    submitToolResult: actions.submitToolResult,
    clearMessages: state.clearMessages,
    saveCurrentConversation: actions.saveCurrentConversation
  }), [state.clearMessages, state.messages, state.query, actions.saveCurrentConversation, actions.submitQuery, actions.submitToolResult]);
}
