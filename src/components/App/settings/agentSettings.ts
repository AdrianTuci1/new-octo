import type { MemorySettingsValues } from '../../../types/memory';
import type { ThinkingDisplayMode } from '../../../types/chat';

export type AgentPermissionMode = 'Agent decides' | 'Always ask' | 'Never allow';
export type AgentQuestionMode = 'Ask unless auto-approve' | 'Always ask' | 'Never ask';

export type AgentProfileSettings = {
  id: string;
  name: string;
  baseModel: string;
  terminalModel: string;
  applyDiffs: AgentPermissionMode;
  readFiles: AgentPermissionMode;
  directoryAllowlist: string[];
  executeCommands: AgentPermissionMode;
  commandAllowlist: string[];
  interactWithRunningCommands: AgentPermissionMode;
  askQuestions: AgentQuestionMode;
  callMcpServers: AgentPermissionMode;
  mcpAllowlist: string[];
  mcpDenylist: string[];
  callWebTools: boolean;
  planAutoSync: boolean;
};

export type AgentMcpSettings = {
  autoSpawnFromThirdPartyAgents: boolean;
  enabledServerIds: string[];
  customServers: Array<{
    id: string;
    name: string;
    description: string;
  }>;
};

export type AgentRule = {
  id: string;
  name: string;
  content: string;
  category: 'global' | 'project';
};

export type AgentThirdPartyCliSettings = {
  showToolbar: boolean;
  autoShowHideRichInput: boolean;
  autoOpenRichInput: boolean;
  autoDismissRichInput: boolean;
  commandPatterns: string[];
  leftChipIds: string[];
  rightChipIds: string[];
};

export type AgentSettings = {
  enabled: boolean;
  activeAi: {
    nextCommand: boolean;
    promptSuggestions: boolean;
    suggestedCodeBanners: boolean;
    sharedBlockTitleGeneration: boolean;
  };
  input: {
    autodetectAgentPromptsInTerminal: boolean;
    autodetectTerminalCommandsInAgent: boolean;
    naturalLanguageDenylist: string;
    showInputHintText: boolean;
    showAgentTips: boolean;
    includeAgentExecutedCommandsInHistory: boolean;
  };
  permissions: {
    webSearch: boolean;
    computerUse: boolean;
  };
  other: {
    showOzChangelog: boolean;
    showUseAgentFooter: boolean;
    showConversationHistoryInToolsPanel: boolean;
    thinkingDisplayMode: ThinkingDisplayMode;
    preferredConversationLayout: 'new-tab' | 'current-pane' | 'split-pane';
  };
  profiles: AgentProfileSettings[];
  knowledge: {
    rulesEnabled: boolean;
    suggestedRulesEnabled: boolean;
    octoDriveContextEnabled: boolean;
    rules: AgentRule[];
  };
  mcp: AgentMcpSettings;
  thirdPartyCli: AgentThirdPartyCliSettings;
};

export const DEFAULT_PROFILE: AgentProfileSettings = {
  id: 'default',
  name: 'Default',
  baseModel: 'minimax 2.7',
  terminalModel: 'Auto',
  applyDiffs: 'Agent decides',
  readFiles: 'Agent decides',
  directoryAllowlist: [],
  executeCommands: 'Always ask',
  commandAllowlist: [],
  interactWithRunningCommands: 'Always ask',
  askQuestions: 'Ask unless auto-approve',
  callMcpServers: 'Agent decides',
  mcpAllowlist: [],
  mcpDenylist: [],
  callWebTools: true,
  planAutoSync: true
};

