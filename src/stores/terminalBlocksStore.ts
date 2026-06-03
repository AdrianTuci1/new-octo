import { create } from 'zustand';
import type {
  TerminalBlockSharedMeta,
  TerminalCommandBlock,
  TerminalCompletionState,
  TerminalSessionInfo,
} from '../types/terminal';

export type TerminalBlocksSlice = {
  blocks: TerminalCommandBlock[];
  expandedBlockIds: string[];
  selectedBlockId: string | null;
  error: string | null;
  sessionCwd: string | null;
  sessionInfo: TerminalSessionInfo | null;
  completionState: TerminalCompletionState | null;
  sessionId: string | null;
  sessionStatus: string | null;
  sessionKind: string | null;
  sessionProvider: string | null;
  blockMetaById: Record<string, TerminalBlockSharedMeta>;
  commandBlocks: TerminalCommandBlock[];
  syntheticBlocks: TerminalCommandBlock[];
};

export type TerminalBlocksActions = {
  setBlocks: (blocks: TerminalCommandBlock[]) => void;
  setExpandedBlockIds: (ids: string[]) => void;
  setSelectedBlockId: (id: string | null) => void;
  setError: (error: string | null) => void;
  setSessionCwd: (cwd: string | null) => void;
  setSessionInfo: (info: TerminalSessionInfo | null) => void;
  setCompletionState: (state: TerminalCompletionState | null) => void;
  setBlockMetaById: (meta: Record<string, TerminalBlockSharedMeta>) => void;
  setCommandBlocks: (blocks: TerminalCommandBlock[]) => void;
  setSyntheticBlocks: (blocks: TerminalCommandBlock[]) => void;
};

export const useTerminalBlocksStore = create<TerminalBlocksSlice & TerminalBlocksActions>((set) => ({
  blocks: [],
  expandedBlockIds: [],
  selectedBlockId: null,
  error: null,
  sessionCwd: null,
  sessionInfo: null,
  completionState: null,
  sessionId: null,
  sessionStatus: null,
  sessionKind: null,
  sessionProvider: null,
  blockMetaById: {},
  commandBlocks: [],
  syntheticBlocks: [],

  setBlocks: (blocks) => set({ blocks }),
  setExpandedBlockIds: (ids) => set({ expandedBlockIds: ids }),
  setSelectedBlockId: (id) => set({ selectedBlockId: id }),
  setError: (error) => set({ error }),
  setSessionCwd: (cwd) => set({ sessionCwd: cwd }),
  setSessionInfo: (info) => set({ sessionInfo: info, sessionStatus: info?.status ?? null, sessionKind: info?.kind ?? null, sessionProvider: info?.provider ?? null, sessionId: info?.id ?? null }),
  setCompletionState: (state) => set({ completionState: state }),
  setBlockMetaById: (meta) => set({ blockMetaById: meta }),
  setCommandBlocks: (blocks) => set({ commandBlocks: blocks }),
  setSyntheticBlocks: (blocks) => set({ syntheticBlocks: blocks }),
}));
