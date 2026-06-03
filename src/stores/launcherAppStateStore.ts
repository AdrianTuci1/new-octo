import { create } from 'zustand';
import type { LauncherProps } from '../components/Layout/Launcher/hooks';
import type { PanelMode } from '../types/ui';

export type LauncherAppStateSlice = {
  isLauncherWindowVisible: boolean;
  isOnboardingCompleted: boolean;
  launcherProps: LauncherProps | null;
  panelMode: PanelMode;
};

export const useLauncherAppStateStore = create<LauncherAppStateSlice>(() => ({
  isLauncherWindowVisible: true,
  isOnboardingCompleted: false,
  launcherProps: null,
  panelMode: 'launcher',
}));
