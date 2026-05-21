import { useState, useEffect, useMemo, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowRight,
  Code2,
  CornerDownLeft,
  FolderOpen,
  MonitorSmartphone,
  Paperclip,
  File as FileIcon,
  Plus,
  Shield,
  Sparkles,
  X
} from 'lucide-react';
import { GitBranchPicker } from './GitBranchPicker';
import { ComposerContextMenu, type ComposerContextMenuItem, type ComposerContextMenuPanel } from './ComposerContextMenu';
import {
  getComposerContextMentionDeletionRange,
  getTrailingComposerContextTrigger,
  hasComposerContextMentions,
  serializeComposerContextMention
} from './contextMentions';
import { hasCompleteSlashCommand, SlashCommandHighlight } from './SlashCommandHighlight';
import { useComposerBar } from './useComposerBar';
import { WorkingDirectoryPicker } from './WorkingDirectoryPicker';
import { normalizeAgentSettings } from '../App/settings/agentSettings';
import { useMemoryStore } from '../../stores/memoryStore';
import type { RecommendedComposerAction, ShellPrediction } from '../../lib/composerIntelligence';
import type { CodeIndexSearchResult } from '../../types/codeIndex';
import type { GitRepoContext } from '../../types/git';
import type { ComposerMode, ShellModeSource } from '../../types/ui';
import type { FilesystemDirectoryListing, FilesystemSearchListing } from '../../types/filesystem';
import type { ChatAttachment } from '../../types/chat';
import type { SkillCatalogItem } from '../../types/skills';
import './ComposerBar.css';

