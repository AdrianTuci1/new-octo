import React from 'react';
import './ModelManagementDrawer.css';
import { X, Globe, Cpu, Key, Trash2 } from 'lucide-react';
import { useUIStore } from '../../../stores';

export function ModelManagementDrawer() {
  const setIsModelDrawerOpen = useUIStore((state) => state.setIsModelDrawerOpen);

  return (
    <div className="model-mgmt-drawer">
      <header className="model-mgmt-header">
        <div className="header-left">
          <h2 className="header-title">Add new model</h2>
        </div>
        <button className="close-btn" onClick={() => setIsModelDrawerOpen(false)}>
          <X size={18} />
        </button>
      </header>

      <div className="model-mgmt-content">
        <div className="form-group">
          <label>Provider</label>
          <div className="select-wrapper">
            <select>
              <option>OpenAI</option>
              <option>Anthropic</option>
              <option>Google Gemini</option>
              <option>Ollama (Local)</option>
              <option>OpenRouter</option>
              <option>Custom (OpenAI Compatible)</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Model ID</label>
          <input type="text" placeholder="e.g. gpt-4o-mini" />
        </div>

        <div className="form-group">
          <label>Base URL (Optional)</label>
          <input type="text" placeholder="https://api.openai.com/v1" />
        </div>

        <div className="form-group">
          <label>API Key</label>
          <div className="input-with-icon">
            <Key size={14} className="input-icon" />
            <input type="password" placeholder="sk-..." />
          </div>
        </div>

        <div className="form-group">
          <label>Friendly Name</label>
          <input type="text" placeholder="My Work GPT" />
        </div>

        <div className="model-mgmt-danger-zone">
          <button className="btn-delete">
            <Trash2 size={14} />
            <span>Delete Model</span>
          </button>
        </div>
      </div>
    </div>
  );
}
