
import { useRef } from 'react';

/**
 * Module: useLauncherRefs
 * 
 * Dictionary:
 * - shellRef: Reference to the terminal/shell DOM element for focus management.
 * - dockRef: Reference to the dock container for positioning calculations.
 * - pendingConversationAnchorRef: Stores metadata for a conversation being created but not yet synced.
 * - seededConversationAnchorTimesRef: Mapping of conversation IDs to their start times for timeline linking.
 * - pendingAutoSubmitPromptRef: Holds a prompt that should be automatically submitted upon agent surface mount.
 * - suppressComposerShellAutodetectRef: Suppresses shell autodetection while the initial seed prompt is unchanged.
 */
export function useLauncherRefs() {
  const shellRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const pendingConversationAnchorRef = useRef<{ conversationId: string; startedAt: string } | null>(null);
  const seededConversationAnchorTimesRef = useRef<Record<string, string>>({});
  const pendingAutoSubmitPromptRef = useRef<string | null>(null);
  const suppressComposerShellAutodetectRef = useRef<string | null>(null);

  return {
    shellRef,
    dockRef,
    pendingConversationAnchorRef,
    seededConversationAnchorTimesRef,
    pendingAutoSubmitPromptRef,
    suppressComposerShellAutodetectRef
  };
}
