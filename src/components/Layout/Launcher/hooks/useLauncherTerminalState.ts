/**
 * `useLauncherTerminalState` - Computes derived state for the terminal.
 * 
 * Responsibilities:
 * 1. Calculate `terminalFailureCount` based on the sequence of failed exit codes.
 * 2. Generate a `terminalComposerAction` if multiple failures occur, suggesting the user ask the AI for help.
 */
import { useMemo } from 'react';
import type { TerminalCommandBlock } from '../../../../types';

export function useLauncherTerminalState(terminalCommandBlocks: TerminalCommandBlock[]) {
  const terminalFailureCount = useMemo(() => {
    let failures = 0;

    for (let index = terminalCommandBlocks.length - 1; index >= 0; index -= 1) {
      const block = terminalCommandBlocks[index];
      if (block.status !== 'finished') {
        continue;
      }

      if (typeof block.exitCode === 'number' && block.exitCode !== 0) {
        failures += 1;
        continue;
      }

      break;
    }

    return failures;
  }, [terminalCommandBlocks]);
  const terminalComposerAction = useMemo(() => {
    if (terminalFailureCount < 2) {
      return null;
    }

    const lastFailedBlock = [...terminalCommandBlocks]
      .reverse()
      .find((block) => block.status === 'finished' && typeof block.exitCode === 'number' && block.exitCode !== 0);

    if (!lastFailedBlock) {
      return null;
    }

    return {
      id: 'terminal-ask-agent',
      label: 'Ask the agent about recent failures',
      value: `Explain why \`${lastFailedBlock.command}\` failed repeatedly and suggest the safest next step.`,
      description: 'Start an agent conversation from the latest terminal failures.',
      mode: 'chat' as const
    };
  }, [terminalCommandBlocks, terminalFailureCount]);
  return { terminalFailureCount, terminalComposerAction };
}
