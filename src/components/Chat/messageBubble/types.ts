import type { ChatMessage } from '../../../types/chat';
import type { CommandApproval } from '../../../types/terminal';
import type { FileDiff } from '../../../types/diff';
import type { FileDiffPreviewStatus } from '../../../lib/fileDiffs';
import type { UserProfileSettings } from '../../App/settings/profileSettings';
import type { OpenEditorFileOptions } from '../../../stores/editorStore';

export type MessageBubbleOpenFile = (
  path: string,
  name: string,
  content?: string,
  options?: OpenEditorFileOptions
) => void;

export type MessageBubbleProps = {
  message: ChatMessage;
  profile: UserProfileSettings;
  openFile: MessageBubbleOpenFile;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
};

export type MessageBubbleViewModel = {
  displayFileDiffs: FileDiff[];
  extractedFileDiffs: FileDiff[];
  filePreviewStatus: FileDiffPreviewStatus;
  inlineFileChangeApproval?: CommandApproval;
  isUser: boolean;
  rawVisibleBody: string;
  showStreamingHint: boolean;
  visibleBody: string;
};
