/**
 * ChatToolCallService
 * ───────────────────────────────────────────
 * Pattern: **Strategy** (dispatcher + per-tool handlers — each handler is a Strategy)
 * Routes incoming tool calls to the appropriate handler via the Strategy pattern.
 */
export { dispatchToolCall } from '../../hooks/chat/toolCalls/dispatcher';
export { cloudAgentToolCallHandler } from '../../hooks/chat/toolCalls/cloudAgent';
export { fileChangeToolCallHandler } from '../../hooks/chat/toolCalls/fileChange';
export { workspaceFileReadToolCallHandler } from '../../hooks/chat/toolCalls/fileRead';
export { followUpToolCallHandler } from '../../hooks/chat/toolCalls/followUp';
export { mcpServerToolCallHandler } from '../../hooks/chat/toolCalls/mcpServer';
export { planToolCallHandler } from '../../hooks/chat/toolCalls/plan';
export { planExecutionToolCallHandler } from '../../hooks/chat/toolCalls/planExecution';
export { terminalCommandToolCallHandler } from '../../hooks/chat/toolCalls/terminalCommand';
export { webSearchToolCallHandler } from '../../hooks/chat/toolCalls/webSearch';
export { workspaceExplorationToolCallHandler } from '../../hooks/chat/toolCalls/workspaceExploration';
export type { ToolCallHandlerContext } from '../../hooks/chat/toolCalls/types';