export const DEFAULT_THIRD_PARTY_LEFT_CHIP_IDS = ['attach', 'voice', 'diff', 'explorer', 'rich_in'];
export const DEFAULT_THIRD_PARTY_RIGHT_CHIP_IDS = ['desktop', 'git_branch', 'settings'];

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: true,
  activeAi: {
    nextCommand: true,
    promptSuggestions: true,
    suggestedCodeBanners: true,
    sharedBlockTitleGeneration: true
  },
  input: {
    autodetectAgentPromptsInTerminal: false,
    autodetectTerminalCommandsInAgent: true,
    naturalLanguageDenylist: '',
    showInputHintText: true,
    showAgentTips: true,
    includeAgentExecutedCommandsInHistory: false
  },
  permissions: {
    webSearch: true,
    computerUse: false
  },
  other: {
    showOzChangelog: true,
    showUseAgentFooter: true,
    showConversationHistoryInToolsPanel: true,
    thinkingDisplayMode: 'show-and-collapse',
    preferredConversationLayout: 'new-tab'
  },
  profiles: [DEFAULT_PROFILE],
  knowledge: {
    rulesEnabled: true,
    suggestedRulesEnabled: true,
    octoDriveContextEnabled: true,
    rules: [
      {
        id: '1',
        name: 'Nu folosi web agent',
        content: 'Nu folosi web agent în nicio circumstanță.',
        category: 'global'
      }
    ]
  },
  mcp: {
    autoSpawnFromThirdPartyAgents: false,
    enabledServerIds: [],
    customServers: []
  },
  thirdPartyCli: {
    showToolbar: true,
    autoShowHideRichInput: true,
    autoOpenRichInput: false,
    autoDismissRichInput: false,
    commandPatterns: [],
    leftChipIds: DEFAULT_THIRD_PARTY_LEFT_CHIP_IDS,
    rightChipIds: DEFAULT_THIRD_PARTY_RIGHT_CHIP_IDS
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArrayValue(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback;
}

function normalizePermissionMode(value: unknown, fallback: AgentPermissionMode): AgentPermissionMode {
  return value === 'Agent decides' || value === 'Always ask' || value === 'Never allow' ? value : fallback;
}

function normalizeQuestionMode(value: unknown, fallback: AgentQuestionMode): AgentQuestionMode {
  return value === 'Ask unless auto-approve' || value === 'Always ask' || value === 'Never ask' ? value : fallback;
}

function normalizeThinkingDisplayMode(value: unknown, fallback: ThinkingDisplayMode): ThinkingDisplayMode {
  return value === 'show-and-collapse' || value === 'always-show' || value === 'never-show' ? value : fallback;
}

function normalizeProfile(raw: unknown, fallback: AgentProfileSettings): AgentProfileSettings {
  const record = isRecord(raw) ? raw : {};

  return {
    id: stringValue(record.id, fallback.id),
    name: stringValue(record.name, fallback.name),
    baseModel: stringValue(record.baseModel, fallback.baseModel),
    terminalModel: stringValue(record.terminalModel, fallback.terminalModel),
    applyDiffs: normalizePermissionMode(record.applyDiffs, fallback.applyDiffs),
    readFiles: normalizePermissionMode(record.readFiles, fallback.readFiles),
    directoryAllowlist: stringArrayValue(record.directoryAllowlist, fallback.directoryAllowlist),
    executeCommands: normalizePermissionMode(record.executeCommands, fallback.executeCommands),
    commandAllowlist: stringArrayValue(record.commandAllowlist, fallback.commandAllowlist),
    interactWithRunningCommands: normalizePermissionMode(record.interactWithRunningCommands, fallback.interactWithRunningCommands),
    askQuestions: normalizeQuestionMode(record.askQuestions, fallback.askQuestions),
    callMcpServers: normalizePermissionMode(record.callMcpServers, fallback.callMcpServers),
    mcpAllowlist: stringArrayValue(record.mcpAllowlist, fallback.mcpAllowlist),
    mcpDenylist: stringArrayValue(record.mcpDenylist, fallback.mcpDenylist),
    callWebTools: booleanValue(record.callWebTools, fallback.callWebTools),
    planAutoSync: booleanValue(record.planAutoSync, fallback.planAutoSync)
  };
}

function normalizeRule(raw: unknown): AgentRule | null {
  const record = isRecord(raw) ? raw : null;
  if (!record) return null;

  const name = stringValue(record.name, '').trim();
  const content = stringValue(record.content, '').trim();
  if (!name || !content) return null;

  return {
    id: stringValue(record.id, `rule_${Date.now()}`),
    name,
    content,
    category: record.category === 'project' ? 'project' : 'global'
  };
}

export function normalizeAgentSettings(values?: MemorySettingsValues | null): AgentSettings {
  const rawAgent = isRecord(values?.agent) ? values.agent : {};
  const rawActiveAi = isRecord(rawAgent.activeAi) ? rawAgent.activeAi : {};
  const rawInput = isRecord(rawAgent.input) ? rawAgent.input : {};
  const rawPermissions = isRecord(rawAgent.permissions) ? rawAgent.permissions : {};
  const rawOther = isRecord(rawAgent.other) ? rawAgent.other : {};
  const rawKnowledge = isRecord(rawAgent.knowledge) ? rawAgent.knowledge : {};
  const rawMcp = isRecord(rawAgent.mcp) ? rawAgent.mcp : {};
  const rawThirdPartyCli = isRecord(rawAgent.thirdPartyCli) ? rawAgent.thirdPartyCli : {};
  const rawProfiles = Array.isArray(rawAgent.profiles) ? rawAgent.profiles : DEFAULT_AGENT_SETTINGS.profiles;
  const normalizedProfiles = rawProfiles.map((profile, index) => normalizeProfile(profile, index === 0 ? DEFAULT_PROFILE : {
    ...DEFAULT_PROFILE,
    id: `profile_${index}`,
    name: `Profile ${index + 1}`
  }));

  const webSearch = typeof values?.webSearchEnabled === 'boolean'
    ? values.webSearchEnabled
    : booleanValue(rawPermissions.webSearch, DEFAULT_AGENT_SETTINGS.permissions.webSearch);
  const thinkingDisplayMode = normalizeThinkingDisplayMode(
    values?.thinkingDisplayMode ?? rawOther.thinkingDisplayMode,
    DEFAULT_AGENT_SETTINGS.other.thinkingDisplayMode
  );
  const autodetectTerminalCommandsInAgent = typeof values?.terminalAutoDetectEnabled === 'boolean'
    ? values.terminalAutoDetectEnabled
    : booleanValue(rawInput.autodetectTerminalCommandsInAgent, DEFAULT_AGENT_SETTINGS.input.autodetectTerminalCommandsInAgent);

  return {
    enabled: booleanValue(rawAgent.enabled, DEFAULT_AGENT_SETTINGS.enabled),
    activeAi: {
      nextCommand: booleanValue(rawActiveAi.nextCommand, DEFAULT_AGENT_SETTINGS.activeAi.nextCommand),
      promptSuggestions: booleanValue(rawActiveAi.promptSuggestions, DEFAULT_AGENT_SETTINGS.activeAi.promptSuggestions),
      suggestedCodeBanners: booleanValue(rawActiveAi.suggestedCodeBanners, DEFAULT_AGENT_SETTINGS.activeAi.suggestedCodeBanners),
      sharedBlockTitleGeneration: booleanValue(rawActiveAi.sharedBlockTitleGeneration, DEFAULT_AGENT_SETTINGS.activeAi.sharedBlockTitleGeneration)
    },
    input: {
      autodetectAgentPromptsInTerminal: booleanValue(rawInput.autodetectAgentPromptsInTerminal, DEFAULT_AGENT_SETTINGS.input.autodetectAgentPromptsInTerminal),
      autodetectTerminalCommandsInAgent,
      naturalLanguageDenylist: stringValue(rawInput.naturalLanguageDenylist, DEFAULT_AGENT_SETTINGS.input.naturalLanguageDenylist),
      showInputHintText: booleanValue(rawInput.showInputHintText, DEFAULT_AGENT_SETTINGS.input.showInputHintText),
      showAgentTips: booleanValue(rawInput.showAgentTips, DEFAULT_AGENT_SETTINGS.input.showAgentTips),
      includeAgentExecutedCommandsInHistory: booleanValue(rawInput.includeAgentExecutedCommandsInHistory, DEFAULT_AGENT_SETTINGS.input.includeAgentExecutedCommandsInHistory)
    },
    permissions: {
      webSearch,
      computerUse: booleanValue(rawPermissions.computerUse, DEFAULT_AGENT_SETTINGS.permissions.computerUse)
    },
    other: {
      showOzChangelog: booleanValue(rawOther.showOzChangelog, DEFAULT_AGENT_SETTINGS.other.showOzChangelog),
      showUseAgentFooter: booleanValue(rawOther.showUseAgentFooter, DEFAULT_AGENT_SETTINGS.other.showUseAgentFooter),
      showConversationHistoryInToolsPanel: booleanValue(rawOther.showConversationHistoryInToolsPanel, DEFAULT_AGENT_SETTINGS.other.showConversationHistoryInToolsPanel),
      thinkingDisplayMode,
      preferredConversationLayout: rawOther.preferredConversationLayout === 'current-pane' || rawOther.preferredConversationLayout === 'split-pane'
        ? rawOther.preferredConversationLayout
        : DEFAULT_AGENT_SETTINGS.other.preferredConversationLayout
    },
    profiles: normalizedProfiles.some((profile) => profile.id === 'default') ? normalizedProfiles : [DEFAULT_PROFILE, ...normalizedProfiles],
    knowledge: {
      rulesEnabled: booleanValue(rawKnowledge.rulesEnabled, DEFAULT_AGENT_SETTINGS.knowledge.rulesEnabled),
      suggestedRulesEnabled: booleanValue(rawKnowledge.suggestedRulesEnabled, DEFAULT_AGENT_SETTINGS.knowledge.suggestedRulesEnabled),
      octoDriveContextEnabled: booleanValue(rawKnowledge.octoDriveContextEnabled, DEFAULT_AGENT_SETTINGS.knowledge.octoDriveContextEnabled),
      rules: Array.isArray(rawKnowledge.rules)
        ? rawKnowledge.rules.map(normalizeRule).filter((rule): rule is AgentRule => Boolean(rule))
        : DEFAULT_AGENT_SETTINGS.knowledge.rules
    },
    mcp: {
      autoSpawnFromThirdPartyAgents: booleanValue(rawMcp.autoSpawnFromThirdPartyAgents, DEFAULT_AGENT_SETTINGS.mcp.autoSpawnFromThirdPartyAgents),
      enabledServerIds: stringArrayValue(rawMcp.enabledServerIds, DEFAULT_AGENT_SETTINGS.mcp.enabledServerIds),
      customServers: Array.isArray(rawMcp.customServers)
        ? rawMcp.customServers.filter(isRecord).map((server, index) => ({
            id: stringValue(server.id, `custom_${index}`),
            name: stringValue(server.name, 'Custom MCP server'),
            description: stringValue(server.description, 'Custom server configured locally.')
          }))
        : DEFAULT_AGENT_SETTINGS.mcp.customServers
    },
    thirdPartyCli: {
      showToolbar: booleanValue(rawThirdPartyCli.showToolbar, DEFAULT_AGENT_SETTINGS.thirdPartyCli.showToolbar),
      autoShowHideRichInput: booleanValue(rawThirdPartyCli.autoShowHideRichInput, DEFAULT_AGENT_SETTINGS.thirdPartyCli.autoShowHideRichInput),
      autoOpenRichInput: booleanValue(rawThirdPartyCli.autoOpenRichInput, DEFAULT_AGENT_SETTINGS.thirdPartyCli.autoOpenRichInput),
      autoDismissRichInput: booleanValue(rawThirdPartyCli.autoDismissRichInput, DEFAULT_AGENT_SETTINGS.thirdPartyCli.autoDismissRichInput),
      commandPatterns: stringArrayValue(rawThirdPartyCli.commandPatterns, DEFAULT_AGENT_SETTINGS.thirdPartyCli.commandPatterns),
      leftChipIds: stringArrayValue(rawThirdPartyCli.leftChipIds, DEFAULT_AGENT_SETTINGS.thirdPartyCli.leftChipIds),
      rightChipIds: stringArrayValue(rawThirdPartyCli.rightChipIds, DEFAULT_AGENT_SETTINGS.thirdPartyCli.rightChipIds)
    }
  };
}

export function buildAgentSettingsValues(agent: AgentSettings): MemorySettingsValues {
  return {
    agent,
    webSearchEnabled: agent.permissions.webSearch,
    terminalAutoDetectEnabled: agent.input.autodetectTerminalCommandsInAgent,
    thinkingDisplayMode: agent.other.thinkingDisplayMode
  };
}

export function createNewAgentProfile(name = 'New Profile'): AgentProfileSettings {
  const id = `profile_${Date.now()}`;
  return {
    ...DEFAULT_PROFILE,
    id,
    name,
    baseModel: 'minimax 2.7 (us-hosted)',
    terminalModel: 'kimi k2.6 (us-hosted)'
  };
}
