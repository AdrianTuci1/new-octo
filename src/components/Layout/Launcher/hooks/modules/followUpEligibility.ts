const FOLLOW_UP_MIN_CONFIDENCE = 0.7;

export function isFollowUpSuggestionEligible(
  suggestion: { value?: string; confidence?: number } | null | undefined
) {
  if (!suggestion?.value?.trim()) return false;
  if (typeof suggestion.confidence !== 'number') return true;
  return suggestion.confidence >= FOLLOW_UP_MIN_CONFIDENCE;
}

export function assistantMessageCanSurfaceFollowUp(message: {
  role?: string;
  isError?: boolean;
  status?: string;
  isStreaming?: boolean;
} | null | undefined) {
  return message?.role === 'assistant'
    && !message.isError
    && message.status === 'completed'
    && !message.isStreaming;
}
