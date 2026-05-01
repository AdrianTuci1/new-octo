import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Play, Save, Check } from 'lucide-react';
import { useState } from 'react';
import type { ChatMessage } from '../../types/chat';
import type { CommandApproval } from '../../types/terminal';

type MessageBubbleProps = {
  message: ChatMessage;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
};

export function MessageBubble({ message, onRequestCommandApproval }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const initials = "AT"; // Placeholder for user initials
  const showStreamingHint = message.role === 'assistant' && message.isStreaming && !message.body.trim();

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
        {showStreamingHint && (
          <div className="message-streaming-hint">
            <span className="thinking-dot-animation">Thinking</span>
            {message.status && message.status !== 'queued' && (
              <span className="status-badge"> ({message.status})</span>
            )}
          </div>
        )}
        
        {message.role === 'tool' ? (
          <div className="tool-output-raw">
            {message.body}
          </div>
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
            {message.body}
          </ReactMarkdown>
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
      <div className="code-block-header">
        <span className="code-lang">{language}</span>
        <div className="code-actions">
          <button className="code-action-btn" onClick={handleCopy}>
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {isShell && (
            <button
              className="code-action-btn run"
              title="Run in terminal"
              onClick={() => onRequestCommandApproval?.({ command: code })}
            >
              <Play size={10} />
              Run
            </button>
          )}
          <button className="code-action-btn" title="Save as workflow">
            <Save size={10} />
            Save
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          background: 'transparent',
          fontSize: '12px',
          padding: '16px',
          lineHeight: '1.5'
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
