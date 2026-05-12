import { ChevronDown, GripVertical, Info, X } from 'lucide-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import './AppearanceSection.css';

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

function ToolbarLayoutCard() {
  const defaultLeftItems = useMemo(() => ['Tools Panel', 'Agent Management'], []);
  const defaultRightItems = useMemo(() => ['Code Review', 'Notifications'], []);
  const [leftItems, setLeftItems] = useState(defaultLeftItems);
  const [rightItems, setRightItems] = useState(defaultRightItems);

  return (
    <div className="appearance-toolbar-card">
      <div className="appearance-toolbar-card-header">
        <div className="appearance-toolbar-title">Available items</div>
        <button
          type="button"
          className="appearance-toolbar-action"
          onClick={() => {
            setLeftItems(defaultLeftItems);
            setRightItems(defaultRightItems);
          }}
        >
          Restore default
        </button>
      </div>

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
                  onRemove={() => {
                    setLeftItems((current) => current.filter((entry) => entry !== item));
                  }}
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
                  onRemove={() => {
                    setRightItems((current) => current.filter((entry) => entry !== item));
                  }}
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
  const [cursorType, setCursorType] = useState('block');
  const [cursorBlinking, setCursorBlinking] = useState(true);
  const [showTabIndicators, setShowTabIndicators] = useState(true);
  const [showTabBar, setShowTabBar] = useState('windowed');
  const [tabClosePosition, setTabClosePosition] = useState('right');
  const [preserveTabColor, setPreserveTabColor] = useState(false);
  const [verticalTabs, setVerticalTabs] = useState(false);
  const [latestPromptTabNames, setLatestPromptTabNames] = useState(false);
  const [syncWithOs, setSyncWithOs] = useState(false);
  const [customWindowSize, setCustomWindowSize] = useState(false);
  const [useAltScreenPadding, setUseAltScreenPadding] = useState(true);
  const [customIconStyle, setCustomIconStyle] = useState('mono');
  const [windowOpacity, setWindowOpacity] = useState(100);
  const [windowBlurRadius, setWindowBlurRadius] = useState(1);
  const [zoomLevel, setZoomLevel] = useState('100');
  const [consistentToolsPanel, setConsistentToolsPanel] = useState(true);
  const [inputType, setInputType] = useState('warp');
  const [inputPosition, setInputPosition] = useState('bottom');
  const [dimInactivePanes, setDimInactivePanes] = useState(false);
  const [focusFollowsMouse, setFocusFollowsMouse] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(true);
  const [showBlockDividers, setShowBlockDividers] = useState(true);
  const [terminalFont, setTerminalFont] = useState('Hack');
  const [fontWeight, setFontWeight] = useState('Normal');
  const [fontSize, setFontSize] = useState(13);
  const [lineHeight, setLineHeight] = useState(1.2);
  const [viewSystemFonts, setViewSystemFonts] = useState(false);
  const [agentFont, setAgentFont] = useState('Hack');
  const [matchTerminalFont, setMatchTerminalFont] = useState(false);
  const [altScreenPadding, setAltScreenPadding] = useState(0);

  return (
    <section className="settings-panel appearance-panel">
      <div className="settings-panel-header appearance-panel-header">
        <h1>Appearance</h1>
      </div>

      <div className="settings-group">
        <SectionHeader title="Theme" />
        <button className="appearance-inline-link" type="button">
          Create your own custom theme
        </button>

        <SettingsRow
          title="Sync with OS"
          description="Automatically switch between light and dark themes when your system does."
          action={<SettingsToggle checked={syncWithOs} onChange={() => setSyncWithOs((value) => !value)} />}
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
              onChange={setCustomIconStyle}
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
          action={<SettingsToggle checked={customWindowSize} onChange={() => setCustomWindowSize((value) => !value)} />}
        />
        <SettingsRow
          title="Window Opacity: 100"
          action={<SliderControl value={windowOpacity} min={20} max={100} onChange={setWindowOpacity} />}
        />
        <SettingsRow
          title={(
            <>
              Window Blur Radius: 1
              <Info size={12} className="info-icon-hint" />
            </>
          )}
          action={<SliderControl value={windowBlurRadius} min={0} max={10} onChange={setWindowBlurRadius} />}
        />
        <SettingsRow
          title="Zoom"
          description="Adjusts the default zoom level across all windows"
          action={
            <SelectControl
              value={zoomLevel}
              onChange={setZoomLevel}
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
          action={<SettingsToggle checked={consistentToolsPanel} onChange={() => setConsistentToolsPanel((value) => !value)} />}
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
              onChange={setInputType}
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
              onChange={setInputPosition}
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
            action={<SettingsToggle checked={dimInactivePanes} onChange={() => setDimInactivePanes((value) => !value)} />}
          />
          <SettingsRow
            title="Focus follows mouse"
            action={<SettingsToggle checked={focusFollowsMouse} onChange={() => setFocusFollowsMouse((value) => !value)} />}
          />
        </div>
        <div className="settings-group">
          <SectionHeader title="Blocks" />
          <SettingsRow
            title="Compact mode"
            action={<SettingsToggle checked={compactMode} onChange={() => setCompactMode((value) => !value)} />}
          />
          <SettingsRow
            title="Show Jump to Bottom of Block button"
            action={<SettingsToggle checked={showJumpToBottom} onChange={() => setShowJumpToBottom((value) => !value)} />}
          />
          <SettingsRow
            title="Show block dividers"
            action={<SettingsToggle checked={showBlockDividers} onChange={() => setShowBlockDividers((value) => !value)} />}
          />
        </div>
        <div className="settings-group">
          <SectionHeader title="Text" />
          <div className="appearance-grid four-columns">
            <div className="appearance-field">
              <div className="appearance-field-label">Terminal font</div>
              <SelectControl
                value={terminalFont}
                onChange={setTerminalFont}
                options={[
                  { value: 'Hack', label: 'Hack (default)' },
                  { value: 'JetBrains', label: 'JetBrains Mono' },
                  { value: 'Monaspace', label: 'Monaspace' }
                ]}
              />
            </div>
            <div className="appearance-field">
              <div className="appearance-field-label">Font weight</div>
              <SelectControl
                value={fontWeight}
                onChange={setFontWeight}
                options={[
                  { value: 'Normal', label: 'Normal' },
                  { value: 'Medium', label: 'Medium' },
                  { value: 'Bold', label: 'Bold' }
                ]}
              />
            </div>
            <div className="appearance-field">
              <div className="appearance-field-label">Font size (px)</div>
              <NumberControl value={fontSize} onChange={setFontSize} width={92} />
            </div>
            <div className="appearance-field">
              <div className="appearance-field-label">Line height</div>
              <NumberControl value={lineHeight} onChange={setLineHeight} width={92} step={0.1} />
              <button type="button" className="appearance-inline-link">Reset to default</button>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <CheckboxRow
              label="View all available system fonts"
              checked={viewSystemFonts}
              onChange={setViewSystemFonts}
            />
          </div>
          <div className="appearance-grid two-columns" style={{ marginTop: 18 }}>
            <div className="appearance-field">
              <div className="appearance-field-label">Agent font</div>
              <SelectControl
                value={agentFont}
                onChange={setAgentFont}
                options={[
                  { value: 'Hack', label: 'Hack (default)' },
                  { value: 'JetBrains', label: 'JetBrains Mono' },
                  { value: 'Match', label: 'Match terminal' }
                ]}
              />
            </div>
            <div style={{ alignSelf: 'end' }}>
              <CheckboxRow
                label="Match terminal"
                checked={matchTerminalFont}
                onChange={setMatchTerminalFont}
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
              onChange={setCursorType}
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
          action={<SettingsToggle checked={cursorBlinking} onChange={() => setCursorBlinking((value) => !value)} />}
        />
      </div>

      <hr className="appearance-divider" />

      <div className="settings-group">
        <SectionHeader title="Tabs" />
        <SettingsRow
          title="Show tab indicators"
          action={<SettingsToggle checked={showTabIndicators} onChange={() => setShowTabIndicators((value) => !value)} />}
        />
        <SettingsRow
          title="Show the tab bar"
          action={
            <SelectControl
              value={showTabBar}
              onChange={setShowTabBar}
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
              onChange={setTabClosePosition}
              options={[
                { value: 'right', label: 'Right' },
                { value: 'left', label: 'Left' }
              ]}
            />
          }
        />
        <SettingsRow
          title="Preserve active tab color for new tabs"
          action={<SettingsToggle checked={preserveTabColor} onChange={() => setPreserveTabColor((value) => !value)} />}
        />
        <SettingsRow
          title="Use vertical tab layout"
          action={<SettingsToggle checked={verticalTabs} onChange={() => setVerticalTabs((value) => !value)} />}
        />
        <SettingsRow
          title="Use latest user prompt as conversation title in tab names"
          description="Show the latest user prompt instead of the generated conversation title for Oz and third-party agent sessions in vertical tabs."
          action={<SettingsToggle checked={latestPromptTabNames} onChange={() => setLatestPromptTabNames((value) => !value)} />}
          topAligned
        />

        <ToolbarLayoutCard />
      </div>

      <hr className="appearance-divider" />

      <div className="settings-group">
        <SectionHeader title="Full-screen Apps" />
        <SettingsRow
          title="Use custom padding in alt-screen"
          action={<SettingsToggle checked={useAltScreenPadding} onChange={() => setUseAltScreenPadding((value) => !value)} />}
        />
        <SettingsRow
          title="Uniform padding (px)"
          action={<NumberControl value={altScreenPadding} onChange={setAltScreenPadding} />}
        />
      </div>
    </section>
  );
}
