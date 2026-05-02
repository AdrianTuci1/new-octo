import { ChevronRight, Search } from 'lucide-react';
import './SettingsSidebar.css';
import { settingsSidebarItems, type SettingsSidebarItem } from './settingsData';

type SettingsSidebarProps = {
  activeSectionId: string;
  expandedGroupIds: string[];
  onSelectSection: (sectionId: string) => void;
  onToggleGroup: (groupId: string) => void;
};

function renderSidebarItem(
  item: SettingsSidebarItem,
  activeSectionId: string,
  expandedGroupIds: string[],
  onSelectSection: (sectionId: string) => void,
  onToggleGroup: (groupId: string) => void,
  depth = 0
) {
  if (item.kind === 'heading') {
    return (
      <div key={`heading-${item.label}`} className="settings-nav-heading">
        {item.label}
      </div>
    );
  }

  if (item.kind === 'leaf') {
    const isActive = item.id === activeSectionId;
    return (
      <button
        key={item.id}
        className={`settings-nav-item ${isActive ? 'active' : ''}`}
        type="button"
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        onClick={() => onSelectSection(item.id)}
      >
        <span className="settings-nav-label">{item.label}</span>
      </button>
    );
  }

  const isExpanded = expandedGroupIds.includes(item.id);

  return (
    <div key={item.id} className="settings-nav-group">
      <button
        className="settings-nav-group-header"
        type="button"
        onClick={() => onToggleGroup(item.id)}
      >
        <span className="settings-nav-label">{item.label}</span>
        <ChevronRight
          size={14}
          className={`settings-nav-chevron ${isExpanded ? 'expanded' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isExpanded && (
        <div className="settings-nav-group-children">
          {item.children.map((child) =>
            renderSidebarItem(child, activeSectionId, expandedGroupIds, onSelectSection, onToggleGroup, depth + 1)
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsSidebar({
  activeSectionId,
  expandedGroupIds,
  onSelectSection,
  onToggleGroup
}: SettingsSidebarProps) {
  return (
    <aside className="settings-sidebar">

      <label className="settings-search">
        <Search size={14} className="settings-search-icon" aria-hidden="true" />
        <input aria-label="Search settings" placeholder="Search" />
      </label>

      <nav className="settings-nav" aria-label="Settings sections">
        {settingsSidebarItems.map((item) =>
          renderSidebarItem(item, activeSectionId, expandedGroupIds, onSelectSection, onToggleGroup)
        )}
      </nav>

      <div className="settings-sidebar-footer">
        <button className="settings-muted-button" type="button">
          Open settings file
        </button>
      </div>
    </aside>
  );
}
