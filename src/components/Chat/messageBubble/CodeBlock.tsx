import { memo, useState } from 'react';
import { Copy, Terminal, Check } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { CommandApproval } from '../../../types/terminal';

export const CodeBlock = memo(function CodeBlock({
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
});
