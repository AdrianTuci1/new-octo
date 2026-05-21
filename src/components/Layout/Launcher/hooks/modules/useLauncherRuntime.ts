import { useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as Hooks from '../../../../../hooks';
import { useMemoryStore, useLauncherStore, useUIStore } from '../../../../../stores';
import * as Utils from '../../utils';
import { consumeShellModeActivator } from '../../../../../lib';
import { normalizeAgentSettings } from '../../../../App/settings/agentSettings';
import { normalizeCodeSettings } from '../../../../App/settings/codeSettings';
import type { LauncherProps } from '../types';
import type { CommandApproval, FileChangeApproval } from '../../../../../types';
import type {
  WebSearchRequest,
  WebSearchResponse,
  CloudAgentLaunchRequest,
  WorkspaceExplorationRequest,
  WorkspaceExplorationEntry,
  WorkspaceExplorationSegment,
  WorkspaceExplorationSearch
} from '../../../../../types/chat';
import type { TerminalCommandBlock } from '../../../../../types/terminal';

function sortTerminalBlocksChronologically(blocks: TerminalCommandBlock[]) {
  return [...blocks].sort((left, right) => {
    const leftTime = Date.parse(left.startedAt || '') || 0;
    const rightTime = Date.parse(right.startedAt || '') || 0;

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });
}

function dedupeTerminalBlocks(blocks: TerminalCommandBlock[]) {
  const blockById = new Map<string, TerminalCommandBlock>();
  blocks.forEach((block) => {
    blockById.set(block.id, block);
  });

  return [...blockById.values()];
}

export function useLauncherRuntime(props: LauncherProps, store: any, tray: any) {
  const {
    initialWorkingDirectory = null,
    persistWorkingDirectory = true,
    initialTerminalSessionId = null,
    persistTerminalSession = false,
    initialAgentTerminalSessionId = null,
    startupCommands = [],
    terminalTarget = null,
    agentTerminalTarget = null,
    active = true,
    initialComposerSurface = 'terminal'
  } = props;

  // Use selectors for store to prevent unnecessary re-renders of this orchestrator
  // We use stable selectors here.
  const memoryStore = useMemoryStore();
  const agentSettings = useMemo(() => normalizeAgentSettings(memoryStore.settings?.values), [memoryStore.settings?.values]);
  const codeSettings = useMemo(() => normalizeCodeSettings(memoryStore.settings?.values), [memoryStore.settings?.values]);
  const activeAgentProfile = agentSettings.profiles.find((profile) => profile.id === agentSettings.activeProfileId) ?? agentSettings.profiles[0];
  const activeProfileCallWebTools = activeAgentProfile?.callWebTools !== false;
  const autoIndexedPathsRef = useRef(new Set<string>());
  const setLocalConversationId = useLauncherStore(state => state.setLocalConversationId);
  const setLocalPendingApproval = useLauncherStore(state => state.setLocalPendingApproval);
  const localConversationId = useLauncherStore(state => state.localConversationId);
  const localPendingApproval = useLauncherStore(state => state.localPendingApproval);
  const setComposerSurface = useLauncherStore(state => state.setComposerSurface);
  const setModeLock = useLauncherStore(state => state.setModeLock);
  const openModelDrawer = useUIStore((state) => state.openModelDrawer);

  function fileNameFromPath(path: string) {
    const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
    return normalized.split('/').pop() || normalized;
  }

  const workingDirectoryRaw = Hooks.useWorkingDirectory({
    initialPath: initialWorkingDirectory,
    rememberSelection: persistWorkingDirectory
  });

  const workingDirectory = useMemo(() => workingDirectoryRaw, [
    workingDirectoryRaw.currentPath,
    workingDirectoryRaw.isPickerOpen,
    workingDirectoryRaw.browserPath,
    workingDirectoryRaw.searchQuery,
    workingDirectoryRaw.listing,
    workingDirectoryRaw.homeDir,
    workingDirectoryRaw.buttonLabel
  ]);

  useEffect(() => {
    const path = workingDirectory.currentPath?.trim();
    if (!path || !codeSettings.indexing.enabled || !codeSettings.indexing.indexNewFoldersByDefault || autoIndexedPathsRef.current.has(path)) {
      return;
    }

    autoIndexedPathsRef.current.add(path);
    void invoke('code_index_index_project', { path }).catch((error) => {
      console.warn('[launcher] failed to auto-index working directory', error);
    });
  }, [codeSettings.indexing.enabled, codeSettings.indexing.indexNewFoldersByDefault, workingDirectory.currentPath]);

  const gitContextRaw = Hooks.useGitContext(workingDirectory.currentPath);
  const gitContext = useMemo(() => gitContextRaw, [
    gitContextRaw.gitContext,
    gitContextRaw.isBranchMenuOpen
  ]);

  const runtimeContextRaw = Hooks.useTerminalRuntimeContext(workingDirectory.currentPath);
  const runtimeContext = useMemo(() => runtimeContextRaw, [
    runtimeContextRaw?.nodeVersion
  ]);

  const commandHistory = Hooks.useCommandHistory();
  const modelSelectionRaw = Hooks.useModelSelection();
  const modelSelection = useMemo(() => modelSelectionRaw, [
    modelSelectionRaw.selectedModelId,
    modelSelectionRaw.selectedModelApiId,
    modelSelectionRaw.models,
    modelSelectionRaw.selectedModelLabel,
    modelSelectionRaw.selectedModelSupportsAttachments,
    modelSelectionRaw.isConfigured,
    modelSelectionRaw.requiresModelSetup
  ]);
  const profileBaseModelId = resolveProfileModelId(activeAgentProfile?.baseModel, modelSelectionRaw.selectedModelApiId);
  const profileTerminalModelId = resolveProfileModelId(activeAgentProfile?.terminalModel, null);

  const availableShellCommands = Hooks.useShellCommandIndex();
  const chatApiRef = useRef<any>(null);

  const hasControlledConversation = props.conversationId !== undefined;
  const resolvedConversationId = useMemo(() => hasControlledConversation
    ? (props.conversationId ?? localConversationId ?? null)
    : localConversationId, [hasControlledConversation, props.conversationId, localConversationId]);

  const hasControlledPendingApproval = props.pendingApproval !== undefined;
  const resolvedPendingApproval = useMemo(() => hasControlledPendingApproval
    ? (props.pendingApproval ?? localPendingApproval ?? null)
    : localPendingApproval, [hasControlledPendingApproval, props.pendingApproval, localPendingApproval]);

  const setResolvedPendingApproval = useCallback((approval: CommandApproval | null) => {
    setLocalPendingApproval(approval);
    if (hasControlledPendingApproval) {
      props.onPendingApprovalChange?.(approval);
    }
  }, [hasControlledPendingApproval, props.onPendingApprovalChange, setLocalPendingApproval]);

  const requestCommandApproval = useCallback((approval: CommandApproval) => {
    setResolvedPendingApproval(approval);
  }, [setResolvedPendingApproval]);

  const requestFileChangeApproval = useCallback((approval: FileChangeApproval) => {
    setResolvedPendingApproval(approval);
  }, [setResolvedPendingApproval]);

  const terminalRaw = Hooks.useTerminalCommandBlocks({
    cwd: workingDirectory.currentPath,
    initialSessionId: initialTerminalSessionId,
    target: terminalTarget,
    persistSession: persistTerminalSession,
    sharedBlockMetaById: props.sharedTerminalBlockMetaById,
    sharedCommandBlocks: props.sharedTerminalBlocks,
    sharedSyntheticBlocks: props.sharedSyntheticBlocks,
    onBlockMetaChange: props.onTerminalBlockMetaChange,
    onCommandBlocksChange: props.onTerminalBlocksChange,
    onSyntheticBlocksChange: props.onSyntheticBlocksChange,
    onSessionChange: props.onTerminalSessionChange
  });

  const terminal = useMemo(() => terminalRaw, [
    terminalRaw.blocks,
    terminalRaw.error,
    terminalRaw.sessionId,
    terminalRaw.sessionInfo,
    terminalRaw.sessionStatus,
    terminalRaw.sessionKind,
    terminalRaw.sessionProvider,
    terminalRaw.cwd,
    terminalRaw.completionState,
    terminalRaw.selectedBlockId,
    terminalRaw.expandedBlockIds,
    terminalRaw.collapseBlock,
    terminalRaw.expandBlock,
    terminalRaw.setSelectedBlockId,
    terminalRaw.upsertSyntheticBlock
  ]);

  const agentTerminalRaw = Hooks.useTerminalCommandBlocks({
    cwd: workingDirectory.currentPath,
    initialSessionId: initialAgentTerminalSessionId,
    target: agentTerminalTarget,
    persistSession: persistTerminalSession,
    sharedBlockMetaById: props.sharedAgentTerminalBlockMetaById,
    sharedCommandBlocks: props.sharedAgentTerminalBlocks,
    onBlockMetaChange: props.onAgentTerminalBlockMetaChange,
    onCommandBlocksChange: props.onAgentTerminalBlocksChange,
    onSessionChange: props.onAgentTerminalSessionChange
  });

  const agentTerminal = useMemo(() => agentTerminalRaw, [
    agentTerminalRaw.blocks,
    agentTerminalRaw.error,
    agentTerminalRaw.sessionId,
    agentTerminalRaw.sessionInfo,
    agentTerminalRaw.sessionStatus,
    agentTerminalRaw.sessionKind,
    agentTerminalRaw.sessionProvider,
    agentTerminalRaw.cwd,
    agentTerminalRaw.completionState,
    agentTerminalRaw.selectedBlockId,
    agentTerminalRaw.expandedBlockIds,
    agentTerminalRaw.collapseBlock,
    agentTerminalRaw.expandBlock,
    agentTerminalRaw.setSelectedBlockId,
    agentTerminalRaw.replaceBlocks,
    agentTerminalRaw.clearBlocks
  ]);

  const activeSurfaceWorkingDirectory = store.composerSurface === 'terminal'
    ? terminal.cwd ?? workingDirectory.currentPath
    : agentTerminal.cwd ?? workingDirectory.currentPath;

  const conversationTerminalBlocks = useMemo(
    () => sortTerminalBlocksChronologically(
      dedupeTerminalBlocks([
        ...terminalRaw.blocks.filter(Utils.isCommandBlock),
        ...agentTerminalRaw.blocks.filter(Utils.isCommandBlock)
      ])
    ),
    [agentTerminalRaw.blocks, terminalRaw.blocks]
  );

  const requestWebSearch = useCallback(async (request: WebSearchRequest) => {
    if (!agentSettings.enabled || !agentSettings.permissions.webSearch || !activeProfileCallWebTools) {
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        'Web search is disabled in Agent settings.',
        'web-search',
        request.query,
        [],
        { webSearchStatus: 'error' }
      );
      return;
    }

    try {
      const response = await invoke<WebSearchResponse>('web_search', {
        request: {
          query: request.query,
          maxResults: request.maxResults ?? 5
        }
      });

      const formattedResults = response.results.length > 0
        ? [
            `Web search results for "${response.query}":`,
            ...response.results.map((result, index) => [
              `${index + 1}. ${result.title}`,
              `URL: ${result.url}`,
              result.snippet ? `Snippet: ${result.snippet}` : ''
            ].filter(Boolean).join('\n'))
          ].join('\n\n')
        : `No web results found for "${response.query}".`;

      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        formattedResults,
        'web-search',
        response.query,
        response.results,
        { webSearchStatus: 'success' }
      );
    } catch (error) {
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        `Web search failed for "${request.query}": ${error}`,
        'web-search',
        request.query,
        [],
        { webSearchStatus: 'error' }
      );
    }
  }, [agentSettings.enabled, agentSettings.permissions.webSearch, activeProfileCallWebTools]);

  const requestCloudAgentLaunch = useCallback(async (request: CloudAgentLaunchRequest) => {
    try {
      const result = await props.onCloudAgentLaunch?.({
        prompt: request.prompt,
        repo: request.repo,
        baseBranch: request.baseBranch,
        workBranch: request.workBranch,
        profileId: request.profileId
      });
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        result ? 'Cloud agent launched in a new cloud tab.' : 'Cloud agent launch was cancelled.',
        'cloud-agent',
        request.prompt,
        [],
        { cloudAgentStatus: result ? 'started' : 'cancelled' }
      );
    } catch (error) {
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        `Cloud agent launch failed: ${error}`,
        'cloud-agent',
        request.prompt,
        [],
        { cloudAgentStatus: 'error' }
      );
    }
  }, [props]);

  const requestWorkspaceExploration = useCallback(async (request: WorkspaceExplorationRequest) => {
    if (!agentSettings.enabled) {
      const createdAt = new Date().toISOString();
      const noteEntry: WorkspaceExplorationEntry = {
        id: `workspace-exploration-disabled-${Date.now()}`,
        kind: 'note',
        text: 'Workspace exploration is disabled in Agent settings.',
        createdAt
      };
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        'Workspace exploration is disabled in Agent settings.',
        'workspace-exploration',
        request.query,
        [],
        {
          workspaceExploration: {
            query: request.query,
            summary: 'Workspace exploration is disabled in Agent settings.',
            segments: [{
              id: `workspace-exploration-disabled-${Date.now()}`,
              createdAt,
              summary: 'Workspace exploration is disabled in Agent settings.',
              entries: [noteEntry],
              searches: [],
              files: []
            }],
            searches: [],
            files: []
          }
        }
      );
      return;
    }

    const query = request.query.trim();
    if (!query) {
      return;
    }

    const cwd = workingDirectory.currentPath;
    const maxResults = request.maxResults ?? 6;

    type FilesystemSearchEntry = {
      path: string;
      isDirectory: boolean;
    };

    type FilesystemSearchListing = {
      currentPath: string;
      entries: FilesystemSearchEntry[];
    };

    type CodeIndexSearchResult = {
      path: string;
      snippet: string;
      relativePath: string;
      language: string;
    };

    try {
      const createdAt = new Date().toISOString();
      const searches: WorkspaceExplorationSearch[] = [];
      const fileMap = new Map<string, { path: string; source: 'code-index' | 'filesystem'; snippet?: string }>();
      const collectedErrors: string[] = [];
      const entries: WorkspaceExplorationEntry[] = [];

      if (codeSettings.indexing.enabled) {
        try {
          const results = await invoke<CodeIndexSearchResult[]>('code_index_search', {
            query,
            maxResults: Math.max(1, Math.min(20, maxResults))
          });

          searches.push({
            source: 'code-index',
            query,
            resultCount: results.length
          });
          entries.push({
            id: `workspace-exploration-${createdAt}-code-index-search`,
            kind: 'search',
            text: `Searched for ${query}`,
            detail: `in code index (${results.length} match${results.length === 1 ? '' : 'es'})`,
            createdAt
          });

          results.forEach((entry) => {
            if (!entry.path.trim()) return;
            if (!fileMap.has(entry.path)) {
              fileMap.set(entry.path, {
                path: entry.path,
                source: 'code-index',
                snippet: entry.snippet?.trim() || undefined
              });
            }
          });
        } catch (error) {
          collectedErrors.push(error instanceof Error ? error.message : String(error));
        }
      }

      try {
        const listing = await invoke<FilesystemSearchListing>('terminal_search_directory_entries', {
          request: {
            path: cwd,
            query
          }
        });

        searches.push({
          source: 'filesystem',
          query,
          resultCount: listing.entries.filter((entry) => !entry.isDirectory).length
        });
        entries.push({
          id: `workspace-exploration-${createdAt}-filesystem-search`,
          kind: 'search',
          text: `Searched for ${query}`,
          detail: `in workspace files (${listing.entries.filter((entry) => !entry.isDirectory).length} match${listing.entries.filter((entry) => !entry.isDirectory).length === 1 ? '' : 'es'})`,
          createdAt
        });

        listing.entries.forEach((entry) => {
          if (entry.isDirectory || !entry.path.trim()) return;
          if (!fileMap.has(entry.path)) {
            fileMap.set(entry.path, {
              path: entry.path,
              source: 'filesystem'
            });
          }
        });
      } catch (error) {
        collectedErrors.push(error instanceof Error ? error.message : String(error));
      }

      const files = Array.from(fileMap.values()).slice(0, maxResults);
      const summary = `Explored ${files.length} file${files.length === 1 ? '' : 's'}, ${searches.length} search${searches.length === 1 ? '' : 'es'}.`;
      files.forEach((file, index) => {
        entries.push({
          id: `workspace-exploration-${createdAt}-file-${index}`,
          kind: 'read',
          text: `Read ${fileNameFromPath(file.path)}`,
          detail: file.snippet?.trim() || undefined,
          path: file.path,
          createdAt
        });
      });

      const segment: WorkspaceExplorationSegment = {
        id: `workspace-exploration-${createdAt}`,
        createdAt,
        summary,
        entries,
        searches,
        files
      };
      const formatted = [
        summary,
        ...(collectedErrors.length > 0 ? [`Search warnings: ${collectedErrors.join(' | ')}`] : []),
        ...entries.map((entry) => `${entry.text}${entry.detail ? ` ${entry.detail}` : ''}`)
      ].join('\n');

      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        formatted,
        'workspace-exploration',
        request.query,
        [],
        {
          workspaceExploration: {
            query,
            summary,
            segments: [segment],
            searches,
            files
          }
        }
      );
    } catch (error) {
      const createdAt = new Date().toISOString();
      const noteEntry: WorkspaceExplorationEntry = {
        id: `workspace-exploration-error-${Date.now()}`,
        kind: 'note',
        text: `Workspace exploration failed for "${request.query}".`,
        detail: error instanceof Error ? error.message : String(error),
        createdAt
      };
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        `Workspace exploration failed for "${request.query}": ${error}`,
        'workspace-exploration',
        request.query,
        [],
        {
          workspaceExploration: {
            query,
            summary: `Workspace exploration failed for "${request.query}".`,
            segments: [{
              id: `workspace-exploration-error-${Date.now()}`,
              createdAt,
              summary: `Workspace exploration failed for "${request.query}".`,
              entries: [noteEntry],
              searches: [],
              files: []
            }],
            searches: [],
            files: []
          }
        }
      );
    }
  }, [agentSettings.enabled, codeSettings.indexing.enabled, workingDirectory.currentPath]);

  const onConversationCreated = useCallback((nextId: string) => {
    setLocalConversationId(nextId);
    if (hasControlledConversation) props.onConversationChange?.(nextId);
  }, [hasControlledConversation, props.onConversationChange, setLocalConversationId]);

  const onNewChat = useCallback(() => {
    const nextId = props.onNewConversation ? props.onNewConversation() : (hasControlledConversation ? Utils.createConversationId() : null);
    if (nextId || !hasControlledConversation) {
      const id = nextId || Utils.createConversationId();
      if (!hasControlledConversation) setLocalConversationId(id);
      else props.onConversationChange?.(id);
    }
    agentTerminal.replaceBlocks([]);
    setComposerSurface('agent');
    setModeLock(null);
  }, [hasControlledConversation, props.onConversationChange, props.onNewConversation, setLocalConversationId, setComposerSurface, setModeLock, agentTerminal]);

  const chatRaw = Hooks.useChat({
    conversationId: resolvedConversationId,
    cwd: workingDirectory.currentPath,
    modelId: profileBaseModelId,
    terminalModelId: profileTerminalModelId,
    requiresModelSetup: modelSelection.requiresModelSetup,
    onRequireModelSetup: () => {
      tray.closeTray();
      openModelDrawer();
    },
    onCloseTray: tray.closeTray,
    terminalBlocks: conversationTerminalBlocks,
    onCommandApproval: requestCommandApproval,
    onFileChangeApproval: requestFileChangeApproval,
    onWebSearch: requestWebSearch,
    onWorkspaceExploration: requestWorkspaceExploration,
    onCloudAgentLaunch: requestCloudAgentLaunch,
    onConversationCreated,
    onNewChat,
    active
  });

  const startupCommandsSignature = useMemo(() => startupCommands.join('\u0000'), [startupCommands]);
  const startupCommandsConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!startupCommands.length || startupCommandsConsumedRef.current === startupCommandsSignature) {
      return;
    }

    startupCommandsConsumedRef.current = startupCommandsSignature;
    let cancelled = false;
    const terminalSurface = initialComposerSurface === 'agent' ? agentTerminal : terminal;

    void (async () => {
      try {
        for (const command of startupCommands) {
          if (cancelled) {
            return;
          }

          await terminalSurface.runCommand(command, { source: 'assistant' });
        }
      } catch (error) {
        console.warn('[LauncherRuntime] failed to run startup commands', error);
      } finally {
        if (!cancelled) {
          props.onStartupCommandsConsumed?.();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentTerminal, initialComposerSurface, props, startupCommands, startupCommandsSignature, terminal]);

  useEffect(() => {
    chatApiRef.current = chatRaw;
  }, [chatRaw]);

  const chat = useMemo(() => chatRaw, [
    chatRaw.messages,
    chatRaw.attachments,
    chatRaw.query,
    chatRaw.setQuery,
    chatRaw.submitQuery,
    chatRaw.clearMessages,
    chatRaw.saveCurrentConversation,
    chatRaw.attachFiles,
    chatRaw.addAttachments,
    chatRaw.removeAttachment,
    chatRaw.clearAttachments
  ]);

  const { consumed: hasShellActivator, value: queryWithoutActivator } = consumeShellModeActivator(chat.query);

  const terminalCommandBlocks = useMemo(() => terminal.blocks.filter(Utils.isCommandBlock), [terminal.blocks]);
  const agentTerminalCommandBlocks = useMemo(() => agentTerminal.blocks.filter(Utils.isCommandBlock), [agentTerminal.blocks]);

  // Aggregate everything into a single stable object
  return useMemo(() => ({
    memoryStore,
    agentSettings,
    codeSettings,
    workingDirectory,
    gitContext,
    runtimeContext,
    commandHistory,
    modelSelection,
    availableShellCommands,
    resolvedConversationId,
    resolvedPendingApproval,
    setResolvedPendingApproval,
    requestCommandApproval,
    requestFileChangeApproval,
    terminal,
    agentTerminal,
    chat,
    hasShellActivator,
    queryWithoutActivator,
    terminalCommandBlocks,
    agentTerminalCommandBlocks,
    conversationTerminalBlocks,
    activeSurfaceWorkingDirectory,
    hasControlledConversation,
    hasControlledPendingApproval,
  }), [
    memoryStore,
    agentSettings,
    codeSettings,
    workingDirectory,
    gitContext,
    runtimeContext,
    commandHistory,
    modelSelection,
    availableShellCommands,
    resolvedConversationId,
    resolvedPendingApproval,
    setResolvedPendingApproval,
    requestCommandApproval,
    requestFileChangeApproval,
    terminal,
    agentTerminal,
    chat,
    hasShellActivator,
    queryWithoutActivator,
    terminalCommandBlocks,
    agentTerminalCommandBlocks,
    conversationTerminalBlocks,
    activeSurfaceWorkingDirectory,
    hasControlledConversation,
    hasControlledPendingApproval,
  ]);
}

function resolveProfileModelId(profileModel: string | null | undefined, fallback: string | null) {
  const value = profileModel?.trim();
  if (!value || value.toLowerCase() === 'auto') {
    return fallback;
  }

  return value;
}
