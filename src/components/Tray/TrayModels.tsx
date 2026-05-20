import './TrayModels.css';
import type { ModelSpec } from '../../types/model';

type ModelTrayTab = 'all' | 'saved';

type TrayModelsProps = {
  models: ModelSpec[];
  activeTab: ModelTrayTab;
  selectedIndex: number;
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  onTabChange: (tab: ModelTrayTab) => void;
  onOpenModelSettings?: () => void;
};

export function TrayModels({
  models,
  activeTab,
  selectedIndex,
  selectedModelId,
  onSelectModel,
  onTabChange,
  onOpenModelSettings
}: TrayModelsProps) {
  if (models.length === 0) {
    return (
      <section className="tray-pane tray-models" aria-label="Model selector">
        <div className="tray-pane-placeholder tray-models-empty">
          <p>You don't have any model.</p>
          {onOpenModelSettings && (
            <button className="tray-models-empty-action" type="button" onClick={onOpenModelSettings}>
              Open model settings
            </button>
          )}
        </div>
      </section>
    );
  }

  const selectedModel = models[selectedIndex] ?? models[0];

  return (
    <section className="tray-pane tray-models" aria-label="Model selector">
      <div className="tray-models-tabs">
        <button
          className={`tray-models-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => onTabChange('all')}
          type="button"
        >
          All
        </button>
        <button
          className={`tray-models-tab ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => onTabChange('saved')}
          type="button"
        >
          Saved
        </button>
      </div>

      <div className="tray-models-grid">
        <div className="tray-models-list">
          {models.map((model, index) => (
            <button
              key={model.id}
              className={`tray-model-row ${selectedIndex === index ? 'active' : ''}`}
              onClick={() => onSelectModel(model.id)}
              type="button"
            >
              <span className="tray-model-label">{model.label}</span>
              {model.id === selectedModelId && (
                <span className="tray-model-selected">(selected)</span>
              )}
            </button>
          ))}
        </div>

        <div className="tray-models-specs">
          <h3>Configured model</h3>
          <p>
            This is the provider stored on this device and used by the launcher.
          </p>

          <div className="tray-model-detail">
            <span>Provider</span>
            <strong>{selectedModel.provider}</strong>
          </div>
          <div className="tray-model-detail">
            <span>Model ID</span>
            <strong>{selectedModel.modelId ?? selectedModel.id}</strong>
          </div>
          {selectedModel.baseUrl && (
            <div className="tray-model-detail">
              <span>Base URL</span>
              <strong>{selectedModel.baseUrl}</strong>
            </div>
          )}

          <div className="tray-model-meta">
            <span>{selectedModel.label}</span>
            <p>{selectedModel.note ?? 'Configured locally on this device.'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
