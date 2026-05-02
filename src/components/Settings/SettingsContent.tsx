import './SettingsContent.css';
import { getSettingsSectionMeta } from './settingsData';
import { AccountSection } from './sections/AccountSection';
import { SectionPlaceholder } from './sections/SectionPlaceholder';

type SettingsContentProps = {
  sectionId: string;
};

export function SettingsContent({ sectionId }: SettingsContentProps) {
  const sectionMeta = getSettingsSectionMeta(sectionId);

  return (
    <main className="settings-content">

      {sectionMeta.contentKind === 'account' ? (
        <AccountSection />
      ) : (
        <SectionPlaceholder title={sectionMeta.title} description={sectionMeta.description} />
      )}
    </main>
  );
}

