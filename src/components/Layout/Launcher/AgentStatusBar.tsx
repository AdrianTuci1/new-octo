import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bot, Terminal, ChevronsRight, Square, EyeOff, Eye, Keyboard } from 'lucide-react';
import { useUIStore } from '../../../stores';
import './AgentStatusBar.css';

interface AgentStatusBarProps {
  launcher: any;
}

export function AgentStatusBar({ launcher }: AgentStatusBarProps) {
  const isChatHidden = useUIStore((state) => state.isChatHidden);
  const setIsChatHidden = useUIStore((state) => state.setIsChatHidden);

  // Check if a terminal command is actively running inside the agent terminal
  const isCommandRunning = launcher.terminal.agentTerminal?.blocks?.some(
    (block: any) => block.status === 'running'
  ) || false;

  const handleStop = async () => {
    if (launcher.chat.activeRunId) {
      try {
        await invoke('agent_cancel', { request: { runId: launcher.chat.activeRunId } });
      } catch (err) {
        console.warn('[AgentStatusBar] Failed to cancel agent run:', err);
      }
    }
  };

  const handleHideResponses = () => {
    setIsChatHidden(!isChatHidden);
  };

  const handleTakeOver = async () => {
    // 1. Cancel the background run
    await handleStop();
    // 2. Toggle composer surface back to terminal
    launcher.actions.toggleComposerSurface();
  };

  const handleToggleAgent = () => {
    launcher.actions.toggleComposerSurface();
  };

  const handleLearnMore = () => {
    launcher.tray?.toggleTray('help');
  };

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Toggle Agent: ⇧⌘I or Shift+Ctrl+I
      if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        e.stopPropagation();
        handleToggleAgent();
        return;
      }

      // Stop Agent: Ctrl+C (cancels run)
      if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopPropagation();
        void handleStop();
        return;
      }

      // Shortcuts specific to command executing (State 2)
      if (isCommandRunning) {
        // Hide responses: ⌘G or Ctrl+G
        if (cmdOrCtrl && e.key.toLowerCase() === 'g') {
          e.preventDefault();
          e.stopPropagation();
          handleHideResponses();
          return;
        }

        // Take over: ⌘I or Ctrl+I
        if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          e.stopPropagation();
          void handleTakeOver();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [launcher, isCommandRunning, isChatHidden]);

  return (
    <div className="agent-status-bar">
      <div className="agent-status-left">
        <div className="agent-status-header">
          <span className="agent-status-icon-wrapper">
            {isCommandRunning ? (
              <Terminal size={13} className="agent-status-icon executing" />
            ) : (
              <Bot size={13} className="agent-status-icon warping" />
            )}
          </span>
          <span>{isCommandRunning ? 'Waiting for command to exit...' : 'octo running...'}</span>
        </div>
        <div className="agent-status-tip">
          {isCommandRunning ? (
            <>
              Tip: ⌘I to toggle natural language detection and switch between agent and terminal input.{' '}
              <span className="agent-status-tip-link" onClick={handleLearnMore}>
                Learn more
              </span>
            </>
          ) : (
            <>
              Tip: /init to index the repo so the agent can understand your codebase.{' '}
              <span className="agent-status-tip-link" onClick={handleLearnMore}>
                Learn more
              </span>
            </>
          )}
        </div>
      </div>

      <div className="agent-status-right">
        {isCommandRunning && (
          <>
            <button className="agent-status-btn" onClick={handleHideResponses}>
              {isChatHidden ? <Eye size={11} /> : <EyeOff size={11} />}
              <span>{isChatHidden ? 'Show responses' : 'Hide responses'}</span>
              <span className="agent-status-btn-hotkey">⌘G</span>
            </button>
            <button className="agent-status-btn" onClick={handleTakeOver}>
              <Keyboard size={11} />
              <span>Take over</span>
              <span className="agent-status-btn-hotkey">⌘I</span>
            </button>
          </>
        )}

        <button className="agent-status-btn" onClick={handleToggleAgent} title="Toggle agent/terminal surface">
          <ChevronsRight size={11} />
          <span className="agent-status-btn-hotkey">⇧⌘I</span>
        </button>

        <button className="agent-status-btn agent-status-btn-stop" onClick={handleStop} title="Stop Agent Run">
          <Square size={9} fill="currentColor" />
          <span className="agent-status-btn-hotkey">^C</span>
        </button>
      </div>
    </div>
  );
}
