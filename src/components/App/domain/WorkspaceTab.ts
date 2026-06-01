import type { WorkspaceChromeTab, WorkspaceChromeTabKind } from '../chrome/workspaceChromeTypes';

const TERMINAL_KIND: WorkspaceChromeTabKind = 'terminal';
const SETTINGS_KIND: WorkspaceChromeTabKind = 'settings';
const AGENT_KIND: WorkspaceChromeTabKind = 'agents';
const TOOLS_KIND: WorkspaceChromeTabKind = 'tools';

export class WorkspaceTab {
  public readonly id: string;
  public readonly label: string;
  public readonly kind: WorkspaceChromeTabKind;
  public readonly subtitle?: string;
  public readonly customLabel?: string | null;
  public readonly tintColor?: string | null;
  public readonly lastExecutionStatus?: string | null;

  constructor(tab: WorkspaceChromeTab) {
    this.id = tab.id;
    this.label = tab.label;
    this.kind = tab.kind;
    this.subtitle = tab.subtitle;
    this.customLabel = tab.customLabel;
    this.tintColor = tab.tintColor;
    this.lastExecutionStatus = tab.lastExecutionStatus;
  }

  isTerminal(): boolean {
    return this.kind === TERMINAL_KIND;
  }

  isSettings(): boolean {
    return this.kind === SETTINGS_KIND;
  }

  isAgent(): boolean {
    return this.kind === AGENT_KIND;
  }

  isTools(): boolean {
    return this.kind === TOOLS_KIND;
  }

  equals(other: WorkspaceTab): boolean {
    if (this === other) return true;
    return (
      this.id === other.id &&
      this.kind === other.kind &&
      this.label === other.label
    );
  }

  clone(overrides?: Partial<WorkspaceChromeTab>): WorkspaceTab {
    return new WorkspaceTab({
      id: overrides?.id ?? this.id,
      label: overrides?.label ?? this.label,
      kind: overrides?.kind ?? this.kind,
      subtitle: overrides?.subtitle !== undefined ? overrides.subtitle : this.subtitle,
      customLabel: overrides?.customLabel !== undefined ? overrides.customLabel : this.customLabel,
      tintColor: overrides?.tintColor !== undefined ? overrides.tintColor : this.tintColor,
      lastExecutionStatus:
        overrides?.lastExecutionStatus !== undefined
          ? overrides.lastExecutionStatus
          : this.lastExecutionStatus,
    });
  }

  toPlain(): WorkspaceChromeTab {
    const tab: WorkspaceChromeTab = { id: this.id, label: this.label, kind: this.kind };
    if (this.subtitle !== undefined) tab.subtitle = this.subtitle;
    if (this.customLabel !== undefined) tab.customLabel = this.customLabel;
    if (this.tintColor !== undefined) tab.tintColor = this.tintColor;
    if (this.lastExecutionStatus !== undefined) tab.lastExecutionStatus = this.lastExecutionStatus;
    return tab;
  }

  static createTerminal(id: string, label: string): WorkspaceTab {
    return new WorkspaceTab({ id, label, kind: TERMINAL_KIND });
  }

  static createSettings(): WorkspaceTab {
    return new WorkspaceTab({ id: 'settings', label: 'Settings', kind: SETTINGS_KIND });
  }
}
