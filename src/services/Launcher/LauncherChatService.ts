import type { StoreApi } from 'zustand/vanilla';
import type { ChatMessage, ChatAttachment } from '../../types/chat';
import type { ComposerMode } from '../../types/ui';

export interface ChatStoreState {
  query: string;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  modeLock: ComposerMode | null;
  autodetectedShellLatch: boolean;
  setQuery: (query: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setModeLock: (mode: ComposerMode | null) => void;
  setAutodetectedShellLatch: (latch: boolean) => void;
}

/**
 * Manages the Launcher chat surface — query state, message list, attachments,
 * and mode/shell toggles.
 */
export class LauncherChatService {
  constructor(private readonly store: StoreApi<ChatStoreState>) {}

  /** Set the composer query text. */
  setQuery(query: string): void {
    this.store.getState().setQuery(query);
  }

  /** Clear all chat messages. */
  clearMessages(): void {
    this.store.getState().setMessages([]);
  }

  /** Submit the current query. Placeholder — no-op for now. */
  submitQuery(): void {
    // Placeholder — no-op for now
  }

  /** Add a chat attachment. */
  addAttachment(attachment: ChatAttachment): void {
    const state = this.store.getState();
    const current = state.attachments ?? [];
    if (!current.some((a) => a.id === attachment.id)) {
      this.store.setState({ attachments: [...current, attachment] } as Partial<ChatStoreState>);
    }
  }

  /** Remove an attachment by id. */
  removeAttachment(id: string): void {
    const state = this.store.getState();
    const current = state.attachments ?? [];
    this.store.setState({ attachments: current.filter((a) => a.id !== id) } as Partial<ChatStoreState>);
  }

  /** Remove all attachments. */
  clearAttachments(): void {
    this.store.setState({ attachments: [] } as Partial<ChatStoreState>);
  }

  /** Toggle or set the mode lock. */
  toggleModeLock(mode: ComposerMode | null): void {
    const state = this.store.getState();
    if (mode === null) {
      state.setModeLock(null);
    } else if (state.modeLock === mode) {
      state.setModeLock(null);
    } else {
      state.setModeLock(mode);
    }
  }

  /** Set autodetected shell latch value. */
  setAutodetectedShellLatch(value: boolean): void {
    this.store.getState().setAutodetectedShellLatch(value);
  }
}
