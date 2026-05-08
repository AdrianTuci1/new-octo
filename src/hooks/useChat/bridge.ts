import { listen } from '@tauri-apps/api/event';
import type {
  AgentDoneEvent,
  AgentErrorEvent,
  AgentReasoningEvent,
  AgentStatusEvent,
  AgentTokenEvent,
  AgentToolCallEvent
} from '../../types/chat';
import { dispatchToolCall } from './toolCalls';
import type { AssistantMessageRegistration } from './types';

let agentBridgeReady: Promise<void> | null = null;
export const pendingTokenText: Record<string, string> = {};
const assistantMessageRegistry = new Map<string, Map<symbol, AssistantMessageRegistration>>();
export const pendingFollowUpPayloads: Record<string, string> = {};

export function assistantRegistrations(assistantMessageId: string) {
  return Array.from(assistantMessageRegistry.get(assistantMessageId)?.values() ?? []);
}

export function setAssistantRegistration(assistantMessageId: string, registration: AssistantMessageRegistration) {
  const existingRegistrations = assistantMessageRegistry.get(assistantMessageId);
  if (existingRegistrations) {
    existingRegistrations.set(registration.owner, registration);
    return;
  }

  assistantMessageRegistry.set(assistantMessageId, new Map([[registration.owner, registration]]));
}

export function deleteOwnerRegistrations(owner: symbol) {
  for (const [assistantMessageId, registrations] of assistantMessageRegistry.entries()) {
    registrations.delete(owner);
    if (registrations.size === 0) {
      assistantMessageRegistry.delete(assistantMessageId);
    }
  }
}

export function ensureAgentEventBridge(): Promise<void> {
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
      dispatchToolCall({
        assistantMessageId,
        toolCall,
        registrations
      });
    }),

    listen<AgentReasoningEvent>('agent:reasoning', (event) => {
      const { assistantMessageId, text, isComplete } = event.payload;
      assistantRegistrations(assistantMessageId).forEach((registration) => {
        registration.upsertReasoning({
          text,
          isComplete
        });
      });
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
