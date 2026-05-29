import { memo } from 'react';
import './TrayPanel.css';
import { Command } from 'lucide-react';
import { TrayCommands } from './TrayCommands';
import { TrayConversations, type TrayConversationEntry } from './TrayConversations';
import { TrayFooter } from './TrayFooter';
import { TrayHelp } from './TrayHelp';
import { TrayHistory } from './TrayHistory';
import { TrayModels } from './TrayModels';
import type { LauncherViewModel } from '../Layout/Launcher/hooks';

type TrayPanelProps = {
  view: LauncherViewModel['views']['trayPanel'];
};

export const TrayPanel = memo(function TrayPanel({ view }: TrayPanelProps) {

  return (
    <div className={`tray-region ${view.isOpen ? 'open' : 'closed'}`}>
      <div className="tray-body">
        {view.activeMode === 'help' && <TrayHelp items={view.helpItems} />}
        {view.activeMode === 'commands' && (
          <TrayCommands
            items={view.commandItems}
            query={view.commandSearchQuery}
            selectedIndex={view.selectedCommandIndex}
            onInsertCommand={view.onInsertCommand}
          />
        )}
        {view.activeMode === 'history' && (
          <TrayHistory
            activeTab={view.historyTab}
            entries={view.historyEntries}
            onSelectEntry={view.onSelectHistoryEntry}
            onTabChange={view.onHistoryTabChange}
            selectedIndex={view.selectedHistoryIndex}
          />
        )}
        {view.activeMode === 'models' && (
          <TrayModels
            activeTab={view.modelTab}
            models={view.modelEntries}
            onOpenModelSettings={view.onOpenModelSettings}
            onSelectModel={view.onSelectModel}
            onTabChange={view.onModelTabChange}
            selectedIndex={view.selectedModelIndex}
            selectedModelId={view.selectedModelId}
          />
        )}
        {view.activeMode === 'conversations' && (
          <TrayConversations
            activeConversationId={view.activeConversationId}
            conversations={view.conversations}
            searchQuery={view.conversationSearchQuery}
            onNewConversation={view.onNewConversation}
            onSearchQueryChange={view.onConversationSearchChange}
            onSelectConversation={view.onSelectConversation}
          />
        )}
      </div>

      {view.showFooter && (
        <div className={`tray-footer ${view.isOpen ? 'expanded' : 'collapsed'}`}>
          {!view.isOpen && (
            <div className="tray-footer-compact-row">
              <TrayFooter
                activeMode={view.activeMode}
                inputMode={view.inputMode}
                isOpen={false}
                onExitShellMode={view.onExitShellMode}
                onToggleCommands={view.onToggleCommands}
                onToggleConversations={view.onToggleConversations}
                onToggleHelp={view.onToggleHelp}
                shellShortcutTokens={view.shellShortcutTokens}
                shellSource={view.shellSource}
              />

              {view.showOpenInApp && view.onOpenApp && (
                <button className="tray-open-app-button" type="button" onClick={view.onOpenApp}>
                  <span className="mode-button tray-open-app-shortcut" aria-hidden="true">
                    <Command size={10} />
                  </span>
                  <span className="mode-button tray-open-app-shortcut" aria-hidden="true">X</span>
                  <span>open in app</span>
                </button>
              )}
            </div>
          )}

          {view.isOpen && (
            <>
              <div className="tray-footer-open-row">
                <TrayFooter
                  activeMode={view.activeMode}
                  inputMode={view.inputMode}
                  isOpen={true}
                  onExitShellMode={view.onExitShellMode}
                  onToggleCommands={view.onToggleCommands}
                  onToggleConversations={view.onToggleConversations}
                  onToggleHelp={view.onToggleHelp}
                  shellShortcutTokens={view.shellShortcutTokens}
                  shellSource={view.shellSource}
                />

                {view.showOpenInApp && view.onOpenApp && (
                  <button className="tray-open-app-button" type="button" onClick={view.onOpenApp}>
                    <span className="mode-button tray-open-app-shortcut" aria-hidden="true">
                      <Command size={10} />
                    </span>
                    <span className="mode-button tray-open-app-shortcut" aria-hidden="true">X</span>
                    <span>open in app</span>
                  </button>
                )}
              </div>
              <div className="tray-footer-divider" aria-hidden="true" />
            </>
          )}
        </div>
      )}
    </div>
  );
});
