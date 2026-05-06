import { EyeOff, Search } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { keyboardShortcutRows, type KeyboardShortcutRow, type KeyboardShortcutBinding, type KeyboardShortcutKey } from '../menus/keyboard-shortcuts/shortcuts';
import { ShortcutBinding } from '../menus/keyboard-shortcuts/ShortcutPrimitives';

type EditingShortcut = {
  command: string;
  originalBindings: KeyboardShortcutBinding[];
  recordedKeys: KeyboardShortcutKey[];
};

export function KeyboardShortcutsSection() {
  const [query, setQuery] = useState('');
  const [shortcuts, setShortcuts] = useState<KeyboardShortcutRow[]>(() => {
    const saved = localStorage.getItem('keyboard_shortcuts');
    return saved ? JSON.parse(saved) : keyboardShortcutRows;
  });

  const [editing, setEditing] = useState<EditingShortcut | null>(null);

  useEffect(() => {
    if (!editing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keys: KeyboardShortcutKey[] = [];
      
      // Meta (⌘)
      if (e.metaKey) {
        keys.push({ label: '⌘' });
      }
      
      // Control (⌃)
      if (e.ctrlKey) {
        keys.push({ label: '⌃' });
      }
      
      // Alt (⌥)
      if (e.altKey) {
        keys.push({ label: '⌥' });
      }
      
      // Shift (⇧)
      if (e.shiftKey) {
        keys.push({ label: '⇧' });
      }

      // Handle the main key
      let keyLabel = '';
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
        // Just modifiers pressed so far
      } else {
        if (e.key === 'Enter') {
          keyLabel = '↵';
        } else if (e.key === 'ArrowUp') {
          keyLabel = '↑';
        } else if (e.key === 'ArrowDown') {
          keyLabel = '↓';
        } else if (e.key === 'ArrowLeft') {
          keyLabel = '←';
        } else if (e.key === 'ArrowRight') {
          keyLabel = '→';
        } else if (e.key === ' ') {
          keyLabel = 'Space';
        } else {
          keyLabel = e.key.toUpperCase();
        }
      }

      if (keyLabel) {
        const uniqueKeys = [...keys];
        if (!uniqueKeys.some(k => k.label === keyLabel)) {
          uniqueKeys.push({ label: keyLabel });
        }
        setEditing(prev => prev ? { ...prev, recordedKeys: uniqueKeys } : null);
      } else if (keys.length > 0) {
        setEditing(prev => prev ? { ...prev, recordedKeys: keys } : null);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [editing]);

  const handleClear = () => {
    setEditing(prev => prev ? { ...prev, recordedKeys: [] } : null);
  };

  const handleDefault = () => {
    const defaultRow = keyboardShortcutRows.find(r => r.command === editing?.command);
    const defaultKeys = defaultRow?.bindings[0]?.keys || [];
    setEditing(prev => prev ? { ...prev, recordedKeys: defaultKeys } : null);
  };

  const handleCancel = () => {
    setEditing(null);
  };

  const handleSave = () => {
    if (!editing) return;
    const updated = shortcuts.map(row => {
      if (row.command === editing.command) {
        return {
          ...row,
          bindings: editing.recordedKeys.length > 0 ? [{ keys: editing.recordedKeys }] : []
        };
      }
      return row;
    });
    setShortcuts(updated);
    localStorage.setItem('keyboard_shortcuts', JSON.stringify(updated));
    setEditing(null);
  };

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
    <section className="settings-panel settings-shortcuts-panel">
      <div className="settings-panel-header settings-shortcuts-header">
        <div>
          <h1>Configure keyboard shortcuts</h1>
          <p className="settings-shortcuts-description">
            Add your own custom keybindings to existing actions below.
            <span className="settings-shortcuts-description-line">
              Use <kbd className="settings-inline-kbd">⌘</kbd>
              <kbd className="settings-inline-kbd">/</kbd>
              to reference these keybindings in a side pane at anytime.
            </span>
          </p>
        </div>

        <button className="settings-shortcuts-icon-button" type="button" aria-label="Shortcut visibility">
          <EyeOff size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="settings-shortcuts-toolbar">
        <div className="settings-shortcuts-column-label">Command</div>

        <label className="settings-shortcuts-search">
          <Search size={14} className="settings-shortcuts-search-icon" aria-hidden="true" />
          <input
            aria-label="Search shortcuts"
            placeholder='Search by name or by keys (ex. "cmd")'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="settings-shortcuts-scroll-shell">
        <div className="settings-shortcuts-list" role="table" aria-label="Keyboard shortcuts">
          {filteredRows.length > 0 ? (
            filteredRows.map((row, index) => {
              const hasBindings = row.bindings.length > 0;
              const isActiveEditing = editing?.command === row.command;

              if (isActiveEditing) {
                return (
                  <div
                    key={row.command}
                    className="settings-shortcut-row active-editing"
                    role="row"
                  >
                    <div className="settings-shortcuts-editing-row-container">
                      <div className="settings-shortcuts-editing-header">
                        <span className="editing-command-title">{editing.command}</span>
                        <div className="editing-keys-display">
                          {editing.recordedKeys.map((key, idx) => (
                            <kbd key={idx} className="editing-key">{key.label}</kbd>
                          ))}
                        </div>
                      </div>
                      <div className="settings-shortcuts-editing-bar">
                        <span className="editing-bar-prompt">Press new keyboard shortcut</span>
                        <div className="editing-bar-actions">
                          <button onClick={(e) => { e.stopPropagation(); handleClear(); }} className="editing-btn">Clear</button>
                          <button onClick={(e) => { e.stopPropagation(); handleDefault(); }} className="editing-btn">Default</button>
                          <button onClick={(e) => { e.stopPropagation(); handleCancel(); }} className="editing-btn">Cancel</button>
                          <button onClick={(e) => { e.stopPropagation(); handleSave(); }} className="editing-btn save">Save</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={row.command}
                  className={`settings-shortcut-row ${index % 2 === 0 ? 'alt' : ''}`}
                  role="row"
                  onClick={() => setEditing({
                    command: row.command,
                    originalBindings: row.bindings,
                    recordedKeys: row.bindings[0]?.keys || []
                  })}
                  style={{ cursor: 'pointer' }}
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
