import type {
  WorkspacePaneDirection,
  WorkspacePaneLayout,
  WorkspacePaneLeafNode,
  WorkspacePaneSplitNode,
  WorkspacePaneNode,
} from '../chrome/workspaceChromeTypes';

function isLeaf(node: WorkspacePaneNode): node is WorkspacePaneLeafNode {
  return node.type === 'leaf';
}

function cloneNode(node: WorkspacePaneNode): WorkspacePaneNode {
  if (isLeaf(node)) {
    return { type: 'leaf', paneId: node.paneId };
  }
  return {
    type: 'split',
    direction: node.direction,
    children: node.children.map(cloneNode),
  };
}

function collectIds(node: WorkspacePaneNode): string[] {
  if (isLeaf(node)) return [node.paneId];
  return node.children.flatMap(collectIds);
}

function normalizeNode(node: WorkspacePaneNode | null | undefined): WorkspacePaneNode | null {
  if (!node) return null;
  if (isLeaf(node)) {
    return typeof node.paneId === 'string' && node.paneId.length > 0
      ? { type: 'leaf', paneId: node.paneId }
      : null;
  }
  const normalized = node.children
    .map(normalizeNode)
    .filter((child): child is WorkspacePaneNode => child !== null);
  if (normalized.length === 0) return null;
  if (normalized.length === 1) return normalized[0];
  const direction: WorkspacePaneDirection =
    node.direction === 'vertical' ? 'vertical' : 'horizontal';
  const merged = normalized.flatMap((child) => {
    if (!isLeaf(child) && child.direction === direction) {
      return child.children;
    }
    return [child];
  });
  return { type: 'split', direction, children: merged };
}

type SplitInNode = { inserted: boolean; node: WorkspacePaneNode };

function splitInNode(
  node: WorkspacePaneNode,
  targetPaneId: string,
  direction: WorkspacePaneDirection,
  nextPaneId: string,
): SplitInNode {
  if (isLeaf(node)) {
    if (node.paneId !== targetPaneId) return { inserted: false, node };
    const newNode: WorkspacePaneNode =
      direction === 'horizontal'
        ? { type: 'split', direction: 'horizontal', children: [node, { type: 'leaf', paneId: nextPaneId }] }
        : { type: 'split', direction: 'vertical', children: [{ type: 'leaf', paneId: nextPaneId }, node] };
    return { inserted: true, node: newNode };
  }

  for (let i = 0; i < node.children.length; i++) {
    const result = splitInNode(node.children[i], targetPaneId, direction, nextPaneId);
    if (!result.inserted) continue;
    const nextChildren = [...node.children];
    if (!isLeaf(result.node) && result.node.direction === node.direction) {
      nextChildren.splice(i, 1, ...result.node.children);
    } else {
      nextChildren[i] = result.node;
    }
    const merged = normalizeNode({ type: 'split', direction: node.direction, children: nextChildren });
    return { inserted: true, node: merged ?? node };
  }
  return { inserted: false, node };
}

type RemoveFromNode = { removed: boolean; node: WorkspacePaneNode | null };

function removeFromNode(node: WorkspacePaneNode, paneId: string): RemoveFromNode {
  if (isLeaf(node)) {
    return node.paneId === paneId ? { removed: true, node: null } : { removed: false, node };
  }
  let removed = false;
  const kept = node.children.flatMap((child) => {
    const res = removeFromNode(child, paneId);
    removed = removed || res.removed;
    return res.node ? [res.node] : [];
  });
  if (!removed) return { removed: false, node };
  if (kept.length === 0) return { removed: true, node: null };
  if (kept.length === 1) return { removed: true, node: kept[0] };
  return { removed: true, node: { type: 'split', direction: node.direction, children: kept } };
}

export class PaneLayout {
  public readonly activePaneId: string;
  public readonly root: WorkspacePaneNode;

  constructor(layout: WorkspacePaneLayout) {
    this.activePaneId = layout.activePaneId;
    this.root = layout.root;
  }

  private toLayout(paneId: string, root: WorkspacePaneNode): WorkspacePaneLayout {
    return { activePaneId: paneId, root };
  }

  getActivePaneId(): string {
    return this.activePaneId;
  }

  setActivePaneId(id: string): PaneLayout {
    return new PaneLayout(this.toLayout(id, cloneNode(this.root)));
  }

  split(paneId: string, direction: WorkspacePaneDirection, nextPaneId: string): PaneLayout {
    const result = splitInNode(cloneNode(this.root), paneId, direction, nextPaneId);
    const root = result.inserted ? result.node : cloneNode(this.root);
    const normalized = normalizeNode(root);
    return new PaneLayout(
      this.toLayout(nextPaneId, normalized ?? { type: 'leaf', paneId: nextPaneId }),
    );
  }

  removePane(paneId: string): PaneLayout | null {
    const result = removeFromNode(cloneNode(this.root), paneId);
    if (!result.removed || !result.node) return this;
    const nextPaneIds = collectIds(result.node);
    if (nextPaneIds.length === 0) return null;
    const normalized = normalizeNode(result.node) ?? result.node;
    const nextActive =
      this.activePaneId === paneId ? nextPaneIds[0] : this.activePaneId;
    return new PaneLayout(this.toLayout(nextActive, normalized));
  }

  collectPaneIds(): string[] {
    return collectIds(this.root);
  }

  normalize(): PaneLayout {
    const normalized = normalizeNode(cloneNode(this.root));
    if (!normalized) return this;
    const paneIds = collectIds(normalized);
    const activePaneId = paneIds.includes(this.activePaneId)
      ? this.activePaneId
      : paneIds[0] ?? this.activePaneId;
    return new PaneLayout({ activePaneId, root: normalized });
  }

  toPlain(): WorkspacePaneLayout {
    return this.toLayout(this.activePaneId, cloneNode(this.root));
  }

  static createDefault(tabId: string): PaneLayout {
    return new PaneLayout({
      activePaneId: tabId,
      root: { type: 'leaf', paneId: tabId },
    });
  }
}
