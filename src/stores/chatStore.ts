import { create } from 'zustand';
import type { ChatMessage, ChatAttachment } from '../types/chat';
import type { ComposerMode } from '../types/ui';

export interface ChatState {
  activeConversationId: string | null;
  activeRunId: string | null;
  query: string;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  modeLock: ComposerMode | null;
  autodetectedShellLatch: boolean;

  // Actions
  setActiveConversationId: (conversationId: string | null) => void;
  setActiveRunId: (runId: string | null) => void;
  setQuery: (query: string) => void;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setAttachments: (attachments: ChatAttachment[]) => void;
  setModeLock: (mode: ComposerMode | null) => void;
  setAutodetectedShellLatch: (latch: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (messageId: string, updater: (message: ChatMessage) => ChatMessage) => void;
  appendToMessage: (messageId: string, text: string) => boolean;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  activeRunId: null,
  query: '',
  messages: [],
  attachments: [],
  modeLock: null,
  autodetectedShellLatch: false,

  setActiveConversationId: (conversationId) => set({ activeConversationId: conversationId }),
  setActiveRunId: (runId) => set({ activeRunId: runId }),

  setQuery: (query) => set({ query }),

  setMessages: (messages) => set((state) => ({
    messages: typeof messages === 'function' ? messages(state.messages) : messages
  })),

  setAttachments: (attachments) => set({ attachments }),

  setModeLock: (mode) => set({ modeLock: mode }),

  setAutodetectedShellLatch: (latch) => set({ autodetectedShellLatch: latch }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),

  updateMessage: (messageId, updater) => set((state) => ({
    messages: state.messages.map((message) => (
      message.id === messageId ? updater(message) : message
    ))
  })),

  appendToMessage: (messageId, text) => {
    let didAppend = false;

    set((state) => ({
      messages: state.messages.map((message) => {
        if (message.id !== messageId) return message;

        didAppend = true;
        return {
          ...message,
          body: `${message.body}${text}`
        };
      })
    }));

    return didAppend;
  },

  clearMessages: () => set({ activeConversationId: null, messages: [] })
}));
