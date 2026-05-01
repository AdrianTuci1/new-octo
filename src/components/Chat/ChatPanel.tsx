import { useRef, useEffect } from 'react';
import './ChatPanel.css';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../types/chat';

type ChatPanelProps = {
  messages: ChatMessage[];
  isOpen: boolean;
};

export function ChatPanel({ messages, isOpen }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className={`chat-region ${isOpen ? 'open' : 'closed'}`}>
      {messages.length > 0 ? (
        <div ref={scrollRef} className="chat-scroll">
          <div className="chat-spacer" />
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      ) : (
        <div className="chat-empty">
          <div className="chat-empty-kicker">Warp AI</div>
          <h1>How can I help you today?</h1>
          <p>
            Ask a question, find a command, or troubleshoot an issue. 
            Octomus AI is here to help you move faster.
          </p>
          <div className="suggestions-row">
            <button className="suggestion-chip">How do I undo a git commit?</button>
            <button className="suggestion-chip">Find all files larger than 1GB</button>
            <button className="suggestion-chip">Explain my last terminal error</button>
          </div>
        </div>
      )}
    </div>
  );
}
