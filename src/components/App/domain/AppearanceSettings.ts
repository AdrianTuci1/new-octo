type AppearanceSettingsValues = {
  cursorType: string;
  cursorBlinking: boolean;
  showTabIndicators: boolean;
  showTabBar: string;
  tabClosePosition: string;
  preserveTabColor: boolean;
  verticalTabs: boolean;
  latestPromptTabNames: boolean;
  syncWithOs: boolean;
  customWindowSize: boolean;
  useAltScreenPadding: boolean;
  customIconStyle: string;
  windowOpacity: number;
  windowBlurRadius: number;
  zoomLevel: string;
  consistentToolsPanel: boolean;
  inputType: string;
  inputPosition: string;
  dimInactivePanes: boolean;
  focusFollowsMouse: boolean;
  compactMode: boolean;
  showJumpToBottom: boolean;
  showBlockDividers: boolean;
  terminalFont: string;
  fontWeight: string;
  fontSize: number;
  lineHeight: number;
  viewSystemFonts: boolean;
  agentFont: string;
  matchTerminalFont: boolean;
  altScreenPadding: number;
  toolbarLeftItems: string[];
  toolbarRightItems: string[];
};

const DEFAULT_CURSOR_TYPE = 'block';
const DEFAULT_SHOW_TAB_BAR = 'windowed';
const DEFAULT_TAB_CLOSE_POSITION = 'right';
const DEFAULT_CUSTOM_ICON_STYLE = 'mono';
const DEFAULT_ZOOM_LEVEL = '100';
const DEFAULT_INPUT_TYPE = 'warp';
const DEFAULT_INPUT_POSITION = 'bottom';
const DEFAULT_TERMINAL_FONT = 'Hack';
const DEFAULT_FONT_WEIGHT = 'Normal';
const DEFAULT_AGENT_FONT = 'Hack';
const DEFAULT_WINDOW_OPACITY = 100;
const DEFAULT_WINDOW_BLUR_RADIUS = 1;
const DEFAULT_FONT_SIZE = 13;
const DEFAULT_LINE_HEIGHT = 1.2;
const DEFAULT_ALT_SCREEN_PADDING = 0;

