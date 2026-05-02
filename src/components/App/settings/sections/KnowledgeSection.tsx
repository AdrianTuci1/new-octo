import React, { type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

function SettingsToggle({ checked = false }: { checked?: boolean }) {
  return (
    <button
      className={`settings-toggle ${checked ? 'active' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
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

function ActionCard({ label }: { label: string }) {
  return (
    <button className="settings-action-card" type="button">
      <span>{label}</span>
      <ChevronRight size={16} />
    </button>
  );
}

export function KnowledgeSection() {
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
          action={<SettingsToggle checked={true} />}
        />
        <SettingsRow 
          title="Suggested Rules" 
          description="Let AI suggest rules to save based on your interactions."
          action={<SettingsToggle checked={true} />}
        />

        <div style={{ marginTop: '12px', marginBottom: '24px' }}>
          <ActionCard label="Manage rules" />
        </div>

        <SettingsRow 
          title="Octo Drive as agent context" 
          description="The Octo Agent can leverage your Octo Drive Contents to tailor responses to your personal and team developer workflows and environments. This includes any Workflows, Notebooks, and Environment Variables."
          action={<SettingsToggle checked={true} />}
        />
      </div>
    </section>
  );
}
