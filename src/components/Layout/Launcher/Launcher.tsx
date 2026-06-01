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
import { AgentStatusBar } from './AgentStatusBar';
import { useLauncher, type LauncherProps } from './hooks';
import { COMPOSER_PLACEHOLDERS } from '../../../lib';

export function Launcher(props: LauncherProps) {
  const launcher = useLauncher(props);
  const modelSetupRequired = launcher.ui.modelSelection.requiresModelSetup;
  const placeholder = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * COMPOSER_PLACEHOLDERS.length);
    return COMPOSER_PLACEHOLDERS[randomIndex];
  }, [launcher.ui.resolvedConversationId]);
  const showComposerInputHint = launcher.ui.agentSettings?.input?.showInputHintText !== false;

  // The agent is active if there's an active run ID and any assistant message is currently streaming/running,
  // but only when the composer is not hidden (i.e. not during pending approvals)
  const isAgentActive = Boolean(
    !launcher.ui.resolvedPendingApproval &&
    launcher.chat.activeRunId &&
    launcher.chat.messages.some((message: any) => message.role === 'assistant' && message.isStreaming)
  );

  return (
    <main className={launcher.ui.launcherRootClassName}>
      <section
        ref={launcher.terminal.shellRef}
        className={launcher.ui.launcherShellClassName}
      >
        {launcher.ui.isChatOpen && (
          <div className="chat-stack">
            <ChatPanel view={launcher.views.chatPanel} />
          </div>
        )}

        <div ref={launcher.ui.dockRef} className="dock-stack">
          {isAgentActive && <AgentStatusBar launcher={launcher} />}

          {!modelSetupRequired && !launcher.ui.resolvedPendingApproval && (!launcher.ui.isTerminalSurface || launcher.ui.isTerminalTrayOpen) && (
            <TrayPanel view={launcher.views.trayPanel} />
          )}

          {launcher.ui.resolvedPendingApproval ? null : launcher.store.composerSurface === 'terminal' ? (
            <TerminalComposer view={launcher.views.terminalComposer} />
          ) : modelSetupRequired ? (
            <ModelSetupOverlay view={launcher.views.modelSetupOverlay} />
          ) : (
            <ComposerBar
              composerPlaceholder={placeholder}
              showInputHintText={showComposerInputHint}
              view={launcher.views.composerBar}
            />
          )}
        </div>
      </section>
    </main>
  );
}
