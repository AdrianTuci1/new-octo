import React, { type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

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

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="settings-section-header">
      <h2 className="settings-section-title">{title}</h2>
    </div>
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

export function AgentSection() {
  return (
    <section className="settings-panel">
      <div className="settings-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Octo Agent</h1>
        <SettingsToggle checked={true} />
      </div>

      <div className="settings-group">
        <SectionHeader title="Active AI" />
        <SettingsRow 
          title="Next Command" 
          description="Let AI suggest the next command to run based on your command history, outputs, and common workflows."
          action={<SettingsToggle checked={true} />}
        />
        <SettingsRow 
          title="Prompt Suggestions" 
          description="Let AI suggest natural language prompts, as inline banners in the input, based on recent commands and their outputs."
          action={<SettingsToggle checked={true} />}
        />
        <SettingsRow 
          title="Suggested Code Banners" 
          description="Let AI suggest code diffs and queries as inline banners in the blocklist, based on recent commands and their outputs."
          action={<SettingsToggle checked={true} />}
        />
        <SettingsRow 
          title="Shared Block Title Generation" 
          description="Let AI generate a title for your shared block based on the command and output."
          action={<SettingsToggle checked={true} />}
        />
      </div>

      <div className="settings-group">
        <SectionHeader title="Input" />
        <SettingsRow 
          title="Autodetect agent prompts in terminal input"
          action={<SettingsToggle checked={false} />}
        />
        <SettingsRow 
          title="Autodetect terminal commands in agent input"
          description={<span>Encountered an incorrect detection? <button className="settings-link-inline">Let us know</button></span>}
          action={<SettingsToggle checked={true} />}
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
            />
          </div>
        </div>

        <SettingsRow 
          title="Show input hint text"
          action={<SettingsToggle checked={true} />}
        />
        <SettingsRow 
          title="Show agent tips"
          action={<SettingsToggle checked={true} />}
        />
        <SettingsRow 
          title="Include agent-executed commands in history"
          action={<SettingsToggle checked={false} />}
        />
      </div>

      <div className="settings-group">
        <SectionHeader title="API Keys" />
        <div className="settings-group-description">
          Use your own API keys from model providers for the Octo Agent to use. API keys are stored locally and never synced to the cloud. Using auto models or models from providers you have not provided API keys for will consume Octo credits.
        </div>

        <div className="settings-field">
          <label className="settings-field-label">OpenAI API Key</label>
          <div className="settings-input-wrapper">
            <input type="text" className="settings-text-input" placeholder="sk- ..." />
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-field-label">Anthropic API Key</label>
          <div className="settings-input-wrapper">
            <input type="text" className="settings-text-input" placeholder="sk-ant- ..." />
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-field-label">Google API Key</label>
          <div className="settings-input-wrapper">
            <input type="text" className="settings-text-input" placeholder="AIzaSy ..." />
          </div>
        </div>

        <div className="settings-promo">
          <button className="settings-link">Upgrade to the Build plan</button> to use your own API keys.
        </div>
      </div>

      <div className="settings-group">
        <SectionHeader title="Other" />
        <SettingsRow 
          title="Show Oz changelog in new conversation view"
          action={<SettingsToggle checked={true} />}
        />
        <SettingsRow 
          title={'Show "Use Agent" footer'}
          description={'Shows hint to use the "Full Terminal Use"-enabled agent in long running commands.'}
          action={<SettingsToggle checked={true} />}
        />
        <SettingsRow 
          title="Show conversation history in tools panel"
          action={<SettingsToggle checked={true} />}
        />

        <SettingsRow 
          title="Agent thinking display"
          description="Controls how reasoning/thinking traces are displayed."
          action={
            <button className="settings-select">
              <span>Show & collapse</span>
              <ChevronDown size={14} />
            </button>
          }
        />

        <SettingsRow 
          title="Preferred layout when opening existing agent conversations"
          action={
            <button className="settings-select">
              <span>New Tab</span>
              <ChevronDown size={14} />
            </button>
          }
        />
      </div>

      <div className="settings-group">
        <SectionHeader title="Experimental" />
        <SettingsRow 
          title="Computer Use" 
          description="Allow the agent to take control of your mouse and keyboard to perform tasks."
          action={<SettingsToggle checked={false} />}
        />
      </div>
    </section>
  );
}

