import { COMMAND_ITEMS } from '../../lib/constants';

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
  if (!parts || !KNOWN_SLASH_COMMANDS.has(parts.command)) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`composer-input-highlight ${extraClassName}`.trim()}
    >
      <span className="composer-input-highlight-command">{parts.command}</span>
      <span className="composer-input-highlight-rest">{parts.remainder}</span>
    </div>
  );
}
