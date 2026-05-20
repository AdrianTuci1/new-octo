/*
** 2026 May 04
**
** The author disclaims copyright to this source code. In place of
** a legal notice, here is a blessing:
**
**    "Everything around you that you call life was made up by people
**    that were no smarter than you. And you can change it, you can
**    influence it... Once you learn that, you'll never be the same again."
**
*************************************************************************
** This file is part of Octomus.
** Staticlabs
*/

import { useMemo } from 'react';
import { ChatPanel } from '../../Chat';
import { ComposerBar, ModelSetupOverlay, TerminalComposer } from '../../Composer';
import { TrayPanel } from '../../Tray';
import { useLauncher, type LauncherProps } from './hooks';
import { COMMAND_ITEMS, HELP_ITEMS, COMPOSER_PLACEHOLDERS } from '../../../lib';

export function Launcher(props: LauncherProps) {
  const launcher = useLauncher(props);
  const modelSetupRequired = launcher.ui.modelSelection.requiresModelSetup;
  const placeholder = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * COMPOSER_PLACEHOLDERS.length);
    return COMPOSER_PLACEHOLDERS[randomIndex];
  }, [launcher.ui.resolvedConversationId]);
  const handleOpenModelSettings = () => {
    launcher.actions.openAppWindow();
    launcher.actions.openModelDrawer();
  };


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
              pendingApproval={launcher.ui.resolvedPendingApproval}
              showEmptyTopbar={launcher.ui.variant === 'workspace' && launcher.store.composerSurface !== 'terminal' && launcher.ui.composerMode !== 'shell'}
              onRefinePendingApproval={launcher.actions.handlePendingApprovalRefine}
              onEditPendingApproval={launcher.actions.handlePendingApprovalEdit}
              onAcceptPendingApproval={launcher.actions.handlePendingApprovalAccept}
              onAutoApprovePendingApproval={launcher.actions.handlePendingApprovalAutoApprove}
              onStartNewConversationPendingApproval={launcher.actions.handlePendingTopicChangeStartNewConversation}
              onContinueCurrentConversationPendingApproval={launcher.actions.handlePendingTopicChangeContinueConversation}
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
          {!modelSetupRequired && !launcher.ui.resolvedPendingApproval && (!launcher.ui.isTerminalSurface || launcher.ui.isTerminalCommandsTrayOpen) && (
            <TrayPanel
              activeConversationId={launcher.ui.resolvedConversationId}
              activeMode={launcher.tray.activeTrayMode}
              commandItems={COMMAND_ITEMS}
              commandSearchQuery={launcher.chat.query}
              selectedCommandIndex={launcher.store.selectedCommandIndex}
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
              onOpenApp={launcher.actions.openAppWindow}
              onOpenModelSettings={launcher.actions.openModelDrawer}
              onConversationSearchChange={launcher.store.setConversationSearchQuery}
              onExitShellMode={() => launcher.store.setModeLock(launcher.chat.query.trim().length > 0 ? 'chat' : null)}
              onHistoryTabChange={launcher.store.setHistoryTab}
              onInsertCommand={(command: string) => {
                launcher.chat.setQuery(`${command} `);
                launcher.tray.closeTray();
              }}
              onModelTabChange={launcher.store.setModelTab}
              onNewConversation={launcher.actions.handleNewConversation}
              onSelectConversation={launcher.actions.handleTrayConversationSelect}
              onSelectHistoryEntry={launcher.actions.handleHistoryEntrySelect}
              onSelectModel={(modelId: string) => launcher.ui.modelSelection.selectModel(modelId, true)}
              shellSource={launcher.terminal.shellSource}
              shellShortcutTokens={launcher.terminal.shellShortcutTokens}
              showOpenInApp={launcher.ui.variant === 'panel'}
              selectedHistoryIndex={launcher.store.selectedHistoryIndex}
              selectedModelId={launcher.ui.modelSelection.selectedModelId}
              selectedModelIndex={launcher.store.selectedModelIndex}
              onToggleCommands={launcher.actions.handleToggleCommands}
              onToggleHelp={() => launcher.tray.toggleTray('help')}
              onToggleConversations={() => launcher.tray.toggleTray('conversations')}
            />
          )}

          {launcher.ui.resolvedPendingApproval ? null : launcher.store.composerSurface === 'terminal' ? (
            <TerminalComposer
              gitBranchMenuOpen={launcher.ui.gitContext.isBranchMenuOpen}
              gitContext={launcher.ui.gitContext.gitContext}
              onLaunchAgentComposer={launcher.actions.launchAgentComposer}
              onOpenCommandsTray={launcher.actions.openCommandsTray}
              onOpenApp={launcher.ui.variant === 'panel' ? launcher.actions.openAppWindow : undefined}
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
              completionState={launcher.terminal.completionState}
              prediction={launcher.ui.activeShellPrediction}
              query={launcher.chat.query}
              recommendedAction={launcher.terminal.terminalComposerAction}
              runtimeNodeVersion={launcher.ui.runtimeContext?.nodeVersion ?? null}
              showOpenInApp={launcher.ui.variant === 'panel'}
              workingDirectory={launcher.ui.workingDirectory.currentPath}
              workingDirectoryLabel={launcher.ui.workingDirectory.buttonLabel}
              workingDirectoryListing={launcher.ui.workingDirectory.listing}
              workingDirectoryPickerOpen={launcher.ui.workingDirectory.isPickerOpen}
              workingDirectorySearch={launcher.ui.workingDirectory.searchQuery}
            />
          ) : modelSetupRequired ? (
            <ModelSetupOverlay
              onBack={() => {
                launcher.actions.closeModelDrawer();
                launcher.store.setComposerSurface('terminal');
                launcher.tray.closeTray();
              }}
              onOpenModelSettings={handleOpenModelSettings}
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
              onToggleModelTray={() => (modelSetupRequired ? launcher.actions.openModelDrawer() : launcher.tray.toggleTray('models'))}
              placeholder={launcher.ui.agentSettings?.input?.showInputHintText === false ? '' : placeholder}
              prediction={launcher.ui.activeShellPrediction}
              query={launcher.chat.query}
              recommendedAction={launcher.ui.recommendedAction}
              selectedModelLabel={launcher.ui.modelSelection.selectedModelLabel}
              terminalAutoDetectEnabled={launcher.store.terminalAutoDetectEnabled && launcher.ui.agentSettings?.enabled !== false && launcher.ui.agentSettings?.input?.autodetectTerminalCommandsInAgent !== false}
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
