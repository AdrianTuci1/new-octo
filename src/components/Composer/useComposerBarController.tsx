import { invoke } from '@tauri-apps/api/core';
import { Code2, File as FileIcon, FolderOpen, Shield, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, type ChangeEvent, type ComponentProps, type KeyboardEvent, type RefObject } from 'react';
import { useStore } from 'zustand';
import { normalizeAgentSettings } from '../App/settings/agentSettings';
import type { LauncherViewModel } from '../Layout/Launcher/hooks';
import { useMemoryStore } from '../../stores/memoryStore';
import type { CodeIndexSearchResult } from '../../types/codeIndex';
import type { FilesystemDirectoryListing, FilesystemSearchListing } from '../../types/filesystem';
import type { SkillCatalogItem } from '../../types/skills';
import { ComposerContextMenu, type ComposerContextMenuItem, type ComposerContextMenuPanel } from './ComposerContextMenu';
import {
  getComposerContextMentionDeletionRange,
  getTrailingComposerContextTrigger,
  hasComposerContextMentions,
  serializeComposerContextMention
} from './contextMentions';
import { hasCompleteSlashCommand } from './SlashCommandHighlight';
import { requestComposerInputSelection } from './composerInputSelection';
import { useComposerBar } from './useComposerBar';
import { createComposerContextMenuStore } from './useComposerContextMenuStore';

type ComposerBarView = LauncherViewModel['views']['composerBar'];

type UseComposerBarControllerArgs = {
  composerPlaceholder: string;
  showInputHintText: boolean;
  view: ComposerBarView;
};

const COMPOSER_ROOT_ITEMS: ComposerContextMenuItem[] = [
  {
    id: 'files',
    label: 'Files and folders',
    icon: <FolderOpen size={15} />,
    panel: 'files'
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: <Sparkles size={15} />,
    panel: 'skills'
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: <Shield size={15} />,
    panel: 'rules'
  }
];

