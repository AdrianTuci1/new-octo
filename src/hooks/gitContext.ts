import { useCallback, useEffect, useState } from 'react';
import { GitService } from '../services/Git/GitService';
import type { GitRepoContext } from '../types/git';

export function useGitContext(path: string | null) {
  const [gitContext, setGitContext] = useState<GitRepoContext | null>(() =>
    GitService.getInstance().get(path)
  );
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    const context = await GitService.getInstance().refresh(path);
    setGitContext(context);
    return context;
  }, [path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchBranch = useCallback(async (branch: string) => {
    await GitService.getInstance().switchBranch(path, branch);
    setGitContext(GitService.getInstance().get(path));
    setIsBranchMenuOpen(false);
  }, [path]);

  return {
    gitContext,
    isBranchMenuOpen,
    refresh,
    setIsBranchMenuOpen,
    switchBranch,
    toggleBranchMenu: () => setIsBranchMenuOpen((open) => !open)
  };
}
