import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { UseChatOptions } from '../types';
import type { AgentContinueRequest, AgentStartResponse, ExecutionPlanArtifact, ExecutionPlanWorkstream, PlanExecutionUpdate } from '../../../types/chat';
import { useMemoryStore } from '../../../stores/memoryStore';
import { artifactsFromMessages, chatHistoryFromMessages, titleFromConversationContent, statusFromConversationContent } from '../helpers';
import { pendingTokenText, setAssistantRegistration } from '../bridge';
import type { useChatState } from './useChatState';

const RESERVED_SLASH_COMMANDS = new Set([
  'agent',
  'new',
  'create-environment',
  'open-file',
  'conversations',
  'prompts',
  'plan'
]);

const SKILL_SLASH_ALIASES: Record<string, string> = {
  '/cloud-agent': [
    '@skills/octo-platform',
    'Guide me to set up a cloud agent in Octomus.',
    'Keep the answer short and use bullet points.',
    'Cover exactly these points:',
    '- What a cloud agent is here.',
    '- Two modes: new cloud tab, or agent execution from the current chat session.',
    '- If Modal is already configured in the local CLI, say that the user can continue from chat directly.',
    '- Two connection options: Modal and VPS / Custom VM.',
    '- If the user wants a separate cloud tab rather than chat execution, recommend `/create-environment`.',
    '- Mention that after setup, the app can link the connection.',
    '- Give one short example such as migrating MySQL to DynamoDB.',
    'Include these exact clickable markdown links on separate lines:',
    '[Configure Modal](octomus://cloud-profile/modal)',
    '[Configure VPS](octomus://cloud-profile/custom-vm)',
    'If the user wants to create or edit files inside the cloud agent, use propose_file_change with fileDiffs instead of a heredoc or EOF block. Use propose_terminal_command only for infrastructure steps like mkdir -p or running modal commands.',
    'Do not start with a long paragraph. Do not ask more than one next-step question.'
  ].join('\n'),
  '/create-environment': [
    '@skills/create-environment',
    'Guide me using short bullet points.',
    'Explain local vs cloud environments, and say that this is the preferred path when the user wants a separate cloud tab instead of a cloud agent inside the current chat.'
  ].join('\n'),
  '/create-mcp': [
    '@skills/add-mcp-server',
    'Guide me to add an MCP server using this skill.',
    'If scope is not obvious, ask whether this should be global or project-scoped before proposing configuration changes.'
  ].join('\n'),
  '/prompts': [
    '@skills/prompts',
    'Guide me using short bullet points and keep it concise.'
  ].join('\n')
};

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

function shouldForceCloudAgentPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  const mentionsCloudAgent = normalized.includes('cloud-agent') || normalized.includes('/cloud-agent');
  const mentionsModal = normalized.includes('modal');
  const mentionsFileTask = [
    'create file',
    'create a file',
    'creeaza',
    'creaza',
    'fișier',
    'fisier',
    'file ',
    'document',
    'scrie',
    'write'
  ].some((needle) => normalized.includes(needle));

  return (mentionsCloudAgent || mentionsModal) && mentionsFileTask;
}

type UseChatActionsProps = {
  options: UseChatOptions;
  state: ReturnType<typeof useChatState>;
  onCommandApprovalRef: React.MutableRefObject<UseChatOptions['onCommandApproval']>;
  onFileChangeApprovalRef: React.MutableRefObject<UseChatOptions['onFileChangeApproval']>;
  onWebSearchRef: React.MutableRefObject<UseChatOptions['onWebSearch']>;
};

