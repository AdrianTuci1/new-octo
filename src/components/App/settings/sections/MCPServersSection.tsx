import React, { useState } from 'react';
import { Search, Plus, Github, Terminal } from 'lucide-react';

interface MCPServer {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  isActive: boolean;
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
    icon: <div className="mcp-icon-circle" style={{ background: '#632CA6', color: 'white' }}>D</div>, 
    isActive: false 
  },
  { 
    id: 'notion', 
    name: 'Notion', 
    description: 'Read and write to Notion pages and databases.', 
    icon: <div className="mcp-icon-circle" style={{ background: '#ffffff', color: '#000000' }}>N</div>, 
    isActive: false 
  },
  { 
    id: 'github', 
    name: 'GitHub', 
    description: 'Manage issues, projects and code.', 
    icon: <Github size={18} />, 
    isActive: false 
  },
  { 
    id: 'playwright', 
    name: 'Playwright', 
    description: 'Automate browser testing and web scraping.', 
    icon: <div className="mcp-icon-circle" style={{ background: '#2EAD33', color: 'white' }}>P</div>, 
    isActive: false 
  },
];

const DETECTED_SERVERS: MCPServer[] = [
  { 
    id: 'local-tool', 
    name: 'Local Shell Tools', 
    description: 'Auto-detected local terminal utilities and scripts.', 
    icon: <Terminal size={18} />, 
    isActive: false,
    isDetected: true
  }
];

export function MCPServersSection() {
  const [servers, setServers] = useState<MCPServer[]>(INITIAL_SHARED_SERVERS);
  const [autoSpawn, setAutoSpawn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleServer = (id: string) => {
    setServers(prev => prev.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s));
  };

  const activeServers = servers.filter(s => s.isActive);
  const availableServers = servers.filter(s => !s.isActive);

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
        <button className="mcp-add-button">
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
          <SettingsToggle checked={autoSpawn} onChange={() => setAutoSpawn(!autoSpawn)} />
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
          {DETECTED_SERVERS.map(server => (
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
                <button className="mcp-plus-button">
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
