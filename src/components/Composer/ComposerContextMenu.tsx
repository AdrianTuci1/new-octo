import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Code2, Folder, FolderOpen, Shield, Sparkles } from 'lucide-react';
import type { GitRepoContext } from '../../types/git';

export type ComposerContextMenuPanel =
  | 'root'
  | 'files'
  | 'blocks'
  | 'workflows'
  | 'notebooks'
  | 'plans'
  | 'conversations'
  | 'rules'
  | 'skills';

export type ComposerContextMenuItem = {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  panel?: ComposerContextMenuPanel;
  insertToken?: string;
};

type ComposerContextMenuProps = {
  anchorRef: RefObject<HTMLTextAreaElement | null>;
  isOpen: boolean;
  panel: ComposerContextMenuPanel;
  activeIndex: number;
  rootItems: ComposerContextMenuItem[];
  fileItems: ComposerContextMenuItem[];
  codeItems: ComposerContextMenuItem[];
  skillItems: ComposerContextMenuItem[];
  ruleItems: ComposerContextMenuItem[];
  loadingFiles?: boolean;
  loadingCode?: boolean;
  loadingSkills?: boolean;
  loadingRules?: boolean;
  rulesEnabled?: boolean;
  mentionQuery: string;
  workingDirectoryLabel: string;
  isRepoContext: boolean;
  gitContext: GitRepoContext | null;
  onClose: () => void;
  onBack: () => void;
  onSelectItem: (item: ComposerContextMenuItem) => void;
  onSetActiveIndex: (index: number) => void;
};

const PANEL_TITLES: Record<ComposerContextMenuPanel, string> = {
  root: 'Context',
  files: 'Files and folders',
  blocks: 'Blocks',
  workflows: 'Workflows',
  notebooks: 'Notebooks',
  plans: 'Plans',
  conversations: 'Conversations',
  rules: 'Rules',
  skills: 'Skills'
};

function renderItemButton(
  item: ComposerContextMenuItem,
  index: number,
  activeIndex: number,
  onSelectItem: (item: ComposerContextMenuItem) => void,
  onSetActiveIndex: (index: number) => void,
  showChevron = false,
  className = 'composer-context-menu-item'
) {
  return (
    <button
      key={item.id}
      className={`${className} ${activeIndex === index ? 'active' : ''}`.trim()}
      onClick={() => onSelectItem(item)}
      onMouseEnter={() => onSetActiveIndex(index)}
      type="button"
    >
      <span className="composer-context-menu-item-icon">{item.icon}</span>
      <span className="composer-context-menu-item-body">
        <span className="composer-context-menu-item-label">{item.label}</span>
        {item.description ? <span className="composer-context-menu-item-description">{item.description}</span> : null}
      </span>
      {showChevron ? (
        <ChevronRight size={11} className="composer-context-menu-chevron" />
      ) : null}
    </button>
  );
}

