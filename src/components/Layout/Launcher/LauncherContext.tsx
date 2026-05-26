import { createContext, useContext, type ReactNode } from 'react';
import type { LauncherViewModel } from './hooks';

export type LauncherContextValue = {
  launcher: LauncherViewModel;
  composerPlaceholder: string;
  title?: string;
};

const LauncherContext = createContext<LauncherContextValue | null>(null);

export function LauncherProvider({
  value,
  children
}: {
  value: LauncherContextValue;
  children: ReactNode;
}) {
  return (
    <LauncherContext.Provider value={value}>
      {children}
    </LauncherContext.Provider>
  );
}

export function useLauncherContext() {
  const value = useContext(LauncherContext);
  if (!value) {
    throw new Error('useLauncherContext must be used within a LauncherProvider.');
  }

  return value;
}
