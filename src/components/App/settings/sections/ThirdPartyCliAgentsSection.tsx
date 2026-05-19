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
import { useMemoryStore } from '../../../../stores';
import {
  buildAgentSettingsValues,
  DEFAULT_THIRD_PARTY_LEFT_CHIP_IDS,
  DEFAULT_THIRD_PARTY_RIGHT_CHIP_IDS,
  normalizeAgentSettings
} from '../agentSettings';
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

const ALL_CHIPS = [
  ...DEFAULT_AVAILABLE_CHIPS,
  ...DEFAULT_LEFT_CHIPS,
  ...DEFAULT_RIGHT_CHIPS
];

function chipsFromIds(ids: string[]) {
  return ids
    .map((id) => ALL_CHIPS.find((chip) => chip.id === id))
    .filter((chip): chip is ChipItem => Boolean(chip));
}

export function ThirdPartyCliAgentsSection() {
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const agentSettings = normalizeAgentSettings(settings?.values);
  const thirdPartyCli = agentSettings.thirdPartyCli;
  const [regexCommand, setRegexCommand] = useState('');
  const leftChips = chipsFromIds(thirdPartyCli.leftChipIds);
  const rightChips = chipsFromIds(thirdPartyCli.rightChipIds);
  const usedChipIds = new Set([...thirdPartyCli.leftChipIds, ...thirdPartyCli.rightChipIds]);
  const availableChips = ALL_CHIPS.filter((chip) => !usedChipIds.has(chip.id));

  const saveThirdPartyCli = (nextThirdPartyCli: typeof thirdPartyCli) => {
    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      thirdPartyCli: nextThirdPartyCli
    }), true);
  };

  const handleRemoveLeftChip = (id: string) => {
    saveThirdPartyCli({
      ...thirdPartyCli,
      leftChipIds: thirdPartyCli.leftChipIds.filter((chipId) => chipId !== id)
    });
  };

  const handleRemoveRightChip = (id: string) => {
    saveThirdPartyCli({
      ...thirdPartyCli,
      rightChipIds: thirdPartyCli.rightChipIds.filter((chipId) => chipId !== id)
    });
  };

  const handleAddAvailableChip = (chip: ChipItem) => {
    if (leftChips.length <= rightChips.length) {
      saveThirdPartyCli({
        ...thirdPartyCli,
        leftChipIds: [...thirdPartyCli.leftChipIds, chip.id]
      });
    } else {
      saveThirdPartyCli({
        ...thirdPartyCli,
        rightChipIds: [...thirdPartyCli.rightChipIds, chip.id]
      });
    }
  };

  const handleRestoreDefaults = () => {
    saveThirdPartyCli({
      ...thirdPartyCli,
      leftChipIds: DEFAULT_THIRD_PARTY_LEFT_CHIP_IDS,
      rightChipIds: DEFAULT_THIRD_PARTY_RIGHT_CHIP_IDS
    });
  };

  const handleAddCommandPattern = () => {
    const nextPattern = regexCommand.trim();
    if (!nextPattern || thirdPartyCli.commandPatterns.includes(nextPattern)) return;

    saveThirdPartyCli({
      ...thirdPartyCli,
      commandPatterns: [...thirdPartyCli.commandPatterns, nextPattern]
    });
    setRegexCommand('');
  };

  const handleRemoveCommandPattern = (pattern: string) => {
    saveThirdPartyCli({
      ...thirdPartyCli,
      commandPatterns: thirdPartyCli.commandPatterns.filter((entry) => entry !== pattern)
    });
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
              className={`settings-toggle ${thirdPartyCli.showToolbar ? 'active' : ''}`}
              type="button"
              onClick={() => saveThirdPartyCli({ ...thirdPartyCli, showToolbar: !thirdPartyCli.showToolbar })}
              role="switch"
              aria-checked={thirdPartyCli.showToolbar}
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
              className={`settings-toggle ${thirdPartyCli.autoShowHideRichInput ? 'active' : ''}`}
              type="button"
              onClick={() => saveThirdPartyCli({ ...thirdPartyCli, autoShowHideRichInput: !thirdPartyCli.autoShowHideRichInput })}
              role="switch"
              aria-checked={thirdPartyCli.autoShowHideRichInput}
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
              className={`settings-toggle ${thirdPartyCli.autoOpenRichInput ? 'active' : ''}`}
              type="button"
              onClick={() => saveThirdPartyCli({ ...thirdPartyCli, autoOpenRichInput: !thirdPartyCli.autoOpenRichInput })}
              role="switch"
              aria-checked={thirdPartyCli.autoOpenRichInput}
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
              className={`settings-toggle ${thirdPartyCli.autoDismissRichInput ? 'active' : ''}`}
              type="button"
              onClick={() => saveThirdPartyCli({ ...thirdPartyCli, autoDismissRichInput: !thirdPartyCli.autoDismissRichInput })}
              role="switch"
              aria-checked={thirdPartyCli.autoDismissRichInput}
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
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddCommandPattern();
              }
            }}
          />
          <button className="cli-input-arrow-btn" type="button" aria-label="Submit command" onClick={handleAddCommandPattern}>
            <CornerDownLeft size={14} />
          </button>
        </div>
        {thirdPartyCli.commandPatterns.length > 0 && (
          <div className="cli-command-pattern-list">
            {thirdPartyCli.commandPatterns.map((pattern) => (
              <span key={pattern} className="layout-chip active-chip">
                <Terminal size={12} className="chip-icon" />
                <span>{pattern}</span>
                <button
                  className="chip-remove-btn"
                  type="button"
                  onClick={() => handleRemoveCommandPattern(pattern)}
                  aria-label={`Remove ${pattern}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
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
