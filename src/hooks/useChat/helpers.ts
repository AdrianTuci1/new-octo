import type { ChatMessage, AgentInputMessage } from '../../types/chat';
import type { TerminalCommandBlock } from '../../types/terminal';
import { visibleChatMessageBody } from './parsers';

export const FOLLOW_UP_START = '<octomus_follow_up>';
export const FOLLOW_UP_END = '</octomus_follow_up>';

export function buildApprovalReason(command?: string, suggestedReason?: string) {
  if (suggestedReason?.trim()) return suggestedReason.trim();
  if (!command?.trim()) {
    return 'Am cerut accesul pentru a rula o comandă în terminal și a verifica rezultatul.';
  }

  const normalized = command.trim().toLowerCase();
  if (normalized.startsWith('git status')) {
    return 'Am cerut accesul pentru verificarea statusului repository-ului.';
  }

  return 'Am cerut accesul pentru a rula o comandă în terminal și a verifica rezultatul.';
}

export function buildToolResultFollowupPrompt(command?: string) {
  const commandLine = command
    ? `Comanda aprobată și executată a fost: \`${command}\`. `
    : '';

  return `${commandLine}Utilizatorul vede deja output-ul brut în blocul de terminal. Răspunde în română, pe scurt, astfel:
1. Confirmă că ai verificat rezultatul.
2. Rezumă ce ai observat fără să repeți output-ul brut.
3. Oferă ajutor suplimentar doar condițional, fără să presupui că utilizatorul vrea stage, commit sau alte modificări.`;
}

export function chatHistoryFromMessages(messages: ChatMessage[]): AgentInputMessage[] {
  return messages
    .filter((message) => {
      if (message.isError) return false;
      if (message.body.trim().length > 0) return true;
      if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) return true;
      if (message.role === 'tool') return true;
      return false;
    })
    .map((message) => ({
      role: message.role,
      content: stripFollowUpMetadata(message.body),
      toolCallId: message.toolCallId,
      toolCalls: message.toolCalls
    }));
}

export function stripFollowUpMetadata(value: string) {
  return visibleChatMessageBody(value);
}

export function cleanTitleText(value: string) {
  return value
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleFromMessages(messages: ChatMessage[]) {
  const firstAssistant = messages.find((message) => (
    message.role === 'assistant'
    && !message.isError
    && message.body.trim().length > 0
  ));
  const firstUser = messages.find((message) => message.role === 'user' && message.body.trim().length > 0);
  const source = cleanTitleText(firstAssistant?.body ?? firstUser?.body ?? '');
  if (!source) return 'New agent conversation';

  const sentence = source.split(/(?<=[.!?])\s+/)[0] ?? source;
  return sentence.length > 80 ? `${sentence.slice(0, 77)}...` : sentence;
}

export function titleFromConversationContent(messages: ChatMessage[], terminalBlocks: TerminalCommandBlock[]) {
  const messageTitle = titleFromMessages(messages);
  if (messageTitle !== 'New agent conversation') {
    return messageTitle;
  }

  const firstCommand = terminalBlocks.find((block) => block.command.trim().length > 0)?.command.trim();
  if (!firstCommand) {
    return messageTitle;
  }

  const cleanedCommand = cleanTitleText(firstCommand);
  return cleanedCommand.length > 80 ? `${cleanedCommand.slice(0, 77)}...` : cleanedCommand;
}

export function sameMessages(left: ChatMessage[], right: ChatMessage[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const candidate = right[index];
    return candidate
      && candidate.id === message.id
      && candidate.role === message.role
      && candidate.body === message.body
      && candidate.runId === message.runId
      && candidate.status === message.status
      && candidate.isStreaming === message.isStreaming
      && candidate.isError === message.isError
      && candidate.toolCallId === message.toolCallId
      && JSON.stringify(candidate.toolCalls ?? []) === JSON.stringify(message.toolCalls ?? [])
      && JSON.stringify(candidate.followUpSuggestion ?? null) === JSON.stringify(message.followUpSuggestion ?? null)
      && JSON.stringify(candidate.usage ?? null) === JSON.stringify(message.usage ?? null);
  });
}

export function statusFromMessages(messages: ChatMessage[]) {
  if (messages.some((message) => message.isError)) {
    return 'error';
  }

  if (messages.some((message) => message.isStreaming)) {
    return 'inProgress';
  }

  return 'success';
}

export function statusFromConversationContent(messages: ChatMessage[], terminalBlocks: TerminalCommandBlock[]) {
  const messageStatus = statusFromMessages(messages);
  if (messageStatus !== 'success') {
    return messageStatus;
  }

  return terminalBlocks.some((block) => block.status === 'running') ? 'inProgress' : messageStatus;
}
