import type { CommandApproval } from '../../../../../types';
import type { AgentProfileSettings } from '../../../../App/settings/agentSettings';

export function commandMatchesAllowPattern(command: string, pattern: string) {
  const normalizedCommand = command.trim();
  const normalizedPattern = pattern.trim();

  if (!normalizedCommand || !normalizedPattern) {
    return false;
  }

  try {
    return new RegExp(normalizedPattern).test(normalizedCommand);
  } catch {
    return normalizedPattern === normalizedCommand;
  }
}

export function shouldAutoApprovePendingApproval(params: {
  approval: CommandApproval | null | undefined;
  activeProfile?: AgentProfileSettings | null;
  autoApproveAgentLoop: boolean;
}) {
  const { approval, activeProfile, autoApproveAgentLoop } = params;

  if (!approval || approval.kind === 'topic-change' || approval.kind === 'remote-cli-install') {
    return false;
  }

  if (autoApproveAgentLoop) {
    return true;
  }

  if (!('command' in approval) || !activeProfile) {
    return false;
  }

  if (activeProfile.askQuestions === 'Always ask') {
    return false;
  }

  return activeProfile.commandAllowlist.some((pattern) => (
    commandMatchesAllowPattern(approval.command, pattern)
  ));
}
