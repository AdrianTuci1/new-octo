import type { PanelMode } from '../types/ui';

export function getPanelMode(): PanelMode {
  const panel = new URLSearchParams(window.location.search).get('panel');
  if (panel === 'settings') return 'settings';
  if (panel === 'onboarding') return 'onboarding';
  return 'launcher';
}
