import { useMemo } from 'react';
import type { LauncherViewModel } from '../../Layout/Launcher/hooks';
import { MOCK_PENDING_APPROVAL, MOCK_TIMELINE_ITEMS } from '../MockTimelineItems';
import { useChatPanelFind } from './useChatPanelFind';
import { useChatPanelScroll } from './useChatPanelScroll';
import { buildTimelineItems } from '../utils/timeline';

const USE_MOCK = false; // Set to true only while tuning the mocked chat timeline

type ChatPanelView = LauncherViewModel['views']['chatPanel'];

export function useChatPanelController(view: ChatPanelView) {
  const baseTimelineItems = useMemo(
    () => buildTimelineItems(view.messages, view.terminalBlocks, view.terminalError),
    [view.messages, view.terminalBlocks, view.terminalError]
  );
  const timelineItems = USE_MOCK ? MOCK_TIMELINE_ITEMS : baseTimelineItems;
  const activePendingApproval = USE_MOCK ? MOCK_PENDING_APPROVAL : view.pendingApproval;
  const hasContent = USE_MOCK
    || view.messages.length > 0
    || view.terminalBlocks.length > 0
    || Boolean(view.terminalError)
    || Boolean(activePendingApproval);

  const { scrollRef, handleScroll } = useChatPanelScroll({
    messages: view.messages,
    terminalBlocks: view.terminalBlocks,
    terminalError: view.terminalError,
    pendingApproval: activePendingApproval,
    isOpen: view.isOpen,
    expandedTerminalBlockIds: view.expandedTerminalBlockIds,
    selectedTerminalBlockId: view.selectedTerminalBlockId
  });
  const find = useChatPanelFind({
    scrollRef,
    messages: view.messages,
    terminalBlocks: view.terminalBlocks,
    pendingApproval: activePendingApproval
  });

  return {
    activePendingApproval,
    find,
    handleScroll,
    hasContent,
    scrollRef,
    timelineItems
  };
}
