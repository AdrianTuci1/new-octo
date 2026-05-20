import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { configureWarpDarkTheme } from './monacoTheme';

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
    configureWarpDarkTheme(monaco);
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
