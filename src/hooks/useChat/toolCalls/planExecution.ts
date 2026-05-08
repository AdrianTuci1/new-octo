import type { ExecutionPlanWorkstream, PlanExecutionUpdate } from '../../../types/chat';
import type { ToolCallHandler } from './types';

function normalizeWorkstream(workstream: any, index: number): ExecutionPlanWorkstream | null {
  const title = typeof workstream?.title === 'string'
    ? workstream.title.trim()
    : typeof workstream?.label === 'string'
      ? workstream.label.trim()
      : '';

  if (!title) {
    return null;
  }

  return {
    id: typeof workstream?.id === 'string' && workstream.id.trim().length > 0
      ? workstream.id.trim()
      : `workstream-${index + 1}`,
    title,
    status: workstream?.status === 'inProgress'
      ? 'inProgress'
      : workstream?.status === 'completed'
        ? 'completed'
        : workstream?.status === 'failed'
          ? 'failed'
          : 'pending',
    stepIds: Array.isArray(workstream?.stepIds)
      ? workstream.stepIds.filter((stepId: unknown): stepId is string => (
          typeof stepId === 'string' && stepId.trim().length > 0
        )).map((stepId: string) => stepId.trim())
      : []
  };
}

function normalizePlanExecution(args: any): PlanExecutionUpdate | undefined {
  const planId = typeof args?.planId === 'string'
    ? args.planId.trim()
    : typeof args?.id === 'string'
      ? args.id.trim()
      : '';
  const stepId = typeof args?.stepId === 'string' ? args.stepId.trim() : '';
  const action = args?.action === 'started' || args?.action === 'completed' || args?.action === 'failed'
    ? args.action
    : undefined;

  if (!planId || !stepId || !action) {
    return undefined;
  }

  return {
    planId,
    stepId,
    action,
    summary: typeof args?.summary === 'string' ? args.summary.trim() : undefined,
    workstreams: Array.isArray(args?.workstreams)
      ? args.workstreams.map(normalizeWorkstream).filter(Boolean) as ExecutionPlanWorkstream[]
      : undefined
  };
}

export const planExecutionToolCallHandler: ToolCallHandler = {
  names: ['plan_execution'],
  recordRawToolCall: false,
  handle: ({ registrations, toolCall }) => {
    const update = normalizePlanExecution(toolCall.args);
    if (!update) return;

    registrations.forEach((registration) => {
      registration.applyPlanExecution(update, toolCall.id);
    });
  }
};