const DEFAULT_TOOLBAR_LEFT = ['Tools Panel', 'Agent Management'];
const DEFAULT_TOOLBAR_RIGHT = ['Code Review', 'Notifications'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function str(record: Record<string, unknown>, key: string, fallback: string): string {
  return typeof record[key] === 'string' ? (record[key] as string) : fallback;
}

function bool(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'boolean' ? (record[key] as boolean) : false;
}

function num(record: Record<string, unknown>, key: string, fallback: number): number {
  return typeof record[key] === 'number' && Number.isFinite(record[key])
    ? (record[key] as number)
    : fallback;
}

function strArr(record: Record<string, unknown>, key: string, fallback: string[]): string[] {
  return Array.isArray(record[key]) && (record[key] as unknown[]).every((i) => typeof i === 'string')
    ? (record[key] as string[])
    : fallback;
}

export class AppearanceSettings {
  private readonly raw: Record<string, unknown>;

  constructor(raw: Record<string, unknown> | null | undefined) {
    this.raw = isRecord(raw) ? raw : {};
  }

  get cursorType(): string { return str(this.raw, 'cursorType', DEFAULT_CURSOR_TYPE); }
  get cursorBlinking(): boolean { return this.raw.cursorBlinking !== false; }
  get showTabIndicators(): boolean { return this.raw.showTabIndicators !== false; }
  get showTabBar(): string { return str(this.raw, 'showTabBar', DEFAULT_SHOW_TAB_BAR); }
  get tabClosePosition(): string { return str(this.raw, 'tabClosePosition', DEFAULT_TAB_CLOSE_POSITION); }
  get preserveTabColor(): boolean { return bool(this.raw, 'preserveTabColor'); }
  get verticalTabs(): boolean { return bool(this.raw, 'verticalTabs'); }
  get latestPromptTabNames(): boolean { return bool(this.raw, 'latestPromptTabNames'); }
  get syncWithOs(): boolean { return bool(this.raw, 'syncWithOs'); }
  get customWindowSize(): boolean { return bool(this.raw, 'customWindowSize'); }
  get useAltScreenPadding(): boolean { return this.raw.useAltScreenPadding !== false; }
  get customIconStyle(): string { return str(this.raw, 'customIconStyle', DEFAULT_CUSTOM_ICON_STYLE); }
  get windowOpacity(): number { return num(this.raw, 'windowOpacity', DEFAULT_WINDOW_OPACITY); }
  get windowBlurRadius(): number { return num(this.raw, 'windowBlurRadius', DEFAULT_WINDOW_BLUR_RADIUS); }
  get zoomLevel(): string { return str(this.raw, 'zoomLevel', DEFAULT_ZOOM_LEVEL); }
  get consistentToolsPanel(): boolean { return this.raw.consistentToolsPanel !== false; }
  get inputType(): string { return str(this.raw, 'inputType', DEFAULT_INPUT_TYPE); }
  get inputPosition(): string { return str(this.raw, 'inputPosition', DEFAULT_INPUT_POSITION); }
  get dimInactivePanes(): boolean { return bool(this.raw, 'dimInactivePanes'); }
  get focusFollowsMouse(): boolean { return bool(this.raw, 'focusFollowsMouse'); }
  get compactMode(): boolean { return bool(this.raw, 'compactMode'); }
  get showJumpToBottom(): boolean { return this.raw.showJumpToBottom !== false; }
  get showBlockDividers(): boolean { return this.raw.showBlockDividers !== false; }
  get terminalFont(): string { return str(this.raw, 'terminalFont', DEFAULT_TERMINAL_FONT); }
  get fontWeight(): string { return str(this.raw, 'fontWeight', DEFAULT_FONT_WEIGHT); }
  get fontSize(): number { return num(this.raw, 'fontSize', DEFAULT_FONT_SIZE); }
  get lineHeight(): number { return num(this.raw, 'lineHeight', DEFAULT_LINE_HEIGHT); }
  get viewSystemFonts(): boolean { return bool(this.raw, 'viewSystemFonts'); }
  get agentFont(): string { return str(this.raw, 'agentFont', DEFAULT_AGENT_FONT); }
  get matchTerminalFont(): boolean { return bool(this.raw, 'matchTerminalFont'); }
  get altScreenPadding(): number { return num(this.raw, 'altScreenPadding', DEFAULT_ALT_SCREEN_PADDING); }
  get toolbarLeftItems(): string[] { return strArr(this.raw, 'toolbarLeftItems', DEFAULT_TOOLBAR_LEFT); }
  get toolbarRightItems(): string[] { return strArr(this.raw, 'toolbarRightItems', DEFAULT_TOOLBAR_RIGHT); }

  applyToDocument(): void {
    const root = document.documentElement;

    root.style.setProperty('--app-cursor-type', this.cursorType);
    root.style.setProperty('--app-cursor-blinking', this.cursorBlinking ? '1' : '0');
    root.style.setProperty('--app-tab-close-position', this.tabClosePosition);
    root.style.setProperty('--app-custom-icon-style', this.customIconStyle);
    root.style.setProperty('--app-window-opacity', String(this.windowOpacity / 100));
    root.style.setProperty('--app-window-blur-radius', `${this.windowBlurRadius}px`);
    root.style.setProperty('--app-zoom-level', this.zoomLevel);
    root.style.setProperty('--app-input-type', this.inputType);
    root.style.setProperty('--app-input-position', this.inputPosition);
    root.style.setProperty('--app-terminal-font', this.terminalFont);
    root.style.setProperty('--app-font-weight', this.fontWeight);
    root.style.setProperty('--app-font-size', `${this.fontSize}px`);
    root.style.setProperty('--app-line-height', String(this.lineHeight));
    root.style.setProperty('--app-agent-font', this.agentFont);
    root.style.setProperty('--app-alt-screen-padding', `${this.altScreenPadding}px`);

    this.toggleClass('app-vertical-tabs', this.verticalTabs);
    this.toggleClass('app-compact-mode', this.compactMode);
    this.toggleClass('app-dim-inactive-panes', this.dimInactivePanes);
    this.toggleClass('app-focus-follows-mouse', this.focusFollowsMouse);
    this.toggleClass('app-sync-with-os', this.syncWithOs);
    this.toggleClass('app-show-tab-indicators', this.showTabIndicators);
    this.toggleClass('app-show-jump-to-bottom', this.showJumpToBottom);
    this.toggleClass('app-show-block-dividers', this.showBlockDividers);
    this.toggleClass('app-match-terminal-font', this.matchTerminalFont);
    this.toggleClass('app-use-alt-screen-padding', this.useAltScreenPadding);
    this.toggleClass('app-custom-window-size', this.customWindowSize);

    if (this.showTabBar !== 'windowed') {
      root.style.setProperty('--app-show-tab-bar', this.showTabBar);
    }

    this.toggleBodyClass('app-vertical-tabs', this.verticalTabs);
    this.toggleBodyClass('app-compact-mode', this.compactMode);
  }

  toJSON(): AppearanceSettingsValues {
    return {
      cursorType: this.cursorType,
      cursorBlinking: this.cursorBlinking,
      showTabIndicators: this.showTabIndicators,
      showTabBar: this.showTabBar,
      tabClosePosition: this.tabClosePosition,
      preserveTabColor: this.preserveTabColor,
      verticalTabs: this.verticalTabs,
      latestPromptTabNames: this.latestPromptTabNames,
      syncWithOs: this.syncWithOs,
      customWindowSize: this.customWindowSize,
      useAltScreenPadding: this.useAltScreenPadding,
      customIconStyle: this.customIconStyle,
      windowOpacity: this.windowOpacity,
      windowBlurRadius: this.windowBlurRadius,
      zoomLevel: this.zoomLevel,
      consistentToolsPanel: this.consistentToolsPanel,
      inputType: this.inputType,
      inputPosition: this.inputPosition,
      dimInactivePanes: this.dimInactivePanes,
      focusFollowsMouse: this.focusFollowsMouse,
      compactMode: this.compactMode,
      showJumpToBottom: this.showJumpToBottom,
      showBlockDividers: this.showBlockDividers,
      terminalFont: this.terminalFont,
      fontWeight: this.fontWeight,
      fontSize: this.fontSize,
      lineHeight: this.lineHeight,
      viewSystemFonts: this.viewSystemFonts,
      agentFont: this.agentFont,
      matchTerminalFont: this.matchTerminalFont,
      altScreenPadding: this.altScreenPadding,
      toolbarLeftItems: this.toolbarLeftItems,
      toolbarRightItems: this.toolbarRightItems,
    };
  }

  private toggleClass(className: string, enabled: boolean): void {
    document.documentElement.classList.toggle(className, enabled);
  }

  private toggleBodyClass(className: string, enabled: boolean): void {
    document.body.classList.toggle(className, enabled);
  }
}