export function useComposerBarController({
  composerPlaceholder,
  showInputHintText,
  view
}: UseComposerBarControllerArgs) {
  const placeholder = showInputHintText ? composerPlaceholder : '';
  const { inputRef, shellRef } = useComposerBar(view.query, undefined, { autoFocus: view.mode === 'shell' });
  const contextMenuStoreRef = useRef(createComposerContextMenuStore());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileRequestIdRef = useRef(0);
  const lastFileContextRequestKeyRef = useRef<string | null>(null);
  const skillsRequestIdRef = useRef(0);
  const memorySettings = useMemoryStore((state) => state.settings);
  const memoryStatus = useMemoryStore((state) => state.status);
  const contextMenuOpen = useStore(contextMenuStoreRef.current, (state) => state.isOpen);
  const contextMenuPanel = useStore(contextMenuStoreRef.current, (state) => state.panel);
  const contextMenuActiveIndex = useStore(contextMenuStoreRef.current, (state) => state.activeIndex);
  const contextMenuFilesLoading = useStore(contextMenuStoreRef.current, (state) => state.filesLoading);
  const contextMenuCodeLoading = useStore(contextMenuStoreRef.current, (state) => state.codeLoading);
  const contextMenuSkillsLoading = useStore(contextMenuStoreRef.current, (state) => state.skillsLoading);
  const contextMenuFileItems = useStore(contextMenuStoreRef.current, (state) => state.fileItems);
  const contextMenuCodeItems = useStore(contextMenuStoreRef.current, (state) => state.codeItems);
  const contextMenuSkillCatalog = useStore(contextMenuStoreRef.current, (state) => state.skillCatalog);
  const dismissedRecommendationKey = useStore(contextMenuStoreRef.current, (state) => state.dismissedRecommendationKey);
  const syncContextMenuTrigger = useStore(contextMenuStoreRef.current, (state) => state.syncTrigger);
  const closeContextMenuState = useStore(contextMenuStoreRef.current, (state) => state.close);
  const setContextMenuPanel = useStore(contextMenuStoreRef.current, (state) => state.setPanel);
  const setContextMenuActiveIndex = useStore(contextMenuStoreRef.current, (state) => state.setActiveIndex);
  const beginContextMenuLoading = useStore(contextMenuStoreRef.current, (state) => state.beginLoading);
  const endContextMenuLoading = useStore(contextMenuStoreRef.current, (state) => state.endLoading);
  const setContextMenuFileItems = useStore(contextMenuStoreRef.current, (state) => state.setFileItems);
  const setContextMenuCodeItems = useStore(contextMenuStoreRef.current, (state) => state.setCodeItems);
  const clearContextMenuFileData = useStore(contextMenuStoreRef.current, (state) => state.clearFileData);
  const setContextMenuSkillCatalog = useStore(contextMenuStoreRef.current, (state) => state.setSkillCatalog);
  const dismissRecommendation = useStore(contextMenuStoreRef.current, (state) => state.dismissRecommendation);
  const predictionSuffix = view.prediction?.completionText ?? '';
  const showSlashCommandHighlight = hasCompleteSlashCommand(view.query);
  const showContextMentionHighlight = hasComposerContextMentions(view.query);
  const contextTrigger = getTrailingComposerContextTrigger(view.query);
  const contextTriggerKey = contextTrigger ? `${contextTrigger.start}:${contextTrigger.value}` : null;
  const contextMentionQuery = contextTrigger?.value ?? '';
  const isRepoContext = Boolean(view.gitContext);
  const workspaceRoot = view.gitContext?.rootPath?.trim() || view.workingDirectory?.trim() || null;
  const agentSettings = useMemo(() => normalizeAgentSettings(memorySettings?.values), [memorySettings?.values]);
  const skillsMenuItems = useMemo(() => {
    const query = contextMentionQuery.trim().toLowerCase();

    return contextMenuSkillCatalog
      .filter((item) => {
        if (!query) {
          return true;
        }

        return [item.name, item.description, item.path].some((value) => value.toLowerCase().includes(query));
      })
      .map<ComposerContextMenuItem>((item) => ({
        id: `skill:${item.path}`,
        label: item.name,
        description: item.description || item.path,
        icon: <Sparkles size={15} />,
        insertToken: serializeComposerContextMention('skill', item.name)
      }));
  }, [contextMenuSkillCatalog, contextMentionQuery]);
  const ruleMenuItems = useMemo(() => {
    const query = contextMentionQuery.trim().toLowerCase();

    return agentSettings.knowledge.rules
      .filter((rule) => {
        if (!query) {
          return true;
        }

        return [rule.name, rule.content, rule.category].some((value) => value.toLowerCase().includes(query));
      })
      .map<ComposerContextMenuItem>((rule) => {
        const contentPreview = rule.content.replace(/\s+/g, ' ').trim();
        const description = contentPreview.length > 72 ? `${contentPreview.slice(0, 72).trimEnd()}...` : contentPreview;

        return {
          id: `rule:${rule.id}`,
          label: rule.name,
          description: description || rule.category,
          icon: <Shield size={15} />,
          insertToken: serializeComposerContextMention('rule', rule.name)
        };
      });
  }, [agentSettings.knowledge.rules, contextMentionQuery]);
  const currentPanelItems = useMemo(() => {
    if (contextMenuPanel === 'root') {
      return COMPOSER_ROOT_ITEMS;
    }

    if (contextMenuPanel === 'files') {
      return [...contextMenuFileItems, ...contextMenuCodeItems];
    }

    if (contextMenuPanel === 'skills') {
      return skillsMenuItems;
    }

    if (contextMenuPanel === 'rules') {
      return ruleMenuItems;
    }

    return [];
  }, [contextMenuCodeItems, contextMenuFileItems, contextMenuPanel, ruleMenuItems, skillsMenuItems]);
  const resolvedContextMenuActiveIndex = currentPanelItems.length <= 0
    ? 0
    : Math.min(contextMenuActiveIndex, currentPanelItems.length - 1);
  const showRecommendation = Boolean(view.recommendedAction)
    && view.query === ''
    && dismissedRecommendationKey !== (view.recommendedAction?.value ?? null);
  const canAttachFiles = !view.modelSetupRequired && view.selectedModelSupportsAttachments;
  const attachTooltip = view.modelSetupRequired
    ? 'Set up a model first'
    : canAttachFiles
      ? 'Attach files'
      : 'Selected model does not support attachments';

  useEffect(() => {
    if (!view.selectedModelSupportsAttachments && view.attachedFiles.length > 0) {
      view.onClearAttachments();
    }
  }, [view.attachedFiles.length, view.onClearAttachments, view.selectedModelSupportsAttachments]);

  const closeContextMenu = (suppressCurrentTrigger = true) => {
    closeContextMenuState(suppressCurrentTrigger ? contextTriggerKey : null);
    lastFileContextRequestKeyRef.current = null;
  };

  const loadFileContext = async ({
    mentionQuery,
    requestPath,
    repoContext,
    resolvedWorkspaceRoot,
    force = false
  }: {
    mentionQuery: string;
    requestPath: string;
    repoContext: boolean;
    resolvedWorkspaceRoot: string | null;
    force?: boolean;
  }) => {
    const query = mentionQuery.trim();
    const requestKey = [requestPath, query, repoContext ? '1' : '0', resolvedWorkspaceRoot ?? ''].join('|');
    if (!force && lastFileContextRequestKeyRef.current === requestKey) {
      return;
    }

    lastFileContextRequestKeyRef.current = requestKey;
    const requestId = fileRequestIdRef.current + 1;
    fileRequestIdRef.current = requestId;
    beginContextMenuLoading('files', 'code');

    try {
      const useRecursiveSearch = repoContext && query.length >= 2;
      const listing = useRecursiveSearch
        ? await invoke<FilesystemSearchListing>('terminal_search_directory_entries', {
            request: {
              path: requestPath,
              query
            }
          })
        : await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
            request: {
              path: requestPath,
              query: query.length > 0 ? query : null,
              directoriesOnly: false
            }
          });

      if (fileRequestIdRef.current === requestId) {
        const nextItems = listing.entries
          .slice()
          .sort((left, right) => {
            if (useRecursiveSearch) {
              return 0;
            }

            return Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name);
          })
          .slice(0, 24)
          .map<ComposerContextMenuItem>((entry) => ({
            id: `file:${entry.path}`,
            label: entry.name,
            description: resolveWorkspacePath(entry.path, resolvedWorkspaceRoot),
            icon: entry.isDirectory ? <FolderOpen size={15} /> : <FileIcon size={15} />,
            kind: entry.isDirectory ? 'folder' : 'file',
            path: entry.path,
            insertToken: serializeComposerContextMention(
              entry.isDirectory ? 'folder' : 'file',
              resolveWorkspacePath(entry.path, resolvedWorkspaceRoot)
            )
          }));
        setContextMenuFileItems(nextItems);
      }
    } catch (error) {
      console.warn('[composer-context-menu] failed to load directory entries', error);
      if (fileRequestIdRef.current === requestId) {
        setContextMenuFileItems([]);
      }
    } finally {
      if (fileRequestIdRef.current === requestId) {
        endContextMenuLoading('files');
      }
    }

    if (!repoContext || query.length === 0) {
      if (fileRequestIdRef.current === requestId) {
        setContextMenuCodeItems([]);
        endContextMenuLoading('code');
      }
      return;
    }

    try {
      const results = await invoke<CodeIndexSearchResult[]>('code_index_search', {
        query,
        maxResults: 12
      });

      if (fileRequestIdRef.current === requestId) {
        setContextMenuCodeItems(results.map<ComposerContextMenuItem>((result) => ({
          id: `code:${result.projectId}:${result.path}`,
          label: result.relativePath,
          description: result.snippet || result.projectName,
          icon: <Code2 size={15} />,
          insertToken: serializeComposerContextMention('function', resolveWorkspacePath(result.relativePath, resolvedWorkspaceRoot))
        })));
      }
    } catch (error) {
      console.warn('[composer-context-menu] failed to search code index', error);
      if (fileRequestIdRef.current === requestId) {
        setContextMenuCodeItems([]);
      }
    } finally {
      if (fileRequestIdRef.current === requestId) {
        endContextMenuLoading('code');
      }
    }
  };

  const refreshFileContext = (force = false) => {
    if (!contextMenuOpen || contextMenuPanel !== 'files') {
      lastFileContextRequestKeyRef.current = null;
      clearContextMenuFileData();
      return;
    }

    void loadFileContext({
      mentionQuery: contextMentionQuery,
      requestPath: view.workingDirectory?.trim() || '.',
      repoContext: isRepoContext,
      resolvedWorkspaceRoot: workspaceRoot,
      force
    });
  };

  const setContextMenuPanelWithCleanup = (nextPanel: ComposerContextMenuPanel) => {
    if (contextMenuPanel === 'files' && nextPanel !== 'files') {
      lastFileContextRequestKeyRef.current = null;
      clearContextMenuFileData();
    }

    setContextMenuPanel(nextPanel);
  };

  const ensureSkillsLoaded = async () => {
    if (contextMenuSkillCatalog.length > 0 || contextMenuSkillsLoading) {
      return;
    }

    const requestId = skillsRequestIdRef.current + 1;
    skillsRequestIdRef.current = requestId;
    beginContextMenuLoading('skills');
    try {
      const skills = await invoke<SkillCatalogItem[]>('agent_list_skills');
      if (skillsRequestIdRef.current === requestId) {
        setContextMenuSkillCatalog(skills);
      }
    } catch (error) {
      console.warn('[composer-context-menu] failed to load skills catalog', error);
      if (skillsRequestIdRef.current === requestId) {
        setContextMenuSkillCatalog([]);
      }
    } finally {
      if (skillsRequestIdRef.current === requestId) {
        endContextMenuLoading('skills');
      }
    }
  };

  const handleContextMenuItemSelect = (item: ComposerContextMenuItem) => {
    if (item.panel) {
      setContextMenuPanelWithCleanup(item.panel);
      if (item.panel === 'skills') {
        void ensureSkillsLoaded();
      } else if (item.panel === 'files') {
        refreshFileContext(true);
      }
      return;
    }

    if (view.mode === 'shell' && item.kind === 'folder' && item.path && view.onExecuteTerminalCommand) {
      view.onExecuteTerminalCommand(`cd ${shellQuotePath(item.path)}`);
      closeContextMenu(true);
      return;
    }

    if (!item.insertToken) {
      return;
    }

    const trigger = getTrailingComposerContextTrigger(view.query);
    if (!trigger) {
      return;
    }

    const nextQuery = `${view.query.slice(0, trigger.start)}${item.insertToken} ${view.query.slice(trigger.end)}`.replace(/[ \t]{2,}/g, ' ');
    handleQueryChange(nextQuery);
    closeContextMenu(true);
    requestComposerInputSelection(inputRef, Math.min(nextQuery.length, trigger.start + item.insertToken.length + 1), true);
  };

  const handleQueryChange = (nextQuery: string) => {
    const nextTrigger = getTrailingComposerContextTrigger(nextQuery);
    const nextTriggerKey = nextTrigger ? `${nextTrigger.start}:${nextTrigger.value}` : null;
    syncContextMenuTrigger(nextTriggerKey);
    const nextStoreState = contextMenuStoreRef.current.getState();
    if (!nextTriggerKey || !nextStoreState.isOpen || nextStoreState.panel !== 'files') {
      lastFileContextRequestKeyRef.current = null;
      clearContextMenuFileData();
    } else {
      void loadFileContext({
        mentionQuery: nextTrigger?.value ?? '',
        requestPath: view.workingDirectory?.trim() || '.',
        repoContext: isRepoContext,
        resolvedWorkspaceRoot: workspaceRoot
      });
    }
    view.onQueryChange(nextQuery);
  };

  const handleContextMenuKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!contextMenuOpen) {
      return false;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeContextMenu(true);
      return true;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (contextMenuPanel !== 'root') {
        setContextMenuPanelWithCleanup('root');
      } else {
        closeContextMenu(true);
      }
      return true;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setContextMenuActiveIndex((index) => Math.min(index + 1, Math.max(0, currentPanelItems.length - 1)));
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setContextMenuActiveIndex((index) => Math.max(index - 1, 0));
      return true;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedItem = currentPanelItems[resolvedContextMenuActiveIndex];
      if (!selectedItem) {
        return true;
      }

      handleContextMenuItemSelect(selectedItem);
      return true;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const selectedItem = currentPanelItems[resolvedContextMenuActiveIndex];
      if (selectedItem?.panel) {
        handleContextMenuItemSelect(selectedItem);
      }
      return true;
    }

    return false;
  };

  const handleAttachButtonClick = () => {
    if (!canAttachFiles) {
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';

    if (files.length === 0 || !canAttachFiles) {
      return;
    }

    void view.onAttachFiles(files);
  };

  const handleInternalKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleContextMenuKeyDown(event)) {
      return;
    }

    if (event.key === 'ArrowRight' && view.prediction?.fullCommand) {
      event.preventDefault();
      event.stopPropagation();
      handleQueryChange(view.prediction.fullCommand);
      requestComposerInputSelection(inputRef, view.prediction.fullCommand.length);
      return;
    }

    if (event.key === 'Backspace') {
      const input = event.currentTarget;
      const selectionStart = input.selectionStart ?? view.query.length;
      const selectionEnd = input.selectionEnd ?? view.query.length;
      const deletionRange = getComposerContextMentionDeletionRange(view.query, selectionStart, selectionEnd);

      if (deletionRange) {
        event.preventDefault();
        const nextQuery = `${view.query.slice(0, deletionRange.start)}${view.query.slice(deletionRange.end).replace(/^[ \t]+/, ' ')}`.replace(/[ \t]{2,}/g, ' ');
        handleQueryChange(nextQuery);
        requestComposerInputSelection(inputRef, deletionRange.start);
        return;
      }
    }

    if (event.key === 'Backspace' && view.query === '' && showRecommendation) {
      dismissRecommendation(view.recommendedAction?.value ?? null);
      event.preventDefault();
      return;
    }

    view.onKeyDown(event);
  };

  return {
    attachTooltip,
    canAttachFiles,
    contextMenu: {
      activeIndex: resolvedContextMenuActiveIndex,
      anchorRef: inputRef,
      codeItems: contextMenuCodeItems,
      fileItems: contextMenuFileItems,
      gitContext: view.gitContext,
      isOpen: contextMenuOpen,
      isRepoContext,
      loadingCode: contextMenuCodeLoading,
      loadingFiles: contextMenuFilesLoading,
      loadingRules: memoryStatus === 'loading' && memorySettings == null,
      loadingSkills: contextMenuSkillsLoading,
      mentionQuery: contextMentionQuery,
      onBack: () => {
        setContextMenuPanelWithCleanup('root');
      },
      onClose: () => closeContextMenu(true),
      onSelectItem: handleContextMenuItemSelect,
      onSetActiveIndex: setContextMenuActiveIndex,
      panel: contextMenuPanel,
      rootItems: COMPOSER_ROOT_ITEMS,
      ruleItems: ruleMenuItems,
      rulesEnabled: agentSettings.knowledge.rulesEnabled,
      skillItems: skillsMenuItems,
      workingDirectoryLabel: view.workingDirectoryLabel
    } satisfies ComponentProps<typeof ComposerContextMenu>,
    fileInputRef,
    handleAttachButtonClick,
    handleFileInputChange,
    handleInternalKeyDown,
    handleQueryChange,
    inputRef,
    placeholder,
    predictionSuffix,
    shellRef,
    showContextMentionHighlight,
    showRecommendation,
    showSlashCommandHighlight
  };
}

function resolveWorkspacePath(path: string, workspaceRoot: string | null) {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return trimmedPath;
  }

  const normalizedRoot = workspaceRoot?.replace(/\/+$/, '') || '';
  if (normalizedRoot && (trimmedPath === normalizedRoot || trimmedPath.startsWith(`${normalizedRoot}/`))) {
    const relative = trimmedPath.slice(normalizedRoot.length).replace(/^\/+/, '');
    return relative || '.';
  }

  return trimmedPath;
}

function shellQuotePath(value: string) {
  if (!value.trim()) {
    return "''";
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}
