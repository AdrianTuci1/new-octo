import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { isMacPlatform } from '../lib/platform';
import {
  keyboardShortcutRows as fallbackShortcutRows,
  type KeyboardShortcutBinding,
  type KeyboardShortcutKey,
  type KeyboardShortcutRow
} from '../components/App/settings/menus/keyboard-shortcuts/shortcuts';
import type { BackendKeybindingDefinition } from '../types/keybindings';

function toShortcutKey(label: string): KeyboardShortcutKey {
  const normalized = label.trim().toLowerCase();
  const isMac = isMacPlatform();

  switch (normalized) {
    case 'cmdorctrl':
      return { label: isMac ? '⌘' : 'Ctrl', accent: true };
    case 'cmd':
    case 'command':
    case 'meta':
      return { label: isMac ? '⌘' : 'Ctrl', accent: true };
    case 'ctrl':
    case 'control':
      return { label: isMac ? '⌃' : 'Ctrl', accent: true };
    case 'alt':
    case 'option':
      return { label: isMac ? '⌥' : 'Alt', accent: true };
    case 'shift':
      return { label: '⇧', accent: true };
    case 'enter':
      return { label: isMac ? '↵' : 'Enter', accent: true };
    case 'up':
      return { label: '↑' };
    case 'down':
      return { label: '↓' };
    case 'left':
      return { label: '←' };
    case 'right':
      return { label: '→' };
    case 'space':
      return { label: 'Space', accent: true };
    default:
      return { label: label.length === 1 ? label.toUpperCase() : label, accent: true };
  }
}

function toBinding(shortcut: string | null): KeyboardShortcutBinding[] {
  if (!shortcut) {
    return [];
  }

  const keys = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(toShortcutKey);

  return keys.length > 0 ? [{ keys }] : [];
}

function toRows(definitions: BackendKeybindingDefinition[]): KeyboardShortcutRow[] {
  return definitions
    .slice()
    .sort((left, right) => {
      const categoryCompare = left.category.localeCompare(right.category);
      if (categoryCompare !== 0) {
        return categoryCompare;
      }

      return left.title.localeCompare(right.title);
    })
    .map((definition) => ({
      command: definition.title,
      bindings: toBinding(definition.shortcut)
    }));
}

export function useKeybindingCatalog() {
  const [rows, setRows] = useState<KeyboardShortcutRow[]>(fallbackShortcutRows);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!(window as any).__TAURI_INTERNALS__) {
      setLoading(false);
      return;
    }

    void invoke<BackendKeybindingDefinition[]>('keybindings_list_definitions')
      .then((definitions) => {
        if (cancelled || definitions.length === 0) {
          return;
        }

        setRows(toRows(definitions));
      })
      .catch((error) => {
        console.warn('[keybindings] failed to load backend definitions', error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading };
}
