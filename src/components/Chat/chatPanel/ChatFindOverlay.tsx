import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { useChatPanelController } from '../hooks/useChatPanelController';

type ChatFindOverlayProps = {
  find: ReturnType<typeof useChatPanelController>['find'];
};

export function ChatFindOverlay({ find }: ChatFindOverlayProps) {
  if (!find.isFindOpen) {
    return null;
  }

  return (
    <div className="chat-finder-overlay">
      <div className="chat-finder-input-container">
        <input
          id="chat-find-input"
          type="text"
          placeholder="Find"
          value={find.searchQuery}
          onChange={(event) => find.setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (event.shiftKey) {
              find.selectPreviousMatch();
            } else {
              find.selectNextMatch();
            }
          }}
        />
        <div className="chat-finder-input-actions">
          <button
            type="button"
            className={`chat-finder-toggle-btn ${find.useRegex ? 'active' : ''}`}
            onClick={() => find.setUseRegex(!find.useRegex)}
            title="Use Regular Expression"
          >
            .*
          </button>
          <button
            type="button"
            className={`chat-finder-toggle-btn ${find.caseSensitive ? 'active' : ''}`}
            onClick={() => find.setCaseSensitive(!find.caseSensitive)}
            title="Match Case"
          >
            Aa
          </button>
          <button
            type="button"
            className={`chat-finder-toggle-btn ${find.wholeWord ? 'active' : ''}`}
            onClick={() => find.setWholeWord(!find.wholeWord)}
            title="Match Whole Word"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8V4h4M16 4h4v4M4 16v4h4M16 20h4v-4" />
            </svg>
          </button>
        </div>
      </div>
      <div className="chat-finder-count">
        {find.matchCount > 0 ? `${find.activeIndex + 1}/${find.matchCount}` : '0/0'}
      </div>
      <div className="chat-finder-nav-actions">
        <button
          type="button"
          className="chat-finder-nav-btn"
          onClick={find.selectNextMatch}
          disabled={find.matchCount === 0}
          title="Next Match (Enter)"
        >
          <ArrowDown size={14} />
        </button>
        <button
          type="button"
          className="chat-finder-nav-btn"
          onClick={find.selectPreviousMatch}
          disabled={find.matchCount === 0}
          title="Previous Match (Shift+Enter)"
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          className="chat-finder-nav-btn close"
          onClick={find.closeFind}
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
