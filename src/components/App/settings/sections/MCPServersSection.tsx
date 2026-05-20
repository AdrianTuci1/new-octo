import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, Plus, Search, Trash2, Terminal } from 'lucide-react';
import { useMemoryStore } from '../../../../stores';
import { buildAgentSettingsValues, normalizeAgentSettings } from '../agentSettings';

import datadogIcon from '../../../../../assets/mcps/datadog.png';
import notionIcon from '../../../../../assets/mcps/notion.png';
import githubIcon from '../../../../../assets/mcps/github.png';
import playwrightIcon from '../../../../../assets/mcps/playwright.png';

type McpTransport = 'cli' | 'sse';

type McpServerSummary = {
  id: string;
  name: string;
  description: string;
  transport: McpTransport;
  status: 'configured' | 'disabled';
  command?: string | null;
  args: string[];
  url?: string | null;
  envKeys: string[];
  headerKeys: string[];
  source: string;
};

type McpFormState = {
  name: string;
  description: string;
  transport: McpTransport;
  command: string;
  argsText: string;
  url: string;
  envText: string;
  headersText: string;
};

interface MCPPreset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  transport: McpTransport;
  command: string;
  args: string[];
  envText: string;
  url?: string;
  headersText?: string;
  note?: string;
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

const PRESET_SERVERS: MCPPreset[] = [
  {
    id: 'datadog',
    name: 'Datadog',
    description: 'Monitor and analyze application performance.',
    icon: <img src={datadogIcon} alt="Datadog" className="mcp-icon-img" />,
    transport: 'cli',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp?toolsets=core'],
    envText: '',
    headersText: 'DD_API_KEY=\nDD_APPLICATION_KEY=',
    note: 'Uses Datadog remote MCP through mcp-remote for OAuth. For headless API-key auth, switch to HTTP and keep the headers.'
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and write to Notion pages and databases.',
    icon: <img src={notionIcon} alt="Notion" className="mcp-icon-img" />,
    transport: 'cli',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.notion.com/mcp'],
    envText: '',
    url: 'https://mcp.notion.com/mcp',
    note: 'Uses Notion hosted MCP through mcp-remote so OAuth is handled in the browser.'
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Manage issues, projects and code.',
    icon: <img src={githubIcon} alt="GitHub" className="mcp-icon-img" />,
    transport: 'cli',
    command: 'docker',
    args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
    envText: 'GITHUB_PERSONAL_ACCESS_TOKEN=',
    note: 'Uses GitHub’s official local MCP server image. Docker must be running, and the token should be scoped to what agents may access.'
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Automate browser testing and web scraping.',
    icon: <img src={playwrightIcon} alt="Playwright" className="mcp-icon-img" />,
    transport: 'cli',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    envText: ''
  }
];

const EMPTY_FORM: McpFormState = {
  name: '',
  description: '',
  transport: 'cli',
  command: '',
  argsText: '',
  url: '',
  envText: '',
  headersText: ''
};

function parseEnvText(input: string) {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce<Record<string, string>>((env, line) => {
      const [key, ...valueParts] = line.split('=');
      const normalizedKey = key?.trim();
      if (!normalizedKey) return env;
      env[normalizedKey] = valueParts.join('=').trim();
      return env;
    }, {});
}

function envTextFromKeys(keys: string[]) {
  return keys.map((key) => `${key}=`).join('\n');
}

