import { Plus } from 'lucide-react';
import { useMemoryStore, useUIStore } from '../../../../stores';
import type { ThinkingDisplayMode, ConfiguredModel } from '../../../../types/chat';
import { buildAgentSettingsValues, normalizeAgentSettings, type AgentSettings } from '../agentSettings';
import { SectionHeader, SettingsRow, SettingsSelect, SettingsToggle } from './SettingsPrimitives';

export function AgentSection() {
  const setIsModelDrawerOpen = useUIStore((state) => state.setIsModelDrawerOpen);
  const setSelectedModelIdForEdit = useUIStore((state) => state.setSelectedModelIdForEdit);
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const agentSettings = normalizeAgentSettings(settings?.values);
  const modelId = settings?.values.selectedModelId ?? null;
  const webSearchEnabled = agentSettings.permissions.webSearch;
  const thinkingDisplayMode = agentSettings.other.thinkingDisplayMode;
  const providerLabel = typeof settings?.values.aiProviderLabel === 'string' && settings.values.aiProviderLabel.trim().length > 0
    ? settings.values.aiProviderLabel
    : 'Configured provider';
  const friendlyName = typeof settings?.values.aiModelFriendlyName === 'string' && settings.values.aiModelFriendlyName.trim().length > 0
    ? settings.values.aiModelFriendlyName
    : null;

  const configuredModels = (settings?.values.configuredModels as ConfiguredModel[]) ?? (modelId ? [{
    id: modelId,
    providerLabel,
    modelId,
    baseUrl: typeof settings?.values.aiModelBaseUrl === 'string' ? settings.values.aiModelBaseUrl : 'https://api.openai.com/v1',
    friendlyName: friendlyName ?? undefined,
    hasApiKey: true
  }] : []);
  const thinkingDisplayModeLabel: Record<ThinkingDisplayMode, string> = {
    'show-and-collapse': 'Show & collapse',
    'always-show': 'Always show',
    'never-show': 'Never show'
  };
  const preferredLayoutLabel: Record<AgentSettings['other']['preferredConversationLayout'], string> = {
    'new-tab': 'New Tab',
    'current-pane': 'Current Pane',
    'split-pane': 'Split Pane'
  };
  const saveAgent = (nextAgentSettings: AgentSettings) => {
    void saveSettings(buildAgentSettingsValues(nextAgentSettings), true);
  };
  const patchAgent = (patch: Partial<AgentSettings>) => {
    saveAgent({ ...agentSettings, ...patch });
  };

  return (
    <section className="settings-panel">
      <div className="settings-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Octo Agent</h1>
        <SettingsToggle checked={agentSettings.enabled} onChange={() => patchAgent({ enabled: !agentSettings.enabled })} />
      </div>

      <div className="settings-group">
        <SectionHeader title="Active AI" />
        <SettingsRow 
          title="Next Command" 
          description="Let AI suggest the next command to run based on your command history, outputs, and common workflows."
          action={<SettingsToggle checked={agentSettings.activeAi.nextCommand} onChange={() => patchAgent({ activeAi: { ...agentSettings.activeAi, nextCommand: !agentSettings.activeAi.nextCommand } })} />}
        />
        <SettingsRow 
          title="Prompt Suggestions" 
          description="Let AI suggest natural language prompts, as inline banners in the input, based on recent commands and their outputs."
          action={<SettingsToggle checked={agentSettings.activeAi.promptSuggestions} onChange={() => patchAgent({ activeAi: { ...agentSettings.activeAi, promptSuggestions: !agentSettings.activeAi.promptSuggestions } })} />}
        />
        <SettingsRow 
          title="Suggested Code Banners" 
          description="Let AI suggest code diffs and queries as inline banners in the blocklist, based on recent commands and their outputs."
          action={<SettingsToggle checked={agentSettings.activeAi.suggestedCodeBanners} onChange={() => patchAgent({ activeAi: { ...agentSettings.activeAi, suggestedCodeBanners: !agentSettings.activeAi.suggestedCodeBanners } })} />}
        />
        <SettingsRow 
          title="Shared Block Title Generation" 
          description="Let AI generate a title for your shared block based on the command and output."
          action={<SettingsToggle checked={agentSettings.activeAi.sharedBlockTitleGeneration} onChange={() => patchAgent({ activeAi: { ...agentSettings.activeAi, sharedBlockTitleGeneration: !agentSettings.activeAi.sharedBlockTitleGeneration } })} />}
        />
      </div>

      <div className="settings-group">
        <SectionHeader title="Input" />
        <SettingsRow 
          title="Autodetect agent prompts in terminal input"
          action={<SettingsToggle checked={agentSettings.input.autodetectAgentPromptsInTerminal} onChange={() => patchAgent({ input: { ...agentSettings.input, autodetectAgentPromptsInTerminal: !agentSettings.input.autodetectAgentPromptsInTerminal } })} />}
        />
        <SettingsRow 
          title="Autodetect terminal commands in agent input"
          description={<span>Encountered an incorrect detection? <button className="settings-link-inline">Let us know</button></span>}
          action={<SettingsToggle checked={agentSettings.input.autodetectTerminalCommandsInAgent} onChange={() => patchAgent({ input: { ...agentSettings.input, autodetectTerminalCommandsInAgent: !agentSettings.input.autodetectTerminalCommandsInAgent } })} />}
        />
        
        <div className="settings-row-vertical">
          <div className="settings-row-info">
            <div className="settings-row-title">Natural language denylist</div>
            <div className="settings-row-description">Commands listed here will never trigger natural language detection.</div>
          </div>
          <div className="settings-input-wrapper">
            <input 
              type="text" 
              className="settings-text-input" 
              placeholder="Commands, comma separated" 
              value={agentSettings.input.naturalLanguageDenylist}
              onChange={(event) => patchAgent({ input: { ...agentSettings.input, naturalLanguageDenylist: event.target.value } })}
            />
          </div>
        </div>

        <SettingsRow 
          title="Show input hint text"
          action={<SettingsToggle checked={agentSettings.input.showInputHintText} onChange={() => patchAgent({ input: { ...agentSettings.input, showInputHintText: !agentSettings.input.showInputHintText } })} />}
        />
        <SettingsRow 
          title="Show agent tips"
          action={<SettingsToggle checked={agentSettings.input.showAgentTips} onChange={() => patchAgent({ input: { ...agentSettings.input, showAgentTips: !agentSettings.input.showAgentTips } })} />}
        />
        <SettingsRow 
          title="Include agent-executed commands in history"
          action={<SettingsToggle checked={agentSettings.input.includeAgentExecutedCommandsInHistory} onChange={() => patchAgent({ input: { ...agentSettings.input, includeAgentExecutedCommandsInHistory: !agentSettings.input.includeAgentExecutedCommandsInHistory } })} />}
        />
      </div>

      <div className="settings-group">
        <SectionHeader title="Permissions" />
        <SettingsRow
          title="Web search"
          description="Let the agent fetch fresh public information and show it as a dedicated card in chat."
          action={
            <SettingsToggle
              checked={webSearchEnabled}
              onChange={() => patchAgent({ permissions: { ...agentSettings.permissions, webSearch: !webSearchEnabled } })}
            />
          }
        />
      </div>

      <div className="settings-group">
        <SectionHeader title="Connected Models" />
        <div className="settings-group-description">
          Add and manage model configurations from different providers. Your API keys are stored locally.
        </div>

        <div className="settings-models-list">
          {configuredModels.length > 0 ? (
            configuredModels.map((model) => {
              const isActive = settings?.values.selectedModelId === model.id;
              return (
                <div 
                  key={model.id} 
                  className={`settings-model-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedModelIdForEdit(model.id);
                    setIsModelDrawerOpen(true);
                  }}
                >
                  <div className="settings-model-card-info">
                    <div className="settings-model-card-name">{model.friendlyName ?? model.modelId}</div>
                    <div className="settings-model-card-provider">{model.providerLabel}</div>
                  </div>
                  <div className={`settings-model-card-status ${isActive ? 'active' : ''}`}>
                    {isActive ? 'Active' : 'Configured'}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="settings-model-card">
              <div className="settings-model-card-info">
                <div className="settings-model-card-name">No models configured yet</div>
                <div className="settings-model-card-provider">Open the drawer to connect one locally.</div>
              </div>
              <div className="settings-model-card-status">Setup</div>
            </div>
          )}

          <button 
            className="settings-add-model-btn" 
            onClick={() => {
              setSelectedModelIdForEdit('new');
              setIsModelDrawerOpen(true);
            }}
          >
            <div className="add-icon-wrapper">
              <Plus size={16} />
            </div>
            <span>Add new model</span>
          </button>
        </div>

        <div className="settings-promo">
          <button className="settings-link">Upgrade to the Build plan</button> to use your own API keys.
        </div>
      </div>

      <div className="settings-group">
        <SectionHeader title="Other" />
        <SettingsRow 
          title="Show Oz changelog in new conversation view"
          action={<SettingsToggle checked={agentSettings.other.showOzChangelog} onChange={() => patchAgent({ other: { ...agentSettings.other, showOzChangelog: !agentSettings.other.showOzChangelog } })} />}
        />
        <SettingsRow 
          title={'Show "Use Agent" footer'}
          description={'Shows hint to use the "Full Terminal Use"-enabled agent in long running commands.'}
          action={<SettingsToggle checked={agentSettings.other.showUseAgentFooter} onChange={() => patchAgent({ other: { ...agentSettings.other, showUseAgentFooter: !agentSettings.other.showUseAgentFooter } })} />}
        />
        <SettingsRow 
          title="Show conversation history in tools panel"
          action={<SettingsToggle checked={agentSettings.other.showConversationHistoryInToolsPanel} onChange={() => patchAgent({ other: { ...agentSettings.other, showConversationHistoryInToolsPanel: !agentSettings.other.showConversationHistoryInToolsPanel } })} />}
        />

        <SettingsRow 
          title="Agent thinking display"
          description="Controls how reasoning/thinking traces are displayed."
          action={
            <SettingsSelect
              value={thinkingDisplayMode}
              options={[
                { value: 'show-and-collapse', label: thinkingDisplayModeLabel['show-and-collapse'] },
                { value: 'always-show', label: thinkingDisplayModeLabel['always-show'] },
                { value: 'never-show', label: thinkingDisplayModeLabel['never-show'] }
              ]}
              onChange={(value) => patchAgent({ other: { ...agentSettings.other, thinkingDisplayMode: value as ThinkingDisplayMode } })}
            />
          }
        />

        <SettingsRow 
          title="Preferred layout when opening existing agent conversations"
          action={
            <SettingsSelect
              value={agentSettings.other.preferredConversationLayout}
              options={[
                { value: 'new-tab', label: preferredLayoutLabel['new-tab'] },
                { value: 'current-pane', label: preferredLayoutLabel['current-pane'] },
                { value: 'split-pane', label: preferredLayoutLabel['split-pane'] }
              ]}
              onChange={(value) => patchAgent({ other: { ...agentSettings.other, preferredConversationLayout: value as AgentSettings['other']['preferredConversationLayout'] } })}
            />
          }
        />
      </div>

      <div className="settings-group">
        <SectionHeader title="Experimental" />
        <SettingsRow 
          title="Computer Use" 
          description="Allow the agent to take control of your mouse and keyboard to perform tasks."
          action={<SettingsToggle checked={agentSettings.permissions.computerUse} onChange={() => patchAgent({ permissions: { ...agentSettings.permissions, computerUse: !agentSettings.permissions.computerUse } })} />}
        />
      </div>
    </section>
  );
}
