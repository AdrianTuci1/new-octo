import { useState, useEffect, type KeyboardEvent } from 'react';
import { ArrowRight, Bot, MonitorSmartphone, Plus, Sparkles } from 'lucide-react';
import { GitBranchPicker } from './GitBranchPicker';
import { useComposerBar } from './useComposerBar';
import { WorkingDirectoryPicker } from './WorkingDirectoryPicker';
import type { RecommendedComposerAction, ShellPrediction } from '../../lib/composerIntelligence';
import type { GitRepoContext } from '../../types/git';
import type { ComposerMode, ShellModeSource } from '../../types/ui';
import type { FilesystemDirectoryListing } from '../../types/filesystem';
import './ComposerBar.css';

type ComposerBarProps = {
  mode: ComposerMode;
  shellSource: ShellModeSource | null;
  query: string;
  prediction: ShellPrediction | null;
  recommendedAction: RecommendedComposerAction | null;
  gitContext: GitRepoContext | null;
  gitBranchMenuOpen: boolean;
  workingDirectory: string | null;
  workingDirectoryLabel: string;
  workingDirectoryPickerOpen: boolean;
  workingDirectoryListing: FilesystemDirectoryListing | null;
  workingDirectorySearch: string;
  selectedModelLabel: string;
  terminalAutoDetectEnabled: boolean;
  onQueryChange: (query: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRecommendedActionClick: (action: RecommendedComposerAction) => void;
  onToggleWorkingDirectoryPicker: () => void;
  onCloseWorkingDirectoryPicker: () => void;
  onWorkingDirectorySearchChange: (query: string) => void;
  onNavigateToParentDirectory: () => void;
  onSelectWorkingDirectory: (path: string) => void;
  onToggleTerminalAutoDetect: () => void;
  onToggleGitBranchMenu: () => void;
  onToggleModelTray: () => void;
  onCloseGitBranchMenu: () => void;
  onSelectGitBranch: (branch: string) => void;
  onHeightChange?: (height: number) => void;
  placeholder?: string;
};

export function ComposerBar({
  mode,
  shellSource,
  query,
  prediction,
  recommendedAction,
  gitContext,
  gitBranchMenuOpen,
  workingDirectory,
  workingDirectoryLabel,
  workingDirectoryPickerOpen,
  workingDirectoryListing,
  workingDirectorySearch,
  selectedModelLabel,
  terminalAutoDetectEnabled,
  onQueryChange,
  onKeyDown,
  onRecommendedActionClick,
  onToggleWorkingDirectoryPicker,
  onCloseWorkingDirectoryPicker,
  onWorkingDirectorySearchChange,
  onNavigateToParentDirectory,
  onSelectWorkingDirectory,
  onToggleTerminalAutoDetect,
  onToggleGitBranchMenu,
  onToggleModelTray,
  onCloseGitBranchMenu,
  onSelectGitBranch,
  onHeightChange,
  placeholder
}: ComposerBarProps) {
  const { inputRef, shellRef } = useComposerBar(query, onHeightChange);
  const [isDismissed, setIsDismissed] = useState(false);
  const predictionSuffix = prediction?.completionText ?? '';
  const showShellIndicator = mode === 'shell' && shellSource === 'manual';

  // Reset dismissal when recommendation changes
  useEffect(() => {
    setIsDismissed(false);
  }, [recommendedAction?.label]);

  const showRecommendation = recommendedAction && query === '' && !isDismissed;

  const handleInternalKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Backspace' && query === '' && showRecommendation) {
      setIsDismissed(true);
      event.preventDefault();
      return;
    }
    onKeyDown(event);
  };
  return (
    <div ref={shellRef} className="composer-shell">
      <div className={`composer-input-row ${mode === 'shell' ? 'shell-active' : ''}`}>
        <div className="composer-editor-shell">
          <div className="composer-input-wrapper">
            {showShellIndicator && <span className="composer-shell-indicator">!</span>}

            <div className={`composer-textarea-container ${mode === 'shell' ? 'shell-mode' : ''} ${showShellIndicator ? 'manual-shell-mode' : ''} ${showRecommendation ? 'has-recommendation' : ''}`}>
              {showRecommendation && (
                <div className="composer-recommendation-chip-wrapper">
                  <button
                    className="composer-recommendation-chip"
                    onClick={() => onRecommendedActionClick(recommendedAction)}
                    type="button"
                  >
                    <Sparkles size={12} className="recommendation-icon" />
                    <span className="recommendation-label">{recommendedAction.value}</span>
                  </button>
                </div>
              )}

              {predictionSuffix && (
                <div className="composer-suggestion-overlay" aria-hidden="true">
                  <span className="composer-suggestion-prefix">{query}</span>
                  <span className="composer-suggestion-text">{predictionSuffix}</span>
                  <span className="composer-suggestion-accept-group" title={prediction?.hint}>
                    <span className="composer-suggestion-accept-main">
                      <ArrowRight size={11} />
                    </span>
                    <span className="composer-suggestion-accept-tail">
                      <span className="composer-suggestion-accept-tail-mark" />
                    </span>
                  </span>
                </div>
              )}
              <textarea
                ref={inputRef}
                className={`chat-input ${showRecommendation ? 'has-recommendation' : ''}`}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={handleInternalKeyDown}
                rows={showRecommendation ? 1 : 2}
                placeholder={
                  mode === 'shell'
                    ? 'Run a terminal command'
                    : placeholder ?? 'Octomus anything, or use / for tools'
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="input-actions composer-actions">
        <div className="action-group left-actions">
          <WorkingDirectoryPicker
            buttonLabel={workingDirectoryLabel}
            currentPath={workingDirectory}
            isOpen={workingDirectoryPickerOpen}
            isCompact={true}
            listing={workingDirectoryListing}
            onClose={onCloseWorkingDirectoryPicker}
            onNavigateToParent={onNavigateToParentDirectory}
            onSearchQueryChange={onWorkingDirectorySearchChange}
            onSelectDirectory={onSelectWorkingDirectory}
            onToggle={onToggleWorkingDirectoryPicker}
            searchQuery={workingDirectorySearch}
          />
          {gitContext && (
            <GitBranchPicker
              branches={gitContext.branches}
              currentBranch={gitContext.currentBranch}
              isOpen={gitBranchMenuOpen}
              onClose={onCloseGitBranchMenu}
              onSelectBranch={onSelectGitBranch}
              onToggle={onToggleGitBranchMenu}
            />
          )}
          <button
            className={`toolbar-chip auto-detect-chip ${terminalAutoDetectEnabled ? 'active' : ''}`}
            onClick={onToggleTerminalAutoDetect}
            type="button"
            title="Auto detect terminal commands"
          >
            A*
          </button>
        </div>

        <div className="action-group right-actions">
          <button className="toolbar-chip model-chip" onClick={onToggleModelTray} type="button" title="Model">
            <span>{selectedModelLabel}</span>
          </button>
          <button className="toolbar-chip remote-chip" type="button" title="Remote control">
            <MonitorSmartphone size={12} />
            <span>Remote</span>
          </button>
          <button className="icon-button attach-button" type="button" title="Attach file">
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