function argsFromText(input: string) {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function serverIcon(server: McpServerSummary) {
  return (
    <div className="mcp-icon-circle">
      {server.transport === 'cli' ? <Terminal size={16} /> : server.name[0]?.toUpperCase() ?? 'M'}
    </div>
  );
}

export function MCPServersSection() {
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const agentSettings = normalizeAgentSettings(settings?.values);
  const [searchQuery, setSearchQuery] = useState('');
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<McpFormState>(EMPTY_FORM);

  const loadServers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const nextServers = await invoke<McpServerSummary[]>('mcp_list_servers');
      setServers(nextServers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const toggleAutoSpawn = () => {
    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      mcp: {
        ...agentSettings.mcp,
        autoSpawnFromThirdPartyAgents: !agentSettings.mcp.autoSpawnFromThirdPartyAgents
      }
    }), true);
  };

  const openAddForm = (preset?: MCPPreset) => {
    setEditingId(null);
    setError('');
    setForm(preset
      ? {
          name: preset.name,
          description: preset.description,
          transport: preset.transport,
          command: preset.command,
          argsText: preset.args.join('\n'),
          url: preset.url ?? '',
          envText: preset.envText,
          headersText: preset.headersText ?? ''
        }
      : EMPTY_FORM);
  };

  const editServer = (server: McpServerSummary) => {
    setEditingId(server.id);
    setError('');
    setForm({
      name: server.name,
      description: server.description,
      transport: server.transport,
      command: server.command ?? '',
      argsText: server.args.join('\n'),
      url: server.url ?? '',
      envText: envTextFromKeys(server.envKeys),
      headersText: envTextFromKeys(server.headerKeys)
    });
  };

  const saveServer = async () => {
    setIsSaving(true);
    setError('');
    try {
      await invoke<McpServerSummary>('mcp_upsert_server', {
        request: {
          id: editingId,
          name: form.name,
          description: form.description,
          transport: form.transport,
          command: form.transport === 'cli' ? form.command : null,
          args: form.transport === 'cli' ? argsFromText(form.argsText) : [],
          url: form.transport === 'sse' ? form.url : null,
          env: form.transport === 'cli' ? parseEnvText(form.envText) : {},
          headers: form.transport === 'sse' ? parseEnvText(form.headersText) : {},
          disabled: false
        }
      });
      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleServer = async (server: McpServerSummary) => {
    setError('');
    try {
      await invoke<McpServerSummary>('mcp_upsert_server', {
        request: {
          id: server.id,
          name: server.name,
          description: server.description,
          transport: server.transport,
          command: server.command ?? null,
          args: server.args,
          url: server.url ?? null,
          env: {},
          headers: {},
          disabled: server.status !== 'disabled'
        }
      });
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeServer = async (serverId: string) => {
    setError('');
    try {
      await invoke('mcp_remove_server', { request: { id: serverId } });
      if (editingId === serverId) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      await loadServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (text: string) => !query || text.toLowerCase().includes(query);
  const configuredServers = useMemo(
    () => servers.filter((server) => matchesSearch(`${server.name} ${server.description} ${server.command ?? ''} ${server.url ?? ''}`)),
    [query, servers]
  );
  const availablePresets = PRESET_SERVERS.filter(
    (preset) => !servers.some((server) => server.name.toLowerCase() === preset.name.toLowerCase()) && matchesSearch(`${preset.name} ${preset.description}`)
  );
  const hasOpenForm = Boolean(form.name || form.command || form.url || form.argsText || form.envText || form.headersText || form.description);

  return (
    <section className="settings-panel mcp-servers-section">
      <div className="settings-panel-header">
        <h1>MCP Servers</h1>
        <p className="settings-panel-description">
          Add MCP servers to extend the Octo Agent's capabilities. Servers are saved in your local Octomus MCP config and can be launched by the agent harness when the active profile allows MCP tools.
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
        <button className="mcp-add-button" type="button" onClick={() => openAddForm()}>
          <Plus size={16} />
          <span>Add</span>
        </button>
      </div>

      <div className="mcp-settings-row">
        <div className="mcp-settings-info">
          <div className="mcp-settings-title">Auto-spawn servers from third-party agents</div>
          <div className="mcp-settings-description">
            Automatically detect MCP servers from globally-scoped third-party AI agent configuration files. Repository-local servers stay opt-in.
          </div>
        </div>
        <div className="mcp-settings-action">
          <SettingsToggle checked={agentSettings.mcp.autoSpawnFromThirdPartyAgents} onChange={toggleAutoSpawn} />
        </div>
      </div>

      {error && <div className="mcp-inline-error">{error}</div>}

      {hasOpenForm && (
        <div className="mcp-config-form">
          <div className="mcp-form-grid">
            <label>
              <span>Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="GitHub" />
            </label>
            <label>
              <span>Transport</span>
              <select value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value as McpTransport })}>
                <option value="cli">CLI / stdio</option>
                <option value="sse">Remote HTTP / SSE</option>
              </select>
            </label>
            <label className="mcp-form-wide">
              <span>Description</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tools and context exposed by this MCP server." />
            </label>
            {form.transport === 'cli' ? (
              <>
                <label>
                  <span>Command</span>
                  <input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="npx" />
                </label>
                <label>
                  <span>Arguments</span>
                  <textarea value={form.argsText} onChange={(e) => setForm({ ...form, argsText: e.target.value })} placeholder="-y&#10;@modelcontextprotocol/server-github" />
                </label>
                <label className="mcp-form-wide">
                  <span>Environment</span>
                  <textarea value={form.envText} onChange={(e) => setForm({ ...form, envText: e.target.value })} placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=" />
                </label>
              </>
            ) : (
              <>
                <label className="mcp-form-wide">
                  <span>URL</span>
                  <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/mcp" />
                </label>
                <label className="mcp-form-wide">
                  <span>Headers</span>
                  <textarea value={form.headersText} onChange={(e) => setForm({ ...form, headersText: e.target.value })} placeholder="Authorization=Bearer ..." />
                </label>
              </>
            )}
          </div>
          <div className="mcp-form-actions">
            <button type="button" className="mcp-secondary-button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
              Cancel
            </button>
            <button type="button" className="mcp-primary-button" onClick={saveServer} disabled={isSaving}>
              <Check size={15} />
              <span>{isSaving ? 'Saving' : editingId ? 'Update server' : 'Add server'}</span>
            </button>
          </div>
        </div>
      )}

      <div className="mcp-group">
        <h3 className="mcp-group-title">MY MCPS</h3>
        <div className="mcp-list">
          {isLoading && <div className="mcp-empty-state">Loading MCP servers...</div>}
          {!isLoading && configuredServers.length === 0 && <div className="mcp-empty-state">No MCP servers configured yet.</div>}
          {configuredServers.map((server) => (
            <div key={server.id} className={`mcp-card ${server.status === 'configured' ? 'active' : ''}`}>
              <div className="mcp-card-icon-wrapper">
                <div className="mcp-card-icon">{serverIcon(server)}</div>
                <div className="mcp-status-dot" />
              </div>
              <button type="button" className="mcp-card-content mcp-card-content-button" onClick={() => editServer(server)}>
                <div className="mcp-card-header">
                  <span className="mcp-card-name">{server.name}</span>
                  <span className="mcp-transport-chip">{server.transport === 'cli' ? 'CLI' : 'HTTP'}</span>
                </div>
                <div className="mcp-card-description">{server.description}</div>
                <div className="mcp-card-status">
                  {server.status === 'configured' ? 'Configured' : 'Disabled'}
                  {server.envKeys.length > 0 ? ` · env: ${server.envKeys.join(', ')}` : ''}
                  {server.headerKeys.length > 0 ? ` · headers: ${server.headerKeys.join(', ')}` : ''}
                </div>
              </button>
              <div className="mcp-card-action mcp-card-actions">
                <SettingsToggle checked={server.status === 'configured'} onChange={() => void toggleServer(server)} />
                <button className="mcp-plus-button" type="button" onClick={() => void removeServer(server.id)} aria-label={`Remove ${server.name}`}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mcp-group">
        <h3 className="mcp-group-title">PRESETS</h3>
        <div className="mcp-list">
          {availablePresets.map((preset) => (
            <div key={preset.id} className="mcp-card">
              <div className="mcp-card-icon-wrapper">
                <div className="mcp-card-icon">{preset.icon}</div>
              </div>
              <div className="mcp-card-content">
                <div className="mcp-card-name">{preset.name}</div>
                <div className="mcp-card-description">{preset.description}</div>
                {preset.note && <div className="mcp-card-status">{preset.note}</div>}
              </div>
              <div className="mcp-card-action">
                <button className="mcp-plus-button" type="button" onClick={() => openAddForm(preset)} aria-label={`Configure ${preset.name}`}>
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
