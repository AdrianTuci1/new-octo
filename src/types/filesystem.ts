export type FilesystemPathContext = {
  homeDir: string;
  currentDir: string;
};

export type FilesystemEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

export type FilesystemDirectoryListing = {
  currentPath: string;
  parentPath?: string | null;
  entries: FilesystemEntry[];
};

export type FilesystemSearchEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FilesystemSearchEntry[];
};

export type FilesystemSearchListing = {
  currentPath: string;
  entries: FilesystemSearchEntry[];
};
