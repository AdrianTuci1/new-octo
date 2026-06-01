import { create } from 'zustand';

// ── Updater utilities ──────────────────────────────────────────────

type Updater<T> = T | ((current: T) => T);

function resolve<T>(current: T, next: Updater<T>): T {
  return typeof next === 'function' ? (next as (v: T) => T)(current) : next;
}

// ── Sub-state types ─────────────────────────────────────────────────

export interface WorkingDirectory {
  currentPath: string | null;
  browserPath: string | null;
  listing: string[] | null;
  searchQuery: string;
  buttonLabel: string | null;
  isPickerOpen: boolean;
}

export interface GitContext {
  gitContext: { currentBranch?: string | null } | null;
  currentBranch: string | null;
  isBranchMenuOpen: boolean;
}

// ── Runtime Store State ─────────────────────────────────────────────

export interface RuntimeStoreState {
  workingDirectory: WorkingDirectory;
  gitContext: GitContext;
  terminalCwd: string | null;
  activeSurfaceWorkingDirectory: string | null;
  runtimeContext: { nodeVersion?: string | null } | null;

  // Setters
  setWorkingDirectory: (next: Updater<WorkingDirectory>) => void;
  setGitContext: (next: Updater<GitContext>) => void;
  setTerminalCwd: (next: Updater<string | null>) => void;
  setActiveSurfaceWorkingDirectory: (next: Updater<string | null>) => void;
  setRuntimeContext: (next: Updater<{ nodeVersion?: string | null } | null>) => void;
}

// ── Hook ────────────────────────────────────────────────────────────

export const useRuntimeStore = create<RuntimeStoreState>()((set) => ({
  workingDirectory: {
    currentPath: null,
    browserPath: null,
    listing: null,
    searchQuery: '',
    buttonLabel: null,
    isPickerOpen: false,
  },
  gitContext: {
    gitContext: null,
    currentBranch: null,
    isBranchMenuOpen: false,
  },
  terminalCwd: null,
  activeSurfaceWorkingDirectory: null,
  runtimeContext: null,

  setWorkingDirectory: (next) =>
    set((s) => ({ workingDirectory: resolve(s.workingDirectory, next) })),
  setGitContext: (next) =>
    set((s) => ({ gitContext: resolve(s.gitContext, next) })),
  setTerminalCwd: (next) =>
    set((s) => ({ terminalCwd: resolve(s.terminalCwd, next) })),
  setActiveSurfaceWorkingDirectory: (next) =>
    set((s) => ({ activeSurfaceWorkingDirectory: resolve(s.activeSurfaceWorkingDirectory, next) })),
  setRuntimeContext: (next) =>
    set((s) => ({ runtimeContext: resolve(s.runtimeContext, next) })),
}));
