/// MCP servers settings section state.
///
/// Mirrors the React `MCPServersSection` component.
#[derive(Debug, Clone)]
pub struct McpServerSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub transport: McpTransport,
    pub status: McpServerStatus,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env_keys: Vec<String>,
    pub header_keys: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpTransport {
    Cli,
    Sse,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpServerStatus {
    Configured,
    Disabled,
}

#[derive(Debug, Clone)]
pub struct McpServersSettings {
    pub servers: Vec<McpServerSummary>,
    pub auto_spawn_from_third_party_agents: bool,
    pub search_query: String,
}

impl Default for McpServersSettings {
    fn default() -> Self {
        Self {
            servers: Vec::new(),
            auto_spawn_from_third_party_agents: false,
            search_query: String::new(),
        }
    }
}

impl McpServersSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn filtered_servers(&self) -> Vec<&McpServerSummary> {
        let query = self.search_query.trim().to_lowercase();
        if query.is_empty() {
            return self.servers.iter().collect();
        }
        self.servers
            .iter()
            .filter(|s| {
                s.name.to_lowercase().contains(&query)
                    || s.description.to_lowercase().contains(&query)
                    || s.command.as_ref().map(|c| c.to_lowercase().contains(&query)).unwrap_or(false)
                    || s.url.as_ref().map(|u| u.to_lowercase().contains(&query)).unwrap_or(false)
            })
            .collect()
    }

    pub fn toggle_server_status(&mut self, id: &str) -> Option<&McpServerSummary> {
        let server = self.servers.iter_mut().find(|s| s.id == id)?;
        server.status = match server.status {
            McpServerStatus::Configured => McpServerStatus::Disabled,
            McpServerStatus::Disabled => McpServerStatus::Configured,
        };
        Some(self.servers.iter().find(|s| s.id == id).unwrap())
    }
}
