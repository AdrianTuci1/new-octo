import { useMemo, type KeyboardEvent } from 'react';
import type { LauncherViewModel } from '../Layout/Launcher/hooks';
import { requestComposerInputSelection } from './composerInputSelection';
import { hasComposerContextMentions } from './contextMentions';
import { hasCompleteSlashCommand } from './SlashCommandHighlight';
import { useComposerBar } from './useComposerBar';

type TerminalComposerView = LauncherViewModel['views']['terminalComposer'];

export function useTerminalComposerController(view: TerminalComposerView) {
  const { inputRef, shellRef } = useComposerBar(view.query, undefined, { autoFocus: true });
  const completionItems = useMemo(() => view.completionState?.completions ?? [], [view.completionState?.completions]);
  const showRecommendation = Boolean(view.recommendedAction) && view.query.trim().length === 0;
  const predictionSuffix = view.prediction?.completionText ?? '';
  const showSlashCommandHighlight = hasCompleteSlashCommand(view.query);
  const showContextMentionHighlight = hasComposerContextMentions(view.query);
  const showCompletionPanel = Boolean(view.completionState) && (
    view.completionState?.status === 'running'
    || completionItems.length > 0
    || view.completionState?.promptVisible
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'ArrowRight' && view.prediction?.fullCommand) {
      event.preventDefault();
      event.stopPropagation();
      view.onQueryChange(view.prediction.fullCommand);
      requestComposerInputSelection(inputRef, view.prediction.fullCommand.length);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      view.onLaunchAgentComposer(view.query.trim(), true);
      return;
    }

    if (event.key === 'Enter' && view.query.trim() === '/agent') {
      event.preventDefault();
      view.onLaunchAgentComposer();
      return;
    }

    if (event.key === 'Enter' && view.query.trim() === '/') {
      event.preventDefault();
      view.onOpenCommandsTray();
      return;
    }

    view.onKeyDown(event);
  };

  return {
    completionItems,
    handleKeyDown,
    inputRef,
    predictionSuffix,
    shellRef,
    showCompletionPanel,
    showContextMentionHighlight,
    showRecommendation,
    showSlashCommandHighlight
  };
}
