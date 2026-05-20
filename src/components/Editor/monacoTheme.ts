export function configureWarpDarkTheme(monaco: any) {
  monaco.editor.defineTheme('warp-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'type', foreground: '8be9fd' },
      { token: 'function', foreground: '50fa7b' }
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
      'editorIndentGuide.activeBackground': '#222222'
    }
  });

  monaco.editor.setTheme('warp-dark');
}
