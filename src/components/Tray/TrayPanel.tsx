import './TrayPanel.css';
import { Command } from 'lucide-react';
import { TrayCommands } from './TrayCommands';
import { TrayConversations, type TrayConversationEntry } from './TrayConversations';
import { TrayFooter } from './TrayFooter';
import { TrayHelp } from './TrayHelp';
import { TrayHistory } from './TrayHistory';
import { TrayModels } from './TrayModels';
import type { HistoryEntry, HistoryTab } from '../../types/history';
import type { ModelSpec } from '../../types/model';
import type { CommandItem, ComposerMode, HelpItem, ShellModeSource, TrayContentMode } from '../../types/ui';

type TrayPanelProps = {
  isOpen: boolean;
  showFooter?: boolean;
  showOpenInApp?: boolean;
  activeMode: TrayContentMode;
  commandSearchQuery: string;
  helpItems: HelpItem[];
  commandItems: CommandItem[];
  selectedCommandIndex: number;
  historyEntries: HistoryEntry[];
  conversations: TrayConversationEntry[];
  activeConversationId: string | null;
  conversationSearchQuery: string;
  historyTab: HistoryTab;
  modelTab: 'all' | 'saved';
  modelEntries: ModelSpec[];
  selectedHistoryIndex: number;
  selectedModelId: string | null;
  selectedModelIndex: number;
  inputMode: ComposerMode;
  shellSource: ShellModeSource | null;
  shellShortcutTokens: string[];
  onExitShellMode: () => void;
  onHistoryTabChange: (tab: HistoryTab) => void;
  onSelectHistoryEntry: (entry: HistoryEntry) => void;
  onSelectConversation: (conversationId: string) => void;
  onConversationSearchChange: (value: string) => void;
  onNewConversation: () => void;
  onSelectModel: (modelId: string) => void;
  onModelTabChange: (tab: 'all' | 'saved') => void;
  onToggleHelp: () => void;
  onToggleCommands: () => void;
  onToggleConversations: () => void;
  onInsertCommand: (command: string) => void;
  onOpenApp?: () => void;
  onOpenModelSettings?: () => void;
};

export function TrayPanel({
  isOpen,
  showFooter = true,
  showOpenInApp = false,
  activeMode,
  commandSearchQuery,
  helpItems,
  commandItems,
  selectedCommandIndex,
  historyEntries,
  conversations,
  activeConversationId,
  conversationSearchQuery,
  historyTab,
  modelTab,
  modelEntries,
  selectedHistoryIndex,
  selectedModelId,
  selectedModelIndex,
  inputMode,
  shellSource,
  shellShortcutTokens,
  onExitShellMode,
  onHistoryTabChange,
  onSelectHistoryEntry,
  onSelectConversation,
  onConversationSearchChange,
  onNewConversation,
  onSelectModel,
  onModelTabChange,
  onToggleHelp,
  onToggleCommands,
  onToggleConversations,
  onInsertCommand,
  onOpenApp,
  onOpenModelSettings
}: TrayPanelProps) {
  return (
    <div className={`tray-region ${isOpen ? 'open' : 'closed'}`}>
      <div className="tray-body">
        {activeMode === 'help' && <TrayHelp items={helpItems} />}
        {activeMode === 'commands' && (
          <TrayCommands
            items={commandItems}
            query={commandSearchQuery}
            selectedIndex={selectedCommandIndex}
            onInsertCommand={onInsertCommand}
          />
        )}
        {activeMode === 'history' && (
          <TrayHistory
            activeTab={historyTab}
            entries={historyEntries}
            onSelectEntry={onSelectHistoryEntry}
            onTabChange={onHistoryTabChange}
            selectedIndex={selectedHistoryIndex}
          />
        )}
        {activeMode === 'models' && (
          <TrayModels
            activeTab={modelTab}
            models={modelEntries}
            onOpenModelSettings={onOpenModelSettings}
            onSelectModel={onSelectModel}
            onTabChange={onModelTabChange}
            selectedIndex={selectedModelIndex}
            selectedModelId={selectedModelId}
          />
        )}
        {activeMode === 'conversations' && (
          <TrayConversations
            activeConversationId={activeConversationId}
            conversations={conversations}
            searchQuery={conversationSearchQuery}
            onNewConversation={onNewConversation}
            onSearchQueryChange={onConversationSearchChange}
            onSelectConversation={onSelectConversation}
          />
        )}
      </div>

      {showFooter && (
        <div className={`tray-footer ${isOpen ? 'expanded' : 'collapsed'}`}>
          {!isOpen && (
            <div className="tray-footer-compact-row">
              <TrayFooter
                activeMode={activeMode}
                inputMode={inputMode}
                isOpen={false}
                onExitShellMode={onExitShellMode}
                onToggleCommands={onToggleCommands}
                onToggleConversations={onToggleConversations}
                onToggleHelp={onToggleHelp}
                shellShortcutTokens={shellShortcutTokens}
                shellSource={shellSource}
              />

              {showOpenInApp && onOpenApp && (
                <button className="tray-open-app-button" type="button" onClick={onOpenApp}>
                  <span className="mode-button tray-open-app-shortcut" aria-hidden="true">
                    <Command size={10} />
                  </span>
                  <span className="mode-button tray-open-app-shortcut" aria-hidden="true">X</span>
                  <span>open in app</span>
                </button>
              )}
            </div>
          )}

          {isOpen && (
            <>
              <TrayFooter
                activeMode={activeMode}
                inputMode={inputMode}
                isOpen={true}
                onExitShellMode={onExitShellMode}
                onToggleCommands={onToggleCommands}
                onToggleConversations={onToggleConversations}
                onToggleHelp={onToggleHelp}
                shellShortcutTokens={shellShortcutTokens}
                shellSource={shellSource}
              />
              <div className="tray-footer-divider" aria-hidden="true" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
