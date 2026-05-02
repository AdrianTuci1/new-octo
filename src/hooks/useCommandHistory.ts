import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ShellHistoryEntry } from '../types/history';

export function useCommandHistory() {
  const [entries, setEntries] = useState<ShellHistoryEntry[]>([]);

  useEffect(() => {
    void invoke<ShellHistoryEntry[]>('terminal_get_recent_history')
      .then((nextEntries) => {
        setEntries(nextEntries);
      })
      .catch((error) => {
        console.warn('[command-history] failed to load shell history', error);
      });
  }, []);

  return entries;
}
