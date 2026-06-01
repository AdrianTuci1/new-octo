import type { Components } from 'react-markdown';
import type { ChatMessage } from '../../../types/chat';
import { ThinkingBlock } from '../blocks';
import { MarkdownRenderer } from './markdownRenderer';
import { ToolMessageContent } from './ToolMessageContent';
import type { MessageBubbleOpenFile, MessageBubbleViewModel } from './types';

type MessageBubbleContentProps = {
  components: Components;
  message: ChatMessage;
  openFile: MessageBubbleOpenFile;
  viewModel: MessageBubbleViewModel;
};

export function MessageBubbleContent({
  components,
  message,
  openFile,
  viewModel
}: MessageBubbleContentProps) {
  if (message.messageKind === 'reasoning') {
    return (
      <ThinkingBlock
        body={viewModel.visibleBody}
        isStreaming={message.isStreaming}
        durationSeconds={message.thinkingDurationSeconds}
      />
    );
  }

  if (viewModel.showStreamingHint) {
    return (
      <div className="message-streaming-hint">
        <span className="thinking-dot-animation">Thinking</span>
        {message.status && message.status !== 'queued' && (
          <span className="status-badge"> ({message.status})</span>
        )}
      </div>
    );
  }

  if (message.role === 'tool') {
    return (
      <ToolMessageContent
        components={components}
        message={message}
        openFile={openFile}
      />
    );
  }

  return <MarkdownRenderer body={viewModel.visibleBody} components={components} />;
}
