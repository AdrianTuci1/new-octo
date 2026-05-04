import './App.css';
import { Launcher } from './components/Layout/Launcher';
import { AppWindow } from './components/App';
import { Onboarding } from './components/Onboarding/Onboarding';
import { useLauncherAppState } from './hooks/useLauncherAppState';

export function App() {
  const app = useLauncherAppState();

  if (!app.isOnboardingCompleted) {
    return <Onboarding onComplete={app.handleOnboardingComplete} />;
  }

  if (app.panelMode === 'settings') {
    return <AppWindow />;
  }

  return <Launcher {...app.launcherProps} />;
}

export default App;
