import type { MemoryConversationRecord } from '../types/memory';
import { ChatMessageModel } from './ChatMessage';

/**
 * ChatConversationModel
 * ───────────────────────────────────────────
 * Pattern: **Aggregate Root** (owns ChatMessageModels)
 * Read-only projection of a MemoryConversationRecord with computed accessors.
 */
export class ChatConversationModel {
  readonly id: string;
  readonly title: string;
  readonly messages: ChatMessageModel[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: string;

  constructor(record: MemoryConversationRecord) {
    this.id = record.id;
    this.title = record.title ?? '';
    this.messages = ChatMessageModel.fromRaw(record.messages ?? []);
    this.createdAt = record.createdAt ?? '';
    this.updatedAt = record.updatedAt ?? '';
    this.status = record.status ?? 'active';
  }

  get lastMessage(): ChatMessageModel | null {
    return this.messages[this.messages.length - 1] ?? null;
  }

  get messageCount(): number {
    return this.messages.length;
  }

  isEmpty(): boolean {
    return this.messages.length === 0;
  }
}
