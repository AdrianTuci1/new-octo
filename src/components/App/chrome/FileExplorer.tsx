import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Folder, 
  File, 
  ChevronRight, 
  ChevronDown,
  FolderOpen,
  AlertCircle
} from 'lucide-react';
import nodejsIcon from '../../../../assets/svg/nodejs-logo.svg';
import typescriptIcon from '../../../../assets/svg/file_type/typescript.svg';
import cssIcon from '../../../../assets/svg/file_type/css.svg';
import jsonIcon from '../../../../assets/svg/file_type/json.svg';
import markdownIcon from '../../../../assets/svg/file_type/markdown.svg';
import pythonIcon from '../../../../assets/svg/file_type/python.svg';
import goIcon from '../../../../assets/svg/file_type/go.svg';
import rustIcon from '../../../../assets/svg/file_type/rust.svg';
import phpIcon from '../../../../assets/svg/file_type/php.svg';
import cppIcon from '../../../../assets/svg/file_type/cpp.svg';
import cIcon from '../../../../assets/svg/file_type/c.svg';
import kotlinIcon from '../../../../assets/svg/file_type/kotlin.svg';
import wasmIcon from '../../../../assets/svg/file_type/wasm.svg';
import terraformIcon from '../../../../assets/svg/file_type/terraform.svg';
import npmIcon from '../../../../assets/svg/file_type/npm.svg';
import sqlIcon from '../../../../assets/svg/file_type/sql.svg';
import type { 
  FilesystemEntry, 
  FilesystemDirectoryListing, 
  FilesystemPathContext
} from '../../../types/filesystem';
import type { GitWorktreeDiff } from '../../../types/gitDiff';
import './FileExplorer.css';

interface FileExplorerProps {
  initialPath?: string | null;
  onFileClick?: (path: string, name: string, content: string) => void;
  onOpenInNewTab?: (path: string) => void;
  onOpenInNewPane?: (path: string) => void;
}

interface TreeEntry extends FilesystemEntry {
  isOpen?: boolean;
  children?: TreeEntry[];
  isLoading?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  visible: boolean;
  node: TreeEntry | null;
}

const normalizePath = (path: string) => (path === '/' ? '/' : path.replace(/\/+$/, '') || path);
const joinPath = (base: string, relative: string) => {
  const trimmedBase = normalizePath(base);
  const trimmedRelative = relative.replace(/^\/+/, '');

  if (trimmedBase === '/') {
    return normalizePath(`/${trimmedRelative}`);
  }

  return normalizePath(`${trimmedBase}/${trimmedRelative}`);
};

