import { useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import type { WebSearchResult } from '../../../types/chat';
import './TerminalBlockSummary.css';
import './WebSearchBlock.css';

export type WebSearchBlockProps = {
  status?: 'searching' | 'success' | 'error';
  results?: WebSearchResult[];
  query?: string;
};

export function WebSearchBlock({
  status = 'success',
  results = [],
  query = 'search',
}: WebSearchBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const metaLabel = status === 'searching'
    ? 'Searching...'
    : status === 'error'
      ? 'Failed'
      : `${results.length} URL${results.length === 1 ? '' : 's'}`;

  const hasResults = results && results.length > 0;

  return (
    <div className={`web-search-container ${status} ${isExpanded ? 'expanded' : ''}`}>
      <div 
        className="terminal-block-summary"
        onClick={() => hasResults && setIsExpanded(!isExpanded)}
      >
        <span className="terminal-summary-icon">
          <Search size={14} />
        </span>
        <span className="terminal-summary-command web-search-title">
          {status === 'searching' ? `Searching for "${query}"` : `Searched for "${query}"`}
        </span>
        <div className="terminal-summary-chevron web-search-meta">
          <span className="web-search-count">{metaLabel}</span>
          {hasResults && (
            <ChevronDown 
              size={14} 
              className={`web-search-chevron ${isExpanded ? 'expanded' : ''}`}
              style={{ marginLeft: '6px' }}
            />
          )}
        </div>
      </div>

      {isExpanded && hasResults && (
        <div className="web-search-results-body">
          {results.map((r, i) => (
            <div key={i} className="web-search-result-item">
              <a href={r.url} target="_blank" rel="noreferrer" className="web-result-link">
                <span className="web-result-title">{r.title}</span>
                <span className="web-result-url">({r.url})</span>
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
