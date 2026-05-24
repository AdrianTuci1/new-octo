import { ArrowRight, CornerDownLeft, Paperclip, Plus, Sparkles, X } from 'lucide-react';
import { ComposerContextMenu } from './ComposerContextMenu';
import { GitBranchPicker } from './GitBranchPicker';
import { SlashCommandHighlight } from './SlashCommandHighlight';
import { WorkingDirectoryPicker } from './WorkingDirectoryPicker';
import { useLauncherContext } from '../Layout/Launcher/LauncherContext';
import type { ChatAttachment } from '../../types/chat';
import { useComposerBarController } from './useComposerBarController';
import './ComposerBar.css';

export function ComposerBar() {
  const { launcher, composerPlaceholder } = useLauncherContext();
  const view = launcher.views.composerBar;
  const controller = useComposerBarController({
    composerPlaceholder,
    showInputHintText: launcher.ui.agentSettings?.input?.showInputHintText !== false,
    view
  });

  return (
    <div ref={controller.shellRef} className="composer-shell">
      <div className={`composer-input-row ${view.mode === 'shell' ? 'shell-active' : ''}`}>
        <div className="composer-editor-shell">
          <div className="composer-input-wrapper">
            <div className={`composer-textarea-container ${view.mode === 'shell' ? 'shell-mode' : ''} ${controller.showRecommendation ? 'has-recommendation' : ''}`}>
              {controller.showRecommendation && view.recommendedAction && (
                <div className="composer-recommendation-chip-wrapper">
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

              <SlashCommandHighlight query={view.query} />
              <ComposerContextMenu {...controller.contextMenu} />

              <textarea
                ref={controller.inputRef}
                className={`chat-input ${controller.showRecommendation ? 'has-recommendation' : ''} ${controller.showSlashCommandHighlight ? 'has-slash-command-highlight' : ''} ${controller.showContextMentionHighlight ? 'has-context-highlight' : ''}`.trim()}
                value={view.query}
                disabled={view.modelSetupRequired}
                onChange={(event) => view.onQueryChange(event.target.value)}
                onKeyDown={controller.handleInternalKeyDown}
                rows={controller.showRecommendation ? 1 : 2}
                placeholder={view.mode === 'shell' ? 'Run a terminal command' : controller.placeholder ?? 'Octomus anything, or use / for tools'}
              />

              <input
                ref={controller.fileInputRef}
                className="composer-file-input"
                type="file"
                multiple
                onChange={controller.handleFileInputChange}
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>

            {view.modelSetupRequired && (
              <div className="composer-model-setup-card" role="status" aria-live="polite">
                <div className="composer-model-setup-copy">
                  <span className="composer-model-setup-eyebrow">Model onboarding</span>
                  <strong>You don't have any model</strong>
                  <p>Add one to unlock the launcher and connect your provider securely.</p>
                </div>
                <div className="composer-model-setup-actions">
                  <button
                    className="composer-model-setup-back"
                    onClick={view.onBackFromModelSetup ?? view.onOpenModelSettings}
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className="composer-model-setup-primary"
                    onClick={view.onOpenModelSettings}
                    type="button"
                  >
                    Open model settings
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {view.attachedFiles.length > 0 && (
        <div className="composer-attachments" aria-label="Attached files">
          <div className="composer-attachments-header">
            <span>{view.attachedFiles.length} attached file{view.attachedFiles.length === 1 ? '' : 's'}</span>
            <button className="composer-attachments-clear" type="button" onClick={view.onClearAttachments}>
              Clear all
            </button>
          </div>
          <div className="composer-attachments-list">
            {view.attachedFiles.map((attachment: ChatAttachment) => (
              <div key={attachment.id} className="composer-attachment-chip" title={attachment.mimeType ?? attachment.kind}>
                <Paperclip size={11} />
                <span className="composer-attachment-name">{attachment.name}</span>
                <button
                  className="composer-attachment-remove"
                  type="button"
                  onClick={() => view.onRemoveAttachedFile(attachment.id)}
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!view.restrictActions && (
        <div className="input-actions composer-actions">
          <div className="action-group left-actions">
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
            <button
              className={`toolbar-chip auto-detect-chip ${view.terminalAutoDetectEnabled ? 'active' : ''}`}
              onClick={view.onToggleTerminalAutoDetect}
              type="button"
              title="Auto detect terminal commands"
            >
              A*
            </button>
          </div>

          <div className="action-group right-actions">
            <button className="toolbar-chip model-chip" onClick={view.onToggleModelTray} type="button" title="Model">
              <span>{view.selectedModelLabel}</span>
            </button>
            <button
              className={`icon-button attach-button ${controller.canAttachFiles ? '' : 'disabled'}`.trim()}
              disabled={!controller.canAttachFiles}
              type="button"
              title={controller.attachTooltip}
              aria-disabled={!controller.canAttachFiles}
              onClick={controller.handleAttachButtonClick}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
