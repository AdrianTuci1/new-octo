import { useEffect, useState } from 'react';
import { TerminalRuntimeContextService } from '../services/Terminal/TerminalRuntimeContextService';
import type { TerminalRuntimeContext } from '../types/terminal';

export function useTerminalRuntimeContext(path: string | null) {
  const [runtimeContext, setRuntimeContext] = useState<TerminalRuntimeContext | null>(() =>
    TerminalRuntimeContextService.getInstance().get(path)
  );

  useEffect(() => {
    void TerminalRuntimeContextService.getInstance().load(path).then(setRuntimeContext);
  }, [path]);

  return runtimeContext;
}
