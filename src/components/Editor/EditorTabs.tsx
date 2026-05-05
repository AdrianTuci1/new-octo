import { X } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';

export function EditorTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore();

  if (tabs.length === 0) return null;

  return (
    <div className="editor-tabs">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`editor-tab ${activeTabId === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="tab-name">{tab.name}</span>
          {tab.isDirty && <div className="tab-dirty" />}
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
