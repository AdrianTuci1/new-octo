import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  TerminalBlock,
  TerminalBlockEvent,
  TerminalBlockOutputEvent,
  TerminalBlockSharedMeta,
  TerminalCommandBlock,
  TerminalCommandSource,
  TerminalExitEvent,
  TerminalRunCommandResponse,
  TerminalSessionInfo
} from '../types/terminal';

type RunCommandOptions = {
  source?: TerminalCommandSource;
};

type UseTerminalCommandBlocksOptions = {
  cwd?: string | null;
  initialSessionId?: string | null;
  sharedBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
  sharedSyntheticBlocks?: TerminalCommandBlock[];
  persistSession?: boolean;
  onBlockMetaChange?: (metaById: Record<string, TerminalBlockSharedMeta>) => void;
  onSyntheticBlocksChange?: (blocks: TerminalCommandBlock[]) => void;
  onSessionChange?: (sessionId: string | null) => void;
};

function mergeBlock(
  block: TerminalBlock,
  output = '',
  meta?: TerminalBlockSharedMeta
): TerminalCommandBlock {
  return {
    ...block,
    output: output || block.output || '',
    status: block.finishedAt ? 'finished' : 'running',
    presentation: meta?.presentation ?? 'command',
    source: meta?.source,
    conversationId: meta?.conversationId,
    conversationTitle: meta?.conversationTitle
  };
}

const EMPTY_META: Record<string, TerminalBlockSharedMeta> = {};
const EMPTY_SYNTHETIC_BLOCKS: TerminalCommandBlock[] = [];

function sortTimelineBlocks(blocks: TerminalCommandBlock[]) {
  return [...blocks].sort((left, right) => {
    const leftTime = Date.parse(left.startedAt || '') || 0;
    const rightTime = Date.parse(right.startedAt || '') || 0;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });
}

