import { Brain, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMemoryStore } from '../../../stores';
import type { ThinkingDisplayMode } from '../../../types/chat';
import './ThinkingBlock.css';

type ThinkingBlockProps = {
  body: string;
  isStreaming?: boolean;
};

function currentThinkingMode() {
  const value = useMemoryStore.getState().settings?.values.thinkingDisplayMode;
  if (value === 'always-show' || value === 'never-show' || value === 'show-and-collapse') {
    return value as ThinkingDisplayMode;
  }

  return 'show-and-collapse';
}

export function ThinkingBlock({ body, isStreaming = false }: ThinkingBlockProps) {
  const thinkingDisplayMode = useMemoryStore((state) => {
    const value = state.settings?.values.thinkingDisplayMode;
    return value === 'always-show' || value === 'never-show' || value === 'show-and-collapse'
      ? value
      : 'show-and-collapse';
  });

  const defaultExpanded = useMemo(() => {
    if (thinkingDisplayMode === 'always-show') return true;
    if (thinkingDisplayMode === 'never-show') return false;
    return isStreaming;
  }, [isStreaming, thinkingDisplayMode]);

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    const mode = currentThinkingMode();
    if (mode === 'always-show') {
      setIsExpanded(true);
      return;
    }

    if (mode === 'never-show') {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(isStreaming);
  }, [isStreaming, thinkingDisplayMode]);

  if (thinkingDisplayMode === 'never-show' || !body.trim()) {
    return null;
  }

  return (
    <div className={`thinking-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        className="thinking-card-header"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="thinking-card-icon">
          <Brain size={14} />
        </span>
        <span className="thinking-card-title">
          {isStreaming ? 'Thinking' : 'Thought'}
        </span>
        <span className="thinking-card-state">
          {isStreaming ? 'Streaming' : 'Complete'}
        </span>
        <span className={`thinking-card-chevron ${isExpanded ? 'expanded' : ''}`}>
          <ChevronDown size={14} />
        </span>
      </button>

      {isExpanded && (
        <div className="thinking-card-body">
          <p>{body}</p>
        </div>
      )}
    </div>
  );
}
