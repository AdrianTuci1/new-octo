import { memo } from 'react';
import { ChatPanelFacade } from './chatPanel/ChatPanelFacade';
import type { LauncherViewModel } from '../Layout/Launcher/hooks';
import './ChatPanel.css';

type ChatPanelProps = {
  view: LauncherViewModel['views']['chatPanel'];
};

export const ChatPanel = memo(function ChatPanel({ view }: ChatPanelProps) {
  return <ChatPanelFacade view={view} />;
});
