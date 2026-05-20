export type CodeIndexProject = {
  id: string;
  name: string;
  path: string;
  status: 'indexing' | 'indexed' | 'failed' | string;
  lastIndexedAt?: string | null;
  fileCount: number;
  totalBytes: number;
  error?: string | null;
};

export type CodeIndexSearchResult = {
  projectId: string;
  projectName: string;
  path: string;
  relativePath: string;
  language: string;
  snippet: string;
  score: number;
};
