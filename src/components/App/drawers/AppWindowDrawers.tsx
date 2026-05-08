import { useAppResize } from '../hooks/useAppResize';
import { useUIStore } from '../../../stores';
import { DrawerFrame } from './DrawerFrame';
import { ModelManagementDrawer } from '../settings/ModelManagementDrawer';
import { KeyboardShortcutsDrawer } from './KeyboardShortcutsDrawer';
import { EditorDrawer } from './EditorDrawer';
import { ProfileEditorDrawer } from './ProfileEditorDrawer';
import { RulesDrawer } from './RulesDrawer';

type AppWindowDrawersProps = {
  isEditorOpen: boolean;
  isKeyboardShortcutsDrawerOpen: boolean;
  onCloseKeyboardShortcutsDrawer: () => void;
};

export function AppWindowDrawers({
  isEditorOpen,
  isKeyboardShortcutsDrawerOpen,
  onCloseKeyboardShortcutsDrawer
}: AppWindowDrawersProps) {
  const isModelDrawerOpen = useUIStore((state) => state.isModelDrawerOpen);
  const isProfileDrawerOpen = useUIStore((state) => state.isProfileDrawerOpen);
  const isRulesDrawerOpen = useUIStore((state) => state.isRulesDrawerOpen);

  const { width: editorWidth, isResizing: isResizingEditorState, startResizing: startResizingEditor } = useAppResize({
    initialWidth: 600,
    minWidth: 300,
    maxWidth: window.innerWidth * 0.8,
    direction: 'right'
  });

  const { width: modelDrawerWidth, isResizing: isResizingModelDrawerState, startResizing: startResizingModelDrawer } = useAppResize({
    initialWidth: 450,
    minWidth: 300,
    maxWidth: 800,
    direction: 'right'
  });

  const { width: keyboardShortcutsDrawerWidth, isResizing: isResizingKeyboardShortcutsDrawerState, startResizing: startResizingKeyboardShortcutsDrawer } = useAppResize({
    initialWidth: 410,
    minWidth: 320,
    maxWidth: 640,
    direction: 'right'
  });

  const { width: profileDrawerWidth, isResizing: isResizingProfileDrawerState, startResizing: startResizingProfileDrawer } = useAppResize({
    initialWidth: 450,
    minWidth: 320,
    maxWidth: 800,
    direction: 'right'
  });

  const { width: rulesDrawerWidth, isResizing: isResizingRulesDrawerState, startResizing: startResizingRulesDrawer } = useAppResize({
    initialWidth: 450,
    minWidth: 320,
    maxWidth: 800,
    direction: 'right'
  });

  if (!isEditorOpen && !isModelDrawerOpen && !isKeyboardShortcutsDrawerOpen && !isProfileDrawerOpen && !isRulesDrawerOpen) {
    return null;
  }

  return (
    <div className="app-window-drawers-layer">
      {isEditorOpen && (
        <EditorDrawer
          width={editorWidth}
          isResizing={isResizingEditorState}
          onResizeStart={startResizingEditor}
        />
      )}

      {isModelDrawerOpen && (
        <DrawerFrame
          className="model-drawer-wrapper"
          width={modelDrawerWidth}
          isResizing={isResizingModelDrawerState}
          onResizeStart={startResizingModelDrawer}
          zIndex={20}
        >
          <ModelManagementDrawer />
        </DrawerFrame>
      )}

      {isProfileDrawerOpen && (
        <DrawerFrame
          className="profile-drawer-wrapper"
          width={profileDrawerWidth}
          isResizing={isResizingProfileDrawerState}
          onResizeStart={startResizingProfileDrawer}
          zIndex={22}
        >
          <ProfileEditorDrawer />
        </DrawerFrame>
      )}

      {isRulesDrawerOpen && (
        <DrawerFrame
          className="rules-drawer-wrapper"
          width={rulesDrawerWidth}
          isResizing={isResizingRulesDrawerState}
          onResizeStart={startResizingRulesDrawer}
          zIndex={24}
        >
          <RulesDrawer />
        </DrawerFrame>
      )}

      {isKeyboardShortcutsDrawerOpen && (
        <DrawerFrame
          className="keyboard-shortcuts-drawer-wrapper"
          width={keyboardShortcutsDrawerWidth}
          isResizing={isResizingKeyboardShortcutsDrawerState}
          onResizeStart={startResizingKeyboardShortcutsDrawer}
          zIndex={25}
        >
          <KeyboardShortcutsDrawer onClose={onCloseKeyboardShortcutsDrawer} />
        </DrawerFrame>
      )}
    </div>
  );
}
