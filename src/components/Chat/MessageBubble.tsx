import { memo } from 'react';
import { MessageBubbleFacade } from './messageBubble/MessageBubbleFacade';
import type { MessageBubbleProps } from './messageBubble/types';

export const MessageBubble = memo(MessageBubbleFacade, (prev, next) => (
  prev.message === next.message
  && prev.profile === next.profile
  && prev.openFile === next.openFile
  && prev.onRequestCommandApproval === next.onRequestCommandApproval
));

export type { MessageBubbleProps };
