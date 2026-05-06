import type { KeyboardShortcutKey } from './shortcuts';

export function ShortcutKey({ label, accent }: { label: string; accent?: boolean }) {
  return <kbd className={`settings-shortcut-key ${accent ? 'accent' : ''}`}>{label}</kbd>;
}

export function ShortcutBinding({ keys }: { keys: KeyboardShortcutKey[] }) {
  return (
    <span className="settings-shortcut-binding" aria-label={keys.map((key) => key.label).join(' plus ')}>
      {keys.map((key, index) => (
        <ShortcutKey key={`${key.label}-${index}`} label={key.label} accent={key.accent} />
      ))}
    </span>
  );
}
