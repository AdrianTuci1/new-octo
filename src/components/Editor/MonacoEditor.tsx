import Editor, { loader } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';

// Configure monaco to load from local node_modules if possible, 
// but @monaco-editor/react handles this well by default with a CDN fallback.
// In a Tauri app, we might want to bundle it.

interface MonacoEditorProps {
  tabId: string;
  path: string;
  content: string;
  language: string;
  readOnly?: boolean;
}

export function MonacoEditor({ tabId, path, content, language, readOnly = false }: MonacoEditorProps) {
  const editorRef = useRef<any>(null);
  const updateContent = useEditorStore((state) => state.updateContent);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // Define a Warp-like theme
    monaco.editor.defineTheme('warp-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff79c6' },
        { token: 'string', foreground: 'f1fa8c' },
        { token: 'number', foreground: 'bd93f9' },
        { token: 'type', foreground: '8be9fd' },
        { token: 'function', foreground: '50fa7b' },
      ],
      colors: {
        'editor.background': '#050505',
        'editor.foreground': '#f8f8f2',
        'editorLineNumber.foreground': '#44475a',
        'editorLineNumber.activeForeground': '#8be9fd',
        'editor.selectionBackground': '#44475a',
        'editor.lineHighlightBackground': '#111111',
        'editorCursor.foreground': '#aeafad',
        'editorWhitespace.foreground': '#3b3a32',
        'editorIndentGuide.background': '#111111',
        'editorIndentGuide.activeBackground': '#222222',
      },
    });

    monaco.editor.setTheme('warp-dark');
  };

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      updateContent(tabId, value);
    }
  };

  return (
    <div className="monaco-editor-wrapper">
      <Editor
        height="100%"
        path={path}
        defaultLanguage={language}
        defaultValue={content}
        onMount={handleEditorDidMount}
        onChange={handleChange}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          readOnly,
          theme: 'warp-dark',
          automaticLayout: true,
          padding: { top: 10, bottom: 10 },
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
}
