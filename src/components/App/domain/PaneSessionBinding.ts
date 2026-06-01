import type { WorkspacePaneSessionBindings } from '../utils';

export class PaneSessionBinding {
  private readonly bindings: Readonly<Record<string, string>>;

  constructor(bindings: Record<string, string>) {
    this.bindings = Object.freeze({ ...bindings });
  }

  bind(paneId: string, sessionId: string): PaneSessionBinding {
    return new PaneSessionBinding({ ...this.bindings, [paneId]: sessionId });
  }

  unbind(paneId: string): PaneSessionBinding {
    const next = { ...this.bindings };
    delete next[paneId];
    return new PaneSessionBinding(next);
  }

  resolve(paneId: string): string | null {
    return this.bindings[paneId] ?? null;
  }

  has(paneId: string): boolean {
    return paneId in this.bindings;
  }

  getAll(): Record<string, string> {
    return { ...this.bindings };
  }

  allPaneIds(): string[] {
    return Object.keys(this.bindings);
  }

  entries(): [string, string][] {
    return Object.entries(this.bindings);
  }

  toRecord(): WorkspacePaneSessionBindings {
    return { ...this.bindings };
  }

  static fromRecord(record: WorkspacePaneSessionBindings): PaneSessionBinding {
    return new PaneSessionBinding(record);
  }

  static createDefault(paneIds: string[]): PaneSessionBinding {
    const bindings: Record<string, string> = {};
    for (const id of paneIds) {
      bindings[id] = id;
    }
    return new PaneSessionBinding(bindings);
  }
}
