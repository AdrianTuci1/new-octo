import { Search, ChevronRight } from 'lucide-react';
import './WebSearchBlock.css';

export type WebSearchBlockProps = {
  query?: string;
  urlCount?: number;
  onClick?: () => void;
};

export function WebSearchBlock({ query = 'multi-provider AI application architecture patterns 2024 2025', urlCount = 10, onClick }: WebSearchBlockProps) {
  return (
    <button
      className="terminal-block-summary"
      type="button"
      onClick={onClick}
    >
      <span className="terminal-summary-icon web-search-icon">
        <Search size={14} />
      </span>
      <span className="terminal-summary-command web-search-command">
        Searched the web for "{query}"
      </span>
      <div className="terminal-summary-chevron web-search-chevron-group">
        <span className="web-search-url-count">{urlCount} URLs</span>
        <ChevronRight size={17} />
      </div>
    </button>
  );
}
