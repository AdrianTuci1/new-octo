import { ChevronDown, GripVertical, Info, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useMemoryStore } from '../../../../stores/memoryStore';
import './AppearanceSection.css';

type AppearanceSettings = {
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

const DEFAULT_TOOLBAR_LEFT_ITEMS = ['Tools Panel', 'Agent Management'];
const DEFAULT_TOOLBAR_RIGHT_ITEMS = ['Code Review', 'Notifications'];
const TOOLBAR_ITEMS = [...DEFAULT_TOOLBAR_LEFT_ITEMS, ...DEFAULT_TOOLBAR_RIGHT_ITEMS];

const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  cursorType: 'block',
  cursorBlinking: true,
  showTabIndicators: true,
  showTabBar: 'windowed',
  tabClosePosition: 'right',
  preserveTabColor: false,
  verticalTabs: false,
  latestPromptTabNames: false,
  syncWithOs: false,
  customWindowSize: false,
  useAltScreenPadding: true,
  customIconStyle: 'mono',
  windowOpacity: 100,
  windowBlurRadius: 1,
  zoomLevel: '100',
  consistentToolsPanel: true,
  inputType: 'warp',
  inputPosition: 'bottom',
  dimInactivePanes: false,
  focusFollowsMouse: false,
  compactMode: false,
  showJumpToBottom: true,
  showBlockDividers: true,
  terminalFont: 'Hack',
  fontWeight: 'Normal',
  fontSize: 13,
  lineHeight: 1.2,
  viewSystemFonts: false,
  agentFont: 'Hack',
  matchTerminalFont: false,
  altScreenPadding: 0,
  toolbarLeftItems: DEFAULT_TOOLBAR_LEFT_ITEMS,
  toolbarRightItems: DEFAULT_TOOLBAR_RIGHT_ITEMS
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(record: Record<string, unknown>, key: keyof AppearanceSettings) {
  return typeof record[key] === 'string' ? record[key] : DEFAULT_APPEARANCE_SETTINGS[key];
}

function booleanValue(record: Record<string, unknown>, key: keyof AppearanceSettings) {
  return typeof record[key] === 'boolean' ? record[key] : DEFAULT_APPEARANCE_SETTINGS[key];
}

function numberValue(record: Record<string, unknown>, key: keyof AppearanceSettings) {
  return typeof record[key] === 'number' && Number.isFinite(record[key])
    ? record[key]
    : DEFAULT_APPEARANCE_SETTINGS[key];
}

function stringArrayValue(record: Record<string, unknown>, key: keyof AppearanceSettings) {
  return Array.isArray(record[key]) && record[key].every((item) => typeof item === 'string')
    ? record[key] as string[]
    : DEFAULT_APPEARANCE_SETTINGS[key] as string[];
}

function normalizeAppearanceSettings(raw: unknown): AppearanceSettings {
  const record = isRecord(raw) ? raw : {};

  return {
    cursorType: stringValue(record, 'cursorType') as string,
    cursorBlinking: booleanValue(record, 'cursorBlinking') as boolean,
    showTabIndicators: booleanValue(record, 'showTabIndicators') as boolean,
    showTabBar: stringValue(record, 'showTabBar') as string,
    tabClosePosition: stringValue(record, 'tabClosePosition') as string,
    preserveTabColor: booleanValue(record, 'preserveTabColor') as boolean,
    verticalTabs: booleanValue(record, 'verticalTabs') as boolean,
    latestPromptTabNames: booleanValue(record, 'latestPromptTabNames') as boolean,
    syncWithOs: booleanValue(record, 'syncWithOs') as boolean,
    customWindowSize: booleanValue(record, 'customWindowSize') as boolean,
    useAltScreenPadding: booleanValue(record, 'useAltScreenPadding') as boolean,
    customIconStyle: stringValue(record, 'customIconStyle') as string,
    windowOpacity: numberValue(record, 'windowOpacity') as number,
    windowBlurRadius: numberValue(record, 'windowBlurRadius') as number,
    zoomLevel: stringValue(record, 'zoomLevel') as string,
    consistentToolsPanel: booleanValue(record, 'consistentToolsPanel') as boolean,
    inputType: stringValue(record, 'inputType') as string,
    inputPosition: stringValue(record, 'inputPosition') as string,
    dimInactivePanes: booleanValue(record, 'dimInactivePanes') as boolean,
    focusFollowsMouse: booleanValue(record, 'focusFollowsMouse') as boolean,
    compactMode: booleanValue(record, 'compactMode') as boolean,
    showJumpToBottom: booleanValue(record, 'showJumpToBottom') as boolean,
    showBlockDividers: booleanValue(record, 'showBlockDividers') as boolean,
    terminalFont: stringValue(record, 'terminalFont') as string,
    fontWeight: stringValue(record, 'fontWeight') as string,
    fontSize: numberValue(record, 'fontSize') as number,
    lineHeight: numberValue(record, 'lineHeight') as number,
    viewSystemFonts: booleanValue(record, 'viewSystemFonts') as boolean,
    agentFont: stringValue(record, 'agentFont') as string,
    matchTerminalFont: booleanValue(record, 'matchTerminalFont') as boolean,
    altScreenPadding: numberValue(record, 'altScreenPadding') as number,
    toolbarLeftItems: stringArrayValue(record, 'toolbarLeftItems'),
    toolbarRightItems: stringArrayValue(record, 'toolbarRightItems')
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function fontFamilyFor(font: string) {
  if (font === 'JetBrains') return '"JetBrains Mono", "SF Mono", monospace';
  if (font === 'Monaspace') return '"Monaspace", "SF Mono", monospace';
  if (font === 'Menlo') return 'Menlo, "SF Mono", monospace';
  if (font === 'Monaco') return 'Monaco, "SF Mono", monospace';
  if (font === 'SF Mono') return '"SF Mono", monospace';
  return '"SF Mono", "Hack", "JetBrains Mono", monospace';
}

function SettingsToggle({ checked = false, onChange }: { checked?: boolean; onChange?: () => void }) {
  return (
    <button
      className={`appearance-toggle ${checked ? 'active' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <div className="settings-section-header"><h2 className="settings-section-title">{title}</h2></div>;
}

function SettingsRow({
  title,
  description,
  action,
  topAligned = false
}: {
  title: ReactNode;
  description?: ReactNode;
  action: ReactNode;
  topAligned?: boolean;
}) {
  return (
    <div className={`appearance-row ${topAligned ? 'appearance-row-top' : ''}`}>
      <div className="appearance-row-info">
        <div className="appearance-row-title">{title}</div>
        {description ? <div className="appearance-row-description">{description}</div> : null}
      </div>
      <div className="appearance-control">{action}</div>
    </div>
  );
}

function SelectControl({
  value,
  options,
  onChange,
  fullWidth = false
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <div className={`appearance-select-shell ${fullWidth ? 'appearance-full-width' : ''}`}>
      <select
        className="appearance-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="appearance-select-chevron" aria-hidden="true" />
    </div>
  );
}

function RadioGroup({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="appearance-radio-group" role="radiogroup" aria-label="Appearance options">
      {options.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={`appearance-radio-option ${active ? 'active' : ''}`}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
          >
            <span className="appearance-radio-mark" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SliderControl({
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const percentage = useMemo(() => {
    if (max <= min) return 0;
    return ((value - min) / (max - min)) * 100;
  }, [max, min, value]);

  return (
    <div className="appearance-slider-shell">
      <input
        className="appearance-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--value': `${percentage}%` } as CSSProperties}
      />
      <div className="appearance-slider-value">{value}</div>
    </div>
  );
}

function NumberControl({
  value,
  onChange,
  width = 76,
  step = 1
}: {
  value: number;
  onChange: (value: number) => void;
  width?: number;
  step?: number;
}) {
  return (
    <input
      className="appearance-number-input"
      type="number"
      min={0}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value || 0))}
      style={{ width }}
    />
  );
}

function CheckboxRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="appearance-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function LayoutChip({
  label,
  removable = false,
  onRemove
}: {
  label: string;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className={`appearance-chip ${label === '' ? 'empty' : ''}`}>
      <GripVertical size={13} className="appearance-chip-grip" aria-hidden="true" />
      <span>{label}</span>
      {removable ? (
        <button type="button" className="appearance-chip-remove" aria-label={`Remove ${label}`} onClick={onRemove}>
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function ToolbarLayoutCard({
  leftItems,
  rightItems,
  onChange
}: {
  leftItems: string[];
  rightItems: string[];
  onChange: (next: Pick<AppearanceSettings, 'toolbarLeftItems' | 'toolbarRightItems'>) => void;
}) {
  const availableItems = TOOLBAR_ITEMS.filter((item) => !leftItems.includes(item) && !rightItems.includes(item));
  const removeItem = (item: string) => {
    onChange({
      toolbarLeftItems: leftItems.filter((entry) => entry !== item),
      toolbarRightItems: rightItems.filter((entry) => entry !== item)
    });
  };

  return (
    <div className="appearance-toolbar-card">
      <div className="appearance-toolbar-card-header">
        <div className="appearance-toolbar-title">Available items</div>
        <button
          type="button"
          className="appearance-toolbar-action"
          onClick={() => {
            onChange({
              toolbarLeftItems: DEFAULT_TOOLBAR_LEFT_ITEMS,
              toolbarRightItems: DEFAULT_TOOLBAR_RIGHT_ITEMS
            });
          }}
        >
          Restore default
        </button>
      </div>

      {availableItems.length > 0 && (
        <div className="appearance-toolbar-available">
          {availableItems.map((item) => (
            <div key={item} className="appearance-toolbar-available-item">
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onChange({ toolbarLeftItems: [...leftItems, item], toolbarRightItems: rightItems })}
              >
                Add left
              </button>
              <button
                type="button"
                onClick={() => onChange({ toolbarLeftItems: leftItems, toolbarRightItems: [...rightItems, item] })}
              >
                Add right
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="appearance-toolbar-columns">
        <div>
          <div className="appearance-toolbar-column-label">Left side</div>
          <div className="appearance-dropzone">
            {leftItems.length > 0 ? (
              leftItems.map((item) => (
                <LayoutChip
                  key={item}
                  label={item}
                  removable
                  onRemove={() => removeItem(item)}
                />
              ))
            ) : (
              <LayoutChip label="Drop items here" />
            )}
          </div>
        </div>

        <div>
          <div className="appearance-toolbar-column-label">Right side</div>
          <div className="appearance-dropzone">
            {rightItems.length > 0 ? (
              rightItems.map((item) => (
                <LayoutChip
                  key={item}
                  label={item}
                  removable
                  onRemove={() => removeItem(item)}
                />
              ))
            ) : (
              <LayoutChip label="Drop items here" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemePreviewCard() {
  return (
    <div className="appearance-theme-card">
      <div className="appearance-theme-card-preview">
        <div className="appearance-theme-snapshot" aria-hidden="true">
          <div className="appearance-theme-snapshot-top">
            <div>ls</div>
            <div style={{ color: '#8b949e', marginTop: 4 }}>
              <span style={{ color: '#ffb86c' }}>dr</span>
              {' '}
              executable
              {' '}
              file
            </div>
          </div>
          <div className="appearance-theme-snapshot-bottom">
            <div className="appearance-theme-cursor" />
          </div>
        </div>
        <div className="appearance-theme-card-label">Current theme</div>
      </div>

      <div className="appearance-theme-label">Dark</div>
    </div>
  );
}

export function AppearanceSection() {
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const savedAppearance = useMemo(
    () => normalizeAppearanceSettings(settings?.values.appearance),
    [settings?.values.appearance]
  );
  const [appearance, setAppearance] = useState(savedAppearance);

  useEffect(() => {
    setAppearance(savedAppearance);
  }, [savedAppearance]);

  const updateAppearance = useCallback(<K extends keyof AppearanceSettings>(
    key: K,
    value: AppearanceSettings[K]
  ) => {
    setAppearance((current) => {
      const next = { ...current, [key]: value };
      void saveSettings({ appearance: next }, true);
      return next;
    });
  }, [saveSettings]);

  const updateToolbarLayout = useCallback((
    nextLayout: Pick<AppearanceSettings, 'toolbarLeftItems' | 'toolbarRightItems'>
  ) => {
    setAppearance((current) => {
      const next = { ...current, ...nextLayout };
      void saveSettings({ appearance: next }, true);
      return next;
    });
  }, [saveSettings]);

  const {
    cursorType,
    cursorBlinking,
    showTabIndicators,
    showTabBar,
    tabClosePosition,
    preserveTabColor,
    verticalTabs,
    latestPromptTabNames,
    syncWithOs,
    customWindowSize,
    useAltScreenPadding,
    customIconStyle,
    windowOpacity,
    windowBlurRadius,
    zoomLevel,
    consistentToolsPanel,
    inputType,
    inputPosition,
    dimInactivePanes,
    focusFollowsMouse,
    compactMode,
    showJumpToBottom,
    showBlockDividers,
    terminalFont,
    fontWeight,
    fontSize,
    lineHeight,
    viewSystemFonts,
    agentFont,
    matchTerminalFont,
    altScreenPadding,
    toolbarLeftItems,
    toolbarRightItems
  } = appearance;
  const fontOptions = useMemo(() => [
    { value: 'Hack', label: 'Hack (default)' },
    { value: 'JetBrains', label: 'JetBrains Mono' },
    { value: 'Monaspace', label: 'Monaspace' },
    ...(viewSystemFonts ? [
      { value: 'SF Mono', label: 'SF Mono' },
      { value: 'Menlo', label: 'Menlo' },
      { value: 'Monaco', label: 'Monaco' }
    ] : [])
  ], [viewSystemFonts]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const terminalFamily = fontFamilyFor(terminalFont);
    const resolvedFontSize = clampNumber(fontSize, 9, 32);
    const resolvedLineHeight = clampNumber(lineHeight, 0.9, 2);
    const resolvedOpacity = clampNumber(windowOpacity, 20, 100) / 100;
    const resolvedBlur = clampNumber(windowBlurRadius, 0, 20);
    const resolvedAltPadding = useAltScreenPadding ? clampNumber(altScreenPadding, 0, 80) : 0;
    const resolvedZoom = clampNumber(Number(zoomLevel), 80, 120);

    root.style.setProperty('--font-mono', terminalFamily);
    root.style.setProperty('--appearance-agent-font', matchTerminalFont ? terminalFamily : fontFamilyFor(agentFont));
    root.style.setProperty('--appearance-terminal-font-size', `${resolvedFontSize}px`);
    root.style.setProperty('--appearance-line-height', String(resolvedLineHeight));
    root.style.setProperty('--appearance-font-weight', fontWeight === 'Bold' ? '700' : fontWeight === 'Medium' ? '500' : '400');
    root.style.setProperty('--appearance-window-opacity', String(resolvedOpacity));
    root.style.setProperty('--appearance-window-blur-radius', `${resolvedBlur}px`);
    root.style.setProperty('--appearance-alt-screen-padding', `${resolvedAltPadding}px`);
    body.style.setProperty('zoom', `${resolvedZoom}%`);
    body.style.opacity = String(resolvedOpacity);

    body.classList.toggle('appearance-cursor-blinking', cursorBlinking);
    body.classList.toggle('appearance-cursor-bar', cursorType === 'bar');
    body.classList.toggle('appearance-cursor-block', cursorType === 'block');
    body.classList.toggle('appearance-cursor-underline', cursorType === 'underline');
    body.classList.toggle('appearance-compact-mode', compactMode);
    body.classList.toggle('appearance-dim-inactive-panes', dimInactivePanes);
    body.classList.toggle('appearance-focus-follows-mouse', focusFollowsMouse);
    body.classList.toggle('appearance-hide-block-dividers', !showBlockDividers);
    body.classList.toggle('appearance-hide-jump-to-bottom', !showJumpToBottom);
    body.classList.toggle('appearance-hide-tab-indicators', !showTabIndicators);
    body.classList.toggle('appearance-hide-tab-bar', showTabBar === 'never');
    body.classList.toggle('appearance-tab-close-left', tabClosePosition === 'left');
    body.classList.toggle('appearance-vertical-tabs', verticalTabs);
    body.classList.toggle('appearance-input-top', inputPosition === 'top');
    body.classList.toggle('appearance-shell-input', inputType === 'shell');
    body.classList.toggle('appearance-alt-screen-padding-enabled', useAltScreenPadding);
  }, [
    agentFont,
    altScreenPadding,
    compactMode,
    cursorBlinking,
    cursorType,
    dimInactivePanes,
    focusFollowsMouse,
    fontSize,
    fontWeight,
    inputPosition,
    inputType,
    lineHeight,
    matchTerminalFont,
    showBlockDividers,
    showJumpToBottom,
    showTabBar,
    showTabIndicators,
    tabClosePosition,
    terminalFont,
    useAltScreenPadding,
    verticalTabs,
    windowBlurRadius,
    windowOpacity,
    zoomLevel
  ]);

  return (
    <section className="settings-panel appearance-panel">
      <div className="settings-panel-header appearance-panel-header">
        <h1>Appearance</h1>
      </div>

      <div className="settings-group">
        <SectionHeader title="Theme" />
        <button className="appearance-inline-link" type="button" disabled>
          Create your own custom theme (coming soon)
        </button>

        <SettingsRow
          title="Sync with OS"
          description="Automatically switch between light and dark themes when your system does."
          action={<SettingsToggle checked={syncWithOs} onChange={() => updateAppearance('syncWithOs', !syncWithOs)} />}
        />

        <ThemePreviewCard />
      </div>

      <hr className="appearance-divider" />

      <div className="settings-group">
        <SectionHeader title="Icon" />
        <SettingsRow
          title="Customize your app icon"
          action={
            <SelectControl
              value={customIconStyle}
              onChange={(value) => updateAppearance('customIconStyle', value)}
              options={[
                { value: 'mono', label: 'Mono' },
                { value: 'color', label: 'Color' }
              ]}
            />
          }
        />
      </div>

      <hr className="appearance-divider" />

      <div className="settings-group">
        <SectionHeader title="Window" />
        <SettingsRow
          title="Open new windows with custom size"
          action={<SettingsToggle checked={customWindowSize} onChange={() => updateAppearance('customWindowSize', !customWindowSize)} />}
        />
        <SettingsRow
          title={`Window Opacity: ${windowOpacity}`}
          action={<SliderControl value={windowOpacity} min={20} max={100} onChange={(value) => updateAppearance('windowOpacity', value)} />}
        />
        <SettingsRow
          title={(
            <>
              Window Blur Radius: {windowBlurRadius}
              <Info size={12} className="info-icon-hint" />
            </>
          )}
          action={<SliderControl value={windowBlurRadius} min={0} max={10} onChange={(value) => updateAppearance('windowBlurRadius', value)} />}
        />
        <SettingsRow
          title="Zoom"
          description="Adjusts the default zoom level across all windows"
          action={
            <SelectControl
              value={zoomLevel}
              onChange={(value) => updateAppearance('zoomLevel', value)}
              options={[
                { value: '80', label: '80%' },
                { value: '90', label: '90%' },
                { value: '100', label: '100%' },
                { value: '110', label: '110%' }
              ]}
            />
          }
          topAligned
        />
        <SettingsRow
          title="Tools panel visibility is consistent across tabs"
          action={<SettingsToggle checked={consistentToolsPanel} onChange={() => updateAppearance('consistentToolsPanel', !consistentToolsPanel)} />}
        />
      </div>

      <hr className="appearance-divider" />

      <div className="settings-group">
        <SectionHeader title="Input" />
        <SettingsRow
          title="Input type"
          action={
            <RadioGroup
              value={inputType}
              onChange={(value) => updateAppearance('inputType', value)}
              options={[
                { value: 'warp', label: 'Warp' },
                { value: 'shell', label: 'Shell (PS1)' }
              ]}
            />
          }
        />
        <SettingsRow
          title="Input position"
          action={
            <SelectControl
              value={inputPosition}
              onChange={(value) => updateAppearance('inputPosition', value)}
              options={[
                { value: 'bottom', label: 'Pin to the bottom (Warp mode)' },
                { value: 'top', label: 'Pin to the top' }
              ]}
            />
          }
        />
        <div className="settings-group">
          <SectionHeader title="Panes" />
          <SettingsRow
            title="Dim inactive panes"
            action={<SettingsToggle checked={dimInactivePanes} onChange={() => updateAppearance('dimInactivePanes', !dimInactivePanes)} />}
          />
          <SettingsRow
            title="Focus follows mouse"
            action={<SettingsToggle checked={focusFollowsMouse} onChange={() => updateAppearance('focusFollowsMouse', !focusFollowsMouse)} />}
          />
        </div>
        <div className="settings-group">
          <SectionHeader title="Blocks" />
          <SettingsRow
            title="Compact mode"
            action={<SettingsToggle checked={compactMode} onChange={() => updateAppearance('compactMode', !compactMode)} />}
          />
          <SettingsRow
            title="Show Jump to Bottom of Block button"
            action={<SettingsToggle checked={showJumpToBottom} onChange={() => updateAppearance('showJumpToBottom', !showJumpToBottom)} />}
          />
          <SettingsRow
            title="Show block dividers"
            action={<SettingsToggle checked={showBlockDividers} onChange={() => updateAppearance('showBlockDividers', !showBlockDividers)} />}
          />
        </div>
        <div className="settings-group">
          <SectionHeader title="Text" />
          <div className="appearance-grid four-columns">
            <div className="appearance-field">
              <div className="appearance-field-label">Terminal font</div>
              <SelectControl
                value={terminalFont}
                onChange={(value) => updateAppearance('terminalFont', value)}
                options={fontOptions}
              />
            </div>
            <div className="appearance-field">
              <div className="appearance-field-label">Font weight</div>
              <SelectControl
                value={fontWeight}
                onChange={(value) => updateAppearance('fontWeight', value)}
                options={[
                  { value: 'Normal', label: 'Normal' },
                  { value: 'Medium', label: 'Medium' },
                  { value: 'Bold', label: 'Bold' }
                ]}
              />
            </div>
            <div className="appearance-field">
              <div className="appearance-field-label">Font size (px)</div>
              <NumberControl value={fontSize} onChange={(value) => updateAppearance('fontSize', value)} width={92} />
            </div>
            <div className="appearance-field">
              <div className="appearance-field-label">Line height</div>
              <NumberControl value={lineHeight} onChange={(value) => updateAppearance('lineHeight', value)} width={92} step={0.1} />
              <button
                type="button"
                className="appearance-inline-link"
                onClick={() => updateAppearance('lineHeight', DEFAULT_APPEARANCE_SETTINGS.lineHeight)}
              >
                Reset to default
              </button>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <CheckboxRow
              label="View all available system fonts"
              checked={viewSystemFonts}
              onChange={(checked) => updateAppearance('viewSystemFonts', checked)}
            />
          </div>
          <div className="appearance-grid two-columns" style={{ marginTop: 18 }}>
            <div className="appearance-field">
              <div className="appearance-field-label">Agent font</div>
              <SelectControl
                value={matchTerminalFont ? terminalFont : agentFont}
                onChange={(value) => updateAppearance('agentFont', value)}
                options={matchTerminalFont ? [
                  { value: terminalFont, label: 'Match terminal' }
                ] : fontOptions}
              />
            </div>
            <div style={{ alignSelf: 'end' }}>
              <CheckboxRow
                label="Match terminal"
                checked={matchTerminalFont}
                onChange={(checked) => updateAppearance('matchTerminalFont', checked)}
              />
            </div>
          </div>
        </div>
      </div>

      <hr className="appearance-divider" />

      <div className="settings-group">
        <SectionHeader title="Cursor" />
        <SettingsRow
          title="Cursor type"
          action={
            <RadioGroup
              value={cursorType}
              onChange={(value) => updateAppearance('cursorType', value)}
              options={[
                { value: 'bar', label: 'Bar' },
                { value: 'block', label: 'Block' },
                { value: 'underline', label: 'Underline' }
              ]}
            />
          }
        />
        <SettingsRow
          title="Blinking cursor"
          action={<SettingsToggle checked={cursorBlinking} onChange={() => updateAppearance('cursorBlinking', !cursorBlinking)} />}
        />
      </div>

      <hr className="appearance-divider" />

      <div className="settings-group">
        <SectionHeader title="Tabs" />
        <SettingsRow
          title="Show tab indicators"
          action={<SettingsToggle checked={showTabIndicators} onChange={() => updateAppearance('showTabIndicators', !showTabIndicators)} />}
        />
        <SettingsRow
          title="Show the tab bar"
          action={
            <SelectControl
              value={showTabBar}
              onChange={(value) => updateAppearance('showTabBar', value)}
              options={[
                { value: 'always', label: 'Always' },
                { value: 'windowed', label: 'When windowed' },
                { value: 'never', label: 'Never' }
              ]}
            />
          }
        />
        <SettingsRow
          title="Tab close button position"
          action={
            <SelectControl
              value={tabClosePosition}
              onChange={(value) => updateAppearance('tabClosePosition', value)}
              options={[
                { value: 'right', label: 'Right' },
                { value: 'left', label: 'Left' }
              ]}
            />
          }
        />
        <SettingsRow
          title="Preserve active tab color for new tabs"
          action={<SettingsToggle checked={preserveTabColor} onChange={() => updateAppearance('preserveTabColor', !preserveTabColor)} />}
        />
        <SettingsRow
          title="Use vertical tab layout"
          action={<SettingsToggle checked={verticalTabs} onChange={() => updateAppearance('verticalTabs', !verticalTabs)} />}
        />
        <SettingsRow
          title="Use latest user prompt as conversation title in tab names"
          description="Show the latest user prompt instead of the generated conversation title for Oz and third-party agent sessions in vertical tabs."
          action={<SettingsToggle checked={latestPromptTabNames} onChange={() => updateAppearance('latestPromptTabNames', !latestPromptTabNames)} />}
          topAligned
        />

        <ToolbarLayoutCard
          leftItems={toolbarLeftItems}
          rightItems={toolbarRightItems}
          onChange={updateToolbarLayout}
        />
      </div>

      <hr className="appearance-divider" />

      <div className="settings-group">
        <SectionHeader title="Full-screen Apps" />
        <SettingsRow
          title="Use custom padding in alt-screen"
          action={<SettingsToggle checked={useAltScreenPadding} onChange={() => updateAppearance('useAltScreenPadding', !useAltScreenPadding)} />}
        />
        <SettingsRow
          title="Uniform padding (px)"
          action={<NumberControl value={altScreenPadding} onChange={(value) => updateAppearance('altScreenPadding', value)} />}
        />
      </div>
    </section>
  );
}
