import React, { useState } from 'react';
import { Search, Plus, Terminal } from 'lucide-react';
import { useMemoryStore } from '../../../../stores';
import { buildAgentSettingsValues, normalizeAgentSettings } from '../agentSettings';

import datadogIcon from '../../../../../assets/mcps/datadog.png';
import notionIcon from '../../../../../assets/mcps/notion.png';
import githubIcon from '../../../../../assets/mcps/github.png';
import playwrightIcon from '../../../../../assets/mcps/playwright.png';

interface MCPServer {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  isDetected?: boolean;
}

function SettingsToggle({ checked = false, onChange }: { checked?: boolean, onChange?: () => void }) {
  return (
    <button
      className={`settings-toggle ${checked ? 'active' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

const INITIAL_SHARED_SERVERS: MCPServer[] = [
  { 
    id: 'datadog', 
    name: 'Datadog', 
    description: 'Monitor and analyze application performance.', 
    icon: <img src={datadogIcon} alt="Datadog" className="mcp-icon-img" />, 
  },
  { 
    id: 'notion', 
    name: 'Notion', 
    description: 'Read and write to Notion pages and databases.', 
    icon: <img src={notionIcon} alt="Notion" className="mcp-icon-img" />, 
  },
  { 
    id: 'github', 
    name: 'GitHub', 
    description: 'Manage issues, projects and code.', 
    icon: <img src={githubIcon} alt="GitHub" className="mcp-icon-img" />, 
  },
  { 
    id: 'playwright', 
    name: 'Playwright', 
    description: 'Automate browser testing and web scraping.', 
    icon: <img src={playwrightIcon} alt="Playwright" className="mcp-icon-img" />, 
  },
];

const DETECTED_SERVERS: MCPServer[] = [
  { 
    id: 'local-tool', 
    name: 'Local Shell Tools', 
    description: 'Auto-detected local terminal utilities and scripts.', 
    icon: <Terminal size={18} />, 
    isDetected: true
  }
];

export function MCPServersSection() {
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const agentSettings = normalizeAgentSettings(settings?.values);
  const [searchQuery, setSearchQuery] = useState('');
  const customServers: MCPServer[] = agentSettings.mcp.customServers.map((server) => ({
    ...server,
    icon: <div className="mcp-icon-circle" style={{ background: '#164e63', color: 'white' }}>{server.name[0]?.toUpperCase() ?? 'C'}</div>
  }));
  const servers = [...INITIAL_SHARED_SERVERS, ...customServers];
  const allServers = [...servers, ...DETECTED_SERVERS];

  const toggleServer = (id: string) => {
    const enabledServerIds = agentSettings.mcp.enabledServerIds.includes(id)
      ? agentSettings.mcp.enabledServerIds.filter((serverId) => serverId !== id)
      : [...agentSettings.mcp.enabledServerIds, id];

    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      mcp: {
        ...agentSettings.mcp,
        enabledServerIds
      }
    }), true);
  };

  const toggleAutoSpawn = () => {
    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      mcp: {
        ...agentSettings.mcp,
        autoSpawnFromThirdPartyAgents: !agentSettings.mcp.autoSpawnFromThirdPartyAgents
      }
    }), true);
  };

  const addCustomServer = () => {
    const nextIndex = agentSettings.mcp.customServers.length + 1;
    const nextServer = {
      id: `custom_${Date.now()}`,
      name: `Custom MCP ${nextIndex}`,
      description: 'Custom server configured locally.'
    };

    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      mcp: {
        ...agentSettings.mcp,
        customServers: [...agentSettings.mcp.customServers, nextServer],
        enabledServerIds: [...agentSettings.mcp.enabledServerIds, nextServer.id]
      }
    }), true);
  };

  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (server: MCPServer) => !query || `${server.name} ${server.description}`.toLowerCase().includes(query);
  const activeServers = allServers.filter((server) => agentSettings.mcp.enabledServerIds.includes(server.id) && matchesSearch(server));
  const availableServers = servers.filter((server) => !agentSettings.mcp.enabledServerIds.includes(server.id) && matchesSearch(server));
  const detectedServers = DETECTED_SERVERS.filter((server) => !agentSettings.mcp.enabledServerIds.includes(server.id) && matchesSearch(server));

  return (
    <section className="settings-panel mcp-servers-section">
      <div className="settings-panel-header">
        <h1>MCP Servers</h1>
        <p className="settings-panel-description">
          Add MCP servers to extend the Octo Agent's capabilities. MCP servers expose data sources or tools to agents through a standardized interface, essentially acting like plugins. Add a custom server, or use the presets to get started with popular servers. You can also find team servers that have been shared with you here. <button className="settings-link-inline">Learn more.</button>
        </p>
      </div>

      <div className="mcp-search-bar">
        <div className="mcp-search-input-wrapper">
          <Search size={14} className="mcp-search-icon" />
          <input 
            type="text" 
            placeholder="Search MCP Servers" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="mcp-add-button" type="button" onClick={addCustomServer}>
          <Plus size={16} />
          <span>Add</span>
        </button>
      </div>

      <div className="mcp-settings-row">
        <div className="mcp-settings-info">
          <div className="mcp-settings-title">Auto-spawn servers from third-party agents</div>
          <div className="mcp-settings-description">
            Automatically detect and spawn MCP servers from globally-scoped third-party AI agent configuration files (e.g. in your home directory). Servers detected inside a repository are never spawned automatically and must be enabled individually in the "Detected from" sections below. <button className="settings-link-inline">See supported providers.</button>
          </div>
        </div>
        <div className="mcp-settings-action">
          <SettingsToggle checked={agentSettings.mcp.autoSpawnFromThirdPartyAgents} onChange={toggleAutoSpawn} />
        </div>
      </div>

      {activeServers.length > 0 && (
        <div className="mcp-group">
          <h3 className="mcp-group-title">MY MCPS</h3>
          <div className="mcp-list">
            {activeServers.map(server => (
              <div key={server.id} className="mcp-card active">
                <div className="mcp-card-icon-wrapper">
                  <div className="mcp-card-icon">
                    {server.icon}
                  </div>
                  <div className="mcp-status-dot" />
                </div>
                <div className="mcp-card-content">
                  <div className="mcp-card-header">
                    <span className="mcp-card-name">{server.name}</span>
                  </div>
                  <div className="mcp-card-description">{server.description}</div>
                  <div className="mcp-card-status">Offline</div>
                </div>
                <div className="mcp-card-action">
                  <SettingsToggle checked={true} onChange={() => toggleServer(server.id)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mcp-group">
        <h3 className="mcp-group-title">SHARED FROM OCTOMUS</h3>
        <div className="mcp-list">
          {availableServers.map(server => (
            <div key={server.id} className="mcp-card">
              <div className="mcp-card-icon-wrapper">
                <div className="mcp-card-icon">
                  {server.icon}
                </div>
              </div>
              <div className="mcp-card-content">
                <div className="mcp-card-name">{server.name}</div>
                <div className="mcp-card-description">{server.description}</div>
              </div>
              <div className="mcp-card-action">
                <button className="mcp-plus-button" onClick={() => toggleServer(server.id)}>
                  <Plus size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mcp-group">
        <h3 className="mcp-group-title">DETECTED FROM OCTOMUS</h3>
        <div className="mcp-list">
          {detectedServers.map(server => (
            <div key={server.id} className="mcp-card">
              <div className="mcp-card-icon-wrapper">
                <div className="mcp-card-icon">
                  {server.icon}
                </div>
              </div>
              <div className="mcp-card-content">
                <div className="mcp-card-name">{server.name}</div>
                <div className="mcp-card-description">{server.description}</div>
              </div>
              <div className="mcp-card-action">
                <button className="mcp-plus-button" onClick={() => toggleServer(server.id)}>
                  <Plus size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
