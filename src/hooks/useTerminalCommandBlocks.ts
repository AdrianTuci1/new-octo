import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  TerminalBlock,
  TerminalBlockEvent,
  TerminalBlockOutputEvent,
  TerminalBlockSharedMeta,
  TerminalCompletionResultEvent,
  TerminalCompletionState,
  TerminalCompletionUpdateEvent,
  TerminalCompletionsFinishedEvent,
  TerminalCompletionsPromptEvent,
  TerminalCompletionsStartedEvent,
  TerminalCommandBlock,
  TerminalCommandSource,
  TerminalExitEvent,
  TerminalSessionCwdEvent,
  TerminalSessionStateEvent,
  TerminalRunCommandResponse,
  TerminalSessionInfo,
  TerminalSessionTarget
} from '../types/terminal';

type RunCommandOptions = {
  source?: TerminalCommandSource;
  waitForCompletion?: boolean;
};

type UseTerminalCommandBlocksOptions = {
  cwd?: string | null;
  initialSessionId?: string | null;
  target?: TerminalSessionTarget | null;
  sharedBlockMetaById?: Record<string, TerminalBlockSharedMeta>;
  sharedCommandBlocks?: TerminalCommandBlock[];
  sharedSyntheticBlocks?: TerminalCommandBlock[];
  persistSession?: boolean;
  onBlockMetaChange?: (metaById: Record<string, TerminalBlockSharedMeta>) => void;
  onCommandBlocksChange?: (blocks: TerminalCommandBlock[]) => void;
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
  const target = options.target ?? null;
  const sharedBlockMetaById = options.sharedBlockMetaById ?? EMPTY_META;
  const sharedCommandBlocks = options.sharedCommandBlocks ?? EMPTY_SYNTHETIC_BLOCKS;
  const sharedSyntheticBlocks = options.sharedSyntheticBlocks ?? EMPTY_SYNTHETIC_BLOCKS;
  const persistSession = options.persistSession ?? false;
  const onBlockMetaChange = options.onBlockMetaChange;
  const onCommandBlocksChange = options.onCommandBlocksChange;
  const onSyntheticBlocksChange = options.onSyntheticBlocksChange;
  const onSessionChange = options.onSessionChange;
  const sessionRef = useRef<TerminalSessionInfo | null>(null);
  const sessionPromiseRef = useRef<Promise<TerminalSessionInfo> | null>(null);
  const persistedSessionIdRef = useRef<string | null>(initialSessionId);
  const sessionOriginCwdRef = useRef<string | null>(cwd);
  const sharedBlockMetaRef = useRef<Record<string, TerminalBlockSharedMeta>>(sharedBlockMetaById);
  const commandBlocksRef = useRef<TerminalCommandBlock[]>(sharedCommandBlocks);
  const syntheticBlocksRef = useRef<TerminalCommandBlock[]>(sharedSyntheticBlocks);
  const activeBlockIdRef = useRef<string | null>(null);
  const didResolveInitialCwdRef = useRef(cwd !== null);
  const blocksRef = useRef<TerminalCommandBlock[]>([]);
  const commandInFlightRef = useRef(false);
  const pendingCommandOutputRef = useRef('');
  const pendingOutputRef = useRef<Record<string, string>>({});
  const outputBufferRef = useRef<Record<string, string>>({});
  const outputFlushFrameRef = useRef<number | null>(null);
  const blockOptionsRef = useRef<Record<string, RunCommandOptions>>({});
  const [blocks, setBlocks] = useState<TerminalCommandBlock[]>([]);
  const [expandedBlockIds, setExpandedBlockIds] = useState<string[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionCwd, setSessionCwd] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<TerminalSessionInfo | null>(null);
  const [completionState, setCompletionState] = useState<TerminalCompletionState | null>(null);

  useEffect(() => {
    sharedBlockMetaRef.current = sharedBlockMetaById;
  }, [sharedBlockMetaById]);

  const publishBlockMeta = useCallback((metaById: Record<string, TerminalBlockSharedMeta>) => {
    onBlockMetaChange?.(metaById);
  }, [onBlockMetaChange]);

  const publishCommandBlocks = useCallback((nextBlocks: TerminalCommandBlock[]) => {
    onCommandBlocksChange?.(sortTimelineBlocks(nextBlocks));
  }, [onCommandBlocksChange]);

  const publishSyntheticBlocks = useCallback((nextBlocks: TerminalCommandBlock[]) => {
    onSyntheticBlocksChange?.(sortTimelineBlocks(nextBlocks));
  }, [onSyntheticBlocksChange]);

  const applySharedMeta = useCallback((block: TerminalCommandBlock) => ({
    ...block,
    ...sharedBlockMetaRef.current[block.id],
    presentation: sharedBlockMetaRef.current[block.id]?.presentation ?? block.presentation ?? 'command'
  }), []);

  const commitTimeline = useCallback((nextCommandBlocks: TerminalCommandBlock[], nextSyntheticBlocks = syntheticBlocksRef.current) => {
    const normalizedCommandBlocks = sortTimelineBlocks(nextCommandBlocks.map((block) => applySharedMeta(block)));
    const normalizedSyntheticBlocks = sortTimelineBlocks(nextSyntheticBlocks.map((block) => applySharedMeta(block)));

    commandBlocksRef.current = normalizedCommandBlocks;
    syntheticBlocksRef.current = normalizedSyntheticBlocks;
    publishCommandBlocks(commandBlocksRef.current);
    const nextBlocks = sortTimelineBlocks([
      ...commandBlocksRef.current,
      ...syntheticBlocksRef.current
    ]);
    blocksRef.current = nextBlocks;
    setBlocks(nextBlocks);
  }, [applySharedMeta, publishCommandBlocks]);

  const flushBufferedOutputs = useCallback(() => {
    const bufferedEntries = Object.entries(outputBufferRef.current);
    if (bufferedEntries.length === 0) {
      return;
    }

    const currentBuffer = outputBufferRef.current;
    const nextBuffer: Record<string, string> = {};
    const currentCommandBlocks = commandBlocksRef.current;
    const currentBlockIds = new Set(currentCommandBlocks.map((block) => block.id));
    const nextCommandBlocks = currentCommandBlocks.map((block) => {
      const addition = currentBuffer[block.id];
      if (!addition) {
        return block;
      }

      return {
        ...block,
        output: `${block.output}${addition}`
      };
    });

    bufferedEntries.forEach(([blockId, addition]) => {
      if (!currentBlockIds.has(blockId)) {
        nextBuffer[blockId] = addition;
      }
    });

    outputBufferRef.current = nextBuffer;

    if (nextCommandBlocks.every((block, index) => block === currentCommandBlocks[index])) {
      return;
    }

    commitTimeline(nextCommandBlocks);
  }, [commitTimeline]);

  const scheduleOutputFlush = useCallback(() => {
    if (outputFlushFrameRef.current !== null) {
      return;
    }

    outputFlushFrameRef.current = window.requestAnimationFrame(() => {
      outputFlushFrameRef.current = null;
      flushBufferedOutputs();
    });
  }, [flushBufferedOutputs]);

  const lastSharedSyntheticBlocksRef = useRef<TerminalCommandBlock[]>(sharedSyntheticBlocks);
  const lastSharedCommandBlocksRef = useRef<TerminalCommandBlock[]>(sharedCommandBlocks);

  useEffect(() => {
    if (lastSharedCommandBlocksRef.current === sharedCommandBlocks && commandBlocksRef.current.length === sharedCommandBlocks.length) {
      return;
    }
    lastSharedCommandBlocksRef.current = sharedCommandBlocks;
    commitTimeline(sharedCommandBlocks, syntheticBlocksRef.current);
  }, [commitTimeline, sharedCommandBlocks]);

  useEffect(() => {
    if (lastSharedSyntheticBlocksRef.current === sharedSyntheticBlocks && syntheticBlocksRef.current.length === sharedSyntheticBlocks.length) {
      return;
    }
    lastSharedSyntheticBlocksRef.current = sharedSyntheticBlocks;

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
    outputBufferRef.current = {};
    if (outputFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(outputFlushFrameRef.current);
      outputFlushFrameRef.current = null;
    }
    blockOptionsRef.current = Object.fromEntries(
      normalizedBlocks.map((block) => [block.id, { source: block.source }])
    );
    commitTimeline(normalizedBlocks);
    setExpandedBlockIds([]);
    setSelectedBlockId(null);
    setError(null);
    setCompletionState(null);
  }, [applySharedMeta, commitTimeline]);

  const resetCompletionState = useCallback(() => {
    setCompletionState(null);
  }, []);

  const upsertCompletionState = useCallback((
    updater: (current: TerminalCompletionState | null) => TerminalCompletionState | null
  ) => {
    setCompletionState((current) => updater(current));
  }, []);

  const upsertBlockMeta = useCallback((blockId: string, meta: TerminalBlockSharedMeta) => {
    const nextMetaById = {
      ...sharedBlockMetaRef.current,
      [blockId]: {
        ...(sharedBlockMetaRef.current[blockId] ?? {}),
        ...meta
      }
    };

    // Keep metadata available locally immediately so a session re-sync cannot
    // temporarily rebuild the block as an assistant command before parent state catches up.
    sharedBlockMetaRef.current = nextMetaById;
    publishBlockMeta(nextMetaById);
    commitTimeline(commandBlocksRef.current, syntheticBlocksRef.current);
  }, [commitTimeline, publishBlockMeta]);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    sessionPromiseRef.current = invoke<TerminalSessionInfo>('terminal_create_session', {
      request: {
        sessionId: persistedSessionIdRef.current,
        rows: 24,
        cols: 120,
        cwd: cwd ?? null,
        target: target ?? undefined
      }
    })
      .then((session) => {
        sessionRef.current = session;
        setSessionInfo(session);
        setSessionCwd(session.cwd ?? null);
        sessionOriginCwdRef.current = session.cwd ?? cwd;
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
  }, [cwd, onSessionChange, target]);

  const upsertBlock = useCallback((block: TerminalBlock) => {
    const currentCommandBlocks = commandBlocksRef.current;
    const existing = currentCommandBlocks.find((currentBlock) => currentBlock.id === block.id);
    const pendingCommandOutput = commandInFlightRef.current ? pendingCommandOutputRef.current : '';
    const bufferedOutput = outputBufferRef.current[block.id] ?? '';
    delete outputBufferRef.current[block.id];
    const pendingOutput = `${pendingOutputRef.current[block.id] ?? ''}${pendingCommandOutput}${bufferedOutput}`;
    const canonicalBlock = existing?.finishedAt && !block.finishedAt ? existing : block;
    const sharedMeta = sharedBlockMetaRef.current[block.id];
    const source = existing?.source ?? sharedMeta?.source ?? blockOptionsRef.current[block.id]?.source ?? (commandInFlightRef.current && pendingCommandOutputRef.current === '' ? blockOptionsRef.current['PENDING']?.source : undefined);

    const nextBlock = applySharedMeta({
      ...mergeBlock(canonicalBlock, `${existing?.output ?? ''}${pendingOutput}`, sharedMeta),
      source
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
  }, [applySharedMeta, commitTimeline]);

  const appendOutput = useCallback((blockId: string, data: string) => {
    if (!data) return;

    outputBufferRef.current[blockId] = `${outputBufferRef.current[blockId] ?? ''}${data}`;
    scheduleOutputFlush();
  }, [scheduleOutputFlush]);

  useEffect(() => {
    persistedSessionIdRef.current = initialSessionId;
  }, [initialSessionId]);

  useEffect(() => {
    const requestedSessionId = initialSessionId?.trim() || null;
    if (!requestedSessionId) {
      return;
    }

    // IDEMPOTENCY GUARD:
    // If the session object currently stored matches the requested ID and the current path,
    // we shouldn't clear and re-bootstrap anything as it would overwrite active component state (like expandedBlockIds).
    if (sessionRef.current?.id === requestedSessionId && sessionOriginCwdRef.current === cwd) {
      return;
    }

    let cancelled = false;
    sessionRef.current = {
      id: requestedSessionId,
      shell: sessionRef.current?.shell ?? '',
      kind: sessionRef.current?.kind ?? 'local',
      provider: sessionRef.current?.provider ?? 'local',
      status: sessionRef.current?.status ?? 'starting',
      cwd: sessionRef.current?.cwd ?? cwd
    };
    setSessionInfo(sessionRef.current);
    sessionOriginCwdRef.current = cwd;
    setSessionCwd(sessionRef.current.cwd ?? null);

    void Promise.all([
      invoke<TerminalSessionInfo>('terminal_create_session', {
        request: {
          sessionId: requestedSessionId,
          rows: 24,
          cols: 120,
          cwd: cwd ?? null,
          target: target ?? undefined
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
      setSessionInfo(sessionInfo);
      setSessionCwd(sessionInfo.cwd ?? null);
      sessionOriginCwdRef.current = sessionInfo.cwd ?? cwd;
      persistedSessionIdRef.current = sessionInfo.id;
      onSessionChange?.(sessionInfo.id);
      replaceBlocks(nextBlocks.map((block) => mergeBlock(block, '', sharedBlockMetaRef.current[block.id])));
    }).catch(() => {
      if (cancelled) {
        return;
      }

      sessionRef.current = null;
      setSessionInfo(null);
      setSessionCwd(null);
      persistedSessionIdRef.current = null;
      onSessionChange?.(null);
      replaceBlocks([]);
    });

    return () => {
      cancelled = true;
    };
  }, [cwd, initialSessionId, onSessionChange, replaceBlocks, target]);

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
      setSessionInfo(null);
      setSessionCwd(null);
      setCompletionState(null);
      setError(
        typeof event.payload.exitCode === 'number'
          ? `Terminal session exited with code ${event.payload.exitCode}.`
          : 'Terminal session exited.'
      );
    });

    const sessionCwdSubscription = listen<TerminalSessionCwdEvent>('terminal:session-cwd', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      sessionRef.current = {
        ...activeSession,
        cwd: event.payload.cwd ?? null
      };
      setSessionInfo(sessionRef.current);
      setSessionCwd(event.payload.cwd ?? null);
    });

    const sessionStateSubscription = listen<TerminalSessionStateEvent>('terminal:session-state', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      const nextSessionInfo: TerminalSessionInfo = {
        ...activeSession,
        kind: event.payload.kind,
        provider: event.payload.provider,
        status: event.payload.status,
        cwd: event.payload.cwd ?? activeSession.cwd ?? null,
        profileId: event.payload.profileId ?? activeSession.profileId ?? null
      };

      sessionRef.current = nextSessionInfo;
      setSessionInfo(nextSessionInfo);
      if (event.payload.cwd !== undefined) {
        setSessionCwd(event.payload.cwd ?? null);
      }
    });

    const completionsStartedSubscription = listen<TerminalCompletionsStartedEvent>('terminal:completions-started', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      setCompletionState({
        status: 'running',
        format: event.payload.format,
        promptVisible: false,
        completions: [],
        lastValue: null
      });
    });

    const completionsFinishedSubscription = listen<TerminalCompletionsFinishedEvent>('terminal:completions-finished', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;
      const lastCompletion = event.payload.data[event.payload.data.length - 1] ?? null;

      setCompletionState((current) => ({
        status: 'finished',
        format: current?.format ?? null,
        promptVisible: false,
        completions: event.payload.data,
        lastValue: lastCompletion?.description ?? lastCompletion?.name ?? null
      }));
    });

    const completionResultSubscription = listen<TerminalCompletionResultEvent>('terminal:completion-result', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      upsertCompletionState((current) => {
        if (!current) {
          return {
            status: 'running',
            format: null,
            promptVisible: false,
            completions: [event.payload.completion],
            lastValue: event.payload.completion.description ?? event.payload.completion.name
          };
        }

        const existingIndex = current.completions.findIndex((item) => item.name === event.payload.completion.name);
        const nextCompletions = existingIndex >= 0
          ? current.completions.map((item, index) => (
              index === existingIndex ? event.payload.completion : item
            ))
          : [...current.completions, event.payload.completion];

        return {
          ...current,
          completions: nextCompletions,
          lastValue: event.payload.completion.description ?? event.payload.completion.name
        };
      });
    });

    const completionUpdateSubscription = listen<TerminalCompletionUpdateEvent>('terminal:completion-update', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      upsertCompletionState((current) => {
        if (!current) return current;
        const nextCompletions = current.completions.length === 0
          ? current.completions
          : current.completions.map((item, index) => (
              index === current.completions.length - 1
                ? { ...item, description: event.payload.value }
                : item
            ));

        return {
          ...current,
          completions: nextCompletions,
          lastValue: event.payload.value
        };
      });
    });

    const completionsPromptSubscription = listen<TerminalCompletionsPromptEvent>('terminal:completions-prompt', (event) => {
      const activeSession = sessionRef.current;
      if (!activeSession || event.payload.sessionId !== activeSession.id) return;

      upsertCompletionState((current) => {
        if (!current) {
          return {
            status: 'running',
            format: null,
            promptVisible: true,
            completions: [],
            lastValue: null
          };
        }

        return {
          ...current,
          status: current.status === 'finished' ? 'running' : current.status,
          promptVisible: true
        };
      });
    });

    const subscriptions = Promise.all([
      blockSubscription,
      blockOutputSubscription,
      exitSubscription,
      sessionCwdSubscription,
      sessionStateSubscription,
      completionsStartedSubscription,
      completionsFinishedSubscription,
      completionResultSubscription,
      completionUpdateSubscription,
      completionsPromptSubscription
    ]);

    return () => {
      let hasUnlistened = false;
      void subscriptions.then((unlisteners) => {
        if (hasUnlistened) return;
        hasUnlistened = true;
        unlisteners.forEach((unlisten) => {
          try {
            unlisten();
          } catch (e) {
            console.warn('[terminal-blocks] failed to unlisten safely', e);
          }
        });
      });
      hasUnlistened = true;

      const activeSession = sessionRef.current;
      if (activeSession) {
        void invoke(persistSession ? 'terminal_release_session' : 'terminal_kill_session', {
          request: {
            sessionId: activeSession.id
          }
        });
      }

      sessionRef.current = null;
      setSessionInfo(null);
      resetCompletionState();
      outputBufferRef.current = {};
      if (outputFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(outputFlushFrameRef.current);
        outputFlushFrameRef.current = null;
      }
    };
  }, [appendOutput, persistSession, resetCompletionState, upsertBlock, upsertCompletionState]);

  useEffect(() => {
    const activeSession = sessionRef.current;
    const currentCwd = cwd ?? null;

    if (!didResolveInitialCwdRef.current) {
      if (currentCwd !== null) {
        didResolveInitialCwdRef.current = true;
      }

      sessionOriginCwdRef.current = currentCwd;
      return;
    }

    if (!activeSession || sessionOriginCwdRef.current === currentCwd) {
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
    sessionOriginCwdRef.current = currentCwd;
    commandInFlightRef.current = false;
    activeBlockIdRef.current = null;
    pendingCommandOutputRef.current = '';
    pendingOutputRef.current = {};
    outputBufferRef.current = {};
    if (outputFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(outputFlushFrameRef.current);
      outputFlushFrameRef.current = null;
    }
    blockOptionsRef.current = {};
    setSessionCwd(null);
    setSessionInfo(null);
    setError(null);
    setBlocks([]);
    setCompletionState(null);
  }, [cwd, onSessionChange, persistSession]);

  const runCommand = useCallback(
    async (command: string, options: RunCommandOptions = {}): Promise<TerminalRunCommandResponse | null> => {
      const normalized = command.trim();
      if (!normalized) return null;

      try {
        setError(null);
        commandInFlightRef.current = true;
        pendingCommandOutputRef.current = '';
        blockOptionsRef.current['PENDING'] = options;
        const session = await ensureSession();
        const response = await invoke<TerminalRunCommandResponse>('terminal_run_command', {
          request: {
            sessionId: session.id,
            command: normalized,
            waitForCompletion: options.waitForCompletion ?? options.source !== 'user'
          }
        });
        blockOptionsRef.current[response.block.id] = options;
        delete blockOptionsRef.current['PENDING'];
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
        delete blockOptionsRef.current['PENDING'];
        setError(String(reason));
        return null;
      }
    },
    [appendOutput, ensureSession, upsertBlock, upsertBlockMeta]
  );

  const clearBlocks = useCallback(() => {
    activeBlockIdRef.current = null;
    blocksRef.current = [];
    commandBlocksRef.current = [];
    syntheticBlocksRef.current = [];
    commandInFlightRef.current = false;
    pendingCommandOutputRef.current = '';
    pendingOutputRef.current = {};
    outputBufferRef.current = {};
    if (outputFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(outputFlushFrameRef.current);
      outputFlushFrameRef.current = null;
    }
    blockOptionsRef.current = {};
    sessionRef.current = null;
    sessionPromiseRef.current = null;
    persistedSessionIdRef.current = null;
    sessionOriginCwdRef.current = cwd;
    setSessionInfo(null);
    setSessionCwd(null);
    setCompletionState(null);
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
    sessionInfo,
    sessionStatus: sessionInfo?.status ?? null,
    sessionKind: sessionInfo?.kind ?? null,
    sessionProvider: sessionInfo?.provider ?? null,
    selectedBlockId,
    setSelectedBlockId,
    cwd: sessionCwd,
    completionState,
    upsertSyntheticBlock
  };
}
