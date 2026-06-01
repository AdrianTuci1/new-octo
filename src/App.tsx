import './App.css';
import { AgentPanel } from './views/Agent/AgentPanel';
import { ShellWindow } from './views/Shell/ShellWindow';
import { Onboarding } from './components/Onboarding/Onboarding';
import { useLauncherAppState } from './hooks/useLauncherAppState';

export function App() {
  const app = useLauncherAppState();

  if (!app.isOnboardingCompleted) {
    return <Onboarding onComplete={app.handleOnboardingComplete} />;
  }

  if (app.panelMode === 'settings') {
    return <ShellWindow />;
  }

  return <AgentPanel />;
}

export default App;
