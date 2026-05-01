type PanelPlaceholderProps = {
  title: string;
  subtitle: string;
};

export function PanelPlaceholder({ title, subtitle }: PanelPlaceholderProps) {
  return (
    <div className="panel-screen">
      <div className="panel-card">
        <div className="panel-kicker">Placeholder</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
