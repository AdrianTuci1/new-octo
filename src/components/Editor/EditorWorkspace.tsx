import { Code2 } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { EditorTabs } from './EditorTabs';
import { EditorHeader } from './EditorHeader';
import { MonacoEditor } from './MonacoEditor';
import './Editor.css';

export function EditorWorkspace() {
  const { tabs, activeTabId } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="editor-workspace">
      <EditorTabs />
      {activeTab && <EditorHeader />}
      
      <div className="editor-container">
        {activeTab ? (
          <MonacoEditor 
            key={activeTab.id} 
            tabId={activeTab.id}
            path={activeTab.path}
            content={activeTab.content || ''}
            language={activeTab.language || 'plaintext'}
          />
        ) : (
          <div className="editor-empty">
            <Code2 size={64} className="editor-empty-icon" />
            <div className="editor-empty-text">Select a file to edit</div>
          </div>
        )}
      </div>
    </div>
  );
}
