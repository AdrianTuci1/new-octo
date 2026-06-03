import { useEffect, useState } from 'react';
import { ShellHistoryService } from '../services/Filesystem/ShellHistoryService';
import type { ShellHistoryEntry } from '../types/history';

export function useCommandHistory() {
  const [entries, setEntries] = useState<ShellHistoryEntry[]>(() =>
    ShellHistoryService.getInstance().getEntries()
  );

  useEffect(() => {
    const service = ShellHistoryService.getInstance();
    const unsubscribe = service.subscribe(setEntries);
    void service.load();
    return unsubscribe;
  }, []);

  return entries;
}
