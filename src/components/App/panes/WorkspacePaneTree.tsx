import { useCallback, useState } from 'react';
import { WorkspacePaneSlot } from './WorkspacePaneSlot';
import * as Utils from '../utils';
import type { WorkspacePaneNode } from '../chrome';

type LauncherProps = Record<string, unknown> & {
  initialComposerSurface?: 'agent' | 'terminal';
};

interface WorkspacePaneTreeProps {
  paneLayout: { activePaneId: string; root: WorkspacePaneNode } | null;
  activePaneId: string | null;
  selectedTabId: string;
  getLauncherProps: (tabId: string, paneId: string) => LauncherProps;
  getLauncherIdentityKey: (paneId: string) => string;
  onFocusPane: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
}

export function WorkspacePaneTree(props: WorkspacePaneTreeProps) {
  const {
    paneLayout,
    activePaneId,
    selectedTabId,
    getLauncherProps,
    getLauncherIdentityKey,
    onFocusPane,
    onClosePane
  } = props;

  const [paneSizes, setPaneSizes] = useState<Record<string, number>>({});
  const [hoveredHandleKey, setHoveredHandleKey] = useState<string | null>(null);

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

  if (!paneLayout) return null;

  const paneIds = Utils.collectPaneIdsFromLayout(paneLayout);
  const hasMultiplePanes = paneIds.length > 1;

  const renderPaneNode = (node: WorkspacePaneNode, path = ''): JSX.Element => {
    if (node.type === 'leaf') {
      return (
        <WorkspacePaneSlot
          active={activePaneId === node.paneId}
          launcherProps={getLauncherProps(selectedTabId, node.paneId)}
          launcherIdentityKey={getLauncherIdentityKey(node.paneId)}
          onFocusPane={onFocusPane}
          onClosePane={onClosePane}
          hasMultiplePanes={hasMultiplePanes}
          paneId={node.paneId}
          tabId={selectedTabId}
          key={getLauncherIdentityKey(node.paneId)}
        />
      );
    }

    const splitRef = { current: null as HTMLDivElement | null };
    const isHorizontal = node.direction === 'horizontal';
    const prefix = `${isHorizontal ? 'col' : 'row'}_${path}`;

    return (
      <div
        key={`split-${path}`}
        ref={(el) => { splitRef.current = el; }}
        className={`app-window-workspace-split ${node.direction}`}
        style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}
      >
        {node.children.map((child: WorkspacePaneNode, index: number) => {
          const isLast = index === node.children.length - 1;
          const childPath = path ? `${path}/${index}` : `${index}`;
          const sizeKey = `${prefix}_${index}`;
          const size = paneSizes[sizeKey] ?? 1;

          return (
            <div
              key={childPath}
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
                {renderPaneNode(child, childPath)}
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

  return renderPaneNode(paneLayout.root);
}
