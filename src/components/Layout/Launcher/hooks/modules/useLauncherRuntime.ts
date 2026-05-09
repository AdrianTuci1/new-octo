import { useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as Hooks from '../../../../../hooks';
import { useMemoryStore, useLauncherStore, useUIStore } from '../../../../../stores';
import * as Utils from '../../utils';
import { consumeShellModeActivator } from '../../../../../lib';
import type { LauncherProps } from '../types';
import type { CommandApproval, FileChangeApproval } from '../../../../../types';
import type { WebSearchRequest, WebSearchResponse } from '../../../../../types/chat';

export function useLauncherRuntime(props: LauncherProps, store: any, tray: any) {
  const {
    initialWorkingDirectory = null,
    persistWorkingDirectory = true,
    initialTerminalSessionId = null,
    persistTerminalSession = false,
    initialAgentTerminalSessionId = null,
    active = true,
  } = props;

  // Use selectors for store to prevent unnecessary re-renders of this orchestrator
  // We use stable selectors here.
  const memoryStore = useMemoryStore();
  const setLocalConversationId = useLauncherStore(state => state.setLocalConversationId);
  const setLocalPendingApproval = useLauncherStore(state => state.setLocalPendingApproval);
  const localConversationId = useLauncherStore(state => state.localConversationId);
  const localPendingApproval = useLauncherStore(state => state.localPendingApproval);
  const setComposerSurface = useLauncherStore(state => state.setComposerSurface);
  const setModeLock = useLauncherStore(state => state.setModeLock);
  const openModelDrawer = useUIStore((state) => state.openModelDrawer);

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
    modelSelectionRaw.models,
    modelSelectionRaw.selectedModelLabel,
    modelSelectionRaw.isConfigured,
    modelSelectionRaw.requiresModelSetup
  ]);

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
    persistSession: persistTerminalSession,
    sharedBlockMetaById: props.sharedTerminalBlockMetaById,
    sharedSyntheticBlocks: props.sharedSyntheticBlocks,
    onBlockMetaChange: props.onTerminalBlockMetaChange,
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
    persistSession: persistTerminalSession,
    sharedBlockMetaById: props.sharedAgentTerminalBlockMetaById,
    onBlockMetaChange: props.onAgentTerminalBlockMetaChange,
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

  const requestWebSearch = useCallback(async (request: WebSearchRequest) => {
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
  }, []);

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
    modelId: modelSelection.selectedModelId,
    requiresModelSetup: modelSelection.requiresModelSetup,
    onRequireModelSetup: () => {
      tray.closeTray();
      openModelDrawer();
    },
    onCloseTray: tray.closeTray,
    terminalBlocks: agentTerminal.blocks,
    onCommandApproval: requestCommandApproval,
    onFileChangeApproval: requestFileChangeApproval,
    onWebSearch: requestWebSearch,
    onConversationCreated,
    onNewChat,
    active
  });

  useEffect(() => {
    chatApiRef.current = chatRaw;
  }, [chatRaw]);

  const chat = useMemo(() => chatRaw, [
    chatRaw.messages,
    chatRaw.query,
    chatRaw.setQuery,
    chatRaw.submitQuery,
    chatRaw.clearMessages,
    chatRaw.saveCurrentConversation
  ]);

  const { value: queryWithoutActivator } = consumeShellModeActivator(chat.query);

  const terminalCommandBlocks = useMemo(() => terminal.blocks.filter(Utils.isCommandBlock), [terminal.blocks]);
  const agentTerminalCommandBlocks = useMemo(() => agentTerminal.blocks.filter(Utils.isCommandBlock), [agentTerminal.blocks]);

  // Aggregate everything into a single stable object
  return useMemo(() => ({
    memoryStore,
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
    queryWithoutActivator,
    terminalCommandBlocks,
    agentTerminalCommandBlocks,
    hasControlledConversation,
    hasControlledPendingApproval,
  }), [
    memoryStore,
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
    queryWithoutActivator,
    terminalCommandBlocks,
    agentTerminalCommandBlocks,
    hasControlledConversation,
    hasControlledPendingApproval,
  ]);
}
