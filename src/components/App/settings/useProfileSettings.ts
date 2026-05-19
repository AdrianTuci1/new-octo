import { useCallback, useEffect, useMemo } from 'react';
import { useMemoryStore } from '../../../stores/memoryStore';
import {
  buildProfileSettingsValues,
  createAvatarSeed,
  createProfileDisplayName,
  normalizeProfileSettings,
  type UserProfileSettings
} from './profileSettings';

export function useProfileSettings() {
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const profile = useMemo(() => normalizeProfileSettings(settings?.values), [settings?.values]);
  const rawProfile = settings?.values.profile as Record<string, unknown> | undefined;

  useEffect(() => {
    if (!settings) {
      return;
    }

    const shouldCreateSeed = typeof rawProfile?.avatarSeed !== 'string';
    const shouldCreateName = typeof rawProfile?.displayName !== 'string' || rawProfile.displayName.trim().length === 0;
    if (!shouldCreateSeed && !shouldCreateName) {
      return;
    }

    const avatarSeed = shouldCreateSeed ? createAvatarSeed() : profile.avatarSeed;
    void saveSettings(buildProfileSettingsValues({
      ...profile,
      avatarSeed,
      displayName: shouldCreateName ? createProfileDisplayName(avatarSeed) : profile.displayName
    }), true);
  }, [profile, rawProfile?.avatarSeed, rawProfile?.displayName, saveSettings, settings]);

  const saveProfile = useCallback((nextProfile: UserProfileSettings) => (
    saveSettings(buildProfileSettingsValues(nextProfile), true)
  ), [saveSettings]);

  return {
    profile,
    saveProfile
  };
}
