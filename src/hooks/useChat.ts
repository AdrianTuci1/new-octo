import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import type { ChatMessage } from '../types/chat';

export function useChat() {
  const { query, setQuery, messages, setMessages, addMessage, clearMessages } = useChatStore();
  const { setTrayMode } = useUIStore();

  const submitQuery = () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (trimmed === '/new') {
      clearMessages();
      setQuery('');
      setTrayMode('closed');
      return;
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      title: 'User',
      body: trimmed
    };

    addMessage(userMsg);
    setQuery('');
    setTrayMode('closed');

    // Simulate assistant response
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        title: 'Assistant',
        body: `I can help you with that. To undo your last commit while keeping your changes staged, use:

\`\`\`bash
git reset --soft HEAD~1
\`\`\`

Is there anything else you'd like to know?`
      };
      addMessage(assistantMsg);
    }, 800);
  };

  return {
    query,
    setQuery,
    messages,
    submitQuery,
    clearMessages
  };
}
