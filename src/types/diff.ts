export type DiffDelta = {
  replacement_line_range: { start: number; end: number };
  insertion: string;
};

export type DiffType =
  | { kind: 'create'; delta: DiffDelta }
  | { kind: 'update'; deltas: DiffDelta[]; rename?: string }
  | { kind: 'delete'; delta: DiffDelta };

export type FileDiff = {
  filePath: string;
  diffType: DiffType;
  originalContent?: string;
};

export type ParsedDiff =
  | { kind: 'str_replace'; file?: string; search?: string; replace?: string }
  | { kind: 'v4a'; file?: string; move_to?: string; hunks: V4AHunk[] };

export type V4AHunk = {
  change_context: string[];
  pre_context: string;
  old: string;
  new: string;
  post_context: string;
};
