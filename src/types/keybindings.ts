export type BackendKeybindingDefinition = {
  commandId: string;
  title: string;
  category: string;
  scope: string;
  shortcut: string | null;
};

export type BackendShortcutCommandEvent = {
  commandId: string;
};
