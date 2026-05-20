export type ComposerContextMentionKind = 'file' | 'folder' | 'function' | 'code' | 'skill' | 'rule';

export type ComposerContextMention = {
  kind: ComposerContextMentionKind;
  value: string;
  raw: string;
};

export type ComposerContextMentionSpan = ComposerContextMention & {
  start: number;
  end: number;
};

export type ComposerContextTrigger = {
  start: number;
  end: number;
  value: string;
  raw: string;
};

function createContextMentionRegex() {
  return /@(file|folder|function|code|skill|rule)\(([^)]+)\)/g;
}

export function serializeComposerContextMention(kind: ComposerContextMentionKind, value: string) {
  return `@${kind}(${value})`;
}

export function hasComposerContextMentions(query: string) {
  return createContextMentionRegex().test(query);
}

export function getTrailingComposerContextTrigger(query: string): ComposerContextTrigger | null {
  const match = query.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) {
    return null;
  }

  const matchIndex = match.index ?? 0;
  const matchStart = match[0].startsWith(' ') ? matchIndex + 1 : matchIndex;
  const raw = match[0].trimStart();

  return {
    start: matchStart,
    end: query.length,
    value: match[1] ?? '',
    raw
  };
}

export function parseComposerContextMentions(query: string) {
  const mentions: ComposerContextMention[] = [];
  const regex = createContextMentionRegex();

  query.replace(regex, (raw, kind: ComposerContextMentionKind, value: string) => {
    mentions.push({
      kind,
      value,
      raw
    });
    return raw;
  });

  const promptWithoutMentions = query
    .replace(createContextMentionRegex(), ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    mentions,
    promptWithoutMentions
  };
}

export function getComposerContextMentionSpans(query: string) {
  const spans: ComposerContextMentionSpan[] = [];
  const regex = createContextMentionRegex();

  query.replace(regex, (raw, kind: ComposerContextMentionKind, value: string, offset: number) => {
    spans.push({
      kind,
      value,
      raw,
      start: offset,
      end: offset + raw.length
    });
    return raw;
  });

  return spans;
}

export function getComposerContextMentionDeletionRange(
  query: string,
  selectionStart: number,
  selectionEnd: number
) {
  if (selectionStart !== selectionEnd) {
    return null;
  }

  const caret = selectionStart;
  const spans = getComposerContextMentionSpans(query);
  const containingSpan = spans.find((span) => caret >= span.start && caret <= span.end);
  if (containingSpan) {
    return {
      start: containingSpan.start,
      end: containingSpan.end
    };
  }

  const trailingSpan = spans
    .slice()
    .reverse()
    .find((span) => span.end <= caret && query.slice(span.end, caret).trim().length === 0);

  if (!trailingSpan) {
    return null;
  }

  return {
    start: trailingSpan.start,
    end: caret
  };
}

function getComposerContextMentionDisplayValue(value: string) {
  const trimmed = value.trim().replace(/[\\/]+$/, '');
  if (!trimmed) {
    return value.trim();
  }

  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}

export function buildComposerContextSummary(mentions: ComposerContextMention[]) {
  if (mentions.length === 0) {
    return '';
  }

  return [
    'Context references:',
    ...mentions.map((mention) => {
      const label = mention.kind === 'function'
        ? 'Function'
        : mention.kind === 'code'
          ? 'Code match'
          : mention.kind === 'skill'
            ? 'Skill'
            : mention.kind === 'rule'
              ? 'Rule'
          : mention.kind === 'folder'
            ? 'Folder'
            : 'File';
      const displayValue = mention.kind === 'file' || mention.kind === 'folder' || mention.kind === 'function' || mention.kind === 'code'
        ? getComposerContextMentionDisplayValue(mention.value)
        : mention.value;

      return `- ${label}: ${displayValue}`;
    })
  ].join('\n');
}

export function splitComposerTextForHighlight(text: string) {
  const segments: Array<{ text: string; className?: string }> = [];
  let lastIndex = 0;
  const regex = createContextMentionRegex();

  text.replace(regex, (raw, _kind: ComposerContextMentionKind, _value: string, offset: number) => {
    if (offset > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, offset)
      });
    }

    segments.push({
      text: raw,
      className: 'composer-input-highlight-mention'
    });
    lastIndex = offset + raw.length;
    return raw;
  });

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex)
    });
  }

  return segments;
}
