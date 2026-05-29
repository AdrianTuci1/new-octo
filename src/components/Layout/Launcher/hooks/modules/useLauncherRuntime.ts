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
  WorkspaceFileReadRequest,
  WorkspaceExplorationDirectory,
  WorkspaceExplorationFile,
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

const WORKSPACE_QUERY_STOP_WORDS = new Set([
  'a',
  'ai',
  'al',
  'ale',
  'all',
  'and',
  'are',
  'as',
  'at',
  'ca',
  'cat',
  'ce',
  'cum',
  'cu',
  'de',
  'despre',
  'din',
  'do',
  'does',
  'este',
  'for',
  'how',
  'in',
  'is',
  'it',
  'la',
  'mod',
  'ne',
  'of',
  'on',
  'pe',
  'prin',
  'restul',
  'sau',
  'si',
  'sunt',
  'the',
  'to',
  'ul',
  'un',
  'una',
  'unei',
  'unor',
  'va'
]);

function normalizeWorkspaceToken(token: string) {
  const trimmed = token
    .trim()
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');

  if (!trimmed) {
    return '';
  }

  const normalized = trimmed
    .split(/[-_]/g)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\b([a-z0-9]+?)(?:ului|elor|ilor|urile|urilor|ul|le|lor)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

function buildWorkspaceSearchQueries(query: string, maxQueries = 4) {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  const queries: string[] = [];
  const seen = new Set<string>();

  const pushQuery = (value: string) => {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) {
      return;
    }
    seen.add(key);
    queries.push(cleaned);
  };

  if (normalizedQuery && normalizedQuery.split(/\s+/).length <= 6) {
    pushQuery(normalizedQuery);
  }

  const normalizedTokens = (normalizedQuery.match(/[A-Za-z0-9][A-Za-z0-9_-]*/g) ?? [])
    .flatMap((token) => normalizeWorkspaceToken(token).split(/\s+/g))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !WORKSPACE_QUERY_STOP_WORDS.has(token));

  normalizedTokens
    .filter((token) => token.length >= 4)
    .forEach(pushQuery);

  if (normalizedTokens.length >= 2) {
    pushQuery(`${normalizedTokens[0]} ${normalizedTokens[1]}`);
  }

  if (queries.length === 0 && normalizedQuery) {
    pushQuery(normalizedQuery);
  }

  return queries.slice(0, Math.max(1, maxQueries));
}

function displayWorkspacePath(path: string, cwd?: string | null) {
  const normalizedPath = path.trim();
  const normalizedCwd = cwd?.trim();
  if (!normalizedPath || !normalizedCwd) {
    return normalizedPath;
  }

  const prefix = normalizedCwd.endsWith('/') ? normalizedCwd : `${normalizedCwd}/`;
  if (normalizedPath === normalizedCwd) {
    return '.';
  }

  if (normalizedPath.startsWith(prefix)) {
    return normalizedPath.slice(prefix.length);
  }

  return normalizedPath;
}

function summarizeWorkspaceExploration(params: {
  mode: 'list' | 'search';
  fileCount: number;
  directoryCount: number;
  searchCount: number;
  targetPath?: string | null;
  cwd?: string | null;
}) {
  const { mode, fileCount, directoryCount, searchCount, targetPath, cwd } = params;
  const displayPath = targetPath ? displayWorkspacePath(targetPath, cwd) : '.';

  if (mode === 'list') {
    return `Listed ${directoryCount} director${directoryCount === 1 ? 'y' : 'ies'} and ${fileCount} file${fileCount === 1 ? '' : 's'} in ${displayPath || '.'}.`;
  }

  return `Explored ${fileCount} file${fileCount === 1 ? '' : 's'}, ${directoryCount} director${directoryCount === 1 ? 'y' : 'ies'}, ${searchCount} search${searchCount === 1 ? '' : 'es'} in ${displayPath || '.'}.`;
}

function isPathWithinRoot(path: string, rootPath?: string | null) {
  const normalizedPath = path.trim();
  const normalizedRoot = rootPath?.trim();
  if (!normalizedPath || !normalizedRoot) {
    return true;
  }

  if (normalizedPath === normalizedRoot) {
    return true;
  }

  const rootPrefix = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
  return normalizedPath.startsWith(rootPrefix);
}

