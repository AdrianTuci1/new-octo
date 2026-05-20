import { ArrowRight, Command, CornerDownLeft, Sparkles, SquareTerminal } from 'lucide-react';
import type { KeyboardEventHandler } from 'react';
import { GitBranchPicker } from './GitBranchPicker';
import { hasCompleteSlashCommand, SlashCommandHighlight } from './SlashCommandHighlight';
import { useComposerBar } from './useComposerBar';
import { WorkingDirectoryPicker } from './WorkingDirectoryPicker';
import type { RecommendedComposerAction, ShellPrediction } from '../../lib/composerIntelligence';
import type { FilesystemDirectoryListing } from '../../types/filesystem';
import type { GitRepoContext } from '../../types/git';
import type { TerminalCompletionState } from '../../types/terminal';
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
  completionState?: TerminalCompletionState | null;
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
  completionState = null,
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
  const { inputRef, shellRef } = useComposerBar(query, onHeightChange, { autoFocus: true });
  const showRecommendation = Boolean(recommendedAction) && query.trim().length === 0;
  const predictionSuffix = prediction?.completionText ?? '';
  const showSlashCommandHighlight = hasCompleteSlashCommand(query);
  const completionItems = completionState?.completions ?? [];
  const showCompletionPanel = Boolean(completionState) && (
    completionState?.status === 'running' ||
    completionItems.length > 0 ||
    completionState?.promptVisible
  );

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
                  title={recommendedAction.description}
                >
                  <Sparkles size={12} className="recommendation-icon" />
                  <span className="recommendation-label">{recommendedAction.value}</span>
                  <span className="recommendation-accept-group" aria-hidden="true">
                    <span className="recommendation-accept-key">↑</span>
                    <span className="recommendation-accept-key">
                      <CornerDownLeft size={10} />
                    </span>
                  </span>
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

            <SlashCommandHighlight query={query} extraClassName="terminal-composer-input-highlight" />

            <textarea
              ref={inputRef}
              className={`chat-input terminal-chat-input ${showRecommendation ? 'has-recommendation' : ''} ${showSlashCommandHighlight ? 'has-slash-command-highlight' : ''}`}
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

            {showCompletionPanel && completionState && (
              <div className="terminal-completions-panel" role="status" aria-live="polite">
                <div className="terminal-completions-header">
                  <span className="terminal-completions-eyebrow">shell completions</span>
                  {completionState.format && (
                    <span className="terminal-completions-pill">{completionState.format}</span>
                  )}
                  {completionState.promptVisible && (
                    <span className="terminal-completions-pill terminal-completions-pill-emphasis">prompt</span>
                  )}
                  {completionState.status === 'finished' && (
                    <span className="terminal-completions-pill">done</span>
                  )}
                </div>

                {completionItems.length > 0 ? (
                  <div className="terminal-completions-list">
                    {completionItems.slice(0, 6).map((completion) => (
                      <div className="terminal-completion-item" key={`${completion.name}:${completion.description ?? ''}`}>
                        <span className="terminal-completion-name">{completion.name}</span>
                        {completion.description && (
                          <span className="terminal-completion-description">{completion.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="terminal-completions-empty">
                    Waiting for shell completion output.
                  </div>
                )}

                {completionState.lastValue && (
                  <div className="terminal-completions-footnote">{completionState.lastValue}</div>
                )}
              </div>
            )}
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
