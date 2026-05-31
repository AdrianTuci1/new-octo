import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemoryStore } from '../../../stores';
import type { ThinkingDisplayMode } from '../../../types/chat';
import { prepareMarkdownBody } from '../messageBubble/markdownText';
import './ThinkingBlock.css';

type ThinkingBlockProps = {
  body: string;
  isStreaming?: boolean;
  durationSeconds?: number;
};

function currentThinkingMode() {
  const value = useMemoryStore.getState().settings?.values.thinkingDisplayMode;
  if (value === 'always-show' || value === 'never-show' || value === 'show-and-collapse') {
    return value as ThinkingDisplayMode;
  }

  return 'show-and-collapse';
}

export function ThinkingBlock({ body, isStreaming = false, durationSeconds }: ThinkingBlockProps) {
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

  const getTitle = () => {
    if (isStreaming) return 'Thinking...';
    if (typeof durationSeconds === 'number') {
      return `Thought for ${durationSeconds} second${durationSeconds === 1 ? '' : 's'}`;
    }
    return 'Thought';
  };

  return (
    <div className={`thinking-simple-block ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        className="thinking-simple-header"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="thinking-simple-title">
          {getTitle()}
        </span>
        <span className={`thinking-simple-chevron ${isExpanded ? 'expanded' : ''}`}>
          <ChevronDown size={13} />
        </span>
      </button>

      {isExpanded && (
        <div className="thinking-simple-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {prepareMarkdownBody(body)}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
