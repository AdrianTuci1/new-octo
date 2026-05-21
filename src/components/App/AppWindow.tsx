import { useAppResize } from './hooks/useAppResize';
import './AppWindow.css';
import { Launcher } from '../Layout/Launcher';
import { WorkspacePanelPlaceholder, WorkspaceTopbar } from './chrome';
import { SettingsContent } from './settings/SettingsContent';
import { SettingsSidebar } from './settings/SettingsSidebar';
import { WorkspaceSidebar } from './chrome/WorkspaceSidebar';
import { useAppWindow } from './hooks/useAppWindow';
import { AgentsView } from './agents/AgentsView';
import { useEditorStore } from '../../stores/editorStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMemoryStore } from '../../stores/memoryStore';
import { AppWindowDrawers } from './drawers/AppWindowDrawers';
import { useBackendShortcutActions } from './hooks/useBackendShortcutActions';
import type { WorkspacePaneNode } from './chrome';
import { LauncherStoreProvider, createLauncherStore, type LauncherStoreApi } from '../../stores';
import { Maximize2, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as Utils from './utils';

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

function clampAppearanceNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function appearanceFontFamily(font: string) {
  if (font === 'JetBrains') return '"JetBrains Mono", "SF Mono", monospace';
  if (font === 'Monaspace') return '"Monaspace", "SF Mono", monospace';
  if (font === 'Menlo') return 'Menlo, "SF Mono", monospace';
  if (font === 'Monaco') return 'Monaco, "SF Mono", monospace';
  if (font === 'SF Mono') return '"SF Mono", monospace';
  return '"SF Mono", "Hack", "JetBrains Mono", monospace';
}

function applyAppearanceSettings(rawAppearance: unknown) {
  const record = appearanceRecord(rawAppearance);
  const root = document.documentElement;
  const body = document.body;
  const terminalFont = appearanceString(record, 'terminalFont', 'Hack');
  const agentFont = appearanceString(record, 'agentFont', 'Hack');
  const fontWeight = appearanceString(record, 'fontWeight', 'Normal');
  const terminalFamily = appearanceFontFamily(terminalFont);
  const useAltScreenPadding = appearanceBoolean(record, 'useAltScreenPadding', true);

  root.style.setProperty('--font-mono', terminalFamily);
  root.style.setProperty(
    '--appearance-agent-font',
    appearanceBoolean(record, 'matchTerminalFont', false) ? terminalFamily : appearanceFontFamily(agentFont)
  );
  root.style.setProperty('--appearance-terminal-font-size', `${clampAppearanceNumber(appearanceNumber(record, 'fontSize', 13), 9, 32)}px`);
  root.style.setProperty('--appearance-line-height', String(clampAppearanceNumber(appearanceNumber(record, 'lineHeight', 1.2), 0.9, 2)));
  root.style.setProperty('--appearance-font-weight', fontWeight === 'Bold' ? '700' : fontWeight === 'Medium' ? '500' : '400');
  root.style.setProperty('--appearance-window-blur-radius', `${clampAppearanceNumber(appearanceNumber(record, 'windowBlurRadius', 1), 0, 20)}px`);
  root.style.setProperty(
    '--appearance-alt-screen-padding',
    `${useAltScreenPadding ? clampAppearanceNumber(appearanceNumber(record, 'altScreenPadding', 0), 0, 80) : 0}px`
  );

  body.style.setProperty('zoom', `${clampAppearanceNumber(Number(appearanceString(record, 'zoomLevel', '100')), 80, 120)}%`);
  body.style.opacity = String(clampAppearanceNumber(appearanceNumber(record, 'windowOpacity', 100), 20, 100) / 100);
  body.classList.toggle('appearance-cursor-blinking', appearanceBoolean(record, 'cursorBlinking', true));
  body.classList.toggle('appearance-cursor-bar', appearanceString(record, 'cursorType', 'block') === 'bar');
  body.classList.toggle('appearance-cursor-block', appearanceString(record, 'cursorType', 'block') === 'block');
  body.classList.toggle('appearance-cursor-underline', appearanceString(record, 'cursorType', 'block') === 'underline');
  body.classList.toggle('appearance-compact-mode', appearanceBoolean(record, 'compactMode', false));
  body.classList.toggle('appearance-dim-inactive-panes', appearanceBoolean(record, 'dimInactivePanes', false));
  body.classList.toggle('appearance-focus-follows-mouse', appearanceBoolean(record, 'focusFollowsMouse', false));
  body.classList.toggle('appearance-hide-block-dividers', !appearanceBoolean(record, 'showBlockDividers', true));
  body.classList.toggle('appearance-hide-jump-to-bottom', !appearanceBoolean(record, 'showJumpToBottom', true));
  body.classList.toggle('appearance-hide-tab-indicators', !appearanceBoolean(record, 'showTabIndicators', true));
  body.classList.toggle('appearance-hide-tab-bar', appearanceString(record, 'showTabBar', 'windowed') === 'never');
  body.classList.toggle('appearance-tab-close-left', appearanceString(record, 'tabClosePosition', 'right') === 'left');
  body.classList.toggle('appearance-vertical-tabs', appearanceBoolean(record, 'verticalTabs', false));
  body.classList.toggle('appearance-input-top', appearanceString(record, 'inputPosition', 'bottom') === 'top');
  body.classList.toggle('appearance-shell-input', appearanceString(record, 'inputType', 'warp') === 'shell');
  body.classList.toggle('appearance-alt-screen-padding-enabled', useAltScreenPadding);
}

function WorkspacePaneSlot(props: {
  paneId: string;
  tabId: string;
  active: boolean;
  onFocusPane: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
  hasMultiplePanes?: boolean;
  launcherProps: ReturnType<ReturnType<typeof useAppWindow>['actions']['getLauncherProps']>;
}) {
  const storeRef = useRef<LauncherStoreApi | null>(null);

  if (!storeRef.current) {
    storeRef.current = createLauncherStore(props.launcherProps.initialComposerSurface ?? 'terminal');
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
          <Launcher {...props.launcherProps} />
        </LauncherStoreProvider>
      </div>
    </div>
  );
}

export function AppWindow() {
  const app = useAppWindow();
  const { tabs } = useEditorStore();
  const appearanceSettings = useMemoryStore((state) => state.settings?.values.appearance);
  const isEditorOpen = tabs.length > 0;
  const [isKeyboardShortcutsDrawerOpen, setIsKeyboardShortcutsDrawerOpen] = useState(false);
  const isSpotlightOwned = app.chrome.selectedTab.id === app.chrome.launcherTabId && app.chrome.isSpotlightVisible;

  const [paneSizes, setPaneSizes] = useState<Record<string, number>>({});
  const [hoveredHandleKey, setHoveredHandleKey] = useState<string | null>(null);

  const toggleFullscreen = useCallback(async () => {
    if (!(window as any).__TAURI_INTERNALS__) {
      return;
    }

    const currentWindow = getCurrentWindow();
    const isFullscreen = await currentWindow.isFullscreen().catch(() => false);

    if (isFullscreen) {
      await currentWindow.setSimpleFullscreen(false).catch(() => {});
      await currentWindow.unmaximize().catch(() => {});
      return;
    }

    await currentWindow.setSimpleFullscreen(true).catch(async () => {
      await currentWindow.setFullscreen(true).catch(async () => {
        await currentWindow.maximize().catch(() => {});
      });
    });
  }, []);

  const handleResizeStart = useCallback((
    event: React.MouseEvent,
    direction: 'horizontal' | 'vertical',
    index: number,
    key1: string,
    key2: string,
    splitElement: HTMLDivElement | null
  ) => {
    event.preventDefault();
    if (!splitElement) return;

    const childrenElements = Array.from(splitElement.children).filter(
      (el) => !el.classList.contains('workspace-resize-handle')
    ) as HTMLElement[];

    const childEl1 = childrenElements[index];
    const childEl2 = childrenElements[index + 1];
    if (!childEl1 || !childEl2) return;

    const rect1 = childEl1.getBoundingClientRect();
    const rect2 = childEl2.getBoundingClientRect();

    const isHorizontal = direction === 'horizontal';
    const initialPos = isHorizontal ? event.clientX : event.clientY;
    
    const size1 = isHorizontal ? rect1.width : rect1.height;
    const size2 = isHorizontal ? rect2.width : rect2.height;
    const totalSize = size1 + size2;

    const f1 = paneSizes[key1] ?? 1;
    const f2 = paneSizes[key2] ?? 1;
    const totalFlex = f1 + f2;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = isHorizontal ? e.clientX : e.clientY;
      const delta = currentPos - initialPos;

      let newSize1 = size1 + delta;
      const minSize = 80;
      if (newSize1 < minSize) newSize1 = minSize;
      if (totalSize - newSize1 < minSize) newSize1 = totalSize - minSize;

      const ratio1 = newSize1 / totalSize;
      const nextF1 = ratio1 * totalFlex;
      const nextF2 = totalFlex - nextF1;

      setPaneSizes((current) => ({
        ...current,
        [key1]: nextF1,
        [key2]: nextF2
      }));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [paneSizes]);

  const { width: sidebarWidth, isResizing: isResizingSidebarState, startResizing: startResizingSidebar } = useAppResize({
    initialWidth: 240,
    minWidth: 150,
    maxWidth: 500,
    direction: 'left'
  });

  const handleOpenSettingsTab = useCallback(() => {
    app.actions.onOpenSettingsSection();
  }, [app.actions]);

  useEffect(() => {
    applyAppearanceSettings(appearanceSettings);
  }, [appearanceSettings]);

  const workspacePaneTree = useMemo(() => {
    const paneIds = app.workspace.paneLayout ? Utils.collectPaneIdsFromLayout(app.workspace.paneLayout) : [];
    const hasMultiplePanes = paneIds.length > 1;

    const renderPaneNode = (node: WorkspacePaneNode, depth = 0): JSX.Element => {
      if (node.type === 'leaf') {
        return (
          <WorkspacePaneSlot
            active={app.workspace.activePaneId === node.paneId}
            launcherProps={app.actions.getLauncherProps(app.chrome.selectedTab.id, node.paneId)}
            onFocusPane={app.actions.onFocusPane}
            onClosePane={app.actions.onClosePane}
            hasMultiplePanes={hasMultiplePanes}
            paneId={node.paneId}
            tabId={app.chrome.selectedTab.id}
          />
        );
      }

      const splitRef = { current: null as HTMLDivElement | null };
      const isHorizontal = node.direction === 'horizontal';
      const prefix = `${isHorizontal ? 'col' : 'row'}_d${depth}`;

      return (
        <div
          key={`${node.direction}-${node.children.length}`}
          ref={(el) => { splitRef.current = el; }}
          className={`app-window-workspace-split ${node.direction}`}
          style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}
        >
          {node.children.map((child, index) => {
            const isLast = index === node.children.length - 1;
            const sizeKey = `${prefix}_${index}`;
            const size = paneSizes[sizeKey] ?? 1;

            return (
              <div
                key={index}
                style={{
                  flexGrow: size,
                  flexBasis: 0,
                  minWidth: 0,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: isHorizontal ? 'row' : 'column'
                }}
              >
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {renderPaneNode(child, depth + 1)}
                </div>
                {!isLast && (
                  <div
                    className={`workspace-resize-handle ${node.direction} ${hoveredHandleKey === sizeKey ? 'hovered' : ''}`}
                    onMouseDown={(e) => handleResizeStart(e, node.direction, index, sizeKey, `${prefix}_${index + 1}`, splitRef.current)}
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

    return app.workspace.paneLayout ? renderPaneNode(app.workspace.paneLayout.root) : null;
  }, [
    app.actions,
    app.chrome.selectedTab.id,
    app.workspace.activePaneId,
    app.workspace.paneLayout,
    paneSizes,
    hoveredHandleKey,
    handleResizeStart
  ]);

  useBackendShortcutActions({
    activeTabId: app.chrome.selectedTab.id,
    onCloseActiveTab: app.actions.onCloseTab,
    onNewConversationTab: app.actions.onNewConversationInNewTab,
    onNewTerminalTab: app.actions.onNewTerminalTab,
    onOpenKeyboardShortcuts: () => setIsKeyboardShortcutsDrawerOpen(true),
    onOpenSettingsTab: handleOpenSettingsTab,
    onSplitTerminal: app.actions.onSplitTerminal,
    onToggleAgents: app.actions.onToggleAgents,
    onToggleSidebar: app.actions.onToggleSidebar
  });

  return (
    <div className={`app-window ${isEditorOpen ? 'with-editor' : ''}`}>
      <WorkspaceTopbar
        activeTabId={app.chrome.selectedTab.id}
        launcherTabId={app.chrome.launcherTabId}
        tabs={app.chrome.displayTabs}
        activeWorkingDirectory={app.chrome.activeWorkingDirectory}
        onBringTabInLauncher={app.actions.setLauncherTabId}
        onCloseOtherTabs={app.actions.handleCloseOtherTabs}
        onCloseTabsToRight={app.actions.handleCloseTabsToRight}
        onSelectTab={app.actions.onSelectTab}
        onNewTerminalTab={app.actions.onNewTerminalTab}
        onNewCloudTerminalTab={app.actions.onNewCloudTerminalTab}
        onNewCloudAgentTab={() => { void app.actions.onNewCloudAgentTab(); }}
        onCloseTab={app.actions.onCloseTab}
        onMoveTab={app.actions.handleMoveTab}
        onRemoveTabFromLauncher={app.actions.onRemoveTabFromLauncher}
        onRenameTab={app.actions.handleRenameTab}
        onSaveTabAsConfig={app.actions.handleSaveTabAsConfig}
        onSetTabTint={app.actions.handleSetTabTint}
        onOpenTabConfig={app.actions.handleOpenTabConfig}
        onToggleSidebar={app.actions.onToggleSidebar}
        isSidebarOpen={app.chrome.isSidebarOpen}
        isAgentsActive={app.chrome.isAgentsActive}
        onToggleAgents={app.actions.onToggleAgents}
        onOpenSettingsSection={app.actions.onOpenSettingsSection}
        onOpenKeyboardShortcutsDrawer={() => setIsKeyboardShortcutsDrawerOpen(true)}
      />

      <div className="app-window-container">
        <div
          className="sidebar-wrapper"
          style={{
            width: app.chrome.isSidebarOpen ? sidebarWidth : 0,
            transition: isResizingSidebarState ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <div className="sidebar-clip-container">
            <WorkspaceSidebar
              conversations={app.sidebar.workspaceConversations}
              isOpen={app.chrome.isSidebarOpen}
              openConversationIds={app.sidebar.openConversationIds}
              onClose={app.actions.onToggleSidebar}
              onNewConversation={app.actions.onNewConversationInNewTab}
              onDeleteConversation={app.actions.handleDeleteConversation}
              onForkConversationInNewPane={app.actions.handleForkConversationInNewPane}
              onForkConversationInNewTab={app.actions.handleForkConversationInNewTab}
              onSelectConversation={app.actions.onSelectConversation}
              selectedConversationId={app.sidebar.selectedOpenConversationId}
              activeWorkingDirectory={app.chrome.activeWorkingDirectory}
            />
          </div>
          {app.chrome.isSidebarOpen && (
            <div className="resize-handle sidebar-handle" onMouseDown={startResizingSidebar} />
          )}
        </div>

        <div className="app-window-main">
          {app.workspace.isSettingsView && (
            <div className="app-window-header">
              <span className="app-window-header-title">Settings</span>
              <div className="app-window-header-actions">
                <button
                  className="app-window-header-action"
                  type="button"
                  aria-label="Toggle fullscreen"
                  onClick={() => {
                    void toggleFullscreen();
                  }}
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="app-window-content-wrapper">
            <div className="app-window-workspace-container">
              <div className="app-window-workspace" style={{ display: app.workspace.isLauncherView ? 'flex' : 'none' }}>
                <div className="app-window-workspace-panes">
                  {isSpotlightOwned ? (
                    <div className="app-window-spotlight-overlay">
                      <div className="app-window-spotlight-overlay-title">
                        This tab is controlled by spotlight. Close spotlight or switch to another workspace tab.
                      </div>
                    </div>
                  ) : (
                    workspacePaneTree
                  )}
                </div>
              </div>

              {app.workspace.isSettingsView ? (
                <div className="app-window-settings-body">
                  <SettingsSidebar
                    activeSectionId={app.settings.activeSectionId}
                    expandedGroupIds={app.settings.expandedGroupIds}
                    onSelectSection={app.actions.onSelectSection}
                    onToggleGroup={app.actions.onToggleGroup}
                  />
                  <SettingsContent sectionId={app.settings.activeSectionId} />
                </div>
              ) : app.workspace.isLauncherView ? null : (
                <div className="app-window-panel">
                  <WorkspacePanelPlaceholder
                    eyebrow={app.chrome.selectedTab.label}
                    title={app.chrome.selectedTab.label}
                    description={
                      app.chrome.selectedTab.kind === 'tools'
                        ? 'This tools panel will host shared utilities, quick actions, and launcher-wide commands.'
                        : app.chrome.selectedTab.kind === 'agents'
                          ? 'This agent management panel will hold orchestration, profiles, and runtime controls.'
                          : `Workspace for ${app.chrome.selectedTab.label.toLowerCase()} is still a placeholder.`
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <AppWindowDrawers
            isEditorOpen={isEditorOpen}
            isKeyboardShortcutsDrawerOpen={isKeyboardShortcutsDrawerOpen}
            activeWorkingDirectory={app.chrome.activeWorkingDirectory}
            onCloseKeyboardShortcutsDrawer={() => setIsKeyboardShortcutsDrawerOpen(false)}
          />

          {app.chrome.isAgentsActive && (
            <div className="app-window-overlay" role="presentation">
              <div className="app-window-overlay-panel">
                <AgentsView
                  conversations={app.sidebar.workspaceConversations}
                  openConversationIds={app.sidebar.openConversationIds}
                  selectedConversationId={app.sidebar.selectedOpenConversationId}
                  onNewConversation={app.actions.onNewConversationInNewTab}
                  onSelectConversation={app.actions.onSelectConversation}
                  onClose={app.actions.onToggleAgents}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
