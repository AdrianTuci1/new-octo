import type { CSSProperties } from 'react';
import { initialsFromName, type UserProfileSettings } from '../settings/profileSettings';
import './ProfileAvatar.css';

type ProfileAvatarProps = {
  profile: UserProfileSettings;
  size?: number;
  className?: string;
  showInitials?: boolean;
};

const MOSAIC_COLORS = ['#050304', '#160506', '#36100b', '#6c1b0f', '#b93116', '#f06a1b', '#ff9a2e'];

export function ProfileAvatar({
  profile,
  size = 32,
  className = '',
  showInitials = false
}: ProfileAvatarProps) {
  const style = {
    width: size,
    height: size,
    '--avatar-size': `${size}px`
  } as CSSProperties;

  if (profile.avatarDataUrl) {
    return (
      <div className={`profile-avatar profile-avatar-image ${className}`.trim()} style={style} aria-label={`${profile.displayName} avatar`}>
        <img src={profile.avatarDataUrl} alt="" />
      </div>
    );
  }

  const tiles = buildMosaicTiles(profile.avatarSeed);

  return (
    <div className={`profile-avatar profile-avatar-mosaic ${className}`.trim()} style={style} aria-label={`${profile.displayName} avatar`}>
      {tiles.map((color, index) => (
        <span key={index} style={{ background: color }} />
      ))}
      {showInitials ? <strong>{initialsFromName(profile.displayName)}</strong> : null}
    </div>
  );
}

function buildMosaicTiles(seed: string) {
  const tiles: string[] = [];
  let state = hashSeed(seed);

  for (let row = 0; row < 5; row += 1) {
    const rowColors: string[] = [];
    for (let column = 0; column < 3; column += 1) {
      state = nextRand(state);
      const colorIndex = Math.abs(state) % MOSAIC_COLORS.length;
      rowColors.push(MOSAIC_COLORS[colorIndex]);
    }

    tiles.push(rowColors[0], rowColors[1], rowColors[2], rowColors[1], rowColors[0]);
  }

  return tiles;
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRand(value: number) {
  return (Math.imul(value ^ (value >>> 15), 2246822507) ^ Math.imul(value ^ (value >>> 13), 3266489909)) >>> 0;
}
