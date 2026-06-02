import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ServiceLocator } from '../../services/ServiceLocator';
import { useShellStore } from '../../stores/ShellStore';
import { useEditorStore } from '../../stores/editorStore';
import { useMemoryStore } from '../../stores/memoryStore';
import { WorkspaceTopbar } from '../../components/App/chrome/WorkspaceTopbar';
import { WorkspaceSidebar } from '../../components/App/chrome/WorkspaceSidebar';
import { WorkspacePanelPlaceholder } from '../../components/App/chrome/WorkspacePanelPlaceholder';
import { SettingsContent } from '../../components/App/settings/SettingsContent';
import { SettingsSidebar } from '../../components/App/settings/SettingsSidebar';
import { AppWindowDrawers } from '../../components/App/drawers/AppWindowDrawers';
import { AgentsView } from '../../components/App/agents/AgentsView';
import { Launcher } from '../../components/Layout/Launcher';
import { LauncherStoreProvider, createLauncherStore, type LauncherStoreApi } from '../../stores';
import { useAppResize } from '../../components/App/hooks/useAppResize';
import { useBackendShortcutActions } from '../../components/App/hooks/useBackendShortcutActions';
import type { WorkspacePaneNode } from '../../components/App/chrome';
import './ShellWindow.css';

// ── Appearance helpers (inline — will move to shared location later) ─
function appearanceRecord(raw: unknown) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
function appearanceString(record: Record<string, unknown>, key: string, fallback: string) {
  return typeof record[key] === 'string' ? record[key] as string : fallback;
}
function appearanceBoolean(record: Record<string, unknown>, key: string, fallback: boolean) {
  return typeof record[key] === 'boolean' ? record[key] as boolean : fallback;
}
function appearanceNumber(record: Record<string, unknown>, key: string, fallback: number) {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] as number : fallback;
}
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)); }
function fontFamily(name: string) {
  if (name === 'JetBrains') return '"JetBrains Mono", "SF Mono", monospace';
  if (name === 'Monaspace') return '"Monaspace", "SF Mono", monospace';
  if (name === 'Menlo') return 'Menlo, "SF Mono", monospace';
  if (name === 'Monaco') return 'Monaco, "SF Mono", monospace';
  if (name === 'SF Mono') return '"SF Mono", monospace';
  return '"SF Mono", "Hack", "JetBrains Mono", monospace';
}
function applyAppearance(raw: unknown) {
  const r = appearanceRecord(raw);
  const root = document.documentElement;
  const body = document.body;
  const termFont = appearanceString(r, 'terminalFont', 'Hack');
  const agentFont = appearanceString(r, 'agentFont', 'Hack');
  const weight = appearanceString(r, 'fontWeight', 'Normal');
  const termFamily = fontFamily(termFont);
  const altPad = appearanceBoolean(r, 'useAltScreenPadding', true);
  root.style.setProperty('--font-mono', termFamily);
  root.style.setProperty('--appearance-agent-font', appearanceBoolean(r, 'matchTerminalFont', false) ? termFamily : fontFamily(agentFont));
  root.style.setProperty('--appearance-terminal-font-size', `${clamp(appearanceNumber(r, 'fontSize', 13), 9, 32)}px`);
  root.style.setProperty('--appearance-line-height', String(clamp(appearanceNumber(r, 'lineHeight', 1.2), 0.9, 2)));
  root.style.setProperty('--appearance-font-weight', weight === 'Bold' ? '700' : weight === 'Medium' ? '500' : '400');
  root.style.setProperty('--appearance-window-blur-radius', `${clamp(appearanceNumber(r, 'windowBlurRadius', 1), 0, 20)}px`);
  root.style.setProperty('--appearance-alt-screen-padding', `${altPad ? clamp(appearanceNumber(r, 'altScreenPadding', 0), 0, 80) : 0}px`);
  body.style.setProperty('zoom', `${clamp(Number(appearanceString(r, 'zoomLevel', '100')), 80, 120)}%`);
  body.style.opacity = String(clamp(appearanceNumber(r, 'windowOpacity', 100), 20, 100) / 100);
  body.classList.toggle('appearance-cursor-blinking', appearanceBoolean(r, 'cursorBlinking', true));
  body.classList.toggle('appearance-cursor-bar', appearanceString(r, 'cursorType', 'block') === 'bar');
  body.classList.toggle('appearance-cursor-block', appearanceString(r, 'cursorType', 'block') === 'block');
  body.classList.toggle('appearance-cursor-underline', appearanceString(r, 'cursorType', 'block') === 'underline');
  body.classList.toggle('appearance-compact-mode', appearanceBoolean(r, 'compactMode', false));
  body.classList.toggle('appearance-dim-inactive-panes', appearanceBoolean(r, 'dimInactivePanes', false));
  body.classList.toggle('appearance-focus-follows-mouse', appearanceBoolean(r, 'focusFollowsMouse', false));
  body.classList.toggle('appearance-hide-block-dividers', !appearanceBoolean(r, 'showBlockDividers', true));
  body.classList.toggle('appearance-hide-jump-to-bottom', !appearanceBoolean(r, 'showJumpToBottom', true));
  body.classList.toggle('appearance-hide-tab-indicators', !appearanceBoolean(r, 'showTabIndicators', true));
  body.classList.toggle('appearance-hide-tab-bar', appearanceString(r, 'showTabBar', 'windowed') === 'never');
  body.classList.toggle('appearance-tab-close-left', appearanceString(r, 'tabClosePosition', 'right') === 'left');
  body.classList.toggle('appearance-vertical-tabs', appearanceBoolean(r, 'verticalTabs', false));
  body.classList.toggle('appearance-input-top', appearanceString(r, 'inputPosition', 'bottom') === 'top');
  body.classList.toggle('appearance-shell-input', appearanceString(r, 'inputType', 'warp') === 'shell');
  body.classList.toggle('appearance-alt-screen-padding-enabled', altPad);
}