function resolveAgentPrompt(rawPrompt: string) {
  const trimmed = rawPrompt.trim();
  if (!trimmed.startsWith('/')) {
    return trimmed;
  }

  const aliasedPrompt = SKILL_SLASH_ALIASES[trimmed];
  if (aliasedPrompt) {
    return aliasedPrompt;
  }

  if (shouldForceCloudAgentPrompt(trimmed)) {
    return [
      '@skills/octo-platform',
      trimmed,
      'This is a Modal cloud-agent file task.',
      'If a directory is missing, use propose_terminal_command only for mkdir -p or the minimum infrastructure command.',
      'If a file must be created or edited, use propose_file_change with fileDiffs so the UI can show a native diff preview.',
      'Do not emit heredoc, EOF, or raw file content in the visible response.',
      'Prefer a minimal hello-world style Python file named helloOctomus.py when that is the requested target.'
    ].join('\n');
  }

  const match = trimmed.match(/^\/([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]+))?$/i);
  if (!match) {
    return trimmed;
  }

  const [, commandName, remainder] = match;
  if (RESERVED_SLASH_COMMANDS.has(commandName.toLowerCase())) {
    return trimmed;
  }

  if (remainder?.trim()) {
    return trimmed;
  }

  return [
    trimmed,
    'Guide me through this skill.',
    'Start by briefly explaining what this skill can help with, then ask only for the minimum missing details needed to proceed.'
  ].join('\n');
}

export function useChatActions({ options, state, onCommandApprovalRef, onFileChangeApprovalRef, onWebSearchRef }: UseChatActionsProps) {
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
      onWebSearch: (request) => onWebSearchRef.current?.(request)
    });

    const requestMessages = chatHistoryFromMessages(state.messagesRef.current);
      const response = await invoke<AgentStartResponse>('agent_continue', {
        request: {
          runId,
          conversationId,
          assistantMessageId,
          cwd: options.cwd ?? null,
          modelId: options.modelId ?? null,
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
    options.cwd,
    options.modelId,
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
    if (!trimmed) return;
    const resolvedPrompt = resolveAgentPrompt(trimmed);

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

    state.addMessage({
      id: `user-${ts}`,
      role: 'user',
      title: 'User',
      body: trimmed,
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
        body: buildSyntheticThinkingSummary(trimmed),
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
      onWebSearch: (request) => onWebSearchRef.current?.(request)
    });

    try {
      const requestMessages = chatHistoryFromMessages(state.messagesRef.current);

      const response = await invoke<AgentStartResponse>('agent_start', {
        request: {
          runId,
          conversationId,
          assistantMessageId,
          prompt: resolvedPrompt,
          cwd: options.cwd ?? null,
          modelId: options.modelId ?? null,
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
    kind: 'command' | 'web-search' = 'command',
    label?: string,
    webSearchResults?: Array<{ title: string; url: string; snippet?: string }>,
    toolResultOptions?: {
      deferFollowUp?: boolean;
      webSearchStatus?: 'searching' | 'success' | 'error';
    }
  ) => {
    const ts = Date.now();
    const conversationId = state.activeConversationIdRef.current;
    const runId = state.activeRunIdRef.current;

    if (!conversationId || !runId) return;

    const existingToolMessage = state.messagesRef.current.find((message) => (
      message.role === 'tool' && message.toolCallId === toolCallId
    ));
    const toolMessageId = existingToolMessage?.id ?? `tool-${ts}`;

    if (existingToolMessage) {
      state.updateMessage(existingToolMessage.id, (message) => ({
        ...message,
        title: kind === 'web-search' ? 'Web Search' : 'Tool Output',
        body: result,
        toolKind: kind,
        ...(kind === 'web-search' ? {
          webSearchStatus: toolResultOptions?.webSearchStatus ?? (webSearchResults ? 'success' : 'searching'),
          webSearchQuery: label,
          webSearchResults
        } : {})
      }));
    } else {
      state.addMessage({
        id: toolMessageId,
        role: 'tool',
        title: kind === 'web-search' ? 'Web Search' : 'Tool Output',
        body: result,
        conversationId,
        toolCallId,
        toolKind: kind,
        ...(kind === 'web-search' ? {
          webSearchStatus: toolResultOptions?.webSearchStatus ?? (webSearchResults ? 'success' : 'searching'),
          webSearchQuery: label,
          webSearchResults
        } : {})
      });
    }

    if (toolResultOptions?.deferFollowUp) {
      return;
    }

    const nextAssistantMessageId = `assistant-followup-${ts}`;
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
      state.updateMessage(nextAssistantMessageId, (message) => ({
        ...message,
        body: `Eroare la continuarea agentului: ${error}`,
        isError: true,
        status: 'failed',
        isStreaming: false
      }));
    }
  };

  return { saveCurrentConversation, submitQuery, submitToolResult, submitPlanProposal, submitPlanExecution };
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
