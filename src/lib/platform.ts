export function isMacPlatform() {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform.toLowerCase();
  return platform.includes('mac');
}

export function getPrimaryModifierLabel() {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}
