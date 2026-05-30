export const RESERVED_SLASH_COMMANDS = new Set([
  'agent',
  'new',
  'create-environment',
  'open-file',
  'conversations',
  'prompts',
  'plan'
]);

export const SKILL_SLASH_ALIASES: Record<string, string> = {
  '/cloud-agent': [
    '@skills/octo-platform',
    'Guide me to set up a cloud agent in Octomus.',
    'Keep the answer short and use bullet points.',
    'Cover exactly these points:',
    '- What a cloud agent is here.',
    '- Two modes: new cloud tab, or agent execution from the current chat session.',
    '- If Modal is already configured in the local CLI, say that the user can continue from chat directly.',
    '- Two connection options: Modal and VPS / Custom VM.',
    '- If the user wants a separate cloud tab, tell them the Settings > Cloud profile is used by the topbar Cloud term action.',
    '- Mention that credentials are stored in the OS secure store, while settings only keep a profile reference.',
    '- Mention that a durable remote harness needs the Octomus CLI/runner installed on that cloud instance so work can continue after the desktop window closes.',
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
  '/tab-configs': [
    '@skills/tab-configs',
    "Respond in the user's language if the context makes it clear; otherwise use English.",
    'Keep it short and practical.',
    'Say only what the user can do with tab configs, what they can ask you to change, and when split view / commands / parameters help.',
    'End with a brief offer to create a new layout or modify an existing one.'
  ].join('\n'),
  '/create-tab-config': [
    '@skills/create-tab-config',
    "Respond in the user's language if the context makes it clear; otherwise use English.",
    'Keep it short.',
    'Help the user create a new tab config by saying what details you need and what the next step is.',
    'Do not explain the full schema or give long examples.'
  ].join('\n'),
  '/update-tab-config': [
    '@skills/update-tab-config',
    "Respond in the user's language if the context makes it clear; otherwise use English.",
    'Keep it short.',
    'Help the user update an existing tab config by saying what needs to change and what details are still missing, if any.',
    'Do not explain the full schema or give long examples.'
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

export function shouldForceCloudAgentPrompt(prompt: string) {
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

export function resolveAgentPrompt(rawPrompt: string) {
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
