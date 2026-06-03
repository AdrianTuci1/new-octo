import { useEffect, useState } from 'react';
import { KeybindingCatalogService } from '../services/Keyboard/KeybindingCatalogService';
import type { KeyboardShortcutRow } from '../components/App/settings/menus/keyboard-shortcuts/shortcuts';

export function useKeybindingCatalog() {
  const [rows, setRows] = useState<KeyboardShortcutRow[]>(() =>
    KeybindingCatalogService.getInstance().getRows()
  );
  const [loading, setLoading] = useState(() =>
    KeybindingCatalogService.getInstance().isLoading()
  );

  useEffect(() => {
    const service = KeybindingCatalogService.getInstance();
    const unsubscribe = service.subscribe((nextRows) => {
      setRows(nextRows);
      setLoading(false);
    });
    void service.load();
    return unsubscribe;
  }, []);

  return { rows, loading };
}
