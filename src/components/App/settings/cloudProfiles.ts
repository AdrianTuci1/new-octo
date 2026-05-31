import type { MemorySettingsValues } from '../../../types/memory';
import type { TerminalSessionProvider } from '../../../types/terminal';

export type CloudProviderId = 'custom-vm' | 'modal';
export type CloudConnectionMethod = 'ssh-key' | 'ssh-agent' | 'modal-token';

export type CloudProfile = {
  id: string;
  title: string;
  provider: CloudProviderId;
  environment: string;
  runtime: string;
  connectionMethod?: CloudConnectionMethod;
  host?: string;
  username?: string;
  bootstrapPublicKey?: string;
  secretRef?: string;
  hasSecret?: boolean;
  status: 'Ready' | 'Draft';
};

export const cloudConnectionMethodLabels: Record<CloudConnectionMethod, string> = {
  'ssh-key': 'SSH key bootstrap',
  'ssh-agent': 'SSH agent',
  'modal-token': 'Modal token'
};

export const DEFAULT_CLOUD_PROFILES: CloudProfile[] = [];

const CLOUD_PROFILE_TEMPLATES: Record<CloudProviderId, CloudProfile> = {
  'custom-vm': {
    id: 'new-custom-vm',
    title: 'New Custom VM',
    provider: 'custom-vm',
    environment: 'dev',
    runtime: 'Configure host and credentials',
    connectionMethod: 'ssh-key',
    username: 'ubuntu',
    status: 'Draft'
  },
  modal: {
    id: 'new-modal',
    title: 'New Modal profile',
    provider: 'modal',
    environment: 'main',
    runtime: 'Modal Sandbox',
    connectionMethod: 'modal-token',
    username: 'modal',
    status: 'Draft'
  }
};

export type CloudTerminalTarget = {
  kind: 'cloud';
  provider: TerminalSessionProvider;
  profileId: string;
  environment?: string | null;
  host?: string | null;
  username?: string | null;
  connectionMethod?: CloudConnectionMethod | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeProvider(value: unknown): CloudProviderId {
  return value === 'modal' ? 'modal' : 'custom-vm';
}

function normalizeConnectionMethod(value: unknown, provider: CloudProviderId): CloudConnectionMethod {
  if (provider === 'modal') {
    return 'modal-token';
  }

  return value === 'ssh-agent' ? 'ssh-agent' : 'ssh-key';
}

export function cloudSecretAccount(profileId: string, provider: CloudProviderId) {
  return `cloud-profile:${profileId}:${provider === 'modal' ? 'modal-token' : 'ssh-private-key'}`;
}

export function normalizeCloudProfile(raw: unknown, fallback: CloudProfile): CloudProfile {
  const record = isRecord(raw) ? raw : {};
  const provider = normalizeProvider(record.provider ?? fallback.provider);
  const connectionMethod = normalizeConnectionMethod(record.connectionMethod ?? fallback.connectionMethod, provider);
  const host = stringValue(record.host, fallback.host ?? '').trim();
  const username = stringValue(record.username, fallback.username ?? (provider === 'modal' ? 'modal' : 'ubuntu')).trim();
  const hasSecret = booleanValue(record.hasSecret, fallback.hasSecret ?? false);
  const runtime = provider === 'modal'
    ? stringValue(record.runtime, fallback.runtime || 'Modal Sandbox')
    : host
      ? `${username || 'user'}@${host}`
      : stringValue(record.runtime, fallback.runtime || 'Configure host and credentials');
  const ready = provider === 'custom-vm'
    ? Boolean(host && username && (connectionMethod === 'ssh-agent' || hasSecret))
    : hasSecret;

  return {
    id: stringValue(record.id, fallback.id),
    title: stringValue(record.title, fallback.title),
    provider,
    environment: stringValue(record.environment, fallback.environment),
    runtime,
    connectionMethod,
    host,
    username,
    bootstrapPublicKey: stringValue(record.bootstrapPublicKey, fallback.bootstrapPublicKey ?? ''),
    secretRef: stringValue(record.secretRef, cloudSecretAccount(stringValue(record.id, fallback.id), provider)),
    hasSecret,
    status: ready ? 'Ready' : 'Draft'
  };
}

export function normalizeCloudProfiles(values?: MemorySettingsValues | null): CloudProfile[] {
  const cloud = isRecord(values?.cloud) ? values.cloud : {};
  const rawProfiles = Array.isArray(cloud.profiles) ? cloud.profiles : [];
  return rawProfiles.map((profile, index) => {
    const provider = isRecord(profile) ? normalizeProvider(profile.provider) : 'custom-vm';
    return normalizeCloudProfile(profile, {
      ...CLOUD_PROFILE_TEMPLATES[provider],
      id: `cloud-profile-${index + 1}`,
      title: `Cloud profile ${index + 1}`
    });
  });
}

export function buildCloudProfilesSettingsValues(profiles: CloudProfile[]): MemorySettingsValues {
  return {
    cloud: {
      profiles: profiles.map((profile) => ({
        id: profile.id,
        title: profile.title,
        provider: profile.provider,
        environment: profile.environment,
        runtime: profile.runtime,
        connectionMethod: profile.connectionMethod,
        host: profile.host ?? '',
        username: profile.username ?? '',
        bootstrapPublicKey: profile.bootstrapPublicKey ?? '',
        secretRef: profile.secretRef ?? cloudSecretAccount(profile.id, profile.provider),
        hasSecret: Boolean(profile.hasSecret)
      }))
    }
  };
}

export function createCloudProfile(provider: CloudProviderId = 'custom-vm'): CloudProfile {
  const id = `cloud_${Date.now()}`;
  return normalizeCloudProfile({
    id,
    title: provider === 'modal' ? 'New Modal profile' : 'New Custom VM',
    provider,
    environment: provider === 'modal' ? 'main' : 'dev',
    connectionMethod: provider === 'modal' ? 'modal-token' : 'ssh-key',
    username: provider === 'modal' ? 'modal' : 'ubuntu',
    secretRef: cloudSecretAccount(id, provider)
  }, CLOUD_PROFILE_TEMPLATES[provider]);
}

export function getDefaultReadyCloudProfile(values?: MemorySettingsValues | null) {
  return normalizeCloudProfiles(values).find((profile) => profile.status === 'Ready') ?? null;
}

export function toTerminalTarget(profile: CloudProfile): CloudTerminalTarget {
  return {
    kind: 'cloud',
    provider: profile.provider === 'modal' ? 'modal' : 'custom-vm',
    profileId: profile.id,
    environment: profile.environment ?? null,
    host: profile.host ?? null,
    username: profile.username ?? null,
    connectionMethod: profile.connectionMethod ?? null
  };
}

export const defaultCloudProfiles = DEFAULT_CLOUD_PROFILES;
