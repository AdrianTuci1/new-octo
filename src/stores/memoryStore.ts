import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { octomusMemory } from '../lib/octomusMemory';
import type {
  MemoryCloudObjectIndex,
  MemoryCloudObjectPutRequest,
  MemoryCloudObjectRecord,
  MemoryConversationPutRequest,
  MemoryConversationRecord,
  MemoryConversationSummary,
  MemorySettingsRecord,
  MemorySettingsValues,
  MemorySyncStatus,
  MemoryWorkspaceSnapshot,
  OctomusMemoryBootstrap
} from '../types/memory';

type MemoryStoreStatus = 'idle' | 'loading' | 'ready' | 'failed';

export type MemoryStoreState = {
  status: MemoryStoreStatus;
  rootPath: string | null;
  bootstrapData: OctomusMemoryBootstrap | null;
  settings: MemorySettingsRecord | null;
  workspace: MemoryWorkspaceSnapshot | null;
  conversations: MemoryConversationSummary[];
  conversationRecords: Record<string, MemoryConversationRecord>;
  cloudIndex: MemoryCloudObjectIndex | null;
  syncStatus: MemorySyncStatus | null;
  error: string | null;
  bootstrap: () => Promise<OctomusMemoryBootstrap | null>;
  saveSettings: (values: MemorySettingsValues, merge?: boolean) => Promise<MemorySettingsRecord | null>;
  saveWorkspace: (snapshot: MemoryWorkspaceSnapshot) => Promise<MemoryWorkspaceSnapshot | null>;
  saveConversation: (request: MemoryConversationPutRequest) => Promise<MemoryConversationRecord | null>;
  loadConversation: (conversationId: string) => Promise<MemoryConversationRecord | null>;
  deleteConversation: (conversationId: string) => Promise<boolean>;
  refreshConversations: () => Promise<MemoryConversationSummary[]>;
  saveCloudObject: (request: MemoryCloudObjectPutRequest) => Promise<MemoryCloudObjectRecord | null>;
  syncOnce: (endpoint?: string | null) => Promise<MemorySyncStatus | null>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

let workspaceListenerReady = false;
let conversationListenerReady = false;

function ensureWorkspaceListener(set: (partial: Partial<MemoryStoreState>) => void) {
  if (workspaceListenerReady || !(window as any).__TAURI_INTERNALS__) {
    return;
  }

  workspaceListenerReady = true;
  void listen<MemoryWorkspaceSnapshot>('memory:workspace-updated', (event) => {
    set({
      workspace: event.payload,
      bootstrapData: useMemoryStore.getState().bootstrapData
        ? {
            ...useMemoryStore.getState().bootstrapData!,
            workspace: event.payload
          }
        : useMemoryStore.getState().bootstrapData
    });
  }).catch(() => {
    workspaceListenerReady = false;
  });
}

function ensureConversationListener(set: (partial: Partial<MemoryStoreState> | ((state: MemoryStoreState) => Partial<MemoryStoreState>)) => void) {
  if (conversationListenerReady || !(window as any).__TAURI_INTERNALS__) {
    return;
  }

  conversationListenerReady = true;
  void listen<MemoryConversationRecord>('memory:conversation-updated', (event) => {
    set((state) => {
      const nextRecords = {
        ...state.conversationRecords,
        [event.payload.id]: event.payload
      };
      const nextSummary: MemoryConversationSummary = {
        id: event.payload.id,
        title: event.payload.title,
        status: event.payload.status,
        modelId: event.payload.modelId ?? null,
        cwd: event.payload.cwd ?? null,
        messageCount: event.payload.messages.length,
        branchLabel: state.conversations.find((conversation) => conversation.id === event.payload.id)?.branchLabel
          ?? null,
        timeLabel: state.conversations.find((conversation) => conversation.id === event.payload.id)?.timeLabel
          ?? 'recently',
        createdAt: event.payload.createdAt,
        updatedAt: event.payload.updatedAt,
        serverConversationToken: event.payload.serverConversationToken ?? null,
        syncState: event.payload.syncState
      };
      return {
        conversationRecords: nextRecords,
        conversations: [
          nextSummary,
          ...state.conversations.filter((conversation) => conversation.id !== nextSummary.id)
        ]
      };
    });
  }).catch(() => {
    conversationListenerReady = false;
  });
}

export const useMemoryStore = create<MemoryStoreState>((set, get) => ({
  status: 'idle',
  rootPath: null,
  bootstrapData: null,
  settings: null,
  workspace: null,
  conversations: [],
  conversationRecords: {},
  cloudIndex: null,
  syncStatus: null,
  error: null,

  bootstrap: async () => {
    if (get().status === 'loading') {
      return get().bootstrapData;
    }

    ensureWorkspaceListener(set);
    ensureConversationListener(set as any);
    set({ status: 'loading', error: null });
    try {
      const bootstrapData = await octomusMemory.bootstrap();
      set({
        status: 'ready',
        rootPath: bootstrapData.rootPath,
        bootstrapData,
        settings: bootstrapData.settings,
        workspace: bootstrapData.workspace ?? null,
        conversations: bootstrapData.conversations,
        conversationRecords: {},
        cloudIndex: bootstrapData.cloudIndex,
        syncStatus: bootstrapData.syncStatus,
        error: null
      });
      return bootstrapData;
    } catch (error) {
      set({ status: 'failed', error: errorMessage(error) });
      return null;
    }
  },

  saveSettings: async (values, merge = true) => {
    try {
      const settings = await octomusMemory.putSettings(values, merge);
      set({ settings, error: null });
      return settings;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  saveWorkspace: async (snapshot) => {
    try {
      const workspace = await octomusMemory.putWorkspaceSnapshot(snapshot);
      set({ workspace, error: null });
      return workspace;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  saveConversation: async (request) => {
    try {
      const conversation = await octomusMemory.putConversation(request);
      const conversations = await octomusMemory.listConversations();
      set((state) => ({
        conversations,
        conversationRecords: {
          ...state.conversationRecords,
          [conversation.id]: conversation
        },
        error: null
      }));
      return conversation;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  loadConversation: async (conversationId) => {
    try {
      const conversation = await octomusMemory.getConversation(conversationId);
      if (conversation) {
        set((state) => ({
          conversationRecords: {
            ...state.conversationRecords,
            [conversationId]: conversation
          }
        }));
      }
      return conversation;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  deleteConversation: async (conversationId) => {
    try {
      const deleted = await octomusMemory.deleteConversation(conversationId);
      const conversations = await octomusMemory.listConversations();
      set((state) => {
        const nextRecords = { ...state.conversationRecords };
        delete nextRecords[conversationId];
        return { conversations, conversationRecords: nextRecords, error: null };
      });
      return deleted;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  refreshConversations: async () => {
    try {
      const conversations = await octomusMemory.listConversations();
      set({ conversations, error: null });
      return conversations;
    } catch (error) {
      set({ error: errorMessage(error) });
      return get().conversations;
    }
  },

  saveCloudObject: async (request) => {
    try {
      const object = await octomusMemory.putCloudObject(request);
      const { index } = await octomusMemory.listCloudObjectIndex();
      set({ cloudIndex: index, error: null });
      return object;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  syncOnce: async (endpoint) => {
    try {
      const syncStatus = await octomusMemory.syncOnce(endpoint);
      set({ syncStatus, error: null });
      return syncStatus;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  }
}));
