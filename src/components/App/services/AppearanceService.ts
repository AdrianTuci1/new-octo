function appearanceRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function appearanceString(record: Record<string, unknown>, key: string, fallback: string): string {
  return typeof record[key] === 'string' ? record[key] as string : fallback;
}

function appearanceBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof record[key] === 'boolean' ? record[key] as boolean : fallback;
}

function appearanceNumber(record: Record<string, unknown>, key: string, fallback: number): number {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] as number : fallback;
}

function clampAppearanceNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function appearanceFontFamily(font: string): string {
  if (font === 'JetBrains') return '"JetBrains Mono", "SF Mono", monospace';
  if (font === 'Monaspace') return '"Monaspace", "SF Mono", monospace';
  if (font === 'Menlo') return 'Menlo, "SF Mono", monospace';
  if (font === 'Monaco') return 'Monaco, "SF Mono", monospace';
  if (font === 'SF Mono') return '"SF Mono", monospace';
  return '"SF Mono", "Hack", "JetBrains Mono", monospace';
}

export class AppearanceService {
  /**
   * Apply appearance settings to the document root and body.
   * Migrated from AppWindow.tsx lines 21-92.
   *
   * @param rawAppearance - The raw appearance object from memory settings (values.appearance).
   */
  static apply(rawAppearance: Record<string, unknown>): void {
    const record = appearanceRecord(rawAppearance);
    const root = document.documentElement;
    const body = document.body;

    const terminalFont = appearanceString(record, 'terminalFont', 'Hack');
    const agentFont = appearanceString(record, 'agentFont', 'Hack');
    const fontWeight = appearanceString(record, 'fontWeight', 'Normal');
    const terminalFamily = appearanceFontFamily(terminalFont);
    const useAltScreenPadding = appearanceBoolean(record, 'useAltScreenPadding', true);

    // CSS custom properties
    root.style.setProperty('--font-mono', terminalFamily);
    root.style.setProperty(
      '--appearance-agent-font',
      appearanceBoolean(record, 'matchTerminalFont', false) ? terminalFamily : appearanceFontFamily(agentFont)
    );
    root.style.setProperty(
      '--appearance-terminal-font-size',
      `${clampAppearanceNumber(appearanceNumber(record, 'fontSize', 13), 9, 32)}px`
    );
    root.style.setProperty(
      '--appearance-line-height',
      String(clampAppearanceNumber(appearanceNumber(record, 'lineHeight', 1.2), 0.9, 2))
    );
    root.style.setProperty(
      '--appearance-font-weight',
      fontWeight === 'Bold' ? '700' : fontWeight === 'Medium' ? '500' : '400'
    );
    root.style.setProperty(
      '--appearance-window-blur-radius',
      `${clampAppearanceNumber(appearanceNumber(record, 'windowBlurRadius', 1), 0, 20)}px`
    );
    root.style.setProperty(
      '--appearance-alt-screen-padding',
      `${useAltScreenPadding ? clampAppearanceNumber(appearanceNumber(record, 'altScreenPadding', 0), 0, 80) : 0}px`
    );

    // Body-level styles
    body.style.setProperty(
      'zoom',
      `${clampAppearanceNumber(Number(appearanceString(record, 'zoomLevel', '100')), 80, 120)}%`
    );
    body.style.opacity = String(
      clampAppearanceNumber(appearanceNumber(record, 'windowOpacity', 100), 20, 100) / 100
    );

    // Body class toggles
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
}
