import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ShellPrediction } from '../lib/composerIntelligence';
import type { FilesystemDirectoryListing } from '../types/filesystem';

type PathSuggestionRequest = {
  directoryPath: string;
  partialName: string;
  replacementPrefix: string;
  tokenStart: number;
};

function buildPathSuggestionRequest(
  query: string,
  cwd: string | null,
  homeDir: string | null
): PathSuggestionRequest | null {
  const tokenMatch = query.match(/(\S+)$/);
  if (!tokenMatch || !cwd) {
    return null;
  }

  const token = tokenMatch[1];
  const tokenStart = tokenMatch.index ?? 0;

  if (token === '~' && homeDir) {
    return {
      directoryPath: homeDir,
      partialName: '',
      replacementPrefix: '~/',
      tokenStart
    };
  }

  if (token === '*' || token === '$') {
    return {
      directoryPath: cwd,
      partialName: '',
      replacementPrefix: `${token} `,
      tokenStart
    };
  }

  if (token.startsWith('~/') && homeDir) {
    return buildNestedPathRequest(token, tokenStart, homeDir, '~/');
  }

  if (token.startsWith('/')) {
    return buildNestedPathRequest(token, tokenStart, '/', '/');
  }

  if (token.startsWith('./') || token.startsWith('../') || token.includes('/')) {
    return buildNestedPathRequest(token, tokenStart, cwd, '');
  }

  return null;
}

function buildNestedPathRequest(
  token: string,
  tokenStart: number,
  rootPath: string,
  displayRoot: string
) {
  const trailingSlash = token.endsWith('/');
  const lastSlashIndex = token.lastIndexOf('/');
  const rawParent = lastSlashIndex >= 0 ? token.slice(0, lastSlashIndex + 1) : '';
  const partialName = trailingSlash ? '' : token.slice(lastSlashIndex + 1);
  const parentSegment = trailingSlash ? token : rawParent;
  const normalizedParent = normalizeRelativeSegment(displayRoot ? parentSegment.slice(displayRoot.length) : parentSegment);
  const directoryPath = displayRoot === '/'
    ? normalizeAbsolutePath(parentSegment)
    : normalizeJoin(rootPath, normalizedParent);
  const replacementPrefix = trailingSlash ? token : rawParent || displayRoot;

  return {
    directoryPath,
    partialName,
    replacementPrefix,
    tokenStart
  };
}

function normalizeRelativeSegment(segment: string) {
  return segment.replace(/\/+$/, '');
}

function normalizeAbsolutePath(segment: string) {
  if (!segment || segment === '/') {
    return '/';
  }

  return segment.replace(/\/+$/, '') || '/';
}

function normalizeJoin(base: string, segment: string) {
  if (!segment) {
    return base;
  }

  return `${base.replace(/\/+$/, '')}/${segment.replace(/^\/+/, '')}`;
}

export function useShellPathPrediction(
  query: string,
  isShellMode: boolean,
  cwd: string | null,
  homeDir: string | null
) {
  const [prediction, setPrediction] = useState<ShellPrediction | null>(null);

  useEffect(() => {
    if (!isShellMode) {
      setPrediction(null);
      return;
    }

    const request = buildPathSuggestionRequest(query, cwd, homeDir);
    if (!request) {
      setPrediction(null);
      return;
    }

    let isCancelled = false;

    void invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
      request: {
        path: request.directoryPath,
        query: request.partialName || null,
        directoriesOnly: false
      }
    })
      .then((listing) => {
        if (isCancelled) {
          return;
        }

        const nextEntry = listing.entries[0];
        if (!nextEntry) {
          setPrediction(null);
          return;
        }

        const replacement = `${request.replacementPrefix}${nextEntry.name}${nextEntry.isDirectory ? '/' : ''}`;
        const fullCommand = `${query.slice(0, request.tokenStart)}${replacement}`;
        if (fullCommand === query) {
          setPrediction(null);
          return;
        }

        setPrediction({
          fullCommand,
          completionText: fullCommand.slice(query.length),
          hint: 'Press Right Arrow to complete'
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setPrediction(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [cwd, homeDir, isShellMode, query]);

  return prediction;
}
