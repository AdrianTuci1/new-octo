import { ChevronRight, Folder, Save } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { invoke } from '@tauri-apps/api/core';

export function EditorHeader() {
  const { tabs, activeTabId, setDirty } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) return null;

  const pathParts = activeTab.path.split('/').filter(Boolean);
  const fileName = pathParts.pop();

  const handleSave = async () => {
    if (!activeTab || !activeTab.content) return;
    
    try {
      await invoke('terminal_write_file', {
        request: {
          path: activeTab.path,
          content: activeTab.content
        }
      });
      setDirty(activeTab.id, false);
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  return (
    <div className="editor-header">
      <div className="breadcrumbs">
        <Folder size={12} />
        {pathParts.slice(-3).map((part, i) => (
          <div key={i} className="breadcrumb-item">
            <span>{part}</span>
            <ChevronRight size={10} />
          </div>
        ))}
        <div className="breadcrumb-item">
          <span>{fileName}</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {activeTab.isDirty && (
        <button className="editor-save-btn" onClick={handleSave}>
          <Save size={14} />
          <span>Save</span>
        </button>
      )}
    </div>
  );
}
