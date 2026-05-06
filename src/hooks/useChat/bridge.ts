import { listen } from '@tauri-apps/api/event';
import type {
  AgentDoneEvent,
  AgentErrorEvent,
  AgentStatusEvent,
  AgentTokenEvent,
  AgentToolCallEvent,
  ChatMessage
} from '../../types/chat';
import type { FileChangeApproval } from '../../types/terminal';
import { buildApprovalReason } from './helpers';
import { normalizeToolFollowUpSuggestion } from './parsers';
import type { AssistantMessageRegistration } from './types';

let agentBridgeReady: Promise<void> | null = null;
export const pendingTokenText: Record<string, string> = {};
const assistantMessageRegistry = new Map<string, Map<symbol, AssistantMessageRegistration>>();
export const pendingFollowUpPayloads: Record<string, string> = {};

function normalizeFileChangeApproval(args: any): FileChangeApproval | undefined {
  const fileDiffs = Array.isArray(args?.fileDiffs)
    ? args.fileDiffs
    : Array.isArray(args?.diffs)
      ? args.diffs
      : [];

  if (fileDiffs.length === 0) {
    return undefined;
  }

  const summary = typeof args?.summary === 'string'
    ? args.summary.trim()
    : typeof args?.reason === 'string'
      ? args.reason.trim()
      : '';

  return {
    kind: 'file-change',
    summary: summary || undefined,
    fileDiffs,
    refineLabel: typeof args?.refineLabel === 'string' ? args.refineLabel : undefined,
    editLabel: typeof args?.editLabel === 'string' ? args.editLabel : undefined,
    acceptLabel: typeof args?.acceptLabel === 'string' ? args.acceptLabel : undefined
  };
}

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
              kind: 'command',
              command,
              toolCallId: toolCall.id,
              reason
            });
          }
        });
        return;
      }

      if (toolCall.name === 'propose_file_change' || toolCall.name === 'request_file_edits' || toolCall.name === 'propose_file_edits') {
        const approval = normalizeFileChangeApproval(toolCall.args);
        if (!approval) return;

        registrations.forEach((registration) => {
          registration.update((message) => ({
            ...message,
            body: message.body.trim().length > 0 ? message.body : approval.summary ?? message.body
          }));

          registration.onFileChangeApproval?.(approval);
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
