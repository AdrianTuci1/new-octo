import './SettingsContent.css';
import { getSettingsSectionMeta } from './settingsData';
import { AccountSection } from './sections/AccountSection';
import { AgentSection } from './sections/AgentSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { KnowledgeSection } from './sections/KnowledgeSection';
import { KeyboardShortcutsSection } from './sections/KeyboardShortcutsSection';
import { ProfilesSection } from './sections/ProfilesSection';
import { MCPServersSection } from './sections/MCPServersSection';
import { ThirdPartyCliAgentsSection } from './sections/ThirdPartyCliAgentsSection';
import { CloudTerminalsSection } from './sections/CloudTerminalsSection';
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
      ) : sectionMeta.contentKind === 'appearance' ? (
        <AppearanceSection />
      ) : sectionMeta.contentKind === 'knowledge' ? (
        <KnowledgeSection />
      ) : sectionMeta.contentKind === 'keyboard-shortcuts' ? (
        <KeyboardShortcutsSection />
      ) : sectionMeta.contentKind === 'profiles' ? (
        <ProfilesSection />
      ) : sectionMeta.contentKind === 'mcp-servers' ? (
        <MCPServersSection />
      ) : sectionMeta.contentKind === 'third-party-cli-agents' ? (
        <ThirdPartyCliAgentsSection />
      ) : sectionMeta.contentKind === 'cloud-terminals' ? (
        <CloudTerminalsSection />
      ) : (
        <SectionPlaceholder title={sectionMeta.title} description={sectionMeta.description} />
      )}
    </main>
  );
}
