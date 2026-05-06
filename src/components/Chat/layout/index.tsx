import { ArrowLeft } from 'lucide-react';

type EmptyStateVariant = 'default' | 'workspace';

export type ChatEmptyStateProps = {
  variant?: EmptyStateVariant;
};

export function ChatEmptyState({ variant = 'default' }: ChatEmptyStateProps) {
  if (variant === 'workspace') {
    return <div className="chat-empty chat-empty-workspace" />;
  }

  return (
    <div className="chat-empty" />
  );
}

export type ChatTopbarProps = {
  title?: string;
  show: boolean;
};

export function ChatTopbar({ title = 'New agent conversation', show }: ChatTopbarProps) {
  if (!show) return null;

  return (
    <div className="chat-empty-topbar">
      <div className="chat-empty-topbar-leading">
        <span className="chat-empty-topbar-arrow"><ArrowLeft size={12} /> </span>
        <kbd className="chat-empty-topbar-key">esc</kbd>
        <span>for terminal</span>
      </div>
      <div className="chat-empty-topbar-title">{title}</div>
    </div>
  );
}
