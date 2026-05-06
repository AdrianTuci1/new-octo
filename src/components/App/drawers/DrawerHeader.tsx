import type { ReactNode } from 'react';
import './DrawerFrame.css';

type DrawerHeaderProps = {
  title: string;
  action?: ReactNode;
  className?: string;
};

export function DrawerHeader({ title, action, className }: DrawerHeaderProps) {
  return (
    <header className={`app-window-drawer-header${className ? ` ${className}` : ''}`}>
      <div className="app-window-drawer-header-spacer" />
      <div className="app-window-drawer-header-title">{title}</div>
      <div className="app-window-drawer-header-action">
        {action}
      </div>
    </header>
  );
}
