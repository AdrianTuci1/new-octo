# Settings UI & Navigation Architecture

> Reverse-engineered din Warp: `settings_view/` (~2.4M bytes).
> Adaptat pentru Octomus: Tauri v2 + React + Lucide Icons.

---

## 1. Structura Navigării (Sidebar)

Warp folosește un sidebar modular care suportă pagini directe și "Umbrele" (grupuri expandabile).

### 1.1 Modele de Navigare (`nav.rs`)

```rust
pub enum SettingsNavItem {
    Page(SettingsSection),      // Pagina directă (ex: About, Account)
    Umbrella(SettingsUmbrella),  // Grup expandabil (ex: Agents, Code)
}

pub struct SettingsUmbrella {
    pub label: &'static str,
    pub subpages: Vec<SettingsSection>,
    pub expanded: bool,
}
```

### 1.2 Ierarhia Secțiunilor

| Umbrella | Subpagini (Sections) | Descriere |
| :--- | :--- | :--- |
| **(Top Level)** | Account, Appearance, Features, Keyboard Shortcuts | Setări globale esențiale |
| **Agents** | Warp Agent, Profiles, MCP Servers, Knowledge | Tot ce ține de inteligența artificială |
| **Code** | Indexing & Projects, Editor & Code Review | Gestiunea repository-urilor și comportamentului de editare |
| **Cloud** | Environments, API Keys | Conexiuni cu infrastructura Octomus/Warp |
| **(Bottom)** | Privacy, Teams, Referrals, About | Legal, colaborare și versiune |

---

## 2. Arhitectura Paginii de Setări

Fiecare pagină de setări urmează un pattern standardizat pentru consistență.

### 2.1 Layout Component (`settings_page.rs`)
Toate paginile folosesc un wrapper care oferă:
*   **Header**: Titlu secțiune + Search bar integrat.
*   **Body**: Listă de widget-uri grupate pe categorii.
*   **Footer**: Indicator de stare pentru "Local Only" (setări care nu se sincronizează în cloud).

### 2.2 Tipuri de Widget-uri (UI Primitives)
Warp nu reinventează roata pentru fiecare setare, ci folosește:
*   **Toggle (Switch)**: Pentru setări booleene (ex: `Cursor Blink`).
*   **Dropdown**: Pentru selecții multiple (ex: `Font Family`, `Theme`).
*   **Slider**: Pentru valori numerice continue (ex: `Window Opacity`, `Blur Radius`).
*   **Editor Input**: Un mini-editor (aceeași tehnologie ca în terminal) pentru input-uri text (ex: `Font Size`).

---

## 3. Pagini Cheie & Funcționalități

### 3.1 Appearance (`appearance_page.rs`)
Cea mai complexă pagină. Gestionează:
*   **Theming**: Preview în timp real pentru teme.
*   **Font Rendering**: Suport pentru ligaturi, fonturi diferite pentru Terminal vs. AI Assistant.
*   **Window Effects**: Opacitate și blur la nivel de fereastră (transparență nativă).
*   **Layout Modes**: Compact vs. Waterfall (input la top/bottom).

### 3.2 AI / Agents (`ai_page.rs`)
*   **Model Selection**: Alegerea furnizorului de LLM (Claude, GPT, Gemini).
*   **MCP Servers**: Adăugarea de noi unelte pentru agenți (Model Context Protocol).
*   **Knowledge Context**: Gestiunea fișierelor indexate local pentru RAG (Retrieval Augmented Generation).

### 3.3 Privacy (`privacy_page.rs`)
*   **Telemetry Toggles**: Control granular asupra a ce se trimite la RudderStack.
*   **UGC Isolation**: Opțiune separată pentru a permite/interzice trimiterea prompt-urilor AI pentru antrenare.

---

## 4. Implementarea în Octomus (React + Tailwind)

Pentru Octomus, vom simplifica logica de Rust (care în Warp e complexă din cauza sistemului de widget-uri propriu) și vom folosi un state global în React sincronizat cu Rust prin Tauri.

### 4.1 Schema de Date (Settings Store)

```typescript
// frontend/src/stores/settingsStore.ts
interface Settings {
  appearance: {
    theme: 'dark' | 'light' | 'system';
    fontFamily: string;
    opacity: number;
    compactMode: boolean;
  };
  ai: {
    defaultProvider: 'openai' | 'anthropic' | 'local';
    localModelPath?: string;
    mcpServers: string[];
  };
  privacy: {
    telemetry: boolean;
    crashReporting: boolean;
  };
}
```

### 4.2 Pattern-ul de Sync (React ↔ Rust)

1.  **Initial Load**: La pornire, frontend-ul apelează `invoke('get_settings')`.
2.  **Reactive Update**: Când userul schimbă un Toggle:
    *   UI-ul se updatează instant (Optimistic UI).
    *   Se trimite `invoke('update_setting', { key, value })` către Rust.
3.  **Rust Persistence**: Backend-ul salvează în `settings.toml` și, dacă e cazul, declanșează `CloudPreferencesSyncer`.

### 4.3 Search în Setări
Vom folosi un sistem de indexare simplu (Fuzzy Search) pe frontend care caută în:
*   Etichetele setărilor.
*   Descrierile secundare (help text).
*   Cuvinte cheie (tags) asociate (ex: căutarea "font" trebuie să returneze și "Line Height").
