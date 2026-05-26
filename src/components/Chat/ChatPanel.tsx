import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { ChatEmptyState, ChatTopbar } from './layout';
import { useChatPanelController } from './hooks/useChatPanelController';
import { shouldRenderCollapsedBlock } from './utils/timeline';
import { MessageBubble } from './MessageBubble';
import { TerminalBlockCard } from './blocks/TerminalBlockCard';
import { MultiAgentBlock } from './blocks/MultiAgentBlock';
import { CommandApprovalComposer } from '../Composer';
import { ProfileAvatar } from '../App/profile/ProfileAvatar';
import { useProfileSettings } from '../App/settings/useProfileSettings';
import { useLauncherContext } from '../Layout/Launcher/LauncherContext';
import { useEditorStore } from '../../stores/editorStore';
import './ChatPanel.css';
export function ChatPanel() {
  const { launcher } = useLauncherContext();
  const view = launcher.views.chatPanel;
  const controller = useChatPanelController(view);
  const { profile } = useProfileSettings();
  const openFile = useEditorStore((state) => state.openFile);

  return (
    <div className={`chat-region ${view.isOpen ? 'open' : 'closed'}`}>
      <ChatTopbar title={view.title} show={view.emptyStateVariant === 'workspace' && view.showEmptyTopbar} />

      {controller.find.isFindOpen && (
        <div className="chat-finder-overlay">
          <div className="chat-finder-input-container">
            <input
              id="chat-find-input"
              type="text"
              placeholder="Find"
              value={controller.find.searchQuery}
              onChange={(event) => controller.find.setSearchQuery(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    controller.find.selectPreviousMatch();
                  } else {
                    controller.find.selectNextMatch();
                  }
                }
              }}
            />
            <div className="chat-finder-input-actions">
              <button
                type="button"
                className={`chat-finder-toggle-btn ${controller.find.useRegex ? 'active' : ''}`}
                onClick={() => controller.find.setUseRegex(!controller.find.useRegex)}
                title="Use Regular Expression"
              >
                .*
              </button>
              <button
                type="button"
                className={`chat-finder-toggle-btn ${controller.find.caseSensitive ? 'active' : ''}`}
                onClick={() => controller.find.setCaseSensitive(!controller.find.caseSensitive)}
                title="Match Case"
              >
                Aa
              </button>
              <button
                type="button"
                className={`chat-finder-toggle-btn ${controller.find.wholeWord ? 'active' : ''}`}
                onClick={() => controller.find.setWholeWord(!controller.find.wholeWord)}
                title="Match Whole Word"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8V4h4M16 4h4v4M4 16v4h4M16 20h4v-4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="chat-finder-count">
            {controller.find.matchCount > 0 ? `${controller.find.activeIndex + 1}/${controller.find.matchCount}` : '0/0'}
          </div>
          <div className="chat-finder-nav-actions">
            <button
              type="button"
              className="chat-finder-nav-btn"
              onClick={controller.find.selectNextMatch}
              disabled={controller.find.matchCount === 0}
              title="Next Match (Enter)"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="chat-finder-nav-btn"
              onClick={controller.find.selectPreviousMatch}
              disabled={controller.find.matchCount === 0}
              title="Previous Match (Shift+Enter)"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="chat-finder-nav-btn close"
              onClick={controller.find.closeFind}
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {controller.hasContent ? (
        <div ref={controller.scrollRef} className="chat-scroll" onScroll={controller.handleScroll}>
          <div className="chat-spacer" />
          {controller.timelineItems.map((item, itemIndex) => {
            if (item.kind === 'message') {
              return (
                <MessageBubble
                  key={item.id}
                  message={item.message}
                  profile={profile}
                  openFile={openFile}
                  onRequestCommandApproval={view.onRequestCommandApproval}
                />
              );
            }

            if (item.kind === 'terminal-block') {
              const nextItem = itemIndex >= 0 ? controller.timelineItems[itemIndex + 1] : undefined;
              const isExpanded = view.expandedTerminalBlockIds.includes(item.block.id);
              const isSelected = view.selectedTerminalBlockId === item.block.id;
              const isCollapsedBlock = shouldRenderCollapsedBlock(item.block, isExpanded, isSelected);
              const isConversationLink = item.block.presentation === 'conversation-link';
              const hasBottomDivider = item.block.source === 'user' && nextItem?.kind !== 'terminal-block';

              return (
                <div
                  key={item.id}
                  className={[
                    'terminal-block-row',
                    isCollapsedBlock && !isConversationLink ? '' : 'full-bleed',
                    item.block.source === 'user' ? 'user-command' : 'assistant-command',
                    isConversationLink ? 'conversation-link-row' : '',
                    hasBottomDivider ? 'has-bottom-divider' : ''
                  ].filter(Boolean).join(' ')}
                >
                  <div className="role-avatar-container">
                    {item.block.source === 'user' ? <ProfileAvatar profile={profile} size={24} showInitials={Boolean(profile.avatarDataUrl)} /> : null}
                  </div>
                  <TerminalBlockCard
                    block={item.block}
                    isExpanded={isExpanded}
                    isSelected={isSelected}
                    onCollapse={(blockId) => view.onCollapseTerminalBlock?.(blockId)}
                    onExpand={(blockId) => view.onExpandTerminalBlock?.(blockId)}
                    onOpenConversation={view.onOpenConversationBlock}
                    onSelect={(blockId) => view.onSelectTerminalBlock?.(blockId)}
                    workingDirectory={view.workingDirectory}
                  />
                </div>
              );
            }

            if (item.kind === 'multi-agent-block') {
              return (
                <div key={item.id} className="agent-block-row-standalone">
                  <MultiAgentBlock
                    agentName={item.block.agentName}
                    status={item.block.status}
                    taskSummary={item.block.taskSummary}
                    colorScheme={item.block.colorScheme}
                  />
                </div>
              );
            }

            return (
              <div key={item.id} className="terminal-error-row">
                <div className="role-avatar-container" />
                <div className="terminal-inline-error">{item.error}</div>
              </div>
            );
          })}
          {controller.activePendingApproval && (
            <div className="command-approval-row">
              <CommandApprovalComposer
                approval={controller.activePendingApproval}
                onEdit={() => view.onEditPendingApproval?.(controller.activePendingApproval)}
                onSaveEdit={(approval) => view.onSaveEditPendingApproval?.(approval)}
                onReject={(approval) => view.onRejectPendingApproval?.(approval)}
                onAccept={(approval) => view.onAcceptPendingApproval?.(approval)}
                onAutoApprove={(approval) => view.onAutoApprovePendingApproval?.(approval)}
                onStartNewConversation={controller.activePendingApproval.kind === 'topic-change' ? view.onStartNewConversationPendingApproval : undefined}
                onContinueCurrentConversation={controller.activePendingApproval.kind === 'topic-change' ? view.onContinueCurrentConversationPendingApproval : undefined}
              />
            </div>
          )}
        </div>
      ) : (
        <ChatEmptyState variant={view.emptyStateVariant} />
      )}
    </div>
  );
}
