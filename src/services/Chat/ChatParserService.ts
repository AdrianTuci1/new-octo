/**
 * ChatParserService
 * ───────────────────────────────────────────
 * Pattern: **Strategy** (stateless parsing functions — each is a pluggable algorithm)
 * Re-exports the full parser suite from hooks/useChat/parsers.
 */
export {
  stripThinkingBlocks,
  stripHarnessProtocolArtifacts,
  visibleChatMessageBody,
  followUpSuggestionFromMessageBody,
  pendingFollowUpPrefixLength,
  normalizeToolFollowUpSuggestion,
  parseToolFollowUpConfidence,
  stripFollowUpBoilerplate,
  extractRobustJsonFollowUpSuggestion,
  extractInlinePlanArtifact,
  extractInlineFileChangeApproval,
} from '../../hooks/chat/parsers';