export function ComposerContextMenu({
  anchorRef,
  isOpen,
  panel,
  activeIndex,
  rootItems,
  fileItems,
  codeItems,
  skillItems,
  ruleItems,
  loadingFiles = false,
  loadingCode = false,
  loadingSkills = false,
  loadingRules = false,
  rulesEnabled = true,
  mentionQuery,
  workingDirectoryLabel,
  isRepoContext,
  gitContext,
  onClose,
  onBack,
  onSelectItem,
  onSetActiveIndex
}: ComposerContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = panel === 'files'
        ? Math.min(368, window.innerWidth - 24)
        : Math.min(324, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.left),
        window.innerWidth - width - 12
      );

      setMenuStyle({
        width,
        left,
        bottom: Math.max(16, window.innerHeight - rect.top + 10)
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !anchorRef.current?.contains(target)
        && !rootRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        onClose();
      }
    };

    updatePosition();
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, isOpen, onClose, panel]);

  const panelItems = useMemo(() => {
    if (panel === 'root') {
      return rootItems;
    }

    if (panel === 'files') {
      return [...fileItems, ...codeItems];
    }

    if (panel === 'skills') {
      return skillItems;
    }

    if (panel === 'rules') {
      return ruleItems;
    }

    return [];
  }, [codeItems, fileItems, panel, rootItems, ruleItems, skillItems]);

  const renderPanelList = (
    items: ComposerContextMenuItem[],
    offset = 0,
    className = 'composer-context-menu-list'
  ) => (
    <div className={className} role="listbox">
      {items.map((item, index) => renderItemButton(
        item,
        offset + index,
        activeIndex,
        onSelectItem,
        onSetActiveIndex
      ))}
    </div>
  );

  const renderContextPanel = () => {
    if (panel === 'files') {
      return (
        <div className="composer-context-menu-body">
          <div className="composer-context-menu-section">
            <div className="composer-context-menu-section-label">
              <FolderOpen size={12} />
              <span>Files and folders</span>
              {loadingFiles ? <span className="composer-context-menu-section-status">Loading...</span> : null}
            </div>

            {fileItems.length > 0 ? (
              renderPanelList(fileItems, 0)
            ) : (
              <div className="composer-context-menu-empty">
                {loadingFiles ? 'Loading workspace entries...' : 'No files matched the current query.'}
              </div>
            )}
          </div>

          <div className="composer-context-menu-section">
            <div className="composer-context-menu-section-label">
              <Code2 size={12} />
              <span>Functions and symbols</span>
              {loadingCode ? <span className="composer-context-menu-section-status">Searching...</span> : null}
            </div>

            {isRepoContext ? (
              codeItems.length > 0 ? (
                renderPanelList(codeItems, fileItems.length)
              ) : (
                <div className="composer-context-menu-empty">
                  {mentionQuery.trim().length > 0 ? 'No indexed symbols matched this query.' : 'Type after @ to search indexed code.'}
                </div>
              )
            ) : (
              <div className="composer-context-menu-empty">
                Open a git repository to search code symbols here.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (panel === 'skills' || panel === 'rules') {
      const items = panel === 'skills' ? skillItems : ruleItems;
      const loading = panel === 'skills' ? loadingSkills : loadingRules;
      const isDisabled = panel === 'rules' && !rulesEnabled;
      const emptyCopy = panel === 'skills'
        ? (loading ? 'Loading skills...' : 'No installed skills matched the current query.')
        : isDisabled
          ? 'Rules are disabled in settings.'
          : loading
            ? 'Loading rules...'
            : 'No rules matched the current query.';
      const emptyHint = panel === 'skills'
        ? 'Skills come from the local skill catalog.'
        : isDisabled
          ? 'Enable rules in settings to browse them here.'
          : 'Rules come from your agent settings.';
      const sectionIcon = panel === 'skills' ? <Sparkles size={12} /> : <Shield size={12} />;

      return (
        <div className="composer-context-menu-body">
          <div className="composer-context-menu-section">
            <div className="composer-context-menu-section-label">
              {sectionIcon}
              <span>{PANEL_TITLES[panel]}</span>
              {loading ? <span className="composer-context-menu-section-status">Loading...</span> : null}
            </div>

            {items.length > 0 ? (
              renderPanelList(items)
            ) : (
              <div className="composer-context-menu-empty">
                <div>{emptyCopy}</div>
                <div className="composer-context-menu-empty-hint">{emptyHint}</div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="composer-context-menu-empty-state">
        <div className="composer-context-menu-empty-title">{PANEL_TITLES[panel]}</div>
        <div className="composer-context-menu-empty-copy">
          {panel === 'blocks' && 'Context blocks will live here soon.'}
          {panel === 'workflows' && 'Workflow shortcuts will appear here soon.'}
          {panel === 'notebooks' && 'Notebook references will appear here soon.'}
          {panel === 'plans' && 'Plan templates will appear here soon.'}
          {panel === 'conversations' && 'Conversation references will appear here soon.'}
        </div>
        <div className="composer-context-menu-empty-hint">
          Use Esc to close or the left arrow to go back.
        </div>
        <div className="composer-context-menu-empty-meta">
          <Folder size={12} />
          <span>{workingDirectoryLabel}</span>
          {gitContext ? (
            <span className="composer-context-menu-empty-meta-branch">
              {gitContext.currentBranch}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div ref={rootRef} className="composer-context-menu-anchor">
      {isOpen && createPortal(
        <div ref={menuRef} className="composer-context-menu" style={menuStyle}>
          {panel === 'root' ? (
            <div className="composer-context-menu-list composer-context-menu-root-list" role="listbox">
              {panelItems.map((item, index) => renderItemButton(
                item,
                index,
                activeIndex,
                onSelectItem,
                onSetActiveIndex,
                true,
                'composer-context-menu-item composer-context-menu-root-item'
              ))}
            </div>
          ) : (
            <div className="composer-context-menu-panel">
              <button type="button" className="composer-context-menu-back" onClick={onBack}>
                <ChevronLeft size={14} />
                <span>{PANEL_TITLES[panel]}</span>
              </button>
              {renderContextPanel()}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
