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
  active?: boolean;
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
const pendingFollowUpPayloads: Record<string, string> = {};
const FOLLOW_UP_START = '<octomus_follow_up>';
const FOLLOW_UP_END = '</octomus_follow_up>';
const STRUCTURED_FOLLOW_UP_HEADINGS = [
  'Sugestie de continuare',
  'Recomandare de continuare',
  'Follow up suggestion',
  'Follow-up suggestion',
  'Follow‐up suggestion',
  'Follow‑up suggestion',
  'Follow–up suggestion',
  'Follow—up suggestion',
  'Follow up',
  'Follow-up',
  'Follow‐up',
  'Follow‑up',
  'Follow–up',
  'Follow—up',
  'Suggested follow-up'
];
const STRUCTURED_FOLLOW_UP_FIELDS = [
  'Descriere',
  'Description',
  'Etichetă',
  'Eticheta',
  'Label',
  'Prompt'
];

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

      if (toolCall.name === 'suggest_follow_up') {
        const followUpSuggestion = normalizeToolFollowUpSuggestion(toolCall.args);
        if (!followUpSuggestion) return;

        registrations.forEach((registration) => {
          registration.update((message) => ({
            ...message,
            followUpSuggestion
          }));
        });
        return;
      }

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
      content: stripFollowUpMetadata(message.body),
      toolCallId: message.toolCallId,
      toolCalls: message.toolCalls
    }));
}

function stripFollowUpMetadata(value: string) {
  return visibleChatMessageBody(value);
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
      && JSON.stringify(candidate.followUpSuggestion ?? null) === JSON.stringify(message.followUpSuggestion ?? null)
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

function normalizeFollowUpLabel(value: string) {
  return value
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 10)
    .join(' ');
}

function pendingFollowUpPrefixLength(value: string) {
  const maxLength = Math.min(value.length, FOLLOW_UP_START.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (FOLLOW_UP_START.startsWith(value.slice(value.length - length))) {
      return length;
    }
  }

  return 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownLinePrefixPattern() {
  return String.raw`\s*(?:[-*+>]\s*)?(?:[*_]{1,2})?`;
}

function markdownLineSuffixPattern() {
  return String.raw`(?:[*_]{1,2})?\s*:\s*(?:[*_]{1,2})?\s*`;
}

function pendingStructuredFollowUpPrefixLength(value: string) {
  const suffixes = STRUCTURED_FOLLOW_UP_HEADINGS.flatMap((heading) => [
    heading,
    `\n${heading}`,
    `${heading}:`,
    `\n${heading}:`
  ]);
  const maxLength = Math.min(value.length, Math.max(...suffixes.map((suffix) => suffix.length)) - 1);

  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = value.slice(value.length - length).toLowerCase();
    if (suffixes.some((candidate) => candidate.toLowerCase().startsWith(suffix))) {
      return length;
    }
  }

  return 0;
}

function structuredFollowUpHeadingMatch(value: string) {
  const headingPattern = STRUCTURED_FOLLOW_UP_HEADINGS.map(escapeRegExp).join('|');
  return new RegExp(
    `(?:^|\\n)${markdownLinePrefixPattern()}(?:${headingPattern})${markdownLineSuffixPattern()}`,
    'i'
  ).exec(value);
}

