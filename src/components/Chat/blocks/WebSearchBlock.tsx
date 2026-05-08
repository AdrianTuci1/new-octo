import { Search } from 'lucide-react';
import type { WebSearchResult } from '../../../types/chat';
import './WebSearchBlock.css';

export type WebSearchBlockProps = {
  status?: 'searching' | 'success' | 'error';
  results?: WebSearchResult[];
};

export function WebSearchBlock({
  status = 'success',
  results = [],
}: WebSearchBlockProps) {
  const metaLabel = status === 'searching'
    ? 'Searching'
    : status === 'error'
      ? 'Failed'
      : `${results.length} results`;

  return (
    <div className={`web-search-card ${status}`}>
      <div className="web-search-card-header">
        <span className="web-search-card-icon">
          <Search size={14} />
        </span>
        <div className="web-search-card-meta">
          <span className="web-search-card-title">Web search</span>
          <span className="web-search-card-count">{metaLabel}</span>
        </div>
      </div>
    </div>
  );
}
