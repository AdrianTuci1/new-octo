import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { UseChatOptions } from '../types';
import type {
  AgentContinueRequest,
  AgentStartResponse,
  ExecutionPlanArtifact,
  FileDiffPreviewStatus,
  ExecutionPlanWorkstream,
  PlanExecutionUpdate,
  WorkspaceExplorationArtifact,
  WorkspaceExplorationSegment,
  WorkspaceFileReadArtifact
} from '../../../types/chat';
import { useMemoryStore } from '../../../stores/memoryStore';
import { artifactsFromMessages, chatHistoryFromMessages, titleFromConversationContent, statusFromConversationContent } from '../helpers';
import { ensureAgentEventBridge, pendingTokenText, setAssistantRegistration } from '../bridge';
import { buildAttachmentContextText, buildAttachmentsFromFiles } from '../attachments';
import { buildComposerContextSummary, parseComposerContextMentions } from '../../../components/Composer/contextMentions';
import type { useChatState } from './useChatState';
import { resolveAgentPrompt } from './agentPrompt';

function usesSyntheticThinking(modelId?: string | null) {
  return typeof modelId === 'string' && modelId.trim().toLowerCase().includes('gemma');
}

function buildSyntheticThinkingSummary(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'The user wants me to respond directly and keep the answer concise.';
  }

  const shortPrompt = cleaned.length > 140 ? `${cleaned.slice(0, 137).trimEnd()}...` : cleaned;
  return `The user is asking: "${shortPrompt}". I should keep the response focused and handle the requested skill or tool path if needed.`;
}

type UseChatActionsProps = {
  options: UseChatOptions;
  state: ReturnType<typeof useChatState>;
  onCommandApprovalRef: React.MutableRefObject<UseChatOptions['onCommandApproval']>;
  onFileChangeApprovalRef: React.MutableRefObject<UseChatOptions['onFileChangeApproval']>;
  onWebSearchRef: React.MutableRefObject<UseChatOptions['onWebSearch']>;
  onWorkspaceExplorationRef: React.MutableRefObject<UseChatOptions['onWorkspaceExploration']>;
  onWorkspaceFileReadRef: React.MutableRefObject<UseChatOptions['onWorkspaceFileRead']>;
  onCloudAgentLaunchRef: React.MutableRefObject<UseChatOptions['onCloudAgentLaunch']>;
};

