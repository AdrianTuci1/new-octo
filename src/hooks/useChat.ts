import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useMemoryStore } from '../stores/memoryStore';
import type {
  AgentDoneEvent,
  AgentErrorEvent,
  AgentInputMessage,
  AgentStartResponse,
  AgentStatusEvent,
  AgentTokenEvent,
  AgentToolCallEvent,
  ChatMessage
} from '../types/chat';
import type { CommandApproval, TerminalCommandBlock } from '../types/terminal';

type UseChatOptions = {
  onCommandApproval?: (approval: CommandApproval) => void;
  onNewChat?: () => void;
  onConversationCreated?: (conversationId: string) => void;
  cwd?: string | null;
  modelId?: string | null;
  conversationId?: string | null;
  terminalBlocks?: TerminalCommandBlock[];
  onCloseTray?: () => void;
};

type AssistantMessageRegistration = {
  owner: symbol;
  append: (text: string) => boolean;
  update: (updater: (message: ChatMessage) => ChatMessage) => boolean;
  onCommandApproval?: (approval: CommandApproval) => void;
};

let agentBridgeReady: Promise<void> | null = null;
const pendingTokenText: Record<string, string> = {};
const assistantMessageRegistry = new Map<string, Map<symbol, AssistantMessageRegistration>>();

function assistantRegistrations(assistantMessageId: string) {
  return Array.from(assistantMessageRegistry.get(assistantMessageId)?.values() ?? []);
}

function setAssistantRegistration(assistantMessageId: string, registration: AssistantMessageRegistration) {
  const existingRegistrations = assistantMessageRegistry.get(assistantMessageId);
  if (existingRegistrations) {
    existingRegistrations.set(registration.owner, registration);
    return;
  }

  assistantMessageRegistry.set(assistantMessageId, new Map([[registration.owner, registration]]));
}

function deleteOwnerRegistrations(owner: symbol) {
  for (const [assistantMessageId, registrations] of assistantMessageRegistry.entries()) {
    registrations.delete(owner);
    if (registrations.size === 0) {
      assistantMessageRegistry.delete(assistantMessageId);
    }
  }
}

function buildApprovalReason(command?: string, suggestedReason?: string) {
  if (suggestedReason?.trim()) return suggestedReason.trim();
  if (!command?.trim()) {
    return 'Am cerut accesul pentru a rula o comandă în terminal și a verifica rezultatul.';
  }

  const normalized = command.trim().toLowerCase();
  if (normalized.startsWith('git status')) {
    return 'Am cerut accesul pentru verificarea statusului repository-ului.';
  }

  return 'Am cerut accesul pentru a rula o comandă în terminal și a verifica rezultatul.';
}

function buildToolResultFollowupPrompt(command?: string) {
  const commandLine = command
    ? `Comanda aprobată și executată a fost: \`${command}\`. `
    : '';

  return `${commandLine}Utilizatorul vede deja output-ul brut în blocul de terminal. Răspunde în română, pe scurt, astfel:
1. Confirmă că ai verificat rezultatul.
2. Rezumă ce ai observat fără să repeți output-ul brut.
3. Oferă ajutor suplimentar doar condițional, fără să presupui că utilizatorul vrea stage, commit sau alte modificări.`;
}

