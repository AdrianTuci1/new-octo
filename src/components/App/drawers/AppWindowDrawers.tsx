import { useAppResize } from '../hooks/useAppResize';
import { useUIStore } from '../../../stores';
import { DrawerFrame } from './DrawerFrame';
import { ModelManagementDrawer } from '../settings/ModelManagementDrawer';
import { CloudProfileDrawer } from '../settings/CloudProfileDrawer';
import { KeyboardShortcutsDrawer } from './KeyboardShortcutsDrawer';
import { EditorDrawer } from './EditorDrawer';
import { ProfileEditorDrawer } from './ProfileEditorDrawer';
import { RulesDrawer } from './RulesDrawer';
import { CodeReviewDrawer } from './CodeReviewDrawer';

type AppWindowDrawersProps = {
  isEditorOpen: boolean;
  isKeyboardShortcutsDrawerOpen: boolean;
  activeWorkingDirectory: string | null;
  onCloseKeyboardShortcutsDrawer: () => void;
};

export function AppWindowDrawers({
  isEditorOpen,
  isKeyboardShortcutsDrawerOpen,
  activeWorkingDirectory,
  onCloseKeyboardShortcutsDrawer
}: AppWindowDrawersProps) {
  const isModelDrawerOpen = useUIStore((state) => state.isModelDrawerOpen);
  const isCloudProfileDrawerOpen = useUIStore((state) => state.isCloudProfileDrawerOpen);
  const isProfileDrawerOpen = useUIStore((state) => state.isProfileDrawerOpen);
  const isRulesDrawerOpen = useUIStore((state) => state.isRulesDrawerOpen);
  const isCodeReviewDrawerOpen = useUIStore((state) => state.isCodeReviewDrawerOpen);

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

  const { width: cloudProfileDrawerWidth, isResizing: isResizingCloudProfileDrawerState, startResizing: startResizingCloudProfileDrawer } = useAppResize({
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

  const { width: codeReviewDrawerWidth, isResizing: isResizingCodeReviewDrawerState, startResizing: startResizingCodeReviewDrawer } = useAppResize({
    initialWidth: 620,
    minWidth: 420,
    maxWidth: Math.max(420, window.innerWidth * 0.86),
    direction: 'right'
  });

  if (!isEditorOpen && !isModelDrawerOpen && !isCloudProfileDrawerOpen && !isKeyboardShortcutsDrawerOpen && !isProfileDrawerOpen && !isRulesDrawerOpen && !isCodeReviewDrawerOpen) {
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

      {isCloudProfileDrawerOpen && (
        <DrawerFrame
          className="cloud-profile-drawer-wrapper"
          width={cloudProfileDrawerWidth}
          isResizing={isResizingCloudProfileDrawerState}
          onResizeStart={startResizingCloudProfileDrawer}
          zIndex={21}
        >
          <CloudProfileDrawer />
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

      {isCodeReviewDrawerOpen && (
        <DrawerFrame
          className="code-review-drawer-wrapper"
          width={codeReviewDrawerWidth}
          isResizing={isResizingCodeReviewDrawerState}
          onResizeStart={startResizingCodeReviewDrawer}
          zIndex={24}
        >
          <CodeReviewDrawer workingDirectory={activeWorkingDirectory} />
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
