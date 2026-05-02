import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useShellCommandIndex() {
  const [commands, setCommands] = useState<string[]>([]);

  useEffect(() => {
    let isCancelled = false;

    void invoke<string[]>('terminal_list_commands')
      .then((result) => {
        if (!isCancelled) {
          setCommands(result);
        }
      })
      .catch((error) => {
        console.warn('[shell-command-index] failed to load commands', error);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return commands;
}
