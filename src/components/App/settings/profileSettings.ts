import type { MemorySettingsValues } from '../../../types/memory';

export type UserProfileSettings = {
  displayName: string;
  avatarSeed: string;
  avatarDataUrl: string | null;
};

export const DEFAULT_PROFILE_SETTINGS: UserProfileSettings = {
  displayName: 'Ember Pilot',
  avatarSeed: 'octomus-local-profile',
  avatarDataUrl: null
};

const PROFILE_ADJECTIVES = [
  'Amber',
  'Bright',
  'Clear',
  'Cinder',
  'Ember',
  'Forge',
  'Kind',
  'Local',
  'Quiet',
  'Signal',
  'Solar',
  'Swift'
];

const PROFILE_NOUNS = [
  'Atlas',
  'Beam',
  'Craft',
  'Forge',
  'Pilot',
  'Pulse',
  'Spark',
  'Thread',
  'Trace',
  'Vector',
  'Verse',
  'Wave'
];

const PROFILE_PRESETS = [
  'Ember Pilot',
  'Local Atlas',
  'Signal Craft',
  'Bright Thread',
  'Cinder Forge',
  'Solar Trace',
  'Clear Vector',
  'Quiet Spark',
  'Amber Wave',
  'Swift Pulse'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function createAvatarSeed() {
  return `octomus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProfileDisplayName(seed = createAvatarSeed()) {
  const hash = hashText(seed);
  if (hash % 4 === 0) {
    return PROFILE_PRESETS[hash % PROFILE_PRESETS.length];
  }

  const adjective = PROFILE_ADJECTIVES[hash % PROFILE_ADJECTIVES.length];
  const noun = PROFILE_NOUNS[Math.floor(hash / PROFILE_ADJECTIVES.length) % PROFILE_NOUNS.length];
  return `${adjective} ${noun}`;
}

export function normalizeProfileSettings(values?: MemorySettingsValues | null): UserProfileSettings {
  const rawProfile = isRecord(values?.profile) ? values.profile : {};
  const displayName = typeof rawProfile.displayName === 'string' && rawProfile.displayName.trim().length > 0
    ? rawProfile.displayName
    : DEFAULT_PROFILE_SETTINGS.displayName;
  const avatarSeed = typeof rawProfile.avatarSeed === 'string' && rawProfile.avatarSeed.trim().length > 0
    ? rawProfile.avatarSeed
    : DEFAULT_PROFILE_SETTINGS.avatarSeed;
  const avatarDataUrl = typeof rawProfile.avatarDataUrl === 'string' && rawProfile.avatarDataUrl.startsWith('data:image/')
    ? rawProfile.avatarDataUrl
    : null;

  return {
    displayName,
    avatarSeed,
    avatarDataUrl
  };
}

export function buildProfileSettingsValues(profile: UserProfileSettings): MemorySettingsValues {
  return { profile };
}

export function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'OU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
