import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Terminal, Save, Check } from 'lucide-react';
import { useState } from 'react';
import { CodeDiffView } from './CodeDiffView';
import { ImplementationPlanBlock, ThinkingBlock, WebSearchBlock } from './blocks';
import { visibleChatMessageBody } from '../../hooks/useChat';
import type { ChatMessage } from '../../types/chat';
import type { CommandApproval } from '../../types/terminal';

type MessageBubbleProps = {
  message: ChatMessage;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
};

export function MessageBubble({ message, onRequestCommandApproval }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const initials = "AT"; // Placeholder for user initials
  const visibleBody = message.role === 'assistant'
    ? visibleChatMessageBody(message.body)
    : message.body;
  const showStreamingHint = message.role === 'assistant' && message.isStreaming && !visibleBody.trim();

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="role-avatar-container">
        {isUser && (
          <div className="initials-avatar">
            {initials}
          </div>
        )}
      </div>

      <div className="message-content">
        {message.messageKind === 'reasoning' ? (
          <ThinkingBlock 
            body={visibleBody} 
            isStreaming={message.isStreaming} 
            durationSeconds={message.thinkingDurationSeconds}
          />
        ) : showStreamingHint ? (
          <div className="message-streaming-hint">
            <span className="thinking-dot-animation">Thinking</span>
            {message.status && message.status !== 'queued' && (
              <span className="status-badge"> ({message.status})</span>
            )}
          </div>
        ) : message.role === 'tool' ? (
          message.toolKind === 'web-search'
            ? (
                <div className="tool-output-web-search">
                  <WebSearchBlock
                    status={message.webSearchStatus}
                    results={message.webSearchResults ?? []}
                    query={message.webSearchQuery}
                  />
                  {(!message.webSearchResults || message.webSearchResults.length === 0) && message.body.trim().length > 0 && (
                    <div className="tool-output-raw tool-output-web-search-fallback">
                      {message.body}
                    </div>
                  )}
                </div>
              )
            : message.toolKind === 'plan' && message.executionPlan
              ? (
                  <div className="tool-output-plan">
                    <ImplementationPlanBlock
                      title={message.executionPlan.title}
                      version={message.executionPlan.version ?? 'v1'}
                    />
                  </div>
                )
            : (
                <div className="tool-output-raw">
                  {message.body}
                </div>
              )
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const lang = match ? match[1] : '';

                return !inline && match ? (
                  <CodeBlock
                    code={String(children).replace(/\n$/, '')}
                    language={lang}
                    onRequestCommandApproval={onRequestCommandApproval}
                  />
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {visibleBody}
          </ReactMarkdown>
        )}

        {message.fileDiffs && message.fileDiffs.length > 0 && (
          <div className="message-diffs">
            <CodeDiffView diffs={message.fileDiffs} />
          </div>
        )}
      </div>
    </div>
  );
}

function CodeBlock({
  code,
  language,
  onRequestCommandApproval
}: {
  code: string;
  language: string;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isShell = ['sh', 'bash', 'zsh', 'shell', 'fish'].includes(language.toLowerCase());

  return (
    <div className="code-block-container">
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        showLineNumbers={true}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          textAlign: 'right',
          color: 'rgba(255, 255, 255, 0.25)',
          fontSize: '11px',
          userSelect: 'none'
        }}
        customStyle={{
          margin: 0,
          background: 'transparent',
          fontSize: '12px',
          padding: '12px 12px 8px 12px',
          lineHeight: '1.5'
        }}
      >
        {code}
      </SyntaxHighlighter>
      <div className="code-block-footer">
        <span className="code-lang">{language}</span>
        <div className="code-actions">
          <button className="code-action-btn" onClick={handleCopy} title="Copy">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          {isShell && (
            <button
              className="code-action-btn run"
              title="Run in terminal"
              onClick={() => onRequestCommandApproval?.({ kind: 'command', command: code })}
            >
              <Terminal size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
