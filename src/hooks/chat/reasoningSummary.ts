export function summarizeReasoningText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const summary = sentences.length > 0
    ? sentences.slice(0, 3).join(' ')
    : normalized;

  if (summary.length <= 220) {
    return summary;
  }

  const clipped = summary.slice(0, 217).replace(/\s+\S*$/, '');
  return `${clipped}...`;
}
