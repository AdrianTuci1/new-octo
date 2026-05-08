import { buildApprovalReason } from '../helpers';
import type { ToolCallHandler } from './types';

function getCommandText(command: unknown) {
  return typeof command === 'string' ? command.trim() : '';
}

function looksLikeWebLookup(command: string, reason: unknown) {
  const normalized = `${command} ${typeof reason === 'string' ? reason : ''}`.toLowerCase();
  const webIntentKeywords = [
    'web search',
    'search web',
    'search',
    'look up',
    'lookup',
    'find',
    'news',
    'știri',
    'stiri',
    'fotbal',
    'sport',
    'sports',
    'recent',
    'latest',
    'current',
    'actual',
    'internet',
    'online',
    'web',
    'pagina',
    'site',
    'link',
    'bbc',
    'google',
    'bing',
    'duckduckgo',
    'curl ',
    'wget ',
    'http://',
    'https://',
    'www.',
    'browser ',
    'open '
  ];

  if (webIntentKeywords.some((needle) => normalized.includes(needle))) {
    return true;
  }

  if (/^(echo|printf)\b/i.test(command)) {
    return [
      'știri',
      'stiri',
      'news',
      'fotbal',
      'sport',
      'search',
      'web',
      'internet',
      'recent',
      'latest',
      'actual'
    ].some((needle) => normalized.includes(needle));
  }

  return false;
}

function buildWebLookupQuery(toolCall: { args: any }) {
  const command = getCommandText(toolCall.args?.command);
  if (!command) return '';

  const quoted = command.match(/["'`](.+?)["'`]/s)?.[1]?.trim();
  const body = quoted ?? command;

  const stripped = body
    .replace(/^\s*(echo|printf)\s+/i, '')
    .replace(/\b(curl|wget)\b/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped) {
    return stripped;
  }

  const reason = typeof toolCall.args?.reason === 'string' ? toolCall.args.reason.trim() : '';
  return reason;
}

export const terminalCommandToolCallHandler: ToolCallHandler = {
  names: ['propose_terminal_command'],
  handle: ({ registrations, toolCall }) => {
    const command = getCommandText(toolCall.args.command);
    const reason = buildApprovalReason(command, toolCall.args.reason);
    const isWebLookupCommand = command.length > 0 && looksLikeWebLookup(command, toolCall.args.reason);

    registrations.forEach((registration) => {
      if (isWebLookupCommand) {
        const query = buildWebLookupQuery(toolCall);
        if (query) {
          registration.onWebSearch?.({
            toolCallId: toolCall.id,
            query,
            maxResults: 5
          });
        }
        return;
      }

      registration.update((message) => ({
        ...message,
        body: message.body.trim().length > 0 ? message.body : reason
      }));

      if (command && registration.onCommandApproval) {
        registration.onCommandApproval({
          kind: 'command',
          command,
          toolCallId: toolCall.id,
          reason
        });
      }
    });
  }
};
