import { ChevronRight } from 'lucide-react';
import { useMemoryStore, useUIStore } from '../../../../stores';
import { buildAgentSettingsValues, normalizeAgentSettings } from '../agentSettings';
import { SettingsRow, SettingsToggle } from './SettingsPrimitives';

function ActionCard({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button className="settings-action-card" type="button" onClick={onClick}>
      <span>{label}</span>
      <ChevronRight size={16} />
    </button>
  );
}

export function KnowledgeSection() {
  const setIsRulesDrawerOpen = useUIStore((state) => state.setIsRulesDrawerOpen);
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const agentSettings = normalizeAgentSettings(settings?.values);
  const saveKnowledge = (knowledge: typeof agentSettings.knowledge) => {
    void saveSettings(buildAgentSettingsValues({ ...agentSettings, knowledge }), true);
  };

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h1>Knowledge</h1>
      </div>

      <div className="settings-group">
        <SettingsRow 
          title="Rules" 
          description={
            <span>
              Rules help the Octo Agent follow your conventions, whether for codebases or specific workflows. <button className="settings-link-inline">Learn more</button>
            </span>
          }
          action={<SettingsToggle checked={agentSettings.knowledge.rulesEnabled} onChange={() => saveKnowledge({ ...agentSettings.knowledge, rulesEnabled: !agentSettings.knowledge.rulesEnabled })} />}
        />
        <SettingsRow 
          title="Suggested Rules" 
          description="Let AI suggest rules to save based on your interactions."
          action={<SettingsToggle checked={agentSettings.knowledge.suggestedRulesEnabled} onChange={() => saveKnowledge({ ...agentSettings.knowledge, suggestedRulesEnabled: !agentSettings.knowledge.suggestedRulesEnabled })} />}
        />

        <div style={{ marginTop: '12px', marginBottom: '24px' }}>
          <ActionCard label="Manage rules" onClick={() => setIsRulesDrawerOpen(true)} />
        </div>

        <SettingsRow 
          title="Octo Drive as agent context" 
          description="The Octo Agent can leverage your Octo Drive Contents to tailor responses to your personal and team developer workflows and environments. This includes any Workflows, Notebooks, and Environment Variables."
          action={<SettingsToggle checked={agentSettings.knowledge.octoDriveContextEnabled} onChange={() => saveKnowledge({ ...agentSettings.knowledge, octoDriveContextEnabled: !agentSettings.knowledge.octoDriveContextEnabled })} />}
        />
      </div>
    </section>
  );
}
