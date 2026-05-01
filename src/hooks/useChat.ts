import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import type { ChatMessage } from '../types/chat';

type UseChatOptions = {
  onCommandApproval?: (command: string) => void;
  onNewChat?: () => void;
};

function inferCommandRequest(query: string) {
  const normalized = query.toLowerCase();

  if (normalized.includes('git')) {
    return {
      command: 'git status --short',
      response: 'Pot verifica starea repository-ului local. Am pregătit comanda în composer ca să o aprobi înainte să ruleze.'
    };
  }

  if (normalized.includes('eroare') || normalized.includes('error') || normalized.includes('fail')) {
    return {
      command: 'ls /tmp/octomus-this-path-should-not-exist',
      response: 'Pot rula o comandă care ar trebui să eșueze, ca să verificăm cardul de eroare în ChatPanel.'
    };
  }

  if (normalized.includes('file') || normalized.includes('fișier') || normalized.includes('fisier')) {
    return {
      command: 'rg --files',
      response: 'Pot căuta rapid prin fișierele proiectului. Am pus comanda în composer pentru confirmare.'
    };
  }

  return null;
}

export function useChat(options: UseChatOptions = {}) {
  const { query, setQuery, messages, setMessages, addMessage, clearMessages } = useChatStore();
  const { setTrayMode } = useUIStore();

  const submitQuery = () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (trimmed === '/new') {
      clearMessages();
      setQuery('');
      setTrayMode('closed');
      options.onNewChat?.();
      return;
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      title: 'User',
      body: trimmed,
      createdAt: new Date().toISOString()
    };

    addMessage(userMsg);
    setQuery('');
    setTrayMode('closed');

    const commandRequest = inferCommandRequest(trimmed);

    // Simulate assistant response/tool request. Commands are approved in the composer, not rendered as chat code blocks.
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        title: 'Assistant',
        body: commandRequest?.response ?? 'I can help with that. If I need to run a command, I will ask for approval in the composer before touching the terminal.',
        createdAt: new Date().toISOString()
      };
      addMessage(assistantMsg);
      if (commandRequest) {
        options.onCommandApproval?.(commandRequest.command);
      }
    }, 800);
  };

  return {
    query,
    setQuery,
    messages,
    submitQuery,
    clearMessages
  };
}
