import { useRef } from 'react';
import './ChatPanel.css';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  title: string;
  body: string;
};

type ChatPanelProps = {
  messages: ChatMessage[];
  isOpen: boolean;
  dockOffset: number;
};

export function ChatPanel({ messages, isOpen, dockOffset }: ChatPanelProps) {
  const regionRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={regionRef}
      className={`chat-region ${isOpen ? 'open' : 'closed'}`}
      style={{ inset: `0 0 ${dockOffset}px 0` }}
    >
      {messages.length > 0 ? (
        <div className="chat-scroll">
          {messages.map((message) => (
            <article key={message.id} className={`chat-bubble ${message.role}`}>
              <div className="chat-bubble-title">{message.title}</div>
              <p>{message.body}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="chat-empty">
          <div className="chat-empty-kicker">Chat</div>
          <p>Conversation appears only when help or tools mode is open.</p>
        </div>
      )}
    </div>
  );
}
