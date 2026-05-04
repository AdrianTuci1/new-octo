import { useState } from 'react';
import type { ComposerMode } from '../../../../types/ui';
import type { HistoryEntry, HistoryTab } from '../../../../types/history';
import type { CommandApproval } from '../../../../types/terminal';

export function useLauncherState(initialComposerSurface: 'agent' | 'terminal') {
  const [composerSurface, setComposerSurface] = useState<'agent' | 'terminal'>(initialComposerSurface);
  const [modeLock, setModeLock] = useState<ComposerMode | null>(null);
  const [autodetectedShellLatch, setAutodetectedShellLatch] = useState(false);
  const [allowSingleCharacterCommandPrediction, setAllowSingleCharacterCommandPrediction] = useState(false);
  const [terminalAutoDetectEnabled, setTerminalAutoDetectEnabled] = useState(true);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('all');
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(0);
  const [modelTab, setModelTab] = useState<'all' | 'saved'>('all');
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [localConversationId, setLocalConversationId] = useState<string | null>(null);
  const [conversationSearchQuery, setConversationSearchQuery] = useState('');
  const [savedPromptEntries, setSavedPromptEntries] = useState<HistoryEntry[]>([]);
  const [localPendingApproval, setLocalPendingApproval] = useState<CommandApproval | null>(null);

  const reset = (nextComposerSurface: 'agent' | 'terminal') => {
    setComposerSurface(nextComposerSurface);
    setLocalPendingApproval(null);
    setModeLock(null);
    setAutodetectedShellLatch(false);
    setAllowSingleCharacterCommandPrediction(false);
    setTerminalAutoDetectEnabled(true);
    setHistoryTab('all');
    setSelectedHistoryIndex(0);
    setModelTab('all');
    setSelectedModelIndex(0);
  };

  return {
    composerSurface,
    modeLock,
    autodetectedShellLatch,
    allowSingleCharacterCommandPrediction,
    terminalAutoDetectEnabled,
    historyTab,
    selectedHistoryIndex,
    modelTab,
    selectedModelIndex,
    localConversationId,
    conversationSearchQuery,
    savedPromptEntries,
    localPendingApproval,
    setComposerSurface,
    setModeLock,
    setAutodetectedShellLatch,
    setAllowSingleCharacterCommandPrediction,
    setTerminalAutoDetectEnabled,
    setHistoryTab,
    setSelectedHistoryIndex,
    setModelTab,
    setSelectedModelIndex,
    setLocalConversationId,
    setConversationSearchQuery,
    setSavedPromptEntries,
    setLocalPendingApproval,
    reset
  };
}
