import { useEffect, useMemo, useState } from 'react';
import { 
  X, 
  AlertCircle, 
  Bolt, 
  Terminal, 
  Code, 
  FileText, 
  DollarSign, 
  MessageSquare, 
  Network, 
  Globe, 
  Compass, 
  CornerDownLeft,
  ChevronDown
} from 'lucide-react';
import { useMemoryStore, useUIStore } from '../../../stores';
import { DrawerHeader } from './DrawerHeader';
import {
  buildAgentSettingsValues,
  normalizeAgentSettings,
  type AgentPermissionMode,
  type AgentProfileSettings,
  type AgentQuestionMode
} from '../settings/agentSettings';
import './ProfileEditorDrawer.css';

export function ProfileEditorDrawer() {
  const setIsProfileDrawerOpen = useUIStore((state) => state.setIsProfileDrawerOpen);
  const activeProfileName = useUIStore((state) => state.activeProfileName);

  // Form State
  const [profileName, setProfileName] = useState(activeProfileName);
  const [baseModel, setBaseModel] = useState('minimax 2.7 (us-hosted)');
  const [terminalModel, setTerminalModel] = useState('kimi k2.6 (us-hosted)');
  
  const [applyDiffs, setApplyDiffs] = useState<AgentPermissionMode>('Agent decides');
  const [readFiles, setReadFiles] = useState<AgentPermissionMode>('Agent decides');
  const [dirAllowlist, setDirAllowlist] = useState('');
  const [execCommands, setExecCommands] = useState<AgentPermissionMode>('Always ask');
  const [cmdAllowlist, setCmdAllowlist] = useState('');
  const [interactCommands, setInteractCommands] = useState<AgentPermissionMode>('Always ask');
  const [askQuestions, setAskQuestions] = useState<AgentQuestionMode>('Ask unless auto-approve');
  const [callMcp, setCallMcp] = useState<AgentPermissionMode>('Agent decides');
  const [mcpAllowlist, setMcpAllowlist] = useState('Select MCP servers');
  const [planAutoSync, setPlanAutoSync] = useState(true);
  const [callWebTools, setCallWebTools] = useState(true);
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const agentSettings = useMemo(() => normalizeAgentSettings(settings?.values), [settings?.values]);
  const activeProfile = useMemo(() => (
    agentSettings.profiles.find((profile) => profile.name === activeProfileName)
      ?? agentSettings.profiles[0]
  ), [activeProfileName, agentSettings]);

  useEffect(() => {
    setProfileName(activeProfile.name);
    setBaseModel(activeProfile.baseModel);
    setTerminalModel(activeProfile.terminalModel);
    setApplyDiffs(activeProfile.applyDiffs);
    setReadFiles(activeProfile.readFiles);
    setDirAllowlist(activeProfile.directoryAllowlist.join(', '));
    setExecCommands(activeProfile.executeCommands);
    setCmdAllowlist(activeProfile.commandAllowlist.join(', '));
    setInteractCommands(activeProfile.interactWithRunningCommands);
    setAskQuestions(activeProfile.askQuestions);
    setCallMcp(activeProfile.callMcpServers);
    setMcpAllowlist(activeProfile.mcpAllowlist.length > 0 ? activeProfile.mcpAllowlist.join(', ') : 'Select MCP servers');
    setCallWebTools(activeProfile.callWebTools);
    setPlanAutoSync(activeProfile.planAutoSync);
  }, [activeProfile]);

  const buildProfileFromForm = (): AgentProfileSettings => ({
    ...activeProfile,
    name: activeProfile.id === 'default' ? 'Default' : profileName.trim() || activeProfile.name,
    baseModel,
    terminalModel,
    applyDiffs,
    readFiles,
    directoryAllowlist: splitList(dirAllowlist),
    executeCommands: execCommands,
    commandAllowlist: splitList(cmdAllowlist),
    interactWithRunningCommands: interactCommands,
    askQuestions,
    callMcpServers: callMcp,
    mcpAllowlist: mcpAllowlist === 'Select MCP servers' ? [] : splitList(mcpAllowlist),
    callWebTools,
    planAutoSync
  });

  const handleSaveProfile = () => {
    const nextProfile = buildProfileFromForm();
    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      profiles: agentSettings.profiles.map((profile) => profile.id === activeProfile.id ? nextProfile : profile)
    }), true);
    setIsProfileDrawerOpen(false);
  };

  const handleDeleteProfile = () => {
    if (activeProfile.id === 'default') return;

    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      profiles: agentSettings.profiles.filter((profile) => profile.id !== activeProfile.id)
    }), true);
    setIsProfileDrawerOpen(false);
  };

  return (
    <div className="profile-editor-drawer">
      <DrawerHeader
        title="Profile Editor"
        action={(
          <div className="drawer-header-action-group">
            <button
              className="drawer-header-save-button"
              onClick={handleSaveProfile}
              type="button"
            >
              Save
            </button>
            <button
              className="drawer-header-action-button"
              onClick={() => setIsProfileDrawerOpen(false)}
              type="button"
              aria-label="Close profile editor"
            >
              <X size={18} />
            </button>
          </div>
        )}
      />

      <div className="profile-editor-content">
        <h2 className="profile-editor-title">Edit Profile</h2>

        {/* PROFILE NAME SECTION */}
        <div className="profile-editor-form-group">
          <label className="profile-editor-field-label">Name</label>
          <input
            type="text"
            className="profile-editor-text-input"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            disabled={profileName.toLowerCase() === 'default'}
          />
          {profileName.toLowerCase() === 'default' && (
            <div className="profile-editor-warning-info">
              <AlertCircle size={14} className="warning-icon" />
              <span>Default profile name cannot be changed.</span>
            </div>
          )}
        </div>

        <hr className="profile-editor-divider" />

        {/* MODELS SECTION */}
        <div className="profile-editor-section">
          <h3 className="profile-editor-section-title">MODELS</h3>
          
          <div className="profile-editor-form-group">
            <label className="profile-editor-field-label bold">Base model</label>
            <p className="profile-editor-field-description">
              This model serves as the primary engine behind the agent. It powers most interactions and invokes other models for tasks like planning or code generation when necessary. Warp may automatically switch to alternate models based on model availability or for auxiliary tasks such as conversation summarization.
            </p>
            <div className="profile-editor-select-wrapper">
              <select 
                value={baseModel} 
                onChange={(e) => setBaseModel(e.target.value)}
                className="profile-editor-select"
              >
                <option value="minimax 2.7 (us-hosted)">minimax 2.7 (us-hosted)</option>
                <option value="minimax 2.7">minimax 2.7</option>
                <option value="gpt-4o-mini">gpt-4o-mini (us-hosted)</option>
                <option value="claude-3-5-sonnet">claude-3-5-sonnet (us-hosted)</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro (us-hosted)</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
          </div>

          <div className="profile-editor-form-group mt-16">
            <label className="profile-editor-field-label bold">Full terminal use model</label>
            <p className="profile-editor-field-description">
              The model used when the agent operates inside interactive terminal applications like database shells, debuggers, REPLs, or dev servers—reading live output and writing commands to the PTY.
            </p>
            <div className="profile-editor-select-wrapper">
              <select 
                value={terminalModel} 
                onChange={(e) => setTerminalModel(e.target.value)}
                className="profile-editor-select"
              >
                <option value="kimi k2.6 (us-hosted)">kimi k2.6 (us-hosted)</option>
                <option value="Auto">Auto</option>
                <option value="gpt-4o">gpt-4o (us-hosted)</option>
                <option value="claude-3-5-sonnet">claude-3-5-sonnet (us-hosted)</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
          </div>
        </div>

        <hr className="profile-editor-divider" />

        {/* PERMISSIONS SECTION */}
        <div className="profile-editor-section">
          <h3 className="profile-editor-section-title">PERMISSIONS</h3>

          {/* Apply code diffs */}
          <div className="profile-editor-form-group-with-icon">
            <div className="field-header">
              <Code size={16} className="field-icon" />
              <label className="profile-editor-field-label">Apply code diffs</label>
            </div>
            <div className="profile-editor-select-wrapper">
              <select 
                value={applyDiffs} 
                onChange={(e) => setApplyDiffs(e.target.value as AgentPermissionMode)}
                className="profile-editor-select"
              >
                <option value="Agent decides">Agent decides</option>
                <option value="Always ask">Always ask</option>
                <option value="Never allow">Never allow</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
            <div className="profile-editor-warning-info">
              <AlertCircle size={14} className="warning-icon" />
              <span>The Agent chooses the safest path: acting on its own when confident, and asking for approval when uncertain.</span>
            </div>
          </div>

          {/* Read files */}
          <div className="profile-editor-form-group-with-icon mt-20">
            <div className="field-header">
              <FileText size={16} className="field-icon" />
              <label className="profile-editor-field-label">Read files</label>
            </div>
            <div className="profile-editor-select-wrapper">
              <select 
                value={readFiles} 
                onChange={(e) => setReadFiles(e.target.value as AgentPermissionMode)}
                className="profile-editor-select"
              >
                <option value="Agent decides">Agent decides</option>
                <option value="Always ask">Always ask</option>
                <option value="Never allow">Never allow</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
            <div className="profile-editor-warning-info">
              <AlertCircle size={14} className="warning-icon" />
              <span>The Agent chooses the safest path: acting on its own when confident, and asking for approval when uncertain.</span>
            </div>
          </div>

          {/* Directory allowlist */}
          <div className="profile-editor-form-group mt-20">
            <label className="profile-editor-field-label">Directory allowlist</label>
            <p className="profile-editor-field-description">Give the agent file access to certain directories.</p>
            <div className="profile-editor-input-with-action">
              <input
                type="text"
                placeholder="e.g. ~/code-repos/repo"
                className="profile-editor-text-input"
                value={dirAllowlist}
                onChange={(e) => setDirAllowlist(e.target.value)}
              />
              <button className="profile-editor-input-action-btn" type="button">
                <CornerDownLeft size={14} />
              </button>
            </div>
          </div>

          {/* Execute commands */}
          <div className="profile-editor-form-group-with-icon mt-20">
            <div className="field-header">
              <Terminal size={16} className="field-icon" />
              <label className="profile-editor-field-label">Execute commands</label>
            </div>
            <div className="profile-editor-select-wrapper">
              <select 
                value={execCommands} 
                onChange={(e) => setExecCommands(e.target.value as AgentPermissionMode)}
                className="profile-editor-select"
              >
                <option value="Always ask">Always ask</option>
                <option value="Agent decides">Agent decides</option>
                <option value="Never allow">Never allow</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
            <div className="profile-editor-warning-info">
              <AlertCircle size={14} className="warning-icon" />
              <span>Require explicit approval before the Agent takes any action.</span>
            </div>
          </div>

          {/* Command allowlist */}
          <div className="profile-editor-form-group mt-20">
            <label className="profile-editor-field-label">Command allowlist</label>
            <p className="profile-editor-field-description">Regular expressions to match commands that can be automatically executed by Oz.</p>
            <div className="profile-editor-input-with-action">
              <input
                type="text"
                placeholder="e.g. ls .*"
                className="profile-editor-text-input"
                value={cmdAllowlist}
                onChange={(e) => setCmdAllowlist(e.target.value)}
              />
              <button className="profile-editor-input-action-btn" type="button">
                <CornerDownLeft size={14} />
              </button>
            </div>
          </div>

          {/* Interact with running commands */}
          <div className="profile-editor-form-group-with-icon mt-20">
            <div className="field-header">
              <DollarSign size={16} className="field-icon" />
              <label className="profile-editor-field-label">Interact with running commands</label>
            </div>
            <div className="profile-editor-select-wrapper">
              <select 
                value={interactCommands} 
                onChange={(e) => setInteractCommands(e.target.value as AgentPermissionMode)}
                className="profile-editor-select"
              >
                <option value="Always ask">Always ask</option>
                <option value="Agent decides">Agent decides</option>
                <option value="Never allow">Never allow</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
            <div className="profile-editor-warning-info">
              <AlertCircle size={14} className="warning-icon" />
              <span>The agent will always ask for permission to interact with a running command.</span>
            </div>
          </div>

          {/* Ask questions */}
          <div className="profile-editor-form-group-with-icon mt-20">
            <div className="field-header">
              <MessageSquare size={16} className="field-icon" />
              <label className="profile-editor-field-label">Ask questions</label>
            </div>
            <div className="profile-editor-select-wrapper">
              <select 
                value={askQuestions} 
                onChange={(e) => setAskQuestions(e.target.value as AgentQuestionMode)}
                className="profile-editor-select"
              >
                <option value="Ask unless auto-approve">Ask unless auto-approve</option>
                <option value="Always ask">Always ask</option>
                <option value="Never ask">Never ask</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
            <div className="profile-editor-warning-info">
              <AlertCircle size={14} className="warning-icon" />
              <span>The Agent may ask a question and pause for your response, but will continue automatically when auto-approve is on.</span>
            </div>
          </div>

          {/* Call MCP servers */}
          <div className="profile-editor-form-group-with-icon mt-20">
            <div className="field-header">
              <Network size={16} className="field-icon" />
              <label className="profile-editor-field-label">Call MCP servers</label>
            </div>
            <div className="profile-editor-select-wrapper">
              <select 
                value={callMcp} 
                onChange={(e) => setCallMcp(e.target.value as AgentPermissionMode)}
                className="profile-editor-select"
              >
                <option value="Agent decides">Agent decides</option>
                <option value="Always ask">Always ask</option>
                <option value="Never allow">Never allow</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
            <div className="profile-editor-warning-info">
              <AlertCircle size={14} className="warning-icon" />
              <span>The Agent chooses the safest path: acting on its own when confident, and asking for approval when uncertain.</span>
            </div>
          </div>

          {/* MCP allowlist */}
          <div className="profile-editor-form-group mt-20">
            <label className="profile-editor-field-label">MCP allowlist</label>
            <p className="profile-editor-field-description">MCP servers that are allowed to be called by Oz.</p>
            <div className="profile-editor-select-wrapper">
              <select 
                value={mcpAllowlist} 
                onChange={(e) => setMcpAllowlist(e.target.value)}
                className="profile-editor-select"
              >
                <option value="Select MCP servers">Select MCP servers</option>
                <option value="All MCP servers">All MCP servers</option>
                <option value="Custom list...">Custom list...</option>
              </select>
              <ChevronDown size={14} className="select-chevron" />
            </div>
          </div>

          {/* Call web tools */}
          <div className="profile-editor-toggle-row mt-24">
          <div className="toggle-info">
              <div className="toggle-label-with-icon">
                <Globe size={16} className="toggle-icon" />
                <span className="toggle-title">Call web tools</span>
              </div>
              <p className="toggle-description">The agent may use web search when helpful for completing tasks.</p>
            </div>
            <button 
              className={`profile-editor-toggle ${callWebTools ? 'active' : ''}`}
              type="button"
              onClick={() => setCallWebTools((value) => !value)}
            >
              <span />
            </button>
          </div>

          {/* Plan auto-sync */}
          <div className="profile-editor-toggle-row mt-20 mb-32">
            <div className="toggle-info">
              <div className="toggle-label-with-icon">
                <Compass size={16} className="toggle-icon" />
                <span className="toggle-title">Plan auto-sync</span>
              </div>
              <p className="toggle-description">The plans this agent creates will be automatically added and synced to Warp Drive.</p>
            </div>
            <button 
              className={`profile-editor-toggle ${planAutoSync ? 'active' : ''}`}
              type="button"
              onClick={() => setPlanAutoSync(!planAutoSync)}
            >
              <span />
            </button>
          </div>

          {profileName.toLowerCase() !== 'default' && (
            <div className="profile-editor-danger-zone mt-24">
              <button 
                className="btn-delete" 
                type="button" 
                onClick={handleDeleteProfile}
              >
                Delete Profile
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function splitList(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
