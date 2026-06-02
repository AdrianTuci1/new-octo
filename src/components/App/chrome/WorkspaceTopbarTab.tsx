import { AlertTriangle, Check, Rocket, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent } from 'react';
import type { WorkspaceChromeTab } from './workspaceChromeTypes';

type WorkspaceTopbarTabProps = {
  tab: WorkspaceChromeTab;
  isActive: boolean;
  isInLauncher: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onRename: (tabId: string, label: string | null) => void;
  onOpenContextMenu: (tabId: string, element: HTMLElement) => void;
  onDragStart: (tabId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (tabId: string, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (tabId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  isDragging?: boolean;
};

export function WorkspaceTopbarTab({
  tab,
  isActive,
  isInLauncher,
  onSelect,
  onClose,
  onRename,
  onOpenContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging = false
}: WorkspaceTopbarTabProps) {
  const canRename = tab.kind !== 'settings';
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(tab.customLabel?.trim() || tab.label);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftLabel(tab.customLabel?.trim() || tab.label);
    }
  }, [isEditing, tab.customLabel, tab.label]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const beginEditing = (event?: MouseEvent<HTMLElement>) => {
    event?.stopPropagation();
    if (!canRename) {
      return;
    }
    setDraftLabel(tab.customLabel?.trim() || tab.label);
    setIsEditing(true);
  };

  const commitEditing = () => {
    const normalized = draftLabel.trim();
    onRename(tab.id, normalized.length > 0 ? normalized : null);
    setIsEditing(false);
  };

  const cancelEditing = () => {
    setDraftLabel(tab.customLabel?.trim() || tab.label);
    setIsEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEditing) {
      return;
    }

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
      className={`workspace-tab ${isActive ? 'active' : ''} ${isInLauncher ? 'launcher-bound' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        '--tab-tint': tab.tintColor ?? 'transparent'
      } as CSSProperties}
      role="button"
      tabIndex={0}
      draggable={!isEditing}
      onClick={() => onSelect(tab.id)}
      onDoubleClick={canRename ? beginEditing : undefined}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      onDragStart={(event) => onDragStart(tab.id, event)}
      onDragOver={(event) => onDragOver(tab.id, event)}
      onDrop={(event) => onDrop(tab.id, event)}
      onDragEnd={onDragEnd}
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
      <span className="workspace-tab-text">
        {isEditing ? (
          <input
            ref={inputRef}
            className="workspace-tab-label-input"
            type="text"
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={commitEditing}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitEditing();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelEditing();
              }
            }}
          />
        ) : (
          <button
            className="workspace-tab-label-button"
            type="button"
            title={canRename ? 'Rename tab' : tab.label}
            onClick={canRename ? beginEditing : undefined}
          >
            <span className="workspace-tab-label">{tab.label}</span>
            {tab.subtitle ? <span className="workspace-tab-subtitle">{tab.subtitle}</span> : null}
          </button>
        )}
      </span>
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
