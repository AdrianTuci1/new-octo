import { invoke } from '@tauri-apps/api/core';
import type {
  MemoryCloudObjectIndex,
  MemoryCloudObjectIndexResponse,
  MemoryCloudObjectPutRequest,
  MemoryCloudObjectRecord,
  MemoryConversationPutRequest,
  MemoryConversationRecord,
  MemoryConversationSummary,
  MemorySettingsRecord,
  MemorySettingsValues,
  MemorySyncStatus,
  MemoryWorkspacePutRequest,
  MemoryWorkspaceSnapshot,
  OctomusMemoryBootstrap
} from '../types/memory';

const FALLBACK_PREFIX = 'octomus.memory.v1.';
const FALLBACK_BOOTSTRAP_KEY = `${FALLBACK_PREFIX}bootstrap`;
const FALLBACK_SETTINGS_KEY = `${FALLBACK_PREFIX}settings`;
const FALLBACK_WORKSPACE_KEY = `${FALLBACK_PREFIX}workspace`;
const FALLBACK_CONVERSATION_INDEX_KEY = `${FALLBACK_PREFIX}conversationIndex`;
const FALLBACK_CLOUD_INDEX_KEY = `${FALLBACK_PREFIX}cloudIndex`;
const FALLBACK_SYNC_STATUS_KEY = `${FALLBACK_PREFIX}syncStatus`;

function canUseTauri() {
  return Boolean((window as any).__TAURI_INTERNALS__);
}

function nowIso() {
  return new Date().toISOString();
}

function defaultSettings(): MemorySettingsRecord {
  return {
    schemaVersion: 1,
    values: {},
    updatedAt: nowIso(),
    lastSyncedAt: null,
    syncToken: null
  };
}

function defaultCloudIndex(): MemoryCloudObjectIndex {
  return {
    objectsByUid: {},
    sortedOrdersByLocation: {}
  };
}

function defaultSyncStatus(): MemorySyncStatus {
  return {
    mode: 'localOnly',
    endpointConfigured: false,
    pendingCount: 0,
    failedCount: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    storagePath: 'localStorage'
  };
}

function readFallback<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch (error) {
    console.warn('[octomus-memory] failed to read fallback memory', key, error);
    return fallback;
  }
}

function writeFallback<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('[octomus-memory] failed to write fallback memory', key, error);
  }
}

function mergeObjects<T extends Record<string, unknown>>(left: T, right: Partial<T>): T {
  return {
    ...left,
    ...right
  };
}

function conversationStorageKey(conversationId: string) {
  return `${FALLBACK_PREFIX}conversation.${conversationId}`;
}

function cloudObjectStorageKey(uid: string) {
  return `${FALLBACK_PREFIX}cloudObject.${uid}`;
}

function titleFromConversation(request: MemoryConversationPutRequest) {
  const explicit = request.title?.trim();
  if (explicit) return explicit;

  const firstAssistantMessage = request.messages.find((message) => (
    message.role === 'assistant' && !message.isError && message.body.trim().length > 0
  ));
  const firstUserMessage = request.messages.find((message) => message.role === 'user' && message.body.trim().length > 0);
  const title = firstAssistantMessage?.body?.trim() || firstUserMessage?.body?.trim() || 'New agent conversation';
  return title.length > 80 ? `${title.slice(0, 79)}...` : title;
}

function statusFromConversation(request: MemoryConversationPutRequest) {
  if (request.status) return request.status;
  if (request.messages.some((message) => message.isError)) return 'error';
  if (request.messages.some((message) => message.isStreaming)) return 'inProgress';
  return 'success';
}

function summaryFromConversation(record: MemoryConversationRecord): MemoryConversationSummary {
  const cwdSegments = record.cwd?.split('/').filter(Boolean) ?? [];

  return {
    id: record.id,
    title: record.title,
    status: record.status,
    modelId: record.modelId ?? null,
    cwd: record.cwd ?? null,
    messageCount: record.messages.length,
    branchLabel: cwdSegments[cwdSegments.length - 1] ?? '~',
    timeLabel: 'recently',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    serverConversationToken: record.serverConversationToken ?? null,
    syncState: record.syncState
  };
}

