import type { ChatMessage } from '../types/chat';

/**
 * ChatMessageModel
 * ───────────────────────────────────────────
 * Pattern: **Value Object** (wraps plain ChatMessage with domain methods)
 * Immutable read model; withBody / markStreamingComplete return new instances.
 */
export class ChatMessageModel {
  readonly raw: ChatMessage;

  constructor(message: ChatMessage) {
    this.raw = message;
  }

  get id(): string { return this.raw.id; }
  get role(): string { return this.raw.role; }
  get body(): string { return this.raw.body; }
  get isAssistant(): boolean { return this.raw.role === 'assistant'; }
  get isUser(): boolean { return this.raw.role === 'user'; }
  get isSystem(): boolean { return this.raw.role === 'system'; }
  get isToolResult(): boolean { return this.raw.role === 'tool'; }
  get isStreaming(): boolean { return this.raw.isStreaming ?? false; }
  get createdAt(): string | undefined { return this.raw.createdAt; }

  isEmpty(): boolean {
    return this.raw.body.trim().length === 0;
  }

  withBody(body: string): ChatMessageModel {
    return new ChatMessageModel({ ...this.raw, body });
  }

  markStreamingComplete(): ChatMessageModel {
    return new ChatMessageModel({ ...this.raw, isStreaming: false });
  }

  static fromRaw(messages: ChatMessage[]): ChatMessageModel[] {
    return messages.map((m) => new ChatMessageModel(m));
  }

  static toRaw(models: ChatMessageModel[]): ChatMessage[] {
    return models.map((m) => m.raw);
  }
}
