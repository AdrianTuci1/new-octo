import { useEffect, useRef } from 'react';
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
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, onClose]);

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

      {isOpen && (
        <div className="working-directory-menu">
          <div className="working-directory-menu-search">
            <input
              ref={searchRef}
              className="working-directory-search-input"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search directories..."
              value={searchQuery}
            />
          </div>

          <div className="working-directory-menu-list" role="listbox">
            {listing?.parentPath && (
              <button
                className="working-directory-item working-directory-parent"
                onClick={onNavigateToParent}
                type="button"
              >
                <ArrowUp size={14} />
                <span>.. (Parent Directory)</span>
              </button>
            )}

            {listing?.entries.map((entry) => (
              <button
                key={entry.path}
                className={`working-directory-item ${entry.path === currentPath ? 'active' : ''}`}
                onClick={() => onSelectDirectory(entry.path)}
                type="button"
              >
                <Folder size={14} />
                <span>{entry.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
