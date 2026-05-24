import type { FileDiff } from '../types/diff';

export type FileDiffPreviewStatus = 'pending' | 'accepted' | 'rejected';

export function getFileDiffBaseContent(diff: FileDiff) {
  if (diff.diffType.kind === 'create') {
    return '';
  }

  return diff.originalContent ?? '';
}

export function applyFileDiffToContent(baseContent: string, diff: FileDiff) {
  if (diff.diffType.kind === 'create') {
    return diff.diffType.delta.insertion;
  }

  if (diff.diffType.kind === 'delete') {
    return '';
  }

  const lines = baseContent === '' ? [] : baseContent.split('\n');
  const sortedDeltas = [...diff.diffType.deltas].sort((left, right) => (
    right.replacement_line_range.start - left.replacement_line_range.start
  ));

  sortedDeltas.forEach((delta) => {
    const start = Math.max(0, delta.replacement_line_range.start - 1);
    const end = Math.max(start, delta.replacement_line_range.end - 1);
    const insertionLines = delta.insertion === '' ? [] : delta.insertion.split('\n');
    lines.splice(start, Math.max(0, end - start), ...insertionLines);
  });

  return lines.join('\n');
}

function countLinesForReplacement(value: string) {
  if (!value) {
    return 0;
  }

  return value.replace(/\n+$/g, '').split('\n').length;
}

export function canEditFileDiffInline(diff: FileDiff) {
  return diff.diffType.kind === 'create' || typeof diff.originalContent === 'string';
}

export function buildEditedFileDiff(diff: FileDiff, editedContent: string) {
  if (diff.diffType.kind === 'create') {
    return {
      ...diff,
      diffType: {
        kind: 'create' as const,
        delta: {
          replacement_line_range: { start: 1, end: 1 },
          insertion: editedContent
        }
      }
    };
  }

  if (diff.diffType.kind === 'delete') {
    return diff;
  }

  const originalContent = getFileDiffBaseContent(diff);
  const lineCount = countLinesForReplacement(originalContent);

  return {
    ...diff,
    diffType: {
      kind: 'update' as const,
      deltas: [{
        replacement_line_range: {
          start: 1,
          end: lineCount + 1
        },
        insertion: editedContent
      }],
      rename: diff.diffType.rename
    }
  };
}
