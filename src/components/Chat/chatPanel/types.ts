import type { OpenEditorFileOptions } from '../../../stores/editorStore';
import type { UserProfileSettings } from '../../App/settings/profileSettings';
import type { LauncherViewModel } from '../../Layout/Launcher/hooks';

export type ChatPanelView = LauncherViewModel['views']['chatPanel'];

export type OpenFileHandler = (
  path: string,
  name: string,
  content?: string,
  options?: OpenEditorFileOptions
) => void;

export type ChatPanelProfile = UserProfileSettings;
