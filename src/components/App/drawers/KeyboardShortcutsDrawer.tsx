import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import '../settings/SettingsContent.css';
import './KeyboardShortcutsDrawer.css';
import { keyboardShortcutRows } from '../settings/menus/keyboard-shortcuts/shortcuts';
import { ShortcutBinding } from '../settings/menus/keyboard-shortcuts/ShortcutPrimitives';
import { DrawerHeader } from './DrawerHeader';

type KeyboardShortcutsDrawerProps = {
  onClose: () => void;
};

type KeyboardShortcutRow = typeof keyboardShortcutRows[number];

function readStoredShortcuts(): KeyboardShortcutRow[] {
  try {
    const saved = localStorage.getItem('keyboard_shortcuts');
    if (!saved) {
      return keyboardShortcutRows;
    }

    return JSON.parse(saved) as KeyboardShortcutRow[];
  } catch {
    return keyboardShortcutRows;
  }
}

export function KeyboardShortcutsDrawer({ onClose }: KeyboardShortcutsDrawerProps) {
  const [query, setQuery] = useState('');
  const [shortcuts] = useState<KeyboardShortcutRow[]>(readStoredShortcuts);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return shortcuts;

    return shortcuts.filter((row) => {
      const commandMatches = row.command.toLowerCase().includes(normalizedQuery);
      const bindingMatches = row.bindings.some((binding) =>
        binding.keys.some((key) => key.label.toLowerCase().includes(normalizedQuery))
      );

      return commandMatches || bindingMatches;
    });
  }, [query, shortcuts]);

  return (
    <section className="keyboard-shortcuts-drawer">
      <DrawerHeader
        title="Keyboard shortcuts"
        action={(
          <button className="drawer-header-action-button" onClick={onClose} type="button" aria-label="Close keyboard shortcuts drawer">
            <X size={18} />
          </button>
        )}
      />

      <div className="keyboard-shortcuts-drawer-intro">
        <p className="keyboard-shortcuts-drawer-eyebrow">Quick reference</p>
        <p className="keyboard-shortcuts-drawer-description">
          Browse the shortcuts used across the launcher and workspace. Search by command or key combo.
        </p>
      </div>

      <div className="keyboard-shortcuts-drawer-toolbar">
        <div className="keyboard-shortcuts-drawer-column-label">Command</div>

        <label className="settings-shortcuts-search keyboard-shortcuts-drawer-search">
          <Search size={14} className="settings-shortcuts-search-icon" aria-hidden="true" />
          <input
            aria-label="Search shortcuts"
            placeholder='Search by name or keys (ex. "cmd")'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="keyboard-shortcuts-drawer-scroll-shell">
        <div className="settings-shortcuts-list keyboard-shortcuts-drawer-list" role="table" aria-label="Keyboard shortcuts">
          {filteredRows.length > 0 ? (
            filteredRows.map((row, index) => {
              const hasBindings = row.bindings.length > 0;

              return (
                <div
                  key={row.command}
                  className={`settings-shortcut-row ${index % 2 === 0 ? 'alt' : ''}`}
                  role="row"
                >
                  <div className="settings-shortcut-command" role="cell">
                    {row.command}
                  </div>

                  <div className="settings-shortcut-bindings" role="cell">
                    {hasBindings ? (
                      row.bindings.map((binding, bindingIndex) => (
                        <ShortcutBinding
                          key={`${row.command}-${bindingIndex}`}
                          keys={binding.keys}
                        />
                      ))
                    ) : (
                      <span className="settings-shortcut-empty">Not assigned</span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="settings-shortcuts-empty-state">
              No shortcuts match your search.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
