import { invoke } from '@tauri-apps/api/core';
import './Onboarding.css';

interface OnboardingProps {
  onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const handleSignIn = () => {
    // Auth Exchange Flow:
    // 1. Open browser to auth provider (e.g. https://auth.warp.dev/...)
    // 2. User signs in on the web.
    // 3. Browser redirects back to the app via custom protocol (e.g. octomus://auth?token=...)
    // 4. Tauri app handles the protocol and updates the store.

    console.log('Redirecting to sign in...');
    // For now, simulate completion
    void invoke('complete_onboarding');
    onComplete();
  };

  const handleSkip = () => {
    void invoke('complete_onboarding');
    onComplete();
  };

  return (
    <div className="onboarding-main">
      <div className="onboarding-card">
        <div className="onboarding-logo-container">
          <div className="onboarding-logo">
            <div className="logo-card logo-card-1" />
            <div className="logo-card logo-card-2" />
          </div>
        </div>

        <h1 className="onboarding-title">Welcome to Octomus!</h1>

        <button className="onboarding-btn-primary" onClick={handleSignIn}>
          Sign up
        </button>

        <div className="onboarding-links">
          <div className="onboarding-link-text">
            Already have an account? <span className="onboarding-link" onClick={handleSignIn}>Sign in</span>
          </div>
          <div className="onboarding-link-text">
            Don't want to sign in right now? <span className="onboarding-link" onClick={handleSkip}>Skip for now</span>
          </div>
        </div>

        <div className="onboarding-footer">
          By continuing, you agree to Octomus's <span className="onboarding-link">Terms of Service</span>
          <br />
          If you'd like to opt out of analytics and AI features, you can adjust your <span className="onboarding-link">Privacy Settings</span>
        </div>
      </div>
    </div>
  );
};
