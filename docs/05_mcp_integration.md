# MCP Integration in Octomus (Warp Port)

Documentul de față detaliază arhitectura Model Context Protocol (MCP) din Warp și modul în care aceasta trebuie portată în Octomus Launcher pentru a permite extinderea capacităților agentului prin servere externe (locale sau remote).

## 1. Arhitectura de Backend (Rust)

Warp utilizează o ierarhie clară pentru gestionarea serverelor MCP, localizată în `app/src/ai/mcp/`:

### Componente Cheie:
*   **`TemplatableMCPServer`**: Reprezintă "definiția" unui server. Poate fi un JSON brut sau un template care conține variabile (ex: `{{API_KEY}}`).
*   **`TemplatableMCPServerInstallation`**: O instanță concretă a unui template, unde variabilele au fost completate de utilizator.
*   **`TemplatableMCPServerManager`**: Singleton-ul care gestionează ciclul de viață:
    *   Stocarea instalărilor (SQLite + Secure Storage pentru secrete).
    *   Spawning (pornirea proceselor locale `stdio`).
    *   Connecting (conectarea la endpoint-uri `SSE`).
    *   Tracking de stare (`Running`, `Starting`, `Failed`).
*   **`ReconnectingPeer`**: Un wrapper peste peer-ul `rmcp` care implementează auto-reconectarea transparentă. Dacă un transport se închide în timpul unui apel de tool, peer-ul încearcă reconectarea înainte de a eșua.

### Managementul Transportului:
Warp suportă două moduri principale (definite în `JSONTransportType`):
1.  **`CLIServer`**: Execută o comandă locală (ex: `npx -y @modelcontextprotocol/server-everything`).
2.  **`SSEServer`**: Se conectează la un URL via Server-Sent Events.

---

## 2. Fluxul de Adăugare (`/add-mcp`)

Când utilizatorul scrie `/add-mcp`, se declanșează următorul lanț:

1.  **`SlashCommand`**: `ADD_MCP` dispecerează `TerminalAction::OpenAddMCPPane`.
2.  **`RootView`**: Prinde acțiunea și deschide `MCPServersSettingsPage` cu `item_id: None` (modul "New").
3.  **`MCPServersEditPageView`**: Afișează un editor JSON (`CodeEditorView`).
4.  **Validare & Parsare**:
    *   Warp este permisiv: poți introduce un singur server sau un map de tip Claude Desktop.
    *   `ParsedTemplatableMCPServerResult::from_user_json` normalizează input-ul.
5.  **Detecția Variabilelor**:
    *   Dacă JSON-ul conține `{{variable}}`, se deschide un **Installation Modal**.
    *   Utilizatorul completează valorile (ex: chei API).
6.  **Instalare**: Managerul salvează definiția și pornește serverul.

---

## 3. Logica de "Guiding" (Ghidarea Utilizatorului)

Warp ghidează utilizatorul prin mai multe mecanisme:

### A. Tip-uri în Chat (`AITip`)
În `agent_tips.rs`, există un tip specific pentru MCP:
```rust
AgentTip {
    description: "`/add-mcp` to add an MCP server to your workspace.".to_string(),
    link: Some("https://docs.warp.dev/agent-platform/capabilities/mcp".to_string()),
    kind: AgentTipKind::Mcp,
}
```
Acestea apar aleatoriu sub bulele de chat pentru a educa utilizatorul.

### B. Normalizarea JSON-ului (`parsing.rs`)
Warp ajută utilizatorul acceptând formate variate. Dacă cineva dă paste la o configurare Claude Desktop:
```json
{
  "mcpServers": {
    "sqlite": { "command": "uvx", "args": ["mcp-server-sqlite"] }
  }
}
```
Warp detectează cheia `mcpServers` și extrage automat serverele, în loc să dea eroare de format.

### C. Secrete & Redactare
Înainte de salvare, `find_secrets_in_text` verifică dacă utilizatorul a introdus parole sau chei API direct în JSON-ul de configurare (fără a folosi template-uri) și afișează un avertisment (Toast) sugerând folosirea setărilor de Privacy/Secrets.

---

## 4. Plan de Implementare în Octomus (P1-P2)

### Faza 1: Infrastructura de Bază (Rust)
1.  **Portarea `rmcp` wrapper**: Crearea unui `McpManager` în Tauri care să gestioneze procesele `Child` pentru stdio.
2.  **Stocare**: Folosirea `tauri-plugin-store` sau a bazei de date interne pentru a salva configurațiile JSON.
3.  **ReconnectingPeer**: Implementarea logicii de retry pentru apelurile de tool-uri (esențial pentru reziliența agentului).

### Faza 2: UI-ul de Configurare (React)
1.  **Editor JSON**: Integrarea `Monaco` sau `CodeMirror` într-un pane de setări.
2.  **Modal de Instalare Dinamic**: Un formular generat automat pe baza variabilelor găsite în JSON (Regex: `\{\{([^{}]+)\}\}`).
3.  **Status Badges**: Indicatori vizuali în UI pentru serverele active/inactive.

### Faza 3: Integrarea cu Agentul
1.  **Tool Discovery**: Agentul trebuie să interogheze `McpManager` pentru a obține lista de `Tools` disponibile de la toate serverele active.
2.  **Execution Bridge**: Când LLM-ul cere un tool MCP, `OctomusAgentLoop` trebuie să ruteze cererea către `McpManager`, să aștepte rezultatul și să-l trimită înapoi în conversație.

---

## 5. Locații Fișiere de Referință (Warp)

*   `app/src/ai/mcp/mod.rs`: Structurile de date de bază (`MCPServer`, `TransportType`).
*   `app/src/ai/mcp/manager.rs`: Logica de orchestrator.
*   `app/src/ai/mcp/parsing.rs`: Normalizarea și extragerea variabilelor.
*   `app/src/settings_view/mcp_servers/edit_page.rs`: UI-ul de editare/adăugare.
*   `app/src/ai/agent_tips.rs`: Sistemul de sugestii pasive.
