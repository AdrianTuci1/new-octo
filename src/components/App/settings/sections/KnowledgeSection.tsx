import React, { type ReactNode, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useUIStore } from '../../../../stores';

function SettingsToggle({ checked = false, onChange }: { checked?: boolean; onChange?: () => void }) {
  return (
    <button
      className={`settings-toggle ${checked ? 'active' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function SettingsRow({ 
  title, 
  description, 
  action 
}: { 
  title: string; 
  description?: string | ReactNode; 
  action: ReactNode 
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <div className="settings-row-title">{title}</div>
        {description && <div className="settings-row-description">{description}</div>}
      </div>
      <div className="settings-row-action">
        {action}
      </div>
    </div>
  );
}

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

  const [rulesEnabled, setRulesEnabled] = useState(true);
  const [suggestedRulesEnabled, setSuggestedRulesEnabled] = useState(true);
  const [contextEnabled, setContextEnabled] = useState(true);

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
          action={<SettingsToggle checked={rulesEnabled} onChange={() => setRulesEnabled(!rulesEnabled)} />}
        />
        <SettingsRow 
          title="Suggested Rules" 
          description="Let AI suggest rules to save based on your interactions."
          action={<SettingsToggle checked={suggestedRulesEnabled} onChange={() => setSuggestedRulesEnabled(!suggestedRulesEnabled)} />}
        />

        <div style={{ marginTop: '12px', marginBottom: '24px' }}>
          <ActionCard label="Manage rules" onClick={() => setIsRulesDrawerOpen(true)} />
        </div>

        <SettingsRow 
          title="Octo Drive as agent context" 
          description="The Octo Agent can leverage your Octo Drive Contents to tailor responses to your personal and team developer workflows and environments. This includes any Workflows, Notebooks, and Environment Variables."
          action={<SettingsToggle checked={contextEnabled} onChange={() => setContextEnabled(!contextEnabled)} />}
        />
      </div>
    </section>
  );
}
