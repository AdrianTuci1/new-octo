import type { AgentToolCall } from '../../../types/chat';
import type { AssistantMessageRegistration } from '../types';
import { fileChangeToolCallHandler } from './fileChange';
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
  workspaceExplorationToolCallHandler,
  cloudAgentToolCallHandler,
  mcpServerToolCallHandler,
  terminalCommandToolCallHandler,
  fileChangeToolCallHandler
];

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
  const handler = findToolCallHandler(toolCall.name);

  if (!handler) {
    appendRawToolCall(registrations, toolCall);
    return false;
  }

  if (handler.recordRawToolCall !== false) {
    appendRawToolCall(registrations, toolCall);
  }

  handler.handle(context);
  return true;
}