function stripPromptQuotes(value: string) {
  return value
    .trim()
    .replace(/^[“”„"']+/, '')
    .replace(/[“”„"']+$/, '')
    .trim();
}

function structuredFollowUpField(block: string, names: string[]) {
  const allFieldPattern = STRUCTURED_FOLLOW_UP_FIELDS.map(escapeRegExp).join('|');
  const fieldPattern = names.map(escapeRegExp).join('|');
  const match = new RegExp(
    `(?:^|\\n)${markdownLinePrefixPattern()}(?:${fieldPattern})${markdownLineSuffixPattern()}([\\s\\S]*?)(?=\\n${markdownLinePrefixPattern()}(?:${allFieldPattern})${markdownLineSuffixPattern()}|$)`,
    'i'
  ).exec(block);

  return match?.[1]?.trim() ?? '';
}

function extractStructuredFollowUpSuggestion(raw: string) {
  const headingMatch = structuredFollowUpHeadingMatch(raw);
  if (!headingMatch || headingMatch.index === undefined) {
    const pendingLength = pendingStructuredFollowUpPrefixLength(raw);
    if (pendingLength === 0) return null;

    return {
      visibleBody: raw.slice(0, raw.length - pendingLength),
      pendingPayload: raw.slice(raw.length - pendingLength),
      suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
    };
  }

  const startIndex = headingMatch.index;
  const block = raw.slice(startIndex);
  const prompt = stripPromptQuotes(structuredFollowUpField(block, ['Prompt']));
  if (!prompt) {
    return {
      visibleBody: raw.slice(0, startIndex).trimEnd(),
      pendingPayload: block,
      suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
    };
  }

  const description = stripPromptQuotes(structuredFollowUpField(block, ['Descriere', 'Description']));
  const label = stripPromptQuotes(structuredFollowUpField(block, ['Etichetă', 'Eticheta', 'Label']));

  return {
    visibleBody: raw.slice(0, startIndex).trimEnd(),
    pendingPayload: '',
    suggestion: normalizeToolFollowUpSuggestion({
      prompt,
      label,
      description
    })
  };
}

function normalizeToolFollowUpSuggestion(args: any): ChatMessage['followUpSuggestion'] | undefined {
  const rawValue = typeof args?.prompt === 'string'
    ? args.prompt
    : typeof args?.value === 'string'
      ? args.value
      : typeof args?.query === 'string'
        ? args.query
        : '';
  const value = rawValue.trim();
  if (!value) {
    return undefined;
  }

  const rawLabel = typeof args?.label === 'string' ? args.label.trim() : '';
  const description = typeof args?.description === 'string' ? args.description.trim() : '';
  const displayLabel = normalizeFollowUpLabel(value) || normalizeFollowUpLabel(rawLabel);

  return {
    label: displayLabel,
    value,
    description: description || undefined
  };
}

function extractFollowUpSuggestion(raw: string) {
  const startIndex = raw.indexOf(FOLLOW_UP_START);
  if (startIndex < 0) {
    const structured = extractStructuredFollowUpSuggestion(raw);
    if (structured) {
      return structured;
    }

    const pendingLength = pendingFollowUpPrefixLength(raw);
    if (pendingLength === 0) {
      return {
        visibleBody: raw,
        pendingPayload: '',
        suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
      };
    }

    return {
      visibleBody: raw.slice(0, raw.length - pendingLength),
      pendingPayload: raw.slice(raw.length - pendingLength),
      suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
    };
  }

  const endIndex = raw.indexOf(FOLLOW_UP_END, startIndex + FOLLOW_UP_START.length);
  if (endIndex < 0) {
    return {
      visibleBody: raw.slice(0, startIndex),
      pendingPayload: raw.slice(startIndex),
      suggestion: undefined as ChatMessage['followUpSuggestion'] | undefined
    };
  }

  const visibleBody = raw.slice(0, startIndex);
  const payload = raw
    .slice(startIndex + FOLLOW_UP_START.length, endIndex)
    .trim();
  const trailing = raw.slice(endIndex + FOLLOW_UP_END.length);

  let suggestion: ChatMessage['followUpSuggestion'] | undefined;
  try {
    const parsed = JSON.parse(payload) as {
      label?: string;
      value?: string;
      description?: string;
    };
    if (parsed.value?.trim()) {
      suggestion = normalizeToolFollowUpSuggestion(parsed);
    }
  } catch {
    suggestion = undefined;
  }

  return {
    visibleBody: `${visibleBody}${trailing}`.trimEnd(),
    pendingPayload: '',
    suggestion
  };
}

export function visibleChatMessageBody(value: string) {
  return extractFollowUpSuggestion(value).visibleBody;
}

export function followUpSuggestionFromMessageBody(value: string) {
  return extractFollowUpSuggestion(value).suggestion;
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
  const conversationRecord = useMemoryStore((state) => options.conversationId ? state.conversationRecords[options.conversationId] : undefined);

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
      const bufferedFollowUp = pendingFollowUpPayloads[messageId] ?? '';
      const combinedRaw = bufferedFollowUp
        ? `${bufferedFollowUp}${text}`
        : `${message.body}${text}`;
      const extracted = extractFollowUpSuggestion(combinedRaw);
      if (!extracted) {
        return {
          ...message,
          body: `${message.body}${text}`
        };
      }

      if (extracted.pendingPayload) {
        pendingFollowUpPayloads[messageId] = extracted.pendingPayload;
      } else {
        delete pendingFollowUpPayloads[messageId];
      }

      return {
        ...message,
        body: bufferedFollowUp
          ? `${message.body}${extracted.visibleBody}`
          : extracted.visibleBody,
        followUpSuggestion: extracted.suggestion ?? message.followUpSuggestion
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

  const onCommandApprovalRef = useRef(options.onCommandApproval);
  useEffect(() => {
    onCommandApprovalRef.current = options.onCommandApproval;
  }, [options.onCommandApproval]);

  useEffect(() => {
    const owner = instanceIdRef.current;
    const streamingMessageIds = messages
      .filter((message) => message.role === 'assistant' && message.isStreaming)
      .map((message) => message.id);

    for (const assistantMessageId of streamingMessageIds) {
      setAssistantRegistration(assistantMessageId, {
        owner,
        append: (text) => appendToMessage(assistantMessageId, text),
        update: (updater) => updateMessage(assistantMessageId, updater),
        onCommandApproval: (approval) => onCommandApprovalRef.current?.(approval)
      });
    }
  }, [appendToMessage, messages, updateMessage]);

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
    if (!conversationId || !conversationRecord) {
      return;
    }

    if (messagesRef.current.some((message) => message.isStreaming)) {
      return;
    }

    if (sameMessages(messagesRef.current, conversationRecord.messages)) {
      return;
    }

    setMessages(conversationRecord.messages);
  }, [conversationRecord, options.conversationId, setMessages]);

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
    if (options.active === false) {
      void saveCurrentConversationRef.current();
    }
  }, [options.active]);

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

  const submitQuery = async (promptOverride?: string) => {
    const prompt = typeof promptOverride === 'string' ? promptOverride : query;
    const trimmed = prompt.trim();
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

    const owner = instanceIdRef.current;
    setAssistantRegistration(assistantMessageId, {
      owner,
      append: (text) => appendToMessage(assistantMessageId, text),
      update: (updater) => updateMessage(assistantMessageId, updater),
      onCommandApproval: (approval) => onCommandApprovalRef.current?.(approval)
    });

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

      const remainingTokens = pendingTokenText[response.assistantMessageId];
      if (remainingTokens) {
        appendToMessage(assistantMessageId, remainingTokens);
      }
      delete pendingTokenText[response.assistantMessageId];
      activeConversationIdRef.current = response.conversationId;
      activeRunIdRef.current = response.runId;
      setActiveConversationId(response.conversationId);
      setActiveRunId(response.runId);
      if (response.conversationId !== conversationId) {
        options.onConversationCreated?.(response.conversationId);
      }
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

    const owner = instanceIdRef.current;
    setAssistantRegistration(nextAssistantMessageId, {
      owner,
      append: (text) => appendToMessage(nextAssistantMessageId, text),
      update: (updater) => updateMessage(nextAssistantMessageId, updater),
      onCommandApproval: (approval) => onCommandApprovalRef.current?.(approval)
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

      const remainingTokens = pendingTokenText[response.assistantMessageId];
      if (remainingTokens) {
        appendToMessage(nextAssistantMessageId, remainingTokens);
      }
      delete pendingTokenText[response.assistantMessageId];
      activeConversationIdRef.current = response.conversationId;
      activeRunIdRef.current = response.runId;
      setActiveConversationId(response.conversationId);
      setActiveRunId(response.runId);
      if (response.conversationId !== conversationId) {
        options.onConversationCreated?.(response.conversationId);
      }
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
