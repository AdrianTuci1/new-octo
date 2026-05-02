import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TerminalCommandBlock } from '../types/terminal';
import type { ShellPrediction } from '../lib/composerIntelligence';

export function useUnifiedShellPrediction(
  query: string,
  composerMode: 'chat' | 'shell',
  blocks: TerminalCommandBlock[],
  cwd: string,
  availableCommands: string[],
  allowSingleCharacter: boolean
): ShellPrediction | null {
  const [prediction, setPrediction] = useState<ShellPrediction | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (composerMode !== 'shell' || trimmed.length === 0) {
      setPrediction(null);
      return;
    }

    if (!allowSingleCharacter && trimmed.length === 1) {
      setPrediction(null);
      return;
    }

    const timer = setTimeout(() => {
      const lastCommand = blocks[blocks.length - 1]?.command;
      
      // Map terminal blocks to context messages (like Warp's ContextMessageInput)
      const contextMessages = blocks.slice(-5).map(block => {
        const lines = block.output?.split('\n') || [];
        const summarizedOutput = lines.length > 10 
          ? [...lines.slice(0, 5), '...', ...lines.slice(-5)].join('\n')
          : block.output || "";

        return {
          input: block.command,
          output: summarizedOutput,
          context: {
            pwd: cwd,
            gitBranch: null, 
            exitCode: block.exitCode ?? 0
          }
        };
      });

      void invoke<any>('terminal_get_prediction', {
        input: query,
        cwd: cwd || null,
        lastCommand: lastCommand ?? null,
        availableCommands: availableCommands,
        contextMessages: contextMessages
      }).then((res) => {
        if (res && res.suggestion) {
          setPrediction({
            fullCommand: res.suggestion,
            completionText: res.suggestion.slice(query.length),
            hint: res.kind === 'history' ? 'History' : res.kind === 'heuristic' ? 'Heuristic' : 'AI completion'
          });
        } else {
          setPrediction(null);
        }
      }).catch(() => setPrediction(null));
    }, 400); // More conservative debounce for AI stability

    return () => clearTimeout(timer);
  }, [query, composerMode, blocks, cwd, availableCommands, allowSingleCharacter]);

  return prediction;
}
