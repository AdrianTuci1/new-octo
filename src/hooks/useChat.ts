import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import type {
  AgentDoneEvent,
  AgentInputMessage,
  AgentErrorEvent,
  AgentStartResponse,
  AgentStatusEvent,
  AgentTokenEvent,
  AgentToolCallEvent,
  ChatMessage
} from '../types/chat';
import type { CommandApproval } from '../types/terminal';

type UseChatOptions = {
  onCommandApproval?: (approval: CommandApproval) => void;
  onNewChat?: () => void;
  cwd?: string | null;
  modelId?: string | null;
};

let agentBridgeReady: Promise<void> | null = null;
const pendingTokenText: Record<string, string> = {};

// Global registry for callbacks that the global bridge can access
const globalCallbacks: UseChatOptions = {};

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
      console.log('[useChat] Received agent:token:', event.payload);
      const { assistantMessageId, text } = event.payload;
      const appended = useChatStore.getState().appendToMessage(assistantMessageId, text);

      if (!appended) {
        pendingTokenText[assistantMessageId] = `${pendingTokenText[assistantMessageId] ?? ''}${text}`;
      }
    }),

    listen<AgentToolCallEvent>('agent:tool_call', (event) => {
      console.warn('[useChat] RECEIVED agent:tool_call!', event.payload);
      const { assistantMessageId, toolCall } = event.payload;
      const { updateMessage } = useChatStore.getState();

      if (!toolCall) return;

      // Store the tool call metadata in the assistant message
      updateMessage(assistantMessageId, (msg) => ({
        ...msg,
        toolCalls: [...(msg.toolCalls || []), {
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.args)
          }
        }]
      }));

      if (toolCall.name === 'propose_terminal_command') {
        const command = toolCall.args.command;
        const reason = buildApprovalReason(command, toolCall.args.reason);

        updateMessage(assistantMessageId, (msg) => ({
          ...msg,
          body: msg.body.trim().length > 0 ? msg.body : reason
        }));

        if (command && globalCallbacks.onCommandApproval) {
          globalCallbacks.onCommandApproval({
            command,
            toolCallId: toolCall.id,
            reason
          });
        }
      }
    }),

    listen<AgentStatusEvent>('agent:status', (event) => {
      const { assistantMessageId, status } = event.payload;
      useChatStore.getState().updateMessage(assistantMessageId, (message) => ({
        ...message,
        status,
        isStreaming: !['completed', 'cancelled', 'failed'].includes(status)
      }));
    }),

    listen<AgentDoneEvent>('agent:done', (event) => {
      const { assistantMessageId, status, usage } = event.payload;
      useChatStore.getState().updateMessage(assistantMessageId, (message) => ({
        ...message,
        status,
        usage,
        isStreaming: false
      }));
    }),

    listen<AgentErrorEvent>('agent:error', (event) => {
      const { assistantMessageId, error } = event.payload;
      useChatStore.getState().updateMessage(assistantMessageId, (message) => ({
        ...message,
        body: message.body ? `${message.body}\n\n${error}` : error,
        status: 'failed',
        isError: true,
        isStreaming: false
      }));
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

export function useChat(options: UseChatOptions = {}) {
  useEffect(() => {
    if (options.onCommandApproval) globalCallbacks.onCommandApproval = options.onCommandApproval;
    if (options.onNewChat) globalCallbacks.onNewChat = options.onNewChat;
  }, [options.onCommandApproval, options.onNewChat]);

  useEffect(() => {
    void ensureAgentEventBridge();
  }, []);

  const {
    activeConversationId,
    activeRunId,
    query,
    setQuery,
    messages,
    addMessage,
    clearMessages,
    setActiveConversationId,
    setActiveRunId,
    updateMessage
  } = useChatStore();
  const { setTrayMode } = useUIStore();

  const submitQuery = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (trimmed === '/new') {
      clearMessages();
      setQuery('');
      setTrayMode('closed');
      options.onNewChat?.();
      return;
    }

    const ts = Date.now();
    const runId = `run_${ts}`;
    const conversationId = activeConversationId ?? `conv_${ts}`;
    const assistantMessageId = `assistant_${ts}`;
    
    setActiveRunId(runId);
    
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
    setTrayMode('closed');

    try {
      const currentMessages = useChatStore.getState().messages;
      const requestMessages = chatHistoryFromMessages(currentMessages);

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
      setActiveConversationId(response.conversationId);
      updateMessage(assistantMessageId, (msg) => ({
        ...msg,
        conversationId: response.conversationId,
        runId: response.runId
      }));
    } catch (err) {
      updateMessage(assistantMessageId, (msg) => ({
        ...msg,
        body: `Eroare: ${err}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  const submitToolResult = async (toolCallId: string, result: string, command?: string) => {
    const ts = Date.now();
    const { activeConversationId: conversationId, activeRunId: runId } = useChatStore.getState();

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
      const currentMessages = useChatStore.getState().messages;
      const requestMessages = chatHistoryFromMessages(currentMessages);

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
      updateMessage(nextAssistantMessageId, (msg) => ({
        ...msg,
        conversationId: response.conversationId,
        runId: response.runId
      }));
    } catch (err) {
      updateMessage(nextAssistantMessageId, (msg) => ({
        ...msg,
        body: `Eroare la introspecție: ${err}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  return { query, setQuery, messages, submitQuery, submitToolResult, clearMessages };
}
