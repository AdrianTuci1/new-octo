import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch } from 'lucide-react';

type GitBranchPickerProps = {
  branches: string[];
  currentBranch: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectBranch: (branch: string) => void;
  onToggle: () => void;
};

export function GitBranchPicker({
  branches,
  currentBranch,
  isOpen,
  onClose,
  onSelectBranch,
  onToggle
}: GitBranchPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = 220;
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

  return (
    <div ref={rootRef} className="git-branch-picker">
      <button
        className="toolbar-chip git-branch-chip"
        onClick={onToggle}
        type="button"
        title={`Git branch: ${currentBranch}`}
      >
        <GitBranch size={12} />
        <span>{currentBranch}</span>
      </button>

      {isOpen && createPortal(
        <div ref={menuRef} className="git-branch-menu" style={menuStyle}>
          <div className="git-branch-menu-list">
            {branches.map((branch) => (
              <button
                key={branch}
                className={`git-branch-item ${branch === currentBranch ? 'active' : ''}`}
                onClick={() => onSelectBranch(branch)}
                type="button"
              >
                <GitBranch size={12} />
                <span>{branch}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
