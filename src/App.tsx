import './App.css';
import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AgentPanel } from './views/Agent/AgentPanel';
import { ShellWindow } from './views/Shell/ShellWindow';
import { Onboarding } from './components/Onboarding/Onboarding';
import { useLauncherAppState } from './hooks/launcherAppState';

export function App() {
  const app = useLauncherAppState();

  const handleOpenAppWindow = useCallback(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    void invoke('show_app_window').catch((e) => console.warn('[App] show_app_window failed', e));
  }, []);

  if (!app.isOnboardingCompleted) {
    return <Onboarding onComplete={app.handleOnboardingComplete} />;
  }

  if (app.panelMode === 'settings') {
    return <ShellWindow />;
  }

  return <AgentPanel onOpenAppWindow={handleOpenAppWindow} />;
}

export default App;
