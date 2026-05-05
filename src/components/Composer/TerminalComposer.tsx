import { ArrowRight, Command, CornerDownLeft, SquareTerminal } from 'lucide-react';
import type { KeyboardEventHandler } from 'react';
import { GitBranchPicker } from './GitBranchPicker';
import { useComposerBar } from './useComposerBar';
import { WorkingDirectoryPicker } from './WorkingDirectoryPicker';
import type { RecommendedComposerAction, ShellPrediction } from '../../lib/composerIntelligence';
import type { FilesystemDirectoryListing } from '../../types/filesystem';
import type { GitRepoContext } from '../../types/git';
import './TerminalComposer.css';

type TerminalComposerProps = {
  query: string;
  gitContext: GitRepoContext | null;
  gitBranchMenuOpen: boolean;
  workingDirectory: string | null;
  workingDirectoryLabel: string;
  workingDirectoryPickerOpen: boolean;
  workingDirectoryListing: FilesystemDirectoryListing | null;
  workingDirectorySearch: string;
  runtimeNodeVersion: string | null;
  prediction: ShellPrediction | null;
  recommendedAction: RecommendedComposerAction | null;
  onQueryChange: (query: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onRecommendedActionClick: (action: RecommendedComposerAction) => void;
  onToggleWorkingDirectoryPicker: () => void;
  onCloseWorkingDirectoryPicker: () => void;
  onWorkingDirectorySearchChange: (query: string) => void;
  onNavigateToParentDirectory: () => void;
  onSelectWorkingDirectory: (path: string) => void;
  onToggleGitBranchMenu: () => void;
  onCloseGitBranchMenu: () => void;
  onSelectGitBranch: (branch: string) => void;
  onOpenCommandsTray: () => void;
  onLaunchAgentComposer: (seedPrompt?: string, autoSubmit?: boolean) => void;
  onOpenApp?: () => void;
  onHeightChange?: (height: number) => void;
  showOpenInApp?: boolean;
};

export function TerminalComposer({
  query,
  gitContext,
  gitBranchMenuOpen,
  workingDirectory,
  workingDirectoryLabel,
  workingDirectoryPickerOpen,
  workingDirectoryListing,
  workingDirectorySearch,
  runtimeNodeVersion,
  prediction,
  recommendedAction,
  onQueryChange,
  onKeyDown,
  onRecommendedActionClick,
  onToggleWorkingDirectoryPicker,
  onCloseWorkingDirectoryPicker,
  onWorkingDirectorySearchChange,
  onNavigateToParentDirectory,
  onSelectWorkingDirectory,
  onToggleGitBranchMenu,
  onCloseGitBranchMenu,
  onSelectGitBranch,
  onOpenCommandsTray,
  onLaunchAgentComposer,
  onOpenApp,
  onHeightChange,
  showOpenInApp = false
}: TerminalComposerProps) {
  const { inputRef, shellRef } = useComposerBar(query, onHeightChange);
  const showRecommendation = Boolean(recommendedAction) && query.trim().length === 0;
  const predictionSuffix = prediction?.completionText ?? '';

  return (
    <div ref={shellRef} className="composer-shell terminal-composer-shell">
      <div className="terminal-composer-context-row">
        {gitContext && runtimeNodeVersion && (
          <div className="terminal-runtime-chip" title={`Node ${runtimeNodeVersion}`}>
            <SquareTerminal size={12} />
            <span>{runtimeNodeVersion}</span>
          </div>
        )}

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
      </div>

      <div className="terminal-composer-body">
        <div className="composer-input-wrapper terminal-composer-input-wrapper">
          <div className={`composer-textarea-container terminal-composer-textarea-container ${showRecommendation ? 'has-recommendation' : ''}`}>
            {showRecommendation && recommendedAction && (
              <div className="composer-recommendation-chip-wrapper terminal-recommendation-wrapper">
                <button
                  className="composer-recommendation-chip"
                  onClick={() => onRecommendedActionClick(recommendedAction)}
                  type="button"
                >
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
              className={`chat-input terminal-chat-input ${showRecommendation ? 'has-recommendation' : ''}`}
              value={query}
              onChange={(event) => {
                const nextValue = event.target.value;
                onQueryChange(nextValue);
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  onLaunchAgentComposer(query.trim(), true);
                  return;
                }

                if (event.key === 'Enter' && query.trim() === '/agent') {
                  event.preventDefault();
                  onLaunchAgentComposer();
                  return;
                }

                if (event.key === 'Enter' && query.trim() === '/') {
                  event.preventDefault();
                  onOpenCommandsTray();
                  return;
                }

                onKeyDown(event);
              }}
              rows={2}
              placeholder="Run commands"
            />
          </div>
        </div>

        <div className="terminal-composer-footer-row">
          <div className="terminal-composer-helper">
            <Command size={12} />
            <CornerDownLeft size={12} />
            <span>new</span>
            <span className="terminal-composer-helper-command">/agent</span>
            <span>conversation</span>
          </div>

          {showOpenInApp && onOpenApp && (
            <button className="terminal-open-app-button" type="button" onClick={onOpenApp}>
              <Command size={12} />
              <span className="terminal-open-app-key-letter">x</span>
              <span>open in app</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