function fallbackBootstrap(): OctomusMemoryBootstrap {
  const settings = readFallback(FALLBACK_SETTINGS_KEY, defaultSettings());
  const workspace = readFallback<MemoryWorkspaceSnapshot | null>(FALLBACK_WORKSPACE_KEY, null);
  const conversations = readFallback<MemoryConversationSummary[]>(FALLBACK_CONVERSATION_INDEX_KEY, []);
  const cloudIndex = readFallback(FALLBACK_CLOUD_INDEX_KEY, defaultCloudIndex());
  const syncStatus = readFallback(FALLBACK_SYNC_STATUS_KEY, defaultSyncStatus());
  const bootstrap: OctomusMemoryBootstrap = {
    rootPath: 'localStorage',
    schemaVersion: 1,
    meta: {
      schemaVersion: 1,
      deviceId: 'octomus-browser-fallback',
      createdAt: settings.updatedAt,
      updatedAt: settings.updatedAt,
      syncEndpoint: settings.values.syncEndpoint ?? null
    },
    workspace,
    settings,
    conversations,
    cloudIndex,
    syncStatus
  };
  writeFallback(FALLBACK_BOOTSTRAP_KEY, bootstrap);
  return bootstrap;
}

async function invokeOrFallback<T>(command: string, args: Record<string, unknown>, fallback: () => T): Promise<T> {
  if (!canUseTauri()) {
    return fallback();
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.warn(`[octomus-memory] ${command} failed; using local fallback`, error);
    return fallback();
  }
}

