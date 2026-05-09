import { normalizeToolFollowUpSuggestion, parseToolFollowUpConfidence, stripFollowUpBoilerplate } from '../parsers';
import type { ToolCallHandler } from './types';

const FOLLOW_UP_MIN_CONFIDENCE = 0.7;

export const followUpToolCallHandler: ToolCallHandler = {
  names: ['suggest_follow_up'],
  recordRawToolCall: false,
  handle: ({ registrations, toolCall }) => {
    const confidence = parseToolFollowUpConfidence(toolCall.args);
    const followUpSuggestion = normalizeToolFollowUpSuggestion(toolCall.args);
    const isConfidentEnough = typeof confidence === 'number' && confidence >= FOLLOW_UP_MIN_CONFIDENCE;

    registrations.forEach((registration) => {
      registration.update((message) => ({
        ...message,
        body: stripFollowUpBoilerplate(message.body),
        followUpSuggestion: isConfidentEnough && message.body.trim().length > 0 ? followUpSuggestion : undefined
      }));
    });
  }
};
