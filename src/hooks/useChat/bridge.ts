import { listen } from '@tauri-apps/api/event';
import type {
  AgentDoneEvent,
  AgentErrorEvent,
  AgentReasoningEvent,
  AgentStatusEvent,
  AgentTokenEvent,
  AgentToolCallEvent,
  AgentToolCall
} from '../../types/chat';
import { dispatchToolCall } from './toolCalls';
import type { AssistantMessageRegistration } from './types';

type AgentBridgeState = {
  ready: Promise<void> | null;
  unlisteners: Array<() => void>;
  pendingTokenText: Record<string, string>;
  pendingFollowUpPayloads: Record<string, string>;
  pendingToolCalls: Record<string, AgentToolCall[]>;
  assistantMessageRegistry: Map<string, Map<symbol, AssistantMessageRegistration>>;
  recentLargeTokenKeys: Map<string, number>;
};

const globalBridgeState = globalThis as typeof globalThis & {
  __octomusAgentBridge?: AgentBridgeState;
};

const bridgeState = globalBridgeState.__octomusAgentBridge ??= {
  ready: null,
  unlisteners: [],
  pendingTokenText: {},
  pendingFollowUpPayloads: {},
  pendingToolCalls: {},
  assistantMessageRegistry: new Map<string, Map<symbol, AssistantMessageRegistration>>(),
  recentLargeTokenKeys: new Map<string, number>()
};

export const pendingTokenText = bridgeState.pendingTokenText;
export const pendingFollowUpPayloads = bridgeState.pendingFollowUpPayloads;

function readEventString(payload: Record<string, any>, camelKey: string, snakeKey: string) {
  const value = payload[camelKey] ?? payload[snakeKey];
  return typeof value === 'string' ? value : '';
}

function normalizeAgentEventPayload<T extends Record<string, any>>(payload: T) {
  return {
    ...payload,
    runId: readEventString(payload, 'runId', 'run_id'),
    conversationId: readEventString(payload, 'conversationId', 'conversation_id'),
    assistantMessageId: readEventString(payload, 'assistantMessageId', 'assistant_message_id')
  };
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash.toString(36);
}

function rememberRecentKey(keys: Map<string, number>, key: string, ttlMs: number) {
  const now = Date.now();
  const previousSeenAt = keys.get(key);

  for (const [existingKey, seenAt] of keys.entries()) {
    if (now - seenAt > ttlMs) {
      keys.delete(existingKey);
    }
  }

  if (previousSeenAt && now - previousSeenAt <= ttlMs) {
    return true;
  }

  keys.set(key, now);
  return false;
}

function shouldIgnoreDuplicateTokenEvent(payload: AgentTokenEvent) {
  if (payload.text.length < 40) {
    return false;
  }

  return rememberRecentKey(
    bridgeState.recentLargeTokenKeys,
    [
      payload.runId,
      payload.conversationId,
      payload.assistantMessageId,
      payload.text.length,
      hashText(payload.text)
    ].join(':'),
    5_000
  );
}

export function assistantRegistrations(assistantMessageId: string) {
  return Array.from(bridgeState.assistantMessageRegistry.get(assistantMessageId)?.values() ?? []);
}

function firstRegistration(assistantMessageId: string) {
  const registrations = assistantRegistrations(assistantMessageId);
  return registrations[registrations.length - 1] ?? null;
}

export function setAssistantRegistration(assistantMessageId: string, registration: AssistantMessageRegistration) {
  // A streaming assistant message belongs to one live chat instance. Replacing
  // stale registrations prevents HMR/remounts from stealing token events.
  bridgeState.assistantMessageRegistry.set(assistantMessageId, new Map([[registration.owner, registration]]));
  flushPendingToolCalls(assistantMessageId);
}

function flushPendingToolCalls(assistantMessageId: string) {
  const queuedToolCalls = bridgeState.pendingToolCalls[assistantMessageId];
  if (!queuedToolCalls?.length) return;

  const registrations = assistantRegistrations(assistantMessageId);
  if (registrations.length === 0) return;

  delete bridgeState.pendingToolCalls[assistantMessageId];
  queuedToolCalls.forEach((toolCall) => {
    dispatchToolCall({
      assistantMessageId,
      toolCall,
      registrations
    });
  });
}

export function deleteOwnerRegistrations(owner: symbol) {
  for (const [assistantMessageId, registrations] of bridgeState.assistantMessageRegistry.entries()) {
    registrations.delete(owner);
    if (registrations.size === 0) {
      bridgeState.assistantMessageRegistry.delete(assistantMessageId);
    }
  }
}

