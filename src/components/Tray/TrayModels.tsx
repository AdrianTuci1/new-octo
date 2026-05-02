import './TrayModels.css';
import type { ModelSpec } from '../../types/model';

type ModelTrayTab = 'all' | 'saved';

type TrayModelsProps = {
  models: ModelSpec[];
  activeTab: ModelTrayTab;
  selectedIndex: number;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  onTabChange: (tab: ModelTrayTab) => void;
};

function Meter({ value }: { value: number }) {
  return (
    <div className="tray-model-meter">
      <div className="tray-model-meter-fill" style={{ width: `${value}%` }} />
    </div>
  );
}

export function TrayModels({
  models,
  activeTab,
  selectedIndex,
  selectedModelId,
  onSelectModel,
  onTabChange
}: TrayModelsProps) {
  if (models.length === 0) {
    return (
      <section className="tray-pane tray-models" aria-label="Model selector">
        <div className="tray-pane-placeholder">
          <p>No models available.</p>
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
          <h3>Model Specs</h3>
          <p>
            Compare model quality, speed, and relative cost inside the current Octomus workflow.
          </p>

          <div className="tray-model-spec-row">
            <span>Intelligence</span>
            <Meter value={selectedModel.intelligence} />
          </div>
          <div className="tray-model-spec-row">
            <span>Speed</span>
            <Meter value={selectedModel.speed} />
          </div>
          <div className="tray-model-spec-row">
            <span>Cost</span>
            <Meter value={selectedModel.cost} />
          </div>

          <div className="tray-model-meta">
            <span>{selectedModel.provider}</span>
            <p>{selectedModel.note ?? 'No extra notes available for this model.'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
