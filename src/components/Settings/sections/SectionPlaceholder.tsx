export function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h1>{title}</h1>
      </div>

      <div className="settings-placeholder-grid">
        <div className="settings-placeholder-card">
          <div className="settings-placeholder-label">Overview</div>
          <div className="settings-placeholder-title">This module is ready for expansion</div>
          <div className="settings-placeholder-text">
            We can split this section into its own route, nested cards, or a dedicated editor when the
            feature becomes real.
          </div>
        </div>

        <div className="settings-placeholder-card">
          <div className="settings-placeholder-label">Structure</div>
          <div className="settings-placeholder-title">Extensible by design</div>
          <div className="settings-placeholder-text">
            Each settings leaf can now be backed by a separate component without touching the launcher.
          </div>
        </div>
      </div>
    </section>
  );
}

