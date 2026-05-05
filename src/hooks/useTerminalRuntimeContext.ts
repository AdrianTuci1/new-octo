import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TerminalRuntimeContext } from '../types/terminal';

export function useTerminalRuntimeContext(path: string | null) {
  const [runtimeContext, setRuntimeContext] = useState<TerminalRuntimeContext | null>(null);

  useEffect(() => {
    if (!path) {
      setRuntimeContext(null);
      return;
    }

    void invoke<TerminalRuntimeContext>('terminal_get_runtime_context', {
      request: {
        path
      }
    })
      .then((context) => {
        setRuntimeContext(context);
      })
      .catch((error) => {
        console.warn('[runtime-context] failed to load runtime context', error);
        setRuntimeContext(null);
      });
  }, [path]);

  return runtimeContext;
}