export function FileExplorer({ 
  initialPath, 
  onFileClick,
  onOpenInNewTab,
  onOpenInNewPane 
}: FileExplorerProps) {
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, visible: false, node: null });
  const menuRef = useRef<HTMLDivElement>(null);
  const directoryCacheRef = useRef(new Map<string, FilesystemEntry[]>());
  const diffToneByPathRef = useRef(new Map<string, 'added' | 'modified'>());
  const [, forceDiffToneRefresh] = useState(0);

  const fetchEntries = useCallback(async (path: string | null = null): Promise<FilesystemDirectoryListing> => {
    try {
      const result = await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
        request: {
          path: path || '.',
          directoriesOnly: false
        }
      });
      return result;
    } catch (err) {
      console.error('[FileExplorer] Fetch failed:', err);
      throw err;
    }
  }, []);

  const rememberEntries = useCallback((path: string, entries: FilesystemEntry[]) => {
    directoryCacheRef.current.set(normalizePath(path), entries.map((entry) => ({ ...entry })));
  }, []);

  const loadDiffStatuses = useCallback(async (path: string, visibleRootPath: string) => {
    try {
      const diff = await invoke<GitWorktreeDiff>('terminal_get_worktree_diff', {
        request: { path, includePatch: false }
      });

      if (!diff.isRepo || !diff.repoRoot) {
        diffToneByPathRef.current = new Map();
        forceDiffToneRefresh((current) => current + 1);
        return;
      }

      const nextTones = new Map<string, 'added' | 'modified'>();
      const normalizedRepoRoot = normalizePath(diff.repoRoot);
      const normalizedVisibleRoot = normalizePath(visibleRootPath);

      const setTone = (targetPath: string, tone: 'added' | 'modified') => {
        const normalizedTarget = normalizePath(targetPath);
        const existingTone = nextTones.get(normalizedTarget);
        if (existingTone === 'modified' || existingTone === tone) {
          return;
        }
        nextTones.set(normalizedTarget, tone);
      };

      diff.files.forEach((file) => {
        const tone: 'added' | 'modified' = file.status.startsWith('A') || file.status.startsWith('?')
          ? 'added'
          : 'modified';
        let currentPath = normalizePath(joinPath(diff.repoRoot as string, file.path));

        while (true) {
          setTone(currentPath, tone);
          if (currentPath === normalizedVisibleRoot || currentPath === normalizedRepoRoot) {
            break;
          }

          const parentPath = currentPath === '/' ? '/' : currentPath.slice(0, currentPath.lastIndexOf('/'));
          if (!parentPath || parentPath === currentPath) {
            break;
          }

          currentPath = parentPath;
        }
      });

      diffToneByPathRef.current = nextTones;
      forceDiffToneRefresh((current) => current + 1);
    } catch (err) {
      console.warn('[FileExplorer] Failed to load git diff statuses:', err);
      diffToneByPathRef.current = new Map();
      forceDiffToneRefresh((current) => current + 1);
    }
  }, []);

  const updateTreeByPath = useCallback((
    nodes: TreeEntry[],
    targetPath: string,
    updater: (node: TreeEntry) => TreeEntry
  ): TreeEntry[] => {
    const normalizedTarget = normalizePath(targetPath);

    return nodes.map((node) => {
      if (normalizePath(node.path) === normalizedTarget) {
        return updater(node);
      }

      if (!node.children) {
        return node;
      }

      return {
        ...node,
        children: updateTreeByPath(node.children, normalizedTarget, updater)
      };
    });
  }, []);

  const findTreeNodeByPath = (
    nodes: TreeEntry[],
    targetPath: string
  ): TreeEntry | null => {
    const normalizedTarget = normalizePath(targetPath);
    for (const node of nodes) {
      if (normalizePath(node.path) === normalizedTarget) {
        return node;
      }

      if (node.children) {
        const match = findTreeNodeByPath(node.children, normalizedTarget);
        if (match) {
          return match;
        }
      }
    }

    return null;
  };

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    let path = initialPath;
    
    try {
      if (!path) {
        const context = await invoke<FilesystemPathContext>('terminal_get_path_context');
        path = context.currentDir || '.';
      }

      const resolvedPath = path ?? '.';
      const listing = await fetchEntries(resolvedPath);
      directoryCacheRef.current.clear();
      rememberEntries(listing.currentPath, listing.entries);
      await loadDiffStatuses(listing.currentPath, listing.currentPath);
      
      const rootName = listing.currentPath.split('/').pop() || 'Project';
      const rootNode: TreeEntry = {
        name: rootName,
        path: listing.currentPath,
        isDirectory: true,
        isOpen: true,
        children: listing.entries.map(entry => ({ ...entry }))
      };
      
      setTree([rootNode]);
    } catch (err: any) {
      console.error('[FileExplorer] Init error:', err);
      setError(err.toString());
      try {
        const listing = await fetchEntries('.');
        directoryCacheRef.current.clear();
        rememberEntries(listing.currentPath, listing.entries);
        await loadDiffStatuses(listing.currentPath, listing.currentPath);
        setTree([{
          name: 'Project',
          path: listing.currentPath,
          isDirectory: true,
          isOpen: true,
          children: listing.entries.map(entry => ({ ...entry }))
        }]);
      } catch (innerErr) {
        console.error('[FileExplorer] Fallback failed:', innerErr);
      }
    } finally {
      setLoading(false);
    }
  }, [initialPath, fetchEntries, loadDiffStatuses, rememberEntries]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('contextmenu', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside);
    };
  }, []);

  const toggleFolder = async (path: string) => {
    const currentNode = findTreeNodeByPath(tree, path);
    if (!currentNode || !currentNode.isDirectory) {
      return;
    }

    const isOpening = !currentNode.isOpen;
    const normalizedPath = normalizePath(path);
    const cachedEntries = directoryCacheRef.current.get(normalizedPath);
    const shouldFetch = isOpening && !cachedEntries && (!currentNode.children || currentNode.children.length === 0);

    setTree((prev) => updateTreeByPath(prev, normalizedPath, (node) => ({
      ...node,
      isOpen: isOpening,
      isLoading: isOpening && shouldFetch
    })));

    if (isOpening && cachedEntries) {
      setTree((prev) => updateTreeByPath(prev, normalizedPath, (node) => ({
        ...node,
        children: cachedEntries.map((entry) => ({ ...entry })),
        isLoading: false
      })));
      return;
    }

    if (!shouldFetch) {
      return;
    }

    try {
      const listing = await fetchEntries(path);
      rememberEntries(listing.currentPath, listing.entries);
      setTree(prev => updateTreeByPath(prev, normalizedPath, (node) => ({
        ...node,
        children: listing.entries.map((child) => ({ ...child })),
        isLoading: false
      })));
    } catch (err) {
      console.error('[FileExplorer] Failed to fetch children:', err);
      setTree(prev => updateTreeByPath(prev, normalizedPath, (node) => ({
        ...node,
        isLoading: false
      })));
    }
  };

  const handleFileClick = async (path: string, name: string) => {
    try {
      const content = await invoke<string>('terminal_read_file', {
        request: { path }
      });
      onFileClick?.(path, name, content);
    } catch (err) {
      console.error('[FileExplorer] Failed to read file:', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: TreeEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true,
      node
    });
  };

  const handleContextAction = async (action: string) => {
    const node = contextMenu.node;
    if (!node) return;

    switch (action) {
      case 'copy-path':
        await navigator.clipboard.writeText(node.path);
        break;
      case 'open-tab':
        onOpenInNewTab?.(node.path);
        break;
      case 'open-pane':
        onOpenInNewPane?.(node.path);
        break;
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const getFileIconSrc = (name: string) => {
    const normalizedName = name.toLowerCase();
    const ext = normalizedName.split('.').pop()?.toLowerCase();

    if (normalizedName === 'package.json' || normalizedName === 'package-lock.json' || normalizedName === 'pnpm-lock.yaml' || normalizedName === 'yarn.lock') {
      return npmIcon;
    }

    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'mts':
      case 'cts':
        return typescriptIcon;
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return nodejsIcon;
      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return cssIcon;
      case 'json':
        return jsonIcon;
      case 'md':
      case 'markdown':
        return markdownIcon;
      case 'py':
        return pythonIcon;
      case 'go':
        return goIcon;
      case 'rs':
        return rustIcon;
      case 'php':
        return phpIcon;
      case 'cpp':
      case 'cc':
      case 'cxx':
      case 'hpp':
      case 'hh':
      case 'hxx':
        return cppIcon;
      case 'c':
      case 'h':
        return cIcon;
      case 'kt':
      case 'kts':
        return kotlinIcon;
      case 'wasm':
        return wasmIcon;
      case 'tf':
      case 'tfvars':
      case 'hcl':
        return terraformIcon;
      case 'sql':
        return sqlIcon;
      default:
        return null;
    }
  };

  const renderTree = (nodes: TreeEntry[], depth = 0) => {
    return nodes.map((node) => (
      <div key={`${node.path}-${depth}`} className="file-tree-node-container">
        {(() => {
          const normalizedNodePath = normalizePath(node.path);
          const diffTone = diffToneByPathRef.current.get(normalizedNodePath) ?? null;
          const fileIconSrc = node.isDirectory ? null : getFileIconSrc(node.name);

          return (
            <div 
              className={`file-tree-node ${node.isDirectory ? 'directory' : 'file'} ${node.isOpen ? 'open' : ''} ${diffTone ? `diff-${diffTone}` : ''}`}
              style={{ paddingLeft: `${depth * 16 + 12}px` }}
              onClick={(e) => {
                e.stopPropagation();
                if (node.isDirectory) {
                  void toggleFolder(node.path);
                } else {
                  handleFileClick(node.path, node.name);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, node)}
            >
              <div className="node-icon-wrapper">
                {node.isDirectory && (
                  <div className="chevron-icon">
                    {node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                )}
                {!node.isDirectory && <div className="chevron-spacer" />}
                <div className="main-icon">
                  {node.isDirectory ? (
                    node.isOpen ? <FolderOpen size={14} color="#a78bfa" fill="#a78bfa33" /> : <Folder size={14} color="#a78bfa" fill="#a78bfa33" />
                  ) : fileIconSrc ? (
                    <img
                      src={fileIconSrc}
                      alt=""
                      aria-hidden="true"
                      className="file-type-icon"
                    />
                  ) : (
                    <File size={14} className="file-icon default" />
                  )}
                </div>
              </div>
              <span className={`node-name ${diffTone ? `diff-${diffTone}` : ''}`}>
                <span className={node.isDirectory ? 'node-folder-name' : 'node-file-name'}>{node.name}</span>
              </span>
              {node.isLoading && <div className="node-loading-spinner" />}
            </div>
          );
        })()}
        {node.isDirectory && node.isOpen && node.children && (
          <div className="file-tree-children">
            {renderTree(node.children, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="file-explorer">
      <div className="file-explorer-content">
        {error && (
          <div className="file-explorer-error">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={init}>Retry</button>
          </div>
        )}
        {loading && tree.length === 0 ? (
          <div className="file-explorer-loading">Loading files...</div>
        ) : (
          <div className="file-tree">
            {renderTree(tree)}
          </div>
        )}
      </div>

      {contextMenu.visible && (
        <div 
          ref={menuRef}
          className="file-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={() => handleContextAction('open-pane')}>Open in new pane</button>
          <button onClick={() => handleContextAction('open-tab')}>Open in new tab</button>
          <div className="menu-separator" />
          <button onClick={() => handleContextAction('copy-path')}>Copy path</button>
        </div>
      )}
    </div>
  );
}
