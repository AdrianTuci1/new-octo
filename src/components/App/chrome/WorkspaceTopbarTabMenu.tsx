import type { CSSProperties } from 'react';
import type { WorkspaceChromeTab } from './workspaceChromeTypes';

const TAB_TINTS = ['#334155', '#134e4a', '#365314', '#7c2d12', '#6b21a8', '#1d4ed8'];

type WorkspaceTopbarTabMenuProps = {
  tab: WorkspaceChromeTab | null;
  tabIndex: number;
  tabsLength: number;
  launcherTabId: string | null;
  position: { left: number; top: number } | null;
  onClose: () => void;
  onBringTabInLauncher: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onMoveTab: (tabId: string, direction: 'left' | 'right') => void;
  onCloseTab: (tabId: string) => void;
  onRemoveTabFromLauncher: (tabId: string) => void;
  onRenameTab: (tabId: string, label?: string | null) => void;
  onSaveTabAsConfig: (tabId: string) => void;
  onSetTabTint: (tabId: string, tintColor: string | null) => void;
};

const renderTintSwatches = (tab: WorkspaceChromeTab, onSetTabTint: WorkspaceTopbarTabMenuProps['onSetTabTint']) => (
  <div className="workspace-topbar-tab-menu-swatches">
    <button
      className={`workspace-topbar-swatch workspace-topbar-swatch-clear ${tab.tintColor ? '' : 'selected'}`}
      type="button"
      onClick={() => onSetTabTint(tab.id, null)}
      aria-label="Disable tab color"
    />
    {TAB_TINTS.map((color) => (
      <button
        key={color}
        className={`workspace-topbar-swatch ${tab.tintColor === color ? 'selected' : ''}`}
        type="button"
        style={{ '--swatch-color': color } as CSSProperties}
        onClick={() => onSetTabTint(tab.id, color)}
        aria-label={`Set tab color ${color}`}
      />
    ))}
  </div>
);

export function WorkspaceTopbarTabMenu({
  tab,
  tabIndex,
  tabsLength,
  launcherTabId,
  position,
  onClose,
  onBringTabInLauncher,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onMoveTab,
  onCloseTab,
  onRemoveTabFromLauncher,
  onRenameTab,
  onSaveTabAsConfig,
  onSetTabTint
}: WorkspaceTopbarTabMenuProps) {
  if (!tab || !position) {
    return null;
  }

  const canMoveLeft = tabIndex > 0;
  const canMoveRight = tabIndex >= 0 && tabIndex < tabsLength - 1;
  const canCloseOthers = tabsLength > 1;
  const canRename = tab.kind !== 'settings';

  const handleSelect = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div
      className="workspace-topbar-tab-menu"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`
      }}
    >
      <button
        type="button"
        onClick={() => handleSelect(() => {
          if (launcherTabId === tab.id) {
            onRemoveTabFromLauncher(tab.id);
          } else {
            onBringTabInLauncher(tab.id);
          }
        })}
      >
        {launcherTabId === tab.id ? 'Remove from launcher' : 'Bring in launcher'}
      </button>
      {canRename && (
        <button type="button" onClick={() => handleSelect(() => onRenameTab(tab.id))}>
          Rename tab
        </button>
      )}
      {canMoveLeft && (
        <button type="button" onClick={() => handleSelect(() => onMoveTab(tab.id, 'left'))}>
          Move tab left
        </button>
      )}
      {canMoveRight && (
        <button type="button" onClick={() => handleSelect(() => onMoveTab(tab.id, 'right'))}>
          Move tab right
        </button>
      )}
      <button type="button" onClick={() => handleSelect(() => onCloseTab(tab.id))}>
        Close tab
      </button>
      {canCloseOthers && (
        <button type="button" onClick={() => handleSelect(() => onCloseOtherTabs(tab.id))}>
          Close other tabs
        </button>
      )}
      {canMoveRight && (
        <button type="button" onClick={() => handleSelect(() => onCloseTabsToRight(tab.id))}>
          Close tabs to the right
        </button>
      )}
      <button type="button" onClick={() => handleSelect(() => onSaveTabAsConfig(tab.id))}>
        Save as new config
      </button>
      {renderTintSwatches(tab, onSetTabTint)}
    </div>
  );
}
