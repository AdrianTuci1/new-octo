import { memo } from 'react';
import { ArrowRight, Command, CornerDownLeft, Server, Sparkles, SquareTerminal } from 'lucide-react';
import { GitBranchPicker } from './GitBranchPicker';
import { SlashCommandHighlight } from './SlashCommandHighlight';
import { WorkingDirectoryPicker } from './WorkingDirectoryPicker';
import type { LauncherViewModel } from '../Layout/Launcher/hooks';
import type { TerminalShellCompletion } from '../../types/terminal';
import { useTerminalComposerController } from './useTerminalComposerController';
import './TerminalComposer.css';

type TerminalComposerProps = {
  view: LauncherViewModel['views']['terminalComposer'];
};

export const TerminalComposer = memo(function TerminalComposer({ view }: TerminalComposerProps) {
  const controller = useTerminalComposerController(view);

  return (
    <div ref={controller.shellRef} className="composer-shell terminal-composer-shell">
      <div className="terminal-composer-context-row">
        {view.gitContext && view.runtimeNodeVersion && (
          <div className="terminal-runtime-chip" title={`Node ${view.runtimeNodeVersion}`}>
            <SquareTerminal size={12} />
            <span>{view.runtimeNodeVersion}</span>
          </div>
        )}

        {view.remoteSession && (
          <div className="remote-session-chip" title={view.remoteSession.title}>
            <Server size={12} />
            <span>{view.remoteSession.label}</span>
          </div>
        )}

        <WorkingDirectoryPicker
          buttonLabel={view.workingDirectoryLabel}
          currentPath={view.workingDirectory}
          isOpen={view.workingDirectoryPickerOpen}
          isCompact={true}
          listing={view.workingDirectoryListing}
          onClose={view.onCloseWorkingDirectoryPicker}
          onNavigateToParent={view.onNavigateToParentDirectory}
          onSearchQueryChange={view.onWorkingDirectorySearchChange}
          onSelectDirectory={view.onSelectWorkingDirectory}
          onToggle={view.onToggleWorkingDirectoryPicker}
          searchQuery={view.workingDirectorySearch}
        />

        {view.gitContext && (
          <GitBranchPicker
            branches={view.gitContext.branches}
            currentBranch={view.gitContext.currentBranch}
            isOpen={view.gitBranchMenuOpen}
            onClose={view.onCloseGitBranchMenu}
            onSelectBranch={view.onSelectGitBranch}
            onToggle={view.onToggleGitBranchMenu}
          />
        )}

      </div>

      <div className="terminal-composer-body">
        <div className="composer-input-wrapper terminal-composer-input-wrapper">
          <div className={`composer-textarea-container terminal-composer-textarea-container ${controller.showRecommendation ? 'has-recommendation' : ''}`}>
            {controller.showRecommendation && view.recommendedAction && (
              <div className="composer-recommendation-chip-wrapper terminal-recommendation-wrapper">
                <button
                  className="composer-recommendation-chip"
                  onClick={() => view.onRecommendedActionClick(view.recommendedAction)}
                  type="button"
                  title={view.recommendedAction.description}
                >
                  <Sparkles size={12} className="recommendation-icon" />
                  <span className="recommendation-label">{view.recommendedAction.value}</span>
                  <span className="recommendation-accept-group" aria-hidden="true">
                    <span className="recommendation-accept-key">↑</span>
                    <span className="recommendation-accept-key">
                      <CornerDownLeft size={10} />
                    </span>
                  </span>
                </button>
              </div>
            )}

            {controller.predictionSuffix && (
              <div className="composer-suggestion-overlay" aria-hidden="true">
                <span className="composer-suggestion-prefix">{view.query}</span>
                <span className="composer-suggestion-text">{controller.predictionSuffix}</span>
                <span className="composer-suggestion-accept-group" title={view.prediction?.hint}>
                  <span className="composer-suggestion-accept-main">
                    <ArrowRight size={11} />
                  </span>
                  <span className="composer-suggestion-accept-tail">
                    <span className="composer-suggestion-accept-tail-mark" />
                  </span>
                </span>
              </div>
            )}

            <SlashCommandHighlight query={view.query} extraClassName="terminal-composer-input-highlight" />

            <textarea
              ref={controller.inputRef}
              className={`chat-input terminal-chat-input ${controller.showRecommendation ? 'has-recommendation' : ''} ${controller.showSlashCommandHighlight ? 'has-slash-command-highlight' : ''} ${controller.showContextMentionHighlight ? 'has-context-highlight' : ''}`.trim()}
              value={view.query}
              onChange={(event) => {
                const nextValue = event.target.value;
                view.onQueryChange(nextValue);
              }}
              onKeyDown={controller.handleKeyDown}
              rows={2}
              placeholder="Run commands"
            />

            {controller.showCompletionPanel && view.completionState && (
              <div className="terminal-completions-panel" role="status" aria-live="polite">
                <div className="terminal-completions-header">
                  <span className="terminal-completions-eyebrow">shell completions</span>
                  {view.completionState.format && (
                    <span className="terminal-completions-pill">{view.completionState.format}</span>
                  )}
                  {view.completionState.promptVisible && (
                    <span className="terminal-completions-pill terminal-completions-pill-emphasis">prompt</span>
                  )}
                  {view.completionState.status === 'finished' && (
                    <span className="terminal-completions-pill">done</span>
                  )}
                </div>

                {controller.completionItems.length > 0 ? (
                  <div className="terminal-completions-list">
                    {controller.completionItems.slice(0, 6).map((completion: TerminalShellCompletion) => (
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

                {view.completionState.lastValue && (
                  <div className="terminal-completions-footnote">{view.completionState.lastValue}</div>
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

          {view.showOpenInApp && view.onOpenApp && (
            <button className="terminal-open-app-button" type="button" onClick={view.onOpenApp}>
              <Command size={12} />
              <span className="terminal-open-app-key-letter">x</span>
              <span>open in app</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
