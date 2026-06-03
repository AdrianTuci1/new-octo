import { useEffect, useState } from 'react';
import { ShellCommandIndexService } from '../services/Filesystem/ShellCommandIndexService';

export function useShellCommandIndex() {
  const [commands, setCommands] = useState<string[]>(() =>
    ShellCommandIndexService.getInstance().getCommands()
  );

  useEffect(() => {
    const service = ShellCommandIndexService.getInstance();
    const unsubscribe = service.subscribe(setCommands);
    void service.load();
    return unsubscribe;
  }, []);

  return commands;
}
