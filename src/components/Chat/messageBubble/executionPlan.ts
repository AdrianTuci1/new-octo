import type { ExecutionPlanArtifact } from '../../../types/chat';

function sanitizeArtifactId(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function buildExecutionPlanDocument(plan: ExecutionPlanArtifact) {
  const completedSteps = plan.steps.filter((step) => step.status === 'completed');
  const inProgressSteps = plan.steps.filter((step) => step.status === 'inProgress');
  const pendingSteps = plan.steps.filter((step) => step.status === 'pending');

  return [
    `# ${plan.title}`,
    '',
    plan.summary?.trim() || 'Execution plan proposed.',
    ...(plan.workstreams?.length
      ? [
          '',
          '## Workstreams',
          ...plan.workstreams.map((workstream) => {
            const linkedSteps = workstream.stepIds.length > 0
              ? ` - steps: ${workstream.stepIds.join(', ')}`
              : '';
            return `- [${workstream.status}] ${workstream.title}${linkedSteps}`;
          })
        ]
      : []),
    '',
    '## Tasks',
    ...completedSteps.map((step) => `- [x] ${step.label}`),
    ...inProgressSteps.map((step) => `- [ ] ${step.label} _(in progress)_`),
    ...pendingSteps.map((step) => `- [ ] ${step.label}`),
    '',
    '## Metadata',
    `- id: ${plan.id}`,
    `- version: ${plan.version ?? 'v1'}`
  ].join('\n');
}

export function openExecutionPlanInEditor(
  plan: ExecutionPlanArtifact,
  openFile: (path: string, name: string, content?: string, options?: { presentation?: 'artifact-markdown'; readOnly?: boolean }) => void
) {
  const safeId = sanitizeArtifactId(plan.id);
  const path = `/private/tmp/octomus-plan-${safeId}.md`;
  const fileName = `plan-${safeId}.md`;
  openFile(path, fileName, buildExecutionPlanDocument(plan), {
    presentation: 'artifact-markdown',
    readOnly: true
  });
}