export function useChatActions({
  options,
  state,
  onCommandApprovalRef,
  onFileChangeApprovalRef,
  onWebSearchRef,
  onWorkspaceExplorationRef,
  onWorkspaceFileReadRef,
  onCloudAgentLaunchRef
}: UseChatActionsProps) {
  const toolResultContinuationRef = useRef<Record<string, {
    assistantMessageId: string;
    status: 'started' | 'failed';
  }>>({});

  const attachFiles = useCallback(async (files: File[]) => {
    if (!files.length) {
      return;
    }

    const attachments = await buildAttachmentsFromFiles(files);
    state.addAttachments(attachments);
  }, [state]);

  const formatPlanBody = useCallback((plan: ExecutionPlanArtifact) => {
    return [
      plan.summary?.trim() || 'Execution plan proposed.',
      ...plan.steps.map((step, index) => `${index + 1}. [${step.status}] ${step.label}`),
      ...(plan.workstreams?.length
        ? [
            '',
            ...plan.workstreams.map((workstream) => `WS [${workstream.status}] ${workstream.title}`)
          ]
        : [])
    ].filter(Boolean).join('\n');
  }, []);

  const submitPlanProposal = useCallback((toolCallId: string, plan: ExecutionPlanArtifact) => {
    const conversationId = state.activeConversationIdRef.current;
    if (!conversationId) return;

    const body = formatPlanBody(plan);

    const existingToolMessage = state.messagesRef.current.find((message) => (
      message.role === 'tool'
      && message.toolKind === 'plan'
      && (
        message.executionPlan?.id === plan.id
        || message.toolCallId === toolCallId
      )
    ));

    if (existingToolMessage) {
      state.updateMessage(existingToolMessage.id, (message) => ({
        ...message,
        title: 'Execution Plan',
        body,
        toolCallId,
        toolKind: 'plan',
        executionPlan: plan
      }));
      return;
    }

    state.addMessage({
      id: `tool-plan-${Date.now()}`,
      role: 'tool',
      title: 'Execution Plan',
      body,
      conversationId,
      toolCallId,
      toolKind: 'plan',
      executionPlan: plan,
      createdAt: new Date().toISOString()
    });
  }, [formatPlanBody, state]);

  const submitPlanExecution = useCallback((toolCallId: string, update: PlanExecutionUpdate) => {
    const existingPlanMessage = state.messagesRef.current.find((message) => (
      message.role === 'tool'
      && message.toolKind === 'plan'
      && message.executionPlan?.id === update.planId
    ));
    if (!existingPlanMessage?.executionPlan) {
      return;
    }

    const nextWorkstreams = mergeWorkstreams(
      existingPlanMessage.executionPlan.workstreams ?? [],
      update.workstreams ?? []
    );

    const nextPlan: ExecutionPlanArtifact = {
      ...existingPlanMessage.executionPlan,
      summary: update.summary?.trim() || existingPlanMessage.executionPlan.summary,
      workstreams: nextWorkstreams,
      steps: existingPlanMessage.executionPlan.steps.map((step) => {
        if (step.id !== update.stepId) {
          if (update.action === 'started' && step.status === 'inProgress') {
            return {
              ...step,
              status: 'pending'
            };
          }
          return step;
        }

        return {
          ...step,
          status: update.action === 'started'
            ? 'inProgress'
            : update.action === 'completed'
              ? 'completed'
              : 'failed'
        };
      })
    };

    state.updateMessage(existingPlanMessage.id, (message) => ({
      ...message,
      toolCallId,
      body: formatPlanBody(nextPlan),
      executionPlan: nextPlan
    }));
  }, [formatPlanBody, state]);

  const continueAgentAfterToolResult = useCallback(async (
    conversationId: string,
    runId: string,
    assistantMessageId: string
  ) => {
    const owner = state.instanceIdRef.current;
    setAssistantRegistration(assistantMessageId, {
      owner,
      append: (text) => state.appendToMessage(assistantMessageId, text),
      update: (updater) => state.updateMessage(assistantMessageId, updater),
      upsertReasoning: (payload) => state.upsertReasoningMessage(assistantMessageId, payload),
      finalizeReasoning: () => state.finalizeReasoningMessage(assistantMessageId),
      showPlan: (plan, toolCallId) => submitPlanProposal(toolCallId, plan),
      applyPlanExecution: (update, toolCallId) => submitPlanExecution(toolCallId, update),
      onCommandApproval: (approval) => onCommandApprovalRef.current?.(approval),
      onFileChangeApproval: (approval) => onFileChangeApprovalRef.current?.(approval),
      onWebSearch: (request) => onWebSearchRef.current?.(request),
      onWorkspaceExploration: (request) => onWorkspaceExplorationRef.current?.(request),
      onWorkspaceFileRead: (request) => onWorkspaceFileReadRef.current?.(request),
      onCloudAgentLaunch: (request) => onCloudAgentLaunchRef.current?.(request)
    });

    await ensureAgentEventBridge();

    const requestMessages = chatHistoryFromMessages(state.messagesRef.current);
      const response = await invoke<AgentStartResponse>('agent_continue', {
        request: {
          runId,
          conversationId,
          assistantMessageId,
          surface: options.surface ?? 'agent',
          cwd: options.cwd ?? null,
          modelId: options.modelId ?? null,
          terminalModelId: options.terminalModelId ?? null,
          messages: requestMessages,
          terminalBlocks: options.terminalBlocks ?? []
        } satisfies AgentContinueRequest
      });

    const remainingTokens = pendingTokenText[response.assistantMessageId];
    if (remainingTokens) {
      state.appendToMessage(assistantMessageId, remainingTokens);
    }
    delete pendingTokenText[response.assistantMessageId];
    state.activeConversationIdRef.current = response.conversationId;
    state.activeRunIdRef.current = response.runId;
    state.setActiveConversationId(response.conversationId);
    state.setActiveRunId(response.runId);
    if (response.conversationId !== conversationId) {
      options.onConversationCreated?.(response.conversationId);
    }
    state.updateMessage(assistantMessageId, (message) => ({
      ...message,
      conversationId: response.conversationId,
      runId: response.runId
    }));
  }, [
    onCommandApprovalRef,
    onFileChangeApprovalRef,
    onWebSearchRef,
    onWorkspaceExplorationRef,
    onWorkspaceFileReadRef,
    onCloudAgentLaunchRef,
    options.cwd,
    options.modelId,
    options.terminalModelId,
    options.onConversationCreated,
    submitPlanExecution,
    submitPlanProposal,
    state
  ]);

  const saveCurrentConversation = useCallback(async () => {
    const currentMessages = state.messagesRef.current;
    const terminalBlocks = options.terminalBlocks ?? [];
    if (currentMessages.length === 0 && terminalBlocks.length === 0) {
      return null;
    }

    const conversationId = state.activeConversationIdRef.current
      ?? options.conversationId
      ?? currentMessages.find((message) => message.conversationId)?.conversationId
      ?? null;

    if (!conversationId) {
      return null;
    }

    return useMemoryStore.getState().saveConversation({
      conversationId,
      title: titleFromConversationContent(currentMessages, terminalBlocks),
      modelId: options.modelId ?? null,
      cwd: options.cwd ?? null,
      status: statusFromConversationContent(currentMessages, terminalBlocks),
      messages: currentMessages,
      artifacts: artifactsFromMessages(currentMessages),
      ...(terminalBlocks.length > 0 ? { terminalBlocks } : {})
    });
  }, [options.conversationId, options.cwd, options.modelId, options.terminalBlocks, state.messagesRef, state.activeConversationIdRef]);

  const submitQuery = async (promptOverride?: string) => {
    const prompt = typeof promptOverride === 'string' ? promptOverride : state.query;
    const trimmed = prompt.trim();
    if (!trimmed && state.attachments.length === 0) return;
    const resolvedPrompt = resolveAgentPrompt(trimmed);
    const { mentions, promptWithoutMentions } = parseComposerContextMentions(resolvedPrompt);
    const contextSummary = buildComposerContextSummary(mentions);
    const attachmentContext = buildAttachmentContextText(state.attachments);
    const fallbackPrompt = mentions.length > 0 && state.attachments.length > 0
      ? 'Please review the referenced context and attached files.'
      : mentions.length > 0
        ? 'Please review the referenced context.'
        : state.attachments.length > 0
          ? 'Please review the attached files.'
          : '';
    const composedPrompt = promptWithoutMentions || fallbackPrompt;
    const userMessageBody = promptWithoutMentions || fallbackPrompt || trimmed;

    if (options.requiresModelSetup) {
      options.onRequireModelSetup?.();
      return;
    }

    if (trimmed === '/new') {
      await saveCurrentConversation();
      state.clearMessages();
      state.setQuery('');
      options.onCloseTray?.();
      options.onNewChat?.();
      return;
    }

    const ts = Date.now();
    const runId = `run_${ts}`;
    const conversationId = state.activeConversationIdRef.current ?? options.conversationId ?? `conv_${ts}`;
    const assistantMessageId = `assistant_${ts}`;

    state.activeRunIdRef.current = runId;
    state.activeConversationIdRef.current = conversationId;
    state.setActiveRunId(runId);
    state.setActiveConversationId(conversationId);
    options.onConversationCreated?.(conversationId);

    if (state.attachments.length > 0) {
      state.addMessage({
        id: `tool-attachments-${ts}`,
        role: 'tool',
        title: 'Attached Files',
        body: attachmentContext,
        conversationId,
        createdAt: new Date().toISOString()
      });
    }

    if (contextSummary) {
      state.addMessage({
        id: `tool-context-${ts}`,
        role: 'tool',
        title: 'Referenced Context',
        body: contextSummary,
        conversationId,
        createdAt: new Date().toISOString()
      });
    }

    state.addMessage({
      id: `user-${ts}`,
      role: 'user',
      title: 'User',
      body: userMessageBody,
      conversationId,
      createdAt: new Date().toISOString()
    });

    const assistantCreatedAt = new Date().toISOString();

    state.addMessage({
      id: assistantMessageId,
      role: 'assistant',
      title: 'Octomus',
      body: pendingTokenText[assistantMessageId] ?? '',
      conversationId,
      runId,
      status: 'queued',
      isStreaming: true,
      hasNativeThinking: usesSyntheticThinking(options.modelId),
      createdAt: assistantCreatedAt
    });

    if (usesSyntheticThinking(options.modelId)) {
      state.addMessage({
        id: `${assistantMessageId}::reasoning`,
        role: 'assistant',
        title: 'Thinking',
        body: buildSyntheticThinkingSummary(trimmed || 'Review the attached files.'),
        conversationId,
        runId,
        messageKind: 'reasoning',
        parentMessageId: assistantMessageId,
        isStreaming: true,
        status: 'running',
        hasNativeThinking: false,
        createdAt: assistantCreatedAt
      });
    }

    state.setQuery('');
    state.clearAttachments();
    options.onCloseTray?.();

    const owner = state.instanceIdRef.current;
    setAssistantRegistration(assistantMessageId, {
      owner,
      append: (text) => state.appendToMessage(assistantMessageId, text),
      update: (updater) => state.updateMessage(assistantMessageId, updater),
      upsertReasoning: (payload) => state.upsertReasoningMessage(assistantMessageId, payload),
      finalizeReasoning: () => state.finalizeReasoningMessage(assistantMessageId),
      showPlan: (plan, toolCallId) => submitPlanProposal(toolCallId, plan),
      applyPlanExecution: (update, toolCallId) => submitPlanExecution(toolCallId, update),
      onCommandApproval: (approval) => onCommandApprovalRef.current?.(approval),
      onFileChangeApproval: (approval) => onFileChangeApprovalRef.current?.(approval),
      onWebSearch: (request) => onWebSearchRef.current?.(request),
      onWorkspaceExploration: (request) => onWorkspaceExplorationRef.current?.(request),
      onWorkspaceFileRead: (request) => onWorkspaceFileReadRef.current?.(request),
      onCloudAgentLaunch: (request) => onCloudAgentLaunchRef.current?.(request)
    });

    try {
      await ensureAgentEventBridge();

      const requestMessages = chatHistoryFromMessages(state.messagesRef.current);

      const response = await invoke<AgentStartResponse>('agent_start', {
        request: {
          runId,
          conversationId,
          assistantMessageId,
          prompt: composedPrompt,
          surface: options.surface ?? 'agent',
          cwd: options.cwd ?? null,
          modelId: options.modelId ?? null,
          terminalModelId: options.terminalModelId ?? null,
          messages: requestMessages,
          terminalBlocks: options.terminalBlocks ?? []
        }
      });

      const remainingTokens = pendingTokenText[response.assistantMessageId];
      if (remainingTokens) {
        state.appendToMessage(assistantMessageId, remainingTokens);
      }
      delete pendingTokenText[response.assistantMessageId];
      state.activeConversationIdRef.current = response.conversationId;
      state.activeRunIdRef.current = response.runId;
      state.setActiveConversationId(response.conversationId);
      state.setActiveRunId(response.runId);
      if (response.conversationId !== conversationId) {
        options.onConversationCreated?.(response.conversationId);
      }
      state.updateMessage(assistantMessageId, (message) => ({
        ...message,
        conversationId: response.conversationId,
        runId: response.runId
      }));
    } catch (error) {
      state.updateMessage(assistantMessageId, (message) => ({
        ...message,
        body: `Eroare: ${error}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  const submitToolResult = async (
    toolCallId: string,
    result: string,
    kind: 'command' | 'web-search' | 'file-change' | 'workspace-exploration' | 'file-read' = 'command',
    label?: string,
    webSearchResults?: Array<{ title: string; url: string; snippet?: string }>,
    toolResultOptions?: {
      deferFollowUp?: boolean;
      webSearchStatus?: 'searching' | 'success' | 'error';
      fileDiffs?: import('../../../types/diff').FileDiff[];
      fileChangeStatus?: FileDiffPreviewStatus;
      localAssistantSummary?: string;
      workspaceExploration?: WorkspaceExplorationArtifact;
      workspaceFileRead?: WorkspaceFileReadArtifact;
    }
  ) => {
    const ts = Date.now();
    const conversationId = state.activeConversationIdRef.current;
    const runId = state.activeRunIdRef.current;

    if (!conversationId || !runId) return;

    if (kind === 'file-read' && toolResultOptions?.workspaceFileRead) {
      const latestExplorationMessage = [...state.messagesRef.current]
        .reverse()
        .find((message) => (
          message.role === 'tool'
          && message.toolKind === 'workspace-exploration'
          && message.workspaceExploration
        ));

      if (latestExplorationMessage?.workspaceExploration) {
        state.updateMessage(latestExplorationMessage.id, (message) => {
          if (!message.workspaceExploration) {
            return message;
          }

          return {
            ...message,
            workspaceExploration: mergeWorkspaceFileReadIntoExploration(
              message.workspaceExploration,
              toolResultOptions.workspaceFileRead as WorkspaceFileReadArtifact
            )
          };
        });
      }
    }

    const existingToolMessage = state.messagesRef.current.find((message) => (
      message.role === 'tool' && message.toolCallId === toolCallId
    ));
    const toolMessageId = existingToolMessage?.id ?? `tool-${ts}`;

    if (existingToolMessage) {
      state.updateMessage(existingToolMessage.id, (message) => ({
        ...message,
        title: kind === 'web-search'
          ? 'Web Search'
          : kind === 'file-change'
            ? 'File Changes'
            : kind === 'workspace-exploration'
              ? 'Workspace Exploration'
            : kind === 'file-read'
              ? 'Read File'
            : 'Tool Output',
        body: result,
        toolKind: kind,
        fileDiffs: toolResultOptions?.fileDiffs ?? message.fileDiffs,
        fileChangeStatus: toolResultOptions?.fileChangeStatus ?? message.fileChangeStatus,
        workspaceFileRead: kind === 'file-read'
          ? (toolResultOptions?.workspaceFileRead ?? message.workspaceFileRead)
          : message.workspaceFileRead,
        ...(kind === 'web-search' ? {
          webSearchStatus: toolResultOptions?.webSearchStatus ?? (webSearchResults ? 'success' : 'searching'),
          webSearchQuery: label,
          webSearchResults
        } : kind === 'workspace-exploration' ? {
          workspaceExploration: mergeWorkspaceExplorationArtifacts(
            message.workspaceExploration,
            toolResultOptions?.workspaceExploration
          )
        } : {})
      }));
    } else {
      state.addMessage({
        id: toolMessageId,
        role: 'tool',
        title: kind === 'web-search'
          ? 'Web Search'
          : kind === 'file-change'
            ? 'File Changes'
            : kind === 'workspace-exploration'
              ? 'Workspace Exploration'
            : kind === 'file-read'
              ? 'Read File'
            : 'Tool Output',
        body: result,
        conversationId,
        toolCallId,
        toolKind: kind,
        fileDiffs: toolResultOptions?.fileDiffs,
        fileChangeStatus: toolResultOptions?.fileChangeStatus,
        workspaceFileRead: kind === 'file-read' ? toolResultOptions?.workspaceFileRead : undefined,
        ...(kind === 'web-search' ? {
          webSearchStatus: toolResultOptions?.webSearchStatus ?? (webSearchResults ? 'success' : 'searching'),
          webSearchQuery: label,
          webSearchResults
        } : kind === 'workspace-exploration' ? {
          workspaceExploration: mergeWorkspaceExplorationArtifacts(
            undefined,
            toolResultOptions?.workspaceExploration
          )
        } : {})
      });
    }

    if (toolResultOptions?.deferFollowUp) {
      if (toolResultOptions.localAssistantSummary?.trim()) {
        state.addMessage({
          id: `assistant-local-summary-${ts}`,
          role: 'assistant',
          title: 'Octomus',
          body: toolResultOptions.localAssistantSummary.trim(),
          conversationId,
          runId,
          status: 'completed',
          isStreaming: false,
          createdAt: new Date().toISOString()
        });
      }
      return;
    }

    const existingContinuation = toolResultContinuationRef.current[toolCallId];
    if (existingContinuation?.status === 'started') {
      return;
    }

    if (existingContinuation?.status === 'failed') {
      delete toolResultContinuationRef.current[toolCallId];
    }

    const nextAssistantMessageId = `assistant-followup-${ts}`;
    toolResultContinuationRef.current[toolCallId] = {
      assistantMessageId: nextAssistantMessageId,
      status: 'started'
    };
    state.addMessage({
      id: nextAssistantMessageId,
      role: 'assistant',
      title: 'Octomus',
      body: '',
      conversationId,
      runId,
      isStreaming: true,
      status: 'running',
      createdAt: new Date().toISOString()
    });

    try {
      await continueAgentAfterToolResult(
        conversationId,
        runId,
        nextAssistantMessageId
      );
    } catch (error) {
      toolResultContinuationRef.current[toolCallId] = {
        assistantMessageId: nextAssistantMessageId,
        status: 'failed'
      };
      state.updateMessage(nextAssistantMessageId, (message) => ({
        ...message,
        body: `Eroare la continuarea agentului: ${error}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  return { saveCurrentConversation, submitQuery, submitToolResult, submitPlanProposal, submitPlanExecution, attachFiles };
}

function mergeWorkstreams(
  currentWorkstreams: ExecutionPlanWorkstream[],
  incomingWorkstreams: ExecutionPlanWorkstream[]
) {
  const nextById = new Map(currentWorkstreams.map((workstream) => [workstream.id, workstream]));

  incomingWorkstreams.forEach((workstream) => {
    nextById.set(workstream.id, workstream);
  });

  return Array.from(nextById.values());
}

function mergeWorkspaceExplorationArtifacts(
  current?: WorkspaceExplorationArtifact,
  incoming?: WorkspaceExplorationArtifact
): WorkspaceExplorationArtifact | undefined {
  if (!current && !incoming) {
    return undefined;
  }

  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  const currentSegments = current.segments ?? [];
  const incomingSegments = incoming.segments ?? [];
  const mergedSegments: WorkspaceExplorationSegment[] = [...currentSegments, ...incomingSegments];

  const mergedSearches = mergedSegments.length > 0
    ? mergedSegments.flatMap((segment) => segment.searches ?? [])
    : [...(current.searches ?? []), ...(incoming.searches ?? [])];
  const mergedFiles = mergedSegments.length > 0
    ? mergedSegments.flatMap((segment) => segment.files ?? [])
    : [...(current.files ?? []), ...(incoming.files ?? [])];
  const mergedDirectories = mergedSegments.length > 0
    ? mergedSegments.flatMap((segment) => segment.directories ?? [])
    : [...(current.directories ?? []), ...(incoming.directories ?? [])];

  return {
    query: incoming.query || current.query,
    mode: incoming.mode || current.mode,
    path: incoming.path || current.path,
    summary: incoming.summary?.trim() || current.summary,
    segments: mergedSegments,
    searches: mergedSearches,
    files: mergedFiles,
    directories: mergedDirectories
  };
}

function mergeWorkspaceFileReadIntoExploration(
  current: WorkspaceExplorationArtifact,
  fileRead: WorkspaceFileReadArtifact
): WorkspaceExplorationArtifact {
  const existingSegments = current.segments ?? [];
  const alreadyPresent = existingSegments.some((segment) => (
    (segment.entries ?? []).some((entry) => entry.kind === 'read' && entry.path === fileRead.path)
  ));

  if (alreadyPresent) {
    return current;
  }

  const createdAt = new Date().toISOString();
  const nextSegment: WorkspaceExplorationSegment = {
    id: `workspace-exploration-read-${createdAt}`,
    createdAt,
    summary: undefined,
    entries: [{
      id: `workspace-exploration-read-entry-${createdAt}`,
      kind: 'read',
      text: `Read ${fileNameFromWorkspacePath(fileRead.displayPath || fileRead.path)}`,
      detail: fileRead.displayPath,
      path: fileRead.path,
      createdAt
    }],
    searches: [],
    files: [{
      path: fileRead.path,
      source: 'filesystem',
      snippet: undefined
    }],
    directories: []
  };

  return mergeWorkspaceExplorationArtifacts(current, {
    ...current,
    segments: [nextSegment],
    searches: [],
    files: nextSegment.files,
    directories: []
  }) ?? current;
}

function fileNameFromWorkspacePath(path: string) {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  return normalized.split('/').pop() || normalized;
}