export function ensureAgentEventBridge(): Promise<void> {
  if (bridgeState.ready) return bridgeState.ready;

  console.warn('[useChat] Initializing Agent Event Bridge...');

  bridgeState.ready = Promise.all([
    listen<AgentTokenEvent>('agent:token', (event) => {
      const payload = normalizeAgentEventPayload(event.payload);
      const { assistantMessageId, text } = payload;
      if (!assistantMessageId) {
        console.warn('[useChat] token event missing assistantMessageId', event.payload);
        return;
      }
      if (shouldIgnoreDuplicateTokenEvent(payload)) {
        return;
      }
      const registration = firstRegistration(assistantMessageId);
      if (registration) {
        registration.append(text);
      } else {
        bridgeState.pendingTokenText[assistantMessageId] = `${bridgeState.pendingTokenText[assistantMessageId] ?? ''}${text}`;
      }
    }),

    listen<AgentToolCallEvent>('agent:tool_call', (event) => {
      const { assistantMessageId, toolCall } = normalizeAgentEventPayload(event.payload);
      if (!assistantMessageId) {
        console.warn('[useChat] tool call event missing assistantMessageId', event.payload);
        return;
      }
      const registrations = assistantRegistrations(assistantMessageId);

      if (!toolCall) return;
      if (registrations.length === 0) {
        bridgeState.pendingToolCalls[assistantMessageId] = [
          ...(bridgeState.pendingToolCalls[assistantMessageId] ?? []),
          toolCall
        ];
        return;
      }
      dispatchToolCall({
        assistantMessageId,
        toolCall,
        registrations
      });
    }),

    listen<AgentReasoningEvent>('agent:reasoning', (event) => {
      const payload = normalizeAgentEventPayload(event.payload);
      const { assistantMessageId, text } = payload;
      const isComplete = event.payload.isComplete ?? (event.payload as any).is_complete;
      if (!assistantMessageId) {
        console.warn('[useChat] reasoning event missing assistantMessageId', event.payload);
        return;
      }
      const registration = firstRegistration(assistantMessageId);
      if (registration) {
        registration.upsertReasoning({
          text,
          isComplete
        });
      }
    }),

    listen<AgentStatusEvent>('agent:status', (event) => {
      const { assistantMessageId, status } = normalizeAgentEventPayload(event.payload);
      if (!assistantMessageId) {
        console.warn('[useChat] status event missing assistantMessageId', event.payload);
        return;
      }
      const registration = firstRegistration(assistantMessageId);
      if (registration) {
        registration.update((message) => ({
          ...message,
          status,
          isStreaming: !['completed', 'cancelled', 'failed'].includes(status)
        }));
      }
    }),

    listen<AgentDoneEvent>('agent:done', (event) => {
      const { assistantMessageId, status, usage } = normalizeAgentEventPayload(event.payload);
      if (!assistantMessageId) {
        console.warn('[useChat] done event missing assistantMessageId', event.payload);
        return;
      }
      const registration = firstRegistration(assistantMessageId);
      if (registration) {
        registration.update((message) => ({
          ...message,
          status,
          usage,
          isStreaming: false
        }));
        registration.finalizeReasoning?.();
      }
    }),

    listen<AgentErrorEvent>('agent:error', (event) => {
      const { assistantMessageId, error } = normalizeAgentEventPayload(event.payload);
      if (!assistantMessageId) {
        console.warn('[useChat] error event missing assistantMessageId', event.payload);
        return;
      }
      const registration = firstRegistration(assistantMessageId);
      if (registration) {
        registration.update((message) => ({
          ...message,
          body: message.body ? `${message.body}\n\n${error}` : error,
          status: 'failed',
          isError: true,
          isStreaming: false
        }));
      }
    })
  ]).then((unlisteners) => {
    bridgeState.unlisteners = unlisteners;
    console.warn('[useChat] Agent Event Bridge is READY and listening.');
  }).catch((error) => {
    bridgeState.ready = null;
    console.warn('[useChat] Agent Event Bridge failed to initialize.', error);
  });

  return bridgeState.ready;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    bridgeState.unlisteners.forEach((unlisten) => unlisten());
    bridgeState.unlisteners = [];
    bridgeState.ready = null;
    bridgeState.assistantMessageRegistry.clear();
  });
}
