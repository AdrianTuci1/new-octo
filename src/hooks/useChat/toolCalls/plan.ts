import type { ExecutionPlanArtifact, ExecutionPlanStep, ExecutionPlanWorkstream } from '../../../types/chat';
import type { ToolCallHandler } from './types';

function normalizePlanStep(step: any, index: number): ExecutionPlanStep | null {
  const label = typeof step?.label === 'string'
    ? step.label.trim()
    : typeof step?.title === 'string'
      ? step.title.trim()
      : '';

  if (!label) {
    return null;
  }

  return {
    id: typeof step?.id === 'string' && step.id.trim().length > 0
      ? step.id.trim()
      : `step-${index + 1}`,
    label,
    status: step?.status === 'inProgress'
      ? 'inProgress'
      : step?.status === 'failed'
        ? 'failed'
        : step?.completed === true || step?.status === 'completed'
          ? 'completed'
          : 'pending'
  };
}

function normalizePlanWorkstream(workstream: any, index: number): ExecutionPlanWorkstream | null {
  const title = typeof workstream?.title === 'string'
    ? workstream.title.trim()
    : typeof workstream?.label === 'string'
      ? workstream.label.trim()
      : '';

  if (!title) {
    return null;
  }

  const stepIds = Array.isArray(workstream?.stepIds)
    ? workstream.stepIds.filter((stepId: unknown): stepId is string => (
        typeof stepId === 'string' && stepId.trim().length > 0
      )).map((stepId: string) => stepId.trim())
    : [];

  return {
    id: typeof workstream?.id === 'string' && workstream.id.trim().length > 0
      ? workstream.id.trim()
      : `workstream-${index + 1}`,
    title,
    status: workstream?.status === 'inProgress'
      ? 'inProgress'
      : workstream?.status === 'failed'
        ? 'failed'
        : workstream?.status === 'completed'
          ? 'completed'
          : 'pending',
    stepIds
  };
}

function normalizePlan(args: any): ExecutionPlanArtifact | undefined {
  const title = typeof args?.title === 'string' ? args.title.trim() : '';
  const steps = Array.isArray(args?.steps)
    ? args.steps.map(normalizePlanStep).filter(Boolean) as ExecutionPlanStep[]
    : [];
  const workstreams = Array.isArray(args?.workstreams)
    ? args.workstreams.map(normalizePlanWorkstream).filter(Boolean) as ExecutionPlanWorkstream[]
    : [];

  if (!title || steps.length === 0) {
    return undefined;
  }

  return {
    id: typeof args?.artifactId === 'string' && args.artifactId.trim().length > 0
      ? args.artifactId.trim()
      : typeof args?.id === 'string' && args.id.trim().length > 0
        ? args.id.trim()
        : `plan-${Date.now()}`,
    title,
    summary: typeof args?.summary === 'string' ? args.summary.trim() : undefined,
    version: typeof args?.version === 'string' ? args.version.trim() : undefined,
    steps,
    workstreams
  };
}

export const planToolCallHandler: ToolCallHandler = {
  names: ['propose_plan', 'update_plan'],
  handle: ({ registrations, toolCall }) => {
    const plan = normalizePlan(toolCall.args);
    if (!plan) return;

    registrations.forEach((registration) => {
      registration.showPlan(plan, toolCall.id);
    });
  }
};
