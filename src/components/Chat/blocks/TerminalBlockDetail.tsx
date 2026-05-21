import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Check, ChevronDown, Download, Filter, MoreVertical, Paperclip, Terminal, X } from 'lucide-react';
import './TerminalBlockDetail.css';
import type { TerminalCommandBlock } from '../../../types/terminal';

type TerminalBlockDetailProps = {
  block: TerminalCommandBlock;
  failed: boolean;
  isSelected: boolean;
  onClose: () => void;
  onSelect: () => void;
  workingDirectory?: string | null;
};

function formatDuration(durationMs?: number | null) {
  if (typeof durationMs !== 'number') return 'running';
  if (durationMs < 1000) return `${(durationMs / 1000).toFixed(3)}s`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function outputFor(block: TerminalCommandBlock) {
  const output = block.output.trimEnd();
  const withoutEcho = output.startsWith(block.command)
    ? output.slice(block.command.length).replace(/^\s*\n?/, '')
    : output;

  return withoutEcho || (block.status === 'running' ? 'Running command...' : 'No output.');
}

const WORKFLOWS_STORAGE_KEY = 'octomus.savedTerminalWorkflows';
const BOOKMARKS_STORAGE_KEY = 'octomus.bookmarkedTerminalBlocks';
const AGENT_CONTEXT_STORAGE_KEY = 'octomus.agentContextTerminalBlocks';
const MAX_VISIBLE_OUTPUT_CHARS = 120_000;

function readStringSet(key: string) {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const values = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function writeStringSet(key: string, values: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
}

function saveWorkflow(block: TerminalCommandBlock, output: string) {
  if (typeof window === 'undefined') return;
  const workflows = JSON.parse(window.localStorage.getItem(WORKFLOWS_STORAGE_KEY) ?? '[]');
  const nextWorkflow = {
    id: `workflow-${block.id}`,
    blockId: block.id,
    command: block.command,
    output,
    createdAt: new Date().toISOString()
  };
  const nextWorkflows = Array.isArray(workflows)
    ? [nextWorkflow, ...workflows.filter((workflow) => workflow?.blockId !== block.id)]
    : [nextWorkflow];
  window.localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(nextWorkflows.slice(0, 100)));
}

export function TerminalBlockDetail({
  block,
  failed,
  isSelected,
  onClose,
  onSelect,
  workingDirectory
}: TerminalBlockDetailProps) {
  const mountTimeRef = useRef(Date.now());
  const outputRef = useRef<HTMLPreElement | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRectRef = useRef<DOMRect | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isAttachedContext, setIsAttachedContext] = useState(() => readStringSet(AGENT_CONTEXT_STORAGE_KEY).has(block.id));
  const [isBookmarked, setIsBookmarked] = useState(() => readStringSet(BOOKMARKS_STORAGE_KEY).has(block.id));
  const [isSavedWorkflow, setIsSavedWorkflow] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuVisible(false);
      }
    };
    if (menuVisible) {
      window.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('contextmenu', handleClickOutside);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [menuVisible]);

  useLayoutEffect(() => {
    if (menuVisible && menuRef.current && btnRectRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const btnRect = btnRectRef.current;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // Dynamically determine vertical placement to prevent offscreen bleeding at the bottom
      let y = btnRect.bottom + 6;
      if (y + menuRect.height > viewportHeight - 12) {
        // Inadequate space below, open vertically flipped upwards
        y = btnRect.top - menuRect.height - 6;
      }

      // Dynamically determine horizontal placement to avoid left edge bleeding
      let x = btnRect.right - menuRect.width;
      if (x < 12) {
        // Inadequate space leftwards, realign to left edge of the button
        x = btnRect.left;
      }
      
      // Safety clamps to keep the entire bounding box constrained cleanly in viewport
      if (x + menuRect.width > viewportWidth - 12) {
        x = viewportWidth - menuRect.width - 12;
      }
      if (x < 12) x = 12;
      if (y < 12) y = 12;

      setMenuPos({ x, y });
      setIsPositioned(true);
    }
  }, [menuVisible]);

  const handleOpenMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    btnRectRef.current = event.currentTarget.getBoundingClientRect();
    setIsPositioned(false); // Keep hidden initially to prevent visible coordinate snap
    setMenuVisible(true);
  };

  const writeClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) { console.error(err); }
  };

  const handleCopyFull = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await writeClipboard(`${block.command}\n${outputFor(block)}`);
    setMenuVisible(false);
  };

  const handleCopyCommand = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await writeClipboard(block.command);
    setMenuVisible(false);
  };

  const handleCopyOutput = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await writeClipboard(outputFor(block));
    setMenuVisible(false);
  };

  const handleShareBlock = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const text = `${block.command}\n\n${outputFor(block)}`;
    if (navigator.share) {
      await navigator.share({ title: 'Terminal block', text }).catch(() => undefined);
    } else {
      await writeClipboard(text);
    }
    setMenuVisible(false);
  };

  const handleShareSession = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const text = `Terminal session block ${block.id}\n\n${block.command}\n\n${outputFor(block)}`;
    if (navigator.share) {
      await navigator.share({ title: 'Terminal session', text }).catch(() => undefined);
    } else {
      await writeClipboard(text);
    }
    setMenuVisible(false);
  };

  const handleSaveWorkflow = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    saveWorkflow(block, outputFor(block));
    setIsSavedWorkflow(true);
    setMenuVisible(false);
  };

  const handleToggleAgentContext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = !isAttachedContext;
    const values = readStringSet(AGENT_CONTEXT_STORAGE_KEY);
    if (next) values.add(block.id);
    else values.delete(block.id);
    writeStringSet(AGENT_CONTEXT_STORAGE_KEY, values);
    setIsAttachedContext(next);
    setMenuVisible(false);
  };

  const handleToggleBookmark = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = !isBookmarked;
    const values = readStringSet(BOOKMARKS_STORAGE_KEY);
    if (next) values.add(block.id);
    else values.delete(block.id);
    writeStringSet(BOOKMARKS_STORAGE_KEY, values);
    setIsBookmarked(next);
    setMenuVisible(false);
  };

  const handleCopyDebuggingId = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await writeClipboard(block.id);
    setMenuVisible(false);
  };

  const handleScrollToTop = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    outputRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setMenuVisible(false);
  };

  const handleScrollToBottom = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    outputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    setMenuVisible(false);
  };

  const handleCloseMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuVisible(false);
  };

  const handleSafeClose = () => {
    // Ignore clicks happening within 300ms of mount to prevent accidental overlap triggering
    if (Date.now() - mountTimeRef.current < 300) return;
    onClose();
  };

  const handleToggleFilter = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setFilterVisible(prev => !prev);
    setMenuVisible(false); // Clear context dropdown when firing toggles
  };

  const rawOutput = useMemo(() => outputFor(block), [block]);

  const filteredLines = useMemo(() => {
    if (!filterText.trim()) return rawOutput;
    
    let pattern = filterText;
    if (!useRegex) {
      // Escape all regex specific syntax characters for standard literal match
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    try {
      const flags = caseSensitive ? '' : 'i';
      const regex = new RegExp(pattern, flags);
      return rawOutput
        .split('\n')
        .filter(line => regex.test(line))
        .join('\n');
    } catch (err) {
      return '(Invalid RegExp)';
    }
  }, [rawOutput, filterText, caseSensitive, useRegex, wholeWord]);

  const matchCount = useMemo(() => {
    if (!filterText.trim()) return 0;
    if (filteredLines === '(Invalid RegExp)') return 0;
    return filteredLines.trim() === '' ? 0 : filteredLines.split('\n').length;
  }, [filteredLines, filterText]);

  const renderedOutput = useMemo(() => {
    const sourceOutput = filterText.trim() ? filteredLines : rawOutput;
    if (
      !sourceOutput ||
      sourceOutput === '(Invalid RegExp)' ||
      sourceOutput === '(No matching lines)' ||
      sourceOutput.length <= MAX_VISIBLE_OUTPUT_CHARS
    ) {
      return sourceOutput || (filterText.trim() ? '(No matching lines)' : rawOutput);
    }

    const visiblePrefixChars = Math.floor(MAX_VISIBLE_OUTPUT_CHARS / 2);
    const visibleSuffixChars = MAX_VISIBLE_OUTPUT_CHARS - visiblePrefixChars;
    const omittedChars = sourceOutput.length - MAX_VISIBLE_OUTPUT_CHARS;

    return [
      sourceOutput.slice(0, visiblePrefixChars),
      '',
      `… truncated ${omittedChars.toLocaleString()} characters for performance …`,
      '',
      sourceOutput.slice(-visibleSuffixChars)
    ].join('\n');
  }, [filterText, filteredLines, rawOutput]);

  const isOutputTruncated = useMemo(() => {
    const sourceOutput = filterText.trim() ? filteredLines : rawOutput;
    return (
      !!sourceOutput &&
      sourceOutput !== '(Invalid RegExp)' &&
      sourceOutput !== '(No matching lines)' &&
      sourceOutput.length > MAX_VISIBLE_OUTPUT_CHARS
    );
  }, [filterText, filteredLines, rawOutput]);

  const className = [
    'terminal-block-detail',
    failed ? 'failed' : '',
    isSelected ? 'selected' : '',
    block.source === 'user' ? 'is-user' : '',
    isAttachedContext ? 'attached-context' : '',
    isBookmarked ? 'bookmarked' : ''
  ].filter(Boolean).join(' ');

  return (
    <article className={className} onClick={onSelect}>
      {!failed && block.source !== 'user' && (
        <button className={`terminal-detail-top-bar ${isSelected ? 'selected' : ''}`} type="button" onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleSafeClose();
        }}>
          <span className="terminal-detail-top-title">
            {isSelected ? <Check size={17} /> : <Terminal size={15} />}
            <span className="terminal-detail-top-title-text">
              {isSelected ? 'Viewing command detail' : block.command}
            </span>
          </span>
          <ChevronDown size={16} style={{ opacity: 0.7 }} />
        </button>
      )}

      <div className="terminal-detail-body">
        {!isSelected && failed && <span className="terminal-detail-failure-rail" />}

        <header className="terminal-detail-header">
          <div className="terminal-detail-header-top-row">
            <div className="terminal-detail-title">
              <span>~</span>
              <span>({formatDuration(block.durationMs)})</span>
            </div>

            <div
              className="terminal-block-actions"
              aria-label="Terminal block actions"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                title="Attach as agent context"
                onClick={handleToggleAgentContext}
                className={isAttachedContext ? 'active context-active' : ''}
              >
                <Paperclip size={18} />
              </button>
              <button
                type="button"
                title="Save as workflow"
                onClick={handleSaveWorkflow}
                className={isSavedWorkflow ? 'active' : ''}
              >
                <Download size={18} />
              </button>
              <button 
                type="button" 
                title="Filter block output" 
                onClick={handleToggleFilter}
                className={filterVisible ? 'active' : ''}
              >
                <Filter size={19} />
              </button>
              <button type="button" title="More actions" onClick={handleOpenMenu}>
                <MoreVertical size={19} />
              </button>
            </div>
          </div>

          <div className="terminal-detail-command-row">
            <strong>{block.command}</strong>
          </div>

          {filterVisible && (
            <div className="terminal-finder-overlay" onClick={(e) => e.stopPropagation()}>
              <div className="chat-finder-input-container">
                <input
                  className="terminal-find-input"
                  type="text"
                  placeholder="Filter"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  autoFocus
                />
                <div className="chat-finder-input-actions">
                  <button
                    type="button"
                    className={`chat-finder-toggle-btn ${useRegex ? 'active' : ''}`}
                    onClick={() => setUseRegex(!useRegex)}
                    title="Use Regular Expression"
                  >
                    .*
                  </button>
                  <button
                    type="button"
                    className={`chat-finder-toggle-btn ${caseSensitive ? 'active' : ''}`}
                    onClick={() => setCaseSensitive(!caseSensitive)}
                    title="Match Case"
                  >
                    Aa
                  </button>
                  <button
                    type="button"
                    className={`chat-finder-toggle-btn ${wholeWord ? 'active' : ''}`}
                    onClick={() => setWholeWord(!wholeWord)}
                    title="Match Whole Word"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 8V4h4M16 4h4v4M4 16v4h4M16 20h4v-4" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="terminal-finder-count">
                {matchCount} {matchCount === 1 ? 'match' : 'matches'}
              </div>
              <div className="chat-finder-nav-actions">
                <button
                  type="button"
                  className="chat-finder-nav-btn close"
                  onClick={() => {
                    setFilterVisible(false);
                    setFilterText('');
                  }}
                  title="Close Filter"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {isOutputTruncated && (
            <div className="terminal-output-truncation-note">
              Output trimmed for performance. Copy/share still uses the full buffer.
            </div>
          )}
        </header>

        <pre ref={outputRef} className="terminal-block-output">
          {renderedOutput}
        </pre>
      </div>

      {menuVisible && (
        <div
          ref={menuRef}
          className="terminal-detail-context-menu"
          style={{ 
            top: menuPos.y, 
            left: menuPos.x,
            visibility: isPositioned ? 'visible' : 'hidden',
            opacity: isPositioned ? 1 : 0
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={handleCopyFull}>
            <span className="item-label">Copy</span>
            <span className="item-shortcut">⌘C</span>
          </div>
          <div className="context-menu-item" onClick={handleCopyCommand}>
            <span className="item-label">Copy command</span>
            <span className="item-shortcut">⇧⌘C</span>
          </div>
          <div className="context-menu-item" onClick={handleCopyOutput}>
            <span className="item-label">Copy output</span>
            <span className="item-shortcut">⌥⇧⌘C</span>
          </div>
          <div className="context-menu-item" onClick={handleShareBlock}>
            <span className="item-label">Share block...</span>
            <span className="item-shortcut">⇧⌘S</span>
          </div>
          <div className="context-menu-item" onClick={handleShareSession}>
            <span className="item-label">Share session...</span>
          </div>
          
          <div className="context-menu-separator" />
          
          <div className="context-menu-item" onClick={handleSaveWorkflow}>
            <span className="item-label">Save as workflow</span>
            <span className="item-shortcut">⌘S</span>
          </div>
          <div className={`context-menu-item ${isAttachedContext ? 'context-attached' : ''}`} onClick={handleToggleAgentContext}>
            <span className="item-label">{isAttachedContext ? 'Attached as agent context' : 'Attach as agent context'}</span>
            <span className="item-shortcut">⌃⇧Space</span>
          </div>
          
          <div className="context-menu-separator" />
          
          <div className="context-menu-item" onClick={handleCopyCommand}>
            <span className="item-label">Copy prompt</span>
          </div>
          <div className="context-menu-item" onClick={(event) => {
            void writeClipboard(workingDirectory?.trim() || 'Working directory unavailable for this block');
            handleCloseMenu(event);
          }}>
            <span className="item-label">Copy working directory</span>
          </div>
          
          <div className="context-menu-separator" />
          
          <div className="context-menu-item" onClick={handleToggleFilter}>
            <span className="item-label">Find within block</span>
            <span className="item-shortcut">⌘F</span>
          </div>
          <div className="context-menu-item" onClick={handleToggleFilter}>
            <span className="item-label">Toggle block filter</span>
            <span className="item-shortcut">⌥⇧F</span>
          </div>
          <div className={`context-menu-item ${isBookmarked ? 'context-attached' : ''}`} onClick={handleToggleBookmark}>
            <span className="item-label">{isBookmarked ? 'Remove bookmark' : 'Toggle bookmark'}</span>
            <span className="item-shortcut">⌘B</span>
          </div>
          
          <div className="context-menu-separator" />
          
          <div className="context-menu-item" onClick={handleScrollToTop}>
            <span className="item-label">Scroll to top of block</span>
            <span className="item-shortcut">⇧⌘↑</span>
          </div>
          <div className="context-menu-item" onClick={handleScrollToBottom}>
            <span className="item-label">Scroll to bottom of block</span>
            <span className="item-shortcut">⇧⌘↓</span>
          </div>

          <div className="context-menu-separator" />

          <div className="context-menu-item" onClick={handleCopyDebuggingId}>
            <span className="item-label">Copy debugging ID</span>
          </div>
        </div>
      )}
    </article>
  );
}
