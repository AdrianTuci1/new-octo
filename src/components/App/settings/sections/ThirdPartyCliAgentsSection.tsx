import React, { useState } from 'react';
import { 
  User, 
  Monitor, 
  GitPullRequest, 
  Calendar, 
  Clock, 
  Terminal, 
  Package, 
  Network, 
  GitBranch, 
  FileText, 
  Folder, 
  Sliders, 
  Mic, 
  Plus, 
  Files, 
  CornerDownLeft, 
  Info, 
  X 
} from 'lucide-react';
import './ThirdPartyCliAgentsSection.css';

interface ChipItem {
  id: string;
  label: string;
  icon: any;
}

const DEFAULT_AVAILABLE_CHIPS: ChipItem[] = [
  { id: 'alice', label: 'alice', icon: User },
  { id: 'ubuntu', label: 'ubuntu-04', icon: Monitor },
  { id: 'alice_ip', label: 'alice@127.0.0.1', icon: User },
  { id: 'pr', label: 'PR #123', icon: GitPullRequest },
  { id: 'date', label: 'July 12, 2023', icon: Calendar },
  { id: 'time_pm', label: '03:48 pm', icon: Clock },
  { id: 'time_24', label: '15:48', icon: Clock },
  { id: 'pyenv', label: 'pyenv', icon: Terminal },
  { id: 'conda', label: 'condaenv', icon: Terminal },
  { id: 'node_v', label: 'v18.17.0', icon: Package },
  { id: 'kube', label: 'kube-context', icon: Network },
  { id: 'svn', label: 'svn-feature-branch', icon: GitBranch },
  { id: 'files_count', label: '3', icon: FileText }
];

const DEFAULT_LEFT_CHIPS: ChipItem[] = [
  { id: 'attach', label: 'Attach File', icon: Plus },
  { id: 'voice', label: 'Voice Input', icon: Mic },
  { id: 'diff', label: '3 • +10 -2', icon: GitPullRequest },
  { id: 'explorer', label: 'File Explorer', icon: Files },
  { id: 'rich_in', label: 'Rich Input', icon: CornerDownLeft }
];

const DEFAULT_RIGHT_CHIPS: ChipItem[] = [
  { id: 'desktop', label: '~/Desktop', icon: Folder },
  { id: 'git_branch', label: 'git-feature-branch', icon: GitBranch },
  { id: 'settings', label: 'Settings', icon: Sliders }
];

