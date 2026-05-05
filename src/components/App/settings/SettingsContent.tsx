import './SettingsContent.css';
import { getSettingsSectionMeta } from './settingsData';
import { AccountSection } from './sections/AccountSection';
import { AgentSection } from './sections/AgentSection';
import { KnowledgeSection } from './sections/KnowledgeSection';
import { ProfilesSection } from './sections/ProfilesSection';
import { MCPServersSection } from './sections/MCPServersSection';
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
      ) : sectionMeta.contentKind === 'octo-agent' ? (
        <AgentSection />
      ) : sectionMeta.contentKind === 'knowledge' ? (
        <KnowledgeSection />
      ) : sectionMeta.contentKind === 'profiles' ? (
        <ProfilesSection />
      ) : sectionMeta.contentKind === 'mcp-servers' ? (
        <MCPServersSection />
      ) : (
        <SectionPlaceholder title={sectionMeta.title} description={sectionMeta.description} />
      )}
    </main>
  );
}

