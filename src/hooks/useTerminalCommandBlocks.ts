import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  TerminalBlock,
  TerminalBlockEvent,
  TerminalBlockOutputEvent,
  TerminalCommandBlock,
  TerminalExitEvent,
  TerminalRunCommandResponse,
  TerminalSessionInfo
} from '../types/terminal';

function mergeBlock(block: TerminalBlock, output = ''): TerminalCommandBlock {
  return {
    ...block,
    output,
    status: block.finishedAt ? 'finished' : 'running'
  };
}

export function useTerminalCommandBlocks() {
  const sessionRef = useRef<TerminalSessionInfo | null>(null);
  const sessionPromiseRef = useRef<Promise<TerminalSessionInfo> | null>(null);
  const activeBlockIdRef = useRef<string | null>(null);
  const blocksRef = useRef<TerminalCommandBlock[]>([]);
  const commandInFlightRef = useRef(false);
  const pendingCommandOutputRef = useRef('');
  const pendingOutputRef = useRef<Record<string, string>>({});
  const [blocks, setBlocks] = useState<TerminalCommandBlock[]>([]);
  const [expandedBlockIds, setExpandedBlockIds] = useState<string[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    sessionPromiseRef.current = invoke<TerminalSessionInfo>('terminal_create_session', {
      request: {
        rows: 24,
        cols: 120,
        cwd: null
      }
    })
      .then((session) => {
        sessionRef.current = session;
        return session;
      })
      .finally(() => {
        sessionPromiseRef.current = null;
      });

    return sessionPromiseRef.current;
  }, []);

  const upsertBlock = useCallback((block: TerminalBlock) => {
    setBlocks((currentBlocks) => {
      const existing = currentBlocks.find((currentBlock) => currentBlock.id === block.id);
      const pendingCommandOutput = commandInFlightRef.current ? pendingCommandOutputRef.current : '';
      const pendingOutput = `${pendingOutputRef.current[block.id] ?? ''}${pendingCommandOutput}`;
      const canonicalBlock = existing?.finishedAt && !block.finishedAt ? existing : block;
      const nextBlock = mergeBlock(canonicalBlock, `${existing?.output ?? ''}${pendingOutput}`);

      if (pendingOutput) {
        delete pendingOutputRef.current[block.id];
        pendingCommandOutputRef.current = '';
      }

      if (nextBlock.status === 'running') {
        activeBlockIdRef.current = nextBlock.id;
        commandInFlightRef.current = false;
      } else if (activeBlockIdRef.current === nextBlock.id) {
        activeBlockIdRef.current = null;
      }

      const nextBlocks = existing
        ? currentBlocks.map((currentBlock) => (
            currentBlock.id === nextBlock.id ? nextBlock : currentBlock
          ))
        : [...currentBlocks, nextBlock].slice(-80);
      blocksRef.current = nextBlocks;
      return nextBlocks;
    });
  }, []);

  const appendOutput = useCallback((blockId: string, data: string) => {
    if (!data) return;

    setBlocks((currentBlocks) => {
      if (!currentBlocks.some((block) => block.id === blockId)) {
        pendingOutputRef.current[blockId] = `${pendingOutputRef.current[blockId] ?? ''}${data}`;
        return currentBlocks;
      }

      const nextBlocks = currentBlocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              output: `${block.output}${data}`
            }
          : block
      );
      blocksRef.current = nextBlocks;
      return nextBlocks;
    });
  }, []);

  useEffect(() => {
    let disposed = false;

    const blockSubscription = listen<TerminalBlockEvent>('terminal:block', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      upsertBlock(event.payload.block);
    });

    const blockOutputSubscription = listen<TerminalBlockOutputEvent>('terminal:block-output', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      appendOutput(event.payload.blockId, event.payload.data);
    });

    const exitSubscription = listen<TerminalExitEvent>('terminal:exit', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      sessionRef.current = null;
      setError(
        typeof event.payload.exitCode === 'number'
          ? `Terminal session exited with code ${event.payload.exitCode}.`
          : 'Terminal session exited.'
      );
    });

    const subscriptions = Promise.all([
      blockSubscription,
      blockOutputSubscription,
      exitSubscription
    ]);

    return () => {
      disposed = true;
      void subscriptions.then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });

      const activeSession = sessionRef.current;
      if (activeSession) {
        void invoke('terminal_kill_session', {
          request: {
            sessionId: activeSession.id
          }
        });
      }

      if (disposed) {
        sessionRef.current = null;
      }
    };
  }, [appendOutput, upsertBlock]);

  const runCommand = useCallback(
    async (command: string): Promise<TerminalRunCommandResponse | null> => {
      const normalized = command.trim();
      if (!normalized) return null;

      try {
        setError(null);
        commandInFlightRef.current = true;
        pendingCommandOutputRef.current = '';
        const session = await ensureSession();
        const response = await invoke<TerminalRunCommandResponse>('terminal_run_command', {
          request: {
            sessionId: session.id,
            command: normalized
          }
        });
        activeBlockIdRef.current = response.block.finishedAt ? null : response.block.id;
        commandInFlightRef.current = false;
        if (response.output) {
          appendOutput(response.block.id, response.output);
        }
        upsertBlock(response.block);
        return response;
      } catch (reason) {
        commandInFlightRef.current = false;
        setError(String(reason));
        return null;
      }
    },
    [ensureSession, upsertBlock]
  );

  const clearBlocks = useCallback(() => {
    const activeSession = sessionRef.current;
    if (activeSession) {
      void invoke('terminal_kill_session', {
        request: {
          sessionId: activeSession.id
        }
      });
    }

    activeBlockIdRef.current = null;
    blocksRef.current = [];
    commandInFlightRef.current = false;
    pendingCommandOutputRef.current = '';
    pendingOutputRef.current = {};
    sessionRef.current = null;
    sessionPromiseRef.current = null;
    setBlocks([]);
    setExpandedBlockIds([]);
    setError(null);
    setSelectedBlockId(null);
  }, []);

  const expandBlock = useCallback((blockId: string) => {
    setExpandedBlockIds((currentIds) => (
      currentIds.includes(blockId) ? currentIds : [...currentIds, blockId]
    ));
  }, []);

  const collapseBlock = useCallback((blockId: string) => {
    setExpandedBlockIds((currentIds) => currentIds.filter((currentId) => currentId !== blockId));
    setSelectedBlockId((currentId) => (currentId === blockId ? null : currentId));
  }, []);

  return {
    blocks,
    clearBlocks,
    collapseBlock,
    error,
    expandedBlockIds,
    expandBlock,
    runCommand,
    selectedBlockId,
    setSelectedBlockId
  };
}
