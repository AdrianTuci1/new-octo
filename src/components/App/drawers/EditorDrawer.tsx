import type { MouseEvent as ReactMouseEvent } from 'react';
import { EditorWorkspace } from '../../Editor/EditorWorkspace';
import { DrawerFrame } from './DrawerFrame';

type EditorDrawerProps = {
  width: number;
  isResizing: boolean;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function EditorDrawer({ width, isResizing, onResizeStart }: EditorDrawerProps) {
  return (
    <DrawerFrame
      className="editor-drawer-wrapper"
      width={width}
      isResizing={isResizing}
      onResizeStart={onResizeStart}
    >
      <div className="editor-drawer">
        <div className="editor-drawer-body">
          <EditorWorkspace />
        </div>
      </div>
    </DrawerFrame>
  );
}
