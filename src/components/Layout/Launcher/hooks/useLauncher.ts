import { useMemo } from 'react';
import { useLauncherStore } from '../../../../stores';
import * as Modules from './modules';
import * as Hooks from '../../../../hooks';
import type { LauncherProps } from './types';

/**
 * useLauncher - The ultimate orchestrator for the Launcher component.
 * Acts as a declarative index coordinating specialized domain modules.
 */
export function useLauncher(props: LauncherProps) {
  const { active = true } = props;

  // 1. Foundation & Infrastructure
  // We use the whole store here because specialized modules might need various parts.
  // However, useLauncherRuntime now uses fine-grained selectors internally.
  const store = useLauncherStore((state) => state);
  const tray = Modules.useLauncherTrayState();
  const refs = Modules.useLauncherRefs();
  
  // Runtime provides the core stateful hooks (already memoized internally)
  const runtime = Modules.useLauncherRuntime(props, store, tray);
  
  // 2. Logic Orchestration (Specialized Domains)
  const composer = Modules.useLauncherComposer({ store, runtime, refs });
  const ui = Modules.useLauncherUIState({ store, tray, props, runtime });
  const history = Modules.useLauncherHistory({ runtime, store });

  // 3. Actions & Handlers
  const actions = Modules.useLauncherActions({ store, tray, props, runtime, refs });
  const handlers = Modules.useLauncherHandlers({
    store, tray, props, runtime,
    seededConversationAnchorTimesRef: refs.seededConversationAnchorTimesRef,
    pendingConversationAnchorRef: refs.pendingConversationAnchorRef,
    suppressComposerShellAutodetectRef: refs.suppressComposerShellAutodetectRef,
    launchAgentComposer: actions.launchAgentComposer,
    clearTerminalSurface: actions.clearTerminalSurface
  });

  // 4. Lifecycle & Sync
  Modules.useLauncherMemorySync({ store, props, runtime });
  Modules.useLauncherEffects({ store, props, runtime, history, ui, tray, refs, actions, clearTerminalSurface: actions.clearTerminalSurface });
  Hooks.useWindowSync(refs.shellRef, active);

  // 5. Shortcuts & System Integration
  const shortcuts = Modules.useLauncherShortcuts({ active, store, tray, props, runtime, history, ui, handlers, refs, actions });

  // 6. Assembler (Public Interface)
  return Modules.useLauncherInterface({
    props, store, runtime, tray, composer, ui, history, handlers, shortcuts,
    clearTerminalSurface: actions.clearTerminalSurface,
    launchAgentComposer: actions.launchAgentComposer,
    openAppWindow: actions.openAppWindow,
    openModelDrawer: actions.openModelDrawer,
    closeModelDrawer: actions.closeModelDrawer,
    shellRef: refs.shellRef,
    dockRef: refs.dockRef
  });
}
