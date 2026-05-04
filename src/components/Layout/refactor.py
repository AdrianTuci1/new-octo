import os
import re

file_path = "/Users/adriantucicovenco/Proiecte/launcher-rs-react/src/components/Layout/Launcher.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Find the start of Launcher function
match = re.search(r'export function Launcher\(([\s\S]*?)\) {', content)
if not match:
    print("Could not find Launcher function")
    exit(1)

props_content = match.group(1)

start_index = match.end()

# Find the start of the return statement
return_match = re.search(r'^\s*return \(\s*<main', content[start_index:], re.MULTILINE)
if not return_match:
    print("Could not find return statement")
    exit(1)

return_start = start_index + return_match.start()

# Extract parts
imports_and_helpers = content[:match.start()]
logic = content[start_index:return_start]
jsx = content[return_start:]

# Create useLauncher.ts content
use_launcher_content = imports_and_helpers

# Replace type LauncherProps with exporting it
use_launcher_content = use_launcher_content.replace('type LauncherProps = {', 'export type LauncherProps = {')

use_launcher_content += f"""
export function useLauncher({props_content}) {{
{logic}
  return {{
    agentTerminal,
    allowSingleCharacterCommandPrediction,
    activeMessages,
    activeShellPrediction,
    activeTimelineBlocks,
    activeTimelineError,
    activeTrayMode,
    chatMode,
    clearTerminalSurface,
    closeTray,
    composerMode,
    composerSurface,
    conversationSearchQuery,
    gitContext,
    handleComposerKeyDown,
    handleNewConversation,
    handleTrayConversationSelect,
    historyEntries,
    historyTab,
    isChatOpen,
    isExpanded,
    isTerminalCommandsTrayOpen,
    isTerminalSurface,
    isTrayOpen,
    launcherRootClassName,
    launcherShellClassName,
    launchAgentComposer,
    modelSelection,
    modelTab,
    openCommandsTray,
    openConversationFromBlock,
    query,
    recommendedAction,
    requestCommandApproval,
    resolvedConversationId,
    resolvedPendingApproval,
    runtimeContext,
    selectedHistoryIndex,
    selectedModelIndex,
    setAllowSingleCharacterCommandPrediction,
    setComposerSurface,
    setConversationSearchQuery,
    setHistoryTab,
    setModeLock,
    setModelTab,
    setQuery,
    setResolvedPendingApproval,
    setSelectedHistoryIndex,
    setSelectedModelIndex,
    setTerminalAutoDetectEnabled,
    setTrayMode,
    shellRef,
    shellShortcutTokens,
    shellSource,
    submitQuery,
    submitToolResult,
    terminal,
    terminalAutoDetectEnabled,
    terminalComposerAction,
    toggleComposerSurface,
    toggleTray,
    variant,
    visibleModels,
    visibleTrayConversations,
    workingDirectory
  }};
}}
"""

with open("/Users/adriantucicovenco/Proiecte/launcher-rs-react/src/components/Layout/useLauncher.ts", "w") as f:
    f.write(use_launcher_content)

# Update Launcher.tsx
new_launcher_content = """import { type KeyboardEvent } from 'react';
import { ChatPanel } from '../Chat';
import { CommandApprovalComposer, ComposerBar, TerminalComposer } from '../Composer';
import { TrayPanel } from '../Tray';
import { useLauncher, type LauncherProps } from './useLauncher';
import { COMMAND_ITEMS, HELP_ITEMS } from '../../lib/constants';
import { consumeShellModeActivator } from '../../lib/composerIntelligence';

export function Launcher(props: LauncherProps) {
  const {
    agentTerminal,
    allowSingleCharacterCommandPrediction,
    activeMessages,
    activeShellPrediction,
    activeTimelineBlocks,
    activeTimelineError,
    activeTrayMode,
    chatMode,
    clearTerminalSurface,
    closeTray,
    composerMode,
    composerSurface,
    conversationSearchQuery,
    gitContext,
    handleComposerKeyDown,
    handleNewConversation,
    handleTrayConversationSelect,
    historyEntries,
    historyTab,
    isChatOpen,
    isTerminalCommandsTrayOpen,
    isTerminalSurface,
    isTrayOpen,
    launcherRootClassName,
    launcherShellClassName,
    launchAgentComposer,
    modelSelection,
    modelTab,
    openCommandsTray,
    openConversationFromBlock,
    query,
    recommendedAction,
    requestCommandApproval,
    resolvedConversationId,
    resolvedPendingApproval,
    runtimeContext,
    selectedHistoryIndex,
    selectedModelIndex,
    setAllowSingleCharacterCommandPrediction,
    setComposerSurface,
    setConversationSearchQuery,
    setHistoryTab,
    setModeLock,
    setModelTab,
    setQuery,
    setResolvedPendingApproval,
    setSelectedHistoryIndex,
    setTerminalAutoDetectEnabled,
    setTrayMode,
    shellRef,
    shellShortcutTokens,
    shellSource,
    submitQuery,
    submitToolResult,
    terminal,
    terminalAutoDetectEnabled,
    terminalComposerAction,
    toggleTray,
    variant,
    visibleModels,
    visibleTrayConversations,
    workingDirectory
  } = useLauncher(props);

""" + jsx

with open(file_path, "w") as f:
    f.write(new_launcher_content)

print("Done")
