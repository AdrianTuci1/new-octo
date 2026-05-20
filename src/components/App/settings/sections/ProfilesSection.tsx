import React, { type ReactNode } from 'react';
import { 
  Ban, 
  Bolt, 
  Check, 
  Code, 
  Compass, 
  DollarSign, 
  FileText, 
  Globe, 
  MessageSquare, 
  Network, 
  Pencil, 
  Plus, 
  Terminal 
} from 'lucide-react';
import { useMemoryStore, useUIStore } from '../../../../stores';
import { buildAgentSettingsValues, createNewAgentProfile, normalizeAgentSettings, type AgentSettings, type AgentProfileSettings } from '../agentSettings';

function ProfileItem({ 
  icon: Icon, 
  label, 
  value, 
  isIndented = false 
}: { 
  icon?: any; 
  label: string; 
  value: string; 
  isIndented?: boolean 
}) {
  return (
    <div className={`profile-item ${isIndented ? 'indented' : ''}`}>
      <div className="profile-item-key">
        {Icon && <Icon size={14} className="profile-item-icon" />}
        <span>{label}:</span>
      </div>
      <div className="profile-item-value">{value}</div>
    </div>
  );
}

export function ProfilesSection() {
  const setIsProfileDrawerOpen = useUIStore((state) => state.setIsProfileDrawerOpen);
  const setActiveProfileName = useUIStore((state) => state.setActiveProfileName);
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const agentSettings = normalizeAgentSettings(settings?.values);

  const handleAddProfile = () => {
    const nextProfile = createNewAgentProfile(uniqueProfileName(agentSettings.profiles, 'New Profile'));
    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      profiles: [...agentSettings.profiles, nextProfile]
    }), true);
    setActiveProfileName(nextProfile.name);
    setIsProfileDrawerOpen(true);
  };

  const handleEditProfile = (name: string) => {
    setActiveProfileName(name);
    setIsProfileDrawerOpen(true);
  };

  const handleUseProfile = (profileId: string) => {
    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      activeProfileId: profileId
    }), true);
  };

  return (
    <section className="settings-panel">
      <div className="settings-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Profiles</h1>
        <button 
          className="settings-primary-button" 
          type="button"
          onClick={handleAddProfile}
        >
          <Plus size={14} style={{ marginRight: '6px' }} />
          Add Profile
        </button>
      </div>
      
      <p className="settings-group-description">
        Profiles let you define how your Agent operates — from the actions it can take and when it 
        needs approval, to the models it uses for tasks like coding and planning. You can also scope 
        them to individual projects.
      </p>

      {agentSettings.profiles.map((profile) => (
        <div key={profile.id} className="profile-card">
          <div className="profile-card-header">
            <h2 className="profile-card-title">{profile.name}</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="profile-card-edit"
                type="button"
                onClick={() => handleUseProfile(profile.id)}
                disabled={agentSettings.activeProfileId === profile.id}
              >
                <Check size={14} />
                {agentSettings.activeProfileId === profile.id ? 'Active' : 'Use'}
              </button>
              <button
                className="profile-card-edit"
                type="button"
                onClick={() => handleEditProfile(profile.name)}
              >
                <Pencil size={14} />
                Edit
              </button>
            </div>
          </div>

          <div className="profile-card-section">
            <h3 className="profile-card-section-title">MODELS</h3>
            <ProfileItem icon={Bolt} label="Base model" value={profile.baseModel} />
            <ProfileItem icon={Terminal} label="Full terminal use" value={profile.terminalModel} />
          </div>

          <div className="profile-card-section">
            <h3 className="profile-card-section-title">PERMISSIONS</h3>
            <ProfileItem icon={Code} label="Apply code diffs" value={profile.applyDiffs} />
            <ProfileItem icon={FileText} label="Read files" value={profile.readFiles} />
            <ProfileItem icon={Check} label="Directory allowlist" value={listLabel(profile.directoryAllowlist)} isIndented={true} />
            <ProfileItem icon={Terminal} label="Execute commands" value={profile.executeCommands} />
            <ProfileItem icon={Check} label="Command allowlist" value={listLabel(profile.commandAllowlist)} isIndented={true} />
            <ProfileItem icon={DollarSign} label="Interact with running commands" value={profile.interactWithRunningCommands} />
            <ProfileItem icon={MessageSquare} label="Ask questions" value={profile.askQuestions} />
            <ProfileItem icon={Network} label="Call MCP servers" value={profile.callMcpServers} />
            <ProfileItem icon={Check} label="MCP allowlist" value={listLabel(profile.mcpAllowlist)} isIndented={true} />
            <ProfileItem icon={Ban} label="MCP denylist" value={listLabel(profile.mcpDenylist)} isIndented={true} />
            <ProfileItem icon={Globe} label="Call web tools" value={profile.callWebTools && agentSettings.permissions.webSearch ? 'On' : 'Off'} />
            <ProfileItem icon={Compass} label="Auto-sync plans to Octo Drive" value={profile.planAutoSync ? 'On' : 'Off'} />
          </div>
        </div>
      ))}
    </section>
  );
}

function listLabel(values: string[]) {
  return values.length > 0 ? values.join(', ') : 'None';
}

function uniqueProfileName(profiles: AgentProfileSettings[], baseName: string) {
  if (!profiles.some((profile) => profile.name === baseName)) {
    return baseName;
  }

  let index = 2;
  while (profiles.some((profile) => profile.name === `${baseName} ${index}`)) {
    index += 1;
  }
  return `${baseName} ${index}`;
}