type ComposerBarProps = {
  mode: ComposerMode;
  shellSource: ShellModeSource | null;
  restrictActions?: boolean;
  query: string;
  prediction: ShellPrediction | null;
  recommendedAction: RecommendedComposerAction | null;
  gitContext: GitRepoContext | null;
  gitBranchMenuOpen: boolean;
  workingDirectory: string | null;
  workingDirectoryLabel: string;
  workingDirectoryPickerOpen: boolean;
  workingDirectoryListing: FilesystemDirectoryListing | null;
  workingDirectorySearch: string;
  selectedModelLabel: string;
  selectedModelSupportsAttachments?: boolean;
  attachedFiles: ChatAttachment[];
  onAttachFiles: (files: File[]) => void | Promise<void>;
  onRemoveAttachedFile: (attachmentId: string) => void;
  onClearAttachments: () => void;
  terminalAutoDetectEnabled: boolean;
  modelSetupRequired?: boolean;
  onQueryChange: (query: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRecommendedActionClick: (action: RecommendedComposerAction) => void;
  onToggleWorkingDirectoryPicker: () => void;
  onToggleSingleCharacterPrediction: () => void;
  onCloseWorkingDirectoryPicker: () => void;
  onWorkingDirectorySearchChange: (query: string) => void;
  onNavigateToParentDirectory: () => void;
  onSelectWorkingDirectory: (path: string) => void;
  onToggleTerminalAutoDetect: () => void;
  onToggleGitBranchMenu: () => void;
  onToggleModelTray: () => void;
  onCloseGitBranchMenu: () => void;
  onSelectGitBranch: (branch: string) => void;
  onExecuteTerminalCommand?: (command: string) => void;
  onBackFromModelSetup?: () => void;
  onOpenModelSettings?: () => void;
  onHeightChange?: (height: number) => void;
  placeholder?: string;
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

export function ComposerBar({
  mode,
  shellSource,
  restrictActions = false,
  query,
  prediction,
  recommendedAction,
  gitContext,
  gitBranchMenuOpen,
  workingDirectory,
  workingDirectoryLabel,
  workingDirectoryPickerOpen,
  workingDirectoryListing,
  workingDirectorySearch,
  selectedModelLabel,
  selectedModelSupportsAttachments = false,
  attachedFiles,
  onAttachFiles,
  onRemoveAttachedFile,
  onClearAttachments,
  terminalAutoDetectEnabled,
  modelSetupRequired = false,
  onQueryChange,
  onKeyDown,
  onRecommendedActionClick,
  onToggleWorkingDirectoryPicker,
  onCloseWorkingDirectoryPicker,
  onWorkingDirectorySearchChange,
  onNavigateToParentDirectory,
  onSelectWorkingDirectory,
  onToggleTerminalAutoDetect,
  onToggleGitBranchMenu,
  onToggleModelTray,
  onCloseGitBranchMenu,
  onSelectGitBranch,
  onExecuteTerminalCommand,
  onBackFromModelSetup,
  onOpenModelSettings,
  onHeightChange,
  placeholder
}: ComposerBarProps) {
  const { inputRef, shellRef } = useComposerBar(query, onHeightChange, { autoFocus: mode === 'shell' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contextMenuAnchorRef = inputRef;
  const memorySettings = useMemoryStore((state) => state.settings);
  const memoryStatus = useMemoryStore((state) => state.status);
  const [isDismissed, setIsDismissed] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPanel, setContextMenuPanel] = useState<ComposerContextMenuPanel>('root');
  const [contextMenuActiveIndex, setContextMenuActiveIndex] = useState(0);
  const [contextMenuSuppressedKey, setContextMenuSuppressedKey] = useState<string | null>(null);
  const [contextMenuFilesLoading, setContextMenuFilesLoading] = useState(false);
  const [contextMenuCodeLoading, setContextMenuCodeLoading] = useState(false);
  const [contextMenuSkillsLoading, setContextMenuSkillsLoading] = useState(false);
  const [contextMenuFileItems, setContextMenuFileItems] = useState<ComposerContextMenuItem[]>([]);
  const [contextMenuCodeItems, setContextMenuCodeItems] = useState<ComposerContextMenuItem[]>([]);
  const [contextMenuSkillCatalog, setContextMenuSkillCatalog] = useState<SkillCatalogItem[]>([]);
  const predictionSuffix = prediction?.completionText ?? '';
  const showShellIndicator = false;
  const showSlashCommandHighlight = hasCompleteSlashCommand(query);
  const showContextMentionHighlight = hasComposerContextMentions(query);
  const contextTrigger = getTrailingComposerContextTrigger(query);
  const contextTriggerKey = contextTrigger ? `${contextTrigger.start}:${contextTrigger.value}` : null;
  const contextMentionQuery = contextTrigger?.value ?? '';
  const isRepoContext = Boolean(gitContext);
  const workspaceRoot = gitContext?.rootPath?.trim() || workingDirectory?.trim() || null;
  const agentSettings = useMemo(() => normalizeAgentSettings(memorySettings?.values), [memorySettings?.values]);
  const filesMenuItems = useMemo(() => contextMenuFileItems, [contextMenuFileItems]);
  const codeMenuItems = useMemo(() => contextMenuCodeItems, [contextMenuCodeItems]);
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
        const description = contentPreview.length > 72 ? `${contentPreview.slice(0, 72).trimEnd()}…` : contentPreview;

        return {
          id: `rule:${rule.id}`,
          label: rule.name,
          description: description || rule.category,
          icon: <Shield size={15} />,
          insertToken: serializeComposerContextMention('rule', rule.name)
        };
      });
  }, [agentSettings.knowledge.rules, contextMentionQuery]);
  const rulesEnabled = agentSettings.knowledge.rulesEnabled;
  const currentPanelItems = contextMenuPanel === 'root'
    ? COMPOSER_ROOT_ITEMS
    : contextMenuPanel === 'files'
      ? [...filesMenuItems, ...codeMenuItems]
      : contextMenuPanel === 'skills'
        ? skillsMenuItems
        : contextMenuPanel === 'rules'
          ? ruleMenuItems
      : [];
  const currentPanelItemCount = currentPanelItems.length;

  const resolveWorkspacePath = (path: string) => {
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
  };

  const openContextMenu = () => {
    setContextMenuOpen(true);
    setContextMenuPanel('root');
    setContextMenuActiveIndex(0);
  };

  const closeContextMenu = (suppressCurrentTrigger = true) => {
    if (suppressCurrentTrigger && contextTriggerKey) {
      setContextMenuSuppressedKey(contextTriggerKey);
    }
    setContextMenuOpen(false);
    setContextMenuPanel('root');
    setContextMenuActiveIndex(0);
    setContextMenuFilesLoading(false);
    setContextMenuCodeLoading(false);
    setContextMenuSkillsLoading(false);
  };

  useEffect(() => {
    if (!contextTriggerKey) {
      setContextMenuOpen(false);
      setContextMenuSuppressedKey(null);
      setContextMenuPanel('root');
      setContextMenuActiveIndex(0);
      setContextMenuFilesLoading(false);
      setContextMenuCodeLoading(false);
      return;
    }

    if (contextTriggerKey === contextMenuSuppressedKey) {
      return;
    }

    if (!contextMenuOpen) {
      openContextMenu();
    }
  }, [contextMenuOpen, contextMenuSuppressedKey, contextTriggerKey]);

  useEffect(() => {
    if (!contextMenuOpen) {
      setContextMenuActiveIndex(0);
      return;
    }

    setContextMenuActiveIndex((currentIndex) => Math.min(currentIndex, Math.max(0, currentPanelItemCount - 1)));
  }, [contextMenuOpen, contextMenuPanel, currentPanelItemCount]);

  useEffect(() => {
    if (!contextMenuOpen) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      if (contextMenuPanel !== 'files') {
        return;
      }

      setContextMenuFilesLoading(true);
      setContextMenuCodeLoading(true);

      const directoryRequestPath = workingDirectory?.trim() || '.';
      try {
        const query = contextMentionQuery.trim();
        const useRecursiveSearch = isRepoContext && query.length >= 2;
        const listing = useRecursiveSearch
          ? await invoke<FilesystemSearchListing>('terminal_search_directory_entries', {
              request: {
                path: directoryRequestPath,
                query
              }
            })
          : await invoke<FilesystemDirectoryListing>('terminal_list_directory_entries', {
              request: {
                path: directoryRequestPath,
                query: query.length > 0 ? query : null,
                directoriesOnly: false
              }
            });

        if (!cancelled) {
          const nextItems = useRecursiveSearch
            ? (listing as FilesystemSearchListing).entries
                .slice(0, 24)
                .map<ComposerContextMenuItem>((entry) => ({
                  id: `file:${entry.path}`,
                  label: entry.name,
                  description: resolveWorkspacePath(entry.path),
                  icon: entry.isDirectory ? <FolderOpen size={15} /> : <FileIcon size={15} />,
                  kind: entry.isDirectory ? 'folder' : 'file',
                  path: entry.path,
                  insertToken: serializeComposerContextMention(entry.isDirectory ? 'folder' : 'file', resolveWorkspacePath(entry.path))
                }))
            : (listing as FilesystemDirectoryListing).entries
                .slice()
                .sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name))
                .slice(0, 24)
                .map<ComposerContextMenuItem>((entry) => ({
                  id: `file:${entry.path}`,
                  label: entry.name,
                  description: resolveWorkspacePath(entry.path),
                  icon: entry.isDirectory ? <FolderOpen size={15} /> : <FileIcon size={15} />,
                  kind: entry.isDirectory ? 'folder' : 'file',
                  path: entry.path,
                  insertToken: serializeComposerContextMention(entry.isDirectory ? 'folder' : 'file', resolveWorkspacePath(entry.path))
                }));
          setContextMenuFileItems(nextItems);
        }
      } catch (error) {
        console.warn('[composer-context-menu] failed to load directory entries', error);
        if (!cancelled) {
          setContextMenuFileItems([]);
        }
      } finally {
        if (!cancelled) {
          setContextMenuFilesLoading(false);
        }
      }

      if (!isRepoContext || contextMentionQuery.trim().length === 0) {
        if (!cancelled) {
          setContextMenuCodeItems([]);
          setContextMenuCodeLoading(false);
        }
        return;
      }

      try {
        const results = await invoke<CodeIndexSearchResult[]>('code_index_search', {
          query: contextMentionQuery.trim(),
          maxResults: 12
        });

        if (!cancelled) {
          setContextMenuCodeItems(results.map<ComposerContextMenuItem>((result) => ({
            id: `code:${result.projectId}:${result.path}`,
            label: result.relativePath,
            description: result.snippet || result.projectName,
            icon: <Code2 size={15} />,
            insertToken: serializeComposerContextMention('function', resolveWorkspacePath(result.relativePath))
          })));
        }
      } catch (error) {
        console.warn('[composer-context-menu] failed to search code index', error);
        if (!cancelled) {
          setContextMenuCodeItems([]);
        }
      } finally {
        if (!cancelled) {
          setContextMenuCodeLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [contextMenuOpen, contextMenuPanel, contextMentionQuery, isRepoContext, workingDirectory, workspaceRoot]);

  useEffect(() => {
    if (contextMenuPanel !== 'files') {
      setContextMenuFileItems([]);
      setContextMenuCodeItems([]);
      setContextMenuFilesLoading(false);
      setContextMenuCodeLoading(false);
    }
  }, [contextMenuPanel]);

  useEffect(() => {
    if (!contextMenuOpen) {
      return;
    }

    let cancelled = false;
    const loadSkills = async () => {
      setContextMenuSkillsLoading(true);
      try {
        const skills = await invoke<SkillCatalogItem[]>('agent_list_skills');
        if (!cancelled) {
          setContextMenuSkillCatalog(skills);
        }
      } catch (error) {
        console.warn('[composer-context-menu] failed to load skills catalog', error);
        if (!cancelled) {
          setContextMenuSkillCatalog([]);
        }
      } finally {
        if (!cancelled) {
          setContextMenuSkillsLoading(false);
        }
      }
    };

    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, [contextMenuOpen]);

  useEffect(() => {
    if (!contextMenuOpen) {
      return;
    }

    setContextMenuActiveIndex(0);
  }, [contextMenuOpen, contextMenuPanel, contextTriggerKey]);

  const handleContextMenuItemSelect = (item: ComposerContextMenuItem) => {
    if (item.panel) {
      setContextMenuPanel(item.panel);
      setContextMenuActiveIndex(0);
      return;
    }

    if (mode === 'shell' && item.kind === 'folder' && item.path && onExecuteTerminalCommand) {
      const command = `cd ${shellQuotePath(item.path)}`;
      onExecuteTerminalCommand(command);
      closeContextMenu(true);
      return;
    }

    const insertToken = item.insertToken;
    if (!insertToken) {
      return;
    }

    const trigger = getTrailingComposerContextTrigger(query);
    if (!trigger) {
      return;
    }

    const nextQuery = `${query.slice(0, trigger.start)}${insertToken} ${query.slice(trigger.end)}`.replace(/[ \t]{2,}/g, ' ');
    onQueryChange(nextQuery);
    closeContextMenu(true);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      const caret = Math.min(nextQuery.length, trigger.start + insertToken.length + 1);
      input.focus({ preventScroll: true });
      try {
        input.setSelectionRange(caret, caret);
      } catch {
        // Ignore selection errors in browsers that reject programmatic ranges.
      }
    });
  };

  function shellQuotePath(value: string) {
    if (!value.trim()) {
      return "''";
    }

    return `'${value.replace(/'/g, "'\\''")}'`;
  }

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
        setContextMenuPanel('root');
        setContextMenuActiveIndex(0);
      } else {
        closeContextMenu(true);
      }
      return true;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setContextMenuActiveIndex((index) => Math.min(index + 1, Math.max(0, currentPanelItemCount - 1)));
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setContextMenuActiveIndex((index) => Math.max(index - 1, 0));
      return true;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedItem = currentPanelItems[contextMenuActiveIndex];
      if (!selectedItem) {
        return true;
      }

      handleContextMenuItemSelect(selectedItem);
      return true;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const selectedItem = currentPanelItems[contextMenuActiveIndex];
      if (selectedItem?.panel) {
        handleContextMenuItemSelect(selectedItem);
      }
      return true;
    }

    return false;
  };

  // Reset dismissal when recommendation changes
  useEffect(() => {
    setIsDismissed(false);
  }, [recommendedAction?.value]);

  const showRecommendation = recommendedAction && query === '' && !isDismissed;
  const canAttachFiles = !modelSetupRequired && selectedModelSupportsAttachments;
  const attachTooltip = modelSetupRequired
    ? 'Set up a model first'
    : canAttachFiles
      ? 'Attach files'
      : 'Selected model does not support attachments';

  useEffect(() => {
    if (!selectedModelSupportsAttachments && attachedFiles.length > 0) {
      onClearAttachments();
    }
  }, [attachedFiles.length, onClearAttachments, selectedModelSupportsAttachments]);

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

    void onAttachFiles(files);
  };

  const handleInternalKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleContextMenuKeyDown(event)) {
      return;
    }

    if (event.key === 'ArrowRight' && prediction?.fullCommand) {
      event.preventDefault();
      event.stopPropagation();
      onQueryChange(prediction.fullCommand);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) {
          return;
        }

        const caret = prediction.fullCommand.length;
        try {
          input.setSelectionRange(caret, caret);
        } catch {
          // Ignore selection errors in browsers that reject programmatic ranges.
        }
      });
      return;
    }

    if (event.key === 'Backspace') {
      const input = event.currentTarget;
      const selectionStart = input.selectionStart ?? query.length;
      const selectionEnd = input.selectionEnd ?? query.length;
      const deletionRange = getComposerContextMentionDeletionRange(query, selectionStart, selectionEnd);

      if (deletionRange) {
        event.preventDefault();
        const nextQuery = `${query.slice(0, deletionRange.start)}${query.slice(deletionRange.end).replace(/^[ \t]+/, ' ')}`.replace(/[ \t]{2,}/g, ' ');
        onQueryChange(nextQuery);
        requestAnimationFrame(() => {
          const nextCaret = deletionRange.start;
          try {
            input.setSelectionRange(nextCaret, nextCaret);
          } catch {
            // Ignore selection errors in browsers that reject programmatic ranges.
          }
        });
        return;
      }
    }

    if (event.key === 'Backspace' && query === '' && showRecommendation) {
      setIsDismissed(true);
      event.preventDefault();
      return;
    }
    onKeyDown(event);
  };
  return (
    <div ref={shellRef} className="composer-shell">
      <div className={`composer-input-row ${mode === 'shell' ? 'shell-active' : ''}`}>
        <div className="composer-editor-shell">
          <div className="composer-input-wrapper">
            <div className={`composer-textarea-container ${mode === 'shell' ? 'shell-mode' : ''} ${showShellIndicator ? 'manual-shell-mode' : ''} ${showRecommendation ? 'has-recommendation' : ''}`}>
              {showRecommendation && (
                <div className="composer-recommendation-chip-wrapper">
                  <button
                    className="composer-recommendation-chip"
                    onClick={() => onRecommendedActionClick(recommendedAction)}
                    type="button"
                    title={recommendedAction.description}
                  >
                    <Sparkles size={12} className="recommendation-icon" />
                    <span className="recommendation-label">{recommendedAction.value}</span>
                    <span className="recommendation-accept-group" aria-hidden="true">
                      <span className="recommendation-accept-key">↑</span>
                      <span className="recommendation-accept-key">
                        <CornerDownLeft size={10} />
                      </span>
                    </span>
                  </button>
                </div>
              )}

              {predictionSuffix && (
                <div className="composer-suggestion-overlay" aria-hidden="true">
                  <span className="composer-suggestion-prefix">{query}</span>
                  <span className="composer-suggestion-text">{predictionSuffix}</span>
                  <span className="composer-suggestion-accept-group" title={prediction?.hint}>
                    <span className="composer-suggestion-accept-main">
                      <ArrowRight size={11} />
                    </span>
                    <span className="composer-suggestion-accept-tail">
                      <span className="composer-suggestion-accept-tail-mark" />
                    </span>
                  </span>
                </div>
              )}

              <SlashCommandHighlight query={query} />

              <ComposerContextMenu
                activeIndex={contextMenuActiveIndex}
                anchorRef={contextMenuAnchorRef}
                codeItems={codeMenuItems}
                fileItems={filesMenuItems}
                gitContext={gitContext}
                isOpen={contextMenuOpen}
                isRepoContext={isRepoContext}
                loadingCode={contextMenuCodeLoading}
                loadingFiles={contextMenuFilesLoading}
                loadingRules={memoryStatus === 'loading' && memorySettings == null}
                loadingSkills={contextMenuSkillsLoading}
                mentionQuery={contextMentionQuery}
                ruleItems={ruleMenuItems}
                rulesEnabled={rulesEnabled}
                onBack={() => {
                  setContextMenuPanel('root');
                  setContextMenuActiveIndex(0);
                }}
                onClose={() => closeContextMenu(true)}
                onSelectItem={handleContextMenuItemSelect}
                onSetActiveIndex={setContextMenuActiveIndex}
                panel={contextMenuPanel}
                rootItems={COMPOSER_ROOT_ITEMS}
                skillItems={skillsMenuItems}
                workingDirectoryLabel={workingDirectoryLabel}
              />

              <textarea
                ref={inputRef}
                className={`chat-input ${showRecommendation ? 'has-recommendation' : ''} ${showSlashCommandHighlight ? 'has-slash-command-highlight' : ''} ${showContextMentionHighlight ? 'has-context-highlight' : ''}`.trim()}
                value={query}
                disabled={modelSetupRequired}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={handleInternalKeyDown}
                rows={showRecommendation ? 1 : 2}
                placeholder={
                  mode === 'shell'
                    ? 'Run a terminal command'
                    : placeholder ?? 'Octomus anything, or use / for tools'
                }
              />

              <input
                ref={fileInputRef}
                className="composer-file-input"
                type="file"
                multiple
                onChange={handleFileInputChange}
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>

            {modelSetupRequired && (
              <div className="composer-model-setup-card" role="status" aria-live="polite">
                <div className="composer-model-setup-copy">
                  <span className="composer-model-setup-eyebrow">Model onboarding</span>
                  <strong>You don't have any model</strong>
                  <p>Add one to unlock the launcher and connect your provider securely.</p>
                </div>
                <div className="composer-model-setup-actions">
                  <button
                    className="composer-model-setup-back"
                    onClick={onBackFromModelSetup ?? onOpenModelSettings}
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className="composer-model-setup-primary"
                    onClick={onOpenModelSettings}
                    type="button"
                  >
                    Open model settings
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {attachedFiles.length > 0 && (
        <div className="composer-attachments" aria-label="Attached files">
          <div className="composer-attachments-header">
            <span>{attachedFiles.length} attached file{attachedFiles.length === 1 ? '' : 's'}</span>
            <button className="composer-attachments-clear" type="button" onClick={onClearAttachments}>
              Clear all
            </button>
          </div>
          <div className="composer-attachments-list">
            {attachedFiles.map((attachment) => (
              <div key={attachment.id} className="composer-attachment-chip" title={attachment.mimeType ?? attachment.kind}>
                <Paperclip size={11} />
                <span className="composer-attachment-name">{attachment.name}</span>
                <button
                  className="composer-attachment-remove"
                  type="button"
                  onClick={() => onRemoveAttachedFile(attachment.id)}
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!restrictActions && (
        <div className="input-actions composer-actions">
          <div className="action-group left-actions">
            <WorkingDirectoryPicker
              buttonLabel={workingDirectoryLabel}
              currentPath={workingDirectory}
              isOpen={workingDirectoryPickerOpen}
              isCompact={true}
              listing={workingDirectoryListing}
              onClose={onCloseWorkingDirectoryPicker}
              onNavigateToParent={onNavigateToParentDirectory}
              onSearchQueryChange={onWorkingDirectorySearchChange}
              onSelectDirectory={onSelectWorkingDirectory}
              onToggle={onToggleWorkingDirectoryPicker}
              searchQuery={workingDirectorySearch}
            />
            {gitContext && (
              <GitBranchPicker
                branches={gitContext.branches}
                currentBranch={gitContext.currentBranch}
                isOpen={gitBranchMenuOpen}
                onClose={onCloseGitBranchMenu}
                onSelectBranch={onSelectGitBranch}
                onToggle={onToggleGitBranchMenu}
              />
            )}
            <button
              className={`toolbar-chip auto-detect-chip ${terminalAutoDetectEnabled ? 'active' : ''}`}
              onClick={onToggleTerminalAutoDetect}
              type="button"
              title="Auto detect terminal commands"
            >
              A*
            </button>
          </div>

          <div className="action-group right-actions">
            <button className="toolbar-chip model-chip" onClick={onToggleModelTray} type="button" title="Model">
              <span>{selectedModelLabel}</span>
            </button>
            {/* <button className="toolbar-chip remote-chip" type="button" title="Remote control">
              <MonitorSmartphone size={12} />
              <span>Remote</span>
            </button> */}
            <button
              className={`icon-button attach-button ${canAttachFiles ? '' : 'disabled'}`.trim()}
              disabled={!canAttachFiles}
              type="button"
              title={attachTooltip}
              aria-disabled={!canAttachFiles}
              onClick={handleAttachButtonClick}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
