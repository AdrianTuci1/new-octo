import { AlertTriangle, Check, Rocket, X } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import type { WorkspaceChromeTab } from './workspaceChromeTypes';

type WorkspaceTopbarTabProps = {
  tab: WorkspaceChromeTab;
  isActive: boolean;
  isInLauncher: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onOpenContextMenu: (tabId: string, element: HTMLElement) => void;
};

export function WorkspaceTopbarTab({
  tab,
  isActive,
  isInLauncher,
  onSelect,
  onClose,
  onOpenContextMenu
}: WorkspaceTopbarTabProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(tab.id);
    }
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    onOpenContextMenu(tab.id, event.currentTarget);
  };

  return (
    <div
      className={`workspace-tab ${isActive ? 'active' : ''} ${isInLauncher ? 'launcher-bound' : ''}`}
      style={{
        '--tab-tint': tab.tintColor ?? 'transparent'
      } as CSSProperties}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(tab.id)}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      <div className="workspace-tab-icons-container">
        {isInLauncher && (
          <div className="workspace-tab-icon-box launcher-icon" title="In launcher">
            <Rocket size={9} className="workspace-tab-rocket-icon" />
          </div>
        )}
        {tab.lastExecutionStatus && ['completed', 'cancelled', 'failed'].includes(tab.lastExecutionStatus) && (
          <div className={`workspace-tab-icon-box status-${tab.lastExecutionStatus}`} title={`Last status: ${tab.lastExecutionStatus}`}>
            {tab.lastExecutionStatus === 'completed' && <Check size={9} />}
            {tab.lastExecutionStatus === 'cancelled' && <X size={9} />}
            {tab.lastExecutionStatus === 'failed' && <AlertTriangle size={9} />}
          </div>
        )}
      </div>
      <span className="workspace-tab-label">{tab.label}</span>
      <button
        className="workspace-tab-close"
        type="button"
        aria-label={`Close ${tab.label}`}
        onClick={(event) => {
          event.stopPropagation();
          onClose(tab.id);
        }}
      >
        <X size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
