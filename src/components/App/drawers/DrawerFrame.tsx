import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import './DrawerFrame.css';

type DrawerFrameProps = {
  children: ReactNode;
  className?: string;
  width: number;
  isResizing?: boolean;
  onResizeStart?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  zIndex?: number;
};

export function DrawerFrame({
  children,
  className,
  width,
  isResizing = false,
  onResizeStart,
  zIndex
}: DrawerFrameProps) {
  return (
    <div
      className={`app-window-drawer-wrapper${className ? ` ${className}` : ''}`}
      style={{
        width,
        transition: isResizing ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex
      }}
    >
      {onResizeStart && <div className="resize-handle drawer-handle" onMouseDown={onResizeStart} />}
      <div className="app-window-drawer">
        {children}
      </div>
    </div>
  );
}
