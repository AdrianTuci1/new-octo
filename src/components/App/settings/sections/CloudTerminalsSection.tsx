import { Plus } from 'lucide-react';
import { useUIStore } from '../../../../stores';
import { cloudConnectionMethodLabels, defaultCloudProfiles } from '../cloudProfiles';

export function CloudTerminalsSection() {
  const setIsCloudProfileDrawerOpen = useUIStore((state) => state.setIsCloudProfileDrawerOpen);
  const setSelectedCloudProfileIdForEdit = useUIStore((state) => state.setSelectedCloudProfileIdForEdit);

  const openCloudProfileDrawer = (profileId: string | null) => {
    setSelectedCloudProfileIdForEdit(profileId);
    setIsCloudProfileDrawerOpen(true);
  };

  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h1>Cloud</h1>
      </div>

      <p className="settings-panel-description">
        Configure cloud profiles for Custom VM and Modal runtimes, then open the drawer to define bootstrap SSH access and provider auth.
      </p>

      <div className="settings-group">
        <div className="settings-section-header">
          <h2 className="settings-section-title">Profiles</h2>
        </div>

        <div className="settings-models-list">
          {defaultCloudProfiles.map((profile) => (
            <div
              key={profile.id}
              className="settings-model-card"
              onClick={() => openCloudProfileDrawer(profile.id)}
            >
              <div className="settings-model-card-info">
                <div className="settings-model-card-name">{profile.title}</div>
                <div className="settings-model-card-provider">
                  {profile.provider === 'custom-vm' ? 'Custom VM' : 'Modal'}
                  {profile.connectionMethod ? ` · ${cloudConnectionMethodLabels[profile.connectionMethod]}` : ''}
                </div>
              </div>
              <div className={`settings-model-card-status ${profile.status === 'Ready' ? 'active' : ''}`}>
                {profile.status}
              </div>
            </div>
          ))}

          <button className="settings-add-model-btn" type="button" onClick={() => openCloudProfileDrawer(null)}>
            <div className="add-icon-wrapper">
              <Plus size={16} />
            </div>
            <span>Add cloud profile</span>
          </button>
        </div>
      </div>
    </section>
  );
}
