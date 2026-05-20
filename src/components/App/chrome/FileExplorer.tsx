import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Folder, 
  File, 
  ChevronRight, 
  ChevronDown,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  AlertCircle,
  Search,
  X
} from 'lucide-react';
import type { 
  FilesystemEntry, 
  FilesystemDirectoryListing, 
  FilesystemPathContext,
  FilesystemSearchEntry,
  FilesystemSearchListing
} from '../../../types/filesystem';
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

const normalizePath = (path: string) => path.replace(/\/$/, '');

export function FileExplorer({ 
  initialPath, 
  onFileClick,
  onOpenInNewTab,
  onOpenInNewPane 
}: FileExplorerProps) {
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTree, setSearchTree] = useState<TreeEntry[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetryCount, setSearchRetryCount] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, visible: false, node: null });
  const menuRef = useRef<HTMLDivElement>(null);
  const directoryCacheRef = useRef(new Map<string, FilesystemEntry[]>());
  const searchRequestIdRef = useRef(0);

  const fetchEntries = useCallback(async (path: string | null = null): Promise<FilesystemEntry[]> => {
    try {
      const result = await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
        request: {
          path: path || '.',
          directoriesOnly: false
        }
      });
      return result.entries;
    } catch (err) {
      console.error('[FileExplorer] Fetch failed:', err);
      throw err;
    }
  }, []);

  const rememberEntries = useCallback((path: string, entries: FilesystemEntry[]) => {
    directoryCacheRef.current.set(normalizePath(path), entries.map((entry) => ({ ...entry })));
  }, []);

  const mapSearchEntryToTreeEntry = useCallback((entry: FilesystemSearchEntry): TreeEntry => {
    return {
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDirectory,
      isOpen: true,
      children: entry.children.map((child) => mapSearchEntryToTreeEntry(child))
    };
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearchTree(null);
    setSearchError(null);
    setSearchRetryCount(0);
    let path = initialPath;
    
    try {
      if (!path) {
        const context = await invoke<FilesystemPathContext>('terminal_get_path_context');
        path = context.currentDir || '.';
      }

      const resolvedPath = path ?? '.';
      const entries = await fetchEntries(resolvedPath);
      directoryCacheRef.current.clear();
      rememberEntries(resolvedPath, entries);
      setRootPath(resolvedPath);
      
      const rootName = resolvedPath.split('/').pop() || 'Project';
      const rootNode: TreeEntry = {
        name: rootName,
        path: resolvedPath,
        isDirectory: true,
        isOpen: true,
        children: entries.map(entry => ({ ...entry }))
      };
      
      setTree([rootNode]);
    } catch (err: any) {
      console.error('[FileExplorer] Init error:', err);
      setError(err.toString());
      try {
        const entries = await fetchEntries('.');
        directoryCacheRef.current.clear();
        rememberEntries('.', entries);
        setRootPath('.');
        setTree([{
          name: 'Project',
          path: '.',
          isDirectory: true,
          isOpen: true,
          children: entries.map(entry => ({ ...entry }))
        }]);
      } catch (innerErr) {
        console.error('[FileExplorer] Fallback failed:', innerErr);
      }
    } finally {
      setLoading(false);
    }
  }, [initialPath, fetchEntries]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    if (!query) {
      setSearchTree(null);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const searchRootPath = rootPath ?? initialPath ?? '.';
    setSearchLoading(true);
    setSearchError(null);

    void (async () => {
      try {
        const results = await invoke<FilesystemSearchListing>('terminal_search_directory_entries', {
          request: {
            path: searchRootPath,
            query
          }
        });
        if (searchRequestIdRef.current !== requestId) {
          return;
        }
        setSearchTree(results.entries.map((entry) => mapSearchEntryToTreeEntry(entry)));
      } catch (err) {
        if (searchRequestIdRef.current !== requestId) {
          return;
        }
        console.error('[FileExplorer] Search failed:', err);
        setSearchError(err instanceof Error ? err.message : String(err));
        setSearchTree([]);
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setSearchLoading(false);
        }
      }
    })();
  }, [initialPath, mapSearchEntryToTreeEntry, rootPath, searchQuery, searchRetryCount]);

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
    const normalizedTarget = normalizePath(path);
    let shouldFetch = false;

    // First, toggle the open state locally
    setTree(prev => {
      const updateNodes = (nodes: TreeEntry[]): TreeEntry[] => {
        return nodes.map(node => {
          if (normalizePath(node.path) === normalizedTarget) {
            const isOpening = !node.isOpen;
            if (isOpening && (!node.children || node.children.length === 0)) {
              shouldFetch = true;
            }
            return { ...node, isOpen: isOpening, isLoading: isOpening && shouldFetch };
          }
          if (node.children) {
            return { ...node, children: updateNodes(node.children) };
          }
          return node;
        });
      };
      return updateNodes(prev);
    });

    if (shouldFetch) {
      try {
        const children = await fetchEntries(path);
        rememberEntries(path, children);
        setTree(prev => {
          const setChildren = (nodes: TreeEntry[]): TreeEntry[] => {
            return nodes.map(node => {
              if (normalizePath(node.path) === normalizedTarget) {
                return { ...node, children: children.map(c => ({ ...c })), isLoading: false };
              }
              if (node.children) {
                return { ...node, children: setChildren(node.children) };
              }
              return node;
            });
          };
          return setChildren(prev);
        });
      } catch (err) {
        console.error('[FileExplorer] Failed to fetch children:', err);
        // Reset loading state on error
        setTree(prev => {
          const resetLoading = (nodes: TreeEntry[]): TreeEntry[] => {
            return nodes.map(node => {
              if (normalizePath(node.path) === normalizedTarget) {
                return { ...node, isLoading: false };
              }
              if (node.children) {
                return { ...node, children: resetLoading(node.children) };
              }
              return node;
            });
          };
          return resetLoading(prev);
        });
      }
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

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <FileCode size={14} className="file-icon code" />;
      case 'json':
        return <FileJson size={14} className="file-icon json" />;
      case 'md':
        return <FileText size={14} className="file-icon text" />;
      default:
        return <File size={14} className="file-icon default" />;
    }
  };

  const renderTree = (nodes: TreeEntry[], depth = 0) => {
    return nodes.map((node) => (
      <div key={`${node.path}-${depth}`} className="file-tree-node-container">
        <div 
          className={`file-tree-node ${node.isDirectory ? 'directory' : 'file'} ${node.isOpen ? 'open' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={(e) => {
            e.stopPropagation();
            if (node.isDirectory) {
              toggleFolder(node.path);
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
              ) : (
                getFileIcon(node.name)
              )}
            </div>
          </div>
          <span className="node-name">
            {node.name}
          </span>
          {node.isLoading && <div className="node-loading-spinner" />}
        </div>
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
      <div className="file-explorer-toolbar">
        <div className="file-explorer-search">
          <Search size={14} className="file-explorer-search-icon" />
          <input
            type="text"
            className="file-explorer-search-input"
            placeholder="Search files and folders"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery.trim() && (
            <button
              type="button"
              className="file-explorer-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="file-explorer-content">
        {error && (
          <div className="file-explorer-error">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={init}>Retry</button>
          </div>
        )}
        {searchQuery.trim() ? (
          searchLoading ? (
            <div className="file-explorer-loading">Searching subdirectories...</div>
          ) : searchError ? (
            <div className="file-explorer-error">
              <AlertCircle size={16} />
              <span>{searchError}</span>
              <button onClick={() => setSearchRetryCount((current) => current + 1)}>Retry</button>
            </div>
          ) : searchTree && searchTree.length > 0 ? (
            <div className="file-tree">
              {renderTree(searchTree)}
            </div>
          ) : (
            <div className="file-explorer-empty">No matches found.</div>
          )
        ) : loading && tree.length === 0 ? (
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
