import type { TerminalCommandBlock } from '../../../../types';
import * as Hooks from '../../../../hooks';

/**
 * Checks if a terminal block is a conversation link.
 */
export function isConversationLinkBlock(block: TerminalCommandBlock) {
  return block.presentation === 'conversation-link';
}

/**
 * Checks if a terminal block is a standard command execution block.
 */
export function isCommandBlock(block: TerminalCommandBlock) {
  return !isConversationLinkBlock(block);
}

/**
 * Executes a command in either the agent or the terminal surface based on the current context.
 */
export function runCommandInSurface(
  command: string,
  surface: 'agent' | 'terminal',
  terminal: ReturnType<typeof Hooks.useTerminalCommandBlocks>,
  agentTerminal: ReturnType<typeof Hooks.useTerminalCommandBlocks>,
  clearTerminalSurface: () => void,
  source: 'user' | 'assistant'
) {
  if (surface === 'terminal' && command.trim() === 'clear') {
    clearTerminalSurface();
    return Promise.resolve(null);
  }

  return surface === 'agent'
    ? agentTerminal.runCommand(command, { source })
    : terminal.runCommand(command, { source });
}
