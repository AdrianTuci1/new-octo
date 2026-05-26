import type { ChatAttachment } from '../../types/chat';

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'csv',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'sh',
  'bash',
  'zsh',
  'css',
  'html',
  'htm',
  'xml',
  'toml',
  'ini',
  'env',
  'go',
  'rs',
  'c',
  'h',
  'hpp',
  'cpp',
  'cc',
  'java',
  'kt',
  'kts',
  'swift',
  'rb',
  'php',
  'sql',
  'graphql',
  'gql'
]);

const TEXT_CONTENT_LIMIT = 12000;

function extensionFromName(name: string) {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] ?? '' : '';
}

function isTextLikeFile(file: File) {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith('text/')) {
    return true;
  }

  if (mimeType === 'application/json' || mimeType === 'application/xml' || mimeType === 'application/yaml') {
    return true;
  }

  return TEXT_EXTENSIONS.has(extensionFromName(file.name));
}

function isImageFile(file: File) {
  return file.type.toLowerCase().startsWith('image/');
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'unknown size';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

async function readTextPayload(file: File): Promise<Pick<ChatAttachment, 'content' | 'truncated'>> {
  const rawContent = await file.text();
  if (rawContent.length <= TEXT_CONTENT_LIMIT) {
    return { content: rawContent, truncated: false };
  }

  return {
    content: `${rawContent.slice(0, TEXT_CONTENT_LIMIT).trimEnd()}\n\n... (truncated)`,
    truncated: true
  };
}

export async function buildAttachmentsFromFiles(files: File[]): Promise<ChatAttachment[]> {
  const attachments = await Promise.all(files.map(async (file, index) => {
    const kind: ChatAttachment['kind'] = isImageFile(file)
      ? 'image'
      : isTextLikeFile(file)
        ? 'text'
        : 'binary';

    const id = globalThis.crypto?.randomUUID?.() ?? `attachment-${Date.now()}-${index}`;
    const base: ChatAttachment = {
      id,
      name: file.name,
      size: file.size,
      mimeType: file.type || null,
      kind
    };

    if (kind !== 'text') {
      return base;
    }

    return {
      ...base,
      ...(await readTextPayload(file))
    };
  }));

  return attachments;
}

export function formatAttachmentSummary(attachment: ChatAttachment) {
  return `- ${attachment.name} • ${attachment.mimeType || attachment.kind} • ${formatBytes(attachment.size)}`;
}

export function buildAttachmentContextText(attachments: ChatAttachment[]) {
  if (attachments.length === 0) {
    return '';
  }

  return [
    'Attached files:',
    ...attachments.map((attachment) => {
      const header = formatAttachmentSummary(attachment);
      if (attachment.kind !== 'text' || !attachment.content?.trim()) {
        return `${header}\n  [${attachment.kind} attachment included as metadata only]`;
      }

      return `${header}\n  Content:\n${indentBlock(attachment.content, 4)}`;
    })
  ].join('\n');
}

function indentBlock(text: string, spaces: number) {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}
