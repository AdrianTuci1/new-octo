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
  const lastMessage = view.messages.at(-1);
  const lastTerminalBlock = view.terminalBlocks.at(-1);
  const scrollSignal = useMemo(() => [
    view.messages.length,
    lastMessage?.id ?? '',
    lastMessage?.body.length ?? 0,
    lastMessage?.status ?? '',
    view.terminalBlocks.length,
    lastTerminalBlock?.id ?? '',
    lastTerminalBlock?.output.length ?? 0,
    lastTerminalBlock?.status ?? '',
    view.terminalError ?? '',
    view.expandedTerminalBlockIds.join(','),
    view.selectedTerminalBlockId ?? ''
  ].join('|'), [
    lastMessage?.body.length,
    lastMessage?.id,
    lastMessage?.status,
    lastTerminalBlock?.id,
    lastTerminalBlock?.output.length,
    lastTerminalBlock?.status,
    view.expandedTerminalBlockIds,
    view.messages.length,
    view.selectedTerminalBlockId,
    view.terminalBlocks.length,
    view.terminalError
  ]);
  const findDocumentRevision = useMemo(() => [
    scrollSignal,
    activePendingApproval?.kind ?? '',
    activePendingApproval && 'toolCallId' in activePendingApproval ? activePendingApproval.toolCallId ?? '' : '',
    activePendingApproval && 'command' in activePendingApproval ? activePendingApproval.command : ''
  ].join('|'), [activePendingApproval, scrollSignal]);
  const hasContent = USE_MOCK
    || view.messages.length > 0
    || view.terminalBlocks.length > 0
    || Boolean(view.terminalError)
    || Boolean(activePendingApproval);

  const { scrollRef, handleScroll } = useChatPanelScroll({
    scrollSignal,
    hasPendingApproval: Boolean(activePendingApproval),
    isOpen: view.isOpen,
  });
  const find = useChatPanelFind({
    scrollRef,
    documentRevision: findDocumentRevision
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
