import { ChatPanel } from '../../Chat';
import { CommandApprovalComposer, ComposerBar, TerminalComposer } from '../../Composer';
import { TrayPanel } from '../../Tray';
import { useLauncher, type LauncherProps } from './hooks';
import { COMMAND_ITEMS, HELP_ITEMS } from '../../../lib';

export function Launcher(props: LauncherProps) {
  const launcher = useLauncher(props);


  return (
    <main className={launcher.ui.launcherRootClassName}>
      <section
        ref={launcher.terminal.shellRef}
        className={launcher.ui.launcherShellClassName}
      >
        {launcher.ui.isChatOpen && (
          <div className="chat-stack">
            <ChatPanel
              emptyStateVariant={launcher.ui.variant === 'workspace' ? 'workspace' : 'default'}
              isOpen={true}
              messages={launcher.ui.activeMessages}
              showEmptyTopbar={launcher.ui.variant === 'workspace' && launcher.store.composerSurface !== 'terminal' && launcher.ui.composerMode !== 'shell'}
              expandedTerminalBlockIds={launcher.store.composerSurface === 'agent' ? launcher.terminal.agentTerminal.expandedBlockIds : launcher.terminal.terminal.expandedBlockIds}
              onCollapseTerminalBlock={launcher.store.composerSurface === 'agent' ? launcher.terminal.agentTerminal.collapseBlock : launcher.terminal.terminal.collapseBlock}
              onExpandTerminalBlock={launcher.store.composerSurface === 'agent' ? launcher.terminal.agentTerminal.expandBlock : launcher.terminal.terminal.expandBlock}
              onOpenConversationBlock={launcher.actions.openConversationFromBlock}
              onRequestCommandApproval={launcher.actions.requestCommandApproval}
              onSelectTerminalBlock={launcher.store.composerSurface === 'agent' ? launcher.terminal.agentTerminal.setSelectedBlockId : launcher.terminal.terminal.setSelectedBlockId}
              selectedTerminalBlockId={launcher.store.composerSurface === 'agent' ? launcher.terminal.agentTerminal.selectedBlockId : launcher.terminal.terminal.selectedBlockId}
              terminalBlocks={launcher.terminal.activeTimelineBlocks}
              terminalError={launcher.terminal.activeTimelineError}
              title={props.title}
            />
          </div>
        )}

        <div ref={launcher.ui.dockRef} className="dock-stack">
          {(!launcher.ui.isTerminalSurface || launcher.ui.isTerminalCommandsTrayOpen) && (
            <TrayPanel
              activeConversationId={launcher.ui.resolvedConversationId}
              activeMode={launcher.tray.activeTrayMode}
              commandItems={COMMAND_ITEMS}
              conversationSearchQuery={launcher.store.conversationSearchQuery}
              conversations={launcher.ui.visibleTrayConversations}
              helpItems={HELP_ITEMS}
              historyEntries={launcher.history.historyEntries}
              historyTab={launcher.store.historyTab}
              inputMode={launcher.ui.composerMode}
              isOpen={launcher.tray.isTrayOpen}
              showFooter={!launcher.ui.isTerminalSurface || launcher.tray.activeTrayMode === 'commands'}
              modelTab={launcher.store.modelTab}
              modelEntries={launcher.ui.visibleModels}
              onConversationSearchChange={launcher.store.setConversationSearchQuery}
              onExitShellMode={() => launcher.store.setModeLock(launcher.chat.query.trim().length > 0 ? 'chat' : null)}
              onHistoryTabChange={launcher.store.setHistoryTab}
              onInsertCommand={(command: string) => launcher.chat.setQuery(`${command} `)}
              onModelTabChange={launcher.store.setModelTab}
              onNewConversation={launcher.actions.handleNewConversation}
              onSelectConversation={launcher.actions.handleTrayConversationSelect}
              onSelectHistoryEntry={launcher.actions.handleHistoryEntrySelect}
              onSelectModel={(modelId: string) => launcher.ui.modelSelection.selectModel(modelId, false)}
              shellSource={launcher.terminal.shellSource}
              shellShortcutTokens={launcher.terminal.shellShortcutTokens}
              selectedHistoryIndex={launcher.store.selectedHistoryIndex}
              selectedModelId={launcher.ui.modelSelection.selectedModelId}
              selectedModelIndex={launcher.store.selectedModelIndex}
              onToggleCommands={launcher.actions.handleToggleCommands}
              onToggleHelp={() => launcher.tray.toggleTray('help')}
              onToggleConversations={() => launcher.tray.toggleTray('conversations')}
            />
          )}

          {launcher.ui.resolvedPendingApproval ? (
            <CommandApprovalComposer
              approval={launcher.ui.resolvedPendingApproval}
              onEdit={launcher.actions.handleCommandApprovalEdit}
              onReject={launcher.actions.handleCommandApprovalReject}
              onRun={launcher.actions.handleCommandApprovalRun}
            />
          ) : launcher.store.composerSurface === 'terminal' ? (
            <TerminalComposer
              gitBranchMenuOpen={launcher.ui.gitContext.isBranchMenuOpen}
              gitContext={launcher.ui.gitContext.gitContext}
              onLaunchAgentComposer={launcher.actions.launchAgentComposer}
              onOpenCommandsTray={launcher.actions.openCommandsTray}
              onCloseGitBranchMenu={() => launcher.ui.gitContext.setIsBranchMenuOpen(false)}
              onCloseWorkingDirectoryPicker={launcher.ui.workingDirectory.closePicker}
              onHeightChange={() => { }}
              onKeyDown={launcher.actions.handleComposerKeyDown}
              onNavigateToParentDirectory={launcher.ui.workingDirectory.navigateToParent}
              onQueryChange={launcher.actions.handleTerminalQueryChange}
              onRecommendedActionClick={launcher.actions.handleTerminalRecommendationClick}
              onSelectGitBranch={launcher.ui.gitContext.switchBranch}
              onSelectWorkingDirectory={launcher.ui.workingDirectory.selectDirectory}
              onToggleGitBranchMenu={launcher.ui.gitContext.toggleBranchMenu}
              onToggleWorkingDirectoryPicker={launcher.ui.workingDirectory.togglePicker}
              onWorkingDirectorySearchChange={launcher.ui.workingDirectory.setSearchQuery}
              query={launcher.chat.query}
              recommendedAction={launcher.terminal.terminalComposerAction}
              runtimeNodeVersion={launcher.ui.runtimeContext?.nodeVersion ?? null}
              workingDirectory={launcher.ui.workingDirectory.currentPath}
              workingDirectoryLabel={launcher.ui.workingDirectory.buttonLabel}
              workingDirectoryListing={launcher.ui.workingDirectory.listing}
              workingDirectoryPickerOpen={launcher.ui.workingDirectory.isPickerOpen}
              workingDirectorySearch={launcher.ui.workingDirectory.searchQuery}
            />
          ) : (
            <ComposerBar
              mode={launcher.ui.composerMode}
              shellSource={launcher.terminal.shellSource}
              gitBranchMenuOpen={launcher.ui.gitContext.isBranchMenuOpen}
              gitContext={launcher.ui.gitContext.gitContext}
              onCloseGitBranchMenu={() => launcher.ui.gitContext.setIsBranchMenuOpen(false)}
              onKeyDown={launcher.actions.handleComposerKeyDown}
              onHeightChange={() => { }}
              onQueryChange={launcher.actions.handleComposerQueryChange}
              onRecommendedActionClick={launcher.actions.handleComposerRecommendationClick}
              onCloseWorkingDirectoryPicker={launcher.ui.workingDirectory.closePicker}
              onSelectGitBranch={launcher.ui.gitContext.switchBranch}
              onNavigateToParentDirectory={launcher.ui.workingDirectory.navigateToParent}
              onToggleGitBranchMenu={launcher.ui.gitContext.toggleBranchMenu}
              onToggleModelTray={() => launcher.tray.toggleTray('models')}
              placeholder="Octomus anything e.g. Find and fix race conditions in my Python application"
              prediction={launcher.ui.activeShellPrediction}
              query={launcher.chat.query}
              recommendedAction={launcher.ui.recommendedAction}
              selectedModelLabel={launcher.ui.modelSelection.selectedModel.label}
              terminalAutoDetectEnabled={launcher.store.terminalAutoDetectEnabled}
              workingDirectory={launcher.ui.workingDirectory.currentPath}
              workingDirectoryLabel={launcher.ui.workingDirectory.buttonLabel}
              workingDirectoryListing={launcher.ui.workingDirectory.listing}
              workingDirectoryPickerOpen={launcher.ui.workingDirectory.isPickerOpen}
              workingDirectorySearch={launcher.ui.workingDirectory.searchQuery}
              onSelectWorkingDirectory={launcher.ui.workingDirectory.selectDirectory}
              onToggleTerminalAutoDetect={launcher.actions.handleToggleTerminalAutoDetect}
              onToggleWorkingDirectoryPicker={launcher.ui.workingDirectory.togglePicker}
              onWorkingDirectorySearchChange={launcher.ui.workingDirectory.setSearchQuery}
              onToggleSingleCharacterPrediction={() => launcher.store.setAllowSingleCharacterCommandPrediction(!launcher.store.allowSingleCharacterCommandPrediction)}
            />
          )}
        </div>
      </section>
    </main>
  );
}
