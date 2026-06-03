import { invoke } from '@tauri-apps/api/core';
import { isMacPlatform } from '../../lib/platform';
import {
  keyboardShortcutRows as fallbackShortcutRows,
  type KeyboardShortcutBinding,
  type KeyboardShortcutKey,
  type KeyboardShortcutRow
} from '../../components/App/settings/menus/keyboard-shortcuts/shortcuts';
import type { BackendKeybindingDefinition } from '../../types/keybindings';

function toShortcutKey(label: string): KeyboardShortcutKey {
  const normalized = label.trim().toLowerCase();
  const isMac = isMacPlatform();
  switch (normalized) {
    case 'cmdorctrl': return { label: isMac ? '\u2318' : 'Ctrl', accent: true };
    case 'cmd': case 'command': case 'meta': return { label: isMac ? '\u2318' : 'Ctrl', accent: true };
    case 'ctrl': case 'control': return { label: isMac ? '\u2303' : 'Ctrl', accent: true };
    case 'alt': case 'option': return { label: isMac ? '\u2325' : 'Alt', accent: true };
    case 'shift': return { label: '\u21E7', accent: true };
    case 'enter': return { label: isMac ? '\u21B5' : 'Enter', accent: true };
    case 'up': return { label: '\u2191' };
    case 'down': return { label: '\u2193' };
    case 'left': return { label: '\u2190' };
    case 'right': return { label: '\u2192' };
    case 'space': return { label: 'Space', accent: true };
    default: return { label: label.length === 1 ? label.toUpperCase() : label, accent: true };
  }
}

function toBinding(shortcut: string | null): KeyboardShortcutBinding[] {
  if (!shortcut) return [];
  const keys = shortcut.split('+').map((part) => part.trim()).filter(Boolean).map(toShortcutKey);
  return keys.length > 0 ? [{ keys }] : [];
}

function toRows(definitions: BackendKeybindingDefinition[]): KeyboardShortcutRow[] {
  return definitions
    .slice()
    .sort((left, right) => {
      const categoryCompare = left.category.localeCompare(right.category);
      if (categoryCompare !== 0) return categoryCompare;
      return left.title.localeCompare(right.title);
    })
    .map((definition) => ({
      command: definition.title,
      bindings: toBinding(definition.shortcut)
    }));
}

/**
 * KeybindingCatalogService
 * ───────────────────────────────────────────
 * Pattern: **Singleton** + **Observer**
 * Loads keybinding definitions from the backend (or uses built-in fallbacks) and broadcasts to listeners.
 * Subscribers get a snapshot immediately if already loaded.
 */
export class KeybindingCatalogService {
  private rows: KeyboardShortcutRow[] = fallbackShortcutRows;
  private loaded = false;
  private listeners: Array<(rows: KeyboardShortcutRow[]) => void> = [];

  getRows(): KeyboardShortcutRow[] {
    return this.rows;
  }

  isLoading(): boolean {
    return !this.loaded;
  }

  subscribe(listener: (rows: KeyboardShortcutRow[]) => void): () => void {
    this.listeners.push(listener);
    if (this.loaded) listener(this.rows);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async load(): Promise<KeyboardShortcutRow[]> {
    if (this.loaded) return this.rows;
    if (!(window as any).__TAURI_INTERNALS__) {
      this.loaded = true;
      this.listeners.forEach((l) => l(this.rows));
      return this.rows;
    }
    try {
      const definitions = await invoke<BackendKeybindingDefinition[]>('keybindings_list_definitions');
      if (definitions.length > 0) {
        this.rows = toRows(definitions);
      }
    } catch (error) {
      console.warn('[keybindings] failed to load backend definitions', error);
    }
    this.loaded = true;
    this.listeners.forEach((l) => l(this.rows));
    return this.rows;
  }

  static getInstance(): KeybindingCatalogService {
    if (!instance) {
      instance = new KeybindingCatalogService();
    }
    return instance;
  }
}

let instance: KeybindingCatalogService | null = null;
