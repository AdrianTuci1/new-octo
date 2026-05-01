import './App.css';
import { Launcher } from './components/Layout/Launcher';
import { PanelPlaceholder } from './components/Layout/PanelPlaceholder';
import { getPanelMode } from './lib/utils';

export function App() {
  const panelMode = getPanelMode();

  if (panelMode === 'settings') {
    return (
      <PanelPlaceholder
        title="Settings Tray Placeholder"
        subtitle="This stays outside the launcher shell. The real settings flow can be built later as a separate panel."
      />
    );
  }

  if (panelMode === 'onboarding') {
    return (
      <PanelPlaceholder
        title="Onboarding Tray Placeholder"
        subtitle="This is intentionally separate from chat, tray, and input so the launcher core remains simple."
      />
    );
  }

  return <Launcher />;
}

export default App;
