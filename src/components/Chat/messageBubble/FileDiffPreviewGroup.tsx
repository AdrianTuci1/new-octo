import { CodeDiffView } from '../CodeDiffView';
import { FileArtifactBlock } from '../blocks';
import type { FileDiff } from '../../../types/diff';
import type { FileDiffPreviewStatus } from '../../../lib/fileDiffs';

type FileDiffPreviewGroupProps = {
  diffs: FileDiff[];
  status: FileDiffPreviewStatus;
};

export function FileDiffPreviewGroup({ diffs, status }: FileDiffPreviewGroupProps) {
  const createDiffs = diffs.filter((diff) => diff.diffType.kind === 'create');
  const nonCreateDiffs = diffs.filter((diff) => diff.diffType.kind !== 'create');

  return (
    <>
      {createDiffs.length > 0 ? (
        <FileArtifactBlock
          key={`create:${createDiffs.map((diff) => diff.filePath).join('|')}:${status}`}
          diffs={createDiffs}
          status={status}
        />
      ) : null}
      {nonCreateDiffs.length > 0 ? (
        <CodeDiffView diffs={nonCreateDiffs} status={status} />
      ) : null}
    </>
  );
}