function ensureAgentEventBridge(): Promise<void> {
  if (!(window as any).__TAURI_INTERNALS__) {
    console.warn('[useChat] Tauri internals not found, bridge initialization deferred.');
    return Promise.resolve();
  }

  if (agentBridgeReady) return agentBridgeReady;

  console.warn('[useChat] Initializing Agent Event Bridge...');

  agentBridgeReady = Promise.all([
    listen<AgentTokenEvent>('agent:token', (event) => {
      const { assistantMessageId, text } = event.payload;
      const registrations = assistantRegistrations(assistantMessageId);
      let appended = false;
      registrations.forEach((registration) => {
        appended = registration.append(text) || appended;
      });

      if (!appended) {
        pendingTokenText[assistantMessageId] = `${pendingTokenText[assistantMessageId] ?? ''}${text}`;
      }
    }),

    listen<AgentToolCallEvent>('agent:tool_call', (event) => {
      const { assistantMessageId, toolCall } = event.payload;
      const registrations = assistantRegistrations(assistantMessageId);

      if (!toolCall || registrations.length === 0) return;

      registrations.forEach((registration) => {
        registration.update((message) => ({
          ...message,
          toolCalls: [...(message.toolCalls || []), {
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.args)
            }
          }]
        }));
      });

      if (toolCall.name === 'propose_terminal_command') {
        const command = toolCall.args.command;
        const reason = buildApprovalReason(command, toolCall.args.reason);

        registrations.forEach((registration) => {
          registration.update((message) => ({
            ...message,
            body: message.body.trim().length > 0 ? message.body : reason
          }));

          if (command && registration.onCommandApproval) {
            registration.onCommandApproval({
              command,
              toolCallId: toolCall.id,
              reason
            });
          }
        });
      }
    }),

    listen<AgentStatusEvent>('agent:status', (event) => {
      const { assistantMessageId, status } = event.payload;
      assistantRegistrations(assistantMessageId).forEach((registration) => {
        registration.update((message) => ({
          ...message,
          status,
          isStreaming: !['completed', 'cancelled', 'failed'].includes(status)
        }));
      });
    }),

    listen<AgentDoneEvent>('agent:done', (event) => {
      const { assistantMessageId, status, usage } = event.payload;
      assistantRegistrations(assistantMessageId).forEach((registration) => {
        registration.update((message) => ({
          ...message,
          status,
          usage,
          isStreaming: false
        }));
      });
    }),

    listen<AgentErrorEvent>('agent:error', (event) => {
      const { assistantMessageId, error } = event.payload;
      assistantRegistrations(assistantMessageId).forEach((registration) => {
        registration.update((message) => ({
          ...message,
          body: message.body ? `${message.body}\n\n${error}` : error,
          status: 'failed',
          isError: true,
          isStreaming: false
        }));
      });
    })
  ]).then(() => {
    console.warn('[useChat] Agent Event Bridge is READY and listening.');
  });

  return agentBridgeReady;
}

function chatHistoryFromMessages(messages: ChatMessage[]): AgentInputMessage[] {
  return messages
    .filter((message) => {
      if (message.isError) return false;
      if (message.body.trim().length > 0) return true;
      if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) return true;
      if (message.role === 'tool') return true;
      return false;
    })
    .map((message) => ({
      role: message.role,
      content: message.body,
      toolCallId: message.toolCallId,
      toolCalls: message.toolCalls
    }));
}

function cleanTitleText(value: string) {
  return value
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromMessages(messages: ChatMessage[]) {
  const firstAssistant = messages.find((message) => (
    message.role === 'assistant'
    && !message.isError
    && message.body.trim().length > 0
  ));
  const firstUser = messages.find((message) => message.role === 'user' && message.body.trim().length > 0);
  const source = cleanTitleText(firstAssistant?.body ?? firstUser?.body ?? '');
  if (!source) return 'New agent conversation';

  const sentence = source.split(/(?<=[.!?])\s+/)[0] ?? source;
  return sentence.length > 80 ? `${sentence.slice(0, 77)}...` : sentence;
}

function titleFromConversationContent(messages: ChatMessage[], terminalBlocks: TerminalCommandBlock[]) {
  const messageTitle = titleFromMessages(messages);
  if (messageTitle !== 'New agent conversation') {
    return messageTitle;
  }

  const firstCommand = terminalBlocks.find((block) => block.command.trim().length > 0)?.command.trim();
  if (!firstCommand) {
    return messageTitle;
  }

  const cleanedCommand = cleanTitleText(firstCommand);
  return cleanedCommand.length > 80 ? `${cleanedCommand.slice(0, 77)}...` : cleanedCommand;
}

function sameMessages(left: ChatMessage[], right: ChatMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const candidate = right[index];
    return candidate
      && candidate.id === message.id
      && candidate.role === message.role
      && candidate.body === message.body
      && candidate.runId === message.runId
      && candidate.status === message.status
      && candidate.isStreaming === message.isStreaming
      && candidate.isError === message.isError
      && candidate.toolCallId === message.toolCallId
      && JSON.stringify(candidate.toolCalls ?? []) === JSON.stringify(message.toolCalls ?? [])
      && JSON.stringify(candidate.usage ?? null) === JSON.stringify(message.usage ?? null);
  });
}

function statusFromMessages(messages: ChatMessage[]) {
  if (messages.some((message) => message.isError)) {
    return 'error';
  }

  if (messages.some((message) => message.isStreaming)) {
    return 'inProgress';
  }

  return 'success';
}

function statusFromConversationContent(messages: ChatMessage[], terminalBlocks: TerminalCommandBlock[]) {
  const messageStatus = statusFromMessages(messages);
  if (messageStatus !== 'success') {
    return messageStatus;
  }

  return terminalBlocks.some((block) => block.status === 'running') ? 'inProgress' : messageStatus;
}

