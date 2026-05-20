import { COMMAND_ITEMS } from '../../lib/constants';
import { hasComposerContextMentions, splitComposerTextForHighlight } from './contextMentions';

type SlashCommandHighlightProps = {
  query: string;
  extraClassName?: string;
};

const KNOWN_SLASH_COMMANDS = new Set(COMMAND_ITEMS.map((item) => item.label));

function splitSlashCommand(query: string) {
  if (!query.startsWith('/')) {
    return null;
  }

  const match = query.match(/^(\/\S+)([\s\S]*)$/);
  if (!match) {
    return null;
  }

  return {
    command: match[1],
    remainder: match[2] ?? ''
  };
}

export function hasCompleteSlashCommand(query: string) {
  const parts = splitSlashCommand(query);
  return Boolean(parts && KNOWN_SLASH_COMMANDS.has(parts.command));
}

export function SlashCommandHighlight({ query, extraClassName = '' }: SlashCommandHighlightProps) {
  const parts = splitSlashCommand(query);
  const hasSlashCommand = Boolean(parts && KNOWN_SLASH_COMMANDS.has(parts.command));
  const hasMentions = hasComposerContextMentions(query);

  if (!hasSlashCommand && !hasMentions) {
    return null;
  }

  const highlightSource = hasSlashCommand ? (parts?.remainder ?? '') : query;
  const mentionSegments = hasMentions
    ? splitComposerTextForHighlight(highlightSource)
    : [{ text: highlightSource }];

  return (
    <div
      aria-hidden="true"
      className={`composer-input-highlight ${extraClassName}`.trim()}
    >
      {hasSlashCommand ? (
        <span className="composer-input-highlight-command">{parts?.command ?? ''}</span>
      ) : null}
      {mentionSegments.map((segment, index) => (
        <span
          key={`${segment.text}-${index}`}
          className={segment.className ?? 'composer-input-highlight-rest'}
        >
          {segment.text}
        </span>
      ))}
    </div>
  );
}
