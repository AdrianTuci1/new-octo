import { MessagesSquare } from 'lucide-react';
import './TrayPanel.css';
import { TrayCommands } from './TrayCommands';
import { TrayFooter } from './TrayFooter';
import { TrayHelp } from './TrayHelp';
import { TrayHistory } from './TrayHistory';
import { TrayModels } from './TrayModels';
import type { HistoryEntry, HistoryTab } from '../../types/history';
import type { ModelSpec } from '../../types/model';
import type { CommandItem, ComposerMode, HelpItem, ShellModeSource, TrayContentMode } from '../../types/ui';

type TrayPanelProps = {
  isOpen: boolean;
  activeMode: TrayContentMode;
  helpItems: HelpItem[];
  commandItems: CommandItem[];
  historyEntries: HistoryEntry[];
  historyTab: HistoryTab;
  modelTab: 'all' | 'saved';
  modelEntries: ModelSpec[];
  selectedHistoryIndex: number;
  selectedModelId: string;
  selectedModelIndex: number;
  inputMode: ComposerMode;
  shellSource: ShellModeSource | null;
  shellShortcutTokens: string[];
  onExitShellMode: () => void;
  onHistoryTabChange: (tab: HistoryTab) => void;
  onSelectHistoryEntry: (entry: HistoryEntry) => void;
  onSelectModel: (modelId: string) => void;
  onModelTabChange: (tab: 'all' | 'saved') => void;
  onToggleHelp: () => void;
  onToggleCommands: () => void;
  onToggleConversations: () => void;
  onInsertCommand: (command: string) => void;
};

export function TrayPanel({
  isOpen,
  activeMode,
  helpItems,
  commandItems,
  historyEntries,
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
  onSelectModel,
  onModelTabChange,
  onToggleHelp,
  onToggleCommands,
  onToggleConversations,
  onInsertCommand
}: TrayPanelProps) {
  return (
    <div className={`tray-region ${isOpen ? 'open' : 'closed'}`}>
      <div className="tray-body">
        {activeMode === 'help' && <TrayHelp items={helpItems} />}
        {activeMode === 'commands' && <TrayCommands items={commandItems} onInsertCommand={onInsertCommand} />}
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
            onSelectModel={onSelectModel}
            onTabChange={onModelTabChange}
            selectedIndex={selectedModelIndex}
            selectedModelId={selectedModelId}
          />
        )}
        {activeMode === 'conversations' && (
          <div className="tray-pane-placeholder">
            <MessagesSquare size={32} strokeWidth={1.5} className="tray-header-icon" />
            <p>Conversation history will appear here.</p>
          </div>
        )}
      </div>

      <div className={`tray-footer ${isOpen ? 'expanded' : 'collapsed'}`}>
        {!isOpen && (
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
    </div>
  );
}