// ── Pane slot ──────────────────────────────────────────────────────
function PaneSlot(props: {
  paneId: string;
  tabId: string;
  active: boolean;
  launcherIdentityKey: string;
  hasMultiplePanes?: boolean;
  onFocusPane: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
}) {
  const storeRef = useRef<LauncherStoreApi | null>(null);
  const shell = ServiceLocator.get().shellWindow;
  const launcherProps = shell.buildLauncherProps(props.tabId, props.paneId);

  if (!storeRef.current) {
    storeRef.current = createLauncherStore(launcherProps.initialComposerSurface ?? 'terminal');
  }

  return (
    <div
      className={`app-window-launcher-slot ${props.active ? 'active' : ''}`}
      onMouseDown={() => props.onFocusPane(props.paneId)}
      onMouseEnter={() => {
        if (document.body.classList.contains('appearance-focus-follows-mouse')) {
          props.onFocusPane(props.paneId);
        }
      }}
    >
      {props.hasMultiplePanes && (
        <div className="app-window-launcher-pane-header">
          {props.onClosePane && (
            <button
              className="app-window-launcher-pane-close"
              type="button"
              aria-label="Close window"
              onClick={(e) => {
                e.stopPropagation();
                props.onClosePane?.(props.paneId);
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="app-window-launcher-slot-content">
        <LauncherStoreProvider store={storeRef.current}>
          <Launcher {...launcherProps} />
        </LauncherStoreProvider>
      </div>
    </div>
  );
}

// ── ShellWindow ────────────────────────────────────────────────────
export function ShellWindow() {
  const shell = ServiceLocator.get().shellWindow;

  // Subscribe to store slices
  const tabs = useShellStore((s) => s.tabs);
  const selectedTabId = useShellStore((s) => s.selectedTabId);
  const launcherTabId = useShellStore((s) => s.launcherTabId);
  const isSidebarOpen = useShellStore((s) => s.isSidebarOpen);
  const isAgentsActive = useShellStore((s) => s.isAgentsActive);
  const isSpotlightVisible = useShellStore((s) => s.isSpotlightVisible);
  const activeSectionId = useShellStore((s) => s.activeSectionId);
  const expandedGroupIds = useShellStore((s) => s.expandedGroupIds);
  const paneLayoutsByTabId = useShellStore((s) => s.paneLayoutsByTabId);

  const editorTabs = useEditorStore((s) => s.tabs);
  const appearanceSettings = useMemoryStore((s) => s.settings?.values.appearance);

  const isEditorOpen = editorTabs.length > 0;
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  const [paneSizes, setPaneSizes] = useState<Record<string, number>>({});
  const [hoveredHandleKey, setHoveredHandleKey] = useState<string | null>(null);

  const selectedTab = tabs.find((t) => t.id === selectedTabId) ?? tabs[0];
  const activePaneContext = shell.activePaneContext;
  const activePaneId = shell.activePaneId;
  const isSettingsView = shell.isSettingsView;
  const isLauncherView = shell.isLauncherView;
  const isSpotlightOwned = selectedTab?.id === launcherTabId && isSpotlightVisible;

  const selectedPaneLayout = shell.selectedPaneLayout;
  const selectedPaneIds = shell.selectedPaneIds;

  // Compute display tabs (view model)
  const displayTabs = useMemo(() => {
    // Simple pass-through for now — richer tab presentation can be delegated to a dedicated view model later.
    return tabs;
  }, [tabs]);

  // Appearance
  useEffect(() => {
    if (!appearanceSettings) return;
    applyAppearance(appearanceSettings);
  }, [appearanceSettings]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    const win = getCurrentWindow();
    const isFullscreen = await win.isFullscreen().catch(() => false);
    if (isFullscreen) {
      await win.setSimpleFullscreen(false).catch(() => {});
      await win.unmaximize().catch(() => {});
    } else {
      await win.setSimpleFullscreen(true).catch(async () => {
        await win.setFullscreen(true).catch(async () => {
          await win.maximize().catch(() => {});
        });
      });
    }
  }, []);

  // Resize
  const handleResizeStart = useCallback((
    event: React.MouseEvent,
    direction: 'horizontal' | 'vertical',
    index: number,
    key1: string, key2: string,
    splitElement: HTMLDivElement | null
  ) => {
    event.preventDefault();
    if (!splitElement) return;
    const children = Array.from(splitElement.children).filter(
      (el) => !el.classList.contains('workspace-resize-handle')
    ) as HTMLElement[];
    const child1 = children[index];
    const child2 = children[index + 1];
    if (!child1 || !child2) return;

    const r1 = child1.getBoundingClientRect();
    const r2 = child2.getBoundingClientRect();
    const isH = direction === 'horizontal';
    const initPos = isH ? event.clientX : event.clientY;
    const s1 = isH ? r1.width : r1.height;
    const s2 = isH ? r2.width : r2.height;
    const total = s1 + s2;
    const f1 = paneSizes[key1] ?? 1;
    const f2 = paneSizes[key2] ?? 1;
    const totalFlex = f1 + f2;

    const onMove = (e: MouseEvent) => {
      const delta = (isH ? e.clientX : e.clientY) - initPos;
      let newS1 = s1 + delta;
      if (newS1 < 80) newS1 = 80;
      if (total - newS1 < 80) newS1 = total - 80;
      const ratio = newS1 / total;
      setPaneSizes((prev) => ({
        ...prev,
        [key1]: ratio * totalFlex,
        [key2]: totalFlex - ratio * totalFlex,
      }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [paneSizes]);

  const { width: sidebarWidth, isResizing: isResizingSidebar, startResizing: startResizingSidebar } = useAppResize({
    initialWidth: 240, minWidth: 150, maxWidth: 500, direction: 'left',
  });

  // Pane tree render
  const paneTree = useMemo(() => {
    if (!selectedPaneLayout || !shell.isLauncherView) return null;
    const hasMultiplePanes = selectedPaneIds.length > 1;

    const renderNode = (node: WorkspacePaneNode, path = ''): JSX.Element => {
      if (node.type === 'leaf') {
        return (
          <PaneSlot
            key={shell.getLauncherIdentityKey(node.paneId)}
            paneId={node.paneId}
            tabId={selectedTab?.id ?? ''}
            active={activePaneId === node.paneId}
            hasMultiplePanes={hasMultiplePanes}
            launcherIdentityKey={shell.getLauncherIdentityKey(node.paneId)}
            onFocusPane={(id) => shell.focusPane(id)}
            onClosePane={hasMultiplePanes ? (id) => shell.closePane(id) : undefined}
          />
        );
      }
      const isH = node.direction === 'horizontal';
      const prefix = `${isH ? 'col' : 'row'}_${path}`;
      let splitRef: { current: HTMLDivElement | null } = { current: null };

      return (
        <div
          key={`split-${path}`}
          ref={(el) => { splitRef.current = el; }}
          className={`app-window-workspace-split ${node.direction}`}
          style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}
        >
          {node.children.map((child, i) => {
            const isLast = i === node.children.length - 1;
            const childPath = path ? `${path}/${i}` : `${i}`;
            const sizeKey = `${prefix}_${i}`;
            const size = paneSizes[sizeKey] ?? 1;
            return (
              <div
                key={childPath}
                style={{ flexGrow: size, flexBasis: 0, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: isH ? 'row' : 'column' }}
              >
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {renderNode(child, childPath)}
                </div>
                {!isLast && (
                  <div
                    className={`workspace-resize-handle ${node.direction} ${hoveredHandleKey === sizeKey ? 'hovered' : ''}`}
                    onMouseDown={(e) => handleResizeStart(e, node.direction, i, sizeKey, `${prefix}_${i + 1}`, splitRef.current)}
                    onMouseEnter={() => setHoveredHandleKey(sizeKey)}
                    onMouseLeave={() => setHoveredHandleKey(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      );
    };
    return renderNode(selectedPaneLayout.root);
  }, [selectedPaneLayout, selectedPaneIds, activePaneId, selectedTab, paneSizes, hoveredHandleKey, handleResizeStart, shell]);

  // Keyboard shortcuts
  useBackendShortcutActions({
    activeTabId: selectedTab?.id ?? '',
    onCloseActiveTab: () => selectedTab && shell.closeTab(selectedTab.id),
    onNewConversationTab: () => {}, // TODO: implement
    onNewTerminalTab: () => shell.createTerminalTab(),
    onOpenKeyboardShortcuts: () => setIsKeyboardShortcutsOpen(true),
    onOpenSettingsTab: () => shell.openSettingsSection(),
    onSplitTerminal: () => shell.splitTerminal('horizontal'),
    onToggleAgents: () => shell.toggleAgents(),
    onToggleSidebar: () => shell.toggleSidebar(),
  });

  return (
    <div className={`app-window ${isEditorOpen ? 'with-editor' : ''}`}>
      <WorkspaceTopbar
        activeTabId={selectedTab?.id ?? ''}
        launcherTabId={launcherTabId}
        tabs={displayTabs}
        activePaneContext={activePaneContext}
        onBringTabInLauncher={(id) => shell.setLauncherTabId(id)}
        onCloseOtherTabs={(id) => shell.closeOtherTabs(id)}
        onCloseTabsToRight={(id) => shell.closeTabsToRight(id)}
        onSelectTab={(id) => shell.selectTab(id)}
        onNewAgentTab={() => {}} // TODO: implement new agent conversation for ShellWindow
        onNewTerminalTab={() => shell.createTerminalTab()}
        onNewCloudTerminalTab={() => {}} // TODO
        onNewCloudAgentTab={() => {}} // TODO
        onCloseTab={(id) => shell.closeTab(id)}
        onMoveTab={(id, dir) => shell.moveTab(id, dir)}
        onRemoveTabFromLauncher={(id) => shell.removeTabFromLauncher(id)}
        onRenameTab={(id, label) => {
          if (label !== undefined) {
            shell.renameTab(id, label?.trim() || null);
          }
        }}
        onSaveTabAsConfig={(id) => {}} // TODO
        onSetTabTint={(id, tint) => shell.setTabTint(id, tint)}
        onOpenTabConfig={(path) => {}} // TODO
        onToggleSidebar={() => shell.toggleSidebar()}
        isSidebarOpen={isSidebarOpen}
        isAgentsActive={isAgentsActive}
        onToggleAgents={() => shell.toggleAgents()}
        onOpenSettingsSection={(sectionId) => shell.openSettingsSection(sectionId)}
        onOpenKeyboardShortcutsDrawer={() => setIsKeyboardShortcutsOpen(true)}
      />

      <div className="app-window-container">
        <div
          className="sidebar-wrapper"
          style={{
            width: isSidebarOpen ? sidebarWidth : 0,
            transition: isResizingSidebar ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="sidebar-clip-container">
            <WorkspaceSidebar
              conversations={[]}
              isOpen={isSidebarOpen}
              openConversationIds={[]}
              onClose={() => shell.toggleSidebar()}
              onNewConversation={() => {}}
              onDeleteConversation={() => {}}
              onForkConversationInNewPane={() => {}}
              onForkConversationInNewTab={() => {}}
              onSelectConversation={() => {}}
              selectedConversationId={null}
              activeWorkingDirectory={activePaneContext.workingDirectory}
            />
          </div>
          {isSidebarOpen && (
            <div className="resize-handle sidebar-handle" onMouseDown={startResizingSidebar} />
          )}
        </div>

        <div className="app-window-main">
          {isSettingsView && (
            <div className="app-window-header">
              <span className="app-window-header-title">Settings</span>
              <div className="app-window-header-actions">
                <button className="app-window-header-action" type="button" aria-label="Toggle fullscreen" onClick={() => void toggleFullscreen()}>
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="app-window-content-wrapper">
            <div className="app-window-workspace-container">
              <div className="app-window-workspace" style={{ display: isLauncherView ? 'flex' : 'none' }}>
                <div className="app-window-workspace-panes">
                  {isSpotlightOwned ? (
                    <div className="app-window-spotlight-overlay">
                      <div className="app-window-spotlight-overlay-title">
                        This tab is controlled by spotlight. Close spotlight or switch to another workspace tab.
                      </div>
                    </div>
                  ) : (
                    paneTree
                  )}
                </div>
              </div>

              {isSettingsView ? (
                <div className="app-window-settings-body">
                  <SettingsSidebar
                    activeSectionId={activeSectionId}
                    expandedGroupIds={expandedGroupIds}
                    onSelectSection={(id) => shell.selectSection(id)}
                    onToggleGroup={(id) => shell.toggleGroup(id)}
                  />
                  <SettingsContent sectionId={activeSectionId} />
                </div>
              ) : isLauncherView ? null : (
                <div className="app-window-panel">
                  <WorkspacePanelPlaceholder
                    eyebrow={selectedTab?.label ?? ''}
                    title={selectedTab?.label ?? ''}
                    description={
                      selectedTab?.kind === 'tools'
                        ? 'This tools panel will host shared utilities, quick actions, and launcher-wide commands.'
                        : selectedTab?.kind === 'agents'
                          ? 'This agent management panel will hold orchestration, profiles, and runtime controls.'
                          : `Workspace for ${selectedTab?.label?.toLowerCase() ?? 'this tab'} is still a placeholder.`
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <AppWindowDrawers
            isEditorOpen={isEditorOpen}
            isKeyboardShortcutsDrawerOpen={isKeyboardShortcutsOpen}
            activeWorkingDirectory={activePaneContext.workingDirectory}
            onCloseKeyboardShortcutsDrawer={() => setIsKeyboardShortcutsOpen(false)}
          />

          {isAgentsActive && (
            <div className="app-window-overlay" role="presentation">
              <div className="app-window-overlay-panel">
                <AgentsView
                  conversations={[]}
                  openConversationIds={[]}
                  selectedConversationId={null}
                  onNewConversation={() => {}}
                  onSelectConversation={() => {}}
                  onClose={() => shell.toggleAgents()}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
