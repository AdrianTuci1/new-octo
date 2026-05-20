export type GitWorktreeDiffFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  originalContent?: string | null;
  modifiedContent?: string | null;
};

export type GitWorktreeDiff = {
  isRepo: boolean;
  repoRoot: string | null;
  repoName: string | null;
  branch: string | null;
  additions: number;
  deletions: number;
  files: GitWorktreeDiffFile[];
};
