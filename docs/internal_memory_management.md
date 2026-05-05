# Internal Memory & Session Management

This document outlines how the application manages internal state, chat sessions, and data persistence, based on the Warp architecture.

## 1. Workspace Hierarchy

The application state is managed in a strictly hierarchical manner to ensure consistency and performance.

| Level | Component | Responsibility |
| :--- | :--- | :--- |
| **Global** | `WorkspaceRegistry` | Keeps track of all open workspaces and windows. |
| **Window** | `Workspace` | Manages tabs, panes, and window-level modals. |
| **Session** | `ActiveSession` | Tracks the currently focused tab/pane and user context. |
| **Pane** | `TerminalModel` | Stores the actual terminal state, buffer, and history for a specific view. |

### Key Concept: Singleton Entities
Core managers (Settings, Feature Flags, AI Managers) are implemented as **Singletons**. They exist as a single instance in memory, accessible across the entire application context, ensuring that a setting change in one tab is immediately reflected everywhere.

## 2. AI Chat Sessions (Conversations)

Chat sessions are more complex than simple message logs. They are structured as a **Task-based Tree**.

### Data Structure: `AIConversation`
- **TaskStore**: Instead of a flat list, messages are grouped into `Exchanges` (User Input + AI Output).
- **Sub-tasks**: Agents can spawn sub-tasks (e.g., executing a command to verify code), which are nested within the main conversation tree.
- **Artifacts**: References to non-textual outputs (PRs, plans, screenshots) are stored alongside the conversation.

### Persistence Strategy
1. **In-Memory**: Active conversations are kept in memory for zero-latency interaction.
2. **Local DB (SQLite)**: Every exchange is persisted to a local database.
3. **Restoration**: On startup, the application performs a `new_restored` flow, rebuilding the `TaskStore` from the local database records.
4. **Cloud Sync**: A `server_conversation_token` is used to sync the local state with the backend, enabling cross-device sessions.

## 3. Warp Drive & Object Indexing

The Drive manages shared knowledge (Workflows, Notebooks, Environment Variables).

### Efficient Indexing
To handle large amounts of data without bloating memory:
- **Lazy Loading**: Only the object metadata (IDs and titles) is kept in the main index.
- **Sorted Orders**: The application maintains a `HashMap<Location, Vec<ObjectUid>>` to track the order of items without keeping the full objects in memory.
- **SyncQueue**: All changes (create, rename, move) are added to a `SyncQueue` which handles background synchronization with the server, including retry logic and conflict resolution.

## 4. Resource Management Best Practices

- **Reference Counting**: Use `Arc<FairMutex<T>>` for heavy models that need to be shared across threads.
- **View Handles**: Use `ViewHandle<T>` or `ModelHandle<T>` for UI components to avoid memory leaks and ensure safe cleanup when a tab is closed.
- **Event-Driven**: State changes are propagated via an Event system (`emit` / `subscribe`), preventing tight coupling between the data layer and the UI.

## 5. Octomus Memory Module

Octomus now has a local-first memory layer in `src-tauri/src/memory/mod.rs`, exposed to React through `src/lib/octomusMemory.ts` and the singleton Zustand store in `src/stores/memoryStore.ts`.

### Local Storage Layout

All durable local state lives under the global user path:

```text
~/.octomus/
  ai-provider.json
  memory/v1/
    meta.json
    settings.json
    workspace_snapshot.json
    conversation_index.json
    conversations/<conversation-id>.json
    cloud_objects_index.json
    cloud_objects/<object-uid>.json
    sync_queue.json
```

### What Is Persisted

- **Workspace snapshot**: open tabs, active tab, settings section, sidebar state, agent panel state, and conversation list.
- **Settings**: selected model, remembered working directory, terminal autodetect preference, telemetry/sync-ready values.
- **Conversations**: raw chat messages plus a derived root task, exchange list, tool-call subtasks, artifacts, status, model, cwd, and optional server token.
- **Drive-style objects**: lazy-loaded `CloudObject` records with a lightweight index: `objectsByUid` and `sortedOrdersByLocation`.
- **Sync queue**: every local mutation can enqueue an operation. If no server endpoint is configured, sync remains `localOnly` and never throws user-facing errors.

### Backend Connection Contract

The current server handoff is intentionally simple:

1. UI/Rust writes local state immediately.
2. A sync operation is appended to `sync_queue.json`.
3. `memory_sync_once` posts `{ schemaVersion, deviceId, operations }` to the configured endpoint when one exists.
4. Failed sync attempts keep the queue intact and mark operations for retry instead of breaking the app.

This means the app is already usable offline, while the backend can later accept the queued operation contract without changing the UI surface.
