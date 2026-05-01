export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  title: string;
  body: string;
};

export type Conversation = {
  id: string;
  messages: ChatMessage[];
};
