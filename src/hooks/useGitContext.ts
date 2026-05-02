import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { GitRepoContext } from '../types/git';

export function useGitContext(path: string | null) {
  const [gitContext, setGitContext] = useState<GitRepoContext | null>(null);
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!path) {
      setGitContext(null);
      return Promise.resolve(null);
    }

    return invoke<GitRepoContext | null>('terminal_get_git_context', {
      request: {
        path
      }
    })
      .then((context) => {
        setGitContext(context);
        return context;
      })
      .catch((error) => {
        console.warn('[git-context] failed to load repo context', error);
        setGitContext(null);
        return null;
      });
  }, [path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchBranch = useCallback(async (branch: string) => {
    if (!path) {
      return;
    }

    try {
      const nextContext = await invoke<GitRepoContext | null>('terminal_switch_git_branch', {
        request: {
          path,
          branch
        }
      });
      setGitContext(nextContext);
      setIsBranchMenuOpen(false);
    } catch (error) {
      console.warn('[git-context] failed to switch branch', error);
    }
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
