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
  return (
    <section className="settings-panel">
      <div className="settings-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Profiles</h1>
        <button className="settings-primary-button" type="button">
          <Plus size={14} style={{ marginRight: '6px' }} />
          Add Profile
        </button>
      </div>
      
      <p className="settings-group-description">
        Profiles let you define how your Agent operates — from the actions it can take and when it 
        needs approval, to the models it uses for tasks like coding and planning. You can also scope 
        them to individual projects.
      </p>

      <div className="profile-card">
        <div className="profile-card-header">
          <h2 className="profile-card-title">Default</h2>
          <button className="profile-card-edit" type="button">
            <Pencil size={14} />
            Edit
          </button>
        </div>

        <div className="profile-card-section">
          <h3 className="profile-card-section-title">MODELS</h3>
          <ProfileItem icon={Bolt} label="Base model" value="minimax 2.7" />
          <ProfileItem icon={Terminal} label="Full terminal use" value="Auto" />
        </div>

        <div className="profile-card-section">
          <h3 className="profile-card-section-title">PERMISSIONS</h3>
          <ProfileItem icon={Code} label="Apply code diffs" value="Agent decides" />
          <ProfileItem icon={FileText} label="Read files" value="Agent decides" />
          <ProfileItem icon={Check} label="Directory allowlist" value="None" isIndented={true} />
          <ProfileItem icon={Terminal} label="Execute commands" value="Always ask" />
          <ProfileItem icon={Check} label="Command allowlist" value="None" isIndented={true} />
          <ProfileItem icon={DollarSign} label="Interact with running commands" value="Always ask" />
          <ProfileItem icon={MessageSquare} label="Ask questions" value="Ask unless auto-approve" />
          <ProfileItem icon={Network} label="Call MCP servers" value="Agent decides" />
          <ProfileItem icon={Check} label="MCP allowlist" value="None" isIndented={true} />
          <ProfileItem icon={Ban} label="MCP denylist" value="None" isIndented={true} />
          <ProfileItem icon={Globe} label="Call web tools" value="On" />
          <ProfileItem icon={Compass} label="Auto-sync plans to Octo Drive" value="On" />
        </div>
      </div>
    </section>
  );
}
