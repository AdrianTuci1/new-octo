import type { AgentToolCall } from '../../../types/chat';
import type { AssistantMessageRegistration } from '../types';
import { fileChangeToolCallHandler } from './fileChange';
import { workspaceFileReadToolCallHandler } from './fileRead';
import { cloudAgentToolCallHandler } from './cloudAgent';
import { followUpToolCallHandler } from './followUp';
import { mcpServerToolCallHandler } from './mcpServer';
import { planToolCallHandler } from './plan';
import { planExecutionToolCallHandler } from './planExecution';
import { workspaceExplorationToolCallHandler } from './workspaceExploration';
import { terminalCommandToolCallHandler } from './terminalCommand';
import { webSearchToolCallHandler } from './webSearch';
import type { ToolCallHandler, ToolCallHandlerContext } from './types';

const toolCallHandlers: ToolCallHandler[] = [
  followUpToolCallHandler,
  planToolCallHandler,
  planExecutionToolCallHandler,
  webSearchToolCallHandler,
  workspaceFileReadToolCallHandler,
  workspaceExplorationToolCallHandler,
  cloudAgentToolCallHandler,
  mcpServerToolCallHandler,
  terminalCommandToolCallHandler,
  fileChangeToolCallHandler
];

function normalizeToolCallName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex > 0 && colonIndex < trimmed.length - 1) {
    return trimmed.slice(colonIndex + 1).trim() || trimmed;
  }

  return trimmed;
}

function appendRawToolCall(registrations: AssistantMessageRegistration[], toolCall: AgentToolCall) {
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
}

function findToolCallHandler(toolName: string) {
  return toolCallHandlers.find((handler) => handler.names.includes(toolName));
}

export function dispatchToolCall(context: ToolCallHandlerContext) {
  const { registrations, toolCall } = context;
  const normalizedToolCall = {
    ...toolCall,
    name: normalizeToolCallName(toolCall.name)
  };
  const handler = findToolCallHandler(normalizedToolCall.name);

  if (!handler) {
    appendRawToolCall(registrations, normalizedToolCall);
    return false;
  }

  if (handler.recordRawToolCall !== false) {
    appendRawToolCall(registrations, normalizedToolCall);
  }

  handler.handle({
    ...context,
    toolCall: normalizedToolCall
  });
  return true;
}
