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
