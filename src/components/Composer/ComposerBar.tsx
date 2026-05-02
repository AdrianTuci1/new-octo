import { useState, useEffect, type KeyboardEvent } from 'react';
import { Bot, FolderOpen, MonitorSmartphone, Plus, Sparkles } from 'lucide-react';
import { useComposerBar } from './useComposerBar';
import type { RecommendedComposerAction, ShellPrediction } from '../../lib/composerIntelligence';
import type { ComposerMode } from '../../types/ui';
import './ComposerBar.css';

type ComposerBarProps = {
  mode: ComposerMode;
  query: string;
  prediction: ShellPrediction | null;
  recommendedAction: RecommendedComposerAction | null;
  onQueryChange: (query: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRecommendedActionClick: (action: RecommendedComposerAction) => void;
  onHeightChange?: (height: number) => void;
  placeholder?: string;
};

export function ComposerBar({
  mode,
  query,
  prediction,
  recommendedAction,
  onQueryChange,
  onKeyDown,
  onRecommendedActionClick,
  onHeightChange,
  placeholder
}: ComposerBarProps) {
  const { inputRef, shellRef } = useComposerBar(query, onHeightChange);
  const [isDismissed, setIsDismissed] = useState(false);
  const predictionSuffix = prediction?.completionText ?? '';

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
            {mode === 'shell' && <span className="composer-shell-indicator">!</span>}
            
            <div className={`composer-textarea-container ${mode === 'shell' ? 'shell-mode' : ''} ${showRecommendation ? 'has-recommendation' : ''}`}>
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
                    : placeholder ?? 'Ask Octomus anything, or use / for tools'
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="input-actions composer-actions">
        <div className="action-group left-actions">
          <button className="icon-button" type="button" title="Change working directory">
            <FolderOpen size={12} />
          </button>
          {mode === 'shell' ? (
            <div className="composer-mode-chip">
              <span>shell</span>
              {prediction && <span className="composer-mode-chip-hint">Tab</span>}
            </div>
          ) : (
            <button className="icon-button" type="button" title="Auto detect terminal commands" style={{ fontSize: '12px' }}>
              A*
            </button>
          )}
        </div>

        <div className="action-group right-actions">
          <button className="toolbar-chip model-chip" type="button" title="Model">
            <Bot size={12} />
            <span>Model</span>
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