function formatWorkspaceFileSnippet(params: {
  content: string;
  startLine?: number;
  endLine?: number;
  maxChars?: number;
}) {
  const { content, startLine, endLine, maxChars } = params;
  const lines = content.split('\n');
  const firstLine = Math.max(1, startLine ?? 1);
  const lastLine = Math.max(firstLine, Math.min(lines.length, endLine ?? lines.length));
  const slice = lines.slice(firstLine - 1, lastLine);
  const numbered = slice.map((line, index) => `${firstLine + index}: ${line}`).join('\n');
  const limit = Math.max(200, Math.min(24000, maxChars ?? 12000));

  if (numbered.length <= limit) {
    return {
      text: numbered,
      truncated: false
    };
  }

  return {
    text: `${numbered.slice(0, Math.max(0, limit - 24)).trimEnd()}\n... [truncated]`,
    truncated: true
  };
}

function isAbsoluteWorkspacePath(path: string) {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

function resolveWorkspacePath(path: string, cwd?: string | null) {
  const trimmedPath = path.trim();
  const normalizedCwd = cwd?.trim();

  if (!trimmedPath || !normalizedCwd || isAbsoluteWorkspacePath(trimmedPath)) {
    return trimmedPath;
  }

  const isAbsolute = normalizedCwd.startsWith('/');
  const parts = `${normalizedCwd.replace(/\/+$/, '')}/${trimmedPath.replace(/^\.\/+/, '')}`
    .split('/')
    .filter(Boolean);
  const stack: string[] = [];

  parts.forEach((part) => {
    if (part === '.') return;
    if (part === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
      return;
    }
    stack.push(part);
  });

  return `${isAbsolute ? '/' : ''}${stack.join('/')}`;
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
  const debouncedWorkingDirectoryPath = Hooks.useDebouncedValue(workingDirectory.currentPath, 200);

  useEffect(() => {
    const path = debouncedWorkingDirectoryPath?.trim();
    if (!path || !codeSettings.indexing.enabled || !codeSettings.indexing.indexNewFoldersByDefault || autoIndexedPathsRef.current.has(path)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      autoIndexedPathsRef.current.add(path);
      void invoke('code_index_index_project', { path }).catch((error) => {
        autoIndexedPathsRef.current.delete(path);
        console.warn('[launcher] failed to auto-index working directory', error);
      });
    }, 800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [codeSettings.indexing.enabled, codeSettings.indexing.indexNewFoldersByDefault, debouncedWorkingDirectoryPath]);

  const gitContextRaw = Hooks.useGitContext(debouncedWorkingDirectoryPath);
  const gitContext = useMemo(() => gitContextRaw, [
    gitContextRaw.gitContext,
    gitContextRaw.isBranchMenuOpen
  ]);

  const runtimeContextRaw = Hooks.useTerminalRuntimeContext(debouncedWorkingDirectoryPath);
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
  const effectiveWorkingDirectory = activeSurfaceWorkingDirectory ?? workingDirectory.currentPath;

  useEffect(() => {
    if (!effectiveWorkingDirectory || effectiveWorkingDirectory === workingDirectory.currentPath) {
      return;
    }

    workingDirectory.syncCurrentPath(effectiveWorkingDirectory);
  }, [effectiveWorkingDirectory, workingDirectory]);

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
        cwd: effectiveWorkingDirectory,
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
  }, [effectiveWorkingDirectory, props]);

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
            mode: request.mode,
            path: request.path,
            summary: 'Workspace exploration is disabled in Agent settings.',
            segments: [{
              id: `workspace-exploration-disabled-${Date.now()}`,
              createdAt,
              summary: 'Workspace exploration is disabled in Agent settings.',
              entries: [noteEntry],
              searches: [],
              files: [],
              directories: []
            }],
            searches: [],
            files: [],
            directories: []
          }
        }
      );
      return;
    }

    const mode = request.mode === 'list' ? 'list' : 'search';
    const query = request.query?.trim() ?? '';
    const targetPath = request.path?.trim() || effectiveWorkingDirectory;
    const includeFiles = request.includeFiles !== false;
    const includeDirectories = request.includeDirectories ?? (mode === 'list');
    const recursive = request.recursive ?? (mode === 'search');

    if (!query && !targetPath) {
      return;
    }

    const cwd = effectiveWorkingDirectory;
    const maxResults = Math.max(1, Math.min(50, request.maxResults ?? (mode === 'list' ? 24 : 8)));
    const searchQueries = query ? buildWorkspaceSearchQueries(query) : [];

    type FilesystemSearchEntry = {
      name: string;
      path: string;
      isDirectory: boolean;
    };

    type FilesystemSearchListing = {
      currentPath: string;
      entries: FilesystemSearchEntry[];
    };

    type FilesystemDirectoryEntry = {
      name: string;
      path: string;
      isDirectory: boolean;
    };

    type FilesystemDirectoryListing = {
      currentPath: string;
      parentPath?: string | null;
      entries: FilesystemDirectoryEntry[];
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
      const fileMap = new Map<string, WorkspaceExplorationFile>();
      const directoryMap = new Map<string, WorkspaceExplorationDirectory>();
      const collectedErrors: string[] = [];
      const entries: WorkspaceExplorationEntry[] = [];
      let localSearchMatched = false;

      if (mode === 'list') {
        const listing = await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
          request: {
            path: targetPath,
            cwd,
            query: query || undefined,
            directoriesOnly: false
          }
        });

        searches.push({
          mode: 'list',
          source: 'filesystem',
          query: query || '.',
          resultCount: listing.entries.length,
          path: listing.currentPath
        });
        entries.push({
          id: `workspace-exploration-${createdAt}-filesystem-list`,
          kind: 'search',
          text: `Listed ${displayWorkspacePath(listing.currentPath, cwd) || '.'}`,
          detail: query
            ? `filtered by "${query}" (${listing.entries.length} match${listing.entries.length === 1 ? '' : 'es'}${listing.entries.length > maxResults ? `, showing first ${maxResults}` : ''})`
            : `${listing.entries.length} visible entr${listing.entries.length === 1 ? 'y' : 'ies'}${listing.entries.length > maxResults ? `, showing first ${maxResults}` : ''}`,
          createdAt
        });

        for (const entry of listing.entries) {
          if (entry.isDirectory) {
            if (includeDirectories && !directoryMap.has(entry.path)) {
              directoryMap.set(entry.path, { path: entry.path, source: 'filesystem' });
            }
            continue;
          }

          if (includeFiles && !fileMap.has(entry.path)) {
            fileMap.set(entry.path, { path: entry.path, source: 'filesystem' });
          }
        }
      }

      if (mode === 'search' && codeSettings.indexing.enabled && query && includeFiles) {
        for (const searchQuery of searchQueries) {
          try {
            const results = await invoke<CodeIndexSearchResult[]>('code_index_search', {
              query: searchQuery,
              maxResults: Math.max(1, Math.min(20, maxResults))
            });
            const filteredResults = results.filter((entry) => isPathWithinRoot(entry.path, targetPath));

            searches.push({
              mode: 'search',
              source: 'code-index',
              query: searchQuery,
              resultCount: filteredResults.length,
              path: targetPath || undefined
            });
            entries.push({
              id: `workspace-exploration-${createdAt}-code-index-search-${searches.length}`,
              kind: 'search',
              text: `Searched for ${searchQuery}`,
              detail: `in code index (${filteredResults.length} match${filteredResults.length === 1 ? '' : 'es'})`,
              createdAt
            });

            filteredResults.forEach((entry) => {
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
      }

      if (mode === 'search' && query) {
        try {
          const listing = await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
            request: {
              path: targetPath,
              cwd,
              query,
              directoriesOnly: false
            }
          });
          const resultCount = listing.entries.filter((entry) => (
            (entry.isDirectory && includeDirectories) || (!entry.isDirectory && includeFiles)
          )).length;
          searches.push({
            mode: 'search',
            source: 'filesystem',
            query,
            resultCount,
            path: listing.currentPath
          });
          localSearchMatched = resultCount > 0;
          entries.push({
            id: `workspace-exploration-${createdAt}-filesystem-local-filter`,
            kind: 'search',
            text: `Filtered ${displayWorkspacePath(listing.currentPath, cwd) || '.'}`,
            detail: `locally with "${query}" (${resultCount} match${resultCount === 1 ? '' : 'es'})`,
            createdAt
          });

          listing.entries.forEach((entry) => {
            if (!entry.path.trim()) return;
            if (entry.isDirectory) {
              if (includeDirectories && !directoryMap.has(entry.path)) {
                directoryMap.set(entry.path, { path: entry.path, source: 'filesystem' });
              }
              return;
            }

            if (includeFiles && !fileMap.has(entry.path)) {
              fileMap.set(entry.path, { path: entry.path, source: 'filesystem' });
            }
          });
        } catch (error) {
          collectedErrors.push(error instanceof Error ? error.message : String(error));
        }

        if (!localSearchMatched) {
          for (const searchQuery of searchQueries) {
          try {
            if (recursive) {
              const listing = await invoke<FilesystemSearchListing>('terminal_search_directory_entries', {
                request: {
                  path: targetPath,
                  cwd,
                  query: searchQuery
                }
              });

              const resultCount = listing.entries.filter((entry) => (
                (entry.isDirectory && includeDirectories) || (!entry.isDirectory && includeFiles)
              )).length;
              searches.push({
                mode: 'search',
                source: 'filesystem',
                query: searchQuery,
                resultCount,
                path: listing.currentPath
              });
              entries.push({
                id: `workspace-exploration-${createdAt}-filesystem-search-${searches.length}`,
                kind: 'search',
                text: `Searched for ${searchQuery}`,
                detail: `recursively in ${displayWorkspacePath(listing.currentPath, cwd) || '.'} (${resultCount} match${resultCount === 1 ? '' : 'es'}${resultCount > maxResults ? `, showing first ${maxResults}` : ''})`,
                createdAt
              });

              listing.entries.forEach((entry) => {
                if (!entry.path.trim()) return;
                if (entry.isDirectory) {
                  if (includeDirectories && !directoryMap.has(entry.path)) {
                    directoryMap.set(entry.path, { path: entry.path, source: 'filesystem' });
                  }
                  return;
                }

                if (includeFiles && !fileMap.has(entry.path)) {
                  fileMap.set(entry.path, {
                    path: entry.path,
                    source: 'filesystem'
                  });
                }
              });
            } else {
              const listing = await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
                request: {
                  path: targetPath,
                  cwd,
                  query: searchQuery,
                  directoriesOnly: false
                }
              });
              const resultCount = listing.entries.filter((entry) => (
                (entry.isDirectory && includeDirectories) || (!entry.isDirectory && includeFiles)
              )).length;
              searches.push({
                mode: 'search',
                source: 'filesystem',
                query: searchQuery,
                resultCount,
                path: listing.currentPath
              });
              entries.push({
                id: `workspace-exploration-${createdAt}-filesystem-filter-${searches.length}`,
                kind: 'search',
                text: `Filtered ${displayWorkspacePath(listing.currentPath, cwd) || '.'}`,
                detail: `with "${searchQuery}" (${resultCount} match${resultCount === 1 ? '' : 'es'}${resultCount > maxResults ? `, showing first ${maxResults}` : ''})`,
                createdAt
              });

              listing.entries.forEach((entry) => {
                if (entry.isDirectory) {
                  if (includeDirectories && !directoryMap.has(entry.path)) {
                    directoryMap.set(entry.path, { path: entry.path, source: 'filesystem' });
                  }
                  return;
                }

                if (includeFiles && !fileMap.has(entry.path)) {
                  fileMap.set(entry.path, { path: entry.path, source: 'filesystem' });
                }
              });
            }
          } catch (error) {
            collectedErrors.push(error instanceof Error ? error.message : String(error));
          }
        }
        }
      }

      const visibleCandidates = [
        ...Array.from(directoryMap.values(), (directory) => ({ kind: 'directory' as const, value: directory })),
        ...Array.from(fileMap.values(), (file) => ({ kind: 'file' as const, value: file }))
      ]
        .sort((left, right) => left.value.path.localeCompare(right.value.path))
        .slice(0, maxResults);
      const directories = visibleCandidates
        .filter((candidate) => candidate.kind === 'directory')
        .map((candidate) => candidate.value);
      const files = visibleCandidates
        .filter((candidate) => candidate.kind === 'file')
        .map((candidate) => candidate.value);

      const summary = summarizeWorkspaceExploration({
        mode,
        fileCount: files.length,
        directoryCount: directories.length,
        searchCount: searches.length,
        targetPath,
        cwd
      });

      const segment: WorkspaceExplorationSegment = {
        id: `workspace-exploration-${createdAt}`,
        createdAt,
        summary,
        entries,
        searches,
        files,
        directories
      };
      const formatted = [
        localSearchMatched && files.length > 0
          ? `Local matches found in the current directory. Inspect these files next before broader search.`
          : '',
        summary,
        targetPath ? `Path: ${displayWorkspacePath(targetPath, cwd) || '.'}` : '',
        mode === 'search' && searchQueries.length > 1 ? `Search queries: ${searchQueries.join(', ')}` : '',
        files.length > 0 ? `Files:\n${files.map((file) => `- ${displayWorkspacePath(file.path, cwd) || file.path}`).join('\n')}` : '',
        directories.length > 0 ? `Directories:\n${directories.map((directory) => `- ${displayWorkspacePath(directory.path, cwd) || directory.path}`).join('\n')}` : '',
        ...(collectedErrors.length > 0 ? [`Search warnings: ${collectedErrors.join(' | ')}`] : []),
        ...entries.map((entry) => [
          entry.text,
          entry.path ? `Path: ${displayWorkspacePath(entry.path, cwd)}` : '',
          entry.detail ? `Detail: ${entry.detail}` : ''
        ].filter(Boolean).join('\n'))
      ].join('\n');

      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        formatted,
        'workspace-exploration',
        request.query ?? request.path ?? mode,
        [],
        {
          workspaceExploration: {
            query: query || undefined,
            mode,
            path: targetPath,
            summary,
            segments: [segment],
            searches,
            files,
            directories
          }
        }
      );
    } catch (error) {
      const createdAt = new Date().toISOString();
      const explorationLabel = query || targetPath || mode;
      const noteEntry: WorkspaceExplorationEntry = {
        id: `workspace-exploration-error-${Date.now()}`,
        kind: 'note',
        text: `Workspace exploration failed for "${explorationLabel}".`,
        detail: error instanceof Error ? error.message : String(error),
        createdAt
      };
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        `Workspace exploration failed for "${explorationLabel}": ${error}`,
        'workspace-exploration',
        explorationLabel,
        [],
        {
          workspaceExploration: {
            query: query || undefined,
            mode,
            path: targetPath,
            summary: `Workspace exploration failed for "${explorationLabel}".`,
            segments: [{
              id: `workspace-exploration-error-${Date.now()}`,
              createdAt,
              summary: `Workspace exploration failed for "${explorationLabel}".`,
              entries: [noteEntry],
              searches: [],
              files: [],
              directories: []
            }],
            searches: [],
            files: [],
            directories: []
          }
        }
      );
    }
  }, [agentSettings.enabled, codeSettings.indexing.enabled, effectiveWorkingDirectory]);

  const requestWorkspaceFileRead = useCallback(async (request: WorkspaceFileReadRequest) => {
    const requestedPath = request.path.trim();
    if (!requestedPath) {
      return;
    }

    if (!agentSettings.enabled) {
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        'Workspace file read is disabled in Agent settings.',
        'file-read',
        requestedPath
      );
      return;
    }

    if (activeAgentProfile?.readFiles === 'Never allow') {
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        'Reading files is not allowed by the active agent profile.',
        'file-read',
        requestedPath
      );
      return;
    }

    try {
      const content = await invoke<string>('terminal_read_file', {
        request: {
          path: requestedPath,
          cwd: effectiveWorkingDirectory
        }
      });
      const snippet = formatWorkspaceFileSnippet({
        content,
        startLine: request.startLine,
        endLine: request.endLine,
        maxChars: request.maxChars
      });
      const resolvedPath = resolveWorkspacePath(requestedPath, effectiveWorkingDirectory);
      const displayPath = displayWorkspacePath(requestedPath, effectiveWorkingDirectory) || requestedPath;
      const rangeLabel = request.startLine || request.endLine
        ? ` lines ${request.startLine ?? 1}-${request.endLine ?? 'end'}`
        : '';
      const summary = `Read \`${displayPath}\`${rangeLabel}.`;
      const toolBody = [
        summary,
        snippet.truncated ? 'Output was truncated for context size.' : '',
        '```text',
        snippet.text,
        '```'
      ].filter(Boolean).join('\n');

      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        toolBody,
        'file-read',
        requestedPath,
        [],
        {
          workspaceFileRead: {
            path: resolvedPath,
            displayPath,
            content: snippet.text,
            startLine: request.startLine,
            endLine: request.endLine,
            truncated: snippet.truncated
          }
        }
      );
    } catch (error) {
      void chatApiRef.current?.submitToolResult(
        request.toolCallId,
        `Failed to read \`${requestedPath}\`: ${error}`,
        'file-read',
        requestedPath
      );
    }
  }, [activeAgentProfile?.readFiles, agentSettings.enabled, effectiveWorkingDirectory]);

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
    const terminalCwd = terminal.cwd?.trim()
      || activeSurfaceWorkingDirectory?.trim()
      || workingDirectory.currentPath?.trim()
      || null;
    if (terminalCwd) {
      workingDirectory.syncCurrentPath(terminalCwd);
    }
    agentTerminal.clearBlocks();
    setComposerSurface('agent');
    setModeLock(null);
  }, [
    activeSurfaceWorkingDirectory,
    agentTerminal,
    hasControlledConversation,
    props.onConversationChange,
    props.onNewConversation,
    setComposerSurface,
    setLocalConversationId,
    setModeLock,
    terminal.cwd,
    workingDirectory
  ]);

  const chatRaw = Hooks.useChat({
    conversationId: resolvedConversationId,
    cwd: effectiveWorkingDirectory,
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
    onWorkspaceFileRead: requestWorkspaceFileRead,
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
    effectiveWorkingDirectory,
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
    effectiveWorkingDirectory,
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