export function useChat(options: UseChatOptions = {}) {
  const hydratedConversationRef = useRef<string | null>(null);
  const instanceIdRef = useRef(Symbol('useChatInstance'));
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const conversationRecords = useMemoryStore((state) => state.conversationRecords);

  const setMessages = useCallback((nextMessages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesState((currentMessages) => {
      const resolvedMessages = typeof nextMessages === 'function' ? nextMessages(currentMessages) : nextMessages;
      messagesRef.current = resolvedMessages;
      return resolvedMessages;
    });
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((currentMessages) => [...currentMessages, message]);
  }, [setMessages]);

  const updateMessage = useCallback((messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
    let didUpdate = false;

    setMessages((currentMessages) => currentMessages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      didUpdate = true;
      return updater(message);
    }));

    return didUpdate;
  }, [setMessages]);

  const appendToMessage = useCallback((messageId: string, text: string) => {
    let didAppend = false;

    setMessages((currentMessages) => currentMessages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      didAppend = true;
      return {
        ...message,
        body: `${message.body}${text}`
      };
    }));

    return didAppend;
  }, [setMessages]);

  const clearMessages = useCallback(() => {
    activeConversationIdRef.current = null;
    activeRunIdRef.current = null;
    setActiveConversationId(null);
    setActiveRunId(null);
    setMessages([]);
  }, [setMessages]);

  useEffect(() => {
    void ensureAgentEventBridge();
  }, []);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  useEffect(() => {
    const owner = instanceIdRef.current;
    const streamingMessageIds = messages
      .filter((message) => message.role === 'assistant' && message.isStreaming)
      .map((message) => message.id);

    deleteOwnerRegistrations(owner);

    for (const assistantMessageId of streamingMessageIds) {
      setAssistantRegistration(assistantMessageId, {
        owner,
        append: (text) => appendToMessage(assistantMessageId, text),
        update: (updater) => updateMessage(assistantMessageId, updater),
        onCommandApproval: options.onCommandApproval
      });
    }

    return () => {
      deleteOwnerRegistrations(owner);
    };
  }, [appendToMessage, messages, options.onCommandApproval, updateMessage]);

  useEffect(() => {
    return () => {
      deleteOwnerRegistrations(instanceIdRef.current);
    };
  }, []);

  useEffect(() => {
    const conversationId = options.conversationId?.trim();
    if (!conversationId) {
      if (hydratedConversationRef.current !== null) {
        hydratedConversationRef.current = null;
        clearMessages();
      }
      return;
    }

    if (hydratedConversationRef.current === conversationId && activeConversationIdRef.current === conversationId) {
      return;
    }

    hydratedConversationRef.current = conversationId;
    activeConversationIdRef.current = conversationId;
    activeRunIdRef.current = null;
    setActiveConversationId(conversationId);
    setActiveRunId(null);
    setMessages([]);
    let isCancelled = false;

    void useMemoryStore.getState().loadConversation(conversationId).then((conversation) => {
      if (isCancelled || hydratedConversationRef.current !== conversationId) {
        return;
      }

      if (messagesRef.current.length > 0) {
        return;
      }

      setMessages(conversation?.messages ?? []);
    });

    return () => {
      isCancelled = true;
    };
  }, [clearMessages, options.conversationId, setMessages]);

  useEffect(() => {
    const conversationId = options.conversationId?.trim();
    if (!conversationId) {
      return;
    }

    const conversation = conversationRecords[conversationId];
    if (!conversation) {
      return;
    }

    if (messagesRef.current.some((message) => message.isStreaming)) {
      return;
    }

    if (sameMessages(messagesRef.current, conversation.messages)) {
      return;
    }

    setMessages(conversation.messages);
  }, [conversationRecords, options.conversationId, setMessages]);

  const saveCurrentConversation = useCallback(async () => {
    const currentMessages = messagesRef.current;
    const terminalBlocks = options.terminalBlocks ?? [];
    if (currentMessages.length === 0 && terminalBlocks.length === 0) {
      return null;
    }

    const conversationId = activeConversationIdRef.current
      ?? options.conversationId
      ?? currentMessages.find((message) => message.conversationId)?.conversationId
      ?? null;

    if (!conversationId) {
      return null;
    }

    return useMemoryStore.getState().saveConversation({
      conversationId,
      title: titleFromConversationContent(currentMessages, terminalBlocks),
      modelId: options.modelId ?? null,
      cwd: options.cwd ?? null,
      status: statusFromConversationContent(currentMessages, terminalBlocks),
      messages: currentMessages,
      ...(terminalBlocks.length > 0 ? { terminalBlocks } : {})
    });
  }, [options.conversationId, options.cwd, options.modelId, options.terminalBlocks]);

  const saveCurrentConversationRef = useRef(saveCurrentConversation);

  useEffect(() => {
    saveCurrentConversationRef.current = saveCurrentConversation;
  }, [saveCurrentConversation]);

  useEffect(() => {
    return () => {
      void saveCurrentConversationRef.current();
    };
  }, []);

  useEffect(() => {
    return () => {
      void saveCurrentConversationRef.current();
    };
  }, [options.conversationId]);

  useEffect(() => {
    if (messages.length === 0 && (options.terminalBlocks?.length ?? 0) === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveCurrentConversation();
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [messages, options.terminalBlocks?.length, saveCurrentConversation]);

  const submitQuery = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (trimmed === '/new') {
      await saveCurrentConversation();
      clearMessages();
      setQuery('');
      options.onCloseTray?.();
      options.onNewChat?.();
      return;
    }

    const ts = Date.now();
    const runId = `run_${ts}`;
    const conversationId = activeConversationIdRef.current ?? options.conversationId ?? `conv_${ts}`;
    const assistantMessageId = `assistant_${ts}`;

    activeRunIdRef.current = runId;
    activeConversationIdRef.current = conversationId;
    setActiveRunId(runId);
    setActiveConversationId(conversationId);
    options.onConversationCreated?.(conversationId);

    addMessage({
      id: `user-${ts}`,
      role: 'user',
      title: 'User',
      body: trimmed,
      conversationId,
      createdAt: new Date().toISOString()
    });

    addMessage({
      id: assistantMessageId,
      role: 'assistant',
      title: 'Octomus',
      body: pendingTokenText[assistantMessageId] ?? '',
      conversationId,
      runId,
      status: 'queued',
      isStreaming: true,
      createdAt: new Date().toISOString()
    });

    setQuery('');
    options.onCloseTray?.();

    try {
      const requestMessages = chatHistoryFromMessages(messagesRef.current);

      const response = await invoke<AgentStartResponse>('agent_start', {
        request: {
          runId,
          conversationId,
          assistantMessageId,
          prompt: trimmed,
          cwd: options.cwd ?? null,
          modelId: options.modelId ?? null,
          messages: requestMessages
        }
      });

      delete pendingTokenText[response.assistantMessageId];
      activeConversationIdRef.current = response.conversationId;
      activeRunIdRef.current = response.runId;
      setActiveConversationId(response.conversationId);
      setActiveRunId(response.runId);
      updateMessage(assistantMessageId, (message) => ({
        ...message,
        conversationId: response.conversationId,
        runId: response.runId
      }));
    } catch (error) {
      updateMessage(assistantMessageId, (message) => ({
        ...message,
        body: `Eroare: ${error}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  const submitToolResult = async (toolCallId: string, result: string, command?: string) => {
    const ts = Date.now();
    const conversationId = activeConversationIdRef.current;
    const runId = activeRunIdRef.current;

    if (!conversationId || !runId) return;

    addMessage({
      id: `tool-${ts}`,
      role: 'tool',
      title: 'Tool Output',
      body: result,
      conversationId,
      toolCallId
    });

    const nextAssistantMessageId = `assistant-followup-${ts}`;
    addMessage({
      id: nextAssistantMessageId,
      role: 'assistant',
      title: 'Octomus',
      body: '',
      conversationId,
      runId,
      isStreaming: true,
      status: 'running',
      createdAt: new Date().toISOString()
    });

    try {
      const requestMessages = chatHistoryFromMessages(messagesRef.current);

      const response = await invoke<AgentStartResponse>('agent_start', {
        request: {
          runId,
          conversationId,
          assistantMessageId: nextAssistantMessageId,
          prompt: buildToolResultFollowupPrompt(command),
          cwd: options.cwd ?? null,
          modelId: options.modelId ?? null,
          messages: requestMessages
        }
      });

      delete pendingTokenText[response.assistantMessageId];
      activeConversationIdRef.current = response.conversationId;
      activeRunIdRef.current = response.runId;
      setActiveConversationId(response.conversationId);
      setActiveRunId(response.runId);
      updateMessage(nextAssistantMessageId, (message) => ({
        ...message,
        conversationId: response.conversationId,
        runId: response.runId
      }));
    } catch (error) {
      updateMessage(nextAssistantMessageId, (message) => ({
        ...message,
        body: `Eroare la introspecție: ${error}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  return useMemo(() => ({
    query,
    setQuery,
    messages,
    submitQuery,
    submitToolResult,
    clearMessages,
    saveCurrentConversation
  }), [clearMessages, messages, query, saveCurrentConversation, submitQuery, submitToolResult]);
}
