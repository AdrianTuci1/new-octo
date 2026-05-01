import { create } from 'zustand';
import type { ChatMessage } from '../types/chat';

interface ChatState {
  query: string;
  messages: ChatMessage[];
  
  // Actions
  setQuery: (query: string) => void;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  query: '',
  messages: [],

  setQuery: (query) => set({ query }),
  
  setMessages: (messages) => set((state) => ({
    messages: typeof messages === 'function' ? messages(state.messages) : messages
  })),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),

  clearMessages: () => set({ messages: [] })
}));
