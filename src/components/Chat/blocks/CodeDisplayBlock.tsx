import { Copy } from 'lucide-react';
import './CodeDisplayBlock.css';

export type CodeDisplayBlockProps = {
  code?: string;
};

export function CodeDisplayBlock({ code = 'const fetchArchitecture = async () => {\n  return await api.get("/patterns");\n};' }: CodeDisplayBlockProps) {
  return (
    <div className="code-display-block">
      <pre className="code-display-pre">
        {code}
      </pre>
      <button 
        type="button" 
        className="code-action-btn code-display-copy-btn"
        title="Copy code"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}