export const octomusMemory = {
  async bootstrap(): Promise<OctomusMemoryBootstrap> {
    return invokeOrFallback('memory_bootstrap', {}, fallbackBootstrap);
  },

  async putSettings(values: MemorySettingsValues, merge = true): Promise<MemorySettingsRecord> {
    return invokeOrFallback(
      'memory_put_settings',
      { request: { values, merge } },
      () => {
        const current = readFallback(FALLBACK_SETTINGS_KEY, defaultSettings());
        const next: MemorySettingsRecord = {
          ...current,
          values: merge
            ? mergeObjects(current.values as Record<string, unknown>, values) as MemorySettingsValues
            : values,
          updatedAt: nowIso()
        };
        writeFallback(FALLBACK_SETTINGS_KEY, next);
        return next;
      }
    );
  },

  async putWorkspaceSnapshot(snapshot: MemoryWorkspaceSnapshot): Promise<MemoryWorkspaceSnapshot> {
    const request: MemoryWorkspacePutRequest = { snapshot };
    return invokeOrFallback(
      'memory_put_workspace_snapshot',
      { request },
      () => {
        const next = { ...snapshot, updatedAt: nowIso() };
        writeFallback(FALLBACK_WORKSPACE_KEY, next);
        return next;
      }
    );
  },

  async putConversation(request: MemoryConversationPutRequest): Promise<MemoryConversationRecord> {
    return invokeOrFallback(
      'memory_put_conversation',
      { request },
      () => {
        const existing = readFallback<MemoryConversationRecord | null>(
          conversationStorageKey(request.conversationId),
          null
        );
        const now = nowIso();
        const record: MemoryConversationRecord = {
          id: request.conversationId,
          schemaVersion: 1,
          title: titleFromConversation(request),
          status: statusFromConversation(request),
          modelId: request.modelId ?? null,
          cwd: request.cwd ?? null,
          createdAt: existing?.createdAt ?? request.messages[0]?.createdAt ?? now,
          updatedAt: now,
          serverConversationToken: request.serverConversationToken ?? existing?.serverConversationToken ?? null,
          syncState: {
            status: request.serverConversationToken ? 'dirty' : 'local',
            serverToken: request.serverConversationToken ?? existing?.syncState.serverToken ?? null,
            lastSyncedAt: existing?.syncState.lastSyncedAt ?? null,
            lastError: null
          },
          rootTaskId: `task_root_${request.conversationId}`,
          tasks: [],
          exchanges: [],
          artifacts: request.artifacts ?? [],
          messages: request.messages,
          terminalBlocks: request.terminalBlocks ?? existing?.terminalBlocks ?? []
        };
        writeFallback(conversationStorageKey(request.conversationId), record);

        const summaries = readFallback<MemoryConversationSummary[]>(FALLBACK_CONVERSATION_INDEX_KEY, [])
          .filter((summary) => summary.id !== record.id);
        summaries.unshift(summaryFromConversation(record));
        writeFallback(FALLBACK_CONVERSATION_INDEX_KEY, summaries);
        return record;
      }
    );
  },

  async getConversation(conversationId: string): Promise<MemoryConversationRecord | null> {
    return invokeOrFallback(
      'memory_get_conversation',
      { request: { conversationId } },
      () => readFallback<MemoryConversationRecord | null>(conversationStorageKey(conversationId), null)
    );
  },

  async listConversations(): Promise<MemoryConversationSummary[]> {
    return invokeOrFallback(
      'memory_list_conversations',
      {},
      () => readFallback<MemoryConversationSummary[]>(FALLBACK_CONVERSATION_INDEX_KEY, [])
    );
  },

  async deleteConversation(conversationId: string): Promise<boolean> {
    return invokeOrFallback(
      'memory_delete_conversation',
      { request: { conversationId } },
      () => {
        window.localStorage.removeItem(conversationStorageKey(conversationId));
        const summaries = readFallback<MemoryConversationSummary[]>(FALLBACK_CONVERSATION_INDEX_KEY, [])
          .filter((summary) => summary.id !== conversationId);
        writeFallback(FALLBACK_CONVERSATION_INDEX_KEY, summaries);
        return true;
      }
    );
  },

  async putCloudObject(request: MemoryCloudObjectPutRequest): Promise<MemoryCloudObjectRecord> {
    return invokeOrFallback(
      'memory_put_cloud_object',
      { request },
      () => {
        const now = nowIso();
        const object: MemoryCloudObjectRecord = {
          ...request.object,
          updatedAt: now,
          createdAt: request.object.createdAt ?? now
        };
        writeFallback(cloudObjectStorageKey(object.uid), object);

        const index = readFallback(FALLBACK_CLOUD_INDEX_KEY, defaultCloudIndex());
        index.objectsByUid[object.uid] = {
          uid: object.uid,
          kind: object.kind,
          location: object.location,
          title: object.title,
          updatedAt: now,
          syncState: object.syncState
        };
        const locationOrder = Object.values(index.objectsByUid)
          .filter((summary) => summary.location === object.location)
          .sort((left, right) => left.title.localeCompare(right.title))
          .map((summary) => summary.uid);
        index.sortedOrdersByLocation[object.location] = locationOrder;
        writeFallback(FALLBACK_CLOUD_INDEX_KEY, index);
        return object;
      }
    );
  },

  async getCloudObject(uid: string): Promise<MemoryCloudObjectRecord | null> {
    return invokeOrFallback(
      'memory_get_cloud_object',
      { request: { uid } },
      () => readFallback<MemoryCloudObjectRecord | null>(cloudObjectStorageKey(uid), null)
    );
  },

  async listCloudObjectIndex(location?: string | null): Promise<MemoryCloudObjectIndexResponse> {
    return invokeOrFallback(
      'memory_list_cloud_object_index',
      { request: location ? { location } : null },
      () => {
        const index = readFallback(FALLBACK_CLOUD_INDEX_KEY, defaultCloudIndex());
        const orderedUids = location
          ? index.sortedOrdersByLocation[location] ?? []
          : Object.keys(index.objectsByUid).sort();
        return { index, orderedUids };
      }
    );
  },

  async enqueueSyncOperation(objectUid: string, objectKind: string, operation: string, payload: unknown): Promise<MemorySyncStatus> {
    return invokeOrFallback(
      'memory_enqueue_sync_operation',
      { request: { objectUid, objectKind, operation, payload } },
      () => {
        const current = readFallback(FALLBACK_SYNC_STATUS_KEY, defaultSyncStatus());
        const next = {
          ...current,
          pendingCount: current.pendingCount + 1,
          mode: current.endpointConfigured ? 'pending' : 'localOnly'
        };
        writeFallback(FALLBACK_SYNC_STATUS_KEY, next);
        return next;
      }
    );
  },

  async syncOnce(endpoint?: string | null): Promise<MemorySyncStatus> {
    return invokeOrFallback(
      'memory_sync_once',
      { request: { endpoint: endpoint ?? null } },
      () => readFallback(FALLBACK_SYNC_STATUS_KEY, defaultSyncStatus())
    );
  }
};
