import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Play, Save, Check } from 'lucide-react';
import { useState } from 'react';
import type { ChatMessage } from '../../types/chat';

type MessageBubbleProps = {
  message: ChatMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const initials = "AT"; // Placeholder for user initials

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

        {message.role === 'assistant' && <Suggestions />}
      </div>
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
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
            <button className="code-action-btn run" title="Run in terminal">
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

function Suggestions() {
  const suggestions = [
    "What should I do next?",
    "Show examples.",
    "How do I fix this?"
  ];

  return (
    <div className="suggestions-row">
      {suggestions.map((text) => (
        <button key={text} className="suggestion-chip">
          {text}
        </button>
      ))}
    </div>
  );
}
