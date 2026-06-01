import type { Components } from 'react-markdown';
import type { ChatMessage } from '../../../types/chat';
import { ImplementationPlanBlock, WebSearchBlock, WorkspaceExplorationBlock } from '../blocks';
import { openExecutionPlanInEditor } from './executionPlan';
import { MarkdownRenderer, openMarkdownLink } from './markdownRenderer';
import type { MessageBubbleOpenFile } from './types';

type ToolMessageContentProps = {
  components: Components;
  message: ChatMessage;
  openFile: MessageBubbleOpenFile;
};

export function ToolMessageContent({ components, message, openFile }: ToolMessageContentProps) {
  if (message.toolKind === 'web-search') {
    return (
      <div className="tool-output-web-search">
        <WebSearchBlock
          status={message.webSearchStatus}
          results={message.webSearchResults ?? []}
          query={message.webSearchQuery}
          onOpenResult={(url) => {
            void openMarkdownLink(url, openFile);
          }}
        />
        {(!message.webSearchResults || message.webSearchResults.length === 0) && message.body.trim().length > 0 && (
          <MarkdownRenderer
            body={message.body}
            className="tool-output-raw tool-output-web-search-fallback"
            components={components}
          />
        )}
      </div>
    );
  }

  if (message.toolKind === 'workspace-exploration' && message.workspaceExploration) {
    return (
      <div className="tool-output-workspace-exploration">
        <WorkspaceExplorationBlock
          exploration={message.workspaceExploration}
          isStreaming={message.isStreaming}
        />
      </div>
    );
  }

  if (message.toolKind === 'plan' && message.executionPlan) {
    const executionPlan = message.executionPlan;
    return (
      <div className="tool-output-plan">
        <ImplementationPlanBlock
          title={executionPlan.title}
          version={executionPlan.version ?? 'v1'}
          onClick={() => {
            openExecutionPlanInEditor(executionPlan, openFile);
          }}
        />
      </div>
    );
  }

  if (message.toolKind === 'file-change' && message.fileDiffs?.length) {
    return null;
  }

  return (
    <MarkdownRenderer
      body={message.body}
      className="tool-output-raw"
      components={components}
    />
  );
}
