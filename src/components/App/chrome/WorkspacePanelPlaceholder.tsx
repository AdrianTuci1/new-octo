import './WorkspacePanelPlaceholder.css';

type WorkspacePanelPlaceholderProps = {
  title: string;
  description: string;
  eyebrow: string;
};

export function WorkspacePanelPlaceholder({
  title,
  description,
  eyebrow
}: WorkspacePanelPlaceholderProps) {
  return (
    <section className="workspace-placeholder">
      <div className="workspace-placeholder-card">
        <div className="workspace-placeholder-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="workspace-placeholder-grid">
        <div className="workspace-placeholder-tile">
          <div className="workspace-placeholder-tile-title">Primary action</div>
          <div className="workspace-placeholder-tile-text">This panel can become interactive later without changing the chrome.</div>
        </div>
        <div className="workspace-placeholder-tile">
          <div className="workspace-placeholder-tile-title">Secondary action</div>
          <div className="workspace-placeholder-tile-text">The layout already supports another module or split pane.</div>
        </div>
      </div>
    </section>
  );
}

