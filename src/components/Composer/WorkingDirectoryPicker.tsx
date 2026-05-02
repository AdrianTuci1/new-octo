import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Folder, FolderOpen } from 'lucide-react';
import type { FilesystemDirectoryListing } from '../../types/filesystem';

type WorkingDirectoryPickerProps = {
  currentPath: string | null;
  buttonLabel: string;
  isOpen: boolean;
  listing: FilesystemDirectoryListing | null;
  isCompact?: boolean;
  searchQuery: string;
  onClose: () => void;
  onNavigateToParent: () => void;
  onSearchQueryChange: (value: string) => void;
  onSelectDirectory: (path: string) => void;
  onToggle: () => void;
};

type WorkingDirectoryAction =
  | { kind: 'parent' }
  | { kind: 'directory'; path: string; name: string; isActive: boolean };

export function WorkingDirectoryPicker({
  currentPath,
  buttonLabel,
  isOpen,
  listing,
  isCompact = false,
  searchQuery,
  onClose,
  onNavigateToParent,
  onSearchQueryChange,
  onSelectDirectory,
  onToggle
}: WorkingDirectoryPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const actions = useMemo<WorkingDirectoryAction[]>(() => {
    const nextActions: WorkingDirectoryAction[] = [];
    if (listing?.parentPath) {
      nextActions.push({ kind: 'parent' });
    }

    for (const entry of listing?.entries ?? []) {
      nextActions.push({
        kind: 'directory',
        path: entry.path,
        name: entry.name,
        isActive: entry.path === currentPath
      });
    }

    return nextActions;
  }, [currentPath, listing?.entries, listing?.parentPath]);

  useEffect(() => {
    setActiveIndex(0);
  }, [listing?.currentPath, searchQuery]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchRef.current?.focus();

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = Math.min(520, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.left),
        window.innerWidth - width - 12
      );

      setMenuStyle({
        width,
        left,
        bottom: Math.max(16, window.innerHeight - rect.top + 8)
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onClose();
      }
    };

    updatePosition();
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, onClose]);

  const triggerAction = (action: WorkingDirectoryAction | undefined) => {
    if (!action) {
      return;
    }

    if (action.kind === 'parent') {
      onNavigateToParent();
      return;
    }

    onSelectDirectory(action.path);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, actions.length - 1)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      triggerAction(actions[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} className="working-directory-picker">
      <button
        className={`working-directory-button ${isCompact ? 'compact' : ''}`}
        onClick={onToggle}
        title={currentPath ?? 'Working directory'}
        type="button"
      >
        <FolderOpen size={12} />
        <span className="working-directory-label">{buttonLabel}</span>
      </button>

      {isOpen && createPortal(
        <div ref={menuRef} className="working-directory-menu" style={menuStyle}>
          <div className="working-directory-menu-search">
            <input
              ref={searchRef}
              className="working-directory-search-input"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search directories..."
              value={searchQuery}
            />
          </div>

          <div className="working-directory-menu-list" role="listbox">
            {actions.map((action, index) => {
              if (action.kind === 'parent') {
                return (
                  <button
                    key="parent"
                    className={`working-directory-item working-directory-parent ${activeIndex === index ? 'active' : ''}`}
                    onClick={() => onNavigateToParent()}
                    onMouseEnter={() => setActiveIndex(index)}
                    type="button"
                  >
                    <ArrowUp size={12} />
                    <span>.. (Parent Directory)</span>
                  </button>
                );
              }

              return (
                <button
                  key={action.path}
                  className={`working-directory-item ${action.isActive ? 'selected' : ''} ${activeIndex === index ? 'active' : ''}`}
                  onClick={() => onSelectDirectory(action.path)}
                  onMouseEnter={() => setActiveIndex(index)}
                  type="button"
                >
                  <Folder size={12} />
                  <span>{action.name}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