export function ThirdPartyCliAgentsSection() {
  // Toggle States
  const [showToolbar, setShowToolbar] = useState(true);
  const [autoShowHide, setAutoShowHide] = useState(true);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoDismiss, setAutoDismiss] = useState(false);

  // Command input regex
  const [regexCommand, setRegexCommand] = useState('');

  // Layout Chips State
  const [availableChips, setAvailableChips] = useState<ChipItem[]>(DEFAULT_AVAILABLE_CHIPS);
  const [leftChips, setLeftChips] = useState<ChipItem[]>(DEFAULT_LEFT_CHIPS);
  const [rightChips, setRightChips] = useState<ChipItem[]>(DEFAULT_RIGHT_CHIPS);

  // Interaction handlers
  const handleRemoveLeftChip = (id: string) => {
    const target = leftChips.find(c => c.id === id);
    if (target) {
      setLeftChips(leftChips.filter(c => c.id !== id));
      if (!availableChips.some(c => c.id === id)) {
        setAvailableChips([...availableChips, target]);
      }
    }
  };

  const handleRemoveRightChip = (id: string) => {
    const target = rightChips.find(c => c.id === id);
    if (target) {
      setRightChips(rightChips.filter(c => c.id !== id));
      if (!availableChips.some(c => c.id === id)) {
        setAvailableChips([...availableChips, target]);
      }
    }
  };

  const handleAddAvailableChip = (chip: ChipItem) => {
    // Add to Left side by default if space is available, otherwise Right side
    if (leftChips.length <= rightChips.length) {
      setLeftChips([...leftChips, chip]);
    } else {
      setRightChips([...rightChips, chip]);
    }
    setAvailableChips(availableChips.filter(c => c.id !== chip.id));
  };

  const handleRestoreDefaults = () => {
    setAvailableChips(DEFAULT_AVAILABLE_CHIPS);
    setLeftChips(DEFAULT_LEFT_CHIPS);
    setRightChips(DEFAULT_RIGHT_CHIPS);
  };

  return (
    <section className="settings-panel third-party-cli-panel">
      <div className="settings-panel-header">
        <h1>Third party CLI agents</h1>
      </div>

      <div className="settings-group">
        {/* ROW 1 */}
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Show coding agent toolbar</div>
            <div className="settings-row-description">
              Show a toolbar with quick actions when running coding agents like <code>claude</code>, <code>codex</code>, or <code>gemini</code>.
            </div>
          </div>
          <div className="settings-row-action">
            <button
              className={`settings-toggle ${showToolbar ? 'active' : ''}`}
              type="button"
              onClick={() => setShowToolbar(!showToolbar)}
              role="switch"
              aria-checked={showToolbar}
            >
              <span />
            </button>
          </div>
        </div>

        {/* ROW 2 */}
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Auto show/hide Rich Input based on agent status
              <span title="Information about rich input state" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <Info size={14} className="info-icon-hint" />
              </span>
            </div>
          </div>
          <div className="settings-row-action">
            <button
              className={`settings-toggle ${autoShowHide ? 'active' : ''}`}
              type="button"
              onClick={() => setAutoShowHide(!autoShowHide)}
              role="switch"
              aria-checked={autoShowHide}
            >
              <span />
            </button>
          </div>
        </div>

        {/* ROW 3 */}
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Auto open Rich Input when a coding agent session starts</div>
          </div>
          <div className="settings-row-action">
            <button
              className={`settings-toggle ${autoOpen ? 'active' : ''}`}
              type="button"
              onClick={() => setAutoOpen(!autoOpen)}
              role="switch"
              aria-checked={autoOpen}
            >
              <span />
            </button>
          </div>
        </div>

        {/* ROW 4 */}
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Auto dismiss Rich Input after prompt submission</div>
          </div>
          <div className="settings-row-action">
            <button
              className={`settings-toggle ${autoDismiss ? 'active' : ''}`}
              type="button"
              onClick={() => setAutoDismiss(!autoDismiss)}
              role="switch"
              aria-checked={autoDismiss}
            >
              <span />
            </button>
          </div>
        </div>
      </div>

      {/* REGEX COMMAND FIELDS */}
      <div className="cli-agents-section-group mt-24">
        <label className="cli-field-label">Commands that enable the toolbar</label>
        <div className="cli-input-wrapper">
          <input
            type="text"
            className="cli-text-input"
            placeholder="command (supports regex)"
            value={regexCommand}
            onChange={(e) => setRegexCommand(e.target.value)}
          />
          <button className="cli-input-arrow-btn" type="button" aria-label="Submit command">
            <CornerDownLeft size={14} />
          </button>
        </div>
        <p className="cli-field-description mt-6">
          Add regex patterns to show the coding agent toolbar for matching commands.
        </p>
      </div>

      {/* TOOLBAR LAYOUT CONFIGURATOR */}
      <div className="cli-agents-section-group mt-24">
        <h3 className="cli-group-subtitle">Toolbar layout</h3>

        <div className="toolbar-layout-container">
          {/* AVAILABLE CHIPS SECTION */}
          <div className="available-chips-header">
            <span className="available-chips-title">Available chips</span>
            <button 
              className="restore-default-btn" 
              type="button"
              onClick={handleRestoreDefaults}
            >
              Restore default
            </button>
          </div>

          <div className="available-chips-list">
            {availableChips.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.id}
                  className="layout-chip available"
                  type="button"
                  onClick={() => handleAddAvailableChip(chip)}
                  title="Click to add to toolbar"
                >
                  <Icon size={12} className="chip-icon" />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          {/* DRAG DROP ZONE LAYOUT */}
          <div className="sides-dropzones-row mt-20">
            {/* LEFT SIDE */}
            <div className="dropzone-column">
              <span className="dropzone-label">Left side</span>
              <div className="dropzone-box">
                {leftChips.map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <div key={chip.id} className="layout-chip active-chip">
                      <Icon size={12} className="chip-icon" />
                      <span>{chip.label}</span>
                      <button
                        className="chip-remove-btn"
                        type="button"
                        onClick={() => handleRemoveLeftChip(chip.id)}
                        aria-label={`Remove ${chip.label}`}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT SIDE */}
            <div className="dropzone-column">
              <span className="dropzone-label">Right side</span>
              <div className="dropzone-box">
                {rightChips.map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <div key={chip.id} className="layout-chip active-chip">
                      <Icon size={12} className="chip-icon" />
                      <span>{chip.label}</span>
                      <button
                        className="chip-remove-btn"
                        type="button"
                        onClick={() => handleRemoveRightChip(chip.id)}
                        aria-label={`Remove ${chip.label}`}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
