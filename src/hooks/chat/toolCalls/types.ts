import type { AgentToolCall } from '../../../types/chat';
import type { AssistantMessageRegistration } from '../types';

export type ToolCallHandlerContext = {
  assistantMessageId: string;
  registrations: AssistantMessageRegistration[];
  toolCall: AgentToolCall;
};

export type ToolCallHandler = {
  names: string[];
  recordRawToolCall?: boolean;
  handle: (context: ToolCallHandlerContext) => void;
};
