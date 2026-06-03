import type { ToolCallHandler } from './types';

function stringArg(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export const cloudAgentToolCallHandler: ToolCallHandler = {
  names: ['launch_cloud_agent'],
  handle: ({ registrations, toolCall }) => {
    const prompt = stringArg(toolCall.args?.prompt);
    const repo = stringArg(toolCall.args?.repo);
    const baseBranch = stringArg(toolCall.args?.baseBranch);
    const workBranch = stringArg(toolCall.args?.workBranch);
    const profileId = stringArg(toolCall.args?.profileId);
    const provider = stringArg(toolCall.args?.provider);
    const syncStrategy = stringArg(toolCall.args?.syncStrategy);
    const commitMessage = stringArg(toolCall.args?.commitMessage);
    const artifactPath = stringArg(toolCall.args?.artifactPath);

    registrations.forEach((registration) => {
      registration.update((message) => ({
        ...message,
        body: message.body.trim().length > 0
          ? message.body
          : 'Launching a cloud agent run.'
      }));

      registration.onCloudAgentLaunch?.({
        toolCallId: toolCall.id,
        prompt,
        provider: provider || null,
        profileId: profileId || null,
        repo: repo || null,
        baseBranch: baseBranch || null,
        workBranch: workBranch || null,
        syncStrategy: syncStrategy || null,
        commitMessage: commitMessage || null,
        artifactPath: artifactPath || null
      });
    });
  }
};
