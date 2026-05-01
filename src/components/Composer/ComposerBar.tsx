import { type KeyboardEvent } from 'react';
import { Bot, FolderOpen, MonitorSmartphone, Plus, Slash } from 'lucide-react';
import { useComposerBar } from './useComposerBar';
import './ComposerBar.css';

type ComposerBarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onHeightChange?: (height: number) => void;
};

export function ComposerBar({ query, onQueryChange, onKeyDown, onHeightChange }: ComposerBarProps) {
  const { inputRef, shellRef } = useComposerBar(query, onHeightChange);

  return (
    <div ref={shellRef} className="composer-shell">
      <div className="composer-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Ask Octomus anything, or use / for tools"
        />
      </div>

      <div className="input-actions composer-actions">
        <div className="action-group left-actions">
          <button className="icon-button" type="button" title="Change working directory">
            <FolderOpen size={12} />
          </button>
          <button className="icon-button" type="button" title="Disable terminal command auto detection">
            <Slash size={12} />
          </button>
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
