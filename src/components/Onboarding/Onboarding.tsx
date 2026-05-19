import { invoke } from '@tauri-apps/api/core';
import type { FC } from 'react';
import { ProfileAvatar } from '../App/profile/ProfileAvatar';
import { useProfileSettings } from '../App/settings/useProfileSettings';
import './Onboarding.css';

interface OnboardingProps {
  onComplete: () => void;
}

export const Onboarding: FC<OnboardingProps> = ({ onComplete }) => {
  const { profile } = useProfileSettings();

  const handleContinue = () => {
    void invoke('complete_onboarding');
    onComplete();
  };

  return (
    <div className="onboarding-main">
      <div className="onboarding-card">
        <div className="onboarding-logo-container">
          <ProfileAvatar profile={profile} size={64} />
        </div>

        <h1 className="onboarding-title">Welcome to Octomus</h1>
        <p className="onboarding-copy">
          Your local profile is ready. Octomus generated a mosaic avatar for this workspace; you can rename it or upload a photo later in Profile settings.
        </p>

        <button className="onboarding-btn-primary" onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
};
