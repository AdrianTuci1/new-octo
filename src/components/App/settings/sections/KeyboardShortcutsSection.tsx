import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useKeybindingCatalog } from '../../../../hooks/useKeybindingCatalog';
import { ShortcutBinding } from '../menus/keyboard-shortcuts/ShortcutPrimitives';

export function KeyboardShortcutsSection() {
  const [query, setQuery] = useState('');
  const { rows, loading } = useKeybindingCatalog();

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) => {
      const commandMatches = row.command.toLowerCase().includes(normalizedQuery);
      const bindingMatches = row.bindings.some((binding) =>
        binding.keys.some((key) => key.label.toLowerCase().includes(normalizedQuery))
      );

      return commandMatches || bindingMatches;
    });
  }, [query, rows]);

  return (
    <section className="settings-panel settings-shortcuts-panel">
      <div className="settings-panel-header settings-shortcuts-header">
        <div>
          <h1>Keyboard shortcuts</h1>
          <p className="settings-shortcuts-description">
            Shortcut commands are registered in the Tauri backend and mirrored here for quick lookup.
            <span className="settings-shortcuts-description-line">
              This page now reflects the backend command catalog instead of a frontend-only list.
            </span>
          </p>
        </div>
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
          {loading && filteredRows.length === 0 ? (
            <div className="settings-shortcuts-empty-state">Loading backend shortcuts...</div>
          ) : filteredRows.length > 0 ? (
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