export function useTerminalCommandBlocks(options: UseTerminalCommandBlocksOptions = {}) {
  const cwd = options.cwd ?? null;
  const initialSessionId = options.initialSessionId ?? null;
  const sharedBlockMetaById = options.sharedBlockMetaById ?? EMPTY_META;
  const sharedSyntheticBlocks = options.sharedSyntheticBlocks ?? EMPTY_SYNTHETIC_BLOCKS;
  const persistSession = options.persistSession ?? false;
  const onBlockMetaChange = options.onBlockMetaChange;
  const onSyntheticBlocksChange = options.onSyntheticBlocksChange;
  const onSessionChange = options.onSessionChange;
  const sessionRef = useRef<TerminalSessionInfo | null>(null);
  const sessionPromiseRef = useRef<Promise<TerminalSessionInfo> | null>(null);
  const persistedSessionIdRef = useRef<string | null>(initialSessionId);
  const sharedBlockMetaRef = useRef<Record<string, TerminalBlockSharedMeta>>(sharedBlockMetaById);
  const syntheticBlocksRef = useRef<TerminalCommandBlock[]>(sharedSyntheticBlocks);
  const activeBlockIdRef = useRef<string | null>(null);
  const blocksRef = useRef<TerminalCommandBlock[]>([]);
  const commandBlocksRef = useRef<TerminalCommandBlock[]>([]);
  const commandInFlightRef = useRef(false);
  const pendingCommandOutputRef = useRef('');
  const pendingOutputRef = useRef<Record<string, string>>({});
  const blockOptionsRef = useRef<Record<string, RunCommandOptions>>({});
  const [blocks, setBlocks] = useState<TerminalCommandBlock[]>([]);
  const [expandedBlockIds, setExpandedBlockIds] = useState<string[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sharedBlockMetaRef.current = sharedBlockMetaById;
  }, [sharedBlockMetaById]);

  const publishBlockMeta = useCallback((metaById: Record<string, TerminalBlockSharedMeta>) => {
    onBlockMetaChange?.(metaById);
  }, [onBlockMetaChange]);

  const publishSyntheticBlocks = useCallback((nextBlocks: TerminalCommandBlock[]) => {
    onSyntheticBlocksChange?.(sortTimelineBlocks(nextBlocks));
  }, [onSyntheticBlocksChange]);

  const applySharedMeta = useCallback((block: TerminalCommandBlock) => ({
    ...block,
    ...sharedBlockMetaRef.current[block.id],
    presentation: sharedBlockMetaRef.current[block.id]?.presentation ?? block.presentation ?? 'command'
  }), []);

  const commitTimeline = useCallback((nextCommandBlocks: TerminalCommandBlock[], nextSyntheticBlocks = syntheticBlocksRef.current) => {
    commandBlocksRef.current = nextCommandBlocks;
    syntheticBlocksRef.current = sortTimelineBlocks(nextSyntheticBlocks.map((block) => applySharedMeta(block)));
    const nextBlocks = sortTimelineBlocks([
      ...commandBlocksRef.current,
      ...syntheticBlocksRef.current
    ]);
    blocksRef.current = nextBlocks;
    setBlocks(nextBlocks);
  }, [applySharedMeta]);

  useEffect(() => {
    const normalizedSyntheticBlocks = sharedSyntheticBlocks.map((block) => applySharedMeta({
      ...block,
      presentation: block.presentation ?? 'conversation-link'
    }));
    commitTimeline(commandBlocksRef.current, normalizedSyntheticBlocks);
  }, [applySharedMeta, commitTimeline, sharedSyntheticBlocks]);

  const replaceBlocks = useCallback((nextBlocks: TerminalCommandBlock[]) => {
    const normalizedBlocks = nextBlocks.map((block) => applySharedMeta({
      ...block,
      presentation: block.presentation ?? 'command'
    }));
    const runningBlocks = normalizedBlocks.filter((block) => block.status === 'running');
    activeBlockIdRef.current = runningBlocks[runningBlocks.length - 1]?.id ?? null;
    blocksRef.current = normalizedBlocks;
    pendingCommandOutputRef.current = '';
    pendingOutputRef.current = {};
    blockOptionsRef.current = Object.fromEntries(
      normalizedBlocks.map((block) => [block.id, { source: block.source }])
    );
    commitTimeline(normalizedBlocks);
    setExpandedBlockIds([]);
    setSelectedBlockId(null);
    setError(null);
  }, [applySharedMeta, commitTimeline]);

  const upsertBlockMeta = useCallback((blockId: string, meta: TerminalBlockSharedMeta) => {
    publishBlockMeta({
      ...sharedBlockMetaRef.current,
      [blockId]: {
        ...(sharedBlockMetaRef.current[blockId] ?? {}),
        ...meta
      }
    });
  }, [publishBlockMeta]);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    sessionPromiseRef.current = invoke<TerminalSessionInfo>('terminal_create_session', {
      request: {
        sessionId: persistedSessionIdRef.current,
        rows: 24,
        cols: 120,
        cwd: cwd ?? null
      }
    })
      .then((session) => {
        sessionRef.current = session;
        if (persistedSessionIdRef.current !== session.id) {
          persistedSessionIdRef.current = session.id;
          onSessionChange?.(session.id);
        }
        return session;
      })
      .finally(() => {
        sessionPromiseRef.current = null;
      });

    return sessionPromiseRef.current;
  }, [cwd, onSessionChange]);

  const upsertBlock = useCallback((block: TerminalBlock) => {
    setBlocks((currentBlocks) => {
      const currentCommandBlocks = currentBlocks.filter((currentBlock) => currentBlock.presentation !== 'conversation-link');
      const existing = currentCommandBlocks.find((currentBlock) => currentBlock.id === block.id);
      const pendingCommandOutput = commandInFlightRef.current ? pendingCommandOutputRef.current : '';
      const pendingOutput = `${pendingOutputRef.current[block.id] ?? ''}${pendingCommandOutput}`;
      const canonicalBlock = existing?.finishedAt && !block.finishedAt ? existing : block;
      const sharedMeta = sharedBlockMetaRef.current[block.id];
      const nextBlock = applySharedMeta({
        ...mergeBlock(canonicalBlock, `${existing?.output ?? ''}${pendingOutput}`, sharedMeta),
        source: existing?.source ?? sharedMeta?.source ?? blockOptionsRef.current[block.id]?.source
      });

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

      const nextCommandBlocks = existing
        ? currentCommandBlocks.map((currentBlock) => (
            currentBlock.id === nextBlock.id ? nextBlock : currentBlock
          ))
        : [...currentCommandBlocks, nextBlock].slice(-80);
      commitTimeline(nextCommandBlocks);
      return sortTimelineBlocks([
        ...nextCommandBlocks,
        ...syntheticBlocksRef.current
      ]);
    });
  }, [applySharedMeta, commitTimeline]);

  const appendOutput = useCallback((blockId: string, data: string) => {
    if (!data) return;

    setBlocks((currentBlocks) => {
      const currentCommandBlocks = currentBlocks.filter((block) => block.presentation !== 'conversation-link');
      if (!currentCommandBlocks.some((block) => block.id === blockId)) {
        pendingOutputRef.current[blockId] = `${pendingOutputRef.current[blockId] ?? ''}${data}`;
        return currentBlocks;
      }

      const nextCommandBlocks = currentCommandBlocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              output: `${block.output}${data}`
            }
          : block
      );
      commitTimeline(nextCommandBlocks);
      return sortTimelineBlocks([
        ...nextCommandBlocks,
        ...syntheticBlocksRef.current
      ]);
    });
  }, [commitTimeline]);

  useEffect(() => {
    persistedSessionIdRef.current = initialSessionId;
  }, [initialSessionId]);

  useEffect(() => {
    const requestedSessionId = initialSessionId?.trim() || null;
    if (!requestedSessionId) {
      return;
    }

    let cancelled = false;
    sessionRef.current = {
      id: requestedSessionId,
      shell: sessionRef.current?.shell ?? '',
      cwd: sessionRef.current?.cwd ?? cwd
    };

    void Promise.all([
      invoke<TerminalSessionInfo>('terminal_create_session', {
        request: {
          sessionId: requestedSessionId,
          rows: 24,
          cols: 120,
          cwd: cwd ?? null
        }
      }),
      invoke<TerminalBlock[]>('terminal_get_blocks', {
        request: {
          sessionId: requestedSessionId
        }
      }).catch(() => [])
    ]).then(([sessionInfo, nextBlocks]) => {
      if (cancelled) {
        return;
      }

      sessionRef.current = sessionInfo;
      persistedSessionIdRef.current = sessionInfo.id;
      onSessionChange?.(sessionInfo.id);
      replaceBlocks(nextBlocks.map((block) => mergeBlock(block, '', sharedBlockMetaRef.current[block.id])));
    }).catch(() => {
      if (cancelled) {
        return;
      }

      sessionRef.current = null;
      persistedSessionIdRef.current = null;
      onSessionChange?.(null);
      replaceBlocks([]);
    });

    return () => {
      cancelled = true;
    };
  }, [cwd, initialSessionId, onSessionChange, replaceBlocks]);

  useEffect(() => {
    commitTimeline(commandBlocksRef.current, syntheticBlocksRef.current);
  }, [applySharedMeta, commitTimeline]);

  useEffect(() => {
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
      void subscriptions.then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });

      const activeSession = sessionRef.current;
      if (activeSession) {
        void invoke(persistSession ? 'terminal_release_session' : 'terminal_kill_session', {
          request: {
            sessionId: activeSession.id
          }
        });
      }

      sessionRef.current = null;
    };
  }, [appendOutput, persistSession, upsertBlock]);

  useEffect(() => {
    const activeSession = sessionRef.current;
    if (!activeSession || activeSession.cwd === (cwd ?? null)) {
      return;
    }

    void invoke('terminal_kill_session', {
      request: {
        sessionId: activeSession.id
      }
    }).catch(() => {});

    if (persistSession) {
      onSessionChange?.(null);
      persistedSessionIdRef.current = null;
    }

    sessionRef.current = null;
    sessionPromiseRef.current = null;
    commandInFlightRef.current = false;
    activeBlockIdRef.current = null;
    pendingCommandOutputRef.current = '';
    pendingOutputRef.current = {};
    blockOptionsRef.current = {};
    setError(null);
    setBlocks([]);
  }, [cwd, onSessionChange, persistSession]);

  const runCommand = useCallback(
    async (command: string, options: RunCommandOptions = {}): Promise<TerminalRunCommandResponse | null> => {
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
        blockOptionsRef.current[response.block.id] = options;
        if (options.source) {
          upsertBlockMeta(response.block.id, {
            presentation: 'command',
            source: options.source
          });
        }
        activeBlockIdRef.current = response.block.finishedAt ? null : response.block.id;
        commandInFlightRef.current = false;
        upsertBlock(response.block);
        return response;
      } catch (reason) {
        commandInFlightRef.current = false;
        setError(String(reason));
        return null;
      }
    },
    [appendOutput, ensureSession, upsertBlock, upsertBlockMeta]
  );

  const clearBlocks = useCallback(() => {
    const activeSession = sessionRef.current;
    if (activeSession) {
      void invoke('terminal_kill_session', {
        request: {
          sessionId: activeSession.id
        }
      }).catch(() => {});
    }

    activeBlockIdRef.current = null;
    blocksRef.current = [];
    commandBlocksRef.current = [];
    syntheticBlocksRef.current = [];
    commandInFlightRef.current = false;
    pendingCommandOutputRef.current = '';
    pendingOutputRef.current = {};
    blockOptionsRef.current = {};
    sessionRef.current = null;
    sessionPromiseRef.current = null;
    persistedSessionIdRef.current = null;
    publishBlockMeta({});
    publishSyntheticBlocks([]);
    onSessionChange?.(null);
    setBlocks([]);
    setExpandedBlockIds([]);
    setError(null);
    setSelectedBlockId(null);
  }, [onSessionChange, publishBlockMeta, publishSyntheticBlocks]);

  const upsertSyntheticBlock = useCallback((block: TerminalCommandBlock) => {
    const syntheticBlock: TerminalCommandBlock = applySharedMeta({
      ...block,
      presentation: block.presentation ?? 'conversation-link'
    });
    upsertBlockMeta(syntheticBlock.id, {
      presentation: syntheticBlock.presentation,
      source: syntheticBlock.source,
      conversationId: syntheticBlock.conversationId,
      conversationTitle: syntheticBlock.conversationTitle
    });

    const currentSyntheticBlocks = syntheticBlocksRef.current;
    const existingIndex = currentSyntheticBlocks.findIndex((currentBlock) => currentBlock.id === syntheticBlock.id);
    const nextSyntheticBlocks = existingIndex >= 0
      ? currentSyntheticBlocks.map((currentBlock) => (currentBlock.id === syntheticBlock.id ? syntheticBlock : currentBlock))
      : [...currentSyntheticBlocks, syntheticBlock].slice(-80);
    publishSyntheticBlocks(nextSyntheticBlocks);
    commitTimeline(commandBlocksRef.current, nextSyntheticBlocks);
  }, [applySharedMeta, commitTimeline, publishSyntheticBlocks, upsertBlockMeta]);

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
    replaceBlocks,
    runCommand,
    sessionId: persistedSessionIdRef.current,
    selectedBlockId,
    setSelectedBlockId,
    upsertSyntheticBlock
  };
}
