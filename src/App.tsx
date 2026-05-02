import './App.css';
import { Launcher } from './components/Layout/Launcher';
import { AppWindow } from './components/App';
import { getPanelMode } from './lib/utils';

export function App() {
  const panelMode = getPanelMode();

  if (panelMode === 'settings') {
    return <AppWindow />;
  }

  if (panelMode === 'onboarding') {
    return (
      <div className="panel-screen">
        <div className="panel-card">
          <div className="panel-kicker">Placeholder</div>
          <h1>Onboarding Tray Placeholder</h1>
          <p>This is intentionally separate from chat, tray, and input so the launcher core remains simple.</p>
        </div>
      </div>
    );
  }

  return <Launcher />;
}

export default App;
